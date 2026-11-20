// Everything the editor knows: the files as they are in the repository (base), the edited
// values (draft), photographs waiting to be added or removed, and where drafts are kept so an
// unsent edit survives a reload or a dead connection.
import { patchJson, merge3, deepEqual, clone, isObj } from './jsonpatch.js';
import { BranchMoved, GitHubError, gitBlobSha } from './github.js';
import { blobs, draftsDb, newKey } from './db.js';
import { renderFinal } from './image.js';
import { loadWatermark } from './watermark.js';

export const FILES = {
  site: 'content/site.json',
  projects: 'content/projects.json',
  photos: 'content/photos.json',
  resume: 'content/resume.json',
};
const PHOTO_KEYS = ['title', 'caption', 'alt', 'tags', 'featured', 'order', 'taken', 'camera', 'lens', 'focal35', 'aperture', 'shutter', 'iso'];
/** What the reader can recover from a picked file; these are written to the photo's entry. */
export const FROM_PHOTO = ['title', 'caption', 'taken', 'camera', 'lens', 'focal35', 'aperture', 'shutter', 'iso'];
const natural = new Intl.Collator('en', { numeric: true }).compare;

/* ---------- tiny storage helpers ---------- */
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const MIRROR = 'wm-edit:mirror';     // the last state, written synchronously when the page is closing

/* ---------- state ---------- */
export const state = {
  gh: null, head: null, offline: false, loadedAt: null,
  draftId: null, draftName: '', createdAt: 0, savedAt: 0, saveFailed: false,
  files: {},            // key → { path, baseText, baseSha, base, draft }
  slides: [],           // photograph names in the repository
  pending: [],          // [{ name, file, ext, key, cleanKey, wm, wmDone, width, height, bytes }] photographs to add
  removed: [],          // photograph names to delete
  assets: [],           // [{ path, key, bytes, type, width, height, kind, project }] other files to write (icons, screenshots)
  recent: {},           // photo name or file path → blob key, for files committed but not yet deployed
  published: null,      // { branch, sha, at } when this draft was last sent to a branch of its own
  photoExif: {},        // content/photo-meta.json: camera and date recovered from the originals (read only)
  protectedPhotos: new Set(),   // named inside the build script; deleting one would break the build
  notices: [],
};
const listeners = new Set();
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => fn(what));

/** Drafts belong to one repository and base branch. */
const scope = () => `${state.gh.dry ? 'dry' : 'gh'}:${state.gh.owner}/${state.gh.repo}@${state.gh.branch}`;
const currentKey = () => `wm-edit:current:${scope()}`;

/* ---------- saving: every edit is written to this browser within a quarter of a second ---------- */
let saveTimer, unsaved = false;
function record() {
  const files = {};
  for (const [k, f] of Object.entries(state.files)) files[k] = { baseText: f.baseText, baseSha: f.baseSha, draft: f.draft };
  let count = 0; try { count = pendingCount(); } catch { /* a draft that cannot be serialised is still saved */ }
  return {
    id: state.draftId, scope: scope(), name: state.draftName, createdAt: state.createdAt, savedAt: Date.now(), count,
    head: state.head, files, slides: state.slides, pending: state.pending, removed: state.removed, assets: state.assets,
    recent: state.recent, published: state.published, protectedPhotos: [...state.protectedPhotos],
  };
}
async function persistNow() {
  clearTimeout(saveTimer);
  if (!state.draftId || !state.gh || !Object.keys(state.files).length) return;
  const rec = record();
  unsaved = false;
  try { await draftsDb.put(rec); state.savedAt = rec.savedAt; state.saveFailed = false; ls.del(MIRROR); }
  catch {
    // No IndexedDB (some private windows): fall back to localStorage, which holds text but not pictures.
    state.saveFailed = !ls.set(MIRROR, rec);
    if (state.saveFailed) note('This browser refused to store the draft (storage is full or blocked). Commit before closing the page.');
    else state.savedAt = rec.savedAt;
  }
  emit('saved');
}
/** Writes the draft now and waits for it. */
export const flush = () => persistNow();
/** Call after changing a draft. `structural` means lists changed and views should redraw. */
export function touch(structural = false) {
  outCache = null; unsaved = true;
  clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 250);
  emit(structural ? 'structure' : 'edit');
}
// A page that is closing may not get to finish an IndexedDB write, so the text of the draft
// is also put in localStorage on the way out and picked up at the next load.
const onLeave = () => { if (unsaved && state.draftId && Object.keys(state.files).length) { ls.set(MIRROR, record()); persistNow(); } };
addEventListener('pagehide', onLeave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onLeave(); });
export function note(text) { if (!state.notices.includes(text)) { state.notices.push(text); emit('notice'); } }
export function clearNotices() { state.notices = []; emit('notice'); }

