#!/usr/bin/env node
/* Builds the home page and everything derived from /content.
 *
 *   node scripts/build-site.mjs            # regenerate everything
 *   node scripts/build-site.mjs --check    # exit 1 if anything generated is stale (no writes)
 *   node scripts/build-site.mjs --encode 'mailto:me@example.com'   # value for site.json → contact
 *   node scripts/build-site.mjs --pdf      # private résumé PDF → out/ (needs Chrome; git-ignored)
 *
 * No dependencies. `sharp` (already installed for the poster generator: `npm ci` in scripts/)
 * is used when present to make photo thumbnails and crisp featured icons; without it the build
 * still succeeds and reuses whatever derivatives are already committed.
 *
 * Inputs   content/site.json  content/projects.json  content/photos.json  content/resume.json
 *          slides/*.webp      apps/projects.json     i18n/index.<lang>.json (read for the check)
 * Outputs  index.html  hire/index.html  resume/index.html  shell  search-index.json
 *          i18n/index.en.json  slides/thumbs/*  projects/lg/*  profiles/*  README.md (app table)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const at = (...p) => path.join(ROOT, ...p);
const read = (p) => fs.readFileSync(at(p), 'utf8');
const json = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(at(p));

/* ---------- small helpers ---------- */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Same stamp scripts/cache-bust.py writes (first 8 hex of the file's SHA-1), so its pass over
// the generated pages is a no-op.
const stampCache = new Map();
function stamp(url) {
  const rel = url.replace(/^\//, '');
  if (!exists(rel)) return url;
  if (!stampCache.has(rel)) stampCache.set(rel, crypto.createHash('sha1').update(fs.readFileSync(at(rel))).digest('hex').slice(0, 8));
  return `${url}?v=${stampCache.get(rel)}`;
}

// Contact values are stored reversed, XOR-ed and base64-encoded: nothing a scraper's regex or a
// plain base64 pass turns into an address. assets/site.js decodes on the visitor's first gesture.
const KEY = 0x5a;
const encode = (text) => Buffer.from([...Buffer.from(text, 'utf8')].reverse().map((b) => b ^ KEY)).toString('base64');
const decode = (enc) => Buffer.from([...Buffer.from(enc, 'base64')].map((b) => b ^ KEY).reverse()).toString('utf8');

if (argv.includes('--encode')) {
  console.log(encode(argv[argv.indexOf('--encode') + 1] || ''));
  process.exit(0);
}

const written = [];
const stale = [];
function write(rel, content) {
  const prev = exists(rel) ? fs.readFileSync(at(rel)) : null;
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (prev && prev.equals(next)) return;
  if (CHECK) { stale.push(rel); return; }
  fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
  fs.writeFileSync(at(rel), next);
  written.push(rel);
}

/* ---------- content ---------- */

const site = json('content/site.json');
const projects = json('content/projects.json');
const photoMeta = json('content/photos.json').photos || {};
// camera and capture date recovered from the originals (scripts/photo-meta.mjs); an entry in photos.json wins
const photoExif = exists('content/photo-meta.json') ? json('content/photo-meta.json').photos || {} : {};
const resume = json('content/resume.json');
// Values under "private" are stored encoded ("enc:…", made with --encode) so the clearance
// wording is not readable text in this public repository or at /content/resume.json either.
for (const k of Object.keys(resume.private || {})) {
  if (typeof resume.private[k] === 'string' && resume.private[k].startsWith('enc:')) resume.private[k] = Buffer.from([...Buffer.from(resume.private[k].slice(4), 'base64')].map((b) => b ^ 0x5a).reverse()).toString('utf8');
}
const apps = json('apps/projects.json').apps;
const S = site.strings;
const LANGS = ['en', 'zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];
const LANG_NAMES = { en: 'English', 'zh-Hans': '简体中文', ja: '日本語', de: 'Deutsch', fr: 'Français', es: 'Español', ko: '한국어', 'pt-BR': 'Português (Brasil)', it: 'Italiano' };

const t = (key) => {
  if (!(key in S)) throw new Error(`content/site.json → strings is missing "${key}"`);
  return S[key];
};
// Text node / inline-HTML node carrying its i18n key, with the English baked in.
const T = (key, tag = 'span', attrs = '') => `<${tag}${attrs ? ' ' + attrs : ''} data-i18n="${key}">${esc(t(key))}</${tag}>`;
const H = (key, tag = 'p', attrs = '') => `<${tag}${attrs ? ' ' + attrs : ''} data-i18n-html="${key}">${t(key)}</${tag}>`;

/* ---------- photographs ---------- */

function webpSize(file) {
  const fd = fs.openSync(file, 'r');
  const b = Buffer.alloc(32);
  fs.readSync(fd, b, 0, 32, 0);
  fs.closeSync(fd);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  throw new Error(`${file}: not a WebP this build understands`);
}

let sharp = null;
try { sharp = createRequire(at('scripts/'))('sharp'); } catch { /* optional */ }

// The home page loads minified copies of its own script and stylesheet (assets/site.min.js,
// assets/site.min.css), made here with esbuild. assets/site.js and assets/site.css stay the
// source and are what you edit. Without esbuild installed (npm ci in scripts/) the page simply
// loads the sources as written.
let esbuild = null;
try { esbuild = createRequire(at('scripts/'))('esbuild'); } catch { /* optional */ }
function minified(src, loader) {
  if (!esbuild) return '/' + src;
  const out = src.replace(/\.(js|css)$/, '.min.$1');
  const { code } = esbuild.transformSync(read(src), { loader, minify: true, legalComments: 'none', charset: 'utf8',
    target: loader === 'css' ? ['chrome100', 'firefox100', 'safari15'] : 'es2017' });
  write(out, code);
  return '/' + out;
}
const SITE_CSS = minified('assets/site.css', 'css'), SITE_JS = minified('assets/site.js', 'js');

const THUMB_W = 640;
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const manifestPath = 'slides/thumbs/manifest.json';
const manifest = exists(manifestPath) ? json(manifestPath) : {};
const nextManifest = {};

// A photograph added as a JPEG (the /edit/ editor does this from Safari, which cannot write
// WebP) becomes a WebP here, and thumbnails whose photograph was deleted are removed.
if (sharp && !CHECK) {
  for (const f of fs.readdirSync(at('slides')).filter((x) => /\.jpe?g$/i.test(x))) {
    const out = f.replace(/\.jpe?g$/i, '.webp');
    if (!exists(`slides/${out}`)) await sharp(at('slides', f)).rotate().webp({ quality: 82, effort: 5 }).toFile(at('slides', out));
    fs.unlinkSync(at('slides', f));
    written.push(`slides/${out}`);
  }
  if (exists('slides/thumbs')) for (const f of fs.readdirSync(at('slides/thumbs')).filter((x) => x.endsWith('.webp'))) {
    if (!exists(`slides/${f}`)) { fs.unlinkSync(at('slides/thumbs', f)); written.push(`slides/thumbs/${f} (removed)`); }
  }
}
const photoFiles = fs.readdirSync(at('slides')).filter((f) => f.endsWith('.webp')).sort(natural).reverse();
for (const name of Object.keys(photoMeta)) {
  if (!photoFiles.includes(name)) console.warn(`  ! content/photos.json lists ${name}, but slides/${name} does not exist`);
}

const photos = [];
for (const file of photoFiles) {
  const src = at('slides', file);
  const sum = crypto.createHash('sha1').update(fs.readFileSync(src)).digest('hex').slice(0, 8);
  let m = manifest[file];
  const thumbRel = `slides/thumbs/${file}`;
  if (!m || m.src !== sum || !exists(thumbRel)) {
    const { w, h } = webpSize(src);
    m = { w, h, c: m?.c || '#1a2233', src: sum };
    if (sharp && !CHECK) {
      fs.mkdirSync(at('slides/thumbs'), { recursive: true });
      await sharp(src).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 68, effort: 5 }).toFile(at(thumbRel));
      const px = await sharp(src).resize(1, 1, { fit: 'fill' }).removeAlpha().raw().toBuffer();
      m.c = '#' + [px[0], px[1], px[2]].map((v) => Math.round(v * 0.75).toString(16).padStart(2, '0')).join('');
      written.push(thumbRel);
    } else if (!exists(thumbRel)) {
      if (CHECK) stale.push(thumbRel);
      else console.warn(`  ! no thumbnail for ${file} (sharp is not installed: run \`npm ci\` in scripts/). The full image is used instead.`);
    }
  }
  nextManifest[file] = m;
  const meta = photoMeta[file] || {};
  photos.push({
    file, id: file.replace(/\.webp$/, ''), w: m.w, h: m.h, c: m.c,
    full: `slides/${file}`, thumb: exists(thumbRel) ? thumbRel : `slides/${file}`,
    title: meta.title || '', caption: meta.caption || '', alt: meta.alt || meta.title || '',
    tags: meta.tags || [], featured: !!meta.featured, order: meta.order ?? null,
    video: (String(meta.video || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/) || [])[1] || '',
    taken: meta.taken || photoExif[file]?.taken || '', camera: meta.camera || photoExif[file]?.camera || '',
    // a phone's lens name is just the phone again; a real lens is worth showing
    lens: /iphone|ipad/i.test(meta.camera || photoExif[file]?.camera || '') ? '' : meta.lens || photoExif[file]?.lens || '',
    focal35: meta.focal35 || photoExif[file]?.focal35 || '', aperture: meta.aperture || photoExif[file]?.aperture || '', shutter: meta.shutter || photoExif[file]?.shutter || '', iso: meta.iso || photoExif[file]?.iso || '',
  });
}
photos.sort((a, b) => (b.order ?? -Infinity) - (a.order ?? -Infinity));
write(manifestPath, JSON.stringify(nextManifest, null, 1) + '\n');
const photoBy = Object.fromEntries(photos.map((p) => [p.file, p]));
const panoCount = exists('panos/panoramas')
  ? new Set(fs.readdirSync(at('panos/panoramas')).map((f) => f.replace(/\.[a-z]+$/, ''))).size : 0;

/* ---------- projects ---------- */

const appBy = Object.fromEntries(apps.map((a) => [a.page_url, a]));
for (const p of projects) p.app = appBy[p.link] || null;
const projectBy = Object.fromEntries(projects.map((p) => [p.id, p]));
const featured = site.featured.map((id) => {
  if (!projectBy[id]) throw new Error(`content/site.json → featured names "${id}", which is not in content/projects.json`);
  return projectBy[id];
});

// Crisp 256 px icons for the featured cards, from each app's own icon.
for (const p of projects) {
  const out = `projects/lg/${p.id}.webp`;
  const source = p.app?.icon_url ? p.app.icon_url.replace(/^\//, '') : null;
  if (sharp && !CHECK && source && exists(source) && !exists(out)) {
    fs.mkdirSync(at('projects/lg'), { recursive: true });
    await sharp(at(source)).resize(256, 256).webp({ quality: 88 }).toFile(at(out));
    written.push(out);
  }
  p.bigIcon = exists(out) ? out : (p.icon ? `projects/${p.icon}` : '');
}

const years = [...new Set(projects.map((p) => p.date.slice(0, 4)))].sort().reverse();
const firstYear = Number(years[years.length - 1]);
const yearsBuilding = new Date().getFullYear() - firstYear;
const appCount = apps.length;
const fill = (s) => s.replace(/\{apps\}/g, `${Math.floor(appCount / 5) * 5}+`).replace(/\{photos\}/g, photos.length)
  .replace(/\{panos\}/g, panoCount).replace(/\{years\}/g, yearsBuilding);

/* ---------- icons ---------- */

const I = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 6.2 4.65a3 3 0 0 0 3.6 0L20 7"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.25C6.62 2.25 2.25 6.62 2.25 12c0 1.66.42 3.23 1.16 4.6l-1.07 3.93a.75.75 0 0 0 .92.92l3.93-1.07A9.7 9.7 0 0 0 12 21.75c5.38 0 9.75-4.37 9.75-9.75S17.38 2.25 12 2.25Z"/></svg>',
  haven: '<svg viewBox="15 14.5 70 70" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-opacity=".65" stroke-width="4" stroke-linecap="round"><path d="M50 53V24M50 53L23 46M50 53l27-7M50 53L34 75M50 53l16 22M50 24L23 46M50 24l27 22M23 46l11 29M77 46L66 75"/></g><g fill="currentColor"><circle cx="50" cy="53" r="11"/><circle cx="50" cy="24" r="8"/><circle cx="23" cy="46" r="8"/><circle cx="77" cy="46" r="8"/><circle cx="34" cy="75" r="8"/><circle cx="66" cy="75" r="8"/></g></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4V21H3zM9.5 9.75h3.8v1.6h.06c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.2c0-1.24-.02-2.83-1.83-2.83-1.83 0-2.11 1.35-2.11 2.74V21h-4z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.28 5 12 5 12 5s-6.28 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.72 19 12 19 12 19s6.28 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.17h1.7L7.4 4.74H5.58z"/></svg>',
  apps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  tools: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.8 16.9a1.8 1.8 0 0 0 2.5 2.5l5.5-5.5a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.2-.3-.3-2.2z"/></svg>',
  pano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10 4.5 7 4 4 5v13c3-1 6-.5 8 1.5m0-13c2-2 5-2.5 8-1.5v13c-3-1-6-.5-8 1.5m0-13v13"/></svg>',
  xr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h13A2.5 2.5 0 0 1 21 9.5v5a2.5 2.5 0 0 1-2.5 2.5h-2.6a2 2 0 0 1-1.6-.8l-.7-.9a2 2 0 0 0-3.2 0l-.7.9a2 2 0 0 1-1.6.8H5.5A2.5 2.5 0 0 1 3 14.5z"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/></svg>',
  cam_phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="3"/><rect x="8.6" y="4.6" width="4.6" height="4.6" rx="1.4"/><circle cx="10.9" cy="6.9" r=".9" fill="currentColor" stroke="none"/></svg>',
  cam_camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H8l1.3-2h5.4L16 7h3.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/></svg>',
  cam_film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="11" height="13" rx="2"/><path d="M14 9h7v7h-7M6 6V4h5v2M6.5 10v5M10.5 10v5M17 11.5h1.5M17 13.5h1.5"/></svg>',
  cam_drone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="10" width="6" height="4.5" rx="1.5"/><path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 14l-4 3M14.5 14l4 3M3 7.5h5M16 7.5h5M3 17h5M16 17h5"/></svg>',
  puzzle: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-1.99 2v3.8H3.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5Z"/></svg>',
  speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4.5 17a8.5 8.5 0 1 1 15 0M12 13l4-5"/><circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none"/></svg>',
  term: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3 10.8 19.2C5.4 14.4 2.5 11.8 2.5 8.5 2.5 5.9 4.6 4 7.2 4c1.5 0 2.9.7 3.8 1.8L12 7l1-1.2C13.9 4.7 15.3 4 16.8 4c2.6 0 4.7 1.9 4.7 4.5 0 3.3-2.9 5.9-8.3 10.7z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v4h3l5 4V6l-5 4z"/><path class="snd-on" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  paw: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="10" rx="2" ry="2.6"/><ellipse cx="10" cy="6.2" rx="2" ry="2.7"/><ellipse cx="14.4" cy="6.2" rx="2" ry="2.7"/><ellipse cx="18.3" cy="10" rx="2" ry="2.6"/><path d="M12.2 11c-2.6 0-5.2 3-5.2 5.6 0 1.6 1.2 2.4 2.6 2.4 1 0 1.7-.5 2.6-.5s1.6.5 2.6.5c1.4 0 2.6-.8 2.6-2.4 0-2.6-2.6-5.6-5.2-5.6z"/></svg>',
};

/* ---------- home page ---------- */

// Two states that only a person ever sets. Both can be previewed without touching the site:
//   node scripts/build-site.mjs --state contingency      → out/preview.html
//   node scripts/build-site.mjs --luma-passed 2035-01-01 → out/preview.html
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const PREVIEW = argv.includes('--state') || argv.includes('--luma-passed');
const siteState = flag('--state') || site.contingency?.state || 'normal';
const lumaPassed = flag('--luma-passed') || site.luma.passed || '';
let noteHtml = '';
if (siteState === 'contingency') {
  const raw = process.env.CONTINGENCY_NOTE || (exists('content/private/contingency-note.md') ? read('content/private/contingency-note.md') : '');
  if (!raw.trim()) throw new Error('contingency.state is "contingency" but there is no note: add content/private/contingency-note.md or the CONTINGENCY_NOTE secret.');
  noteHtml = raw.trim().split(/\n\s*\n/).map((para) => {
    const text = esc(para.replace(/\s*\n\s*/g, ' ')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]+)\]\((\/[^)\s]*|https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');   // [words](/page/) or an https address
    return /^#+\s/.test(para) ? `<h2>${text.replace(/^#+\s*/, '')}</h2>` : `<p>${text}</p>`;
  }).join('\n          ');
}
const VIEWS = ['maker', 'hire', 'photo', 'luma'];
if (!VIEWS.includes(site.mode)) throw new Error('content/site.json → mode must be "maker" or "hire"');

// Hero photographs also get a 1024 px copy (slides/hero/), so a phone is not sent the 1600 px one.
const HERO_W = 1024;
for (const f of new Set(VIEWS.flatMap((v) => site.views[v].hero))) {
  const p = photoBy[f];
  if (!p) throw new Error(`content/site.json → views hero names ${f}, which is not in /slides`);
  const out = `slides/hero/${f}`;
  if (sharp && !CHECK && p.w > HERO_W && (!exists(out) || fs.statSync(at(out)).mtimeMs < fs.statSync(at(p.full)).mtimeMs)) {
    fs.mkdirSync(at('slides/hero'), { recursive: true });
    await sharp(at(p.full)).resize({ width: HERO_W }).webp({ quality: 78 }).toFile(at(out));
  }
  p.mid = exists(out) ? out : null;
}
const srcsetOf = (p) => [`${stamp(p.thumb)} ${Math.min(THUMB_W, p.w)}w`, p.mid && `${stamp(p.mid)} ${HERO_W}w`, `${stamp(p.full)} ${p.w}w`].filter(Boolean).join(', ');
const heroData = Object.fromEntries(VIEWS.map((v) => [v, site.views[v].hero.map((f) => {
  const p = photoBy[f];
  return { s: stamp(p.thumb), l: stamp(p.full), a: p.alt, c: p.c, set: srcsetOf(p) };
})]));
const hero0 = photoBy[site.views[site.mode].hero[0] || site.views.maker.hero[0]];
const heroSrcset = srcsetOf(hero0);

