/* The Trail: sealing a run.
 *
 * One module, no dependencies, WebCrypto only. It runs in the browser (the summit and the desk)
 * and in Node 24 (the register workflow and the tests).
 *
 *   sealRun(run, publicKey, meta)   seal a run so only the holder of the private key can read it
 *   openRun(envelope, privateKey)   the reverse, for the desk
 *   publicPart(run, choices)        the small object that MAY be public, built by an allow-list
 *   sanitizePublic(anything)        the one validator every public block goes through
 *   issueBody / readPublicBlock / readSealedBlock / buildIssueUrl
 *   generateKeyPair / exportPublicKey / fingerprint / importPublicKey
 *   exportPrivateKey / importPrivateKey      a private key backup, encrypted
 *   split / combine / encodeShare / decodeShare / combineShares     Shamir over GF(256)
 *
 * The envelope (format 1):
 *
 *   -----BEGIN TRAIL RUN-----
 *   Version: 1
 *   Alg: RSA-OAEP-256+A256GCM
 *   Key: <32 hex characters: which public key this was sealed to>
 *   Zip: deflate-raw            (or "none")
 *
 *   <base64url, 64 characters a line, of:
 *      2 bytes   length of the wrapped key (big-endian)
 *      n bytes   a fresh AES-256 key, encrypted to the public key with RSA-OAEP (SHA-256)
 *      12 bytes  AES-GCM nonce
 *      rest      AES-256-GCM of the (compressed) JSON, tag included>
 *   -----END TRAIL RUN-----
 *
 * The four header values are bound into the AES-GCM tag, so changing any of them, or any byte of
 * the body, makes the envelope fail to open.
 */

import { clean, checkName, checkPublic, rude } from './manners.js?v=3f0bc4fd';

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });

export const FORMAT = 1;
export const ALG = 'RSA-OAEP-256+A256GCM';
export const CAMP_IDS = ['trailhead', 'workshop', 'shelter', 'overlook', 'summit'];
/** The camp nothing may be said about in public, except that it was reached. */
export const PRIVATE_CAMP = 'overlook';
export const BEGIN = '-----BEGIN TRAIL RUN-----', END = '-----END TRAIL RUN-----';
export const LIMITS = { envelope: 2_000_000, plain: 8_000_000, publicBlock: 4000, issueBody: 20000, line: 140, url: 7600, mailto: 1900, githubBody: 65000 };

/** An error with a plain sentence for people and a short code for code. */
export class TrailError extends Error { constructor(code, message) { super(message); this.name = 'TrailError'; this.code = code; } }
const fail = (code, message) => { throw new TrailError(code, message); };

/* ---------- bytes ---------- */
export function b64u(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) fail('format', 'That is not valid base64url text.');
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => { const out = new Uint8Array(s.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16); return out; };
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function through(bytes, stream, cap) {
  const w = stream.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const r = stream.readable.getReader(), chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await r.read(); if (done) break;
    total += value.length; if (total > cap) { r.cancel().catch(() => {}); fail('size', 'The sealed run unpacks to more than this page will read.'); }
    chunks.push(value);
  }
  return concat(...chunks);
}

/* ---------- keys ---------- */
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };

/** The key id: SHA-256 of the public key's RFC 7638 thumbprint input, first 16 bytes, in hex. */
export async function fingerprint(jwk) {
  if (!jwk || jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') fail('key', 'That is not an RSA public key.');
  const canon = `{"e":"${jwk.e}","kty":"RSA","n":"${jwk.n}"}`;
  return hex(new Uint8Array(await subtle.digest('SHA-256', te.encode(canon))).subarray(0, 16));
}

/** Accepts a JWK object, JWK JSON text, a PEM "PUBLIC KEY", or a CryptoKey. Returns { key, jwk, kid }. */
export async function importPublicKey(input) {
  let jwk;
  try {
    if (input && typeof input === 'object' && input.type === 'public' && input.algorithm) jwk = await subtle.exportKey('jwk', input);
    else if (typeof input === 'string' && input.includes('-----BEGIN PUBLIC KEY-----')) {
      const der = Uint8Array.from(atob(input.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
      jwk = await subtle.exportKey('jwk', await subtle.importKey('spki', der, RSA, true, ['encrypt']));
    } else jwk = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) { fail('key', 'The public key could not be read.'); }
  if (!jwk || jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string' || jwk.d) fail('key', 'That is not an RSA public key.');
  const bits = unb64u(jwk.n).length * 8;
  if (bits < 2048) fail('key', 'That public key is too short to be safe.');
  const clean = { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', ext: true, key_ops: ['encrypt'] };
  let key; try { key = await subtle.importKey('jwk', clean, RSA, true, ['encrypt']); } catch (e) { fail('key', 'The public key could not be read.'); }
  return { key, jwk: { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256' }, kid: await fingerprint(jwk), bits };
}

/** A new key pair. The private key is extractable so it can be backed up; the desk re-imports it locked. */
export async function generateKeyPair({ modulusLength = 4096 } = {}) {
  const pair = await subtle.generateKey({ ...RSA, modulusLength, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  const { jwk, kid } = await exportPublicKey(pair.publicKey);
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicJwk: jwk, kid };
}

export async function exportPublicKey(publicKey) {
  const { jwk, kid } = await importPublicKey(publicKey);
  return { jwk, kid };
}

/* ---------- private key backup ---------- */
export const KDF_ITERATIONS = 1_000_000;

async function backupKey(secret, kdf, usage) {
  if (kdf.name === 'PBKDF2') {
    const base = await subtle.importKey('raw', te.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(kdf.salt), iterations: kdf.iterations }, base, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  if (kdf.name === 'HKDF') {
    const base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: unb64u(kdf.salt), info: te.encode(kdf.info) }, base, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  fail('format', 'This backup uses a method this page does not know.');
}
const backupAad = (kid) => te.encode(`trail-key-backup\n1\n${kid}`);

/** Encrypts the private key for safekeeping.
 *  secret: a passphrase (string → PBKDF2-SHA-256, a million rounds) or 16+ random bytes (Uint8Array → HKDF),
 *  the second being what gets split into shares. Returns a plain object to save as JSON. */
export async function exportPrivateKey(privateKey, secret, { iterations = KDF_ITERATIONS, note } = {}) {
  let pkcs8, jwk;
  try { pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', privateKey)); jwk = await subtle.exportKey('jwk', privateKey); }
  catch (e) { fail('key', 'This private key is locked to its browser and cannot be exported.'); }
  const publicKey = { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256' }, kid = await fingerprint(publicKey);
  const isBytes = secret instanceof Uint8Array;
  if (isBytes ? secret.length < 16 : typeof secret !== 'string' || secret.length < 8) fail('secret', 'The passphrase is too short.');
  const kdf = isBytes ? { name: 'HKDF', hash: 'SHA-256', salt: b64u(random(16)), info: 'trail-key-backup/1' }
    : { name: 'PBKDF2', hash: 'SHA-256', salt: b64u(random(16)), iterations };
  const iv = random(12), key = await backupKey(secret, kdf, ['encrypt']);
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: backupAad(kid) }, key, pkcs8));
  pkcs8.fill(0);
  return { kind: 'trail-key-backup', v: 1, kid, publicKey, kdf, cipher: { name: 'AES-GCM', iv: b64u(iv) }, data: b64u(data), ...(note ? { note } : {}) };
}

/** Opens a backup. The key comes back locked (not extractable) unless asked otherwise. */
export async function importPrivateKey(backup, secret, { extractable = false } = {}) {
  if (typeof backup === 'string') { try { backup = JSON.parse(backup); } catch (e) { fail('format', 'That is not a key backup file.'); } }
  if (!backup || backup.kind !== 'trail-key-backup' || backup.v !== 1 || !backup.kdf || !backup.cipher || typeof backup.data !== 'string') fail('format', 'That is not a key backup file.');
  if (backup.kdf.name === 'PBKDF2' && !(backup.kdf.iterations >= 1 && backup.kdf.iterations <= 50_000_000)) fail('format', 'That is not a key backup file.');
  const kid = await fingerprint(backup.publicKey);
  if (kid !== backup.kid) fail('format', 'The backup file has been altered: its key id does not match its public key.');
  if (backup.kdf.name === 'HKDF' ? !(secret instanceof Uint8Array) : typeof secret !== 'string') fail('secret', backup.kdf.name === 'HKDF' ? 'This backup opens with shares, not a passphrase.' : 'This backup opens with a passphrase.');
  const key = await backupKey(secret, backup.kdf, ['decrypt']);
  let pkcs8;
  try { pkcs8 = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(backup.cipher.iv), additionalData: backupAad(kid) }, key, unb64u(backup.data))); }
  catch (e) { fail('secret', backup.kdf.name === 'HKDF' ? 'Those shares do not open this backup.' : 'That passphrase does not open this backup.'); }
  const privateKey = await subtle.importKey('pkcs8', pkcs8, RSA, extractable, ['decrypt']);
  pkcs8.fill(0);
  return { privateKey, publicJwk: { kty: 'RSA', n: backup.publicKey.n, e: backup.publicKey.e, alg: 'RSA-OAEP-256' }, kid };
}

/* ---------- seal and open ---------- */
const sealAad = (kid, zip) => te.encode(`trail-run\n${FORMAT}\n${ALG}\n${kid}\n${zip}`);

/** Seals a run. meta is anything else that should travel sealed (the hiker's choices, how to reach them). */
export async function sealRun(run, publicKey, meta = {}) {
  const { key, kid } = await importPublicKey(publicKey);
  let plain = te.encode(JSON.stringify({ kind: 'trail-run', v: FORMAT, sealedAt: new Date().toISOString(), meta, run })), zip = 'none';
  if (typeof CompressionStream === 'function') { plain = await through(plain, new CompressionStream('deflate-raw'), LIMITS.plain); zip = 'deflate-raw'; }
  const aes = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const raw = new Uint8Array(await subtle.exportKey('raw', aes));
  const wrapped = new Uint8Array(await subtle.encrypt({ name: 'RSA-OAEP' }, key, raw)); raw.fill(0);
  const iv = random(12);
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: sealAad(kid, zip) }, aes, plain));
  const body = b64u(concat(new Uint8Array([wrapped.length >> 8, wrapped.length & 255]), wrapped, iv, sealed));
  return [BEGIN, `Version: ${FORMAT}`, `Alg: ${ALG}`, `Key: ${kid}`, `Zip: ${zip}`, '', ...body.match(/.{1,64}/g), END].join('\n');
}

/** Reads the outside of an envelope without opening it: { v, alg, kid, zip, bytes }. Throws on anything odd. */
export function readEnvelope(text) {
  if (typeof text !== 'string') fail('format', 'There is no sealed run here.');
  if (text.length > LIMITS.envelope) fail('size', 'That sealed run is larger than this page will read.');
  const a = text.indexOf(BEGIN), b = text.indexOf(END, a + 1);
  if (a < 0 || b < 0) fail('format', 'There is no sealed run here: the BEGIN and END lines are missing.');
  // tolerate what mail programs and GitHub do to text: CRLF, quote marks, trailing spaces
  const lines = text.slice(a + BEGIN.length, b).split(/\r?\n/).map((l) => l.replace(/^[>\s]+/, '').trim());
  const head = {}; let i = 0;
  while (i < lines.length && !lines[i]) i++;
  for (; i < lines.length && lines[i]; i++) { const m = /^([A-Za-z]+):\s*(\S+)$/.exec(lines[i]); if (!m) break; head[m[1].toLowerCase()] = m[2]; }
  const body = lines.slice(i).join('');
  if (head.version !== String(FORMAT)) fail('format', 'This sealed run is in a format this page does not know (version ' + String(head.version).slice(0, 8) + ').');
  if (head.alg !== ALG) fail('format', 'This sealed run uses a method this page does not know.');
  if (!/^[0-9a-f]{32}$/.test(head.key || '')) fail('format', 'This sealed run does not say which key it was sealed to.');
  if (head.zip !== 'none' && head.zip !== 'deflate-raw') fail('format', 'This sealed run is packed in a way this page does not know.');
  const bytes = unb64u(body);
  if (bytes.length < 2) fail('format', 'This sealed run is cut short.');
  const n = (bytes[0] << 8) | bytes[1];
  if (n < 256 || n > 1024 || bytes.length < 2 + n + 12 + 16) fail('format', 'This sealed run is cut short.');
  return { v: FORMAT, alg: head.alg, kid: head.key, zip: head.zip, wrapped: bytes.subarray(2, 2 + n), iv: bytes.subarray(2 + n, 14 + n), sealed: bytes.subarray(14 + n) };
}

/** Opens a sealed run with the private key. Returns { v, kid, sealedAt, meta, run }.
 *  opts.kid: the key id of the private key, to say "sealed to a different key" before trying. */
export async function openRun(envelope, privateKey, { kid } = {}) {
  const env = readEnvelope(envelope);
  if (kid && kid !== env.kid) fail('key', 'This run was sealed to a different key (' + env.kid.slice(0, 8) + '…), not the one in this browser.');
  let raw;
  try { raw = new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, env.wrapped)); }
  catch (e) { fail('key', 'This key does not open this run: it was sealed to another key, or it has been altered.'); }
  if (raw.length !== 32) fail('key', 'This key does not open this run.');
  const aes = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); raw.fill(0);
  let plain;
  try { plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: env.iv, additionalData: sealAad(env.kid, env.zip) }, aes, env.sealed)); }
  catch (e) { fail('tamper', 'This run has been altered since it was sealed, so it was not opened.'); }
  if (env.zip === 'deflate-raw') {
    if (typeof DecompressionStream !== 'function') fail('format', 'This browser cannot unpack sealed runs.');
    plain = await through(plain, new DecompressionStream('deflate-raw'), LIMITS.plain);
  }
  let obj; try { obj = JSON.parse(td.decode(plain)); } catch (e) { fail('format', 'The sealed run opened, but what is inside is not a run.'); }
  if (!obj || obj.kind !== 'trail-run' || typeof obj.run !== 'object' || obj.run === null) fail('format', 'The sealed run opened, but what is inside is not a run.');
  return { v: obj.v, kid: env.kid, sealedAt: typeof obj.sealedAt === 'string' ? obj.sealedAt : '', meta: obj.meta && typeof obj.meta === 'object' ? obj.meta : {}, run: obj.run };
}

