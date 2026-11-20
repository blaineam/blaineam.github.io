// wemiller.com /xr/ — the calendar's weather: what the home page draws in its hero on a holiday or
// in a season, done as things in the air around the visitor.
//
//   const fx = createSeasonFx(THREE, { reduced });
//   scene.add(fx.object);
//   fx.set({ effect: 'snow', lights: true, colors: [...] });   // or null for nothing
//   fx.update(dtMs, seconds);                                   // every drawn frame while fx.active
//
// Effects (the same names content/site.json uses): snow, leaves, fireflies, embers, petals, stars,
// confetti, fireworks; plus a strand of Christmas lights. One draw call for the particles, one for
// the bulbs, one for their wire. Nothing moves the visitor or fills their view: particles are small,
// slow and never closer than about 70 cm. With reduced motion asked for, only the lights are shown, lit.
// No yellow or gold is added here; a day's own colours (site.json → seasons[].colors) are used as given.

const PAL = {
  snow: ['#ffffff', '#dbeaff'], leaves: ['#b5482a', '#8c3b22', '#c9663a', '#6e2f1f'], fireflies: ['#b8ffb0', '#8ef0c0'], embers: ['#b98cff', '#ff7a3d', '#8a5cff'],
  petals: ['#ffc9de', '#cfe3ff', '#d9c8ff', '#c8f2dc'], stars: ['#ffffff', '#e2483f', '#4f8cff'], confetti: ['#6fe0c0', '#6cb6ff', '#ff8fb1', '#ffffff', '#b79cff'],
  fireworks: ['#6cb6ff', '#ff6b6b', '#ffffff', '#9dffcf', '#c9a8ff'],
};
const COUNT = { snow: 150, leaves: 30, fireflies: 40, embers: 60, petals: 50, stars: 36, confetti: 170, fireworks: 0 };
const SHAPE = { snow: 0, fireflies: 0, embers: 0, fireworks: 0, leaves: 1, petals: 1, confetti: 2, stars: 3 };
const BULBS = ['#ff3b4e', '#35e08a', '#4aa8ff', '#ffffff', '#ff6fd0'];       // no yellow bulbs on this tree
const MAX = 480, REACH = 5.5, NEAR = 0.7, TOP = 3.2, BOTTOM = -1.7;           // metres, around the visitor's eyes

const VERT = `
attribute float aSize; attribute float aAlpha; attribute float aAngle; attribute vec3 aColor;
uniform float uPx;
varying vec3 vC; varying float vA; varying float vAng;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uPx * 0.5 / max(0.1, -mv.z), 1.0, 160.0);
  vC = aColor; vA = aAlpha; vAng = aAngle;
}`;
const FRAG = `
uniform int uShape;
varying vec3 vC; varying float vA; varying float vAng;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float a = 0.0;
  if (uShape == 0) { float r = length(p); a = exp(-r * r * 5.0) + 0.25 * exp(-r * 2.2) * (1.0 - smoothstep(0.6, 1.0, r)); }
  else {
    float c = cos(vAng * 2.0), s = sin(vAng * 2.0);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    if (uShape == 1) a = 1.0 - smoothstep(0.85, 1.0, length(q / vec2(1.0, 0.56)));
    else if (uShape == 2) { float flip = max(0.12, abs(cos(vAng * 3.0))); a = step(abs(q.x), 0.42) * step(abs(q.y), 0.8 * flip); }
    else { float r = length(q), an = atan(q.y, q.x); a = 1.0 - smoothstep(-0.04, 0.04, r - mix(0.42, 1.0, pow(abs(cos(an * 2.5)), 3.0))); }
  }
  if (a * vA < 0.01) discard;
  gl_FragColor = vec4(vC, a * vA);
}`;