/* ---------- drafts: several can be kept side by side ---------- */
const mine = async () => (await draftsDb.all()).filter((d) => d && d.scope === scope()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
/** Edits made with the first version of the editor were kept in localStorage; bring them along. */
async function migrateLegacy() {
  const key = `wm-edit:draft:${scope()}`;
  const old = ls.get(key);
  if (!old || !old.files) return;
  try {
    await draftsDb.put({ ...old, id: newKey('d'), scope: scope(), name: 'Earlier work', createdAt: old.savedAt || Date.now(), savedAt: old.savedAt || Date.now(), assets: [], published: null });
    ls.del(key);
  } catch { /* left where it is */ }
}
/** [{ id, name, savedAt, createdAt, count, current, published }] newest first. */
export async function listDrafts() {
  await persistNow();
  return (await mine()).map((d) => ({ id: d.id, name: d.name || 'Untitled draft', savedAt: d.savedAt, createdAt: d.createdAt, count: d.count || 0, current: d.id === state.draftId, published: d.published || null }));
}
/** Makes another draft the one to open at the next load. The caller reloads the page. */
export async function switchDraft(id) { await persistNow(); ls.set(currentKey(), id); }
export async function createDraft(name) {
  await persistNow();
  const now = Date.now();
  const rec = { id: newKey('d'), scope: scope(), name, createdAt: now, savedAt: now, count: 0 };
  await draftsDb.put(rec);
  ls.set(currentKey(), rec.id);
  return rec.id;
}
export async function renameDraft(id, name) {
  if (id === state.draftId) { state.draftName = name; await persistNow(); return; }
  const r = await draftsDb.get(id);
  if (r) { r.name = name; await draftsDb.put(r); }
}
/** A full copy, pictures included, that can then go its own way. */
export async function duplicateDraft(id, name) {
  if (id === state.draftId) await persistNow();
  const r = await draftsDb.get(id);
  if (!r) throw new Error('That draft is no longer stored in this browser.');
  const copy = clone(r);
  const copyKey = async (k) => { const b = k && await blobs.get(k); if (!b) return k; const nk = newKey('b'); await blobs.put(nk, b); return nk; };
  for (const p of copy.pending || []) { p.key = await copyKey(p.key); if (p.cleanKey) p.cleanKey = await copyKey(p.cleanKey); delete p.sent; delete p.sha; }
  for (const a of copy.assets || []) { a.key = await copyKey(a.key); delete a.sent; delete a.sha; }
  Object.assign(copy, { id: newKey('d'), name, createdAt: Date.now(), savedAt: Date.now(), published: null, recent: {} });
  await draftsDb.put(copy);
  return copy.id;
}
/** Removes a draft and the pictures only it holds. Deleting the open one: the caller reloads. */
export async function deleteDraft(id) {
  const current = id === state.draftId;
  if (current) { clearTimeout(saveTimer); state.draftId = null; unsaved = false; ls.del(currentKey()); ls.del(MIRROR); }
  const r = await draftsDb.get(id);
  if (r) for (const x of [...(r.pending || []), ...(r.assets || [])]) { blobs.del(x.key); if (x.cleanKey) blobs.del(x.cleanKey); }
  if (r) for (const k of Object.values(r.recent || {})) blobs.del(k);
  await draftsDb.del(id);
}

/* ---------- loading ---------- */
const dirOf = (path) => path.slice(0, path.lastIndexOf('/'));
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1);
/** Reads the repository and lays the open draft over it. Returns what changed underneath. */
export async function load(gh) {
  state.gh = gh;
  await migrateLegacy();
  let all = await mine();
  const mirror = ls.get(MIRROR);
  if (mirror && mirror.scope === scope() && mirror.id) {
    const twin = all.find((d) => d.id === mirror.id);
    if (!twin || (mirror.savedAt || 0) > (twin.savedAt || 0)) {
      try { await draftsDb.put(mirror); ls.del(MIRROR); } catch { /* kept in localStorage */ }
      all = [mirror, ...all.filter((d) => d.id !== mirror.id)];
    } else ls.del(MIRROR);
  }
  const want = ls.get(currentKey());
  const saved = all.find((d) => d.id === want) || all[0] || { id: newKey('d'), name: 'Draft 1', createdAt: Date.now() };
  state.draftId = saved.id; state.draftName = saved.name || 'Untitled draft'; state.createdAt = saved.createdAt || Date.now(); state.savedAt = saved.savedAt || 0;
  ls.set(currentKey(), saved.id);

  let remote = null;
  try {
    const head = await gh.head();
    const [texts, slides] = await Promise.all([
      Promise.all(Object.values(FILES).map((p) => gh.readText(p, gh.dry ? undefined : head))),
      gh.list('slides', gh.dry ? undefined : head),
    ]);
    let build = '';
    try { build = (await gh.readText('scripts/build-site.mjs', gh.dry ? undefined : head)).text; } catch { /* optional */ }
    let exif = {};
    try { exif = JSON.parse((await gh.readText('content/photo-meta.json', gh.dry ? undefined : head)).text).photos || {}; } catch { /* optional */ }
    remote = { head, texts, slides, build, exif };
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 0 && saved && saved.files && saved.files.site)) throw e;
  }

  const report = { movedFiles: [], conflicts: [], renamed: [], landed: [] };
  if (!remote) {                                   // offline: carry on from the saved copy
    state.offline = true; state.head = saved.head;
    Object.entries(FILES).forEach(([k, path]) => {
      const s = saved.files[k];
      state.files[k] = { path, baseText: s.baseText, baseSha: s.baseSha, base: JSON.parse(s.baseText), draft: s.draft };
    });
    state.slides = saved.slides || []; state.protectedPhotos = new Set(saved.protectedPhotos || []);
  } else {
    state.offline = false; state.head = remote.head;
    Object.entries(FILES).forEach(([k, path], i) => {
      const { text, sha } = remote.texts[i];
      let base;
      try { base = JSON.parse(text); } catch (e) { throw new Error(`${path} in the repository is not valid JSON (${e.message}). Fix it there first.`); }
      let draft = clone(base);
      const s = saved && saved.files && saved.files[k];
      if (s && s.draft !== undefined) {
        if (s.baseSha === sha) draft = s.draft;
        else {
          let old = null; try { old = JSON.parse(s.baseText); } catch { /* unusable */ }
          if (old && !deepEqual(old, s.draft)) {
            const m = merge3(old, s.draft, base);
            draft = m.value; report.movedFiles.push(path);
            m.conflicts.forEach((c) => report.conflicts.push(`${path} → ${c.replace(/^\//, '').replace(/\//g, ' → ')}`));
          }
        }
      }
      state.files[k] = { path, baseText: text, baseSha: sha, base, draft };
    });
    state.slides = remote.slides.filter((n) => /\.webp$/i.test(n));
    const waiting = remote.slides.filter((n) => /\.jpe?g$/i.test(n)).map((n) => n.replace(/\.jpe?g$/i, '.webp'));
    state.slides.push(...waiting.filter((n) => !state.slides.includes(n)));
    state.protectedPhotos = new Set(remote.build.match(/bmp-\d+\.webp/g) || []);
    state.photoExif = remote.exif;
  }
  state.pending = saved.pending || [];
  state.assets = saved.assets || [];
  state.removed = (saved.removed || []).filter((n) => state.slides.includes(n));
  state.recent = saved.recent || {};
  state.published = saved.published || null;

  // Files this draft sent to a branch of its own may have reached the base branch since
  // (the pull request was merged). Those are done; they must not be sent or renamed again.
  if (remote && [...state.pending, ...state.assets].some((x) => x.sent)) {
    const dirs = new Set(state.assets.filter((a) => a.sent).map((a) => dirOf(a.path)));
    if (state.pending.some((p) => p.sent)) dirs.add('slides');
    const shaBy = {};
    for (const d of dirs) { try { shaBy[d] = await gh.shas(d, gh.dry ? undefined : remote.head); } catch { shaBy[d] = {}; } }
    state.pending = state.pending.filter((p) => {
      if (!p.sent || !state.slides.includes(p.name)) return true;
      const there = (shaBy.slides || {})[p.file];
      if (p.ext === 'webp' && there && p.sha && there !== p.sha) return true;      // a different picture took the name
      state.recent[p.name] = p.key; if (p.cleanKey) blobs.del(p.cleanKey);
      report.landed.push(`slides/${p.file}`);
      return false;
    });
    state.assets = state.assets.filter((a) => {
      if (!(a.sent && a.sha && (shaBy[dirOf(a.path)] || {})[baseOf(a.path)] === a.sha)) return true;
      state.recent[a.path] = a.key; report.landed.push(a.path);
      return false;
    });
  }
  // A photograph added elsewhere may have taken a name this draft was going to use.
  for (const p of state.pending) {
    if (state.slides.includes(p.name)) { const to = nextPhotoName(); renamePending(p, to); report.renamed.push(to); }
  }
  state.loadedAt = Date.now();
  outCache = null;
  if (report.landed.length && !pendingCount()) state.published = null;
  await persistNow(); emit('structure');
  return report;
}

