/* Camp 1, the Trailhead: reason. A route to find, a night to pick, a leaking canister, a
 * decision on the trail and a question at the fire. */
import { h, rng } from '../engine.js?v=47c94598';
import { decisionStage, fireStage } from './common.js?v=47c94598';
import { t, lang } from '../words.js?v=47c94598';
import { createSky, SkyModel, PLANET_NAMES } from '/assets/sky/sky.js';

/* ---------- 1: the route ---------- */
const GW = 14, GH = 10, CELL = 60;
function buildRoute(seed) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = rng(seed + attempt * 7919), lw = 6, lh = 5, lat = [];
    for (let i = 0; i < lw * lh; i++) lat.push(r());
    const px = 8 + Math.floor(r() * 5), py = Math.floor(r() * 4);                  // roughly where the summit is
    const g = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const fx = x / (GW - 1) * (lw - 1), fy = y / (GH - 1) * (lh - 1), ix = Math.min(lw - 2, Math.floor(fx)), iy = Math.min(lh - 2, Math.floor(fy)), tx = fx - ix, ty = fy - iy;
      const a = lat[iy * lw + ix], b = lat[iy * lw + ix + 1], c = lat[(iy + 1) * lw + ix], d = lat[(iy + 1) * lw + ix + 1];
      const n = a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * ty;
      const peak = Math.max(0, 1 - Math.hypot(x - px, y - py) / 7);
      g[y * GW + x] = Math.max(0, Math.min(6, Math.round(n * 3.2 + peak * 3.6 - 0.4)));
    }
    const start = (GH - 1) * GW; g[start] = Math.min(g[start], 1);
    let summit = 0; for (let i = 1; i < g.length; i++) if (g[i] > g[summit]) summit = i;
    if (g[summit] < 5) continue;
    const towers = [];
    for (let t = 0; t < 60 && towers.length < 3; t++) {
      const i = Math.floor(r() * g.length), x = i % GW, y = Math.floor(i / GW);
      if (i === start || i === summit || towers.includes(i)) continue;
      if (towers.some((o) => Math.abs(o % GW - x) + Math.abs(Math.floor(o / GW) - y) < 5)) continue;
      if (Math.abs(x) + Math.abs(y - (GH - 1)) < 4 || Math.abs(x - summit % GW) + Math.abs(y - Math.floor(summit / GW)) < 3) continue;
      towers.push(i);
    }
    if (towers.length < 3) continue;
    // shortest legal walk that touches all three towers and ends on the summit
    const dist = new Int16Array(g.length * 8).fill(-1), queue = [start * 8]; dist[start * 8] = 0; let best = -1;
    for (let q = 0; q < queue.length; q++) {
      const s = queue[q], cell = s >> 3, mask = s & 7;
      if (cell === summit && mask === 7) { best = dist[s]; break; }
      const x = cell % GW, y = (cell - x) / GW;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx, up = g[n] - g[cell]; if (up > 1 || up < -2) continue;
        const ti = towers.indexOf(n), ns = n * 8 + (ti >= 0 ? mask | (1 << ti) : mask);
        if (dist[ns] < 0) { dist[ns] = dist[s] + 1; queue.push(ns); }
      }
    }
    if (best < 26 || best > 70) continue;
    return { h: g, start, summit, towers, best, budget: Math.ceil(best * 1.3) + 2 };
  }
  throw new Error('no route could be laid out');
}

