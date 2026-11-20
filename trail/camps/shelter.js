/* Camp 3, the Shelter: fellowship. People come to the door with things that cannot be solved,
 * only answered. Four replies, a scene to read between the lines of, one piece of news told
 * three ways, a bench to seat (the one thing here that can be checked), a decision and a fire.
 *
 * Almost nothing in this camp is scored. What the hiker wrote, marked and arranged is kept
 * as it was, to be read later by people. */
import { h } from '../engine.js?v=047d6282';
import { t } from '../words.js?v=047d6282';
import { decisionStage, fireStage, useCss } from './common.js?v=047d6282';

useCss(new URL('./shelter.css?v=047d6282', import.meta.url));

const pick = (r, a) => a[Math.floor(r() * a.length)];
const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const keep = (list, x, max = 60) => { list.push(x); if (list.length > max) list.splice(0, list.length - max); };
/* Bring a part of the stage back onto the screen when a redraw has left it out of sight. */
const bring = (top, bottom, ctx) => { if (top.getBoundingClientRect().top < 70 || bottom.getBoundingClientRect().bottom > innerHeight) top.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'start' }); };

/* ---------- 1: at the door ---------- */
const GUESTS = [
  { id: 'user', name: t('Wren'), who: t('Wren, who uses the notes app you look after'), tint: '#6cb6ff',
    says: [t('Three years of field notes. Gone, after your update on Tuesday.'), t('I chose this app because it said my notes were safe with it. I do not want a sorry. I want to know what happened, and whether I will ever see them again.')],
    know: t('The bug was real, and it was in a change you wrote. Unless Wren kept a backup, the notes cannot be brought back.'), ask: t('What do you say to Wren?') },
  { id: 'first', name: t('Pim'), who: t('Pim, who has never given code to a project before'), tint: '#6fe0c0',
    says: [t('Hello! This is my first time doing anything like this.'), t('It took four weekends. I rewrote the whole of sync so that it goes through a server: 2,400 lines. Can it go in this week? I have already told my friends it will.')],
    know: t('The work is careful. But the project decided long ago that notes stay on people\'s own devices, with no server in the middle. The patch cannot go in.'), ask: t('What do you say to Pim?') },
  { id: 'senior', name: t('Hale'), who: t('Hale, who started the project and looks after it with you'), tint: '#c9a3e8',
    says: [t('Twenty years I have been doing this.'), t('The backup file does not need a lock on it. Nobody is ever going to open it. I am merging tonight, so that we make the release.')],
    know: t('Hale taught you a good deal of what you know. The backup file holds every user\'s private notes, readable by anyone who finds it.'), ask: t('What do you say to Hale?') },
  { id: 'friend', name: t('Noor'), who: t('Nobody is at the door this time. There is a message from Noor, a friend, three weeks old'), tint: '',
    says: [t('Sorry. Not up to the hike this week. Go without me.')],
    know: t('Noor\'s father died last month. Since that message there has been nothing. There is no problem here to fix. You are about to write to them.'), ask: t('What do you write to Noor?') },
];
const WEATHER = { rain: t('Rain is drumming on the roof.'), snow: t('Snow is coming down, slow and thick.'), wind: t('The wind is leaning on the door.'), fog: t('Fog has swallowed the path.') };

function doorSvg(g, open, weather, kettle) {
  const bits = [];
  for (let i = 0; i < 14; i++) {
    const x = 30 + (i * 37) % 72, y = 24 + (i * 53) % 104, d = `animation-delay:-${(i * 0.37 % 2).toFixed(2)}s`;
    bits.push(weather === 'rain' ? `<path d="M${x} ${y}l-3 10" style="${d}"/>` : weather === 'snow' ? `<circle cx="${x}" cy="${y}" r="1.6" style="${d}"/>` : weather === 'wind' ? `<path d="M${x - 14} ${y}h${12 + i % 3 * 6}" style="${d}"/>` : `<ellipse cx="${x}" cy="${y}" rx="${16 + i % 4 * 5}" ry="5" style="${d}"/>`);
  }
  const figure = g.tint ? `<g class="shelter-figure" fill="${g.tint}"><circle cx="66" cy="70" r="11"/><path d="M44 140c0-34 8-52 22-52s22 18 22 52z"/></g>` : '<path d="M56 132h22l-3 8H59z" fill="#eef2f8" opacity=".85"/><path d="M58 133l9 4 9-4" fill="none" stroke="#070b14" stroke-width="1"/>';
  return `<svg viewBox="0 0 320 150" role="img" aria-label="${[t('Inside the shelter.'), open ? (g.tint ? t('{name} is standing in the open doorway.', { name: g.name }) : t('The door is open on an empty step, and a folded message lies on it.')) : t('The door is shut.'), WEATHER[weather], kettle ? t('The kettle is steaming on the stove.') : t('A kettle sits on the stove.')].join(' ').replace(/"/g, '&quot;')}">
    <rect class="shelter-wall" width="320" height="150"/><path class="shelter-plank" d="M0 38h320M0 76h320M0 114h320"/>
    <rect class="shelter-floor" y="140" width="320" height="10"/>
    <clipPath id="shelter-clip"><rect x="26" y="20" width="80" height="120"/></clipPath>
    <rect x="26" y="20" width="80" height="120" fill="#0b1830"/>
    <g clip-path="url(#shelter-clip)"><g class="shelter-sky is-${weather}">${bits.join('')}</g>${open ? figure : ''}</g>
    ${open ? '<path class="shelter-leaf" d="M106 20l22 8v120l-22-8z"/>' : '<rect class="shelter-leaf" x="26" y="20" width="80" height="120"/><path class="shelter-plank" d="M46 20v120M66 20v120M86 20v120"/><circle cx="96" cy="84" r="3" fill="#0b1830"/>'}
    <rect x="24" y="18" width="84" height="124" fill="none" class="shelter-frame"/>
    <circle class="shelter-glow" cx="246" cy="104" r="62"/>
    <rect x="214" y="96" width="64" height="44" rx="5" class="shelter-stove"/><rect x="228" y="110" width="36" height="16" rx="3" fill="#ff7a50" opacity=".85"/>
    <path class="shelter-kettle" d="M232 96v-12c0-7 6-11 14-11s14 4 14 11v12zM260 82l10-6M240 73c0-8 12-8 12 0"/>
    <g class="shelter-steam${kettle ? ' is-on' : ''}"><path d="M272 72c-4-6 4-8 0-14"/><path d="M279 70c-4-6 4-8 0-14" style="animation-delay:-.8s"/><path d="M265 66c-4-6 4-8 0-14" style="animation-delay:-1.5s"/></g>
  </svg>`;
}

