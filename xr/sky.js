// wemiller.com /xr/ — the night sky, as a replaceable component.
//
//   const sky = createSky(THREE, { invalidate });
//   scene.add(sky.object);
//   sky.update(new Date(), lat, lon);        // positions for a time and place
//   sky.tick(seconds);                       // per frame: twinkle
//   sky.setGuides(true);                     // constellation figures, names, compass points
//
// The sky is drawn the way the site's 2D planetarium draws it, from the same simulation
// (/assets/sky/sky.js, loaded with a dynamic import): real star positions, magnitudes and colours,
// soft round stars with a glow on the bright ones, twinkle that grows toward the horizon, the Milky
// Way, the planets, the moon with its phase, a zenith-to-horizon gradient and a dark ground.
// If that module is missing or fails, a built-in star field is drawn with the same renderer.
// Nothing here edits that module. README.md in this folder lists what is read from it.
import { FONT } from './ui.js';
import { tr, trOr, num1 } from './i18n.js';

export const SKY_MODULE_URL = '/assets/sky/sky.js';
export const DEFAULT_PLACE = { lat: 35.37, lon: -119.02 };   // Bakersfield, CA: where the photographs start from
const R = 100;                // radius the stars sit at, metres (the whole sky follows the viewer, so it reads as infinite)
const MAX_STARS = 14000;
const D2R = Math.PI / 180;

// Angular radius of a star's core, radians. Same curve as the 2D planetarium's pixel radius.
const coreOf = (mag) => (0.05 + 0.2 * Math.pow(10, -0.16 * (mag + 1.5))) * D2R;

