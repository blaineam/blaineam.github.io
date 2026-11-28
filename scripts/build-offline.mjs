#!/usr/bin/env node
/* build-offline.mjs: writes /offline-files.json (what sw.js saves so the site opens offline) and stamps
 * the build into sw.js so browsers notice a new deploy.
 *
 *   node scripts/build-offline.mjs            write both files
 *   node scripts/build-offline.mjs --check    report only
 *
 * Saved up front: every page, plus styles, scripts, fonts, small data files (each under 400 KB), and the
 * small pictures the home page and tools index are built from (photo thumbnails, project and tool art).
 * Not saved up front: full-size photographs, panoramas, app screenshots, books, audio, PDFs and the
 * non-English dictionaries (about 460 MB together). Those are listed in /offline-media.json, which the
 * home page's "Offline copy" dialog downloads only when a visitor chooses to.
 * Those are kept by sw.js as a visitor actually views them. Folders that are not part of the public site,
 * or that run their own service worker, are left out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const SKIP_DIRS = new Set(['.git', '.github', '.claude', 'node_modules', 'scripts', 'out', 'content', 'docs', 'edit', 'pay']);
const SKIP_PREFIX = ['tools/tom/app/', 'tools/monkr/app/', 'apps/haven/app/', 'apps/shepherd/demo/', 'assets/sky/demo.html', 'assets/sky/test.mjs', 'assets/sky/build-stars.mjs', 'assets/sky/starter.json', 'puzzles/js/template.html'];
const FILE_EXT = new Set(['.css', '.js', '.mjs', '.json', '.svg', '.woff2', '.woff', '.ttf', '.webmanifest', '.txt']);
const ALWAYS = new Set(['assets/sky/stars.json', 'assets/icon-192.png', 'assets/icon-512.png', 'profile.jpg', 'search-index.json']);
const MAX = 400 * 1024;
// pictures the home page and the tools index are made of: small, and the page looks broken without them
const IMAGE_DIRS = ['slides/thumbs/', 'projects/', 'tools/'];
const IMAGE_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif']);

const MEDIA_EXT = new Set(['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif', '.mp3', '.m4a', '.mp4', '.webm', '.pdf', '.epub']);
const pages = [], files = [], media = [];
let mediaBytes = 0;
const hash = createHash('sha256');
let bytes = 0;
(function walk(dir) {
  for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (ent.name.startsWith('.')) continue;
    const rel = dir ? dir + '/' + ent.name : ent.name;
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(rel) && !SKIP_DIRS.has(ent.name)) walk(rel); continue; }
    if (!ent.isFile() || SKIP_PREFIX.some((p) => rel.startsWith(p))) continue;
    if (rel === 'sw.js' || rel === 'offline-files.json' || rel === 'offline-media.json') continue;
    const ext = path.extname(rel).toLowerCase(), full = path.join(root, rel);
    const size = fs.statSync(full).size;
    const add = (list, url) => { list.push(url); bytes += size; hash.update(rel).update(fs.readFileSync(full)); };
    if (ext === '.html') {
      if (rel === 'offline.html' || rel === '404.html') add(pages, '/' + rel);
      else add(pages, '/' + (rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel));
    } else if (ALWAYS.has(rel) || (IMAGE_EXT.has(ext) && size <= MAX && IMAGE_DIRS.some((d) => rel.startsWith(d)))) add(files, '/' + rel);
    else if (FILE_EXT.has(ext) && size <= MAX) {
      if (/(^|\/)i18n\/.*\.json$/.test(rel) && !/\.en\.json$/.test(rel)) { media.push(encodeURI('/' + rel)); mediaBytes += size; continue; }   // other languages: opt-in, or as used
      add(files, '/' + rel);
    } else if (MEDIA_EXT.has(ext) || (/(^|\/)i18n\/.*\.json$/.test(rel) && size <= 4 * MAX)) {
      media.push(encodeURI('/' + rel)); mediaBytes += size;      // only saved if the visitor asks (the "Offline copy" dialog)
    }
  }
})('');
if (fs.existsSync(path.join(root, 'shell'))) { /* a shell script served at /shell: not a page */ }

const version = hash.digest('hex').slice(0, 12);
console.log(`${pages.length} pages + ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, version ${version}; opt-in media: ${media.length} files, ${(mediaBytes / 1048576).toFixed(0)} MB`);
if (!CHECK) {
  fs.writeFileSync(path.join(root, 'offline-files.json'), JSON.stringify({ version, pages, files }) + '\n');
  fs.writeFileSync(path.join(root, 'offline-media.json'), JSON.stringify({ version, bytes: mediaBytes, files: media }) + '\n');
  const swPath = path.join(root, 'sw.js'), sw = fs.readFileSync(swPath, 'utf8');
  const next = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
  if (next !== sw) fs.writeFileSync(swPath, next);
  console.log('Wrote offline-files.json and stamped sw.js');
}
