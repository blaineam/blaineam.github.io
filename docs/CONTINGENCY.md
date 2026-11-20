# Contingency plan

What happens to this site and the open-source projects if Blaine stops being able to look
after them. It runs by itself, it is slow on purpose, and nothing public happens unless
people he trusts agree.

## Principles

- **Nothing public without people.** A machine can notice silence. Only people can say what it means.
- **Slow.** Weeks, then months. A broken phone or a long trip must never look like the end.
- **The owner hears first.** Before anyone else is told anything.
- **Nothing private in public.** This repository and its logs are public, so names, addresses,
  dates and stages are never written to a file in the clear or printed to a log.
- **No servers.** A phone Shortcut, GitHub Actions, and one mailbox.

## Decisions

| Question | Decision |
|---|---|
| Who confirms | Four trusted people. **At least three must agree.** |
| Heartbeat | An Apple Shortcut on the phone, triggered by something only Blaine does |
| Timing | Day 14, 21, 27: Blaine is nudged. Day 30: the trusted people are told (nothing public). Day 90: they are asked to confirm |
| How they confirm | By replying to the e-mail they were sent, with their own code in it |
| Changing their minds | Any one of them can make everyone wait two weeks |
| Luma | A switch Blaine sets himself (`luma.passed`). Nothing automatic |
| Choosing who carries on | The trail at `/trail/` gathers people; the trusted people choose from them. **One person or several; several have an equal say and an equal share** |
| What a successor receives | Maintainer rights on the open-source repositories and a public blessing. Store accounts, domains and money are for a will and an executor, not this plan |
| What the site says | A note Blaine wrote ahead of time |

## What happens, day by day

Counting days since the last heartbeat:

| Day | What happens | Who can see it |
|---|---|---|
| 0–13 | Nothing | Nobody |
| 14, 21, 27 | Blaine gets an e-mail: "Are you there?" It is almost always the Shortcut | Blaine |
| 30 | Each trusted person is told the site has gone quiet, and asked only to check on him. Each gets a personal WAIT line | The trusted people |
| 90 | Each is asked whether the site should show his note. Each gets a personal CONFIRM line and a WAIT line. Reminders weekly | The trusted people |
| when 3 have confirmed | The site shows the note and points to the trail. All of them are told what he asked of them next | Everyone |
| any day | A heartbeat puts everything back to normal, cancels every code, and tells whoever was told | — |

Silence from a trusted person always means "not yet". There is no deadline.

## How each part works

**Heartbeat.** The Shortcut writes today's date to the private repository variable
`LAST_HEARTBEAT`. It uses a token that can only write variables on this repository.

**The daily run** ([`scripts/contingency/notify.mjs`](../scripts/contingency/notify.mjs), started by
[`.github/workflows/contingency-watch.yml`](../.github/workflows/contingency-watch.yml)) reads the
heartbeat and the mailbox, decides what is due, sends it, and remembers where things stand.

- The decisions are in [`plan.mjs`](../scripts/contingency/plan.mjs): no network, no clock, so every
  path is tested against a pretend calendar.
- Sending and reading mail is in [`mail.mjs`](../scripts/contingency/mail.mjs): plain SMTP and IMAP,
  no dependencies.
- What it remembers is in `contingency/state.enc`, sealed with a secret, padded to a fixed size and
  rewritten every day whether or not anything changed, so neither its contents nor its history
  say anything. That daily commit also keeps GitHub from switching the schedule off for
  inactivity.

**Codes.** Each trusted person gets their own CONFIRM code and WAIT code for each silence, derived
from a secret only the workflow holds. A reply counts only if it comes from that person's address
**and** contains that person's code, so it proves they received their own message. Codes from an
earlier silence stop working the moment a heartbeat arrives.

**The switch.** When three confirmations are in (and nobody has asked to wait), the run sets
`contingency.state` to `"contingency"` in `content/site.json`, commits it and starts the Pages
deploy. The build then renders Blaine's note, which is kept as a secret, not in the repository.

**After that**, the trusted people are told how to open what people wrote on the trail: each
holds one part of a key, any three parts open it, and the reading desk at `/trail/desk/` puts
them together.

## What this plan cannot do

- **It decays if left alone for years.** The mailbox must keep existing and its password must keep
  working; the domain must stay registered; GitHub must keep running the schedule. None of that is
  automatic once nobody is paying for it.
- **The Shortcut's token expires.** If it lapses while Blaine is alive, the heartbeat stops silently.
  That is what the day 14, 21 and 27 nudges are for.
- **E-mail can be read by whoever controls a mailbox.** A confirmation proves control of that
  person's mailbox, nothing more. That is why three are needed and why the letter asks them to
  speak to the family first.
- **It cannot verify a death.** It asks people who can.
- **Only people with an e-mail address can be asked.** Someone listed without one is never written to
  and cannot confirm.

## Set-up (once, by Blaine)

1. **Heartbeat.** The variable and the Shortcut. *Done on 2026-11-19.*
2. **A mailbox for the plan.** Any account that allows SMTP and IMAP with an app password. A
   dedicated address is best, so replies are not lost among other mail.
3. **Four secrets** on this repository (Settings → Secrets and variables → Actions):

   | Secret | What it holds |
   |---|---|
   | `CONTINGENCY_KEY` | A long random string. `openssl rand -hex 32` |
   | `CONTINGENCY_PEOPLE` | `{"owner":{"name":"…","email":"…"},"people":[{"id":"a","name":"…","email":"…"}, …]}` |
   | `CONTINGENCY_MAIL` | `{"from":"Name <address>","smtp":{"host":"…","port":465,"user":"…","pass":"…"},"imap":{"host":"…","port":993,"user":"…","pass":"…"}}` |
   | `CONTINGENCY_NOTE` | The note the site shows, as plain text with blank lines between paragraphs. `**bold**` and `[words](/page/)` links work |

   The inbox is read, and so is the mailbox's Trash folder (opened read-only): a rule that
   forwards mail on and deletes the copy leaves replies there, and they still count. Add
   `"trash": false` inside `"imap"` to read the inbox only.

   Until `CONTINGENCY_KEY` is set the daily run does nothing at all.
4. **Rehearse.** Actions → Contingency watcher → Run workflow → type `yes` for the drill. Every
   letter is sent to Blaine only, marked as a rehearsal.
5. **Tell the four people** that they have been named, what the first message will look like, and
   that nothing is ever asked of them by any other route.
6. **Hand out the key parts** from `/trail/desk/`, one to each.

Try the logic without touching anything:

```sh
node scripts/contingency/notify.mjs --explain --last 2026-08-01 --today 2026-11-20
node scripts/contingency/test.mjs
```

## Luma

`content/site.json` → `luma.passed`. When the day comes, set it to that date: her view becomes a
memorial and the birthday countdown stops. Preview with
`node scripts/build-site.mjs --luma-passed 2035-01-01`. She goes to family; that is not part of this plan.

## Previewing the public state

`node scripts/build-site.mjs --state contingency` writes `out/preview.html` using the note in
`content/private/contingency-note.md`. Nothing is published.
