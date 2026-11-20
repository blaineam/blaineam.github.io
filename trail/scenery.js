/* The Trail: what it looks like. The hills, the pines, the camps on the map, the small scene at
 * the top of each stage, the campfire, and Luma. All drawn as inline SVG, coloured by CSS
 * variables so the same drawing is morning, dusk or night (see trail.css: body[data-time]). */
import { t, guide } from './words.js';

const rnd = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const f = (n) => Math.round(n * 10) / 10;

/* ---------- pieces ---------- */
const pine = (x, y, s, cls) => `<path class="${cls}" d="M${f(x)} ${f(y - 30 * s)}l${f(9 * s)} ${f(13 * s)}h${f(-5 * s)}l${f(8 * s)} ${f(11 * s)}h${f(-9 * s)}v${f(6 * s)}h${f(-6 * s)}v${f(-6 * s)}h${f(-9 * s)}l${f(8 * s)} ${f(-11 * s)}h${f(-5 * s)}z"/>`;
function ridge(w, h, base, amp, seed, peak) {
  const r = rnd(seed), a = r() * 6, b = r() * 6; let d = `M0 ${h}L0 ${f(base)}`; const pts = [];
  for (let x = 0; x <= w; x += w / 50) {
    let y = base - amp * (0.55 * Math.sin(x / w * 5 + a) + 0.3 * Math.sin(x / w * 11 + b) + 0.15 * Math.sin(x / w * 23));
    if (peak) y -= peak.h * Math.max(0, 1 - Math.abs(x - peak.x) / peak.w) ** 1.6;
    pts.push([x, y]); d += `L${f(x)} ${f(y)}`;
  }
  return { d: d + `L${w} ${h}Z`, at: (x) => { const i = Math.max(0, Math.min(pts.length - 2, Math.floor(x / (w / 50)))), t = (x - pts[i][0]) / (w / 50); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; } };
}
const stars = (n, w, h, seed) => { const r = rnd(seed); let o = ''; for (let i = 0; i < n; i++) o += `<circle cx="${f(r() * w)}" cy="${f(r() * h)}" r="${f(0.6 + r() * 1.3)}" style="animation-delay:${f(-r() * 6)}s"/>`; return `<g class="tr-stars">${o}</g>`; };
const fireflies = (n, w, h, seed, top) => { const r = rnd(seed); let o = ''; for (let i = 0; i < n; i++) o += `<circle cx="${f(r() * w)}" cy="${f(top + r() * (h - top))}" r="${f(1.6 + r() * 1.4)}" style="animation-delay:${f(-r() * 9)}s; animation-duration:${f(6 + r() * 6)}s"/>`; return `<g class="tr-flies">${o}</g>`; };
const skyDefs = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-1)"/><stop offset="1" style="stop-color:var(--sky-2)"/></linearGradient></defs>`;

/* ---------- the guide ----------
 * The real one: a portrait cut from one of the photographs, worn as a round badge wherever the
 * guide turns up. 'big' is the larger crop. Which dog, and which photographs, comes from words.js
 * (guide.photo, guide.photoBig), read each time something is drawn, never when this file loads. */
export function luma(pose = 'sit') {
  if (pose === 'big') return `<img class="tr-luma tr-luma--big" src="${guide.photoBig}" alt="" width="520" height="510" decoding="async">`;
  return `<img class="tr-luma" src="${guide.photo}" alt="" width="256" height="256" decoding="async">`;
}

