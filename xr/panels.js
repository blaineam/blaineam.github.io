// wemiller.com /xr/ — two panels that open in place of the content, like any other item:
//
//   search        a line of text, a keyboard you can point at or press, and up to six results;
//                 choosing a result jumps to that photograph, app, project, area or page.
//   time machine  pick a date (or a named day) and go there; the same thing the home page's
//                 ?when= does, as a control you can reach in a headset.
//
// Both borrow their words from the site's dictionary (search.*, tm.*), so they are already in
// every language the site speaks. Neither knows what happens when something is chosen: app.js
// passes that in.
import { COL, FONT } from './ui.js';
import { tr, site, lang } from './i18n.js';
import { NAMED } from './time.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------- search
export function buildSearch(ctx) {
  const { THREE, ui, EYE, invalidate } = ctx;
  const group = new THREE.Group(), targets = [];
  const Z = -1.75, Y = EYE + 0.12;
  let query = '', index = null, loading = null, results = [];

  // the line being typed, and a second line that says what to do or what was found
  const bar = ui.canvasTexture(1280, 200);
  const barMesh = new THREE.Mesh(ui.roundedGeo(1.3, 0.203, 0.04), new THREE.MeshBasicMaterial({ map: bar.tex, transparent: true }));
  barMesh.scale.set(1.3, 0.203, 1);
  barMesh.position.set(0, Y + 0.55, Z);
  group.add(barMesh);
  function drawBar() {
    const { ctx: c, tex } = bar;
    c.clearRect(0, 0, 1280, 200);
    c.fillStyle = 'rgba(12,18,32,.97)'; c.fillRect(0, 0, 1280, 200);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.font = '600 60px ' + FONT;
    c.fillStyle = query ? COL.ink : COL.soft;
    const shown = query || site('search.placeholder', 'Search apps, projects, photographs, pages…');
    c.fillText(shown, 48, 86, 1180);
    if (query) { const w = Math.min(1180, c.measureText(query).width); c.fillStyle = COL.accent; c.fillRect(52 + w, 36, 5, 62); }      // the caret
    c.font = '400 34px ' + FONT; c.fillStyle = COL.soft;
    const words = norm(query).split(/\s+/).filter(Boolean);
    c.fillText(!words.length || !index ? site('search.hint', 'Type to search the whole site') : results.length ? '' : site('search.empty', 'Nothing found. Try another word.'), 48, 158, 1180);
    tex.needsUpdate = true; invalidate();
  }

  // results: two columns of three
  const kindLabel = (k) => site('search.k.' + k, k.charAt(0).toUpperCase() + k.slice(1));
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const { ctx: c, tex } = ui.canvasTexture(768, 120);
    const mesh = new THREE.Mesh(ui.roundedGeo(0.64, 0.1, 0.03), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.scale.set(0.64, 0.1, 1);
    mesh.position.set((i % 2 ? 1 : -1) * 0.33, Y + 0.36 - Math.floor(i / 2) * 0.115, Z);
    mesh.visible = false;
    const slot = { mesh, entry: null, hover: false, label: '' };
    slot.draw = () => {
      c.clearRect(0, 0, 768, 120);
      c.fillStyle = slot.hover ? '#18294a' : 'rgba(12,18,32,.95)'; c.fillRect(0, 0, 768, 120);
      c.strokeStyle = slot.hover ? COL.accent : COL.edge; c.lineWidth = 5; ui.roundRect(c, 3, 3, 762, 114, 34); c.stroke();
      if (!slot.entry) { tex.needsUpdate = true; return; }
      c.textBaseline = 'middle'; c.textAlign = 'right';
      c.font = '500 28px ' + FONT; c.fillStyle = COL.accent;
      const kind = kindLabel(slot.entry.k) + (slot.entry.leaves ? ' ↗' : ''), kw = c.measureText(kind).width;
      c.fillText(kind, 736, 62);
      c.textAlign = 'left'; c.font = '600 38px ' + FONT; c.fillStyle = COL.ink;
      let text = slot.label;
      const room = 736 - kw - 24 - 32;
      if (c.measureText(text).width > room) { while (text.length > 1 && c.measureText(text + '…').width > room) text = text.slice(0, -1); text += '…'; }
      c.fillText(text, 32, 62);
      tex.needsUpdate = true; invalidate();
    };
    mesh.userData = {
      get label() { return slot.entry ? slot.label + ', ' + kindLabel(slot.entry.k) : ''; },
      get enabled() { return !!slot.entry; },
      setHover(on) { slot.hover = on; slot.draw(); },
      select() { if (slot.entry) ctx.onPick(slot.entry); },
    };
    slots.push(slot); group.add(mesh); targets.push(mesh);
  }

  // the keyboard: Latin letters and digits. Other scripts are typed on the flat page's own text
  // field (where the system keyboard and its input methods work); in a headset, product names
  // and English words are what a Latin keyboard can find.
  const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl⌫', 'zxcvbnm␣␣✕'];
  const KW = 0.105, KH = 0.092, GAP = 0.012;
  ROWS.forEach((row, r) => {
    const keys = [];
    for (let i = 0; i < row.length; i++) { if (row[i] === '␣' && keys.length && keys[keys.length - 1].ch === '␣') keys[keys.length - 1].span++; else keys.push({ ch: row[i], span: 1 }); }
    const total = row.length * KW + (row.length - 1) * GAP;
    let x = -total / 2;
    for (const k of keys) {
      const w = k.span * KW + (k.span - 1) * GAP;
      const b = ui.makeButton(k.ch === '␣' ? '␣' : k.ch === '⌫' || k.ch === '✕' ? k.ch : k.ch.toUpperCase(), w, KH, () => api.key(k.ch));
      b.face.scale.set(w, KH, 1);
      b.face.position.set(x + w / 2, Y - 0.04 - r * (KH + GAP), Z + 0.02);
      group.add(b.face); targets.push(b.face);
      x += w + GAP;
    }
  });

  function labelOf(e) { return (e.k === 'section' && e.i ? site(e.i, e.t) : e.t) || ''; }
  function score(e, words) {
    const title = norm(labelOf(e)), body = norm(e.d) + ' ' + (e.x || '') + ' ' + norm(e.k === 'project' && e.i ? site(e.i, '') : '');
    let total = 0;
    for (const w of words) {
      let s = 0;
      if (title === w) s = 100; else if (title.indexOf(w) === 0) s = 60; else if (title.indexOf(' ' + w) >= 0) s = 40; else if (title.indexOf(w) >= 0) s = 25; else if ((' ' + body).indexOf(' ' + w) >= 0) s = 8;
      if (!s) return 0;
      total += s;
    }
    return total + (e.k === 'project' ? 6 : e.k === 'section' ? 4 : e.k === 'page' ? 2 : 0);
  }
  function run() {
    const words = norm(query).split(/\s+/).filter(Boolean);
    results = [];
    if (words.length && index) {
      results = index.map((e) => [score(e, words), e]).filter((r) => r[0] > 0 && ctx.accept(r[1])).sort((a, b) => b[0] - a[0]).slice(0, 6).map((r) => r[1]);
    }
    slots.forEach((s, i) => { s.entry = results[i] || null; s.label = s.entry ? labelOf(s.entry) : ''; s.mesh.visible = !!s.entry; s.hover = false; s.draw(); });
    drawBar();
    if (ctx.onResults) ctx.onResults(results.map(labelOf));
  }
  function load() {
    if (!loading) loading = fetch('/search-index.json').then((r) => r.json()).then((d) => { index = Array.isArray(d) ? d : []; }).catch(() => { index = []; });
    return loading;
  }

  const api = {
    group, targets,
    get query() { return query; },
    get results() { return results; },
    labelOf,
    open() { load().then(run); run(); },
    refresh() { run(); },                       // the time machine changed what exists
    setQuery(q) { query = String(q || '').slice(0, 40); run(); if (ctx.onQuery) ctx.onQuery(query); },
    key(ch) {
      if (ch === '⌫') api.setQuery(query.slice(0, -1));
      else if (ch === '✕') api.setQuery('');
      else api.setQuery(query + (ch === '␣' ? ' ' : ch));
    },
    first() { if (results[0]) ctx.onPick(results[0]); },
  };
  drawBar();
  return api;
}

