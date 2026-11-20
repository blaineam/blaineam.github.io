/* Camp 4, the Overlook: creed. Nothing here has a key. The hiker says where they stand, in their
 * own words, and it is kept for the owner and, later, the people he trusts. Nothing from this
 * camp is ever shown publicly: not on the register, not on the map, not in what is sent in the
 * open. The only public fact is that the camp was reached. */
import { h } from '../engine.js';
import { decisionStage, fireStage, useCss, keep } from './common.js';
import { t, lang } from '../words.js';

useCss(new URL('./overlook.css', import.meta.url).href);

/* The statements. The first seven are what the site's owner holds; the last three are places
 * where people who share them still differ. None is marked right or wrong. */
const STONES = [
  ['scripture', t('Scripture is true, and it has the last word on what to believe and how to live.')],
  ['grace', t('A person is made right with God by grace alone, through trust in Christ, and not by anything they do.')],
  ['held', t('Nothing in this world can separate from Christ a person who belongs to Him.')],
  ['commands', t('Keeping God\'s commandments matters: as a way of honouring Him, not as a way of earning anything.')],
  ['creation', t('God upholds everything that exists, and what He has made leaves no one with an excuse for ignoring Him.')],
  ['known', t('God has always known the whole of each person\'s life, and that is a comfort, not a threat.')],
  ['glory', t('Whatever a person builds or does well, the credit belongs to God.')],
  ['open', t('Faith should be spoken about openly at work, even when that is awkward.')],
  ['steward', t('Someone who does not share these beliefs could still look after this work faithfully.')],
  ['doubt', t('Doubt is a normal part of believing, not the opposite of it.')],
];
const PLACES = [['hold', t('I hold this')], ['lean', t('I lean this way')], ['unsure', t('I am not sure')], ['away', t('I lean away')], ['not', t('I do not hold this')]];

