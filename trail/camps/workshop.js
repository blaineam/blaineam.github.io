/* Camp 2, the Workshop: craft. Five small things to mend at a bench (a one-liner, a slow page,
 * some plumbing, a photograph with the wrong date, a pull request), then a decision and a fire.
 *
 * Every puzzle is generated from the hiker's seed by a pure function (make…) and judged by
 * running what the hiker built through the same small simulator the generator used to prove
 * the puzzle can be solved. Nothing is compared against an answer written here. */
import { h } from '../engine.js?v=a318c6b5';
import { t, lang } from '../words.js?v=a318c6b5';
import { decisionStage, fireStage, useCss } from './common.js?v=a318c6b5';

useCss(new URL('./workshop.css?v=a318c6b5', import.meta.url));

const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const keep = (list, x, max = 40) => { list.push(x); if (list.length > max) list.splice(0, list.length - max); };

/* ---------- 1: the one-liner ----------
 * A listing of files with sizes, and a pipeline built from pieces. The pieces really run, on
 * the lines of the listing; the result is right when the names that come out are the ones the
 * task asks for, whichever pieces produced them. */
const SHELL_SETS = [
  ['jpg', ['dawn', 'ridge', 'creek', 'luma', 'camp', 'fern', 'summit'], 'jpg-backup.zip'],
  ['log', ['sync', 'build', 'backup', 'crash', 'import', 'update'], 'logbook.txt'],
  ['csv', ['trips', 'gear', 'weights', 'routes', 'nights', 'budget'], 'csv-notes.md'],
];
const SHELL_OTHERS = ['README.md', 'map.pdf', 'todo.txt', 'notes.txt', 'packing.md', 'route.gpx'];
const num = (line) => parseInt(line, 10) || 0;
const shellPieces = (ext, n) => [
  { id: 'grep', text: `grep ${ext}`, say: t('keep lines with "{ext}" anywhere in them', { ext }), run: (L) => L.filter((l) => l.includes(ext)) },
  { id: 'grepx', text: `grep '\\.${ext}$'`, say: t('keep lines that end in ".{ext}"', { ext }), run: (L) => L.filter((l) => l.endsWith('.' + ext)) },
  { id: 'sort', text: 'sort', say: t('sort as text, one character at a time'), run: (L) => L.slice().sort() },
  { id: 'sortn', text: 'sort -n', say: t('sort as numbers, smallest first'), run: (L) => L.slice().sort((a, b) => num(a) - num(b)) },
  { id: 'sortrn', text: 'sort -rn', say: t('sort as numbers, biggest first'), run: (L) => L.slice().sort((a, b) => num(b) - num(a)) },
  { id: 'head', text: `head -n ${n}`, say: t('keep the first {n} lines', { n }), run: (L) => L.slice(0, n) },
  { id: 'tail', text: `tail -n ${n}`, say: t('keep the last {n} lines', { n }), run: (L) => L.slice(-n) },
  { id: 'tac', text: 'tac', say: t('turn the lines upside down'), run: (L) => L.slice().reverse() },
  { id: 'wc', text: 'wc -l', say: t('count the lines'), run: (L) => [String(L.length)] },
];
export function runShell(S, ids) {
  let lines = S.files.map((f) => f.size + '\t' + f.name);
  for (const id of ids) lines = S.pieces.find((p) => p.id === id).run(lines);
  const want = S.files.filter((f) => f.name.endsWith('.' + S.ext)).sort((a, b) => S.big ? b.size - a.size : a.size - b.size).slice(0, S.n).map((f) => f.name);
  const got = lines.map((l) => l.split('\t').pop());
  return { lines, ok: got.length === want.length && got.every((g, i) => g === want[i]) };
}
export function makeShell(R) {
  for (let a = 0; a < 200; a++) {
    const r = R('shell' + a), [ext, names, decoy] = pick(r, SHELL_SETS), big = r() < 0.5, n = int(r, 2, 3), used = new Set();
    const size = (lo, hi) => { let s; do s = int(r, lo, hi); while (used.has(s)); used.add(s); return s; };
    const mine = shuffle(r, names).slice(0, 5), ranges = shuffle(r, [[1010, 4800], [1010, 4800], [110, 980], [110, 980], [12, 96]]);
    const files = mine.map((nm, i) => ({ name: `${nm}.${ext}`, size: size(...ranges[i]) }));
    files.push({ name: decoy, size: big ? size(5200, 9400) : size(3, 9) });        // has the letters, is not the kind of file
    for (const nm of shuffle(r, SHELL_OTHERS).slice(0, 3)) files.push({ name: nm, size: size(20, 6000) });
    files.sort((x, y) => (x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1));
    const S = { ext, big, n, files, pieces: shellPieces(ext, n), broken: ['grep', 'sort', 'head'] };
    const order = big ? 'sortrn' : 'sortn';
    if (!runShell(S, ['grepx', order, 'head']).ok) continue;                       // a way through exists
    if ([S.broken, ['grep', order, 'head'], ['grepx', 'sort', 'head'], ['grepx', 'sort', 'tail']].some((c) => runShell(S, c).ok)) continue;   // and both faults bite
    return S;
  }
  throw new Error('no one-liner could be set');
}

/* A line of chips built from a tray of pieces: tap to add, tap to take out, arrow keys or drag to move. */
function chipLine(items, start, labels, onChange) {
  let line = start.slice(), drag = null, quiet = false;
  const lineEl = h('div', { class: 'workshop-line', role: 'group', 'aria-label': labels.line }), trayEl = h('div', { class: 'workshop-tray', role: 'group', 'aria-label': labels.tray });
  const nodes = new Map();
  const set = (next, focus) => { line = next; draw(focus); onChange(line); };
  const move = (id, to) => { const next = line.filter((x) => x !== id); next.splice(to, 0, id); return next; };
  for (const it of items) {
    const more = h('i', { class: 'sr' }), b = h('button', { type: 'button', class: 'workshop-chip', 'data-id': it.id }, h('code', { text: it.text }), ' ', h('small', { text: it.say }), ' ', more);
    b.addEventListener('click', () => { if (quiet) return; set(line.includes(it.id) ? line.filter((x) => x !== it.id) : [...line, it.id], it.id); });
    b.addEventListener('keydown', (e) => {
      const i = line.indexOf(it.id), d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
      if (i < 0 || !d) return; e.preventDefault();
      if (i + d >= 0 && i + d < line.length) set(move(it.id, i + d), it.id);
    });
    b.addEventListener('pointerdown', (e) => { if (line.includes(it.id)) drag = { id: it.id, x: e.clientX, y: e.clientY, moved: false }; });
    nodes.set(it.id, b);
  }
  const onMove = (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.moved = true; lineEl.classList.add('is-dragging');
    const over = document.elementFromPoint(e.clientX, e.clientY), b = over && over.closest && over.closest('.workshop-chip');
    if (b && lineEl.contains(b) && b.dataset.id !== drag.id) { line = move(drag.id, line.indexOf(b.dataset.id)); draw(drag.id); }
  };
  const onUp = () => { if (drag && drag.moved) { quiet = true; setTimeout(() => { quiet = false; }, 0); lineEl.classList.remove('is-dragging'); onChange(line); } drag = null; };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  function draw(focus) {
    line.forEach((id, i) => {
      const b = nodes.get(id);
      b.classList.add('is-in'); b.lastChild.textContent = t('Step {i} of {n} in the line. Press to take it out, or use the arrow keys to move it.', { i: i + 1, n: line.length });
      lineEl.append(b);
    });
    items.filter((it) => !line.includes(it.id)).forEach((it) => {
      const b = nodes.get(it.id);
      b.classList.remove('is-in'); b.lastChild.textContent = t('On the bench. Press to add it to the end of the line.');
      trayEl.append(b);
    });
    if (focus) nodes.get(focus).focus({ preventScroll: true });
  }
  draw();
  return { lineEl, trayEl, get: () => line.slice(), reset: () => set(start.slice()), off: () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); } };
}

