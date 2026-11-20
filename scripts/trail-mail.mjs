#!/usr/bin/env node
/* The Trail: collect the runs that people sent by e-mail and file them beside the others.
 *
 *   node scripts/trail-mail.mjs --ci        read the mailbox, file new sealed runs as issues, print counts
 *   node scripts/trail-mail.mjs --dry       the same, but file nothing: say what would happen
 *
 * A hiker without a GitHub account sends their sealed run to the address in trail/config.json.
 * This looks in that mailbox for messages that carry a sealed run, checks each one is whole and
 * was sealed to this trail's key, and opens a GitHub issue with exactly the text the "Open GitHub"
 * route would have produced. From there the reading desk and the register treat it like any other.
 *
 * What it never does:
 *   - open a run. It has no key; the sealed part is copied as it is.
 *   - copy anything else from the message. Not the sender's address, name, subject or signature:
 *     an issue is public. The sender is represented only by a tag (a keyed hash of their address)
 *     so that the register can tell two senders apart and one sender's newest run replaces the old.
 *   - change the mailbox. Messages are read, not marked, moved or deleted. The Trash folder is read
 *     as well as the inbox, because a rule that forwards mail on and deletes the copy leaves runs there. What has been filed is
 *     known from the issues themselves (each carries the run's own fingerprint).
 *   - print anything but counts. This repository's logs are public.
 *
 * A message from someone who already has a run on file, saying only "remove me" (or "restore me"),
 * is passed on as that comment on their issue, which is how anyone leaves the register.
 *
 * Needs: GITHUB_REPOSITORY, GITHUB_TOKEN (issues: write), TRAIL_MAIL or CONTINGENCY_MAIL (JSON with
 * an "imap" block, as in docs/CONTINGENCY.md) and TRAIL_MAIL_KEY or CONTINGENCY_KEY (for the tags). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvelope, readSealedBlock, inspectPublicBlock, issueBody, BEGIN, END, LIMITS } from '../trail/seal.js';
import { inbox } from './contingency/mail.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_NEW = 10, MAX_EACH = 2, DAYS = 30;
const MAIL_MARK = /<!-- trail:mail ([0-9a-f]{16}) ([0-9a-f]{12}) -->/;
const REMOVE = /^\s*(?:\/trail\s+)?remove\s+me\s*[.!]?\s*$/i, RESTORE = /^\s*(?:\/trail\s+)?restore\s+me\s*[.!]?\s*$/i;

const address = (from) => { const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) || /([^\s<>"]+@[^\s<>"]+)/.exec(from); return m ? m[1].toLowerCase() : ''; };
export const tagFor = (key, from) => crypto.createHmac('sha256', 'trail-mail|' + key).update(address(from)).digest('hex').slice(0, 12);

/** The sealed run in a message, put back the way it was sealed (mail programs quote, wrap and indent), or null. */
export function envelopeIn(text) {
  const raw = readSealedBlock(text); if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^[>\s]+/, '').trim()).filter(Boolean);
  if (lines[0] !== BEGIN || lines[lines.length - 1] !== END) return null;
  const head = [], body = []; let inBody = false;
  for (const l of lines.slice(1, -1)) { if (!inBody && /^[A-Za-z]+:\s*\S+$/.test(l)) head.push(l); else { inBody = true; body.push(l); } }
  const packed = body.join(''); if (!/^[A-Za-z0-9_-]+$/.test(packed)) return null;
  const clean = [BEGIN, ...head, '', ...(packed.match(/.{1,76}/g) || []), END].join('\n');
  try { const e = readEnvelope(clean); return { text: clean, kid: e.kid, id: crypto.createHash('sha256').update(packed).digest('hex').slice(0, 16) }; } catch (e) { return null; }
}
/** What a person typed themselves: the message without quoted lines and without what follows a signature or a reply header. */
const typed = (text) => { const out = []; for (const l of String(text).split(/\r?\n/)) { if (/^\s*>/.test(l)) continue; if (/^--\s*$/.test(l) || /^On .{4,80} wrote:\s*$/.test(l) || /^_{5,}/.test(l)) break; out.push(l); } return out.join('\n').replace(/<[^>]+>/g, ' ').trim(); };

/** Decide what to do. Pure: no network.
 *  messages: [{ from, subject, text }]; issues: GitHub issues (with .comments folded in or not);
 *  Returns { create: [{ title, body, labels }], say: [{ number, body }], stats }. */
