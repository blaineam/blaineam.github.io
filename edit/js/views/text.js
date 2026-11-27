// Text: every string of the home page, grouped and searchable, plus the simple switches
// (starting mode, open to work, featured projects, hero photographs, seasons).
import { h, clear, field, check, select, btn, sortable, move, gripBtn } from '../ui.js';
import { draft, base, touch, photoOrder, photoMeta } from '../store.js';
import { photoImg } from './photos.js';
import { pickMedia, photoItems, photoUpload } from './picker.js';
import { recordList } from './records.js';

const GROUPS = {
  _: 'Page title and search description', skip: 'Skip link', nav: 'Navigation', view: 'View switcher', hero: 'Hero', hook: 'Hero: maker lines',
  cta: 'Buttons', season: 'Season greetings', tm: 'Time machine', bday: 'Dog birthdays', stat: 'Numbers', work: 'Featured work', sheet: 'App preview sheet',
  tl: 'Project timeline', exp: 'Experience', ph: 'Photography', radial: 'Explore: names', luma: 'Luma band', soft: 'Software band', x: 'Explore: descriptions',
  xr: 'XR offer', c: 'Contact', tui: 'Terminal app', search: 'Search', foot: 'Footer',
};
const EFFECTS = ['snow', 'leaves', 'fireflies', 'embers', 'petals', 'stars', 'confetti', 'fireworks'];
const VIEW_NAMES = { maker: 'Maker (default)', hire: 'Work', photo: 'Photography', luma: 'Luma & Nova' };

