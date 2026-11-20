// Resume: content/resume.json. The `private` block (the unlisted clearance line) is left exactly as it is.
import { h, clear, field, lines } from '../ui.js';
import { draft, touch } from '../store.js';
import { recordList } from './records.js';

export function resumeView(root) {
  const host = h('div');
  root.append(h('div', { class: 'view-head' }, h('h2', null, 'Resume')),
    h('p', { class: 'hint' }, 'Feeds /resume/ and the Experience section of the work view. The private clearance line is not shown or changed here.'), host);
  const r = () => draft('resume');
  const onchange = (structural) => touch(structural);
  function draw() {
    const set = (k) => (v) => { r()[k] = v; touch(); };
    clear(host).append(
      h('section', { class: 'card' },
        h('div', { class: 'grid2' },
          field({ label: 'Name', value: r().name, oninput: set('name') }),
          field({ label: 'Title', value: r().title, oninput: set('title') })),
        field({ label: 'Location', value: r().location, oninput: set('location') }),
        field({ label: 'Summary', multiline: true, value: r().summary, oninput: set('summary') }),
        field({ label: 'Links', multiline: true, mono: true, value: (r().links || []).join('\n'), hint: 'One per line.', oninput: (v) => { r().links = lines(v); touch(); } })),
      recordList({
        title: 'Experience', noun: 'job', get: () => r().experience, set: (a) => { r().experience = a; }, onchange,
        summary: (j) => [j.role, j.company].filter(Boolean).join(' · '),
        blank: () => ({ role: '', company: '', start: '', end: '', place: '', field: '', bullets: [] }),
        fields: [
          { key: 'role', label: 'Role' }, { key: 'company', label: 'Company' },
          { key: 'start', label: 'Start', placeholder: '06/2024' }, { key: 'end', label: 'End', placeholder: '10/2026 or Present' },
          { key: 'place', label: 'Place' }, { key: 'field', label: 'Field' },
          { key: 'bullets', label: 'What you did', type: 'list', hint: 'One point per line.' },
        ],
      }),
      recordList({
        title: 'Skills', noun: 'skill group', get: () => r().skills, set: (a) => { r().skills = a; }, onchange,
        summary: (g) => `${g.years || ''} · ${(g.items || []).length} skills`,
        blank: () => ({ years: '', items: [] }),
        fields: [{ key: 'years', label: 'Experience', placeholder: '4 - 6 Years' }, { key: 'items', label: 'Skills', type: 'list' }],
      }),
      recordList({
        title: 'Education', noun: 'school', get: () => r().education, set: (a) => { r().education = a; }, onchange,
        summary: (e) => [e.degree, e.school].filter(Boolean).join(' · '),
        blank: () => ({ degree: '', detail: '', school: '', start: '', end: '' }),
        fields: [{ key: 'degree', label: 'Degree' }, { key: 'detail', label: 'Detail', type: 'long' }, { key: 'school', label: 'School' }, { key: 'start', label: 'Start', placeholder: '01/2013' }, { key: 'end', label: 'End', placeholder: '12/2015' }],
      }),
      Array.isArray(r().projects) ? recordList({
        title: 'Projects on the resume', noun: 'project', get: () => r().projects, set: (a) => { r().projects = a; }, onchange,
        summary: (p) => p.title, blank: () => ({ title: '', start: '', end: '', url: '', text: '' }),
        fields: [{ key: 'title', label: 'Title' }, { key: 'start', label: 'Start' }, { key: 'end', label: 'End' }, { key: 'url', label: 'Link', optional: true }, { key: 'text', label: 'Text', type: 'long' }],
      }) : null);
  }
  return { draw };
}