const cta = (view) => site.views[view].cta.map(([href, key], i) =>
  `<a class="btn ${i ? 'btn--ghost' : 'btn--solid'}" href="${esc(href)}"><span data-i18n="${key}">${esc(t(key))}</span>${i ? '' : I.arrow}</a>`).join('\n            ');

// One countdown line per real dog; assets/site.js shows the one whose birthday month it is.
const novaDog = (site.future?.dogs?.real || []).find((d) => d.name === 'Nova' && !d.passed);
const novaBorn = novaDog ? novaDog.born : '';
function birthdayLine(id, born, key) {
  const kinds = ['count', 'one', 'today', 'after'];
  return `<p class="bday" id="${id}" hidden data-born="${esc(born)}" ${kinds.map((k) => `data-${k}="${esc(t(`${key}.${k}`))}"`).join(' ')} data-i18n-attr="${kinds.map((k) => `data-${k}:${key}.${k}`).join(';')}" aria-live="polite"></p>`;
}

const heroCopy = {
  maker: `
          <p class="hand" data-i18n="hello-i-m-blaine.854c20">Hello, I'm Blaine Miller</p>
          ${T('hero.maker.eyebrow', 'p', 'class="eyebrow"')}
          ${T('hook.lead', 'h1')}
          ${H('hook.years', 'p', 'class="lede"')}`,
  hire: `
          <p class="eyebrow"><span data-i18n="hook.title">${esc(t('hook.title'))}</span>${site.openToWork ? ` <span class="badge"><i></i><span data-i18n="hook.hire">${esc(t('hook.hire'))}</span></span>` : ''}</p>
          ${T('hero.hire.h', 'h1')}
          ${T('hero.hire.p', 'p', 'class="lede"')}
          ${resume.private?.badge ? `<p class="cleared" data-cleared="${encode(resume.private.badge)}" hidden></p>` : ''}`,
  photo: `
          ${T('hero.photo.eyebrow', 'p', 'class="eyebrow"')}
          ${T('hero.photo.h', 'h1')}
          ${T('hero.photo.p', 'p', 'class="lede"')}`,
  luma: lumaPassed ? `
          <p class="eyebrow">${I.paw}<span>${site.luma.born.slice(0, 4)} – ${lumaPassed.slice(0, 4)}</span></p>
          ${T('luma.memorial.h', 'h1')}
          ${T('luma.memorial.p', 'p', 'class="lede"')}` : `
          <p class="eyebrow">${I.paw}<span data-i18n="hero.luma.eyebrow">${esc(t('hero.luma.eyebrow'))}</span></p>
          ${T('hero.luma.h', 'h1')}
          ${T('hero.luma.p', 'p', 'class="lede"')}
          ${birthdayLine('bday', site.luma.born, 'bday')}${novaBorn ? birthdayLine('bday-nova', novaBorn, 'bday.nova') : ''}`,
};

// The dogs' view (internally still "luma") shows both dogs' photographs.
const isPup = (p) => p.tags.includes('luma') || p.tags.includes('nova');
const lumaBorn = new Date(site.luma.born + 'T00:00:00');
const lumaEnd = lumaPassed ? new Date(lumaPassed + 'T00:00:00') : new Date();
const lumaAge = lumaEnd.getFullYear() - lumaBorn.getFullYear() - (lumaEnd < new Date(lumaEnd.getFullYear(), lumaBorn.getMonth(), lumaBorn.getDate()) ? 1 : 0);
const stats = [
  [`${Math.floor(appCount / 5) * 5}+`, 'stat.apps', 'maker hire'],
  [`${yearsBuilding}+`, 'stat.years', 'maker hire'],
  [String(photos.length + panoCount), 'stat.media', 'maker'],
  [String(photos.length), 'stat.photos', 'photo'],
  [String(panoCount), 'stat.panos', 'photo'],
  [String(lumaAge), 'stat.lumaage', 'luma', lumaPassed ? '' : ` data-age-from="${site.luma.born}"`],
  [String(photos.filter(isPup).length), 'stat.luma', 'luma'],
  [String(resume.skills.reduce((n, g) => n + g.items.length, 0)), 'stat.langs', 'maker hire'],
];

const chip = (tag) => `<li data-i18n="tag.${slug(tag)}">${esc(tag)}</li>`;

const featuredCard = (p) => `
          <a class="card reveal" href="${esc(p.link)}" data-app="${p.id}" data-since="${p.date}" style="--tint:${(site.tints || {})[p.id] || '#6cb6ff'}">
            <img class="card__icon" src="${stamp(p.bigIcon)}" alt="" width="72" height="72" loading="lazy" decoding="async">
            <h3>${esc(p.title)}</h3>
            <p class="card__tag" data-i18n="ft.${p.id}">${esc(p.tagline || '')}</p>
            <ul class="chips">${p.stack.slice(0, 4).map(chip).join('')}</ul>
            <span class="card__go"><span data-i18n="work.open">${esc(t('work.open'))}</span>${I.arrow}</span>
          </a>`;

const external = (href) => /^https?:/.test(href);
const timelineItem = (p) => `
              <details class="tl" id="p-${p.id}" data-app="${p.id}" data-since="${p.date}">
                <summary>
                  <span class="tl__icon">${p.icon ? `<img src="${stamp('projects/' + p.icon)}" alt="" width="40" height="40" loading="lazy" decoding="async">` : `<i aria-hidden="true">${esc(p.title[0])}</i>`}</span>
                  <span class="tl__head"><strong>${esc(p.title)}</strong><time datetime="${p.date}" data-i18n="tl.${p.id}.date">${esc(p.dateLabel)}</time></span>
                  <span class="tl__chev">${I.down}</span>
                </summary>
                <div class="tl__body">
                  <p data-i18n-html="tl.${p.id}.desc">${p.description}</p>
                  <ul class="chips">${p.stack.map(chip).join('')}</ul>
                  ${p.link ? `<a class="tl__go" href="${esc(p.link)}"${external(p.link) ? ' rel="noopener"' : ''}><span data-i18n="tl.visit">${esc(t('tl.visit'))}</span> ${esc(p.title)} ${I.arrow}</a>` : ''}
                </div>
              </details>`;

const timeline = years.map((y) => `
          <div class="year reveal">
            <h3 class="year__n">${y}</h3>
            <div class="year__items">${projects.filter((p) => p.date.startsWith(y)).map(timelineItem).join('')}
            </div>
          </div>`).join('');

const job = (j, i) => `
            <article class="job reveal" data-since="${j.start.replace(/^(\d\d)\/(\d{4})$/, '$2-$1')}">
              <header>
                <p class="job__when">${esc(j.start)} – ${esc(j.end)}</p>
                <h3 data-i18n="job.${i}.role">${esc(j.role)}</h3>
                <p class="job__co">${esc(j.company)}</p>
                <p class="job__meta"><span data-i18n="job.${i}.field">${esc(j.field)}</span><br><span data-i18n="job.${i}.place">${esc(j.place)}</span></p>
              </header>
              <ul>${j.bullets.map((b, n) => `<li data-i18n="job.${i}.b${n}">${esc(b)}</li>`).join('')}</ul>
            </article>`;

