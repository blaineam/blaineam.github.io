#!/usr/bin/env node
/* The Trail: builds the public register from trail issues.
 *
 *   node scripts/trail-register.mjs --ci                      read the issues of $GITHUB_REPOSITORY, write trail/*.json
 *   node scripts/trail-register.mjs --local <folder>          read sample issues (*.json) from a folder instead
 *                                   [--out <folder>]          where to write register.json and lights.json (default: trail/)
 *                                   [--config <file>]         moderation settings (default: trail/config.json)
 *
 * Every issue is treated as hostile. Only the public block of an issue is looked at, and it goes
 * through the same strict validator the site uses (inspectPublic in trail/seal.js): known fields
 * only, short lengths, an allow-list of characters for trail names, no links, no HTML. The text
 * is cut off where the sealed block begins before anything is parsed, so the sealed part is
 * never read. About the Overlook the validator keeps only that it was reached.
 *
 * Manners (trail/manners.js) are applied here again, because a browser's checks can be skipped:
 * the trail name must pass checkName and the one line must pass checkPublic, both looked at
 * after clean() has removed markup and invisible characters. An entry that fails is dropped,
 * not tidied up and published. Why is kept only as a count.
 *
 * Who is listed:
 *   - Nobody, until a person has read the entry: the issue must carry the approval label
 *     ("trail:approved" unless trail/config.json says otherwise), which only people with write
 *     access to the repository can add. A word list cannot catch crude humour; a reader can.
 *     (moderation.required: false in trail/config.json turns this off.)
 *   - One entry for each GitHub account: the newest trail issue from that account decides. No
 *     public block in it (or an invalid one, or no approval on it) means no entry.
 *   - The author can leave without anyone's help: a comment on that issue saying only "remove me"
 *     takes the entry out ("restore me" puts it back; the latest of the two counts).
 *   - The label "trail-remove" on any of an account's trail issues takes that account out
 *     (only people with write access can label). "trail-checked" marks an entry as read.
 *
 * Tidying up: once a person has dealt with a trail issue (it carries the approval label,
 * "trail-checked" or "trail-remove"), --ci closes it, so the open issues are the ones nobody has
 * read yet. Closing changes nothing else: closed issues are read exactly like open ones, the
 * sealed run stays where it is, and the hiker's "remove me" still works.
 *   - Trail names are not verified. When two accounts use the same name, the one whose claim is
 *     older (the lowest issue number carrying that name) keeps it bare; later ones get n: 2, 3…
 *
 * The output has no dates of its own and is sorted in a fixed order, so running it twice on the
 * same issues writes the same bytes. The log and the job summary print counts only: no names, no
 * text from issues, and never the words that got an entry refused.
 *
 * A sample issue file for --local looks like GitHub's own JSON, with comments folded in:
 *   { "number": 7, "user": { "id": 123, "login": "someone" }, "labels": [{ "name": "trail" }],
 *     "title": "Trail run: Robin", "body": "...", "comments": [{ "user": { "id": 123 }, "body": "remove me", "created_at": "2026-01-01T00:00:00Z" }] }
 */
import { readFile, writeFile, readdir, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectPublicBlock, MARK, CAMP_IDS, LIMITS } from '../trail/seal.js';
import { clean, checkName, checkPublic } from '../trail/manners.js';

export const APPROVAL_LABEL = 'trail:approved';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 70000;                      // GitHub's own limit is 65,536 characters; anything longer is not a real issue
const REMOVE = /^\s*(?:\/trail\s+)?remove\s+me\s*[.!]?\s*$/i, RESTORE = /^\s*(?:\/trail\s+)?restore\s+me\s*[.!]?\s*$/i;

const int = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const labelsOf = (issue) => (Array.isArray(issue.labels) ? issue.labels.map((l) => (typeof l === 'string' ? l : l && typeof l.name === 'string' ? l.name : '')).filter(Boolean) : []);

/** The public block of one issue body: { pub, why }. why is null, 'none', 'shape', 'name' or 'line'.
 *  seal.js has already refused anything that fails the manners; they are asked once more here, on
 *  the cleaned text, so that this script does not depend on that staying true. */
export function readEntry(body) {
  const got = inspectPublicBlock(body); if (!got.pub) return got;
  const name = clean(got.pub.handle, 24), line = got.pub.profile ? clean(got.pub.profile.line, LIMITS.line) : '';
  if (name !== got.pub.handle || checkName(name)) return { pub: null, why: 'name' };
  if (line !== (got.pub.profile ? got.pub.profile.line : '') || (line && checkPublic(line, LIMITS.line))) return { pub: null, why: 'line' };
  return got;
}

