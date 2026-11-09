// Afterglow viewer: phone door generator.
//
// Builds a one-piece PETG door for the stretched ("remix") viewer shell from a phone's dimensions. It needs no TPU:
// integral corner anchors locate the phone, and phones too small to seat on the shell's screen shelves get four
// rigid clips that hold the front edge of the glass.
//
// The door frame (outline, hinge knuckles, pin hole, hair-tie latch) follows brenpoly's CardboardXR door generator,
// Apache-2.0, moved outward by the same amounts the remix shell was stretched: 3.5 mm a side across and 6 mm a side
// along. Everything inside that frame is new here. See NOTICE.md.
//
// Door frame: x = across the phone (+x = latch side, -x = hinge side), y = along the phone (+y = camera end),
// z = up from the door's outer face, in the viewer's assembly frame. Seen from outside (the phone's back, camera end
// up), +x is on the LEFT. Units are mm.

export const STRETCH = { x: 3.5, y: 6, cutX: 26.85, cutY: 55 };

export const SHELL = {
  // The remix shell's phone bay, measured on the stretched shell in this frame.
  bayX: 40.0, bayY: 83.09, bayR: 11.5,
  bayClear: 0.228,       // the gap the printed iPhone 18 Pro Max door keeps to the bay wall
  screenZ: 8.15,         // the plane the phone's screen lands on: it fixes the lens-to-screen distance
  shelfX: 37.0,          // the screen shelves' inner edge, across, at |y| 68..72
  shelfY: 68.0,          // where those shelves begin, along: a clip may not reach past it
  shelfSeat: 0.8,        // how far a phone must overlap that edge to seat on the shelves
  rimZ: 10.3,            // nothing may rise past here: the carriage's flange lands just above it
};

export const FRAME = {
  HX: 38.6 + STRETCH.x, HY: 79.59 + STRETCH.y, CR: 13.5,   // door outline
  z0: -2.5, t: 2.0,                                        // outer face z, flange thickness
  hingeX: -41.4 - STRETCH.x, hingeZ: 1.5, knuckleR: 2.5, pinR: 1.15,
  // Knuckle spans along y. The outer two are cut by the stretch, so they grow with the shell's.
  knuckles: [[-10, 10], [38, 58 + STRETCH.y], [-58 - STRETCH.y, -38]],
  latchRise: 1.5, latchRound: 0.6,
};
const DX = STRETCH.x;
const TAB = [[[38.0 + DX, -27.5], [42.2 + DX, -27.5], [43.0 + DX, -26.7], [43.0 + DX, 26.7], [42.2 + DX, 27.5], [38.0 + DX, 27.5]], [0, 0.3, 0.3, 0.3, 0.3, 0]];
const EAR = [[[38.0 + DX, 30.5], [41.399 + DX, 30.5], [41.801 + DX, 29.0], [42.80 + DX, 29.0], [45.6 + DX, 31.999], [45.6 + DX, 34.5], [38.0 + DX, 34.5]], [0, 0.8, 0.3, 0.3, 0.8, 0.8, 0]];
const RIM_X = 38.75 + DX;

export const DESIGN = {
  gap: 0.35,             // phone to anchor
  minWall: 0.8, maxWall: 2.0,
  // Anchors: how far each one runs along the phone's long side and short side from the corner's end.
  seatedLeg: 7.7, seatedRise: 3.1,
  clippedLeg: 12.5, clippedRise: 4.5,
  endLeg: 14,
  // Clips sit between the camera island's corner and the first button, and the mirror of that at the USB end.
  clip: { from: 14, to: 25, wall: 1.4, lip: 0.6, under: 0.05, top: 9.5, shelfClear: 0.5 },
  ring: { od: 58, id: 44, minDepth: 0.8, skin: 2.0, solid0: 20.5, solid1: 30.5 },  // Apple allows 2.1 mm on the back
  cooler: { d: 60, solid: 1.5 },
  dots: { pitch: 3.4, big: 2.2, small: 1.4, fade: 2.6, inset: 1.0, clearCamera: 2.6, clearEdge: 2.0 },
};

export const LIMITS = {
  minWidth: 62, maxWidth: 78.4, minLength: 125, maxLength: 165,
  minThickness: 5.5, maxThickness: 9.15, minCornerR: 4, maxCornerR: 20,
};

const MAGSAFE_DEFAULT = 'ring';

/** Does this phone seat on the shell's screen shelves, or does the door have to hold its glass? */
export function holdsWithClips(spec) { return spec.width / 2 < SHELL.shelfX + SHELL.shelfSeat; }

