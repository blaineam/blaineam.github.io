/* The manners filter in the trail's other languages: known rude words are caught, ordinary
 * sentences are not, and nothing the trail itself says trips its own filter. */
import fs from 'node:fs';
const { rude, promo, checkWritten } = await import(new URL('./manners.js', import.meta.url).href);
const bad = ['Eres un hijo de puta', 'qué mierda es esto', 'Coño!', 'va te faire foutre', 'Putain de merde', 'espèce de connard', 'Du Arschloch', 'So eine Scheiße', 'fick dich', 'Che cazzo dici', 'vaffanculo', 'vai tomar no cu', 'que porra é essa', 'caralho', '操你妈', '你这个傻逼', '他 妈 的', 'クソ野郎', '死ね', '씨발 뭐야', '병신아', '개새끼'];
const fine = ['Con mucho gusto, el cono de helado estaba rico', 'Je suis content de marcher avec vous', 'Ich habe den Aussichtspunkt erreicht und war müde', 'Il sentiero era lungo ma bello', 'Eu gostei muito da trilha e do abrigo', '강아지 새끼가 귀여워요. 보지 못했어요.', '今日は山頂まで歩きました。とても楽しかったです。', '我今天走到了山顶，很开心。', 'The class passed the compass around', 'Luma es una perra muy lista', 'Me gusta el culantro', 'la porte était fermée', 'Ein Mann namens Arne kam vorbei', 'il corno delle Alpi', 'computer scientist'];
let fails = 0;
for (const s of bad) if (!rude(s)) { fails++; console.log('MISSED rude:', s); }
for (const s of fine) if (rude(s)) { fails++; console.log('FALSE rude:', s); }
for (const s of ['Sígueme en mi canal', 'abonne-toi à ma chaîne', 'Folge mir auf meinem Kanal', 'iscriviti al mio canale', 'inscreva-se no meu canal', '关注我的频道', 'チャンネル登録お願いします', '구독 부탁해요']) if (!promo(s)) { fails++; console.log('MISSED promo:', s); }
for (const s of ['Me gusta caminar', 'Ich mag den Kanal von Panama', 'J’aime la boutique du village']) if (promo(s)) { fails++; console.log('FALSE promo:', s); }
// nothing the trail itself says, in any language, may trip its own filter
let n = 0;
for (const f of fs.readdirSync(new URL('../i18n', import.meta.url).pathname + '')) if (/^trail\..+\.json$/.test(f)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(new URL('../i18n', import.meta.url).pathname + '/' + f, 'utf8')))) { n++; if (rude(v.replace(/<[^>]+>/g, ' '))) { fails++; console.log('TRAIL TEXT flagged', f, '::', v.slice(0, 90)); } }
if (fails) process.exitCode = 1;
console.log(`${fails} problem(s); ${n} trail sentences checked`);
