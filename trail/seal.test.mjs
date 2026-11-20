/* Tests for trail/seal.js and scripts/trail-register.mjs. Run with:  node trail/seal.test.mjs
 * Needs nothing but Node 24 (WebCrypto and the test runner are built in). No network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from './seal.js';
import { buildRegister, readEntry } from '../scripts/trail-register.mjs';
import { checkName, checkPublic } from './manners.js';
import { checkRegister } from './register.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CANARY = 'CANARY';
let canaries = 0;
const canary = () => `${CANARY}-${++canaries}-secret words <b>and</b> https://evil.example/x`;

/** A finished run with a marked string in every place a person could have typed something. */
function sampleRun({ big = 0 } = {}) {
  const part = (extra) => ({ hints: 1, ms: 240000, done: true, ...extra });
  return {
    v: 2, handle: 'Robin Reed', seed: 12345, began: '2026-03-01T09:00:00.000Z', at: { camp: 'summit', stage: 'done' },
    note: canary(),
    camps: {
      trailhead: { done: '2026-03-01T10:00:00.000Z', parts: {
        route: part({ hints: 0, moves: 31, best: 28, resets: 2, undos: 5, path: Array.from({ length: 32 }, (_, i) => i * 3 % 140) }),
        sky: part({ tries: 3, hints: 0 }), scale: part({ retries: 1, hints: 0, weighings: [[1, 2], [3, 4]], failed: [[[1, 2]]] }),
        call: part({ hints: 0, option: 'wait', said: canary() }), fire: part({ hints: 0, said: canary() + 'x'.repeat(big), ai: 'some', aiHow: canary() }),
      } },
      workshop: { done: '2026-03-02T10:00:00.000Z', parts: { pipes: part({ hints: 2, said: canary() }) } },
      shelter: { done: '2026-03-03T10:00:00.000Z', parts: { bench: part({ said: canary(), list: [canary(), canary()] }) } },
      overlook: { done: '2026-03-04T10:00:00.000Z', parts: {
        creed: part({ hints: 7, ms: 9999999, resets: 40, retries: 40, said: canary(), option: canary(), belief: { church: canary(), years: 12 } }),
        fire: part({ said: canary() }),
      }, [CANARY + '-key']: canary() },
      summit: { done: '2026-03-05T10:00:00.000Z', parts: { last: part({ hints: 0, said: canary() }) } },
    },
  };
}
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); } return out; };

const keys = { main: null, other: null };
test('keys: generate, export, fingerprint, import as JWK and as PEM', async () => {
  keys.main = await S.generateKeyPair();                         // RSA-OAEP 4096, as the desk makes it
  keys.other = await S.generateKeyPair({ modulusLength: 2048 }); // a second key, smaller only to keep the tests quick
  assert.match(keys.main.kid, /^[0-9a-f]{32}$/);
  assert.notEqual(keys.main.kid, keys.other.kid);
  assert.equal(keys.main.publicJwk.d, undefined, 'the public JWK must not carry private parts');
  assert.deepEqual(Object.keys(keys.main.publicJwk).sort(), ['alg', 'e', 'kty', 'n']);
  assert.equal((await S.importPublicKey(JSON.stringify(keys.main.publicJwk))).kid, keys.main.kid);
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', keys.main.publicKey)).toString('base64').match(/.{1,64}/g).join('\n');
  assert.equal((await S.importPublicKey(`-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----\n`)).kid, keys.main.kid);
  await assert.rejects(S.importPublicKey({ kty: 'EC' }), { code: 'key' });
  await assert.rejects(S.importPublicKey(await crypto.subtle.exportKey('jwk', keys.main.privateKey)), { code: 'key' }, 'a private JWK is refused as a public key');
});

test('seal and open: round trip', async () => {
  const run = sampleRun(), meta = { choices: { pool: true, now: false, public: false }, contact: 'robin@example.org' };
  const env = await S.sealRun(run, keys.main.publicJwk, meta);
  assert.ok(env.startsWith(S.BEGIN) && env.endsWith(S.END));
  assert.match(env, /^[\x20-\x7e\n]+$/, 'the envelope is plain ASCII');
  assert.ok(env.includes(`Key: ${keys.main.kid}`) && env.includes('Version: 1'));
  for (const s of strings(run)) if (s.includes(CANARY)) assert.ok(!env.includes(s), 'nothing readable in the envelope');
  assert.ok(!env.includes('Robin') && !env.includes('overlook'));
  const got = await S.openRun(env, keys.main.privateKey, { kid: keys.main.kid });
  assert.deepEqual(got.run, run); assert.deepEqual(got.meta, meta); assert.equal(got.kid, keys.main.kid);
  // survives what mail and GitHub do to text: CRLF, quoting, text around it
  const mangled = 'Hello,\r\n' + env.split('\n').map((l) => '> ' + l + '  ').join('\r\n') + '\r\nbye';
  assert.deepEqual((await S.openRun(mangled, keys.main.privateKey)).run, run);
  // two seals of the same run are different (fresh key and nonce each time)
  assert.notEqual(await S.sealRun(run, keys.main.publicJwk, meta), env);
});