function shell(el, ctx) {
  const S = makeShell(ctx.rng), p = ctx.data; p.runs = p.runs || [];
  const v = { n: S.n, ext: S.ext };
  const out = h('pre', { class: 'workshop-term', role: 'group', 'aria-label': t('What the command printed'), tabindex: 0, text: t('Nothing has been run yet.') });
  let ran = false;
  const chips = chipLine(S.pieces, S.broken, { line: t('The command, after du -k *. Each piece is joined to the next by a pipe.'), tray: t('Spare pieces on the bench') }, () => {
    ctx.say('');
    if (ran) { ran = false; out.classList.add('is-stale'); out.textContent = t('The line has changed since it was last run. Run it again to see what it prints now.'); }
  });
  ctx.onLeave(chips.off);
  ctx.setHints([
    t('Run it as it is first, and read what comes out against the list of files. Two things are wrong, not one.'),
    t('Plain sort reads sizes as words, so 1200 comes before 88. And one file has "{ext}" in its name without being a .{ext} file.', v),
    S.big ? t('Keep only the lines that end in ".{ext}", sort them as numbers with the biggest at the top, then keep the first {n}.', v) : t('Keep only the lines that end in ".{ext}", sort them as numbers with the smallest at the top, then keep the first {n}.', v),
  ]);
  el.append(
    h('p', { html: S.big ? t('Somebody left a one-liner on the bench. It was meant to print the <b>{n} biggest .{ext} files, biggest first</b>. It does not.', v) : t('Somebody left a one-liner on the bench. It was meant to print the <b>{n} smallest .{ext} files, smallest first</b>. It does not.', v) }),
    h('p', { class: 'hintline', text: t('Each piece hands its lines to the next one. Press a piece to add it or take it out. Drag it, or use the arrow keys, to move it along the line.') }),
    h('p', { class: 'workshop-cap', html: t('<code>du -k *</code> lists every file with its size in kilobytes:') }),
    h('pre', { class: 'workshop-term is-list', role: 'group', tabindex: 0, 'aria-label': t('The files and their sizes'), text: S.files.map((f) => String(f.size).padEnd(6) + f.name).join('\n') }),
    h('div', { class: 'workshop-cmd' }, h('code', { class: 'workshop-fixed', text: 'du -k *' }), chips.lineEl),
    chips.trayEl,
    h('div', { class: 'row wrap' }, h('button', { class: 'wm-btn', type: 'button', text: t('Run it'), onclick: go }),
      h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Put it back as it was'), onclick: () => { p.resets = (p.resets || 0) + 1; chips.reset(); } })),
    out);
  function go() {
    const ids = chips.get(), res = runShell(S, ids);
    ran = true; out.classList.remove('is-stale');
    out.textContent = '$ ' + ['du -k *', ...ids.map((id) => S.pieces.find((x) => x.id === id).text)].join(' | ') + '\n' + (res.lines.length ? res.lines.map((l) => l.replace('\t', '  ')).join('\n') : t('(nothing came out)'));
    keep(p.runs, { cmd: ids, ok: res.ok }); ctx.save();
    if (res.ok) { p.cmd = ids; ctx.say(S.big ? t('That is it: the {n} biggest, in order. There was more than one way to get there.', v) : t('That is it: the {n} smallest, in order. There was more than one way to get there.', v), true); return ctx.done(2200); }
    ctx.say(res.lines.length ? t('It ran, but those are not the right files in the right order. Read the output against the list.') : t('It ran and printed nothing.'));
  }
}

/* ---------- 2: the slow page ----------
 * Three changes on offer. The model: the page is readable once the page itself, its styles,
 * the script in the head and the font have each arrived in turn; the unused photo shares the
 * line and slows all of them down while it loads. Which change saves most is worked out from
 * the hiker's numbers, never written down. */
const PAGE_FIX = [
  ['image', t('Drop the photo'), t('A 300 KB photo the page downloads and never shows.')],
  ['font', t('Plain letters first'), t('Show the words at once in a plain font and swap the fancy one in when it arrives.')],
  ['script', t('Script goes last'), t('Move the script out of the head, so it loads after the page can be read.')],
];
export function loadPage(M, on, wobble = 1) {
  const m = (on.image ? 1 : 1 + M.drag) * wobble, css = M.css * m, script = M.script * m, font = M.font * m;
  const t1 = M.html + css, t2 = t1 + (on.script ? 0 : script), ready = t2 + (on.font ? 0 : font);
  return { ready, bars: [
    { name: t('The page itself'), from: 0, len: M.html },
    { name: t('Styles'), from: M.html, len: css },
    { name: t('Script'), from: on.script ? ready : t1, len: script, late: on.script },
    { name: t('Fancy font'), from: t2, len: font, late: on.font },
    on.image ? null : { name: t('Photo, never shown'), from: M.html, len: M.photo, late: true },
  ].filter(Boolean) };
}
export function pageSavings(M) {
  const base = loadPage(M, {}).ready;
  return PAGE_FIX.map(([k]) => [k, base - loadPage(M, { [k]: true }).ready]).sort((a, b) => b[1] - a[1]);
}
export function makePage(R) {
  const want = pick(R('page-which'), PAGE_FIX)[0];
  for (let a = 0; a < 3000; a++) {
    const r = R('page' + a), M = { html: int(r, 16, 24) * 10, css: int(r, 11, 18) * 10, script: int(r, 12, 46) * 10, font: int(r, 12, 46) * 10, drag: int(r, 15, 220) / 100, photo: int(r, 80, 130) * 10 };
    const s = pageSavings(M);
    if (s[0][0] === want && s[0][1] - s[1][1] >= 0.22 * s[0][1] && s[2][1] >= 60) return M;   // a clear winner, and nothing that does nothing
  }
  throw new Error('no page could be set');
}

function page(el, ctx) {
  const M = makePage(ctx.rng), p = ctx.data; p.loads = p.loads || []; p.wrong = p.wrong || [];
  const on = { image: false, font: false, script: false }, key = () => PAGE_FIX.map(([k]) => (on[k] ? k[0] : '-')).join('');
  const scale = Math.max(loadPage(M, {}).ready, M.html + M.photo) * 1.12;
  const fall = h('div', { class: 'workshop-fall', role: 'img', 'aria-label': t('Nothing loaded yet') }, h('p', { class: 'workshop-fall-empty', text: t('Nothing loaded yet. Press "Load the page" and its parts are drawn here as they arrive.') })), read = h('p', { class: 'workshop-read', role: 'status' });
  const book = h('ol', { class: 'workshop-book', 'aria-label': t('Your measurements, newest first') });
  let timer = 0; ctx.onLeave(() => clearTimeout(timer));
  const describe = (k) => { const names = PAGE_FIX.filter((f, i) => k[i] !== '-').map((f) => f[1]); return names.length ? names.join(' + ') : t('as it was'); };
  const note = (l) => h('li', null, h('span', { text: describe(l.c) }), h('b', { text: t('{ms} ms', { ms: l.ms }) }));
  p.loads.slice().reverse().forEach((l) => book.append(note(l)));
  if (!p.loads.length) book.append(h('li', { class: 'workshop-book-empty', text: t('Nothing measured yet.') }));
  const switches = PAGE_FIX.map(([k, title, about]) => {
    const b = h('button', { type: 'button', class: 'workshop-switch', role: 'switch', 'aria-checked': 'false', onclick: () => { on[k] = !on[k]; b.setAttribute('aria-checked', String(on[k])); ctx.say(''); } }, h('i', { 'aria-hidden': 'true' }), h('span', null, h('b', { text: title }), ' ', h('small', { text: about })));
    return b;
  });
  ctx.setHints([
    t('Do not trust the size on the label. Load the page as it was, then with one change at a time, and write down what the clock says.'),
    t('The same page loaded twice differs by a few milliseconds, so small gaps mean nothing. Look for the change that moves the line a long way on its own.'),
    () => { const base = p.loads.find((l) => l.c === '---'); return base ? t('As it was, the page took about {ms} ms. Switch on one change, load, switch it off, try the next. The biggest drop is your answer.', { ms: base.ms }) : t('Start with every switch off and load the page. That number is what the others are measured against.'); },
  ]);
  function load() {
    clearTimeout(timer);
    const n = p.loads.length, res = loadPage(M, on, 1 + (ctx.rng('wobble' + n)() - 0.5) * 0.04), ms = Math.round(res.ready / 5) * 5, c = key();
    fall.classList.remove('is-run'); fall.textContent = ''; fall.setAttribute('aria-label', t('The page loaded like this: {how}. It was readable after {ms} milliseconds.', { how: describe(c), ms }));
    for (const b of res.bars) {
      const bar = h('i', { class: b.late ? 'is-late' : '' });
      bar.style.left = (b.from / scale * 100).toFixed(2) + '%'; bar.style.setProperty('--w', (b.len / scale * 100).toFixed(2) + '%');
      bar.style.transitionDelay = (b.from / scale * 1.4).toFixed(2) + 's'; bar.style.transitionDuration = Math.max(0.05, b.len / scale * 1.4).toFixed(2) + 's';
      fall.append(h('div', { class: 'workshop-bar' }, h('span', { text: b.name }), h('div', null, bar)));
    }
    const mark = h('div', { class: 'workshop-mark', 'aria-hidden': 'true' }); mark.style.setProperty('--at', (res.ready / scale).toFixed(4)); fall.append(mark);
    mark.style.transitionDelay = (ctx.reduced ? 0 : res.ready / scale * 1.4).toFixed(2) + 's';
    void fall.offsetWidth; fall.classList.add('is-run');
    read.textContent = t('Loading…');
    timer = setTimeout(() => {
      read.textContent = t('Readable after {ms} ms ({how}).', { ms, how: describe(c) });
      const l = { c, ms }, blank = book.querySelector('.workshop-book-empty'); if (blank) blank.remove(); keep(p.loads, l, 60); book.prepend(note(l)); ctx.save();
    }, ctx.reduced ? 0 : res.ready / scale * 1400 + 150);
  }
  function answer(k) {
    const tried = new Set(p.loads.map((l) => l.c)).size;
    if (tried < 3) return ctx.say(tried ? t('That would be a guess. Load the page a few different ways first.') : t('Nothing has been measured yet. Load the page first.'));
    const best = pageSavings(M)[0][0];
    if (k === best) { p.answer = k; p.tried = tried; ctx.say(t('Yes. On this page that one change does more than either of the others. You measured {n} ways of loading it.', { n: tried }), true); return ctx.done(2200); }
    keep(p.wrong, k); ctx.save();
    ctx.say(t('The clock does not agree. Measure each change on its own against the page as it was.'));
  }
  el.append(
    h('p', { html: t('A trail guide page takes too long before anyone can read it. Three changes are on the bench, and there is time to make <b>one</b>. Flip them on and off, load the page, and read the clock.') }),
    h('div', { class: 'workshop-switches', role: 'group', 'aria-label': t('The three changes') }, switches),
    h('div', { class: 'row' }, h('button', { class: 'wm-btn', type: 'button', text: t('Load the page'), onclick: load })),
    fall, read,
    h('p', { class: 'workshop-cap', text: t('Your notebook:') }), book,
    h('p', { html: t('<b>Which change, made on its own, gets the page readable soonest?</b>') }),
    h('div', { class: 'row wrap' }, PAGE_FIX.map(([k, title]) => h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: title, onclick: () => answer(k) }))));
}

