// Pending changes: every file that would change, as a readable diff, the checks that must
// pass, and the only button in the editor that writes anything.
import { h, clear, field, btn, confirmBox, toast } from '../ui.js';
import { state, outputs, pendingCount, commitSummary, commit, discardFile, discardAll, clearNotices, photoMeta, dropAsset, fileUrl, publishToBranch, branchNameOk, compareUrl } from '../store.js';
import { validate } from '../validate.js';
import { lineDiff } from '../jsonpatch.js';
import { photoImg } from './photos.js';

const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const branchSlug = (s) => 'draft/' + (String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'changes');
function assetImg(path) {
  const img = h('img', { alt: '', loading: 'lazy', onerror: () => img.classList.add('noimg') });
  fileUrl(path).then((u) => { img.src = u; });
  return img;
}
const clip = (s) => (s.length > 600 ? s.slice(0, 600) + ' …' : s);

function diffBlock(o) {
  const hunks = lineDiff(o.baseText, o.text, 1);
  let add = 0, del = 0;
  const rows = [];
  hunks.forEach((hk, i) => {
    if (i) rows.push(h('div', { class: 'd d--gap', 'aria-hidden': 'true' }, '⋯'));
    for (const l of hk.lines) {
      if (l.t === '+') add++; if (l.t === '-') del++;
      rows.push(h('div', { class: 'd ' + (l.t === '+' ? 'd--add' : l.t === '-' ? 'd--del' : '') },
        h('span', { class: 'd__n', 'aria-hidden': 'true' }, l.t === '+' ? l.b : l.a),
        h('span', { class: 'd__s' }, h('span', { class: 'vh' }, l.t === '+' ? 'Added: ' : l.t === '-' ? 'Removed: ' : ''), (l.t === ' ' ? '  ' : l.t + ' ') + clip(l.s))));
    }
  });
  return { el: h('div', { class: 'diff', role: 'group', 'aria-label': `Changes to ${o.path}` }, rows), add, del };
}

