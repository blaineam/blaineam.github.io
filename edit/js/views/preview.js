// Live preview. The real pages are produced by a Node build that cannot run in a browser, so
// the preview loads the site's own published page in a same-origin frame and applies the
// pending edits to that document: strings by their data-i18n keys, photographs in the gallery,
// project rows and cards, and the experience list. Nothing is saved by doing so.
import { h, btn, select, check } from '../ui.js';
import { state, draft, base, photoOrder, photoMeta, isPending, localPhotoUrl, assetFor, fileUrl } from '../store.js';
import { deepEqual } from '../jsonpatch.js';

const PAGES = [['../', 'Home'], ['../?mode=hire', 'Home: work view'], ['../?v=120', 'Home: photography'], ['../?v=dog', 'Home: Luma & Nova']];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function previewPane(root) {
  const frame = h('iframe', { title: 'Preview of the site with your pending edits', class: 'pv__frame', src: 'about:blank' });
  const status = h('p', { class: 'hint', role: 'status' });
  let applied = {}, sig = {};
  const go = (url) => { status.textContent = 'Loading…'; frame.src = url; };
  const page = select({ label: 'Page', value: PAGES[0][0], options: PAGES, onchange: go, class: 'pv__page' });
  // Full screen: the same frame, enlarged over the whole window, with the outlines off so the
  // page looks exactly as it will. A fixed overlay rather than the Fullscreen API, which
  // iPhones do not offer for anything but video.
  let full = false, marks = null, back = null;
  const outline = check({ label: 'Outline my edits', value: true, onchange: (on) => { if (marks) marks.disabled = !on; } });
  const fullBtn = btn('Full screen', () => setFull(true), 'btn--solid pv__go');
  const backBtn = btn('Back to editing', () => setFull(false), 'btn--solid pv__back');
  function setFull(on) {
    if (on === full) return;
    full = on;
    root.classList.toggle('pv--full', on);
    document.documentElement.classList.toggle('noscroll', on);
    outline.input.checked = !on; if (marks) marks.disabled = on;
    if (on) { back = document.activeElement; if (frame.getAttribute('src') === 'about:blank') go(page.input.value); else apply(); backBtn.focus(); }
    else if (back && back.isConnected) back.focus(); else fullBtn.focus();
  }
  document.addEventListener('keydown', (e) => { if (full && e.key === 'Escape' && !document.querySelector('dialog[open]')) setFull(false); });
  root.append(
    h('div', { class: 'view-head pv__head' }, h('h2', null, 'Preview')),
    h('div', { class: 'toolbar pv__bar' }, page, btn('Reload', () => go(page.input.value)), outline, h('span', { class: 'pv__tag' }, 'Preview · not published'), fullBtn, backBtn),
    status,
    h('details', { class: 'rec pv__what' }, h('summary', null, h('span', { class: 'rec__sum' }, 'What this preview can and cannot show')),
      h('div', { class: 'rec__body' },
        h('p', null, h('strong', null, 'Shown now, before you commit: '), 'changed wording (each changed piece is outlined in blue); photo titles, captions, descriptions, sets, featured marks, order and deletions; a brand-new photo, drawn from the file on this device, watermark included; a replaced project icon; edits to existing projects (title, date, description, stack, link, tagline) and deleted projects; edits to existing jobs and skills in the work view.'),
        h('p', null, h('strong', null, 'Only after the deploy (about a minute after a commit): '), 'a new project or a changed project order; project screenshots; added or removed jobs, schools and skill groups; the /resume/ page; the switches (starting mode, open to work, featured projects, hero photographs, seasons); the numbers in the hero; search results; translations.'),
        h('p', null, 'The frame shows the published site, so it starts from what is live, not from the branch chosen in Settings.'))),
    frame);

  frame.addEventListener('load', () => {
    applied = {}; sig = {};
    let doc = null;
    try { doc = frame.contentDocument; } catch { /* cross-origin */ }
    if (!doc || !doc.body || frame.src === 'about:blank') return;
    const style = doc.createElement('style');
    style.textContent = '[data-wm-edited]{outline:2px dashed #6cb6ff!important;outline-offset:3px!important}';
    doc.head.append(style);
    marks = style.sheet; marks.disabled = !outline.input.checked;
    // Escape inside the frame should leave full screen too.
    doc.addEventListener('keydown', (e) => { if (full && e.key === 'Escape') setFull(false); });
    apply();
  });

  function mark(el) { el.setAttribute('data-wm-edited', ''); }

  function applyStrings(doc) {
    const strings = draft('site').strings, was = base('site').strings;
    let n = 0, focusEl = null, touched = 0;
    for (const k of Object.keys(strings)) {
      const want = strings[k], cur = k in applied ? applied[k] : was[k];
      if (want !== was[k]) n++;
      if (want === cur) continue;
      applied[k] = want;
      const sel = CSS.escape(k);
      const hits = [];
      doc.querySelectorAll(`[data-i18n="${sel}"]`).forEach((el) => { el.textContent = want; hits.push(el); });
      doc.querySelectorAll(`[data-i18n-html="${sel}"]`).forEach((el) => { el.innerHTML = want; hits.push(el); });   // these strings are HTML on the site too
      doc.querySelectorAll('[data-i18n-attr]').forEach((el) => {
        for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
          const [attr, key] = pair.split(':');
          if (key === k && attr) { el.setAttribute(attr.trim(), want); hits.push(el); }
        }
      });
      if (k === '_title') doc.title = want;
      hits.forEach((el) => { want === was[k] ? el.removeAttribute('data-wm-edited') : mark(el); });
      touched++;
      focusEl = hits.find((el) => el.getClientRects().length) || focusEl;
    }
    if (focusEl && touched === 1) focusEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return n;
  }

  async function applyPhotos(doc) {
    const g = doc.getElementById('g');
    if (!g) return;
    const order = photoOrder();
    const s = JSON.stringify([order, order.map((n) => photoMeta(n)), state.removed]);
    if (s === sig.photos) return;
    const first = sig.photos === undefined;
    sig.photos = s;
    const baseMap = base('photos').photos || {};
    const untouched = !state.pending.length && !state.removed.length && deepEqual(baseMap, draft('photos').photos);
    if (first && untouched) return;
    for (const n of state.removed) { const el = doc.getElementById(n.replace(/\.webp$/, '')); if (el && el.classList.contains('ph')) el.remove(); }
    const tiles = [];
    for (const name of order) {
      const idv = name.replace(/\.webp$/, ''), m = photoMeta(name);
      let el = doc.getElementById(idv);
      if (el && !el.classList.contains('ph')) el = null;
      if (!el) {
        const url = await localPhotoUrl(name);
        if (!url) continue;                       // not on the published page yet and no local copy
        el = doc.createElement('a'); el.className = 'ph'; el.id = idv; el.href = url;
        const img = doc.createElement('img'); img.src = url;
        const p = state.pending.find((x) => x.name === name);
        if (p) { img.width = p.width; img.height = p.height; }
        el.append(img); mark(el);
      }
      const img = el.querySelector('img');
      const changed = !deepEqual(baseMap[name] || {}, m);
      el.classList.toggle('is-feat', !!m.featured);
      for (const t of ['120', 'luma', 'nova']) el.classList.toggle('t-' + t, (m.tags || []).includes(t));
      m.title ? el.setAttribute('data-title', m.title) : el.removeAttribute('data-title');
      m.caption ? el.setAttribute('data-caption', m.caption) : el.removeAttribute('data-caption');
      if (img) img.alt = m.alt || '';
      let cap = el.querySelector('.ph__t');
      if (m.title) { if (!cap) { cap = doc.createElement('span'); cap.className = 'ph__t'; el.append(cap); } cap.textContent = m.title; }
      else if (cap) cap.remove();
      if (changed || isPending(name)) mark(el); else el.removeAttribute('data-wm-edited');
      tiles.push(el);
    }
    const current = [...g.querySelectorAll('a.ph')];
    if (tiles.length !== current.length || tiles.some((t, i) => t !== current[i])) tiles.forEach((t) => g.append(t));
  }

  async function applyProjects(doc) {
    const list = draft('projects'), was = base('projects');
    const s = JSON.stringify([list, state.assets.map((a) => a.key)]);
    if (s === sig.projects) return;
    const first = sig.projects === undefined;
    sig.projects = s;
    if (first && deepEqual(list, was) && !state.assets.length) return;
    const now = new Map(list.map((p) => [p.id, p]));
    for (const b of was) {
      const det = doc.getElementById('p-' + b.id);
      const p = now.get(b.id);
      if (!p) { if (det && det.classList.contains('tl')) det.remove(); continue; }
      const small = p.icon ? `projects/${p.icon}` : '', large = `projects/lg/${p.id}.webp`;
      const newIcon = !!(assetFor(small) || assetFor(large));
      const same = deepEqual(p, b) && !newIcon;
      const card = doc.querySelector(`a.card[data-app="${CSS.escape(b.id)}"]`);
      if (card) {
        const h3 = card.querySelector('h3'), tag = card.querySelector('.card__tag');
        if (h3) h3.textContent = p.title;
        if (tag) tag.textContent = p.tagline || '';
        if (p.link) card.setAttribute('href', p.link);
        const big = card.querySelector('img.card__icon');
        if (big && newIcon) big.src = await fileUrl(assetFor(large) ? large : small);
        same ? card.removeAttribute('data-wm-edited') : mark(card);
      }
      if (!det) continue;
      const ico = det.querySelector('.tl__icon img');
      if (ico && newIcon && small) ico.src = await fileUrl(small);
      const strong = det.querySelector('summary strong'), time = det.querySelector('summary time');
      if (strong) strong.textContent = p.title;
      if (time) { time.textContent = p.dateLabel; time.setAttribute('datetime', p.date); }
      const desc = det.querySelector('.tl__body > p');
      if (desc) desc.innerHTML = p.description;            // the build inserts the description as HTML too
      const chips = det.querySelector('.tl__body .chips');
      if (chips) chips.replaceChildren(...(p.stack || []).map((t) => { const li = doc.createElement('li'); li.setAttribute('data-i18n', 'tag.' + slug(t)); li.textContent = t; return li; }));
      const go = det.querySelector('a.tl__go');
      if (go && p.link) go.setAttribute('href', p.link);
      same ? det.removeAttribute('data-wm-edited') : mark(det);
    }
  }

  function applyResume(doc) {
    const r = draft('resume'), was = base('resume');
    const s = JSON.stringify([r.experience, r.skills]);
    if (s === sig.resume) return;
    const first = sig.resume === undefined;
    sig.resume = s;
    if (first && deepEqual(r.experience, was.experience) && deepEqual(r.skills, was.skills)) return;
    const jobs = [...doc.querySelectorAll('.jobs article.job')];
    if (jobs.length === (r.experience || []).length && jobs.length === was.experience.length) jobs.forEach((el, i) => {
      const j = r.experience[i];
      const set = (sel, text) => { const x = el.querySelector(sel); if (x) x.textContent = text; };
      set('.job__when', `${j.start} – ${j.end}`); set('h3', j.role); set('.job__co', j.company);
      const meta = el.querySelector('.job__meta');
      if (meta) meta.replaceChildren(doc.createTextNode(j.field || ''), doc.createElement('br'), doc.createTextNode(j.place || ''));
      const ul = el.querySelector('ul');
      if (ul) ul.replaceChildren(...(j.bullets || []).map((b) => { const li = doc.createElement('li'); li.textContent = b; return li; }));
      deepEqual(j, was.experience[i]) ? el.removeAttribute('data-wm-edited') : mark(el);
    });
    const groups = [...doc.querySelectorAll('.skills dl > div')];
    if (groups.length === (r.skills || []).length) groups.forEach((el, i) => {
      const dt = el.querySelector('dt'), dd = el.querySelector('dd');
      if (dt) dt.textContent = r.skills[i].years;
      if (dd) dd.textContent = (r.skills[i].items || []).join(' · ');
      deepEqual(r.skills[i], was.skills[i]) ? el.removeAttribute('data-wm-edited') : mark(el);
    });
  }

  let timer;
  async function apply() {
    let doc = null;
    try { doc = frame.contentDocument; } catch { /* cross-origin */ }
    if (!doc || !doc.body || !doc.querySelector('[data-i18n]')) { if (frame.src !== 'about:blank' && doc && doc.body) status.textContent = 'This page is not the generated home page, so edits cannot be applied to it.'; return; }
    try {
      const n = applyStrings(doc);
      await applyPhotos(doc); await applyProjects(doc); applyResume(doc);
      const marked = doc.querySelectorAll('[data-wm-edited]').length;
      status.textContent = marked || n ? `Showing your pending edits: ${marked} place${marked === 1 ? '' : 's'} outlined in blue.` : 'Showing the site as published. Edits appear here as you make them.';
    } catch (e) { status.textContent = `The preview could not apply an edit (${e.message}).`; }
  }

  return {
    /** Called when the pane becomes visible. */
    show() { if (frame.getAttribute('src') === 'about:blank') go(page.input.value); else apply(); },
    /** Called after every edit. */
    refresh() { clearTimeout(timer); timer = setTimeout(apply, 180); },
    isLoaded: () => frame.getAttribute('src') !== 'about:blank',
    /** Opens the preview over the whole window. */
    full: () => setFull(true),
  };
}
