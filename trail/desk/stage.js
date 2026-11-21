/* One stage of the trail, as a hiker met it, for the reading desk (stage.html, shown in a frame).
 *
 * The desk page opens a sealed run and hands this frame one stage of it: the hiker's trail name
 * and seed (so the puzzle is the one they were given) and what the stage kept. This draws the
 * stage with the trail's own code, filled in the way the hiker left it, and, when the run has a
 * step-by-step record (engine.js: data.log), lets the reader follow it from the first step to the
 * last with the waiting taken out.
 *
 * Nothing here is saved or sent: the stage is given a copy, and "save" and "done" do nothing.
 * This frame never has the key. It talks only to the page that holds it, on this same site. */
import { h, hash, rng, reduced } from '../engine.js?v=47c94598';
import { vignette, luma } from '../scenery.js?v=47c94598';
import { loadWords, guide } from '../words.js?v=47c94598';

const $ = (id) => document.getElementById(id);
const CAMPS = ['trailhead', 'workshop', 'shelter', 'overlook', 'summit'];
const SCENES = { trailhead: 'trail', workshop: 'bench', shelter: 'hut', overlook: 'cairn', summit: 'peak' };
const TIMES = { trailhead: 'day', workshop: 'dusk', shelter: 'dusk', overlook: 'night', summit: 'dusk' };
const tell = (msg) => { try { parent.postMessage({ wmDesk: 1, ...msg }, location.origin); } catch (e) { /* not in the desk */ } };
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const span = (tenths) => { const s = Math.round((+tenths || 0) / 10); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`; };

let leave = [], card = null, body = null, sayLine = null, events = [], at = 0, timer = 0;

/* ---------- drawing the stage ---------- */
async function show(msg) {
  clearInterval(timer); leave.forEach((fn) => { try { fn(); } catch (e) { /* fine */ } }); leave = [];
  const campId = CAMPS.includes(msg.camp) ? msg.camp : null; if (!campId) return tell({ type: 'none' });
  let camp; try { camp = (await import(`../camps/${campId}.js?v=47c94598`)).default; } catch (e) { return tell({ type: 'none' }); }
  tell({ type: 'camp', id: campId, name: camp.name, stages: camp.stages.map((s) => ({ id: s.id, label: s.label, title: s.title || s.label })) });
  const idx = camp.stages.findIndex((s) => s.id === msg.stage), stage = camp.stages[idx];
  // the register is the hiker's own sending page (it would offer to seal and send): the desk shows those choices itself
  if (!stage || stage.id === 'register') { $('stage').textContent = ''; $('player').hidden = true; return tell({ type: 'none' }); }
  const data = msg.data && typeof msg.data === 'object' ? JSON.parse(JSON.stringify(msg.data)) : { hints: 0, ms: 0 };
  const parts = msg.parts && typeof msg.parts === 'object' ? JSON.parse(JSON.stringify(msg.parts)) : {};
  parts[stage.id] = data;
  const seed = Number.isInteger(msg.seed) ? msg.seed >>> 0 : hash(String(msg.handle || '').toLowerCase());
  const isFire = /\bfire\b/.test(stage.cls || '');
  document.body.dataset.time = stage.time || (isFire ? 'night' : camp.time || TIMES[campId] || 'dusk');
  sayLine = h('p', { class: 'say', 'aria-live': 'polite' }); body = h('div', { class: 'stage__body' });
  card = h('section', { class: 'card stage' + (stage.cls ? ' ' + stage.cls : ''), 'aria-labelledby': 'stage-h' },
    h('div', { html: vignette(isFire ? 'fire' : stage.scene || camp.scene || SCENES[campId] || 'trail') }).firstChild,
    h('h3', { id: 'stage-h', text: stage.title || `${idx + 1}. ${stage.label}` }), body, sayLine);
  $('stage').textContent = ''; $('stage').append(card);
  const run = { v: 2, handle: String(msg.handle || ''), seed, camps: { [campId]: { parts } }, at: { camp: campId, stage: stage.id } };
  const ctx = {
    data, seed, hiker: run.handle, reduced, save() {}, camp: parts, run,
    rng: (salt) => rng((seed ^ hash(campId + '/' + stage.id + '/' + (salt || ''))) >>> 0),
    say: (text, good) => { sayLine.textContent = text || ''; sayLine.classList.toggle('is-good', !!good); },
    setHints() {}, onLeave: (fn) => leave.push(fn), done() {},
  };
  try { stage.mount(body, ctx); } catch (e) { body.append(h('p', { text: 'This stage could not be drawn here. What was kept for it is listed beside it.' })); }
  events = (Array.isArray(msg.data && msg.data.log) ? msg.data.log : []).filter((e) => Array.isArray(e) && typeof e[1] === 'string').slice(0, 2000);
  setPlayer();
}

/* ---------- following along ---------- */
const fields = () => [...body.querySelectorAll('textarea, input, select')];
function find(name) {
  if (/^#\d+$/.test(name)) return fields()[+name.slice(1)] || null;
  return fields().find((el) => el.dataset.k === name) || fields().find((el) => el.name === name) || null;
}
const labelOf = (el, value) => { const l = el && el.closest('label'); return clip((l && l.textContent) || value, 90); };
function words(e, first) {
  const [, kind, a, b, c] = e;
  if (kind === 'o') return first ? 'Arrived at this stage.' : 'Came back to this stage.';
  if (kind === 'w') { const cut = +c || 0, text = String(e[5] == null ? '' : e[5]); return !cut ? `Wrote: “${clip(text, 120)}”` : !text ? `Took out ${cut} ${cut === 1 ? 'character' : 'characters'}.` : `Changed ${cut} ${cut === 1 ? 'character' : 'characters'} to: “${clip(text, 110)}”`; }
  if (kind === 'c') { const el = pick(a, b); return c === 0 ? `Unticked “${labelOf(el, b)}”.` : `Chose “${labelOf(el, b)}”.`; }
  if (kind === 'b') return `Pressed “${clip(a, 60)}”.`;
  if (kind === 's') return (b ? 'The trail answered: ' : 'The trail said: ') + `“${clip(a, 200)}”`;
  if (kind === 'l') return `Asked ${guide.name}, who said: “${clip(a, 200)}”`;
  if (kind === 'd') return 'Finished the stage.';
  return '';
}
/** The radio button, tick box or list a choice was made with. */
function pick(name, value) {
  const all = fields(), named = all.filter((el) => (el.dataset.k === name || el.name === name));
  if (/^#\d+$/.test(name)) return all[+name.slice(1)] || null;
  return named.find((el) => el.type === 'radio' && el.value === String(value)) || named[0] || null;
}

/** Puts the stage the way it stood after the first n steps. */
function seek(n) {
  at = Math.max(0, Math.min(events.length, n));
  const text = new Map(), choice = new Map(); let said = ['', 0], hint = '';
  for (const e of events) {                                      // everything the record touches starts empty
    if (e[1] === 'w') text.set(e[2], ''); else if (e[1] === 'c') choice.set(e[2], null);
  }
  for (const e of events.slice(0, at)) {
    const [, kind, a, b, c, d] = e;
    if (kind === 'w') { const v = text.get(a) || '', p = Math.min(+b || 0, v.length); text.set(a, v.slice(0, p) + String(d == null ? '' : d) + v.slice(p + (+c || 0))); said = ['', 0]; }
    else if (kind === 'c') { choice.set(a, [String(b), c !== 0]); said = ['', 0]; }
    else if (kind === 's') said = [String(a), b ? 1 : 0];
    else if (kind === 'l') hint = String(a);
    else if (kind === 'b') hint = '';
  }
  body.querySelectorAll('.desk-touched').forEach((el) => el.classList.remove('desk-touched'));
  for (const [name, v] of text) { const el = find(name); if (!el || el.type === 'radio' || el.type === 'checkbox') continue; if (el.value !== v) { el.value = v; if (el.tagName === 'TEXTAREA') el.scrollTop = el.scrollHeight; } }
  for (const [name, v] of choice) {
    const all = fields().filter((el) => el.dataset.k === name || el.name === name || (/^#\d+$/.test(name) && el === fields()[+name.slice(1)]));
    for (const el of all) {
      if (el.type === 'radio') el.checked = !!v && v[1] && (all.length === 1 || el.value === v[0]);
      else if (el.type === 'checkbox') el.checked = !!v && v[1];
      else if (v) el.value = v[0];
    }
  }
  const last = events[at - 1];
  if (last && (last[1] === 'w' || last[1] === 'c')) { const el = last[1] === 'w' ? find(last[2]) : pick(last[2], last[3]); const box = el && (el.closest('label') || el); if (box) box.classList.add('desk-touched'); }
  sayLine.textContent = said[0]; sayLine.classList.toggle('is-good', !!said[1]);
  $('luma').hidden = !hint; $('luma-text').textContent = hint;
  paintPlayer();
}

function paintPlayer() {
  const n = events.length, last = events[at - 1], now = $('p-now');
  $('p-seek').value = at; now.textContent = '';
  now.append(h('small', { text: at ? `Step ${at} of ${n} · ${span(last[0])} into the stage` : `${n} ${n === 1 ? 'step' : 'steps'} were kept at this stage` }),
    at ? words(last, !events.slice(0, at - 1).some((e) => e[1] === 'o')) : 'Press “Follow along” to watch it from the start, or step through it at your own pace.');
  $('p-list').querySelectorAll('li[data-i]').forEach((li) => { const i = +li.dataset.i; li.className = i === at ? 'is-now' : i > at ? 'is-later' : ''; if (i === at) { const list = $('p-list'), top = li.offsetTop - list.offsetTop; if (top < list.scrollTop || top + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - list.clientHeight / 2); } });
  $('p-play').textContent = timer ? 'Pause' : at >= n ? 'Watch again' : at ? 'Carry on' : 'Follow along';
}

function stop() { clearTimeout(timer); timer = 0; }
function play() {
  if (timer) { stop(); return paintPlayer(); }
  if (at >= events.length) seek(0);
  const next = () => {
    if (at >= events.length) { stop(); return paintPlayer(); }
    seek(at + 1);
    const kind = events[at - 1][1], pace = +$('p-speed').value || 2;
    timer = setTimeout(next, (kind === 'w' ? 900 : kind === 's' || kind === 'l' ? 2600 : 1300) / pace);
  };
  timer = setTimeout(next, 60); paintPlayer();
}

function setPlayer() {
  stop();
  const player = $('player'), note = $('note'), list = $('p-list');
  player.hidden = !events.length; note.hidden = !!events.length;
  note.textContent = events.length ? '' : 'This stage is shown the way the hiker left it. The trail did not keep a step-by-step record when this run was walked, so there is nothing to follow along with here.';
  list.textContent = '';
  let first = true, prev = 0;
  events.forEach((e, i) => {
    if (e[0] - prev >= 600) list.append(h('li', { class: 'is-gap', text: `a pause of ${span(e[0] - prev)}, skipped` }));
    prev = e[0];
    list.append(h('li', { 'data-i': i + 1 }, h('button', { type: 'button', onclick: () => { stop(); seek(i + 1); } }, h('i', { text: span(e[0]) }), h('span', { text: words(e, first) }))));
    if (e[1] === 'o') first = false;
  });
  $('p-seek').max = events.length;
  at = events.length;                                             // it opens the way the hiker left it
  if (events.length) paintPlayer();
}

$('p-play').addEventListener('click', play);
$('p-start').addEventListener('click', () => { stop(); seek(0); });
$('p-end').addEventListener('click', () => { stop(); seek(events.length); });
$('p-step').addEventListener('click', () => { stop(); seek(at + 1); });
$('p-back').addEventListener('click', () => { stop(); seek(at - 1); });
$('p-seek').addEventListener('input', (e) => { stop(); seek(+e.target.value); });

/* ---------- talking to the desk ---------- */
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== parent || !e.data || e.data.wmDesk !== 1) return;
  if (e.data.type === 'show') show(e.data).catch(() => tell({ type: 'none' }));
});
new ResizeObserver(() => tell({ type: 'size', height: Math.ceil($('main').getBoundingClientRect().height) })).observe($('main'));

await loadWords();
$('luma-face').innerHTML = luma();
tell({ type: 'ready' });
