#!/usr/bin/env node
/* Open Graph posters for the portfolio's own pages (1200 x 630 JPEG, in /og/).
 *
 *   node scripts/build-og.mjs            # draw the ones whose inputs changed
 *   node scripts/build-og.mjs --force    # draw them all again
 *   node scripts/build-og.mjs --check    # exit 1 if any poster is missing or out of date
 *
 * Each poster is a small HTML page (the site's own colours, a photograph or the contour map
 * behind it, the handwriting font for the signature) photographed by headless Chrome and saved
 * as JPEG with sharp. A poster is only redrawn when its recipe, its photograph or this file
 * changes, so CI commits nothing when nothing changed. The app posters under /apps are made
 * separately by scripts/generate-posters.js.
 *
 * To add one: add a line to POSTERS, run this, and point the page's og:image at /og/<id>.jpg. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => path.join(root, p);
const site = JSON.parse(fs.readFileSync(at('content/site.json'), 'utf8'));
const host = site.origin.replace(/^https?:\/\//, '');
const W = 1200, H = 630;

// id → what it says and what is behind it: a photograph, or a drawing made here ('map' is the
// Work view's contour map, blue or green; 'jigsaw', 'vr', 'speed' and 'space' are below).
const POSTERS = [
  { id: 'home', title: site.name, sub: 'Senior software engineer. Photographer. Building what’s missing.', bg: 'slides/bmp-21.webp' },
  { id: 'work', title: site.name, sub: 'Senior Software Engineer: real-time data platforms, infrastructure and 25+ shipped apps.', bg: 'map' },
  { id: 'resume', title: 'Resume', sub: `${site.name}, Senior Software Engineer`, bg: 'map' },
  { id: 'photography', title: 'Photography', sub: 'Dark skies, old forests and a very good dog.', bg: 'slides/bmp-17.webp' },
  { id: 'luma', title: 'Luma', sub: 'Trail scout, campfire supervisor, professional fluff.', bg: 'slides/bmp-68.webp' },
  { id: 'panos', title: 'Panoramas', sub: 'Step inside the photograph and look around.', bg: 'slides/bmp-73.webp' },
  { id: 'puzzles', title: 'Puzzles', sub: 'Any photograph here, cut into a jigsaw.', bg: 'jigsaw', photo: 'slides/bmp-26.webp' },
  { id: 'xr', title: 'In VR', sub: 'The gallery, the panoramas and the apps, around you.', bg: 'vr', photos: ['slides/bmp-17.webp', 'slides/bmp-9.webp', 'slides/bmp-68.webp'] },
  { id: 'speedtest', title: 'Speed test', sub: 'How fast is this connection, really?', bg: 'speed' },
  { id: 'privacy', title: 'Privacy', sub: 'What this site and these apps do with your data.', bg: 'map', tone: 'green' },
  { id: 'terms', title: 'Terms', sub: 'The plain terms for this site and these apps.', bg: 'map', tone: 'green' },
  { id: '404', title: 'Not found', sub: 'That page drifted off somewhere.', bg: 'space' },
];

/* ---------- the contour map: the same terrain as the Work view's hero ---------- */
function contours(w, h, cell = 6, ox = 40, oy = 12, ink = '#6cb6ff') {
  const GX = [], GY = [];
  for (let n = 0; n < 256; n++) { const a = (n * 0.61803398875 % 1) * 6.2831853; GX[n] = Math.cos(a); GY[n] = Math.sin(a); }
  const corner = (ix, iy, dx, dy) => { let v = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); v = (v ^ (v >>> 16)) & 255; return GX[v] * dx + GY[v] * dy; };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = corner(ix, iy, fx, fy), b = corner(ix + 1, iy, fx - 1, fy), c = corner(ix, iy + 1, fx, fy - 1), d = corner(ix + 1, iy + 1, fx - 1, fy - 1);
    return a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v;
  };
  const height = (gx, gy) => { const x = gx * 0.0125, y = gy * 0.0125; return noise(x, y) + 0.34 * noise(x * 1.9 + 17.3, y * 1.9 + 31.7); };
  const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1, f = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = height(i + ox, j + oy);
  const r = (v) => Math.round(v * 10) / 10;
  let thin = '', bold = '';
  for (let k = -24; k <= 24; k++) {
    const lv = k * 0.06 + 0.01; let d = '';
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i + 1], e = f[(j + 1) * nx + i];
      const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (e > lv ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = i * cell, y = j * cell;
      const T = `${r(x + cell * (lv - a) / (b - a))} ${r(y)}`, R = `${r(x + cell)} ${r(y + cell * (lv - b) / (c - b))}`;
      const Bm = `${r(x + cell * (lv - e) / (c - e))} ${r(y + cell)}`, L = `${r(x)} ${r(y + cell * (lv - a) / (e - a))}`;
      const seg = (p, q) => { d += `M${p}L${q}`; };
      if (code === 1 || code === 14) seg(L, Bm); else if (code === 2 || code === 13) seg(Bm, R); else if (code === 3 || code === 12) seg(L, R);
      else if (code === 4 || code === 11) seg(T, R); else if (code === 6 || code === 9) seg(T, Bm); else if (code === 7 || code === 8) seg(L, T);
      else if (code === 5) { seg(L, T); seg(Bm, R); } else if (code === 10) { seg(L, Bm); seg(T, R); }
    }
    if (k % 5 === 0) bold += d; else thin += d;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="${ink}" stroke-linecap="round"><path d="${thin}" stroke-width="1" opacity=".3"/><path d="${bold}" stroke-width="1.6" opacity=".6"/></svg>`;
}


/* ---------- drawings for the pages that are not about a photograph or the map ---------- */
// A little determinism: the same poster every time, on every machine.
const rng = (seed) => () => { seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9 | 0; return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296; };
const stars = (n, seed, w = W, h = H) => { const r = rng(seed); let o = ''; for (let i = 0; i < n; i++) { const s = r(); o += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(0.5 + s * 1.4).toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`; } return o; };

