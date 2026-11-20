/* The Trail: manners. People are welcome here if they can be polite. This module is the one
 * place that decides whether a piece of text is acceptable:
 *
 *   rude(text)        → true when it contains profanity, slurs or crude words
 *   promo(text)       → true when it advertises: links, handles, e-mail addresses, "follow me"
 *   checkName(name)   → null when a trail name is fine, else a short reason to show
 *   checkPublic(text) → the same for anything that could be shown publicly (no links at all)
 *   checkWritten(text)→ for private answers: only rudeness is refused; people may say hard things
 *   clean(text)       → text with control characters and markup removed, spaces tidied
 *
 * It is used in the browser and again by the register workflow, because anything a browser
 * checks can be skipped by someone determined. A word list cannot catch everything, crude
 * humour least of all, so anything public is also read by a person before it is shown. */

import { t } from './words.js?v=047d6282';

// Stems, matched on whole words after undoing the usual disguises (f*ck, sh1t, a$$, fuuuck).
const WORDS = ['fuck', 'fuk', 'fck', 'shit', 'sht', 'bullshit', 'bitch', 'btch', 'bastard', 'asshole', 'ass', 'arse', 'arsehole', 'dick', 'dickhead', 'cock', 'cunt', 'twat', 'pussy', 'prick', 'wank', 'wanker', 'jerkoff', 'piss', 'pissed', 'crap', 'damn', 'goddamn', 'slut', 'whore', 'hoe', 'skank', 'douche', 'douchebag', 'jackass', 'dumbass', 'dipshit', 'motherfucker', 'mofo', 'screw you', 'stfu', 'gtfo', 'wtf', 'lmfao', 'boobs', 'tits', 'titties', 'boner', 'porn', 'porno', 'nude', 'nudes', 'sexy', 'horny', 'milf', 'cum', 'jizz', 'fap', 'fart', 'poop', 'turd', 'butthole', 'penis', 'vagina', 'dildo', 'blowjob', 'handjob', 'rimjob', 'orgasm', 'anal', 'retard', 'retarded', 'spaz', 'fag', 'faggot', 'dyke', 'tranny', 'nigger', 'nigga', 'chink', 'spic', 'kike', 'gook', 'wetback', 'coon', 'paki', 'raghead', 'nazi', 'hitler', 'kys', 'kill yourself'];
// The worst of them are also refused when buried inside a longer word or run together.
const NEVER = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'asshole', 'dickhead', 'motherf', 'porn', 'hitler', 'retard'];
// Words that contain a stem innocently.
const FINE = ['class', 'classic', 'glass', 'grass', 'pass', 'passage', 'passed', 'passing', 'compass', 'bass', 'brass', 'mass', 'massive', 'assess', 'asset', 'assist', 'assume', 'assure', 'assign', 'associate', 'ambassador', 'embassy', 'cassette', 'harass', 'sassafras', 'cockpit', 'cocktail', 'peacock', 'hancock', 'cockatoo', 'dickens', 'dickinson', 'scunthorpe', 'shiitake', 'analysis', 'analyse', 'analyze', 'analog', 'analogy', 'canal', 'banal', 'final', 'finale', 'penal', 'arsenal', 'parse', 'sparse', 'coarse', 'hoarse', 'hoe', 'shoe', 'shoes', 'cumulative', 'document', 'circumstance', 'cucumber', 'accumulate', 'titan', 'title', 'titanic', 'constitution', 'institution', 'petite', 'therapist', 'grape', 'drape', 'scrape', 'spice', 'spicy', 'raccoon', 'cocoon', 'tycoon', 'nudge', 'damnation', 'crapshoot', 'pissarro', 'essex', 'sussex', 'middlesex', 'sextant', 'sexton', 'unisex'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '+': 't', '|': 'i' };
const plain = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[013457898@$!+|]/g, (c) => LEET[c] || c);
const squeeze = (s) => s.replace(/(.)\1{2,}/g, '$1$1');                 // fuuuuck → fuuck
const single = (s) => s.replace(/(.)\1+/g, '$1');                       // fuuck → fuck, asss → as

