#!/usr/bin/env node
/* The Trail: collect every sentence that can be translated, and check each language for gaps.
 *
 *   node scripts/trail-words.mjs            rewrite i18n/trail.en.json from the code
 *   node scripts/trail-words.mjs --check    exit 1 if trail.en.json is stale or the code uses t() wrongly
 *   node scripts/trail-words.mjs --gaps     say what each language is missing (never fails: translation is best effort)
 *
 * Two kinds of key live in i18n/trail.<lang>.json:
 *   - sentences: the English text itself, from t('…') calls in trail/ (see trail/words.js);
 *   - page keys: the data-i18n keys in trail/index.html ("hero.h1"…), whose English is kept by hand in trail.en.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRAIL = path.join(ROOT, 'trail'), I18N = path.join(ROOT, 'i18n');
const LANGS = ['zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];
const SKIP = new Set(['seal.js', 'seal.test.mjs', 'words.js']), mode = process.argv[2] || '';

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) { if (f.name !== 'desk') walk(path.join(dir, f.name)); } else if (f.name.endsWith('.js') && !SKIP.has(f.name)) files.push(path.join(dir, f.name));
  }
})(TRAIL);

const sentences = new Map(), problems = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8'), rel = path.relative(ROOT, file);
  const call = /(?<![\w.$])t\(\s*/g; let m;
  while ((m = call.exec(src))) {
    const at = m.index + m[0].length, q = src[at], line = src.slice(0, m.index).split('\n').length;
    if (q !== "'" && q !== '"' && q !== '`') { problems.push(`${rel}:${line}  t() must be given one plain string, not something built up`); continue; }
    let i = at + 1; while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
    const raw = src.slice(at, i + 1);
    if (q === '`' && raw.includes('${')) { problems.push(`${rel}:${line}  t() string has \${…} in it; use a {name} placeholder`); continue; }
    let text; try { text = new Function('return ' + raw)(); } catch (e) { problems.push(`${rel}:${line}  could not read the string`); continue; }
    if (!/^\s*[,)]/.test(src.slice(i + 1, i + 40))) { problems.push(`${rel}:${line}  t() string is joined to something else; keep it one literal`); continue; }
    if (text) sentences.set(text, rel);
  }
}

// page keys: whatever trail/index.html asks for
const html = fs.readFileSync(path.join(TRAIL, 'index.html'), 'utf8'), pageKeys = new Set(['_title', '_meta.description']);
for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) pageKeys.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) { const k = pair.split(':')[1]; if (k) pageKeys.add(k.trim()); }

const enPath = path.join(I18N, 'trail.en.json'), old = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {};
const en = {};
for (const k of [...pageKeys].sort()) { if (k in old) en[k] = old[k]; else if (!k.startsWith('_')) problems.push(`trail/index.html  page key "${k}" has no English in i18n/trail.en.json`); }
for (const k of [...sentences.keys()].sort()) en[k] = k;
const text = JSON.stringify(en, null, 1) + '\n';

if (mode === '--gaps') {
  for (const l of LANGS) {
    const p = path.join(I18N, `trail.${l}.json`), d = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    const missing = Object.keys(en).filter((k) => !d[k]), stale = Object.keys(d).filter((k) => !(k in en));
    const broken = Object.keys(en).filter((k) => d[k] && (k.match(/\{\w+\}/g) || []).some((ph) => !d[k].includes(ph)));
    console.log(`${l.padEnd(8)} ${Object.keys(en).length - missing.length}/${Object.keys(en).length} translated, ${stale.length} no longer used, ${broken.length} missing a {placeholder}`);
    if (process.argv.includes('--list')) { missing.slice(0, 40).forEach((k) => console.log('   missing: ' + k.slice(0, 90))); broken.forEach((k) => console.log('   placeholder: ' + k.slice(0, 90))); }
  }
} else if (mode === '--check') {
  problems.forEach((p) => console.log(p));
  const stale = !fs.existsSync(enPath) || fs.readFileSync(enPath, 'utf8') !== text;
  if (stale) console.log('i18n/trail.en.json is out of date: run node scripts/trail-words.mjs');
  if (problems.length || stale) process.exit(1);
  console.log(`Trail words are up to date: ${sentences.size} sentences, ${pageKeys.size} page keys.`);
} else {
  problems.forEach((p) => console.log(p));
  fs.writeFileSync(enPath, text);
  console.log(`Wrote i18n/trail.en.json: ${sentences.size} sentences from ${files.length} files, ${Object.keys(en).length - sentences.size} page keys.`);
  if (problems.length) process.exit(1);
}