// Puzzles: the photograph cut into jigsaw pieces, with one lifted out of place.
function jigsaw(photo) {
  const cols = 6, rows = 3, cw = W / cols, ch = H / rows, r = rng(7);
  const vdir = [], hdir = [];
  for (let j = 0; j < rows; j++) { vdir[j] = []; for (let i = 0; i <= cols; i++) vdir[j][i] = r() < 0.5 ? 1 : -1; }
  for (let j = 0; j <= rows; j++) { hdir[j] = []; for (let i = 0; i < cols; i++) hdir[j][i] = r() < 0.5 ? 1 : -1; }
  const f = (v) => Math.round(v * 10) / 10;
  // one side of a piece from a to b; d = 0 is a straight outer edge, +1 / -1 puts the knob on either side
  const edge = (ax, ay, bx, by, d) => {
    if (!d) return `L${f(bx)} ${f(by)}`;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    const P = (t, n) => `${f(ax + dx * t + nx * n * len * d)} ${f(ay + dy * t + ny * n * len * d)}`;
    return `L${P(0.36, 0)}C${P(0.45, 0)} ${P(0.29, 0.27)} ${P(0.5, 0.27)}C${P(0.71, 0.27)} ${P(0.55, 0)} ${P(0.64, 0)}L${f(bx)} ${f(by)}`;
  };
  const piece = (i, j) => {
    const x = i * cw, y = j * ch;
    return `M${f(x)} ${f(y)}` + edge(x, y, x + cw, y, j ? hdir[j][i] : 0) + edge(x + cw, y, x + cw, y + ch, i + 1 < cols ? vdir[j][i + 1] : 0)
      + edge(x + cw, y + ch, x, y + ch, j + 1 < rows ? -hdir[j + 1][i] : 0) + edge(x, y + ch, x, y, i ? -vdir[j][i] : 0) + 'Z';
  };
  let cuts = '';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cuts += piece(i, j);
  const lifted = [[3, 0, 38, 26, 8], [5, 1, 34, 30, -7]];
  const img = (extra = '') => `<image href="file://${at(photo)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"${extra}/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${lifted.map(([i, j], n) => `<clipPath id="pc${n}"><path d="${piece(i, j)}"/></clipPath>`).join('')}
    <filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".6"/></filter></defs>
    ${img()}
    ${lifted.map(([i, j]) => `<path d="${piece(i, j)}" fill="#070b14"/>`).join('')}
    <path d="${cuts}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="1.6" stroke-linejoin="round"/>
    ${lifted.map(([i, j, dx, dy, rot], n) => `<g filter="url(#lift)" transform="translate(${dx} ${dy}) rotate(${rot} ${(i + 0.5) * cw} ${(j + 0.5) * ch})"><g clip-path="url(#pc${n})">${img()}</g><path d="${piece(i, j)}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/></g>`).join('')}
  </svg>`;
}

// VR: photographs as panels standing in a curve around you, under a few stars.
function vrScene(photos) {
  const panel = (src, cls) => `<div class="vp ${cls}" style="background-image:url('file://${at(src)}')"></div>`;
  return `<style>
    .vrs { position: absolute; inset: 0; background: radial-gradient(80% 90% at 70% 40%, #1b2f66 0%, #0b1330 50%, #05080f 100%); perspective: 1100px; perspective-origin: 68% 46%; }
    .vp { position: absolute; top: 132px; width: 330px; height: 236px; border-radius: 22px; background-size: cover; background-position: center; box-shadow: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1.5px rgba(255,255,255,.28) inset; }
    .vp.a { left: 468px; transform: rotateY(38deg) translateZ(-60px); }
    .vp.b { left: 720px; top: 118px; transform: translateZ(-150px) scale(1.06); }
    .vp.c { left: 972px; transform: rotateY(-38deg) translateZ(-60px); }
    .floor { position: absolute; left: 380px; top: 400px; width: 900px; height: 360px; border-radius: 50%; border: 2px solid rgba(108,182,255,.5); transform: rotateX(74deg); box-shadow: 0 0 0 46px rgba(108,182,255,.07), 0 0 0 110px rgba(95,211,176,.05); }
    .vrs svg { position: absolute; inset: 0; }
    .vfade { position: absolute; inset: 0; background: linear-gradient(to right, #05080f 0%, rgba(5,8,15,.86) 30%, rgba(5,8,15,0) 62%), linear-gradient(to top, rgba(5,8,15,.9) 0%, rgba(5,8,15,0) 46%); }
  </style><div class="vrs"><svg viewBox="0 0 ${W} ${H}">${stars(150, 21)}</svg><div class="floor"></div>${panel(photos[0], 'a')}${panel(photos[1], 'b')}${panel(photos[2], 'c')}<div class="vfade"></div></div>`;
}

// Speed test: a gauge with the needle well round, and light streaking past.
function speedArt() {
  const cx = 880, cy = 470, R = 300, a0 = 200, a1 = 340, to = 312, r = rng(3);
  const pt = (deg, rad) => `${(cx + rad * Math.cos(deg * Math.PI / 180)).toFixed(1)} ${(cy + rad * Math.sin(deg * Math.PI / 180)).toFixed(1)}`;
  const arc = (from, till, rad) => `M${pt(from, rad)}A${rad} ${rad} 0 ${till - from > 180 ? 1 : 0} 1 ${pt(till, rad)}`;
  let ticks = '', streaks = '';
  for (let d = a0; d <= a1; d += 5) ticks += `<path d="M${pt(d, R - (d % 20 === 0 ? 46 : 30))}L${pt(d, R - 16)}" stroke="#fff" stroke-opacity="${d <= to ? 0.75 : 0.28}" stroke-width="${d % 20 === 0 ? 3 : 1.6}" stroke-linecap="round"/>`;
  for (let i = 0; i < 26; i++) { const y = 30 + r() * 570, x = r() * 900, len = 80 + r() * 380; streaks += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}h${len.toFixed(0)}" stroke="${i % 3 ? '#8fc4ff' : '#9fe3d0'}" stroke-width="${(1 + r() * 2.4).toFixed(1)}" stroke-linecap="round" opacity="${(0.08 + r() * 0.26).toFixed(2)}"/>`; }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>
    <radialGradient id="sbg" cx=".75" cy=".7" r=".9"><stop offset="0" stop-color="#143a6e"/><stop offset=".5" stop-color="#0a1730"/><stop offset="1" stop-color="#05080f"/></radialGradient>
    <linearGradient id="st"><stop offset="0" stop-color="#6cb6ff" stop-opacity="0"/><stop offset="1" stop-color="#9fe3d0"/></linearGradient>
    <linearGradient id="sg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6cb6ff"/><stop offset="1" stop-color="#5fd3b0"/></linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <rect width="${W}" height="${H}" fill="url(#sbg)"/>${streaks}
    <path d="${arc(a0, a1, R)}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="26" stroke-linecap="round"/>
    <path d="${arc(a0, to, R)}" fill="none" stroke="url(#sg)" stroke-width="26" stroke-linecap="round" filter="url(#glow)" opacity=".8"/>
    <path d="${arc(a0, to, R)}" fill="none" stroke="url(#sg)" stroke-width="26" stroke-linecap="round"/>
    ${ticks}
    <path d="M${pt(to + 90, 13)}L${pt(to, R - 62)}L${pt(to - 90, 13)}Z" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="24" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="9" fill="#0a1730"/>
  </svg>`;
}

// 404: open space, a ringed planet, and a path that wanders off the edge.
function spaceArt() {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>
    <radialGradient id="pbg" cx=".7" cy=".3" r="1"><stop offset="0" stop-color="#1a2456"/><stop offset=".55" stop-color="#0a1028"/><stop offset="1" stop-color="#05080f"/></radialGradient>
    <radialGradient id="pl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9fd0ff"/><stop offset=".55" stop-color="#3b6fd1"/><stop offset="1" stop-color="#17275e"/></radialGradient>
    <linearGradient id="rg"><stop offset="0" stop-color="#5fd3b0" stop-opacity=".1"/><stop offset=".5" stop-color="#9fe3d0"/><stop offset="1" stop-color="#5fd3b0" stop-opacity=".1"/></linearGradient>
    <clipPath id="front"><rect x="0" y="232" width="${W}" height="400"/></clipPath></defs>
    <rect width="${W}" height="${H}" fill="url(#pbg)"/>${stars(230, 404)}
    <text x="1130" y="596" text-anchor="end" font-family="ui-serif, 'New York', Georgia, 'Noto Serif', serif" font-size="330" font-weight="500" fill="none" stroke="#6cb6ff" stroke-opacity=".16" stroke-width="2.5">404</text>
    <path d="M470 150C560 215 640 215 700 150S760 20 800 -20" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-dasharray="3 13" stroke-linecap="round"/>
    <g transform="translate(452 138) rotate(-28) scale(1.5)"><rect x="-13" y="-4" width="26" height="30" rx="9" fill="#e9eef8"/><circle cy="-13" r="15" fill="#e9eef8"/><rect x="-10" y="-19" width="20" height="12" rx="6" fill="#16224d"/><rect x="-22" y="0" width="9" height="20" rx="4.5" fill="#cfd8ea"/><rect x="13" y="0" width="9" height="20" rx="4.5" fill="#cfd8ea"/></g>
    <g transform="translate(905 232) rotate(-16)"><ellipse rx="210" ry="46" fill="none" stroke="url(#rg)" stroke-width="12"/></g>
    <circle cx="905" cy="232" r="118" fill="url(#pl)"/>
    <g clip-path="url(#front)"><g transform="translate(905 232) rotate(-16)"><ellipse rx="210" ry="46" fill="none" stroke="url(#rg)" stroke-width="12"/></g></g>
  </svg>`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const DRAWN = ['map', 'jigsaw', 'vr', 'speed', 'space'];
const page = (p, n) => `<!doctype html><html lang="en"><meta charset="utf-8"><style>
  @font-face { font-family: Hand; src: url("file://${at('blaine.ttf')}"); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #05080f; color: #fff; -webkit-font-smoothing: antialiased; }
  body { position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif; }
  .bg { position: absolute; inset: 0; ${p.bg === 'map' ? `background: radial-gradient(90% 120% at 82% 8%, ${p.tone === 'green' ? '#12503f 0%, #0a211c 46%' : '#173a73 0%, #0a1730 46%'}, #05080f 100%);` : DRAWN.includes(p.bg) ? 'background: #05080f;' : `background: url("file://${at(p.bg)}") center / cover;`} }
  .bg svg { position: absolute; inset: 0; }
  .bg.map svg { -webkit-mask-image: radial-gradient(95% 110% at 85% 10%, #000 0%, rgba(0,0,0,.6) 45%, transparent 82%); }
  .shade { position: absolute; inset: 0; background: ${p.bg === 'map' || p.bg === 'vr' ? 'none' : p.bg === 'speed' || p.bg === 'space' ? 'linear-gradient(to right, rgba(5,8,15,.82) 0%, rgba(5,8,15,.5) 36%, rgba(5,8,15,0) 62%)' : 'linear-gradient(to top, rgba(4,7,13,.92) 0%, rgba(4,7,13,.62) 38%, rgba(4,7,13,.12) 72%), linear-gradient(to right, rgba(4,7,13,.5), transparent 60%)'}; }
  .rule { position: absolute; left: 72px; bottom: 72px; width: 5px; height: ${p.sub ? 232 : 170}px; border-radius: 3px; background: linear-gradient(${p.tone === 'green' ? '#5fd3b0, #8fe0a8' : '#6cb6ff, #5fd3b0'}); }
  .copy { position: absolute; left: 102px; right: 96px; bottom: 66px; }
  .eye { font: 600 22px/1 ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; letter-spacing: .16em; text-transform: uppercase; color: ${p.tone === 'green' ? '#9fe3d0' : '#9cc8ff'}; }
  h1 { margin-top: 22px; font: 500 ${p.title.length > 12 ? 104 : 124}px/1 ui-serif, "New York", "Iowan Old Style", Palatino, Georgia, "Noto Serif", "Liberation Serif", "DejaVu Serif", serif; letter-spacing: -.025em; }
  p { margin-top: 22px; max-width: 880px; font-size: 34px; line-height: 1.3; color: rgba(255,255,255,.86); text-wrap: balance; }
  .sign { position: absolute; right: 64px; top: 46px; font: 400 54px/1 Hand, cursive; color: rgba(255,255,255,.9); transform: rotate(-3deg); }
</style><body>
  <div class="bg ${p.bg === 'map' ? 'map' : ''}">${p.bg === 'map' ? contours(W, H, 6, 40 + n * 37, 12 + n * 23, p.tone === 'green' ? '#5fd3b0' : '#6cb6ff') : p.bg === 'jigsaw' ? jigsaw(p.photo) : p.bg === 'vr' ? vrScene(p.photos) : p.bg === 'speed' ? speedArt() : p.bg === 'space' ? spaceArt() : ''}</div><div class="shade"></div>
  ${p.title === site.name ? '' : `<div class="sign">${esc(site.name)}</div>`}
  <div class="rule"></div>
  <div class="copy"><div class="eye">${esc(host)}</div><h1>${esc(p.title)}</h1>${p.sub ? `<p>${esc(p.sub)}</p>` : ''}</div>
</body></html>`;

const CHROMES = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', process.env.CHROME_PATH].filter(Boolean);
const chrome = CHROMES.find((p) => fs.existsSync(p));
const force = process.argv.includes('--force'), check = process.argv.includes('--check');
const self = fs.readFileSync(fileURLToPath(import.meta.url));
const hashPath = at('og/.hashes.json');
const hashes = fs.existsSync(hashPath) ? JSON.parse(fs.readFileSync(hashPath, 'utf8')) : {};
const stale = [];
POSTERS.forEach((p, n) => {
  const h = crypto.createHash('sha1').update(self).update(JSON.stringify(p)).update(Buffer.concat([p.bg, p.photo, ...(p.photos || [])].filter((f) => f && /\./.test(f)).map((f) => fs.readFileSync(at(f))))).update(fs.readFileSync(at('blaine.ttf'))).digest('hex').slice(0, 12);
  p.hash = h; p.n = n;
  if (force || hashes[p.id] !== h || !fs.existsSync(at(`og/${p.id}.jpg`))) stale.push(p);
});
if (check) {
  if (stale.length) { console.error(`Open Graph posters out of date: ${stale.map((p) => p.id).join(', ')}. Run node scripts/build-og.mjs`); process.exit(1); }
  console.log('Open Graph posters are up to date.'); process.exit(0);
}
if (!stale.length) { console.log('Open Graph posters are up to date.'); process.exit(0); }
if (!chrome) { console.warn(`  ! no Chrome found, so ${stale.length} Open Graph poster(s) were not redrawn (${stale.map((p) => p.id).join(', ')}). Set CHROME_PATH.`); process.exit(0); }

const sharp = createRequire(at('scripts/package.json'))('sharp');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
fs.mkdirSync(at('og'), { recursive: true });
for (const p of stale) {
  const html = path.join(tmp, `${p.id}.html`), png = path.join(tmp, `${p.id}.png`);
  fs.writeFileSync(html, page(p, p.n));
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, '--virtual-time-budget=4000', `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
  await sharp(png).resize(W, H, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toFile(at(`og/${p.id}.jpg`));
  hashes[p.id] = p.hash;
  console.log(`Wrote og/${p.id}.jpg`);
}
fs.writeFileSync(hashPath, JSON.stringify(Object.fromEntries(Object.keys(hashes).filter((k) => POSTERS.some((p) => p.id === k)).sort().map((k) => [k, hashes[k]])), null, 2) + '\n');