/* ---------- reading drafts ---------- */
export const draft = (k) => state.files[k].draft;
export const base = (k) => state.files[k].base;

let outCache = null;
/** The text each file would have after a commit: [{ key, path, text, baseText, changed, reformatted }] */
export function outputs() {
  if (!outCache) {
    outCache = Object.entries(state.files).map(([key, f]) => {
      if (deepEqual(f.base, f.draft) && sameOrder(f.base, f.draft)) return { key, path: f.path, text: f.baseText, baseText: f.baseText, changed: false, reformatted: false };
      const r = patchJson(f.baseText, f.draft);
      return { key, path: f.path, text: r.text, baseText: f.baseText, changed: r.text !== f.baseText, reformatted: r.reformatted };
    });
  }
  return outCache;
}
function sameOrder(a, b) {
  if (Array.isArray(a)) return a.every((x, i) => sameOrder(x, b[i]));
  if (!isObj(a)) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.every((k, i) => k === kb[i] && sameOrder(a[k], b[k]));
}
export const pendingCount = () => outputs().filter((o) => o.changed).length + state.pending.length + state.removed.length + state.assets.length;

/* ---------- photographs ---------- */
const photoMap = () => { const d = draft('photos'); if (!isObj(d.photos)) d.photos = {}; return d.photos; };
export const photoMeta = (name) => photoMap()[name] || {};
export const isPending = (name) => state.pending.some((p) => p.name === name);
/** Names in the order the site will show them: by `order` (higher first), then newest number first. */
export function photoOrder() {
  const names = [...state.slides.filter((n) => !state.removed.includes(n)), ...state.pending.map((p) => p.name)];
  const map = photoMap();
  const ord = (n) => (typeof (map[n] || {}).order === 'number' ? map[n].order : -Infinity);
  return [...new Set(names)].sort(natural).reverse().map((n, i) => [n, i]).sort((a, b) => (ord(b[0]) - ord(a[0])) || a[1] - b[1]).map((x) => x[0]);
}
export function setPhotoMeta(name, fields, structural = false) {
  const map = photoMap();
  const next = { ...(map[name] || {}), ...fields };
  for (const k of ['title', 'caption', 'alt', 'taken', 'camera', 'lens', 'shutter']) if (typeof next[k] === 'string' && !next[k].trim()) delete next[k];
  for (const k of ['focal35', 'aperture', 'iso']) if (k in next && !(typeof next[k] === 'number' && Number.isFinite(next[k]) && next[k] > 0)) delete next[k];
  if (Array.isArray(next.tags) && !next.tags.length) delete next.tags;
  if (next.featured !== true) delete next.featured;
  if (typeof next.order !== 'number' || !Number.isFinite(next.order)) delete next.order;
  // Key order: the house order (title, caption, alt, …) when the entry already follows it, which
  // every entry does unless it was hand-written otherwise; then a new key is appended instead.
  const existing = Object.keys(map[name] || {}).filter((k) => k in next);
  const rank = (k) => (PHOTO_KEYS.includes(k) ? PHOTO_KEYS.indexOf(k) : PHOTO_KEYS.length);
  const tidy = existing.every((k, i) => i === 0 || rank(existing[i - 1]) <= rank(k));
  const added = Object.keys(next).filter((k) => !existing.includes(k));
  const keys = tidy ? [...existing, ...added].map((k, i) => [k, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]) : [...existing, ...added];
  const merged = {};
  for (const k of keys) merged[k] = next[k];
  if (Object.keys(merged).length) {
    if (name in map) map[name] = merged;
    else state.files.photos.draft.photos = { [name]: merged, ...map };     // new entries go to the top of the file
  } else delete map[name];
  touch(structural);
}
/** Writes `order` numbers so the site shows exactly this sequence. */
export function applyPhotoOrder(seq) {
  const map = photoMap();
  // The tail that is already in newest-first order needs no numbers; everything above it does.
  let cut = seq.length;
  while (cut > 0 && (cut === seq.length || natural(seq[cut - 1], seq[cut]) > 0)) cut--;
  seq.forEach((name, i) => {
    const want = i < cut ? cut - i : undefined;
    const has = (map[name] || {}).order;
    if (want === has) return;
    if (want === undefined) { const e = { ...map[name] }; delete e.order; if (Object.keys(e).length) map[name] = e; else delete map[name]; }
    else if (map[name]) map[name] = { ...map[name], order: want };
    else map[name] = { order: want };
  });
  touch(true);
}
export function clearPhotoOrder() {
  const map = photoMap();
  for (const n of Object.keys(map)) if ('order' in map[n]) { const e = { ...map[n] }; delete e.order; if (Object.keys(e).length) map[n] = e; else delete map[n]; }
  touch(true);
}
export function nextPhotoName() {
  const nums = [...state.slides, ...Object.keys(photoMap()), ...state.pending.map((p) => p.name), ...state.removed]
    .map((n) => /^bmp-(\d+)\./.exec(n)).filter(Boolean).map((m) => +m[1]);
  return `bmp-${(nums.length ? Math.max(...nums) : -1) + 1}.webp`;
}
function renamePending(p, to) {
  const map = photoMap(), from = p.name;
  if (map[from]) { const d = state.files.photos.draft; d.photos = Object.fromEntries(Object.entries(map).map(([k, v]) => [k === from ? to : k, v])); }
  const views = draft('site').views || {};
  for (const v of Object.values(views)) if (Array.isArray(v.hero)) v.hero = v.hero.map((h) => (h === from ? to : h));
  p.name = to; p.file = to.replace(/\.webp$/, '.' + p.ext);
}
export async function addPhoto({ blob, clean, ext, width, height, exif, watermarked = false, wantMark = false }) {
  const name = nextPhotoName();
  const key = newKey('b'), cleanKey = clean ? newKey('b') : null;
  await blobs.put(key, blob);
  if (clean) await blobs.put(cleanKey, clean);
  const meta = {};
  for (const k of FROM_PHOTO) if (exif[k] !== undefined && exif[k] !== '') meta[k] = exif[k];
  state.pending.push({ name, file: name.replace(/\.webp$/, '.' + ext), ext, key, cleanKey, wm: wantMark, wmDone: watermarked, width, height, bytes: blob.size, fromPhoto: Object.keys(meta) });
  setPhotoMeta(name, meta, true);
  if (!Object.keys(meta).length) touch(true);
  return name;
}
/**
 * Switches the watermark on a new photograph on or off by making the file again from the
 * clean copy kept in this browser. Returns false when it is wanted but this device has no
 * watermark file yet (the wish is remembered and applied once there is one).
 */
