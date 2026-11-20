// Projects: the timeline from content/projects.json, with add / edit / reorder.
import { h, clear, field, check, btn, sheet, confirmBox, toast, sortable, move, gripBtn, lines } from '../ui.js';
import { state, draft, base, touch, putAsset, dropAsset, assetFor, fileUrl, listFolder } from '../store.js';
import { makeIcon, makeShot, ICON_SMALL, ICON_LARGE, SHOT_HEIGHT } from '../image.js';
import { settings } from '../settings.js';
import { pickMedia, fileItems } from './picker.js';

const IMG = /\.(jpe?g|png|webp|avif)$/i;
const ID_OK = /^[a-z0-9][a-z0-9-]*$/;
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
/** An <img> for a file in the repository, drawn from this browser when it is waiting to be committed. */
function repoImg(path, attrs = {}) {
  const img = h('img', { alt: '', loading: 'lazy', decoding: 'async', ...attrs, onerror: () => img.classList.add('noimg') });
  fileUrl(path).then((u) => { img.src = u; });
  return img;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const labelFor = (date) => { const m = /^(\d{4})-(\d{2})$/.exec(date || ''); return m ? `${MONTHS[+m[2] - 1]}, ${m[1]}` : ''; };
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function projectsView(root) {
  let q = '';
  const list = h('ul', { class: 'reclist' });
  const search = field({ label: 'Search projects', type: 'search', oninput: (v) => { q = v.toLowerCase(); draw(); } });
  root.append(
    h('div', { class: 'view-head' }, h('h2', null, 'Projects'), btn('Add project', addProject, 'btn--solid')),
    h('p', { class: 'hint' }, 'The timeline on the home page, newest first. The page groups them by the year in each date; drag a handle (or use the arrow keys on it) to change the order within a year.'),
    h('div', { class: 'toolbar' }, search), list);

  const projects = () => draft('projects');
  sortable(list, { itemSelector: 'li.recrow', onmove: (from, to) => { state.files.projects.draft = move(projects(), from, to); touch(true); } });

  function draw() {
    const feat = draft('site').featured || [];
    const wasIds = new Set(base('projects').map((p) => p.id));
    const rows = projects().map((p, i) => [p, i]).filter(([p]) => !q || [p.id, p.title, p.tagline, p.description, ...(p.stack || [])].some((s) => s && s.toLowerCase().includes(q)));
    clear(list).append(...rows.map(([p, i]) => h('li', { class: 'recrow' },
      q ? null : gripBtn(p.title || p.id),
      h('button', { type: 'button', class: 'prow', onclick: () => edit(i) },
        p.icon ? repoImg(`projects/${p.icon}`, { width: 40, height: 40 }) : h('span', { class: 'prow__i', 'aria-hidden': 'true' }, (p.title || '?')[0]),
        h('span', { class: 'prow__t' }, h('strong', null, p.title || '(untitled)'), h('span', null, p.dateLabel || p.date || '')),
        h('span', { class: 'ptile__badges' },
          wasIds.has(p.id) ? null : h('span', { class: 'badge badge--new' }, 'New'),
          feat.includes(p.id) ? h('span', { class: 'badge' }, 'Featured') : null)))));
    if (!rows.length) list.append(h('li', { class: 'empty' }, 'No projects match.'));
  }

  function addProject() {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    state.files.projects.draft = [{ id: '', title: '', date, dateLabel: labelFor(date), tagline: '', icon: '', link: '', description: '', stack: [] }, ...projects()];
    touch(true);
    edit(0, true);
  }

  function edit(i, isNew = false) {
    const p = projects()[i];
    const existed = !isNew && base('projects').some((b) => b.id === p.id);
    let autoId = isNew, autoLabel = !p.dateLabel || p.dateLabel === labelFor(p.date);
    sheet(isNew ? 'New project' : p.title || 'Project', (body, close) => {
      const set = (k, v, optional) => { if (optional && (v === '' || (Array.isArray(v) && !v.length))) delete p[k]; else p[k] = v; touch(); };
      const idF = field({
        label: 'Id', value: p.id, mono: true, required: true,
        hint: existed ? 'Fixed once published: featured cards, colours and translations refer to it.' : 'Lower-case letters, digits and dashes. Used in links to the project.',
        oninput: (v) => { autoId = false; moveFiles(p.id, v.trim()); set('id', v.trim()); }, attrs: existed ? { readonly: true } : {},
      });
      const labelF = field({ label: 'Date as shown', value: p.dateLabel, oninput: (v) => { autoLabel = false; set('dateLabel', v); } });
      const feat = () => draft('site').featured || (draft('site').featured = []);
      const allowJpeg = settings().jpegFallback;
      const needId = () => { if (ID_OK.test(p.id)) return false; toast('Give the project a title and an id first; its files are named after the id.', 'bad'); return true; };
      // Files queued for this project are named after its id, so they follow it while it is still being typed.
      function moveFiles(from, to) {
        if (!from || from === to || !ID_OK.test(to)) return;
        const swap = (path) => path.replace(new RegExp(`^(projects/(?:lg/|gallery/|shots/)?)${from}([./])`), `$1${to}$2`);
        for (const a of state.assets) if (a.project === from) { a.path = swap(a.path); a.project = to; }
        if (p.icon === `${from}.webp` || p.icon === `${from}.jpg`) p.icon = p.icon.replace(from, to);
        if (p.gallery) p.gallery = p.gallery.map((g) => (g.startsWith(`projects/gallery/${from}/`) ? swap(g) : g));
      }

      /* ----- icon ----- */
      const iconBox = h('div', { class: 'iconbox' });
      const iconName = field({ label: 'Icon file name', value: p.icon, mono: true, placeholder: 'name.webp', hint: 'Filled in when you upload. A file in the projects/ folder; empty shows the first letter instead.', oninput: (v) => { set('icon', v.trim(), true); drawIcon(); } });
      const iconPick = h('input', { type: 'file', accept: 'image/*', class: 'vh', id: 'pick-icon', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setIcon(f); } });
      function drawIcon() {
        const small = p.icon ? `projects/${p.icon}` : '', large = `projects/lg/${p.id}.webp`;
        const queued = [small, large].map(assetFor).filter(Boolean);
        const pic = (path, px, r, label, fallback) => {
          const img = repoImg(path, { width: px, height: px });
          img.style.borderRadius = r + 'px';
          if (fallback) img.onerror = () => { img.onerror = () => img.classList.add('noimg'); fileUrl(fallback).then((u) => { img.src = u; }); };
          return h('figure', null, img, h('figcaption', { class: 'hint' }, label));
        };
        clear(iconBox).append(
          small ? h('div', { class: 'iconbox__pics' }, pic(small, 40, 10, 'In the timeline'), pic(large, 72, 17, 'On a featured card', small))
            : h('p', { class: 'hint' }, 'No icon yet: the timeline shows the first letter of the title.'),
          queued.length ? h('p', { class: 'hint mono' }, queued.map((a) => `${a.path} · ${a.width}×${a.height} · ${kb(a.bytes)}`).join('\n')) : null,
          h('div', { class: 'row' },
            h('label', { for: 'pick-icon', class: 'btn btn--solid' }, small ? 'Replace icon…' : 'Upload icon…'),
            btn('Choose existing…', chooseIcon),
            small ? btn('Remove icon', () => { for (const a of queued) dropAsset(a.path); set('icon', '', true); iconName.input.value = ''; drawIcon(); }) : null));
      }
      async function chooseIcon() {
        const usedBy = (path) => projects().filter((x) => x.icon && `projects/${x.icon}` === path).map((x) => x.title).join(', ');
        const got = await pickMedia({
          title: 'Project icon', selected: p.icon ? [`projects/${p.icon}`] : [],
          hint: 'Icons already in the repository. Highlight one to see it large before choosing.',
          items: async () => {
            const names = (await listFolder('projects')).filter((n) => IMG.test(n));
            const queued = state.assets.filter((a) => /^projects\/[^/]+$/.test(a.path)).map((a) => a.path);
            return fileItems([...new Set([...queued, ...names.map((n) => `projects/${n}`)])], { kind: 'Icons', note: usedBy });
          },
          upload: { label: 'Upload an icon', multiple: false, hint: 'Any square picture; it is saved at 128 px and 256 px.', handle: async ([f]) => { await setIcon(f); return p.icon ? [`projects/${p.icon}`] : []; } },
        });
        if (!got || !got.length) return;
        const name = got[0].replace(/^projects\//, '');
        if (name !== p.icon) { set('icon', name); iconName.input.value = name; }
        drawIcon();
      }
      async function setIcon(file) {
        if (needId()) return;
        try {
          const out = await makeIcon(file, { allowJpeg });
          const name = p.icon && p.icon.endsWith('.' + out.ext) && /^[\w.-]+$/.test(p.icon) ? p.icon : `${p.id}.${out.ext}`;
          if (out.ext === 'webp') {
            await putAsset({ path: `projects/${name}`, blob: out.small, width: ICON_SMALL, height: ICON_SMALL, kind: 'icon', project: p.id });
            await putAsset({ path: `projects/lg/${p.id}.webp`, blob: out.large, width: ICON_LARGE, height: ICON_LARGE, kind: 'icon', project: p.id });
          } else {
            // No WebP from this browser: one 256 px JPEG serves both places.
            await putAsset({ path: `projects/${name}`, blob: out.large, width: ICON_LARGE, height: ICON_LARGE, kind: 'icon', project: p.id });
          }
          set('icon', name); iconName.input.value = name; drawIcon();
          toast(out.sourceSide < ICON_LARGE ? `Icon prepared, but the picture is only ${out.sourceSide} px across, so it will look soft. Use one at least ${ICON_LARGE} px.` : `Icon prepared${out.cropped ? ' from the middle square of the picture' : ''}.`, out.sourceSide < ICON_LARGE ? 'bad' : '');
        } catch (e) { toast(e.message, 'bad'); }
      }
      const iconSection = h('fieldset', null, h('legend', null, 'Icon'),
        h('p', { class: 'hint' }, `Upload any square picture. It is saved at ${ICON_SMALL} px for the timeline and ${ICON_LARGE} px for the featured card and the app sheet; the site rounds the corners itself, so do not round them in the file.`),
        iconBox, iconPick, iconName);
      drawIcon();

      /* ----- screenshots ----- */
      const slugDir = (p.link || '').startsWith('/apps/') ? p.link.replace(/^\/|\/$/g, '') : null;
      const framedHost = h('div'), shotList = h('ul', { class: 'shotlist' });
      const shotPick = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'vh', id: 'pick-shots', onchange: (e) => { const fs = [...e.target.files]; e.target.value = ''; addShots(fs); } });
      const gallery = () => p.gallery || [];
      const setGallery = (list) => { set('gallery', list, true); drawShots(); };
      const twin = (path) => `projects/shots/${p.id}/${baseName(path)}.webp`;
      function drawShots() {
        clear(shotList).append(...gallery().map((path) => h('li', { class: 'recrow' },
          gripBtn(baseName(path)),
          h('span', { class: 'shotrow' }, h('span', { class: 'shotthumb' }, repoImg(path)),
            h('span', { class: 'shotrow__t' }, h('strong', null, baseName(path).replace(/-/g, ' '), assetFor(path) ? h('span', { class: 'badge badge--new' }, 'New') : null), h('span', { class: 'hint mono' }, path)),
            btn('Remove', () => { if (assetFor(path)) { dropAsset(path); dropAsset(twin(path)); } setGallery(gallery().filter((g) => g !== path)); }, 'btn--sm')))));
        if (!gallery().length) shotList.append(h('li', { class: 'empty' }, 'No screenshots chosen.'));
      }
      sortable(shotList, { itemSelector: 'li.recrow', onmove: (from, to) => setGallery(move(gallery(), from, to)) });
      async function addShots(files) {
        if (!files.length || needId()) return [];
        const list = [...gallery()], added = [];
        for (const f of files) {
          try {
            const out = await makeShot(f, { allowJpeg });
            const taken = new Set(list.map(baseName));
            let name = slug((f.name || 'screenshot').replace(/\.[a-z0-9]+$/i, '')) || 'screenshot';
            for (let i = 2; taken.has(name); i++) name = name.replace(/-\d+$/, '') + '-' + i;
            const path = `projects/gallery/${p.id}/${name}.${out.ext}`;
            await putAsset({ path, blob: out.blob, width: out.width, height: out.height, kind: 'shot', project: p.id });
            // The site shows projects/shots/<id>/<name>.webp. Writing it here as well means it does not wait for the build.
            if (out.ext === 'webp') await putAsset({ path: `projects/shots/${p.id}/${name}.webp`, blob: out.blob, width: out.width, height: out.height, kind: 'shot', project: p.id });
            list.push(path); added.push(path);
            toast(`${name}: ${out.width}×${out.height}, ${kb(out.blob.size)}`);
          } catch (e) { toast(e.message, 'bad'); }
        }
        setGallery(list);
        return added;
      }
      async function chooseExisting() {
        const folders = [[slugDir && `${slugDir}/assets/gallery`, 'Gallery'], [slugDir && `${slugDir}/assets/screenshots`, 'Screenshots'], [slugDir && `${slugDir}/assets/images`, 'Images'], [slugDir && `${slugDir}/assets`, 'Other app files']].filter((f) => f[0]);
        const got = await pickMedia({
          title: `Screenshots for ${p.title || 'this project'}`, multiple: true, selected: gallery(), confirm: 'Use these',
          hint: slugDir ? `Images already in the repository under ${slugDir}/assets/, and any you have uploaded for this project. Highlight one to see it large before ticking it.` : 'This project’s link is not an /apps/… page, so there is no app folder to look in. Upload screenshots on the Upload tab.',
          items: async () => {
            const out = [], seen = new Set();
            const push = (paths, group) => { const fresh = paths.filter((x) => !seen.has(x)); fresh.forEach((x) => seen.add(x)); out.push(...fileItems(fresh, { kind: 'Screenshots', group })); };
            push(gallery().filter((g) => assetFor(g)), 'Uploaded now');
            if (ID_OK.test(p.id)) push((await listFolder(`projects/gallery/${p.id}`)).filter((n) => IMG.test(n)).map((n) => `projects/gallery/${p.id}/${n}`), 'Uploaded earlier');
            for (const [dir, label] of folders) push((await listFolder(dir)).filter((n) => IMG.test(n)).map((n) => `${dir}/${n}`), label);
            push(gallery(), 'In use');
            return out;
          },
          upload: { label: 'Upload screenshots', hint: `Resized to at most ${SHOT_HEIGHT} px tall and saved as WebP.`, handle: addShots },
        });
        if (!got) return;
        const names = new Set();
        const next = got.filter((g) => { const n = baseName(g); if (names.has(n)) return false; names.add(n); return true; });
        for (const g of gallery()) if (!next.includes(g) && assetFor(g)) { dropAsset(g); dropAsset(twin(g)); }
        setGallery(next);
      }
      const shotSection = h('fieldset', null, h('legend', null, 'Preview screenshots'),
        h('p', { class: 'hint' }, `Shown in the strip when the project is opened. Pick images that are already in the repository, or upload new ones now; uploads are resized to ${SHOT_HEIGHT} px tall. Drag to set the order.`),
        framedHost, shotList, shotPick,
        h('div', { class: 'row' }, btn('Choose from existing…', chooseExisting), h('label', { for: 'pick-shots', class: 'btn btn--solid' }, 'Upload screenshots…')));
      drawShots();
      if (slugDir) listFolder(`${slugDir}/assets/screens/en`).then((names) => {
        const scenes = {};
        for (const f of names.sort()) { const m = f.match(/^(\d\d-[a-z0-9-]+?)-(\d+)\.webp$/); if (m) (scenes[m[1]] ||= []).push(Number(m[2])); }
        const list = Object.entries(scenes).slice(0, 8);
        if (!list.length) return;
        framedHost.append(h('div', { class: 'callout' },
          h('p', null, h('strong', null, `This app has its own framed screenshots (${list.length}). `), 'The site shows those, in every language, and ignores the list below. They come from the app’s own page and are not edited here.'),
          h('div', { class: 'shotstrip' }, list.map(([name, widths]) => h('img', { src: `../${slugDir}/assets/screens/en/${name}-${Math.min(...widths)}.webp`, alt: name.replace(/^\d\d-/, '').replace(/-/g, ' '), loading: 'lazy' })))));
      });

      body.append(
        field({ label: 'Title', value: p.title, required: true, oninput: (v) => { set('title', v); if (autoId) { moveFiles(p.id, slug(v)); p.id = slug(v); idF.input.value = p.id; } } }),
        idF,
        h('div', { class: 'grid2' },
          field({ label: 'Month', type: 'month', value: p.date, placeholder: '2026-11', hint: 'Year and month, like 2026-11.', oninput: (v) => { set('date', v); if (autoLabel) { p.dateLabel = labelFor(v); labelF.input.value = p.dateLabel; } } }),
          labelF),
        field({ label: 'Tagline', value: p.tagline, hint: 'Optional. One line, shown on a featured card.', oninput: (v) => set('tagline', v, true) }),
        field({ label: 'Description', multiline: true, rows: 5, value: p.description, hint: 'Shown when the project is opened. Simple HTML such as <a href="…"> is allowed and is inserted as written.', oninput: (v) => set('description', v) }),
        field({ label: 'Stack', multiline: true, rows: 3, value: (p.stack || []).join('\n'), hint: 'One technology per line. The first four appear on a featured card.', oninput: (v) => set('stack', lines(v)) }),
        field({ label: 'Link', value: p.link, mono: true, placeholder: '/apps/name/ or https://…', oninput: (v) => set('link', v.trim()) }),
        iconSection, shotSection,
        check({ label: 'Featured on the home page', hint: '(order them under Text → Switches)', value: feat().includes(p.id), onchange: (on) => {
          if (!p.id) return toast('Give the project an id first.', 'bad');
          draft('site').featured = on ? [...feat().filter((x) => x !== p.id), p.id] : feat().filter((x) => x !== p.id); touch(true);
        } }),
        h('div', { class: 'row row--end' }, btn('Delete project…', async () => {
          if (!(await confirmBox({ title: `Delete ${p.title || 'this project'}?`, danger: true, yes: 'Delete', body: 'It is removed from the timeline at the next commit. Nothing happens until you commit.' }))) return;
          for (const x of state.assets.filter((y) => y.project === p.id)) dropAsset(x.path);
          state.files.projects.draft = projects().filter((x) => x !== p);
          if (p.id) draft('site').featured = feat().filter((x) => x !== p.id);
          touch(true); close();
        }, 'btn--danger')));
    }, { onclose: draw });
  }
  return { draw };
}
