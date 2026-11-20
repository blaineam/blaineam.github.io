#!/usr/bin/env node
/* Contingency plan: the daily run. Reads the heartbeat and any replies, decides (plan.mjs),
 * sends the letters (mail.mjs), remembers where things stand, and flips the site when enough
 * of the trusted people have confirmed.
 *
 *   node scripts/contingency/notify.mjs --ci            what the workflow runs
 *   node scripts/contingency/notify.mjs --drill         send every letter to the owner only, as a rehearsal
 *   node scripts/contingency/notify.mjs --explain --last 2026-08-01 --today 2026-11-20
 *                                                       say what would happen; sends and writes nothing
 *
 * It needs (as secrets in the workflow, as environment variables anywhere else):
 *   LAST_HEARTBEAT       the date the phone last checked in (a repository variable)
 *   CONTINGENCY_KEY      a long random secret: the codes come from it and the state is sealed with it
 *   CONTINGENCY_PEOPLE   JSON: { "owner": { "name", "email" }, "people": [{ "id", "name", "email" }] }
 *   CONTINGENCY_MAIL     JSON: { "from": "Name <addr>", "smtp": { host, port, user, pass, secure }, "imap": { host, port, user, pass } }
 *
 * This repository and its logs are public. Nothing here prints a name, an address, a date or a
 * stage. What it remembers is kept in contingency/state.enc, sealed with CONTINGENCY_KEY and
 * rewritten every day whether or not anything changed, so the file's history says nothing. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { step, emptyState, letter, DEFAULTS, LETTERS } from './plan.mjs';
import { send, inbox } from './mail.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2), arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const CI = argv.includes('--ci'), DRILL = argv.includes('--drill'), EXPLAIN = argv.includes('--explain');
const STATE = path.join(ROOT, 'contingency', 'state.enc'), SITE = path.join(ROOT, 'content', 'site.json');

/* ---------- what is remembered, sealed ---------- */
const keyBytes = (key) => crypto.createHash('sha256').update('contingency-state|' + key).digest();
export function seal(state, key) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyBytes(key), iv);
  // padded to a fixed size, so the file's length says nothing either
  const plain = Buffer.alloc(4096, 0x20); Buffer.from(JSON.stringify(state)).copy(plain);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64').replace(/.{76}/g, '$&\n') + '\n';
}
export function unseal(text, key) {
  const raw = Buffer.from(String(text).replace(/\s+/g, ''), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', keyBytes(key), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8').trim());
}

/* ---------- the site's switch ---------- */
export function setSiteState(text, state, today) {
  const site = JSON.parse(text), now = (site.contingency || {}).state || 'normal';
  if (now === state) return null;
  // edit the one line in place, so the file's own formatting and comments-as-keys are untouched
  const out = text.replace(/("contingency"\s*:\s*\{[^}]*?"state"\s*:\s*")[^"]*(")/, `$1${state}$2`);
  if (out === text) throw new Error('content/site.json has no contingency.state to set');
  return state === 'contingency' && !/"since"\s*:/.test(out) ? out.replace(/("contingency"\s*:\s*\{)/, `$1 "since": "${today}",`) : out;
}

async function main() {
  const today = arg('--today') || new Date().toISOString().slice(0, 10), last = (arg('--last') ?? process.env.LAST_HEARTBEAT ?? '').trim();
  const site = JSON.parse(fs.readFileSync(SITE, 'utf8')), cfg = { ...DEFAULTS, ...(site.contingency || {}) };
  const key = process.env.CONTINGENCY_KEY || (EXPLAIN ? 'explain-only' : '');
  let who = { owner: {}, people: [] }, mail = null;
  try { who = JSON.parse(process.env.CONTINGENCY_PEOPLE || '{"owner":{},"people":[]}'); } catch (e) { throw new Error('CONTINGENCY_PEOPLE is not valid JSON'); }
  try { mail = process.env.CONTINGENCY_MAIL ? JSON.parse(process.env.CONTINGENCY_MAIL) : null; } catch (e) { throw new Error('CONTINGENCY_MAIL is not valid JSON'); }

  if (EXPLAIN) {
    const r = step(emptyState(), { today, last, cfg, people: who.people.length ? who.people : [{ id: 'a', name: 'A', email: 'a@example.invalid' }], owner: who.owner.email ? who.owner : { name: 'Owner', email: 'owner@example.invalid' }, key });
    console.log(`last heartbeat   ${last || '(none on record)'}\ntoday            ${today}\nsilence          ${r.days ?? 'unknown'} day(s)\nstage            ${r.stage}`);
    console.log(`thresholds       owner nudged at ${cfg.ownerNudgeDays.join(', ')}; people told at ${cfg.quietDays}; asked to confirm at ${cfg.publicDays}; ${cfg.confirmationsNeeded} must agree`);
    console.log(`letters today    ${r.outbox.length ? r.outbox.map((m) => m.kind).join(', ') : 'none'} (from a blank memory; a real run sends each once)`);
    console.log('\nNothing was sent and nothing was written.');
    return;
  }
  if (!key) { console.log('Contingency run skipped: not set up yet.'); return; }
  if (DRILL) {
    if (!mail || !who.owner.email) throw new Error('A drill needs CONTINGENCY_MAIL and an owner address in CONTINGENCY_PEOPLE');
    for (const kind of Object.keys(LETTERS)) {
      const m = letter(kind, { name: who.owner.name, owner: who.owner.name, days: 90, left: 3, until: 'a fortnight from now', by: 'One of them', have: 2, need: cfg.confirmationsNeeded, code: 'DRILL-CODE1', wait: 'DRILL-WAIT1', today });
      await send(mail.smtp, { from: mail.from, to: who.owner.email, subject: '[Drill] ' + m.subject, text: 'This is a rehearsal. Nobody else received it.\n\n' + m.text });
    }
    console.log('Drill finished.'); return;
  }

  let state = emptyState();
  if (fs.existsSync(STATE)) { try { state = unseal(fs.readFileSync(STATE, 'utf8'), key); } catch (e) { throw new Error('The remembered state could not be opened with CONTINGENCY_KEY'); } }
  let replies = [], mailDown = false;
  if (mail && mail.imap) { try { replies = await inbox(mail.imap, state.lastUid || 0, [who.owner.email, ...who.people.map((p) => p.email)].filter(Boolean)); } catch (e) { mailDown = true; } }
  const r = step(state, { today, last, cfg, people: who.people, owner: who.owner, replies, key });

  let failed = 0;
  for (const m of r.outbox) {
    if (!mail) { failed++; continue; }
    const l = letter(m.kind, m.vars);
    try { await send(mail.smtp, { from: mail.from, to: m.to, subject: l.subject, text: l.text }); } catch (e) { failed++; }
  }
  // If the letters could not go out, do not remember having sent them: tomorrow tries again.
  const keep = failed ? { ...state, lastUid: state.lastUid } : r.state;
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, seal(keep, key));
  if (r.site && !failed) { const text = fs.readFileSync(SITE, 'utf8'), out = setSiteState(text, r.site, today); if (out) fs.writeFileSync(SITE, out); }
  // The only thing a public log ever says:
  console.log(failed || mailDown ? 'Contingency run finished with a mail problem.' : 'Contingency run finished.');
  if (CI && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `site_changed=${r.site && !failed ? 'yes' : 'no'}\n`);
  if (failed || mailDown) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.log('Contingency run failed: ' + e.message); process.exit(1); });