const camKind = (name) => (/iphone|ipad/i.test(name) ? 'phone' : /film/i.test(name) ? 'film' : /drone|dji/i.test(name) ? 'drone' : 'camera');
const cameras = Object.entries(photos.reduce((m, p) => { if (p.camera) m[p.camera] = (m[p.camera] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, count, id: slug(name), kind: camKind(name) }));
const photoTile = (p) => `<a class="ph${p.video ? ' is-video' : ''}${p.featured ? ' is-feat' : ''}${p.tags.map((x) => ' t-' + x).join('')}" href="${stamp(p.full)}" id="${p.id}"${p.camera ? ` data-cam="${slug(p.camera)}" data-camera="${esc(p.camera)}"` : ''}${p.taken ? ` data-taken="${p.taken}"` : ''}${p.camera ? ` data-kind="${camKind(p.camera)}"` : ''}${p.lens ? ` data-lens="${esc(p.lens)}"` : ''}${p.focal35 ? ` data-f35="${p.focal35}"` : ''}${p.aperture ? ` data-fn="${p.aperture}"` : ''}${p.shutter ? ` data-ss="${esc(p.shutter)}"` : ''}${p.iso ? ` data-iso="${p.iso}"` : ''}${p.video ? ` data-video="${p.video}"` : ''}${p.title ? ` data-title="${esc(p.title)}"` : ''}${p.caption ? ` data-caption="${esc(p.caption)}"` : ''}${p.title || p.caption ? ` data-i18n-attr="${[p.title && `data-title:ph.${p.id}.t`, p.caption && `data-caption:ph.${p.id}.c`].filter(Boolean).join(';')}"` : ''} style="--c:${p.c}"><img src="${stamp(p.thumb)}" alt="${esc(p.alt)}" data-i18n-attr="alt:ph.${p.id}.alt" width="${p.w}" height="${p.h}" loading="lazy" decoding="async">${p.title ? `<span class="ph__t">${esc(p.title)}</span>` : ''}</a>`;

const exploreTile = (x) => `
          <a class="tile reveal" href="${esc(x.href)}"${x.views ? ` data-views="${x.views}"` : ''}>
            <span class="tile__i">${I[x.icon]}</span>
            <strong data-i18n="${x.key}">${esc(t(x.key))}</strong>
            <span data-i18n="${x.desc}">${esc(t(x.desc))}</span>
          </a>`;

const lumaPhoto = photoBy['bmp-62.webp'] || photos.find((p) => p.tags.includes('luma'));
const softPhoto = featured.slice(0, 5);

const TUI_CMD = `curl -sL ${site.origin.replace(/^https?:\/\//, '')}/shell | sh`;

const jsonLd = {
  '@context': 'http://schema.org/', '@type': 'Person', name: site.name,
  image: `${site.origin}/profile.jpg`, url: site.origin, jobTitle: resume.title,
  address: { '@type': 'PostalAddress', addressLocality: 'Bakersfield', addressRegion: 'CA', addressCountry: 'US' },
  knowsAbout: ['Kubernetes', 'Apache Kafka', 'ClickHouse', 'AWS', 'RF signal processing', 'iOS development', 'Swift', 'Astrophotography'],
  sameAs: [...site.social.map((s) => s.href), 'https://www.producthunt.com/@blaineam'],
};

// Runs before first paint: picks the view from the URL (or the hostname) so the right hero is
// the first thing drawn. Without JavaScript the page simply shows the default view.
// Every word that means the dogs' page, as ?v=<word>. ?v=dog is the address the site hands out;
// ?v=nova and ?v=luma are what the older domain redirects use. 404.html has the same list for paths.
const DOG_WORDS = '^(dogs?|pets?|pups?|pupp(y|ies)|luma|nova|millers(\\.dog)?)$';
const PHOTO_WORDS = '^(120(\\.media)?|photos?|photography)$';
const bootScript = `(function(){var d=document.documentElement,q=new URLSearchParams(location.search),v=q.get("v"),m=q.get("mode"),h=${JSON.stringify(site.domains)}[location.hostname.toLowerCase()];var w=/${PHOTO_WORDS}/i.test(v||"")?"photo":/${DOG_WORDS}/i.test(v||"")?"luma":m==="hire"||m==="maker"?m:h||d.getAttribute("data-view");d.setAttribute("data-view",w);var hs=${JSON.stringify(Object.fromEntries(VIEWS.filter((v) => heroData[v][0]).map((v) => [v, heroData[v][0].set])))}[w];if(hs){var k=document.createElement("link");k.rel="preload";k.as="image";k.setAttribute("imagesrcset",hs);k.setAttribute("imagesizes","100vw");k.setAttribute("fetchpriority","high");document.head.appendChild(k)}d.classList.add("js");var th=null;try{th=localStorage.getItem("wm-theme");if(th==="light"||th==="dark")d.setAttribute("data-theme",th);else th=null}catch(e){}if(th?th==="light":(window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches))d.setAttribute("data-hero","light");try{var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType||"")))d.classList.add("lite")}catch(e){}})();`;

const profile = stamp('profile.jpg');
const avatar = stamp('assets/avatar.jpg');   // 192 px copy of profile.jpg for the header and the tab icon (the full photo is 160 KB)
const index = `<!DOCTYPE html>
<!-- Generated by scripts/build-site.mjs from /content. Edit the content files, not this page. -->
<html lang="en" data-view="${site.mode}" data-default-view="${site.mode}"${siteState === 'contingency' ? ' data-state="contingency"' : ''}${lumaPassed ? ' data-luma="remembered"' : ''}>
<head>
  <meta charset="utf-8">
  <title>${esc(t('_title'))}</title>
  <meta name="description" content="${esc(t('_meta.description'))}">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark light">
  <meta name="theme-color" content="#070b14">
  <link rel="canonical" href="${site.origin}/">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(t('_title'))}">
  <meta property="og:url" content="${site.origin}">
  <meta property="og:image" content="${site.origin}/${stamp('og/home.jpg')}">
  <meta property="og:image:secure_url" content="${site.origin}/${stamp('og/home.jpg')}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${site.origin}/${stamp('og/home.jpg')}">
  <meta property="og:description" content="${esc(t('_meta.description'))}">
  <meta property="profile:first_name" content="Blaine">
  <meta property="profile:last_name" content="Miller">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Blaine Miller">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="${profile}">
  <link rel="icon" type="image/jpeg" href="${avatar}">
  <script>${bootScript}</script>
  <link rel="stylesheet" href="${stamp(SITE_CSS)}">
  <link rel="alternate" hreflang="x-default" href="${site.origin}/">
${LANGS.map((l) => `  <link rel="alternate" hreflang="${l}" href="${site.origin}/${l === 'en' ? '' : '?lang=' + l}">`).join('\n')}
  <script src="${stamp(SITE_JS)}" defer></script>
  <script src="${stamp('/i18n/i18n.js')}" defer data-page="index" data-pos="bottom-right" data-own-switcher></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <a class="skip" href="#main" data-i18n="skip">${esc(t('skip'))}</a>

  <header class="nav" id="nav">
    <a class="nav__brand" href="/" aria-label="${esc(site.name)}">
      <img src="${avatar}" alt="" width="36" height="36">
      <span>${esc(site.name)}</span>
    </a>
    <nav class="nav__links" id="nav-links" aria-label="${esc(t('nav.sections'))}" data-i18n-attr="aria-label:nav.sections">
      <a href="#work" data-views="maker hire" data-i18n="nav.work">${esc(t('nav.work'))}</a>
      <a href="#experience" data-views="hire" data-i18n="nav.about">${esc(t('nav.about'))}</a>
      <a href="#gallery" data-views="maker photo luma" data-i18n="nav.photos">${esc(t('nav.photos'))}</a>
      <a href="#contact" data-i18n="nav.contact">${esc(t('nav.contact'))}</a>
    </nav>
    <span class="snd" id="snd">
      <button class="nav__icon" type="button" id="sound" aria-pressed="false" aria-label="${esc(t('foot.sound'))}" title="${esc(t('foot.sound'))}" data-i18n-attr="aria-label:foot.sound;title:foot.sound">${I.sound}</button>
      <span class="snd__vol"><input type="range" id="volume" min="0" max="100" step="1" value="50" aria-label="${esc(t('snd.volume'))}" data-i18n-attr="aria-label:snd.volume" aria-orientation="vertical"></span>
    </span>
    <button class="nav__icon" type="button" id="theme" data-auto="${esc(t('theme.auto'))}" data-light="${esc(t('theme.light'))}" data-dark="${esc(t('theme.dark'))}" data-i18n-attr="data-auto:theme.auto;data-light:theme.light;data-dark:theme.dark" aria-label="${esc(t('theme.auto'))}" title="${esc(t('theme.auto'))}">${I.theme}</button>
    <label class="nav__icon nav__lang" title="${esc(t('nav.lang'))}" data-i18n-attr="title:nav.lang">${I.globe}
      <select id="lang" aria-label="${esc(t('nav.lang'))}" data-i18n-attr="aria-label:nav.lang">${LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('')}</select>
    </label>
    <button class="nav__icon nav__menu" type="button" id="nav-menu" aria-expanded="false" aria-controls="nav-links" aria-label="${esc(t('nav.menu'))}" data-i18n-attr="aria-label:nav.menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <button class="nav__search" type="button" id="search-open" aria-haspopup="dialog" aria-label="${esc(t('nav.search'))}" data-i18n-attr="aria-label:nav.search">
      ${I.search}<span data-i18n="nav.search">${esc(t('nav.search'))}</span><kbd aria-hidden="true">/</kbd>
    </button>
  </header>

  <main id="main">
    <section class="hero" id="top" data-hero='${esc(JSON.stringify(heroData))}'>
      <div class="hero__media" aria-hidden="true">
        <img class="hero__img is-on" id="hero-a" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="" decoding="async">
        <noscript><img class="hero__img is-on" src="${stamp(hero0.thumb)}" srcset="${heroSrcset}" sizes="100vw" alt="" style="background:${hero0.c}"></noscript>
        <img class="hero__img" id="hero-b" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="" decoding="async">
        <div class="hero__scrim"></div>
        <canvas class="hero__confetti" id="season-fx" hidden></canvas>
        <canvas class="hero__confetti" id="confetti" hidden></canvas>
        <script>(function(){try{var v=document.documentElement.getAttribute("data-view");var h=JSON.parse(document.getElementById("top").getAttribute("data-hero"))[v][0],a=document.getElementById("hero-a");if(!h)return;a.style.background=h.c;a.sizes="100vw";a.srcset=h.set;a.src=h.s}catch(e){}})();</script>
      </div>
      <canvas class="hero__topo" id="topo" aria-hidden="true"></canvas>
      <div class="hero__inner">
${VIEWS.map((v) => `        <div class="hero__copy" data-views="${v}">${heroCopy[v]}
          <div class="hero__cta">
            ${cta(v)}
          </div>
        </div>`).join('\n')}

        <p class="season" id="season" hidden data-views="maker photo luma" data-seasons='${esc(JSON.stringify(site.seasons))}' ${site.seasons.filter((s) => s.greet).map((s) => `data-g-${s.id}="${esc(t('season.' + s.id))}"`).join(' ')} data-i18n-attr="${site.seasons.filter((s) => s.greet).map((s) => `data-g-${s.id}:season.${s.id}`).join(';')}"></p>

        <div class="views" role="group" aria-label="${esc(t('view.label'))}" data-i18n-attr="aria-label:view.label">
          <span class="views__pill" aria-hidden="true"></span>
${VIEWS.map((v) => `          <button type="button" data-view-to="${v}" aria-pressed="${v === site.mode}" data-i18n="view.${v}">${esc(t('view.' + v))}</button>`).join('\n')}
        </div>

        <dl class="stats">
${stats.map(([n, key, views, extra = '']) => `          <div data-views="${views}"><dt data-i18n="${key}">${esc(t(key))}</dt><dd data-count="${esc(n)}" data-stat="${key}"${extra}>${esc(n)}</dd></div>`).join('\n')}
        </dl>
      </div>
      <a class="hero__scroll" href="#after-hero" aria-hidden="true" tabindex="-1"><span data-i18n="hero.scroll">${esc(t('hero.scroll'))}</span>${I.down}</a>
    </section>

${noteHtml ? `    <section class="note" id="note" aria-labelledby="note-h">
      <div class="note__inner">
        <p class="eyebrow" id="note-h" data-i18n="note.h">${esc(t('note.h'))}</p>
          ${noteHtml}
      </div>
    </section>
` : ''}    <div class="flow" id="after-hero">

      <section class="sec" id="work" data-views="maker hire" aria-labelledby="work-h">
        <header class="sec__head reveal">
          ${T('work.h', 'h2', 'id="work-h"')}
          ${T('work.p', 'p')}
        </header>
        <div class="cards">${featured.map(featuredCard).join('')}
        </div>
        <p class="sec__more reveal"><a class="btn btn--line" href="/apps/"><span data-i18n="hook.apps">${esc(t('hook.apps'))}</span>${I.arrow}</a></p>
      </section>

      <section class="sec" id="experience" data-views="hire" aria-labelledby="exp-h">
        <header class="sec__head reveal">
          ${T('exp.h', 'h2', 'id="exp-h"')}
          ${T('exp.p', 'p')}
        </header>
        <div class="jobs">${resume.experience.map(job).join('')}
        </div>
        <div class="skills reveal">
          ${T('exp.skills', 'h3')}
          <dl>
${resume.skills.map((g, i) => `            <div><dt data-i18n="sk.${i}">${esc(g.years)}</dt><dd>${g.items.map(esc).join(' · ')}</dd></div>`).join('\n')}
          </dl>
        </div>
        <div class="edu reveal">
          <div>
            ${T('exp.edu', 'h3')}
${resume.education.map((e, i) => `            <p data-since="${e.start.replace(/^(\d\d)\/(\d{4})$/, '$2-$1')}"><strong data-i18n="edu.${i}.degree">${esc(e.degree)}</strong> <i data-i18n="edu.${i}.detail">${esc(e.detail)}</i> <span>${esc(e.school)} · ${esc(e.start)} – ${esc(e.end)}</span></p>`).join('\n')}
          </div>
          <a class="btn btn--solid" href="/resume/" data-keep-cleared><span data-i18n="exp.resume">${esc(t('exp.resume'))}</span>${I.arrow}</a>
        </div>
      </section>

      <section class="sec" id="projects" data-views="maker hire" aria-labelledby="tl-h">
        <header class="sec__head reveal">
          ${T('tl.h', 'h2', 'id="tl-h"')}
          ${T('tl.p', 'p')}
        </header>
        <div class="years" data-open="false">${timeline}
        </div>
        <p class="sec__more"><button class="btn btn--line" type="button" id="tl-more"><span data-i18n="tl.more">${esc(t('tl.more'))}</span>${I.down}</button></p>
      </section>

      <section class="sec sec--gallery" id="gallery" data-views="maker photo luma" aria-labelledby="ph-h">
        <header class="sec__head reveal">
          ${T('ph.h', 'h2', 'id="ph-h"')}
          ${T('ph.p', 'p')}
        </header>
        <div class="gbar reveal">
          <div class="sets" role="group" aria-label="${esc(t('ph.h'))}">
            <button type="button" data-set="all" aria-pressed="true" data-i18n="ph.set.all">${esc(t('ph.set.all'))}</button>
            <button type="button" data-set="120" aria-pressed="false" data-i18n="ph.set.120">${esc(t('ph.set.120'))}</button>
            <button type="button" data-set="luma" aria-pressed="false" data-i18n="ph.set.luma">${esc(t('ph.set.luma'))}</button>
          </div>
          <label class="gsort"><span data-i18n="ph.sort">${esc(t('ph.sort'))}</span>
            <select id="g-sort">
              <option value="mine" data-i18n="ph.sort.mine">${esc(t('ph.sort.mine'))}</option>
              <option value="new" data-i18n="ph.sort.new">${esc(t('ph.sort.new'))}</option>
              <option value="old" data-i18n="ph.sort.old">${esc(t('ph.sort.old'))}</option>
            </select>
          </label>
          <button class="btn btn--line btn--sm" type="button" id="slideshow">${I.play}<span data-i18n="ph.play">${esc(t('ph.play'))}</span></button>
        </div>
        <div class="g" id="g" data-set="all">
          ${photos.map(photoTile).join('\n          ')}
        </div>
        <div id="g-end" aria-hidden="true"></div>
        <p class="sec__more">
          <button class="btn btn--line" type="button" id="g-more"><span data-i18n="ph.all">${esc(t('ph.all'))}</span>${I.down}</button>
          <a class="btn btn--ghost" href="/panos/"><span data-i18n="cta.pano">${esc(t('cta.pano'))}</span>${I.arrow}</a>
        </p>
        ${H('for-his-invisible-attributes.f98eec', 'blockquote', 'class="verse reveal"')}
      </section>

      <section class="sec sec--band" id="luma" data-views="maker photo" aria-labelledby="luma-h">
        <a class="band reveal" href="/dogs/" data-view-to="luma">
          <img src="${stamp(lumaPhoto.thumb)}" alt="${esc(lumaPhoto.alt)}" width="${lumaPhoto.w}" height="${lumaPhoto.h}" loading="lazy" decoding="async">
          <span class="band__copy">
            <span class="eyebrow">${I.paw}millers.dog</span>
            ${T(lumaPassed ? 'luma.memorial.h' : 'luma.h', 'strong', 'id="luma-h"')}
            ${T(lumaPassed ? 'luma.memorial.p' : 'luma.p', 'span')}
            <span class="band__go"><span data-i18n="luma.cta">${esc(t('luma.cta'))}</span>${I.arrow}</span>
          </span>
        </a>
      </section>

      <section class="sec sec--band" id="software" data-views="photo luma" aria-labelledby="soft-h">
        <a class="band band--soft reveal" href="/" data-view-to="maker">
          <span class="band__icons" aria-hidden="true">${softPhoto.map((p) => `<img src="${stamp(p.bigIcon)}" alt="" width="64" height="64" loading="lazy" decoding="async">`).join('')}</span>
          <span class="band__copy">
            ${T('soft.h', 'strong', 'id="soft-h"')}
            ${T('soft.p', 'span')}
            <span class="band__go"><span data-i18n="soft.cta">${esc(t('soft.cta'))}</span>${I.arrow}</span>
          </span>
        </a>
      </section>

      <section class="sec" id="explore" aria-labelledby="x-h">
        <header class="sec__head reveal">
          ${T('x.h', 'h2', 'id="x-h"')}
        </header>
        <div class="tiles">${site.explore.map(exploreTile).join('')}
        </div>
      </section>

    </div>

    <section class="sky" id="contact" aria-labelledby="c-h">
      <canvas class="sky__stars" id="stars" aria-hidden="true"></canvas>
      <div class="sky__shade" aria-hidden="true"></div>
      <div class="sky__inner">
        ${T('c.h', 'h2', 'id="c-h" class="reveal"')}
        ${T('c.p', 'p', 'class="lede reveal" data-views="maker photo luma"')}
        ${T('c.p.hire', 'p', 'class="lede reveal" data-views="hire"')}
        <div class="reach reveal">
          <button class="btn btn--solid" type="button" id="email" data-k="${esc(site.contact.email)}" data-i18n-attr="aria-label:c.email.reveal" aria-label="${esc(t('c.email.reveal'))}">${I.mail}<span data-i18n="c.email">${esc(t('c.email'))}</span></button>
          <a class="btn btn--ghost" data-views="maker photo luma" href="#contact" data-k="${esc(site.contact.haven)}" rel="nofollow noreferrer noopener">${I.haven}<span data-i18n="c.haven">${esc(t('c.haven'))}</span></a>
          <a class="btn btn--ghost" data-views="maker photo luma" href="#contact" data-k="${esc(site.contact.signal)}" rel="nofollow noreferrer noopener">${I.signal}<span data-i18n="c.signal">${esc(t('c.signal'))}</span></a>
        </div>
        <p class="reach__out" id="email-out" aria-live="polite" hidden></p>
        <noscript><p class="lede">Email is hidden from bots and needs JavaScript. LinkedIn works without it.</p></noscript>
        <p class="sky__tools reveal" data-views="maker photo luma"><button class="btn btn--ghost btn--sm" type="button" id="sky-planetarium" aria-pressed="false" data-enter="${esc(t('sky.planetarium'))}" data-exit="${esc(t('sky.planetarium.exit'))}" data-i18n-attr="data-enter:sky.planetarium;data-exit:sky.planetarium.exit" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M7.6 14.6C4.6 16 2.7 17.3 3 18c.5 1.200 5-.3 10-3.200s8.500-6 8-7.200c-.3-.7-2.300-.4-5 .5"/></svg><span id="sky-planetarium-l" data-i18n="sky.planetarium">${esc(t('sky.planetarium'))}</span></button><button class="btn btn--ghost btn--sm" type="button" id="sky-open" aria-expanded="false" aria-controls="sky-controls" hidden>${I.clock}<span data-i18n="sky.controls">${esc(t('sky.controls'))}</span></button></p>
        <div id="sky-controls" class="sky__controls" data-views="maker photo luma" hidden></div>
        <ul class="social reveal">
${site.social.map((s) => `          <li${/^(youtube|instagram|x|twitter)$/i.test(s.icon) || /youtube|instagram|x\.com|twitter/i.test(s.href) ? ' data-views="maker photo luma"' : ''}><a href="${esc(s.href)}" rel="me noopener" aria-label="${esc(s.name)}" title="${esc(s.name)}">${I[s.icon]}</a></li>`).join('\n')}
        </ul>

        <div class="tui reveal" data-views="maker photo luma">
          <div>
            ${T('tui.h', 'strong')}
            ${T('tui.p', 'span')}
          </div>
          <div class="tui__cmd">
            <code id="tui-cmd">${esc(TUI_CMD)}</code>
            <button type="button" id="tui-copy" data-copied="${esc(t('tui.copied'))}" data-i18n-attr="data-copied:tui.copied"><span data-i18n="tui.copy">${esc(t('tui.copy'))}</span></button>
          </div>
        </div>
      </div>

      <footer class="foot">
        <button class="foot__tm" type="button" id="tm-open" data-views="maker photo luma" aria-haspopup="dialog">${I.clock}<span data-i18n="tm.title">${esc(t('tm.title'))}</span></button>
        <button class="foot__tm" type="button" id="off-open" aria-haspopup="dialog" hidden>${I.down}<span data-i18n="off.title">${esc(t('off.title'))}</span></button>
        <p><span>© <span id="year">${new Date().getFullYear()}</span> ${esc(site.name)}</span> · <span data-i18n="foot.made">${esc(t('foot.made'))}</span> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a><span data-views="maker photo luma"> · <a href="/trail/" data-i18n="foot.trail">${esc(t('foot.trail'))}</a></span></p>
      </footer>
    </section>
  </main>

  <dialog class="search" id="search" aria-label="${esc(t('nav.search'))}">
    <form method="dialog" class="search__box">
      <label class="search__field">${I.search}
        <input type="search" id="search-q" autocomplete="off" spellcheck="false" placeholder="${esc(t('search.placeholder'))}" data-i18n-attr="placeholder:search.placeholder" aria-controls="search-r" aria-autocomplete="list">
      </label>
      <button class="search__x" aria-label="${esc(t('ph.close'))}" data-i18n-attr="aria-label:ph.close">${I.close}</button>
    </form>
    <ul class="search__r" id="search-r" role="listbox" aria-label="${esc(t('nav.search'))}"></ul>
    <p class="search__hint" id="search-hint" data-i18n="search.hint" data-empty="${esc(t('search.empty'))}" data-i18n-attr="data-empty:search.empty">${esc(t('search.hint'))}</p>
    <template id="search-kinds">${['project', 'page', 'photo', 'section'].map((k) => `<span data-kind="${k}" data-i18n="search.k.${k}">${esc(t('search.k.' + k))}</span>`).join('')}</template>
  </dialog>

  <div class="xr-offer" id="xr-offer" role="region" aria-label="VR" hidden>
    ${I.xr}<span data-i18n="xr.offer">${esc(t('xr.offer'))}</span>
    <a class="btn btn--solid btn--sm" href="/xr/?enter=1"><span data-i18n="xr.go">${esc(t('xr.go'))}</span>${I.arrow}</a>
    <button type="button" id="xr-no" data-i18n="xr.no">${esc(t('xr.no'))}</button>
  </div>

  <dialog class="tm" id="tm" aria-labelledby="tm-h">
    <form method="dialog"><button class="sheet__x" aria-label="${esc(t('ph.close'))}" data-i18n-attr="aria-label:ph.close">${I.close}</button></form>
    <h2 id="tm-h">${I.clock}<span data-i18n="tm.title">${esc(t('tm.title'))}</span></h2>
    ${T('tm.p', 'p')}
    <div class="tm__grid">
${['newyear', 'easter', 'memorial', 'birthday', 'july4', 'summer', 'fall', 'halloween', 'luma', 'veterans', 'christmas'].flatMap((d) => (d === 'summer' && novaBorn ? ['nova', d] : [d])).map((d) => `      <a href="/?${d === 'luma' || d === 'nova' ? 'v=dog&amp;' : ''}when=${d}" data-when="${d}" data-i18n="tm.d.${d}">${esc(t('tm.d.' + d))}</a>`).join('\n')}
    </div>
    <form class="tm__date" id="tm-form">
      <label><span data-i18n="tm.pick">${esc(t('tm.pick'))}</span><input type="datetime-local" id="tm-input" required></label>
      <button class="btn btn--solid" type="submit" data-i18n="tm.go">${esc(t('tm.go'))}</button>
    </form>
    <a class="tm__now" href="/" data-tm-now hidden data-i18n="tm.now">${esc(t('tm.now'))}</a>
  </dialog>

  <dialog class="tm off" id="off" aria-labelledby="off-h" ${['save', 'none', 'part', 'saving', 'done', 'full'].map((k) => `data-${k}="${esc(t('off.' + k))}"`).join(' ')} data-i18n-attr="${['save', 'none', 'part', 'saving', 'done', 'full'].map((k) => `data-${k}:off.${k}`).join(';')}">
    <form method="dialog"><button class="sheet__x" aria-label="${esc(t('ph.close'))}" data-i18n-attr="aria-label:ph.close">${I.close}</button></form>
    <h2 id="off-h">${I.down}<span data-i18n="off.title">${esc(t('off.title'))}</span></h2>
    ${T('off.p', 'p')}
    <p class="off__state" id="off-state" role="status"></p>
    <progress class="off__bar" id="off-bar" max="1" value="0" hidden></progress>
    <div class="off__acts">
      <button class="btn btn--solid" type="button" id="off-save" hidden></button>
      <button class="off__plain" type="button" id="off-stop" hidden data-i18n="off.stop">${esc(t('off.stop'))}</button>
      <button class="off__plain" type="button" id="off-remove" hidden data-i18n="off.remove">${esc(t('off.remove'))}</button>
    </div>
  </dialog>

  <div class="tm-bar" id="tm-bar" role="status" hidden>
    <span class="tm-bar__l" data-i18n="tm.dest">${esc(t('tm.dest'))}</span>
    <output class="tm-bar__d" id="tm-date"></output>
    <button type="button" id="tm-change" aria-label="${esc(t('tm.title'))}" data-i18n-attr="aria-label:tm.title">${I.clock}</button>
    <a href="/" data-tm-now data-i18n="tm.now">${esc(t('tm.now'))}</a>
  </div>

  <dialog class="sheet" id="sheet" aria-labelledby="sheet-t">
    <form method="dialog"><button class="sheet__x" aria-label="${esc(t('ph.close'))}" data-i18n-attr="aria-label:ph.close">${I.close}</button></form>
    <header class="sheet__head">
      <img id="sheet-i" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="" width="104" height="104">
      <div>
        <h2 id="sheet-t"></h2>
        <p id="sheet-g"></p>
        <div class="sheet__cta">
          <a class="btn btn--solid" id="sheet-u" href="/apps/"><span data-i18n="sheet.open">${esc(t('sheet.open'))}</span>${I.arrow}</a>
          <a class="btn btn--line" id="sheet-s" href="#" hidden rel="noopener">App Store</a>
          <a class="btn btn--line" id="sheet-p" href="#" hidden rel="noopener">Google Play</a>
          <a class="btn btn--line" id="sheet-ms" href="#" hidden rel="noopener">Microsoft Store</a>
          <a class="btn btn--line" id="sheet-src" href="#" hidden rel="noopener" data-i18n="sheet.source">${esc(t('sheet.source'))}</a>
        </div>
      </div>
    </header>
    <dl class="sheet__meta" id="sheet-m" data-released="${esc(t('sheet.released'))}" data-price="${esc(t('sheet.price'))}" data-free="${esc(t('sheet.free'))}" data-screens="${esc(t('sheet.screens'))}" data-i18n-attr="data-released:sheet.released;data-price:sheet.price;data-free:sheet.free;data-screens:sheet.screens"></dl>
    <div class="shots" id="sheet-shots" tabindex="0"></div>
    <p class="sheet__desc" id="sheet-d"></p>
    <ul class="chips" id="sheet-c"></ul>
  </dialog>

  <div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="${esc(t('ph.h'))}" hidden>
    <div class="lb__stage" id="lb-stage"><img class="lb__img" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt=""><img class="lb__img" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt=""></div>
    <div class="lb__frame" id="lb-frame" hidden></div>
    <button class="lb__play" type="button" id="lb-video" hidden aria-label="${esc(t('ph.video'))}" data-i18n-attr="aria-label:ph.video">${I.play}</button>
    <div class="lb__bar">
      <p class="lb__cap" id="lb-cap" aria-live="polite"></p>
      <span class="lb__n" id="lb-n"></span>
      <a id="lb-puzzle" href="/puzzles/" aria-label="${esc(t('ph.puzzle'))}" title="${esc(t('ph.puzzle'))}" data-i18n-attr="aria-label:ph.puzzle;title:ph.puzzle">${I.puzzle}</a>
      <button type="button" id="lb-play" aria-pressed="false" aria-label="${esc(t('ph.play'))}" data-i18n-attr="aria-label:ph.play">${I.play}${I.pause}</button>
      <button type="button" id="lb-prev" aria-label="${esc(t('ph.prev'))}" data-i18n-attr="aria-label:ph.prev">${I.prev}</button>
      <button type="button" id="lb-next" aria-label="${esc(t('ph.next'))}" data-i18n-attr="aria-label:ph.next">${I.next}</button>
      <button type="button" id="lb-close" aria-label="${esc(t('ph.close'))}" data-i18n-attr="aria-label:ph.close">${I.close}</button>
    </div>
  </div>

  <template id="meta-icons">
    <span data-i="phone">${I.cam_phone}</span><span data-i="camera">${I.cam_camera}</span><span data-i="film">${I.cam_film}</span><span data-i="drone">${I.cam_drone}</span>
    <span data-i="date"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg></span>
    <span data-i="lens"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg></span>
    <span data-i="focal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12 20 4.5M3 12l17 7.5M20 4.5v15"/><path d="M9 9.4a6 6 0 0 1 0 5.2"/></svg></span>
    <span data-i="aperture"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m12 3.5 3.7 6.4M20.5 12h-7.4M16.2 19.4l-3.7-6.4M12 20.5l-3.7-6.4M3.5 12h7.4M7.8 4.6l3.7 6.4"/></svg></span>
    <span data-i="shutter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 3h5M12 3v3M18.5 7l1.5-1.5"/></svg></span>
    <span data-i="iso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9.5v5M10.5 14.5c1.8.3 2.8-.3 2.8-1.3 0-1.8-2.8-.9-2.8-2.6 0-.900 1-1.4 2.5-1.1" stroke-linecap="round"/><ellipse cx="16.9" cy="12" rx="1.6" ry="2.5"/></svg></span>
  </template>

  <script type="application/json" id="future">${JSON.stringify({
    founderFrom: site.future?.founderFrom || '',
    dogs: { ...(site.future?.dogs || {}), real: [{ name: 'Luma', born: site.luma.born, passed: lumaPassed || '' }, ...(site.future?.dogs?.real || [])] },
    s: Object.fromEntries(Object.keys(site.strings).filter((k) => k.startsWith('fut.') || k.startsWith('lb.')).map((k) => [k, t(k)])),
  }).replace(/</g, '\\u003c')}</script>

  <audio id="bgaudio" src="loop.mp3" preload="none" loop></audio>
  <script type="module">
    // The sky behind "Say hello" is the real one for the visitor's time and place (assets/sky).
    const canvas = document.getElementById('stars'), root = document.documentElement;
    const begin = () => import('${stamp('/assets/sky/sky.js')}').then(({ createSky }) => {
      // The time machine (assets/site.js) reloads the page for another date. It leaves the date on <html data-when>
      // and, on the way out, the moment the sky was showing, so the sky can wind from there to here.
      const when = root.dataset.when || new URLSearchParams(location.search).get('when') || '';
      const dated = /^\\d{4}-\\d\\d-\\d\\d(T\\d\\d:\\d\\d)?$/.test(when);
      const at = when.slice(0, 10) + 'T' + (root.dataset.whenTime || when.slice(11, 16) || '21:00') + ':00';
      let from = 0;
      try { const f = JSON.parse(sessionStorage.getItem('sky:from') || 'null'); sessionStorage.removeItem('sky:from'); if (f && Date.now() - f.at < 20000) from = f.time; } catch (e) {}
      const sky = createSky(canvas, { drag: false, labels: false, ...(from ? { time: from } : dated ? { time: at } : {}) });
      if (from) sky.view.travelTo(dated ? at : 'now');
      window.__skyTime = () => sky.model.time;
      const mark = () => { root.dataset.sky = sky.model.sky.isDay ? 'day' : 'night'; };
      mark(); sky.model.on('daynight', mark);
      const btn = document.getElementById('sky-open'), box = document.getElementById('sky-controls');
      const tools = () => import('${stamp('/assets/sky/sky-controls.js')}');
      btn.hidden = false;
      btn.addEventListener('click', async () => {
        if (!box.dataset.ready) {
          const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '${stamp('/assets/sky/sky-controls.css')}'; document.head.appendChild(css);
          const { createSkyControls } = await tools();
          createSkyControls(sky, { container: box }); box.dataset.ready = '1';
        }
        box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden));
      });
      // Planetarium mode: clear the contact block away so the sky can be looked at, dragged and read.
      const pBtn = document.getElementById('sky-planetarium'), pLabel = document.getElementById('sky-planetarium-l');
      const words = () => [pBtn.dataset.enter, pBtn.dataset.exit];      // kept translated by i18n.js
      let planetarium = null;
      const relabel = () => { const w = words(); pLabel.textContent = w[planetarium && planetarium.isOpen() ? 1 : 0]; };
      pBtn.hidden = false;
      pBtn.addEventListener('click', async () => {
        if (planetarium) return;                       // after the first press the toggle owns the button
        const { createPlanetariumToggle } = await tools();
        if (planetarium) return;
        planetarium = createPlanetariumToggle(sky, { host: document.getElementById('contact'), hide: '.sky__inner > :not(.sky__tools):not(.sky__controls)',
          button: pBtn, labelTarget: pLabel, showLabel: words()[0], hideLabel: words()[1],
          onChange: (on) => { setTimeout(relabel, 0); if (on) window.scrollTo({ top: document.getElementById('contact').getBoundingClientRect().top + window.scrollY, behavior: 'instant' }); } });
        planetarium.open();
      });
      document.addEventListener('i18n:applied', relabel);
    }).catch(() => {});
    // The sky and its star catalogue load when the visitor gets near them, not with the page.
    if (canvas && canvas.getContext) {
      const sec = canvas.closest('section');
      if (!sec || !('IntersectionObserver' in window)) begin();
      else { const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { io.disconnect(); begin(); } }, { rootMargin: '150% 0px' }); io.observe(sec); }
    }
  </script>
</body>
</html>
`;
if (PREVIEW) {   // a look at a state without changing a single published file
  fs.mkdirSync(at('out'), { recursive: true });
  fs.writeFileSync(at('out/preview.html'), index.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="/">\n  <meta name="robots" content="noindex">'));
  console.log('Wrote out/preview.html (open http://localhost:8000/out/preview.html). Nothing else was changed.');
  process.exit(0);
}
// Every file the home page names starts at the root. The page's address changes under it as a
// visitor moves between views (/ to /dogs/ and back, without reloading), and the door pages are
// copies of it one or two folders down, so a relative path would stop pointing at its file.
const rooted = (html) => html.replace(/(["'(]|&quot;|, )((?:slides|assets|apps|projects|panos|trail|profiles|books|puzzles|tools|i18n|og)\/|profile\.jpg|loop\.mp3|blaine\.ttf|favicon\.ico)/g, '$1/$2');
write('index.html', rooted(index));

/* ---------- a front door for each domain ---------- */

// Link previews are read from the HTML as served, and a static host serves one page for every
// ?v=. So the dogs' page and the photography page also live at addresses of their own: the home
// page again, opened in that view, with its own title and poster (scripts/build-og.mjs). Nothing
// redirects, so the address a visitor copies or shares is the one that carries that preview.
// Point each domain's redirect at the first path. assets/site.js keeps the address there.
const DOORS = [
  { paths: ['dogs', 'dog', 'pets'], view: 'luma', domain: 'millers.dog', poster: 'millers-dog', k: 'hero.luma' },
  { paths: ['dogs/luma'], view: 'luma', domain: 'luma.dog', poster: 'luma-dog', k: 'hero.luma' },
  { paths: ['dogs/nova'], view: 'luma', domain: 'supernova.dog', poster: 'supernova-dog', k: 'hero.luma' },
  { paths: ['photos'], view: 'photo', domain: '120.media', poster: '120-media', k: 'hero.photo' },
];
function doorPage(door) {
  const title = strip(t(`${door.k}.h`)), about = strip(t(`${door.k}.p`)), image = `${site.origin}/${stamp(`og/${door.poster}.jpg`)}`;
  const url = `${site.origin}/${door.paths[0]}/`;
  const head = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(about)}">
  <meta name="robots" content="noindex">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${door.domain}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(about)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(`${door.domain}: ${title}`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(about)}">
  <meta name="twitter:image" content="${image}">`;
  // out go the home page's own title, description and preview tags (and its language alternates)
  const own = /^[ \t]*(?:<meta (?:name="(?:description|robots|twitter:[^"]*)"|property="(?:og|profile):[^"]*")[^>]*>|<link rel="(?:canonical|alternate)"[^>]*>)[ \t]*\n/gm;
  const cut = index.indexOf('</head>');
  const top = index.slice(0, cut).replace(own, '').replace(/<title>[^<]*<\/title>/, () => head);
  return rooted(top + index.slice(cut))
    .replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- Generated by scripts/build-site.mjs. The front door for ${door.domain}. -->`)
    .replace('data-view="maker" data-default-view="maker"', `data-view="${door.view}" data-default-view="maker"`);
}
for (const door of DOORS) {
  const html = doorPage(door);
  for (const p of door.paths) write(`${p}/index.html`, html);
}

/* ---------- /hire/ ---------- */

write('hire/index.html', `<!DOCTYPE html>
<!-- Generated by scripts/build-site.mjs. A short, résumé-friendly address for hire mode. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(site.name)} — ${esc(resume.title)}</title>
  <meta name="robots" content="noindex">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(site.name)} — ${esc(resume.title)}">
  <meta property="og:description" content="${esc(resume.summary)}">
  <meta property="og:url" content="${site.origin}/hire/">
  <meta property="og:image" content="${site.origin}/${stamp('og/work.jpg')}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${site.origin}/${stamp('og/work.jpg')}">
  <link rel="canonical" href="${site.origin}/">
  <meta http-equiv="refresh" content="0; url=/?mode=hire">
  <script>location.replace("/?mode=hire" + (location.search ? "&" + location.search.slice(1) : "") + location.hash);</script>
</head>
<body><p><a href="/?mode=hire">${esc(site.name)} — ${esc(resume.title)}</a></p></body>
</html>
`);

/* ---------- résumé ---------- */

// Contour lines for the résumé's corner: the same height field as the Work hero, frozen, as SVG.
function topoSvg(w = 560, h = 300, cell = 4) {
  const GX = [], GY = [];
  for (let n = 0; n < 256; n++) { const a = (n * 0.61803398875 % 1) * 6.2831853; GX[n] = Math.cos(a); GY[n] = Math.sin(a); }
  const corner = (ix, iy, dx, dy) => { let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) & 255; return GX[h] * dx + GY[h] * dy; };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = corner(ix, iy, fx, fy), b = corner(ix + 1, iy, fx - 1, fy), c = corner(ix, iy + 1, fx, fy - 1), d = corner(ix + 1, iy + 1, fx - 1, fy - 1);
    return a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v;
  };
  const height = (gx, gy) => { const x = gx * 0.0125, y = gy * 0.0125; return noise(x, y) + 0.34 * noise(x * 1.9 + 17.3, y * 1.9 + 31.7); };
  const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1, f = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = height(i * 0.9 + 140, j * 0.9 + 40);
  const r = (v) => Math.round(v * 10) / 10;
  // The fade is baked into the lines themselves: every short segment goes into one of a dozen
  // strength buckets by where it sits, strongest toward the top-right and thinning steadily as it
  // runs into the page. No mask or gradient, so a PDF viewer cannot turn the fade into a hard edge.
  const N = 14, cx = w * 0.7, cy = h * 0.28, thin = Array(N).fill(''), bold = Array(N).fill('');
  const fade = (x, y) => {
    const dx = (x - cx) / (x < cx ? cx : w - cx), dy = (y - cy) / (y < cy ? cy : h - cy), d2 = dx * dx + dy * dy;
    return d2 >= 1 ? 0 : (1 - d2) * (1 - d2);
  };
  for (let k = -24; k <= 24; k++) {
    const lv = k * 0.05 + 0.01, into = k % 5 === 0 ? bold : thin;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i + 1], e = f[(j + 1) * nx + i];
      const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (e > lv ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = i * cell, y = j * cell, n = Math.round(fade(x + cell / 2, y + cell / 2) * N);
      if (!n) continue;
      const T = `${r(x + cell * (lv - a) / (b - a))} ${r(y)}`, R = `${r(x + cell)} ${r(y + cell * (lv - b) / (c - b))}`;
      const Bm = `${r(x + cell * (lv - e) / (c - e))} ${r(y + cell)}`, L = `${r(x)} ${r(y + cell * (lv - a) / (e - a))}`;
      const seg = (p, q) => { into[n - 1] += `M${p}L${q}`; };
      if (code === 1 || code === 14) seg(L, Bm); else if (code === 2 || code === 13) seg(Bm, R); else if (code === 3 || code === 12) seg(L, R);
      else if (code === 4 || code === 11) seg(T, R); else if (code === 6 || code === 9) seg(T, Bm); else if (code === 7 || code === 8) seg(L, T);
      else if (code === 5) { seg(L, T); seg(Bm, R); } else if (code === 10) { seg(L, Bm); seg(T, R); }
    }
  }
  const paths = (set, width, strength) => set.map((d, n) => d ? `<path d="${d}" stroke-width="${width}" stroke-opacity="${Math.round((n + 1) / N * strength * 1000) / 1000}"/>` : '').join('');
  return `<svg class="topo" viewBox="0 0 ${w} ${h}" aria-hidden="true" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${paths(thin, 0.55, 0.3)}${paths(bold, 0.9, 0.42)}</svg>`;
}
function resumeHtml({ priv = null, pdf = false, hasPdf = false } = {}) {
  const bare = priv || pdf;   // a document to print, not a page to browse
  const summary = priv?.summary || resume.summary;
  const contact = priv
    ? [priv.phone, priv.email, resume.location].filter(Boolean).map(esc).join(' &nbsp; ')
    : pdf ? esc(resume.location)
    : `<button type="button" id="email" data-k="${esc(site.contact.email)}">Show email</button> &nbsp; ${esc(resume.location)}`;
  return `<!DOCTYPE html>
<!-- Generated by scripts/build-site.mjs from content/resume.json. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(resume.name)} — ${esc(resume.title)} — Resume</title>
  <meta name="description" content="${esc(resume.summary)}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="${site.origin}/resume/">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${esc(resume.name)} — ${esc(resume.title)} — Resume">
  <meta property="og:description" content="${esc(resume.summary)}">
  <meta property="og:url" content="${site.origin}/resume/">
  <meta property="og:image" content="${site.origin}/${stamp('og/resume.jpg')}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${site.origin}/${stamp('og/resume.jpg')}">
  ${bare ? '' : `<link rel="icon" type="image/jpeg" href="/${avatar}">`}
  <style>
    :root { --ink: #14181f; --soft: #4b5563; --line: #d7dbe2; --paper: #fff; --desk: #eef0f3; --accent: #0b62c4; }
    @media (prefers-color-scheme: dark) { :root { --ink: #eef2f8; --soft: #a3aec2; --line: #2a3345; --paper: #0e1420; --desk: #070b14; --accent: #6cb6ff; } }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--desk); color: var(--ink); font: 10.4pt/1.38 -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif; }
    .bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; max-width: 8.5in; margin: 0 auto; padding: 16px 20px; }
    .bar a, .bar button, #email { font: inherit; color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    .bar button { border: 1px solid currentColor; border-radius: 999px; padding: 8px 16px; text-decoration: none; font-weight: 600; }
    .page { position: relative; overflow: hidden; background: var(--paper); max-width: 8.5in; margin: 0 auto 40px; padding: .5in .55in; border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,.18); }
    header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 18px; margin-bottom: 10px; }
    h1 { font-size: 21pt; font-weight: 400; margin: 0; letter-spacing: -.01em; } h1 small { font-size: 14pt; }
    header p { margin: 0; text-align: right; } header a { color: inherit; }
    @media screen { header p a { display: inline-block; padding: 7px 4px; } }   /* room for a fingertip; print is unchanged */
    h2 { font-size: 10.4pt; letter-spacing: .04em; text-transform: uppercase; margin: 12px 0 2px; color: var(--accent); }
    h2::after { content: ""; display: block; height: 1px; margin-top: 2px; background: linear-gradient(to right, var(--accent), transparent 70%); opacity: .5; }
    h1 small { color: var(--accent); }
    /* a pale watermark of contour lines behind the top-right of the sheet: light enough that
       text reads straight over it, and it fades to nothing before every edge */
    .topo { position: absolute; top: -.25in; right: -.2in; width: 66%; height: 2.9in; color: var(--accent); pointer-events: none; }
    .meta { color: var(--accent); }
    .side h3 { color: var(--accent); }
    li::marker { color: var(--accent); }
    header a, .side a { color: var(--accent); text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent); }
    h3 b { color: var(--ink); }
    .page > header, .page > .cols { position: relative; }
    h3 { font-size: 10.4pt; margin: 8px 0 0; font-weight: 400; } h3 b { font-weight: 700; }
    p { margin: 0; } ul { margin: 0; padding-left: 1.1em; } .meta { color: var(--soft); }
    .cols { display: grid; grid-template-columns: 1.85fr 1fr; gap: 0 .35in; }
    .side h3 { font-weight: 700; } a { color: inherit; overflow-wrap: anywhere; }
    @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } .page { padding: 24px 20px; border-radius: 0; } header p { text-align: left; } }
    @page { size: letter; margin: .32in .45in; }
    @media print {
      :root { --ink: #000; --soft: #333; --paper: #fff; --desk: #fff; --accent: #0b4f9e; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .topo { top: -.2in; right: -.15in; width: 5.4in; height: 2.9in; }
      body { font-size: 8.6pt; line-height: 1.22; } h1 { font-size: 19pt; } h2 { font-size: 9pt; margin-top: 9px; } h3 { font-size: 9pt; margin-top: 6px; } .bar { display: none; } .page { box-shadow: none; margin: 0; padding: 0; max-width: none; border-radius: 0; }
      .cols { grid-template-columns: 1.75fr 1fr; gap: 0 .28in; } h3, li { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${bare ? '' : `<div class="bar"><a href="/?mode=hire">← ${esc(resume.name)}</a>${hasPdf ? `<a href="${RESUME_PDF}" download style="margin-left:auto">Download PDF</a>` : ''}<button type="button" onclick="print()">Print or save as PDF</button></div>`}
  <main class="page">
    ${topoSvg()}
    <header>
      <h1>${esc(resume.name)} <small>${esc(resume.title)}</small></h1>
      <p>${contact}<br>${resume.links.map((l) => `<a href="${esc(l)}">${esc(l)}</a>`).join(' &nbsp; ')}</p>
    </header>
    <div class="cols">
      <div>
        <h2>Summary</h2>
        <p id="summary"${bare ? '' : ` data-cleared="${encode(resume.private?.summary || '')}"`}>${esc(summary)}</p>
        <h2>Experience</h2>
${resume.experience.map((j) => `        <h3><b>${esc(j.role)}</b> at ${esc(j.company)}</h3>
        <p class="meta">${esc(j.start)} - ${esc(j.end)} ${esc(j.place)}</p>
        <p>${esc(j.field)}</p>
        <ul>${j.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('\n')}
        <h2>Education</h2>
${resume.education.map((e) => `        <p><b>${esc(e.degree)}</b>, ${esc(e.detail)}</p>
        <p class="meta">${esc(e.school)} ${esc(e.start)} - ${esc(e.end)}</p>`).join('\n')}
      </div>
      <div class="side">
        <h2>Skills</h2>
${resume.skills.map((g) => `        <h3>${esc(g.years)}</h3>
        <p>${g.items.map(esc).join(', ')}</p>`).join('\n')}
        <h2>Independent projects</h2>
${resume.projects.map((p) => `        <h3>${esc(p.title)} <span class="meta" style="font-weight:400">${esc(p.start)} - ${esc(p.end)}</span></h3>
        <p>${esc(p.text)}</p>
        <ul><li><a href="${esc(p.url)}">${esc(p.url)}</a></li><li>${esc(p.built)}</li></ul>`).join('\n')}
      </div>
    </div>
  </main>
  ${bare ? '' : `<script>(function(){var b=document.getElementById("email");if(!b)return;b.addEventListener("click",function(){var s=atob(b.getAttribute("data-k")),o="";for(var i=s.length-1;i>=0;i--)o+=String.fromCharCode(s.charCodeAt(i)^${KEY});var a=document.createElement("a");a.href=o;a.textContent=o.replace(/^mailto:/,"");b.replaceWith(a)})})();(function(){if(!new URLSearchParams(location.search).has("cleared"))return;var p=document.getElementById("summary"),k=p.getAttribute("data-cleared");if(!k)return;var s=atob(k),o="";for(var i=s.length-1;i>=0;i--)o+=String.fromCharCode(s.charCodeAt(i)^${KEY});p.textContent=decodeURIComponent(escape(o))})();</script>`}
</body>
</html>
`;
}
const RESUME_PDF = `${site.name.replace(/[^A-Za-z0-9]+/g, '-')}-Resume.pdf`;
const CHROMES = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
// The public PDF (no phone, no email) is printed from the same template by a headless Chrome, and
// only when the résumé actually changed: a PDF's bytes differ on every print, and regenerating
// it each build would mean a new commit each build.
{
  const html = resumeHtml({ pdf: true });
  const hash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
  const have = exists('resume/pdf.hash') ? read('resume/pdf.hash').trim() : '';
  const chrome = CHROMES.find((p) => fs.existsSync(p));
  if (!CHECK && hash !== have) {
    if (!chrome) console.warn('  ! no Chrome found, so resume/' + RESUME_PDF + ' was not refreshed');
    else {
      fs.mkdirSync(at('out'), { recursive: true });
      fs.writeFileSync(at('out/resume-public.html'), html);
      try {
        execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${at('resume', RESUME_PDF)}`, 'file://' + at('out/resume-public.html')], { stdio: 'ignore', timeout: 60000 });
        fs.writeFileSync(at('resume/pdf.hash'), hash + '\n');
        written.push(`resume/${RESUME_PDF}`);
      } catch (e) { console.warn('  ! could not print the résumé PDF: ' + (e.message || e).split('\n')[0]); }
    }
  }
}
write('resume/index.html', resumeHtml({ hasPdf: exists(`resume/${RESUME_PDF}`) }));