function door(el, ctx) {
  const p = ctx.data; p.replies = p.replies || {}; p.drafts = p.drafts || {}; p.spent = p.spent || {}; p.revisits = p.revisits || 0;
  if (!p.order) { p.order = shuffle(ctx.rng('order'), GUESTS.map((g) => g.id)); const w = ctx.rng('weather'); p.weather = p.order.map(() => pick(w, Object.keys(WEATHER))); }
  const guest = (i) => GUESTS.find((g) => g.id === p.order[i]), firstOpen = () => p.order.findIndex((id) => !p.replies[id]);
  let at = Math.max(0, firstOpen()), open = false, kettle = false, since = 0;
  const list = h('ol', { class: 'shelter-guests', 'aria-label': t('Who has come to the door tonight') }), scene = h('div', { class: 'shelter-scene' }), view = h('div', { class: 'shelter-view' });
  const clockOff = () => { if (open && since) { const id = p.order[at]; p.spent[id] = (p.spent[id] || 0) + Date.now() - since; since = 0; } };
  ctx.onLeave(clockOff);
  function draw(focus) {
    const g = guest(at);
    list.textContent = '';
    p.order.forEach((id, i) => {
      const who = guest(i), done = !!p.replies[id], now = i === at;
      list.append(h('li', null, done || now || i === firstOpen()
        ? h('button', { type: 'button', class: 'shelter-guest' + (now ? ' is-now' : '') + (done ? ' is-done' : ''), 'aria-current': now ? 'true' : null, text: done ? t('{name}: answered', { name: who.name }) : t('Knock {n}', { n: i + 1 }), onclick: () => { if (i !== at) { clockOff(); at = i; open = done; since = Date.now(); if (done) p.revisits++; ctx.say(''); draw(done ? 'text' : 'door'); } } })
        : h('span', { class: 'shelter-guest', text: t('Knock {n}', { n: i + 1 }) })));
    });
    scene.innerHTML = doorSvg(g, open, p.weather[at], kettle);
    view.textContent = '';
    const kettleBtn = h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: kettle ? t('Take the kettle off') : t('Put the kettle on'), onclick: () => { kettle = !kettle; p.kettle = (p.kettle || 0) + 1; draw('kettle'); } });
    if (!open) {
      const openBtn = h('button', { class: 'wm-btn', type: 'button', text: t('Open the door'), onclick: () => { open = true; since = Date.now(); ctx.say(''); draw('text'); } });
      view.append(h('p', { class: 'shelter-knock', text: WEATHER[p.weather[at]] + ' ' + (at ? t('Another knock.') : t('A knock.')) }), h('div', { class: 'row wrap' }, openBtn, kettleBtn));
      if (focus) (focus === 'kettle' ? kettleBtn : openBtn).focus({ preventScroll: true });
      return;
    }
    const text = h('textarea', { rows: 5, maxlength: 2000, placeholder: t('A few sentences, the way you would really say it.') }); text.value = p.drafts[g.id] != null ? p.drafts[g.id] : p.replies[g.id] || '';
    text.addEventListener('input', () => { p.drafts[g.id] = text.value; });
    view.append(
      h('article', { class: 'shelter-note' }, h('p', { class: 'shelter-who', text: g.who }), h('blockquote', null, g.says.map((s) => h('p', { text: s }))), h('p', { class: 'shelter-know', text: g.know })),
      h('label', { class: 'block' }, h('span', { text: g.ask }), text),
      h('div', { class: 'row wrap' }, h('button', { class: 'wm-btn', type: 'button', text: p.replies[g.id] ? t('Keep this answer') : g.tint ? t('Answer {name}', { name: g.name }) : t('Send it'), onclick: () => {
        const said = text.value.trim();
        if (said.length < 20) return ctx.say(t('Stay with them a little longer: a few sentences.'));
        clockOff(); p.replies[g.id] = said; delete p.drafts[g.id]; ctx.save();
        const next = firstOpen();
        if (next < 0) { ctx.say(t('The door is shut, the stove is warm, and everyone has been answered.'), true); return ctx.done(1800); }
        at = next; open = false; draw('door'); ctx.say(t('{name} has your answer.', { name: g.name })); bring(list, view, ctx);   // the card has just shrunk: keep the door on the screen
      } }), kettleBtn));
    if (focus === 'kettle') kettleBtn.focus({ preventScroll: true }); else if (focus) text.focus({ preventScroll: true });
  }
  el.append(
    h('p', { html: t('Tonight you keep the shelter. You also look after a small notes app that other people rely on, and its troubles have followed you up the mountain. <b>Four knocks</b> will come, one at a time.') }),
    h('p', { class: 'hintline', text: t('There is nothing to solve here, and nothing is marked. Only what you say to each of them is kept.') }),
    list, h('div', { class: 'shelter-door' }, scene, view));
  draw();
}