/* ---------- 3: the plumbing ----------
 * Spring, three fittings with a joint before and after each, and a ledger. One fitting is at
 * fault: a narrow valve that takes one message at a time (the rest spill), a relay that sends
 * some messages twice, or twin pipes where some messages take the slow one and arrive late.
 * One spare part goes into one joint; the run is judged by what reaches the ledger. */
const PARTS = [
  ['buffer', t('Holding tank'), t('keeps messages waiting until the next fitting is ready for them')],
  ['dedupe', t('Number check'), t('remembers every number it has passed and stops any repeat')],
  ['sorter', t('Sorter'), t('holds messages back until the next number in line turns up')],
];
const FITTINGS = { valve: t('Valve'), relay: t('Relay'), lanes: t('Twin pipes') };
export function runPipes(P, part, joint) {
  const kind = (s) => (s === 0 ? 'spring' : s === 8 ? 'ledger' : s % 2 ? (part && joint === (s + 1) / 2 ? part : 'pipe') : P.order[s / 2 - 1]);
  const pk = [], sink = [], frames = [], seen = new Set(); let expect = 1, u = 0, ord = 0, next = 1, idle = 0;
  const here = (s) => pk.filter((x) => x.at === s && x.state === 'flow').sort((a, b) => a.ord - b.ord);
  const accepts = (s) => !(kind(s) === 'valve' && P.fault === 'valve' && here(s).length);
  for (let tick = 0; tick < 120; tick++) {
    let moved = false;
    const go = (x, s) => {
      moved = true; x.at = s; x.ord = ord++; x.lane = 0;
      if (s === 8) { x.state = 'ledger'; sink.push(x.id); return; }
      const k = kind(s); let wait = 1;
      if (k === 'valve' && P.fault === 'valve') wait = P.hold;
      if (k === 'lanes' && P.fault === 'lanes' && P.slow.includes(x.id)) { wait = P.lag; x.lane = 1; }
      x.ready = tick + wait;
    };
    const pass = (x, s) => { if (accepts(s + 1)) go(x, s + 1); else { x.state = 'spill'; moved = true; } };
    for (let s = 7; s >= 0; s--) {                       // downstream first, so a message moves one place a tick
      const k = kind(s), ready = here(s).filter((x) => x.ready <= tick);
      if (k === 'buffer') { for (const x of ready) { if (!accepts(s + 1)) break; go(x, s + 1); } }
      else if (k === 'dedupe') { for (const x of ready) { if (seen.has(x.id)) { x.state = 'caught'; moved = true; } else { seen.add(x.id); pass(x, s); } } }
      else if (k === 'sorter') {
        for (const x of ready) if (x.id < expect) pass(x, s);
        for (let x; (x = here(s).find((q) => q.ready <= tick && q.id === expect));) { expect++; pass(x, s); }
      } else for (const x of ready) {
        pass(x, s);
        if (k === 'relay' && P.fault === 'relay' && !x.copy && P.twice.includes(x.id)) pk.push({ u: u++, id: x.id, at: s, state: 'flow', ord: ord++, ready: tick + 1, lane: 0, copy: true });
      }
    }
    if (next <= P.n) { pk.push({ u: u++, id: next++, at: 0, state: 'flow', ord: ord++, ready: tick + 1, lane: 0 }); moved = true; }
    frames.push(pk.slice().sort((a, b) => a.ord - b.ord).map((x) => ({ u: x.u, id: x.id, at: x.at, state: x.state, lane: x.lane })));
    idle = moved ? 0 : idle + 1;
    if (next > P.n && (!pk.some((x) => x.state === 'flow') || idle > P.hold + P.lag + 2)) break;
  }
  const count = (st) => pk.filter((x) => x.state === st).length;
  return { frames, sink, spilled: count('spill'), caught: count('caught'), stuck: count('flow'), clean: sink.length === P.n && sink.every((id, i) => id === i + 1) };
}
export function makePipes(R) {
  for (let a = 0; a < 200; a++) {
    const r = R('pipes' + a), n = 8, ids = shuffle(r, [2, 3, 4, 5, 6, 7]);
    const P = { n, order: shuffle(r, ['valve', 'relay', 'lanes']), fault: pick(r, ['valve', 'relay', 'lanes']), hold: int(r, 2, 3), lag: int(r, 3, 4), slow: ids.slice(0, 2).sort(), twice: ids.slice(2, 4).sort() };
    if (runPipes(P, null, 0).clean) continue;                                     // the fault has to show
    P.fixes = []; for (const [part] of PARTS) for (let j = 1; j <= 4; j++) if (runPipes(P, part, j).clean) P.fixes.push([part, j]);
    if (P.fixes.length && P.fixes.length <= 3) return P;                          // a fix exists, and most places do nothing
  }
  throw new Error('no plumbing could be laid');
}