test('tampering is detected', async () => {
  const env = await S.sealRun(sampleRun(), keys.main.publicJwk);
  const lines = env.split('\n'), first = 6, last = lines.length - 2;
  const flip = (line, at) => { const l = lines.slice(), ch = l[line][at]; l[line] = l[line].slice(0, at) + (ch === 'A' ? 'B' : 'A') + l[line].slice(at + 1); return l.join('\n'); };
  await assert.rejects(S.openRun(flip(last, 2), keys.main.privateKey), { code: 'tamper' }, 'a changed byte of the sealed text');
  await assert.rejects(S.openRun(flip(first, 10), keys.main.privateKey), (e) => e.code === 'key' || e.code === 'tamper', 'a changed byte of the wrapped key');
  await assert.rejects(S.openRun(env.replace('Zip: deflate-raw', 'Zip: none'), keys.main.privateKey), { code: 'tamper' }, 'a changed header');
  await assert.rejects(S.openRun(env.replace(`Key: ${keys.main.kid}`, `Key: ${keys.other.kid}`), keys.main.privateKey), { code: 'tamper' }, 'a swapped key id');
  await assert.rejects(S.openRun(env.replace('Version: 1', 'Version: 2'), keys.main.privateKey), { code: 'format' });
  await assert.rejects(S.openRun(lines.slice(0, 9).concat(S.END).join('\n'), keys.main.privateKey), (e) => ['format', 'tamper', 'key'].includes(e.code), 'a truncated envelope');
  await assert.rejects(S.openRun('not an envelope', keys.main.privateKey), { code: 'format' });
  await assert.rejects(S.openRun(S.BEGIN + '\n' + 'A'.repeat(S.LIMITS.envelope) + '\n' + S.END, keys.main.privateKey), { code: 'size' });
});

test('the wrong key does not open a run', async () => {
  const env = await S.sealRun(sampleRun(), keys.main.publicJwk);
  await assert.rejects(S.openRun(env, keys.other.privateKey), { code: 'key' });
  await assert.rejects(S.openRun(env, keys.other.privateKey, { kid: keys.other.kid }), { code: 'key' });
});

