/* The reading desk: where the keeper of the trail opens sealed runs.
 *
 * Everything happens in this browser. The private key is kept in IndexedDB as a locked
 * (non-extractable) key: this page can use it to open runs but cannot read it back out. Runs are
 * kept sealed and opened in memory each time. The only network requests are for this page's own
 * files and, when asked, the list of issues from api.github.com. Nothing is ever uploaded.
 */
import {
  generateKeyPair, exportPrivateKey, importPrivateKey, importPublicKey, sealRun, openRun, readEnvelope,
  readSealedBlock, readPublicBlock, inspectPublicBlock, publicPart, splitToShares, combineShares, decodeShare, CAMP_IDS, PRIVATE_CAMP, BEGIN,
} from '../seal.js';

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
    const r = indexedDB.open('wm-trail-desk', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('runs', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await get(); return new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error); }); };
  return {
    get: (k) => tx('kv', 'readonly', (s) => s.get(k)), put: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)), del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
    runs: () => tx('runs', 'readonly', (s) => s.getAll()), putRun: (r) => tx('runs', 'readwrite', (s) => s.put(r)), delRun: (id) => tx('runs', 'readwrite', (s) => s.delete(id)),
  };
})();
const TOKEN = 'wm-desk:token', REPO = 'wm-desk:repo';
const local = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private window */ } } };

const state = { key: null, stewards: null, hasBackup: false, config: null, runs: [], opened: new Map(), ref: null, reading: null, freshShares: null };

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
            await db.put('key', key); await db.put('backup', backup); state.key = key; state.hasBackup = true; await reopenAll(); paintAll(); announce('The key is back in this browser.');
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
          await reopenAll(); paintAll(); announce('The key is in this browser. Runs can be opened now.');
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
  trailhead: { done: new Date(Date.now() - 8e7).toISOString(), parts: { route: { hints: 1, ms: 312000, done: true, moves: 33, best: 29, resets: 1, undos: 4, path: [126, 127, 113, 99, 100, 86] }, sky: { hints: 0, ms: 95000, done: true, tries: 2 }, call: { hints: 0, ms: 140000, done: true, option: 'wait', said: 'I would wait for the others, and say so plainly.' }, fire: { hints: 0, ms: 260000, done: true, said: 'A sample answer at the campfire.\nIt has two lines.', ai: 'no' } } },
  workshop: { done: new Date(Date.now() - 4e7).toISOString(), parts: { pipes: { hints: 2, ms: 480000, done: true, retries: 3, said: 'Found the leak on the third try.' } } },
} });

function sourceText(rec) { const s = rec.source; return s.type === 'issue' ? `Issue #${s.number}${s.login ? ' from ' + s.login : ''}` : s.type === 'plain' ? `Unsealed file${s.name ? ' ' + s.name : ''}, sealed here` : s.type === 'sample' ? 'Sample made on this page' : s.type === 'paste' ? 'Pasted' : `File${s.name ? ' ' + s.name : ''}`; }

