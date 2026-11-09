#!/usr/bin/env node
// Builds every preset door, in every MagSafe mode, and checks what a printed door has to get right.
//
//   node scripts/check-door-generator.mjs                  shape checks only (what the site's own files can prove)
//   node scripts/check-door-generator.mjs --shell a.stl    also fits each door into the stretched shell (assembly offset applied)
//   node scripts/check-door-generator.mjs --reference b.stl also compares the 18 Pro Max door with the door that was printed
//   node scripts/check-door-generator.mjs --write dir       also writes each default door's STL there
//
// Exit 1 on any failure. A check that could not run is printed as SKIP, never as a pass.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../apps/afterglow/door');
const { default: Module } = await import(path.join(site, 'vendor/manifold.js'));
const { buildDoor, check, derive, phoneOutlinePts, FRAME, SHELL, DESIGN, LIMITS, holdsWithClips } = await import(path.join(site, 'door.js'));
const { PRESETS } = await import(path.join(site, 'presets.js'));
const { toSTL } = await import(path.join(site, 'stl.js'));

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const shellPath = arg('--shell'), refPath = arg('--reference'), writeDir = arg('--write');
const SHELL_OFFSET = [0.25, 0, -0.5];
const DOOR_PRINT_TO_ASM = [0, 0, FRAME.z0];

function loadSTL(M, file) {
  const buf = fs.readFileSync(file);
  const tris = [];
  const facet = buf.indexOf('facet');
  if (buf.subarray(0, 5).toString() === 'solid' && facet > 0 && facet < 300) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g; let m; const txt = buf.toString();
    while ((m = re.exec(txt))) tris.push(+m[1], +m[2], +m[3]);
  } else {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) tris.push(buf.readFloatLE(84 + i * 50 + 12 + k * 4));
  }
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < tris.length; i += 3) {
    const key = `${Math.round(tris[i] * 1e4)},${Math.round(tris[i + 1] * 1e4)},${Math.round(tris[i + 2] * 1e4)}`;
    let v = map.get(key);
    if (v === undefined) { v = verts.length / 3; map.set(key, v); verts.push(tris[i], tris[i + 1], tris[i + 2]); }
    idx.push(v);
  }
  const tv = [];
  for (let i = 0; i < idx.length; i += 3) if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) tv.push(idx[i], idx[i + 1], idx[i + 2]);
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tv) });
  mesh.merge();
  return new M.Manifold(mesh);
}

let failed = 0, ran = 0;
const pass = (ok, label, detail = '') => { ran++; if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); };

// Phones at the generator's length limit, as a visitor would type them: a Pro Max stretched to the limit, the same
// outline as a plain rounded rectangle, and a narrower phone that the clips hold. Ring mode only.
const pm = PRESETS.find((p) => p.id === '18-pro-max'), pro = PRESETS.find((p) => p.id === '18-pro');
const stretch = (p, length) => ({ ...p, id: undefined, name: `${p.name} stretched to ${length} mm`, length,
  corner: p.corner.map(([x, y]) => [x, y + (length - p.length) / 2]), magsafe: { mode: 'ring', left: p.width / 2, top: length / 2 } });
const LIMIT_CASES = [
  stretch(pm, LIMITS.maxLength),
  { ...stretch(pm, LIMITS.maxLength), name: `${LIMITS.maxLength} × ${pm.width} mm, 12 mm corners`, corner: undefined, cornerRadius: 12 },
  stretch(pro, LIMITS.maxLength),
];

