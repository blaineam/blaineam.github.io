// Entry point: the sign-in gate, then the editor. Nothing of the editor is built until a token
// with write access to the repository has been verified (or, on a local development host only,
// the dry run is chosen).
import { h, clear, field, check, btn, sheet, confirmBox, toast } from './ui.js';
import { settings, saveSettings, getToken, setToken, clearToken, isLocalHost } from './settings.js';
import { createGitHub, createDryRun, GitHubError } from './github.js';
import { state, load, on, pendingCount, note, forgetDrafts, listDrafts, switchDraft, createDraft, renameDraft, duplicateDraft, deleteDraft, flush } from './store.js';
import { loadWatermark, clearWatermark } from './watermark.js';
import { chooseWatermark } from './views/photos.js';
import { photosView } from './views/photos.js';
import { projectsView } from './views/projects.js';
import { textView } from './views/text.js';
import { resumeView } from './views/resume.js';
import { previewPane } from './views/preview.js';
import { changesView } from './views/changes.js';

const $ = (id) => document.getElementById(id);
const gate = $('gate'), app = $('app');
const VERIFIED = 'wm-edit:verified';

/* ---------- sign-in ---------- */
function showGate(message) {
  app.hidden = true; clear(app); gate.hidden = false;
  const cfg = settings();
  $('gate-repo').textContent = `${cfg.owner}/${cfg.repo}`;
  $('gate-owner').textContent = cfg.owner;
  // GitHub's token form reads these from the address (documented under "Pre-filling fine-grained
  // personal access token details using URL parameters"). It has no parameter for choosing the
  // repository, so that stays a written step. The link carries settings only, never a token.
  $('gate-new').href = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: 'wemiller.com editor',
    description: `Lets the editor at wemiller.com/edit/ save content changes. Contents: read and write, on ${cfg.owner}/${cfg.repo} only.`,
    target_name: cfg.owner, expires_in: '90', contents: 'write',
  });
  $('gate-branch').textContent = cfg.branch;
  const err = $('gate-error');
  err.textContent = message || ''; err.hidden = !message;
  $('gate-dry').hidden = !isLocalHost();
  $('token').focus({ preventScroll: true });
}
function gateBusy(on) { $('gate-go').disabled = on; $('gate-go').textContent = on ? 'Checking with GitHub…' : 'Sign in on this device'; }

async function signIn(token, { fromStorage = false } = {}) {
  const cfg = settings();
  const fail = (m) => { gateBusy(false); showGate(m); };
  if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) {
    return fail(/^gh[pousr]_/.test(token)
      ? 'That is a classic or app token. Classic tokens reach every repository you own, so this editor does not accept them. Create a fine-grained token as described below.'
      : 'That does not look like a fine-grained token. They start with “github_pat_”.');
  }
  gateBusy(true);
  const gh = createGitHub({ ...cfg, token });
  try {
    const who = await gh.verify();
    if (!who.canPush) { if (fromStorage) clearToken(); return fail(`GitHub says this token cannot write to ${cfg.owner}/${cfg.repo}. Give it “Contents: Read and write” on that repository.`); }
    setToken(token);
    try { localStorage.setItem(VERIFIED, `${cfg.owner}/${cfg.repo}`); } catch { /* fine */ }
  } catch (e) {
    const offline = e instanceof GitHubError && e.status === 0;
    let wasVerified = false;
    try { wasVerified = localStorage.getItem(VERIFIED) === `${cfg.owner}/${cfg.repo}`; } catch { /* fine */ }
    if (!(offline && fromStorage && wasVerified)) {
      if (fromStorage && e.status === 401) clearToken();
      return fail(e.status === 404 ? `GitHub could not find ${cfg.owner}/${cfg.repo} on branch ${cfg.branch} with this token. Check the names in “Repository and branch” below.` : e.message);
    }
    // No connection, but this device was signed in before: carry on from the saved copy.
  }
  gateBusy(false);
  await start(gh);
}

$('gate-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('token');
  const token = input.value.trim();
  input.value = '';                       // never left on screen or in the field
  signIn(token);
});
$('gate-dry-go').addEventListener('click', () => start(createDryRun(settings())));
$('gate-settings').addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings({ owner: $('set-owner').value.trim(), repo: $('set-repo').value.trim(), branch: $('set-branch').value.trim() });
  showGate();
});

