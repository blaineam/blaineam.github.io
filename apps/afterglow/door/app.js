import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { FRAME, LIMITS, phoneOutlinePts, DESIGN } from './door.js';
import { PRESETS } from './presets.js';

const $ = (s) => document.querySelector(s);
const msgText = (key, values = {}) => {
  const el = document.querySelector(`#msgs [data-msg="${key}"]`);
  let t = el ? el.textContent : key;
  for (const [k, v] of Object.entries(values)) t = t.replaceAll(`{${k}}`, String(v));
  return t;
};

// ------------------------------------------------------------------ state
const DEFAULT_ID = '18-pro-max';
const params = new URLSearchParams(location.search);
let phoneId = PRESETS.some((p) => p.id === params.get('phone')) || params.get('phone') === 'custom' ? params.get('phone') : DEFAULT_ID;
let mode = ['ring', 'cooler', 'none'].includes(params.get('magsafe')) ? params.get('magsafe') : 'ring';

function presetById(id) { return PRESETS.find((p) => p.id === id); }

// ------------------------------------------------------------------ the picker
const pick = $('#phones');
for (const p of PRESETS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pick'; b.dataset.phone = p.id; b.setAttribute('role', 'radio');
  b.textContent = p.name.replace('iPhone ', '');
  pick.appendChild(b);
}
{
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pick wide'; b.dataset.phone = 'custom'; b.setAttribute('role', 'radio');
  b.textContent = msgText('customSize');
  pick.appendChild(b);
}

function reflectPicker() {
  for (const b of pick.querySelectorAll('.pick')) {
    const on = b.dataset.phone === phoneId;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  for (const b of document.querySelectorAll('#magsafe .seg')) {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  for (const n of document.querySelectorAll('#magsafe-note [data-for]')) n.hidden = n.dataset.for !== mode;
  $('#custom').hidden = phoneId !== 'custom';
  try {
    const u = new URL(location.href);
    u.searchParams.set('phone', phoneId); u.searchParams.set('magsafe', mode);
    history.replaceState(null, '', u);
  } catch { /* a sandboxed preview can refuse this; the page works without it */ }
}

// ------------------------------------------------------------------ custom size
const FIELDS = ['name', 'length', 'width', 'thickness', 'cornerRadius', 'camera.top', 'camera.left', 'camera.width', 'camera.height', 'camera.radius', 'cameraClearance', 'magsafe.top', 'magsafe.left'];
const field = (k) => document.getElementById('f-' + k.replace('.', '-'));

function readCustom() {
  const s = { camera: {}, magsafe: { mode } };
  for (const k of FIELDS) {
    const raw = field(k).value.trim();
    const v = k === 'name' ? raw : (raw === '' ? NaN : Number(raw));
    if (k.includes('.')) { const [a, b] = k.split('.'); s[a][b] = v; } else s[k] = v;
  }
  if (!isFinite(s.camera.radius)) s.camera.radius = 0;
  if (!isFinite(s.cameraClearance)) s.cameraClearance = 1.2;
  // An empty MagSafe position means the middle of the phone.
  if (!isFinite(s.magsafe.top)) delete s.magsafe.top;
  if (!isFinite(s.magsafe.left)) delete s.magsafe.left;
  return s;
}
function writeCustom(p) {
  const v = {
    name: '', length: p.length, width: p.width, thickness: p.thickness, cornerRadius: 14,
    'camera.top': p.camera.top, 'camera.left': p.camera.left, 'camera.width': p.camera.width, 'camera.height': p.camera.height, 'camera.radius': p.camera.radius,
    cameraClearance: p.cameraClearance, 'magsafe.top': p.magsafe.top, 'magsafe.left': p.magsafe.left,
  };
  for (const k of FIELDS) field(k).value = v[k];
}
function currentSpec() {
  if (phoneId === 'custom') return readCustom();
  const p = presetById(phoneId);
  return { ...p, magsafe: { ...p.magsafe, mode } };
}

// ------------------------------------------------------------------ preview
const viewEl = $('#view');
let renderer = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
let controls = null;
const model = new THREE.Group(); scene.add(model);
const doorGroup = new THREE.Group(); model.add(doorGroup);
const phoneGroup = new THREE.Group(); model.add(phoneGroup);

scene.add(new THREE.HemisphereLight(0xf3eefb, 0x2a0f4a, 1.3));
const keyLight = new THREE.DirectionalLight(0xff9ec9, 2.4); keyLight.position.set(-160, 180, 260); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x2de2e6, 1.6); rimLight.position.set(220, -160, 120); scene.add(rimLight);
const underLight = new THREE.DirectionalLight(0xffd45c, 0.7); underLight.position.set(0, -60, -200); scene.add(underLight);

const MAT = {
  door: new THREE.MeshStandardMaterial({ color: 0x9a5bd8, roughness: 0.48, metalness: 0.08, side: THREE.DoubleSide }),
  phone: new THREE.MeshStandardMaterial({ color: 0x2de2e6, transparent: true, opacity: 0.16, roughness: 0.4, depthWrite: false }),
  cam: new THREE.MeshStandardMaterial({ color: 0x2de2e6, transparent: true, opacity: 0.34, depthWrite: false }),
  ring: new THREE.MeshStandardMaterial({ color: 0xffd45c, roughness: 0.32, metalness: 0.65 }),
};
function geom({ pos, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose(); return ng;
}
function shapeFrom(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; }
function roundedShape(x0, x1, y0, y1, r) {
  const s = new THREE.Shape(); r = Math.max(0.01, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI);
  return s;
}
function showPhone(spec, d) {
  for (const c of [...phoneGroup.children]) { c.geometry?.dispose(); phoneGroup.remove(c); }
  const zb = d.zBack - FRAME.z0;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom(phoneOutlinePts(spec)), { depth: spec.thickness, bevelEnabled: false }), MAT.phone);
  body.position.z = zb; phoneGroup.add(body);
  const c = spec.camera, x1 = d.W - c.left, x0 = x1 - c.width, y1 = d.L - c.top, y0 = y1 - c.height;
  const cam = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(x0, x1, y0, y1, Math.max(0.01, (c.radius || 0) - (spec.cameraClearance ?? 0))), { depth: 3, bevelEnabled: false, curveSegments: 12 }), MAT.cam);
  cam.position.z = zb - 3; phoneGroup.add(cam);
  if (d.mode === 'ring') {
    const s = new THREE.Shape(); s.absarc(0, 0, DESIGN.ring.od / 2 - 0.3, 0, Math.PI * 2);
    const h = new THREE.Path(); h.absarc(0, 0, DESIGN.ring.id / 2 + 0.3, 0, Math.PI * 2, true); s.holes.push(h);
    const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 64 }), MAT.ring);
    ring.position.set(d.magX, d.magY, d.ringDepth - 0.5); phoneGroup.add(ring);
  }
  phoneGroup.visible = $('#show-phone').checked;
}

