/* The Trail: sending a finished run.
 *
 *   mountSend(el, { run, save, hiker })
 *
 * The summit calls this (it has the same arguments as a camp's afterPatch hook). It asks three
 * separate questions, none ticked in advance, shows exactly what would be public (a trail name,
 * one optional line and a few facts: never a link), holds the name and the line to the trail's
 * manners (manners.js) and will not seal while either fails, seals the run
 * in this browser (seal.js) and offers four ways to hand it over. There is no server: the sealed
 * text travels as a GitHub issue, an e-mail or a file.
 *
 * Settings come from trail/config.json. Until a public key is there, sending is "not open yet"
 * and the hiker can still save the run as a file.
 */
import { t } from './words.js?v=47c94598';
import { sealRun, publicPart, buildIssueUrl, importPublicKey, nameProblem, lineProblem, LIMITS } from './seal.js?v=47c94598';   // nameProblem/lineProblem are manners.js's checkName/checkPublic, plus a few disguises

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
let styled = false;
function style() { if (styled) return; styled = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./plumbing.css?v=47c94598', import.meta.url).href })); }

/** Reads trail/config.json. Returns { open, key, kid, repo, email, why }; never throws. */
export async function loadConfig(url = new URL('./config.json', import.meta.url)) {
  const closed = (why) => ({ open: false, key: null, kid: '', repo: '', email: '', why });
  let cfg;
  try { const res = await fetch(url, { cache: 'no-cache' }); if (!res.ok) return closed('missing'); cfg = await res.json(); } catch (e) { return closed('missing'); }
  if (!cfg || !cfg.publicKey) return closed('no key');
  try {
    const { jwk, kid } = await importPublicKey(cfg.publicKey);
    if (cfg.keyId && cfg.keyId !== kid) return closed('key id mismatch');       // someone pasted half of a new key: refuse rather than seal to the wrong one
    const repo = typeof cfg.repo === 'string' && /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repo) ? cfg.repo : '';
    const email = typeof cfg.email === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(cfg.email) ? cfg.email : '';
    return { open: true, key: jwk, kid, repo, email, why: '' };
  } catch (e) { return closed('bad key'); }
}