/** issues: an array of GitHub issue objects, each optionally with .comments. Pure: no network, no files.
 *  opts: { requireApproval = true, approvalLabel = 'trail:approved' }. */
export function buildRegister(issues, { requireApproval = true, approvalLabel = APPROVAL_LABEL } = {}) {
  const stats = { issues: 0, trail: 0, accounts: 0, entries: 0, waiting: 0, removedByAuthor: 0, removedByLabel: 0, noPublicBlock: 0, refusedName: 0, refusedLine: 0, refusedShape: 0, sharedNames: 0 };
  const byAuthor = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (!issue || typeof issue !== 'object' || issue.pull_request) continue;
    stats.issues++;
    const number = int(issue.number), authorId = int(issue.user && issue.user.id);
    if (!number || !authorId) continue;
    const body = typeof issue.body === 'string' && issue.body.length <= MAX_BODY ? issue.body : '';
    // A run that came by e-mail is filed by the workflow's own bot (scripts/trail-mail.mjs) with a tag that stands
    // for the sender, so each sender is their own "account". The tag is only believed on an issue the bot wrote.
    const mail = issue.user.type === 'Bot' && issue.user.login === 'github-actions[bot]' ? /<!-- trail:mail [0-9a-f]{16} ([0-9a-f]{12}) -->/.exec(body) : null;
    const author = mail ? 'mail:' + mail[1] : authorId;
    const labels = labelsOf(issue);
    if (!labels.includes('trail') && !body.slice(0, LIMITS.issueBody).includes(MARK.run)) continue;
    stats.trail++;
    // The author's own word, latest first to speak wins. Other people's comments are ignored.
    let removed = false;
    const said = (Array.isArray(issue.comments) ? issue.comments : [])
      .filter((c) => c && int(c.user && c.user.id) === authorId && typeof c.body === 'string' && c.body.length < 200)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || int(a.id) - int(b.id));
    for (const c of said) { if (REMOVE.test(c.body)) removed = true; else if (RESTORE.test(c.body)) removed = false; }
    const row = { number, ...readEntry(body), removed, banned: labels.includes('trail-remove'), checked: labels.includes('trail-checked'), approved: labels.includes(approvalLabel) };
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author).push(row);
  }
  stats.accounts = byAuthor.size;

  const picked = [];
  for (const rows of byAuthor.values()) {
    rows.sort((a, b) => b.number - a.number);
    const latest = rows[0];
    if (rows.some((r) => r.banned)) { stats.removedByLabel++; continue; }
    if (latest.removed) { stats.removedByAuthor++; continue; }
    if (!latest.pub) { stats[latest.why === 'name' ? 'refusedName' : latest.why === 'line' ? 'refusedLine' : latest.why === 'shape' ? 'refusedShape' : 'noPublicBlock']++; continue; }
    if (!latest.pub.camps.length) { stats.noPublicBlock++; continue; }
    if (requireApproval && !latest.approved) { stats.waiting++; continue; }          // not read by a person yet: not public
    const key = latest.pub.handle.toLowerCase();
    const claim = Math.min(...rows.filter((r) => r.pub && r.pub.handle.toLowerCase() === key).map((r) => r.number));
    picked.push({ key, claim, pub: latest.pub, checked: latest.checked });
  }
  picked.sort((a, b) => a.claim - b.claim);

  const seen = new Map(), entries = [], lights = [];
  for (const p of picked) {
    const n = (seen.get(p.key) || 0) + 1; seen.set(p.key, n); if (n === 2) stats.sharedNames++;
    const { handle, camps, minutes, hints, flags, profile } = p.pub;
    entries.push({ handle, ...(n > 1 ? { n } : {}), camps, minutes, hints, flags, ...(profile ? { profile: { line: profile.line } } : {}), ...(p.checked ? { checked: true } : {}) });
    const furthest = CAMP_IDS.filter((id) => camps.some((c) => c.id === id)).pop();
    lights.push({ handle, ...(n > 1 ? { n } : {}), camp: furthest });
  }
  stats.entries = entries.length;
  return {
    register: { v: 1, note: 'Self-reported by hikers who asked to be listed. Written by scripts/trail-register.mjs; do not edit by hand.', entries },
    lights: { v: 1, lights },
    stats,
  };
}

/* ---------- reading issues ---------- */
async function fromFolder(dir) {
  const out = [];
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    try { const data = JSON.parse(await readFile(path.join(dir, name), 'utf8')); out.push(...(Array.isArray(data) ? data : [data])); }
    catch (e) { /* a file that is not JSON is not an issue */ }
  }
  return out;
}