/* ---------- the editor ---------- */
async function start(gh) {
  gate.hidden = true; app.hidden = false;
  clear(app).append(h('p', { class: 'loading', role: 'status' }, gh.dry ? 'Reading this site’s files…' : 'Reading the repository…'));
  let report;
  try { report = await load(gh); }
  catch (e) { return showGate(`The content could not be loaded: ${e.message}`); }
  if (state.offline) note('No connection: this is the copy saved in this browser. You can keep editing; commit when you are back online.');
  if (report.movedFiles.length) note(`The repository changed since your last visit (${report.movedFiles.join(', ')}). Your unsent edits were reapplied on top of the new files.`);
  report.conflicts.forEach((c) => note(`Both you and the repository changed ${c}. Your version was kept; check it.`));
  if (report.landed.length) note(`Already on ${gh.branch}, so no longer waiting in this draft: ${report.landed.join(', ')}.`);
  build();
}

function build() {
  const gh = state.gh;
  const TABS = [['photos', 'Photos', photosView], ['projects', 'Projects', projectsView], ['text', 'Text', textView], ['resume', 'Resume', resumeView], ['preview', 'Preview', null], ['changes', 'Changes', changesView]];
  const views = {}, panels = {}, dirty = {};
  let current = null;

  const countBadge = h('span', { class: 'count', hidden: true });
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Sections' }, TABS.map(([key, label]) =>
    h('button', { type: 'button', class: 'tab', 'data-tab': key, onclick: () => show(key) }, label, key === 'changes' ? countBadge : null)));
  const main = h('main', { class: 'panes', id: 'main' });
  const editor = h('div', { class: 'editor' });
  const previewHost = h('section', { class: 'pane pane--preview', 'aria-label': 'Preview' });
  for (const [key] of TABS) {
    if (key === 'preview') continue;
    panels[key] = h('section', { class: 'pane', hidden: true, 'aria-label': key });
    editor.append(panels[key]);
  }
  main.append(editor, previewHost);
  const preview = previewPane(previewHost);
  const wide = matchMedia('(min-width: 1100px)');

  // The open draft and when it was last written to this browser.
  const draftName = h('span', { class: 'top__dname' }), savedAt = h('span', { class: 'top__saved' });
  const draftBtn = h('button', { type: 'button', class: 'btn btn--sm top__draft', onclick: openDrafts, 'aria-label': 'Drafts' }, draftName, savedAt);
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const showSaved = () => {
    draftName.textContent = state.draftName;
    savedAt.textContent = state.saveFailed ? 'not saved' : state.savedAt ? `saved ${clock(state.savedAt)}` : '';
    draftBtn.title = state.saveFailed ? 'This browser could not store the draft.' : state.savedAt ? `Drafts. “${state.draftName}” was saved in this browser at ${new Date(state.savedAt).toLocaleTimeString()}.` : 'Drafts';
    draftBtn.classList.toggle('is-bad', state.saveFailed);
  };
  showSaved();

  clear(app).append(
    h('header', { class: 'top' },
      h('a', { class: 'top__brand', href: '../', title: 'Back to the site' }, 'wemiller.com', h('span', null, ' · edit')),
      h('span', { class: 'top__where mono', title: 'Repository and branch' }, gh.dry ? 'dry run · nothing is sent' : `${gh.repo} · ${gh.branch}`),
      draftBtn,
      btn('Settings', openSettings, 'btn--sm')),
    tabs, main);

  function show(key) {
    current = key;
    try { sessionStorage.setItem('wm-edit:tab', key); } catch { /* fine */ }
    tabs.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.tab === key ? 'page' : 'false'));
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== key;
    main.dataset.tab = key;
    if (key === 'preview') { preview.show(); return; }
    if (!views[key]) { views[key] = TABS.find((t) => t[0] === key)[2](panels[key]); dirty[key] = true; }
    if (dirty[key]) { views[key].draw(); dirty[key] = false; }
    if (wide.matches) preview.show();
    scrollTo(0, 0);
  }
  const updateCount = () => { const n = pendingCount(); countBadge.hidden = !n; countBadge.textContent = n; countBadge.setAttribute('aria-label', `${n} pending`); };

  on((what) => {
    if (what === 'saved') return showSaved();
    updateCount();
    if (what === 'structure' || what === 'notice') {
      for (const k of Object.keys(views)) dirty[k] = true;
      // A fold-out form that is open is being typed in; redraw only views that are not mid-edit.
      if (current && views[current] && !document.querySelector('dialog[open]')) { views[current].draw(); dirty[current] = false; }
    } else { dirty.changes = true; if (current === 'changes') { /* redrawn when revisited */ } }
    if (preview.isLoaded() && (wide.matches || current === 'preview')) preview.refresh();
  });
  document.addEventListener('wm-preview-full', () => { if (!wide.matches) show('preview'); preview.full(); });
  wide.addEventListener('change', () => { if (wide.matches) preview.show(); else if (current === 'preview') show('photos'); });

  let first = 'photos';
  try { first = sessionStorage.getItem('wm-edit:tab') || first; } catch { /* fine */ }
  if (!TABS.some((t) => t[0] === first) || (first === 'preview' && wide.matches)) first = 'photos';
  updateCount();
  show(state.notices.length ? 'changes' : first);
}