function stones(el, ctx) {
  const placed = ctx.data.placed = ctx.data.placed || {}, why = ctx.data.why = ctx.data.why || {};
  ctx.data.order = ctx.data.order || [];
  // each hiker meets the stones in a different order
  const r = ctx.rng('order'), order = STONES.map((s, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map((x) => STONES[x[1]]);
  const cairn = h('div', { class: 'overlook-cairn', 'aria-hidden': 'true' }), count = h('b');
  const paintCairn = () => {
    cairn.textContent = ''; const n = Object.keys(placed).length;
    for (let i = 0; i < n; i++) cairn.appendChild(h('i', { style: `width:${96 - i * 7}px; margin-left:${(i % 2 ? 6 : -6)}px` }));
    count.textContent = t('{n} of {total}', { n, total: STONES.length });
  };
  el.append(
    h('p', { class: 'overlook-private', html: t('<b>This camp is private.</b> What you say here is never shown on the register, the map or anywhere public. It is read only by Blaine, and later by the people he trusts.') }),
    h('p', { text: t('There is a pile of stones at the overlook, and each has something written on it. Set each one down where you stand. Nobody is marking this, and "I am not sure" is a real answer.') }),
    h('div', { class: 'overlook-top' }, cairn, h('p', { class: 'meter' }, h('span', { text: t('Stones set down') }), count)),
    h('ol', { class: 'overlook-stones' }, order.map(([id, text], n) => {
      const note = h('textarea', { rows: 2, maxlength: 600, placeholder: t('If you want to say why (optional).'), 'aria-label': t('Why, in your own words (optional)') }); note.value = why[id] || '';
      note.addEventListener('input', () => { why[id] = note.value.trim(); if (!why[id]) delete why[id]; });
      const item = h('li', { class: 'overlook-stone' + (placed[id] ? ' is-set' : ''), 'data-stone': id },
        h('p', { class: 'overlook-stone__text', id: `stone-${id}`, text }),
        h('div', { class: 'overlook-line', role: 'radiogroup', 'aria-labelledby': `stone-${id}` }, PLACES.map(([v, label]) => h('label', null, h('input', { type: 'radio', name: `stone-${id}`, value: v, checked: placed[id] === v, onchange: () => { placed[id] = v; if (!ctx.data.order.includes(id)) ctx.data.order.push(id); item.classList.add('is-set'); paintCairn(); ctx.say(''); ctx.save(); } }), h('span', { text: label })))),
        note);
      return item;
    })),
    h('button', { class: 'wm-btn', type: 'button', text: t('Leave the cairn as it stands'), onclick: () => {
      const left = STONES.length - Object.keys(placed).length;
      if (left) {
        // take them to the first stone still in hand, rather than leaving them to hunt for it
        const first = [...el.querySelectorAll('.overlook-stone')].find((li) => !placed[li.dataset.stone]);
        if (first) { first.scrollIntoView({ behavior: ctx.reduced ? 'auto' : 'smooth', block: 'center' }); first.querySelector('input').focus({ preventScroll: true }); }
        return ctx.say(left === 1 ? t('1 stone is still in your hands. Here is the first.') : t('{n} stones are still in your hands. Here is the first.', { n: left }));
      }
      ctx.done();
    } }));
  paintCairn();
}

/* Passages, quoted from the Berean Standard Bible: a modern, fairly literal translation that
 * was dedicated to the public domain in 2023, so it can be quoted in full. Each entry is
 * [id, reference, reference as shown, gist as shown, text]. The plain reference is what is kept
 * with the run; the verse texts and the notice are English only and are never translated: in any
 * other language the hiker sees the reference and the gist, and reads the passage in their own
 * Bible. To use a different translation, replace the texts and the notice, and follow that
 * publisher's rules for quoting. */
const NOTICE = 'Scripture quotations are from the Berean Standard Bible, which is in the public domain.';
const PASSAGES = [
  ['rom1', 'Romans 1:20', t('Romans 1:20'), t('what has been made shows who made it'), 'For since the creation of the world God’s invisible qualities, His eternal power and divine nature, have been clearly seen, being understood from His workmanship, so that men are without excuse.'],
  ['eph2', 'Ephesians 2:8–9', t('Ephesians 2:8–9'), t('saved by grace, through faith, not by works'), 'For it is by grace you have been saved through faith, and this not from yourselves; it is the gift of God, not by works, so that no one can boast.'],
  ['rom8', 'Romans 8:38–39', t('Romans 8:38–39'), t('nothing can separate us from the love of God'), 'For I am convinced that neither death nor life, neither angels nor principalities, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God that is in Christ Jesus our Lord.'],
  ['mic6', 'Micah 6:8', t('Micah 6:8'), t('act justly, love mercy, walk humbly'), 'He has shown you, O man, what is good. And what does the LORD require of you but to act justly, to love mercy, and to walk humbly with your God?'],
  ['col3', 'Colossians 3:23–24', t('Colossians 3:23–24'), t('work at it with your whole being, as for the Lord'), 'Whatever you do, work at it with your whole being, as for the Lord and not for men, because you know that you will receive an inheritance from the Lord as your reward. It is the Lord Christ you are serving.'],
  ['own', 'Another passage', t('Another passage'), t('one that has shaped how you work'), ''],
];
function passage(el, ctx) {
  const text = h('textarea', { rows: 6, maxlength: 2500, placeholder: t('What does it ask of how you work and how you treat people?') }); text.value = ctx.data.said || ''; keep(text, ctx, 'said');
  const ref = h('input', { maxlength: 60, placeholder: t('Which passage?') }); ref.value = ctx.data.ref || '';
  const refWrap = h('label', { class: 'block', hidden: ctx.data.passage !== 'own' }, h('span', { text: t('Which passage?') }), ref);
  el.append(
    h('p', { text: t('Someone has left a worn Bible open on the bench. Pick a passage, read it, and say what it asks of you on an ordinary working day.') }),
    h('div', { class: 'overlook-passages', role: 'radiogroup', 'aria-label': t('Passages') }, PASSAGES.map(([id, , where, gist, verse]) => h('label', null,
      h('input', { type: 'radio', name: 'passage', value: id, checked: ctx.data.passage === id, onchange: () => { refWrap.hidden = id !== 'own'; ctx.data.passage = id; } }),
      h('span', null, h('b', { text: where }), verse && lang === 'en' ? h('q', { class: 'overlook-verse', text: verse }) : h('small', { text: gist }))))),
    lang === 'en' ? PASSAGES.some((p) => p[4]) && h('p', { class: 'note overlook-notice', text: NOTICE }) : h('p', { class: 'note', text: t('Read it in your own Bible before you answer.') }),
    refWrap,
    h('label', { class: 'block' }, h('span', { text: t('In your own words') }), text),
    h('button', { class: 'wm-btn', type: 'button', text: t('Close the book'), onclick: () => {
      const pick = el.querySelector('input[name="passage"]:checked'), said = text.value.trim();
      if (!pick) return ctx.say(t('Pick a passage first.'));
      if (pick.value === 'own' && ref.value.trim().length < 3) return ctx.say(t('Say which passage you mean.'));
      if (said.length < 60) return ctx.say(t('Stay with it a little longer: a few sentences.'));
      Object.assign(ctx.data, { passage: pick.value, ref: pick.value === 'own' ? ref.value.trim() : PASSAGES.find((p) => p[0] === pick.value)[1], said }); ctx.done();
    } }));
}

export default {
  id: 'overlook', name: t('The Overlook'), sub: t('Creed'),
  intro: t('A quiet place with a long view. Nothing here has an answer key, and nothing you say here is ever made public.'),
  stages: [
    { id: 'stones', label: t('The cairn'), title: t('1. Set down the stones'), mount: stones, hints: [t('There is no trick here. I just sit where I am comfortable.')] },
    { id: 'passage', label: t('A passage'), title: t('2. A passage'), mount: passage, hints: [t('Pick the one you would actually open to.')] },
    { id: 'cost', label: t('What it costs'), title: t('When it costs something'), hints: [t('Say what you would really do, not what sounds best.')],
      mount: decisionStage({
        name: 'cost',
        lead: [t('A contract comes in that would pay for a year of your own projects. The work is legal and well within your skills: a system whose whole purpose is to keep people playing a game longer than is good for them, and paying to keep going.'), t('Nobody you know would find out. The client is pleasant, and says so plainly: "If you do not build it, someone else will."')],
        options: [['take', t('<b>Take it</b> and do it well. The work is legal, and the money does real good elsewhere.')], ['inside', t('<b>Take it</b>, and try to soften the worst of it from the inside.')], ['quiet', t('<b>Decline</b>, politely, without saying why.')], ['say', t('<b>Decline</b>, and tell them plainly why.')]],
        ask: t('What do you tell the client, and what do you tell yourself?'), button: t('That is where I stand'),
      }) },
    { id: 'fire', label: t('The campfire'), title: t('The campfire'), cls: 'fire', hints: [t('An ordinary Tuesday. Not a Sunday.')],
      mount: fireStage({ lead: t('The stars are out over the valley. Someone asks:'), question: t('What do you believe that you cannot prove, and what does it change about an ordinary Tuesday?') }) },
  ],
  // Nothing about the answers is shown, even to the hiker's own patch screen: only that they were here.
  tally: (p) => [[t('Stones set down'), p.stones && p.stones.placed ? Object.keys(p.stones.placed).length : 0], [t('Kept'), t('private')]],
};
