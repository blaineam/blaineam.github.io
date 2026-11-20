/* Tests for the contingency plan: a pretend calendar for the decisions, and pretend mail
 * servers on this machine for sending and reading. Run: node scripts/contingency/test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { step, emptyState, stageFor, codeFor, addDays, letter, LETTERS, DEFAULTS } from './plan.mjs';
import { send, inbox, readable } from './mail.mjs';
import { seal, unseal, setSiteState } from './notify.mjs';

const key = 'test-key', owner = { name: 'Blaine', email: 'owner@example.test' };
const people = [{ id: 'a', name: 'Austin', email: 'a@example.test' }, { id: 'j', name: 'James', email: 'j@example.test' }, { id: 't', name: 'Tracy', email: 't@example.test' }, { id: 'e', name: 'Elle', email: '' }];
const cfg = { ...DEFAULTS };
/** Walk the calendar day by day from the last heartbeat; `on(day, state)` may return replies for that day. */
function walk(days, on = () => []) {
  const last = '2026-01-01'; let state = emptyState(); const log = [], sites = [];
  for (let d = 0; d <= days; d++) {
    const today = addDays(last, d), replies = on(d, state) || [];
    const r = step(state, { today, last, cfg, people, owner, replies, key });
    state = r.state; for (const m of r.outbox) log.push({ d, ...m }); if (r.site) sites.push({ d, site: r.site });
  }
  return { state, log, sites };
}
const kinds = (log, kind) => log.filter((m) => m.kind === kind);
const reply = (p, line, uid = 1) => ({ uid, from: `${p.name} <${p.email}>`, text: `Sure.\n\n${line}\n\n> On some day the watcher wrote:\n> ...` });

test('stages', () => {
  assert.equal(stageFor('2026-01-01', '2026-01-20', cfg).stage, 'normal');
  assert.equal(stageFor('2026-01-01', '2026-01-31', cfg).stage, 'quiet');
  assert.equal(stageFor('2026-01-01', '2026-04-01', cfg).stage, 'eligible');
  assert.equal(stageFor('', '2026-04-01', cfg).stage, 'unknown');
  assert.equal(stageFor('2026-05-01', '2026-04-01', cfg).stage, 'normal');
});

test('the owner is nudged first, and nobody else hears before day 30', () => {
  const { log } = walk(29);
  assert.deepEqual(kinds(log, 'owner-nudge').map((m) => m.d), [14, 21, 27]);
  assert.ok(log.every((m) => m.to === owner.email), 'only the owner was written to');
});

test('at day 30 the three reachable people are told once, and nothing public happens', () => {
  const { log, sites } = walk(89);
  const told = kinds(log, 'quiet');
  assert.equal(told.length, 3); assert.ok(told.every((m) => m.d === 30));
  assert.deepEqual(told.map((m) => m.to).sort(), ['a@example.test', 'j@example.test', 't@example.test']);
  assert.equal(kinds(log, 'confirm').length, 0); assert.equal(sites.length, 0);
});

test('at day 90 they are asked, reminded weekly, and silence never flips the site', () => {
  const { log, sites, state } = walk(120);
  assert.equal(kinds(log, 'confirm').length, 3);
  assert.deepEqual([...new Set(kinds(log, 'confirm-reminder').map((m) => m.d))], [97, 104, 111, 118]);
  assert.equal(sites.length, 0); assert.equal(state.flipped, false);
});

test('two confirmations are not enough; the third flips the site and tells everyone', () => {
  const cycle = '2026-01-01', c = (p) => 'CONFIRM ' + codeFor(key, cycle, p.id);
  const two = walk(100, (d) => d === 91 ? [reply(people[0], c(people[0]), 1)] : d === 92 ? [reply(people[1], c(people[1]), 2)] : []);
  assert.equal(two.sites.length, 0); assert.equal(Object.keys(two.state.confirms).length, 2);
  const three = walk(100, (d) => d === 91 ? [reply(people[0], c(people[0]), 1)] : d === 92 ? [reply(people[1], c(people[1]), 2)] : d === 95 ? [reply(people[2], c(people[2]), 3)] : []);
  assert.deepEqual(three.sites, [{ d: 95, site: 'contingency' }]);
  assert.equal(kinds(three.log, 'begun').length, 3);
  assert.equal(kinds(three.log, 'confirm-reminder').filter((m) => m.d > 95).length, 0, 'no more reminders once it has begun');
});

test('a code only counts from its own person, once, and only after they were asked', () => {
  const cycle = '2026-01-01', a = people[0], j = people[1];
  // James sends Austin's code; a stranger sends a real code; Austin confirms twice; Austin's code arrives on day 40
  const r = walk(100, (d) => d === 40 ? [reply(a, 'CONFIRM ' + codeFor(key, cycle, a.id), 1)]
    : d === 91 ? [reply(j, 'CONFIRM ' + codeFor(key, cycle, a.id), 2), { uid: 3, from: 'x@evil.test', text: 'CONFIRM ' + codeFor(key, cycle, a.id) }]
    : d === 92 ? [reply(a, 'CONFIRM ' + codeFor(key, cycle, a.id), 4), reply(a, 'confirm ' + codeFor(key, cycle, a.id).toLowerCase().replace('-', ' '), 5)] : []);
  assert.deepEqual(Object.keys(r.state.confirms), ['a']); assert.equal(r.sites.length, 0);
});