/* ---------- what may be public ---------- */
const HANDLE = /^[A-Za-z0-9_.'-](?:[A-Za-z0-9 _.'-]{0,22}[A-Za-z0-9_.'-])$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const own = (o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const count = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
const tally = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function cleanHandle(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/ {2,}/g, ' ');
  return HANDLE.test(s) ? s : null;
}
function cleanDay(v) {
  if (typeof v !== 'string') return null;
  const m = DAY.exec(v); if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(t).toISOString().slice(0, 10) !== v) return null;                 // 2026-02-31 and the like
  return t >= Date.UTC(2025, 0, 1) && t <= Date.now() + 2 * 864e5 ? v : null;
}
/** A profile line as the hiker may type it, tidied: markup, control and direction characters and backticks removed. */
export function cleanLine(v) {
  if (typeof v !== 'string') return '';
  return clean(v, 2000).normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}<>`]/gu, ' ').replace(/(\p{M}{2})\p{M}+/gu, '$1').replace(/\s+/g, ' ').trim().slice(0, LIMITS.line).trim();
}
/* Manners for anything public. manners.js decides; this adds a few disguises it does not undo yet
 * (a web address spelled "name dot com" or "name . com", a rude word masked with a star or spelled
 * out letter by letter with an ending). They belong in manners.js; until they are there, public
 * text is held to them here, in the browser and in the register script alike. */
// "name . com", "name. io" (not "…basics. Me and…": a capital starts a sentence), "name,com", "name dot com", "name (dot) com", "name[.]com", "hxxp", "://"
const SPELLED_LINK = [/[A-Za-z0-9]\s*\.\s*(?:com|net|org|io|COM|NET|ORG|IO)\b/, /[a-z0-9],(?:com|net|org|io)\b/i, /\b(?:dot|d0t)\s+(?:com|net|org|io|co)\b/i, /[(\[{]\s*(?:\.|dot)\s*[)\]}]/i, /:\s*\/\s*\/|\bh(?:tt|xx)ps?\b/i];
function disguised(text) {
  const t = String(text || '');
  if (SPELLED_LINK.some((re) => re.test(t))) return 'promo';
  const unmasked = t.replace(/[*#~^_]+/g, ''), joined = t.replace(/\b(?:[A-Za-z0-9@$!][\s._*-]+){2,}[A-Za-z0-9@$!]\b/g, (m) => m.replace(/[\s._*-]+/g, ''));
  return rude(unmasked) || rude(joined) ? 'rude' : null;
}
/** Why a trail name may not be sent or shown, as a sentence, or null when it is fine. */
export function nameProblem(name) {
  const n = typeof name === 'string' ? name : '', d = checkName(n) || null;
  if (d) return d;
  const x = disguised(n);
  return x === 'rude' ? 'Luma would not answer to that. Pick a kinder name.' : x === 'promo' ? 'A trail name is a name, not an advert.' : null;
}
/** Why a public line may not be shown, as a sentence, or null when it is fine (an empty line is fine). */
export function lineProblem(line, max = LIMITS.line) {
  const t = typeof line === 'string' ? line : '', d = checkPublic(t, max) || null;
  if (d) return d;
  const x = disguised(clean(t, max));
  return x === 'rude' ? 'That is not how people talk on this trail. Say it kindly.' : x === 'promo' ? 'No links, handles or adverts here. This is not the place to promote anything.' : null;
}

/** The one validator. Takes anything at all (a hostile issue included) and returns
 *  { pub, why }: pub is a clean public object holding only the known fields, or null; why says
 *  which rule refused it ('shape', 'name' or 'line') and is null when pub is there.
 *  Manners (manners.js) are part of it: a rude or promotional trail name or line is not tidied
 *  up and let through, it refuses the whole thing. There are no links in a public part at all. */
export function inspectPublic(x) {
  const no = (why) => ({ pub: null, why });
  if (!x || typeof x !== 'object' || Array.isArray(x) || own(x, 'v') !== 1) return no('shape');
  const handle = cleanHandle(own(x, 'handle')); if (!handle) return no(typeof own(x, 'handle') === 'string' ? 'name' : 'shape');
  if (clean(handle, 24) !== handle || nameProblem(handle)) return no('name');
  const out = { v: 1, handle, camps: [], minutes: count(own(x, 'minutes'), 100000), hints: {}, flags: {} };
  const camps = own(x, 'camps'), seen = {};
  if (Array.isArray(camps)) for (const c of camps.slice(0, 16)) {
    const id = own(c, 'id'), done = cleanDay(own(c, 'done'));
    if (typeof id === 'string' && CAMP_IDS.includes(id) && done && !seen[id]) seen[id] = done;
  }
  for (const id of CAMP_IDS) if (seen[id]) out.camps.push({ id, done: seen[id] });
  const hints = own(x, 'hints');
  for (const id of CAMP_IDS) if (id !== PRIVATE_CAMP && seen[id] && Number.isInteger(own(hints, id))) out.hints[id] = count(own(hints, id), 999);
  const flags = own(x, 'flags');
  for (const k of ['quiet', 'longWay', 'shortestWay', 'oneSitting']) out.flags[k] = own(flags, k) === true;
  out.flags.restarts = count(own(flags, 'restarts'), 999);
  const profile = own(x, 'profile');
  if (profile != null) {
    if (typeof profile !== 'object' || Array.isArray(profile)) return no('shape');
    const line = own(profile, 'line');
    if (line !== undefined && line !== '') {
      // strict: a line that would need any tidying, or that is not polite, refuses the entry
      if (typeof line !== 'string' || line.length > LIMITS.line || clean(line, LIMITS.line) !== line || cleanLine(line) !== line || lineProblem(line)) return no('line');
      out.profile = { line };
    }
  }
  return { pub: out, why: null };
}
/** inspectPublic without the reason: the clean public object, or null. */
export const sanitizePublic = (x) => inspectPublic(x).pub;

/** What may be public about a run. Built field by field from an allow-list: nothing is copied
 *  wholesale and nothing free-typed in the run is read. About the Overlook it says only that the
 *  camp was reached and on which day; its time, hints and everything inside it are never touched.
 *  choices: { public, line }: the one line is added only when choices.public is true.
 *  Returns null when the trail name or the line would not be allowed in public (see inspectPublic). */
export function publicPart(run, choices = {}) {
  const camps = own(run, 'camps'), out = { v: 1, handle: own(run, 'handle'), camps: [], minutes: 0, hints: {}, flags: {} };
  let ms = 0, hints = 0, restarts = 0, counted = 0;
  for (const id of CAMP_IDS) {
    const camp = own(camps, id), done = own(camp, 'done');
    if (typeof done !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(done)) continue;
    out.camps.push({ id, done: done.slice(0, 10) });
    if (id === PRIVATE_CAMP) continue;                                            // reached, and that is all
    let here = 0; const parts = own(camp, 'parts');
    if (parts && typeof parts === 'object') for (const k of Object.keys(parts)) {
      const p = parts[k]; if (!p || typeof p !== 'object') continue;
      ms += tally(own(p, 'ms')); here += Math.max(tally(own(p, 'hints')), tally(own(p, 'asks')));   /* asks: every press of the button (newer runs); hints: how many different hints were given */ restarts += tally(own(p, 'resets')) + tally(own(p, 'retries'));
    }
    out.hints[id] = Math.round(here); hints += here; counted++;
  }
  out.minutes = ms ? Math.max(1, Math.round(ms / 60000)) : 0;
  const route = own(own(own(own(camps, 'trailhead'), 'parts'), 'route'), 'done') === true ? camps.trailhead.parts.route : null;
  const moves = tally(own(route, 'moves')), best = tally(own(route, 'best')), walked = out.hints.trailhead !== undefined && moves > 0 && best > 0;
  out.flags = {
    quiet: counted > 0 && hints === 0,
    longWay: walked && moves > best,
    shortestWay: walked && moves === best,
    oneSitting: out.camps.length > 1 && out.camps.every((c) => c.done === out.camps[0].done),
    restarts: Math.round(restarts),
  };
  if (own(choices, 'public') === true) {
    const line = cleanLine(own(choices, 'line')).slice(0, LIMITS.line).trim();
    if (line) out.profile = { line };
  }
  return sanitizePublic(out);
}

/* ---------- the issue ---------- */
export const MARK = {
  run: '<!-- trail-run v1 -->',
  publicBegin: '<!-- trail:public:begin -->', publicEnd: '<!-- trail:public:end -->',
  sealedBegin: '<!-- trail:sealed:begin -->', sealedEnd: '<!-- trail:sealed:end -->',
};

/** The text of the issue (and of the e-mail). The public block is there only when the hiker chose to be public. */
export function issueBody({ envelope, publicPart: pub, choices }) {
  const isPublic = !!(choices && choices.public === true && pub), clean = isPublic ? sanitizePublic(pub) : null;
  const lines = [MARK.run, 'A run of The Trail, sent from wemiller.com/trail/.', ''];
  if (clean) lines.push('**Public.** Anyone can read this part. It goes on the trail register.', MARK.publicBegin, '```json', JSON.stringify(clean), '```', MARK.publicEnd, '');
  else lines.push('**Nothing public.** This hiker did not ask to be on the register.', '');
  lines.push('**Sealed.** Only the keeper of the trail can open this part.', MARK.sealedBegin, '```', envelope, '```', MARK.sealedEnd);
  return lines.join('\n');
}

/** The public block of an issue body, validated, or null. It cuts the text off where the sealed
 *  part starts before looking at anything, so the sealed block is never read. */
export const readPublicBlock = (body) => inspectPublicBlock(body).pub;
/** The same with the reason: { pub, why } where why is null, 'none' (no public block), 'shape', 'name' or 'line'. */
export function inspectPublicBlock(body) {
  const no = (why) => ({ pub: null, why });
  if (typeof body !== 'string') return no('none');
  let s = body.slice(0, LIMITS.issueBody);
  for (const stop of [MARK.sealedBegin, BEGIN]) { const i = s.indexOf(stop); if (i >= 0) s = s.slice(0, i); }
  const a = s.indexOf(MARK.publicBegin); if (a < 0) return no('none'); if (s.indexOf(MARK.publicBegin, a + 1) >= 0) return no('shape');   // none, or more than one: not ours to guess
  const b = s.indexOf(MARK.publicEnd, a); if (b < 0) return no('shape');
  const inner = s.slice(a + MARK.publicBegin.length, b);
  if (inner.length > LIMITS.publicBlock) return no('shape');
  const m = /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(inner); if (!m) return no('shape');
  let obj; try { obj = JSON.parse(m[1]); } catch (e) { return no('shape'); }
  return inspectPublic(obj);
}

/** The sealed envelope inside an issue body or any other text, or null. For the desk only. */
export function readSealedBlock(text) {
  if (typeof text !== 'string') return null;
  const a = text.indexOf(BEGIN), b = text.indexOf(END, a + 1);
  return a >= 0 && b > a ? text.slice(a, b + END.length) : null;
}

/** Everything needed to send a run without a server.
 *  Returns { mode, url, title, body, copy, file, mailto }:
 *    mode 'prefilled': url opens a new issue with the whole body already in it.
 *    mode 'paste':     the body is too long for a link (GitHub refuses long addresses), so url opens
 *                      a nearly empty issue and `copy` is the text to put on the clipboard and paste.
 *    mode 'file':      the run is too long even for a GitHub issue; url is ''. Send the file by e-mail.
 *    file:   { name, text } to offer as a download.  mailto: an e-mail link, or '' without an address. */
export function buildIssueUrl({ repo, envelope, publicPart: pub, choices, email = '', maxUrl = LIMITS.url }) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(repo)) fail('config', 'The place to send runs is not set up yet.');
  if (!readSealedBlock(envelope)) fail('format', 'There is no sealed run to send.');
  const isPublic = !!(choices && choices.public === true && pub), clean = isPublic ? sanitizePublic(pub) : null;
  const title = clean ? `Trail run: ${clean.handle}` : 'Trail run (sealed)';
  const body = issueBody({ envelope, publicPart: clean, choices: { public: !!clean } });
  const base = `https://github.com/${repo}/issues/new`, q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const full = `${base}?${q({ title, labels: 'trail', body })}`;
  const file = { name: 'trail-run-sealed.txt', text: body + '\n' };
  let mailto = '';
  if (typeof email === 'string' && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,200}\.[A-Za-z]{2,24}$/.test(email)) {
    const withBody = `mailto:${email}?${q({ subject: title, body })}`;
    mailto = withBody.length <= LIMITS.mailto ? withBody
      : `mailto:${email}?${q({ subject: title, body: `My sealed trail run is attached (${file.name}).\n\n(If nothing is attached yet: on the trail page press "Save as a file", then attach that file to this e-mail.)` })}`;
  }
  // GitHub refuses an issue longer than 65,536 characters: such a run can only go as a file.
  if (body.length > LIMITS.githubBody) return { mode: 'file', url: '', title, body, copy: body, file, mailto };
  if (full.length <= maxUrl) return { mode: 'prefilled', url: full, title, body, copy: body, file, mailto };
  const stub = `${MARK.run}\nPaste your sealed run here (it is already copied: press Ctrl+V, or Cmd+V on a Mac), replacing these two lines.\nThen press "Create".`;
  return { mode: 'paste', url: `${base}?${q({ title, labels: 'trail', body: stub })}`, title, body, copy: body, file, mailto };
}