export function clean(text, max = 3000) {
  return String(text == null ? '' : text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

export function rude(text) {
  const raw = String(text || '');
  // a masked letter (f*ck, sh*t, b-tch): try each vowel where the star is
  if (/[a-z][*#_-][a-z]/i.test(raw)) for (const v of 'aeiou') if (rudePlain(raw.replace(/([a-z])[*#_-]+(?=[a-z])/gi, '$1' + v))) return true;
  return rudePlain(raw);
}
function rudePlain(text) {
  const p = squeeze(plain(text));
  const words = p.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const hit = (w) => !FINE.includes(w) && (WORDS.includes(w) || WORDS.includes(single(w)) || (w.length > 4 && w.endsWith('s') && WORDS.includes(w.slice(0, -1))) || (w.length > 5 && (w.endsWith('ing') || w.endsWith('ers')) && WORDS.includes(w.slice(0, -3))) || (w.length > 4 && (w.endsWith('ed') || w.endsWith('er')) && WORDS.includes(w.slice(0, -2))));
  if (words.some(hit)) return true;
  for (let i = 0; i < words.length - 1; i++) if (WORDS.includes(words[i] + ' ' + words[i + 1])) return true;
  // spelled out with spaces or dots (f u c k, f.u.c.k), or buried in a longer word
  const run = single(words.filter((w) => !FINE.includes(w)).join('')), spaced = single(p.replace(/\b([a-z])[\s._*-]+(?=[a-z]\b)/g, '$1').replace(/[^a-z\s]/g, ''));
  if (spaced.split(/\s+/).some((w) => !FINE.includes(w) && !FINE.some((ok) => single(ok) === w) && NEVER.some((n) => w === single(n) || (w.length >= 4 && w.includes(single(n)))))) return true;
  const lone = p.replace(/[^a-z\s]/g, ' ').split(/\s+/).reduce((acc, w) => { if (w.length === 1) acc.cur += w; else { if (acc.cur.length > 2) acc.runs.push(acc.cur); acc.cur = ''; } return acc; }, { cur: '', runs: [] });
  if (lone.cur.length > 2) lone.runs.push(lone.cur);
  if (lone.runs.some((w) => NEVER.some((n) => single(w).includes(single(n))) || WORDS.includes(w) || WORDS.includes(single(w)))) return true;
  return words.some((w) => !FINE.includes(w) && NEVER.some((n) => w.includes(n) || single(w).includes(single(n)))) || (words.length <= 2 && NEVER.some((n) => run.includes(single(n))));
}

export function promo(text) {
  const t = String(text || ''), p = plain(t);
  if (/(hxxps?|:\/\/)/i.test(t) || /\b[a-z0-9-]{2,}\s*(\(dot\)|\[dot\]|\[\.\]|\(\.\)|\bdot\b|\s\.\s|\s\.|,)\s*(com|net|org|io|co|dev|app|me|ai|gg|tv|xyz|shop|store|link|ly)\b/i.test(t)) return true;
  if (/\b[a-z0-9-]{2,}\.\s(com|net|org|io|COM|NET|ORG|IO)\b/.test(t)) return true;
  return /(https?:|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|dev|app|me|ai|gg|tv|xyz|shop|store|link|ly)\b)/i.test(t) || /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(t) || /(^|\s)@[a-z0-9_.]{2,}/i.test(t)
    || /\b(follow me|subscribe|my (channel|shop|store|startup|company|brand|product|app|newsletter|podcast|patreon|onlyfans|linktree|portfolio)|check out my|hire me|dm me|buy now|discount|promo code|use code|affiliate|sponsored|giveaway|crypto|nft|airdrop|telegram|whatsapp|venmo|cashapp|paypal)\b/.test(p)
    || /\b(instagram|tiktok|youtube|twitch|linkedin|twitter|x\.com|discord|snapchat|facebook|onlyfans|patreon|kickstarter|gofundme)\b/.test(p);
}

export function checkName(name) {
  const n = clean(name, 24);
  if (n.length < 2) return t('A trail name needs at least two letters.');
  if (!/^[A-Za-z0-9 _.\-']+$/.test(n)) return t('Letters, numbers, spaces and . - _ only, please.');
  if (rude(n)) return t('{guide} would not answer to that. Pick a kinder name.');
  if (promo(n)) return t('A trail name is a name, not an advert.');
  return null;
}
export function checkPublic(text, max = 140) {
  const said = clean(text, max);
  if (rude(said)) return t('That is not how people talk on this trail. Say it kindly.');
  if (promo(said)) return t('No links, handles or adverts here. This is not the place to promote anything.');
  return null;
}
export function checkWritten(text) {
  return rude(text) ? t("{guide}'s ears went back. Say it again without the rough words.") : null;
}
