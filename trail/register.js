/* The Trail: the register, and the lights on the map.
 *
 *   const { entries, lights } = await mountRegister(el)    draws the register into el
 *   drawLights(lights)                                     puts the lights on the trail map
 *
 * Both files it reads (trail/register.json, trail/lights.json) are written by
 * scripts/trail-register.mjs from what hikers chose to make public. Everything read from them is
 * checked again here and put on the page as text, never as HTML. When a file is missing or empty
 * the register just says nobody has signed yet.
 */
import { sanitizePublic, CAMP_IDS } from './seal.js';
import { t, lang } from './words.js';

const CAMP_NAMES = { trailhead: t('The Trailhead'), workshop: t('The Workshop'), shelter: t('The Shelter'), overlook: t('The Overlook'), summit: t('The Summit') };

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
let styled = false;
function style() { if (styled) return; styled = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./plumbing.css', import.meta.url).href })); }

async function getJson(url) {
  try { const res = await fetch(url, { cache: 'no-cache' }); return res.ok ? await res.json() : null; } catch (e) { return null; }
}
const suffix = (n) => (Number.isInteger(n) && n > 1 && n < 1000 ? n : 0);
const shown = (e) => (e.n ? `${e.handle} ·${e.n}` : e.handle);

/** Reads and re-checks both files. Never throws; missing files give empty lists. */
export async function loadRegister(base = new URL('./', import.meta.url)) {
  const [reg, lit] = await Promise.all([getJson(new URL('register.json', base)), getJson(new URL('lights.json', base))]);
  return checkRegister(reg, lit);
}
/** The checking itself, apart from the fetching: (register.json, lights.json) as parsed → { entries, lights }. */
export function checkRegister(reg, lit) {
  const entries = [];
  for (const raw of reg && Array.isArray(reg.entries) ? reg.entries.slice(0, 5000) : []) {
    const e = raw && typeof raw === 'object' && !Array.isArray(raw) ? sanitizePublic({ ...raw, v: 1 }) : null; if (!e || !e.camps.length) continue;
    e.n = suffix(raw && raw.n); e.checked = !!raw && raw.checked === true; entries.push(e);
  }
  const lights = [];
  for (const raw of lit && Array.isArray(lit.lights) ? lit.lights.slice(0, 5000) : []) {
    const e = sanitizePublic({ v: 1, handle: raw && raw.handle });
    if (e && raw && CAMP_IDS.includes(raw.camp)) lights.push({ handle: e.handle, n: suffix(raw.n), camp: raw.camp });
  }
  return { entries, lights };
}

/* One row's worth of plain values, used for both showing and sorting. */
function facts(e) {
  const last = e.camps[e.camps.length - 1], hints = Object.values(e.hints).reduce((n, x) => n + x, 0);
  return {
    name: shown(e).toLowerCase(), reached: e.camps.length, when: e.camps.reduce((d, c) => (c.done > d ? c.done : d), ''), last: last.id,
    minutes: e.minutes, hints, restarts: e.flags.restarts, way: e.flags.shortestWay ? 2 : e.flags.longWay ? 1 : 0,
  };
}
const day = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? iso : d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const time = (m) => (!m ? '–' : m < 60 ? t('{n} min', { n: m }) : t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }));

const COLUMNS = [
  { key: 'name', label: t('Hiker'), first: 'ascending' },
  { key: 'reached', label: t('Reached'), first: 'descending' },
  { key: 'when', label: t('When'), first: 'descending' },
  { key: 'minutes', label: t('Trail time'), first: 'ascending' },
  { key: 'hints', label: t('Asked {guide}'), first: 'ascending' },
  { key: 'restarts', label: t('Fresh starts'), first: 'descending' },
  { key: 'way', label: t('The way'), first: 'descending' },
];

