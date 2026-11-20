// Photos: the gallery as a grid, with search, the two set filters, an editor for each
// photograph, drag-to-reorder and adding new pictures from files or the camera.
import { h, clear, field, check, btn, sheet, confirmBox, toast, sortable, move, gripBtn, announce } from '../ui.js';
import { state, photoOrder, photoMeta, setPhotoMeta, applyPhotoOrder, clearPhotoOrder, addPhoto, removePhoto, restorePhoto, isPending, localPhotoUrl, draft, setPhotoWatermark, redoWatermarks } from '../store.js';
import { loadWatermark, setWatermarkFile } from '../watermark.js';
import { convertImage, canEncodeWebp, MAX_SIDE } from '../image.js';
import { settings } from '../settings.js';
import { pickMedia, photoItems, photoUpload } from './picker.js';

const TAGS = [['120', 'Landscape & sky'], ['luma', 'Luma']];
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/**
 * Asks for the watermark PNG, keeps it on this device, and redoes the new photographs that
 * want it. Resolves with the prepared mark, or null when nothing was picked.
 */
export function chooseWatermark() {
  return new Promise((res) => {
    const input = h('input', { type: 'file', accept: 'image/png,image/webp,image/*', class: 'vh' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      input.remove();
      if (!f) return res(null);
      try {
        const mark = await setWatermarkFile(f);
        const n = await redoWatermarks({ all: true });
        toast(mark.opaque
          ? 'Saved on this device, but this image has no transparent background, so it would cover the corner as a solid block. Use the PNG with a clear background.'
          : `Watermark saved on this device${n ? ` and added to ${n} new photo${n > 1 ? 's' : ''}` : ''}.`, mark.opaque ? 'bad' : '');
        res(mark);
      } catch (e) { toast(e.message, 'bad'); res(null); }
    });
    input.addEventListener('cancel', () => { input.remove(); res(null); });
    document.body.append(input);
    input.click();
  });
}

/**
 * Converts picked files and queues them as new photographs: resized, WebP, metadata read and
 * then dropped, watermark drawn. Returns the names given to them. Used by the Photos tab and
 * by the media picker's Upload tab, so both behave the same.
 */
export async function importPhotos(files) {
  const names = [];
  for (const f of files) {
    try {
      announce(`Converting ${f.name}`);
      const want = settings().watermark;
      const out = await convertImage(f, { allowJpeg: settings().jpegFallback, mark: want ? await loadWatermark() : null });
      const name = await addPhoto({ ...out, wantMark: want });
      names.push(name);
      toast(`${name}: ${out.width}×${out.height}, ${kb(out.blob.size)} (was ${kb(out.originalBytes)})${out.watermarked ? ', watermarked' : ''}`);
    } catch (e) { toast(e.message, 'bad'); }
  }
  return names;
}

/** An <img> that tries the site's thumbnail, then the full file, then a copy kept in this browser. */
export function photoImg(name, alt = '') {
  const img = h('img', { alt, loading: 'lazy', decoding: 'async' });
  const tries = isPending(name) ? [] : [`../slides/thumbs/${name}`, `../slides/${name}`];
  const next = async () => {
    if (tries.length) { img.src = tries.shift(); return; }
    img.onerror = null;
    const url = await localPhotoUrl(name);
    if (url) img.src = url; else img.classList.add('noimg');
  };
  img.onerror = next;
  next();
  return img;
}