/* ---------- Shamir secret sharing over GF(256) ----------
 * The field is GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1. Each byte of the secret is
 * the constant term of its own random polynomial of degree threshold-1; share number x (1..n) is
 * that polynomial at x. Any `threshold` shares give the secret back; fewer give no information
 * about it at all. Arithmetic uses log tables, which is not constant-time: do the splitting and
 * combining on a device you trust. */
const EXP = new Uint8Array(510), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = EXP[i + 255] = x; LOG[x] = i; x ^= ((x << 1) ^ (x & 0x80 ? 0x11b : 0)) & 0xff; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a, b) => (a ? EXP[LOG[a] + 255 - LOG[b]] : 0);

/** Splits secret (Uint8Array) into `shares` pieces, any `threshold` of which give it back.
 *  Returns [{ x, y }] with x from 1 to shares and y a Uint8Array as long as the secret. */
export function split(secret, { shares = 4, threshold = 3 } = {}) {
  if (!(secret instanceof Uint8Array) || !secret.length) fail('shares', 'There is nothing to split.');
  if (!Number.isInteger(shares) || !Number.isInteger(threshold) || threshold < 2 || threshold > shares || shares > 255) fail('shares', 'Choose between 2 and 255 shares, and a threshold from 2 up to that number.');
  const out = Array.from({ length: shares }, (_, i) => ({ x: i + 1, y: new Uint8Array(secret.length) }));
  const coef = new Uint8Array(threshold);
  for (let b = 0; b < secret.length; b++) {
    coef.set(random(threshold)); coef[0] = secret[b];                             // constant term is the secret; the rest is fresh randomness
    for (const s of out) { let y = 0; for (let k = threshold - 1; k >= 0; k--) y = mul(y, s.x) ^ coef[k]; s.y[b] = y; }   // Horner
  }
  coef.fill(0);
  return out;
}

