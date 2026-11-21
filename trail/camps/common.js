/* Stage builders shared by camps: a decision with no right answer, and a campfire question.
 * Both keep what the hiker chose and wrote, in their own words, and never score it. */
import { h } from '../engine.js?v=d0703ed6';
import { t } from '../words.js?v=d0703ed6';

/** A decision: a few options, and "what do you say?" in the hiker's own words.
 *  o = { lead: [html…], options: [[value, html], …], ask, placeholder, button, name } */
export function decisionStage(o) {
  return (el, ctx) => {
    const text = h('textarea', { rows: 4, maxlength: 1500, placeholder: o.placeholder || t('In your own words, the way you would actually say it.') }); text.value = ctx.data.said || '';
    keep(text, ctx, 'said');
    const name = o.name || 'choice';
    el.append(
      ...(o.lead || []).map((html) => h('p', { html })),
      ...(o.points ? [h('ul', { class: 'rules' }, o.points.map((html) => h('li', { html })))] : []),
      h('p', { text: o.close || t('There is no right call here; there is yours.') }),
      h('div', { class: 'choices', role: 'radiogroup', 'aria-label': t('Your call') }, o.options.map(([v, label]) => h('label', null, h('input', { type: 'radio', name, value: v, checked: ctx.data.option === v, onchange: () => { ctx.data.option = v; } }), h('span', { html: label })))),
      h('label', { class: 'block' }, h('span', { text: o.ask || t('What do you say?') }), text),
      h('button', { class: 'wm-btn', type: 'button', text: o.button || t('That is my call'), onclick: () => {
        const pick = el.querySelector(`input[name="${name}"]:checked`), said = text.value.trim();
        if (!pick) return ctx.say(t('Make the call first.'));
        if (said.length < 20) return ctx.say(t('Say a little more, in your own words.'));
        Object.assign(ctx.data, { option: pick.value, said }); ctx.done();
      } }));
  };
}

/** A campfire: one open question, then the honest question about AI.
 *  o = { lead, question, button } */
export function fireStage(o) {
  return (el, ctx) => {
    const text = h('textarea', { rows: 7, maxlength: 3000, placeholder: t('A few sentences is plenty.') }); text.value = ctx.data.said || '';
    const how = h('input', { maxlength: 300 }); how.value = ctx.data.aiHow || '';
    keep(text, ctx, 'said'); keep(how, ctx, 'aiHow');
    el.append(
      h('div', { class: 'fire__glow', 'aria-hidden': 'true' }),
      h('p', { text: o.lead || t('The fire is low. Someone asks:') }),
      h('blockquote', { text: o.question }),
      h('label', { class: 'block' }, h('span', { text: t('Take your time') }), text),
      h('fieldset', { class: 'plain' }, h('legend', { text: t('One honest thing before you sleep: did an AI help you with this camp?') }),
        h('div', { class: 'chips' }, [['no', t('No')], ['some', t('A little')], ['lots', t('A lot')]].map(([v, label]) => h('label', null, h('input', { type: 'radio', name: 'ai', value: v, checked: ctx.data.ai === v, onchange: () => { ctx.data.ai = v; } }), h('span', { text: label })))),
        h('label', { class: 'block' }, h('span', { text: t('If it did, with what? (Using one is not against the rules. Saying so matters.)') }), how)),
      h('button', { class: 'wm-btn', type: 'button', text: o.button || t('Bank the fire'), onclick: () => {
        const said = text.value.trim(), ai = el.querySelector('input[name="ai"]:checked');
        if (said.length < 60) return ctx.say(t('Stay a little longer: a few sentences.'));
        if (!ai) return ctx.say(t('One honest thing first: did an AI help?'));
        Object.assign(ctx.data, { said, ai: ai.value, aiHow: how.value.trim() }); ctx.done();
      } }));
  };
}

/** Keep a half-written answer with the run as it is typed, so switching apps or reloading does not lose it. */
export function keep(field, ctx, key) { field.dataset.k = key; field.addEventListener('input', () => { ctx.data[key] = field.value; }); }

/** Load a camp's own stylesheet once. */
export function useCss(url) {
  if (!document.querySelector(`link[href="${url}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: url }));
}