for (const preset of [...PRESETS, ...LIMIT_CASES]) {
  for (const mode of preset.id ? ['ring', 'cooler', 'none'] : ['ring']) {
    const spec = { ...preset, magsafe: { ...preset.magsafe, mode } };
    const M = await Module(); M.setup();
    console.log(`${preset.name} · MagSafe ${mode}`);
    const chk = check(spec);
    pass(chk.errors.length === 0, 'inputs accepted', JSON.stringify(chk.errors));
    const t0 = Date.now();
    const { door, derived: d, holes } = buildDoor(M, spec);
    const ms = Date.now() - t0;
    const bb = door.boundingBox();
    pass(door.status() === 'NoError', 'manifold', door.status());
    pass(door.decompose().length === 1, 'one piece', `${door.decompose().length} pieces, ${holes} holes, ${door.volume().toFixed(0)} mm³, ${ms} ms`);
    pass(Math.abs(bb.min[2]) < 1e-3, 'flat on the bed', `z ${bb.min[2].toFixed(3)}..${bb.max[2].toFixed(2)}`);
    pass(bb.max[2] + FRAME.z0 < SHELL.rimZ, 'stays below the carriage rim', `tops out at z ${(bb.max[2] + FRAME.z0).toFixed(2)}`);

    // The phone, as a solid in this frame: nothing may overlap it except clips' lips, which sit above the glass.
    const asm = door.translate(DOOR_PRINT_TO_ASM);
    const phone2D = new M.CrossSection([phoneOutlinePts(spec)]);
    const phoneSolid = M.Manifold.extrude(phone2D, spec.thickness).translate([0, 0, d.zBack]);
    const hit = M.Manifold.intersection(asm, phoneSolid).volume();
    pass(hit < 0.01, 'door clears the phone', `${hit.toFixed(4)} mm³`);

    // The camera island stands proud of the phone's back and has to pass through the opening.
    const c = spec.camera, W = spec.width / 2, L = spec.length / 2;
    const x1 = W - c.left, x0 = x1 - c.width, y1 = L - c.top, y0 = y1 - c.height;
    // Its corner is concentric with the opening's: the opening's radius less the clearance.
    const ir = Math.max(0.01, (c.radius ?? 0) - (spec.cameraClearance ?? 0)), seg = 24, ipts = [];
    for (const [cx, cy, a0] of [[x1 - ir, y0 + ir, -90], [x1 - ir, y1 - ir, 0], [x0 + ir, y1 - ir, 90], [x0 + ir, y0 + ir, 180]])
      for (let k = 0; k <= seg; k++) { const a = (a0 + 90 * k / seg) * Math.PI / 180; ipts.push([cx + ir * Math.cos(a), cy + ir * Math.sin(a)]); }
    const island = M.Manifold.extrude(new M.CrossSection([ipts]), 12).translate([0, 0, d.zBack - 12]);
    const hit2 = M.Manifold.intersection(asm, island).volume();
    pass(hit2 < 0.01, 'camera island clears the door', `${hit2.toFixed(4)} mm³`);

    if (d.mode === 'ring') {
      const skin = d.plate - d.ringDepth;
      pass(skin <= 2.1 + 1e-6, "ring's skin within Apple's 2.1 mm", `${skin.toFixed(2)} mm under a ${d.ringDepth.toFixed(2)} mm groove`);
    }

    if (shellPath) {
      const shell = loadSTL(M, shellPath).translate(SHELL_OFFSET);
      const v = M.Manifold.intersection(asm, shell).volume();
      pass(v < 0.01, 'door clears the shell', `${v.toFixed(4)} mm³`);
      const pv = M.Manifold.intersection(phoneSolid, shell).volume();
      pass(pv < 0.01, 'phone clears the shell', `${pv.toFixed(4)} mm³`);
      // The phone either seats on the screen shelves or the clips hold it: the shelf band just past the screen plane.
      const shelf = M.Manifold.intersection(M.Manifold.extrude(phone2D, 0.6).translate([0, 0, SHELL.screenZ + 0.5]), shell).volume();
      const clipped = holdsWithClips(spec);
      pass(clipped ? true : shelf > 5, clipped ? 'held by clips' : 'seats on the screen shelves', `phone overlaps the shelves by ${(shelf / 0.6).toFixed(0)} mm²`);
      // The door swings on its hinge with the phone in it, so everything has to clear the shell on the way shut too.
      const { hingeX, hingeZ } = FRAME;
      const swing = M.Manifold.union(asm, phoneSolid);
      let worst = 0, at = 0;
      for (const deg of [1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70, 90]) {
        const moved = swing.translate([-hingeX, 0, -hingeZ]).rotate([0, deg, 0]).translate([hingeX, 0, hingeZ]);
        const hitV = M.Manifold.intersection(moved, shell).volume();
        if (hitV > worst) { worst = hitV; at = deg; }
      }
      pass(worst < 0.5, 'swings shut without hitting the shell', worst > 0 ? `${worst.toFixed(3)} mm³ at ${at}°` : 'nothing touches');
    } else console.log('  SKIP shell fit (no --shell)');

    if (writeDir && mode === 'ring') {
      fs.mkdirSync(writeDir, { recursive: true });
      fs.writeFileSync(path.join(writeDir, `door-${preset.id}.stl`), toSTL(door));
    }
    if (refPath && preset.id === '18-pro-max' && mode === 'ring') {
      const ref = loadSTL(M, refPath).translate([0.85, 0, -2.5]);
      const a = ref.subtract(asm).volume(), b = asm.subtract(ref).volume();
      const rb = ref.boundingBox(), ab = asm.boundingBox();
      console.log(`  ---- against the printed door: only in printed ${a.toFixed(1)} mm³, only in new ${b.toFixed(1)} mm³, volume ${ref.volume().toFixed(0)} vs ${asm.volume().toFixed(0)}`);
      console.log(`  ---- bbox printed ${rb.min.map((v) => v.toFixed(2))} .. ${rb.max.map((v) => v.toFixed(2))}`);
      console.log(`  ---- bbox new     ${ab.min.map((v) => v.toFixed(2))} .. ${ab.max.map((v) => v.toFixed(2))}`);
      // The frame only: everything outside the bay is what mates with the shell, so it has to be the same part.
      const bayKeep = M.Manifold.extrude(new M.CrossSection([[[-200, -200], [200, -200], [200, 200], [-200, 200]], [[-40, -83.09], [-40, 83.09], [40, 83.09], [40, -83.09]]]), 30).translate([0, 0, -5]);
      const fa = ref.intersect(bayKeep).subtract(asm).volume(), fb = asm.intersect(bayKeep).subtract(ref).volume();
      const fv = ref.intersect(bayKeep).volume();
      console.log(`  ---- frame outside the bay: only in printed ${fa.toFixed(1)} mm³, only in new ${fb.toFixed(1)} mm³, of ${fv.toFixed(0)} mm³`);
      pass((fa + fb) / fv < 0.05, 'frame matches the printed door', `${(100 * (fa + fb) / fv).toFixed(2)} % differs`);
    }
  }
}
console.log(`\n${ran} checks, ${failed} failed${shellPath ? '' : ' (shell fit skipped)'}`);
process.exit(failed ? 1 : 0);