/** Puts shares back together (Lagrange interpolation at zero). It cannot know the threshold:
 *  given too few shares it returns bytes that are simply wrong. combineShares() checks the count. */
export function combine(shares) {
  if (!Array.isArray(shares) || shares.length < 2) fail('shares', 'At least two shares are needed.');
  const len = shares[0] && shares[0].y ? shares[0].y.length : 0, xs = new Set();
  for (const s of shares) {
    if (!s || !Number.isInteger(s.x) || s.x < 1 || s.x > 255 || !(s.y instanceof Uint8Array) || s.y.length !== len || !len) fail('shares', 'One of the shares is not a share.');
    if (xs.has(s.x)) fail('shares', 'The same share was given twice.');
    xs.add(s.x);
  }
  const out = new Uint8Array(len);
  for (let j = 0; j < shares.length; j++) {
    let l = 1;
    for (let m = 0; m < shares.length; m++) if (m !== j) l = mul(l, div(shares[m].x, shares[m].x ^ shares[j].x));
    for (let b = 0; b < len; b++) out[b] ^= mul(shares[j].y[b], l);
  }
  return out;
}

/* A share as text someone can keep on paper and type back in:
 *   TRAIL-SHARE-1-<set, 8 hex>-<threshold>OF<shares>-<number>-<the share in hex>-<check, 8 hex>
 * The set says which split a share belongs to; the check catches typing mistakes. */