test('codes from an earlier silence no longer work', () => {
  const old = codeFor(key, '2025-06-01', 'a');
  const r = walk(100, (d) => d === 91 ? [reply(people[0], 'CONFIRM ' + old, 1)] : []);
  assert.equal(Object.keys(r.state.confirms).length, 0);
  assert.notEqual(old, codeFor(key, '2026-01-01', 'a'));
});

test('any one of them can make everyone wait, even after three confirmations are in hand', () => {
  const cycle = '2026-01-01', c = (p) => 'CONFIRM ' + codeFor(key, cycle, p.id);
  const r = walk(104, (d) => d === 91 ? [reply(people[0], c(people[0]), 1), reply(people[1], c(people[1]), 2)]
    : d === 92 ? [reply(people[2], 'WAIT ' + codeFor(key, cycle, 't', 'wait'), 3)] : d === 93 ? [reply(people[2], c(people[2]), 4)] : []);
  assert.equal(kinds(r.log, 'waiting').length, 3);
  assert.equal(r.sites.length, 0, 'nothing flips while waiting');
  const later = walk(110, (d) => d === 91 ? [reply(people[0], c(people[0]), 1), reply(people[1], c(people[1]), 2)]
    : d === 92 ? [reply(people[2], 'WAIT ' + codeFor(key, cycle, 't', 'wait'), 3)] : d === 93 ? [reply(people[2], c(people[2]), 4)] : []);
  assert.deepEqual(later.sites, [{ d: 106, site: 'contingency' }], 'after the fortnight, three confirmations stand');
});

test('a heartbeat at any point resets everything and tells whoever was told', () => {
  let state = emptyState(); const last = '2026-01-01';
  for (let d = 0; d <= 95; d++) state = step(state, { today: addDays(last, d), last, cfg, people, owner, key }).state;
  assert.equal(state.asked, true);
  const r = step(state, { today: addDays(last, 96), last: addDays(last, 96), cfg, people, owner, key });
  assert.equal(kinds(r.outbox, 'all-clear').length, 3); assert.equal(r.state.asked, false); assert.equal(r.state.cycle, '');
  // and if the note was already showing, the site goes back to normal
  const flipped = step({ ...state, flipped: true }, { today: addDays(last, 96), last: addDays(last, 96), cfg, people, owner, key });
  assert.equal(flipped.site, 'normal');
  // a normal day with nothing going on sends nothing
  assert.equal(step(emptyState(), { today: '2026-03-02', last: '2026-03-01', cfg, people, owner, key }).outbox.length, 0);
});

test('no heartbeat on record is never treated as silence', () => {
  const r = step(emptyState(), { today: '2026-06-01', last: '', cfg, people, owner, key });
  assert.equal(r.outbox.length, 0); assert.equal(r.site, null);
});

test('every letter fills in completely and names no date of silence beyond a count', () => {
  for (const kind of Object.keys(LETTERS)) {
    const l = letter(kind, { name: 'Tracy', owner: 'Blaine', days: 90, left: 3, until: '2026-05-01', by: 'James', have: 2, need: 3, code: 'ABCDE-FGHJK', wait: 'MNPQR-STUVW', today: '2026-04-01' });
    assert.ok(!/\{\w+\}/.test(l.subject + l.text), `${kind} has an unfilled blank`);
    assert.ok(l.text.length > 80);
  }
});

test('the remembered state is sealed, the same size every day, and different every day', () => {
  const a = seal({ ...emptyState(), cycle: '2026-01-01', confirms: { a: '2026-04-02' } }, key), b = seal(emptyState(), key);
  assert.equal(a.length, b.length); assert.notEqual(a, seal({ ...emptyState(), cycle: '2026-01-01', confirms: { a: '2026-04-02' } }, key));
  assert.equal(unseal(a, key).confirms.a, '2026-04-02');
  assert.throws(() => unseal(a, 'wrong'));
  assert.ok(!a.includes('2026') && !a.includes('confirms'));
});

test('the site switch edits one value and leaves the rest of the file alone', () => {
  const text = '{\n  "mode": "maker",\n  "contingency": { "quietDays": 30, "publicDays": 90, "state": "normal" },\n  "_contingency_help": "…"\n}\n';
  const on = setSiteState(text, 'contingency', '2026-04-05');
  assert.equal(JSON.parse(on).contingency.state, 'contingency'); assert.equal(JSON.parse(on).contingency.since, '2026-04-05'); assert.equal(JSON.parse(on).mode, 'maker');
  assert.equal(setSiteState(text, 'normal', '2026-04-05'), null);
  assert.equal(JSON.parse(setSiteState(on, 'normal', '2026-04-06')).contingency.state, 'normal');
});