/* ---------- 2: what is not being said ---------- */
const SCENES = [
  { id: 'volunteer', place: t('Monday planning. Dana runs the team; Kofi has been on it for two years.'), people: [t('Dana'), t('Kofi')],
    lines: [[0, t('The export bug needs someone. It is a dull one.')], [1, t('I will take it.')], [0, t('You already have the migration and the docs.')], [1, t('It is fine. I had a quiet weekend, so I got ahead.')], [0, t('And somebody should answer the forum this week.')], [1, t('Me again. Honestly, I like being useful.')], [0, t('Did you see the note about next quarter\'s budget?')], [1, t('I saw it. Is the team staying the same size?')], [0, t('Nothing is decided.')], [1, t('Right. So, the forum. I can start tonight.')]],
    meant: [3, 5, 7, 9], reading: t('Kofi may be afraid for his place on the team. He worked through a weekend and calls it quiet, says he likes being "useful", asks the one question that matters to him, and when it is not answered, goes straight back to offering more.') },
  { id: 'feature', place: t('A support thread. Marta uses the app; Lee looks after it.'), people: [t('Marta'), t('Lee')],
    lines: [[0, t('Can you add a button that sends everything to a spreadsheet?')], [1, t('Maybe. What would you do with the spreadsheet?')], [0, t('Just keep it somewhere. On a stick, in a drawer.')], [1, t('The app already saves as you go, you know.')], [0, t('I know it says that.')], [0, t('My last phone died in March. The pictures of my mother\'s garden were on it.')], [1, t('I am sorry. So, a copy now and then?')], [0, t('Every night, if it could. Without me having to remember.')], [1, t('A spreadsheet would lose the pictures.')], [0, t('Then not a spreadsheet. I do not mind what it is.')]],
    meant: [2, 4, 5, 7, 9], reading: t('Marta asks for a spreadsheet, but may not want one at all. She has lost something she cannot get back, and no longer believes "it saves as you go". What she seems to need is a copy she can hold in her hand, made without her having to remember.') },
  { id: 'quiet', place: t('After the weekly call. Abel is new this month; Signe has been asked to show him round.'), people: [t('Signe'), t('Abel')],
    lines: [[0, t('How is the first task going?')], [1, t('Good. Nearly there.')], [0, t('You said nearly there on Tuesday too.')], [1, t('It is a bit bigger than it looked. I am reading a lot of the old code.')], [0, t('You can always ask in the channel.')], [1, t('Everyone in there seems very busy.')], [0, t('They are never too busy for a question.')], [1, t('I looked back through it. Nobody has asked one since March.')], [0, t('Huh. I had not noticed that.')], [1, t('It is fine. I will have it by Friday.')]],
    meant: [1, 5, 7, 9], reading: t('Abel may be stuck and unwilling to be the only person who asks. He has looked: nobody asks questions in the open here, so asking would mark him out. "Nearly there" and "by Friday" are what he says instead.') },
];

