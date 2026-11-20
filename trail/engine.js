/* The Trail: the engine. Camps are separate modules (trail/camps/*.js); this file knows nothing
 * about any puzzle. It signs the hiker in, draws the map, walks through a camp's stages one at a
 * time, keeps the run on this device, counts Luma's hints, and awards the patch.
 *
 * A camp module exports:
 *   { id, name, sub, intro, stages: [{ id, label, hints, mount(el, ctx) }], tally(parts) }
 * See trail/README.md for the contract a stage gets (ctx). */

import { checkName, checkWritten, clean } from './manners.js?v=a5c066b7';
import { drawMap as drawTrail, vignette, luma } from './scenery.js?v=a5c066b7';
import { t } from './words.js?v=a5c066b7';
const lower = (name) => name.charAt(0).toLowerCase() + name.slice(1);                 // "The Summit" → "the Summit", "Le Sommet" → "le Sommet"

const $ = (id) => document.getElementById(id);
const KEY = 'wm-trail-v2';
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- seeds ---------- */
export const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---------- small DOM helper for camps ---------- */
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

/* ---------- the run: everything that is kept ---------- */
let run = null, CAMPS = [], NAMES = [], clock = 0, leave = [], stageHints = null, leaving = false;
try { run = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private window: play without saving */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* fine */ } };
const campData = (id) => (run.camps[id] = run.camps[id] || { parts: {} });
const part = (campId, stageId) => { const c = campData(campId); return (c.parts[stageId] = c.parts[stageId] || { hints: 0, ms: 0 }); };
export const getRun = () => run;

/* ---------- the trail map ---------- */
function drawMap() {
  const here = run ? NAMES.findIndex((c) => !(run.camps[c.id] && run.camps[c.id].done)) : 0;
  const camps = NAMES.map((c, i) => {
    const isDone = !!(run && run.camps[c.id] && run.camps[c.id].done), built = CAMPS.some((x) => x.id === c.id);
    return { ...c, built, state: isDone ? 'done' : i === here && built ? 'here' : built ? 'open' : 'closed' };
  });
  drawTrail($('map'), camps);
  document.dispatchEvent(new CustomEvent('trail:map'));          // others (the register's lights) redraw on top
  const legend = $('map-legend'); legend.textContent = '';
  camps.forEach((c, i) => {
    const v = { n: i + 1, name: c.name }, text = c.state === 'done' ? t('{n}. {name} · patch earned', v) : c.state === 'here' ? t('{n}. {name} · you are here', v) : c.built ? `${i + 1}. ${c.name}` : t('{n}. {name} · not open yet', v);
    // a camp already walked can be opened again from here
    const again = c.state === 'done' && run && run.at && run.at.camp !== c.id;
    legend.appendChild(h('li', { class: c.state === 'done' ? 'is-done' : c.state === 'here' ? 'is-open' : '' }, again ? h('button', { type: 'button', onclick: () => goBack(c.id, 'done') }, text, h('i', { class: 'sr', text: t('Go back to this') })) : text));
  });
}

/* ---------- walking a camp ---------- */
// What each camp looks like unless a stage says otherwise (stage.scene, stage.time).
const SCENES = { trailhead: 'trail', workshop: 'bench', shelter: 'hut', overlook: 'cairn', summit: 'peak' };
const TIMES = { trailhead: 'day', workshop: 'dusk', shelter: 'dusk', overlook: 'night', summit: 'dusk' };
const campOf = (id) => CAMPS.find((c) => c.id === id);
function tick() { if (clock && run.at && run.at.stage !== 'done') part(run.at.camp, run.at.stage).ms += Date.now() - clock; clock = Date.now(); }
function clearStage() { leave.forEach((fn) => { try { fn(); } catch (e) { /* a camp's own clean-up must not stop the walk */ } }); leave = []; stageHints = null; $('stage').textContent = ''; }

