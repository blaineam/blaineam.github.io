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

import { t } from './words.js?v=14a60c19';

// Stems, matched on whole words after undoing the usual disguises (f*ck, sh1t, a$$, fuuuck).
const WORDS = ['fuck', 'fuk', 'fck', 'shit', 'sht', 'bullshit', 'bitch', 'btch', 'bastard', 'asshole', 'ass', 'arse', 'arsehole', 'dick', 'dickhead', 'cock', 'cunt', 'twat', 'pussy', 'prick', 'wank', 'wanker', 'jerkoff', 'piss', 'pissed', 'crap', 'damn', 'goddamn', 'slut', 'whore', 'hoe', 'skank', 'douche', 'douchebag', 'jackass', 'dumbass', 'dipshit', 'motherfucker', 'mofo', 'screw you', 'stfu', 'gtfo', 'wtf', 'lmfao', 'boobs', 'tits', 'titties', 'boner', 'porn', 'porno', 'nude', 'nudes', 'sexy', 'horny', 'milf', 'cum', 'jizz', 'fap', 'fart', 'poop', 'turd', 'butthole', 'penis', 'vagina', 'dildo', 'blowjob', 'handjob', 'rimjob', 'orgasm', 'anal', 'retard', 'retarded', 'spaz', 'fag', 'faggot', 'dyke', 'tranny', 'nigger', 'nigga', 'chink', 'spic', 'kike', 'gook', 'wetback', 'coon', 'paki', 'raghead', 'nazi', 'hitler', 'kys', 'kill yourself'];
// The worst of them are also refused when buried inside a longer word or run together.
const NEVER = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'asshole', 'dickhead', 'motherf', 'porn', 'hitler', 'retard'];
// Words that contain a stem innocently.
const FINE = ['weniger', 'niger', 'nigeria', 'nigerian', 'class', 'classic', 'glass', 'grass', 'pass', 'passage', 'passed', 'passing', 'compass', 'bass', 'brass', 'mass', 'massive', 'assess', 'asset', 'assist', 'assume', 'assure', 'assign', 'associate', 'ambassador', 'embassy', 'cassette', 'harass', 'sassafras', 'cockpit', 'cocktail', 'peacock', 'hancock', 'cockatoo', 'dickens', 'dickinson', 'scunthorpe', 'shiitake', 'analysis', 'analyse', 'analyze', 'analog', 'analogy', 'canal', 'banal', 'final', 'finale', 'penal', 'arsenal', 'parse', 'sparse', 'coarse', 'hoarse', 'hoe', 'shoe', 'shoes', 'cumulative', 'document', 'circumstance', 'cucumber', 'accumulate', 'titan', 'title', 'titanic', 'constitution', 'institution', 'petite', 'therapist', 'grape', 'drape', 'scrape', 'spice', 'spicy', 'raccoon', 'cocoon', 'tycoon', 'nudge', 'damnation', 'crapshoot', 'pissarro', 'essex', 'sussex', 'middlesex', 'sextant', 'sexton', 'unisex'];

/* Other languages, as far as a word list can reach. These are only the words that are rude in
 * one language and mean nothing ordinary in the others the trail is offered in (Spanish "con",
 * Korean 새끼 "pup" and 보지 "not see" are left out on purpose). Latin-script words match whole
 * words; Chinese, Japanese and Korean have no spaces, so those match anywhere. */