function unsaid(el, ctx) {
  const p = ctx.data; p.taps = p.taps || [];
  if (!p.scene) p.scene = pick(ctx.rng('scene'), SCENES).id;
  const S = SCENES.find((s) => s.id === p.scene) || SCENES[0], marked = new Set(p.marked || []);
  const text = h('textarea', { rows: 3, maxlength: 800, placeholder: t('One or two sentences.') }); text.value = p.said || '';
  text.addEventListener('input', () => { if (!p.shown) p.said = text.value; });
  const after = h('div', { class: 'shelter-reading', 'aria-live': 'polite' });
  const lines = S.lines.map(([who, line], i) => {
    const b = h('button', { type: 'button', class: 'shelter-say is-' + (who ? 'b' : 'a'), 'aria-pressed': String(marked.has(i)), onclick: () => {
      if (p.shown) return;
      if (marked.has(i)) marked.delete(i); else marked.add(i);
      b.setAttribute('aria-pressed', String(marked.has(i))); keep(p.taps, (marked.has(i) ? '+' : '-') + i, 80); p.marked = [...marked].sort((x, y) => x - y); ctx.say('');
    } }, h('small', { 'data-mark': t('marked'), text: S.people[who] }), ' ', h('span', { text: line }), ' ', h('i', { class: 'sr' }));
    return b;
  });
  const sayBtn = h('button', { class: 'wm-btn', type: 'button', text: t('That is what I see'), onclick: () => {
    const said = text.value.trim();
    if (!marked.size) return ctx.say(t('Press the line, or lines, that carry it for you.'));
    if (said.length < 20) return ctx.say(t('Say a little more about what you think is going on.'));
    Object.assign(p, { said, marked: [...marked].sort((x, y) => x - y), shown: true }); ctx.save(); ctx.say(''); reveal(true);
  } });
  function reveal(focus) {
    text.readOnly = true; sayBtn.hidden = true;
    lines.forEach((b, i) => { b.setAttribute('aria-disabled', 'true'); if (S.meant.includes(i)) { b.classList.add('is-meant'); b.lastChild.textContent = t('(a line the writer had in mind)'); } });
    const on = h('button', { class: 'wm-btn', type: 'button', text: t('Walk on'), onclick: () => ctx.done() });
    after.append(h('h4', { text: t('One reading') }), h('p', { text: S.reading }), h('p', { class: 'note', text: t('That is what the writer of the scene had in mind, and the lines with a dotted edge are where they put it. It is one way to read it, not the answer. What you marked and wrote is kept exactly as it was.') }), on);
    if (focus) on.focus({ preventScroll: true });
  }
  el.append(
    h('p', { html: t('Two people are talking by the stove. The thing that matters most is <b>never said out loud</b>.') }),
    h('p', { class: 'hintline', text: S.place + ' ' + t('Press the lines that carry it, then say what you think is really going on.') }),
    h('div', { class: 'shelter-overhear' },
      h('div', { class: 'shelter-talk', role: 'group', 'aria-label': t('The conversation. Press a line to mark it.') }, lines),
      h('div', { class: 'shelter-think' }, h('label', { class: 'block' }, h('span', { text: t('What do you think is really going on?') }), text), h('div', { class: 'row' }, sayBtn), after)));
  if (p.shown) reveal(false);
}

/* ---------- 3: three tellings ---------- */
const NEWS = [
  { id: 'change', news: t('Next month\'s release changes how backups are stored. Backups made by older versions will not open until they have been converted.'),
    cards: { fact: t('From version 4, a backup made by an older version has to be converted before it will open.'), why: t('The old format could not be locked properly. The new one can.'), detail: t('The header moves from format 2 to format 3. Run "convert" once on each file; it leaves the original untouched.'), safe: t('Nothing you have saved is lost. Your notes stay exactly where they are.'), step: t('There is one thing to do: open Settings, choose Backups, tap Convert.'), sorry: t('This is extra work for you, and it should have been announced sooner. Sorry.'), when: t('It arrives on the first of next month. The old version keeps working until you update.'), help: t('If anything looks wrong, write back and someone will go through it with you.') } },
  { id: 'apology', news: t('Last week\'s update stopped reminders from arriving for two days. It has been fixed.'),
    cards: { fact: t('For two days last week, reminders did not arrive. That is fixed in version 3.2.1.'), why: t('A mistake with time zones crept in with the last update.'), detail: t('The scheduler compared local times with UTC. The fix, and a test that would have caught it, are in 3.2.1.'), safe: t('No notes were lost. Only the reminders due in those two days were missed.'), step: t('Update to 3.2.1, and reminders will arrive as normal.'), sorry: t('People missed things that mattered because of this. That is on the project, and sorry is owed.'), when: t('From now on, every update goes to a small group a week before it goes to everyone.'), help: t('If a reminder you needed went missing, write back and someone will help you find what it was.') } },
  { id: 'no', news: t('Many people have asked for online accounts, so that notes can be reached from anywhere. The project has decided not to build them.'),
    cards: { fact: t('Signing in with an online account will not be added to the app.'), why: t('The app keeps everything on your own device so that nobody else can hold your notes. An account would end that.'), detail: t('Two of your own devices can already share notes without an account, over the local network or with a file you carry across.'), safe: t('Nothing about how the app works today is changing.'), step: t('To use it on a second device: open Settings, choose Devices, tap Pair.'), sorry: t('It is a fair thing to ask for, and a no is disappointing to hear.'), when: t('This was decided with care, and it is not likely to change.'), help: t('If pairing gives you trouble, write back and someone will go through it with you.') } },
];
const EARS = [
  ['expert', t('Ines'), t('To <b>Ines</b>, who has worked on the project for years and knows the code better than you do.')],
  ['newcomer', t('Tomas'), t('To <b>Tomas</b>, who started using the app last month and worries he has done something wrong.')],
  ['upset', t('Ruth'), t('To <b>Ruth</b>, who is upset: this is the third time this year that something has changed under her.')],
];