/* The drawings for the plumbing: the spring, each fitting, an empty joint and the three spare parts. */
const ART = {
  spring: '<rect x="8" y="5" width="32" height="30" rx="6" fill="#7a4f36" stroke="#4a2f22" stroke-width="2"/><path d="M8 14h32M8 27h32" stroke="#4a2f22" stroke-width="2"/><path d="M24 11c4 5 5 7 5 9a5 5 0 0 1-10 0c0-2 1-4 5-9z" fill="#a9d2f2"/>',
  valve: '<rect x="12" y="9" width="24" height="22" rx="4" fill="#b5653f" stroke="#7a3e26" stroke-width="2"/><circle cx="24" cy="20" r="9" fill="#2b1e17" stroke="#ff8a66" stroke-width="3"/><path d="M15 20h18M24 11v18" stroke="#ff8a66" stroke-width="2"/><circle cx="24" cy="20" r="2.5" fill="#f5efe3"/>',
  relay: '<rect x="9" y="7" width="30" height="26" rx="3" fill="#46524c" stroke="#1d2622" stroke-width="2"/><path d="M17 14v11m-3-3 3 3 3-3M31 14v11m-3-3 3 3 3-3" stroke="#ffb49c" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  lanes: '<path d="M24 0v7M24 33v7" stroke="#b5653f" stroke-width="11" vector-effect="non-scaling-stroke"/><path d="M24 6C13 8 12 11 12 20s1 12 12 14M24 6c11 2 12 5 12 14s-1 12-12 14" fill="none" stroke="#b5653f" stroke-width="6" vector-effect="non-scaling-stroke"/><path d="M24 6C13 8 12 11 12 20s1 12 12 14M24 6c11 2 12 5 12 14s-1 12-12 14" fill="none" stroke="#e39a78" stroke-width="1.5" vector-effect="non-scaling-stroke"/>',
  ledger: '<path d="M5 9c6-3 13-3 19 0 6-3 13-3 19 0v23c-6-3-13-3-19 0-6-3-13-3-19 0z" fill="#f5efe3" stroke="#7a4f36" stroke-width="2" stroke-linejoin="round"/><path d="M24 9v23M10 15h9M10 20h9M10 25h9M29 15h9M29 20h9M29 25h9" stroke="#7a4f36" stroke-width="1.5"/>',
  joint: '<rect x="12" y="6" width="24" height="6" rx="2" fill="#7a3e26" stroke="#e39a78"/><rect x="12" y="28" width="24" height="6" rx="2" fill="#7a3e26" stroke="#e39a78"/><path d="M11 16v8M37 16v8" stroke="#f5efe3" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/>',
  buffer: '<rect x="10" y="4" width="28" height="32" rx="8" fill="#d98a62" stroke="#7a3e26" stroke-width="2"/><path d="M16 13h16M16 20h16M16 27h16" stroke="#7a3e26" stroke-width="2.5" stroke-linecap="round"/>',
  dedupe: '<circle cx="24" cy="20" r="15" fill="#f5efe3" stroke="#7a3e26" stroke-width="2"/><path d="M16 20l6 6 10-12" stroke="#1f6b45" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  sorter: '<path d="M6 5h36L29 22v13H19V22z" fill="#d98a62" stroke="#7a3e26" stroke-width="2" stroke-linejoin="round"/><path d="M15 10h18M19 15h10" stroke="#7a3e26" stroke-width="2.5" stroke-linecap="round"/>',
};
const art = (k) => `<svg viewBox="0 0 48 40" width="48" height="40"${k === 'lanes' ? ' preserveAspectRatio="none"' : ''} aria-hidden="true" focusable="false">${ART[k]}</svg>`;