/** Phone spec (all mm):
 *  name, length, width, thickness,
 *  corner: [[x, y], ...] a phone-centred top-left corner curve, or cornerRadius for a plain arc,
 *  camera: { top, left, width, height, radius } the raised island on the BACK of the phone, camera end up,
 *  cameraClearance, magsafe: { mode: 'ring'|'cooler'|'none', top, left } the magnet array's centre. */
export function derive(spec) {
  const W = spec.width / 2, L = spec.length / 2, cl = spec.cameraClearance ?? 1.2, c = spec.camera;
  const x1 = W - c.left + cl, x0 = W - c.left - c.width - cl, y1 = L - c.top + cl, y0 = L - c.top - c.height - cl;
  // The radius is not grown with the clearance, so the corners cut further out rather than under-cutting the island.
  const r = Math.max(0, Math.min(c.radius ?? 0, (x1 - x0) / 2 - 0.001, (y1 - y0) / 2 - 0.001));
  const zBack = SHELL.screenZ - spec.thickness;
  const m = spec.magsafe ?? {};
  const mode = m.mode ?? MAGSAFE_DEFAULT;
  const magX = W - (m.left ?? W), magY = L - (m.top ?? L);
  const plate = zBack - FRAME.z0;
  const ringDepth = Math.max(DESIGN.ring.minDepth, plate - DESIGN.ring.skin);
  return { W, L, zBack, plate, window: [x0, x1, y0, y1, r], mode, magX, magY, ringDepth, clips: holdsWithClips(spec) };
}

// Messages are { key, values } so the page can show them in the visitor's language.
export function check(spec) {
  const errors = [], warnings = [];
  const n = (v) => typeof v === 'number' && isFinite(v);
  const err = (key, values) => errors.push({ key, values }), warn = (key, values) => warnings.push({ key, values });
  for (const k of ['length', 'width', 'thickness']) if (!n(spec[k])) err('missing');
  if (!spec.corner && !n(spec.cornerRadius)) err('missing');
  const c = spec.camera || {};
  for (const k of ['top', 'left', 'width', 'height']) if (!n(c[k])) err('missing');
  if (spec.cameraClearance != null && !n(spec.cameraClearance)) err('missing');
  if (errors.length) return { errors: errors.slice(0, 1), warnings };
  if (spec.width > LIMITS.maxWidth) err('tooWide', { v: spec.width, max: LIMITS.maxWidth });
  if (spec.length > LIMITS.maxLength) err('tooLong', { v: spec.length, max: LIMITS.maxLength });
  if (spec.width < LIMITS.minWidth) err('tooNarrow', { v: spec.width, min: LIMITS.minWidth });
  if (spec.length < LIMITS.minLength) err('tooShort', { v: spec.length, min: LIMITS.minLength });
  if (spec.thickness > LIMITS.maxThickness) err('tooThick', { v: spec.thickness, max: LIMITS.maxThickness });
  if (spec.thickness < LIMITS.minThickness) err('tooThin', { v: spec.thickness, min: LIMITS.minThickness });
  if (!spec.corner && (spec.cornerRadius < LIMITS.minCornerR || spec.cornerRadius > LIMITS.maxCornerR)) err('badCorner', { min: LIMITS.minCornerR, max: LIMITS.maxCornerR });
  if (c.width <= 0 || c.height <= 0 || (c.radius ?? 0) < 0 || (spec.cameraClearance ?? 0) < 0) err('badCamera');
  if (c.left < 0 || c.top < 0 || c.left + c.width > spec.width + 0.01 || c.top + c.height > spec.length + 0.01) err('cameraOff');
  const d = derive(spec), m = spec.magsafe ?? {};
  if (d.mode !== 'none') {
    const r = (d.mode === 'cooler' ? DESIGN.cooler.d : DESIGN.ring.od) / 2;
    if (n(m.left) && n(m.top) && (Math.abs(d.magX) + r > FRAME.HX - 1 || Math.abs(d.magY) + r > FRAME.HY - 1)) err('magsafeOff');
    if (d.mode === 'ring' && d.ringDepth > DESIGN.ring.minDepth + 0.3) warn('ringDeep', { v: (d.ringDepth - DESIGN.ring.minDepth).toFixed(1) });
  }
  if (d.clips && !spec.id) warn('clipButtons');
  return { errors, warnings };
}

