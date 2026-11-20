/* Contingency plan: the decisions, with nothing else in them. No network, no files, no clock:
 * everything comes in as arguments, so every path can be tested with a pretend calendar.
 *
 *   stageFor(last, today, cfg)                → which stage a silence of that length is
 *   step(state, { today, last, cfg, people, replies, key }) → { state, outbox, site }
 *
 * The rules (docs/CONTINGENCY.md):
 *   - The owner is nudged first, privately, before anyone else hears anything.
 *   - After quietDays the trusted people are told. Nothing public happens.
 *   - After publicDays they are each asked to confirm, by replying to the e-mail they were sent.
 *     Each has their own code. When enough of them have confirmed, the site shows the note.
 *   - Any one of them can ask everyone to wait.
 *   - A heartbeat at any time puts everything back to normal and tells whoever was told.
 */
import crypto from 'node:crypto';

export const DEFAULTS = { quietDays: 30, publicDays: 90, ownerNudgeDays: [14, 21, 27], confirmationsNeeded: 3, reminderEveryDays: 7, waitDays: 14 };

/** Whole days between two YYYY-MM-DD dates (UTC, so a time zone can never add or drop a day). */
export function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`), b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.floor((b - a) / 86400000);
}

/** normal | quiet | eligible | unknown. "unknown" (no usable heartbeat) is never treated as silence. */
export function stageFor(last, today, { quietDays, publicDays }) {
  const days = daysBetween(last, today);
  if (!last || Number.isNaN(days)) return { stage: 'unknown', days: null };
  if (days < 0) return { stage: 'normal', days: 0 };            // a clock ahead of ours is not silence
  if (days >= publicDays) return { stage: 'eligible', days };
  if (days >= quietDays) return { stage: 'quiet', days };
  return { stage: 'normal', days };
}

/* ---------- the personal codes ----------
 * One per person per silence, derived from a secret only the workflow holds. Ten letters and
 * digits that survive being read aloud and retyped (no 0/O, 1/I/L). A code proves the reply came
 * from someone who received that person's e-mail. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function codeFor(key, cycle, personId, purpose = 'confirm') {
  const mac = crypto.createHmac('sha256', key).update(`${cycle}|${personId}|${purpose}`).digest();
  let out = ''; for (let i = 0; i < 10; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return out.slice(0, 5) + '-' + out.slice(5);
}
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const address = (s) => { const m = /<([^<>\s]+@[^<>\s]+)>/.exec(s || '') || /([^\s<>"']+@[^\s<>"']+)/.exec(s || ''); return m ? m[1].toLowerCase() : ''; };

export const emptyState = () => ({ v: 1, cycle: '', sent: {}, confirms: {}, waitUntil: '', waitBy: '', told: false, asked: false, flipped: false, lastUid: 0, seen: {} });

/**
 * One day's decision.
 *   state    what was remembered from yesterday (emptyState() the first time)
 *   today    YYYY-MM-DD
 *   last     the last heartbeat, YYYY-MM-DD ('' if none on record)
 *   cfg      thresholds (DEFAULTS merged with content/site.json → contingency)
 *   people   [{ id, name, email }]: the trusted people
 *   owner    { name, email }
 *   replies  [{ uid, from, text }]: e-mail that arrived since last time
 *   key      the secret the codes are derived from
 * Returns the new state, the e-mail to send, and site: 'contingency' | 'normal' | null (no change).
 */
export function step(state, { today, last, cfg, people = [], owner = {}, replies = [], key }) {
  cfg = { ...DEFAULTS, ...cfg };
  const s = { ...emptyState(), ...state, sent: { ...(state && state.sent) }, confirms: { ...(state && state.confirms) } };
  const outbox = [], { stage, days } = stageFor(last, today, cfg);
  const mail = (to, kind, extra = {}) => outbox.push({ to: to.email, kind, vars: { name: to.name, owner: owner.name || 'Blaine', days, today, ...extra } });
  const reachable = people.filter((p) => p.email);
  let site = null;

  // what has been read: the inbox by lastUid, any other folder (the Trash) by its own number in seen
  s.seen = { ...(state && state.seen) };
  for (const r of replies) { if (r.box) s.seen[r.box] = Math.max(s.seen[r.box] || 0, r.uid || 0); else s.lastUid = Math.max(s.lastUid, r.uid || 0); }

  // ---- a heartbeat: everything returns to normal, and whoever was told hears that too ----
  if (stage === 'normal' || stage === 'unknown') {
    const soon = stage === 'normal' && days >= Math.min(...cfg.ownerNudgeDays);
    if (!soon) {
      if (s.told || s.asked || s.flipped) for (const p of reachable) mail(p, 'all-clear');
      if (s.flipped) site = 'normal';
      return { state: { ...emptyState(), lastUid: s.lastUid, seen: s.seen }, outbox, site, stage, days };
    }
  }
  // a new silence starts a new cycle: old codes and confirmations no longer count
  if (s.cycle !== last) { Object.assign(s, emptyState(), { cycle: last, lastUid: s.lastUid, seen: s.seen }); }

  // ---- what people wrote back ----
  for (const r of replies) {
    const from = address(r.from), body = norm(r.text);
    for (const p of reachable) {
      if (from !== p.email.toLowerCase()) continue;
      if (body.includes(norm(codeFor(key, s.cycle, p.id, 'wait')))) {
        s.waitUntil = addDays(today, cfg.waitDays); s.waitBy = p.id;
        for (const q of reachable) mail(q, 'waiting', { by: p.name, until: s.waitUntil });
      } else if (s.asked && body.includes(norm(codeFor(key, s.cycle, p.id, 'confirm'))) && !s.confirms[p.id]) {
        s.confirms[p.id] = today;
        mail(p, 'confirm-received', { have: Object.keys(s.confirms).length, need: cfg.confirmationsNeeded });
      }
    }
  }
  const waiting = s.waitUntil && today < s.waitUntil;

  // ---- the owner first, quietly ----
  if (owner.email) for (const d of cfg.ownerNudgeDays) if (days >= d && days < cfg.quietDays && !s.sent['nudge' + d]) { s.sent['nudge' + d] = today; mail(owner, 'owner-nudge', { left: cfg.quietDays - days }); break; }

  // ---- the trusted people are told (nothing public) ----
  if (days >= cfg.quietDays && !s.told) {
    s.told = true; s.sent.told = today;
    for (const p of reachable) mail(p, 'quiet', { wait: codeFor(key, s.cycle, p.id, 'wait'), until: cfg.publicDays - days });
    if (owner.email) mail(owner, 'owner-told');
  }

  // ---- they are asked to confirm ----
  if (days >= cfg.publicDays && !s.flipped && !waiting) {
    const due = !s.asked || daysBetween(s.sent.asked, today) >= cfg.reminderEveryDays;
    if (due) {
      const again = s.asked; s.asked = true; s.sent.asked = today;
      for (const p of reachable) if (!s.confirms[p.id]) mail(p, again ? 'confirm-reminder' : 'confirm', { code: codeFor(key, s.cycle, p.id, 'confirm'), wait: codeFor(key, s.cycle, p.id, 'wait'), have: Object.keys(s.confirms).length, need: cfg.confirmationsNeeded });
    }
  }

  // ---- enough of them agree ----
  if (days >= cfg.publicDays && !s.flipped && !waiting && Object.keys(s.confirms).length >= cfg.confirmationsNeeded) {
    s.flipped = true; s.sent.flipped = today; site = 'contingency';
    for (const p of reachable) mail(p, 'begun', { have: Object.keys(s.confirms).length });
  }
  return { state: s, outbox, site, stage, days };
}

export function addDays(day, n) { return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }

/* ---------- the letters ----------
 * Plain text, plain words. {braces} are filled from vars. Nothing here names a date of silence
 * beyond a rough count, and nothing here is ever printed to a log. */
export const LETTERS = {
  'owner-nudge': { subject: 'Are you there? Your site has not heard from you', body: `{name},

