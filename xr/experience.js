// wemiller.com /xr/ — the Experience area: work history as a timeline you stand in front of.
//
//   skills constellation        (curved chart overhead; select to read the lists large)
//   job / education panels      (select one to expand it; its points page one at a time)
//   ─────── year rail ───────   (each job's span is marked on it; busy years are wider)
//   project icons by year       (select one for the app sheet or a short description)
//
// Data: /content/resume.json and /content/projects.json. Nothing is copied into this folder.
import { COL, FONT } from './ui.js';
import { tr, site, monthYear } from './i18n.js';

const ym = (s) => { const m = /^(\d{1,2})\/(\d{4})$/.exec(String(s || '')); return m ? { y: +m[2], m: +m[1] } : null; };
const nice = (s) => { const d = ym(s); return d ? monthYear(d.y, d.m) : String(s || ''); };
const range = (a, b) => tr('xp.range', { a: nice(a), b: nice(b) });

export function buildExperience(ctx, resume, projects, appsById) {
  const { THREE, ui, R, EYE, open } = ctx;
  const group = new THREE.Group();
  const targets = [], items = [];
  const HALF = 0.66;                               // the area spans -HALF..HALF radians
  const jobs = (resume && resume.experience) || [];
  const edu = (resume && resume.education) || [];
  const skills = (resume && resume.skills) || [];
  projects = projects || [];

  // ---- time axis: one column per year, more for years with many projects
  const byYear = {};
  let minY = 9999, maxY = 0;
  const see = (y) => { if (y) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); } };
  for (const p of projects) { const y = +String(p.date || '').slice(0, 4); if (y) { (byYear[y] = byYear[y] || []).push(p); see(y); } }
  for (const e of jobs.concat(edu)) { const a = ym(e.start), b = ym(e.end); see(a && a.y); see(b && b.y); }
  if (maxY < minY) { minY = maxY = new Date().getFullYear(); }
  const ROWS = 4, colStart = {}, colCount = {};
  let total = 0;
  for (let y = minY; y <= maxY; y++) {
    colStart[y] = total;
    colCount[y] = Math.max(1, Math.ceil(((byYear[y] || []).length) / ROWS));
    total += colCount[y];
  }
  const cw = (HALF * 2) / total;
  const colTheta = (c) => -HALF + (c + 0.5) * cw;
  const dateTheta = (s, end) => {
    const d = ym(s);
    if (!d) return end ? HALF : -HALF;
    const y = Math.max(minY, Math.min(maxY, d.y));
    return -HALF + (colStart[y] + ((d.m - (end ? 0 : 1)) / 12) * colCount[y]) * cw;
  };

  // ---- rail and year labels
  const RAIL_Y = EYE - 0.2;
  group.add(ui.curvedPanel(null, -HALF, HALF, RAIL_Y, 0.008, R, { color: COL.edge, transparent: false, depthWrite: true }));
  {
    const W = 2048, H = 72, { ctx: c, tex } = ui.canvasTexture(W, H);
    c.fillStyle = COL.soft; c.strokeStyle = COL.edge; c.lineWidth = 3;
    c.font = '600 32px ' + FONT; c.textBaseline = 'middle'; c.textAlign = 'left';
    for (let y = minY; y <= maxY; y++) {
      const x = (colStart[y] / total) * W;
      c.beginPath(); c.moveTo(x + 2, 0); c.lineTo(x + 2, 22); c.stroke();
      c.fillText(String(y), x + 10, 46, (colCount[y] / total) * W - 14);
    }
    tex.needsUpdate = true;
    group.add(ui.curvedPanel(tex, -HALF, HALF, RAIL_Y - 0.06, (HALF * 2 * R * H) / W, R));
  }

  // ---- job and education panels
  const entries = jobs.map((j) => ({
    kind: 'text', title: j.role || '', sub: j.company || '', start: j.start, end: j.end,
    meta: [range(j.start, j.end), j.place, j.field].filter(Boolean).join('  ·  '),
    pages: (j.bullets && j.bullets.length ? j.bullets : ['']).slice(), pageWord: 'point', color: COL.accent,
  })).concat(edu.map((e) => ({
    kind: 'text', title: e.degree || tr('xp.education'), sub: e.school || '', start: e.start, end: e.end,
    meta: range(e.start, e.end), pages: [e.detail || ''], pageWord: 'point', color: COL.green,
  })));
  entries.sort((a, b) => { const x = ym(a.start) || { y: 0, m: 0 }, y = ym(b.start) || { y: 0, m: 0 }; return x.y - y.y || x.m - y.m; });
  const PANEL_Y = EYE + 0.3, PW = 0.5, PH = 0.344;
  const tether = [];
  entries.forEach((e, i) => {
    const theta = entries.length > 1 ? -0.52 + (1.04 * i) / (entries.length - 1) : 0;
    e.theta = theta;
    e.label = e.title + ', ' + e.sub + ', ' + range(e.start, e.end);
    const { ctx: c, tex } = ui.canvasTexture(512, 352);
    c.fillStyle = COL.bg2; c.fillRect(0, 0, 512, 352);
    c.fillStyle = e.color; ui.roundRect(c, 28, 22, 72, 8, 4); c.fill();
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = COL.ink; c.font = '700 38px ' + FONT;
    let y = 84;
    ui.wrapLines(c, e.title, 456, 2).forEach((l) => { c.fillText(l, 28, y); y += 44; });
    c.fillStyle = e.color; c.font = '500 28px ' + FONT; y += 6;
    ui.wrapLines(c, e.sub, 456, 2).forEach((l) => { c.fillText(l, 28, y); y += 34; });
    c.fillStyle = COL.soft; c.font = '400 26px ' + FONT;
    const a = ym(e.start), b = ym(e.end);
    c.fillText((a ? a.y : '') + ' – ' + (b ? b.y : ''), 28, 322);
    c.textAlign = 'right'; c.fillText(e.pages.length > 1 ? tr('xp.points', { n: e.pages.length }) : tr('home.open'), 484, 322);
    tex.needsUpdate = true;
    const tile = ui.makeTile(COL.bg2, e.label, () => open(e, theta));
    tile.size(PW, PH); tile.setMap(tex);
    ui.place(tile.group, theta, PANEL_Y, R);
    group.add(tile.group);
    targets.push(tile.face); e.face = tile.face;

    // its span on the rail, and a line from the panel down to it
    const ta = dateTheta(e.start, false), tb = Math.max(dateTheta(e.end, true), ta + 0.01);
    group.add(ui.curvedPanel(null, ta, tb, RAIL_Y + (e.color === COL.green ? 0.03 : 0), 0.026, R - 0.004, { color: e.color, transparent: false, depthWrite: true }));
    const tm = (ta + tb) / 2;
    tether.push(R * Math.sin(theta), PANEL_Y - PH / 2 - 0.012, -R * Math.cos(theta), (R - 0.004) * Math.sin(tm), RAIL_Y + 0.016, -(R - 0.004) * Math.cos(tm));
  });
  if (tether.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tether), 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.edge })));
  }
  for (let i = entries.length - 1; i >= 0; i--) items.push(entries[i]);       // newest first for the Tab order

  // ---- skills constellation
  if (skills.length) {
    const W = 2048, H = 496, { ctx: c, tex } = ui.canvasTexture(W, H);
    const cols = skills.map((g) => Math.max(1, Math.ceil(g.items.length / 5)));
    const allCols = cols.reduce((a, b) => a + b, 0), gap = 44, colW = (W - gap * (skills.length + 1)) / allCols;
    let x0 = gap, seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
    skills.forEach((g, gi) => {
      const gw = cols[gi] * colW, pts = [];
      g.items.forEach((name, k) => {
        const col = Math.floor(k / 5), row = k % 5;
        pts.push([x0 + (col + 0.5) * colW + rnd() * colW * 0.3, 104 + row * 80 + rnd() * 18, name]);
      });
      c.strokeStyle = 'rgba(108,182,255,.38)'; c.lineWidth = 2;
      c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = COL.accent; c.font = '600 28px ' + FONT;
      c.fillText(String(g.years || '').replace(/\s*-\s*/, ' – ').toLowerCase(), x0 + gw / 2, 40);
      pts.forEach((p) => {
        c.shadowColor = COL.accent; c.shadowBlur = 16;
        c.fillStyle = COL.ink; c.beginPath(); c.arc(p[0], p[1], 8 - gi * 1.6, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = gi === 0 ? COL.ink : COL.soft; c.font = (gi === 0 ? '600' : '500') + ' 23px ' + FONT;
        ui.wrapLines(c, p[2], colW - 8, 2).forEach((l, n) => c.fillText(l, p[0], p[1] + 30 + n * 24));
      });
      x0 += gw + gap;
    });
    tex.needsUpdate = true;
    const mesh = ui.curvedPanel(tex, -0.64, 0.64, EYE + 0.86, (1.28 * R * H) / W, R);
    const item = {
      kind: 'text', label: tr('xp.skills.label'), title: tr('xp.skills'), sub: tr('xp.skills.sub'), meta: '', theta: 0, face: mesh,
      pages: skills.map((g) => String(g.years || '').replace(/\s*-\s*/, ' – ') + ':  ' + g.items.join('  ·  ')), pageWord: 'group', color: COL.accent,
    };
    mesh.userData = {
      label: item.label, enabled: true, noPoke: true,
      setHover(on) { mesh.material.color.set(on ? '#bfe0ff' : '#ffffff'); },
      select() { open(item, 0); },
    };
    group.add(mesh); targets.push(mesh); items.push(item);
  }

  // ---- project icons, by year, under the rail
  const ICON = 0.115, PITCH = 0.13;
  const sorted = projects.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const placed = {};
  for (const p of sorted) {
    const y = +String(p.date || '').slice(0, 4);
    if (!y) continue;
    const k = placed[y] = (placed[y] || 0) + 1, n = k - 1;
    const theta = colTheta(colStart[y] + Math.floor(n / ROWS));
    const app = appsById[p.id];
    // the site's own translations of its project list, where it has them
    const when = site('tl.' + p.id + '.date', p.dateLabel || String(y)), tagline = site('ft.' + p.id, p.tagline || '');
    const item = app || {
      kind: 'text', title: p.title || '', sub: when, meta: (p.stack || []).slice(0, 4).join('  ·  '),
      pages: [site('tl.' + p.id + '.desc', p.description || p.tagline || tr('xp.earlier'))], pageWord: 'page', color: COL.accent,
    };
    const label = (p.title || '') + ', ' + when + (tagline ? ': ' + tagline : '');
    const mesh = new THREE.Mesh(ui.roundedGeo(ICON, ICON, ICON * 0.225), new THREE.MeshBasicMaterial({ color: '#16223a' }));
    mesh.scale.set(ICON, ICON, 1);
    ui.place(mesh, theta, RAIL_Y - 0.16 - (n % ROWS) * PITCH, R);
    mesh.userData = {
      label, enabled: true, image: null,
      setHover(on) { mesh.scale.set(on ? ICON * 1.3 : ICON, on ? ICON * 1.3 : ICON, 1); },
      select() { open(item, theta, mesh.userData.image); },
    };
    const url = app ? app.icon : '/projects/' + p.icon;
    ui.loadImage(url).then((im) => {
      mesh.userData.image = im;
      mesh.material.map = ui.imageTexture(im); mesh.material.color.set('#ffffff'); mesh.material.needsUpdate = true;
      ctx.invalidate();
    }).catch(() => {});
    group.add(mesh); targets.push(mesh);
    items.push({ ref: item, label, theta, face: mesh, y: mesh.position.y });
  }

  return { group, targets, items, count: entries.length };
}