function telling(el, ctx) {
  const p = ctx.data; p.log = p.log || []; p.letters = p.letters || {};
  if (!p.news) { p.news = pick(ctx.rng('news'), NEWS).id; p.pool = shuffle(ctx.rng('pool'), Object.keys(NEWS[0].cards)); }
  const N = NEWS.find((n) => n.id === p.news) || NEWS[0];
  for (const [id] of EARS) p.letters[id] = p.letters[id] || { cards: [], own: '' };
  const firstOpen = () => EARS.findIndex(([id]) => !p.letters[id].sealed);
  let at = Math.max(0, firstOpen());
  const tabs = h('div', { class: 'shelter-tabs', role: 'group', 'aria-label': t('Who the letter is for') }), view = h('div', { class: 'shelter-letter' });
  /* focus after a redraw: 'tab', 'to', 'pool:card', 'up:card', 'down:card' or 'out:index' */
  function draw(focus) {
    const [id, name, toWhom] = EARS[at], L = p.letters[id];
    tabs.textContent = '';
    EARS.forEach(([eid, nm], i) => tabs.append(h('button', { type: 'button', class: 'shelter-tab' + (p.letters[eid].sealed ? ' is-done' : ''), 'aria-pressed': String(i === at), text: p.letters[eid].sealed ? t('{name}: sealed', { name: nm }) : nm, onclick: () => { at = i; ctx.say(''); draw('tab'); } })));
    const act = (kind, card, fn, to) => () => { fn(); keep(p.log, id + kind + card, 150); ctx.say(''); draw(to); };
    const chosen = h('ol', { class: 'shelter-chosen', 'aria-label': t('Your letter to {name}, in order', { name }) }, L.cards.map((c, i) => h('li', { 'data-card': c }, h('span', { text: N.cards[c] }), h('span', { class: 'shelter-tools' },
      h('button', { type: 'button', 'data-do': 'up', 'aria-label': t('Move sentence {n} up', { n: i + 1 }), disabled: i === 0, text: '↑', onclick: act('^', c, () => { L.cards.splice(i - 1, 0, L.cards.splice(i, 1)[0]); }, 'up:' + c) }),
      h('button', { type: 'button', 'data-do': 'down', 'aria-label': t('Move sentence {n} down', { n: i + 1 }), disabled: i === L.cards.length - 1, text: '↓', onclick: act('v', c, () => { L.cards.splice(i + 1, 0, L.cards.splice(i, 1)[0]); }, 'down:' + c) }),
      h('button', { type: 'button', 'data-do': 'out', 'aria-label': t('Take sentence {n} out of the letter', { n: i + 1 }), text: '×', onclick: act('-', c, () => { L.cards.splice(i, 1); }, 'out:' + i) })))));
    const pool = h('div', { class: 'shelter-pool', role: 'group', 'aria-label': t('Sentences on the table. Press one to put it in the letter, and again to take it out.') }, p.pool.map((c) => {
      const n = L.cards.indexOf(c);
      return h('button', { type: 'button', class: 'shelter-card', 'data-card': c, 'aria-pressed': String(n >= 0), onclick: n >= 0 ? act('-', c, () => { L.cards.splice(n, 1); }, 'pool:' + c) : act('+', c, () => { L.cards.push(c); }, 'pool:' + c) },
        h('span', { text: N.cards[c] }), ' ', n >= 0 && h('small', { class: 'shelter-in', text: t('In the letter, number {n}', { n: n + 1 }) }));
    }));
    const own = h('textarea', { rows: 3, maxlength: 1200, placeholder: t('Anything you would add, change or say instead.') }); own.value = L.own || '';
    own.addEventListener('input', () => { L.own = own.value; });
    const to = h('h4', { class: 'shelter-to', tabindex: -1, html: toWhom });
    view.textContent = '';
    view.append(to,
      h('div', { class: 'shelter-table' }, h('p', { class: 'shelter-cap', text: t('Sentences on the table. Press one to put it in the letter; press it again to take it out.') }), pool),
      h('div', { class: 'shelter-page' },
        h('p', { class: 'shelter-cap', text: t('Your letter to {name}:', { name }) }),
        L.cards.length ? chosen : h('p', { class: 'shelter-empty', text: t('The page is blank. Pick sentences from the table, in the order you would say them.') }),
        h('label', { class: 'block' }, h('span', { text: t('In your own words (if you like)') }), own),
        h('div', { class: 'row' }, h('button', { class: 'wm-btn', type: 'button', text: L.sealed ? t('Seal it again') : t('Seal the letter to {name}', { name }), onclick: () => {
          L.own = own.value.trim();
          if (L.cards.length < 2 && L.own.length < 20) return ctx.say(t('There is not much in this letter yet: two sentences, or a few words of your own.'));
          L.sealed = true; ctx.save();
          const next = firstOpen();
          if (next < 0) { ctx.say(t('Three letters, one piece of news. They are in the post.'), true); return ctx.done(1800); }
          at = next; draw('to'); ctx.say(t('Sealed. Now the same news for {name}.', { name: EARS[at][1] }));
          view.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'start' });   // so that who it is for is on the screen
        } }))));
    let goal = null;
    if (focus === 'tab') goal = tabs.children[at];
    else if (focus === 'to') goal = to;
    else if (focus) {
      const [zone, key] = focus.split(':');
      if (zone === 'pool') goal = pool.querySelector(`[data-card="${key}"]`);
      else if (zone === 'out') { const li = chosen.children[Math.min(+key, chosen.children.length - 1)]; goal = li ? li.querySelector('[data-do="out"]') : pool.querySelector('button'); }
      else { const li = chosen.querySelector(`[data-card="${key}"]`); goal = li && (li.querySelector(`[data-do="${zone}"]:not([disabled])`) || li.querySelector('[data-do]:not([disabled])')); }
    }
    if (goal) goal.focus({ preventScroll: true });
  }
  el.append(
    h('p', { text: t('One piece of news has to go out tonight, to three people who will each hear it differently.') }),
    h('blockquote', { class: 'shelter-news', text: N.news }),
    h('p', { class: 'hintline', text: t('Build each letter from the sentences on the table, in the order you would say them, and add your own words wherever you want. None of this is marked.') }),
    tabs, view);
  draw();
}