export async function setPhotoWatermark(name, want) {
  const p = state.pending.find((x) => x.name === name);
  if (!p) return false;
  p.wm = want;
  const mark = want ? await loadWatermark() : null;
  if ((want && !mark) || !p.cleanKey) { touch(); return false; }
  const clean = await blobs.get(p.cleanKey);
  if (!clean) throw new Error(`The clean copy of ${name} is no longer stored in this browser. Remove the photo and add it again.`);
  const blob = await renderFinal(clean, { mark });
  dropUrl(p.key);
  await blobs.put(p.key, blob);
  p.bytes = blob.size; p.wmDone = !!mark; delete p.sent; delete p.sha;
  touch(true);
  return true;
}
/** After the watermark file on this device changed: redo every new photograph that wants it. */
export async function redoWatermarks({ all = false } = {}) {
  let n = 0;
  for (const p of [...state.pending]) if (p.wm && (all || !p.wmDone)) { if (await setPhotoWatermark(p.name, true)) n++; }
  return n;
}
export function removePhoto(name) {
  const p = state.pending.find((x) => x.name === name);
  if (p) { state.pending = state.pending.filter((x) => x !== p); dropUrl(p.key); blobs.del(p.key); if (p.cleanKey) blobs.del(p.cleanKey); }
  else if (!state.removed.includes(name)) state.removed.push(name);
  delete photoMap()[name];
  touch(true);
}
export function restorePhoto(name) {
  state.removed = state.removed.filter((n) => n !== name);
  const was = (base('photos').photos || {})[name];
  if (was) setPhotoMeta(name, clone(was), true); else touch(true);
}
const urls = new Map();
const dropUrl = (key) => { if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); } };
async function urlOf(key) {
  if (!key) return null;
  if (!urls.has(key)) { const b = await blobs.get(key); if (!b) return null; urls.set(key, URL.createObjectURL(b)); }
  return urls.get(key);
}
/** A local picture for a photograph that the site cannot serve yet (new, or committed but not deployed). */
export function localPhotoUrl(name) {
  const p = state.pending.find((x) => x.name === name);
  return urlOf(p ? p.key : state.recent[name]);
}