/* ---------- a campfire that burns ---------- */
export function campfire(withLuma) {
  return `<svg class="tr-fire" viewBox="0 0 320 150" aria-hidden="true">
    <ellipse class="tr-fire__glow" cx="160" cy="118" rx="150" ry="40"/>
    ${stars(26, 320, 70, 9)}
    <g class="tr-fire__sparks"><circle cx="150" cy="70" r="1.600"/><circle cx="168" cy="60" r="1.300"/><circle cx="160" cy="78" r="1.800"/><circle cx="174" cy="74" r="1.200"/><circle cx="146" cy="58" r="1.200"/></g>
    <path class="tr-fire__f1" d="M160 46c16 20 30 30 26 50-3 14-14 22-26 22s-23-8-26-22c-4-20 10-30 26-50z"/>
    <path class="tr-fire__f2" d="M160 66c10 13 18 20 16 32-2 10-8 16-16 16s-14-6-16-16c-2-12 6-19 16-32z"/>
    <path class="tr-fire__f3" d="M160 86c5 7 9 11 8 17-1 6-4 9-8 9s-7-3-8-9c-1-6 3-10 8-17z"/>
    <g class="tr-fire__logs"><rect x="118" y="112" width="84" height="12" rx="6" transform="rotate(-9 160 118)"/><rect x="118" y="112" width="84" height="12" rx="6" transform="rotate(9 160 118)"/></g>
    ${pine(40, 122, 1.5, 'tr-pine-near')}${pine(70, 126, 1.1, 'tr-pine-near')}${pine(284, 124, 1.6, 'tr-pine-near')}${pine(252, 127, 1, 'tr-pine-near')}
  </svg>`.replace(/(\d)\.(\d)00/g, '$1.$2');
}

/* ---------- the small scene at the top of a stage ---------- */
export function vignette(kind) {
  const W = 800, H = 150, far = ridge(W, H, 96, 22, 11), near = ridge(W, H, 124, 14, 5);
  let pines = ''; const r = rnd(kind.length * 97 + 3);
  for (let i = 0; i < 16; i++) { const x = r() * W; pines += pine(x, near.at(x) + 6, 0.7 + r() * 0.8, 'tr-pine'); }
  const base = `${skyDefs('vsky-' + kind)}<rect width="${W}" height="${H}" fill="url(#vsky-${kind})"/>${stars(46, W, 90, 21)}<circle class="tr-moon" cx="690" cy="34" r="15"/><path class="tr-ridge-3" d="${far.d}"/><path class="tr-ridge-2" d="${near.d}"/>${pines}`;
  let extra = '';
  if (kind === 'fire') return `<div class="stage__scene stage__scene--fire">${campfire()}<span class="stage__luma">${luma()}</span></div>`;
  if (kind === 'bench') extra = `<g transform="translate(330 70)"><path class="tr-wood" d="M0 60V26l44-26 44 26v34z"/><rect class="tr-window" x="32" y="30" width="24" height="20" rx="2"/><rect class="tr-wood-dark" x="-6" y="24" width="100" height="5" rx="2" transform="rotate(-30.500 0 26)" opacity="0"/><path class="tr-wood-dark" d="M-8 28 44-4l52 32-5 5-47-28-47 28z"/><rect class="tr-wood-dark" x="62" y="2" width="8" height="16"/><g class="tr-smoke"><circle cx="66" cy="-6" r="5"/><circle cx="72" cy="-18" r="7"/><circle cx="64" cy="-32" r="9"/></g></g>`;
  else if (kind === 'hut') extra = `<g transform="translate(350 76)"><path class="tr-wood" d="M0 54V22l36-22 36 22v32z"/><rect class="tr-window" x="12" y="26" width="16" height="14" rx="2"/><rect class="tr-wood-dark" x="42" y="26" width="16" height="28" rx="2"/><path class="tr-wood-dark" d="M-8 24 36-5l44 29-5 5-39-25-39 25z"/></g><g class="tr-rain">${Array.from({ length: 30 }, (_, i) => `<path d="M${f(20 + i * 26)} ${f((i * 37) % 80)}l-4 14" style="animation-delay:${f(-(i % 7) * 0.2)}s"/>`).join('')}</g>`;
  else if (kind === 'fork') extra = `<path class="tr-path" d="M400 150C400 120 380 108 330 104M400 150c0-30 22-44 76-48"/><g transform="translate(392 78)"><rect class="tr-wood-dark" x="6" y="0" width="5" height="52"/><path class="tr-wood" d="M11 6h34l8 7-8 7H11z"/><path class="tr-wood" d="M6 26h-34l-8 7 8 7h34z"/></g>`;
  else if (kind === 'peak') extra = `<path class="tr-ridge-1" d="M250 150 400 22l150 128z"/><path class="tr-snow" d="M400 22l30 26-14-4-10 12-12-12-16 6z"/><g transform="translate(400 22)"><rect class="tr-wood-dark" x="-1.500" y="-26" width="3" height="28"/><path class="tr-flag" d="M1.500-26l22 7-22 7z"/></g>`;
  else if (kind === 'cairn') extra = `<g transform="translate(384 58)" class="tr-stone"><ellipse cx="16" cy="60" rx="30" ry="9"/><ellipse cx="16" cy="46" rx="24" ry="8"/><ellipse cx="17" cy="33" rx="18" ry="7"/><ellipse cx="15" cy="22" rx="13" ry="6"/><ellipse cx="16" cy="12" rx="8" ry="5"/></g>`;
  else extra = `<path class="tr-path" d="M-10 150C120 130 200 140 300 122S500 132 620 108s120-10 200-30"/><g transform="translate(120 96)"><rect class="tr-wood-dark" x="12" y="0" width="5" height="46"/><path class="tr-wood" d="M17 4h40l8 8-8 8H17z"/></g>`;
  return `<div class="stage__scene"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${base}${extra}${fireflies(9, W, H, 4, 70)}</svg><span class="stage__luma">${luma('sit')}</span></div>`.replace(/(\d)\.(\d)00/g, '$1.$2');
}

