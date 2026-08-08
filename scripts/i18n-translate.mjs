#!/usr/bin/env node
// Translate the per-page English dictionaries (i18n/<page>.en.json) into the
// site's target languages using rocket's AI layer (`rocket ai … --provider
// claude`). Resume-safe: existing complete <page>.<lang>.json files are kept,
// and a translation-memory cache dedupes strings repeated across pages
// (nav labels, footers, CTAs …).
//
// Usage:
//   node scripts/i18n-translate.mjs [--tm <cache.json>] [--concurrency N] [page …]
//
// Note: portfolio dictionaries are fully translated in every language —
// language ≠ distribution region. (Haven's own mirrored site under
// apps/haven/ manages its language set in the Haven repo.)

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const I18N = join(REPO, 'i18n');
const ROCKET = join(process.env.HOME, 'Documents/mine/Personal/Apps/_shared/rocket');

const LANGS = {
  'zh-Hans': 'Simplified Chinese',
  'ja': 'Japanese',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish (neutral, es-ES leaning)',
  'ko': 'Korean',
  'pt-BR': 'Brazilian Portuguese',
  'it': 'Italian',
};

// Mirrors rocket's DEFAULT_GLOSSARY plus site-specific proper nouns.
const NEVER_TRANSLATE = [
  'Enter Space', 'Haven', 'Ari', 'Ari Helper', 'Sami', 'Pano Owl', 'Blip', 'Glint',
  'Tilebreak', 'Tri-Add', 'Zap', 'Embr', 'Mi Speaks', 'Revela', 'Ridgeshot',
  'SightQuick', 'Pinline', 'Luma Editor', 'Wise Flyer', 'DeepSi',
  'Doppel', 'Time Portal', 'Space Inspector', 'Git Mirror', 'Theater',
  'rclone', 'WebDAV', 'SFTP', 'SMB', 'Samba', 'FTP', 'S3', 'FSKit',
  'Dropbox', 'Google Drive', 'OneDrive', 'pCloud', 'Box', 'Mega', 'Backblaze B2',
  'Azure Files', 'Azure Blob Storage', 'Google Cloud Storage', 'Nextcloud', 'Seafile',
  'iPhone', 'iPad', 'Mac', 'Apple TV', 'Apple Watch', 'Apple Silicon', 'Finder',
  'Files', 'Spotlight', 'Time Machine', 'Family Sharing', 'Game Center', 'iCloud Keychain',
  'App Store', 'Shortcuts', 'App Intents', 'QuickLook', 'Face ID', 'Touch ID',
  'Blaine Miller', 'Aperion', 'Monkr', 'Draw Things', 'Ollama', 'OpenAI',
  'Anthropic', 'Google Gemini', 'Grok', 'XAI', 'AWS Bedrock', 'MLX', 'MOA', 'MIL',
  'iMessage', 'iCloud', 'Benro Polaris', 'Canon', 'TestFlight', 'GitHub', 'LinkedIn',
];

const args = process.argv.slice(2);
let tmPath = join(I18N, '.translation-memory.json');
let concurrency = 4;
const pages = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tm') tmPath = resolve(args[++i]);
  else if (args[i] === '--concurrency') concurrency = parseInt(args[++i], 10) || 4;
  else pages.push(args[i]);
}

const allPages = readdirSync(I18N)
  .filter((f) => f.endsWith('.en.json'))
  .map((f) => f.replace(/\.en\.json$/, ''))
  .filter((p) => pages.length === 0 || pages.includes(p));

let tm = {};
if (existsSync(tmPath)) tm = JSON.parse(readFileSync(tmPath, 'utf8'));
const saveTM = () => writeFileSync(tmPath, JSON.stringify(tm, null, 1));

const tagSequence = (s) => (s.match(/<\/?[a-z][a-z0-9-]*\b/gi) || []).map((t) => t.toLowerCase()).join(',');

function violations(en, tr) {
  const problems = [];
  if (typeof tr !== 'string' || !tr.trim()) return ['empty'];
  if (tagSequence(en) !== tagSequence(tr)) problems.push('html-tags-changed');
  // href/src/attribute payloads must survive verbatim
  for (const m of en.matchAll(/(?:href|src|class|id|data-for)="([^"]*)"/g)) {
    if (!tr.includes(`"${m[1]}"`)) { problems.push(`lost-attr:${m[1]}`); break; }
  }
  return problems;
}