export function changesView(root) {
  const host = h('div');
  const result = h('div', { 'aria-live': 'polite' });
  let message = '', messageEdited = false, busy = false;
  root.append(h('div', { class: 'view-head' }, h('h2', null, 'Pending changes')), host, result);

  function draw() {
    const outs = outputs().filter((o) => o.changed);
    const errs = validate();
    const n = pendingCount();
    if (!messageEdited) message = commitSummary();
    const msg = field({ label: 'Commit message', multiline: true, rows: 2, value: message, hint: 'Shown in the repository’s history.', oninput: (v) => { message = v; messageEdited = true; } });
    const where = `${state.gh.owner}/${state.gh.repo} · ${state.gh.branch}`;
    clear(host).append(
      h('p', { class: 'hint' }, 'Draft: ', h('strong', null, state.draftName), state.savedAt ? ` · saved in this browser ${when(state.savedAt)}` : ''),
      state.published ? h('p', { class: 'callout callout--good' }, 'This draft was published to the branch ', h('strong', { class: 'mono' }, state.published.branch), ` on ${when(state.published.at)}. `,
        h('a', { href: compareUrl(state.published.branch), target: '_blank', rel: 'noopener' }, 'Open a pull request on GitHub'), '. Publishing again adds a commit to that branch.') : null,
      state.gh.dry ? h('p', { class: 'callout' }, h('strong', null, 'Dry run. '), 'Nothing can be sent from here. “Commit” lists the exact requests that would go to GitHub instead.') : null,
      state.offline ? h('p', { class: 'callout callout--bad' }, 'Offline: working from the copy saved in this browser. Edits are kept here; commit when the connection is back.') : null,
      state.notices.length ? h('div', { class: 'callout callout--bad', role: 'alert' }, h('p', null, h('strong', null, 'Look these over before committing')),
        h('ul', null, state.notices.map((t) => h('li', null, t))), btn('Dismiss', clearNotices, 'btn--sm')) : null,
      !n ? h('p', { class: 'empty' }, 'No changes yet. Edits you make appear here before anything is saved.') : null,
      errs.length ? h('div', { class: 'callout callout--bad', role: 'alert' }, h('p', null, h('strong', null, `${errs.length} thing${errs.length > 1 ? 's' : ''} to fix before this can be committed`)),
        h('ul', null, errs.map((e) => h('li', null, e)))) : null,
      state.pending.length ? h('section', { class: 'card' }, h('h3', null, `New photographs (${state.pending.length})`),
        h('ul', { class: 'filelist' }, state.pending.map((p) => h('li', null, h('span', { class: 'herothumb' }, photoImg(p.name, '')),
          h('span', null, h('span', { class: 'mono' }, `slides/${p.file}`), h('br'), `${p.width}×${p.height} · ${kb(p.bytes)} · ${p.wmDone ? 'watermarked' : 'no watermark'} · ${photoMeta(p.name).alt || 'no description yet'}`))))) : null,
      state.assets.length ? h('section', { class: 'card' }, h('h3', null, `Project images (${state.assets.length})`),
        h('ul', { class: 'filelist' }, state.assets.map((a) => h('li', null, h('span', { class: 'herothumb' }, assetImg(a.path)),
          h('span', null, h('span', { class: 'mono' }, a.path), h('br'), `${a.width}×${a.height} · ${kb(a.bytes)} · ${a.kind === 'icon' ? 'icon' : 'screenshot'}`),
          btn('Remove', () => dropAsset(a.path), 'btn--sm'))))) : null,
      state.removed.length ? h('section', { class: 'card' }, h('h3', null, `Photographs to delete (${state.removed.length})`),
        h('ul', { class: 'filelist' }, state.removed.map((nm) => h('li', null, h('span', { class: 'herothumb' }, photoImg(nm, '')), h('span', { class: 'mono' }, `slides/${nm}`))))) : null,
      outs.map((o) => {
        const d = diffBlock(o);
        return h('details', { class: 'rec', open: true },
          h('summary', null, h('span', { class: 'rec__sum mono' }, o.path), h('span', { class: 'hint' }, ` +${d.add} −${d.del}`)),
          h('div', { class: 'rec__body' },
            o.reformatted ? h('p', { class: 'callout callout--bad' }, 'This file could not be edited in place, so it would be rewritten in a plain layout. The content is right; the diff is larger than the change.') : null,
            d.el,
            h('div', { class: 'row row--end' }, btn('Discard changes to this file', async () => {
              if (await confirmBox({ title: `Discard changes to ${o.path}?`, body: 'Your edits to this file are thrown away.', yes: 'Discard', danger: true })) discardFile(o.key);
            }, 'btn--sm'))));
      }),
      n ? h('section', { class: 'card commitbox' },
        h('p', { class: 'hint' }, `Will be committed to `, h('strong', { class: 'mono' }, where), '. The deploy then rebuilds the pages; allow a minute or two.'),
        msg,
        h('div', { class: 'row row--end' },
          btn('Discard everything', async () => {
            if (await confirmBox({ title: 'Discard every pending change?', body: 'All unsent edits and new photos on this device are thrown away.', yes: 'Discard all', danger: true })) { messageEdited = false; discardAll(); }
          }),
          btn('Full-screen preview', () => document.dispatchEvent(new CustomEvent('wm-preview-full'))),
          btn('Publish to a separate branch…', () => publish(msg.input), '', { disabled: errs.length > 0 || busy || state.offline }),
          btn(state.gh.dry ? 'Show what would be sent' : `Commit to ${state.gh.branch}…`, () => send(msg.input), 'btn--solid', { disabled: errs.length > 0 || busy || state.offline }))) : null);
  }

  const fileLines = () => [...outputs().filter((o) => o.changed).map((o) => o.path), ...state.pending.map((p) => `slides/${p.file} (new)`), ...state.assets.map((a) => `${a.path} (new)`), ...state.removed.map((nm) => `slides/${nm} (delete)`)];
  const dryLog = (r, title) => h('section', { class: 'card' },
    h('h3', null, title),
    h('p', { class: 'hint' }, 'Nothing was sent. Each request would carry the token in an Authorization header and go only to api.github.com.'),
    h('ol', { class: 'reqlog' }, r.log.map((q) => h('li', null,
      h('p', null, h('strong', { class: 'mono' }, q.method), ' ', h('span', { class: 'mono' }, q.url)),
      h('p', { class: 'hint' }, q.note),
      q.body ? h('pre', { class: 'mono', tabindex: 0 }, JSON.stringify(q.body, (k, v) => (k === 'content' && typeof v === 'string' && v.length > 1500 ? v.slice(0, 1500) + `\n… (${v.length.toLocaleString('en')} characters in all)` : v), 2)) : null))));

  /** Sends the draft to a branch of its own, so it can be looked at (or reviewed) before it goes live. */
  async function publish(input) {
    const text = message.trim();
    if (!text) { toast('Write a commit message first.', 'bad'); input.focus(); return; }
    let name = (state.published && state.published.branch) || branchSlug(state.draftName);
    const nameF = field({ label: 'Branch name', value: name, mono: true, hint: `Created from ${state.gh.branch} if it does not exist yet. ${state.gh.branch} itself is not touched, so nothing goes live.`, oninput: (v) => { name = v.trim(); } });
    const ok = await confirmBox({
      title: state.gh.dry ? 'Dry run: list the requests?' : 'Publish this draft to a branch?', yes: state.gh.dry ? 'List requests' : 'Publish',
      body: h('div', null, nameF, h('p', { class: 'quote' }, text), h('ul', { class: 'mono' }, fileLines().map((f) => h('li', null, f)))),
    });
    if (!ok) return;
    if (!branchNameOk(name) || name === state.gh.branch) { toast(name === state.gh.branch ? `${name} is the live branch. Use Commit for that.` : 'That is not a usable branch name. Use letters, digits, dashes, dots and slashes.', 'bad'); return; }
    busy = true; draw();
    clear(result).append(h('p', { class: 'callout', role: 'status' }, 'Working…'));
    try {
      const r = await publishToBranch(name, text, (step) => { result.firstChild.textContent = step === 'commit' ? 'Writing the commit…' : `Uploading ${step}…`; });
      clear(result);
      if (r.status === 'dry') result.append(dryLog(r, `Dry run: requests that would publish to ${r.branch}`));
      else result.append(h('p', { class: 'callout callout--good', role: 'status' }, r.created ? 'Created the branch ' : 'Added a commit to ', h('strong', { class: 'mono' }, r.branch), ' (', h('span', { class: 'mono' }, r.sha.slice(0, 7)), `). ${state.gh.branch} is unchanged and nothing is live. `,
        h('a', { href: compareUrl(r.branch), target: '_blank', rel: 'noopener' }, 'Open a pull request on GitHub'), ' to review and merge it; the draft stays here until then.'));
    } catch (e) {
      clear(result).append(h('p', { class: 'callout callout--bad', role: 'alert' }, h('strong', null, 'Nothing was published. '), e.message));
    }
    busy = false; draw();
  }

  async function send(input) {
    const text = message.trim();
    if (!text) { toast('Write a commit message first.', 'bad'); input.focus(); return; }
    const files = fileLines();
    const ok = await confirmBox({
      title: state.gh.dry ? 'Dry run: list the requests?' : `Commit to ${state.gh.branch}?`,
      yes: state.gh.dry ? 'List requests' : 'Commit',
      body: h('div', null,
        h('p', null, h('span', { class: 'mono' }, `${state.gh.owner}/${state.gh.repo}`), ' · branch ', h('strong', { class: 'mono' }, state.gh.branch)),
        h('p', { class: 'quote' }, text),
        h('ul', { class: 'mono' }, files.map((f) => h('li', null, f)))),
    });
    if (!ok) return;
    busy = true; draw();
    clear(result).append(h('p', { class: 'callout', role: 'status' }, 'Working…'));
    try {
      const r = await commit(text, (step) => { result.firstChild.textContent = step === 'commit' ? 'Writing the commit…' : `Uploading ${step}…`; });
      clear(result);
      if (r.status === 'done') {
        messageEdited = false;
        result.append(h('p', { class: 'callout callout--good', role: 'status' }, 'Committed ', h('span', { class: 'mono' }, r.sha.slice(0, 7)), '. The deploy is rebuilding the site; new photos show here from this device until it finishes.'));
      } else if (r.status === 'review') {
        const lines = [...r.conflicts.map((c) => `Both sides changed ${c}; your version was kept.`), ...r.renamed.map((nm) => `A new photo was renamed to ${nm} because that number was taken.`)];
        result.append(h('div', { class: 'callout callout--bad', role: 'alert' },
          h('p', null, h('strong', null, 'Nothing was sent. '), `The repository changed since this page loaded (${r.movedFiles.join(', ') || 'new photographs'}). Your edits have been reapplied on top of the latest files; check the diff above and press Commit again.`),
          lines.length ? h('ul', null, lines.map((t) => h('li', null, t))) : null));
      } else {
        result.append(dryLog(r, 'Dry run: requests a real commit would send'));
      }
    } catch (e) {
      clear(result).append(h('p', { class: 'callout callout--bad', role: 'alert' }, h('strong', null, 'The branch was not moved. '), e.message));
    }
    busy = false; draw();
  }
  return { draw };
}