/* ---------- drafts ---------- */
const stamp = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
function openDrafts() {
  sheet('Drafts', (body, close) => {
    const list = h('ul', { class: 'reclist' });
    const go = async (fn) => { try { await fn(); location.reload(); } catch (e) { toast(e.message, 'bad'); } };
    const ask = (title, value, yes) => new Promise((res) => {
      let v = value;
      const f = field({ label: 'Name', value, oninput: (x) => { v = x; } });
      confirmBox({ title, yes, body: f }).then((ok) => res(ok && v.trim() ? v.trim() : null));
      setTimeout(() => { f.input.focus(); f.input.select(); }, 0);
    });
    async function draw() {
      const drafts = await listDrafts();
      clear(list).append(...drafts.map((d) => h('li', { class: 'draftrow' + (d.current ? ' is-current' : '') },
        h('div', { class: 'draftrow__t' },
          h('strong', null, d.name, d.current ? h('span', { class: 'badge badge--new' }, 'Open') : null),
          h('span', { class: 'hint' }, `${d.count ? `${d.count} change${d.count > 1 ? 's' : ''}` : 'No changes'} · saved ${stamp(d.savedAt)}${d.published ? ` · published to ${d.published.branch}` : ''}`)),
        h('div', { class: 'row' },
          d.current ? null : btn('Open', () => go(() => switchDraft(d.id)), 'btn--solid btn--sm'),
          btn('Rename', async () => { const n = await ask(`Rename “${d.name}”`, d.name, 'Rename'); if (n) { await renameDraft(d.id, n); draw(); } }, 'btn--sm'),
          btn('Duplicate', async () => { const n = await ask('Name for the copy', `${d.name} copy`, 'Duplicate'); if (n) { try { await duplicateDraft(d.id, n); toast('Copied, pictures included.'); } catch (e) { toast(e.message, 'bad'); } draw(); } }, 'btn--sm'),
          btn('Delete…', async () => {
            const ok = await confirmBox({ title: `Delete “${d.name}”?`, danger: true, yes: 'Delete', body: d.count ? `Its ${d.count} unsent change${d.count > 1 ? 's' : ''} and any pictures waiting in it are removed from this browser. Nothing on GitHub is touched.` : 'It has no unsent changes.' });
            if (!ok) return;
            await deleteDraft(d.id);
            if (d.current) location.reload(); else draw();
          }, 'btn--danger btn--sm')))));
    }
    body.append(
      h('p', { class: 'hint' }, 'A draft is a set of unsent edits, kept in this browser only: text, order, and the pictures waiting to be uploaded. Every edit is saved as you make it, so closing the tab or a crash loses nothing. Keep several side by side and open the one you want to work on.'),
      list,
      h('div', { class: 'row row--end' }, btn('New draft…', async () => {
        const n = await ask('Name the new draft', `Draft ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`, 'Create and open');
        if (n) go(() => createDraft(n));
      }, 'btn--solid')));
    draw();
    void close;
  });
}