/* ---------- 4: the bench ----------
 * Five people, five seats, a handful of wishes about people. The wishes are written from a
 * seating that works, then every one of the 120 seatings is tried to make sure that at most
 * two fit. A seating is right when every wish holds for it. */
/* The names in FOLK are what the puzzle is built from and what is kept with the run; SHOWN is how each is written on the page. */
const FOLK = ['Maren', 'Otis', 'Priya', 'Jun', 'Sol', 'Bea', 'Tam', 'Ivo'];
const SHOWN = { Maren: t('Maren'), Otis: t('Otis'), Priya: t('Priya'), Jun: t('Jun'), Sol: t('Sol'), Bea: t('Bea'), Tam: t('Tam'), Ivo: t('Ivo') };
const wishText = (w) => { const v = { a: SHOWN[w.a], b: SHOWN[w.b] }; return {
  apart: t('{a} and {b} argued about the route all day. Not side by side tonight.', v),
  near: t('{a} is too shy to ask, but would like to sit next to {b}.', v),
  door: t('{a} leaves before dawn and needs the seat by the door, so as not to wake anyone.', v),
  stove: t('{a} came in soaked through: the stove seat, or the one beside it.', v),
  mid: t('{a} is new to the group and should not be left out on an end.', v),
}[w.t]; };
export function wishOk(w, seats) {
  const i = seats.indexOf(w.a), j = seats.indexOf(w.b);
  return w.t === 'apart' ? Math.abs(i - j) > 1 : w.t === 'near' ? Math.abs(i - j) === 1 : w.t === 'door' ? i === 0 : w.t === 'stove' ? i >= 3 : i >= 1 && i <= 3;
}
const perms = (a) => (a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
export function makeBench(R) {
  for (let a = 0; a < 300; a++) {
    const r = R('bench' + a), folk = shuffle(r, FOLK).slice(0, 5), sol = shuffle(r, folk), all = perms(folk), can = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) { const flip = r() < 0.5; can.push({ t: j - i === 1 ? 'near' : 'apart', a: sol[flip ? j : i], b: sol[flip ? i : j] }); }
    can.push({ t: 'door', a: sol[0] }, { t: 'stove', a: sol[3] }, { t: 'stove', a: sol[4] }, { t: 'mid', a: sol[1] }, { t: 'mid', a: sol[2] }, { t: 'mid', a: sol[3] });
    const wishes = [], cap = { apart: 2, near: 2, door: 1, stove: 1, mid: 1 }, named = {}; let left = all;
    for (const w of shuffle(r, can)) {
      if (wishes.length >= 5 || left.length === 1) break;
      const who = [w.a, w.b].filter(Boolean);
      if (!cap[w.t] || who.some((n) => (named[n] || 0) >= 2)) continue;
      const fewer = left.filter((s) => wishOk(w, s));
      if (fewer.length < left.length) { wishes.push(w); left = fewer; cap[w.t]--; who.forEach((n) => { named[n] = (named[n] || 0) + 1; }); }
    }
    if (left.length < 1 || left.length > 2 || wishes.length < 4 || !wishes.some((w) => w.t === 'near') || !wishes.some((w) => w.t === 'apart')) continue;
    return { folk, wishes, fits: left };
  }
  throw new Error('no bench could be set');
}