function route(el, ctx) {
  const R = buildRoute(ctx.seed); R.path = [R.start]; R.seen = 0;
  const p = ctx.data; p.resets = p.resets || 0; p.undos = p.undos || 0;
  const cv = h('canvas', { id: 'route', width: GW * CELL, height: GH * CELL, tabindex: 0, 'aria-label': t('The map: a grid of 14 by 10 squares, each with a height from 0 to 6. Use the arrow keys to walk; where you are is read out after each step.') });
  const left = h('b'), towers = h('b'), level = h('b');
  const pad = h('div', { class: 'pad', role: 'group', 'aria-label': t('Walk one square') }, [['↑', 0, -1, t('Walk up')], ['←', -1, 0, t('Walk left')], ['→', 1, 0, t('Walk right')], ['↓', 0, 1, t('Walk down')]].map(([arrow, dx, dy, name]) => h('button', { type: 'button', text: arrow, 'aria-label': name, onclick: () => step(dx, dy) })));
  const box = h('div', { class: 'routebox' }, cv), where = h('p', { class: 'sr', 'aria-live': 'polite' });
  el.append(
    h('p', { html: t('Walk from the <b>trailhead</b> to the <b>summit flag</b>. Check in at all three <b>towers</b> on the way, in any order.') }),
    h('ul', { class: 'rules' }, h('li', { text: t('One square at a time: up, down, left or right.') }), h('li', { html: t('You can climb <b>one level</b> in a step and come down <b>two</b>. Higher ground is lighter.') }), h('li', { html: t('You have daylight for <b>{n}</b> steps.', { n: R.budget }) })),
    h('p', { class: 'hintline routebox__tip', text: t('Slide the map sideways to see all of it. Tap a square next to you, or use the arrows.') }),
    h('div', { class: 'board' }, box, where, h('div', { class: 'board__side' },
      h('p', { class: 'meter' }, h('span', { text: t('Daylight left') }), left), h('p', { class: 'meter' }, h('span', { text: t('Towers') }), towers), h('p', { class: 'meter' }, h('span', { text: t('Standing on level') }), level), pad,
      h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Step back'), onclick: () => { if (!R.won && R.path.length > 1) { R.path.pop(); R.seen = seenFor(R.path); p.undos++; ctx.say(''); paint(); } } }),
      h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Start over'), onclick: () => { if (!R.won && R.path.length > 1) { R.path = [R.start]; R.seen = 0; p.resets++; ctx.say(''); paint(); } } }))));
  const seenFor = (path) => { let m = 0; for (const c of path) { const k = R.towers.indexOf(c); if (k >= 0) m |= 1 << k; } return m; };
  const mid = (i) => [i % GW * CELL + CELL / 2, Math.floor(i / GW) * CELL + CELL / 2];
  function paint() {
    const g = cv.getContext('2d'), at = R.path[R.path.length - 1];
    g.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < R.h.length; i++) {
      const x = i % GW, y = (i - x) / GW, t = R.h[i] / 6;
      g.fillStyle = `rgb(${Math.round(12 + t * 120)}, ${Math.round(24 + t * 170)}, ${Math.round(52 + t * 170)})`;
      g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      g.fillStyle = t > 0.45 ? 'rgba(5,8,15,.85)' : 'rgba(255,255,255,.82)'; g.font = '700 17px ui-monospace, Menlo, monospace'; g.fillText(R.h[i], x * CELL + 5, y * CELL + 18);
    }
    g.strokeStyle = 'rgba(95,211,176,.9)'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
    R.path.forEach((c, k) => { const [x, y] = mid(c); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    let [sx, sy] = mid(R.start); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(sx - 20, sy - 20, 40, 40);
    [sx, sy] = mid(R.summit); g.strokeStyle = '#05080f'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx - 8, sy + 18); g.lineTo(sx - 8, sy - 18); g.stroke(); g.fillStyle = '#e2483f'; g.beginPath(); g.moveTo(sx - 8, sy - 18); g.lineTo(sx + 16, sy - 10); g.lineTo(sx - 8, sy - 2); g.fill();
    R.towers.forEach((t, k) => {
      const [x, y] = mid(t), seen = R.seen & (1 << k);
      g.strokeStyle = seen ? '#5fd3b0' : '#fff'; g.fillStyle = g.strokeStyle; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x - 9, y + 18); g.moveTo(x, y - 14); g.lineTo(x + 9, y + 18); g.moveTo(x - 5, y + 4); g.lineTo(x + 5, y + 4); g.stroke();
      g.beginPath(); g.arc(x, y - 14, 4, 0, 6.3); g.fill();
      if (!seen) { g.lineWidth = 2; g.beginPath(); g.arc(x, y - 14, 11, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(x, y - 14, 11, Math.PI - 0.8, Math.PI + 0.8); g.stroke(); }
    });
    const [hx, hy] = mid(at); g.fillStyle = '#fff'; g.beginPath(); g.arc(hx, hy, 11, 0, 6.3); g.fill(); g.fillStyle = '#05080f'; g.beginPath(); g.arc(hx, hy, 5, 0, 6.3); g.fill();
    left.textContent = R.budget - (R.path.length - 1);
    towers.textContent = [0, 1, 2].filter((k) => R.seen & (1 << k)).length + ' / 3';
    level.textContent = R.h[at];
    // keep the walker in view where the map is wider than the screen, and say where they are for anyone who cannot see it
    if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: hx / cv.width * box.scrollWidth - box.clientWidth / 2, behavior: ctx.reduced ? 'auto' : 'smooth' });
    // each direction is a whole phrase of its own, so it can be put into another language
    const look = [
      (n, tower, flag) => tower ? t('up is level {n} with a tower', { n }) : flag ? t('up is level {n} with the flag', { n }) : t('up is level {n}', { n }),
      (n, tower, flag) => tower ? t('down is level {n} with a tower', { n }) : flag ? t('down is level {n} with the flag', { n }) : t('down is level {n}', { n }),
      (n, tower, flag) => tower ? t('left is level {n} with a tower', { n }) : flag ? t('left is level {n} with the flag', { n }) : t('left is level {n}', { n }),
      (n, tower, flag) => tower ? t('right is level {n} with a tower', { n }) : flag ? t('right is level {n} with the flag', { n }) : t('right is level {n}', { n }),
    ];
    const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy], k) => { const x = at % GW + dx, y = Math.floor(at / GW) + dy; return x < 0 || y < 0 || x >= GW || y >= GH ? null : look[k](R.h[y * GW + x], R.towers.includes(y * GW + x), y * GW + x === R.summit); }).filter(Boolean).join(', ');
    where.textContent = t('Column {col}, row {row}, level {level}. Around you: {near}.', { col: at % GW + 1, row: Math.floor(at / GW) + 1, level: R.h[at], near });
  }
  function step(dx, dy) {
    if (R.won) return;
    const at = R.path[R.path.length - 1], x = at % GW + dx, y = Math.floor(at / GW) + dy;
    if (x < 0 || y < 0 || x >= GW || y >= GH) return ctx.say(t('That is off the edge of the map.'));
    if (R.path.length - 1 >= R.budget) return ctx.say(t('It is dark. Step back, or start over.'));
    const to = y * GW + x, up = R.h[to] - R.h[at];
    if (up > 1) return ctx.say(t('Too steep: that is {up} levels up, and you can manage one.', { up }));
    if (up < -2) return ctx.say(t('That is a {down}-level drop. Two is the most you can come down.', { down: -up }));
    R.path.push(to); R.seen = seenFor(R.path); ctx.say('');
    if (to === R.summit) {
      if (R.seen === 7) {
        R.won = true; const moves = R.path.length - 1;
        p.moves = moves; p.best = R.best; p.path = R.path.slice();
        ctx.say(moves === R.best ? t('The flag, in {moves} steps: nobody could do it in fewer.', { moves }) : t('The flag, in {moves} steps. The shortest way is {best}.', { moves, best: R.best }), true);
        paint(); return ctx.done(2200);
      }
      ctx.say(t('The flag is here, but not every tower has seen you yet.'));
    } else if (R.path.length - 1 >= R.budget) ctx.say(t('That was the last of the light.'));
    paint();
  }
  cv.addEventListener('keydown', (e) => { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }[e.key]; if (m) { e.preventDefault(); step(m[0], m[1]); } });
  cv.addEventListener('click', (e) => {
    const b = cv.getBoundingClientRect(), x = Math.floor((e.clientX - b.left) / b.width * GW), y = Math.floor((e.clientY - b.top) / b.height * GH);
    const at = R.path[R.path.length - 1], dx = x - at % GW, dy = y - Math.floor(at / GW);
    if (Math.abs(dx) + Math.abs(dy) === 1) step(dx, dy); else if (dx || dy) ctx.say(t('One square at a time: pick a square next to you.'));
  });
  paint();
}

