/* The reading desk: where the keeper of the trail opens sealed runs.
 *
 * Everything happens in this browser. The private key is kept in IndexedDB as a locked
 * (non-extractable) key: this page can use it to open runs but cannot read it back out. Runs, and
 * the notes readers leave on them, are kept sealed and opened in memory each time. The only network requests are for this page's own
 * files and, when asked, api.github.com: the list of issues, and (only if a private notes
 * repository is named) the readers' sealed notes. Nothing else is ever uploaded.
 *
 * A stage is shown the way the hiker met it by stage.html, in a frame: that page draws it with the
 * trail's own code from a copy of what the stage kept. It is never given the key.
 */
import {
  generateKeyPair, exportPrivateKey, importPrivateKey, importPublicKey, sealRun, openRun, readEnvelope,
  readSealedBlock, readPublicBlock, inspectPublicBlock, publicPart, splitToShares, combineShares, decodeShare, CAMP_IDS, PRIVATE_CAMP, BEGIN,
} from '../seal.js?v=d0703ed6';

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const announce = (text) => { $('live').textContent = ''; setTimeout(() => { $('live').textContent = text; }, 30); };
const sayer = () => { const p = h('p', { class: 'say', role: 'status' }); p.tell = (text, kind) => { p.textContent = text || ''; p.className = 'say' + (kind ? ' is-' + kind : ''); }; return p; };
const why = (e) => (e && e.name === 'TrailError' ? e.message : 'Something went wrong in this browser: ' + (e && e.message ? e.message : 'unknown') + '.');
const download = (name, text, type = 'application/json') => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } };
const field = (label, input, hint) => { const id = input.id || (input.id = 'f' + Math.random().toString(36).slice(2, 9)); const kids = [h('label', { for: id, text: label }), input]; if (hint) { const hid = id + '-h'; input.setAttribute('aria-describedby', hid); kids.push(h('p', { class: 'hint', id: hid, text: hint })); } return h('div', { class: 'field' }, kids); };
const btn = (text, onclick, cls = '') => h('button', { type: 'button', class: 'btn ' + cls, text, onclick });
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso || '') : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const hexOf = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');

/* ---------- what is kept in this browser ---------- */
const db = (() => {
  let open;
  const get = () => open || (open = new Promise((res, rej) => {
    const r = indexedDB.open('wm-trail-desk', 2);
    r.onupgradeneeded = () => { const d = r.result; for (const [name, opt] of [['kv'], ['runs', { keyPath: 'id' }], ['notes', { keyPath: 'id' }]]) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await get(); return new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); };
  return {
    get: (k) => tx('kv', 'readonly', (s) => s.get(k)), put: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)), del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
    runs: () => tx('runs', 'readonly', (s) => s.getAll()), putRun: (r) => tx('runs', 'readwrite', (s) => s.put(r)), delRun: (id) => tx('runs', 'readwrite', (s) => s.delete(id)),
    notes: () => tx('notes', 'readonly', (s) => s.getAll()), putNote: (n) => tx('notes', 'readwrite', (s) => s.put(n)),
  };
})();
const TOKEN = 'wm-desk:token', REPO = 'wm-desk:repo', ME = 'wm-desk:me', NOTES_REPO = 'wm-desk:notes-repo';
const local = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private window */ } } };

const state = { key: null, stewards: null, hasBackup: false, config: null, runs: [], opened: new Map(), ref: null, reading: null, freshShares: null, notes: new Map(), noteRecs: new Map(), walk: null, plain: false, about: {} };

/* ---------- 1. the key ---------- */
async function makeKey(pass, tell) {
  tell('Making a key. This can take a little while…');
  const pair = await generateKeyPair();
  tell('Locking the backup with your passphrase…');
  const backup = await exportPrivateKey(pair.privateKey, pass);
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const stewardsBackup = await exportPrivateKey(pair.privateKey, secret);
  const split = splitToShares(secret, { shares: 4, threshold: 3 }); secret.fill(0);
  const locked = await importPrivateKey(backup, pass);            // proves the backup opens, and gives a key this page cannot read back out
  const key = { privateKey: locked.privateKey, publicJwk: pair.publicJwk, kid: pair.kid, created: new Date().toISOString() };
  const stewards = { backup: { ...stewardsBackup, shares: { set: split.set, threshold: split.threshold, of: split.shares } }, made: key.created };
  await db.put('key', key); await db.put('backup', backup); await db.put('stewards', stewards);
  Object.assign(state, { key, stewards, hasBackup: true, freshShares: split.texts });
}

function configText() { return JSON.stringify({ publicKey: state.key.publicJwk, keyId: state.key.kid }, null, 2); }

function paintKey() {
  const el = $('key'); el.textContent = '';
  const say = sayer();
  if (!state.key) {
    const p1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 12, required: true }), p2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 12, required: true });
    const go = btn('Make my key', async () => {
      if (p1.value.length < 12) return say.tell('Choose a passphrase of at least 12 characters. Several unrelated words is best.', 'bad');
      if (p1.value !== p2.value) return say.tell('The two passphrases are not the same.', 'bad');
      go.disabled = true;
      try { await makeKey(p1.value, (t) => say.tell(t)); paintAll(); announce('Your key is made. Next: download the backup, and copy the public key into config.json.'); }
      catch (e) { say.tell(why(e), 'bad'); go.disabled = false; }
    }, 'btn--solid');
    const file = h('input', { type: 'file', accept: '.json,application/json' }), rp = h('input', { type: 'password', autocomplete: 'current-password' }), rsay = sayer();
    el.append(
      h('p', { text: 'There is no key in this browser yet. A key has two halves. The public half goes on the site and can only seal runs. The private half opens them, and it stays here.' }),
      h('div', { class: 'grid2' }, field('Passphrase for the backup', p1, 'At least 12 characters. It protects the backup file, not this page. Without it the backup cannot be opened, and nobody can reset it.'), field('The same passphrase again', p2)),
      h('div', { class: 'row' }, go), say,
      h('details', null, h('summary', { text: 'Bring a key from a backup file instead' }),
        h('p', { class: 'hint', text: 'For a second device, or after clearing this browser. To bring a key back with shares, use “Check shares” in the next section.' }),
        field('Backup file (trail-key-backup.json)', file), field('Its passphrase', rp),
        h('div', { class: 'row' }, btn('Restore the key', async () => {
          try {
            if (!file.files[0]) return rsay.tell('Choose the backup file first.', 'bad');
            rsay.tell('Opening the backup…');
            const backup = JSON.parse(await file.files[0].text()), got = await importPrivateKey(backup, rp.value);
            const key = { privateKey: got.privateKey, publicJwk: got.publicJwk, kid: got.kid, created: new Date().toISOString() };
            await db.put('key', key); await db.put('backup', backup); state.key = key; state.hasBackup = true; await reopenAll(); await openNotes(); paintAll(); announce('The key is back in this browser.');
          } catch (e) { rsay.tell(e instanceof SyntaxError ? 'That is not a key backup file.' : why(e), 'bad'); }
        })), rsay));
    return;
  }
  const cfg = state.config, site = !cfg ? 'The site’s trail/config.json could not be read from here.' : !cfg.publicKey ? 'The site’s trail/config.json has no key yet, so the summit says sending is not open.' : cfg.kid === state.key.kid ? 'The site is sealing runs to this key.' : 'The site’s trail/config.json holds a different key (' + String(cfg.kid).slice(0, 8) + '…). Runs sealed to it cannot be opened with the key in this browser.';
  const box = h('textarea', { readonly: true, rows: 8, spellcheck: 'false' }); box.value = configText();
  el.append(
    h('p', { class: 'callout ' + (cfg && cfg.kid === state.key.kid ? 'callout--good' : ''), text: site }),
    h('dl', { class: 'facts' }, h('div', null, h('dt', { text: 'Key id' }), h('dd', { class: 'mono', text: state.key.kid })), h('div', null, h('dt', { text: 'In this browser since' }), h('dd', { text: when(state.key.created) })), h('div', null, h('dt', { text: 'Kind' }), h('dd', { text: 'RSA-OAEP, 4096 bits, locked to this browser' }))),
    field('The public half: paste these two values into trail/config.json', box, 'This is not secret. Replace the "publicKey" and "keyId" lines of trail/config.json with these, and fill in "repo" and "email" there too.'),
    h('div', { class: 'row' }, btn('Copy', async () => say.tell(await copy(box.value) ? 'Copied.' : 'Copying did not work: select the text and copy it by hand.', 'good')),
      state.hasBackup ? btn('Download the backup file', async () => { download('trail-key-backup.json', JSON.stringify(await db.get('backup'), null, 2)); say.tell('Saved. Keep the file somewhere other than this computer. It opens only with your passphrase.', 'good'); }) : null,
      btn('Forget the key on this device', async () => {
        if (!confirm('Remove the private key from this browser?\n\nRuns can then only be opened again by restoring the backup file with its passphrase, or with three of the four shares. If you have neither, every sealed run becomes unreadable for good.')) return;
        await db.del('key'); await db.del('backup'); await db.del('stewards'); Object.assign(state, { key: null, stewards: null, hasBackup: false, freshShares: null }); state.opened.clear(); paintAll(); announce('The key has been removed from this browser.');
      })),
    say,
    h('p', { class: 'hint', text: 'The private half cannot be shown or copied from this page, by design. The backup file is the only other copy: it is encrypted with your passphrase (PBKDF2, a million rounds, then AES-256-GCM).' }));
}

