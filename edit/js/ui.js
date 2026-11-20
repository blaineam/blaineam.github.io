// DOM helpers. Nothing in the editor builds markup from strings: every piece of text goes in
// through textContent or a property, so content is always escaped.

let uid = 0;
export const id = (p = 'f') => `${p}${++uid}`;

/** h('button', { class: 'btn', onclick: fn, 'aria-label': 'x' }, 'text', node, …) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'open' || k === 'selected' || k === 'multiple' || k === 'required') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  // Elements made here accept arrays and skip null/false in append(), like h() itself does.
  el.append = (...more) => Element.prototype.append.apply(el, norm(more));
  el.append(...kids);
  return el;
}
const norm = (kids) => kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)
  .map((k) => (k instanceof Node ? k : document.createTextNode(String(k))));
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };

/** A labelled text input or textarea. opts: { label, value, oninput, multiline, hint, type, required, placeholder, mono, attrs } */
export function field(opts) {
  const fid = id();
  const input = opts.multiline
    ? h('textarea', { id: fid, rows: opts.rows || 2, class: opts.mono ? 'mono' : '', placeholder: opts.placeholder, required: opts.required, ...(opts.attrs || {}) })
    : h('input', { id: fid, type: opts.type || 'text', class: opts.mono ? 'mono' : '', placeholder: opts.placeholder, required: opts.required, autocomplete: 'off', ...(opts.attrs || {}) });
  input.value = opts.value ?? '';
  if (opts.hint) input.setAttribute('aria-describedby', fid + 'h');
  input.addEventListener('input', () => { if (opts.multiline) grow(input); opts.oninput && opts.oninput(input.value, input); });
  if (opts.multiline) setTimeout(() => input.isConnected && grow(input), 0);
  const wrap = h('div', { class: 'field' + (opts.class ? ' ' + opts.class : '') },
    h('label', { for: fid }, opts.label, opts.required ? h('span', { class: 'req' }, ' (required)') : null),
    input,
    opts.hint ? h('p', { class: 'hint', id: fid + 'h' }, opts.hint) : null);
  wrap.input = input;
  return wrap;
}
export function check(opts) {
  const fid = id();
  const input = h('input', { id: fid, type: 'checkbox', checked: !!opts.value, onchange: () => opts.onchange(input.checked) });
  const wrap = h('div', { class: 'check' }, input, h('label', { for: fid }, opts.label, opts.hint ? h('span', { class: 'hint' }, ' ', opts.hint) : null));
  wrap.input = input;
  return wrap;
}
export function select(opts) {
  const fid = id();
  const input = h('select', { id: fid, onchange: () => opts.onchange(input.value) },
    opts.options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === opts.value }, t); }));
  const wrap = h('div', { class: 'field' + (opts.class ? ' ' + opts.class : '') }, h('label', { for: fid }, opts.label), input, opts.hint ? h('p', { class: 'hint' }, opts.hint) : null);
  wrap.input = input;
  return wrap;
}
export const btn = (label, onclick, cls = '', attrs = {}) => h('button', { type: 'button', class: 'btn ' + cls, onclick, ...attrs }, label);
export const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);