/* ---------- 2: the night ---------- */
function night(el, ctx) {
  const r = ctx.rng('night'), planet = [3, 4][Math.floor(r() * 2)], lat = [36, 44, 52, -34, 20][Math.floor(r() * 5)], lon = -119, within = 7;
  let year = 2027 + Math.floor(r() * 3), answer = 0, when, tries = 0;
  const sep = (m) => { const a = m.moon.vec, e = m.planets.enu, i = planet * 3; return Math.acos(Math.max(-1, Math.min(1, a[0] * e[i] + a[1] * e[i + 1] + a[2] * e[i + 2]))) * 180 / Math.PI; };
  const ok = (m) => sep(m) <= within && m.moon.alt > 5 && m.planets.alt[planet] > 5 && m.sun.alt < -6;
  // make sure such a night exists in that year (and remember one, for Luma's last hint)
  const probe = new SkyModel({ lat, lon, time: 0, rate: 0, lowData: true, filler: false });
  for (let tryYear = 0; tryYear < 4 && !answer; tryYear++) {
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3600e3) { probe.setTime(t); probe.update(true); if (ok(probe)) { answer = t; break; } }
    if (!answer) year++;
  }
  const name = PLANET_NAMES[planet], shown = planet === 3 ? t('Jupiter') : t('Saturn');      // name is kept with the run; shown is what the hiker reads
  ctx.data.tries = ctx.data.tries || 0; tries = ctx.data.tries;
  ctx.setHints([t('The Moon goes all the way round the sky about once a month, so it passes every planet about once a month.'), t('Step a day at a time and watch the number shrink. When it starts growing again, go back and move by hours. If they are close but under the ground, try the hours before dawn.'), () => answer ? t('I would look in {month}.', { month: new Date(answer).toLocaleDateString(lang, { month: 'long' }) }) : t('Step a day at a time and watch the number.')]);
  const cv = h('canvas', { id: 'sky', 'aria-label': t('The night sky for the chosen date and time. Drag to look around.') }), read = h('p', { class: 'skybox__read', 'aria-live': 'polite' });
  const date = h('input', { type: 'date' }), time = h('input', { type: 'range', min: 0, max: 1439, step: 5 }), out = h('b');
  el.append(
    h('p', { html: lat < 0 ? t('You want to photograph the <b>Moon close to {planet}</b> from a camp at <b>{lat}° south</b>. Find a night in <b>{year}</b> when they stand within <b>{within}°</b> of each other, both well above the horizon, in a properly dark sky.', { planet: shown, lat: Math.abs(lat), year, within })
      : t('You want to photograph the <b>Moon close to {planet}</b> from a camp at <b>{lat}° north</b>. Find a night in <b>{year}</b> when they stand within <b>{within}°</b> of each other, both well above the horizon, in a properly dark sky.', { planet: shown, lat: Math.abs(lat), year, within }) }),
    h('p', { class: 'hintline', text: t('The almanac has fallen open a little before a good night. Some pairs are only up together in the small hours, so try different times as well as different dates.') }),
    h('div', { class: 'skybox' }, cv, read),
    h('div', { class: 'row wrap' }, h('label', null, h('span', { text: t('Date') }), date), h('label', { class: 'grow' }, h('span', null, t('Time') + ' ', out), time),
      h('div', { class: 'nudge', role: 'group', 'aria-label': t('Move through time') }, [[t('−1 day'), -1440], [t('−1 h'), -60], [t('+1 h'), 60], [t('+1 day'), 1440]].map(([label, n]) => h('button', { type: 'button', text: label, onclick: () => set(new Date(when.getTime() + n * 60000)) })))),
    h('div', { class: 'row' }, h('button', { class: 'wm-btn', type: 'button', text: t('This is the night'), onclick: go }), h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Turn to face the Moon'), onclick: () => { const m = sky.model; if (sky.view.setAzimuth) sky.view.setAzimuth(m.moon.az); if (sky.view.setTilt) sky.view.setTilt(Math.max(0, Math.min(80, m.moon.alt))); } })));
  // open the almanac one to three weeks before a night that works, so nobody has to page through half a year
  const start = new Date(Math.max(new Date(year, 0, 1, 21, 0).getTime(), answer ? new Date(answer).setHours(21, 0, 0, 0) - (8 + Math.floor(r() * 12)) * 864e5 : 0));
  const sky = createSky(cv, { lat, lon, time: start.getTime(), rate: 0, drag: true, labels: true, names: true });
  sky.model.setRate(0);
  const off = sky.model.on('update', readout);
  ctx.onLeave(() => { off(); if (sky.view.destroy) sky.view.destroy(); });
  function readout() {
    const m = sky.model, moonUp = m.moon.alt, planetUp = m.planets.alt[planet];
    read.textContent = [t('Moon to {planet}: {sep}°', { planet: shown, sep: sep(m).toFixed(1) }),
      moonUp > 0 ? t('Moon {n}° up', { n: Math.round(moonUp) }) : t('Moon below the horizon'),
      planetUp > 0 ? t('{planet} {n}° up', { planet: shown, n: Math.round(planetUp) }) : t('{planet} below the horizon', { planet: shown }),
      m.sun.alt < -6 ? t('dark') : m.sun.alt < 0 ? t('twilight') : t('daylight')].join('  ·  ');
  }
  function set(d) {
    when = d; sky.model.setTime(d.getTime()); sky.model.update(true);
    const p2 = (n) => String(n).padStart(2, '0');
    date.value = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; time.value = d.getHours() * 60 + d.getMinutes();
    out.textContent = d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }); readout();
  }
  date.addEventListener('change', () => { const [y, mo, d] = date.value.split('-').map(Number); if (y) set(new Date(y, mo - 1, d, when.getHours(), when.getMinutes())); });
  time.addEventListener('input', () => { const v = +time.value; set(new Date(when.getFullYear(), when.getMonth(), when.getDate(), Math.floor(v / 60), v % 60)); });
  function go() {
    const m = sky.model; tries++; ctx.data.tries = tries;
    if (when.getFullYear() !== year) ctx.say(t('That is not in {year}.', { year }));
    else if (m.sun.alt >= -6) ctx.say(t('The sky is not dark enough yet to photograph them.'));
    else if (m.moon.alt <= 5 || m.planets.alt[planet] <= 5) ctx.say(t('One of them is too low: you need the Moon and {planet} both clear of the horizon.', { planet: shown }));
    else if (sep(m) > within) ctx.say(t('They are {sep}° apart tonight. Closer than {within}° is what you are after.', { sep: sep(m).toFixed(1), within }));
    else {
      ctx.say(t('That is the night: {sep}° apart, on {date}.', { sep: sep(m).toFixed(1), date: when.toLocaleDateString(lang, { month: 'long', day: 'numeric', year: 'numeric' }) }), true);
      Object.assign(ctx.data, { when: when.toISOString(), sep: +sep(m).toFixed(2), planet: name, lat, year }); return ctx.done(2000);
    }
    ctx.save();
  }
  set(start);
}