function pipes(el, ctx) {
  const P = makePipes(ctx.rng), p = ctx.data; p.runs = p.runs || [];
  let part = null, fitted = null, timer = 0, busy = false, last = null;
  const bays = [], puddles = [], joints = [];
  const layer = h('div', { class: 'workshop-pkts', 'aria-hidden': 'true' });
  const pipe = h('div', { class: 'workshop-pipe' }, h('div', { class: 'workshop-heads', 'aria-hidden': 'true' }, h('span'), h('span', { text: t('In the pipe') }), h('span', { text: t('The floor') })));
  for (let s = 0; s <= 8; s++) {
    if (s % 2) {
      const j = (s + 1) / 2, name = h('b', { text: t('Joint {n}', { n: (s + 1) / 2 }) }), state = h('small'), more = h('i', { class: 'sr' }), pic = h('span', { class: 'workshop-art' }), bay = h('span', { class: 'workshop-bay' }), puddle = h('span', { class: 'workshop-puddle' }); bays[s] = bay; puddles[s] = puddle;
      const b = h('button', { type: 'button', class: 'workshop-joint', onclick: () => fit(j) }, pic, h('span', { class: 'workshop-cell' }, h('span', { class: 'workshop-tag' }, name, ' ', state, ' ', more), bay), puddle);
      joints[j] = { b, state, more, pic }; pipe.append(b);
    } else {
      const kind = s === 0 ? 'spring' : s === 8 ? 'ledger' : P.order[s / 2 - 1], bay = h('div', { class: 'workshop-bay' }); bays[s] = bay;
      pipe.append(h('div', { class: 'workshop-node is-' + kind }, h('span', { class: 'workshop-art', html: art(kind) }), h('div', { class: 'workshop-cell' }, h('span', { class: 'workshop-tag' }, h('b', { text: s === 0 ? t('Spring') : s === 8 ? t('Ledger') : FITTINGS[kind] })), bay)));
    }
  }
  pipe.append(layer);
  const hand = h('p', { class: 'workshop-hand', role: 'status' });
  const tray = h('div', { class: 'workshop-parts', role: 'group', 'aria-label': t('Spare parts on the bench. Choose one, then choose a joint.') }, PARTS.map(([id, name, about]) => h('button', { type: 'button', class: 'workshop-part', 'data-part': id, 'aria-pressed': 'false', onclick: () => { if (busy) return; part = part === id ? null : id; ctx.say(''); paint(); } },
    h('span', { class: 'workshop-art', html: art(id) }), h('span', null, h('b', { text: name }), ' ', h('small', { text: about })), h('em', { class: 'workshop-held', 'aria-hidden': 'true', text: t('in hand') }))));
  const runBtn = h('button', { class: 'wm-btn', type: 'button', text: t('Open the spring'), onclick: go });
  const plumb = h('div', { class: 'workshop-plumb' });
  const partName = (id) => PARTS.find((x) => x[0] === id)[1];
  function paint(note) {
    plumb.classList.toggle('has-hand', !!part && !busy); plumb.classList.toggle('is-busy', busy);
    runBtn.setAttribute('aria-disabled', String(busy)); runBtn.textContent = busy ? t('The spring is running…') : t('Open the spring');
    tray.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.part === part)); b.setAttribute('aria-disabled', String(busy)); });
    joints.forEach((j, i) => {
      if (!j) return; const has = fitted && fitted.joint === i;
      j.state.textContent = has ? partName(fitted.part) : part && !busy ? t('fit it here') : t('empty');
      j.pic.innerHTML = art(has ? fitted.part : 'joint'); j.b.classList.toggle('is-fitted', !!has); j.b.setAttribute('aria-disabled', String(busy));
      j.more.textContent = (i === 1 ? t('It comes straight after the spring.') : t('It comes after this fitting: {fitting}.', { fitting: FITTINGS[P.order[i - 2]] })) + ' '
        + (has ? t('Press to take the part out.') : part ? t('Press to fit this part here: {part}.', { part: partName(part) }) : '');
    });
    hand.textContent = note || (busy ? t('The spring is open. Watch where the numbers go.')
      : part ? t('{part} in hand. Now press the joint where it should go.', { part: partName(part) })
      : fitted ? t('{part} is fitted at joint {n}. Open the spring to try it.', { part: partName(fitted.part), n: fitted.joint })
      : t('Nothing is fitted. Open the spring and watch, then pick up a spare part.'));
    if (last && !busy) show(last, true);                  // the rows may have moved: put the last run's numbers back where they belong
  }
  function fit(j) {
    if (busy) return;
    let note = '';
    if (fitted && fitted.joint === j && (!part || part === fitted.part)) { fitted = null; note = t('Taken out. The line is as it was.'); }
    else if (!part) return paint(t('Pick up a spare part first, then press a joint to fit it in.'));
    else { fitted = { part, joint: j }; note = t('{part} fitted at joint {n}. There is only room for one part. Open the spring to try it.', { part: partName(part), n: j }); part = null; }
    ctx.say(''); paint(note);
  }
  const els = new Map();
  function show(frame, still) {
    last = frame; layer.classList.toggle('is-still', !!still);
    const slot = {}, box = pipe.getBoundingClientRect();
    for (const f of frame) {
      const off = f.state === 'spill' || f.state === 'caught', host = off ? puddles[f.at] : bays[f.at], key = (off ? 'p' : 'b') + f.at + (f.lane ? 'L' : ''), i = slot[key] = (slot[key] || 0) + 1;
      const a = host.getBoundingClientRect(), gap = 22, cols = Math.max(1, Math.floor((a.width - 2) / gap));
      if (off) host.classList.add('is-wet');
      let e = els.get(f.u); if (!e) { e = h('i', { text: f.id }); els.set(f.u, e); layer.append(e); }
      e.className = 'is-' + f.state;
      e.style.transform = `translate(${Math.round(a.left - box.left + 2 + ((i - 1) % cols) * gap)}px, ${Math.round(a.top - box.top + 2 + Math.floor((i - 1) / cols) * gap + (f.lane ? 26 : 0))}px)`;
    }
    if (still) { void layer.offsetWidth; layer.classList.remove('is-still'); }
  }
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (last && !busy) show(last, true); }) : null;
  if (watch) watch.observe(pipe);
  ctx.onLeave(() => { clearTimeout(timer); if (watch) watch.disconnect(); });
  function go() {
    if (busy) return;
    const res = runPipes(P, fitted && fitted.part, fitted && fitted.joint);
    busy = true; last = null; els.clear(); layer.textContent = ''; ctx.say(''); puddles.forEach((d) => d.classList.remove('is-wet')); paint();
    pipe.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'nearest' });
    keep(p.runs, { part: fitted ? fitted.part : null, joint: fitted ? fitted.joint : 0, got: res.sink, spilled: res.spilled, clean: res.clean }); ctx.save();
    let i = ctx.reduced ? res.frames.length - 1 : 0;
    const step = () => {
      show(res.frames[i]);
      if (++i < res.frames.length) { timer = setTimeout(step, 360); return; }
      busy = false; paint();
      const got = res.sink.length ? t('The ledger got: {list}.', { list: res.sink.join(' ') }) : t('The ledger got nothing.');
      if (res.clean) { p.fix = fitted; ctx.say(got + ' ' + t('Every message, once, in order. It runs clean.'), true); settle(); return ctx.done(2400); }
      ctx.say([got,
        res.spilled === 1 ? t('1 message spilled on the floor.') : res.spilled ? t('{n} messages spilled on the floor.', { n: res.spilled }) : '',
        res.stuck === 1 ? t('1 message never came out.') : res.stuck ? t('{n} messages never came out.', { n: res.stuck }) : '',
        fitted ? t('Not clean yet.') : t('Something in the line is not right.')].filter(Boolean).join(' '));
      settle();
    };
    // the verdict is under the pipe: keep both on the screen, so what went wrong can still be seen
    const settle = () => plumb.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'end' });
    step();
  }
  ctx.setHints([
    t('Open the spring with nothing fitted and watch the ledger fill. Is something missing, something there twice, or something out of line?'),
    { valve: t('Messages are landing on the floor. Which fitting were they trying to get into when they fell?'), relay: t('Some numbers reach the ledger twice. Watch for the fitting that one message goes into and two come out of.'), lanes: t('Nothing is lost and nothing is doubled, but the numbers arrive shuffled. Watch which fitting some messages linger in.') }[P.fault],
    { valve: t('The valve takes one message at a time. A holding tank only helps in the joint right before it.'), relay: t('The relay sends some messages twice. A number check stops the repeats, but only somewhere after the relay.'), lanes: t('One of the twin pipes is slow. A sorter puts the numbers back in line, but only somewhere after the twin pipes.') }[P.fault],
  ]);
  const token = (cls, n, text) => h('li', null, h('i', { class: cls, 'aria-hidden': 'true', text: n }), text);
  plumb.append(tray, h('div', { class: 'workshop-go' }, runBtn, hand),
    h('ul', { class: 'workshop-key', 'aria-label': t('What the numbered tokens mean') },
      token('is-flow', '1', t('round: on its way')), token('is-ledger', '1', t('round, in the ledger: arrived')), token('is-spill', '1', t('square, on the floor: spilled')), token('is-caught', '1', t('crossed out: a repeat that was stopped'))),
    h('div', { class: 'workshop-works' }, pipe));
  el.append(
    h('p', { html: t('Messages <b>1 to {n}</b> leave the spring and run down through three fittings to the ledger. The ledger should get <b>each one once, in order</b>. It does not.', { n: P.n }) }),
    h('ol', { class: 'workshop-how' }, h('li', { text: t('Open the spring and watch where the numbers go wrong.') }), h('li', { text: t('Press one spare part to pick it up.') }), h('li', { text: t('Then press a joint in the pipe to fit it there. Only one part fits at a time.') })),
    plumb);
  paint();
}

/* ---------- 4: the photograph ----------
 * A post, its shadow on a compass disc, the sky and a tree. The date stamped on the file is
 * wrong. The answer is right when the sun the hiker dials in would throw nearly the shadow in
 * the photograph, so two months that share a sun are both accepted. */