if (argv.includes('--pdf')) {
  const priv = { ...resume.private, ...(exists('content/private.json') ? json('content/private.json') : {}) };
  if (!priv.email && site.contact.email) priv.email = decode(site.contact.email).replace(/^mailto:/, '');
  const chrome = CHROMES.find((p) => fs.existsSync(p));
  fs.mkdirSync(at('out'), { recursive: true });
  fs.writeFileSync(at('out/resume.html'), resumeHtml({ priv }));
  if (!chrome) {
    console.log('No Chrome found. Open out/resume.html and print it to PDF.');
  } else {
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${at('out/Blaine Miller Resume.pdf')}`, 'file://' + at('out/resume.html')], { stdio: 'ignore' });
    console.log('Wrote out/Blaine Miller Resume.pdf');
  }
}

/* ---------- i18n: the English dictionary is derived, never hand-edited ---------- */

const en = { ...S };
en['hello-i-m-blaine.854c20'] = "Hello, I'm Blaine Miller";
for (const p of featured) en[`ft.${p.id}`] = p.tagline || '';
resume.experience.forEach((j, i) => {
  en[`job.${i}.role`] = j.role; en[`job.${i}.field`] = j.field; en[`job.${i}.place`] = j.place;
  j.bullets.forEach((x, n) => { en[`job.${i}.b${n}`] = x; });
});
resume.skills.forEach((g, i) => { en[`sk.${i}`] = g.years; });
resume.education.forEach((e, i) => { en[`edu.${i}.degree`] = e.degree; en[`edu.${i}.detail`] = e.detail; });
for (const p of photos) {
  en[`ph.${p.id}.alt`] = p.alt;
  if (p.title) en[`ph.${p.id}.t`] = p.title;
  if (p.caption) en[`ph.${p.id}.c`] = p.caption;
}
for (const p of projects) {
  en[`tl.${p.id}.date`] = p.dateLabel;
  en[`tl.${p.id}.desc`] = p.description;
  // Only sentence-like tags (the awards) are worth translating; tech names stay as written.
  for (const tag of p.stack) if (tag.split(' ').length > 3) en[`tag.${slug(tag)}`] = tag;
}
const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
write('i18n/index.en.json', JSON.stringify(sorted(en), null, 2) + '\n');

const missing = {};
for (const lang of LANGS.slice(1)) {
  const file = `i18n/index.${lang}.json`;
  const dict = exists(file) ? json(file) : {};
  const gaps = Object.keys(en).filter((k) => !(k in dict));
  if (gaps.length) missing[lang] = gaps;
}

/* ---------- app previews: an App Store style sheet, built from each app's own screenshots ---------- */

const sheets = {};
for (const p of projects) {
  const slugDir = p.link.startsWith('/apps/') ? p.link.replace(/^\/|\/$/g, '') : null;
  const o = { t: p.title, g: p.tagline || '', u: p.link, i: p.bigIcon ? stamp(p.bigIcon) : '', d: p.description, k: p.stack, r: p.dateLabel };
  if (p.app) {
    if (p.app.app_store_url) o.s = p.app.app_store_url;
    if (p.app.play_store_url) o.p = p.app.play_store_url;
    if (p.app.ms_store_url) o.m = p.app.ms_store_url;
    if (p.app.source_url) o.src = p.app.source_url;
    if (p.app.price === 'free') o.free = 1;
  }
  const dir = slugDir && `${slugDir}/assets/screens`;
  if (dir && exists(`${dir}/en`)) {
    const langsHave = LANGS.filter((l) => exists(`${dir}/${l}`));
    const scenes = {};
    for (const f of fs.readdirSync(at(dir, 'en')).sort()) {
      const m = f.match(/^(\d\d-[a-z0-9-]+?)-(\d+)\.webp$/);
      if (m) (scenes[m[1]] ||= []).push(Number(m[2]));
    }
    o.base = `/${dir}/`;
    o.shots = Object.entries(scenes).slice(0, 8).map(([name, widths]) => {
      widths.sort((a, b) => a - b);
      const [small, large] = [widths[0], widths[widths.length - 1]];
      const { w, h } = webpSize(at(dir, 'en', `${name}-${large}.webp`));
      const langs = langsHave.filter((l) => exists(`${dir}/${l}/${name}-${small}.webp`) && exists(`${dir}/${l}/${name}-${large}.webp`));
      return { n: name, a: small, b: large, w, h, l: langs, x: name.replace(/^\d\d-/, '').replace(/-/g, ' ') };
    });
  }
  // No framed set? `gallery` in content/projects.json names plain screenshots to show instead;
  // they are resized once into projects/shots/<id>/ (needs sharp) so the strip stays light.
  if (!o.shots?.length && p.gallery?.length) {
    o.shots = [];
    for (const src of p.gallery) {
      if (!exists(src)) { console.warn(`  ! content/projects.json → ${p.id}.gallery: ${src} does not exist`); continue; }
      const name = path.basename(src).replace(/\.[a-z]+$/i, '');
      const out = `projects/shots/${p.id}/${name}.webp`;
      if (sharp && !CHECK && !exists(out)) {
        fs.mkdirSync(at('projects/shots', p.id), { recursive: true });
        await sharp(at(src)).resize({ height: 960, withoutEnlargement: true }).webp({ quality: 74 }).toFile(at(out));
        written.push(out);
      }
      if (!exists(out)) continue;
      const { w, h } = webpSize(at(out));
      o.shots.push({ src: stamp(out), w, h, x: name.replace(/-/g, ' ') });
    }
  }
  if (p.link) sheets[p.id] = o;
}
write('app-sheets.json', JSON.stringify(sheets) + '\n');

/* ---------- search index ---------- */

const entries = [];
const sections = [['#work', 'work.h'], ['#projects', 'tl.h'], ['#gallery', 'ph.h'], ['/?mode=hire#experience', 'exp.h'], ['/resume/', 'exp.resume'],
  ['/?v=dog', 'luma.h'], ['#contact', 'c.h'], ['#contact', 'tui.h']];
for (const [u, k] of sections) entries.push({ k: 'section', t: t(k), i: k, u });
for (const p of projects) {
  entries.push({ k: 'project', t: p.title, d: p.tagline || strip(p.description).slice(0, 110), u: p.link || `/#p-${p.id}`,
    x: [p.stack.join(' '), strip(p.description)].join(' ').toLowerCase(), i: `tl.${p.id}.desc`, c: p.icon ? `projects/${p.icon}` : '' });
}
const skipDir = /^(node_modules|\.git|\.claude|scripts|out|content|profiles|i18n|slides|hire|edit|assets)$/;
(function walk(dir) {
  for (const e of fs.readdirSync(at(dir), { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || (dir === '' && skipDir.test(e.name)) || e.name === 'node_modules') continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    const page = `${rel}/index.html`;
    if (exists(page)) {
      const html = read(page).slice(0, 12000);
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
      const desc = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] || '';
      const redirect = /http-equiv=["']refresh["']/i.test(html) || /name=["']robots["'][^>]*noindex/i.test(html);
      const url = `/${rel}/`;
      if (title && !redirect && !entries.some((x) => x.u === url)) {
        entries.push({ k: 'page', t: strip(title), d: strip(desc).slice(0, 110), u: url, x: strip(desc).toLowerCase() });
      }
    }
    if (rel.split('/').length < 4) walk(rel);
  }
})('');
for (const p of photos) {
  const label = p.title || p.alt;
  if (label) entries.push({ k: 'photo', t: label, d: p.caption, u: `/#${p.id}`, x: [p.alt, p.caption, p.tags.join(' ')].join(' ').toLowerCase(), c: p.thumb });
}
// The trail's guide is the real dog of the day: Luma first, then whoever is added to future.dogs.real.
// A later dog may have its own photographs at trail/guide-<name>.webp and trail/guide-<name>-big.webp.
write('trail/guide.json', JSON.stringify({ dogs: [{ name: 'Luma', born: site.luma.born, passed: site.luma.passed || '' }, ...(site.future?.dogs?.real || []).filter((d) => fs.existsSync(path.join(ROOT, 'trail', `guide-${String(d.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`)))].map((d) => {
  const slug = String(d.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'), pic = (f) => (fs.existsSync(path.join(ROOT, 'trail', f)) ? '/trail/' + f : undefined);
  return { name: d.name, born: d.born || '', passed: d.passed || '', photo: d.name === 'Luma' ? undefined : pic(`guide-${slug}.webp`), photoBig: d.name === 'Luma' ? undefined : pic(`guide-${slug}-big.webp`) };
}) }, null, 1) + '\n');
write('search-index.json', JSON.stringify(entries.map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v)))) + '\n');