let side = 'outer';
function setSide(which) {
  side = which;
  // Turn the door rather than the camera: the light stays where it is, so the dots read the same both ways.
  model.rotation.set(0, which === 'outer' ? Math.PI : 0, 0);
  model.position.z = which === 'outer' ? 5 : -5;
  if (controls) {
    // Back off in a narrow panel so the whole door stays in frame.
    const k = camera.aspect < 1.1 ? 1.1 / camera.aspect : 1;
    camera.position.set(-115 * k, -190 * k, 285 * k); controls.target.set(0, 0, 0); controls.update();
  }
  $('#view-outer').classList.toggle('on', which === 'outer'); $('#view-inner').classList.toggle('on', which === 'inner');
  $('#view-outer').setAttribute('aria-pressed', which === 'outer'); $('#view-inner').setAttribute('aria-pressed', which === 'inner');
}
function resize() {
  if (!renderer) return;
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
function initPreview() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    $('#view-fallback').hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewEl.appendChild(renderer.domElement);
  camera.up.set(0, 0, 1);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 150; controls.maxDistance = 1100;
  new ResizeObserver(resize).observe(viewEl);
  resize();
  setSide('outer');
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
}

// ------------------------------------------------------------------ build
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let seq = 0, lastFiles = null, lastSpec = null, debounce = 0;
const statusEl = $('#status'), msgEl = $('#messages');
function setStatus(t, cls = '') { statusEl.textContent = t; statusEl.className = 'status ' + cls; }
function showMessages(errors = [], warnings = []) {
  msgEl.innerHTML = '';
  for (const [cls, list] of [['err', errors], ['warn', warnings]]) for (const m of list) {
    const li = document.createElement('li'); li.className = cls;
    li.textContent = typeof m === 'string' ? m : msgText(m.key, m.values);
    msgEl.appendChild(li);
  }
}
function enableDownloads(on) { for (const b of document.querySelectorAll('.dl')) b.disabled = !on; }
function fmt(v, n = 1) { return Number(v).toFixed(n); }