export function createSeasonFx(THREE, opts) {
  const reduced = !!(opts && opts.reduced);
  const object = new THREE.Group();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const col = new THREE.Color();

  // ---------------------------------------------------------------- particles
  const A = { position: new Float32Array(MAX * 3), aColor: new Float32Array(MAX * 3), aSize: new Float32Array(MAX), aAlpha: new Float32Array(MAX), aAngle: new Float32Array(MAX) };
  const geo = new THREE.BufferGeometry();
  for (const k in A) geo.setAttribute(k, new THREE.BufferAttribute(A[k], k === 'position' || k === 'aColor' ? 3 : 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 800 }, uShape: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.renderOrder = 5;
  const size2 = new THREE.Vector2();
  points.onBeforeRender = (renderer, scene, camera) => { mat.uniforms.uPx.value = camera.viewport ? camera.viewport.w : renderer.getDrawingBufferSize(size2).y; mat.uniformsNeedUpdate = true; };
  object.add(points);
  const P = [];                         // { vx, vy, vz, va, life, base }
  for (let i = 0; i < MAX; i++) P.push({ vx: 0, vy: 0, vz: 0, va: 0, life: 0, base: 1 });
  let n = 0, fxName = '', palette = [], age = 0, finite = false;

  function tint(i, hex) { col.set(hex); A.aColor[i * 3] = col.r; A.aColor[i * 3 + 1] = col.g; A.aColor[i * 3 + 2] = col.b; }
  function place(i, first) {
    // somewhere in a ring round the visitor, never right in their face
    const r = rnd(NEAR, REACH), az = rnd(0, Math.PI * 2), p = P[i];
    A.position[i * 3] = r * Math.sin(az); A.position[i * 3 + 2] = -r * Math.cos(az);
    A.position[i * 3 + 1] = first ? rnd(BOTTOM, TOP) : TOP;
    tint(i, palette[Math.floor(Math.random() * palette.length)]);
    A.aAngle[i] = rnd(0, 6.3); A.aAlpha[i] = 0.9; p.base = 0.9;
    p.vx = rnd(-0.06, 0.06); p.vz = rnd(-0.06, 0.06); p.vy = -rnd(0.3, 0.8); p.va = rnd(-0.6, 0.6); A.aSize[i] = rnd(0.012, 0.03);
    if (fxName === 'snow') { p.base = A.aAlpha[i] = 0.85; }
    else if (fxName === 'leaves') { A.aSize[i] = rnd(0.05, 0.09); p.vy = -rnd(0.35, 0.8); p.va = rnd(-0.9, 0.9); }
    else if (fxName === 'petals') { A.aSize[i] = rnd(0.04, 0.07); p.vy = -rnd(0.4, 0.95); p.va = rnd(-1.4, 1.4); }
    else if (fxName === 'confetti') { A.aSize[i] = rnd(0.045, 0.075); p.vy = -rnd(0.5, 1.2); p.va = rnd(-2, 2); }
    else if (fxName === 'stars') { A.aSize[i] = rnd(0.05, 0.09); p.vy = -rnd(0.2, 0.5); p.va = rnd(-0.3, 0.3); }
    else if (fxName === 'fireflies') { A.position[i * 3 + 1] = rnd(-1.3, 0.9); p.vy = rnd(-0.05, 0.05); A.aSize[i] = rnd(0.03, 0.055); p.va = rnd(0.5, 1.2); }
    else if (fxName === 'embers') { A.position[i * 3 + 1] = first ? rnd(BOTTOM, TOP) : BOTTOM; p.vy = rnd(0.2, 0.6); A.aSize[i] = rnd(0.02, 0.045); }
  }
  function burst() {
    const az = rnd(0, Math.PI * 2), el = rnd(0.35, 0.9), d = rnd(28, 42), hex = palette[Math.floor(Math.random() * palette.length)];
    const cx = d * Math.cos(el) * Math.sin(az), cy = d * Math.sin(el), cz = -d * Math.cos(el) * Math.cos(az);
    for (let k = 0; k < 46 && n < MAX; k++, n++) {
      // a shell of sparks: evenly spread directions, a little ragged
      const u = (k + 0.5) / 46 * 2 - 1, th = k * 2.39996, s = Math.sqrt(1 - u * u), sp = rnd(3.5, 8.5), p = P[n];
      A.position[n * 3] = cx; A.position[n * 3 + 1] = cy; A.position[n * 3 + 2] = cz;
      p.vx = s * Math.cos(th) * sp; p.vy = u * sp; p.vz = s * Math.sin(th) * sp; p.life = 1; p.va = 0;
      tint(n, hex); A.aSize[n] = 0.55; A.aAlpha[n] = 1; A.aAngle[n] = 0;
    }
  }
  function kill(i) {            // swap the last live particle into this slot
    const j = --n;
    if (i !== j) {
      for (let c = 0; c < 3; c++) { A.position[i * 3 + c] = A.position[j * 3 + c]; A.aColor[i * 3 + c] = A.aColor[j * 3 + c]; }
      A.aSize[i] = A.aSize[j]; A.aAlpha[i] = A.aAlpha[j]; A.aAngle[i] = A.aAngle[j];
      const t = P[i]; P[i] = P[j]; P[j] = t;
    }
  }

  // ---------------------------------------------------------------- Christmas lights
  const strand = new THREE.Group();
  strand.visible = false;
  object.add(strand);
  const LR = 3.4, LY = 1.25, SAG = 0.22, SWAGS = 9, PER = 8, NB = SWAGS * PER;
  const bulbPos = new Float32Array(NB * 3), bulbCol = new Float32Array(NB * 3), bulbSize = new Float32Array(NB), bulbAlpha = new Float32Array(NB), bulbAng = new Float32Array(NB);
  const seg = [];
  for (let s = 0; s < SWAGS; s++) for (let k = 0; k < 16; k++) {
    for (const f of [k / 16, (k + 1) / 16]) { const az = ((s + f) / SWAGS) * Math.PI * 2; seg.push(LR * Math.sin(az), LY - SAG * Math.sin(Math.PI * f), -LR * Math.cos(az)); }
  }
  for (let i = 0; i < NB; i++) {
    const s = Math.floor(i / PER), f = ((i % PER) + 0.5) / PER, az = ((s + f) / SWAGS) * Math.PI * 2;
    bulbPos[i * 3] = LR * Math.sin(az); bulbPos[i * 3 + 1] = LY - SAG * Math.sin(Math.PI * f) - 0.035; bulbPos[i * 3 + 2] = -LR * Math.cos(az);
    col.set(BULBS[i % BULBS.length]); bulbCol[i * 3] = col.r; bulbCol[i * 3 + 1] = col.g; bulbCol[i * 3 + 2] = col.b;
    bulbSize[i] = 0.16; bulbAlpha[i] = 1;
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  strand.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#0e2018' })));
  const bulbGeo = new THREE.BufferGeometry();
  bulbGeo.setAttribute('position', new THREE.BufferAttribute(bulbPos, 3));
  bulbGeo.setAttribute('aColor', new THREE.BufferAttribute(bulbCol, 3));
  bulbGeo.setAttribute('aSize', new THREE.BufferAttribute(bulbSize, 1));
  bulbGeo.setAttribute('aAlpha', new THREE.BufferAttribute(bulbAlpha, 1));
  bulbGeo.setAttribute('aAngle', new THREE.BufferAttribute(bulbAng, 1));
  const bulbMat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 800 }, uShape: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const bulbs = new THREE.Points(bulbGeo, bulbMat);
  bulbs.frustumCulled = false; bulbs.renderOrder = 5;
  bulbs.onBeforeRender = (renderer, scene, camera) => { bulbMat.uniforms.uPx.value = camera.viewport ? camera.viewport.w : renderer.getDrawingBufferSize(size2).y; bulbMat.uniformsNeedUpdate = true; };
  strand.add(bulbs);
  // Brightness of bulb i in pattern p: each is continuous in time, and patterns cross-fade (as on the home page).
  function level(p, i, t) {
    let d;
    if (p === 0) { d = ((i - t * 4) % 6 + 6) % 6; d = Math.min(d, 6 - d); return Math.max(0.14, 1 - d / 1.6); }     // a chase that glides
    if (p === 1) return 0.14 + 0.86 * (0.5 + 0.5 * Math.sin(t * 2.2 + (i % 2) * Math.PI));                              // every other bulb, breathing
    if (p === 2) { d = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 12.9898); return 0.2 + 0.8 * d * d; }                          // twinkle
    if (p === 3) return 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(t * 2.4 - i * 0.45));                                        // a wave down the strand
    return 0.72 + 0.28 * Math.sin(t * 1.6 + i * 0.3);                                                                    // all on, shimmering
  }

  const fx = {
    object,
    active: false,            // true while something needs a frame
    name: '',
    set(info) {
      n = 0; age = 0; fxName = ''; fx.name = '';
      strand.visible = !!(info && info.lights);
      if (strand.visible) { for (let i = 0; i < NB; i++) bulbAlpha[i] = 1; bulbGeo.attributes.aAlpha.needsUpdate = true; }
      const effect = info && info.effect;
      if (effect && !reduced && PAL[effect]) {
        fxName = fx.name = effect;
        palette = info.colors && info.colors.length ? info.colors : PAL[effect];
        finite = effect === 'confetti';
        mat.uniforms.uShape.value = SHAPE[effect];
        mat.blending = effect === 'fireworks' || effect === 'fireflies' || effect === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending;
        mat.needsUpdate = true;
        n = COUNT[effect];
        for (let i = 0; i < n; i++) place(i, true);
      }
      geo.setDrawRange(0, n);
      for (const k in A) geo.attributes[k].needsUpdate = true;
      fx.active = !reduced && (n > 0 || fxName === 'fireworks' || strand.visible);
    },
    update(dtMs, t) {
      if (!fx.active) return;
      const dt = Math.min(0.064, dtMs / 1000);
      age += dt;
      if (strand.visible) {
        const cyc = t / 7, pattern = Math.floor(cyc) % 5, frac = cyc - Math.floor(cyc);
        let mix = frac > 0.8 ? (frac - 0.8) / 0.2 : 0; mix = mix * mix * (3 - 2 * mix);
        for (let i = 0; i < NB; i++) bulbAlpha[i] = 0.25 + 0.75 * (level(pattern, i, t) * (1 - mix) + level((pattern + 1) % 5, i, t) * mix);
        bulbGeo.attributes.aAlpha.needsUpdate = true;
      }
      if (!fxName) return;
      if (fxName === 'fireworks') {
        if (Math.random() < 1.4 * dt && n < MAX - 46) burst();
        for (let i = n - 1; i >= 0; i--) {
          const p = P[i], k = Math.pow(0.55, dt);
          p.vy -= 1.6 * dt; p.vx *= k; p.vy *= k; p.vz *= k; p.life -= 0.42 * dt;
          if (p.life <= 0) { kill(i); continue; }
          A.position[i * 3] += p.vx * dt; A.position[i * 3 + 1] += p.vy * dt; A.position[i * 3 + 2] += p.vz * dt;
          A.aAlpha[i] = p.life;
        }
      } else {
        for (let i = n - 1; i >= 0; i--) {
          const p = P[i];
          A.aAngle[i] += p.va * dt;
          const sway = Math.sin(A.aAngle[i]) * 0.12;
          A.position[i * 3] += (p.vx + sway) * dt; A.position[i * 3 + 1] += p.vy * dt; A.position[i * 3 + 2] += p.vz * dt;
          if (fxName === 'fireflies') { A.aAlpha[i] = 0.2 + 0.8 * Math.abs(Math.sin(A.aAngle[i] * 1.5)); p.vy += rnd(-0.2, 0.2) * dt; p.vy = Math.max(-0.08, Math.min(0.08, p.vy)); }
          const y = A.position[i * 3 + 1], x = A.position[i * 3], z = A.position[i * 3 + 2], r2 = x * x + z * z;
          if (y < BOTTOM || y > TOP + 0.01 || r2 > (REACH + 0.5) * (REACH + 0.5) || (fxName === 'fireflies' && r2 < NEAR * NEAR * 0.5)) {
            if (finite && age > 8) { kill(i); continue; }
            place(i, fxName === 'fireflies');
          }
        }
        if (finite && n === 0) { fxName = ''; fx.active = strand.visible; }
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = geo.attributes.aAlpha.needsUpdate = geo.attributes.aAngle.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = geo.attributes.aSize.needsUpdate = true;
    },
  };
  return fx;
}