/* ---------- 3: the canister ----------
 * The crate does not decide in advance which canister leaked. After each weighing it keeps
 * whichever outcome leaves the most canisters still possible, so a lucky guess never works:
 * only a plan that narrows nine down to one in two weighings finds it. */
function canister(el, ctx) {
  const p = ctx.data; p.retries = p.retries || 0;
  const beam = h('div', { class: 'scale__beam' }), panL = h('div', { class: 'pan', id: 'pan-l' }, h('span', { class: 'pan__n', text: t('left') })), panR = h('div', { class: 'pan', id: 'pan-r' }, h('span', { class: 'pan__n', text: t('right') }));
  beam.append(panL, panR);
  const cans = h('div', { class: 'cans', role: 'group', 'aria-label': t('The nine canisters') }), weighs = h('span'), pick = h('p', { hidden: true, html: t('<b>Which one leaked?</b> Tap it.') });
  const weighBtn = h('button', { class: 'wm-btn', type: 'button', onclick: weigh });
  el.append(
    h('p', { html: t('Nine fuel canisters, and one has leaked: it is a little lighter than the rest. There is an old balance at the trailhead and time to use it <b>twice</b>. Find the light one.') }),
    h('p', { class: 'hintline', text: t('Tap a canister to put it on the left pan, again for the right, again to take it off. Canisters you leave on the ground count too.') }),
    h('div', { class: 'scale' }, beam, h('div', { class: 'scale__post' })), cans,
    h('div', { class: 'row' }, weighBtn, h('button', { class: 'wm-btn wm-btn--line', type: 'button', text: t('Clear the pans'), onclick: () => { if (!P.picking) { P.on.fill(''); tilt(0); paint(); } } })), pick);
  let P;
  const tilt = (dir) => { beam.style.transform = `rotate(${dir * 7}deg)`; panL.style.transform = panR.style.transform = `rotate(${-dir * 7}deg)`; };
  function fresh(again) {
    P = { on: Array(9).fill(''), left: 2, maybe: [0, 1, 2, 3, 4, 5, 6, 7, 8], log: [], picking: false };
    cans.textContent = '';
    for (let i = 0; i < 9; i++) cans.appendChild(h('button', { type: 'button', class: 'can', 'data-i': i, html: `${i + 1}<small>${t('fuel')}</small><i class="sr"></i>`, onclick: () => tap(i) }));
    pick.hidden = true; cans.classList.remove('is-picking'); weighBtn.disabled = false; tilt(0); paint();
    if (again) cans.querySelector('.can').focus();
  }
  function paint() {
    for (const [side, pan] of [['l', panL], ['r', panR]]) { pan.querySelectorAll('i').forEach((n) => n.remove()); P.on.forEach((s, i) => { if (s === side) pan.appendChild(h('i', { text: i + 1 })); }); }
    cans.querySelectorAll('.can').forEach((b) => { const s = P.on[b.dataset.i]; b.dataset.on = s; const n = +b.dataset.i + 1; b.querySelector('.sr').textContent = s === 'l' ? t('on the left pan') : s === 'r' ? t('on the right pan') : t('on the ground'); });
    weighBtn.textContent = t('Weigh ({n} left)', { n: P.left });
  }
  function tap(i) { if (P.picking) return accuse(i); P.on[i] = P.on[i] === '' ? 'l' : P.on[i] === 'l' ? 'r' : ''; tilt(0); paint(); }
  function weigh() {
    const L = [], Rr = []; P.on.forEach((s, i) => { if (s === 'l') L.push(i); else if (s === 'r') Rr.push(i); });
    if (!L.length && !Rr.length) return ctx.say(t('Put something on the balance first.'));
    let dir, text;
    if (L.length !== Rr.length) { tilt(L.length > Rr.length ? -1 : 1); return ctx.say(t('{l} against {r}: of course the fuller pan goes down. That tells you nothing, so it does not count as a weighing. Put the same number on each side.', { l: L.length, r: Rr.length })); }
    {
      const inL = P.maybe.filter((c) => L.includes(c)), inR = P.maybe.filter((c) => Rr.includes(c)), off = P.maybe.filter((c) => !L.includes(c) && !Rr.includes(c));
      const best = [[off, 0], [inL, 1], [inR, -1]].sort((a, b) => b[0].length - a[0].length)[0];
      P.maybe = best[0].length ? best[0] : P.maybe; dir = best[0].length ? best[1] : 0;
      text = dir === 0 ? t('The pans sit level.') : dir === 1 ? t('The left pan rises: it is lighter.') : t('The right pan rises: it is lighter.');
    }
    tilt(dir); P.left--; P.log.push({ l: L.map((x) => x + 1), r: Rr.map((x) => x + 1), result: dir === 0 ? 'level' : dir === 1 ? 'left light' : 'right light' });
    const last = P.left <= 0;
    if (last) { P.picking = true; pick.hidden = false; cans.classList.add('is-picking'); text += ' ' + t('That was the second weighing. Which one leaked?'); }
    ctx.say(text); paint();
    if (last) { cans.querySelector('.can').focus(); weighBtn.disabled = true; }
  }
  function accuse(i) {
    if (P.maybe.length === 1 && P.maybe[0] === i) {
      p.weighings = P.log; ctx.say(t('Canister {n}: light as a feather. You found it in two.', { n: i + 1 }), true);
      cans.classList.remove('is-picking'); return ctx.done(2000);
    }
    const other = P.maybe.find((c) => c !== i);
    p.retries++; (p.failed = p.failed || []).push(P.log); ctx.save();
    ctx.say(t('Not that one: it was canister {n}. {left} of them were still possible after your weighings. A fresh crate is on the bench.', { n: other + 1, left: P.maybe.length }));
    const timer = setTimeout(() => fresh(true), 2600); ctx.onLeave(() => clearTimeout(timer));
  }
  fresh();
}