/* ---------- other files: project icons and screenshots ---------- */
export const assetFor = (path) => state.assets.find((a) => a.path === path);
/** Queues a file to be written at `path` (replacing one already queued there). */
export async function putAsset({ path, blob, width, height, kind, project }) {
  const old = assetFor(path);
  if (old) { dropUrl(old.key); blobs.del(old.key); state.assets = state.assets.filter((a) => a !== old); }
  const key = newKey('b');
  await blobs.put(key, blob);
  state.assets.push({ path, key, bytes: blob.size, type: blob.type, width, height, kind, project });
  touch(true);
}
export function dropAsset(path) {
  const a = assetFor(path);
  if (!a) return;
  dropUrl(a.key); blobs.del(a.key);
  state.assets = state.assets.filter((x) => x !== a);
  touch(true);
}
/** Where to show a repository file from: the copy waiting in this browser, else the site. */
export async function fileUrl(path) {
  const a = assetFor(path);
  return (await urlOf(a ? a.key : state.recent[path])) || `../${path}`;
}
/** Files in a folder of the repository (names only). Empty when it does not exist. */
export async function listFolder(path) {
  try { return await state.gh.list(path, state.gh.dry ? undefined : state.head); } catch { return []; }
}

/* ---------- discarding ---------- */
export function discardFile(key) { state.files[key].draft = clone(state.files[key].base); touch(true); }
export function discardAll() {
  for (const k of Object.keys(state.files)) state.files[k].draft = clone(state.files[k].base);
  state.pending.forEach((p) => { dropUrl(p.key); blobs.del(p.key); if (p.cleanKey) blobs.del(p.cleanKey); });
  state.assets.forEach((a) => { dropUrl(a.key); blobs.del(a.key); });
  state.pending = []; state.removed = []; state.assets = []; state.published = null;
  touch(true);
}
/** Every draft, every stored picture and the watermark file: gone from this browser. */
export async function forgetDrafts() {
  clearTimeout(saveTimer); state.draftId = null; unsaved = false;
  for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && /^wm-edit:(draft:|current:|mirror$)/.test(k)) ls.del(k); }
  await draftsDb.clear();
  return blobs.clear();
}