/** Compares what an issue shows publicly with what the sealed run would produce. */
function publicCheck(rec, got) {
  if (!rec.pub) return rec.source.type === 'issue' ? 'Nothing public' : '–';
  const strip = (p) => { if (!p) return ''; const { profile, ...rest } = p; return JSON.stringify(rest); };
  return strip(rec.pub) === strip(publicPart(got.run, {})) ? 'Public part matches the run' : 'Public part DIFFERS from the sealed run';
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

  if (!state.runs.length) { el.append(h('p', { class: 'hint', text: 'No runs here yet.' })); return; }
  const rows = state.runs.slice().sort((a, b) => String(b.source.at || b.added).localeCompare(String(a.source.at || a.added))).map((rec) => {
    const got = state.opened.get(rec.id) || { error: 'Not opened yet.' }, ok = !got.error, ch = ok && got.meta.choices ? got.meta.choices : {};
    const isRef = state.ref === rec.id;
    return h('tr', { class: state.reading === rec.id ? 'is-open' : '' },
      h('th', { scope: 'row' }, ok ? String(got.run.handle || '(no name)') : 'Could not be opened', isRef ? h('span', { class: 'tag tag--on', text: 'reference' }) : null),
      h('td', null, rec.source.url && /^https:\/\/github\.com\//.test(rec.source.url) ? h('a', { href: rec.source.url, target: '_blank', rel: 'noopener noreferrer', text: sourceText(rec) }) : sourceText(rec)),
      h('td', { text: ok ? when(got.sealedAt) : '' }),
      h('td', null, ok ? [['pool', 'for later'], ['now', 'consider now'], ['public', 'public']].map(([k, t]) => h('span', { class: 'tag' + (ch[k] === true ? ' tag--on' : ''), text: (ch[k] === true ? 'yes: ' : 'no: ') + t })) : h('span', { text: got.error })),
      h('td', { text: ok ? publicCheck(rec, got) : '' }),
      h('td', null, h('div', { class: 'row' }, ok ? btn('Read', () => read(rec.id), 'btn--small') : null,
        ok ? btn(isRef ? 'Stop using as reference' : 'Use as reference', async () => { state.ref = isRef ? null : rec.id; await (state.ref ? db.put('ref', state.ref) : db.del('ref')); paintRuns(); paintRead(); }, 'btn--small') : null,
        btn('Remove', async () => { if (!confirm('Remove this run from this browser? The issue or file it came from is not touched.')) return; await db.delRun(rec.id); state.runs = state.runs.filter((r) => r.id !== rec.id); state.opened.delete(rec.id); if (state.ref === rec.id) { state.ref = null; await db.del('ref'); } if (state.reading === rec.id) state.reading = null; paintRuns(); paintRead(); }, 'btn--small'))));
  });
  el.append(h('div', { class: 'scroll', tabindex: 0, role: 'region', 'aria-label': 'Runs in this browser' }, h('table', null,
    h('thead', null, h('tr', null, ['Trail name', 'From', 'Sealed', 'Their three choices', 'Public part', 'Actions'].map((t) => h('th', { scope: 'col', text: t })))), h('tbody', null, rows))),
  h('p', { class: 'hint', text: 'Anyone can send a run under any trail name, and can copy someone else’s issue. “From” is the GitHub account that posted it; the trail name is whatever the hiker typed.' }));
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

/* ---------- 4. reading ---------- */
const CAMP_NAMES = { trailhead: 'The Trailhead', workshop: 'The Workshop', shelter: 'The Shelter', overlook: 'The Overlook', summit: 'The Summit' };
const TRACE = { ms: 'Time', hints: 'Asked Luma', retries: 'Retries', resets: 'Fresh starts', undos: 'Steps back', tries: 'Tries', moves: 'Moves', best: 'Fewest possible', done: 'Finished' };
const span = (ms) => { const s = Math.round((+ms || 0) / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

/* One stage of one run: the trace (numbers and yes/no) first, then what was written, then anything longer folded away. */
function side(part, who) {
  const box = h('div', { class: 'side' }, who ? h('p', { class: 'side__who', text: who }) : null);
  if (!part || typeof part !== 'object') { box.append(h('p', { class: 'absent', text: 'Not reached.' })); return box; }
  const trace = h('ul', { class: 'trace', 'aria-label': 'How it went' }), answers = [], more = [];
  const keys = Object.keys(part).sort((a, b) => (a in TRACE ? Object.keys(TRACE).indexOf(a) : 99) - (b in TRACE ? Object.keys(TRACE).indexOf(b) : 99));
  for (const k of keys) {
    const v = part[k];
    if (typeof v === 'number' || typeof v === 'boolean') trace.append(h('li', null, (TRACE[k] || k) + ' ', h('b', { text: k === 'ms' ? span(v) : v === true ? 'yes' : v === false ? 'no' : String(v) })));
    else if (typeof v === 'string') answers.push(h('div', { class: 'answer' }, h('p', { class: 'answer__k', text: k }), h('p', { class: 'answer__v', text: v || '(empty)' })));
    else if (v != null) more.push(h('details', null, h('summary', { text: `${k} (${Array.isArray(v) ? v.length + ' steps' : 'details'})` }), h('pre', { tabindex: 0, text: JSON.stringify(v, null, 1).slice(0, 20000) })));
  }
  box.append(trace, ...answers, ...more);
  return box;
}

function read(id) { state.reading = id; paintRuns(); paintRead(); $('read-h').scrollIntoView({ block: 'start' }); announce('The run is open below.'); }

function paintRead() {
  const el = $('read'); el.textContent = '';
  const rec = state.runs.find((r) => r.id === state.reading), got = rec && state.opened.get(rec.id);
  if (!rec || !got || got.error) { el.append(h('p', { class: 'hint', text: 'Open a run from the list above to read it here.' })); return; }
  const refRec = state.ref && state.ref !== rec.id ? state.runs.find((r) => r.id === state.ref) : null, refGot = refRec && state.opened.get(refRec.id), ref = refGot && !refGot.error ? refGot.run : null;
  const run = got.run, ch = got.meta.choices || {};
  const fact = (k, v) => h('div', null, h('dt', { text: k }), h('dd', { text: v }));
  el.append(
    h('h3', { text: String(run.handle || '(no name)') }),
    h('dl', { class: 'facts' }, fact('From', sourceText(rec)), fact('Began', when(run.began)), fact('Sealed', when(got.sealedAt)),
      fact('Keep in mind for later', ch.pool === true ? 'Yes' : 'No'), fact('Consider now', ch.now === true ? 'Yes' : 'No'), fact('On the register', ch.public === true ? 'Yes' : 'No'),
      fact('How to reach them', typeof got.meta.contact === 'string' && got.meta.contact ? got.meta.contact : rec.source.login ? `GitHub: ${rec.source.login}` : 'Not given'), fact('Public part', publicCheck(rec, got))),
    ref ? h('p', { class: 'callout', text: `Shown beside the reference run (${String(ref.handle || 'no name')}). Nothing is scored or added up: the two are side by side so you can read them.` })
      : h('p', { class: 'hint', text: state.ref === rec.id ? 'This is the reference run.' : 'To read a run beside your own, add your own run (an unsealed run file is fine) and press “Use as reference” in the list.' }));
  const campIds = [...CAMP_IDS, ...Object.keys(run.camps || {}).filter((id) => !CAMP_IDS.includes(id))];
  for (const id of campIds) {
    const camp = run.camps && run.camps[id], refCamp = ref && ref.camps && ref.camps[id];
    if (!camp && !refCamp) continue;
    const parts = camp && camp.parts && typeof camp.parts === 'object' ? camp.parts : {}, refParts = refCamp && refCamp.parts && typeof refCamp.parts === 'object' ? refCamp.parts : {};
    const box = h('div', { class: 'camp' }, h('h3', { text: CAMP_NAMES[id] || id }),
      h('p', { class: 'hint', text: (camp && camp.done ? `Reached ${when(camp.done)}.` : camp ? 'Started, not finished.' : 'Not reached.') + (id === PRIVATE_CAMP ? ' This camp is private: nothing in it is ever public.' : '') }));
    for (const stage of [...Object.keys(parts), ...Object.keys(refParts).filter((k) => !(k in parts))]) {
      box.append(h('div', { class: 'stage' }, h('h4', { text: stage }),
        h('div', { class: 'pair' + (ref ? ' pair--two' : '') }, side(parts[stage], ref ? String(run.handle || 'This run') : ''), ref ? Object.assign(side(refParts[stage], `Reference: ${String(ref.handle || '')}`), { className: 'side side--ref' }) : null)));
    }
    el.append(box);
  }
}

/* ---------- start ---------- */
function paintAll() { paintKey(); paintShares(); paintRuns(); paintRead(); }

async function start() {
  try {
    [state.key, state.stewards, state.runs, state.ref] = [await db.get('key') || null, await db.get('stewards') || null, await db.runs() || [], await db.get('ref') || null];
    state.hasBackup = !!(await db.get('backup'));
  } catch (e) {
    $('key').append(h('p', { class: 'callout callout--bad', text: 'This browser will not let the page keep anything (a private window, perhaps). The desk needs to keep the key here, so open it in an ordinary window.' })); return;
  }
  paintAll();                                                                          // usable at once, with or without a connection
  await reopenAll(); paintRuns();
  try {
    const res = await fetch(new URL('../config.json', import.meta.url), { cache: 'no-cache' }), cfg = res.ok ? await res.json() : null;
    if (cfg) { state.config = { publicKey: cfg.publicKey || null, kid: cfg.publicKey ? (await importPublicKey(cfg.publicKey)).kid : '', repo: typeof cfg.repo === 'string' ? cfg.repo : '', required: !(cfg.moderation && cfg.moderation.required === false), label: cfg.moderation && typeof cfg.moderation.approvalLabel === 'string' && cfg.moderation.approvalLabel ? cfg.moderation.approvalLabel : 'trail:approved' }; paintKey(); paintRuns(); }
  } catch (e) { /* offline, or no config yet: the desk works without it */ }
}
start();