/* ---------- the map: the whole trail, with the camps on it ---------- */
const ICONS = {
  trailhead: '<rect class="tr-wood-dark" x="-2" y="-30" width="4" height="32"/><path class="tr-wood" d="M2-28h22l6 6-6 6H2z"/>',
  workshop: '<path class="tr-wood" d="M-16 2v-16l16-11 16 11V2z"/><path class="tr-wood-dark" d="M-20-13 0-27l20 14-3 3-17-12-17 12z"/><rect class="tr-window" x="-5" y="-11" width="10" height="9" rx="1.500"/>',
  shelter: '<path class="tr-wood" d="M-18 2 0-26 18 2z"/><path class="tr-window" d="M-5 2 0-9 5 2z"/>',
  overlook: '<g class="tr-stone"><ellipse cx="0" cy="-2" rx="14" ry="5"/><ellipse cx="0" cy="-9" rx="10" ry="4"/><ellipse cx="0" cy="-15" rx="7" ry="3.500"/><ellipse cx="0" cy="-20.500" rx="4" ry="2.500"/></g>',
  summit: '<rect class="tr-wood-dark" x="-1.500" y="-34" width="3" height="36"/><path class="tr-flag" d="M1.500-34l20 7-20 7z"/>',
};
export const TRAIL_PATH = 'M70 372C170 384 230 318 318 322S436 352 520 286 640 214 726 216 846 176 904 84';
const TRAIL_PATH_TALL = 'M64 508C160 540 262 528 330 506S470 480 440 432 250 404 160 386 40 346 110 302 300 302 350 277 410 248 430 217';
export const isTall = () => matchMedia('(max-width: 720px)').matches;

/** Draw the trail map into an <svg viewBox="0 0 1000 420">.
 *  camps: [{ id, name, sub, state: 'done' | 'here' | 'open' | 'closed' }] */