function buildPrompt(lang, chunk) {
  return `You are localizing marketing copy for a personal Apple-app portfolio website (wemiller.com).
Translate the JSON string values below from English into ${LANGS[lang]} (BCP-47: ${lang}).

Rules:
- Respond with ONLY a JSON object containing exactly the same keys, with translated values. No markdown fences, no commentary.
- Preserve all HTML tags and their attributes EXACTLY as-is (e.g. <a href="…">, <span class="…">, <strong>, <br>, <cite>). Translate only human-readable text between tags.
- Keep HTML character entities (&amp;, &#x1f512;, …) unchanged.
- NEVER translate these product/brand/platform names; keep their exact casing: ${NEVER_TRANSLATE.join(', ')}.
- Keep emoji, arrows (→ ←) and © exactly where they appear.
- Dates written in words (e.g. "July, 2026") become the locale's natural spelled-out form.
- Keys starting with "_title" or "_meta" are the page <title>/meta description: keep them SEO-natural and about the same length.
- The string quoting Romans 1:20 should follow a standard published Bible translation for the language; render the reference (e.g. "Romans 1:20") the way that language's Bibles cite it.
- Tone: polished, natural consumer-app marketing for native speakers. Keep short labels short (buttons, nav).

JSON:
${JSON.stringify(chunk, null, 1)}`;
}

async function rocketAI(prompt) {
  const { stdout } = await execFileP(
    'node', ['rocket.mjs', 'ai', prompt, '--provider', 'claude'],
    { cwd: ROCKET, maxBuffer: 32 << 20 });
  return stdout.trim();
}

function parseJSON(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

async function translateChunk(lang, chunk, attempt = 0) {
  const out = {};
  let parsed;
  try {
    parsed = parseJSON(await rocketAI(buildPrompt(lang, chunk)));
  } catch (e) {
    if (attempt < 2) return translateChunk(lang, chunk, attempt + 1);
    // Never let one bad chunk kill the whole run: keep English, warn, move on.
    console.warn(`    ! chunk failed for ${lang} after retries (${String(e).slice(0, 140)}) — keeping English for ${Object.keys(chunk).length} strings`);
    return { ...chunk };
  }
  const redo = {};
  for (const [k, en] of Object.entries(chunk)) {
    const tr = parsed[k];
    const probs = violations(en, tr ?? '');
    if (probs.length === 0) out[k] = tr;
    else redo[k] = en;
  }
  if (Object.keys(redo).length && attempt < 2) {
    Object.assign(out, await translateChunk(lang, redo, attempt + 1));
  } else {
    for (const k of Object.keys(redo)) {
      if (!(k in out)) {
        console.warn(`    ! keeping English for ${lang} ${k} (validation failed)`);
        out[k] = redo[k];
      }
    }
  }
  return out;
}

function chunkEntries(entries, maxKeys = 40, maxChars = 6000) {
  const chunks = [];
  let cur = {}, n = 0, chars = 0;
  for (const [k, v] of entries) {
    if (n >= maxKeys || (chars + v.length > maxChars && n > 0)) {
      chunks.push(cur); cur = {}; n = 0; chars = 0;
    }
    cur[k] = v; n++; chars += v.length;
  }
  if (n) chunks.push(cur);
  return chunks;
}

// simple promise pool
async function pool(tasks, limit) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

const jobs = [];
for (const page of allPages) {
  const en = JSON.parse(readFileSync(join(I18N, `${page}.en.json`), 'utf8'));
  for (const lang of Object.keys(LANGS)) {
    jobs.push({ page, lang, en });
  }
}

let done = 0;
const tasks = jobs.map(({ page, lang, en }) => async () => {
  try {
    await translatePage(page, lang, en);
  } catch (e) {
    done++;
    console.warn(`[${done}/${jobs.length}] ${page}.${lang}.json FAILED: ${String(e).slice(0, 200)}`);
  }
});

async function translatePage(page, lang, en) {
  const outPath = join(I18N, `${page}.${lang}.json`);
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};
  const result = {};
  const missing = [];
  for (const [k, v] of Object.entries(en)) {
    const tmKey = `${lang} ${v}`;
    if (existing[k] && violations(v, existing[k]).length === 0 && existing[k] !== v) {
      result[k] = existing[k];
      tm[tmKey] = existing[k];
    } else if (tm[tmKey]) {
      result[k] = tm[tmKey];
    } else {
      missing.push([k, v]);
    }
  }
  for (const chunk of chunkEntries(missing)) {
    const translated = await translateChunk(lang, chunk);
    for (const [k, v] of Object.entries(translated)) {
      result[k] = v;
      if (v !== chunk[k]) tm[`${lang} ${chunk[k]}`] = v;
    }
    saveTM();
  }
  const ordered = {};
  for (const k of Object.keys(en).sort()) ordered[k] = result[k];
  writeFileSync(outPath, JSON.stringify(ordered, null, 2) + '\n');
  done++;
  console.log(`[${done}/${jobs.length}] ${page}.${lang}.json (${missing.length} newly translated)`);
}

console.log(`translating ${allPages.length} pages × ${Object.keys(LANGS).length} languages …`);
await pool(tasks, concurrency);
saveTM();
console.log('done.');