/** Draws the register into el. Resolves to { entries, lights }; hand lights to drawLights(). */
export async function mountRegister(el, { base } = {}) {
  style();
  const { entries, lights } = await loadRegister(base);
  el.textContent = '';
  const uid = 'reg-' + Math.random().toString(36).slice(2, 8);
  const wrap = h('section', { class: 'reg', 'aria-labelledby': `${uid}-h` }, h('h2', { id: `${uid}-h`, text: t('The trail register') }));
  el.append(wrap);
  if (!entries.length) {
    wrap.append(h('p', { class: 'reg__empty', text: t('Nobody has signed the register yet. It is the book at the top: hikers who reach a camp can choose to leave their trail name in it.') }));
    return { entries, lights };
  }
  const rows = entries.map((e) => ({ e, f: facts(e) }));
  let sort = { key: 'when', dir: 'descending' };
  const tbody = h('tbody'), live = h('p', { class: 'sr', role: 'status', 'aria-live': 'polite' });
  const heads = COLUMNS.map((col) => {
    const btn = h('button', { type: 'button', class: 'reg__sort', text: col.label, onclick: () => {
      sort = { key: col.key, dir: sort.key === col.key ? (sort.dir === 'ascending' ? 'descending' : 'ascending') : col.first };
      paint(); live.textContent = sort.dir === 'ascending' ? t('Sorted by {column}, ascending.', { column: col.label }) : t('Sorted by {column}, descending.', { column: col.label });
    } });
    return { col, th: h('th', { scope: 'col' }, btn) };
  });
  function paint() {
    const sign = sort.dir === 'ascending' ? 1 : -1;
    rows.sort((a, b) => { const x = a.f[sort.key], y = b.f[sort.key]; return (x < y ? -1 : x > y ? 1 : 0) * sign || (a.f.name < b.f.name ? -1 : a.f.name > b.f.name ? 1 : 0); });
    for (const { col, th } of heads) { if (col.key === sort.key) th.setAttribute('aria-sort', sort.dir); else th.removeAttribute('aria-sort'); }
    tbody.textContent = '';
    for (const { e, f } of rows) {
      const who = h('th', { scope: 'row' }, h('span', { class: 'reg__name', text: shown(e) }), e.checked ? h('span', { class: 'reg__checked', title: t('The keeper of the trail has read this run and it matches'), text: ' ✓' }, h('span', { class: 'sr', text: ' ' + t('(run read by the keeper of the trail)') })) : null);
      if (e.profile && e.profile.line) who.append(h('span', { class: 'reg__line', text: e.profile.line }));
      const notes = [e.flags.quiet ? t('nothing') : String(f.hints)];
      tbody.append(h('tr', null, who,
        h('td', null, CAMP_NAMES[f.last], h('span', { class: 'reg__sub', text: ' ' + (e.flags.oneSitting ? t('{n} of {total}, in one day', { n: f.reached, total: CAMP_IDS.length }) : t('{n} of {total}', { n: f.reached, total: CAMP_IDS.length })) })),
        h('td', { text: day(f.when) }), h('td', { text: time(f.minutes) }), h('td', { text: notes[0] }),
        h('td', { text: f.restarts ? String(f.restarts) : t('none') }),
        h('td', { text: f.way === 2 ? t('the shortest way') : f.way === 1 ? t('the long way') : '–' })));
    }
  }
  paint();
  wrap.append(
    h('p', { class: 'reg__lede', text: t('Who has been up here, in their own words. It is a summit register, not a race: sort it any way you like.') }),
    h('div', { class: 'reg__scroll', tabindex: 0, role: 'region', 'aria-labelledby': `${uid}-h` }, h('table', { class: 'reg__table' }, h('thead', null, h('tr', null, heads.map((x) => x.th))), tbody)),
    live,
    h('p', { class: 'note', text: t('Everything here is what each hiker reported about their own run, and only hikers who asked to be listed are shown. Nobody checks a trail name, so two people can sign with the same one: the second is shown with a number after it. A ✓ means the keeper of the trail has read that run. Trail time and hints leave out the Overlook, which is private.') }));
  return { entries, lights };
}

/** Puts hikers on the trail map as small lights at the camp they have reached.
 *  It draws into its own group inside the map's SVG and touches nothing the engine draws.
 *  opts: { svg, path, camps } default to the trail page's own map (#map-path and the five camps). */
export function drawLights(lights, { svg, path, camps = CAMP_IDS, max = 12 } = {}) {
  style();
  path = path || document.getElementById('map-path'); svg = svg || (path && path.ownerSVGElement);
  if (!svg || !path || !Array.isArray(lights)) return 0;
  const ns = 'http://www.w3.org/2000/svg', make = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; };
  let g = svg.querySelector('#map-lights');
  if (!g) { g = make('g', { id: 'map-lights', class: 'trail-lights' }); svg.insertBefore(g, svg.querySelector('#map-camps')); }
  g.textContent = '';
  const len = path.getTotalLength(); let drawn = 0;
  camps.forEach((id, i) => {
    const here = lights.filter((l) => l.camp === id); if (!here.length) return;
    const p = path.getPointAtLength(len * i / (camps.length - 1));
    here.slice(0, max).forEach((l, k) => {
      // a loose ring around the camp: the angle comes from the name, so a light stays where it is between visits
      let a = 0; for (const ch of l.handle) a = (a * 31 + ch.charCodeAt(0)) % 360;
      const ang = (a + k * 137.5) * Math.PI / 180, r = 24 + (k % 3) * 7;
      const dot = make('circle', { class: 'trail-light', cx: (p.x + Math.cos(ang) * r).toFixed(1), cy: (p.y + Math.sin(ang) * r * 0.7).toFixed(1), r: 2.6, style: `animation-delay:${-(a % 40) / 10}s` });
      dot.append(make('title', {}, t('{name} is at {camp}', { name: shown(l), camp: CAMP_NAMES[id] || id }))); g.append(dot); drawn++;
    });
    if (here.length > max) g.append(make('text', { class: 'trail-light__more', x: (p.x + 40).toFixed(1), y: (p.y + 4).toFixed(1) }, `+${here.length - max}`));
  });
  return drawn;
}