/* ---------- announcements, toasts, dialogs ---------- */
export function announce(text) { const r = document.getElementById('live'); if (r) { r.textContent = ''; setTimeout(() => { r.textContent = text; }, 30); } }
export function toast(text, kind = '') {
  const host = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, text);
  host.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 4000);
}
/** Opens a modal sheet. Returns { dialog, close }. `build(body, close)` fills it. */
export function sheet(title, build, { wide = false, onclose } = {}) {
  const tid = id('d');
  const body = h('div', { class: 'sheet__body' });
  let closed = false;
  // Closing is done here rather than left to the dialog's own "close" event, which browsers
  // deliver late (or not until the next frame) when the page is not being painted.
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    onclose && onclose();
  };
  const dialog = h('dialog', { class: 'sheet' + (wide ? ' sheet--wide' : ''), 'aria-labelledby': tid },
    h('header', { class: 'sheet__head' }, h('h2', { id: tid }, title), btn('Done', close, 'btn--solid')),
    body);
  dialog.addEventListener('close', close);          // Escape key
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  document.body.append(dialog);
  build(body, close);
  dialog.showModal();
  return { dialog, close };
}
/** A yes/no question. Resolves true or false. */
export function confirmBox({ title, body, yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((res) => {
    const tid = id('d');
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      res(answer);
    };
    const dialog = h('dialog', { class: 'sheet sheet--ask', 'aria-labelledby': tid },
      h('h2', { id: tid }, title),
      h('div', { class: 'ask__body' }, body),
      h('div', { class: 'row row--end' },
        btn(no, () => finish(false)),
        btn(yes, () => finish(true), danger ? 'btn--danger' : 'btn--solid')));
    dialog.addEventListener('close', () => finish(false));     // Escape key
    document.body.append(dialog);
    dialog.showModal();
  });
}

/* ---------- drag to reorder, with a keyboard alternative ---------- */
/**
 * Makes the children of `list` reorderable by their `.grip` button.
 * Pointer: drag the grip onto another item. Keyboard: focus the grip, arrow keys move it one
 * place, Home/End move it to either end. onmove(from, to) receives indexes among `itemSelector`.
 */
export function sortable(list, { itemSelector, onmove, label = (i) => `Position ${i + 1}` }) {
  const items = () => [...list.querySelectorAll(itemSelector)];
  let drag = null;
  const target = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(itemSelector) : null;
  };
  const clearMarks = () => items().forEach((it) => it.classList.remove('drop-before', 'drop-after', 'dragging'));
  let scrollTimer = null;
  const autoScroll = (y) => {
    clearInterval(scrollTimer);
    const edge = 70, dy = y < edge ? -14 : y > innerHeight - edge ? 14 : 0;
    if (dy) scrollTimer = setInterval(() => scrollBy(0, dy), 16);
  };
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || !list.contains(grip) || e.button > 0) return;
    const item = grip.closest(itemSelector);
    drag = { item, from: items().indexOf(item), to: null };
    try { grip.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    item.classList.add('dragging');
    e.preventDefault();
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    autoScroll(e.clientY);
    const over = target(e.clientX, e.clientY);
    items().forEach((it) => it.classList.remove('drop-before', 'drop-after'));
    if (!over || over === drag.item || !list.contains(over)) { drag.to = null; return; }
    const all = items(), idx = all.indexOf(over);
    const after = idx > drag.from;
    over.classList.add(after ? 'drop-after' : 'drop-before');
    drag.to = idx;
  });
  const finish = (commit) => {
    if (!drag) return;
    clearInterval(scrollTimer);
    const { from, to } = drag; drag = null; clearMarks();
    if (commit && to !== null && to !== from) onmove(from, to);
  };
  list.addEventListener('pointerup', () => finish(true));
  list.addEventListener('pointercancel', () => finish(false));
  list.addEventListener('keydown', (e) => {
    const grip = e.target.closest && e.target.closest('.grip');
    if (!grip) return;
    const all = items(), from = all.indexOf(grip.closest(itemSelector));
    const to = { ArrowUp: from - 1, ArrowLeft: from - 1, ArrowDown: from + 1, ArrowRight: from + 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined || to < 0 || to >= all.length || to === from) return;
    e.preventDefault();
    onmove(from, to);
    announce(`Moved. ${label(to)} of ${all.length}.`);
    setTimeout(() => { const g = items()[to] && items()[to].querySelector('.grip'); if (g) g.focus(); }, 0);
  });
}
export const move = (arr, from, to) => { const a = [...arr]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
export const gripBtn = (name) => h('button', { type: 'button', class: 'grip', 'aria-label': `Move ${name}. Drag, or use the arrow keys.`, title: 'Drag to move, or use the arrow keys' },
  h('span', { 'aria-hidden': 'true' }, '⋮⋮'));