const RAD = Math.PI / 180;
const fmt = (opts, month) => { try { return new Intl.DateTimeFormat(lang, opts).format(new Date(2001, month, 15)); } catch (e) { return new Intl.DateTimeFormat('en', opts).format(new Date(2001, month, 15)); } };
const MONTHS = Array.from({ length: 12 }, (x, i) => fmt({ month: 'long' }, i)), midMonth = (m) => fmt({ day: 'numeric', month: 'long' }, m);
const COMPASS = [t('north'), t('north-east'), t('east'), t('south-east'), t('south'), t('south-west'), t('west'), t('north-west')];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const clock = (hour) => `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
export function sunAt(lat, month, hour) {
  const dec = -23.44 * Math.cos(2 * Math.PI * (15 + month * 30.4 + 10) / 365) * RAD, H = 15 * (hour - 12) * RAD, la = lat * RAD;
  const east = -Math.cos(dec) * Math.sin(H), north = Math.cos(la) * Math.sin(dec) - Math.sin(la) * Math.cos(dec) * Math.cos(H), up = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H);
  return { alt: Math.asin(up) / RAD, az: (Math.atan2(east, north) / RAD + 360) % 360 };
}
const turn = (a, b) => ((a - b + 540) % 360) - 180;                               // signed degrees from b round to a
export const photoOk = (F, month, hour) => { const s = sunAt(F.lat, month, hour); return s.alt > 0 && Math.abs(turn(s.az, F.sun.az)) <= 12 && Math.abs(s.alt - F.sun.alt) <= 5; };
export function makePhoto(R) {
  for (let a = 0; a < 400; a++) {
    const r = R('photo' + a), lat = pick(r, [36, 44, 52, -34, -42]), month = int(r, 0, 11), hour = int(r, 14, 34) / 2, sun = sunAt(lat, month, hour);
    if (Math.abs(hour - 12) < 1.5 || sun.alt < 22 || sun.alt > 52) continue;        // a shadow with a direction, that fits on the disc
    const wrong = { month: (month + int(r, 4, 8)) % 12, hour: hour < 12 ? hour + int(r, 8, 12) / 2 : hour - int(r, 8, 12) / 2 };
    const F = { lat, month, hour, sun, wrong };
    if (photoOk(F, wrong.month, wrong.hour) || !photoOk(F, month, hour)) continue;
    return F;
  }
  throw new Error('no photograph could be taken');
}
const season = (lat, month) => ['winter', 'spring', 'summer', 'autumn'][Math.floor(((month + (lat < 0 ? 6 : 0) + 1) % 12) / 3)];

function photoSvg(F) {
  const b = (F.sun.az + 180) % 360, len = 1 / Math.tan(F.sun.alt * RAD), cx = 160, cy = 160, U = 42, sq = 0.42, low = F.sun.alt < 32;
  const tx = cx + Math.sin(b * RAD) * len * U, ty = cy - Math.cos(b * RAD) * len * U * sq, nx = Math.cos(b * RAD) * 5, ny = Math.sin(b * RAD) * 5 * sq;
  const se = season(F.lat, F.month), leaf = { summer: '#2f8f6a', spring: '#7fcfa0', autumn: '#b5533c', winter: '' }[se];
  const rings = [1, 2, 3].map((k) => `<ellipse cx="${cx}" cy="${cy}" rx="${k * U}" ry="${k * U * sq}" fill="none" stroke="rgba(255,255,255,.28)" stroke-dasharray="2 5"/>`).join('');
  const tree = `<g transform="translate(46 118)"><path d="M0 0v-34M0-14l-11-10M0-20l10-9M0-28l-6-8" stroke="#3a2c26" stroke-width="3" fill="none" stroke-linecap="round"/>${leaf ? (se === 'spring' ? [[-11, -25], [10, -30], [-6, -37], [1, -36], [6, -22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${leaf}"/>`).join('') : `<circle cx="-7" cy="-30" r="12" fill="${leaf}"/><circle cx="8" cy="-33" r="11" fill="${leaf}"/><circle cx="1" cy="-42" r="10" fill="${leaf}"/>${se === 'autumn' ? '<circle cx="-12" cy="-3" r="2.5" fill="#b5533c"/><circle cx="9" cy="-1" r="2.5" fill="#b5533c"/><circle cx="16" cy="-5" r="2" fill="#b5533c"/>' : ''}`) : ''}</g>`;
  return `<svg viewBox="0 0 320 234" role="img" aria-label="${low ? t('The photograph: a post standing on a flat compass disc, throwing a shadow. A tree stands to one side under a pink, low-lit sky.') : t('The photograph: a post standing on a flat compass disc, throwing a shadow. A tree stands to one side under a clear blue sky.')}">
    <defs><linearGradient id="workshop-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${low ? '#3b4a86' : '#2f6fc0'}"/><stop offset="1" stop-color="${low ? '#e08aa0' : '#a9d2f2'}"/></linearGradient></defs>
    <rect width="320" height="234" fill="#2b3a33"/><rect width="320" height="112" fill="url(#workshop-sky)"/>
    <path d="M0 112 40 92l34 14 46-30 44 26 52-34 50 30 54-18v32z" fill="#27433d"/>
    <rect y="110" width="320" height="124" fill="#35564a"/>${tree}${rings}
    <ellipse cx="${cx}" cy="${cy}" rx="${3 * U + 9}" ry="${(3 * U + 9) * sq}" fill="none" stroke="rgba(255,255,255,.5)"/>
    <g font-family="ui-monospace,Menlo,monospace" font-size="11" font-weight="700" fill="#fff" text-anchor="middle"><text x="${cx}" y="${cy - (3 * U + 9) * sq - 4}">N</text><text x="${cx}" y="${cy + (3 * U + 9) * sq + 13}">S</text><text x="${cx + 3 * U + 19}" y="${cy + 4}">E</text><text x="${cx - 3 * U - 19}" y="${cy + 4}">W</text></g>
    <path d="M${(cx - nx).toFixed(1)} ${(cy - ny).toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}L${(cx + nx).toFixed(1)} ${(cy + ny).toFixed(1)}z" fill="rgba(5,8,15,.72)"/>
    <path d="M${cx} ${cy}v${-U}" stroke="#eef2f8" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy - U}" r="4" fill="#e2483f"/>
  </svg>`;
}
function sketchSvg(alt) {
  const up = alt > 0, len = up ? Math.min(6, 1 / Math.tan(alt * RAD)) : 0, U = 30, x0 = 34, y0 = 62;
  return `<svg viewBox="0 0 240 74" aria-hidden="true"><path d="M6 ${y0}H234" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>
    ${up ? `<path d="M${x0} ${y0}h${(len * U).toFixed(1)}" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-opacity=".8"/><path d="M${x0} ${y0 - U}L${(x0 + len * U).toFixed(1)} ${y0}" stroke="currentColor" stroke-opacity=".4" stroke-dasharray="3 4"/>` : ''}
    <path d="M${x0} ${y0}v${-U}" stroke="var(--wm-accent)" stroke-width="5" stroke-linecap="round"/></svg>`;
}

function photo(el, ctx) {
  const F = makePhoto(ctx.rng), p = ctx.data; p.tries = p.tries || []; p.looked = p.looked || [];
  const bearing = Math.round((F.sun.az + 180) % 360), ratio = (1 / Math.tan(F.sun.alt * RAD)).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), se = season(F.lat, F.month);
  const looks = {
    shadow: [t('The shadow'), t('The shadow is {ratio} times as long as the post. It points {way}: {deg}° on the compass.', { ratio, way: compass(bearing), deg: bearing })],
    sky: [t('The sky'), F.sun.alt < 32 ? t('Pink low down and deep blue above. The sun is not far over the horizon.') : t('Clear blue all the way down, no colour at the horizon. The sun is well up.')],
    tree: [t('The tree'), { summer: t('The tree is in full, dark leaf.'), spring: t('The tree has new buds, small and pale.'), autumn: t('The leaves have turned red, and some are on the ground.'), winter: t('The tree is bare.') }[se]],
  };
  const seen = h('ul', { class: 'workshop-seen', 'aria-live': 'polite' });
  const time = h('input', { type: 'range', min: 5, max: 19, step: 0.25, value: F.wrong.hour, 'aria-label': t('Time of day') }), month = h('input', { type: 'range', min: 0, max: 11, step: 1, value: F.wrong.month, 'aria-label': t('Month') });
  const tOut = h('b'), mOut = h('b'), sunOut = h('p', { class: 'workshop-sun', 'aria-live': 'polite' }), sketch = h('div', { class: 'workshop-sketch' });
  function dial() {
    const s = sunAt(F.lat, +month.value, +time.value);
    tOut.textContent = clock(+time.value); mOut.textContent = MONTHS[+month.value];
    time.setAttribute('aria-valuetext', clock(+time.value)); month.setAttribute('aria-valuetext', MONTHS[+month.value]);
    sunOut.textContent = s.alt > 0 ? t('Then, the sun stood {alt}° above the horizon, in the {way} ({deg}° on the compass).', { alt: Math.round(s.alt), way: compass(s.az), deg: Math.round(s.az) }) : t('Then, the sun was below the horizon.');
    sketch.innerHTML = sketchSvg(s.alt); ctx.say('');
  }
  time.addEventListener('input', dial); month.addEventListener('input', dial);
  function go() {
    const m = +month.value, hour = +time.value, s = sunAt(F.lat, m, hour), dAz = Math.round(turn(s.az, F.sun.az)), dAlt = Math.round(s.alt - F.sun.alt);
    keep(p.tries, { month: m, hour, dAz, dAlt }); ctx.save();
    if (photoOk(F, m, hour)) { Object.assign(p, { month: m, hour }); ctx.say(t('That fits: around {time} in {month}, the post would throw that shadow. The stamp on the file was wrong.', { time: clock(hour), month: MONTHS[m] }), true); return ctx.done(2400); }
    if (s.alt <= 0) return ctx.say(t('It would be dark then: no shadow at all.'));
    ctx.say([t('Not quite.'),
      Math.abs(dAz) <= 12 ? t('Then, the shadow would point the right way.') : t('Then, the shadow would point {got}, not {want}.', { got: compass(s.az + 180), want: compass(bearing) }),
      Math.abs(dAlt) <= 5 ? t('It would be about the right length.') : dAlt > 0 ? t('It would be shorter than the one in the photograph.') : t('It would be longer than the one in the photograph.')].join(' '));
  }
  ctx.setHints([
    t('A shadow points away from the sun. If the shadow lies that way, where was the sun standing?'),
    t('The time of day swings the sun round the compass; put it opposite the shadow. Then the month lifts or lowers it: match the length of the shadow in the little sketch to the one in the photograph.'),
    t('The sun was about {alt}° up, in the {way} ({deg}°). Find that on the two dials.', { alt: Math.round(F.sun.alt), way: compass(F.sun.az), deg: Math.round(F.sun.az) }),
  ]);
  el.append(
    h('p', { html: t('The file says this photograph was taken on <b>{date} at {time}</b>. It was not: the camera\'s clock had been reset. Work out roughly <b>what time of day and what time of year</b> it really was.', { date: midMonth(F.wrong.month), time: clock(F.wrong.hour) }) }),
    h('div', { class: 'workshop-dating' },
      h('div', { class: 'workshop-photo', html: photoSvg(F) }),
      h('div', { class: 'workshop-clues' },
        h('ul', { class: 'rules' }, h('li', { html: F.lat < 0 ? t('Taken at <b>{lat}° south</b>, on flat ground. North is at the back of the disc.', { lat: Math.abs(F.lat) }) : t('Taken at <b>{lat}° north</b>, on flat ground. North is at the back of the disc.', { lat: Math.abs(F.lat) }) }), h('li', { text: t('The rings are one, two and three post-lengths from the post.') }), h('li', { text: t('Times here are sun time: at 12:00 the sun is at its highest.') })),
        h('p', { class: 'workshop-cap', text: t('Look closer at:') }),
        h('div', { class: 'row wrap workshop-looks', role: 'group', 'aria-label': t('Look closer at part of the photograph') }, Object.entries(looks).map(([k, [name, text]]) => {
          const b = h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: name, 'aria-pressed': String(p.looked.includes(k)), onclick: () => {
            if (!p.looked.includes(k)) { p.looked.push(k); ctx.save(); seen.append(h('li', { 'data-look': k, text })); b.setAttribute('aria-pressed', 'true'); }
            else { const li = seen.querySelector(`[data-look="${k}"]`); if (li) { li.classList.remove('is-again'); void li.offsetWidth; li.classList.add('is-again'); } }
          } });
          return b;
        })),
        seen),
      h('div', { class: 'workshop-almanac' },
        h('p', { class: 'workshop-cap', text: t('The almanac: where the sun stood, for any time and month.') }),
        h('label', { class: 'block' }, h('span', null, t('Time of day:'), ' ', tOut), time), h('label', { class: 'block' }, h('span', null, t('Month:'), ' ', mOut), month),
        sunOut, h('p', { class: 'workshop-cap', text: t('The shadow a post would throw then, seen from the side:') }), sketch,
        h('div', { class: 'row' }, h('button', { class: 'wm-btn', type: 'button', text: t('That is when it was taken'), onclick: go })))));
  p.looked.forEach((k) => seen.append(h('li', { 'data-look': k, text: looks[k][1] })));
  dial();
}