/* Going back: any finished stage (or an earlier camp's patch) can be opened again to mend a slip.
 * Where the hiker had got to is remembered, and they are taken back there afterwards. */
function goBack(campId, stageId) { if (!run.resume) run.resume = { ...run.at }; show(campId, stageId); }
function resume() { const r = run.resume; if (!r) return; delete run.resume; show(r.camp, r.stage); }

function show(campId, stageId, quiet) {
  const camp = campOf(campId); if (!camp) return;
  clearStage();
  const idx = CAMPS.indexOf(camp), order = NAMES.findIndex((c) => c.id === campId) + 1;
  $('camp-eyebrow').textContent = t('Camp {n} of {total}', { n: order, total: NAMES.length }); $('camp-name').textContent = camp.name; $('camp-intro').textContent = camp.intro || '';
  const at = camp.stages.findIndex((s) => s.id === stageId), isDone = stageId === 'done';
  const steps = $('steps'); steps.textContent = '';
  const doneParts = (run.camps[campId] || {}).parts || {};
  camp.stages.forEach((s, i) => {
    const was = isDone || i < at || (doneParts[s.id] && doneParts[s.id].done), cls = i === at ? 'is-now' : was ? 'is-done' : '';
    steps.appendChild(h('li', { class: cls }, was && i !== at ? h('button', { type: 'button', onclick: () => goBack(campId, s.id) }, s.label, h('i', { class: 'sr', text: t('Go back to this') })) : s.label));
  });
  if (run.resume && run.resume.camp === campId && run.resume.stage === stageId) delete run.resume;      // back where they had got to
  $('resume').hidden = !run.resume;
  run.at = { camp: campId, stage: stageId }; save(); clock = Date.now();
  if (!isDone) drawMap();                                        // the legend's "go back" buttons depend on where the hiker is
  $('s-done').hidden = !isDone; $('luma').hidden = isDone; hush();
  if (isDone) { document.body.dataset.time = 'night'; finish(camp, idx); if (!quiet) $('s-done').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); return; }
  const stage = camp.stages[at], data = part(campId, stageId), isFire = /\bfire\b/.test(stage.cls || '');
  document.body.dataset.time = stage.time || (isFire ? 'night' : camp.time || TIMES[campId] || 'dusk');
  const say = h('p', { class: 'say', 'aria-live': 'polite' }), body = h('div', { class: 'stage__body' });
  const card = h('section', { class: 'card stage' + (stage.cls ? ' ' + stage.cls : ''), 'aria-labelledby': 'stage-h' }, h('div', { html: vignette(isFire ? 'fire' : stage.scene || camp.scene || SCENES[campId] || 'trail') }).firstChild, h('h3', { id: 'stage-h', text: stage.title || `${at + 1}. ${stage.label}` }), body, say);
  $('stage').appendChild(card);
  stageHints = stage.hints || null; $('luma').hidden = !stageHints;
  let finished = false, stale = false;
  // A refusal ("too short", "too steep") must not outlive the thing it was about: the next thing the hiker does clears it.
  const forget = (e) => { if (stale && !finished && !say.classList.contains('is-good') && (e.type !== 'click' || e.target.closest('button, input, select, label, canvas, [role="button"], [tabindex]'))) { say.textContent = ''; stale = false; } };
  card.addEventListener('input', forget, true); card.addEventListener('click', forget, true); card.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) forget(e); }, true);
  const ctx = {
    data, seed: run.seed, hiker: run.handle, reduced, save,
    rng: (salt) => rng((run.seed ^ hash(campId + '/' + stageId + '/' + (salt || ''))) >>> 0),
    say: (text, good) => {
      say.textContent = text || ''; say.classList.toggle('is-good', !!good); stale = !!text;
      if (text) { const b = say.getBoundingClientRect(); if (b.bottom > innerHeight - 8 || b.top < 70) say.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }
    },
    setHints: (hints) => { stageHints = hints; $('luma').hidden = !hints; },
    onLeave: (fn) => leave.push(fn),
    camp: campData(campId).parts, run,
    done: (delay) => {
      if (finished) return;
      // Manners: everything written at this stage is tidied, and rough language is turned back.
      const refuse = (function scan(o) { for (const k in o) { const v = o[k]; if (typeof v === 'string') { o[k] = clean(v, 4000); const no = k !== 'aiHow' && checkWritten(o[k]); if (no) return no; } else if (v && typeof v === 'object') { const no = scan(v); if (no) return no; } } return null; })(data);
      if (refuse) { data.rude = (data.rude || 0) + 1; save(); ctx.say(refuse); return; }
      finished = true; tick(); data.done = true; save();
      if (run.resume) data.revisits = (data.revisits || 0) + 1;
      // someone who went back to mend a slip returns to where they had got to; everyone else walks on
      setTimeout(() => { const r = run.resume; if (r) resume(); else show(campId, at + 1 < camp.stages.length ? camp.stages[at + 1].id : 'done'); }, reduced ? Math.min(delay || 0, 500) : delay || 0);
    },
  };
  stage.mount(body, ctx);
  if (!quiet) card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- Luma: hints, counted ---------- */