/* ---------- the decision, and the fire ---------- */
const decision = decisionStage({
  name: 'choice',
  lead: [t("The canister cost you half a day. There are four of you. Two ways reach tonight's camp:")],
  points: [t('<b>The ridge.</b> Two hours. Exposed, with a drop on one side. One of the group has said, quietly, that heights frighten them.'), t('<b>The valley.</b> Five hours. Easy ground, but you would arrive well after dark, and the forecast is for rain tonight.')],
  close: t('Everyone is looking at you. There is no right call here; there is yours.'),
  options: [['ridge', t('<b>Take the ridge</b> together, slowly.')], ['valley', t('<b>Take the valley</b> and walk into the dark.')], ['split', t('<b>Split up</b>: two by the ridge to set up camp, two by the valley.')], ['stay', t('<b>Stop here tonight</b> and lose the day.')]],
  ask: t('What do you say to the group?'),
});
const fire = fireStage({ lead: t('{guide} has curled up by the fire, one ear still listening. Someone asks:'), question: t('Tell us about a problem you worked out that you are still a little proud of. What made it hard, and what did you try first that did not work?') });

export default {
  id: 'trailhead', name: t('The Trailhead'), sub: t('Reason'),
  intro: t('Three things to work out before you leave, a decision to make, and a fire to sit at.'),
  stages: [
    { id: 'route', label: t('The route'), title: t('1. Find a route before dark'), mount: route, scene: 'trail', time: 'day',
      hints: [t('Sniff around first: count the levels between you and each tower before you take a step.'), t('You may walk over the same square twice. Coming down is easier than going up, so a long way round on a gentle slope beats a short wall.'), t('Work backwards from the flag: which squares can reach it at all?')] },
    { id: 'sky', label: t('The night'), title: t('2. Pick the night'), mount: night, scene: 'cairn', time: 'night', hints: [t('Watch the number.')] },
    { id: 'pack', label: t('The canister'), title: t('3. The leaking canister'), mount: canister, scene: 'bench', time: 'dusk',
      hints: [t('The balance does not care how many canisters sit on each pan, as long as you are fair to both sides.'), t('A weighing can end three ways, not two. Make each ending tell you something.'), t('Three, three, and three left on the ground.')] },
    { id: 'choice', label: t('A decision'), title: t('A decision on the trail'), mount: decision, scene: 'fork', time: 'dusk', hints: [t('Nobody is marking this one. Say what you would really say.')] },
    { id: 'fire', label: t('The campfire'), title: t('The campfire'), cls: 'fire', mount: fire, hints: [t('It does not have to be about computers.')] },
  ],
  tally: (p) => [[t('Route'), p.route && p.route.moves ? t('{moves} steps (best {best})', { moves: p.route.moves, best: p.route.best }) : t('walked')], [t('Fresh starts'), p.route ? p.route.resets || 0 : 0], [t('Nights tried'), p.sky ? p.sky.tries || 1 : 1], [t('Crates used'), p.pack ? (p.pack.retries || 0) + 1 : 1]],
};