/* ---------- committing ---------- */
export function commitSummary() {
  const bits = [];
  const out = Object.fromEntries(outputs().map((o) => [o.key, o.changed]));
  if (state.pending.length) bits.push(`add ${state.pending.length} photo${state.pending.length > 1 ? 's' : ''}`);
  if (state.removed.length) bits.push(`remove ${state.removed.length} photo${state.removed.length > 1 ? 's' : ''}`);
  if (out.photos && !state.pending.length && !state.removed.length) bits.push('photo details');
  if (out.projects) bits.push('projects');
  if (state.assets.length && !out.projects) bits.push('project images');
  if (out.site) bits.push('site text and settings');
  if (out.resume) bits.push('resume');
  return bits.length ? `content: ${bits.join(', ')}` : '';
}
/** Everything a commit carries: [{ path, text } | { path, blob, item } | { path, remove }]. */
async function buildChanges() {
  const outs = outputs();
  const changes = outs.filter((o) => o.changed).map((o) => ({ path: o.path, text: o.text }));
  for (const p of state.pending) {
    const blob = await blobs.get(p.key);
    if (!blob) throw new Error(`The picture for ${p.name} is no longer stored in this browser. Remove it from the list and add it again.`);
    changes.push({ path: `slides/${p.file}`, blob, item: p });
  }
  for (const a of state.assets) {
    const blob = await blobs.get(a.key);
    if (!blob) throw new Error(`The file for ${a.path} is no longer stored in this browser. Add it again.`);
    changes.push({ path: a.path, blob, item: a });
  }
  for (const n of state.removed) changes.push({ path: `slides/${n}`, remove: true });
  if (!changes.length) throw new Error('There is nothing to commit.');
  return { outs, changes };
}
/**
 * Sends one commit to the branch being edited. Returns { status: 'done' | 'dry' | 'review', ... }.
 * 'review' means the repository changed in a way that touched this draft: nothing was sent,
 * the draft was reapplied on top of the new files, and the owner should look again.
 */