function bench(el, ctx) {
  const B = makeBench(ctx.rng), p = ctx.data; p.tries = p.tries || []; p.moves = p.moves || 0;
  let seats = Array(5).fill(null), hand = null, drag = null, quiet = false;
  const wishes = h('ul', { class: 'shelter-wishes', 'aria-label': t('What each of them needs') }, B.wishes.map((w) => h('li', null, h('span', { text: wishText(w) }), h('b'))));
  const mark = (bad) => wishes.querySelectorAll('li').forEach((li, i) => { li.className = bad ? (bad[i] ? 'is-off' : 'is-ok') : ''; li.lastChild.textContent = bad ? ' ' + (bad[i] ? t('Not met.') : t('Met.')) : ''; });
  const row = h('div', { class: 'shelter-bench', role: 'group', 'aria-label': t('The bench: seat 1 is by the door, seat 5 by the stove') }), porch = h('div', { class: 'shelter-porch', role: 'group', 'aria-label': t('Still standing') });
  const place = (name, i) => {
    const from = seats.indexOf(name), other = seats[i];
    if (from === i) return;
    if (from >= 0) seats[from] = other; seats[i] = name; hand = null; p.moves++;
    mark(null);
    ctx.say([t('{name} takes seat {n}.', { name: SHOWN[name], n: i + 1 }), other ? (from >= 0 ? t('{name} moves to seat {n}.', { name: SHOWN[other], n: from + 1 }) : t('{name} stands up again.', { name: SHOWN[other] })) : ''].filter(Boolean).join(' '));
  };
  const grab = (name, node) => (e) => { drag = { name, node, x: e.clientX, y: e.clientY, moved: false }; };
  function draw(focus) {
    row.textContent = ''; porch.textContent = '';
    seats.forEach((name, i) => {
      const b = h('button', { type: 'button', class: 'shelter-seat' + (name ? ' is-taken' : '') + (name && name === hand ? ' is-hand' : ''), 'data-seat': i,
        onclick: () => { if (quiet) return; if (hand && hand !== name) place(hand, i); else if (name) { hand = hand === name ? null : name; ctx.say(hand ? t('{name} is on their feet. Pick a seat.', { name: SHOWN[name] }) : ''); } else return ctx.say(t('Pick someone first, then a seat.')); draw(i); } },
      h('small', { text: i === 0 ? t('door') : i === 4 ? t('stove') : String(i + 1) }), ' ', h('b', { text: name ? SHOWN[name] : '·' }), ' ',
      h('i', { class: 'sr', text: [i === 0 ? t('Seat 1, by the door.') : i === 4 ? t('Seat 5, by the stove.') : t('Seat {n}.', { n: i + 1 }), name ? '' : t('It is empty.'), hand && hand !== name ? t('Press to seat {name} here.', { name: SHOWN[hand] }) : name ? t('Press to pick them up.') : ''].filter(Boolean).join(' ') }));
      if (name) b.addEventListener('pointerdown', grab(name, b));
      row.append(b);
    });
    B.folk.filter((n) => !seats.includes(n)).forEach((name) => {
      const b = h('button', { type: 'button', class: 'shelter-person' + (name === hand ? ' is-hand' : ''), 'aria-pressed': String(name === hand), 'data-name': name, text: SHOWN[name], onclick: () => { if (quiet) return; hand = hand === name ? null : name; ctx.say(hand ? t('{name} is looking for a seat.', { name: SHOWN[name] }) : ''); draw(name); } });
      b.addEventListener('pointerdown', grab(name, b)); porch.append(b);
    });
    if (!porch.childNodes.length) porch.append(h('span', { class: 'note', text: t('Everyone has a seat.') }));
    if (focus != null) { const goal = typeof focus === 'number' ? row.children[focus] : porch.querySelector(`[data-name="${focus}"]`) || row.querySelector('.shelter-seat:not(.is-taken)'); if (goal) goal.focus({ preventScroll: true }); }
  }
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 10) return;
    drag.moved = true; drag.node.classList.add('is-dragging'); drag.node.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onUp = (e) => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) return;
    d.node.style.transform = ''; d.node.classList.remove('is-dragging'); quiet = true; setTimeout(() => { quiet = false; }, 0);
    d.node.style.pointerEvents = 'none'; const under = document.elementFromPoint(e.clientX, e.clientY), seat = under && under.closest && under.closest('.shelter-seat'); d.node.style.pointerEvents = '';
    if (seat && e.type === 'pointerup') { place(d.name, +seat.dataset.seat); draw(+seat.dataset.seat); }
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  ctx.onLeave(() => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); });
  const tight = B.wishes.find((w) => w.t === 'door') || B.wishes.find((w) => w.t === 'stove') || B.wishes[0];
  ctx.setHints([
    t('Start with whoever has the fewest places they could go. The easy-going ones can fill in around them.'),
    t('{name} has the least room to choose. Seat {name} first, then keep the two who argued apart.', { name: SHOWN[tight.a] }),
    t('One way to begin: {first} in seat 1 and {last} in seat 5.', { first: SHOWN[B.fits[0][0]], last: SHOWN[B.fits[0][4]] }),
  ]);
  el.append(
    h('p', { html: t('Supper. Five wet hikers and one long bench: <b>seat 1 is by the door, seat 5 is by the stove</b>. Nobody will say what they need out loud, but you have been watching.') }),
    h('div', { class: 'shelter-supper' }, wishes, h('div', { class: 'shelter-room' },
    h('p', { class: 'hintline', text: t('Press a person, then a seat. Or drag them. Press someone who is sitting to move them.') }),
    row, porch,
    h('div', { class: 'row wrap' }, h('button', { class: 'wm-btn', type: 'button', text: t('Everyone sits'), onclick: () => {
      if (seats.includes(null)) return ctx.say(t('Somebody is still standing.'));
      const bad = B.wishes.map((w) => !wishOk(w, seats)), n = bad.filter(Boolean).length;
      mark(bad);
      keep(p.tries, { seats: seats.slice(), unhappy: n }); ctx.save();
      if (!n) { p.seats = seats.slice(); ctx.say(t('Everyone is where they needed to be, and nobody had to ask.'), true); return ctx.done(2200); }
      ctx.say(n === 1 ? t('Supper is served, but one wish is not met. It is marked above.') : t('Supper is served, but {n} wishes are not met. They are marked above.', { n }));
    } }), h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Everybody up'), onclick: () => { seats = Array(5).fill(null); hand = null; p.clears = (p.clears || 0) + 1; mark(null); ctx.say(''); draw(); } })))));
  draw();
}

/* ---------- the decision, and the fire ---------- */
const TELL = [
  ['own', t('<b>Take all of it on yourself</b>, and leave Sam\'s name out.')],
  ['both', t('<b>Say plainly who did what</b>: your part, and Sam\'s.')],
  ['we', t('<b>Say "we" all the way through</b>, and name nobody.')],
  ['sam', t('<b>Go to Sam first</b>, and let Sam tell their own part.')],
];
/* What is typed at a decision or a fire is kept as it is typed, so a reload puts it back. */
function drafts(el, ctx) {
  el.addEventListener('input', (e) => {
    const box = e.target, d = ctx.data;
    if (box.matches('textarea')) d.said = box.value; else if (box.type === 'radio') d[box.name === 'ai' ? 'ai' : 'option'] = box.value; else d.aiHow = box.value;
  });
}
function credit(el, ctx) {
  const options = shuffle(ctx.rng('order'), TELL); ctx.data.shown = options.map((o) => o[0]);
  drafts(el, ctx);
  decisionStage({
    lead: [t('Friday\'s release went out broken, and people lost an afternoon\'s work. Two things caused it. <b>Sam</b> wrote the change that had the fault in it. <b>You</b> approved it, and skipped the last check because it was late.'), t('It is Monday. The whole group is on the call, and it falls to you to tell them what happened. Sam is on the call too, and has not said a word.')],
    options, ask: t('What do you say to the group?'), name: 'shelter-call',
  })(el, ctx);
}

export default {
  id: 'shelter', name: t('The Shelter'), sub: t('Fellowship'),
  intro: t('A night keeping the shelter: four knocks at the door, a talk to overhear, three letters, a bench to seat, a decision and a fire.'),
  stages: [
    { id: 'door', label: t('At the door'), title: t('1. Four knocks at the door'), mount: door, hints: [t('Read it twice before you write. Who is this, tonight, and what did they come for?'), t('There is no trick in any of them. Write what you would want to have said when you think back on it.')] },
    { id: 'unsaid', label: t('Not said'), title: t('2. What is not being said'), mount: unsaid, hints: [t('Listen for the place where somebody changes the subject, or answers a question that was not asked.'), t('Read only one person\'s lines, top to bottom, as if the other were not there.')] },
    { id: 'telling', label: t('Three tellings'), title: t('3. One piece of news, three tellings'), mount: telling, hints: [t('Picture each of them opening it. What do they look for first?'), t('What you leave out of a letter is a choice too.')] },
    { id: 'bench', label: t('The bench'), title: t('4. Seat the bench'), mount: bench, hints: [t('Start with whoever has the fewest places they could go.')] },
    { id: 'credit', label: t('A decision'), title: t('A decision in the morning'), mount: credit, hints: [t('Nobody is marking this one. Say what you would really say on that call.')] },
    { id: 'fire', label: t('The campfire'), title: t('The campfire'), cls: 'fire', hints: [t('It does not have to be about work. It can be something small that stayed with you.')],
      mount: (el, ctx) => { drafts(el, ctx); fireStage({ lead: t('The others are asleep inside, and the fire outside is burning low. {guide} has the warm spot beside it. Someone asks:'), question: t('Tell us about a time you changed your mind because of how someone told you something, not what they told you.') })(el, ctx); } },
  ].map((s) => ({ ...s, mount: (el, ctx) => { el.classList.add('shelter-body'); s.mount(el, ctx); } })),
  tally: (p) => [
    [t('Answered at the door'), p.door && p.door.replies ? Object.keys(p.door.replies).length : 0],
    [t('Lines marked'), p.unsaid && p.unsaid.marked ? p.unsaid.marked.length : 0],
    [t('Letters sealed'), p.telling && p.telling.letters ? Object.values(p.telling.letters).filter((l) => l.sealed).length : 0],
    [t('Bench'), p.bench && p.bench.tries ? (p.bench.tries.length === 1 ? t('1 seating') : t('{n} seatings', { n: p.bench.tries.length })) : t('seated')],
  ],
};