const STAR_VERT = `
attribute float aSize; attribute float aAlpha; attribute float aPhase; attribute vec3 aColor;
uniform float uPx; uniform float uTime; uniform float uTwinkle;
varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float up = normalize((modelMatrix * vec4(position, 0.0)).xyz).y;
  float want = aSize * projectionMatrix[1][1] * uPx * 0.5 * 6.0;   // diameter in pixels: the halo reaches 3 core radii
  float size = max(want, 4.0);
  float a = aAlpha * (want / size) * (want / size);                // a star smaller than a pixel keeps its total light
  a *= 1.0 - uTwinkle * (0.1 + 0.3 * (1.0 - clamp(up, 0.0, 1.0))) * (0.5 + 0.5 * sin(uTime * (2.2 + mod(aPhase * 7.0, 3.2)) + aPhase));
  gl_PointSize = min(size, 96.0);
  vC = aColor; vA = up < -0.02 ? 0.0 : a;
}`;
const STAR_FRAG = `
varying vec3 vC; varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0 || vA < 0.004) discard;
  float c = r * 3.0;
  float core = exp(-c * c * 0.8);
  float halo = 0.2 * exp(-c * 1.5) * (1.0 - smoothstep(0.55, 1.0, r));
  gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.55), vA * (core + halo));
}`;
// Star trails: each bright star is a short chain of segments, and every vertex is turned back round
// the celestial pole (the star frame's z axis) by its share of the arc, which is where that star was.
const TRAIL_VERT = `
attribute float aT; attribute float aA; attribute vec3 aColor;
uniform float uArc;
varying vec3 vC; varying float vA;
void main() {
  float a = aT * uArc, c = cos(a), s = sin(a);
  vec3 p = vec3(c * position.x - s * position.y, s * position.x + c * position.y, position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vC = aColor; vA = aA * (1.0 - 0.8 * aT);
}`;
const TRAIL_FRAG = `varying vec3 vC; varying float vA; void main() { gl_FragColor = vec4(vC, vA); }`;
const TRAIL_SEG = 20, TRAIL_MAG = 4.6;
const DOME_VERT = `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// The same altitude stops as the 2D planetarium's gradient, plus a little noise so the dark tones do not band.
const DOME_FRAG = `
uniform vec3 uZenith; uniform vec3 uHorizon; varying vec3 vDir;
void main() {
  float alt = asin(clamp(normalize(vDir).y, -1.0, 1.0)) * 57.29578;
  float t = alt <= 0.0 ? 0.0 : alt < 4.0 ? 0.06 * alt : alt < 12.0 ? mix(0.24, 0.52, (alt - 4.0) / 8.0) : alt < 30.0 ? mix(0.52, 0.8, (alt - 12.0) / 18.0)
    : alt < 60.0 ? mix(0.8, 0.95, (alt - 30.0) / 30.0) : mix(0.95, 1.0, (alt - 60.0) / 30.0);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(mix(uHorizon, uZenith, t) + n / 255.0, 1.0);
}`;
const GROUND_FRAG = `
uniform vec3 uGround; uniform vec3 uHorizon; varying vec3 vDir;
void main() {
  float d = -normalize(vDir).y;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(mix(uHorizon * 0.6, uGround, smoothstep(0.0, 0.1, d)) + n / 255.0, 1.0);
}`;

// ---------------------------------------------------------------- the renderer (knows nothing about where its data comes from)
function skyRenderer(THREE) {
  const object = new THREE.Group();          // local frame: x east, y up, z south
  const eq = new THREE.Group();              // star frame, turned as time passes
  eq.matrixAutoUpdate = false;
  const flat = (o, order) => { o.frustumCulled = false; o.renderOrder = order; return o; };
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  // backdrop
  const domeMat = keep(new THREE.ShaderMaterial({
    uniforms: { uZenith: { value: new THREE.Vector3(0.02, 0.03, 0.07) }, uHorizon: { value: new THREE.Vector3(0.06, 0.09, 0.17) } },
    vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, transparent: true,
  }));
  const dome = flat(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 1.5, 32, 24)), domeMat), -20);
  const groundMat = keep(new THREE.ShaderMaterial({
    uniforms: { uGround: { value: new THREE.Vector3(0.016, 0.022, 0.04) }, uHorizon: domeMat.uniforms.uHorizon },
    vertexShader: DOME_VERT, fragmentShader: GROUND_FRAG, side: THREE.BackSide, depthWrite: true, transparent: true,
  }));
  // Drawn straight after the dome and written to depth, so everything in the sky is cut off at the
  // horizon. In passthrough it draws no colour but still cuts: the real floor shows instead.
  const ground = flat(new THREE.Mesh(keep(new THREE.SphereGeometry(R * 0.9, 48, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), groundMat), -19);

  // stars
  const mkPoints = (n, twinkle) => {
    const g = keep(new THREE.BufferGeometry());
    const a = { position: new Float32Array(n * 3), aColor: new Float32Array(n * 3), aSize: new Float32Array(n), aAlpha: new Float32Array(n), aPhase: new Float32Array(n) };
    for (const k in a) g.setAttribute(k, new THREE.BufferAttribute(a[k], k === 'position' || k === 'aColor' ? 3 : 1));
    g.setDrawRange(0, 0);
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 800 }, uTime: { value: 0 }, uTwinkle: { value: twinkle } },
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const pts = flat(new THREE.Points(g, mat), -16);
    const size = new THREE.Vector2();
    pts.onBeforeRender = (renderer, scene, camera) => {      // pixels per radian differ per eye and per screen
      mat.uniforms.uPx.value = camera.viewport ? camera.viewport.w : renderer.getDrawingBufferSize(size).y;
      mat.uniformsNeedUpdate = true;
    };
    return { pts, g, a, mat };
  };
  const stars = mkPoints(MAX_STARS, 1), planets = mkPoints(7, 0);
  planets.pts.renderOrder = -13;

  // Milky Way: summed once into an equatorial map, then worn by a sphere in the star frame
  const MW_W = 512, MW_H = 256;
  const mwTex = keep(new THREE.DataTexture(new Uint8Array(MW_W * MW_H * 4), MW_W, MW_H));
  mwTex.colorSpace = THREE.SRGBColorSpace; mwTex.wrapS = THREE.RepeatWrapping;
  mwTex.magFilter = mwTex.minFilter = THREE.LinearFilter;
  const mwGeo = keep(new THREE.BufferGeometry());
  {
    const NU = 48, NV = 24, p = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const ra = (i / NU) * Math.PI * 2, dec = (j / NV - 0.5) * Math.PI, cd = Math.cos(dec);
      p.push(cd * Math.cos(ra) * R * 1.2, cd * Math.sin(ra) * R * 1.2, Math.sin(dec) * R * 1.2);
      uv.push(i / NU, j / NV);
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    mwGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    mwGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mwGeo.setIndex(idx);
  }
  const milky = flat(new THREE.Mesh(mwGeo, keep(new THREE.MeshBasicMaterial({ map: mwTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))), -18);
  milky.visible = false;

  // moon: a small canvas redrawn when the phase changes, and a soft glow behind it
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 128;
  const moonTex = keep(new THREE.CanvasTexture(moonCanvas));
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moonSize = 2 * R * 0.96 * Math.tan(0.62 * D2R);
  const unit = keep(new THREE.PlaneGeometry(1, 1));
  const moon = flat(new THREE.Mesh(unit, keep(new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false }))), -12);
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  {
    const c = glowCanvas.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(226,234,255,1)'); g.addColorStop(0.12, 'rgba(226,234,255,.55)'); g.addColorStop(0.4, 'rgba(226,234,255,.1)'); g.addColorStop(1, 'rgba(226,234,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  const glowTex = keep(new THREE.CanvasTexture(glowCanvas));
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const moonGlow = flat(new THREE.Mesh(unit, keep(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))), -14);
  moon.visible = moonGlow.visible = false;
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = sunCanvas.height = 128;
  {
    const c = sunCanvas.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,252,244,1)'); g.addColorStop(0.2, 'rgba(255,252,244,1)'); g.addColorStop(0.26, 'rgba(255,246,232,.45)'); g.addColorStop(1, 'rgba(255,246,232,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  const sunTex = keep(new THREE.CanvasTexture(sunCanvas));
  sunTex.colorSpace = THREE.SRGBColorSpace;
  const sun = flat(new THREE.Mesh(unit, keep(new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false }))), -12);
  sun.visible = false;
  sun.scale.set(moonSize * 4.4, moonSize * 4.4, 1);

  // Things that can be pointed at: the planets, the moon, the sun. Each has an invisible ball for the
  // ray to hit, and they share one caption that appears beside whichever is pointed at (or chosen).
  const targets = [], bodies = [];
  const ballGeo = keep(new THREE.SphereGeometry(R * 0.95 * Math.tan(2.6 * D2R), 10, 8)), ballMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const capCanvas = document.createElement('canvas');
  capCanvas.width = 1024; capCanvas.height = 208;
  const capTex = keep(new THREE.CanvasTexture(capCanvas));
  capTex.colorSpace = THREE.SRGBColorSpace;
  const caption = flat(new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: capTex, transparent: true, depthWrite: false, depthTest: false }))), -9);
  caption.visible = false;
  caption.center.set(0.5, -0.45);
  { const h = R * 0.9 * 4.2 * D2R; caption.scale.set((h * 1024) / 208, h, 1); }
  let hoverBody = null, pinned = null, shown = null, shownText = '';
  function drawCaption() {
    const b = hoverBody || pinned;
    caption.visible = !!b && b.up;
    if (!caption.visible) { shown = null; return; }
    caption.position.copy(b.ball.position).multiplyScalar(0.94);
    if (shown === b && shownText === b.name + b.info) return;
    shown = b; shownText = b.name + b.info;
    const c = capCanvas.getContext('2d');
    c.clearRect(0, 0, 1024, 208);
    c.beginPath(); c.roundRect ? c.roundRect(4, 4, 1016, 200, 48) : c.rect(4, 4, 1016, 200);
    c.fillStyle = 'rgba(9,14,26,.9)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(108,182,255,.8)'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#eef2f8'; c.font = '700 72px ' + FONT; c.fillText(b.name, 512, 92, 960);
    c.fillStyle = '#b9c3d6'; c.font = '500 46px ' + FONT; c.fillText(b.info, 512, 164, 960);
    capTex.needsUpdate = true;
  }
  function body(name) {
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.frustumCulled = false;
    const b = { name, info: '', up: false, ball };
    ball.userData = {
      get label() { return b.name + (b.info ? ': ' + b.info : ''); },
      get enabled() { return b.up; },
      noPoke: true,
      setHover(on) { if (on) hoverBody = b; else if (hoverBody === b) hoverBody = null; drawCaption(); },
      select() { pinned = pinned === b ? null : b; drawCaption(); },       // choosing one keeps its caption up
    };
    bodies.push(b); targets.push(ball);
    return b;
  }
  let moonKey = '';
  function drawMoon(k) {
    const key = k.toFixed(2);
    if (key === moonKey) return;
    moonKey = key;
    const c = moonCanvas.getContext('2d'), r = 60;
    c.clearRect(0, 0, 128, 128);
    c.save(); c.translate(64, 64); c.rotate(-Math.PI / 2);        // lit limb toward the top of the canvas
    c.fillStyle = 'rgb(34,40,58)'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();   // unlit side, with a little earthshine
    c.fillStyle = 'rgb(240,238,230)';
    c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    const rx = r * Math.abs(1 - 2 * k);
    if (k < 0.5) c.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);
    else c.ellipse(0, 0, rx, r, 0, Math.PI / 2, 1.5 * Math.PI, false);
    c.fill(); c.restore();
    moonTex.needsUpdate = true;
  }

  // guides: constellation figures, names, compass points. Built the first time they are asked for.
  const guides = new THREE.Group(), guidesEq = new THREE.Group();
  guides.visible = guidesEq.visible = false;
  const labels = [];
  function label(text, deg, color, opacity) {
    const px = 44, cv = document.createElement('canvas'), c = cv.getContext('2d');
    c.font = '500 ' + px + 'px ' + FONT;
    cv.width = Math.ceil(c.measureText(text).width) + 20; cv.height = Math.round(px * 1.5);
    c.font = '500 ' + px + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
    c.fillText(text, cv.width / 2, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = flat(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false })), -11);
    const h = R * 0.97 * deg * D2R;
    sp.scale.set((h * cv.width) / cv.height, h, 1);
    labels.push(sp);
    return sp;
  }
  let lines = null, trails = null;
  const trailMat = keep(new THREE.ShaderMaterial({
    uniforms: { uArc: { value: 0 } }, vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const planetLabels = [];

  eq.add(milky, stars.pts, guidesEq);
  object.add(dome, ground, eq, planets.pts, moonGlow, moon, sun, guides, caption);

  const api = {
    object, eq, stars, planets, guides, guidesEq, planetLabels, label, targets,
    // A thing that can be pointed at. Returns { set(dir | null, info) } to call on every update.
    addBody(name) {
      const b = body(name);
      object.add(b.ball);
      return { set(dir, info) { b.up = !!dir && dir[1] > 0; b.info = info || ''; if (dir) b.ball.position.set(dir[0] * R * 0.95, dir[1] * R * 0.95, dir[2] * R * 0.95); if (b === hoverBody || b === pinned) drawCaption(); } };
    },
    setSun(dir) {
      sun.visible = !!dir;
      if (dir) { sun.position.set(dir[0] * R * 0.96, dir[1] * R * 0.96, dir[2] * R * 0.96); sun.lookAt(0, 0, 0); }
    },
    // Passthrough: no painted sky or ground, only what is in it.
    setPassthrough(on) { dome.visible = !on; groundMat.colorWrite = !on; },
    setColours(zenith, horizon, groundC) {      // 0..255 each
      domeMat.uniforms.uZenith.value.set(zenith[0] / 255, zenith[1] / 255, zenith[2] / 255);
      domeMat.uniforms.uHorizon.value.set(horizon[0] / 255, horizon[1] / 255, horizon[2] / 255);
      if (groundC) groundMat.uniforms.uGround.value.set(groundC[0] / 255, groundC[1] / 255, groundC[2] / 255);
    },
    // mw: { count, eq (unit vectors), weight, size (degrees) } in the star frame
    paintMilkyWay(mw) {
      // Summed in floating point (a canvas would band at these low levels), then written with a little noise.
      const W = MW_W, H = MW_H, sum = new Float32Array(W * H), pxDeg = 360 / W;
      for (let i = 0; i < mw.count; i++) {
        const x = mw.eq[i * 3], y = mw.eq[i * 3 + 1], z = mw.eq[i * 3 + 2];
        const dec = Math.asin(Math.max(-1, Math.min(1, z))) / D2R, ra = (Math.atan2(y, x) / D2R + 360) % 360;
        const sig = mw.size[i] * 0.5, reach = sig * 2.6, cd = Math.max(0.12, Math.cos(dec * D2R)), wgt = mw.weight[i];
        const y0 = Math.max(0, Math.floor((dec - reach + 90) / pxDeg)), y1 = Math.min(H - 1, Math.ceil((dec + reach + 90) / pxDeg));
        const cx = ra / pxDeg, rx = Math.min(W / 2, Math.ceil(reach / cd / pxDeg));
        for (let py = y0; py <= y1; py++) {
          const dy = (py + 0.5) * pxDeg - 90 - dec;
          for (let k = -rx; k <= rx; k++) {
            const px = Math.round(cx) + k, dx = (px + 0.5 - cx) * pxDeg * cd, d2 = (dx * dx + dy * dy) / (sig * sig);
            if (d2 < 6.8) sum[py * W + ((px % W) + W) % W] += wgt * Math.exp(-0.5 * d2);
          }
        }
      }
      const data = mwTex.image.data;
      let seed = 7;
      for (let i = 0; i < W * H; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const v = (1 - Math.exp(-0.05 * sum[i])) * 150 + seed / 4294967296 - 0.5;
        data[i * 4] = Math.max(0, v * 0.81); data[i * 4 + 1] = Math.max(0, v * 0.86); data[i * 4 + 2] = Math.max(0, v); data[i * 4 + 3] = 255;
      }
      mwTex.needsUpdate = true;
    },
    setMilkyWay(strength) { milky.visible = strength > 0.02; milky.material.opacity = Math.min(1, strength); },
    // dir: unit vector in the local frame, or null to hide. k: lit fraction. limbDeg: lit limb, clockwise from "up".
    setMoon(dir, k, limbDeg) {
      moon.visible = !!dir; moonGlow.visible = !!dir && k > 0.03;
      if (!dir) return;
      drawMoon(k);
      moon.position.set(dir[0] * R * 0.96, dir[1] * R * 0.96, dir[2] * R * 0.96);
      moon.scale.set(moonSize, moonSize, 1);
      moon.lookAt(0, 0, 0); moon.rotateZ(-limbDeg * D2R);
      moonGlow.position.set(dir[0] * R * 0.97, dir[1] * R * 0.97, dir[2] * R * 0.97);
      moonGlow.scale.set(moonSize * 9, moonSize * 9, 1);
      moonGlow.lookAt(0, 0, 0);
      moonGlow.material.opacity = 0.5 * k;
    },
    // figures: [{ name, paths: [indices into the star arrays] }], eqArr: unit vectors, names: { index: name }
    buildGuides(figures, eqArr, mag, names) {
      for (const s of labels.splice(0)) { s.material.map.dispose(); s.material.dispose(); s.removeFromParent(); }
      if (lines) { lines.geometry.dispose(); lines.material.dispose(); lines.removeFromParent(); lines = null; }
      planetLabels.length = 0;
      const seg = [];
      for (const f of figures || []) {
        let sx = 0, sy = 0, sz = 0;
        for (const path of f.paths) for (let k = 0; k < path.length; k++) {
          const j = path[k] * 3;
          sx += eqArr[j]; sy += eqArr[j + 1]; sz += eqArr[j + 2];
          if (k) { const i = path[k - 1] * 3; seg.push(eqArr[i] * R * 0.985, eqArr[i + 1] * R * 0.985, eqArr[i + 2] * R * 0.985, eqArr[j] * R * 0.985, eqArr[j + 1] * R * 0.985, eqArr[j + 2] * R * 0.985); }
        }
        const l = Math.hypot(sx, sy, sz);
        if (l > 0 && f.name) { const sp = label(trOr('con.' + f.name, f.name), 1.5, 'rgb(196,210,240)', 0.62); sp.position.set((sx / l) * R * 0.97, (sy / l) * R * 0.97, (sz / l) * R * 0.97); guidesEq.add(sp); }
      }
      if (seg.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
        lines = flat(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 'rgb(150,180,235)', transparent: true, opacity: 0.36, depthWrite: false })), -15);
        guidesEq.add(lines);
      }
      for (const k in names || {}) {
        if (mag[k] > 1.6) continue;
        const sp = label(names[k], 1.25, 'rgb(214,224,246)', 0.78);
        // sit just beside the star rather than on top of it
        sp.center.set(-0.08, -0.2);
        sp.position.set(eqArr[k * 3] * R * 0.97, eqArr[k * 3 + 1] * R * 0.97, eqArr[k * 3 + 2] * R * 0.97);
        guidesEq.add(sp);
      }
      [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([t, x, z]) => {
        const sp = label(tr('sky.' + t), 2.6, 'rgb(108,182,255)', 0.9);
        sp.position.set(x * R * 0.97, R * 0.97 * Math.sin(3 * D2R), z * R * 0.97);
        guides.add(sp);
      });
    },
    setGuides(on) { guides.visible = guidesEq.visible = on; },
    // eqArr: unit vectors in the star frame; one trail for each star brighter than TRAIL_MAG
    buildTrails(eqArr, mag, colour, count) {
      if (trails) { trails.geometry.dispose(); trails.removeFromParent(); trails = null; }
      const pos = [], col = [], tt = [], al = [];
      for (let i = 0; i < count; i++) {
        if (mag[i] > TRAIL_MAG) continue;
        const a = Math.max(0.14, Math.min(0.95, 0.95 - 0.16 * mag[i]));
        for (let k = 0; k < TRAIL_SEG; k++) for (let e = 0; e < 2; e++) {
          pos.push(eqArr[i * 3] * R, eqArr[i * 3 + 1] * R, eqArr[i * 3 + 2] * R);
          col.push(colour[i * 3], colour[i * 3 + 1], colour[i * 3 + 2]);
          tt.push((k + e) / TRAIL_SEG); al.push(a);
        }
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
      g.setAttribute('aA', new THREE.Float32BufferAttribute(al, 1));
      trails = flat(new THREE.LineSegments(g, trailMat), -17);
      trails.visible = trailMat.uniforms.uArc.value > 0;
      eq.add(trails);
    },
    // arc: how far back each trail reaches, radians of the sky's turn (0 hides them)
    setTrails(arc) { trailMat.uniforms.uArc.value = arc; if (trails) trails.visible = arc > 0; },
    tick(t) { stars.mat.uniforms.uTime.value = t; },
    dispose() {
      for (const s of labels) { s.material.map.dispose(); s.material.dispose(); }
      if (lines) { lines.geometry.dispose(); lines.material.dispose(); }
      if (trails) trails.geometry.dispose();
      for (const d of disposables) d.dispose();
    },
  };
  return api;
}

// ---------------------------------------------------------------- built-in star field (no simulation available)
function builtinSky(THREE) {
  const r = skyRenderer(THREE), a = r.stars.a, n = 5200;
  let seed = 20261119;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const TINT = [[170, 195, 255], [202, 216, 255], [240, 243, 255], [255, 246, 232], [255, 228, 196]];
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, az = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    a.position[i * 3] = R * s * Math.cos(az); a.position[i * 3 + 1] = R * u; a.position[i * 3 + 2] = R * s * Math.sin(az);
    const mag = 6.4 - 6.6 * Math.pow(rnd(), 3.2), t = TINT[Math.min(4, Math.floor(Math.pow(rnd(), 1.4) * 5))];   // many faint, few bright
    a.aColor[i * 3] = t[0] / 255; a.aColor[i * 3 + 1] = t[1] / 255; a.aColor[i * 3 + 2] = t[2] / 255;
    a.aSize[i] = coreOf(mag); a.aPhase[i] = rnd() * 6.283;
    a.aAlpha[i] = u < 0 ? 0 : Math.max(0.45, Math.min(1, 1.25 - 0.11 * mag)) * Math.min(1, (6.6 - mag) / 1.5);
  }
  r.stars.g.setDrawRange(0, n);
  r.eq.matrix.identity();
  return { source: 'built-in', object: r.object, targets: r.targets, update() {}, tick: r.tick, setGuides() {}, setPassthrough: r.setPassthrough, guides: false, dispose: r.dispose };
}

// ---------------------------------------------------------------- the site's simulation: SkyModel from /assets/sky/sky.js (v1)
// Asked for its night look (true star, planet and moon positions, night colours): this place is a night sky.
function modelSky(THREE, mod, onChange) {
  const r = skyRenderer(THREE), a = r.stars.a, pa = r.planets.a;
  let model = null, catV = -1, n = 0, guidesOn = false, guidesV = -1, mwDone = false, passthrough = false;
  const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].map((k) => tr('sky.' + k));     // the simulation's order
  const planetBodies = PLANETS.map((nm) => r.addBody(nm));
  const moonBody = r.addBody(tr('sky.moon')), sunBody = r.addBody(tr('sky.sun'));
  const PHASES = { 'New Moon': 'new', 'Waxing Crescent': 'waxc', 'First Quarter': 'first', 'Waxing Gibbous': 'waxg', 'Full Moon': 'full', 'Waning Gibbous': 'wang', 'Last Quarter': 'last', 'Third Quarter': 'last', 'Waning Crescent': 'wanc' };
  const phase = (name) => (PHASES[name] ? tr('moon.' + PHASES[name]) : name || '');
  const where = (e, nn, u) => tr('sky.where', { alt: Math.round(Math.asin(Math.max(-1, Math.min(1, u))) / D2R), dir: tr('sky.dir.' + (Math.round((((Math.atan2(e, nn) / D2R) + 360) % 360) / 45) % 8)) });

  function syncCatalog(st) {
    n = Math.min(st.count, MAX_STARS);
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      a.position[j] = st.eq[j] * R; a.position[j + 1] = st.eq[j + 1] * R; a.position[j + 2] = st.eq[j + 2] * R;
      a.aColor[j] = st.colour[j]; a.aColor[j + 1] = st.colour[j + 1]; a.aColor[j + 2] = st.colour[j + 2];
      a.aSize[i] = coreOf(st.mag[i]); a.aPhase[i] = st.twinkle[i];
    }
    for (const k of ['position', 'aColor', 'aSize', 'aPhase']) r.stars.g.attributes[k].needsUpdate = true;
    r.stars.g.setDrawRange(0, n);
    r.buildTrails(st.eq, st.mag, st.colour, n);
  }
  function syncGuides() {
    if (!guidesOn || !model || !model.stars || guidesV === model.catalogVersion) return;
    guidesV = model.catalogVersion;
    r.buildGuides(model.constellations, model.stars.eq, model.stars.mag, model.stars.names);
    for (let i = 0; i < 7; i++) { const sp = r.label(PLANETS[i], 1.25, 'rgb(236,240,250)', 0.9); sp.center.set(-0.12, 0.5); r.guides.add(sp); r.planetLabels.push(sp); }
  }

  return {
    source: 'assets/sky', object: r.object, targets: r.targets, tick: r.tick, dispose: r.dispose, setTrails: r.setTrails,
    setPassthrough(on) { passthrough = !!on; r.setPassthrough(passthrough); if (model) this.update(new Date(model.time), model.lat, model.lon); },
    guessPlace() { try { const g = mod.guessLocation && mod.guessLocation(); return g && isFinite(g.lat) && isFinite(g.lon) ? g : null; } catch (err) { return null; } },
    get guides() { return guidesOn; },
    setGuides(on) { guidesOn = !!on; syncGuides(); r.setGuides(guidesOn); if (model) this.update(new Date(model.time), model.lat, model.lon); },
    update(time, lat, lon) {
      if (!model) {
        model = new mod.SkyModel({ lat, lon, time, mode: 'night' });
        if (mod.loadCatalog) {
          mod.loadCatalog(new URL('stars.json', new URL(SKY_MODULE_URL, location.href)).href)
            .then((cat) => { if (cat) { model.setCatalog(cat); onChange(); } }).catch(() => {});
        }
      } else { if (lat !== model.lat || lon !== model.lon) model.setLocation(lat, lon); model.setTime(time); }
      const d = model.getData(), st = d.stars, M = d.matrix;
      if (!st || !st.count) throw new Error('sky model has no stars');
      if (catV !== model.catalogVersion) { catV = model.catalogVersion; syncCatalog(st); syncGuides(); }
      // star frame -> local frame: rows are east, up, -north
      r.eq.matrix.set(M[0], M[1], M[2], 0, M[6], M[7], M[8], 0, -M[3], -M[4], -M[5], 0, 0, 0, 0, 1);
      r.eq.matrixWorldNeedsUpdate = true;
      for (let i = 0; i < n; i++) a.aAlpha[i] = st.alpha[i] * Math.max(0.45, Math.min(1, 1.25 - 0.11 * st.mag[i]));
      r.stars.g.attributes.aAlpha.needsUpdate = true;

      const pl = d.planets;
      for (let i = 0, j = 0; i < 7; i++, j += 3) {
        const e = pl.enu[j], nn = pl.enu[j + 1], u = pl.enu[j + 2];
        pa.position[j] = e * R * 0.98; pa.position[j + 1] = u * R * 0.98; pa.position[j + 2] = -nn * R * 0.98;
        pa.aColor[j] = pl.colour[j]; pa.aColor[j + 1] = pl.colour[j + 1]; pa.aColor[j + 2] = pl.colour[j + 2];
        pa.aSize[i] = coreOf(Math.max(pl.mag[i], -4.6)) * 1.15;
        pa.aAlpha[i] = guidesOn && u > 0.01 ? Math.max(pl.alpha[i], 0.55) : pl.alpha[i];
        const sp = r.planetLabels[i];
        if (sp) { sp.visible = u > 0.01; sp.position.set(e * R * 0.97, u * R * 0.97, -nn * R * 0.97); }
        planetBodies[i].set(u > 0.01 ? [e, u, -nn] : null, tr('sky.mag', { m: num1(pl.mag[i]) }) + '  ·  ' + where(e, nn, u));
      }
      for (const k in r.planets.g.attributes) r.planets.g.attributes[k].needsUpdate = true;
      r.planets.g.setDrawRange(0, 7);

      r.setColours(d.sky.zenith, d.sky.horizon, d.sky.ground);
      if (!mwDone && d.milkyWay) { mwDone = true; r.paintMilkyWay(d.milkyWay); }
      r.setMilkyWay(d.sky.milkyWay * 0.9);
      const m = d.moon;
      r.setMoon(m.alt > -1.5 ? [m.vec[0], m.vec[2], -m.vec[1]] : null, m.illumination, m.limbAngle);
      moonBody.set(m.alt > 0 ? [m.vec[0], m.vec[2], -m.vec[1]] : null, (m.phaseName ? phase(m.phaseName) + '  ·  ' : '') + tr('sky.lit', { pct: Math.round(m.illumination * 100) }) + '  ·  ' + where(m.vec[0], m.vec[1], m.vec[2]));
      // The room is a night sky, so the sun is only marked when asked for (guides) or when the real world shows through.
      const s = d.sun, sunUp = s.vec[2] > 0 && (guidesOn || passthrough);
      r.setSun(sunUp ? [s.vec[0], s.vec[2], -s.vec[1]] : null);
      sunBody.set(sunUp ? [s.vec[0], s.vec[2], -s.vec[1]] : null, where(s.vec[0], s.vec[1], s.vec[2]));
    },
  };
}

// ---------------------------------------------------------------- the component
export function createSky(THREE, opts) {
  const invalidate = (opts && opts.invalidate) || (() => {});
  const object = new THREE.Group();
  let impl = builtinSky(THREE);
  object.add(impl.object);
  let last = null, guides = false, passthrough = false, trailArc = 0;

  const sky = {
    object,
    get source() { return impl.source; },
    get guides() { return guides; },
    get targets() { return impl.targets || []; },       // meshes a pointer can hit: planets, moon, sun
    // Turn the whole sky so that its north lies at this heading in the scene (radians clockwise from -Z).
    setNorth(theta) { object.rotation.y = -theta; invalidate(); },
    setPassthrough(on) { passthrough = !!on; try { impl.setPassthrough(passthrough); } catch (err) { /* optional */ } invalidate(); },
    // Star trails: how far back they reach, in radians of the sky's turn. 0 turns them off.
    setTrails(arc) { trailArc = arc; if (impl.setTrails) impl.setTrails(arc); invalidate(); },
    // A rough "where am I" from the time zone, as the 2D planetarium uses; null if the simulation is not loaded.
    guessPlace() { return impl.guessPlace ? impl.guessPlace() : null; },
    update(time, lat, lon) {
      last = [time, lat, lon];
      try { impl.update(time, lat, lon); }
      catch (err) {                       // a broken module must never take the page down
        console.info('[xr] sky module failed, using built-in stars:', err && err.message);
        sky.use(null);
      }
      invalidate();
    },
    tick(seconds) { impl.tick(seconds); },
    setGuides(on) { guides = !!on; try { impl.setGuides(guides); } catch (err) { /* guides are optional */ } invalidate(); },
    // Swap implementations: pass the simulation's module namespace, or null for the built-in stars.
    use(mod) {
      let next;
      if (mod) {
        if (typeof mod.SkyModel !== 'function') throw new Error('no SkyModel found in sky module');
        next = modelSky(THREE, mod, () => { if (last) sky.update(last[0], last[1], last[2]); });
        try { if (last) next.update(last[0], last[1], last[2]); if (guides) next.setGuides(true); if (passthrough) next.setPassthrough(true); next.setTrails(trailArc); }
        catch (err) { next.dispose(); throw err; }                    // unreadable: keep the old one
      } else { next = builtinSky(THREE); if (passthrough) next.setPassthrough(true); }
      object.remove(impl.object); impl.dispose();
      impl = next; object.add(impl.object);
      invalidate();
    },
    // Feature-detect the site's simulation. Resolves to the source in use.
    async detect() {
      try {
        const head = await fetch(SKY_MODULE_URL, { method: 'HEAD' });
        if (!head.ok) return impl.source;
        sky.use(await import(SKY_MODULE_URL));
      } catch (err) {
        console.info('[xr] /assets/sky/sky.js not usable, keeping built-in stars:', err && err.message);
      }
      return impl.source;
    },
  };
  return sky;
}