/* ---------- terminal UI ---------- */

// Single-quoted shell literal.
const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const wrap = (s, n = 72) => strip(s).replace(new RegExp(`(.{1,${n}})(\\s+|$)`, 'g'), '$1\n').trimEnd();
const absolute = (u) => (u.startsWith('/') ? site.origin + u : u);
const rot = (s) => s.replace(/[a-z]/gi, (c) => { const base = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base); });
// Safe inside a double-quoted shell string.
const dq = (s) => String(s).replace(/[\\"$`]/g, '\\$&');
const emailPlain = site.contact.email ? decode(site.contact.email).replace(/^mailto:/, '') : '';

// English text for the terminal app is plain ASCII, so it shows on any terminal; other languages
// are UTF-8, and the renderer (awk, in scripts/tui.template.sh) measures their display width.
const ascii = (v) => strip(String(v ?? '')).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/·/g, '|').replace(/°/g, ' deg').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
const rec = (...f) => f.map(ascii).join('\t');
const host = site.origin.replace(/^https?:\/\//, '');
const skillCount = resume.skills.reduce((n, g) => n + g.items.length, 0);
const allYears = []; for (let y = firstYear; y <= Number(years[0]); y++) allYears.push(String(y));
const tagged = (tag) => photos.filter((ph) => ph.tags.includes(tag)).length;
// A year of GitHub contributions for the terminal app's overview. Read from the public profile
// calendar at build time and cached in profiles/contributions.json, so a build with no network
// (or --check) reuses the last copy instead of failing.
const ghUser = (site.social.find((x) => x.icon === 'github')?.href || '').split('/').filter(Boolean).pop();
let contrib = exists('profiles/contributions.json') ? json('profiles/contributions.json') : null;
if (!CHECK && ghUser && !argv.includes('--offline')) {
  try {
    const res = await fetch(`https://github.com/users/${ghUser}/contributions`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (site build)' }, signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const days = [...html.matchAll(/data-date="(\d{4}-\d\d-\d\d)"[^>]*data-level="(\d)"/g)].map((m) => [m[1], Number(m[2])]).sort((a, b) => a[0].localeCompare(b[0]));
    const total = (html.match(/([\d,]+)\s+contributions?\s+in the last year/) || [])[1];
    if (res.ok && days.length > 300 && total) contrib = { ...(contrib || {}), total, days };
  } catch { /* offline: keep the cached copy */ }
  // Earlier years too, one calendar year each, back to the year the account was made, for the
  // terminal app's time machine. A past year is fetched once and kept; this year is refreshed.
  // Any failure just leaves that year out ("no data"), never the build.
  const gh = { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (site build)' };
  const years = { ...(contrib?.years || {}) };
  let first = contrib?.first;
  if (!first) {
    try {
      const r = await fetch(`https://api.github.com/users/${ghUser}`, { headers: { 'User-Agent': 'site build' }, signal: AbortSignal.timeout(8000) });
      if (r.ok) first = Number(String((await r.json()).created_at || '').slice(0, 4)) || undefined;
    } catch { /* leave it unknown */ }
  }
  const thisYear = new Date().getFullYear();
  for (let y = first || thisYear; y <= thisYear; y++) {
    if (years[y] && y < thisYear) continue;
    try {
      const res = await fetch(`https://github.com/users/${ghUser}/contributions?from=${y}-01-01&to=${y}-12-31`, { headers: gh, signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      const lv = Object.fromEntries([...html.matchAll(/data-date="(\d{4}-\d\d-\d\d)"[^>]*data-level="(\d)"/g)].map((m) => [m[1], m[2]]));
      const total = (html.match(new RegExp(`([\\d,]+)\\s+contributions?\\s+in\\s+${y}`)) || [])[1];
      if (!res.ok || !total) continue;
      let levels = '';                                    // one character a day from 1 January
      for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) levels += lv[d.toISOString().slice(0, 10)] ?? '0';
      years[y] = { total, levels };
    } catch { /* no data for that year */ }
  }
  if (contrib) {
    contrib = { ...contrib, ...(first ? { first } : {}), years };
    write('profiles/contributions.json', JSON.stringify(contrib) + '\n');
  }
}
let heat = '';
if (contrib?.days?.length) {
  const lead = new Date(contrib.days[0][0] + 'T12:00:00Z').getUTCDay();   // the first column starts on Sunday
  heat = '.'.repeat(lead) + contrib.days.map((d) => d[1]).join('');
  heat += '.'.repeat((7 - (heat.length % 7)) % 7);
}

// Photographs for the terminal app, as xterm-256 colour indexes (two hex digits a pixel), drawn
// there with half-block characters. Made with sharp when it is installed, cached otherwise.
const ART = [
  [1, 'bmp-17.webp'], [1, 'bmp-0.webp'], [1, 'bmp-7.webp'],
  [2, 'bmp-26.webp'], [2, 'bmp-9.webp'], [2, 'bmp-32.webp'],
  [3, 'bmp-62.webp'], [3, 'bmp-63.webp'], [3, 'bmp-68.webp'],
  [4, 'bmp-11.webp'], [4, 'bmp-21.webp'],
  [5, 'bmp-73.webp'], [5, 'bmp-183.webp'],
  [6, 'bmp-100.webp'], [6, 'bmp-3.webp'],
];
const artCachePath = 'slides/thumbs/tui-art.json';
const artCache = exists(artCachePath) ? json(artCachePath) : {};
const artNext = {};
const CUBE = [0, 95, 135, 175, 215, 255];
const nearestCube = (v) => CUBE.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(CUBE[best] - v) ? i : best), 0);
function xterm(r, g, b) {
  const [ri, gi, bi] = [nearestCube(r), nearestCube(g), nearestCube(b)];
  const cubeDist = (CUBE[ri] - r) ** 2 + (CUBE[gi] - g) ** 2 + (CUBE[bi] - b) ** 2;
  const grey = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const gv = 8 + grey * 10;
  const greyDist = (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2;
  return greyDist < cubeDist ? 232 + grey : 16 + 36 * ri + 6 * gi + bi;
}
for (const [, file] of ART) {
  const ph = photoBy[file];
  if (!ph) throw new Error(`scripts/build-site.mjs → ART names ${file}, which is not in /slides`);
  const key = `${file}:${nextManifest[file].src}`;
  if (artCache[key]) { artNext[key] = artCache[key]; continue; }
  if (!sharp || CHECK) continue;
  const w = 72, h = Math.max(8, Math.round((72 * ph.h) / ph.w / 2) * 2);
  const raw = await sharp(at('slides', file)).resize(w, h, { fit: 'fill' }).modulate({ saturation: 1.25, brightness: 1.08 }).removeAlpha().raw().toBuffer();
  let hex = '';
  for (let i = 0; i < raw.length; i += 3) hex += xterm(raw[i], raw[i + 1], raw[i + 2]).toString(16).padStart(2, '0');
  artNext[key] = { w, h, px: hex };
}
// each project's icon, small, for the projects tab
const iconRecs = [];
for (let i = 0; i < projects.length; i++) {
  const p = projects[i];
  const src = p.bigIcon || (p.icon ? `projects/${p.icon}` : '');
  if (!src || !exists(src)) continue;
  const key = `icon:${p.id}:${crypto.createHash('sha1').update(fs.readFileSync(at(src))).digest('hex').slice(0, 8)}`;
  if (!artCache[key] && sharp && !CHECK) {
    const raw = await sharp(at(src)).resize(28, 28, { fit: 'cover' }).flatten({ background: '#0c1220' }).removeAlpha().raw().toBuffer();
    let hex = '';
    for (let k = 0; k < raw.length; k += 3) hex += xterm(raw[k], raw[k + 1], raw[k + 2]).toString(16).padStart(2, '0');
    artCache[key] = { w: 28, h: 28, px: hex };
  }
  if (!artCache[key]) continue;
  artNext[key] = artCache[key];
  iconRecs.push(['I', `p${i + 1}`, 28, 28, artCache[key].px, ''].join('\t'));
}
// Every photograph search can find, small, so a search result can show it: 32 pixels wide, one
// character a pixel from a 64-colour palette (4 levels of red, green and blue). About 0.8 KB each.
const MINI_ABC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
const lv4 = (v) => [0, 95, 175, 255].reduce((best, c, i, a) => (Math.abs(c - v) < Math.abs(a[best] - v) ? i : best), 0);
const miniRecs = [];
for (const [i, ph] of photos.filter((x) => x.title || x.alt || x.caption).entries()) {
  if (!nextManifest[ph.file] || !exists(`slides/${ph.file}`)) continue;
  const key = `mini32:${ph.file}:${nextManifest[ph.file].src}`;
  if (!artCache[key] && sharp && !CHECK) {
    const w = 32, h = Math.max(8, Math.min(36, Math.round((32 * ph.h) / ph.w / 2) * 2));
    const raw = await sharp(at('slides', ph.file)).resize(w, h, { fit: 'fill' }).modulate({ saturation: 1.25, brightness: 1.08 }).removeAlpha().raw().toBuffer();
    let px = '';
    for (let k = 0; k < raw.length; k += 3) px += MINI_ABC[lv4(raw[k]) * 16 + lv4(raw[k + 1]) * 4 + lv4(raw[k + 2])];
    artCache[key] = { w, h, px };
  }
  if (!artCache[key]) continue;
  artNext[key] = artCache[key];
  miniRecs.push(['M', i + 1, artCache[key].w, artCache[key].h, artCache[key].px].join('\t'));
}
write(artCachePath, JSON.stringify(artNext) + '\n');
// The terminal app's own words, in every language the site speaks. Names (Blaine Miller, Luma,
// Tom, GitHub), commands, keys (enter, esc, q, r, m, L) and URLs stay as they are. {1} and {2} are
// filled in by the app. Keep them short: they share a terminal line with everything else.
const TUI_UI = {
  en: {
    t1: 'Overview', t2: 'Projects', t3: 'Experience', t4: 'Photography', t5: 'Contact',
    s1: 'Home', s2: 'Projects', s3: 'Work', s4: 'Photos', s5: 'Contact',
    'h.move': 'move', 'h.section': 'section', 'h.search': 'search', 'h.music': 'music', 'h.musicoff': 'music off',
    'h.save': 'save resume', 'h.resume': 'resume', 'h.lang': 'language', 'h.open': 'open', 'h.quit': 'quit',
    'h.type': 'type to search', 'h.jump': 'jump', 'h.cancel': 'cancel', 'h.vol': 'volume',
    small: 'Make this window a little bigger (64 x 16 or more).  q quits.',
    photo: 'Photograph', galleryopen: 'enter opens it in the gallery', typesearch: 'Type to search', nomatch: 'No matches',
    scope: 'projects, work, skills, photos, contact', match1: '1 match', matchn: '{1} matches',
    'k.project': 'project', 'k.work': 'work', 'k.photos': 'photos', 'k.contact': 'contact', 'k.photo': 'photo',
    skills: 'Skills', education: 'Education', numbers: 'By the numbers', byyear: 'Projects by year', latest: 'Latest',
    contrib: '{1} contributions in the last year', less: 'less', more: 'more',
    enteropens: 'enter opens', fullresume: 'enter: full resume', openselected: 'enter opens the selected one', fullresumemd: 'Full resume:',
    'n.apps': 'apps shipped', 'n.media': 'photos & panos', 'n.years': 'years building', 'n.projects': 'projects', 'n.langs': 'langs & tools', 'n.luma': 'Pup photos',
    'g.gallery': 'Gallery', 'g.sky': 'Landscape & sky', 'g.luma': 'Luma & Nova', 'g.panos': '360 panoramas', 'g.books': 'Photo journals', 'g.puzzles': 'Puzzles',
    'c.email': 'Email', 'c.resume': 'Resume', 'c.web': 'Website',
    'm.saved': 'saved {1} in {2}', 'm.offline': 'offline: saved {1}', 'm.nowrite': 'could not write here',
    'm.noplayer': 'no audio player found', 'm.notmp': 'no temporary folder',
    'm.stopped': 'music stopped', 'm.stoppedwhy': 'music stopped: {1}', 'm.tuning': 'tuning in to Tom Jr...',
    'm.vol': 'volume {1}%',
    'h.tm': 'time machine', 'h.now': 'back to now', 'h.fx': 'seasons', 'h.date': 'type a date', 'm.fxon': 'seasonal effects on', 'm.fxoff': 'seasonal effects off', 'm.baddate': 'not a date: {1}', 'contrib.y': '{1} contributions in {2}', 'gh.none': 'nothing on GitHub yet on this date', 'h.help': 'help', 'm.utf': 'other languages need a UTF-8 terminal',
    'h.dot': 'dotfiles', 'dot.title': 'Install my dotfiles?',
    'dot.p': 'For {1}: this saves {2} in your home folder (replacing an older copy) and adds one line to your shell startup files so new shells load it. The first time it loads it may install a few small tools.',
    'dot.keys': 'y installs  /  any other key cancels',
    'm.dotok': 'dotfiles installed: open a new shell to use them', 'm.dotfail': 'could not download the dotfiles', 'm.dotno': 'nothing was installed',
  },
  'zh-Hans': {
    t1: '概览', t2: '项目', t3: '经历', t4: '摄影', t5: '联系',
    s1: '首页', s2: '项目', s3: '经历', s4: '照片', s5: '联系',
    'h.move': '移动', 'h.section': '切换', 'h.search': '搜索', 'h.music': '音乐', 'h.musicoff': '关闭音乐',
    'h.save': '保存简历', 'h.resume': '简历', 'h.lang': '语言', 'h.open': '打开', 'h.quit': '退出',
    'h.type': '输入即可搜索', 'h.jump': '跳转', 'h.cancel': '取消', 'h.vol': '音量',
    small: '请把窗口稍微放大一些（至少 64 x 16）。按 q 退出。',
    photo: '照片', galleryopen: '按 enter 在图库中打开', typesearch: '输入即可搜索', nomatch: '没有结果',
    scope: '项目、经历、技能、照片、联系方式', match1: '1 个结果', matchn: '{1} 个结果',
    'k.project': '项目', 'k.work': '经历', 'k.photos': '照片', 'k.contact': '联系', 'k.photo': '照片',
    skills: '技能', education: '教育经历', numbers: '数据一览', byyear: '每年项目数', latest: '最新',
    contrib: '过去一年 {1} 次贡献', less: '少', more: '多',
    enteropens: '按 enter 打开', fullresume: 'enter：完整简历', openselected: '按 enter 打开所选项', fullresumemd: '完整简历：',
    'n.apps': '已发布应用', 'n.media': '照片与全景', 'n.years': '年开发经验', 'n.projects': '个项目', 'n.langs': '语言与工具', 'n.luma': '狗狗照片',
    'g.gallery': '图库', 'g.sky': '风景与天空', 'g.luma': 'Luma & Nova', 'g.panos': '360° 全景', 'g.books': '摄影日记', 'g.puzzles': '拼图',
    'c.email': '邮箱', 'c.resume': '简历', 'c.web': '网站',
    'm.saved': '已将 {1} 保存到 {2}', 'm.offline': '离线：已保存 {1}', 'm.nowrite': '无法在此处写入',
    'm.noplayer': '找不到音频播放器', 'm.notmp': '无法创建临时文件夹',
    'm.stopped': '音乐已停止', 'm.stoppedwhy': '音乐已停止：{1}', 'm.tuning': '正在连接 Tom Jr...', 'm.vol': '音量 {1}%',
    'h.tm': '时光机', 'h.now': '回到现在', 'h.fx': '节日效果', 'h.date': '输入日期', 'm.fxon': '节日效果已开启', 'm.fxoff': '节日效果已关闭', 'm.baddate': '不是有效日期：{1}', 'contrib.y': '{2} 年共 {1} 次贡献', 'gh.none': '这个日期还没有 GitHub 贡献', 'h.help': '帮助',
    'h.dot': 'dotfiles', 'dot.title': '安装我的 dotfiles？', 'dot.p': '为 {1} 准备：这会将 {2} 保存到你的主目录（替换旧版本），并在 shell 启动文件中添加一行，让新的 shell 自动加载它。首次加载时可能会安装几个小工具。', 'dot.keys': 'y 安装  /  其他任意键取消', 'm.dotok': 'dotfiles 已安装：打开新的 shell 即可使用', 'm.dotfail': '无法下载 dotfiles', 'm.dotno': '未安装任何内容',
  },
  ja: {
    t1: '概要', t2: 'プロジェクト', t3: '経歴', t4: '写真', t5: '連絡先',
    s1: 'ホーム', s2: 'プロジェクト', s3: '経歴', s4: '写真', s5: '連絡先',
    'h.move': '移動', 'h.section': 'セクション', 'h.search': '検索', 'h.music': '音楽', 'h.musicoff': '音楽を止める',
    'h.save': '履歴書を保存', 'h.resume': '履歴書', 'h.lang': '言語', 'h.open': '開く', 'h.quit': '終了',
    'h.type': '入力して検索', 'h.jump': 'ジャンプ', 'h.cancel': 'キャンセル', 'h.vol': '音量',
    small: 'ウィンドウを少し大きくしてください（64 x 16 以上）。q で終了します。',
    photo: '写真', galleryopen: 'enter でギャラリーに開きます', typesearch: '入力して検索', nomatch: '一致なし',
    scope: 'プロジェクト・経歴・スキル・写真・連絡先', match1: '1 件', matchn: '{1} 件',
    'k.project': 'プロジェクト', 'k.work': '経歴', 'k.photos': '写真', 'k.contact': '連絡先', 'k.photo': '写真',
    skills: 'スキル', education: '学歴', numbers: '数字で見る', byyear: '年別プロジェクト', latest: '最新',
    contrib: '過去1年間のコントリビューション {1} 件', less: '少', more: '多',
    enteropens: 'enter で開く', fullresume: 'enter：履歴書の全文', openselected: 'enter で選んだ項目を開きます', fullresumemd: '履歴書の全文：',
    'n.apps': 'リリースアプリ', 'n.media': '写真・パノラマ', 'n.years': '年の開発歴', 'n.projects': 'プロジェクト', 'n.langs': '言語とツール', 'n.luma': '2匹の写真',
    'g.gallery': 'ギャラリー', 'g.sky': '風景と空', 'g.luma': 'Luma & Nova', 'g.panos': '360°パノラマ', 'g.books': 'フォトジャーナル', 'g.puzzles': 'パズル',
    'c.email': 'メール', 'c.resume': '履歴書', 'c.web': 'ウェブサイト',
    'm.saved': '{1} を {2} に保存しました', 'm.offline': 'オフライン：{1} を保存しました', 'm.nowrite': 'ここには保存できません',
    'm.noplayer': 'オーディオプレーヤーが見つかりません', 'm.notmp': '一時フォルダを作れません',
    'm.stopped': '音楽が止まりました', 'm.stoppedwhy': '音楽が止まりました：{1}', 'm.tuning': 'Tom Jr. に接続中...', 'm.vol': '音量 {1}%',
    'h.tm': 'タイムマシン', 'h.now': '現在に戻る', 'h.fx': '季節の演出', 'h.date': '日付を入力', 'm.fxon': '季節の演出をオンにしました', 'm.fxoff': '季節の演出をオフにしました', 'm.baddate': '日付ではありません：{1}', 'contrib.y': '{2}年のコントリビューション {1} 件', 'gh.none': 'この日付にはまだ GitHub の記録がありません', 'h.help': 'ヘルプ',
    'h.dot': 'dotfiles', 'dot.title': '私の dotfiles をインストールしますか？', 'dot.p': '{1} さん向け：ホームフォルダに {2} を保存し（古いコピーは置き換えます）、新しいシェルで読み込まれるようにシェルの起動ファイルに1行追加します。初回の読み込み時にいくつかの小さなツールがインストールされることがあります。', 'dot.keys': 'y でインストール  /  他のキーでキャンセル', 'm.dotok': 'dotfiles をインストールしました：新しいシェルを開いてください', 'm.dotfail': 'dotfiles をダウンロードできませんでした', 'm.dotno': '何もインストールされませんでした',
  },
  de: {
    t1: 'Übersicht', t2: 'Projekte', t3: 'Erfahrung', t4: 'Fotografie', t5: 'Kontakt',
    s1: 'Start', s2: 'Projekte', s3: 'Arbeit', s4: 'Fotos', s5: 'Kontakt',
    'h.move': 'wählen', 'h.section': 'Bereich', 'h.search': 'Suche', 'h.music': 'Musik', 'h.musicoff': 'Musik aus',
    'h.save': 'Lebenslauf speichern', 'h.resume': 'Lebenslauf', 'h.lang': 'Sprache', 'h.open': 'öffnen', 'h.quit': 'beenden',
    'h.type': 'tippen zum Suchen', 'h.jump': 'springen', 'h.cancel': 'abbrechen', 'h.vol': 'Lautstärke',
    small: 'Bitte das Fenster etwas größer ziehen (mind. 64 x 16).  q beendet.',
    photo: 'Foto', galleryopen: 'enter öffnet es in der Galerie', typesearch: 'Zum Suchen tippen', nomatch: 'Keine Treffer',
    scope: 'Projekte, Arbeit, Kenntnisse, Fotos, Kontakt', match1: '1 Treffer', matchn: '{1} Treffer',
    'k.project': 'Projekt', 'k.work': 'Arbeit', 'k.photos': 'Fotos', 'k.contact': 'Kontakt', 'k.photo': 'Foto',
    skills: 'Kenntnisse', education: 'Ausbildung', numbers: 'In Zahlen', byyear: 'Projekte pro Jahr', latest: 'Neu',
    contrib: '{1} Beiträge im letzten Jahr', less: 'weniger', more: 'mehr',
    enteropens: 'enter öffnet', fullresume: 'enter: ganzer Lebenslauf', openselected: 'enter öffnet den gewählten Eintrag', fullresumemd: 'Vollständiger Lebenslauf:',
    'n.apps': 'fertige Apps', 'n.media': 'Fotos & Panos', 'n.years': 'Jahre Erfahrung', 'n.projects': 'Projekte', 'n.langs': 'Technologien', 'n.luma': 'Hundefotos',
    'g.gallery': 'Galerie', 'g.sky': 'Landschaft & Himmel', 'g.luma': 'Luma & Nova', 'g.panos': '360°-Panoramen', 'g.books': 'Fototagebücher', 'g.puzzles': 'Puzzles',
    'c.email': 'E-Mail', 'c.resume': 'Lebenslauf', 'c.web': 'Website',
    'm.saved': '{1} in {2} gespeichert', 'm.offline': 'offline: {1} gespeichert', 'm.nowrite': 'kann hier nicht speichern',
    'm.noplayer': 'kein Audioplayer gefunden', 'm.notmp': 'kein temporärer Ordner',
    'm.stopped': 'Musik gestoppt', 'm.stoppedwhy': 'Musik gestoppt: {1}', 'm.tuning': 'Tom Jr. wird eingestellt...', 'm.vol': 'Lautstärke {1} %',
    'h.tm': 'Zeitmaschine', 'h.now': 'zurück ins Jetzt', 'h.fx': 'Jahreszeiten', 'h.date': 'Datum tippen', 'm.fxon': 'Jahreszeiten-Effekte an', 'm.fxoff': 'Jahreszeiten-Effekte aus', 'm.baddate': 'kein Datum: {1}', 'contrib.y': '{1} Beiträge im Jahr {2}', 'gh.none': 'zu diesem Datum noch nichts auf GitHub', 'h.help': 'Hilfe',
    'h.dot': 'dotfiles', 'dot.title': 'Meine dotfiles installieren?', 'dot.p': 'Für {1}: Dies speichert {2} im Home-Ordner (eine ältere Kopie wird ersetzt) und fügt den Shell-Startdateien eine Zeile hinzu, damit neue Shells es laden. Beim ersten Laden werden eventuell ein paar kleine Tools installiert.', 'dot.keys': 'y installiert  /  andere Taste bricht ab', 'm.dotok': 'dotfiles installiert: zum Nutzen neue Shell öffnen', 'm.dotfail': 'dotfiles konnten nicht geladen werden', 'm.dotno': 'nichts wurde installiert',
  },
  fr: {
    t1: 'Aperçu', t2: 'Projets', t3: 'Expérience', t4: 'Photographie', t5: 'Contact',
    s1: 'Accueil', s2: 'Projets', s3: 'Parcours', s4: 'Photos', s5: 'Contact',
    'h.move': 'choisir', 'h.section': 'section', 'h.search': 'chercher', 'h.music': 'musique', 'h.musicoff': 'couper la musique',
    'h.save': 'enregistrer le CV', 'h.resume': 'CV', 'h.lang': 'langue', 'h.open': 'ouvrir', 'h.quit': 'quitter',
    'h.type': 'tapez pour chercher', 'h.jump': 'y aller', 'h.cancel': 'annuler', 'h.vol': 'volume',
    small: 'Agrandissez un peu la fenêtre (64 x 16 au moins).  q pour quitter.',
    photo: 'Photo', galleryopen: 'enter l’ouvre dans la galerie', typesearch: 'Tapez pour chercher', nomatch: 'Aucun résultat',
    scope: 'projets, parcours, compétences, photos, contact', match1: '1 résultat', matchn: '{1} résultats',
    'k.project': 'projet', 'k.work': 'parcours', 'k.photos': 'photos', 'k.contact': 'contact', 'k.photo': 'photo',
    skills: 'Compétences', education: 'Formation', numbers: 'En chiffres', byyear: 'Projets par année', latest: 'Récents',
    contrib: '{1} contributions sur les douze derniers mois', less: 'moins', more: 'plus',
    enteropens: 'enter pour ouvrir', fullresume: 'enter : CV complet', openselected: 'enter ouvre l’élément choisi', fullresumemd: 'CV complet :',
    'n.apps': 'apps publiées', 'n.media': 'photos & panos', 'n.years': 'ans de métier', 'n.projects': 'projets', 'n.langs': 'technologies', 'n.luma': 'photos des chiens',
    'g.gallery': 'Galerie', 'g.sky': 'Paysages & ciel', 'g.luma': 'Luma & Nova', 'g.panos': 'Panoramas 360°', 'g.books': 'Carnets photo', 'g.puzzles': 'Puzzles',
    'c.email': 'E-mail', 'c.resume': 'CV', 'c.web': 'Site web',
    'm.saved': '{1} enregistré dans {2}', 'm.offline': 'hors ligne : {1} enregistré', 'm.nowrite': 'impossible d’écrire ici',
    'm.noplayer': 'aucun lecteur audio trouvé', 'm.notmp': 'pas de dossier temporaire',
    'm.stopped': 'musique arrêtée', 'm.stoppedwhy': 'musique arrêtée : {1}', 'm.tuning': 'Tom Jr. s’accorde...', 'm.vol': 'volume {1} %',
    'h.tm': 'voyage dans le temps', 'h.now': 'retour au présent', 'h.fx': 'saisons', 'h.date': 'tapez une date', 'm.fxon': 'effets de saison activés', 'm.fxoff': 'effets de saison désactivés', 'm.baddate': 'date invalide : {1}', 'contrib.y': '{1} contributions en {2}', 'gh.none': 'rien encore sur GitHub à cette date', 'h.help': 'aide',
    'h.dot': 'dotfiles', 'dot.title': 'Installer mes dotfiles ?', 'dot.p': 'Pour {1} : cela enregistre {2} dans votre dossier personnel (en remplaçant une ancienne copie) et ajoute une ligne à vos fichiers de démarrage du shell pour que les nouveaux shells le chargent. Au premier chargement, quelques petits outils peuvent être installés.', 'dot.keys': 'y installe  /  autre touche annule', 'm.dotok': 'dotfiles installés : ouvrez un nouveau shell pour les utiliser', 'm.dotfail': 'impossible de télécharger les dotfiles', 'm.dotno': 'rien n\'a été installé',
  },
  es: {
    t1: 'Resumen', t2: 'Proyectos', t3: 'Experiencia', t4: 'Fotografía', t5: 'Contacto',
    s1: 'Inicio', s2: 'Proyectos', s3: 'Trabajo', s4: 'Fotos', s5: 'Contacto',
    'h.move': 'mover', 'h.section': 'sección', 'h.search': 'buscar', 'h.music': 'música', 'h.musicoff': 'apagar música',
    'h.save': 'guardar CV', 'h.resume': 'CV', 'h.lang': 'idioma', 'h.open': 'abrir', 'h.quit': 'salir',
    'h.type': 'escribe para buscar', 'h.jump': 'ir', 'h.cancel': 'cancelar', 'h.vol': 'volumen',
    small: 'Agranda un poco la ventana (64 x 16 o más).  q para salir.',
    photo: 'Fotografía', galleryopen: 'enter la abre en la galería', typesearch: 'Escribe para buscar', nomatch: 'Sin resultados',
    scope: 'proyectos, trabajo, habilidades, fotos, contacto', match1: '1 resultado', matchn: '{1} resultados',
    'k.project': 'proyecto', 'k.work': 'trabajo', 'k.photos': 'fotos', 'k.contact': 'contacto', 'k.photo': 'foto',
    skills: 'Habilidades', education: 'Formación', numbers: 'En cifras', byyear: 'Proyectos por año', latest: 'Lo último',
    contrib: '{1} contribuciones en el último año', less: 'menos', more: 'más',
    enteropens: 'enter para abrir', fullresume: 'enter: CV completo', openselected: 'enter abre el elemento elegido', fullresumemd: 'CV completo:',
    'n.apps': 'apps publicadas', 'n.media': 'fotos y panos', 'n.years': 'años creando', 'n.projects': 'proyectos', 'n.langs': 'tecnologías', 'n.luma': 'fotos de perros',
    'g.gallery': 'Galería', 'g.sky': 'Paisaje y cielo', 'g.luma': 'Luma & Nova', 'g.panos': 'Panorámicas 360°', 'g.books': 'Diarios de fotos', 'g.puzzles': 'Rompecabezas',
    'c.email': 'Correo', 'c.resume': 'Currículum', 'c.web': 'Sitio web',
    'm.saved': '{1} guardado en {2}', 'm.offline': 'sin conexión: {1} guardado', 'm.nowrite': 'no se pudo guardar aquí',
    'm.noplayer': 'no hay reproductor de audio', 'm.notmp': 'sin carpeta temporal',
    'm.stopped': 'música detenida', 'm.stoppedwhy': 'música detenida: {1}', 'm.tuning': 'sintonizando a Tom Jr...', 'm.vol': 'volumen {1} %',
    'h.tm': 'máquina del tiempo', 'h.now': 'volver al presente', 'h.fx': 'temporadas', 'h.date': 'escribe una fecha', 'm.fxon': 'efectos de temporada activados', 'm.fxoff': 'efectos de temporada desactivados', 'm.baddate': 'fecha no válida: {1}', 'contrib.y': '{1} contribuciones en {2}', 'gh.none': 'aún nada en GitHub en esta fecha', 'h.help': 'ayuda',
    'h.dot': 'dotfiles', 'dot.title': '¿Instalar mis dotfiles?', 'dot.p': 'Para {1}: esto guarda {2} en tu carpeta personal (reemplazando una copia anterior) y agrega una línea a tus archivos de inicio del shell para que los shells nuevos lo carguen. La primera vez que se cargue puede instalar algunas herramientas pequeñas.', 'dot.keys': 'y instala  /  otra tecla cancela', 'm.dotok': 'dotfiles instalados: abre un shell nuevo para usarlos', 'm.dotfail': 'no se pudieron descargar los dotfiles', 'm.dotno': 'no se instaló nada',
  },
  ko: {
    t1: '개요', t2: '프로젝트', t3: '경력', t4: '사진', t5: '연락처',
    s1: '홈', s2: '프로젝트', s3: '경력', s4: '사진', s5: '연락처',
    'h.move': '이동', 'h.section': '섹션', 'h.search': '검색', 'h.music': '음악', 'h.musicoff': '음악 끄기',
    'h.save': '이력서 저장', 'h.resume': '이력서', 'h.lang': '언어', 'h.open': '열기', 'h.quit': '종료',
    'h.type': '입력해서 검색', 'h.jump': '바로 가기', 'h.cancel': '취소', 'h.vol': '볼륨',
    small: '창을 조금 더 키워 주세요 (64 x 16 이상).  q를 누르면 종료합니다.',
    photo: '사진', galleryopen: 'enter를 누르면 갤러리에서 열립니다', typesearch: '입력해서 검색하세요', nomatch: '결과 없음',
    scope: '프로젝트, 경력, 기술, 사진, 연락처', match1: '결과 1개', matchn: '결과 {1}개',
    'k.project': '프로젝트', 'k.work': '경력', 'k.photos': '사진', 'k.contact': '연락처', 'k.photo': '사진',
    skills: '기술', education: '학력', numbers: '숫자로 보기', byyear: '연도별 프로젝트', latest: '최신',
    contrib: '지난 1년간 기여 {1}회', less: '적음', more: '많음',
    enteropens: 'enter로 열기', fullresume: 'enter: 이력서 전체', openselected: 'enter로 선택한 항목 열기', fullresumemd: '이력서 전체:',
    'n.apps': '출시한 앱', 'n.media': '사진·파노라마', 'n.years': '년 개발 경력', 'n.projects': '프로젝트', 'n.langs': '언어와 도구', 'n.luma': '강아지 사진',
    'g.gallery': '갤러리', 'g.sky': '풍경과 하늘', 'g.luma': 'Luma & Nova', 'g.panos': '360° 파노라마', 'g.books': '포토 저널', 'g.puzzles': '퍼즐',
    'c.email': '이메일', 'c.resume': '이력서', 'c.web': '웹사이트',
    'm.saved': '{2}에 {1} 저장됨', 'm.offline': '오프라인: {1} 저장됨', 'm.nowrite': '여기에 저장할 수 없습니다',
    'm.noplayer': '오디오 플레이어가 없습니다', 'm.notmp': '임시 폴더를 만들 수 없습니다',
    'm.stopped': '음악이 멈췄습니다', 'm.stoppedwhy': '음악이 멈췄습니다: {1}', 'm.tuning': 'Tom Jr.에 연결하는 중...', 'm.vol': '볼륨 {1}%',
    'h.tm': '타임머신', 'h.now': '현재로 돌아가기', 'h.fx': '계절 효과', 'h.date': '날짜 입력', 'm.fxon': '계절 효과 켜짐', 'm.fxoff': '계절 효과 꺼짐', 'm.baddate': '날짜가 아닙니다: {1}', 'contrib.y': '{2}년 기여 {1}회', 'gh.none': '이 날짜에는 아직 GitHub 기록이 없습니다', 'h.help': '도움말',
    'h.dot': 'dotfiles', 'dot.title': '제 dotfiles를 설치할까요?', 'dot.p': '{1} 님용: 홈 폴더에 {2}을(를) 저장하고(이전 사본은 교체됩니다) 새 셸이 이를 불러오도록 셸 시작 파일에 한 줄을 추가합니다. 처음 불러올 때 작은 도구 몇 개가 설치될 수 있습니다.', 'dot.keys': 'y 설치  /  다른 키 취소', 'm.dotok': 'dotfiles 설치됨: 새 셸을 열어 사용하세요', 'm.dotfail': 'dotfiles를 다운로드할 수 없습니다', 'm.dotno': '아무것도 설치되지 않았습니다',
  },
  'pt-BR': {
    t1: 'Visão geral', t2: 'Projetos', t3: 'Experiência', t4: 'Fotografia', t5: 'Contato',
    s1: 'Início', s2: 'Projetos', s3: 'Trabalho', s4: 'Fotos', s5: 'Contato',
    'h.move': 'mover', 'h.section': 'seção', 'h.search': 'buscar', 'h.music': 'música', 'h.musicoff': 'desligar música',
    'h.save': 'salvar currículo', 'h.resume': 'currículo', 'h.lang': 'idioma', 'h.open': 'abrir', 'h.quit': 'sair',
    'h.type': 'digite para buscar', 'h.jump': 'ir', 'h.cancel': 'cancelar', 'h.vol': 'volume',
    small: 'Aumente um pouco a janela (64 x 16 ou mais).  q para sair.',
    photo: 'Fotografia', galleryopen: 'enter abre na galeria', typesearch: 'Digite para buscar', nomatch: 'Nenhum resultado',
    scope: 'projetos, trabalho, habilidades, fotos, contato', match1: '1 resultado', matchn: '{1} resultados',
    'k.project': 'projeto', 'k.work': 'trabalho', 'k.photos': 'fotos', 'k.contact': 'contato', 'k.photo': 'foto',
    skills: 'Habilidades', education: 'Formação', numbers: 'Em números', byyear: 'Projetos por ano', latest: 'Recentes',
    contrib: '{1} contribuições no último ano', less: 'menos', more: 'mais',
    enteropens: 'enter abre', fullresume: 'enter: currículo completo', openselected: 'enter abre o item selecionado', fullresumemd: 'Currículo completo:',
    'n.apps': 'apps publicados', 'n.media': 'fotos e panos', 'n.years': 'anos criando', 'n.projects': 'projetos', 'n.langs': 'tecnologias', 'n.luma': 'fotos dos cães',
    'g.gallery': 'Galeria', 'g.sky': 'Paisagem e céu', 'g.luma': 'Luma & Nova', 'g.panos': 'Panoramas 360°', 'g.books': 'Diários de fotos', 'g.puzzles': 'Quebra-cabeças',
    'c.email': 'E-mail', 'c.resume': 'Currículo', 'c.web': 'Site',
    'm.saved': '{1} salvo em {2}', 'm.offline': 'offline: {1} salvo', 'm.nowrite': 'não foi possível salvar aqui',
    'm.noplayer': 'nenhum player de áudio encontrado', 'm.notmp': 'sem pasta temporária',
    'm.stopped': 'música parada', 'm.stoppedwhy': 'música parada: {1}', 'm.tuning': 'sintonizando o Tom Jr...', 'm.vol': 'volume {1}%',
    'h.tm': 'máquina do tempo', 'h.now': 'voltar ao presente', 'h.fx': 'estações', 'h.date': 'digite uma data', 'm.fxon': 'efeitos sazonais ligados', 'm.fxoff': 'efeitos sazonais desligados', 'm.baddate': 'data inválida: {1}', 'contrib.y': '{1} contribuições em {2}', 'gh.none': 'ainda nada no GitHub nesta data', 'h.help': 'ajuda',
    'h.dot': 'dotfiles', 'dot.title': 'Instalar meus dotfiles?', 'dot.p': 'Para {1}: isso salva {2} na sua pasta pessoal (substituindo uma cópia antiga) e adiciona uma linha aos seus arquivos de inicialização do shell para que novos shells o carreguem. Na primeira vez que carregar, pode instalar algumas ferramentas pequenas.', 'dot.keys': 'y instala  /  outra tecla cancela', 'm.dotok': 'dotfiles instalados: abra um novo shell para usá-los', 'm.dotfail': 'não foi possível baixar os dotfiles', 'm.dotno': 'nada foi instalado',
  },
  it: {
    t1: 'Panoramica', t2: 'Progetti', t3: 'Esperienza', t4: 'Fotografia', t5: 'Contatti',
    s1: 'Home', s2: 'Progetti', s3: 'Lavoro', s4: 'Foto', s5: 'Contatti',
    'h.move': 'scorri', 'h.section': 'sezione', 'h.search': 'cerca', 'h.music': 'musica', 'h.musicoff': 'spegni musica',
    'h.save': 'salva CV', 'h.resume': 'CV', 'h.lang': 'lingua', 'h.open': 'apri', 'h.quit': 'esci',
    'h.type': 'scrivi per cercare', 'h.jump': 'vai', 'h.cancel': 'annulla', 'h.vol': 'volume',
    small: 'Ingrandisci un po’ la finestra (almeno 64 x 16).  q per uscire.',
    photo: 'Fotografia', galleryopen: 'enter la apre nella galleria', typesearch: 'Scrivi per cercare', nomatch: 'Nessun risultato',
    scope: 'progetti, lavoro, competenze, foto, contatti', match1: '1 risultato', matchn: '{1} risultati',
    'k.project': 'progetto', 'k.work': 'lavoro', 'k.photos': 'foto', 'k.contact': 'contatti', 'k.photo': 'foto',
    skills: 'Competenze', education: 'Formazione', numbers: 'In cifre', byyear: 'Progetti per anno', latest: 'Ultimi',
    contrib: '{1} contributi nell’ultimo anno', less: 'meno', more: 'più',
    enteropens: 'enter apre', fullresume: 'enter: CV completo', openselected: 'enter apre la voce scelta', fullresumemd: 'CV completo:',
    'n.apps': 'app pubblicate', 'n.media': 'foto e panorami', 'n.years': 'anni di lavoro', 'n.projects': 'progetti', 'n.langs': 'tecnologie', 'n.luma': 'foto dei cani',
    'g.gallery': 'Galleria', 'g.sky': 'Paesaggi e cielo', 'g.luma': 'Luma & Nova', 'g.panos': 'Panorami a 360°', 'g.books': 'Diari fotografici', 'g.puzzles': 'Puzzle',
    'c.email': 'Email', 'c.resume': 'Curriculum', 'c.web': 'Sito web',
    'm.saved': '{1} salvato in {2}', 'm.offline': 'offline: salvato {1}', 'm.nowrite': 'impossibile scrivere qui',
    'm.noplayer': 'nessun lettore audio trovato', 'm.notmp': 'nessuna cartella temporanea',
    'm.stopped': 'musica ferma', 'm.stoppedwhy': 'musica ferma: {1}', 'm.tuning': 'sintonizzo Tom Jr...', 'm.vol': 'volume {1}%',
    'h.tm': 'macchina del tempo', 'h.now': 'torna al presente', 'h.fx': 'stagioni', 'h.date': 'scrivi una data', 'm.fxon': 'effetti stagionali attivi', 'm.fxoff': 'effetti stagionali disattivi', 'm.baddate': 'data non valida: {1}', 'contrib.y': '{1} contributi nel {2}', 'gh.none': 'ancora niente su GitHub in questa data', 'h.help': 'aiuto',
    'h.dot': 'dotfiles', 'dot.title': 'Installare i miei dotfiles?', 'dot.p': 'Per {1}: questo salva {2} nella tua cartella home (sostituendo una copia precedente) e aggiunge una riga ai file di avvio della shell così che le nuove shell lo carichino. Al primo caricamento potrebbe installare alcuni piccoli strumenti.', 'dot.keys': 'y installa  /  altro tasto annulla', 'm.dotok': 'dotfiles installati: apri una nuova shell per usarli', 'm.dotfail': 'impossibile scaricare i dotfiles', 'm.dotno': 'non è stato installato nulla',
  },
};
// these also go in upper case (tab names, panel headings); the renderer cannot upper-case Unicode
const TUI_UPPER = ['t1', 't2', 't3', 't4', 't5', 's1', 's2', 's3', 's4', 's5', 'skills', 'education', 'numbers', 'byyear', 'latest'];

// The terminal app's data: tab-separated, one record per line. English comes first, in plain ASCII
// (what a terminal that is not UTF-8 gets). Then an "L <lang>" block for each other language with
// only the records that differ from English, in UTF-8; the renderer reads English, then its
// language's block over it. Text keyed in i18n/index.<lang>.json is used where it exists, so a
// rebuild picks up new translations; anything missing stays English.
const utf8 = (v) => strip(String(v ?? '')).normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b\u2028\u2029\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
const tuiDicts = Object.fromEntries(LANGS.slice(1).map((l) => [l, exists(`i18n/index.${l}.json`) ? json(`i18n/index.${l}.json`) : {}]));
const artItems = ART.map(([item, file]) => ({ item, file, a: artNext[`${file}:${nextManifest[file].src}`] })).filter((x) => x.a);
artItems.forEach((x, i) => { x.n = artItems.slice(0, i + 1).filter((y) => y.item === x.item).length; });
function tuiRecords(lang, clean) {
  const dict = lang === 'en' ? {} : tuiDicts[lang];
  const tr = (key, english) => fill(String((key in dict && String(dict[key]).trim()) ? dict[key] : english ?? ''));
  const ui = { ...TUI_UI.en, ...Object.fromEntries(Object.entries(TUI_UI[lang] || {}).filter(([, v]) => v)) };
  const out = new Map();
  const put = (id, ...f) => out.set(id, f.map(clean).join('\t'));
  for (const [k, v] of Object.entries(ui)) {
    put(`T:${k}`, 'T', k, v);
    if (TUI_UPPER.includes(k)) put(`T:${k}^`, 'T', `${k}^`, v.toLocaleUpperCase(lang));
  }
  const title = resume.title === en['hook.title'] ? tr('hook.title', resume.title) : resume.title;
  const S2 = {
    name: site.name, name_upper: site.name.toUpperCase(), origin: site.origin, host, resume: `${site.origin}/resume/`,
    eyebrow: tr('hero.maker.eyebrow', t('hero.maker.eyebrow')), tagline: tr('hook.lead', t('hook.lead')), lede: tr('hook.years', t('hook.years')),
    title, summary: resume.summary, contact_note: tr('c.p', t('c.p')),
    // the verse on the home page, for the card printed on the way out
    verse: tr('for-his-invisible-attributes.f98eec', t('for-his-invisible-attributes.f98eec')).replace(/<cite>[\s\S]*?<\/cite>/g, ''),
    verse_ref: tr('romans-1-20.e00c11', t('romans-1-20.e00c11')), bye: `${tr('foot.made', t('foot.made'))}  ${site.origin}`, langname: LANG_NAMES[lang],
  };
  for (const [k, v] of Object.entries(S2)) put(`S:${k}`, 'S', k, v);
  // the site's own words for the time machine, the seasons' greetings and the future
  for (const k of Object.keys(S).filter((x) => /^(tm|fut)\./.test(x))) put(`T:${k}`, 'T', k, tr(k, t(k)));
  for (const k of Object.keys(S).filter((x) => x.startsWith('season.'))) put(`T:g.${k.slice(7)}`, 'T', `g.${k.slice(7)}`, tr(k, t(k)));
  [['n.apps', appCount], ['n.media', photos.length + panoCount], ['n.years', yearsBuilding], ['n.projects', projects.length],
    ['n.langs', skillCount], ['n.luma', photos.filter(isPup).length]].forEach(([k, v], i) => put(`N:${i}`, 'N', i + 1, ui[k], v));
  for (const x of artItems) put(`i:${x.item}:${x.n}`, 'i', x.item, x.n, tr(photoBy[x.file].title ? `ph.${photoBy[x.file].id}.t` : `ph.${photoBy[x.file].id}.alt`, photoBy[x.file].title || photoBy[x.file].alt));
  photos.filter((ph) => ph.title || ph.alt || ph.caption).forEach((ph, i) => put(`F:${i}`, 'F', i + 1,
    [tr(`ph.${ph.id}.t`, ph.title), tr(`ph.${ph.id}.c`, ph.caption), ph.title ? '' : tr(`ph.${ph.id}.alt`, ph.alt)].filter(Boolean).join('. '), `${site.origin}/#${ph.id}`,
    // and when it was taken (the time machine leaves out photographs not taken yet)
    ph.taken || '',
    // the half-block art for this photograph, when it is one of the ART photographs (shown in search)
    (({ item, n } = artItems.find((a) => a.file === ph.file) || {}) => (item ? `${item} ${n}` : ''))()));
  projects.forEach((p, i) => put(`P:${i}`, 'P', i + 1, p.title, p.date, tr(`ft.${p.id}`, p.tagline || ''), p.link ? absolute(p.link) : '',
    p.stack.map((tag) => tr(`tag.${slug(tag)}`, tag)).join(', '), tr(`tl.${p.id}.desc`, p.description), tr(`tl.${p.id}.date`, p.dateLabel)));
  resume.experience.forEach((j, i) => put(`J:${i}`, 'J', i + 1, tr(`job.${i}.role`, j.role), j.company, `${j.start} - ${j.end}`, tr(`job.${i}.place`, j.place),
    tr(`job.${i}.field`, j.field), j.bullets.map((b, n) => clean(tr(`job.${i}.b${n}`, b)).replace(/\|/g, '/')).join('|')));
  resume.skills.forEach((g, i) => put(`K:${i}`, 'K', i + 1, tr(`sk.${i}`, g.years).toLocaleUpperCase(lang), g.items.join(', '), [100, 45, 28][i] ?? 20));
  resume.education.forEach((e, i) => put(`E:${i}`, 'E', i + 1, `${tr(`edu.${i}.degree`, e.degree)}, ${tr(`edu.${i}.detail`, e.detail)}`, `${e.school}, ${e.start} - ${e.end}`,
    e.start.replace(/^(\d\d)\/(\d{4})$/, '$2-$1')));
  [['g.gallery', photos.length, `${site.origin}/?v=120`, `${tr('hero.photo.h', t('hero.photo.h'))} ${tr('hero.photo.p', t('hero.photo.p'))}`],
    ['g.sky', tagged('120'), `${site.origin}/?v=120`, tr('ph.p', t('ph.p'))],
    ['g.luma', photos.filter(isPup).length, `${site.origin}/?v=dog`, `${tr('hero.luma.h', t('hero.luma.h'))} ${tr('hero.luma.p', t('hero.luma.p'))}`],
    ['g.panos', panoCount, `${site.origin}/panos/`, tr('x.panos', t('x.panos'))],
    ['g.books', '', `${site.origin}/books/`, tr('x.books', t('x.books'))],
    ['g.puzzles', '', `${site.origin}/puzzles/`, tr('x.puzzles', t('x.puzzles'))]].forEach(([k, n, u, x], i) => put(`H:${i}`, 'H', i + 1, ui[k], n, u, x));
  [[ui['c.email'], rot(emailPlain), '', 'email'],
    ...site.social.map((x) => [x.name, x.href.replace(/^https?:\/\/(www\.)?/, ''), x.href, '']),
    [ui['c.resume'], `${host}/resume/`, `${site.origin}/resume/`, ''], [ui['c.web'], host, site.origin, '']].forEach((c, i) => put(`C:${i}`, 'C', i + 1, ...c));
  return out;
}
const tuiBase = tuiRecords('en', ascii);
const tuiEnUtf = tuiRecords('en', utf8);
const tuiData = [
  ...[...tuiBase].filter(([id]) => !id.startsWith('i:')).map(([, line]) => line),
  ...(heat ? [['G', contrib.total, heat].join('\t')] : []),
  ...artItems.map(({ item, a, file }) => ['I', item, a.w, a.h, a.px, ascii(photoBy[file].title || photoBy[file].alt), photoBy[file].taken || ''].join('\t')), ...iconRecs, ...miniRecs,
  ...allYears.map((y) => rec('Y', y, projects.filter((p) => p.date.startsWith(y)).length)),
  // For the time machine and the seasons (the same calendar as the site, content/site.json):
  // every photograph's date and tags, the seasons, Luma, and the future's dogs and founder date.
  ...photos.map((ph) => ['Q', ph.taken || '', isPup(ph) ? 1 : 0, ph.tags.includes('120') ? 1 : 0].join('\t')),
  ...(site.seasons || []).map((z) => ['Z', z.id, z.from || '', z.to || '', z.day || '', z.rule || '', z.before ?? '', z.after ?? '', z.date || '', z.effect || '', z.greet ? 1 : 0, z.lights ? 1 : 0].join('\t')),
  // earlier years of GitHub, one character a day, for the time machine
  ...Object.entries(contrib?.years || {}).sort().map(([y, v]) => ['W', y, v.total, v.levels].join('\t')),
  rec('S', 'luma_born', site.luma.born), rec('S', 'nova_born', novaBorn), rec('S', 'luma_passed', lumaPassed || ''), rec('S', 'founder_from', site.future?.founderFrom || ''),
  rec('S', 'dog_life', site.future?.dogs?.lifespan || 12), rec('S', 'dog_adopt', site.future?.dogs?.adoptAt || 6), rec('S', 'dog_names', (site.future?.dogs?.names || []).join(',')),
  rec('S', 'dog_real', (site.future?.dogs?.real || []).map((d) => [d.name, d.born, d.passed || ''].join('/')).join(',')),
];
for (const lang of LANGS.slice(1)) {
  tuiData.push(`L\t${lang}`);
  for (const [id, line] of tuiRecords(lang, utf8)) if (line !== tuiEnUtf.get(id)) tuiData.push(line);
}
const fillTemplate = (text, map) => text.replace(/@([A-Z_]+)@/g, (m, k) => (k in map ? map[k] : m));
write('shell', fillTemplate(read('scripts/tui.template.sh'), {
  NAME: site.name, CMD: TUI_CMD, ORIGIN: site.origin, RESUME_FILE: `${site.name.replace(/[^A-Za-z0-9]+/g, '-')}-Resume`,
  DATA: tuiData.join('\n'),
  N_PROJECTS: projects.length, N_EXPERIENCE: resume.experience.length, N_PHOTOS: 6, N_CONTACT: site.social.length + 3,
}));

/* ---------- profile bios + GitHub profile README ---------- */

const limits = [['GitHub bio', 160, 'short'], ['X / Twitter bio', 160, 'short'], ['Instagram bio', 150, 'short'], ['Threads / Bluesky', 256, 'medium'],
  ['LinkedIn headline', 220, 'medium'], ['Mastodon', 500, 'long'], ['LinkedIn About / YouTube', 2000, 'long']];
const bio = Object.fromEntries(['tagline', 'short', 'medium', 'long'].map((k) => [k, fill(site.bios[k])]));
for (const [where, max, k] of limits) {
  if (bio[k].length > max) throw new Error(`content/site.json → bios.${k} is ${bio[k].length} characters; ${where} allows ${max}.`);
}
write('profiles/bios.md', `# Profile bios

Generated by \`node scripts/build-site.mjs\` from \`content/site.json\` → \`bios\`. Edit them there.
Every entry below has been checked against its platform's length limit.

${limits.map(([where, max, k]) => `## ${where}\n\n${bio[k].length} / ${max} characters\n\n\`\`\`text\n${bio[k]}\n\`\`\``).join('\n\n')}
`);

const appRow = (p) => `| [**${p.title}**](${absolute(p.link)}) | ${p.tagline || strip(p.description).split(/(?<=[.!?])\s/)[0]} | ${p.dateLabel.replace(',', '')} |`;
const linked = projects.filter((p) => p.link && !/^https?:\/\/(?!wemiller\.com)/.test(p.link));
write('profiles/github-profile-README.md', `<!-- Generated by scripts/build-site.mjs in blaineam/blaineam.github.io. Edit content/ there, not this file. -->
# Hi, I'm Blaine

**${bio.tagline}**

${bio.long}

[wemiller.com](${site.origin}) · [Apps](${site.origin}/apps/) · [Photography](${site.origin}/?v=120) · [Resume](${site.origin}/resume/) · \`${TUI_CMD}\`

## Recently shipped

| | | |
|---|---|---|
${linked.slice(0, 8).map(appRow).join('\n')}

[Everything else →](${site.origin}/#projects)
`);

/* ---------- README app table ---------- */

if (exists('README.md')) {
  const readme = read('README.md');
  const a = '<!-- apps:start -->', b = '<!-- apps:end -->';
  if (readme.includes(a) && readme.includes(b)) {
    const table = `${a}\n| Project | What it is | Released |\n|---|---|---|\n${linked.map(appRow).join('\n')}\n${b}`;
    write('README.md', readme.slice(0, readme.indexOf(a)) + table + readme.slice(readme.indexOf(b) + b.length));
  }
}

/* ---------- sitemap: make sure the new page is listed ---------- */

if (exists('sitemap.xml')) {
  const map = read('sitemap.xml');
  let next = map;
  for (const page of ['/resume/', '/xr/', '/trail/', ...LANGS.filter((l) => l !== 'en').map((l) => `/trail/${l}/`)]) {      // the trail has a page per language (scripts/trail-pages.mjs)
    const loc = `${site.origin}${page}`;
    if (exists(page.slice(1) + 'index.html') && !next.includes(`<loc>${loc}</loc>`)) next = next.replace('</urlset>', `  <url>\n    <loc>${loc}</loc>\n    <changefreq>monthly</changefreq>\n  </url>\n</urlset>`);
  }
  write('sitemap.xml', next);
}

/* ---------- report ---------- */

for (const [lang, gaps] of Object.entries(missing)) console.warn(`  ! i18n/index.${lang}.json is missing ${gaps.length} string(s): ${gaps.slice(0, 4).join(', ')}${gaps.length > 4 ? '…' : ''}`);
if (CHECK) {
  if (stale.length) { console.error(`Stale (run node scripts/build-site.mjs): ${stale.join(', ')}`); process.exit(1); }
  console.log('Generated files are up to date.');
} else {
  console.log(written.length ? `Wrote ${written.length} file(s): ${written.slice(0, 12).join(', ')}${written.length > 12 ? ', …' : ''}` : 'Nothing changed.');
}