/* ---------- 5: the pull request ----------
 * A small change that works. Each line carries what it reads, defines, calls and sends, and
 * trace() follows private data from where it is read to where it leaves the device. The
 * lines on that path are the ones that count; they are worked out, not listed. */
/* short is what is kept with the run (so it stays in English); shown is how the next stage says it */
const SECRETS = [
  { what: t('where the user is'), short: 'their location', shown: t('their location'), field: 'where', call: 'geo.lastPosition()' },
  { what: t('the user\'s whole contact list'), short: 'their contact list', shown: t('their contact list'), field: 'friends', call: 'contacts.all()' },
  { what: t('whatever the user last copied'), short: 'their clipboard', shown: t('their clipboard'), field: 'pasted', call: 'clipboard.readText()' },
];
export function trace(lines) {
  const taint = new Set(), worry = new Set();
  const leaks = (f) => lines.some((l, i) => l.fn === f && l.ret && taint.has(i));
  for (let grew = true; grew;) {
    grew = false;
    lines.forEach((l, i) => {
      if (taint.has(i)) return;
      if (l.secret || (l.uses || []).some((v) => lines.some((m, j) => m.fn === l.fn && m.def === v && taint.has(j))) || (l.calls || []).some(leaks)) { taint.add(i); grew = true; }
    });
  }
  const stack = [...taint].filter((i) => lines[i].net);
  while (stack.length) {
    const i = stack.pop(), l = lines[i]; if (worry.has(i)) continue; worry.add(i);
    lines.forEach((m, j) => { if (taint.has(j) && ((m.fn === l.fn && m.def && (l.uses || []).includes(m.def)) || ((l.calls || []).includes(m.fn) && m.ret))) stack.push(j); });
  }
  for (const i of [...worry]) if (lines[i].secret) lines.forEach((m, j) => { if (m.head === lines[i].fn) worry.add(j); });
  return worry;
}
export function makeReview(R) {
  const r = R('review'), s = pick(r, SECRETS), helper = pick(r, ['extras', 'context', 'details']), inDevice = r() < 0.4, metricsFirst = r() < 0.5;
  const recent = [
    { file: 'recent.js' },
    { t: "import { note } from './metrics.js';" },
    { t: 'const MAX = 5;' },
    { t: 'export function remember(list, trail) {', head: 'remember' },
    { t: '  const rest = list.filter((t) => t.id !== trail.id);', fn: 'remember', def: 'rest' },
    { t: "  note('trail_opened');", fn: 'remember' },
    { t: '  return [trail, ...rest].slice(0, MAX);', fn: 'remember', uses: ['rest'], ret: true },
    { t: '}' },
    { t: 'export function nearest(list) {', head: 'nearest' },
    { t: '  const here = geo.lastPosition();', fn: 'nearest', def: 'here', secret: true },
    { t: '  return list.sort((a, b) => far(a, here) - far(b, here))[0];', fn: 'nearest', uses: ['here'], ret: true },
    { t: '}' },
  ];
  const metrics = [
    { file: 'metrics.js' },
    { t: "const HOST = 'https://stats.example/collect';" },
    { t: 'function device() {', head: 'device' },
    { t: `  return { os: platform.name, ${inDevice ? `${s.field}: ${s.call}` : 'app: VERSION'} };`, fn: 'device', ret: true, secret: inDevice },
    { t: '}' },
    { t: `function ${helper}() {`, head: helper },
    { t: `  return { lang: locale(), ${inDevice ? 'screen: view.name' : `${s.field}: ${s.call}`} };`, fn: helper, ret: true, secret: !inDevice },
    { t: '}' },
    { t: 'export function note(event) {', head: 'note' },
    { t: `  const body = { event, ...device(), ...${helper}() };`, fn: 'note', def: 'body', calls: ['device', helper] },
    { t: '  navigator.sendBeacon(HOST, JSON.stringify(body));', fn: 'note', uses: ['body'], net: true },
    { t: '}' },
    { t: 'export function tile(x, y) {', head: 'tile' },
    { t: '  return fetch(`/tiles/${x}/${y}.png`);', fn: 'tile', ret: true, net: true },
    { t: '}' },
  ];
  const lines = metricsFirst ? [...metrics, ...recent] : [...recent, ...metrics], worry = trace(lines);
  if (!worry.size) throw new Error('the pull request has nothing in it');
  return { lines, worry, secret: s, helper: inDevice ? 'device' : helper };
}