/* ---------- 2. shares ---------- */
function shareCard(text, i, n, t, kid) {
  const card = h('div', { class: 'share' },
    h('h3', { text: `Share ${i + 1} of ${n}` }),
    h('p', { text: `One of ${n} shares for reading runs of The Trail at wemiller.com. On its own it opens nothing and says nothing. Any ${t} of the ${n} together, with the stewards’ file, open the runs.` }),
    h('code', { class: 'share__text', text: text.match(/.{1,5}/g).join(' ') }),
    h('p', { text: `Keep it private and safe. To use it: go to wemiller.com/trail/desk/, “Check shares”. Key ${kid.slice(0, 8)}. Spaces do not matter.` }));
  card.append(h('div', { class: 'row' }, btn('Print this card', () => {
    const holder = $('print'); holder.textContent = ''; holder.append(card.cloneNode(true));
    document.documentElement.classList.add('is-printing');
    const done = () => { document.documentElement.classList.remove('is-printing'); holder.textContent = ''; removeEventListener('afterprint', done); };
    addEventListener('afterprint', done); print();
  }, 'btn--small'), btn('Copy', async (e) => { e.target.textContent = await copy(text) ? 'Copied' : 'Copy failed'; }, 'btn--small')));
  return card;
}

function paintShares() {
  const el = $('shares'); el.textContent = '';
  el.append(h('p', { text: 'For the day you cannot read runs yourself. The key is locked in a second file (the stewards’ file) by a secret that is cut into four shares. Any three shares rebuild the secret; one or two reveal nothing at all. Give each share to one person, and give everyone a copy of the stewards’ file.' }));
  const say = sayer();
  if (state.freshShares) {
    const s = state.stewards.backup.shares;
    el.append(h('p', { class: 'callout callout--good', text: 'These four shares are shown once. They are not kept in this browser: when you leave or reload this page they are gone, and new ones would have to be made. Print or copy each one now.' }),
      h('div', { class: 'cards' }, state.freshShares.map((t, i) => shareCard(t, i, s.of, s.threshold, state.key.kid))));
  }
  if (state.key) {
    const pass = h('input', { type: 'password', autocomplete: 'current-password' });
    el.append(h('div', { class: 'row' }, state.stewards ? btn('Download the stewards’ file', () => { download('trail-stewards-file.json', JSON.stringify(state.stewards.backup, null, 2)); say.tell('Saved. This file is safe to copy widely: it is locked by a random secret that only three shares together can rebuild.', 'good'); }) : null),
      state.stewards ? h('p', { class: 'hint', text: `The stewards’ file in this browser belongs to share set ${state.stewards.backup.shares.set.toUpperCase()}, made ${when(state.stewards.made)}.` }) : h('p', { class: 'hint', text: 'This browser has no stewards’ file (the key was restored from a backup). Make new shares below to create one.' }),
      state.hasBackup ? h('details', null, h('summary', { text: 'Make four new shares' }),
        h('p', { class: 'hint', text: 'Do this if a share is lost or someone changes. It makes a new stewards’ file and four new shares; the old shares stop being useful only once every copy of the old stewards’ file is gone, so replace those copies.' }),
        field('Your backup passphrase', pass),
        h('div', { class: 'row' }, btn('Make new shares', async () => {
          try {
            say.tell('Opening the backup…');
            const got = await importPrivateKey(await db.get('backup'), pass.value, { extractable: true });
            const secret = crypto.getRandomValues(new Uint8Array(32)), sb = await exportPrivateKey(got.privateKey, secret), split = splitToShares(secret, { shares: 4, threshold: 3 }); secret.fill(0);
            state.stewards = { backup: { ...sb, shares: { set: split.set, threshold: 3, of: 4 } }, made: new Date().toISOString() };
            await db.put('stewards', state.stewards); state.freshShares = split.texts; paintShares(); announce('Four new shares are shown. Print or copy each one now.');
          } catch (e) { say.tell(why(e), 'bad'); }
        }))) : null);
  }
  /* the combine tool */
  const inputs = [0, 1, 2, 3].map(() => h('input', { autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', class: 'mono', placeholder: 'TRAIL-SHARE-1-…' }));
  const file = h('input', { type: 'file', accept: '.json,application/json' }), out = h('div'), csay = sayer();
  el.append(h('h3', { text: 'Check shares' }),
    h('p', { text: 'Type or paste three shares to prove that they work, or to bring the key into this browser. Nothing typed here leaves this page.' }),
    h('div', { class: 'grid2' }, inputs.map((input, i) => field(`Share (${i < 3 ? 'needed' : 'optional'})`, input))),
    field('Stewards’ file', file, state.stewards ? 'Leave empty to use the one already in this browser.' : 'Choose the trail-stewards-file.json that came with the shares.'),
    h('div', { class: 'row' }, btn('Check these shares', async () => {
      out.textContent = '';
      try {
        const texts = inputs.map((i) => i.value.trim()).filter(Boolean);
        if (texts.length < 2) return csay.tell('Enter at least three shares.', 'bad');
        texts.forEach(decodeShare);                                                  // a typing mistake is named before anything else
        const backup = file.files[0] ? JSON.parse(await file.files[0].text()) : state.stewards && state.stewards.backup;
        if (!backup) return csay.tell('Choose the stewards’ file too.', 'bad');
        const { secret, set } = combineShares(texts);
        if (backup.shares && backup.shares.set !== set) return csay.tell(`These shares are from set ${set.toUpperCase()}, but this stewards’ file belongs to set ${String(backup.shares.set).toUpperCase()}.`, 'bad');
        const got = await importPrivateKey(backup, secret); secret.fill(0);
        csay.tell(`These ${texts.length} shares open the stewards’ file. The key inside is ${got.kid.slice(0, 8)}…${state.key ? (got.kid === state.key.kid ? ', the same key as in this browser.' : ', which is NOT the key in this browser.') : '.'}`, 'good');
        if (!state.key) out.append(h('div', { class: 'row' }, btn('Use this key in this browser', async () => {
          const key = { privateKey: got.privateKey, publicJwk: got.publicJwk, kid: got.kid, created: new Date().toISOString() };
          await db.put('key', key); await db.put('stewards', { backup, made: key.created }); state.key = key; state.stewards = { backup, made: key.created };
          await reopenAll(); await openNotes(); paintAll(); announce('The key is in this browser. Runs can be opened now.');
        }, 'btn--solid')));
      } catch (e) { csay.tell(e instanceof SyntaxError ? 'That is not a stewards’ file.' : why(e), 'bad'); }
    })), csay, out);
}

/* ---------- 3. runs ---------- */
async function openOne(rec) {
  if (!state.key) { state.opened.set(rec.id, { error: 'There is no key in this browser.' }); return; }
  try { state.opened.set(rec.id, await openRun(rec.envelope, state.key.privateKey, { kid: state.key.kid })); }
  catch (e) { state.opened.set(rec.id, { error: why(e) }); }
}
async function reopenAll() { state.opened.clear(); for (const rec of state.runs) await openOne(rec); }

async function addEnvelope(text, source) {
  const envelope = readSealedBlock(text); if (!envelope) return false;
  readEnvelope(envelope);                                                             // throws with a plain reason when it is not one
  const id = await hexOf(envelope.replace(/\s+/g, ''));
  const old = state.runs.find((r) => r.id === id);
  const keep = old && old.source.type === 'issue' && source.type !== 'issue';
  const rec = { id, envelope, source: keep ? old.source : source, pub: keep ? old.pub : source.pub !== undefined ? source.pub : readPublicBlock(text), why: keep ? old.why : source.why || null, added: old ? old.added : new Date().toISOString() };
  delete rec.source.pub; delete rec.source.why;
  await db.putRun(rec); state.runs = state.runs.filter((r) => r.id !== id).concat(rec); await openOne(rec);
  return true;
}

async function addText(text, name) {
  if (text.includes(BEGIN)) return (await addEnvelope(text, { type: 'file', name })) ? 'added' : 'none';
  let obj; try { obj = JSON.parse(text); } catch (e) { return 'none'; }
  if (obj && obj.kind === 'trail-key-backup') return 'backup';
  if (obj && typeof obj.body === 'string' && obj.body.includes(BEGIN)) return (await addEnvelope(obj.body, { type: 'file', name })) ? 'added' : 'none';
  if (obj && typeof obj.handle === 'string' && obj.camps && typeof obj.camps === 'object') {
    if (!state.key) return 'nokey';
    // an unsealed run file (the trail's "Save my run as a file"): seal it to this key so that it, too, is kept sealed here
    const send = obj.send && typeof obj.send === 'object' ? obj.send : {}; delete obj.send;
    const envelope = await sealRun(obj, state.key.publicJwk, { choices: { pool: send.pool === true, now: send.now === true, public: send.public === true }, contact: '', public: null, unsealedFile: true });
    return (await addEnvelope(envelope, { type: 'plain', name, pub: null })) ? 'added' : 'none';
  }
  return 'none';
}

async function loadIssues(repo, token, tell) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return tell('Write the repository as owner/name.', 'bad');
  if (/^ghp_/.test(token)) return tell('That is a classic token, which can reach every repository you have. Use a fine-grained token limited to this repository with “Issues: Read-only”, or no token at all if the repository is public.', 'bad');
  local.set(REPO, repo); local.set(TOKEN, token);
  let found = 0, seen = 0;
  for (let page = 1; page <= 50; page++) {
    tell(`Asking GitHub for issues (page ${page})…`);
    let res;
    try { res = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); }
    catch (e) { return tell('GitHub could not be reached. Runs already in this browser can still be read.', 'bad'); }
    if (!res.ok) return tell(res.status === 401 ? 'GitHub did not accept the token.' : res.status === 403 || res.status === 429 ? 'GitHub refused: a rate limit was hit, or the token may not read issues here. Without a token GitHub allows 60 requests an hour.' : res.status === 404 ? 'GitHub found no such repository (or it is private and needs a token).' : `GitHub answered ${res.status}.`, 'bad');
    const list = await res.json(); if (!Array.isArray(list) || !list.length) break;
    for (const issue of list) {
      seen++;
      if (issue.pull_request || typeof issue.body !== 'string' || !issue.body.includes(BEGIN)) continue;
      try { if (await addEnvelope(issue.body, { type: 'issue', number: issue.number, login: issue.user && issue.user.login, url: issue.html_url, at: issue.created_at, state: issue.state, labels: (Array.isArray(issue.labels) ? issue.labels : []).map((l) => (l && typeof l.name === 'string' ? l.name : '')).filter(Boolean), ...inspectPublicBlock(issue.body) })) found++; } catch (e) { /* not a real envelope: skip it */ }
    }
    if (list.length < 100) break;
  }
  paintRuns(); tell(`${seen} issues looked at, ${found} sealed ${found === 1 ? 'run' : 'runs'} found.`, 'good');
}

const SAMPLE = () => ({ v: 2, handle: 'Sample Hiker', seed: 7, began: new Date(Date.now() - 864e5).toISOString(), at: { camp: 'workshop', stage: 'done' }, camps: {
  trailhead: { done: new Date(Date.now() - 8e7).toISOString(), parts: { route: { hints: 1, ms: 312000, done: true, moves: 33, best: 29, resets: 1, undos: 4, path: [126, 127, 113, 99, 100, 86] }, sky: { hints: 0, ms: 95000, done: true, tries: 2 }, choice: { hints: 1, asks: 2, ms: 140000, done: true, option: 'split', said: 'I would split the group, and say so plainly to everyone before we set off.',
      log: [[0, 'o'], [140, 'c', 'choice', 'valley', 1], [310, 'w', 'said', 0, 0, 'I would take'], [345, 'w', 'said', 12, 0, ' the valley way down'], [700, 'l', 'Nobody is marking this one. Say what you would really say.'], [760, 'l', 'Nobody is marking this one. Say what you would really say.'], [930, 'c', 'choice', 'split', 1], [1010, 'w', 'said', 8, 24, 'split the group'], [1040, 'b', 'That is my call'], [1040, 's', 'Say a little more, in your own words.', 0], [1250, 'w', 'said', 23, 0, ', and say so plainly to everyone before we set off.'], [1390, 'b', 'That is my call'], [1390, 'd']] }, fire: { hints: 0, ms: 260000, done: true, said: 'A sample answer at the campfire.\nIt has two lines.', ai: 'no' } } },
  workshop: { done: new Date(Date.now() - 4e7).toISOString(), parts: { pipes: { hints: 2, ms: 480000, done: true, retries: 3, said: 'Found the leak on the third try.' } } },
} });

function sourceText(rec) { const s = rec.source; return s.type === 'issue' ? `Issue #${s.number}${s.login ? ' from ' + s.login : ''}` : s.type === 'plain' ? `Unsealed file${s.name ? ' ' + s.name : ''}, sealed here` : s.type === 'sample' ? 'Sample made on this page' : s.type === 'paste' ? 'Pasted' : `File${s.name ? ' ' + s.name : ''}`; }

/** Compares what an issue shows publicly with what the sealed run would produce. */
function publicCheck(rec, got) {
  if (!rec.pub) return rec.source.type === 'issue' ? 'Nothing public' : 'Not sent through GitHub, so nothing is public';
  const strip = (p) => { if (!p) return ''; const { profile, ...rest } = p; return JSON.stringify(rest); };
  return strip(rec.pub) === strip(publicPart(got.run, {})) ? 'The public part matches the run' : 'The public part DIFFERS from the sealed run';
}

function paintRuns() {
  const el = $('runs'); el.textContent = '';
  const say = sayer();
  const repo = h('input', { class: 'mono', autocapitalize: 'off', spellcheck: 'false', placeholder: 'owner/name' }); repo.value = local.get(REPO) || (state.config && state.config.repo) || '';
  const token = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'only for a private repository' }); token.value = local.get(TOKEN);
  const paste = h('textarea', { rows: 5, spellcheck: 'false', placeholder: '-----BEGIN TRAIL RUN-----' });
  const file = h('input', { type: 'file', multiple: true, accept: '.txt,.json,.eml,text/plain,application/json' });
  const takeFiles = async (files) => {
    const got = { added: 0, none: 0, backup: 0, nokey: 0 };
    for (const f of files) { try { got[f.size > 3e6 ? 'none' : await addText(await f.text(), f.name)]++; } catch (e) { got.none++; } }
    paintRuns();
    $('runs').querySelector('.say').tell(`${got.added} added.` + (got.none ? ` ${got.none} had no run in them.` : '') + (got.backup ? ' A key backup belongs in “The key”, not here.' : '') + (got.nokey ? ' An unsealed run file needs a key in this browser first.' : ''), got.added ? 'good' : 'bad');
  };
  const drop = h('div', { class: 'drop' }, field('Files: sealed runs saved from the trail, e-mail attachments, or an unsealed run file (your own, for the reference)', file, 'You can also drop files onto this box.'));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); takeFiles([...e.dataTransfer.files]); });
  file.addEventListener('change', () => takeFiles([...file.files]));

  el.append(
    h('p', { text: 'Runs arrive sealed. They are kept sealed in this browser and opened only while this page is showing them, so everything already loaded can be read with no connection.' }),
    h('div', { class: 'grid2' }, field('Repository the issues are in', repo), field('GitHub token (optional)', token, 'A public repository needs none. For a private one: a fine-grained token, this repository only, “Issues: Read-only”. It is kept in this browser and sent only to api.github.com. If you want the Approve button below to add the label for you, the token needs “Issues: Read and write”; without that you add the label on GitHub yourself.')),
    h('div', { class: 'row' }, btn('Load from GitHub', () => loadIssues(repo.value.trim(), token.value.trim(), (t, k) => say.tell(t, k)), 'btn--solid'), btn('Forget the token', () => { local.set(TOKEN, ''); token.value = ''; say.tell('The token has been removed from this browser.', 'good'); })),
    h('details', null, h('summary', { text: 'Add a run by pasting it or from a file' }),
      field('Paste a sealed run (the whole e-mail or issue text is fine)', paste),
      h('div', { class: 'row' }, btn('Add what I pasted', async () => { try { if (await addEnvelope(paste.value, { type: 'paste' })) { paste.value = ''; paintRuns(); $('runs').querySelector('.say').tell('Added.', 'good'); } else say.tell('There is no sealed run in that text.', 'bad'); } catch (e) { say.tell(why(e), 'bad'); } })),
      drop),
    state.key ? h('div', { class: 'row' }, btn('Try it: seal a sample run and read it back', async () => {
      try { await addEnvelope(await sealRun(SAMPLE(), state.key.publicJwk, { choices: { pool: true, now: false, public: true }, contact: 'sample@example.org', public: publicPart(SAMPLE(), { public: true, line: 'A sample entry' }) }), { type: 'sample', pub: undefined }); paintRuns(); const rec = state.runs[state.runs.length - 1]; read(rec.id); $('runs').querySelector('.say').tell('A sample run was sealed with the public key and opened again with the private key in this browser. It is shown below.', 'good'); }
      catch (e) { say.tell(why(e), 'bad'); }
    })) : h('p', { class: 'callout', text: 'There is no key in this browser, so runs can be collected here but not opened. Make or restore a key in “The key”.' }),
    say);

  if (!state.runs.length) { el.append(h('p', { class: 'hint', text: 'No runs here yet. When someone sends one, it will be waiting for you here.' })); return; }
  const cards = state.runs.slice().sort((a, b) => String(b.source.at || b.added).localeCompare(String(a.source.at || a.added))).map((rec) => {
    const got = state.opened.get(rec.id) || { error: 'Not opened yet.' }, ok = !got.error, isRef = state.ref === rec.id, n = notesFor(rec.id).length;
    const link = rec.source.url && /^https:\/\/github\.com\//.test(rec.source.url) ? h('a', { href: rec.source.url, target: '_blank', rel: 'noopener noreferrer', text: sourceText(rec) }) : sourceText(rec);
    return h('li', { class: 'run' + (state.reading === rec.id ? ' is-open' : '') },
      h('h3', { class: 'run__name' }, ok ? String(got.run.handle || '(no name)') : 'A run that could not be opened', isRef ? h('span', { class: 'tag tag--on', text: 'your reference' }) : null),
      h('p', { class: 'run__from' }, link, ok ? ` · sealed ${when(got.sealedAt)}` : ''),
      ok ? asked(got.meta.choices || {}) : h('p', { class: 'hint', text: got.error }),
      ok ? h('p', { class: 'hint', text: publicCheck(rec, got) + '.' + (n ? ` ${n} ${n === 1 ? 'note' : 'notes'} from readers.` : '') }) : null,
      h('div', { class: 'row' }, ok ? btn(state.reading === rec.id ? 'Reading now' : 'Sit down with this run', () => read(rec.id), 'btn--solid btn--small') : null,
        ok ? btn(isRef ? 'Stop using as reference' : 'Use as reference', async () => { state.ref = isRef ? null : rec.id; await (state.ref ? db.put('ref', state.ref) : db.del('ref')); paintRuns(); paintRead(); }, 'btn--small') : null,
        btn('Remove from this browser', async () => { if (!confirm('Remove this run from this browser? The issue or file it came from is not touched, and notes about it are kept.')) return; await db.delRun(rec.id); state.runs = state.runs.filter((r) => r.id !== rec.id); state.opened.delete(rec.id); if (state.ref === rec.id) { state.ref = null; await db.del('ref'); } if (state.reading === rec.id) state.reading = null; paintRuns(); paintRead(); }, 'btn--small btn--quiet')));
  });
  el.append(h('ul', { class: 'runs', 'aria-label': 'Runs in this browser' }, cards),
    h('p', { class: 'hint', text: 'Anyone can send a run under any trail name, and can copy someone else’s issue. The GitHub account is who posted it; the trail name is whatever the hiker typed.' }));
  paintPending(el);
}

