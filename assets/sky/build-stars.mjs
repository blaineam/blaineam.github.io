#!/usr/bin/env node
/* build-stars.mjs: writes assets/sky/stars.json (the catalog sky.js loads).
 *
 *   node assets/sky/build-stars.mjs                 starter set only (starter.json -> stars.json)
 *   node assets/sky/build-stars.mjs <file>          convert a catalog you already have on disk
 *   node assets/sky/build-stars.mjs --fetch         download the Yale Bright Star Catalogue and convert it
 *
 * Options:  --mag 6.5   faintest magnitude to keep        --url <url>   another mirror for --fetch
 *           --out <path>  write somewhere other than stars.json
 *
 * Accepted inputs (detected from the content):
 *   - Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), CDS catalogue V/50, file "catalog"
 *     (fixed-width, 9110 lines, optionally gzipped). Distributed by CDS/ADC without a licence restriction and
 *     treated as public domain; please cite it.
 *   - HYG database CSV (astronexus), licence CC BY-SA 4.0: if you use it, stars.json becomes a derived work
 *     under the same licence and the site must credit it.
 *
 * Nothing here runs unless you run it, and --fetch is the only path that touches the network.
 * Names and constellation lines always come from the hand-entered starter.json; its stars are matched to
 * the catalog by position, and the conversion aborts if the bright starter stars are not where the catalog
 * says they are (which would mean the input was parsed wrongly).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
// The CDS archive (cdsarc.cds.unistra.fr/ftp/cats/V/50/catalog.gz) is the canonical home, but its HTTPS
// certificate did not match its host name when this was written, so the Harvard mirror is the default.
// It is plain HTTP: the file is only ever parsed as text, and the sanity check below rejects a wrong one.
const BSC_URL = 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz';
const D2R = Math.PI / 180;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const maxMag = parseFloat(opt('--mag', '6.5'));
const outPath = opt('--out', join(here, 'stars.json'));
const input = args.find((a, i) => !a.startsWith('--') && !['--mag', '--out', '--url'].includes(args[i - 1]));

const sex = (s) => { const neg = s.trim().startsWith('-'); const p = s.replace(/[+-]/, '').trim().split(/\s+/).map(Number); return (neg ? -1 : 1) * (p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600); };
const sep = (a, b) => {   // degrees between [ra, dec] pairs
  const c = Math.sin(a[1] * D2R) * Math.sin(b[1] * D2R) + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((a[0] - b[0]) * D2R);
  return Math.acos(Math.min(1, Math.max(-1, c))) / D2R;
};

/* ---------- the hand-entered starter set ---------- */
const starter = JSON.parse(readFileSync(join(here, 'starter.json'), 'utf8'));
const sStars = starter.stars.map(([id, name, ra, dec, mag, bv]) => ({ id, name, ra: sex(ra) * 15, dec: sex(dec), mag, bv }));
const byId = new Map(sStars.map((s) => [s.id, s]));
if (byId.size !== sStars.length) throw new Error('starter.json: duplicate star id');
for (const c of starter.lines) for (const p of c.paths) for (const id of p) if (!byId.has(id)) throw new Error(`starter.json: line ${c.id} names unknown star "${id}"`);

/* ---------- parsers ---------- */
function parseBSC(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.length < 107) continue;
    const f = (a, b) => line.slice(a - 1, b);
    if (!f(76, 77).trim()) continue;                       // the 14 non-stellar entries have no position
    const ra = (+f(76, 77) + +f(78, 79) / 60 + +f(80, 83) / 3600) * 15;
    const dec = (f(84, 84) === '-' ? -1 : 1) * (+f(85, 86) + +f(87, 88) / 60 + +f(89, 90) / 3600);
    const mag = parseFloat(f(103, 107)), bvs = f(110, 114).trim();
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue;
    out.push({ ra, dec, mag, bv: bvs ? parseFloat(bvs) : 0.5 });
  }
  return out;
}
function parseCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
function parseHYG(text) {
  const lines = text.split(/\r?\n/), head = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error('HYG csv: no column ' + n); return i; };
  const cRa = col('ra'), cDec = col('dec'), cMag = col('mag'), cCi = col('ci');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = parseCSVLine(lines[i]), mag = parseFloat(r[cMag]);
    if (!(mag > -2)) continue;                             // skips the Sun
    const ci = parseFloat(r[cCi]);
    out.push({ ra: parseFloat(r[cRa]) * 15, dec: parseFloat(r[cDec]), mag, bv: Number.isFinite(ci) ? ci : 0.5 });
  }
  return out;
}