export function drawMap(svg, camps) {
  // Wide screens get a long panorama; phones get the same trail folded into a tall one, so no camp is cropped away.
  const tall = isTall(), W = tall ? 520 : 1000, H = tall ? 600 : 420, PX = tall ? 430 : 904;
  const far = tall ? ridge(W, H, 350, 40, 2) : ridge(W, H, 250, 46, 2), mid = tall ? ridge(W, H, 420, 34, 7, { x: PX, w: 210, h: 200 }) : ridge(W, H, 300, 40, 7, { x: PX, w: 300, h: 190 }), near = tall ? ridge(W, H, 540, 20, 13) : ridge(W, H, 372, 26, 13);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const top = mid.at(PX);                                   // the summit: the trail ends exactly on the peak
  const r = rnd(42); let midPines = '', nearPines = '';
  for (let i = 0; i < 42; i++) { const x = r() * W; if (Math.abs(x - PX) < 100) continue; midPines += pine(x, mid.at(x) + 8, 0.7 + r() * 0.7, 'tr-pine'); }
  for (let i = 0; i < 26; i++) { const x = r() * W; nearPines += pine(x, near.at(x) + 14, 1.1 + r() * 1.2, 'tr-pine-near'); }
  svg.innerHTML = `<title id="map-t">${t('A trail through the hills: five camps, from the trailhead up to the summit')}</title>
    ${skyDefs('msky')}<rect width="${W}" height="${H}" fill="url(#msky)"/>${stars(90, W, tall ? 330 : 230, 3)}<circle class="tr-moon" cx="${tall ? 84 : 590}" cy="${tall ? 236 : 66}" r="${tall ? 17 : 20}"/>
    <path class="tr-ridge-3" d="${far.d}"/><path class="tr-ridge-2" d="${mid.d}"/><path class="tr-snow" d="M${PX} ${f(top)}l30 30-14-5-9 12-12-12-16 7-9 3z"/>${midPines}
    <path class="tr-ridge-1" d="${near.d}"/>
    <path id="map-path" class="tr-path" d="${(tall ? TRAIL_PATH_TALL : TRAIL_PATH).replace(/ [\d.]+$/, ' ' + f(top + 2))}"/><path id="map-walked" class="tr-walked" d=""/>
    <g id="map-camps"></g>${nearPines}${fireflies(14, W, H, 8, tall ? 340 : 240)}<g id="map-names"></g>`.replace(/(\d)\.(\d)00/g, '$1.$2');
  const path = svg.querySelector('#map-path'), len = path.getTotalLength(), g = svg.querySelector('#map-camps'), n = camps.length;
  let html = '', names = '', doneCount = 0, here = null;
  camps.forEach((c, i) => {
    const p = path.getPointAtLength(len * i / (n - 1)), last = i === n - 1;
    const anchor = tall ? (last || p.x > W - 130 ? 'end' : p.x < 130 ? 'start' : 'middle') : i === 0 ? 'start' : last ? 'end' : 'middle', ly = last ? 30 : tall ? -46 : -62, lx = last ? (tall ? -52 : -30) : anchor === 'start' ? -14 : anchor === 'end' ? 14 : 0;
    if (c.state === 'done') doneCount = i + 1;
    if (c.state === 'here') here = p;
    html += `<g class="tr-camp tr-camp--${c.state}" transform="translate(${f(p.x)} ${f(p.y)})"><circle class="tr-camp__glow" r="30"/><ellipse class="tr-camp__ground" cy="3" rx="22" ry="5"/>${ICONS[c.id] || ICONS.trailhead}${c.state === 'done' ? '<path class="tr-tick" d="M14-30l5 5 9-10"/>' : ''}</g>`;
    names += `<g class="tr-camp--${c.state}" transform="translate(${f(p.x + lx)} ${f(p.y + ly)})"><text class="tr-camp__name" text-anchor="${anchor}">${c.name}</text>${c.sub ? `<text class="tr-camp__sub" y="16" text-anchor="${anchor}">${c.sub}</text>` : ''}</g>`;
  });
  if (!here) here = path.getPointAtLength(doneCount < n ? 0 : len);      // at the very end she is sitting on the summit
  if (here) html += `<g class="tr-here" transform="translate(${f(here.x > W - 70 ? here.x - 40 : here.x + 34)} ${f(here.y - 22)})"><defs><clipPath id="luma-clip"><circle r="19"/></clipPath></defs><circle class="tr-here__ring" r="22"/><image href="${guide.photo}" x="-19" y="-19" width="38" height="38" clip-path="url(#luma-clip)" preserveAspectRatio="xMidYMid slice"/></g>`;
  g.innerHTML = html; svg.querySelector('#map-names').innerHTML = names;
  const upto = Math.max(0, Math.min(doneCount, n - 1)) / (n - 1); let d = '';
  for (let s = 0; s <= 50; s++) { const p = path.getPointAtLength(len * upto * s / 50); d += (s ? 'L' : 'M') + f(p.x) + ' ' + f(p.y); }
  svg.querySelector('#map-walked').setAttribute('d', doneCount ? d : '');
}
