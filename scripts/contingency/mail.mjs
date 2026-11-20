/* Contingency plan: sending e-mail and reading replies, with no dependencies.
 *
 *   send(smtp, { from, to, subject, text, replyTo })   one plain-text message over SMTP
 *   inbox(imap, sinceUid, from, { query, bytes })     (query: extra IMAP search terms; bytes: how much of each body to read)
 *   inbox(imap, sinceUid, from)                        → [{ uid, from, subject, text }] newer than sinceUid, from those addresses
 *
 * smtp / imap: { host, port, user, pass, secure }. secure defaults to true (TLS from the first
 * byte: port 465 for SMTP, 993 for IMAP); secure: 'starttls' upgrades a plain SMTP connection
 * (port 587); secure: false is for tests against a local pretend server only.
 * Nothing here logs anything: addresses and message text never reach a workflow log. */
import net from 'node:net';
import tls from 'node:tls';

function open({ host, port, secure = true }) {
  return new Promise((resolve, reject) => {
    const sock = secure === true ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    sock.setTimeout(30000, () => sock.destroy(new Error('mail server timed out')));
    sock.once('error', reject);
    sock.once(secure === true ? 'secureConnect' : 'connect', () => resolve(sock));
  });
}
/** Read from a socket until `done(buffer)` says the reply is complete. */
function reader(sock) {
  let buf = Buffer.alloc(0), waiting = null;
  const check = () => { if (!waiting) return; const end = waiting.done(buf); if (end >= 0) { const out = buf.subarray(0, end); buf = buf.subarray(end); const w = waiting; waiting = null; w.resolve(out); } };
  sock.on('data', (d) => { buf = Buffer.concat([buf, d]); check(); });
  sock.on('close', () => { if (waiting) waiting.reject(new Error('mail server closed the connection')); });
  sock.on('error', (e) => { if (waiting) waiting.reject(e); });
  return { until: (done) => new Promise((resolve, reject) => { waiting = { done, resolve, reject }; check(); }), swap: (s) => { sock = s; s.on('data', (d) => { buf = Buffer.concat([buf, d]); check(); }); } };
}

/* ---------- SMTP ---------- */
// A reply is complete at a line "NNN text" (a space after the code, not a dash).
const smtpDone = (buf) => { const s = buf.toString('latin1'); const m = /(^|\r\n)\d{3} [^\r\n]*\r\n/.exec(s); return m ? m.index + m[0].length : -1; };
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const bare = (addr) => { const m = /<([^<>]+)>/.exec(addr); return (m ? m[1] : addr).trim(); };