function hush() { $('luma-say').hidden = true; $('luma-ask').setAttribute('aria-expanded', 'false'); }
function askLuma() {
  if (!run || !run.at || !stageHints) return;
  const data = part(run.at.camp, run.at.stage), list = typeof stageHints === 'function' ? stageHints(data.hints) : stageHints;
  let text = Array.isArray(list) ? list[Math.min(data.hints, list.length - 1)] : list;
  if (typeof text === 'function') text = text();
  if (!text) return;
  if (!Array.isArray(list) || data.hints < list.length) { data.hints++; save(); }      // hearing the last hint again is free
  $('luma-text').textContent = text; $('luma-say').hidden = false; $('luma-ask').setAttribute('aria-expanded', 'true');
}

/* ---------- the patch ---------- */
function finish(camp, idx) {
  const c = campData(camp.id);
  if (!c.done) { c.done = new Date().toISOString(); save(); }
  drawMap();
  const parts = Object.values(c.parts), mins = Math.max(1, Math.round(parts.reduce((n, x) => n + (x.ms || 0), 0) / 60000)), hints = parts.reduce((n, x) => n + (x.hints || 0), 0);
  const whole = !CAMPS[idx + 1] && NAMES.every((c) => run.camps[c.id] && run.camps[c.id].done);
  $('s-done').classList.toggle('is-end', whole);
  const v = { name: run.handle, camp: lower(camp.name), n: hints };
  $('done-h').textContent = whole ? t('{name}, you walked the whole trail', v) : t('{camp} patch earned', { camp: camp.name });
  $('done-line').textContent = whole
    ? (!hints ? t('That is all five camps, and the summit under your boots. {guide} did not have to say a word up here.') : hints === 1 ? t('That is all five camps, and the summit under your boots. {guide} gave you 1 hint up here.') : t('That is all five camps, and the summit under your boots. {guide} gave you {n} hints up here.', v))
    : (!hints ? t('{name}, that is {camp} behind you. {guide} did not have to say a word.', v) : hints === 1 ? t('{name}, that is {camp} behind you. {guide} gave you 1 hint.', v) : t('{name}, that is {camp} behind you. {guide} gave you {n} hints.', v));
  const rows = [...(camp.tally ? camp.tally(c.parts, run) : []), [t('Asked {guide}'), hints], [t('Time at this camp'), t('{n} min', { n: mins })]];
  const dl = $('tally'); dl.textContent = '';
  for (const [k, v] of rows) dl.appendChild(h('div', null, h('dt', { text: k }), h('dd', { text: String(v) })));
  const nextCamp = CAMPS[idx + 1], go = $('onward');
  go.hidden = !nextCamp || !!run.resume; if (nextCamp) { go.textContent = t('Walk on to {camp}', { camp: nextCamp.name }); go.onclick = () => show(nextCamp.id, nextCamp.stages[0].id); }
  $('done-note').textContent = nextCamp ? t('Your run is saved on this device. Rest as long as you like.') : (CAMPS.length < NAMES.length ? t('The next camp is not open yet. Your run is saved on this device.') : t('That is the whole trail. Your run is saved on this device.'));
  const extra = $('done-extra'); extra.textContent = '';
  if (whole) extra.append(h('figure', { class: 'end' }, h('span', { class: 'end__luma', html: luma('big') }), h('figcaption', null, h('b', { text: t('{guide} has fallen asleep on your boots.') }), ' ' + t('That only happens with people {guide} likes. Thank you for walking all the way up.'))));
  if (camp.afterPatch) camp.afterPatch(extra, { run, save, hiker: run.handle, reduced, reopen: (stageId) => goBack(camp.id, stageId) });
}

