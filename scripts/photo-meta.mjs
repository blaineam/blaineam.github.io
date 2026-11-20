#!/usr/bin/env node
/* Recover each gallery photograph's camera and capture date from a folder of exported originals.
 *
 *   node scripts/photo-meta.mjs ~/Downloads/WeMiller            # match and write content/photo-meta.json
 *   node scripts/photo-meta.mjs ~/Downloads/WeMiller --report   # print the table, write nothing
 *
 * The published photos in /slides were resized, sometimes cropped a little, watermarked and
 * stripped of metadata, so they are matched to the originals by what they look like: a
 * difference hash and a coarse colour layout, both taken from the middle of the frame so the
 * corner signature does not matter. A match is recorded only when it is clearly the same
 * picture; anything doubtful is listed as unmatched rather than guessed.
 *
 * Only the camera, lens and capture date are read from the originals (via exiftool). No
 * location, no file names and no other metadata are written anywhere. Nothing in the source
 * folder is changed. Needs: exiftool on PATH, and sharp (npm ci in scripts/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(path.join(ROOT, 'scripts/'))('sharp');
const argv = process.argv.slice(2);
const src = argv.find((a) => !a.startsWith('--'));
const REPORT = argv.includes('--report');
if (!src || !fs.existsSync(src)) { console.error('Usage: node scripts/photo-meta.mjs <folder of originals> [--report]'); process.exit(1); }

const N = 17;          // dHash grid: 17×16 luminance samples → 256 bits
const G = 6;           // colour layout: 6×6 cells
async function signature(file) {
  // auto-orient, then keep the central 76% so borders and corner watermarks do not count
  const img = sharp(file, { failOn: 'none', limitInputPixels: false }).rotate();
  const meta = await img.metadata();
  const [w, h] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const cw = Math.round(w * 0.76), ch = Math.round(h * 0.76);
  const region = { left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch };
  const base = sharp(await sharp(file, { failOn: 'none', limitInputPixels: false }).rotate().resize({ width: 512, height: 512, fit: 'inside' }).toBuffer());
  const m2 = await base.metadata();
  const r2 = { left: Math.round(m2.width * 0.12), top: Math.round(m2.height * 0.12), width: Math.round(m2.width * 0.76), height: Math.round(m2.height * 0.76) };
  const grey = await base.clone().extract(r2).greyscale().resize(N, N - 1, { fit: 'fill' }).raw().toBuffer();
  const bits = new Uint8Array((N - 1) * (N - 1));
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) bits[y * (N - 1) + x] = grey[y * N + x] > grey[y * N + x + 1] ? 1 : 0;
  const col = await base.clone().extract(r2).resize(G, G, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  void region;
  return { bits, col: Array.from(col), ratio: w / h };
}
const hamming = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] ^ b[i]; return d; };
const colourDist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

// --- originals: metadata (camera, lens, date only) ---
const files = fs.readdirSync(src, { recursive: true }).map(String).filter((f) => /\.(jpe?g|heic|png|tiff?)$/i.test(f)).map((f) => path.join(src, f));   // sub-folders included
const exif = JSON.parse(execFileSync('exiftool', ['-json', '-Make', '-Model', '-LensModel', '-DateTimeOriginal', '-CreateDate', '-FocalLength', '-FocalLengthIn35mmFormat', '-ScaleFactor35efl', '-FNumber', '-ExposureTime', '-ISO', ...files], { maxBuffer: 1 << 28 }).toString());
const exifBy = Object.fromEntries(exif.map((e) => [e.SourceFile, e]));

function camera(e) {
  const make = String(e.Make || '').trim(), model = String(e.Model || '').trim();
  if (!model) return null;
  if (/darkroom|noritsu|frontier|scan/i.test(model + ' ' + make)) return { camera: 'Film (lab scan)', make: 'Film' };
  if (/^dji$/i.test(make) || /^FC\d/i.test(model)) return { camera: 'DJI drone', make: 'DJI' };
  let name = model.replace(/\s+/g, ' ');
  name = name.replace(/^Canon EOS R5m2$/i, 'Canon EOS R5 Mark II').replace(/^Canon EOS (\w+)m(\d)$/i, (m, a, n) => `Canon EOS ${a} Mark ${'I'.repeat(Number(n))}`);
  if (make && !name.toLowerCase().includes(make.split(' ')[0].toLowerCase()) && !/^iphone|^ipad/i.test(name)) name = `${make.split(' ')[0]} ${name}`;
  return { camera: name, make: /^iphone|^ipad/i.test(name) ? 'Apple' : make.split(' ')[0] };
}
// Exposure, as separate fields. Focal length is given as its 35 mm equivalent, so a phone's
// 6.9 mm and a full-frame 24 mm read as the same field of view: the camera's own figure when it
// wrote one, otherwise the real focal length times the sensor's crop factor.
function settings(e) {
  const out = {};
  const fl = parseFloat(e.FocalLength), eq = parseFloat(e.FocalLengthIn35mmFormat), crop = parseFloat(e.ScaleFactor35efl);
  if (eq > 0) out.focal35 = Math.round(eq);
  else if (fl > 0 && crop > 0) out.focal35 = Math.round(fl * crop);
  const fn = parseFloat(e.FNumber); if (fn > 0) out.aperture = Math.round(fn * 10) / 10;
  const ex = e.ExposureTime;
  if (ex) out.shutter = String(ex).includes('/') || Number(ex) >= 1 ? String(ex) : `1/${Math.round(1 / Number(ex))}`;
  if (e.ISO) out.iso = Number(e.ISO) || undefined;
  return out;
}
const taken = (e) => { const d = String(e.DateTimeOriginal || e.CreateDate || ''); const m = d.match(/^(\d{4}):(\d\d):(\d\d)/); return m && m[1] > '1990' ? `${m[1]}-${m[2]}-${m[3]}` : null; };

console.error(`Reading ${files.length} originals…`);
const originals = [];
for (const f of files) {
  try { originals.push({ f, sig: await signature(f) }); } catch { /* unreadable: skip */ }
}
const slides = fs.readdirSync(path.join(ROOT, 'slides')).filter((f) => f.endsWith('.webp')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const out = {};
const unmatched = [];
const pairs = [];   // for --pairs: which original each photo matched (never written to the repo)
const rows = [];
for (const s of slides) {
  const sig = await signature(path.join(ROOT, 'slides', s));
  const scored = originals.map((o) => ({ o, h: hamming(sig.bits, o.sig.bits), c: colourDist(sig.col, o.sig.col), r: Math.abs(Math.log(sig.ratio / o.sig.ratio)) }))
    .sort((a, b) => (a.h + a.c * 0.6) - (b.h + b.c * 0.6));
  const best = scored[0], next = scored.find((x) => x.o.sig !== best.o.sig && x.h > best.h + 0) || scored[1];
  // 256 bits: the same picture resized lands well under 40 apart; different pictures sit near 128.
  const sure = best && best.r < 0.5 && (best.h <= 20 || (best.h <= 46 && best.c <= 26)) && (!next || next.h - best.h >= 14 || next.c - best.c >= 10 || exifSame(best.o.f, next.o.f));
  if (!sure) { unmatched.push(s); rows.push([s, '-', '-', `h=${best?.h} c=${best?.c.toFixed(0)}`]); continue; }
  const e = exifBy[best.o.f] || {}, cam = camera(e), date = taken(e);
  if (!cam && !date) { unmatched.push(s); rows.push([s, '(no metadata)', '-', `h=${best.h}`]); continue; }
  const confidence = Math.round((1 - best.h / 128) * 100) / 100;
  const film = cam?.make === 'Film';            // a lab scan carries the date it was scanned, not the day the frame was shot
  const set = film ? {} : settings(e);
  out[s] = { ...(date && !film ? { taken: date } : {}), ...(cam || {}), ...(e.LensModel && !film ? { lens: String(e.LensModel) } : {}), ...set, confidence };
  rows.push([s, cam?.camera || '?', date || '?', `h=${best.h} c=${best.c.toFixed(0)}`]);
  pairs.push({ s, f: best.o.f, h: best.h });
}
// Two exports of the same shot (an edit and its copy) are not a real ambiguity.
function exifSame(a, b) { const x = exifBy[a] || {}, y = exifBy[b] || {}; return (x.DateTimeOriginal || x.CreateDate) && (x.DateTimeOriginal || x.CreateDate) === (y.DateTimeOriginal || y.CreateDate) && x.Model === y.Model; }

// --pairs <dir>: side-by-side sheets of the least certain matches, to check by eye.
if (argv.includes('--pairs')) {
  const dir = argv[argv.indexOf('--pairs') + 1];
  fs.mkdirSync(dir, { recursive: true });
  const worst = pairs.sort((x, y) => y.h - x.h).slice(0, 24);
  for (let i = 0; i < worst.length; i += 8) {
    const comps = [];
    for (let k = 0; k < 8 && i + k < worst.length; k++) {
      const w = worst[i + k];
      comps.push({ input: await sharp(path.join(ROOT, 'slides', w.s)).resize(240, 180, { fit: 'contain', background: '#000' }).toBuffer(), left: k * 244, top: 0 });
      comps.push({ input: await sharp(w.f, { failOn: 'none', limitInputPixels: false }).rotate().resize(240, 180, { fit: 'contain', background: '#000' }).toBuffer(), left: k * 244, top: 184 });
    }
    await sharp({ create: { width: 8 * 244, height: 364, channels: 3, background: '#222' } }).composite(comps).jpeg({ quality: 70 }).toFile(path.join(dir, `pairs-${i / 8}.jpg`));
  }
}

const byCam = {};
for (const v of Object.values(out)) byCam[v.camera || '?'] = (byCam[v.camera || '?'] || 0) + 1;
const dates = Object.values(out).map((v) => v.taken).filter(Boolean).sort();
if (REPORT) for (const r of rows) console.log(r.join('\t'));
console.log(`\nMatched ${Object.keys(out).length} of ${slides.length}. Unmatched: ${unmatched.length}.`);
console.log(Object.entries(byCam).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(3)}  ${k}`).join('\n'));
if (dates.length) console.log(`Dates: ${dates[0]} to ${dates[dates.length - 1]}`);
if (unmatched.length) console.log(`Unmatched: ${unmatched.join(' ')}`);

if (!REPORT) {
  const body = { _help: 'Camera and capture date for each gallery photograph, recovered by scripts/photo-meta.mjs from exported originals. Read by scripts/build-site.mjs. Only camera, lens and date are kept. Edit by hand to correct or fill in a photo; add "manual": true to that entry and re-running the script will leave it exactly as it is.', photos: out, unmatched };
  const file = path.join(ROOT, 'content/photo-meta.json');
  if (fs.existsSync(file)) {            // entries marked "manual": true are kept exactly as written
    const prev = JSON.parse(fs.readFileSync(file, 'utf8')).photos || {};
    for (const [k, v] of Object.entries(prev)) if (v.manual) { /* "manual": true always wins, matched or not */ body.photos[k] = v; body.unmatched = body.unmatched.filter((u) => u !== k); }
  }
  fs.writeFileSync(file, JSON.stringify(body, null, 1) + '\n');
  console.log('Wrote content/photo-meta.json');
}
