// Builds the door off the main thread and returns the preview mesh and the download files.
import Module from './vendor/manifold.js';
import { zipSync, strToU8 } from './vendor/fflate.js';
import { buildDoor, check } from './door.js?v=43930d1b';
import { toSTL } from './stl.js';

// Manifold's objects live in WebAssembly memory that JavaScript's garbage collector never frees, so each door gets
// a fresh instance. The compiled code is shared, and the old instance's memory goes with it.
const wasm = fetch(new URL('./vendor/manifold.wasm', import.meta.url))
  .then((r) => { if (!r.ok) throw new Error(`Could not load manifold.wasm (HTTP ${r.status}).`); return r.arrayBuffer(); })
  .then((bytes) => WebAssembly.compile(bytes));

function freshManifold() {
  return wasm.then((compiled) => new Promise((resolve, reject) => {
    Module({ instantiateWasm: (imports, done) => { WebAssembly.instantiate(compiled, imports).then((inst) => done(inst, compiled), reject); return {}; } })
      .then((M) => { M.setup(); resolve(M); }, reject);
  }));
}

function meshArrays(manifold) {
  const mesh = manifold.getMesh();
  const np = mesh.numProp, P = mesh.vertProperties;
  const pos = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) { pos[3 * i] = P[i * np]; pos[3 * i + 1] = P[i * np + 1]; pos[3 * i + 2] = P[i * np + 2]; }
  return { pos, idx: new Uint32Array(mesh.triVerts) };
}

function xmlEsc(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

function to3MF(title, { pos, idx }) {
  const v = []; for (let k = 0; k < pos.length; k += 3) v.push(`<vertex x="${pos[k].toFixed(4)}" y="${pos[k + 1].toFixed(4)}" z="${pos[k + 2].toFixed(4)}"/>`);
  const t = []; for (let k = 0; k < idx.length; k += 3) t.push(`<triangle v1="${idx[k]}" v2="${idx[k + 1]}" v3="${idx[k + 2]}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${xmlEsc(title)}</metadata><metadata name="Application">Afterglow door generator</metadata>` +
    `<resources><object id="1" name="${xmlEsc(title)}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources>` +
    `<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0"/></build></model>`;
  const ct = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return zipSync({ '[Content_Types].xml': strToU8(ct), '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) });
}

self.onmessage = async (e) => {
  const { id, spec } = e.data;
  try {
    const chk = check(spec);
    if (chk.errors.length) { self.postMessage({ id, check: chk }); return; }
    const M = await freshManifold();
    const t0 = performance.now();
    const r = buildDoor(M, spec);
    const label = (spec.name || 'iPhone').trim() || 'iPhone';
    const suffix = { ring: ' - MagSafe ring', cooler: ' - MagSafe cooler', none: '' }[r.derived.mode];
    const base = `Afterglow door - ${label}${suffix}`.replace(/[\\/:*?"<>|]+/g, '-');
    const arrays = meshArrays(r.door);
    const stl = toSTL(r.door), threeMF = to3MF(`Afterglow door - ${label}`, arrays);
    const bb = r.door.boundingBox();
    const stats = {
      ms: Math.round(performance.now() - t0), holes: r.holes, derived: r.derived,
      size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
      volume: r.door.volume(), pieces: r.door.decompose().length,
    };
    self.postMessage({ id, check: chk, arrays, files: { stl: { name: `${base}.stl`, data: stl }, threeMF: { name: `${base}.3mf`, data: threeMF } }, stats },
      [arrays.pos.buffer, arrays.idx.buffer, stl.buffer, threeMF.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
