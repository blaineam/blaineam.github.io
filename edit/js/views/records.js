// A list of records, each a fold-out form, with add / remove / reorder. Used by the resume
// lists and the seasons. Fields are described by a small schema so unknown keys in a record
// are never touched.
import { h, clear, field, check, select, btn, confirmBox, sortable, move, gripBtn, lines } from '../ui.js';

/**
 * opts: { title, get(): array, set(array), fields: [{ key, label, type?: 'text'|'long'|'list'|'bool'|'number'|'select', options?, hint?, optional? }],
 *         summary(item): string, blank(): object, noun, onchange(structural) }
 */
export function recordList(opts) {
  const host = h('section', { class: 'records' });
  const list = h('ul', { class: 'reclist' });
  const openSet = new Set();
  const draw = () => {
    const items = opts.get();
    clear(list).append(...items.map((item, i) => {
      const sum = h('span', { class: 'rec__sum' }, opts.summary(item) || `(${opts.noun} ${i + 1})`);
      const setKey = (f, v) => {
        if (f.optional && (v === '' || v === false || v === undefined || (Array.isArray(v) && !v.length))) delete item[f.key];
        else item[f.key] = v;
        sum.textContent = opts.summary(item) || `(${opts.noun} ${i + 1})`;
        opts.onchange(false);
      };
      const form = opts.fields.filter((f) => !f.show || f.show(item)).map((f) => {
        const v = item[f.key];
        if (f.type === 'bool') return check({ label: f.label, hint: f.hint, value: !!v, onchange: (on) => setKey(f, on) });
        if (f.type === 'select') return select({ label: f.label, hint: f.hint, value: v ?? '', options: f.options, onchange: (x) => setKey(f, x) });
        if (f.type === 'list') return field({ label: f.label, multiline: true, rows: 3, value: (v || []).join('\n'), hint: f.hint || 'One per line.', oninput: (x) => setKey(f, lines(x)) });
        if (f.type === 'number') return field({ label: f.label, type: 'number', value: v ?? '', hint: f.hint, oninput: (x) => setKey(f, x === '' ? '' : Number(x)) });
        return field({ label: f.label, multiline: f.type === 'long', value: v ?? '', hint: f.hint, placeholder: f.placeholder, oninput: (x) => setKey(f, x) });
      });
      const det = h('details', { class: 'rec', open: openSet.has(i), ontoggle: () => { det.open ? openSet.add(i) : openSet.delete(i); } },
        h('summary', null, sum),
        h('div', { class: 'rec__body' }, form,
          h('div', { class: 'row row--end' }, btn(`Remove this ${opts.noun}`, async () => {
            if (!(await confirmBox({ title: `Remove this ${opts.noun}?`, body: opts.summary(item) || '', yes: 'Remove', danger: true }))) return;
            opts.set(opts.get().filter((_, j) => j !== i)); openSet.clear(); opts.onchange(true); draw();
          }, 'btn--danger'))));
      return h('li', { class: 'recrow' }, gripBtn(opts.summary(item) || opts.noun), det);
    }));
    if (!items.length) list.append(h('li', { class: 'empty' }, `No ${opts.noun}s yet.`));
  };
  sortable(list, { itemSelector: 'li.recrow', onmove: (from, to) => { opts.set(move(opts.get(), from, to)); openSet.clear(); opts.onchange(true); draw(); } });
  host.append(h('div', { class: 'view-head' }, h('h3', null, opts.title),
    opts.blank ? btn(`Add ${opts.noun}`, () => { opts.set([opts.blank(), ...opts.get()]); openSet.clear(); openSet.add(0); opts.onchange(true); draw(); }) : null),
    opts.intro ? h('p', { class: 'hint' }, opts.intro) : null, list);
  draw();
  host.draw = draw;
  return host;
}