// ------------------------------------------------------------------ 2D helpers
function arcSeg(r) { return Math.max(4, Math.ceil(r * 2.2)); }  // ~0.6 mm chords
function rrectPts(x0, x1, y0, y1, r, seg = 12) {
  const pts = [];
  const cs = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of cs) {
    if (r <= 1e-9) { pts.push([cx, cy]); continue; }
    for (let k = 0; k <= seg; k++) { const a = (a0 + 90 * k / seg) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}
function rrect(M, x0, x1, y0, y1, r) { return new M.CrossSection([rrectPts(x0, x1, y0, y1, r, arcSeg(r))]); }
function circle(M, x, y, r, seg = 96) { return M.CrossSection.circle(r, seg).translate([x, y]); }
function norm(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }

/** polygon with per-vertex fillet radii */
function roundedPoly(pts, radii) {
  const out = []; const n = pts.length;
  for (let i = 0; i < n; i++) {
    const r = radii[i]; const p = pts[i];
    if (!r) { out.push(p); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const u = norm([a[0] - p[0], a[1] - p[1]]), v = norm([b[0] - p[0], b[1] - p[1]]);
    const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    const tlen = r / Math.tan(ang / 2);
    const t1 = [p[0] + u[0] * tlen, p[1] + u[1] * tlen], t2 = [p[0] + v[0] * tlen, p[1] + v[1] * tlen];
    const bis = norm([u[0] + v[0], u[1] + v[1]]); const dc = r / Math.sin(ang / 2);
    const c = [p[0] + bis[0] * dc, p[1] + bis[1] * dc];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]), a2 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= 6; k++) { const t = a1 + da * k / 6; out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); }
  }
  return out;
}

function prism(M, cs, za, zb) { return M.Manifold.extrude(cs, zb - za).translate([0, 0, za]); }

/** The phone's outline, as its corner curve mirrored round, or a plain rounded rectangle. */
export function phoneOutlinePts(spec) {
  const W = spec.width / 2, L = spec.length / 2;
  if (!spec.corner) return rrectPts(-W, W, -L, L, spec.cornerRadius, arcSeg(spec.cornerRadius));
  const k = spec.corner, n = k.length, pts = [];
  for (let i = 0; i < n; i++) pts.push([k[i][0], k[i][1]]);                  // top edge to left edge
  for (let i = n - 1; i >= 0; i--) pts.push([k[i][0], -k[i][1]]);            // left edge to bottom edge
  for (let i = 0; i < n; i++) pts.push([-k[i][0], -k[i][1]]);                // bottom edge to right edge
  for (let i = n - 1; i >= 0; i--) pts.push([-k[i][0], k[i][1]]);            // right edge to top edge
  return pts;
}

function pointInPolys(polys, x, y) {
  let ins = false;
  for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i];
    if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) ins = !ins;
  }
  return ins;
}

// ------------------------------------------------------------------ the fixed frame
function buildFrame(M) {
  const F = FRAME, z0 = F.z0, zt = z0 + F.t;
  let door = prism(M, rrect(M, -F.HX, F.HX, -F.HY, F.HY, F.CR), z0, zt);
  // hinge knuckles (profile in x-z, extruded along y)
  {
    const hx = F.hingeX, hz = F.hingeZ, kr = F.knuckleR, s45 = Math.SQRT1_2;
    const tpx = hx - kr * s45, tpz = hz - kr * s45, x45 = tpx + (tpz - z0);
    const prof = [[x45, z0], [-38.0 - DX, z0], [-38.0 - DX, zt], [hx + kr, zt]];
    const n = 30;                               // 7.5 deg steps (hits the 90 deg top exactly)
    for (let k = 0; k <= n; k++) { const a = (225 * k / n) * Math.PI / 180; prof.push([hx + kr * Math.cos(a), hz + kr * Math.sin(a)]); }
    const sec = new M.CrossSection([prof]);
    for (const [y0, y1] of F.knuckles) {
      // extrude along +Z, then rotate so section y -> world z and extrusion -> world y
      door = door.add(M.Manifold.extrude(sec, y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]));
    }
    // teardrop pin hole along y, point up
    const pr = F.pinR, s2 = Math.SQRT1_2, td = [];
    for (let k = 0; k <= 24; k++) { const a = (135 + 270 * k / 24) * Math.PI / 180; td.push([hx + pr * Math.cos(a), hz + pr * Math.sin(a)]); }
    td.push([hx, hz + pr / s2]);
    door = door.subtract(M.Manifold.extrude(new M.CrossSection([td]), 2 * F.HY + 10).rotate([90, 0, 0]).translate([0, F.HY + 5, 0]));
  }
  // hair-tie latch: base at plate level + raised rim with rounded top edges
  {
    const polys = [roundedPoly(TAB[0], TAB[1])];
    for (const sy of [1, -1]) { const p = roundedPoly(EAR[0].map(([x, y]) => [x, sy * y]), EAR[1]); polys.push(sy < 0 ? p.reverse() : p); }
    door = door.add(prism(M, M.CrossSection.union(polys.map((p) => new M.CrossSection([p]))), z0, zt));
    const rimPolys = [roundedPoly(TAB[0].map(([x, y]) => [Math.max(x, RIM_X), y]), TAB[1])];
    for (const sy of [1, -1]) { const p = roundedPoly(EAR[0].map(([x, y]) => [Math.max(x, RIM_X), sy * y]), EAR[1]); rimPolys.push(sy < 0 ? p.reverse() : p); }
    const rim = M.CrossSection.union(rimPolys.map((p) => new M.CrossSection([p])));
    const ztl = zt + F.latchRise, rr = F.latchRound;
    door = door.add(prism(M, rim, zt - 0.01, ztl - rr));
    const ns = 4;                                   // rounded top edge as 4 stepped insets (sub-layer)
    for (let k = 0; k < ns; k++) {
      const za = ztl - rr + rr * k / ns, zb = ztl - rr + rr * (k + 1) / ns, zm = (za + zb) / 2 - (ztl - rr);
      const inset = rr - Math.sqrt(Math.max(0, rr * rr - zm * zm));
      door = door.add(prism(M, rim.offset(-inset, 'Round'), za - 0.001, zb));
    }
  }
  return door;
}