export function photosView(root) {
  let q = '', tag = 'all', reorder = false;
  const grid = h('ul', { class: 'pgrid', 'aria-label': 'Photographs' });
  const removedHost = h('div');
  const count = h('p', { class: 'hint', role: 'status' });
  const search = field({ label: 'Search photos', type: 'search', placeholder: 'Title, description, camera, file name', oninput: (v) => { q = v.toLowerCase(); draw(); } });
  const filters = h('div', { class: 'chipset', role: 'group', 'aria-label': 'Show' });
  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'vh', id: 'pick-photos', onchange: (e) => { add([...e.target.files]); e.target.value = ''; } });
  const shoot = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'vh', id: 'take-photo', onchange: (e) => { add([...e.target.files]); e.target.value = ''; } });
  const reorderBtn = btn('Reorder', () => { reorder = !reorder; if (reorder) { q = ''; tag = 'all'; search.input.value = ''; } draw(); }, '', { 'aria-pressed': 'false' });
  const reorderHelp = h('div', { class: 'callout', hidden: true },
    h('p', null, 'Drag a photo by its handle, or focus the handle and use the arrow keys. The site shows hand-placed photos first, so every photo above the one you move gets an order number, and newer photos land below them until you move them up.'),
    btn('Clear all hand-placed order', async () => {
      if (await confirmBox({ title: 'Clear the order?', body: 'Every photo goes back to newest first.', yes: 'Clear order' })) clearPhotoOrder();
    }));
  const drop = h('div', { class: 'dropzone' },
    h('p', null, h('strong', null, 'Add photos'), ` Pick or drop images, or take one. They are resized to ${MAX_SIDE} px on the long side, saved as WebP and stripped of location and other metadata, and your watermark is added to the bottom-right corner (it can be turned off for any photo). The date taken and the camera details are kept as text.`),
    h('div', { class: 'row' },
      h('label', { for: 'pick-photos', class: 'btn btn--solid' }, 'Choose images'),
      h('label', { for: 'take-photo', class: 'btn' }, 'Take a photo'), pick, shoot));
  const markNote = h('div', { class: 'callout callout--bad', hidden: true },
    h('p', null, h('strong', null, 'No watermark file on this device yet. '), 'New photos are added without it until you choose your watermark PNG (the one with a transparent background). It is kept in this browser only and is not uploaded.'),
    btn('Choose watermark PNG…', async () => { if (await chooseWatermark()) { markNote.hidden = true; draw(); } }, 'btn--sm'));
  const checkMark = () => loadWatermark().then((m) => { markNote.hidden = !!m || !settings().watermark; });
  checkMark();
  const webpNote = h('p', { class: 'callout callout--bad', hidden: true });
  canEncodeWebp().then((ok) => {
    if (ok) return;
    webpNote.hidden = false;
    webpNote.classList.toggle('callout--bad', !settings().jpegFallback);
    webpNote.textContent = settings().jpegFallback
      ? 'This browser cannot write WebP files, so new photos are uploaded as resized JPEG (metadata removed) and the site build turns them into WebP during the deploy.'
      : 'This browser cannot write WebP files and JPEG upload is turned off in Settings, so photos cannot be added from it.';
  });

  root.append(h('div', { class: 'view-head' }, h('h2', null, 'Photos'), count), drop, markNote, webpNote,
    h('div', { class: 'toolbar' }, search, filters, reorderBtn, btn('Choose featured…', chooseFeatured)), reorderHelp, grid, removedHost);

  /** The photographs shown on the home page before “Show all”, picked in one go. */
  async function chooseFeatured() {
    const was = photoOrder().filter((n) => photoMeta(n).featured);
    const now = await pickMedia({ title: 'Featured photographs', multiple: true, selected: was, items: photoItems, upload: photoUpload, confirm: 'Feature these',
      hint: 'Tick the photographs the home page shows before “Show all”. Highlight one to see it large first.' });
    if (!now) return;
    for (const n of was) if (!now.includes(n)) setPhotoMeta(n, { featured: false }, true);
    for (const n of now) if (!was.includes(n)) setPhotoMeta(n, { featured: true }, true);
    checkMark(); draw();
  }

  for (const ev of ['dragenter', 'dragover']) root.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) drop.classList.remove('over'); });
  root.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault(); drop.classList.remove('over');
    add([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif|tiff?)$/i.test(f.name)));
  });

  async function add(files) {
    if (!files.length) return;
    const [first] = await importPhotos(files);
    checkMark();
    if (first) editPhoto(first);
  }

  sortable(grid, {
    itemSelector: 'li.ptile',
    label: (i) => `Position ${i + 1}`,
    onmove: (from, to) => applyPhotoOrder(move(photoOrder(), from, to)),
  });

  function draw() {
    const all = photoOrder();
    const filterDefs = [['all', 'All'], ...TAGS, ['noalt', 'No description'], ['new', 'New']];
    clear(filters).append(...filterDefs.map(([v, t]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(tag === v), disabled: reorder && v !== 'all',
      onclick: () => { tag = v; draw(); },
    }, t)));
    reorderBtn.setAttribute('aria-pressed', String(reorder));
    reorderBtn.textContent = reorder ? 'Done reordering' : 'Reorder';
    reorderHelp.hidden = !reorder;
    search.input.disabled = reorder;

    const shown = all.filter((n) => {
      const m = photoMeta(n);
      if (tag === 'noalt' && m.alt) return false;
      if (tag === 'new' && !isPending(n)) return false;
      if ((tag === '120' || tag === 'luma') && !(m.tags || []).includes(tag)) return false;
      return !q || [n, m.title, m.caption, m.alt, m.camera || (state.photoExif[n] || {}).camera, m.taken].some((s) => s && String(s).toLowerCase().includes(q));
    });
    count.textContent = `${shown.length} of ${all.length} shown` + (state.removed.length ? ` · ${state.removed.length} to be deleted` : '');
    clear(grid).append(...shown.map((name) => {
      const m = photoMeta(name);
      const label = `${m.title || m.alt || name}${isPending(name) ? ' (new)' : ''}${m.alt ? '' : ' (no description)'}`;
      return h('li', { class: 'ptile' + (m.featured ? ' is-feat' : ''), 'data-name': name },
        h('button', { type: 'button', class: 'ptile__open', 'aria-label': `Edit ${label}`, onclick: () => editPhoto(name) },
          photoImg(name, ''),
          h('span', { class: 'ptile__badges' },
            isPending(name) ? h('span', { class: 'badge badge--new' }, 'New') : null,
            isPending(name) && !(state.pending.find((p) => p.name === name) || {}).wmDone ? h('span', { class: 'badge' }, 'No watermark') : null,
            m.featured ? h('span', { class: 'badge' }, 'Featured') : null,
            m.alt ? null : h('span', { class: 'badge badge--bad' }, 'No description')),
          m.title ? h('span', { class: 'ptile__t' }, m.title) : null),
        reorder ? gripBtn(m.title || name) : null);
    }));
    if (!shown.length) grid.append(h('li', { class: 'empty' }, 'No photos match.'));
    clear(removedHost); if (state.removed.length) removedHost.append(removedBox());
  }
  const removedBox = () => h('div', { class: 'callout' }, h('p', null, 'To be deleted when you commit:'),
    h('ul', { class: 'plain' }, state.removed.map((n) => h('li', { class: 'row' }, h('span', { class: 'mono' }, n), btn('Keep it', () => restorePhoto(n))))));

  function editPhoto(name) {
    sheet(isPending(name) ? `New photo · ${name}` : name, (body, close) => {
      const m = photoMeta(name);
      const pending = state.pending.find((p) => p.name === name);
      const tags = new Set(m.tags || []);
      const found = state.photoExif[name] || {};
      const got = new Set((pending && pending.fromPhoto) || []);
      const from = (k) => (got.has(k) ? 'From the photo.' : null);
      const num = (v, whole) => (v === '' ? undefined : whole ? Math.round(Number(v)) : Number(v));
      const infoText = () => (pending ? `${pending.width}×${pending.height} · ${kb(pending.bytes)} · will be saved as slides/${pending.file}` : `slides/${name}`);
      const info = h('p', { class: 'hint mono' }, infoText());
      const imgHost = h('div', { class: 'pedit__pic' }, photoImg(name, m.alt || ''));
      const markHost = h('div');
      const drawMark = async () => {
        if (!pending) return;
        const have = await loadWatermark();
        const full = await localPhotoUrl(name);
        const box = check({
          label: 'Watermark in the bottom-right corner', value: !!pending.wm,
          hint: pending.wm && !pending.wmDone ? '(wanted, but there is no watermark file on this device yet)' : '(sized and placed like the other photos on the site)',
          onchange: async (on) => {
            box.input.disabled = true;
            try { await setPhotoWatermark(name, on); } catch (e) { toast(e.message, 'bad'); }
            clear(imgHost).append(photoImg(name, photoMeta(name).alt || ''));
            info.textContent = infoText();
            announce(pending.wmDone ? 'Watermark added.' : 'Watermark removed.');
            drawMark();
          },
        });
        clear(markHost).append(box,
          have ? null : h('div', { class: 'row' }, btn('Choose watermark PNG…', async () => {
            if (!(await chooseWatermark())) return;
            if (pending.wm && !pending.wmDone) await setPhotoWatermark(name, true).catch((e) => toast(e.message, 'bad'));
            clear(imgHost).append(photoImg(name, photoMeta(name).alt || '')); info.textContent = infoText(); drawMark();
          }, 'btn--sm')),
          full ? h('p', { class: 'hint' }, h('a', { href: full, target: '_blank', rel: 'noopener' }, 'Open the file that will be uploaded at full size'), ' to check the corner.') : null);
      };
      drawMark();
      const alt = field({
        label: 'Description for people who cannot see it (alt text)', multiline: true, value: m.alt, required: !!pending,
        hint: 'One plain sentence saying what is in the picture.', oninput: (v) => setPhotoMeta(name, { alt: v }),
      });
      const seqMove = (fn) => { const seq = photoOrder(); const i = seq.indexOf(name); const to = fn(i, seq.length); if (to !== i && to >= 0 && to < seq.length) { applyPhotoOrder(move(seq, i, to)); pos.textContent = position(); } };
      const position = () => { const seq = photoOrder(); return `Position ${seq.indexOf(name) + 1} of ${seq.length}`; };
      const pos = h('p', { class: 'hint', role: 'status' }, position());
      const uses = Object.entries(draft('site').views || {}).filter(([, v]) => (v.hero || []).includes(name)).map(([k]) => k);
      body.append(
        h('div', { class: 'pedit' },
          h('div', { class: 'pedit__img' }, imgHost, info, markHost),
          h('div', { class: 'pedit__form' },
            alt,
            field({ label: 'Title', value: m.title, hint: `${got.has('title') ? 'From the photo. ' : ''}Optional. Shown on the photo.`, oninput: (v) => setPhotoMeta(name, { title: v }) }),
            field({ label: 'Caption', multiline: true, value: m.caption, hint: `${got.has('caption') ? 'From the photo. ' : ''}Optional. Shown when the photo is opened.`, oninput: (v) => setPhotoMeta(name, { caption: v }) }),
            h('fieldset', null, h('legend', null, 'Sets'),
              TAGS.map(([v, t]) => check({ label: t, value: tags.has(v), onchange: (on) => { on ? tags.add(v) : tags.delete(v); setPhotoMeta(name, { tags: [...tags] }, true); } })),
              check({ label: 'Featured', hint: '(shown on the home page before “Show all”)', value: !!m.featured, onchange: (on) => setPhotoMeta(name, { featured: on }, true) })),
            h('fieldset', null, h('legend', null, 'Place in the gallery'), pos,
              h('div', { class: 'row' },
                btn('To the top', () => seqMove(() => 0)), btn('Earlier', () => seqMove((i) => i - 1)), btn('Later', () => seqMove((i) => i + 1))),
              field({ label: 'Order number', type: 'number', value: m.order ?? '', hint: 'Optional. Higher shows first; photos without one follow, newest first.',
                oninput: (v) => { setPhotoMeta(name, { order: v === '' ? undefined : Number(v) }, true); pos.textContent = position(); } })),
            h('fieldset', null, h('legend', null, 'Camera details'),
              pending
                ? h('p', { class: 'hint' }, got.size ? 'Filled in from the photo where it says so. Change or empty anything; an empty field is simply left out. Location, serial numbers and owner names are never read, and the uploaded file carries no metadata at all.' : 'This file carried no camera details. Fill in what you like; all of it is optional.')
                : (found.settings || found.lens) ? h('p', { class: 'hint' }, `From the original: ${[found.lens, found.settings].filter(Boolean).join(' · ')}. A value typed here replaces it.`) : null,
              h('div', { class: 'grid2' },
                field({ label: 'Date taken', type: 'date', value: m.taken, hint: from('taken') || (found.taken ? `Empty uses ${found.taken}, read from the original.` : null), oninput: (v) => setPhotoMeta(name, { taken: v }) }),
                field({ label: 'Camera', value: m.camera, placeholder: found.camera || '', hint: from('camera') || (found.camera ? `Empty uses “${found.camera}”, read from the original.` : null), oninput: (v) => setPhotoMeta(name, { camera: v }) })),
              field({ label: 'Lens', value: m.lens, placeholder: found.lens || '', hint: from('lens'), oninput: (v) => setPhotoMeta(name, { lens: v }) }),
              h('div', { class: 'grid4' },
                field({ label: 'Focal length (35 mm equiv.)', type: 'number', value: m.focal35 ?? '', hint: from('focal35'), attrs: { min: 1, step: 1, inputmode: 'numeric' }, oninput: (v) => setPhotoMeta(name, { focal35: num(v, true) }) }),
                field({ label: 'Aperture (f/)', type: 'number', value: m.aperture ?? '', hint: from('aperture'), attrs: { min: 0.5, step: 0.1, inputmode: 'decimal' }, oninput: (v) => setPhotoMeta(name, { aperture: v === '' ? undefined : Math.round(Number(v) * 10) / 10 }) }),
                field({ label: 'Shutter (s)', value: m.shutter, placeholder: '1/250', hint: from('shutter'), oninput: (v) => setPhotoMeta(name, { shutter: v.trim() }) }),
                field({ label: 'ISO', type: 'number', value: m.iso ?? '', hint: from('iso'), attrs: { min: 1, step: 1, inputmode: 'numeric' }, oninput: (v) => setPhotoMeta(name, { iso: num(v, true) }) })),
              h('div', { class: 'row row--end' }, btn('Clear camera details', (e) => {
                setPhotoMeta(name, { taken: '', camera: '', lens: '', focal35: undefined, aperture: undefined, shutter: '', iso: undefined });
                e.target.closest('fieldset').querySelectorAll('input').forEach((i) => { i.value = ''; });
                announce('Camera details cleared.');
              }, 'btn--sm'))),
            uses.length ? h('p', { class: 'hint' }, `Used as a hero photograph in: ${uses.join(', ')}.`) : null,
            h('div', { class: 'row row--end' },
              btn(pending ? 'Remove this new photo' : 'Delete photo…', async () => {
                if (state.protectedPhotos.has(name)) return toast(`${name} is named inside the site build and cannot be deleted from here.`, 'bad');
                if (uses.length) return toast(`${name} is a hero photograph of the ${uses.join(', ')} view. Take it out under Text → Switches first.`, 'bad');
                const ok = await confirmBox({
                  title: pending ? 'Remove this new photo?' : `Delete ${name}?`, danger: true, yes: pending ? 'Remove' : 'Delete',
                  body: pending ? 'It has not been saved anywhere yet.' : 'The file and its details are removed from the site at the next commit. Nothing happens until you commit, and you can undo it before then.',
                });
                if (ok) { removePhoto(name); close(); }
              }, 'btn--danger')))));
      if (pending) alt.input.focus();
    }, { wide: true, onclose: draw });
  }

  return { draw };
}