const CRC = new Uint32Array(256).map((_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n; });
const crc32 = (s) => { let c = ~0; for (let i = 0; i < s.length; i++) c = CRC[(c ^ s.charCodeAt(i)) & 255] ^ (c >>> 8); return ((~c) >>> 0).toString(16).padStart(8, '0'); };

export function encodeShare({ x, y }, { set, threshold, shares }) {
  const head = `TRAIL-SHARE-1-${set}-${threshold}OF${shares}-${x}-${hex(y)}`.toUpperCase();
  return `${head}-${crc32(head).toUpperCase()}`;
}
export function decodeShare(text) {
  const s = String(text || '').replace(/\s+/g, '').replace(/[‐-―−]/g, '-').toUpperCase();
  const m = /^TRAIL-SHARE-1-([0-9A-F]{8})-(\d{1,3})OF(\d{1,3})-(\d{1,3})-((?:[0-9A-F]{2})+)-([0-9A-F]{8})$/.exec(s);
  if (!m) fail('shares', 'That does not look like a share. A share starts with TRAIL-SHARE-1.');
  if (crc32(s.slice(0, s.length - 9)).toUpperCase() !== m[6]) fail('shares', 'That share has a typing mistake in it somewhere: its check letters do not match.');
  const threshold = +m[2], shares = +m[3], x = +m[4];
  if (threshold < 2 || threshold > shares || shares > 255 || x < 1 || x > shares) fail('shares', 'That share is not a share.');
  return { set: m[1].toLowerCase(), threshold, shares, x, y: unhex(m[5]) };
}

/** Splits a secret and returns the shares as text, with the set id they carry. */
export function splitToShares(secret, { shares = 4, threshold = 3 } = {}) {
  const set = hex(random(4));
  return { set, threshold, shares, texts: split(secret, { shares, threshold }).map((s) => encodeShare(s, { set, threshold, shares })) };
}
/** Combines shares given as text. Refuses when there are too few, or when they come from different splits. */
export function combineShares(texts) {
  const parts = texts.map(decodeShare), first = parts[0];
  if (!first) fail('shares', 'No shares were given.');
  if (parts.some((p) => p.set !== first.set || p.threshold !== first.threshold || p.shares !== first.shares || p.y.length !== first.y.length)) fail('shares', 'These shares are not from the same set.');
  if (new Set(parts.map((p) => p.x)).size !== parts.length) fail('shares', 'The same share was given twice.');
  if (parts.length < first.threshold) fail('shares', `This set needs ${first.threshold} different shares; ${parts.length} ${parts.length === 1 ? 'was' : 'were'} given.`);
  return { set: first.set, secret: combine(parts.slice(0, first.threshold)) };
}