export function textView(root) {
  let q = '';
  const site = () => draft('site');
  const switches = h('section', { class: 'card' });
  const groupsHost = h('div');
  const search = field({ label: 'Search the text', type: 'search', placeholder: 'A word on the page, or a key such as hero.hire.h', oninput: (v) => { q = v.toLowerCase(); drawStrings(); } });
  const count = h('p', { class: 'hint', role: 'status' });
  root.append(h('div', { class: 'view-head' }, h('h2', null, 'Text')), switches,
    h('div', { class: 'view-head' }, h('h3', null, 'Everything the home page says'), count),
    h('p', { class: 'hint' }, 'English only. Other languages are translated from these after a change (the build reports which are missing). Words in {braces} are filled in by the page; keep them. Entries marked HTML may contain tags such as <em>.'),
    h('div', { class: 'toolbar' }, search), groupsHost);

  function drawStrings() {
    const strings = site().strings, was = base('site').strings;
    const groups = new Map();
    let shown = 0, changed = 0;
    for (const [k, v] of Object.entries(strings)) {
      if (was[k] !== v) changed++;
      if (q && !k.toLowerCase().includes(q) && !String(v).toLowerCase().includes(q)) continue;
      const g = k.startsWith('_') ? '_' : k.split('.')[0];
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(k); shown++;
    }
    count.textContent = `${shown} of ${Object.keys(strings).length} shown${changed ? ` · ${changed} changed` : ''}`;
    clear(groupsHost).append(...[...groups].map(([g, keys]) => {
      const nChanged = keys.filter((k) => was[k] !== strings[k]).length;
      const mark = h('span', { class: 'badge badge--new', hidden: !nChanged }, nChanged ? `${nChanged} changed` : '');
      const body = h('div', { class: 'rec__body' });
      const fill = () => {
        if (body.firstChild) return;
        body.append(...keys.map((k) => {
          const isHtml = /<[a-z!/]/i.test(was[k] || '') || /<[a-z!/]/i.test(strings[k]);
          const reset = btn('Undo', () => { strings[k] = was[k]; f.input.value = was[k]; f.input.dispatchEvent(new Event('input')); }, 'btn--sm', { hidden: was[k] === strings[k] || !(k in was), 'aria-label': `Undo the change to ${k}` });
          const f = field({
            label: h('span', null, h('span', { class: 'mono key' }, k), isHtml ? h('span', { class: 'badge' }, 'HTML') : null),
            multiline: true, rows: 1, value: strings[k], class: was[k] !== strings[k] ? 'is-changed' : '',
            oninput: (v) => {
              strings[k] = v; touch();
              f.classList.toggle('is-changed', was[k] !== v); reset.hidden = was[k] === v;
              const n = keys.filter((x) => was[x] !== strings[x]).length; mark.hidden = !n; mark.textContent = `${n} changed`;
            },
          });
          f.append(reset);
          return f;
        }));
      };
      const det = h('details', { class: 'rec', open: !!q || nChanged > 0, ontoggle: () => det.open && fill() },
        h('summary', null, h('span', { class: 'rec__sum' }, GROUPS[g] || g), h('span', { class: 'hint' }, ` ${keys.length}`), mark), body);
      if (det.open) fill();
      return det;
    }));
    if (!shown) groupsHost.append(h('p', { class: 'empty' }, 'Nothing matches.'));
  }

  function drawSwitches() {
    const s = site();
    const projects = draft('projects');
    const title = (id) => (projects.find((p) => p.id === id) || {}).title || id;

    // featured projects
    const featList = h('ul', { class: 'reclist' }, (s.featured || []).map((id, i) => h('li', { class: 'recrow' }, gripBtn(title(id)),
      h('span', { class: 'prow prow--static' }, h('span', { class: 'prow__t' }, h('strong', null, title(id)), h('span', { class: 'mono' }, id))),
      btn('Remove', () => { s.featured = s.featured.filter((_, j) => j !== i); touch(true); }, 'btn--sm', { 'aria-label': `Remove ${title(id)} from featured` }))));
    sortable(featList, { itemSelector: 'li.recrow', onmove: (a, b) => { s.featured = move(s.featured, a, b); touch(true); } });
    const addable = projects.filter((p) => p.id && !(s.featured || []).includes(p.id));
    const featAdd = select({ label: 'Add a featured project', value: '', options: [['', 'Choose…'], ...addable.map((p) => [p.id, p.title])], onchange: (id) => { if (id) { s.featured = [...(s.featured || []), id]; touch(true); } } });

    // hero photographs per view
    const heroBlocks = Object.keys(VIEW_NAMES).filter((v) => s.views && s.views[v]).map((v) => {
      const view = s.views[v];
      const list = h('ul', { class: 'herolist' }, (view.hero || []).map((n, i) => h('li', { class: 'recrow' }, gripBtn(n),
        h('span', { class: 'herothumb' }, photoImg(n, photoMeta(n).alt || '')), h('span', { class: 'mono' }, n),
        btn('Remove', () => { view.hero = view.hero.filter((_, j) => j !== i); touch(true); }, 'btn--sm', { 'aria-label': `Remove ${n} from the ${VIEW_NAMES[v]} hero` }))));
      sortable(list, { itemSelector: 'li.recrow', onmove: (a, b) => { view.hero = move(view.hero, a, b); touch(true); } });
      const add = h('div', { class: 'row' }, btn('Choose photographs…', async () => {
        const got = await pickMedia({ title: `Hero photographs: ${VIEW_NAMES[v]} view`, multiple: true, selected: view.hero || [], items: photoItems, upload: photoUpload,
          hint: 'The pictures behind the top of the page in this view. Highlight one to see it large before ticking it.' });
        if (got) { view.hero = got; touch(true); }
      }, '', { 'aria-label': `Choose hero photographs for the ${VIEW_NAMES[v]} view` }));
      return h('fieldset', null, h('legend', null, `${VIEW_NAMES[v]} view`), (view.hero || []).length ? list : h('p', { class: 'hint' }, 'No hero photographs.'), add);
    });

    const seasons = recordList({
      title: 'Seasons', noun: 'season', get: () => s.seasons, set: (a) => { s.seasons = a; },
      intro: 'Date-based celebrations in the hero. The first match wins, so single days sit above the months they fall in. Try one on the live site with /?when=2026-12-25.',
      summary: (x) => `${x.id || ''} · ${x.effect || ''} · ${x.rule ? `rule: ${x.rule}` : x.date ? x.date : `${x.from || '?'} to ${x.to || '?'}`}`,
      blank: () => ({ id: '', from: '01-01', to: '01-01', effect: 'confetti' }),
      onchange: (structural) => touch(structural),
      fields: [
        { key: 'id', label: 'Id', hint: 'A short name. A greeting needs a matching “season.<id>” text.' },
        { key: 'effect', label: 'Effect', type: 'select', options: EFFECTS },
        { key: 'from', label: 'First day (month-day)', placeholder: '12-24', optional: true, show: (x) => !x.rule && !x.date },
        { key: 'to', label: 'Last day (month-day)', placeholder: '12-25', optional: true, show: (x) => !x.rule && !x.date },
        { key: 'day', label: 'The day itself (month-day)', optional: true, hint: 'Optional. The greeting shows only on this day.', show: (x) => !x.rule && !x.date },
        { key: 'date', label: 'One exact date', optional: true, placeholder: '2026-07-04', show: (x) => !!x.date },
        { key: 'before', label: 'Days before', type: 'number', optional: true, show: (x) => !!x.rule },
        { key: 'after', label: 'Days after', type: 'number', optional: true, show: (x) => !!x.rule },
        { key: 'greet', label: 'Show a greeting', type: 'bool', optional: true },
        { key: 'lights', label: 'String lights', type: 'bool', optional: true },
      ],
    });

    clear(switches).append(
      h('h3', null, 'Switches'),
      h('div', { class: 'grid2' },
        select({ label: 'The home page opens as', value: s.mode, options: [['maker', 'Maker: “I’m building cool things”'], ['hire', 'Work: resume first']], hint: 'Visitors can switch; /hire always opens the work view.', onchange: (v) => { s.mode = v; touch(); } }),
        h('div', null, check({ label: 'Open to work', hint: '(shows the “Open to senior & principal roles” badge in the work view)', value: !!s.openToWork, onchange: (on) => { s.openToWork = on; touch(); } }),
          field({ label: 'Luma’s birthday', type: 'date', value: (s.luma || {}).born, oninput: (v) => { s.luma = { ...(s.luma || {}), born: v }; touch(); } }))),
      h('details', { class: 'rec' }, h('summary', null, h('span', { class: 'rec__sum' }, 'Featured projects'), h('span', { class: 'hint' }, ` ${(s.featured || []).length}`)),
        h('div', { class: 'rec__body' }, featList, featAdd)),
      h('details', { class: 'rec' }, h('summary', null, h('span', { class: 'rec__sum' }, 'Hero photographs')),
        h('div', { class: 'rec__body' }, heroBlocks)),
      h('details', { class: 'rec' }, h('summary', null, h('span', { class: 'rec__sum' }, 'Seasons'), h('span', { class: 'hint' }, ` ${(s.seasons || []).length}`)),
        h('div', { class: 'rec__body' }, seasons)));
    // keep fold-outs open across redraws
    switches.querySelectorAll(':scope > details').forEach((d, i) => { d.open = openState[i]; d.addEventListener('toggle', () => { openState[i] = d.open; }); });
  }
  const openState = [false, false, false];

  return { draw() { drawSwitches(); drawStrings(); } };
}
