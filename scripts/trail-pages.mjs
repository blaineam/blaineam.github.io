#!/usr/bin/env node
/* The Trail: one page per language, so that search engines and link previews see translated words.
 *
 * trail/index.html is English, and the trail turns itself into the visitor's language in the
 * browser. A crawler that does not run scripts (every link-preview fetcher, some search engines)
 * would only ever see English. This writes trail/<lang>/index.html for each other language: the
 * same page, with the title, description, share tags, structured data and the frame's own words
 * already in that language, and every page pointing at the others (hreflang).
 *
 * A language page is fixed to its language by <html data-lang="…">, which i18n/i18n.js and
 * trail/words.js read. Choosing another language there moves to that language's page.
 *
 *   node scripts/trail-pages.mjs           write the pages (and the hreflang links in trail/index.html)
 *   node scripts/trail-pages.mjs --check   exit 1 if they are out of date
 *
 * Run it after scripts/cache-bust.py: the copies carry the stamps of trail/index.html as they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://wemiller.com', LANGS = ['zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];
const OG_LOCALE = { en: 'en_US', 'zh-Hans': 'zh_CN', ja: 'ja_JP', de: 'de_DE', fr: 'fr_FR', es: 'es_419', ko: 'ko_KR', 'pt-BR': 'pt_BR', it: 'it_IT' };
const check = process.argv.includes('--check');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = (l) => `${ORIGIN}/trail/${l === 'en' ? '' : l + '/'}`;
const words = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `trail.${l}.json`), 'utf8'));

let stale = 0;
const put = (rel, text) => {
  const p = path.join(ROOT, rel), old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (old === text) return;
  stale++; if (!check) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
};
/** Replace exactly one thing, or stop: a silent miss would leave English in a translated page. */
const swap = (html, re, to, what) => { if (!re.test(html)) throw new Error(`trail/index.html: could not find ${what}`); return html.replace(re, to); };

/* ---- the English page: every language's address, and its own locale ---- */
const alternates = [`  <link rel="alternate" hreflang="x-default" href="${urlOf('en')}">`, ...['en', ...LANGS].map((l) => `  <link rel="alternate" hreflang="${l}" href="${urlOf(l)}">`)].join('\n');
let en = fs.readFileSync(path.join(ROOT, 'trail', 'index.html'), 'utf8')
  .replace(/^  <link rel="alternate" hreflang="[^"]*" href="[^"]*">\n/gm, '').replace(/^  <meta property="og:locale(?::alternate)?" content="[^"]*">\n/gm, '');
en = swap(en, /^(  <link rel="canonical" href="[^"]*">\n)/m, `$1${alternates}\n`, 'the canonical link');
en = swap(en, /^(  <meta property="og:type" content="[^"]*">\n)/m, `$1  <meta property="og:locale" content="${OG_LOCALE.en}">\n`, 'og:type');
put('trail/index.html', en);

/* ---- each other language ---- */
const E = words('en');
for (const l of LANGS) {
  const d = words(l), w = (k) => { const v = d[k] || E[k]; if (!v) throw new Error(`i18n/trail.${l}.json has no "${k}"`); return v; };
  const meta = (html, attr, name, value) => swap(html, new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`), `$1${esc(value)}$2`, name);
  let h = en;
  h = swap(h, /<html lang="en">/, `<html lang="${l}" data-lang="${l}">`, 'the html tag');
  h = swap(h, /<title>[^<]*<\/title>/, `<title>${esc(w('_title'))}</title>`, 'the title');
  h = meta(h, 'name', 'description', w('_meta.description'));
  h = meta(h, 'property', 'og:title', w('_og.title'));
  h = meta(h, 'property', 'og:description', w('_og.description'));
  h = meta(h, 'property', 'og:image:alt', w('_og.alt'));
  h = meta(h, 'property', 'og:url', urlOf(l));
  // this language's poster, if one has been drawn (scripts/build-og.mjs), stamped by its bytes like scripts/cache-bust.py does
  const poster = path.join(ROOT, 'og', `trail-${l}.jpg`);
  if (fs.existsSync(poster)) {
    const src = `${ORIGIN}/og/trail-${l}.jpg?v=${crypto.createHash('sha1').update(fs.readFileSync(poster)).digest('hex').slice(0, 8)}`;
    h = meta(h, 'property', 'og:image', src); h = meta(h, 'name', 'twitter:image', src);
    h = swap(h, /("image":")[^"]*(")/, `$1${ORIGIN}/og/trail-${l}.jpg$2`, 'the structured data image');
  }
  h = meta(h, 'property', 'og:locale', OG_LOCALE[l]);
  h = meta(h, 'name', 'twitter:title', w('_og.title'));
  h = meta(h, 'name', 'twitter:description', w('_og.description'));
  h = swap(h, /(<link rel="canonical" href=")[^"]*(")/, `$1${urlOf(l)}$2`, 'the canonical link');
  h = swap(h, /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (m, a, json, z) => {
    const j = JSON.parse(json); j.name = w('hero.eyebrow'); j.url = urlOf(l); j.description = w('_meta.description'); j.inLanguage = l;
    return a + JSON.stringify(j).replace(/</g, '\\u003c') + z;
  }, 'the structured data');
  // the page's own files live one folder up
  h = h.replace(/\b(src|href)="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]+)"/gi, '$1="/trail/$2"');
  // the frame's words, already translated (the browser does the same a moment later)
  h = h.replace(/(<[a-z][^>]*\bdata-i18n="([^"]+)"[^>]*>)[^<]*(?=<)/gi, (m, tag, key) => (d[key] ? tag + esc(d[key]).replace(/&quot;/g, '"') : m));
  put(`trail/${l}/index.html`, h);
}

if (check) { if (stale) { console.log(`Trail language pages are out of date (${stale} file(s)): run node scripts/trail-pages.mjs`); process.exit(1); } console.log('Trail language pages are current.'); }
else console.log(stale ? `Wrote ${stale} trail page(s).` : 'Trail language pages already current.');
