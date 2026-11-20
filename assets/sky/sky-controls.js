/* sky-controls.js: an optional control bar for sky.js. Plain DOM, no dependencies.
 * Needs sky-controls.css. Usage:
 *
 *   import { createSky } from './sky.js';
 *   import { createSkyControls } from './sky-controls.js';
 *   const sky = createSky(canvas);
 *   createSkyControls(sky, { container: document.querySelector('#sky-controls') });
 */

import { skyStrings, skyPosition, onSkyLang, localizeSky } from './sky-strings.js';

const SPEEDS = [0, 1, 60, 600, 3600];
const MOON_EN = skyStrings('en').moon;      // sky.js names the phase in English; this finds its place in the list
let uid = 0;

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
  }
  if (kids) for (const c of kids) if (c) n.appendChild(c);
  return n;
}
const pad = (v) => (v < 10 ? '0' : '') + v;
function localInput(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * The bar speaks the page's language (see sky-strings.js) and re-labels itself when the visitor
 * changes it; dates and numbers are formatted for that language too.
 *
 * @param {{model: object, view: object}} sky  what createSky() returned
 * @param {object} [o]
 * @param {Element} [o.container] where to put the bar (otherwise use the returned element yourself)
 * @param {string} [o.label] accessible name (default "Sky controls", translated)
 * @param {boolean} [o.deviceOrientation] show the opt-in "Aim with my phone" button (default true on touch devices with sensors)
 * @param {boolean} [o.geolocation] show the opt-in "Use my location" button (default true where supported)
 * @returns {{element: HTMLElement, refresh: Function, destroy: Function}}
 */
export function createSkyControls(sky, o) {
  o = o || {};
  const model = sky.model, view = sky.view, id = 'skyc' + (++uid) + '-';
  let S = skyStrings(), fmt = null, pct = null;
  const words = [];                                   // everything that has to be said again in another language
  const say = (node, get) => { words.push(() => { node.textContent = get(); }); return node; };
  const formats = () => {
    const opt = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    try { fmt = new Intl.DateTimeFormat(S.lang, opt); } catch (e) { fmt = new Intl.DateTimeFormat(undefined, opt); }
    try { pct = new Intl.NumberFormat(S.lang, { style: 'percent', maximumFractionDigits: 0 }); } catch (e) { pct = { format: (v) => Math.round(v * 100) + '%' }; }
  };
  const num = (v) => { try { return v.toLocaleString(S.lang); } catch (e) { return String(v); } };

  const field = (key, input, extra) => {
    input.id = id + input.name;
    return el('div', { class: 'skyc__field' }, [say(el('label', { for: input.id }), () => S[key]), input, extra]);
  };

  const clock = el('p', { class: 'skyc__clock' });
  const status = el('p', { class: 'skyc__status' });
  const live = el('p', { class: 'skyc__sr', 'aria-live': 'polite' });

  const nowBtn = say(el('button', { type: 'button', class: 'skyc__btn' }), () => S.now);
  const goBtn = say(el('button', { type: 'button', class: 'skyc__btn' }), () => S.go);
  const when = el('input', { type: 'datetime-local', name: 'when' });
  const scrub = el('input', { type: 'range', name: 'scrub', min: 0, max: 1439, step: 1 });
  const scrubOut = el('output', { for: id + 'scrub' });
  const speed = el('select', { name: 'speed' }, SPEEDS.map((v, i) => say(el('option', { value: v }), () => S.speeds[i])));
  const lat = el('input', { type: 'number', name: 'lat', min: -90, max: 90, step: 0.1, inputmode: 'decimal' });
  const lon = el('input', { type: 'number', name: 'lon', min: -180, max: 180, step: 0.1, inputmode: 'decimal' });
  const az = el('input', { type: 'range', name: 'az', min: 0, max: 359, step: 1 });
  const canGeo = o.geolocation !== false && typeof navigator !== 'undefined' && !!navigator.geolocation && window.isSecureContext !== false;
  const geoNote = say(el('p', { class: 'skyc__note', id: id + 'geo-note' }), () => S.geoNote);
  const geoBtn = say(el('button', { type: 'button', class: 'skyc__btn skyc__btn--plain', 'aria-describedby': geoNote.id }), () => S.geoBtn);
  const geoMsg = el('p', { class: 'skyc__note skyc__msg', role: 'status' });
  const geo = canGeo ? el('div', { class: 'skyc__geo' }, [geoBtn, el('div', null, [geoNote, geoMsg])]) : null;
  // "aim with your phone": only offered on touch devices that have orientation sensors
  const canAim = o.deviceOrientation !== false && typeof window.DeviceOrientationEvent !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  const aimNote = say(el('p', { class: 'skyc__note', id: id + 'aim-note' }), () => S.aimNote);
  const aimBtn = el('button', { type: 'button', class: 'skyc__btn skyc__btn--plain', 'aria-pressed': 'false', 'aria-describedby': aimNote.id });
  const aimMsg = el('p', { class: 'skyc__note skyc__msg', role: 'status' });
  const aim = canAim ? el('div', { class: 'skyc__geo' }, [aimBtn, el('div', null, [aimNote, aimMsg])]) : null;
  const azOut = el('output', { for: id + 'az' });
  const tilt = el('input', { type: 'range', name: 'tilt', min: 0, max: 90, step: 1 });
  const tiltOut = el('output', { for: id + 'tilt' });

  // the two status messages keep what they are about, not the sentence, so they can be said again in another language
  let geoState = null, aimState = null;
  const err = (table, e) => table[e.code] || e.message;
  const messages = () => {
    geoMsg.textContent = !geoState ? '' : geoState.wait ? S.geoWait : geoState.at ? S.geoUsing.replace('{pos}', skyPosition(geoState.at.lat, geoState.at.lon, S.lang))
      : err(S.geoErr, geoState.error) + ' ' + S.geoType;
    aimMsg.textContent = !aimState ? '' : aimState.on ? S.aimOn : err(S.aimErr, aimState.error);
  };
  words.push(messages);

  const lookName = id + 'look';
  const radios = ['auto', 'night', 'day'].map((v) => {
    const r = el('input', { type: 'radio', name: lookName, value: v, id: id + 'look-' + v });
    return el('span', { class: 'skyc__seg' }, [r, say(el('label', { for: r.id }), () => S[v])]);
  });
  const look = el('fieldset', { class: 'skyc__field skyc__look' }, [say(el('legend'), () => S.sky), el('div', { class: 'skyc__segs' }, radios)]);

  const check = (key, name) => {
    const c = el('input', { type: 'checkbox', name, id: id + name });
    return [c, el('span', { class: 'skyc__check' }, [c, say(el('label', { for: c.id }), () => S[key])])];
  };
  const [trails, trailsWrap] = check('trails', 'trails');
  const [lines, linesWrap] = check('lines', 'lines');

  const pair = el('div', { class: 'skyc__pair', role: 'group' }, [field('lat', lat), field('lon', lon)]);
  const root = el('form', { class: 'skyc' }, [
    el('div', { class: 'skyc__read' }, [clock, status, live]),
    el('div', { class: 'skyc__grid' }, [
      el('div', { class: 'skyc__field skyc__now' }, [nowBtn]),
      el('div', { class: 'skyc__field skyc__when' }, [say(el('label', { for: id + 'when' }), () => S.when), el('div', { class: 'skyc__go' }, [when, goBtn])]),
      field('scrub', scrub, scrubOut),
      field('speed', speed),
      pair,
      field('looking', az, azOut),
      field('lookingUp', tilt, tiltOut),
      look,
      el('div', { class: 'skyc__field skyc__toggles' }, [trailsWrap, linesWrap])
    ]),
    geo, aim
  ]);
  words.push(() => { root.setAttribute('aria-label', o.label || S.label); root.lang = S.lang; pair.setAttribute('aria-label', S.place); });
  when.id = id + 'when';
  root.addEventListener('submit', (e) => e.preventDefault());

  /* ---------- controls -> sky ---------- */
  nowBtn.addEventListener('click', () => view.travelTo('now'));
  // A date field reports a change after every part typed or picked, so travelling on change left
  // before the visitor had finished. It goes when they say so: the Go button, or Enter.
  let typing = false;
  const go = () => { const t = new Date(when.value).getTime(); typing = false; if (!isNaN(t)) view.travelTo(t); };
  when.addEventListener('input', () => { typing = true; });
  when.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  goBtn.addEventListener('click', go);
  nowBtn.addEventListener('click', () => { typing = false; });
  scrub.addEventListener('input', () => {
    const d = new Date(model.time); d.setHours(0, 0, 0, 0);
    model.setTime(d.getTime() + scrub.value * 60000);
  });
  speed.addEventListener('change', () => { const r = +speed.value; if (r === 1 && model.live) return; model.setRate(r); });
  const place = () => { const a = parseFloat(lat.value), b = parseFloat(lon.value); if (!isNaN(a) && !isNaN(b)) model.setLocation(a, b); };
  lat.addEventListener('change', place); lon.addEventListener('change', place);
  az.addEventListener('input', () => view.setAzimuth(+az.value));
  tilt.addEventListener('input', () => view.setTilt(+tilt.value));
  aimBtn.addEventListener('click', () => {
    if (view.following) { view.followDevice(false); aimState = null; messages(); return; }
    aimBtn.disabled = true; aimState = null; messages();
    view.followDevice(true).then(() => { aimState = { on: true }; }, (e) => { aimState = { error: e }; }).then(() => { messages(); aimBtn.disabled = false; });
  });
  geoBtn.addEventListener('click', () => {
    geoBtn.disabled = true; geoState = { wait: true }; messages();
    window.Sky.requestLocation(model).then((p) => { geoState = { at: p }; }, (e) => { geoState = { error: e }; }).then(() => { messages(); geoBtn.disabled = false; });
  });
  for (const s of radios) s.firstChild.addEventListener('change', (e) => { if (e.target.checked) model.setMode(e.target.value); });
  trails.addEventListener('change', () => view.setTrails(trails.checked));
  lines.addEventListener('change', () => view.setConstellations(lines.checked));

  /* ---------- sky -> controls ---------- */
  let lastMin = -1, lastStatus = '', lastSay = '';
  const active = () => document.activeElement;
  function refresh(force) {
    const min = Math.floor(model.time / 60000);
    if (force || min !== lastMin) {
      lastMin = min;
      const d = new Date(model.time);
      clock.textContent = fmt.format(d) + (model.live ? '' : model.rate === 0 ? ' ' + S.paused : model.rate === 1 ? '' : ' ' + S.fast);
      if (active() !== when && !typing) when.value = localInput(model.time);
      const m = d.getHours() * 60 + d.getMinutes();
      if (active() !== scrub) scrub.value = m;
      scrubOut.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    const phase = MOON_EN.indexOf(model.moon.phaseName);
    const s = S.look[model.sky.phase] + ' · ' + S.sun + ' ' + (model.sun.alt >= 0 ? '+' : '−') + num(Math.round(Math.abs(model.sun.alt))) + '° · ' +
      (phase >= 0 ? S.moon[phase] : model.moon.phaseName) + ' ' + pct.format(Math.round(model.moon.illumination * 100) / 100) + (model.moon.up ? '' : ' ' + S.set);
    if (s !== lastStatus) { lastStatus = s; status.textContent = s; }
    const heard = S.look[model.sky.look];
    if (heard !== lastSay) { lastSay = heard; live.textContent = heard; }      // screen readers hear the phase change, not every tick
  }
  function sync(_, what) {
    if (what === 'location' && model.locationSource !== 'geolocation' && geoState) { geoState = null; messages(); }
    if (active() !== lat) lat.value = (+model.lat).toFixed(1);
    if (active() !== lon) lon.value = (+model.lon).toFixed(1);
    const want = model.live ? 1 : model.rate;
    let best = 0; for (let i = 0; i < SPEEDS.length; i++) if (Math.abs(SPEEDS[i] - want) < Math.abs(SPEEDS[best] - want)) best = i;
    speed.selectedIndex = best;
    for (const s of radios) s.firstChild.checked = s.firstChild.value === model.mode;
    trails.checked = view.trails; lines.checked = view.constellations;
    aimBtn.setAttribute('aria-pressed', String(!!view.following)); aimBtn.textContent = view.following ? S.aimStop : S.aimBtn;
    const a = Math.round(view.azimuth) % 360;
    if (active() !== az) az.value = a;
    azOut.textContent = S.compass[Math.round(a / 22.5) % 16] + ' ' + num(a) + '°';
    if (active() !== tilt) tilt.value = Math.round(view.tilt);
    tiltOut.textContent = '+' + num(Math.round(view.tilt)) + '°';
    refresh(true);
  }
  /** Say everything again, in the page's language as it is now. */
  function relabel() {
    S = skyStrings(); formats();
    for (const w of words) w();
    lastStatus = lastSay = '';
    sync();
  }
  localizeSky(sky);                                   // the canvas labels follow the language too
  const offs = [model.on('update', () => refresh(false)), model.on('change', sync), view.on('view', sync), view.on('option', sync), onSkyLang(relabel)];
  relabel();
  if (o.container) o.container.appendChild(root);
  return { element: root, refresh: sync, relabel, destroy() { for (const f of offs) f(); root.remove(); } };
}

/**
 * Planetarium mode: one button that hides whatever a host page lays over the sky (a heading,
 * contact buttons) so the sky can be looked at and dragged around, labels the planets and the
 * brightest stars, and brings everything back afterwards.
 *
 * The hidden elements keep their space, so the page does not jump; they are made inert, so they
 * cannot be tabbed to or read out while hidden. Escape, or the same button, restores them.
 *
 * @param {{model: object, view: object}} sky  what createSky() returned
 * @param {object} o
 * @param {Element} o.host  the element that holds the canvas and the overlay (gets data-sky-view="on")
 * @param {string|Element[]|NodeList} o.hide  what to hide: a selector inside host, or elements.
 *        The button itself (and the control bar, if you want it usable) must not be inside these.
 * @param {HTMLButtonElement} [o.button]  your own button; otherwise one is created and appended to host
 * @param {Element} [o.labelTarget]  element inside your button whose text should change (default: the button)
 * @param {string} [o.showLabel]  text when the overlay is visible (default "Planetarium mode", in the page's language)
 * @param {string} [o.hideLabel]  text when it is hidden (default "Exit planetarium", in the page's language)
 * @param {boolean|'free'} [o.drag]  dragging while open (default 'free': look around in every direction, like a 360 view)
 * @param {boolean} [o.labels]  show compass letters while open (default true)
 * @param {boolean} [o.names]  label planets and bright stars while open (default true)
 * @param {Function} [o.onChange]  called with true/false
 * @returns {{button: HTMLButtonElement, open: Function, close: Function, toggle: Function, isOpen: Function, destroy: Function}}
 */
export function createPlanetariumToggle(sky, o) {
  const view = sky.view, host = o.host;
  // a host that passes its own labels keeps them in step itself; ours follow the page language
  const label = (v) => (v ? o.hideLabel || skyStrings().planetariumExit : o.showLabel || skyStrings().planetarium);
  const made = !o.button;
  const button = o.button || el('button', { type: 'button', class: 'skyv' });
  const target = o.labelTarget || button;
  const items = () => (typeof o.hide === 'string' ? Array.from(host.querySelectorAll(o.hide)) : Array.from(o.hide || []));
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const before = { drag: view.drag, labels: view.labels, names: view.names, tilt: view.tilt };
  let on = false, timer = 0;

  function set(v) {
    v = !!v;
    if (v === on) return;
    on = v;
    clearTimeout(timer);
    const list = items();
    for (const n of list) {
      if (!still) n.style.transition = 'opacity .35s ease';
      n.style.opacity = v ? '0' : '';
      n.inert = v;
      if (v) n.setAttribute('aria-hidden', 'true'); else { n.removeAttribute('aria-hidden'); n.style.visibility = ''; }
    }
    // visibility goes last on the way out so the fade can be seen, and so clicks reach the sky
    if (v) timer = setTimeout(() => { for (const n of list) n.style.visibility = 'hidden'; }, still ? 0 : 360);
    if (v) {
      before.drag = view.drag; before.labels = view.labels; before.names = view.names; before.tilt = view.tilt;
      view.setDrag(o.drag === undefined ? 'free' : o.drag).setLabels(o.labels !== false).setNames(o.names !== false); host.setAttribute('data-sky-view', 'on');
    } else { view.setDrag(before.drag).setLabels(before.labels).setNames(before.names).setTilt(before.tilt); host.removeAttribute('data-sky-view'); }
    button.setAttribute('aria-pressed', String(v));
    target.textContent = label(v);
    if (o.onChange) o.onChange(v);
  }
  const click = () => set(!on);
  const key = (e) => { if (on && e.key === 'Escape') { set(false); button.focus(); } };
  button.addEventListener('click', click);
  document.addEventListener('keydown', key);
  button.setAttribute('aria-pressed', 'false');
  target.textContent = label(false);
  localizeSky(sky);                                   // compass points and names on the canvas, in the page's language
  const offLang = onSkyLang(() => { if (!o.showLabel && !o.hideLabel) target.textContent = label(on); });
  if (made) host.appendChild(button);
  return {
    button, open: () => set(true), close: () => set(false), toggle: click, isOpen: () => on,
    destroy() { set(false); offLang(); button.removeEventListener('click', click); document.removeEventListener('keydown', key); if (made) button.remove(); }
  };
}

if (typeof window !== 'undefined') { window.createSkyControls = createSkyControls; window.createPlanetariumToggle = createPlanetariumToggle; }