// ---------------------------------------------------------------- time machine
export function buildTimeMachine(ctx) {
  const { THREE, ui, EYE, invalidate, cal } = ctx;
  const group = new THREE.Group(), targets = [];
  const Z = -1.75, Y = EYE + 0.1;
  let pick = new Date(), travelling = false;

  const head = ui.canvasTexture(1280, 300);
  const headMesh = new THREE.Mesh(ui.roundedGeo(1.3, 0.305, 0.05), new THREE.MeshBasicMaterial({ map: head.tex, transparent: true }));
  headMesh.scale.set(1.3, 0.305, 1);
  headMesh.position.set(0, Y + 0.52, Z);
  group.add(headMesh);
  const fmtDay = (d) => { try { return new Intl.DateTimeFormat(lang, { weekday: 'short', month: 'long', day: 'numeric' }).format(d); } catch (e) { return (d.getMonth() + 1) + '/' + d.getDate(); } };
  function drawHead() {
    const { ctx: c, tex } = head;
    c.clearRect(0, 0, 1280, 300);
    c.fillStyle = 'rgba(12,18,32,.97)'; c.fillRect(0, 0, 1280, 300);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = COL.ink; c.font = '700 64px ' + FONT; c.fillText(site('tm.title', 'Time machine'), 640, 92, 1200);
    c.fillStyle = COL.soft; c.font = '400 34px ' + FONT;
    ui.wrapLines(c, site('tm.p', 'This site changes with the calendar. Pick a day to visit.'), 1180, 2).forEach((l, i) => c.fillText(l, 640, 150 + i * 42));
    c.fillStyle = COL.accent; c.font = '600 30px ' + FONT;
    c.fillText(site('tm.dest', 'Destination time').toLocaleUpperCase(lang), 640, 262, 1200);
    tex.needsUpdate = true; invalidate();
  }

  const row = (list, y) => {
    const gap = 0.02;
    let total = -gap; for (const b of list) total += b.w + gap;
    let x = -total / 2;
    for (const b of list) { b.face.scale.set(b.w, b.h, 1); b.face.position.set(x + b.w / 2, y, Z + 0.01); if (!b.face.parent) { group.add(b.face); if (b.onSelect) targets.push(b.face); } x += b.w + gap; }
  };
  const H = 0.092;
  const shift = (years, months, days) => () => {
    const d = new Date(pick.getTime());
    if (years) d.setFullYear(d.getFullYear() + years);
    if (months) d.setMonth(d.getMonth() + months);
    if (days) d.setDate(d.getDate() + days);
    if (d.getFullYear() >= 1990 && d.getFullYear() <= 2300) { pick = d; sync(); }
  };
  const yearBtn = ui.makeButton('2026', 0.3, H, null), dayBtn = ui.makeButton('', 0.62, H, null);
  const yRow = [ui.makeButton('−10', 0.16, H, shift(-10)), ui.makeButton('−1', 0.14, H, shift(-1)), yearBtn, ui.makeButton('+1', 0.14, H, shift(1)), ui.makeButton('+10', 0.16, H, shift(10))];
  const dRow = [ui.makeButton('«', 0.12, H, shift(0, -1)), ui.makeButton('‹', 0.12, H, shift(0, 0, -1)), dayBtn, ui.makeButton('›', 0.12, H, shift(0, 0, 1)), ui.makeButton('»', 0.12, H, shift(0, 1))];
  const goBtn = ui.makeButton(site('tm.go', 'Go'), 0.3, H, () => ctx.onGo(new Date(pick.getTime())));
  const nowBtn = ui.makeButton(site('tm.now', 'Back to the present'), 0.4, H, () => ctx.onNow());
  row(yRow, Y + 0.27); row(dRow, Y + 0.16);
  group.add(nowBtn.face); targets.push(nowBtn.face);

  // named days: one tap goes straight there
  const named = NAMED.filter((id) => cal.eventDate(id, new Date())).map((id) => ui.makeButton(site('tm.d.' + id, id), 0.2, 0.082, () => ctx.onNamed(id)));
  const lines = [[]];
  let wsum = 0;
  for (const b of named) { if (wsum + b.w > 1.5 && lines[lines.length - 1].length) { lines.push([]); wsum = 0; } lines[lines.length - 1].push(b); wsum += b.w + 0.02; }
  lines.forEach((l, i) => row(l, Y - 0.1 - i * 0.1));

  function sync() {
    yearBtn.set({ label: String(pick.getFullYear()) });
    dayBtn.set({ label: fmtDay(pick) });
    nowBtn.face.visible = travelling;
    row(travelling ? [goBtn, nowBtn] : [goBtn], Y + 0.04);
    if (ctx.onChange) ctx.onChange();
    invalidate();
  }
  drawHead();
  return {
    group, targets,
    get pick() { return pick; },
    open(date, isTravelling) { pick = new Date(date.getTime()); travelling = !!isTravelling; sync(); },
  };
}
