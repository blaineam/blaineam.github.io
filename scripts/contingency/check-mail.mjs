// Checks content/private/contingency-mail.json without printing anything in it.
import fs from 'node:fs';
const p = process.argv[2]; let m;
try { m = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.log('Not valid JSON: ' + e.message); process.exit(1); }
const bad = [];
for (const k of ['smtp', 'imap']) { const s = m[k] || {}; if (!s.host || !s.port) bad.push(k + ' host/port'); if (!/^[^\s@]+@[^\s@]+$/.test(s.user || '') || /YOUR-ADDRESS/.test(s.user)) bad.push(k + ' user is not filled in'); if (!s.pass || /APP-PASSWORD/.test(s.pass)) bad.push(k + ' pass is not filled in'); else if (/\s/.test(s.pass)) bad.push(k + ' pass still has spaces in it'); else if (/gmail/.test(s.host) && s.pass.length !== 16) bad.push(k + ' pass is not 16 characters'); }
if (!/<[^\s@]+@[^\s@]+>/.test(m.from || '') || /YOUR-ADDRESS/.test(m.from)) bad.push('from is not filled in');
console.log(bad.length ? 'Still to fix: ' + bad.join('; ') : 'Looks right: both servers, an address, and a 16-character app password.');
