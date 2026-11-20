/* Camp 5, the Summit: everything together, and the decision. One bad week to plan, a notice to
 * write, a vote to lose gracefully, a last fire, and then the register: sign it or do not. */
import { h } from '../engine.js?v=7f938f7b';
import { decisionStage, fireStage, useCss, keep } from './common.js?v=7f938f7b';
import { t } from '../words.js?v=7f938f7b';

useCss(new URL('./summit.css?v=7f938f7b', import.meta.url).href);

/* ---------- 1: the week ----------
 * A real kind of week for someone looking after an app people rely on. There are more things
 * worth doing than there is time. What gets a slot, what goes first and what is left out is
 * the answer; none of it is marked. */
const TASKS = [
  ['tell', t('Tell everyone now'), t('Say what is wrong today, before there is a fix.'), 1],
  ['hotfix', t('Ship the fix today'), t('It is written, but nobody has tested it.'), 1],
  ['test', t('Test the fix properly'), t('On real devices, with real data. Takes three slots.'), 3],
  ['rollback', t('Roll back the release'), t('Stops new damage. People lose the new feature they asked for.'), 1],
  ['press', t('Answer the journalist'), t('They publish tomorrow, with or without you.'), 1],
  ['sponsor', t('Take the sponsor call'), t('Money for a year, in return for adding their analytics.'), 1],
  ['writeup', t('Write up what went wrong'), t('Publicly, in plain words, with your name on it.'), 1],
  ['help', t('Ask the other stewards'), t('Share the problem before deciding anything.'), 1],
  ['recover', t('Build a recovery tool'), t('So people who were hit can get their posts back. Takes two slots.'), 2],
  ['rest', t('Sleep on it'), t('One slot of doing nothing, on purpose.'), 1],
];
const SLOTS = 6, slots = (n) => (n > 1 ? t('{n} slots', { n }) : t('1 slot'));
function week(el, ctx) {
  const plan = ctx.data.plan = ctx.data.plan || []; ctx.data.changes = ctx.data.changes || 0;
  const r = ctx.rng('tasks'), tasks = TASKS.map((k) => [r(), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);     // a different pile for each hiker
  const used = () => plan.reduce((n, id) => n + TASKS.find((k) => k[0] === id)[3], 0);
  const board = h('ol', { class: 'summit-week', 'aria-label': t('This week, in order') }), pile = h('div', { class: 'summit-pile', role: 'group', 'aria-label': t('Things you could do') }), meter = h('b');
  el.append(
    h('p', { html: t('You look after an app that a few thousand people use to share photographs with their families. It runs on their own devices: there is no server to fix things from.') }),
    h('p', { html: t("On Monday you learn that last week's release can <b>quietly corrupt saved posts</b>. A fix is written. A journalist has asked for comment by tomorrow. A sponsor wants a call. You have <b>six slots</b> this week, and you are tired.") }),
    h('p', { text: t('Tap what you would do, in the order you would do it. Tap something in the week to take it back out. What you leave in the pile is part of your answer.') }),
    h('div', { class: 'summit-board' }, h('div', null, h('p', { class: 'meter' }, h('span', { text: t('Slots used') }), meter), board), pile),
    h('button', { class: 'wm-btn', type: 'button', text: t('That is my week'), onclick: () => {
      if (used() < SLOTS - 1) return ctx.say(SLOTS - used() === 1 ? t('There is 1 slot still empty. Fill the week, or put "Sleep on it" in.') : t('There are {n} slots still empty. Fill the week, or put "Sleep on it" in.', { n: SLOTS - used() }));
      ctx.data.left = TASKS.map((k) => k[0]).filter((id) => !plan.includes(id)); ctx.done();
    } }));
  // Every change redraws the cards, so remember which one was in hand and give it the focus back.
  function paint(focus) {
    board.textContent = ''; pile.textContent = '';
    plan.forEach((id, i) => {
      const [, task, , n] = TASKS.find((x) => x[0] === id);
      board.appendChild(h('li', { class: 'summit-slot', style: `--n:${n}` },
        h('button', { type: 'button', class: 'summit-card is-in', 'data-k': 'week:' + id, onclick: () => { plan.splice(i, 1); ctx.data.changes++; ctx.say(t('{task} is back in the pile.', { task })); paint('pile:' + id); } }, h('b', { text: task }), h('small', { text: slots(n) }), h('i', { class: 'sr', text: t('Take it out of the week') })),
        h('span', { class: 'summit-move' }, h('button', { type: 'button', 'data-k': 'up:' + id, 'aria-label': t('Move {task} earlier', { task }), disabled: i === 0, text: '↑', onclick: () => { plan.splice(i - 1, 0, plan.splice(i, 1)[0]); ctx.data.changes++; ctx.say(t('{task} is now number {n} in the week.', { task, n: i })); paint((i - 1 === 0 ? 'down:' : 'up:') + id); } }), h('button', { type: 'button', 'data-k': 'down:' + id, 'aria-label': t('Move {task} later', { task }), disabled: i === plan.length - 1, text: '↓', onclick: () => { plan.splice(i + 1, 0, plan.splice(i, 1)[0]); ctx.data.changes++; ctx.say(t('{task} is now number {n} in the week.', { task, n: i + 2 })); paint((i + 1 === plan.length - 1 ? 'up:' : 'down:') + id); } }))));
    });
    for (const [id, task, about, n] of tasks) {
      if (plan.includes(id)) continue;
      pile.appendChild(h('button', { type: 'button', class: 'summit-card', 'data-k': 'pile:' + id, onclick: () => {
        if (used() + n > SLOTS) return ctx.say(n === 1 ? t('"{task}" needs 1 slot, and you have {left} left. Something has to come out first.', { task, left: SLOTS - used() }) : t('"{task}" needs {n} slots, and you have {left} left. Something has to come out first.', { task, n, left: SLOTS - used() }));
        plan.push(id); ctx.say(t('{task} is in the week, number {n}.', { task, n: plan.length })); paint('week:' + id);
      } }, h('b', { text: task }), h('span', { text: about }), h('small', { text: slots(n) }), h('i', { class: 'sr', text: t('Put it in the week') })));
    }
    meter.textContent = t('{n} of {total}', { n: used(), total: SLOTS }); ctx.save();
    if (focus) { const to = el.querySelector(`[data-k="${focus}"]`); if (to) to.focus({ preventScroll: true }); }
  }
  paint();
}

/* ---------- 2: the notice ---------- */
function notice(el, ctx) {
  const text = h('textarea', { rows: 8, maxlength: 2500, placeholder: t('Write it the way you would actually post it.') }); text.value = ctx.data.said || ''; keep(text, ctx, 'said');
  const plan = (ctx.camp.week && ctx.camp.week.plan) || [];
  el.append(
    h('p', { text: plan.includes('tell') ? t("You chose to tell people this week. Write the notice that the app's users will read: people who are not technical, some of whom have lost photographs of their children.")
      : t("You did not put \"Tell everyone now\" in your week. Sooner or later it has to be said. Write the notice that the app's users will read: people who are not technical, some of whom have lost photographs of their children.") }),
    h('label', { class: 'block' }, h('span', { text: t('The notice') }), text),
    h('button', { class: 'wm-btn', type: 'button', text: t('Post it'), onclick: () => { const said = text.value.trim(); if (said.length < 120) return ctx.say(t('This one deserves a few more sentences.')); ctx.data.said = said; ctx.done(); } }));
}

/* ---------- 5: the register ----------
 * Three separate choices, each one opt-in, none ticked for you, all changeable later. The
 * sending itself (sealing the run so only the owner can read it) lives in ../send.js; if that
 * is not there yet, the choices are still kept with the run. */
function register(el, ctx) {
  const c = ctx.data.choices = ctx.data.choices || { pool: false, now: false, public: false };
  const box = (key, title, line) => h('label', { class: 'summit-choice' }, h('input', { type: 'checkbox', checked: !!c[key], onchange: (e) => { c[key] = e.target.checked; ctx.save(); } }), h('span', null, h('b', { text: title }), h('small', { text: line })));
  const sendArea = h('div', { class: 'summit-send' }); let own, note;
  el.append(
    h('p', { text: t('There is a tin box under the cairn with a notebook in it: the summit register. Signing it is up to you. So is everything else on this page.') }),
    h('p', { html: t('More than one person may be asked to look after this work one day, <b>each with an equal say</b>. Nothing here commits you to anything, and you can open the tin again whenever you like.') }),
    own = h('div', { class: 'summit-choices' },
      box('pool', t('Keep me in mind'), t('If the day comes, the people Blaine trusts may consider me.')),
      box('now', t('Consider me now'), t('While Blaine is here, I would like to be considered for helping with the open-source projects.')),
      box('public', t('Sign the register'), t('Show my trail name on the public register, with the camps I reached.'))),
    note = h('p', { class: 'note', text: t('Leaving all three empty is a complete ending. You still walked the trail.') }),
    sendArea,
    h('button', { class: 'wm-btn', type: 'button', text: t('Close the tin'), onclick: () => ctx.done() }));
  // send.js asks the same three questions itself (and seals the run), so when it is there it takes over.
  import('../send.js?v=7f938f7b').then((m) => { if (m.mountSend) { own.remove(); note.remove(); delete ctx.data.choices; m.mountSend(sendArea, { run: ctx.run, save: ctx.save, hiker: ctx.hiker }); } })
    .catch(() => { sendArea.append(h('p', { class: 'note', text: t('Sending a run is not open yet. Your choices are kept with your run on this device.') })); });
}

export default {
  id: 'summit', name: t('The Summit'), sub: '',
  intro: t('The top. One bad week to get through, and then a notebook in a tin.'),
  stages: [
    { id: 'week', label: t('The week'), title: t('1. A bad week'), mount: week, hints: [t('You cannot do all of it. I would start with whoever is hurting.'), t('What you leave out says as much as what you put in.')] },
    { id: 'notice', label: t('The notice'), title: t('2. Tell them'), mount: notice, hints: [t('Write it for one person, not for a crowd.')] },
    { id: 'vote', label: t('Outvoted'), title: t('3. Outvoted'), hints: [t('You will have to work with them next week too.')],
      mount: decisionStage({
        name: 'vote',
        lead: [t('Three of you look after the work now, with an equal say each. The other two want to change the licence so companies must pay to use it. It is not a matter of conscience for you; you simply think it is a mistake, and you have said so.'), t('The vote is two to one.')],
        options: [['accept', t('<b>Go with it</b> and help make it work.')], ['record', t('<b>Go with it</b>, and put your disagreement in writing.')], ['again', t('<b>Ask for the vote to be held again</b> after more people are heard.')], ['leave', t('<b>Step away</b> from the work.')]],
        ask: t('What do you say to the other two?'), button: t('That is my answer'),
      }) },
    { id: 'fire', label: t('The last fire'), title: t('The last fire'), cls: 'fire', hints: [t('There is no wrong reason. There is only the true one.')],
      mount: fireStage({ lead: t('It is cold at the top, and very clear. Someone asks:'), question: t('Why would you want to look after something that someone else started? And what would you change first?') }) },
    { id: 'register', label: t('The register'), title: t('The summit register'), mount: register, hints: [t('You do not have to sign anything. I never have.')] },
  ],
  afterPatch: (el, ctx) => { el.append(h('p', { class: 'row' }, h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Open the tin again'), onclick: () => ctx.reopen('register') }))); },
  tally: (p, run) => [[t('Week planned'), p.week && p.week.plan ? t('{n} things', { n: p.week.plan.length }) : '—'], [t('Changes of mind'), p.week ? p.week.changes || 0 : 0],
    [t('Register'), (run && run.send && run.send.public) || (p.register && p.register.choices && p.register.choices.public) ? t('signed') : t('left blank')]],
};
