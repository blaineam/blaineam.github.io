// The media picker: one dialog for every place the editor asks for a picture that is already
// on the site. A grid of thumbnails with search and filters, a large preview of the
// highlighted item with its details, an Upload tab that runs the same processing as any other
// upload, and Select / Cancel. Works with a keyboard (the grid is a listbox: arrow keys move,
// Space ticks, Enter chooses) and announces what is highlighted and how many are chosen.
import { h, clear, field, select, btn, id, toast, announce } from '../ui.js';
import { state, photoOrder, photoMeta, isPending, localPhotoUrl, fileUrl } from '../store.js';
import { photoImg, importPhotos } from './photos.js';

const TAG_NAMES = { 120: 'Landscape & sky', luma: 'Luma', nova: 'Nova', featured: 'Featured', new: 'New', nodesc: 'No description' };

/** Every photograph in the gallery, as picker items. */
export function photoItems() {
  return photoOrder().map((name) => {
    const m = photoMeta(name), x = state.photoExif[name] || {};
    const camera = m.camera || x.camera || '', taken = m.taken || x.taken || '';
    const tags = [...(m.tags || []), ...(m.featured ? ['featured'] : []), ...(isPending(name) ? ['new'] : []), ...(m.alt ? [] : ['nodesc'])];
    return {
      id: name, kind: 'Photographs', title: m.title || m.alt || name,
      text: [name, m.title, m.caption, m.alt, camera, taken].filter(Boolean).join(' ').toLowerCase(),
      img: () => photoImg(name, ''), large: async () => (await localPhotoUrl(name)) || `../slides/${name}`,
      tags, camera, year: taken.slice(0, 4),
      details: [['File', `slides/${name}`], ['Title', m.title], ['Caption', m.caption], ['Description', m.alt],
        ['Sets', tags.filter((t) => t !== 'nodesc').map((t) => TAG_NAMES[t] || t).join(', ')], ['Camera', camera], ['Lens', m.lens || x.lens], ['Taken', taken]],
    };
  });
}
/** The Upload tab for photographs: the usual conversion, metadata reading and watermark. */
export const photoUpload = {
  label: 'Add photographs', multiple: true,
  hint: 'Resized, saved as WebP, stripped of location and other metadata, and watermarked, exactly as on the Photos tab. Each new photo still needs a description before it can be committed.',
  handle: (files) => importPhotos(files),
};
/** Files in the repository (or waiting in this browser), as picker items. */
export function fileItems(paths, { kind, group = '', note = () => '' } = {}) {
  return paths.map((path) => {
    const base = path.slice(path.lastIndexOf('/') + 1);
    return {
      id: path, kind, group, title: base.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), text: path.toLowerCase(),
      img: () => { const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', onerror: () => img.classList.add('noimg') }); fileUrl(path).then((u) => { img.src = u; }); return img; },
      large: () => fileUrl(path), tags: [], camera: '', year: '',
      details: [['File', path], ['Folder', group], ['Used by', note(path)]],
    };
  });
}

/**
 * Opens the picker. Resolves with the chosen ids (in order), or null when cancelled.
 * opts: { title, items: () => item[] | Promise<item[]>, multiple, selected: id[], confirm, hint,
 *         upload: { label, hint, multiple, accept, handle(files) → Promise<id[]> } }
 */
