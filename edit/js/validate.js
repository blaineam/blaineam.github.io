// Checks run before anything can be committed. They mirror what scripts/build-site.mjs throws
// on, plus the shapes its templates rely on, so the editor never writes a file the deploy
// would choke on. Returns a list of plain-language problems; an empty list means safe to send.
import { state, draft, base, outputs, photoOrder, isPending } from './store.js';
import { isObj, deepEqual } from './jsonpatch.js';

const str = (v) => typeof v === 'string';
const strs = (v) => Array.isArray(v) && v.every(str);
const VIEWS = ['maker', 'hire', 'photo', 'luma'];

export function validate() {
  const errs = [];
  const bad = (m) => errs.push(m);
  const site = draft('site'), projects = draft('projects'), photos = draft('photos'), resume = draft('resume');
  const names = new Set(photoOrder());

  /* site.json */
  if (!isObj(site) || !isObj(site.strings)) bad('Site text: the list of strings is missing.');
  else {
    for (const [k, v] of Object.entries(site.strings)) if (!str(v)) bad(`Site text: “${k}” must be text.`);
    for (const k of Object.keys(base('site').strings || {})) if (!(k in site.strings)) bad(`Site text: “${k}” was removed, and the page needs it.`);
    if (!['maker', 'hire'].includes(site.mode)) bad('Switches: the starting mode must be “maker” or “hire”.');
    if (typeof site.openToWork !== 'boolean') bad('Switches: “open to work” must be on or off.');
    const ids = new Set(Array.isArray(projects) ? projects.map((p) => p && p.id) : []);
    if (!strs(site.featured)) bad('Switches: featured projects must be a list.');
    else {
      site.featured.forEach((id) => { if (!ids.has(id)) bad(`Switches: featured project “${id}” is not in the project list.`); });
      if (new Set(site.featured).size !== site.featured.length) bad('Switches: a project is featured twice.');
    }
    if (!isObj(site.views)) bad('Switches: the views are missing.');
    else for (const v of VIEWS) {
      const hero = site.views[v] && site.views[v].hero;
      if (!strs(hero)) { bad(`Switches: the ${v} view needs a list of hero photographs (it may be empty).`); continue; }
      [...hero, ...Object.values(site.views[v].pups || {}).flat()].forEach((f) => { if (!names.has(f)) bad(`Switches: the ${v} view uses ${f} as a hero photograph, which ${state.removed.includes(f) ? 'is being deleted' : 'does not exist'}.`); });
    }
    if (!Array.isArray(site.seasons)) bad('Seasons must be a list.');
    else site.seasons.forEach((s, i) => {
      const who = `Season ${s && s.id ? `“${s.id}”` : i + 1}`;
      if (!isObj(s) || !str(s.id) || !s.id) return bad(`${who}: needs an id.`);
      if (!str(s.effect) || !s.effect) bad(`${who}: needs an effect.`);
      for (const k of ['from', 'to', 'day']) if (k in s && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s[k])) bad(`${who}: “${k}” must look like 12-25 (month-day).`);
      if ('date' in s && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) bad(`${who}: “date” must look like 2026-07-04.`);
      if (('from' in s) !== ('to' in s)) bad(`${who}: needs both a first and a last day.`);
      if (!('from' in s) && !('date' in s) && !('rule' in s)) bad(`${who}: needs dates.`);
      for (const k of ['before', 'after']) if (k in s && !(Number.isInteger(s[k]) && s[k] >= 0)) bad(`${who}: “${k}” must be a whole number of days.`);
    });
    if (!isObj(site.luma) || !/^\d{4}-\d{2}-\d{2}$/.test(site.luma.born || '')) bad('Luma’s birthday must be a date.');
  }

  /* projects.json */
  if (!Array.isArray(projects)) bad('Projects must be a list.');
  else {
    const seen = new Set();
    projects.forEach((p, i) => {
      const who = `Project ${p && p.title ? `“${p.title}”` : i + 1}`;
      if (!isObj(p)) return bad(`${who}: is not an entry.`);
      if (!str(p.id) || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) bad(`${who}: the id must be lower-case letters, digits and dashes.`);
      else if (seen.has(p.id)) bad(`${who}: the id “${p.id}” is used twice.`);
      seen.add(p.id);
      if (!str(p.title) || !p.title.trim()) bad(`${who}: needs a title.`);
      if (!str(p.date) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.date)) bad(`${who}: the date must be a year and month.`);
      if (!str(p.dateLabel) || !p.dateLabel.trim()) bad(`${who}: needs a date label.`);
      if (!str(p.description)) bad(`${who}: needs a description.`);
      if (!strs(p.stack)) bad(`${who}: the stack must be a list of words.`);
      for (const k of ['tagline', 'icon', 'link']) if (k in p && !str(p[k])) bad(`${who}: “${k}” must be text.`);
      if ('gallery' in p && !strs(p.gallery)) bad(`${who}: the gallery must be a list of image paths.`);
      if (Array.isArray(site.featured) && site.featured.includes(p.id) && !p.icon) bad(`${who}: a featured project needs an icon.`);
    });
  }

  /* files waiting to be written for projects */
  if (Array.isArray(projects)) {
    const icons = new Set(projects.map((p) => p && p.icon).filter(Boolean)), ids = new Set(projects.map((p) => p && p.id));
    const galleries = new Set(projects.flatMap((p) => (p && Array.isArray(p.gallery) ? p.gallery : [])));
    for (const a of state.assets) {
      const m = /^projects\/(?:(lg|gallery|shots)\/)?(.+)$/.exec(a.path);
      if (!m || !/^[\w./-]+$/.test(a.path) || a.path.includes('..')) { bad(`${a.path}: not a usable file name. Remove it under Project images.`); continue; }
      const [, kind, rest] = m;
      const used = !kind ? icons.has(rest) : kind === 'lg' ? ids.has(rest.replace(/\.webp$/, ''))
        : kind === 'gallery' ? galleries.has(a.path) : [...galleries].some((g) => g.startsWith(`projects/gallery/${rest.split('/')[0]}/`) && g.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '') === rest.split('/')[1].replace(/\.webp$/, ''));
      if (!used) bad(`${a.path}: no project uses this file any more. Remove it under Project images, or put it back on its project.`);
    }
    projects.forEach((p) => {
      if (!isObj(p) || !Array.isArray(p.gallery)) return;
      const names = p.gallery.map((g) => String(g).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, ''));
      if (new Set(names).size !== names.length) bad(`Project “${p.title || p.id}”: two screenshots have the same file name, and the site names them by it.`);
    });
  }

  /* photos.json */
  if (!isObj(photos) || !isObj(photos.photos)) bad('Photos: the list is missing.');
  else {
    for (const [name, e] of Object.entries(photos.photos)) {
      if (!isObj(e)) { bad(`Photo ${name}: is not an entry.`); continue; }
      for (const k of ['title', 'caption', 'alt', 'taken', 'camera', 'lens', 'shutter']) if (k in e && !str(e[k])) bad(`Photo ${name}: “${k}” must be text.`);
      for (const k of ['focal35', 'iso']) if (k in e && !(Number.isInteger(e[k]) && e[k] > 0)) bad(`Photo ${name}: “${k}” must be a whole number.`);
      if ('aperture' in e && !(typeof e.aperture === 'number' && e.aperture > 0 && e.aperture < 100)) bad(`Photo ${name}: the aperture must be a number such as 2.8.`);
      if ('shutter' in e && !/^(1\/\d+|\d+(\.\d+)?)$/.test(e.shutter)) bad(`Photo ${name}: the shutter must look like 1/250 or 15.`);
      if ('tags' in e && !strs(e.tags)) bad(`Photo ${name}: tags must be a list.`);
      if ('featured' in e && typeof e.featured !== 'boolean') bad(`Photo ${name}: featured must be on or off.`);
      if ('order' in e && !(typeof e.order === 'number' && Number.isFinite(e.order))) bad(`Photo ${name}: order must be a number.`);
      if ('taken' in e && !/^\d{4}-\d{2}-\d{2}$/.test(e.taken)) bad(`Photo ${name}: the date taken must look like 2026-05-17.`);
    }
    for (const p of state.pending) if (!(photos.photos[p.name] || {}).alt) bad(`New photo ${p.name}: write a description (alt text) before saving.`);
    for (const n of state.removed) if (state.protectedPhotos.has(n)) bad(`Photo ${n} is named inside the site build (it is one of the terminal app’s pictures or a fallback) and cannot be deleted here.`);
    for (const n of names) if (!/^[\w.-]+\.webp$/.test(n)) bad(`Photo ${n}: the file name is not usable.`);
    for (const n of Object.keys(photos.photos)) if (isPending(n) === false && !names.has(n) && !(n in (base('photos').photos || {}))) bad(`Photo ${n}: there is an entry but no file.`);
  }

  /* resume.json */
  if (!isObj(resume)) bad('Resume: the file is not an object.');
  else {
    for (const k of ['name', 'title', 'location', 'summary']) if (!str(resume[k]) || !resume[k].trim()) bad(`Resume: “${k}” is empty.`);
    if (!strs(resume.links)) bad('Resume: links must be a list.');
    const list = (key, label, fields, lists) => {
      if (!Array.isArray(resume[key])) return bad(`Resume: ${label} must be a list.`);
      resume[key].forEach((x, i) => {
        if (!isObj(x)) return bad(`Resume: ${label} ${i + 1} is not an entry.`);
        fields.forEach((f) => { if (!str(x[f])) bad(`Resume: ${label} ${i + 1} needs “${f}”.`); });
        (lists || []).forEach((f) => { if (!strs(x[f])) bad(`Resume: ${label} ${i + 1} needs a list of “${f}”.`); });
      });
    };
    list('experience', 'job', ['role', 'company', 'start', 'end', 'place', 'field'], ['bullets']);
    list('skills', 'skill group', ['years'], ['items']);
    list('education', 'school', ['degree', 'detail', 'school', 'start', 'end']);
    if ('projects' in resume) list('projects', 'project', ['title', 'start', 'end', 'text']);
  }

  /* every file: help keys intact, and the text that would be written parses back to the draft */
  for (const [k, f] of Object.entries(state.files)) {
    const walk = (b, d, path) => {
      if (!isObj(b) || !isObj(d)) return;
      for (const key of Object.keys(b)) {
        if (/^_.*help$|^_help$/.test(key) && !deepEqual(b[key], d[key])) bad(`${f.path}: the note “${path}${key}” was changed or removed.`);
        else walk(b[key], d[key], `${path}${key} → `);
      }
    };
    walk(f.base, f.draft, '');
    void k;
  }
  for (const o of outputs()) {
    if (!o.changed) continue;
    try { if (!deepEqual(JSON.parse(o.text), state.files[o.key].draft)) bad(`${o.path}: the text to be written does not match the edits. Nothing will be sent.`); }
    catch { bad(`${o.path}: the text to be written is not valid JSON. Nothing will be sent.`); }
    if (!o.text.endsWith('\n')) bad(`${o.path}: would lose its final line break.`);
  }
  return errs;
}