const download = (name, text, type = 'text/plain') => {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const slug = (s) => String(s || 'hiker').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'hiker';

export function mountSend(el, { run, save = () => {}, hiker } = {}) {
  style();
  const uid = 'send-' + Math.random().toString(36).slice(2, 8);
  // The choices live in the run so they are remembered, but they are sent sealed, apart from the run itself.
  const c = (run.send = run.send && typeof run.send === 'object' ? run.send : {});
  c.pool = c.pool === true; c.now = c.now === true; c.public = c.public === true;
  c.line = typeof c.line === 'string' ? c.line : ''; c.contact = typeof c.contact === 'string' ? c.contact : '';
  delete c.links;                                      // an earlier draft had links; a public profile has none

  // The tin is on the summit: someone signing it has reached the Summit, even though the camp's patch comes after.
  const reached = () => { const at = run.at || {}, s = (run.camps || {}).summit; if (at.camp !== 'summit' || at.stage !== 'register' || (s && s.done)) return run; const copy = JSON.parse(JSON.stringify(run)); (copy.camps.summit = copy.camps.summit || { parts: {} }).done = new Date().toISOString(); return copy; };
  const CAMP = { trailhead: t('the Trailhead'), workshop: t('the Workshop'), shelter: t('the Shelter'), overlook: t('the Overlook'), summit: t('the Summit') };
  // The preview, in the hiker's language. It is only shown on this page: what is sent is built by seal.js and stays as it is.
  const inWords = (pub) => {
    const f = pub.flags || {}, facts = [f.quiet && t('Never asked {guide} for a hint'), f.shortestWay && t('Found the shortest way up the first hill'), f.longWay && t('Took the long way round on the first hill'), f.oneSitting && t('Walked it all in one day'), f.restarts ? t('Fresh starts: {n}', { n: f.restarts }) : ''].filter(Boolean);
    const hints = Object.entries(pub.hints || {}).filter(([, n]) => n).map(([id, n]) => t('{n} at {camp}', { n, camp: CAMP[id] || id })).join(', ');
    const camps = pub.camps.map((c) => `${CAMP[c.id] || c.id} (${c.done})`).join(', ');
    return [t('Trail name: {name}', { name: pub.handle }), pub.profile ? t('About you: {line}', { line: pub.profile.line }) : '', camps ? t('Camps reached: {camps}', { camps }) : t('Camps reached: none yet'),
      pub.minutes ? t('Time on the trail: about {n} min', { n: pub.minutes }) : '', hints ? t('Hints from {guide}: {hints}', { hints }) : t('Hints from {guide}: none'), ...facts].filter(Boolean).join('\n');
  };
  let cfg = null, sealed = null;                       // sealed: { envelope, plan } once the run has been sealed with the present choices
  const say = h('p', { class: 'send__say', role: 'status', 'aria-live': 'polite' });
  const tell = (text, good) => { say.textContent = text || ''; say.classList.toggle('is-good', !!good); };

  /* --- the three choices --- */
  const choice = (key, title, sentence) => {
    const box = h('input', { type: 'checkbox', id: `${uid}-${key}`, 'aria-describedby': `${uid}-${key}-d` });
    box.checked = c[key];
    box.addEventListener('change', () => { c[key] = box.checked; changed(); });
    return h('div', { class: 'send__choice' }, box, h('div', null, h('label', { for: box.id, text: title }), h('p', { id: `${uid}-${key}-d`, text: sentence })));
  };
  const choices = h('fieldset', { class: 'send__choices' }, h('legend', { text: t('Three separate choices. Tick any, all or none.') }),
    choice('pool', t('Keep me in mind for later'), t('If the day comes when these projects need new people to look after them, your run may be read with that in mind.')),
    choice('now', t('Consider me now'), t('You would like to be considered for contributor access to the projects today.')),
    choice('public', t('Put me on the trail register'), t('Your trail name, the camps you reached and a few small facts about your walk go on a public list, and your name shows as a small light on the map.')));

  /* --- the public profile, shown only when "be public" is on --- */
  const line = h('input', { id: `${uid}-line`, maxlength: LIMITS.line, autocomplete: 'off', 'aria-describedby': `${uid}-line-d ${uid}-line-e` }); line.value = c.line;
  line.addEventListener('input', () => { c.line = line.value; changed(); });
  const lineSay = h('p', { class: 'send__bad', id: `${uid}-line-e`, role: 'alert' });
  const profile = h('div', { class: 'send__profile' },
    h('label', { for: line.id, text: t('One line about you (optional, public)') }), line,
    h('p', { class: 'note', id: `${uid}-line-d`, text: t('Up to {n} characters of plain words. No links, handles or adverts: the register is not a place to promote anything.', { n: LIMITS.line }) }),
    lineSay);

  const previewTitle = h('h4', { id: `${uid}-pv` }), previewNote = h('p', { class: 'note' });
  const previewBox = h('pre', { class: 'send__preview', tabindex: 0, 'aria-labelledby': `${uid}-pv` });

  /* --- sealed, and how to reach the hiker --- */
  const contact = h('input', { id: `${uid}-contact`, maxlength: 200, autocomplete: 'off', 'aria-describedby': `${uid}-contact-d` }); contact.value = c.contact;
  contact.addEventListener('input', () => { c.contact = contact.value; changed(); });

  const sealBtn = h('button', { class: 'wm-btn', type: 'button', text: t('Seal my run') });
  const actions = h('div', { class: 'send__actions', hidden: true });
  const closedBox = h('div', { class: 'send__closed', hidden: true });
  const sealedText = h('textarea', { readonly: true, rows: 6, id: `${uid}-env`, spellcheck: 'false' });

  function changed() {
    save();
    if (sealed) { sealed = null; actions.hidden = true; sealBtn.hidden = !(cfg && cfg.open); tell(t('You changed something, so the sealed copy was thrown away. Seal again when you are ready.')); }
    paint();
  }

  /* What stands in the way of sealing, as a sentence, or '' when nothing does. */
  function trouble() {
    const name = nameProblem(run.handle);
    if (name) return t('Your trail name cannot be sent: {why} Start again with another name to send a run.', { why: name });
    if (c.public) { const bad = lineProblem(c.line); if (bad) return bad; }
    return '';
  }

  function paint() {
    profile.hidden = !c.public;
    const lineBad = c.public ? lineProblem(c.line) : null, nameBad = nameProblem(run.handle);
    lineSay.textContent = lineBad || ''; line.setAttribute('aria-invalid', lineBad ? 'true' : 'false');
    sealBtn.disabled = !!(lineBad || nameBad);
    const pub = lineBad || nameBad ? null : publicPart(reached(), c);
    if (nameBad) {
      previewTitle.textContent = t('This trail name cannot be sent');
      previewBox.hidden = true; previewNote.textContent = nameBad;
    } else if (lineBad) {
      previewTitle.textContent = t('Nothing can be sent with that line');
      previewBox.hidden = true; previewNote.textContent = t('Change the line about you, or clear it, and the preview comes back.');
    } else if (c.public && pub) {
      previewTitle.textContent = t('Exactly what would be public');
      previewBox.textContent = inWords(pub); previewBox.hidden = false;
      previewNote.textContent = t('This, your GitHub name on the issue (if you send through GitHub) and nothing else. About the Overlook it says only that you reached it. A person reads every entry before it appears on the register, so it will not show up at once, and an entry that is not kind is left out.');
    } else if (c.public) {
      previewTitle.textContent = t('This trail name cannot go on the register');
      previewBox.hidden = true;
      previewNote.textContent = t('The register takes names of 2 to 24 letters, numbers, spaces, dots, dashes and underscores. Your run can still be sent; it just would not be listed.');
    } else {
      previewTitle.textContent = t('Nothing would be public');
      previewBox.hidden = true;
      previewNote.textContent = t('No name, no camps, no light on the map. If you send through GitHub, people can see that your GitHub account sent a sealed run, and nothing about what is in it. Sending by e-mail shows nothing to anyone.');
    }
  }

  async function seal() {
    if (!cfg || !cfg.open) return;
    const stop = trouble(); if (stop) return tell(stop);                       // checked again here, not only while typing
    sealBtn.disabled = true; tell(t('Sealing…'));
    try {
      const pub = c.public ? publicPart(reached(), c) : null;
      const copy = JSON.parse(JSON.stringify(reached())); delete copy.send;
      const meta = { choices: { pool: c.pool, now: c.now, public: !!pub }, contact: c.contact.trim().slice(0, 200), public: pub };
      const envelope = await sealRun(copy, cfg.key, meta);
      let plan = null;
      if (cfg.repo) plan = buildIssueUrl({ repo: cfg.repo, envelope, publicPart: pub, choices: { public: !!pub }, email: cfg.email });
      else { plan = buildIssueUrl({ repo: 'x/x', envelope, publicPart: pub, choices: { public: !!pub }, email: cfg.email }); plan.mode = 'file'; plan.url = ''; }
      sealed = { envelope, plan };
      showActions();
      tell(t('Sealed. Nothing has been sent yet: choose how to send it.'), true);
    } catch (e) { tell(e && e.code ? e.message : t('The run could not be sealed in this browser. You can still save it as a file from the buttons below the patch.')); }
    paint();
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try { sealedText.closest('details').open = true; sealedText.focus(); sealedText.select(); return document.execCommand('copy'); } catch (e) { return false; }
  }

  function showActions() {
    const { plan } = sealed; actions.textContent = ''; sealedText.value = plan.body;
    const kids = [];
    if (plan.url) {
      const paste = plan.mode === 'paste';
      kids.push(h('a', { class: 'wm-btn', href: plan.url, target: '_blank', rel: 'noopener', text: t('Open GitHub to send it'),
        onclick: () => { if (paste) copyText(plan.copy).then((ok) => tell(ok ? t('Copied. On the GitHub page, paste it into the big box in place of what is there, then press Create.') : t('Copying did not work here. Press Copy below, then paste it into the big box on the GitHub page.'), ok)); else tell(t('GitHub opened in a new tab with everything filled in. It is sent when you press Create there.'), true); } }));
    }
    kids.push(h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Copy'), onclick: async () => tell(await copyText(plan.copy) ? t('Copied: the public part (if any) and the sealed part, ready to paste.') : t('Copying did not work here. Open “See the sealed text” and copy it by hand.'), true) }));
    kids.push(h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Save as a file'), onclick: () => { download(`trail-run-${slug(hiker || run.handle)}-sealed.txt`, plan.file.text); tell(t('Saved. The file is sealed: it is safe to attach to an e-mail or keep anywhere.'), true); } }));
    if (plan.mailto) kids.push(h('a', { class: 'wm-btn wm-btn--line', href: plan.mailto, text: t('Send by email instead'), onclick: () => tell(plan.mailto.includes('attached') ? t('Your mail program should open. The run is too long to put in the message for you: save it as a file and attach it.') : t('Your mail program should open with the sealed run in the message. It is sent when you press send there.'), true) }));
    const how = plan.mode === 'paste' ? t('Your run is too long to fit in a link, so “Open GitHub” copies it for you and opens a nearly empty issue: paste it there, then press Create.')
      : plan.mode === 'file' ? (cfg.repo ? t('Your run is too long for a GitHub issue. Save it as a file and send it by e-mail.') : t('The GitHub route is not set up yet. Save the sealed file, or send it by e-mail.'))
        : t('“Open GitHub” opens a new issue with everything filled in. You need a GitHub account, and nothing is sent until you press Create there.');
    actions.append(h('div', { class: 'row wrap' }, kids), h('p', { class: 'note', text: how }),
      h('details', { class: 'send__see' }, h('summary', { text: t('See the sealed text') }), h('label', { class: 'sr', for: sealedText.id, text: t('The text that would be sent') }), sealedText),
      h('p', { class: 'note', text: t('Change your mind later? Come back, change your choices and send again: the newest one from your GitHub account is the one that counts. To come off the register without sending anything, write a comment on your issue that says only: remove me') }));
    actions.hidden = false; sealBtn.hidden = true;
  }

  function showClosed() {
    closedBox.textContent = '';
    closedBox.append(
      h('p', { text: t('Sending is not open yet. The keeper of the trail has not put out the key that runs are sealed with, so nothing can be sealed or sent today.') }),
      h('p', { text: t('Your choices above are remembered on this device. You can keep your run as a file and send it when sending opens.') }),
      h('div', { class: 'row wrap' }, h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Save my run as a file (not sealed)'),
        onclick: () => { download(`trail-${slug(hiker || run.handle)}.json`, JSON.stringify(run, null, 2), 'application/json'); tell(t('Saved. This file is not encrypted: it holds everything you typed, so keep it somewhere private.')); } })),
      h('p', { class: 'note', text: t('That file is plain, not encrypted. Anyone who has it can read your answers.') }));
    closedBox.hidden = false; sealBtn.hidden = true;
  }

  sealBtn.addEventListener('click', seal);
  el.append(h('section', { class: 'send', 'aria-labelledby': `${uid}-h` },
    h('h3', { id: `${uid}-h`, text: t('Send your run, if you would like to') }),
    h('p', { text: t('Your run has stayed on this device the whole way. Sending it is up to you. Leaving every box empty and closing the tin is a complete ending too: you still walked the trail.') }),
    h('div', { class: 'send__truth' },
      h('p', null, h('strong', { text: t('Encrypted:') + ' ' }), t('every answer, choice and campfire reflection, how you went about each stage step by step (what you wrote and then changed, what you pressed, and each time you asked {guide}), your first two choices below, and how to reach you. It is locked in this browser before it goes anywhere, and only the keeper of the trail holds the key. Today that is Blaine Miller. One day it may be four people he trusts, and it would take three of them together to open anything.')),
      h('p', null, h('strong', { text: t('Not encrypted:') + ' ' }), t('only what the preview below shows, and only if you choose to go on the register. If you send through GitHub, your GitHub name and the date are on the issue either way, because that is how GitHub works.'))),
    choices, profile,
    h('div', { class: 'send__pv' }, previewTitle, previewBox, previewNote),
    h('div', { class: 'send__contact' }, h('label', { for: contact.id, text: t('How to reach you (optional, sealed)') }), contact,
      h('p', { class: 'note', id: `${uid}-contact-d`, text: t('An e-mail address or anything else. It is sealed with your run and never shown publicly.') })),
    h('div', { class: 'row wrap' }, sealBtn), closedBox, actions, say));
  paint(); sealBtn.hidden = true;

  loadConfig().then((got) => { cfg = got; if (cfg.open) sealBtn.hidden = false; else showClosed(); });
  return { get choices() { return c; }, refresh: paint };
}