export function plan(messages, issues, { keyId, key, maxNew = MAX_NEW, maxEach = MAX_EACH } = {}) {
  const stats = { messages: 0, runs: 0, filed: 0, alreadyFiled: 0, otherKey: 0, unreadable: 0, tooLong: 0, heldBack: 0, wishes: 0 };
  const filed = new Set(), latestOf = new Map();
  for (const i of Array.isArray(issues) ? issues : []) {
    const m = i && i.user && i.user.type === 'Bot' && typeof i.body === 'string' ? MAIL_MARK.exec(i.body) : null; if (!m) continue;
    filed.add(m[1]); if (!latestOf.has(m[2]) || latestOf.get(m[2]).number < i.number) latestOf.set(m[2], i);
  }
  const create = [], say = [], perSender = new Map();
  for (const msg of Array.isArray(messages) ? messages : []) {
    stats.messages++;
    const who = address(msg.from || ''); if (!who) continue;
    const tag = tagFor(key, msg.from), text = String(msg.text || '');
    if (!text.includes(BEGIN)) {
      // not a run: perhaps their word about the register
      const words = typed(text), wish = REMOVE.test(words) ? 'remove me' : RESTORE.test(words) ? 'restore me' : '', issue = latestOf.get(tag);
      if (wish && issue) {
        const last = (Array.isArray(issue.comments) ? issue.comments : []).filter((c) => c && c.user && c.user.type === 'Bot' && (REMOVE.test(c.body || '') || RESTORE.test(c.body || ''))).pop();
        if (!last || !new RegExp('^' + wish, 'i').test(last.body.trim())) { say.push({ number: issue.number, body: wish }); stats.wishes++; }
      }
      continue;
    }
    const env = envelopeIn(text); if (!env) { stats.unreadable++; continue; }
    stats.runs++;
    if (keyId && env.kid !== keyId) { stats.otherKey++; continue; }
    if (filed.has(env.id)) { stats.alreadyFiled++; continue; }
    const pub = inspectPublicBlock(text).pub;                                 // validated field by field, or null
    const body = issueBody({ envelope: env.text, publicPart: pub, choices: { public: !!pub } }) + `\n\nArrived by e-mail.\n<!-- trail:mail ${env.id} ${tag} -->`;
    if (body.length > LIMITS.githubBody) { stats.tooLong++; continue; }
    const n = perSender.get(tag) || 0;
    if (create.length >= maxNew || n >= maxEach) { stats.heldBack++; continue; }
    perSender.set(tag, n + 1); filed.add(env.id);
    create.push({ title: pub ? `Trail run: ${pub.handle}` : 'Trail run (sealed)', body, labels: ['trail', 'trail-mail'] });
  }
  stats.filed = create.length;
  return { create, say, stats };
}

/* ---------- the workflow's side ---------- */
async function github(repo, token) {
  const api = `https://api.github.com/repos/${repo}`, headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trail-mail', Authorization: `Bearer ${token}` };
  const call = async (url, init) => { const res = await fetch(url, { ...init, headers: { ...headers, ...(init && init.body ? { 'Content-Type': 'application/json' } : {}) } }); if (!res.ok) throw new Error(`GitHub answered ${res.status}.`); return res.json(); };
  const pages = async (base) => { const all = []; for (let p = 1; p <= 100; p++) { const got = await call(`${base}&per_page=100&page=${p}`); if (!Array.isArray(got) || !got.length) break; all.push(...got); if (got.length < 100) break; } return all; };
  return {
    issues: async () => {
      const issues = (await pages(`${api}/issues?state=all&labels=trail-mail&sort=created&direction=asc`)).filter((i) => !i.pull_request);
      for (const i of issues) i.comments = i.comments > 0 ? await pages(`${api}/issues/${i.number}/comments?sort=created`) : [];
      return issues;
    },
    create: (issue) => call(`${api}/issues`, { method: 'POST', body: JSON.stringify(issue) }),
    comment: (number, body) => call(`${api}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  };
}

async function main(argv) {
  const dry = argv.includes('--dry');
  if (!dry && !argv.includes('--ci')) { console.log('Usage: node scripts/trail-mail.mjs --ci | --dry'); return 2; }
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'trail', 'config.json'), 'utf8'));
  const key = process.env.TRAIL_MAIL_KEY || process.env.CONTINGENCY_KEY || '', repo = process.env.GITHUB_REPOSITORY || '', token = process.env.GITHUB_TOKEN || '';
  let mail = null; try { mail = JSON.parse(process.env.TRAIL_MAIL || process.env.CONTINGENCY_MAIL || 'null'); } catch (e) { throw new Error('The mail settings are not valid JSON.'); }
  if (!cfg.keyId || !mail || !mail.imap || !key) { console.log('Trail mail skipped: not set up yet.'); return 0; }
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed.');

  const since = new Date(Date.now() - DAYS * 864e5), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][since.getUTCMonth()];
  // messages of the last month that look like a run, or like someone's word about the register
  const query = `SINCE ${since.getUTCDate()}-${mon}-${since.getUTCFullYear()} OR OR SUBJECT "Trail run" BODY "TRAIL RUN" OR BODY "remove me" BODY "restore me"`;
  const messages = await inbox(mail.imap, 0, [], { query, bytes: 3_000_000 });
  const gh = await github(repo, token), { create, say, stats } = plan(messages, await gh.issues(), { keyId: cfg.keyId, key });
  let failed = 0;
  if (!dry) {
    for (const issue of create) { try { await gh.create(issue); } catch (e) { failed++; } }
    for (const c of say) { try { await gh.comment(c.number, c.body); } catch (e) { failed++; } }
  }
  const line = `Messages looked at: ${stats.messages}; sealed runs found: ${stats.runs}; ${dry ? 'would file' : 'filed'}: ${stats.filed - (dry ? 0 : failed)}; already filed: ${stats.alreadyFiled}; sealed to another key: ${stats.otherKey}; not readable: ${stats.unreadable}; too long for an issue: ${stats.tooLong}; held back for the next run: ${stats.heldBack}; register wishes passed on: ${stats.wishes}.`;
  console.log('trail mail: ' + line);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${!dry && (create.length || say.length) && failed < create.length + say.length ? 'yes' : 'no'}\n`);
  return failed ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.log('trail mail failed: ' + (e && e.message ? e.message : 'unknown')); process.exitCode = 1; });
}