function review(el, ctx) {
  const V = makeReview(ctx.rng), p = ctx.data; p.taps = p.taps || []; p.checks = p.checks || []; p.what = V.secret.short;
  const marked = new Set(p.marked || []), MAXM = 5;
  const text = h('textarea', { rows: 4, maxlength: 1500, placeholder: t('The comment you would leave on this pull request.') }); text.value = p.comment || '';
  text.addEventListener('input', () => { p.comment = text.value; });
  let n = 0;
  const tally = h('p', { class: 'workshop-marks' }), count = () => { tally.textContent = t('Marked: {n} of {max}.', { n: marked.size, max: MAXM }); };
  const code = h('div', { class: 'workshop-diff', role: 'group', 'aria-label': t('The change, line by line. Press a line to mark it.') }, V.lines.map((l, i) => {
    if (l.file) { n = 0; return h('p', { class: 'workshop-file', text: t('{file} (new lines)', { file: l.file }) }); }
    const no = ++n, b = h('button', { type: 'button', class: 'workshop-ln', 'data-mark': t('marked'), 'aria-pressed': String(marked.has(i)), onclick: () => {
      if (!marked.has(i) && marked.size >= MAXM) return ctx.say(t('{max} marks is the most. Take one off to mark another: a review that marks everything says nothing.', { max: MAXM }));
      if (marked.has(i)) marked.delete(i); else marked.add(i);
      b.setAttribute('aria-pressed', String(marked.has(i))); keep(p.taps, (marked.has(i) ? '+' : '-') + i, 80); p.marked = [...marked]; ctx.say(''); count();
    } }, h('span', { text: no }), ' ', h('code', { text: l.t }));
    return b;
  }));
  ctx.setHints([
    t('A review is following a scent. What leaves the device in this change, and what is inside it when it goes?'),
    t('One line sends something to a statistics server. Look at everything that is packed into what it sends, and where each piece comes from.'),
    t('Look inside {fn}() in metrics.js. Does counting an opened trail need that?', { fn: V.helper }),
  ]);
  el.append(
    h('p', { html: t('A small pull request for a trail-notes app. It adds a list of <b>recently opened trails</b>. The tests pass and it works. You are the reviewer.') }),
    h('p', { class: 'hintline', text: t('Press any line that worries you ({max} at most), then write your comment.', { max: MAXM }) }),
    code, tally,
    h('label', { class: 'block' }, h('span', { text: t('Your review comment') }), text),
    h('div', { class: 'row' }, h('button', { class: 'wm-btn', type: 'button', text: t('Send the review'), onclick: () => {
      const comment = text.value.trim(), found = [...marked].some((i) => V.worry.has(i));
      if (!marked.size) return ctx.say(t('Mark at least one line first.'));
      if (comment.length < 15) return ctx.say(t('Leave a comment too: a line or two for the author.'));
      keep(p.checks, { marked: [...marked], found }); p.comment = comment; ctx.save();
      if (!found) return ctx.say(t('Those may be worth a word, but something else in here matters more. Follow what leaves the device.'));
      ctx.say(t('You found it. Every time someone opens a trail, the app quietly sends {what} to a statistics server. The line that does it is inside {fn}().', { what: V.secret.what, fn: V.helper }), true); ctx.done(2600);
    } })));
  count();
}

/* ---------- the decision, and the fire ---------- */
const CLIENT = [
  ['ship', t('<b>Ship it as asked.</b> It is their app and their call.')],
  ['notice', t('<b>Ship it with a clear notice</b> and a switch to turn it off.')],
  ['refuse', t('<b>Refuse to ship it</b> like this, and explain why.')],
  ['leave', t('<b>Walk away</b> from the job.')],
];
/* What is typed at a decision or a fire is kept as it is typed, so a reload puts it back. */
function drafts(el, ctx) {
  el.addEventListener('input', (e) => {
    const box = e.target, d = ctx.data;
    if (box.matches('textarea')) d.said = box.value; else if (box.type === 'radio') d[box.name === 'ai' ? 'ai' : 'option'] = box.value; else d.aiHow = box.value;
  });
}
function client(el, ctx) {
  const kept = ctx.camp.review && ctx.camp.review.what, what = (SECRETS.find((x) => x.short === kept) || SECRETS[0]).shown, options = shuffle(ctx.rng('order'), CLIENT);
  ctx.data.shown = options.map((o) => o[0]);
  drafts(el, ctx);
  decisionStage({
    lead: [t('The line in that pull request was not a slip. The client paying for the app asked for it, and writes back: <b>"We need to know this about our users. Leave it in. It is what we are paying for."</b>'), t('The people using the app have not been told that it sends {what}. The work is two thirds done, and two thirds paid.', { what })],
    options, ask: t('What do you say to the client?'), name: 'workshop-call',
  })(el, ctx);
}

const runs = (n) => (n === 1 ? t('1 run') : t('{n} runs', { n }));
export default {
  id: 'workshop', name: t('The Workshop'), sub: t('Craft'),
  intro: t('Five small things on the bench that do not quite work, a decision about a client, and a fire to sit at.'),
  stages: [
    { id: 'shell', label: t('The one-liner'), title: t('1. Mend the one-liner'), mount: shell, hints: [t('Run it first and read what comes out.')] },
    { id: 'page', label: t('The slow page'), title: t('2. The slow page'), mount: page, hints: [t('Measure before you answer.')] },
    { id: 'pipes', label: t('The plumbing'), title: t('3. A fault in the plumbing'), mount: pipes, hints: [t('Watch it run once with nothing fitted.')] },
    { id: 'photo', label: t('The photograph'), title: t('4. When was this taken?'), mount: photo, hints: [t('A shadow points away from the sun.')] },
    { id: 'review', label: t('The review'), title: t('5. A pull request to review'), mount: review, hints: [t('Follow what leaves the device.')] },
    { id: 'client', label: t('A decision'), title: t('A decision at the bench'), mount: client, hints: [t('Nobody is marking this one. Say what you would really say to them.')] },
    { id: 'fire', label: t('The campfire'), title: t('The campfire'), cls: 'fire', hints: [t('It can be a small thing: a tool, a habit, an app. The why is the part worth telling.')],
      mount: (el, ctx) => { drafts(el, ctx); fireStage({ lead: t('The bench is cleared and a fire is burning outside the workshop door. {guide} is asleep beside it. Someone asks:'), question: t('What is a tool or a technology you stopped using on principle, or kept using even though it had gone out of fashion? Why?') })(el, ctx); } },
  ].map((s) => ({ ...s, mount: (el, ctx) => { el.classList.add('workshop-body'); s.mount(el, ctx); } })),
  tally: (p) => [
    [t('One-liner'), p.shell && p.shell.runs ? runs(p.shell.runs.length) : t('mended')],
    [t('Page loads measured'), p.page && p.page.loads ? p.page.loads.length : 0],
    [t('Plumbing'), p.pipes && p.pipes.runs ? runs(p.pipes.runs.length) : t('fixed')],
    [t('Photograph'), p.photo && p.photo.tries ? (p.photo.tries.length === 1 ? t('1 try') : t('{n} tries', { n: p.photo.tries.length })) : t('dated')],
    [t('Clues looked at'), t('{n} of 3', { n: p.photo && p.photo.looked ? p.photo.looked.length : 0 })],
    [t('Lines marked'), p.review && p.review.marked ? p.review.marked.length : 0],
  ],
};