Your site's daily check-in has not arrived for {days} days.

If you are fine, this is almost certainly the Shortcut: an expired token, or an automation that stopped running. Run the heartbeat Shortcut once and this goes away.

If nothing arrives in the next {left} days, the people you named will be told that the site has gone quiet. Nothing public happens without three of them agreeing, and never before day 90.

This message was sent by the contingency watcher on your own repository.` },
  'owner-told': { subject: 'The people you trust have now been told', body: `{name},

It has been {days} days without a check-in, so the people you named have been told, privately, that the site has gone quiet. Nothing has changed on the site.

One heartbeat puts everything back and tells them so.` },
  quiet: { subject: '{owner} asked that you be told if his site went quiet', body: `{name},

{owner} set up a plan for his website and apps in case something ever happened to him, and he named you as one of four people he trusts with it.

His site expects to hear from his phone every day. It has not heard from him for {days} days. That may mean nothing at all: a broken phone, a long trip, a setting that stopped working. Nothing has changed on his site and nothing is public.

For now there is one thing to do: check on him, in whatever way you normally would.

If {days} days becomes 90, you will get another message asking whether the site should say that he is gone. That only happens if at least three of the four of you agree, each by replying to your own message.

If you know he is fine, or you want everyone to hold off, reply to this message and include this line:

    WAIT {wait}

