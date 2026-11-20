// wemiller.com /xr/ — everything that happens inside a WebXR session: starting it, and turning
// whatever the device offers into "hover this" and "select this". Nothing here moves the world:
// it stays where it was when the session began (a controller's thumbstick snap-turn is the one,
// deliberate, exception).
//
//   bare hands (joints)   ray from the shoulder through the index knuckle; index/thumb pinch selects
//                         (with hysteresis); an index fingertip pushed through a nearby card or
//                         button presses it (poke).
//   controllers           target ray + trigger; thumbstick left/right snap-turns.
//   transient-pointer     Vision Pro look-and-pinch: the target is taken when the pinch starts.
//   nothing / gaze        a reticle in the centre of view; holding it on something fills a ring and
//                         selects (dwell). A viewer button ('gaze' select) selects at once.
//
// Per-frame code allocates nothing of its own; the WebXR calls that return pose objects are the
// only garbage, and joints use fillPoses() into a preallocated array where the browser has it.
import { COL } from './ui.js';
import { tr } from './i18n.js';

const PINCH_ON = 0.018, PINCH_OFF = 0.034;        // metres between thumb tip and index tip
const DWELL_MS = 1300, DWELL_REARM_MS = 1500;
const POKE_NEAR = 0.07, POKE_PRESS = 0.005, POKE_ARM = 0.025, POKE_BEHIND = -0.04;
const SNAP = Math.PI / 6;

export const SESSION_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };

export function createXRInput(ctx) {
  const { THREE, renderer, scene } = ctx;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 200;        // far enough to reach the planets
  const hits = [];
  const M = new THREE.Matrix4(), INV = new THREE.Matrix4();
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), TIP = new THREE.Vector3(), THUMB = new THREE.Vector3();

  const head = { pos: new THREE.Vector3(0, 1.6, 0), fwd: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), theta: 0, valid: false };
  const xr = { head, presenting: false, ar: false, hasHands: false, gazeActive: false, floor: true, enter, begin, update };

  // ---------------------------------------------------------------- visuals
  const rays = [], dots = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);   // +Z: Object3D.lookAt aims +Z
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.7 }));
    line.visible = false; line.frustumCulled = false;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: COL.ink, depthTest: false }));
    dot.visible = false; dot.renderOrder = 20;
    scene.add(line, dot);
    rays.push(line); dots.push(dot);
  }
  // hands: 25 joints each, one instanced draw call for both
  const JOINTS = 25;
  const hands = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#cfe2fb', transparent: true, opacity: 0.85 }), JOINTS * 2);
  hands.frustumCulled = false; hands.visible = false;
  const IM = hands.instanceMatrix.array;
  IM.fill(0);
  scene.add(hands);
  function writeJoint(i, x, y, z, s) {
    const o = i * 16;
    IM[o] = s; IM[o + 5] = s; IM[o + 10] = s; IM[o + 12] = x; IM[o + 13] = y; IM[o + 14] = z; IM[o + 15] = 1;
  }
  function hideHand(slot) { for (let j = 0; j < JOINTS; j++) IM[(slot * JOINTS + j) * 16] = IM[(slot * JOINTS + j) * 16 + 5] = IM[(slot * JOINTS + j) * 16 + 10] = 0; }

  // gaze reticle: a thin ring, a ring that fills as the dwell runs, a centre dot
  const SEG = 48;
  const reticle = new THREE.Group();
  const mk = (geo, color, opacity) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })); m.renderOrder = 21; reticle.add(m); return m; };
  mk(new THREE.RingGeometry(0.82, 1, SEG), COL.ink, 0.55);
  const fill = mk(new THREE.RingGeometry(0.45, 1.18, SEG, 1, Math.PI / 2, -Math.PI * 2), COL.green, 1);
  mk(new THREE.CircleGeometry(0.2, 16), COL.ink, 0.95);
  fill.geometry.setDrawRange(0, 0);
  reticle.visible = false;
  scene.add(reticle);
  const gaze = { target: null, t: 0, fired: false, firedAt: 0 };

  // ---------------------------------------------------------------- pointers
  const mkPointer = () => ({
    src: null, seen: false, joint: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), hasDir: false,
    hit: null, hitDist: 0, hitPoint: new THREE.Vector3(),
    down: false, downTarget: null, dragging: false,
    pinch: false, near: null, pokeArmed: false, lastPoke: 0, stick: false,
  });
  const P = [mkPointer(), mkPointer()];
  const handCache = new WeakMap();
  let everTransient = false, lastPointerAt = 0, startedAt = 0, lastHandAt = -1e9, lastNow = 0, firstPose = true;

  function live(obj) { return !!obj && obj.userData.enabled !== false && ctx.getTargets().includes(obj); }
  function cast(p) {
    hits.length = 0;
    raycaster.set(p.origin, p.dir);
    raycaster.intersectObjects(ctx.getTargets(), false, hits);
    let h = null;
    for (let i = 0; i < hits.length; i++) if (hits[i].object.userData.enabled !== false) { h = hits[i]; break; }
    p.hit = h ? h.object : null;
    if (h) { p.hitDist = h.distance; p.hitPoint.copy(h.point); }
  }
  const yawOf = (d) => Math.atan2(d.x, -d.z), pitchOf = (d) => Math.asin(Math.max(-1, Math.min(1, d.y)));
  function pointerDown(p) {
    p.down = true; p.downTarget = p.near ? null : p.hit;
    // a target marked draggable (the Move handle) is held rather than selected: the content follows the pointer until release
    if (p.downTarget && p.downTarget.userData.draggable && head.valid) { p.dragging = true; ctx.dragStart(yawOf(p.dir), pitchOf(p.dir)); }
  }
  function pointerUp(p, fire) {
    if (p.dragging) { p.dragging = false; ctx.dragEnd(); }
    else if (fire && live(p.downTarget)) ctx.activate(p.downTarget);
    p.down = false; p.downTarget = null;
  }
  function pointerFor(src) {
    if (P[0].src === src) return P[0];
    if (P[1].src === src) return P[1];
    const p = P[src.handedness === 'left' ? 0 : 1];
    p.src = src; p.joint = false;
    return p;
  }

  // ---------------------------------------------------------------- hands with joints
  function handInfo(hand) {
    let h = handCache.get(hand);
    if (!h) {
      const names = [], spaces = [];
      for (const entry of hand) { names.push(entry[0]); spaces.push(entry[1]); }
      h = {
        spaces, n: Math.min(spaces.length, JOINTS), mats: new Float32Array(16 * spaces.length),
        thumb: names.indexOf('thumb-tip'), index: names.indexOf('index-finger-tip'), knuckle: names.indexOf('index-finger-phalanx-proximal'),
        tip: names.map((n) => /-tip$/.test(n)),
      };
      handCache.set(hand, h);
    }
    return h;
  }
  function updateHand(p, slot, src, frame, ref, now) {
    const h = handInfo(src.hand);
    if (h.thumb < 0 || h.index < 0 || h.knuckle < 0) return false;
    let ok = false;
    if (frame.fillPoses) { try { ok = frame.fillPoses(h.spaces, ref, h.mats); } catch (e) { ok = false; } }
    else if (frame.getJointPose) {
      ok = true;
      for (let j = 0; j < h.spaces.length; j++) {
        const jp = frame.getJointPose(h.spaces[j], ref);
        if (!jp) { ok = false; break; }
        h.mats.set(jp.transform.matrix, j * 16);
      }
    }
    if (!ok) return false;
    const m = h.mats;
    for (let j = 0; j < h.n; j++) writeJoint(slot * JOINTS + j, m[j * 16 + 12], m[j * 16 + 13], m[j * 16 + 14], h.tip[j] ? 0.0085 : 0.006);
    TIP.set(m[h.index * 16 + 12], m[h.index * 16 + 13], m[h.index * 16 + 14]);
    THUMB.set(m[h.thumb * 16 + 12], m[h.thumb * 16 + 13], m[h.thumb * 16 + 14]);
    p.origin.set(m[h.knuckle * 16 + 12], m[h.knuckle * 16 + 13], m[h.knuckle * 16 + 14]);

    // ray: from a point where the shoulder would be, through the knuckle. Steadier than the finger's own direction.
    V.copy(head.pos).addScaledVector(head.right, slot === 0 ? -0.17 : 0.17); V.y -= 0.24;
    V2.copy(p.origin).sub(V);
    if (V2.lengthSq() < 0.01) V2.copy(head.fwd); else V2.normalize();
    if (p.hasDir && p.joint) p.dir.lerp(V2, 0.4).normalize(); else p.dir.copy(V2);
    p.hasDir = true; p.joint = true;

    // poke: index fingertip against nearby flat targets
    const list = ctx.getTargets();
    let near = null, nearZ = POKE_NEAR;
    for (let i = 0; i < list.length; i++) {
      const t = list[i], u = t.userData;
      if (u.noPoke || u.enabled === false) continue;
      const e = t.matrixWorld.elements, dx = TIP.x - e[12], dy = TIP.y - e[13], dz = TIP.z - e[14];
      const half = (e[0] * e[0] + e[1] * e[1] + e[2] * e[2] + e[4] * e[4] + e[5] * e[5] + e[6] * e[6]) / 4;
      if (dx * dx + dy * dy + dz * dz > half + 0.02) continue;
      V.copy(TIP).applyMatrix4(INV.copy(t.matrixWorld).invert());
      if (Math.abs(V.x) <= 0.5 && Math.abs(V.y) <= 0.5 && V.z > POKE_BEHIND && V.z < nearZ) { near = t; nearZ = V.z; }
    }
    p.near = near;
    if (!near) p.pokeArmed = false;
    else if (nearZ > POKE_ARM) p.pokeArmed = true;
    else if (nearZ <= POKE_PRESS && p.pokeArmed && now - p.lastPoke > 350) {
      p.pokeArmed = false; p.lastPoke = now;
      ctx.activate(near);
    }

    // pinch, with hysteresis so it does not chatter around the threshold
    const d = TIP.distanceTo(THUMB);
    if (!p.pinch && d < PINCH_ON) { p.pinch = true; pointerDown(p); }
    else if (p.pinch && d > PINCH_OFF) { p.pinch = false; pointerUp(p, true); }
    return true;
  }

  // ---------------------------------------------------------------- per frame
  function update(frame, now) {
    const session = renderer.xr.getSession(), ref = renderer.xr.getReferenceSpace();
    if (!session || !ref || !frame) return;
    const dt = Math.min(100, now - lastNow); lastNow = now;
    const vp = frame.getViewerPose(ref);
    if (vp) {
      M.fromArray(vp.transform.matrix);
      head.pos.setFromMatrixPosition(M);
      head.fwd.set(0, 0, -1).transformDirection(M);
      head.right.set(1, 0, 0).transformDirection(M);
      head.theta = Math.atan2(head.fwd.x, -head.fwd.z);
      head.valid = true;
      if (firstPose) { firstPose = false; ctx.onFirstPose(head); }
    }
    scene.updateMatrixWorld();

    const sources = session.inputSources;
    let pointers = 0, gazeSource = false, over = null, anyHand = false;
    P[0].seen = P[1].seen = false;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i], mode = src.targetRayMode;
      if (mode === 'screen') continue;
      if (mode === 'gaze') { gazeSource = true; continue; }
      let slot = src.handedness === 'left' ? 0 : 1;
      if (P[slot].seen) slot = 1 - slot;
      const p = P[slot];
      if (p.src !== src) { if (p.down) pointerUp(p, false); p.src = src; p.pinch = false; p.hasDir = false; }
      p.seen = true; pointers++;

      const gp = src.gamepad;
      if (gp && gp.axes && gp.axes.length >= 2) {
        const x = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
        if (!p.stick && Math.abs(x) > 0.6) { p.stick = true; ctx.turnBy(x > 0 ? SNAP : -SNAP); }   // stick right: you turn right, so the room turns left
        else if (p.stick && Math.abs(x) < 0.3) p.stick = false;
      }

      let jointed = false;
      if (src.hand) jointed = updateHand(p, slot, src, frame, ref, now);
      if (jointed) { anyHand = true; lastHandAt = now; }
      else {
        if (p.joint) { p.joint = false; p.near = null; if (p.pinch) { p.pinch = false; pointerUp(p, false); } }
        hideHand(slot);
        const pose = frame.getPose(src.targetRaySpace, ref);
        if (!pose) { p.seen = false; pointers--; continue; }
        M.fromArray(pose.transform.matrix);
        p.origin.setFromMatrixPosition(M);
        p.dir.set(0, 0, -1).transformDirection(M);
      }

      if (p.dragging && p.down) ctx.dragMove(yawOf(p.dir), pitchOf(p.dir));
      if (p.near) { p.hit = null; over = p.near; }
      else { cast(p); if (p.hit) over = p.hit; }

      const line = rays[slot], dot = dots[slot];
      line.visible = !p.near;
      if (line.visible) {
        line.position.copy(p.origin);
        V.copy(p.origin).add(p.dir); line.lookAt(V);
        line.scale.z = p.hit ? p.hitDist : 1.2;
        line.material.color.set(p.down ? COL.green : COL.accent);
        line.material.opacity = p.hit ? 0.8 : 0.4;
      }
      dot.visible = !!p.hit && !p.near;
      if (dot.visible) { dot.position.copy(p.hitPoint); dot.scale.setScalar(Math.max(1, p.hitDist * 1.1) * (p.down ? 1.6 : 1)); dot.material.color.set(p.down ? COL.green : COL.ink); }
    }
    for (let s = 0; s < 2; s++) if (!P[s].seen) {
      rays[s].visible = dots[s].visible = false; hideHand(s);
      if (P[s].down && P[s].joint) { P[s].pinch = false; pointerUp(P[s], false); }
      P[s].near = null;
    }
    hands.visible = anyHand;
    if (anyHand) hands.instanceMatrix.needsUpdate = true;
    xr.hasHands = now - lastHandAt < 2000;
    if (pointers) lastPointerAt = now;

    // gaze reticle and dwell: only when nothing else is pointing
    const gazing = head.valid && !pointers && (gazeSource || (!everTransient && now - lastPointerAt > 2500 && now - startedAt > 1500));
    xr.gazeActive = gazing;
    if (gazing) {
      hits.length = 0;
      raycaster.set(head.pos, head.fwd);
      raycaster.intersectObjects(ctx.getTargets(), false, hits);
      let h = null;
      for (let i = 0; i < hits.length; i++) if (hits[i].object.userData.enabled !== false) { h = hits[i]; break; }
      const target = h ? h.object : null, dist = h ? h.distance - 0.01 : 1.5;
      reticle.position.copy(head.pos).addScaledVector(head.fwd, dist);
      reticle.lookAt(head.pos);
      reticle.scale.setScalar(dist * 0.02);
      reticle.visible = true;
      if (target !== gaze.target) { gaze.target = target; gaze.t = 0; gaze.fired = false; }
      else if (target && !gaze.fired) {
        gaze.t += dt;
        if (gaze.t >= DWELL_MS) { gaze.fired = true; gaze.firedAt = now; gaze.t = 0; ctx.activate(target); }
      } else if (gaze.fired && now - gaze.firedAt > DWELL_REARM_MS) gaze.fired = false;
      fill.geometry.setDrawRange(0, target && !gaze.fired ? Math.ceil((gaze.t / DWELL_MS) * SEG) * 6 : 0);
      over = target;
    } else {
      reticle.visible = false; gaze.target = null; gaze.t = 0;
    }
    ctx.setHover(over);
  }

  // ---------------------------------------------------------------- session
  function rayFromEvent(e, p) {
    const ref = renderer.xr.getReferenceSpace();
    const pose = ref && e.frame.getPose(e.inputSource.targetRaySpace, ref);
    if (!pose) return false;
    M.fromArray(pose.transform.matrix);
    p.origin.setFromMatrixPosition(M);
    p.dir.set(0, 0, -1).transformDirection(M);
    scene.updateMatrixWorld();
    cast(p);
    return true;
  }
  // mode: 'immersive-vr' (default) or 'immersive-ar'. An AR session is one where the real room can
  // show through; the scene paints its own sky over it unless passthrough is switched on, so the
  // two look the same until then. If the AR request is refused, VR is asked for instead.
  async function enter(mode) {
    if (xr.presenting || !navigator.xr) return false;
    mode = mode === 'immersive-ar' ? mode : 'immersive-vr';
    let session;
    try {
      try { session = await navigator.xr.requestSession(mode, SESSION_INIT); }
      catch (err) {
        if (mode !== 'immersive-ar') throw err;
        mode = 'immersive-vr';
        session = await navigator.xr.requestSession(mode, SESSION_INIT);
      }
    } catch (err) {
      ctx.setStatus(tr('xr.fail', { why: err && err.message ? err.message : tr('xr.refused') }));
      return false;
    }
    return begin(session, mode === 'immersive-ar');
  }
  // Run in a session that already exists (the home page's launcher asks for it inside the tap).
  async function begin(session, ar) {
    if (xr.presenting) return false;
    xr.ar = !!ar;
    // 6DoF devices give a floor-level space; a 3DoF viewer may only have a head-level one.
    xr.floor = true;
    try { await session.requestReferenceSpace('local-floor'); } catch (err) { xr.floor = false; }
    renderer.xr.setReferenceSpaceType(xr.floor ? 'local-floor' : 'local');

    session.addEventListener('selectstart', (e) => {
      const mode = e.inputSource.targetRayMode;
      if (mode === 'transient-pointer') everTransient = true;
      if (mode === 'gaze' || mode === 'screen') return;
      const p = pointerFor(e.inputSource);
      if (p.joint && p.seen) return;                 // jointed hands use the pinch detector above
      if (rayFromEvent(e, p)) pointerDown(p);
    });
    session.addEventListener('select', (e) => {
      const mode = e.inputSource.targetRayMode;
      if (mode === 'screen') return;
      if (mode === 'gaze') { if (live(gaze.target)) { gaze.fired = true; gaze.firedAt = lastNow; ctx.activate(gaze.target); } return; }
      const p = pointerFor(e.inputSource);
      if (p.joint && p.seen) return;
      if (!p.dragging && live(p.downTarget)) ctx.activate(p.downTarget);
      p.downTarget = null;
    });
    session.addEventListener('selectend', (e) => {
      const p = pointerFor(e.inputSource);
      if (p.joint && p.seen) return;
      pointerUp(p, false);
    });
    session.addEventListener('end', () => {
      xr.presenting = false; xr.ar = false; xr.hasHands = false; xr.gazeActive = false; head.valid = false;
      for (let s = 0; s < 2; s++) { rays[s].visible = dots[s].visible = false; hideHand(s); Object.assign(P[s], { src: null, down: false, dragging: false, downTarget: null, pinch: false, near: null, joint: false, hasDir: false }); }
      hands.visible = reticle.visible = false;
      ctx.onSessionEnd();
    });
    try {
      await renderer.xr.setSession(session);
    } catch (err) {
      ctx.setStatus(tr('xr.fail', { why: err && err.message ? err.message : tr('err.unknown') }));
      try { await session.end(); } catch (e2) { /* already over */ }
      return false;
    }
    // If the headset is re-centred, anchor the content in front of the visitor again.
    try { const ref = renderer.xr.getReferenceSpace(); if (ref && ref.addEventListener) ref.addEventListener('reset', () => { firstPose = true; }); } catch (err) { /* optional */ }
    everTransient = false; firstPose = true;
    startedAt = lastPointerAt = lastNow = performance.now();
    xr.presenting = true;
    ctx.onSessionStart(xr);
    return true;
  }

  return xr;
}