/* ---------- starting ---------- */
function begin(fresh) {
  $('sign').hidden = true; $('camp').hidden = false; drawMap();
  let at = run.at;
  if (!at || !campOf(at.camp) || (at.stage !== 'done' && !campOf(at.camp).stages.some((s) => s.id === at.stage))) {
    const first = CAMPS.find((c) => !(run.camps[c.id] && run.camps[c.id].done)) || CAMPS[CAMPS.length - 1];
    at = { camp: first.id, stage: run.camps[first.id] && run.camps[first.id].done ? 'done' : first.stages[0].id };
  }
  show(at.camp, at.stage, !fresh);
}

/** camps: the modules that exist; names: all five camps in order ({ id, name, sub }) so the map can show what is ahead. */
export function start(camps, names) {
  CAMPS = camps; NAMES = names;
  $('luma-ask').addEventListener('click', askLuma);
  $('resume-go').textContent = t('Back to where I had got to'); $('resume-go').addEventListener('click', resume);
  $('luma-hush').addEventListener('click', () => { hush(); $('luma-ask').focus(); });
  // The guide's name is never written into the page itself: every sentence that says it is set here.
  $('luma-h').textContent = t('{guide}, the trail guide'); $('luma-ask-label').textContent = t('Ask {guide}'); $('luma-hush').setAttribute('aria-label', t("Close {guide}'s hint"));
  $('lede').textContent = t('Lace up. There is a trail through these hills with a puzzle or two at every camp and a fire at the end of each day. Nobody is marking you, and {guide} knows the way.');
  $('sign-p').textContent = t("{guide} is already waiting by the signpost. Write a trail name in the book and {guide} will take you up. The name decides which trail you get: the maps, the numbers and the nights are yours and nobody else's.");
  $('handle').placeholder = t('What should {guide} call you?');
  $('luma-face').innerHTML = luma(); if ($('sign-luma')) $('sign-luma').innerHTML = luma('big');
  $('export').addEventListener('click', () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })), download: `trail-${run.handle.replace(/[^A-Za-z0-9_-]+/g, '-')}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('again').addEventListener('click', () => { if (confirm(t('Start again as a new hiker? The run saved on this device will be replaced.'))) { leaving = true; try { localStorage.removeItem(KEY); } catch (e) { /* fine */ } location.reload(); } });
  $('sign-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const handle = clean($('handle').value, 24), no = checkName(handle);
    if (no) { $('sign-say').textContent = no; return; }
    run = { v: 2, handle, seed: hash(handle.toLowerCase()), began: new Date().toISOString(), camps: {}, at: null };
    save(); begin(true);
  });
  matchMedia('(max-width: 720px)').addEventListener('change', drawMap);
  window.addEventListener('pagehide', () => { if (run && run.at && !leaving) { tick(); save(); } });
  drawMap();
  if (run && run.handle && run.v === 2) begin();
}