That pauses everything for two weeks and tells the others it was you.

Thank you for being someone he trusts.` },
  confirm: { subject: 'About {owner}: your answer is needed', body: `{name},

{owner}'s site has not heard from him for {days} days.

He asked that after this long, the people he trusts decide together whether his site should show the note he wrote for this day. It only happens if at least {need} of you agree. So far {have} have.

Please do not answer from this message alone. Speak to his family, or to each other, first.

If you are sure, reply to this message and include this line:

    CONFIRM {code}

That code is yours alone; do not pass it on. If you are not sure, do nothing: no answer counts as "not yet", and you will be asked again in a week.

If you know he is alive, or want everyone to wait, reply with this instead:

    WAIT {wait}

When enough of you have confirmed, his site will show his note, stay online, and point to the trail he built for finding someone to carry the work on. You will then get a message about what he asked of you next.` },
  'confirm-reminder': { subject: 'About {owner}: still waiting to hear from you', body: `{name},

A week ago you were asked whether {owner}'s site should show the note he wrote. {have} of the {need} needed have confirmed. It has now been {days} days.

There is no deadline. If you are sure, reply and include:

    CONFIRM {code}

If you know he is alive, or want everyone to wait:

    WAIT {wait}

If you are not sure, do nothing, and you will be asked again in a week.` },
  'confirm-received': { subject: 'Your answer has been recorded', body: `{name},

Your confirmation was received. That makes {have} of the {need} needed. Nothing changes until there are {need}.

If you sent it by mistake, reply to the original message with your WAIT line and everything pauses.` },
  waiting: { subject: 'About {owner}: everything is paused', body: `{name},

{by} has asked everyone to wait. Nothing will happen, and nobody will be asked anything, until {until}.

If you know more, talk to each other.` },
  begun: { subject: '{owner}\'s note is now showing on his site', body: `{name},

{have} of you confirmed, so {owner}'s site now shows the note he wrote for this day. Everything on it still works, and it will stay online.

What he asked of the four of you next:

1. Each of you holds one part of a key. Any three parts together open what people have written on the trail at wemiller.com/trail. The reading desk at wemiller.com/trail/desk walks you through putting the parts together.
2. Read what people wrote. He was looking for people who care about the same things, not for the cleverest answers.
3. Choose who carries the work on. It can be one person or several. If it is several, he wanted them to have an equal say and an equal share.
4. At least three of you should agree on the choice, the same as today.

Anything to do with money, store accounts or domains is for his will and his executor, not for this.

Thank you.` },
  'all-clear': { subject: 'All clear: {owner} has checked in', body: `{name},

{owner}'s site has heard from him again. Everything is back to normal, any codes you were sent no longer work, and nothing further is needed.

Sorry for the worry, and thank you for answering.` },
};
export function letter(kind, vars) {
  const t = LETTERS[kind]; if (!t) throw new Error(`no letter called ${kind}`);
  const fill = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
  return { subject: fill(t.subject), text: fill(t.body) };
}