// ------------------------------------------------------------------ what locates and holds the phone
function anchors(M, spec, d, phone, bay, zFrom) {
  const D = DESIGN;
  const room = SHELL.bayX - d.W - D.gap - SHELL.bayClear;
  const wall = Math.max(D.minWall, Math.min(D.maxWall, room));
  const leg = d.clips ? D.clippedLeg : D.seatedLeg;
  const rise = d.clips ? D.clippedRise : D.seatedRise;
  const band = M.CrossSection.difference(phone.offset(D.gap + wall, 'Round'), phone.offset(D.gap, 'Round'));
  const big = 200, parts = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    // A corner box: from `leg` short of the phone's end, and from `endLeg` in from its side, outward.
    const xa = d.W - D.endLeg, ya = d.L - leg;
    const box = new M.CrossSection([sx * sy > 0
      ? [[sx * xa, sy * ya], [sx * big, sy * ya], [sx * big, sy * big], [sx * xa, sy * big]]
      : [[sx * xa, sy * ya], [sx * xa, sy * big], [sx * big, sy * big], [sx * big, sy * ya]]]);
    parts.push(M.CrossSection.intersection(band, box));
  }
  let plan = M.CrossSection.intersection(M.CrossSection.union(parts), bay);
  // A phone longer than about 163.4 mm leaves the bay too little room for the anchors' end walls, and the bay trims
  // them to slivers no printer can lay down. Drop everything thinner than a wall: the bay's own ends locate the phone.
  // The 0.05 lets the Pro Max phones keep the 0.797 mm end wall the printed door has.
  if (SHELL.bayY - SHELL.bayClear - d.L - D.gap < D.minWall - 0.05) {
    const h = D.minWall / 2 - 0.01;
    plan = plan.offset(-h, 'Round').offset(h, 'Round');
  }
  return prism(M, plan, zFrom, d.zBack + rise);
}

function clips(M, spec, d, zFrom) {
  const C = DESIGN.clip, gap = DESIGN.gap, W = d.W, z = SHELL.screenZ + C.under;
  // The profile for the +x side: u = distance outward from the phone's side.
  const u = (v) => W + v;
  const prof = [
    [u(gap), zFrom], [u(gap + C.wall), zFrom], [u(gap + C.wall), C.top - 0.4], [u(gap + C.wall - 0.4), C.top],
    [u(gap - 0.25), C.top], [u(-C.lip), z + 0.3], [u(-C.lip), z], [u(0), z], [u(gap), z - gap],
  ];
  const sec = new M.CrossSection([prof]);
  // On a phone longer than about 164 mm the clip's outer end would run under the screen shelves, so it stops short.
  const yOut = Math.min(d.L - C.from, SHELL.shelfY - C.shelfClear), yIn = d.L - C.to, len = yOut - yIn;
  let out = null;
  for (const sy of [1, -1]) {
    const yMid = sy * (yOut + yIn) / 2;
    const one = M.Manifold.extrude(sec, len).rotate([90, 0, 0]).translate([0, yMid + len / 2, 0]);
    for (const m of [one, one.mirror([1, 0, 0])]) out = out ? out.add(m) : m;
  }
  return out;
}