/** Settings → the watermark kept on this device. */
function markCard() {
  const host = h('div');
  const draw = async () => {
    const m = await loadWatermark();
    const pic = h('div', { class: 'markpic' });
    if (m) { const c = h('canvas', { width: m.w, height: m.h, role: 'img', 'aria-label': 'The watermark' }); c.getContext('2d').drawImage(m.canvas, 0, 0); pic.append(c); }
    clear(host).append(
      m ? pic : h('p', { class: 'callout callout--bad' }, 'No watermark file on this device. New photos are added without one until you choose it.'),
      m ? h('p', { class: 'hint' }, m.source === 'site' ? 'Using edit/watermark.png from the site.' : 'Using the file chosen on this device. It stays in this browser and is not uploaded.', m.opaque ? ' This image has no transparent background, so it covers the corner as a solid block.' : '') : null,
      h('div', { class: 'row' },
        btn(m ? 'Replace…' : 'Choose watermark PNG…', async () => { if (await chooseWatermark()) draw(); }, m ? '' : 'btn--solid'),
        m && m.source === 'device' ? btn('Remove from this device', async () => { await clearWatermark(); draw(); }) : null));
  };
  draw();
  return h('section', { class: 'card' }, h('h3', null, 'Watermark'),
    h('p', { class: 'hint' }, 'Your signature, drawn into the bottom-right corner of each new photo at the same size and inset as the photos already on the site (22.5% of the long side wide). Use the PNG with a transparent background.'),
    host,
    check({ label: 'Add the watermark to new photos', hint: '(each photo can still be switched individually)', value: settings().watermark, onchange: (on) => { saveSettings({ watermark: on }); } }));
}

function openSettings() {
  const cfg = settings();
  sheet('Settings', (body) => {
    const draftCfg = { ...cfg };
    body.append(
      h('section', { class: 'card' }, h('h3', null, 'Repository and branch'),
        h('p', { class: 'hint' }, 'To try the editor safely, point it at a throwaway branch first. Drafts are kept separately for each branch.'),
        h('div', { class: 'grid2' },
          field({ label: 'Owner', value: cfg.owner, mono: true, oninput: (v) => { draftCfg.owner = v.trim(); } }),
          field({ label: 'Repository', value: cfg.repo, mono: true, oninput: (v) => { draftCfg.repo = v.trim(); } })),
        field({ label: 'Branch', value: cfg.branch, mono: true, oninput: (v) => { draftCfg.branch = v.trim(); } }),
        h('div', { class: 'row row--end' }, btn('Save and reload', async () => { await flush(); saveSettings(draftCfg); location.reload(); }, 'btn--solid'))),
      h('section', { class: 'card' }, h('h3', null, 'New photos'),
        check({ label: 'Upload JPEG when this browser cannot write WebP', value: cfg.jpegFallback, onchange: (on) => { saveSettings({ jpegFallback: on }); toast('Saved. Reload the page for it to take effect.'); },
          hint: '(Safari. The site build converts slides/*.jpg to WebP during the deploy.)' })),
      markCard(),
      h('section', { class: 'card' }, h('h3', null, 'This device'),
        h('p', { class: 'hint' }, state.gh.dry ? 'Dry run: no token is in use.' : 'The token is stored in this browser only and is sent only to api.github.com. It is never shown again.'),
        h('div', { class: 'row' },
          btn('Load the latest from GitHub', async () => { await flush(); location.reload(); }),
          btn('Forget this device…', async () => {
            const also = check({ label: 'Also throw away every draft, the pictures waiting in them and the watermark file stored here', value: false, onchange: () => {} });
            const ok = await confirmBox({ title: 'Forget this device?', yes: 'Forget', danger: true,
              body: h('div', null, h('p', null, 'The token is removed from this browser. To make it useless everywhere, also delete it on GitHub under Settings → Developer settings → Fine-grained tokens.'), also) });
            if (!ok) return;
            clearToken();
            try { localStorage.removeItem(VERIFIED); } catch { /* fine */ }
            if (also.input.checked) await forgetDrafts();
            location.reload();
          }, 'btn--danger'))));
  });
}

/* ---------- boot ---------- */
const cfg0 = settings();
$('set-owner').value = cfg0.owner; $('set-repo').value = cfg0.repo; $('set-branch').value = cfg0.branch;
const stored = getToken();
if (stored) signIn(stored, { fromStorage: true }); else showGate();