export async function commit(message, onStep) {
  const gh = state.gh;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!gh.dry) {
      const tip = await gh.head();
      if (tip !== state.head) {
        const r = await load(gh);
        if (r.conflicts.length || r.movedFiles.length || r.renamed.length) return { status: 'review', ...r };
      }
    }
    const { outs, changes } = await buildChanges();
    try {
      const sha = await gh.commit({ parent: state.head, message, changes, onStep });
      if (gh.dry) return { status: 'dry', log: gh.log };
      for (const o of outs.filter((x) => x.changed)) {
        const f = state.files[o.key];
        f.baseText = o.text; f.base = clone(f.draft); f.baseSha = await gitBlobSha(o.text);
      }
      for (const p of state.pending) { state.slides.push(p.name); state.recent[p.name] = p.key; if (p.cleanKey) blobs.del(p.cleanKey); }
      for (const a of state.assets) state.recent[a.path] = a.key;
      state.slides = state.slides.filter((n) => !state.removed.includes(n));
      state.pending = []; state.removed = []; state.assets = []; state.published = null; state.head = sha;
      outCache = null; await persistNow(); emit('structure');
      return { status: 'done', sha };
    } catch (e) {
      if (!(e instanceof BranchMoved)) throw e;        // otherwise loop: reload and try again
    }
  }
  throw new Error('The branch kept changing while committing. Wait a minute for the deploy to finish, then try again.');
}

export const branchNameOk = (name) => /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name) && !/\.\.|\/\/|\/$|\.lock$|@\{/.test(name);
/**
 * Sends the draft to a branch of its own instead, leaving the edited branch alone. The branch
 * is created at the new commit if it does not exist; if it does (this draft was published
 * before), a further commit is added to it. The draft stays as it is, so it can be published
 * again or committed for real later. Returns { status: 'done' | 'dry', branch, sha, created }.
 */
export async function publishToBranch(name, message, onStep) {
  const gh = state.gh;
  if (!branchNameOk(name)) throw new Error('That is not a usable branch name. Use letters, digits, dashes, dots and slashes.');
  if (name === gh.branch) throw new Error(`${name} is the branch being edited. Use Commit for that.`);
  const { changes } = await buildChanges();
  const tip = await gh.refSha(name);
  let sha;
  try { sha = await gh.commit({ parent: tip || state.head, treeOf: state.head, target: name, create: !tip, message, changes, onStep }); }
  catch (e) { if (e instanceof BranchMoved) throw new Error(`The branch ${name} changed while this was being sent. Nothing was moved; try again.`); throw e; }
  if (gh.dry) return { status: 'dry', log: gh.log, branch: name, created: !tip };
  for (const c of changes) if (c.item) { c.item.sent = true; c.item.sha = await gitBlobSha(c.blob); }
  state.published = { branch: name, sha, at: Date.now() };
  await persistNow(); emit('structure');
  return { status: 'done', sha, branch: name, created: !tip };
}
/** Where GitHub offers to open a pull request for a branch. Opened by the owner, in their own session. */
export const compareUrl = (name) => `https://github.com/${encodeURIComponent(state.gh.owner)}/${encodeURIComponent(state.gh.repo)}/compare/${encodeURIComponent(state.gh.branch)}...${name.split('/').map(encodeURIComponent).join('/')}?expand=1`;