function showFacts(spec, s) {
  const d = s.derived;
  $('#fact-size').textContent = `${fmt(s.size[0])} × ${fmt(s.size[1])} × ${fmt(s.size[2])} mm`;
  $('#fact-hold').textContent = msgText(d.clips ? 'holdClips' : 'holdShelves');
  let mag = msgText('magNone');
  if (d.mode !== 'none') {
    const off = Math.abs(d.magY);
    const where = off < 0.15 ? msgText('magCentred') : msgText('magOffset', { v: fmt(off), end: d.magY < 0 ? msgText('endUsb') : msgText('endCamera') });
    mag = where;
  }
  $('#fact-mag').textContent = mag;
  $('#fact-weight').textContent = msgText('weight', { v: Math.round(s.volume * 1.27 / 1000 * 0.72 + 2) });
}

function generate() {
  clearTimeout(debounce);
  const spec = currentSpec(); lastSpec = spec;
  lastFiles = null; enableDownloads(false);
  setStatus(msgText('building'), 'busy');
  worker.postMessage({ id: ++seq, spec });
}
worker.onmessage = (e) => {
  const r = e.data; if (r.id !== seq) return;
  if (r.error) { model.visible = false; setStatus(msgText('failed'), 'bad'); showMessages([r.error]); console.error(r.error); return; }
  if (!r.arrays) { model.visible = false; showMessages(r.check.errors, r.check.warnings); setStatus(msgText('fixValues'), 'bad'); return; }
  for (const c of [...doorGroup.children]) { c.geometry?.dispose(); doorGroup.remove(c); }
  doorGroup.add(new THREE.Mesh(geom(r.arrays), MAT.door));
  showPhone(lastSpec, r.stats.derived);
  model.visible = true;
  if (r.stats.pieces !== 1) { showMessages([{ key: 'pieces' }]); setStatus(msgText('fixValues'), 'bad'); return; }
  lastFiles = r.files;
  showMessages(r.check.errors, r.check.warnings);
  showFacts(lastSpec, r.stats);
  setStatus(msgText('ready', { name: lastSpec.name || msgText('yourPhone') }), 'ok');
  enableDownloads(true);
  window.__doorReady = { id: r.id, stats: r.stats, names: [r.files.stl.name, r.files.threeMF.name] };
};
worker.onerror = (e) => { setStatus(msgText('failed'), 'bad'); console.error(e.message); };

function download(f) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.data])); a.download = f.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ wiring
pick.addEventListener('click', (e) => {
  const b = e.target.closest('.pick'); if (!b) return;
  const next = b.dataset.phone;
  if (next === 'custom' && phoneId !== 'custom') writeCustom(presetById(phoneId) ?? presetById(DEFAULT_ID));
  phoneId = next; reflectPicker(); generate();
});
$('#magsafe').addEventListener('click', (e) => {
  const b = e.target.closest('.seg'); if (!b) return;
  mode = b.dataset.mode; reflectPicker(); generate();
});
document.querySelectorAll('#custom input').forEach((el) => el.addEventListener('input', () => {
  clearTimeout(debounce); lastFiles = null; enableDownloads(false);
  setStatus(msgText('building'), 'busy');
  debounce = setTimeout(generate, 350);
}));
$('#custom').addEventListener('submit', (e) => { e.preventDefault(); generate(); });
$('#dl-stl').addEventListener('click', () => lastFiles && download(lastFiles.stl));
$('#dl-3mf').addEventListener('click', () => lastFiles && download(lastFiles.threeMF));
$('#view-inner').addEventListener('click', () => setSide('inner'));
$('#view-outer').addEventListener('click', () => setSide('outer'));
$('#show-phone').addEventListener('change', (e) => (phoneGroup.visible = e.target.checked));
$('#limits').textContent = msgText('limits', { w: LIMITS.maxWidth, l: LIMITS.maxLength, t: LIMITS.maxThickness });
// The dictionaries load after this module on a translated page: refresh what JavaScript wrote.
document.addEventListener('i18n:applied', () => {
  pick.querySelector('[data-phone=custom]').textContent = msgText('customSize');
  $('#limits').textContent = msgText('limits', { w: LIMITS.maxWidth, l: LIMITS.maxLength, t: LIMITS.maxThickness });
  generate();
});

initPreview();
if (phoneId === 'custom') writeCustom(presetById(DEFAULT_ID));
reflectPicker();
generate();