/* ---------- pretend mail servers ---------- */
function fakeSmtp(got) {
  return net.createServer((s) => {
    let data = false, body = '';
    s.write('220 ready\r\n');
    s.on('data', (d) => {
      const t = d.toString();
      if (data) { body += t; if (body.endsWith('\r\n.\r\n')) { data = false; got.push(body); s.write('250 queued\r\n'); } return; }
      for (const line of t.split('\r\n').filter(Boolean)) {
        if (/^EHLO/.test(line)) s.write('250-hello\r\n250 AUTH LOGIN\r\n');
        else if (/^AUTH LOGIN/.test(line)) s.write('334 VXNlcm5hbWU6\r\n');
        else if (/^(MAIL|RCPT)/.test(line)) { got.push(line); s.write('250 ok\r\n'); }
        else if (/^DATA/.test(line)) { data = true; s.write('354 go\r\n'); }
        else if (/^QUIT/.test(line)) { s.write('221 bye\r\n'); s.end(); }
        else if (got.auth === undefined) { got.auth = 1; s.write('334 UGFzc3dvcmQ6\r\n'); } else s.write('235 ok\r\n');
      }
    });
  });
}
function fakeImap(messages) {
  return net.createServer((s) => {
    s.write('* OK ready\r\n');
    s.on('data', (d) => {
      for (const line of d.toString().split('\r\n').filter(Boolean)) {
        const [tag, ...rest] = line.split(' '), cmd = rest.join(' ');
        if (/^UID SEARCH/.test(cmd)) s.write(`* SEARCH ${messages.map((m) => m.uid).join(' ')}\r\n${tag} OK done\r\n`);
        else if (/^UID FETCH/.test(cmd)) {
          const m = messages.find((x) => x.uid === Number(cmd.split(' ')[2])), head = `From: ${m.from}\r\nSubject: Re: hello\r\n\r\n`;
          s.write(`* 1 FETCH (UID ${m.uid} BODY[HEADER.FIELDS (FROM SUBJECT)] {${Buffer.byteLength(head)}}\r\n${head} BODY[TEXT]<0> {${Buffer.byteLength(m.body)}}\r\n${m.body})\r\n${tag} OK done\r\n`);
        } else s.write(`${tag} OK done\r\n`);
      }
    });
  });
}
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

test('a letter goes out over SMTP as plain text, to one person', async () => {
  const got = [], server = fakeSmtp(got), port = await listen(server);
  await send({ host: '127.0.0.1', port, user: 'u', pass: 'p', secure: false }, { from: 'Watcher <w@example.test>', to: 'a@example.test', subject: 'About Blaine: “quiet”', text: 'Line one.\nCONFIRM ABCDE-FGHJK\n' });
  server.close();
  assert.ok(got.includes('MAIL FROM:<w@example.test>') && got.includes('RCPT TO:<a@example.test>'));
  const msg = got.find((x) => x.includes('Subject:'));
  assert.match(msg, /Subject: =\?UTF-8\?B\?/); assert.match(msg, /Content-Transfer-Encoding: base64/);
  assert.match(Buffer.from(msg.split('\r\n\r\n')[1].replace(/\.\r\n$/, ''), 'base64').toString(), /CONFIRM ABCDE-FGHJK/);
});

test('replies are read from the mailbox, newer ones only, however the mail app encoded them', async () => {
  const code = codeFor(key, '2026-01-01', 'a'), qp = `Yes.\r\n\r\nCONFIRM ${code.slice(0, 4)}=\r\n${code.slice(4)}\r\n`;
  const b64 = 'Content-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(`I agree.\n\nCONFIRM ${code}\n\n> quoted text that makes this long enough to be a real message`).toString('base64').replace(/.{76}/g, '$&\r\n') + '\r\n';
  const server = fakeImap([{ uid: 4, from: 'Old <a@example.test>', body: 'old' }, { uid: 7, from: 'Austin <a@example.test>', body: qp }, { uid: 9, from: '"James" <j@example.test>', body: b64 }]), port = await listen(server);
  const mail = await inbox({ host: '127.0.0.1', port, user: 'u', pass: 'p', secure: false }, 4);
  server.close();
  assert.deepEqual(mail.map((m) => m.uid), [7, 9]);
  assert.match(mail[0].text.toUpperCase().replace(/[^A-Z0-9]/g, ''), new RegExp(code.replace('-', '')));
  assert.match(mail[1].text, new RegExp(code));
  assert.equal(readable(Buffer.from('caf=C3=A9 soft=\r\nbreak')), 'café softbreak'.replace('é', 'Ã©'));
  // and the plan accepts the quoted-printable one as Austin's confirmation
  let state = emptyState(); const last = '2026-01-01';
  for (let d = 0; d <= 90; d++) state = step(state, { today: addDays(last, d), last, cfg, people, owner, key }).state;
  const r = step(state, { today: addDays(last, 91), last, cfg, people, owner, replies: mail, key });
  assert.deepEqual(Object.keys(r.state.confirms), ['a']); assert.equal(r.state.lastUid, 9);
});