export function pickMedia(opts) {
  return new Promise((resolve) => {
    const multiple = !!opts.multiple;
    let items = [], shown = [], chosen = [...(opts.selected || [])], active = null;
    let q = '', kind = '', tag = '', camera = '', year = '', group = '', done = false;
    const tid = id('d'), helpId = id('d');
    const finish = (value) => { if (done) return; done = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };

    const grid = h('ul', { class: 'mp__grid', role: 'listbox', 'aria-multiselectable': multiple ? 'true' : null, 'aria-label': opts.title, 'aria-describedby': helpId });
    const status = h('p', { class: 'hint mp__status', role: 'status' });
    const view = h('aside', { class: 'mp__view', 'aria-label': 'Preview of the highlighted item' });
    const filters = h('div', { class: 'mp__filters' });
    const search = field({ label: 'Search', type: 'search', placeholder: 'Title, caption, description, file name', class: 'mp__search', oninput: (v) => { q = v.trim().toLowerCase(); draw(); } });
    const ok = btn(opts.confirm || 'Select', () => finish(chosen.filter((c) => items.some((i) => i.id === c) || (opts.selected || []).includes(c))), 'btn--solid');
    const libTab = h('button', { type: 'button', role: 'tab', class: 'mp__tab', 'aria-selected': 'true', onclick: () => tab('lib') }, 'Library');
    const upTab = opts.upload ? h('button', { type: 'button', role: 'tab', class: 'mp__tab', 'aria-selected': 'false', onclick: () => tab('up') }, 'Upload') : null;
    const lib = h('div', { class: 'mp__lib', role: 'tabpanel' },
      h('div', { class: 'mp__tools' }, search, filters), status,
      h('p', { class: 'vh', id: helpId }, multiple ? 'Arrow keys move through the pictures. Space or Enter ticks or unticks the highlighted one. Tab moves on to the preview and the Select button.' : 'Arrow keys move through the pictures. Space chooses the highlighted one; Enter chooses it and closes.'),
      h('div', { class: 'mp__split' }, h('div', { class: 'mp__scroll' }, grid), view));
    const upStatus = h('p', { class: 'hint', role: 'status' });
    const upInput = opts.upload ? h('input', { type: 'file', accept: opts.upload.accept || 'image/*', multiple: opts.upload.multiple !== false, class: 'vh', id: id('up'), onchange: (e) => { const fs = [...e.target.files]; e.target.value = ''; upload(fs); } }) : null;
    const up = opts.upload ? h('div', { class: 'mp__up', role: 'tabpanel', hidden: true },
      h('div', { class: 'dropzone mp__drop' }, h('p', null, h('strong', null, opts.upload.label || 'Upload'), ' ', opts.upload.hint || ''),
        h('div', { class: 'row' }, h('label', { for: upInput.id, class: 'btn btn--solid' }, 'Choose files'), upInput), upStatus)) : null;
    const dialog = h('dialog', { class: 'sheet sheet--wide mp', 'aria-labelledby': tid },
      h('header', { class: 'sheet__head' }, h('h2', { id: tid }, opts.title), h('div', { class: 'row' }, btn('Cancel', () => finish(null)), ok)),
      h('div', { class: 'mp__body' },
        opts.hint ? h('p', { class: 'hint' }, opts.hint) : null,
        upTab ? h('div', { class: 'mp__tabs', role: 'tablist', 'aria-label': 'Where from' }, libTab, upTab) : null,
        lib, up));
    dialog.addEventListener('close', () => finish(null));       // Escape
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(null); });

    function tab(which) {
      libTab.setAttribute('aria-selected', String(which === 'lib'));
      if (upTab) { upTab.setAttribute('aria-selected', String(which === 'up')); up.hidden = which !== 'up'; }
      lib.hidden = which !== 'lib';
    }
    if (up) {
      for (const ev of ['dragenter', 'dragover']) dialog.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); tab('up'); up.firstChild.classList.add('over'); } });
      dialog.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); up.firstChild.classList.remove('over'); upload([...e.dataTransfer.files]); });
    }
    async function upload(files) {
      if (!files.length) return;
      upStatus.textContent = `Preparing ${files.length} file${files.length > 1 ? 's' : ''}…`;
      let ids = [];
      try { ids = (await opts.upload.handle(files)) || []; } catch (e) { toast(e.message, 'bad'); }
      upStatus.textContent = ids.length ? '' : 'Nothing was added.';
      if (!ids.length) return;
      await reload(); drawFilters();
      chosen = multiple ? [...new Set([...chosen, ...ids])] : [ids[ids.length - 1]];
      q = ''; search.input.value = ''; kind = tag = camera = year = group = '';
      tab('lib'); active = ids[0]; draw();
      const el = grid.querySelector('[aria-current="true"]'); if (el) el.focus();
      announce(`${ids.length} added and chosen.`);
    }

    async function reload() { items = (await opts.items()) || []; items.forEach((it) => { it._img = null; }); }
    const uniq = (key) => [...new Set(items.flatMap((i) => (Array.isArray(i[key]) ? i[key] : [i[key]])).filter(Boolean))];
    function drawFilters() {
      const chips = (label, values, cur, set, names = {}) => (values.length > 1 || (values.length === 1 && label === 'Show') ? h('div', { class: 'chipset', role: 'group', 'aria-label': label },
        [['', 'All'], ...values.map((v) => [v, names[v] || v])].map(([v, t]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur === v), onclick: () => { set(v); drawFilters(); draw(); } }, t))) : null);
      const pick = (label, values, cur, set) => (values.length > 1 ? select({ label, value: cur, options: [['', 'Any'], ...values], onchange: (v) => { set(v); draw(); }, class: 'mp__sel' }) : null);
      const kinds = uniq('kind'), tags = uniq('tags').sort((a, b) => Object.keys(TAG_NAMES).indexOf(String(a)) - Object.keys(TAG_NAMES).indexOf(String(b)));
      clear(filters).append(
        kinds.length > 1 ? chips('Kind', kinds, kind, (v) => { kind = v; }) : null,
        tags.length ? chips('Show', tags, tag, (v) => { tag = v; }, TAG_NAMES) : null,
        chips('Folder', uniq('group'), group, (v) => { group = v; }),
        h('div', { class: 'mp__sels' }, pick('Camera', uniq('camera').sort(), camera, (v) => { camera = v; }), pick('Year', uniq('year').sort().reverse(), year, (v) => { year = v; })));
    }

    const isOn = (i) => chosen.includes(i);
    function toggle(itemId, forceOn = false) {
      if (multiple) chosen = isOn(itemId) && !forceOn ? chosen.filter((c) => c !== itemId) : [...chosen.filter((c) => c !== itemId), itemId];
      else chosen = [itemId];
      active = itemId;
      mark(); drawView();
    }
    function highlight(itemId) { if (active === itemId) return; active = itemId; mark(); drawView(); }
    function mark() {
      for (const li of grid.children) {
        const on = isOn(li.dataset.id), cur = li.dataset.id === active;
        li.setAttribute('aria-selected', String(on)); li.setAttribute('aria-current', String(cur)); li.tabIndex = cur ? 0 : -1;
      }
      if (!grid.querySelector('[tabindex="0"]') && grid.firstElementChild && grid.firstElementChild.dataset.id) grid.firstElementChild.tabIndex = 0;
      const n = chosen.length;
      ok.textContent = multiple ? `${opts.confirm || 'Select'} (${n})` : opts.confirm || 'Select';
      ok.disabled = !multiple && !n;
      status.textContent = `${shown.length} of ${items.length} shown${multiple ? ` · ${n} chosen` : n ? ` · chosen: ${(items.find((i) => i.id === chosen[0]) || { title: chosen[0] }).title}` : ''}`;
    }
    function draw() {
      shown = items.filter((i) => (!q || i.text.includes(q)) && (!kind || i.kind === kind) && (!tag || (i.tags || []).includes(tag)) && (!camera || i.camera === camera) && (!year || i.year === year) && (!group || i.group === group));
      if (!shown.some((i) => i.id === active)) active = null;
      clear(grid).append(...shown.map((it) => h('li', {
        class: 'mp__item', role: 'option', 'data-id': it.id, tabindex: -1, 'aria-label': `${it.title}${it.kind ? `, ${it.kind.toLowerCase()}` : ''}`,
        onclick: () => toggle(it.id), onfocus: () => highlight(it.id),
        ondblclick: () => { if (!multiple) { toggle(it.id, true); ok.click(); } },
      }, it._img || (it._img = it.img()), h('span', { class: 'mp__tick', 'aria-hidden': 'true' }, '✓'), h('span', { class: 'mp__cap', 'aria-hidden': 'true' }, it.title))));
      if (!shown.length) grid.append(h('li', { class: 'empty', role: 'presentation' }, items.length ? 'Nothing matches. Clear the search or the filters.' : 'There is nothing here yet. Use the Upload tab.'));
      mark(); drawView();
    }
    grid.addEventListener('keydown', (e) => {
      const els = [...grid.querySelectorAll('.mp__item')];
      const i = els.indexOf(document.activeElement);
      if (i < 0) return;
      const cols = Math.max(1, els.filter((x) => x.offsetTop === els[0].offsetTop).length);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: els.length - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); const el = els[Math.max(0, Math.min(els.length - 1, to))]; highlight(el.dataset.id); el.focus(); el.scrollIntoView({ block: 'nearest' }); return; }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const itemId = els[i].dataset.id;
        if (multiple) { toggle(itemId); announce(isOn(itemId) ? 'Chosen.' : 'Not chosen.'); }
        else { toggle(itemId, true); if (e.key === 'Enter') ok.click(); else announce('Chosen.'); }
      }
    });

    let viewFor = null;
    async function drawView() {
      const it = items.find((i) => i.id === active);
      if (!it) { viewFor = null; clear(view).append(h('p', { class: 'hint mp__none' }, 'Highlight a picture to see it large, with its details, before choosing.')); return; }
      if (viewFor === it.id) { const b = view.querySelector('.mp__pick'); if (b) b.textContent = pickLabel(it); return; }
      viewFor = it.id;
      const img = h('img', { class: 'mp__big', alt: (it.details.find((d) => d[0] === 'Description') || [])[1] || it.title, decoding: 'async' });
      const size = h('span');
      img.addEventListener('load', () => { if (img.naturalWidth) size.textContent = `${img.naturalWidth}×${img.naturalHeight}`; });
      const rows = [...it.details.filter(([, v]) => v), ['Size', size]];
      clear(view).append(
        h('button', { type: 'button', class: 'mp__zoom', 'aria-label': `View ${it.title} at full size`, onclick: () => zoom(it, img.src) }, img),
        h('h3', { class: 'mp__title' }, it.title),
        h('dl', { class: 'mp__dl' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--sm mp__pick', onclick: () => { toggle(it.id); } }, pickLabel(it)),
          btn('View full size', () => zoom(it, img.src), 'btn--sm')));
      const url = await it.large();
      if (viewFor === it.id) img.src = url;
    }
    const pickLabel = (it) => (multiple ? (isOn(it.id) ? 'Remove from selection' : 'Add to selection') : isOn(it.id) ? 'Chosen' : 'Choose this one');
    function zoom(it, src) {
      if (!src) return;
      const z = h('dialog', { class: 'sheet mp__zoomed', 'aria-label': it.title },
        h('header', { class: 'sheet__head' }, h('h2', null, it.title), btn('Back', () => { z.close(); z.remove(); }, 'btn--solid')),
        h('img', { src, alt: view.querySelector('.mp__big') ? view.querySelector('.mp__big').alt : it.title }));
      z.addEventListener('close', () => z.remove());
      z.addEventListener('click', (e) => { if (e.target === z) { z.close(); z.remove(); } });
      document.body.append(z); z.showModal();
    }

    document.body.append(dialog);
    status.textContent = 'Loading…';
    dialog.showModal();
    reload().then(() => {
      drawFilters();
      active = chosen.find((c) => items.some((i) => i.id === c)) || null;
      draw();
      const cur = grid.querySelector('[aria-current="true"]');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
      if (matchMedia('(pointer: coarse)').matches && cur) cur.focus(); else search.input.focus();      // no keyboard popping up on a phone
    }).catch((e) => { status.textContent = `The pictures could not be listed (${e.message}).`; });
  });
}