test('publicPart: built by allow-list; nothing typed and nothing from the Overlook can appear', () => {
  const run = sampleRun(), pub = S.publicPart(run, { public: true, line: 'Walks slowly, reads signs.', links: ['https://example.org/robin'] });
  assert.ok(!JSON.stringify(pub).includes('example.org'), 'a public part never carries a link');
  const text = JSON.stringify(pub);
  // 1. no marked string, as a value or as a key, from anywhere in the run
  assert.ok(!text.includes(CANARY), 'a typed string leaked into the public part: ' + text);
  for (const s of strings(run.camps.overlook.parts)) if (s.length > 3 && !['hints', 'done', 'said', 'option', 'fire'].includes(s)) assert.ok(!text.includes(s), `overlook content "${s}" leaked`);
  // 2. the exact shape: these keys and no others
  assert.deepEqual(Object.keys(pub), ['v', 'handle', 'camps', 'minutes', 'hints', 'flags', 'profile']);
  assert.deepEqual(pub.camps, ['trailhead', 'workshop', 'shelter', 'overlook', 'summit'].map((id, i) => ({ id, done: `2026-03-0${i + 1}` })));
  assert.deepEqual(Object.keys(pub.hints), ['trailhead', 'workshop', 'shelter', 'summit'], 'no hint count for the Overlook');
  assert.deepEqual(pub.hints, { trailhead: 0, workshop: 2, shelter: 1, summit: 0 });
  assert.deepEqual(pub.flags, { quiet: false, longWay: true, shortestWay: false, oneSitting: false, restarts: 3 });
  assert.equal(pub.minutes, 32, 'trail time leaves the Overlook out (8 parts of 4 minutes)');
  assert.deepEqual(pub.profile, { line: 'Walks slowly, reads signs.' });
  // 3. whatever is inside the Overlook, the public part does not change by a single byte
  const a = sampleRun(); a.camps.overlook.parts = {};
  const b = sampleRun(); b.camps.overlook.parts = { x: { hints: 500, ms: 1e9, resets: 9, retries: 9, moves: 1, best: 1, said: 'entirely different', done: true }, route: { moves: 1, best: 1, done: true } };
  const c = sampleRun(); c.camps.overlook = { done: c.camps.overlook.done, parts: null, extra: [1, 2, 3] };
  for (const other of [a, b, c]) assert.equal(JSON.stringify(S.publicPart(other, {})), JSON.stringify(S.publicPart(run, {})));
  // 4. the profile is there only when the hiker chose to be public
  for (const choices of [{}, { public: false, line: 'x' }, { public: 'yes', line: 'x' }, { pool: true, now: true, line: 'x' }, null, undefined])
    assert.equal(S.publicPart(run, choices ?? undefined).profile, undefined);
  // 5. every value is a number, a boolean, a date, a camp id, or the validated handle and profile
  const walk = (v, where) => {
    if (typeof v === 'string') assert.ok(v === pub.handle || S.CAMP_IDS.includes(v) || /^\d{4}-\d{2}-\d{2}$/.test(v) || where.startsWith('profile'), `unexpected string at ${where}: ${v}`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
    else assert.ok(['number', 'boolean'].includes(typeof v), `unexpected value at ${where}`);
  };
  walk(pub, '');
  // 6. hostile runs: odd handles are refused, odd numbers are flattened
  assert.equal(S.publicPart({ ...run, handle: '<script>alert(1)</script>' }, {}), null);
  assert.equal(S.publicPart({ ...run, handle: 'a' }, {}), null);
  assert.equal(S.publicPart({ ...run, handle: 'Ünïcode Нame' }, {}), null);
  assert.equal(S.publicPart(null, {}), null);
  const odd = sampleRun(); odd.camps.trailhead.parts.route.hints = 'lots'; odd.camps.trailhead.parts.route.ms = { valueOf: () => 5 }; odd.camps.workshop.done = 'tomorrow <b>';
  const o = S.publicPart(odd, {}); assert.equal(o.hints.trailhead, 0); assert.ok(!o.camps.some((x) => x.id === 'workshop'));
  // 7. the line a hiker types is tidied (markup and invisible characters go), never a link, never over 140
  const p = S.publicPart(run, { public: true, line: '  hi <b>there</b>\u202E\u200B`old`\n\nfriend  ' + ' and so on'.repeat(40) });
  assert.ok(!/[<>`\u202E\u200B\n]/.test(p.profile.line) && p.profile.line.length <= 140 && p.profile.line.startsWith('hi there old friend'), p.profile.line);
  assert.deepEqual(Object.keys(p.profile), ['line']);
  // 8. manners: a rude or promotional line, or name, gives no public part at all (it is not repaired)
  for (const line of ['what a load of sh1t', 'f u c k this', 'see my site at example.com', 'find me at robin dot com', 'follow me for more', '@robinreed on the usual places', 'https://example.org', 'write to robin@example.org'])
    assert.equal(S.publicPart(run, { public: true, line }), null, 'should be refused: ' + line);
  for (const handle of ['Sh1thead', 'F.u.c.k', 'buy.example.com', '@robin', 'Follow me']) assert.equal(S.publicPart({ ...run, handle }, {}), null, 'should be refused: ' + handle);
  assert.equal(S.publicPart({ ...run, handle: "Robin O'Reed" }, {}).handle, "Robin O'Reed", 'an apostrophe in a name is fine');
  assert.ok(S.publicPart(run, { public: false, line: 'follow me' }), 'a line that is not going public is not judged');
});

test('sanitizePublic: unknown fields, wrong types and smuggled content are dropped', () => {
  const good = S.publicPart(sampleRun(), { public: true, line: 'hello' });
  assert.deepEqual(S.sanitizePublic(JSON.parse(JSON.stringify(good))), good, 'a clean block passes unchanged');
  const hostile = JSON.parse(JSON.stringify(good));
  Object.assign(hostile, { overlook: { said: 'I believe…' }, html: '<script>x</script>', minutes: -5, __proto__: { polluted: true } });
  hostile.camps.push({ id: 'overlook', done: '2026-03-04', said: 'smuggled creed', parts: { creed: { said: 'smuggled' } } }, { id: 'secret-camp', done: '2026-03-04' }, { id: 'summit', done: '2999-01-01' }, 'x', null);
  hostile.camps[0].extra = 'smuggled'; hostile.hints.overlook = 9; hostile.hints.other = 1; hostile.flags.creed = 'smuggled'; hostile.flags.quiet = 'yes';
  hostile.profile.bio = 'smuggled'; hostile.profile.links = ['https://smuggled.example/'];
  const clean = S.sanitizePublic(hostile), text = JSON.stringify(clean);
  assert.ok(!/smuggled|believe|script|polluted|secret-camp|2999/.test(text), text);
  assert.equal(clean.minutes, 0); assert.equal(clean.hints.overlook, undefined); assert.equal(clean.flags.quiet, false);
  assert.deepEqual(clean.camps.find((c) => c.id === 'overlook'), { id: 'overlook', done: '2026-03-04' });
  assert.equal(({}).polluted, undefined);
  for (const bad of [null, 1, 'x', [], { v: 2, handle: 'Robin' }, { v: 1 }, { v: 1, handle: 'x'.repeat(25) }, { v: 1, handle: 'Robin<' }, { v: 1, handle: ['Robin'] }]) assert.equal(S.sanitizePublic(bad), null);
  // a line that would need tidying, or is not polite, refuses the whole entry: it is not repaired and published
  for (const line of ['a <b>bold</b> claim', 'x'.repeat(141), ' padded ', 'two  spaces', 'zero\u200Bwidth', 'right\u202Eto left', 'what the f*ck', 'sh1t happens', 'visit example.com', 'me at example dot com', '@someone', 'follow me', { toString: () => 'x' }, 5])
    assert.deepEqual(S.inspectPublic({ v: 1, handle: 'Robin', profile: { line } }), { pub: null, why: 'line' }, 'line: ' + String(line));
  for (const handle of ['Sh1t', 'a s s h o l e', 'example.com', 'Rob<b>in', 'Rob\u200Bin']) assert.deepEqual(S.inspectPublic({ v: 1, handle }), { pub: null, why: 'name' }, 'name: ' + handle);
  assert.equal(S.inspectPublic({ v: 1, handle: 'Robin', profile: { line: 'Glad to be here.' } }).why, null);
  assert.equal(S.inspectPublic({ v: 1, handle: 'Robin', profile: { line: '' } }).pub.profile, undefined);
});

test('Shamir: every 3 of 4 gives the secret back; 2 do not', () => {
  const secret = crypto.getRandomValues(new Uint8Array(32)), shares = S.split(secret, { shares: 4, threshold: 3 });
  assert.deepEqual(shares.map((s) => s.x), [1, 2, 3, 4]);
  const subsets = (arr, k) => (k === 0 ? [[]] : arr.flatMap((v, i) => subsets(arr.slice(i + 1), k - 1).map((r) => [v, ...r])));
  const threes = subsets(shares, 3); assert.equal(threes.length, 4);
  for (const set of threes) { assert.deepEqual(S.combine(set), secret); assert.deepEqual(S.combine(set.slice().reverse()), secret); }
  assert.deepEqual(S.combine(shares), secret, 'all four work too');
  for (const pair of subsets(shares, 2)) assert.notDeepEqual(S.combine(pair), secret, 'two shares must not give the secret');
  for (const s of shares) assert.notDeepEqual(s.y, secret);
  // other parameters
  for (const [n, t] of [[3, 2], [7, 5], [255, 2], [5, 5]]) {
    const sec = crypto.getRandomValues(new Uint8Array(48)), sh = S.split(sec, { shares: n, threshold: t });
    assert.deepEqual(S.combine(sh.slice(n - t)), sec); if (t > 2) assert.notDeepEqual(S.combine(sh.slice(0, t - 1)), sec);
  }
  for (const bad of [{ shares: 4, threshold: 1 }, { shares: 2, threshold: 3 }, { shares: 256, threshold: 2 }, { shares: 4.5, threshold: 2 }]) assert.throws(() => S.split(secret, bad), { code: 'shares' });
  assert.throws(() => S.split(new Uint8Array(0)), { code: 'shares' });
  assert.throws(() => S.combine([shares[0], shares[0], shares[1]]), { code: 'shares' }, 'the same share twice');
  assert.throws(() => S.combine([shares[0]]), { code: 'shares' });
  // randomness: splitting twice gives different shares
  assert.notDeepEqual(S.split(secret)[0].y, shares[0].y);
});

test('shares as text: typing mistakes, too few, and mixed sets are refused', () => {
  const secret = crypto.getRandomValues(new Uint8Array(32)), { set, texts } = S.splitToShares(secret);
  assert.equal(texts.length, 4);
  for (const t of texts) assert.match(t, /^TRAIL-SHARE-1-[0-9A-F]{8}-3OF4-[1-4]-[0-9A-F]{64}-[0-9A-F]{8}$/);
  assert.deepEqual(S.combineShares([texts[3], texts[0], texts[2]]).secret, secret);
  assert.equal(S.combineShares(texts).set, set);
  assert.deepEqual(S.combineShares(texts.slice(0, 3).map((t) => '  ' + t.toLowerCase().match(/.{1,9}/g).join(' \n') + ' ')).secret, secret, 'spaces, line breaks and lower case are fine');
  assert.throws(() => S.combineShares(texts.slice(0, 2)), /needs 3/);
  assert.throws(() => S.combineShares([texts[0], texts[0], texts[1]]), /twice/);
  const typo = texts[0].replace(/-([0-9A-F]{64})-/, (m, y) => `-${y[0] === '0' ? '1' : '0'}${y.slice(1)}-`);
  assert.throws(() => S.decodeShare(typo), /typing mistake/);
  assert.throws(() => S.combineShares([texts[0], texts[1], S.splitToShares(secret).texts[2]]), /same set/);
  assert.throws(() => S.decodeShare('hello'), { code: 'shares' });
});

test('private key backup: passphrase, and shares, both restore a key that opens runs', async () => {
  const env = await S.sealRun(sampleRun(), keys.main.publicJwk, { n: 1 });
  const backup = JSON.parse(JSON.stringify(await S.exportPrivateKey(keys.main.privateKey, 'correct horse battery staple')));
  assert.equal(backup.kdf.name, 'PBKDF2'); assert.ok(backup.kdf.iterations >= 600000); assert.equal(backup.kid, keys.main.kid);
  assert.ok(!JSON.stringify(backup).includes(keys.main.publicJwk.n.slice(0, 20)) || backup.publicKey.n === keys.main.publicJwk.n);
  const back = await S.importPrivateKey(backup, 'correct horse battery staple');
  assert.equal(back.privateKey.extractable, false, 'a restored key is locked to the browser');
  assert.equal((await S.openRun(env, back.privateKey, { kid: back.kid })).meta.n, 1);
  await assert.rejects(S.importPrivateKey(backup, 'wrong horse battery staple'), { code: 'secret' });
  await assert.rejects(S.importPrivateKey({ ...backup, data: backup.data.slice(0, -2) + (backup.data.endsWith('AA') ? 'BB' : 'AA') }, 'correct horse battery staple'), { code: 'secret' });
  await assert.rejects(S.importPrivateKey({ ...backup, publicKey: keys.other.publicJwk }, 'correct horse battery staple'), { code: 'format' });
  await assert.rejects(S.exportPrivateKey(back.privateKey, 'correct horse battery staple'), { code: 'key' }, 'a locked key cannot be exported again');
  await assert.rejects(S.exportPrivateKey(keys.main.privateKey, 'short'), { code: 'secret' });
  // the four-people route: a random secret encrypts the backup; the secret is split 3 of 4
  const secret = crypto.getRandomValues(new Uint8Array(32)), stewards = await S.exportPrivateKey(keys.main.privateKey, secret), { texts } = S.splitToShares(secret);
  assert.equal(stewards.kdf.name, 'HKDF');
  for (const three of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]) {
    const opened = await S.importPrivateKey(stewards, S.combineShares(three.map((i) => texts[i])).secret);
    assert.equal((await S.openRun(env, opened.privateKey)).run.handle, 'Robin Reed');
  }
  const twoOnly = S.combine([S.decodeShare(texts[0]), S.decodeShare(texts[1])]);
  await assert.rejects(S.importPrivateKey(stewards, twoOnly), { code: 'secret' }, 'two shares do not open the backup');
  await assert.rejects(S.importPrivateKey(stewards, 'a passphrase'), { code: 'secret' });
});

test('the issue: public and sealed blocks, and what happens when a run is too long for a link', async () => {
  const small = { v: 2, handle: 'Robin Reed', camps: { trailhead: { done: '2026-03-01T10:00:00Z', parts: { route: { ms: 60000, hints: 0, done: true } } } } };
  const env = await S.sealRun(small, keys.other.publicJwk), pub = S.publicPart(small, { public: true, line: 'hello & goodbye' });
  const plan = S.buildIssueUrl({ repo: 'someone/some.repo', envelope: env, publicPart: pub, choices: { public: true }, email: 'trail@example.org' });
  assert.equal(plan.mode, 'prefilled'); assert.ok(plan.url.length <= S.LIMITS.url);
  const u = new URL(plan.url);
  assert.equal(u.origin + u.pathname, 'https://github.com/someone/some.repo/issues/new');
  assert.equal(u.searchParams.get('title'), 'Trail run: Robin Reed'); assert.equal(u.searchParams.get('labels'), 'trail');
  const body = u.searchParams.get('body'); assert.equal(body, plan.body);
  assert.ok(body.indexOf(S.MARK.publicBegin) < body.indexOf(S.MARK.publicEnd) && body.indexOf(S.MARK.publicEnd) < body.indexOf(S.MARK.sealedBegin) && body.indexOf(S.MARK.sealedBegin) < body.indexOf(S.MARK.sealedEnd));
  assert.deepEqual(S.readPublicBlock(body), pub);
  assert.deepEqual((await S.openRun(S.readSealedBlock(body), keys.other.privateKey)).run, small);
  assert.ok(plan.mailto.startsWith('mailto:trail@example.org?subject=') && plan.mailto.length <= S.LIMITS.mailto + 200);
  // not public: no public block, and the title does not carry the name
  const quiet = S.buildIssueUrl({ repo: 'someone/repo', envelope: env, publicPart: pub, choices: { public: false } });
  assert.ok(!quiet.body.includes(S.MARK.publicBegin) && !quiet.url.includes('Robin') && !quiet.body.includes('Robin')); assert.equal(quiet.title, 'Trail run (sealed)'); assert.equal(quiet.mailto, '');
  assert.equal(S.readPublicBlock(quiet.body), null);
  // too long for a link: fall back to copy-and-paste, with a file and an e-mail on offer
  const noisy = sampleRun(); noisy.camps.shelter.parts.bench.said = Array.from({ length: 900 }, () => crypto.randomUUID()).join(' ');   // random text does not compress
  const longEnv = await S.sealRun(noisy, keys.main.publicJwk);
  for (const e of [longEnv]) {
    const p = S.buildIssueUrl({ repo: 'someone/repo', envelope: e, publicPart: pub, choices: { public: true }, email: 'trail@example.org' });
    assert.equal(p.mode, 'paste'); assert.ok(p.url.length < 600, 'the fallback link is short'); assert.ok(!p.url.includes('BEGIN%20TRAIL'));
    assert.ok(p.copy.includes(e) && p.copy.includes(S.MARK.publicBegin)); assert.equal(p.file.text.trim(), p.body); assert.match(p.file.name, /\.txt$/);
    assert.ok(p.mailto.length <= S.LIMITS.mailto && /attach/.test(decodeURIComponent(p.mailto)), 'the e-mail asks for the file to be attached');
    assert.ok(new URL(p.url).searchParams.get('body').includes(S.MARK.run), 'the nearly empty issue still carries the marker');
  }
  // a tiny limit forces the same fallback for any run
  assert.equal(S.buildIssueUrl({ repo: 'a/b', envelope: env, publicPart: pub, choices: { public: true }, maxUrl: 500 }).mode, 'paste');
  // too long even for an issue: file only
  const huge = sampleRun(); huge.camps.shelter.parts.bench.said = Array.from({ length: 3000 }, () => crypto.randomUUID()).join(' ');
  const h = S.buildIssueUrl({ repo: 'a/b', envelope: await S.sealRun(huge, keys.main.publicJwk), publicPart: pub, choices: { public: true }, email: 'trail@example.org' });
  assert.equal(h.mode, 'file'); assert.equal(h.url, '');
  assert.throws(() => S.buildIssueUrl({ repo: 'not a repo', envelope: env, publicPart: pub, choices: {} }), { code: 'config' });
  assert.throws(() => S.buildIssueUrl({ repo: 'a/b', envelope: 'nothing', publicPart: pub, choices: {} }), { code: 'format' });
});

/* ---------- the register script against hostile issues ---------- */
const block = (obj) => `${S.MARK.publicBegin}\n\`\`\`json\n${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\`\`\`\n${S.MARK.publicEnd}`;
const sealedPart = (inside = 'AAAA') => `${S.MARK.sealedBegin}\n\`\`\`\n${S.BEGIN}\nVersion: 1\n\n${inside}\n${S.END}\n\`\`\`\n${S.MARK.sealedEnd}`;
const pubFor = (handle, extra = {}) => ({ v: 1, handle, camps: [{ id: 'trailhead', done: '2026-03-01' }, { id: 'workshop', done: '2026-03-02' }], minutes: 40, hints: { trailhead: 1, workshop: 0 }, flags: { quiet: false, longWay: true, shortestWay: false, oneSitting: false, restarts: 2 }, ...extra });
const OK = { name: 'trail:approved' };
const issue = (number, userId, body, extra = {}) => ({ number, title: 'Trail run', user: { id: userId, login: 'user' + userId }, labels: [OK], state: 'open', body: `${S.MARK.run}\n${body}`, comments: [], ...extra });

function hostileIssues() {
  return [
    issue(1, 101, `${block(pubFor('Robin Reed', { profile: { line: 'First on the trail' } }))}\n${sealedPart()}`),
    // 2: script tags everywhere
    issue(2, 102, `<script>alert(1)</script>\n${block(pubFor('<script>alert(1)</script>'))}\n${sealedPart()}`),
    issue(3, 103, `${block(pubFor('Mallory', { profile: { line: '<img src=x onerror=alert(1)>', links: ['javascript:alert(1)', 'https://fine.example/page'] }, html: '<script>steal()</script>' }))}\n${sealedPart()}`),
    // 4: a huge body
    issue(4, 104, `${block(pubFor('Biggie'))}\n` + 'A'.repeat(300000)),
    // 5: a huge public block
    issue(5, 105, block(pubFor('Padded', { profile: { line: 'x'.repeat(5000) } }))),
    // 6: someone else claims Robin's name, later
    issue(6, 106, `${block(pubFor('robin reed', { minutes: 1, camps: S.CAMP_IDS.map((id) => ({ id, done: '2026-03-09' })) }))}\n${sealedPart()}`),
    // 7: smuggling Overlook content, by every door
    issue(7, 107, `${block({ ...pubFor('Smuggler'), overlook: { said: 'what they believe' }, camps: [{ id: 'trailhead', done: '2026-03-01' }, { id: 'overlook', done: '2026-03-04', said: 'creed text', parts: { creed: { said: 'creed text' } } }], hints: { trailhead: 0, overlook: 12 }, flags: { quiet: true, creed: 'creed text' } })}\n${sealedPart()}`),
    // 8: the public markers placed inside the sealed part: must not be read
    issue(8, 108, `Nothing public.\n${S.MARK.sealedBegin}\n${block(pubFor('Hidden Inside'))}\n${S.MARK.sealedEnd}`),
    // 9: two public blocks: ambiguous, refused
    issue(9, 109, `${block(pubFor('Twice'))}\n${block(pubFor('Twice Again'))}`),
    // 10: not JSON, 11: wrong version, 12: no fence, 13: no camps reached
    issue(10, 110, block('{ not json')), issue(11, 111, block({ ...pubFor('Future'), v: 2 })), issue(12, 112, `${S.MARK.publicBegin}\n${JSON.stringify(pubFor('NoFence'))}\n${S.MARK.publicEnd}`), issue(13, 113, block(pubFor('Nowhere', { camps: [] }))),
    // 14: asked to be removed, by the author; 15: "remove me" from somebody else does nothing
    issue(14, 114, block(pubFor('Gone')), { comments: [{ id: 1, user: { id: 114 }, body: 'Remove me.', created_at: '2026-04-01T00:00:00Z' }] }),
    issue(15, 115, block(pubFor('Staying')), { comments: [{ id: 2, user: { id: 999 }, body: 'remove me', created_at: '2026-04-01T00:00:00Z' }, { id: 3, user: { id: 115 }, body: 'please do not remove me, thanks', created_at: '2026-04-02T00:00:00Z' }] }),
    // 16: removed then restored by the author
    issue(16, 116, block(pubFor('Back Again')), { comments: [{ id: 4, user: { id: 116 }, body: 'remove me', created_at: '2026-04-01T00:00:00Z' }, { id: 5, user: { id: 116 }, body: 'restore me', created_at: '2026-04-03T00:00:00Z' }] }),
    // 17: removed by the owner's label; 18: the same account tries again and stays out
    issue(17, 117, block(pubFor('Rude Name')), { labels: [OK, { name: 'trail-remove' }] }), issue(18, 117, block(pubFor('Rude Name Two'))),
    // 19 then 20: one account, two runs: the newer decides; 21 then 22: the newer one is not public, so the entry goes
    issue(19, 119, block(pubFor('Walker', { minutes: 10 }))), issue(20, 119, block(pubFor('Walker', { minutes: 20 })), { labels: [OK, { name: 'trail-checked' }] }),
    issue(21, 121, block(pubFor('Shy'))), issue(22, 121, `Nothing public.\n${sealedPart()}`),
    // 23: not a trail issue at all; 24: a pull request; 25: recognised by the label alone; 26: junk
    { number: 23, user: { id: 123 }, title: 'Bug', body: block(pubFor('Bystander')), labels: [] },
    { ...issue(24, 124, block(pubFor('PullReq'))), pull_request: {} },
    { number: 25, user: { id: 125 }, title: 'x', body: block(pubFor('Labelled')), labels: ['trail', 'trail:approved'] },
    null, 7, 'x', { number: 'x' }, { number: 27, body: block(pubFor('NoUser')), labels: ['trail'] },
    // 28: prototype tricks and odd types
    issue(28, 128, block('{"v":1,"handle":"Proto","__proto__":{"admin":true},"constructor":{"prototype":{"x":1}},"camps":[{"id":"trailhead","done":"2026-03-01"}],"minutes":"NaN","hints":[1,2],"flags":"all"}')),
    // 29: a name with look-alike or invisible characters
    issue(29, 129, block(pubFor('Rob​in Reed'))), issue(30, 130, block(pubFor('Rоbin Reed'))),   // zero-width space; Cyrillic о
    // 31: a link smuggled in as an extra field is simply not there; the entry itself is fine
    issue(31, 131, block(pubFor('Linker', { profile: { line: 'Glad to be here.', links: ['https://fine.example/page'], url: 'https://fine.example' }, links: ['https://fine.example'] }))),
    // 32-44: manners. Each of these is dropped whole, never tidied and published
    issue(32, 132, block(pubFor('Sh1tHead'))), issue(33, 133, block(pubFor('F u c k e r'))), issue(34, 134, block(pubFor('Polite Name', { profile: { line: 'this trail is bullsh!t' } }))),
    issue(35, 135, block(pubFor('Spaced Out', { profile: { line: 'well f.u.c.k that' } }))), issue(36, 136, block(pubFor('Seller', { profile: { line: 'visit robin-shop . com today' } }))),
    issue(37, 137, block(pubFor('Dotcom', { profile: { line: 'find me at robinreed dot com' } }))), issue(38, 138, block(pubFor('Handle', { profile: { line: 'I am @robinreed everywhere' } }))),
    issue(39, 139, block(pubFor('Follower', { profile: { line: 'Follow me for more trails' } }))), issue(40, 140, block(pubFor('Sneaky', { profile: { line: 'sh\u200Bit and fu\u200Dck' } }))),
    issue(41, 141, block(pubFor('Backwards', { profile: { line: 'nice \u202Etihs\u202C day' } }))), issue(42, 142, block(pubFor('Tagged', { profile: { line: 'hello <b>world</b>' } }))),
    issue(43, 143, block(pubFor('example.com'))), issue(44, 144, block(pubFor('Mailer', { profile: { line: 'write to robin@example.org' } }))),
    // 45: perfectly polite, but nobody with write access has read it yet; 46: the hiker wrote the approval label's name in the text, which is not a label
    issue(45, 145, block(pubFor('Waiting Kindly', { profile: { line: 'Glad to be here.' } })), { labels: [] }),
    issue(46, 146, 'trail:approved\n' + block(pubFor('Self Approved')), { labels: [{ name: 'trail' }], title: 'Trail run trail:approved' }),
  ];
}

test('the register: hostile issues', () => {
  const { register, lights, stats } = buildRegister(hostileIssues());
  const names = register.entries.map((e) => (e.n ? `${e.handle}#${e.n}` : e.handle));
  assert.deepEqual(names, ['Robin Reed', 'robin reed#2', 'Smuggler', 'Staying', 'Back Again', 'Walker', 'Labelled', 'Proto', 'Linker']);
  const text = JSON.stringify(register) + JSON.stringify(lights);
  assert.ok(!/<|>|onerror|javascript:|https?:|fine\.example|links|url|creed|believe|steal|admin|Hidden|Twice|Bystander|PullReq|Gone|Rude|Shy|Biggie|Padded|Mallory|Sh1t|F u c|Polite|Spaced|Seller|Dotcom|Handle|Follow|Sneaky|Backwards|Tagged|example|Mailer|Waiting|Self Approved|\u200B|\u202E/.test(text), text);
  const by = (h) => register.entries.find((e) => e.handle === h);
  assert.deepEqual(by('Linker').profile, { line: 'Glad to be here.' }, 'no link survives, by any door');
  assert.deepEqual(by('Robin Reed').profile, { line: 'First on the trail' });
  assert.deepEqual(by('Smuggler').camps, [{ id: 'trailhead', done: '2026-03-01' }, { id: 'overlook', done: '2026-03-04' }], 'the Overlook: reached, and nothing more');
  assert.deepEqual(by('Smuggler').hints, { trailhead: 0 });
  assert.deepEqual(Object.keys(by('Smuggler').flags), ['quiet', 'longWay', 'shortestWay', 'oneSitting', 'restarts']);
  assert.equal(by('Robin Reed').n, undefined, 'the first to sign with a name keeps it bare');
  assert.equal(by('robin reed').n, 2, 'a later claim to the same name is numbered, not merged and not preferred');
  assert.equal(by('Robin Reed').minutes, 40, 'the forged block did not overwrite the first entry');
  assert.equal(by('Walker').minutes, 20); assert.equal(by('Walker').checked, true);
  assert.deepEqual(by('Proto'), { handle: 'Proto', camps: [{ id: 'trailhead', done: '2026-03-01' }], minutes: 0, hints: {}, flags: { quiet: false, longWay: false, shortestWay: false, oneSitting: false, restarts: 0 } });
  assert.equal(({}).admin, undefined);
  for (const e of register.entries) assert.deepEqual(Object.keys(e).filter((k) => !['handle', 'n', 'camps', 'minutes', 'hints', 'flags', 'profile', 'checked'].includes(k)), []);
  assert.deepEqual(lights.lights.map((l) => l.camp), ['workshop', 'summit', 'overlook', 'workshop', 'workshop', 'workshop', 'workshop', 'trailhead', 'workshop']);
  for (const l of lights.lights) assert.deepEqual(Object.keys(l).filter((k) => !['handle', 'n', 'camp'].includes(k)), [], 'a light is a name and a camp, nothing else');
  assert.equal(stats.entries, 9); assert.equal(stats.removedByAuthor, 1); assert.equal(stats.removedByLabel, 1); assert.equal(stats.sharedNames, 1);
  // manners: refused whole, counted, never echoed
  assert.equal(stats.refusedName, 6, 'script-tag name, zero-width name, Cyrillic name, two rude names, a domain as a name');
  assert.equal(stats.refusedLine, 11, 'markup twice and nine rude or promotional lines'); assert.ok(stats.refusedShape >= 5, 'oversize, doubled, unparseable and malformed blocks');
  assert.ok(!Object.values(stats).some((v) => typeof v !== 'number'), 'the stats are counts and nothing else');
  // moderation: polite but unread is not public; text that merely names the label is not a label
  assert.equal(stats.waiting, 2);
  const open = buildRegister(hostileIssues(), { requireApproval: false }).register.entries.map((e) => e.handle);
  assert.ok(open.includes('Waiting Kindly') && open.includes('Self Approved') && !open.includes('Sh1tHead') && !open.includes('Seller'), 'with approval off, the automatic checks still hold');
  const other = buildRegister(hostileIssues(), { approvalLabel: 'ok-to-list' }); assert.equal(other.register.entries.length, 0); assert.equal(other.stats.waiting, 11);
  // the author can still leave without the owner, approved or not
  const leave = (labels) => buildRegister([issue(1, 1, block(pubFor('Leaver')), { labels, comments: [{ id: 1, user: { id: 1 }, body: 'remove me', created_at: '2026-04-01T00:00:00Z' }] })]);
  assert.equal(leave([OK]).register.entries.length, 0); assert.equal(leave([OK]).stats.removedByAuthor, 1); assert.equal(leave([]).stats.removedByAuthor, 1);
  // taking the label away takes the entry away
  assert.equal(buildRegister([issue(1, 1, block(pubFor('Unlisted')), { labels: [] })]).register.entries.length, 0);
  // the same issues in any order give the same files
  assert.deepEqual(buildRegister(hostileIssues().reverse()).register, register);
  // a sealed block that would explode a parser is never looked at
  let touched = false; const trap = { number: 40, user: { id: 140 }, labels: ['trail'], get body() { return block(pubFor('Trap')) + '\n' + S.MARK.sealedBegin + '\n' + 'Z'.repeat(1000); }, get comments() { touched = true; return []; } };
  assert.equal(buildRegister([trap], { requireApproval: false }).register.entries[0].handle, 'Trap'); assert.ok(touched);
  assert.deepEqual(buildRegister([]).register.entries, []); assert.deepEqual(buildRegister(null).lights.lights, []);
});

test('the page re-checks what the register files say before showing it', () => {
  const { register, lights } = buildRegister(hostileIssues());
  const got = checkRegister(JSON.parse(JSON.stringify(register)), JSON.parse(JSON.stringify(lights)));
  assert.equal(got.entries.length, 9); assert.equal(got.lights.length, 9);
  assert.equal(got.entries.find((e) => e.handle === 'robin reed').n, 2); assert.equal(got.entries.find((e) => e.handle === 'Walker').checked, true);
  // files that were tampered with, or are not there at all
  const bad = checkRegister({ entries: [{ handle: '<script>x</script>', camps: [{ id: 'trailhead', done: '2026-03-01' }] }, { handle: 'Ok Name', camps: [{ id: 'overlook', done: '2026-03-04', said: 'creed' }], hints: { overlook: 3 }, profile: { links: ['javascript:1', 'https://x.example'] }, n: '2', checked: 'yes', extra: 'creed' }, { handle: 'Rude Line', camps: [{ id: 'trailhead', done: '2026-03-01' }], profile: { line: 'well sh1t' } }, { handle: 'Advert', camps: [{ id: 'trailhead', done: '2026-03-01' }], profile: { line: 'see example.com' } }, { handle: 'Sh1thead', camps: [{ id: 'trailhead', done: '2026-03-01' }] }, null, 'x', []] },
    { lights: [{ handle: 'Ok Name', camp: 'summit', said: 'creed' }, { handle: '<b>', camp: 'summit' }, { handle: 'Ghost', camp: 'nowhere' }, null] });
  assert.deepEqual(bad.entries.map((e) => e.handle), ['Ok Name']); assert.ok(!/creed|script|<|javascript|example|links/.test(JSON.stringify(bad)));
  assert.equal(bad.entries[0].n, 0); assert.equal(bad.entries[0].checked, false);
  assert.deepEqual(bad.lights, [{ handle: 'Ok Name', n: 0, camp: 'summit' }]);
  for (const [r, l] of [[null, null], [{}, {}], [{ entries: 'x' }, { lights: 5 }], [[], []]]) assert.deepEqual(checkRegister(r, l), { entries: [], lights: [] });
});

test('manners are asked again by the register script, on cleaned text', () => {
  const body = (extra, handle = 'Polite Name') => `${S.MARK.run}\n${block(pubFor(handle, extra))}`;
  assert.equal(readEntry(body({ profile: { line: 'Glad to be here.' } })).why, null);
  assert.equal(readEntry(body({})).why, null);
  assert.equal(readEntry('no block here').why, 'none');
  for (const line of ['sh1t', 's h i t', 'f*ck', 'fuuuuck', 'a$$hole', 'www.example.org', 'example . com', 'robin dot com', '@robin', 'Follow me', 'sh\u200Bit', '\u202Ereversed', '<i>hello</i>', '&lt;script&gt; https://x.example'])
    assert.equal(readEntry(body({ profile: { line } })).why, 'line', 'line should be refused: ' + JSON.stringify(line));
  for (const name of ['Sh1t', 'B1tch', 'example.com', 'Rob<i>in'])
    assert.equal(readEntry(body({}, name)).why, 'name', 'name should be refused: ' + name);
  // the two halves agree: what the browser module refuses, the validator refuses
  for (const line of ['Glad to be here.', 'Walks slowly, reads signs.', 'I assess grass in class', 'sh1t', 'follow me']) assert.equal(!!checkPublic(line), S.inspectPublic({ v: 1, handle: 'Robin', profile: { line } }).why === 'line', line);
  for (const name of ['Robin Reed', 'Dickens Fan', 'Sh1t']) assert.equal(!!checkName(name), S.inspectPublic({ v: 1, handle: name }).why === 'name', name);
});

test('readPublicBlock never reads past the start of the sealed part', () => {
  const pub = pubFor('Robin Reed');
  assert.deepEqual(S.readPublicBlock(`${block(pub)}\n${sealedPart()}`).handle, 'Robin Reed');
  assert.equal(S.readPublicBlock(`${sealedPart()}\n${block(pub)}`), null, 'a public block after the sealed part is ignored');
  assert.equal(S.readPublicBlock(`${S.BEGIN}\n${block(pub)}\n${S.END}`), null, 'and one inside an envelope');
  assert.equal(S.readPublicBlock('x'.repeat(S.LIMITS.issueBody) + block(pub)), null, 'and one beyond the first 20,000 characters');
  for (const v of [null, undefined, 5, {}, []]) assert.equal(S.readPublicBlock(v), null);
});

test('the register script: local mode, twice, same bytes, quiet log', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'trail-register-')), src = path.join(dir, 'issues'), out = path.join(dir, 'out');
  try {
    const { mkdir } = await import('node:fs/promises'); await mkdir(src);
    const all = hostileIssues();
    await writeFile(path.join(src, 'a.json'), JSON.stringify(all.slice(0, 12)));
    for (const [i, one] of all.slice(12).entries()) await writeFile(path.join(src, `b-${String(i).padStart(2, '0')}.json`), JSON.stringify(one));
    await writeFile(path.join(src, 'broken.json'), '{ nope');
    const run = () => promisify(execFile)(process.execPath, [path.join(here, '../scripts/trail-register.mjs'), '--local', src, '--out', out]);
    const first = await run(), a = await readFile(path.join(out, 'register.json'), 'utf8'), l = await readFile(path.join(out, 'lights.json'), 'utf8');
    const second = await run();
    assert.equal(await readFile(path.join(out, 'register.json'), 'utf8'), a); assert.equal(await readFile(path.join(out, 'lights.json'), 'utf8'), l);
    assert.match(first.stdout, /Files changed\./); assert.match(second.stdout, /Nothing changed\./);
    assert.deepEqual(JSON.parse(a), buildRegister(all).register);
    for (const log of [first.stdout + first.stderr, second.stdout + second.stderr]) assert.ok(!/Robin|Mallory|Walker|user1|example|script|sh1t|bullsh|follow/i.test(log), 'the log names nobody: ' + log);
    assert.match(first.stdout, /Listed: 9;/); assert.match(first.stdout, /Waiting to be read and approved: 2;/);
    // the job summary: counts only
    const sum = path.join(dir, 'summary.md');
    await promisify(execFile)(process.execPath, [path.join(here, '../scripts/trail-register.mjs'), '--local', src, '--out', out], { env: { ...process.env, GITHUB_STEP_SUMMARY: sum } });
    const summary = await readFile(sum, 'utf8');
    assert.match(summary, /\| Refused: line not allowed \| 11 \|/); assert.ok(!/Robin|Seller|sh1t|example|user1/i.test(summary), summary);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