// ------------------------------------------------------------------ the dot field
export function dotLayout(M, d, phone, opening) {
  const K = DESIGN.dots, F = FRAME;
  let field = M.CrossSection.intersection(phone.offset(-K.inset, 'Round'), rrect(M, -F.HX + K.clearEdge, F.HX - K.clearEdge, -F.HY + K.clearEdge, F.HY - K.clearEdge, F.CR - K.clearEdge));
  field = M.CrossSection.difference(field, opening.offset(K.clearCamera, 'Round'));
  if (d.mode === 'ring') {
    const ring = M.CrossSection.difference(circle(M, d.magX, d.magY, DESIGN.ring.solid1, 160), circle(M, d.magX, d.magY, DESIGN.ring.solid0, 160));
    field = M.CrossSection.difference(field, ring);
  } else if (d.mode === 'cooler') {
    field = M.CrossSection.difference(field, circle(M, d.magX, d.magY, DESIGN.cooler.d / 2 + DESIGN.cooler.solid, 160));
  }
  // Whole holes only: a hole either fits or it isn't there, so the field never ends in a row of cut-off dots.
  const inner = field.offset(-(K.fade + K.big / 2), 'Round').toPolygons();
  const outer = field.offset(-K.small / 2, 'Round').toPolygons();
  const big = [], small = [];
  const rowH = K.pitch * Math.sqrt(3) / 2, rows = Math.ceil(F.HY / rowH), cols = Math.ceil(F.HX / K.pitch) + 1;
  for (let j = -rows; j <= rows; j++) for (let i = -cols; i <= cols; i++) {
    const x = (i + (j % 2 ? 0.5 : 0)) * K.pitch, y = j * rowH;
    if (pointInPolys(inner, x, y)) big.push([x, y]);
    else if (pointInPolys(outer, x, y)) small.push([x, y]);
  }
  return { big, small };
}

// ------------------------------------------------------------------ build
export function buildDoor(M, spec) {
  const F = FRAME, D = DESIGN, d = derive(spec);
  const z0 = F.z0, zt = z0 + F.t, zb = d.zBack;
  const phone = new M.CrossSection([phoneOutlinePts(spec)]);
  const bay = rrect(M, -SHELL.bayX, SHELL.bayX, -SHELL.bayY, SHELL.bayY, SHELL.bayR).offset(-SHELL.bayClear, 'Round');
  let door = buildFrame(M);
  const zFrom = Math.min(zt, zb) - 0.01;

  // The surface the phone's back rests on. It always lands the screen on the shell's screen plane.
  if (zb > zt + 1e-6) door = door.add(prism(M, bay, zt - 0.01, zb));
  door = door.add(anchors(M, spec, d, phone, bay, Math.max(zt, zb) - 0.01));
  if (d.clips) door = door.add(clips(M, spec, d, Math.max(zt, zb) - 0.01));
  if (zb < zt - 1e-6) door = door.subtract(prism(M, phone.offset(0.3, 'Round'), zb, zt + 0.01));

  // Camera opening, cut through everything.
  const [wx0, wx1, wy0, wy1, wr] = d.window;
  const opening = rrect(M, wx0, wx1, wy0, wy1, wr);
  door = door.subtract(prism(M, opening, z0 - 1, 40));

  // MagSafe. A groove rather than a round recess: the door prints outer face down, so a full recess would leave its
  // ceiling bridging 58 mm. Everything inside the groove sits on the plate from the first layer.
  if (d.mode === 'ring') {
    const ring = M.CrossSection.difference(circle(M, d.magX, d.magY, D.ring.od / 2, 200), circle(M, d.magX, d.magY, D.ring.id / 2, 200));
    door = door.subtract(prism(M, ring, z0 - 0.01, z0 + d.ringDepth));
  } else if (d.mode === 'cooler') {
    door = door.subtract(prism(M, circle(M, d.magX, d.magY, D.cooler.d / 2, 200), z0 - 1, zb + 1));
  }

  // Dots, in two sizes so the field fades out at its edges.
  const holes = dotLayout(M, d, phone, opening);
  const dotCS = (pts, dia) => {
    const c = M.CrossSection.circle(dia / 2, 18);
    return M.CrossSection.compose(pts.map(([x, y]) => c.translate([x, y])));
  };
  const zDots = Math.max(zb, zt) + 0.5;
  if (holes.big.length) door = door.subtract(prism(M, dotCS(holes.big, D.dots.big), z0 - 1, zDots));
  if (holes.small.length) door = door.subtract(prism(M, dotCS(holes.small, D.dots.small), z0 - 1, zDots));

  // To print orientation: outer face on the bed (z = 0).
  door = door.translate([0, 0, -z0]);
  return { door, derived: d, holes: holes.big.length + holes.small.length };
}