/* ---------- gather stars ---------- */
let stars, source, licence, complete;
if (input || flag('--fetch')) {
  let buf, from;
  if (input) { buf = readFileSync(input); from = input; }
  else {
    const url = opt('--url', BSC_URL);
    console.log('Downloading ' + url);
    const r = await fetch(url);
    if (!r.ok) throw new Error('download failed: HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
    const dir = join(tmpdir(), 'sky-catalog'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'catalog.download'), buf);
    from = url;
  }
  console.log(`${buf.length} bytes, sha256 ${createHash('sha256').update(buf).digest('hex')}`);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const text = buf.toString('latin1');
  const isCSV = /^"?id"?,/i.test(text.slice(0, 20)) || text.slice(0, 300).toLowerCase().includes(',ra,');
  stars = isCSV ? parseHYG(text) : parseBSC(text);
  source = isCSV ? 'HYG database (astronexus), from ' + from : 'Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), CDS V/50, from ' + from;
  licence = isCSV ? 'CC BY-SA 4.0' : 'Public domain (no licence restriction; cite Hoffleit & Warren 1991)';
  if (stars.length < 1000) throw new Error(`only ${stars.length} stars parsed: is this the right file?`);
  stars = stars.filter((s) => s.mag <= maxMag);
  complete = Math.min(maxMag, 6.5);
} else {
  stars = sStars.map((s) => ({ ra: s.ra, dec: s.dec, mag: s.mag, bv: s.bv }));
  source = 'STARTER SET: hand-entered bright stars (see starter.json). Run build-stars.mjs with a full catalog to replace it.';
  licence = 'Facts entered by hand; no third-party data file';
  complete = 2.3;
}
stars.sort((a, b) => a.mag - b.mag);

/* ---------- match the starter stars to the catalog: names, lines and a parsing sanity check ---------- */
const index = new Map(); let bad = 0, checked = 0; const misses = [];
for (const s of sStars) {
  let best = -1, score = Infinity, bestSep = 0;
  for (let i = 0; i < stars.length; i++) {
    const c = stars[i];
    if (Math.abs(c.dec - s.dec) > 0.4) continue;
    const d = sep([s.ra, s.dec], [c.ra, c.dec]);
    if (d > 0.4) continue;
    const sc = d / 0.4 + Math.abs(c.mag - s.mag) / 1.5;
    if (sc < score) { score = sc; best = i; bestSep = d; }
  }
  if (best >= 0 && score < 1.2) index.set(s.id, best);
  if (s.mag < 3) { checked++; if (best < 0 || bestSep > 0.1) { bad++; misses.push(s.name || s.id); } }
}
if (bad > checked * 0.05) throw new Error(`sanity check failed: ${bad} of ${checked} bright starter stars are not in the catalog where expected (${misses.slice(0, 8).join(', ')}...). The input was probably parsed wrongly; nothing written.`);
if (misses.length) console.log('Note: not matched within 0.1 deg: ' + misses.join(', '));

const names = {};
for (const s of sStars) if (s.name && index.has(s.id)) names[index.get(s.id)] = s.name;
const lines = starter.lines.map((c) => ({
  id: c.id, name: c.name,
  paths: c.paths.map((p) => p.map((id) => index.get(id)).filter((i) => i !== undefined)).filter((p) => p.length > 1)
})).filter((c) => c.paths.length);

const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
const flat = [];
for (const s of stars) flat.push(r3(s.ra), r3(s.dec), r2(s.mag), r2(s.bv));
const doc = {
  format: 'sky-stars', version: 1, epoch: 'J2000', source, licence,
  starter: !(input || flag('--fetch')),
  limit: complete, count: stars.length,
  columns: ['ra_deg', 'dec_deg', 'vmag', 'b_v'],
  stars: flat, names, lines
};
const json = JSON.stringify(doc).replace('"stars":[', '"stars":[\n').replace('],"names"', '\n],"names"');
writeFileSync(outPath, json + '\n');
console.log(`Wrote ${outPath}: ${stars.length} stars to magnitude ${stars.length ? stars[stars.length - 1].mag.toFixed(2) : '-'}, ${Object.keys(names).length} names, ${lines.length} figures, ${(json.length / 1024).toFixed(0)} KB`);