async function fromGitHub(repo, token) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) throw new Error('GITHUB_REPOSITORY is not set.');
  const get = async (url) => {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trail-register', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);                // the status only: never the response text
    return res.json();
  };
  const pages = async (base) => { const all = []; for (let page = 1; page <= 200; page++) { const got = await get(`${base}&per_page=100&page=${page}`); if (!Array.isArray(got) || !got.length) break; all.push(...got); if (got.length < 100) break; } return all; };
  const api = `https://api.github.com/repos/${repo}`;
  const issues = (await pages(`${api}/issues?state=all&sort=created&direction=asc`)).filter((i) => !i.pull_request);
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  for (const c of await pages(`${api}/issues/comments?sort=created&direction=asc`)) {
    const m = /\/issues\/(\d+)$/.exec(String(c.issue_url || '')), issue = m && byNumber.get(+m[1]);
    if (issue) (issue.comments = Array.isArray(issue.comments) ? issue.comments : []).push({ id: c.id, user: c.user, body: c.body, created_at: c.created_at });
  }
  return issues;
}

async function writeIfChanged(file, obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  let old = null; try { old = await readFile(file, 'utf8'); } catch (e) { /* new file */ }
  if (old === text) return false;
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return true;
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const local = arg('--local'), out = path.resolve(arg('--out') || path.join(ROOT, 'trail'));
  if (!local && !argv.includes('--ci')) { console.log('Usage: node scripts/trail-register.mjs --ci | --local <folder> [--out <folder>] [--config <file>]'); return 2; }
  // moderation settings: trail/config.json, on unless it plainly says otherwise
  let requireApproval = true, approvalLabel = APPROVAL_LABEL;
  try {
    const m = JSON.parse(await readFile(arg('--config') || path.join(ROOT, 'trail', 'config.json'), 'utf8')).moderation;
    if (m && m.required === false) requireApproval = false;
    if (m && typeof m.approvalLabel === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_ .-]{0,48}$/.test(m.approvalLabel)) approvalLabel = m.approvalLabel;
  } catch (e) { /* no config: the safe defaults stand */ }
  const issues = local ? await fromFolder(path.resolve(local)) : await fromGitHub(process.env.GITHUB_REPOSITORY, process.env.GITHUB_TOKEN);
  const { register, lights, stats } = buildRegister(issues, { requireApproval, approvalLabel });
  const a = await writeIfChanged(path.join(out, 'register.json'), register), b = await writeIfChanged(path.join(out, 'lights.json'), lights);
  let closed = 0;
  if (!local && process.env.GITHUB_TOKEN) for (const issue of issues) {
    const labels = labelsOf(issue), body = typeof issue.body === 'string' ? issue.body : '';
    if (issue.state !== 'open' || !Number.isInteger(issue.number)) continue;
    if (!labels.includes('trail') && !body.slice(0, LIMITS.issueBody).includes(MARK.run)) continue;
    if (!labels.includes(approvalLabel) && !labels.includes('trail-checked') && !labels.includes('trail-remove')) continue;
    try {
      const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/issues/${issue.number}`, { method: 'PATCH', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'trail-register', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
      if (res.ok) closed++;
    } catch (e) { /* tidying is a nicety: the register itself is already written */ }
  }
  const rows = [['Issues read', stats.issues], ['Trail issues', stats.trail], ['Accounts', stats.accounts], ['Listed', stats.entries],
    [requireApproval ? 'Waiting to be read and approved' : 'Approval not required', requireApproval ? stats.waiting : '–'],
    ['Left by their own word', stats.removedByAuthor], ['Removed by label', stats.removedByLabel], ['Nothing public', stats.noPublicBlock],
    ['Refused: trail name not allowed', stats.refusedName], ['Refused: line not allowed', stats.refusedLine], ['Refused: not a valid public block', stats.refusedShape],
    ['Shared names', stats.sharedNames], ['Read issues closed', closed]];
  console.log('trail register: ' + rows.map(([k, v]) => `${k}: ${v}`).join('; ') + `. ${a || b ? 'Files changed.' : 'Nothing changed.'}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Trail register\n\n| | |\n|---|---|\n${rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n${a || b ? 'Files changed.' : 'Nothing changed.'}\n`); } catch (e) { /* the summary is a nicety */ }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error('trail register: ' + (e && e.message ? e.message : 'failed')); process.exitCode = 1; });
}
