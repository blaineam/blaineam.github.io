/* The Trail: words. Every sentence a hiker reads goes through t(), so the trail can be walked in
 * any of the site's languages, and so the guide's name is whoever the trail guide is today.
 *
 *   t('Walk up')                                   → the same sentence in the hiker's language
 *   t('{n} steps left', { n })                     → with values put in
 *   t('<b>{guide}</b> knows the way.')             → {guide} is always available: the guide dog's name
 *
 * The English sentence is the key. Dictionaries are /i18n/trail.<lang>.json (the same files the
 * site's own language switcher uses for the page frame); a sentence with no translation stays
 * English. scripts/trail-words.mjs collects every key, so the first argument of t() must always
 * be one plain string literal, never something built up.
 *
 * The guide is the youngest real dog alive today, from trail/guide.json, which the site build
 * writes from content/site.json. Sentences never say "she" or "he" about the guide. */

const LANGS = ['en', 'zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];
function pick(code) {
  if (!code) return null;
  const low = String(code).toLowerCase(), exact = LANGS.find((l) => l.toLowerCase() === low);
  if (exact) return exact;
  const first = low.split('-')[0];
  return first === 'zh' ? 'zh-Hans' : first === 'pt' ? 'pt-BR' : LANGS.find((l) => l.toLowerCase().split('-')[0] === first) || null;
}
function resolve() {
  // the same order as /i18n/i18n.js: the address, then what was chosen before, then the browser
  try { const p = pick(new URLSearchParams(location.search).get('lang')); if (p) return p; } catch (e) { /* fine */ }
  try { const p = pick(document.documentElement.dataset.lang); if (p) return p; } catch (e) { /* fine */ }      // a page written in one language (trail/<lang>/)
  try { const p = pick(localStorage.getItem('wemiller-lang')); if (p) return p; } catch (e) { /* fine */ }
  if (typeof navigator !== 'undefined') for (const l of navigator.languages || [navigator.language]) { const p = pick(l); if (p) return p; }
  return 'en';
}

/** The hiker's language, e.g. 'en' or 'pt-BR'. Use it as the locale for dates and numbers. */
export const lang = resolve();
// On a language's own page (trail/de/), choosing another language goes to that language's page.
try { const fixed = document.documentElement.dataset.lang; if (fixed && fixed !== lang) location.replace(`/trail/${lang === 'en' ? '' : lang + '/'}`); } catch (e) { /* not in a page */ }
/** The trail guide: { name, photo, photoBig }. */
export const guide = { name: 'Luma', photo: new URL('./luma.webp', import.meta.url).pathname + '?v=2', photoBig: new URL('./luma-stump.webp', import.meta.url).pathname + '?v=2' };
let dict = null;

export function t(text, vars) {
  const out = (dict && dict[text]) || text;
  return out.indexOf('{') < 0 ? out : out.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : k === 'guide' ? guide.name : m));
}

/** Load the dictionary and the guide. Never throws: the trail falls back to English and to Luma. */
export async function loadWords() {
  const jobs = [fetch(new URL('./guide.json?v=d0703ed6', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((g) => {
    const today = new Date().toISOString().slice(0, 10), dogs = ((g && g.dogs) || []).filter((d) => d && d.name && (!d.born || d.born <= today));
    const here = dogs.filter((d) => !d.passed || d.passed > today).pop() || dogs.pop();      // the youngest still here; else the last one, remembered
    if (here) Object.assign(guide, { name: String(here.name).slice(0, 40) }, here.photo ? { photo: here.photo } : null, here.photoBig ? { photoBig: here.photoBig } : null);
  }).catch(() => {})];
  if (lang !== 'en') jobs.push(fetch(`/i18n/trail.${lang}.json?v=d0703ed6`).then((r) => (r.ok ? r.json() : null)).then((d) => { dict = d; }).catch(() => {}));
  await Promise.all(jobs);
  // The site's language switcher changes the page frame in place; the trail is drawn by code, so it starts the page again in the new language (the run is saved).
  document.addEventListener('i18n:applied', (e) => { if (e.detail && e.detail.lang && e.detail.lang !== lang) location.reload(); });
}
