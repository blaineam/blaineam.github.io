#!/usr/bin/env node
/* The Trail: one version stamp on everything the trail's modules load from each other.
 *
 * The site's CDN tells browsers to keep scripts, stylesheets and JSON for a year, so a file is only
 * ever fetched again when its address changes. Pages get that from scripts/cache-bust.py, but a
 * module's own imports ('./engine.js') are addresses too. This gives every one of them the same
 * `?v=<hash>`, where the hash covers all of the trail's code and words. It has to be the SAME
 * stamp everywhere: two different addresses for engine.js would be two copies of the engine.
 *
 *   node scripts/trail-stamp.mjs           rewrite the stamps (writes nothing if they are current)
 *   node scripts/trail-stamp.mjs --check   exit 1 if they are stale
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRAIL = path.join(ROOT, 'trail'), check = process.argv.includes('--check');
const DATA = new Set(['config.json', 'register.json', 'lights.json']);      // fetched fresh every time; never stamped

const all = [];
(function walk(dir) { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else all.push(p); } })(TRAIL);
const code = all.filter((p) => p.endsWith('.js')), hashed = all.filter((p) => /\.(js|css)$/.test(p) || p.endsWith('guide.json'));
for (const f of fs.readdirSync(path.join(ROOT, 'i18n'))) if (/^trail\..+\.json$/.test(f)) hashed.push(path.join(ROOT, 'i18n', f));

const STAMP = /\?v=[0-9a-f]{8}/g, bare = (text) => text.replace(STAMP, '');
const h = crypto.createHash('sha1');
for (const p of hashed.sort()) h.update(path.relative(ROOT, p) + '\0' + bare(fs.readFileSync(p, 'utf8')) + '\0');
const v = h.digest('hex').slice(0, 8);

// './x.js', '../x.css', `./camps/${id}.js`, './guide.json' … and the trail's dictionaries
const LOCAL = /(['"`])(\.{1,2}\/[^'"`\n?]*?\.(?:js|css|json))(?:\?v=[0-9a-f]{8})?\1/g, WORDS = /(`\/i18n\/trail\.\$\{lang\}\.json)(?:\?v=[0-9a-f]{8})?(`)/g;
let stale = 0;
for (const p of code) {
  const src = fs.readFileSync(p, 'utf8');
  // only real files of the trail are stamped: a path inside a code sample shown to hikers is left alone
  const real = (spec) => !DATA.has(path.basename(spec)) && (spec.includes('${') ? fs.existsSync(path.resolve(path.dirname(p), spec.split('${')[0])) : fs.existsSync(path.resolve(path.dirname(p), spec)));
  const out = src.replace(LOCAL, (m, q, spec) => (real(spec) ? `${q}${spec}?v=${v}${q}` : `${q}${spec}${q}`)).replace(WORDS, `$1?v=${v}$2`);
  if (out !== src) { stale++; if (!check) fs.writeFileSync(p, out); }
}
if (check) { if (stale) { console.log(`Trail stamps are stale in ${stale} file(s): run node scripts/trail-stamp.mjs`); process.exit(1); } console.log(`Trail stamps are current (${v}).`); }
else console.log(stale ? `Stamped ${stale} trail module(s) with ?v=${v}.` : `Trail stamps already current (${v}).`);