const ELSEWHERE = new Set([
  // Spanish
  'mierda', 'joder', 'jodido', 'jodete', 'puta', 'puto', 'putas', 'putos', 'coño', 'gilipollas', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'verga', 'chingar', 'chinga', 'chingada', 'chingado', 'maricon', 'culero', 'pinche', 'carajo', 'hijueputa', 'malparido', 'culiao', 'zorra',
  // French
  'merde', 'putain', 'pute', 'salope', 'salaud', 'connard', 'connasse', 'encule', 'encules', 'enculer', 'nique', 'niquer', 'batard', 'foutre', 'branleur', 'couille', 'couilles', 'chier', 'tapette', 'ducon', 'trouduc',
  // German
  'scheisse', 'scheiss', 'scheis', 'arschloch', 'arsch', 'fotze', 'hurensohn', 'hure', 'wichser', 'wixer', 'schlampe', 'ficken', 'ficker', 'fick', 'verfickt', 'verfickte', 'miststuck', 'spast', 'spasti', 'schwuchtel', 'nutte', 'kacke', 'pisser', 'drecksau', 'dreckssau', 'vollidiot', 'wichsen', 'kanake',
  // Italian
  'cazzo', 'cazzi', 'merda', 'stronzo', 'stronza', 'stronzi', 'vaffanculo', 'fanculo', 'puttana', 'puttane', 'troia', 'minchia', 'coglione', 'coglioni', 'figa', 'culo', 'bastardo', 'zoccola', 'frocio', 'mignotta', 'porcodio', 'cagare',
  // Portuguese
  'porra', 'caralho', 'foda', 'fodase', 'foder', 'fodido', 'buceta', 'viado', 'cuzao', 'arrombado', 'bosta', 'cacete', 'babaca', 'desgracado', 'vagabunda', 'punheta', 'boquete',
]);
const ELSEWHERE_SAID = ['hijo de puta', 'hijos de puta', 'hija de puta', 'me cago en', 'vete a la mierda', 'la concha de tu', 'chinga tu madre', 'filho da puta', 'filha da puta', 'vai tomar no cu', 'vai se foder', 'vai te foder', 'puta que pariu', 'fils de pute', 'nique ta mere', 'va te faire', 'ta gueule', 'ferme ta gueule', 'porco dio', 'porca madonna', 'figlio di puttana', 'vai a cagare', 'leck mich', 'halt die fresse', 'halts maul', 'fick dich', 'verpiss dich', 'du sau'];
const ELSEWHERE_ANY = ['操你', '肏', '傻逼', '傻b', '煞笔', '他妈的', '妈的', '你妈', '尼玛', '草泥马', '婊子', '鸡巴', '屌', '滚蛋', '狗屎', '王八蛋', '贱人', '去死', '混蛋', '色情', '日你', '干你',
  'くそったれ', 'クソ', '糞野郎', 'ちくしょう', '畜生', '死ね', 'くたばれ', '殺すぞ', 'ファック', 'ちんこ', 'ちんぽ', 'まんこ', 'おっぱい', 'うんこ', 'ポルノ', '馬鹿野郎', 'バカ野郎', 'ばかやろう', 'きもい', 'うざい',
  '씨발', '시발', '씨팔', '씨바', 'ㅅㅂ', '좆', '병신', 'ㅂㅅ', '개새끼', '개새', '지랄', '닥쳐', '꺼져', '미친놈', '미친년', '엿먹어', '섹스', '야동', '포르노', '창녀', '존나', '좃'];
// Selling something, in the same languages.
const PROMO_ELSEWHERE = /\b(sigueme|siganme|suscribete|mi canal|mi tienda|mi negocio|abonne toi|abonnez vous|suis moi|suivez moi|ma chaine|ma boutique|folge mir|folgt mir|abonniere|abonniert|mein kanal|mein shop|seguimi|seguitemi|iscriviti|iscrivetevi|il mio canale|il mio negozio|siga me|me siga|me sigam|inscreva se|inscrevam se|meu canal|minha loja)\b/, PROMO_ANY = ['关注我', '訂閱', '订阅', '我的频道', '微信', '加我', '淘宝', 'フォローして', 'チャンネル登録', '私のチャンネル', 'フォローお願い', '팔로우', '구독', '내 채널', '카톡', '카카오톡'];
const plainAll = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/ñ/g, '\u0001').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
function rudeElsewhere(text) {
  const p = squeeze(plainAll(text)), words = p.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.some((w) => ELSEWHERE.has(w) || (w.length > 4 && w.endsWith('s') && ELSEWHERE.has(w.slice(0, -1))))) return true;
  const flat = ' ' + words.join(' ') + ' ';
  if (ELSEWHERE_SAID.some((said) => flat.includes(' ' + said + ' '))) return true;
  const packed = String(text || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');      // 操 你, 씨.발
  return ELSEWHERE_ANY.some((bad) => packed.includes(bad));
}

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
  return rudePlain(raw) || rudeElsewhere(raw);
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
    || PROMO_ELSEWHERE.test(plainAll(t).replace(/[^\p{L}\s]+/gu, ' ')) || PROMO_ANY.some((w) => t.normalize('NFKC').replace(/\s+/g, '').includes(w))
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
