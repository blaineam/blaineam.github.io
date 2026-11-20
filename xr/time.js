// wemiller.com /xr/ — the calendar: the time machine's date, the seasons, and who the dogs are.
//
// The same rules as the home page (assets/site.js: "time machine", "seasons", "the future"),
// read from the same data (/content/site.json → seasons, luma, future). No drawing happens here.
//
//   const cal = createCalendar(siteJson);
//   cal.parseWhen('christmas' | '2031-10-22' | '2031-10-22T21:30')  → { date, clock } | null
//   cal.seasonOn(date)        → { season, onDay } | null     (null in the founder era)
//   cal.dogsAt(date)          → { alive, gone, changed, lumaHere }
//   cal.isFounder(date), cal.NAMED

const p2 = (n) => ('0' + n).slice(-2);
export const ymd = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

function easterOf(yr) {          // Gregorian computus
  const a = yr % 19, b = Math.floor(yr / 100), c = yr % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(yr, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1, 12);
}
function memorialOf(yr) { const d = new Date(yr, 4, 31, 12); d.setDate(31 - ((d.getDay() + 6) % 7)); return d; }   // last Monday of May
const dayNo = (d) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);
const plus = (d, years) => { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + Math.round(years * 12)); return x; };

// The days the time machine offers by name, in the order the home page lists them.
export const NAMED = ['newyear', 'easter', 'memorial', 'birthday', 'july4', 'summer', 'fall', 'halloween', 'luma', 'veterans', 'christmas'];

export function createCalendar(cfg) {
  cfg = cfg || {};
  const SEASONS = Array.isArray(cfg.seasons) ? cfg.seasons : [];
  const lumaBorn = (cfg.luma && cfg.luma.born) || '';
  const fut = cfg.future || {};

  // A named day means its most recent occurrence, so a celebration can be replayed afterwards.
  function eventDate(id, today) {
    const s = SEASONS.find((x) => x.id === id), y = today.getFullYear();
    if (id === 'luma' && !lumaBorn) return null;
    if (id !== 'luma' && (!s || s.date)) return s && s.date ? new Date(s.date + 'T12:00:00') : null;
    let d = null;
    for (let k = 0; k < 2; k++) {
      if (id === 'luma') d = new Date(y - k, +lumaBorn.slice(5, 7) - 1, +lumaBorn.slice(8, 10), 12);
      else d = s.rule === 'easter' ? easterOf(y - k) : s.rule === 'memorial' ? memorialOf(y - k) : new Date(y - k, +(s.day || s.from).slice(0, 2) - 1, +(s.day || s.from).slice(3, 5), 12);
      if (d <= today) return d;
    }
    return d;
  }
  function parseWhen(w) {
    if (!w) return null;
    const m = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d))?$/.exec(w);
    if (m) {
      const date = new Date(m[1] + 'T' + (m[2] || '12:00') + ':00');
      return isNaN(date.getTime()) ? null : { date, clock: m[2] || '' };
    }
    const date = eventDate(w === 'luma-birthday' ? 'luma' : w, new Date());
    return date ? { date, clock: '' } : null;
  }
  const isFounder = (date) => !!fut.founderFrom && date >= new Date(fut.founderFrom + 'T00:00:00');

  function seasonOn(now) {
    if (isFounder(now)) return null;                 // nothing celebratory once the site is carried on by others
    const y = now.getFullYear(), today = dayNo(now), md = p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    const active = (s) => {
      if (s.date) return s.date === ymd(now);
      if (s.rule) { const base = dayNo(s.rule === 'easter' ? easterOf(y) : memorialOf(y)); return today >= base - (s.before || 0) && today <= base + (s.after || 0); }
      return s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to;      // a range may wrap the new year
    };
    // Luma's birthday is its own party on the home page; here it is one more day on the calendar.
    if (lumaBorn && md === lumaBorn.slice(5)) return { season: { id: 'luma', effect: 'confetti', greet: true }, onDay: true, age: y - +lumaBorn.slice(0, 4) };
    const season = SEASONS.find(active);
    if (!season) return null;
    const onDay = season.date ? true : season.rule ? today === dayNo(season.rule === 'easter' ? easterOf(y) : memorialOf(y)) : md === (season.day || season.from) || (!season.day && season.from === season.to);
    return { season, onDay };
  }

  // The dogs of a year. Luma is real; after her come stand-ins (names from future.dogs.names) until real ones are chosen.
  function dogsAt(when) {
    const real = new Date(), d = fut.dogs || {}, names = d.names || [], dogs = [];
    let list = d.real && d.real.length ? d.real : lumaBorn ? [{ name: 'Luma', born: lumaBorn, passed: (cfg.luma && cfg.luma.passed) || '' }] : [], last = null, n = 0;
    for (const r of list) {
      const born = new Date(r.born + 'T12:00:00');
      last = { name: r.name, born, end: r.passed ? new Date(r.passed + 'T12:00:00') : plus(born, d.lifespan || 12), real: true };
      dogs.push(last);
    }
    if (last && names.length && when > real) {
      let next = plus(last.born, d.adoptAt || 6);
      const soon = plus(real, 1);
      if (next < soon) next = soon;                            // a stand-in never arrives before next year
      while (next <= when && n < 400) {
        const round = Math.floor(n / names.length);
        dogs.push({ name: names[n % names.length] + (round ? ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(round, 9) - 1] : ''), born: next, end: plus(next, d.lifespan || 12) });
        next = plus(next, d.adoptAt || 6); n++;
      }
    }
    dogs.forEach((x, k) => { x.k = k; });
    const alive = dogs.filter((x) => x.born <= when && when < x.end), gone = dogs.filter((x) => x.end <= when);
    return { alive, gone, changed: gone.length > 0 || alive.length !== 1 || !alive[0].real, lumaHere: alive.some((x) => x.real && x.name === 'Luma') };
  }

  // The years of unwritten work shown when travelling forward: the first years after today, the
  // stretch that was skipped, and the year arrived in (newest first, like the home page).
  function futureYears(when) {
    const now = new Date().getFullYear(), to = when.getFullYear(), list = [];
    if (to <= now) return list;
    for (let y = now + 1; y <= Math.min(now + 2, to - 1); y++) list.push(y);
    const skipped = to - (list.length ? list[list.length - 1] : now) > 1;
    const out = [{ year: to, count: 1 + ((to * 7) % 3) }];
    if (skipped) out.push({ gap: true, from: (list.length ? list[list.length - 1] : now) + 1, to: to - 1 });
    for (let i = list.length - 1; i >= 0; i--) out.push({ year: list[i], count: 1 + ((list[i] * 7) % 3) });
    return out;
  }

  return { parseWhen, eventDate, seasonOn, dogsAt, isFounder, futureYears, founderFrom: fut.founderFrom || '', lumaBorn };
}

const GLYPHS = '▚▞▙▟▛▜░▒▓█▄▀/\\<>_#=+';
export function scramble(n) { let s = ''; for (let i = 0; i < n; i++) s += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)); return s; }