/* What hikers asked to make public, and whether a person has said yes to it yet. Nothing is on the
 * register until its issue carries the approval label, which only someone with write access can add. */
const CAMPS_SHORT = { trailhead: 'The Trailhead', workshop: 'The Workshop', shelter: 'The Shelter', overlook: 'The Overlook', summit: 'The Summit' };
function asShown(pub) {
  const last = pub.camps[pub.camps.length - 1], hints = Object.values(pub.hints).reduce((n, x) => n + x, 0), m = pub.minutes;
  const fact = (k, v) => h('div', null, h('dt', { text: k }), h('dd', { text: v }));
  return h('dl', { class: 'facts' }, fact('Hiker', pub.handle), fact('Their line', pub.profile && pub.profile.line ? pub.profile.line : '(none)'),
    fact('Reached', last ? `${CAMPS_SHORT[last.id]}, ${pub.camps.length} of ${CAMP_IDS.length}${pub.flags.oneSitting ? ', in one day' : ''}` : 'no camp yet (would not be listed)'),
    fact('When', last ? pub.camps.reduce((d, c) => (c.done > d ? c.done : d), '') : '–'), fact('Trail time', !m ? '–' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`),
    fact('Asked Luma', pub.flags.quiet ? 'nothing' : String(hints)), fact('Fresh starts', pub.flags.restarts ? String(pub.flags.restarts) : 'none'),
    fact('The way', pub.flags.shortestWay ? 'the shortest way' : pub.flags.longWay ? 'the long way' : '–'));
}
function paintPending(el) {
  const fromIssues = state.runs.filter((r) => r.source.type === 'issue'); if (!fromIssues.length) return;
  const label = (state.config && state.config.label) || 'trail:approved', required = !state.config || state.config.required !== false;
  const has = (r) => Array.isArray(r.source.labels) && r.source.labels.includes(label);
  const waiting = fromIssues.filter((r) => r.pub && r.pub.camps.length && !has(r) && !(r.source.labels || []).includes('trail-remove')), approved = fromIssues.filter((r) => r.pub && has(r)), refused = fromIssues.filter((r) => !r.pub && ['name', 'line', 'shape'].includes(r.why));
  const say = sayer(), repo = local.get(REPO), token = local.get(TOKEN);
  el.append(h('h3', { text: 'Waiting for a yes: what hikers asked to make public' }),
    h('p', { text: required ? `Nothing goes on the register or the map until you have read it and said yes. Saying yes means adding the label “${label}” to the issue on GitHub, which only people with write access to the repository can do. Leaving an entry alone keeps it off the register; nobody is told.` : 'Approval is switched off in trail/config.json: every entry that passes the automatic checks is published without being read.' }),
    h('p', { class: 'hint', text: 'A word list catches rude words and adverts. It cannot catch a crude joke, a dig at someone, or a name that only sounds wrong when said aloud. That is what this reading is for. This list is as of the last “Load from GitHub”; it does not see a hiker’s “remove me” comment, which the register honours by itself.' }), say);
  if (!waiting.length) el.append(h('p', { class: 'hint', text: 'Nothing is waiting.' }));
  for (const rec of waiting.sort((a, b) => a.source.number - b.source.number)) {
    const safeUrl = rec.source.url && /^https:\/\/github\.com\//.test(rec.source.url) ? rec.source.url : null;
    const got = state.opened.get(rec.id), match = got && !got.error ? publicCheck(rec, got) : 'The sealed run could not be opened here, so the public part could not be compared with it';
    el.append(h('div', { class: 'stage' }, h('h4', { text: `Issue #${rec.source.number}${rec.source.login ? ' from ' + rec.source.login : ''}` }),
      h('p', { class: 'hint', text: 'Exactly what the register would show:' }), asShown(rec.pub),
      h('details', null, h('summary', { text: 'The public block as written in the issue' }), h('pre', { tabindex: 0, text: JSON.stringify(rec.pub, null, 2) })),
      h('p', { class: 'hint', text: match + '.' }),
      h('div', { class: 'row' },
        safeUrl ? h('a', { class: 'btn btn--small', href: safeUrl, target: '_blank', rel: 'noopener noreferrer', text: `Open issue #${rec.source.number} to add “${label}”` }) : null,
        token && repo ? btn(`Add “${label}” with my token`, async (e) => {
          e.target.disabled = true;
          try {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues/${rec.source.number}/labels`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: [label] }) });
            if (!res.ok) { e.target.disabled = false; return say.tell(res.status === 403 || res.status === 404 ? 'GitHub refused: this token may read issues but not change them. Add the label on GitHub, or use a token with “Issues: Read and write”.' : `GitHub answered ${res.status}. Nothing was changed.`, 'bad'); }
            rec.source.labels = [...(rec.source.labels || []), label]; await db.putRun(rec); paintRuns(); $('runs').querySelector('.say').tell(`Issue #${rec.source.number} is approved. The register picks it up the next time its workflow runs.`, 'good');
          } catch (err) { e.target.disabled = false; say.tell('GitHub could not be reached. Nothing was changed.', 'bad'); }
        }, 'btn--small') : null)));
  }
  if (approved.length) el.append(h('p', { class: 'hint', text: `Already approved: ${approved.map((r) => '#' + r.source.number).join(', ')}. To take one back off the register, remove the label on GitHub.` }));
  if (refused.length) el.append(h('p', { class: 'hint', text: `Refused automatically and never published, whatever the label: ${refused.map((r) => `#${r.source.number} (${r.why === 'name' ? 'trail name not allowed' : r.why === 'line' ? 'line not allowed' : 'not a valid public block'})`).join(', ')}.` }));
}

/* ---------- notes between readers ----------
 * A note is a few words one reader leaves for the others: on a whole run, or on one stage of it.
 * Each note is sealed to the trail's key like a run is, so it can be read only where the key is.
 * They are kept in this browser. To share them there are two ways, both without a server of our
 * own: a notes file passed from hand to hand, or a private GitHub repository that every reader
 * can reach, where each note is one small sealed file (notes/<run>/<note>.txt). */
const NOTE_ID = /^[0-9a-f]{16,32}$/, RUN_ID = /^[0-9a-f]{24}$/;
const me = () => local.get(ME).trim().slice(0, 60);
const notesFor = (runId, where) => [...state.notes.values()].filter((n) => n.run === runId && !n.gone && (where === undefined || n.where === where)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
function validNote(n, rec) {
  return n && n.kind === 'desk-note' && n.id === rec.id && n.run === rec.run && NOTE_ID.test(n.id) && RUN_ID.test(n.run) && typeof n.text === 'string' && n.text.length <= 6000
    && typeof n.by === 'string' && n.by.length <= 60 && typeof n.where === 'string' && n.where.length <= 80 && typeof n.at === 'string' && typeof n.edited === 'string';
}
async function openNotes() {
  state.notes.clear(); if (!state.key) return;
  for (const rec of state.noteRecs.values()) { try { const n = (await openRun(rec.env, state.key.privateKey, { kid: state.key.kid })).run; if (validNote(n, rec)) state.notes.set(rec.id, n); } catch (e) { /* sealed to another key, or not a note */ } }
}
async function saveNote(n) {
  n.edited = new Date().toISOString();
  const old = state.noteRecs.get(n.id), rec = { id: n.id, run: n.run, env: await sealRun(n, state.key.publicJwk, { note: true }), sha: old ? old.sha : null, dirty: true };
  await db.putNote(rec); state.noteRecs.set(rec.id, rec); state.notes.set(n.id, n);
}
/** A note from a file or the notes repository: kept when it is new here or newer than ours. */
async function takeNote(rec, fromRepo) {
  if (!state.key || !rec || !NOTE_ID.test(rec.id) || !RUN_ID.test(rec.run) || typeof rec.env !== 'string') return 'bad';
  let n; try { n = (await openRun(rec.env, state.key.privateKey, { kid: state.key.kid })).run; } catch (e) { return 'bad'; }
  if (!validNote(n, rec)) return 'bad';
  const ours = state.notes.get(rec.id), mine = state.noteRecs.get(rec.id);
  if (ours && ours.edited > n.edited) return 'ours';
  if (ours && ours.edited === n.edited) { if (fromRepo && mine) { mine.sha = rec.sha; mine.dirty = false; await db.putNote(mine); } return 'same'; }
  const keep = { id: rec.id, run: rec.run, env: rec.env, sha: fromRepo ? rec.sha : mine ? mine.sha : null, dirty: !fromRepo };
  await db.putNote(keep); state.noteRecs.set(keep.id, keep); state.notes.set(n.id, n);
  return 'newer';
}

function notesBox(runId, where, title) {
  const box = h('section', { class: 'notes' });
  const paint = () => {
    box.textContent = '';
    const list = notesFor(runId, where), say = sayer();
    box.append(h('h4', { class: 'notes__h', text: title }));
    if (!list.length) box.append(h('p', { class: 'hint', text: 'No notes here yet.' }));
    for (const n of list) {
      const mineToo = n.by === me();
      box.append(h('article', { class: 'note' }, h('p', { class: 'note__by' }, h('b', { text: n.by || 'A reader' }), ` · ${when(n.at)}${n.edited > n.at ? ' · changed ' + when(n.edited) : ''}`), h('p', { class: 'note__text', text: n.text }),
        mineToo ? h('div', { class: 'row' }, btn('Change', () => { text.value = n.text; editing = n; text.focus(); go.textContent = 'Save the change'; }, 'btn--small btn--quiet'),
          btn('Take it back', async () => { if (!confirm('Take this note back? It disappears for the other readers too, the next time notes are shared.')) return; await saveNote({ ...n, text: '', gone: true }); paint(); paintRuns(); }, 'btn--small btn--quiet')) : null));
    }
    if (!state.key) { box.append(h('p', { class: 'hint', text: 'Notes need the key in this browser.' })); return; }
    let editing = null;
    const text = h('textarea', { rows: 3, maxlength: 4000, class: 'notes__text', placeholder: 'What struck you? What would you ask them?' });
    const name = h('input', { maxlength: 60, autocomplete: 'off', placeholder: 'Your name, as the other readers know you' }); name.value = me();
    const go = btn('Leave this note', async () => {
      const said = text.value.trim(), who = name.value.trim().slice(0, 60);
      if (!who) return say.tell('Write your name first, so the others know whose note it is.', 'bad');
      if (!said) return say.tell('The note is empty.', 'bad');
      local.set(ME, who); go.disabled = true;
      try {
        if (editing) await saveNote({ ...editing, text: said });
        else { const at = new Date().toISOString(); await saveNote({ kind: 'desk-note', id: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''), run: runId, where, text: said, by: who, at, edited: at }); }
        paint(); paintRuns(); paintShare();
      } catch (e) { go.disabled = false; say.tell(why(e), 'bad'); }
    }, 'btn--small btn--solid');
    box.append(...[field('A note for the other readers', text), me() ? null : field('Your name', name), h('div', { class: 'row' }, go), say].filter(Boolean));
  };
  paint();
  return box;
}

async function syncNotes(repo, token, tell) {
  if (!state.key) return tell('Notes need the key in this browser.', 'bad');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return tell('Write the notes repository as owner/name.', 'bad');
  if (!token) return tell('Sharing notes through GitHub needs a token: fine-grained, the notes repository only, “Contents: Read and write”. Put it in the token box under “Runs”.', 'bad');
  if (/^ghp_/.test(token)) return tell('That is a classic token, which can reach every repository you have. Use a fine-grained one.', 'bad');
  local.set(NOTES_REPO, repo);
  const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${repo}${path}`, { ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  try {
    tell('Looking at the notes repository…');
    const info = await gh(''); if (!info.ok) return tell(info.status === 404 ? 'GitHub found no such repository, or the token cannot see it.' : info.status === 401 ? 'GitHub did not accept the token.' : `GitHub answered ${info.status}.`, 'bad');
    const meta = await info.json();
    if (meta.private !== true) return tell('That repository is public. The notes are sealed, but anyone could see that readers wrote notes, how many, and when. Use a private repository that only the readers can reach.', 'bad');
    let tree = []; const tr = await gh(`/git/trees/${encodeURIComponent(meta.default_branch || 'main')}?recursive=1`);
    if (tr.ok) tree = (await tr.json()).tree || []; else if (tr.status !== 404 && tr.status !== 409) return tell(`GitHub answered ${tr.status}.`, 'bad');
    const remote = new Map();
    for (const f of tree) { const m = /^notes\/([0-9a-f]{24})\/([0-9a-f]{16,32})\.txt$/.exec(String(f.path)); if (m && f.type === 'blob') remote.set(m[2], { run: m[1], sha: f.sha }); }
    let got = 0, sent = 0, failed = 0;
    for (const [id, f] of remote) {
      const rec = state.noteRecs.get(id); if (rec && rec.sha === f.sha) continue;
      const b = await gh(`/git/blobs/${f.sha}`); if (!b.ok) { failed++; continue; }
      let env; try { env = atob(String((await b.json()).content).replace(/\s+/g, '')); } catch (e) { failed++; continue; }
      const r = await takeNote({ id, run: f.run, env, sha: f.sha }, true);
      if (r === 'newer') got++; else if (r === 'ours') { rec.sha = f.sha; rec.dirty = true; await db.putNote(rec); }
    }
    for (const rec of state.noteRecs.values()) {
      if (!state.notes.has(rec.id) || (!rec.dirty && remote.has(rec.id))) continue;
      const res = await gh(`/contents/notes/${rec.run}/${rec.id}.txt`, { method: 'PUT', body: JSON.stringify({ message: 'A note', content: btoa(rec.env), ...(remote.has(rec.id) ? { sha: remote.get(rec.id).sha } : {}) }) });
      if (!res.ok) { failed++; continue; }
      rec.sha = ((await res.json()).content || {}).sha || null; rec.dirty = false; await db.putNote(rec); sent++;
    }
    paintRuns(); paintRead();
    $('share').querySelector('.say').tell(`Notes shared: ${got} new or changed from the others, ${sent} of yours sent.` + (failed ? ` ${failed} could not be read or sent (the token may not be allowed to write there).` : ''), failed ? 'bad' : 'good');
  } catch (e) { tell('GitHub could not be reached. Your notes are still kept in this browser.', 'bad'); }
}

function paintShare() {
  const el = $('share'); if (!el) return; el.textContent = '';
  const say = sayer(), total = [...state.notes.values()].filter((n) => !n.gone).length, waiting = [...state.noteRecs.values()].filter((r) => r.dirty && state.notes.has(r.id)).length;
  const name = h('input', { maxlength: 60, autocomplete: 'off' }); name.value = me(); name.addEventListener('change', () => local.set(ME, name.value.trim().slice(0, 60)));
  const repo = h('input', { class: 'mono', autocapitalize: 'off', spellcheck: 'false', placeholder: 'owner/name of a private repository' }); repo.value = local.get(NOTES_REPO);
  const file = h('input', { type: 'file', accept: '.json,application/json' });
  file.addEventListener('change', async () => {
    try {
      const obj = JSON.parse(await file.files[0].text()); if (!obj || obj.kind !== 'trail-desk-notes' || !Array.isArray(obj.notes)) return say.tell('That is not a notes file.', 'bad');
      let got = 0; for (const rec of obj.notes.slice(0, 5000)) if ((await takeNote(rec, false)) === 'newer') got++;
      paintRuns(); paintRead(); $('share').querySelector('.say').tell(`${got} new or changed ${got === 1 ? 'note' : 'notes'} added from the file.`, 'good');
    } catch (e) { say.tell('That is not a notes file.', 'bad'); }
  });
  el.append(
    h('p', { text: 'Notes are for the readers only. Each one is sealed to the trail’s key before it is kept, so it can be read only where the key is: here, and on the other readers’ desks.' }),
    h('p', { class: 'hint', text: `${total} ${total === 1 ? 'note' : 'notes'} in this browser${waiting ? `, ${waiting} not shared yet` : ''}.` }),
    field('Your name on your notes', name),
    h('h3', { text: 'Share through a private repository' }),
    h('p', { class: 'hint', text: 'Make a private GitHub repository that every reader can reach, and name it here. Each note is stored there as one small sealed file. The token in “Runs” is used; it needs “Contents: Read and write” on that repository. Never use a public repository for this.' }),
    field('Notes repository', repo),
    h('div', { class: 'row' }, btn('Share notes now', () => syncNotes(repo.value.trim(), local.get(TOKEN), (t, k) => say.tell(t, k)), 'btn--solid')),
    h('h3', { text: 'Or pass a notes file from hand to hand' }),
    h('div', { class: 'row' }, btn('Save all notes as a file', () => { download('trail-desk-notes.json', JSON.stringify({ kind: 'trail-desk-notes', v: 1, notes: [...state.noteRecs.values()].filter((r) => state.notes.has(r.id)).map(({ id, run, env }) => ({ id, run, env })) })); say.tell('Saved. The file is sealed: only a desk with the key can read it.', 'good'); })),
    field('Add notes from another reader’s file', file), say);
}

/* ---------- reading ---------- */
const CAMP_NAMES = { trailhead: 'The Trailhead', workshop: 'The Workshop', shelter: 'The Shelter', overlook: 'The Overlook', summit: 'The Summit' };
const TRACE = { ms: 'Time here', hints: 'Hints from Luma', asks: 'Pressed “Ask Luma”', retries: 'Retries', resets: 'Fresh starts', undos: 'Steps back', tries: 'Tries', moves: 'Moves', best: 'Fewest possible', revisits: 'Came back to mend it', rude: 'Turned back for language', done: 'Finished' };
const span = (ms) => { const s = Math.round((+ms || 0) / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`; };
const partsOf = (run, id) => { const c = run && run.camps && run.camps[id]; return c && c.parts && typeof c.parts === 'object' ? c.parts : {}; };

/* Their three choices at the summit, in words. None of them is a right or a wrong answer. */
function asked(ch) {
  const line = (on, yes, no) => h('li', { class: on ? 'is-on' : '' }, h('span', { class: 'asked__mark', 'aria-hidden': 'true', text: on ? '●' : '○' }), on ? yes : no);
  return h('ul', { class: 'asked' }, line(ch.pool === true, 'Asked to be kept in mind for later', 'Did not ask to be kept in mind for later'),
    line(ch.now === true, 'Asked to be considered now', 'Did not ask to be considered now'), line(ch.public === true, 'Asked to be on the trail register', 'Did not ask to be on the register'));
}

/* What a stage kept, in three parts: how it went (numbers), what was written, and everything else folded away. */
function kept(part) {
  const trace = h('ul', { class: 'trace', 'aria-label': 'How it went' }), answers = [], more = [];
  if (!part || typeof part !== 'object') return { trace: h('p', { class: 'absent', text: 'Not reached.' }), answers, more };
  const keys = Object.keys(part).sort((a, b) => (a in TRACE ? Object.keys(TRACE).indexOf(a) : 99) - (b in TRACE ? Object.keys(TRACE).indexOf(b) : 99));
  for (const k of keys) {
    const v = part[k];
    if (k === 'log') continue;                                    // the step-by-step record: followed in the stage itself
    if (typeof v === 'number' || typeof v === 'boolean') trace.append(h('li', null, (TRACE[k] || k) + ' ', h('b', { text: k === 'ms' ? span(v) : v === true ? 'yes' : v === false ? 'no' : String(v) })));
    else if (typeof v === 'string') answers.push(h('figure', { class: 'answer' }, h('figcaption', { class: 'answer__k', text: k }), h('blockquote', { class: 'answer__v', text: v || '(left empty)' })));
    else if (v != null) more.push(h('details', null, h('summary', { text: `${k} (${Array.isArray(v) ? v.length + ' steps' : 'details'})` }), h('pre', { tabindex: 0, text: JSON.stringify(v, null, 1).slice(0, 20000) })));
  }
  return { trace, answers, more };
}
function side(part, who) {
  const k = kept(part);
  return h('div', { class: 'side' }, who ? h('p', { class: 'side__who', text: who }) : null, k.trace, ...k.answers, ...k.more);
}

function read(id) { state.reading = id; state.walk = null; paintRuns(); paintRead(); $('read-h').scrollIntoView({ block: 'start' }); announce('The run is open below.'); }

/* The frame that shows a stage the way the hiker met it (stage.html). One frame, reused. */
let frame = null, frameReady = false, shown = null;
function sendStage() {
  if (!frame || !frameReady || !shown) return;
  frame.hidden = false;
  frame.contentWindow.postMessage({ wmDesk: 1, type: 'show', ...shown }, location.origin);
}
addEventListener('message', (e) => {
  if (!frame || e.origin !== location.origin || e.source !== frame.contentWindow || !e.data || e.data.wmDesk !== 1) return;
  const m = e.data;
  if (m.type === 'ready') { frameReady = true; sendStage(); }
  else if (m.type === 'size' && Number.isFinite(m.height)) frame.style.height = Math.max(120, Math.min(20000, Math.ceil(m.height) + 4)) + 'px';
  else if (m.type === 'none') frame.hidden = true;
  else if (m.type === 'camp' && typeof m.id === 'string' && Array.isArray(m.stages)) {
    state.about[m.id] = { name: String(m.name || '').slice(0, 80), stages: m.stages.slice(0, 40).map((s) => ({ id: String(s.id), label: String(s.label || s.id).slice(0, 60), title: String(s.title || s.label || s.id).slice(0, 120) })) };
    paintWalk(false);
  }
});

function stagesOf(run, ref, id) {
  const have = [...Object.keys(partsOf(run, id)), ...Object.keys(partsOf(ref, id))].filter((k, i, a) => a.indexOf(k) === i), about = state.about[id];
  if (!about) return have.map((k) => ({ id: k, label: k, title: k }));
  return [...about.stages.filter((s) => have.includes(s.id)), ...have.filter((k) => !about.stages.some((s) => s.id === k)).map((k) => ({ id: k, label: k, title: k }))];
}

/* The walk: one stage at a time, as the hiker met it, with what was kept and the readers' notes beside it. */
function paintWalk(reload) {
  const el = $('walk'); if (!el) return;
  const rec = state.runs.find((r) => r.id === state.reading), got = rec && state.opened.get(rec.id); if (!rec || !got || got.error) return;
  const refRec = state.ref && state.ref !== rec.id ? state.runs.find((r) => r.id === state.ref) : null, refGot = refRec && state.opened.get(refRec.id), ref = refGot && !refGot.error ? refGot.run : null;
  const run = got.run, campIds = CAMP_IDS.filter((id) => (run.camps && run.camps[id]) || (ref && ref.camps && ref.camps[id]));
  if (!campIds.length) { el.textContent = ''; el.append(h('p', { class: 'hint', text: 'This run has no camps in it yet.' })); return; }
  if (!state.walk || !campIds.includes(state.walk.camp)) state.walk = { camp: campIds[0], stage: null };
  const stages = stagesOf(run, ref, state.walk.camp);
  if (!stages.some((s) => s.id === state.walk.stage)) state.walk.stage = stages[0] ? stages[0].id : null;
  const here = stages.find((s) => s.id === state.walk.stage), camp = run.camps && run.camps[state.walk.camp], part = partsOf(run, state.walk.camp)[state.walk.stage];
  const go = (campId, stageId) => { state.walk = { camp: campId, stage: stageId }; paintWalk(true); $('walk').scrollIntoView({ block: 'start' }); };
  const flat = campIds.flatMap((id) => stagesOf(run, ref, id).map((s) => [id, s.id])), at = flat.findIndex(([c, s]) => c === state.walk.camp && s === state.walk.stage);

  const head = $('walk-head'), aside = $('walk-aside'), foot = $('walk-foot');
  head.textContent = ''; aside.textContent = ''; foot.textContent = '';
  head.append(
    h('div', { class: 'camps', role: 'tablist', 'aria-label': 'Camps' }, campIds.map((id) => h('button', { type: 'button', role: 'tab', class: 'camps__tab' + (id === state.walk.camp ? ' is-now' : ''), 'aria-selected': id === state.walk.camp ? 'true' : 'false', onclick: () => go(id, null) },
      h('b', { text: CAMP_NAMES[id] || id }), h('small', { text: run.camps && run.camps[id] && run.camps[id].done ? when(run.camps[id].done) : run.camps && run.camps[id] ? 'not finished' : 'not reached' })))),
    h('p', { class: 'hint', text: (camp && camp.done ? `Reached ${when(camp.done)}.` : camp ? 'Started, not finished.' : 'Not reached.') + (state.walk.camp === PRIVATE_CAMP ? ' This camp is private: nothing in it is ever public.' : '') }),
    h('ol', { class: 'steps', 'aria-label': 'Stages of this camp' }, stages.map((s) => { const n = notesFor(rec.id, `${state.walk.camp}/${s.id}`).length; return h('li', { class: s.id === state.walk.stage ? 'is-now' : '' }, h('button', { type: 'button', 'aria-current': s.id === state.walk.stage ? 'step' : null, onclick: () => go(state.walk.camp, s.id) }, s.label, n ? h('span', { class: 'steps__notes', text: String(n), title: `${n} ${n === 1 ? 'note' : 'notes'}` }) : null)); })));
  if (!here) return;

  const k = kept(part), isRegister = state.walk.camp === 'summit' && here.id === 'register';
  aside.append(h('h3', { class: 'walk__title', text: here.title }), h('h4', { text: 'How it went' }), k.trace);
  if (isRegister) aside.append(h('h4', { text: 'What they asked for at the tin' }), asked(got.meta.choices || {}), h('p', { class: 'hint', text: 'These are theirs to choose. None of them is a right or a wrong answer, and leaving all three empty is a complete ending too.' }));
  if (k.answers.length) aside.append(h('h4', { text: 'In their words' }), ...k.answers);
  if (k.more.length) aside.append(h('details', { class: 'fold' }, h('summary', { text: 'Everything else kept at this stage' }), ...k.more));
  if (ref) aside.append(h('details', { class: 'fold' }, h('summary', { text: `Beside the reference run (${String(ref.handle || 'no name')})` }), h('p', { class: 'hint', text: 'Nothing is scored or added up. The reference is there to read beside, not to measure against.' }), side(partsOf(ref, state.walk.camp)[here.id], '')));
  aside.append(notesBox(rec.id, `${state.walk.camp}/${here.id}`, 'Readers’ notes on this stage'));

  foot.append(h('div', { class: 'row walk__nav' },
    at > 0 ? btn('‹ The stage before', () => go(flat[at - 1][0], flat[at - 1][1])) : h('span'),
    at < flat.length - 1 ? btn('Walk on ›', () => go(flat[at + 1][0], flat[at + 1][1]), 'btn--solid') : h('span', { class: 'hint', text: 'That is the end of the walk.' })));

  if (reload) {
    shown = { handle: String(run.handle || ''), seed: Number.isInteger(run.seed) ? run.seed : null, camp: state.walk.camp, stage: here.id, data: part && typeof part === 'object' ? part : null, parts: partsOf(run, state.walk.camp) };
    $('walk-none').hidden = !isRegister && !!part;
    $('walk-none').textContent = isRegister ? 'The register is the hiker’s own page for sealing and sending, so it is not shown again here. What they asked for is beside this.' : part ? '' : 'This hiker did not reach this stage.';
    if (isRegister || !part) { if (frame) frame.hidden = true; } else sendStage();
  }
}

function paintRead() {
  const el = $('read'); el.textContent = ''; frame = null; frameReady = false; shown = null;
  const rec = state.runs.find((r) => r.id === state.reading), got = rec && state.opened.get(rec.id);
  if (!rec || !got || got.error) { el.append(h('p', { class: 'hint', text: 'Choose a run above and sit down with it here.' })); return; }
  const refRec = state.ref && state.ref !== rec.id ? state.runs.find((r) => r.id === state.ref) : null, refGot = refRec && state.opened.get(refRec.id), ref = refGot && !refGot.error ? refGot.run : null;
  const run = got.run, ch = got.meta.choices || {}, name = String(run.handle || 'This hiker');
  const all = CAMP_IDS.flatMap((id) => Object.values(partsOf(run, id))).filter((p) => p && typeof p === 'object');
  const sum = (key) => all.reduce((n, p) => n + (typeof p[key] === 'number' && p[key] > 0 ? p[key] : 0), 0), reached = CAMP_IDS.filter((id) => run.camps && run.camps[id] && run.camps[id].done);
  const hints = sum('hints'), asks = sum('asks'), counted = all.some((p) => typeof p.asks === 'number');
  const fact = (k, v) => h('div', null, h('dt', { text: k }), h('dd', { text: v }));
  el.append(...[
    h('div', { class: 'reader' }, h('img', { class: 'reader__luma', src: '../luma.webp', alt: '', width: 96, height: 96 }),
      h('div', null, h('h3', { class: 'reader__name', text: `${name}’s walk` }),
        h('p', { class: 'reader__story', text: `${name} set out on ${when(run.began)} and ${reached.length === CAMP_IDS.length ? 'walked the whole trail, all five camps' : reached.length ? `reached ${reached.length} of the ${CAMP_IDS.length} camps, as far as ${CAMP_NAMES[reached[reached.length - 1]]}` : 'has not finished a camp yet'}. `
          + `The stages were open for ${span(sum('ms'))} in all, which counts any time the page was simply left open. `
          + (hints ? `Luma gave ${hints} ${hints === 1 ? 'hint' : 'hints'}` : 'Luma was not asked for a hint') + (counted ? ` (the button was pressed ${asks} ${asks === 1 ? 'time' : 'times'}).` : '.') }),
        asked(ch))),
    h('dl', { class: 'facts' }, fact('Sent', sourceText(rec)), fact('Sealed', when(got.sealedAt)), fact('How to reach them', typeof got.meta.contact === 'string' && got.meta.contact ? got.meta.contact : rec.source.login ? `GitHub: ${rec.source.login}` : 'Not given'), fact('What is public', publicCheck(rec, got))),
    counted ? null : h('p', { class: 'hint', text: 'This run was walked before the trail counted every press of “Ask Luma”. The number above is how many different hints were given: a stage with one hint counts once however often it was asked for.' }),
    h('div', { class: 'row' }, btn(state.plain ? 'Walk it stage by stage' : 'Lay the whole walk out on one page', () => { state.plain = !state.plain; paintRead(); }, 'btn--small'),
      h('span', { class: 'hint', text: ref ? `Read beside the reference run (${String(ref.handle || 'no name')}).` : state.ref === rec.id ? 'This is the reference run.' : 'To read a run beside your own, add your own and choose “Use as reference”.' }))].filter(Boolean));

  if (!state.plain) {
    frame = h('iframe', { class: 'walk__frame', src: 'stage.html', title: 'The stage as the hiker met it' });
    el.append(h('div', { class: 'walk', id: 'walk' }, h('div', { id: 'walk-head' }),
      h('div', { class: 'walk__grid' }, h('div', { class: 'walk__stage' }, h('p', { class: 'hint walk__none', id: 'walk-none', hidden: true }), frame), h('aside', { class: 'walk__aside', id: 'walk-aside', 'aria-label': 'What was kept, and notes' })),
      h('div', { id: 'walk-foot' })));
    paintWalk(true);
  } else {
    const campIds = [...CAMP_IDS, ...Object.keys(run.camps || {}).filter((id) => !CAMP_IDS.includes(id))];
    for (const id of campIds) {
      const camp = run.camps && run.camps[id], refCamp = ref && ref.camps && ref.camps[id];
      if (!camp && !refCamp) continue;
      const parts = partsOf(run, id), refParts = partsOf(ref, id);
      const box = h('div', { class: 'camp' }, h('h3', { text: CAMP_NAMES[id] || id }),
        h('p', { class: 'hint', text: (camp && camp.done ? `Reached ${when(camp.done)}.` : camp ? 'Started, not finished.' : 'Not reached.') + (id === PRIVATE_CAMP ? ' This camp is private: nothing in it is ever public.' : '') }));
      for (const s of stagesOf(run, ref, id)) {
        const notes = notesFor(rec.id, `${id}/${s.id}`);
        box.append(h('div', { class: 'stage' }, h('h4', { text: s.title }),
          h('div', { class: 'pair' + (ref ? ' pair--two' : '') }, side(parts[s.id], ref ? name : ''), ref ? Object.assign(side(refParts[s.id], `Reference: ${String(ref.handle || '')}`), { className: 'side side--ref' }) : null),
          notes.length ? h('div', { class: 'notes' }, h('h4', { class: 'notes__h', text: 'Readers’ notes' }), notes.map((n) => h('article', { class: 'note' }, h('p', { class: 'note__by' }, h('b', { text: n.by }), ` · ${when(n.at)}`), h('p', { class: 'note__text', text: n.text })))) : null));
      }
      el.append(box);
    }
  }
  el.append(notesBox(rec.id, '', `Readers’ notes on ${name}’s walk as a whole`));
}

/* ---------- start ---------- */
function paintAll() { paintKey(); paintShares(); paintRuns(); paintRead(); paintShare(); document.body.classList.toggle('has-key', !!state.key); }

async function start() {
  const hour = new Date().getHours();
  $('hello').textContent = hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  try {
    [state.key, state.stewards, state.runs, state.ref] = [await db.get('key') || null, await db.get('stewards') || null, await db.runs() || [], await db.get('ref') || null];
    state.hasBackup = !!(await db.get('backup'));
    for (const rec of await db.notes() || []) state.noteRecs.set(rec.id, rec);
  } catch (e) {
    $('key').append(h('p', { class: 'callout callout--bad', text: 'This browser will not let the page keep anything (a private window, perhaps). The desk needs to keep the key here, so open it in an ordinary window.' })); return;
  }
  paintAll();                                                                          // usable at once, with or without a connection
  await reopenAll(); await openNotes(); paintRuns(); paintRead(); paintShare();
  try {
    const res = await fetch(new URL('../config.json', import.meta.url), { cache: 'no-cache' }), cfg = res.ok ? await res.json() : null;
    if (cfg) { state.config = { publicKey: cfg.publicKey || null, kid: cfg.publicKey ? (await importPublicKey(cfg.publicKey)).kid : '', repo: typeof cfg.repo === 'string' ? cfg.repo : '', required: !(cfg.moderation && cfg.moderation.required === false), label: cfg.moderation && typeof cfg.moderation.approvalLabel === 'string' && cfg.moderation.approvalLabel ? cfg.moderation.approvalLabel : 'trail:approved' }; paintKey(); paintRuns(); }
  } catch (e) { /* offline, or no config yet: the desk works without it */ }
}
start();
