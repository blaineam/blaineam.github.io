/* Collecting e-mailed runs: what gets filed, what is left alone, and that nothing but the sealed
 * text and the validated public part ever reaches an issue.   node --test scripts/trail-mail.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, sealRun, issueBody, publicPart, openRun, readSealedBlock, readEnvelope } from '../trail/seal.js';
import { plan, envelopeIn, tagFor } from './trail-mail.mjs';
import { readable } from './contingency/mail.mjs';
import { buildRegister } from './trail-register.mjs';

const KEY = 'test-key', pair = await generateKeyPair({ modulusLength: 2048 }), other = await generateKeyPair({ modulusLength: 2048 });
const run = (handle) => ({ v: 2, handle, seed: 1, began: '2026-11-20T00:00:00Z', camps: { trailhead: { done: '2026-11-20T10:00:00.000Z', parts: { fire: { done: true, said: 'A private answer that must never be public.' } } } }, at: { camp: 'trailhead', stage: 'done' } });
async function mailBody(handle, { pub = false, key = pair } = {}) {
  const r = run(handle), p = pub ? publicPart(r, { public: true, line: 'Walks slowly.' }) : null;
  const envelope = await sealRun(r, key.publicJwk, { choices: { pool: true, now: false, public: !!p }, contact: 'secret@example.com', public: p });
  return issueBody({ envelope, publicPart: p, choices: { public: !!p } });
}
const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
const asIssues = (create, start = 1) => create.map((c, i) => ({ number: start + i, user: bot, title: c.title, body: c.body, labels: c.labels.map((name) => ({ name })), comments: [] }));

test('a sealed run in a plain message is filed, with nothing of the message but the run', async () => {
  const body = await mailBody('Robin');
  const { create, stats } = plan([{ from: 'Robin Example <robin@example.com>', subject: 'Trail run (sealed)', text: 'Hello Blaine, here it is!\n\n' + body + '\n\n-- \nRobin\n+1 555 0100' }], [], { keyId: pair.kid, key: KEY });
  assert.equal(create.length, 1); assert.equal(stats.filed, 1);
  const issue = create[0];
  assert.equal(issue.title, 'Trail run (sealed)'); assert.deepEqual(issue.labels, ['trail', 'trail-mail']);
  for (const leak of ['robin@example.com', 'Robin Example', 'Hello Blaine', '555 0100', 'secret@example.com', 'private answer']) assert.ok(!issue.body.includes(leak), 'leaked: ' + leak);
  assert.match(issue.body, /<!-- trail:mail [0-9a-f]{16} [0-9a-f]{12} -->/);
  // and the keeper can still open exactly what was sealed
  const opened = await openRun(readSealedBlock(issue.body), pair.privateKey, { kid: pair.kid });
  assert.equal(opened.run.handle, 'Robin');
});

test('quoting, CRLF and re-wrapping by a mail program do not break a run', async () => {
  const body = await mailBody('Quoted');
  const mangled = body.split('\n').map((l) => '> ' + l).join('\r\n').replace(/([A-Za-z0-9_-]{76})/g, (m) => m.slice(0, 60) + '\r\n> ' + m.slice(60));
  const env = envelopeIn(mangled); assert.ok(env); assert.equal(readEnvelope(env.text).kid, pair.kid);
  assert.equal(env.id, envelopeIn(body).id, 'the same run has the same fingerprint however it was wrapped');
});

test('a run sent as a base64 attachment is found', async () => {
  const body = await mailBody('Attached');
  const mime = '--b1\r\nContent-Type: text/plain\r\n\r\nMy sealed trail run is attached.\r\n--b1\r\nContent-Type: text/plain; name="trail-run-sealed.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(body + '\n').toString('base64').replace(/.{76}/g, '$&\r\n') + '\r\n--b1--\r\n';
  const { create } = plan([{ from: 'a@example.com', subject: 'Trail run (sealed)', text: readable(Buffer.from(mime)) }], [], { keyId: pair.kid, key: KEY });
  assert.equal(create.length, 1);
});

test('already filed, sealed to another key, or broken: nothing is filed', async () => {
  const body = await mailBody('Once'), first = plan([{ from: 'a@example.com', text: body }], [], { keyId: pair.kid, key: KEY });
  const again = plan([{ from: 'a@example.com', text: body }], asIssues(first.create), { keyId: pair.kid, key: KEY });
  assert.equal(again.create.length, 0); assert.equal(again.stats.alreadyFiled, 1);
  const foreign = plan([{ from: 'b@example.com', text: await mailBody('Elsewhere', { key: other }) }], [], { keyId: pair.kid, key: KEY });
  assert.equal(foreign.create.length, 0); assert.equal(foreign.stats.otherKey, 1);
  const broken = plan([{ from: 'c@example.com', text: body.replace(/[A-Za-z0-9_-]{40}/, '!!!not base64!!!') }], [], { keyId: pair.kid, key: KEY });
  assert.equal(broken.create.length, 0); assert.equal(broken.stats.unreadable, 1);
  assert.equal(plan([{ from: 'd@example.com', text: 'Just saying hello.' }], [], { keyId: pair.kid, key: KEY }).create.length, 0);
});

test('one sender cannot flood: two a run each, ten a run in all', async () => {
  const many = []; for (let i = 0; i < 4; i++) many.push({ from: 'flood@example.com', text: await mailBody('Flood' + i) });
  const r = plan(many, [], { keyId: pair.kid, key: KEY });
  assert.equal(r.create.length, 2); assert.equal(r.stats.heldBack, 2);
});

test('the public part is validated, and each sender is their own entry on the register', async () => {
  const a = plan([{ from: 'ann@example.com', text: await mailBody('Ann', { pub: true }) }], [], { keyId: pair.kid, key: KEY });
  const b = plan([{ from: 'ben@example.com', text: await mailBody('Ben', { pub: true }) }], asIssues(a.create), { keyId: pair.kid, key: KEY });
  assert.equal(a.create[0].title, 'Trail run: Ann');
  const issues = [...asIssues(a.create, 1), ...asIssues(b.create, 2)].map((i) => ({ ...i, labels: [...i.labels, { name: 'trail:approved' }] }));
  const { register } = buildRegister(issues);
  assert.deepEqual(register.entries.map((e) => e.handle).sort(), ['Ann', 'Ben'], 'two senders, two entries, though one bot filed both');
  // a forged public block is dropped, the run is still filed sealed
  const forged = (await mailBody('Mallory')).replace('**Nothing public.**', '<!-- trail:public:begin -->\n```json\n{"v":1,"handle":"<script>","camps":[],"extra":"https://spam.example"}\n```\n<!-- trail:public:end -->');
  const f = plan([{ from: 'm@example.com', text: forged }], [], { keyId: pair.kid, key: KEY });
  assert.equal(f.create.length, 1); assert.equal(f.create[0].title, 'Trail run (sealed)'); assert.ok(!f.create[0].body.includes('spam.example'));
});

test('"remove me" from someone with a run on file is passed on once, and takes them off the register', async () => {
  const a = plan([{ from: 'ann@example.com', text: await mailBody('Ann', { pub: true }) }], [], { keyId: pair.kid, key: KEY });
  const issues = asIssues(a.create).map((i) => ({ ...i, labels: [...i.labels, { name: 'trail:approved' }] }));
  const wish = plan([{ from: 'Ann <ann@example.com>', text: 'Remove me\n\n> On Monday someone wrote:\n> your run' }], issues, { keyId: pair.kid, key: KEY });
  assert.deepEqual(wish.say, [{ number: 1, body: 'remove me' }]);
  assert.equal(plan([{ from: 'stranger@example.com', text: 'remove me' }], issues, { keyId: pair.kid, key: KEY }).say.length, 0, 'a stranger cannot remove someone else');
  issues[0].comments = [{ id: 9, user: bot, body: 'remove me', created_at: '2026-11-21T00:00:00Z' }];
  assert.equal(plan([{ from: 'ann@example.com', text: 'remove me' }], issues, { keyId: pair.kid, key: KEY }).say.length, 0, 'not said twice');
  assert.equal(buildRegister(issues).register.entries.length, 0);
  assert.notEqual(tagFor(KEY, 'ann@example.com'), tagFor('another-key', 'ann@example.com'));
});