export async function send(smtp, { from, to, subject, text, replyTo }) {
  let sock = await open({ ...smtp, secure: smtp.secure === 'starttls' ? false : smtp.secure });
  let rd = reader(sock);
  const say = async (line, want) => {
    if (line != null) sock.write(line + '\r\n');
    const reply = (await rd.until(smtpDone)).toString('latin1'), code = reply.trim().split('\r\n').pop().slice(0, 3);
    if (want && !want.includes(code)) throw new Error(`mail server refused (${code})`);
    return reply;
  };
  try {
    await say(null, ['220']);
    await say('EHLO contingency.local', ['250']);
    if (smtp.secure === 'starttls') {
      await say('STARTTLS', ['220']);
      sock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, servername: smtp.host }, () => resolve(t)); t.once('error', reject); });
      rd = reader(sock); await say('EHLO contingency.local', ['250']);
    }
    if (smtp.user) { await say('AUTH LOGIN', ['334']); await say(b64(smtp.user), ['334']); await say(b64(smtp.pass), ['235']); }
    await say(`MAIL FROM:<${bare(from)}>`, ['250']);
    await say(`RCPT TO:<${bare(to)}>`, ['250', '251']);
    await say('DATA', ['354']);
    const id = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${bare(from).split('@')[1] || 'localhost'}>`;
    const head = [`From: ${from}`, `To: ${to}`, `Subject: ${header(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${id}`, replyTo ? `Reply-To: ${replyTo}` : null,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', 'Auto-Submitted: auto-generated'].filter(Boolean).join('\r\n');
    const body = b64(text.replace(/\r?\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n');
    await say(`${head}\r\n\r\n${body}\r\n.`, ['250']);
    await say('QUIT').catch(() => {});
  } finally { sock.destroy(); }
}

/* ---------- IMAP ---------- */
/** Only messages from the given addresses are looked at at all (when a list is given), and never
 *  more than the newest 200: the rest of the mailbox is none of this plan's business. */
export async function inbox(imap, sinceUid = 0, from = [], { query = '', bytes = 20000 } = {}) {
  const sock = await open(imap), rd = reader(sock);
  let n = 0;
  // A command is finished at its tagged line; literals ({123}\r\n + 123 bytes) are skipped whole.
  const cmd = async (text) => {
    const tag = 'c' + (++n);
    sock.write(`${tag} ${text}\r\n`);
    const done = (buf) => {
      let i = 0;
      while (i < buf.length) {
        const eol = buf.indexOf('\r\n', i); if (eol < 0) return -1;
        const line = buf.toString('latin1', i, eol), lit = /\{(\d+)\}$/.exec(line);
        if (lit) { i = eol + 2 + Number(lit[1]); if (i > buf.length) return -1; continue; }
        i = eol + 2;
        if (line.startsWith(tag + ' ')) { if (!/^\S+ OK/i.test(line)) throw new Error('mailbox refused a command'); return i; }
      }
      return -1;
    };
    return rd.until(done);
  };
  const quote = (s) => '"' + String(s).replace(/[\\"]/g, '\\$&') + '"';
  const out = [];
  try {
    await rd.until((buf) => { const e = buf.indexOf('\r\n'); return e < 0 ? -1 : e + 2; });         // greeting
    await cmd(`LOGIN ${quote(imap.user)} ${quote(imap.pass)}`);
    await cmd(`SELECT ${imap.box || 'INBOX'}`);
    const who = from.filter((a) => /^[^\s"\\]+@[^\s"\\]+$/.test(a)).map((a) => `FROM ${quote(a)}`);
    const filter = who.length ? ' ' + who.slice(0, -1).map((f) => `OR ${f}`).concat(who.slice(-1)).join(' ') : '';
    const found = (await cmd(`UID SEARCH UID ${sinceUid + 1}:*${filter}${query ? ' ' + query : ''}`)).toString('latin1');
    const uids = ((/\* SEARCH([^\r\n]*)/.exec(found) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number).filter((u) => u > sinceUid).sort((a, b) => a - b).slice(-200);
    for (const uid of uids) {
      const raw = await cmd(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)] BODY.PEEK[TEXT]<0.${bytes}>)`);
      const parts = []; let i = 0;
      while (i < raw.length) { const eol = raw.indexOf('\r\n', i); if (eol < 0) break; const lit = /\{(\d+)\}$/.exec(raw.toString('latin1', i, eol)); if (lit) { parts.push(raw.subarray(eol + 2, eol + 2 + Number(lit[1]))); i = eol + 2 + Number(lit[1]); } else i = eol + 2; }
      const head = (parts[0] || Buffer.alloc(0)).toString('utf8').replace(/\r\n[ \t]+/g, ' ');
      out.push({ uid, from: (/^From:\s*(.*)$/im.exec(head) || [])[1] || '', subject: (/^Subject:\s*(.*)$/im.exec(head) || [])[1] || '', text: readable(parts[1] || Buffer.alloc(0)) });
    }
    await cmd('LOGOUT').catch(() => {});
  } finally { sock.destroy(); }
  return out;
}

/** A message body as text we can search for a code: quoted-printable soft breaks joined, and any
 *  base64 parts decoded as well (mail apps encode perfectly ordinary replies that way). */
export function readable(buf) {
  const raw = buf.toString('utf8');
  let text = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  for (const m of raw.matchAll(/(?:^|\r?\n)((?:[A-Za-z0-9+/]{40,}={0,2}\r?\n?){1,})/g)) {
    try { const d = Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8'); if (/[\x20-\x7e]{12,}/.test(d)) text += '\n' + d; } catch (e) { /* not base64 after all */ }
  }
  return text.slice(0, Math.max(40000, buf.length * 2));
}
