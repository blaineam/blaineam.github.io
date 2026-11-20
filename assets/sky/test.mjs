/* Checks for the astronomy in sky.js. Run: node assets/sky/test.mjs
 * Reference values are from Meeus, "Astronomical Algorithms" (worked examples), published almanac
 * times for equinoxes, solstices and moon phases, and well-known star separations. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sky from './sky.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = Sky.parseCatalog(JSON.parse(readFileSync(join(here, 'stars.json'), 'utf8')));
const D2R = Math.PI / 180;
let pass = 0, fail = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${(+got).toFixed(3)} (want ${want} ± ${tol})`);
}
function yes(label, cond, note) { cond ? pass++ : fail++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${note ? ': ' + note : ''}`); }
const utc = (s) => Date.parse(s + 'Z');
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

console.log('\n# time');
near('JD of 2000-01-01 12:00 UT', Sky.julianDay(utc('2000-01-01T12:00:00')), 2451545.0, 1e-6);
near('GMST at J2000.0 (18h41m50.5s)', Sky.gmstDeg(utc('2000-01-01T12:00:00')), 280.4606, 0.001);
near('GMST 1987-04-10 0h UT (Meeus 12.a: 13h10m46.37s)', Sky.gmstDeg(utc('1987-04-10T00:00:00')), 197.693195, 0.001);
near('GMST 1987-04-10 19:21 UT (Meeus 12.b)', Sky.gmstDeg(utc('1987-04-10T19:21:00')), 128.73787, 0.001);
near('LST adds east longitude', Sky.lstDeg(utc('2000-01-01T12:00:00'), -90), 190.4606, 0.001);

console.log('\n# sun');
let s = Sky.sunEquatorial(utc('1992-10-13T00:00:00'));
near('Sun RA 1992-10-13 (Meeus 25.a)', s.ra, 198.38, 0.03);
near('Sun Dec 1992-10-13 (Meeus 25.a)', s.dec, -7.785, 0.02);
near('Sun Dec at the 2024 March equinox (03:06 UT)', Sky.sunEquatorial(utc('2024-03-20T03:06:00')).dec, 0, 0.01);
near('Sun Dec at the 2024 June solstice', Sky.sunEquatorial(utc('2024-06-20T20:51:00')).dec, 23.44, 0.02);
near('Sun Dec at the 2025 December solstice', Sky.sunEquatorial(utc('2025-12-21T15:03:00')).dec, -23.44, 0.02);
near('Earth-Sun distance in early January (perihelion)', Sky.sunEquatorial(utc('2025-01-04T13:00:00')).distAU, 0.9833, 0.0005);

let m = new Sky.SkyModel({ lat: 51.4779, lon: 0, time: utc('2024-06-20T12:01:50'), catalog });
near('Greenwich solstice noon sun altitude (90 - lat + dec)', m.sun.alt, 61.96, 0.05);
near('...and it is due south', m.sun.az, 180, 0.5);
m.setTime(utc('2024-03-20T12:07:30')).setLocation(0, 0);
near('Equator, equinox, local noon: sun overhead', m.sun.alt, 90, 0.4);
m.setLocation(40.7, -74).setTime(utc('2024-06-21T04:00:00'));
yes('New York, local midnight in June: night or astronomical twilight', m.sun.alt < -12, 'alt ' + m.sun.alt.toFixed(1) + ', phase ' + m.sky.phase);
m.setLocation(69.65, 18.96).setTime(utc('2024-06-21T23:00:00'));
yes('Tromso midnight sun in June', m.sun.alt > 0 && m.sky.isDay, 'alt ' + m.sun.alt.toFixed(1));
m.setTime(utc('2024-12-21T11:00:00'));
yes('Tromso polar night at noon in December', m.sun.alt < 0 && !m.sky.isDay, 'alt ' + m.sun.alt.toFixed(1));
// sunrise/sunset: Greenwich 2024-03-20 sunrise 06:02, sunset 18:14 UT (almanac, +-2 min)
m.setLocation(51.4779, 0).setTime(utc('2024-03-20T06:02:00'));
near('Greenwich equinox sunrise 06:02 UT: centre at -0.83', m.sun.alt, -0.83, 0.4);
m.setTime(utc('2024-03-20T18:14:00'));
near('Greenwich equinox sunset 18:14 UT: centre at -0.83', m.sun.alt, -0.83, 0.4);

console.log('\n# moon');
let mo = Sky.moonEquatorial(utc('1992-04-12T00:00:00'));
near('Moon longitude 1992-04-12 (Meeus 47.a)', mo.lon, 133.167, 0.3);
near('Moon latitude (Meeus 47.a)', mo.lat, -3.229, 0.2);
near('Moon RA (Meeus 47.a)', mo.ra, 134.688, 0.3);
near('Moon Dec (Meeus 47.a)', mo.dec, 13.768, 0.3);
near('Moon distance km (Meeus 47.a)', mo.distKm, 368409.7, 1500);
m = new Sky.SkyModel({ lat: 36, lon: -100, catalog });
m.setTime(utc('2024-04-23T23:49:00'));
near('Full moon 2024-04-23 23:49 UT: illumination', m.moon.illumination, 1, 0.005);
yes('...named Full Moon', m.moon.phaseName === 'Full Moon', m.moon.phaseName);
m.setTime(utc('2024-04-15T19:13:00'));
near('First quarter 2024-04-15 19:13 UT: illumination', m.moon.illumination, 0.5, 0.01);
yes('...waxing, named First Quarter', m.moon.waxing && m.moon.phaseName === 'First Quarter', m.moon.phaseName);
m.setTime(utc('2024-05-01T11:27:00'));
near('Last quarter 2024-05-01 11:27 UT: illumination', m.moon.illumination, 0.5, 0.01);
yes('...waning', !m.moon.waxing && m.moon.phaseName === 'Last Quarter', m.moon.phaseName);
m.setTime(utc('2025-11-05T13:19:00'));
near('Full moon 2025-11-05 13:19 UT', m.moon.illumination, 1, 0.005);
// Total solar eclipse of 2024-04-08, mid-totality at Mazatlan about 18:09 UT: the moon must cover the sun
// for an observer there (this exercises the parallax correction), but not for one in London.
m.setLocation(23.24, -106.41).setTime(utc('2024-04-08T18:09:30'));
const topoSep = (mm) => Math.acos(mm.sun.vec[0] * mm.moon.vec[0] + mm.sun.vec[1] * mm.moon.vec[1] + mm.sun.vec[2] * mm.moon.vec[2]) / D2R;
near('2024-04-08 eclipse at Mazatlan: sun-moon separation', topoSep(m), 0, 0.45);
near('...new moon illumination', m.moon.illumination, 0, 0.002);
m.setLocation(-33.9, 151.2);
yes('...and the same instant from Sydney is not an eclipse', topoSep(m) > 0.8, topoSep(m).toFixed(2) + ' deg');
// lit limb points at the sun: evening crescent in the west, lit side down and to the right (toward the set sun)
m.setLocation(40, -75).setTime(utc('2024-04-11T00:30:00'));
yes('Evening crescent after new moon is up in the west', m.moon.alt > 5 && m.moon.az > 240 && m.moon.az < 300, `alt ${m.moon.alt.toFixed(1)} az ${m.moon.az.toFixed(1)}`);
yes('...lit limb faces down toward the sun', m.moon.limbAngle > 100 && m.moon.limbAngle < 260, 'limb ' + m.moon.limbAngle.toFixed(0));

console.log('\n# stars');
const starIdx = (name) => { const s = m.stars; for (const k in s.names) if (s.names[k] === name) return +k; throw new Error('no star ' + name); };
const altaz = (name) => { const i = starIdx(name) * 3, e = m.stars.enu; return { alt: Math.asin(e[i + 2]) / D2R, az: (Math.atan2(e[i], e[i + 1]) / D2R + 360) % 360 }; };
const sepStars = (a, b) => { const i = starIdx(a) * 3, j = starIdx(b) * 3, e = m.stars.eq; return Math.acos(e[i] * e[j] + e[i + 1] * e[j + 1] + e[i + 2] * e[j + 2]) / D2R; };
m = new Sky.SkyModel({ lat: 40, lon: -75, time: utc('2026-01-01T05:00:00'), catalog });
near('Catalog check: Dubhe-Merak (the Pointers)', sepStars('Dubhe', 'Merak'), 5.37, 0.1);
near('Catalog check: Betelgeuse-Rigel', sepStars('Betelgeuse', 'Rigel'), 18.6, 0.2);
near('Catalog check: Castor-Pollux', sepStars('Castor', 'Pollux'), 4.5, 0.1);
near('Catalog check: Acrux-Gacrux (long axis of the Cross)', sepStars('Acrux', 'Gacrux'), 6.0, 0.1);
near('Catalog check: Rigil Kentaurus-Hadar', sepStars('Rigil Kentaurus', 'Hadar'), 4.4, 0.15);
near('Catalog check: Vega-Altair', sepStars('Vega', 'Altair'), 34.2, 0.3);
near('Catalog check: Vega-Deneb', sepStars('Vega', 'Deneb'), 23.8, 0.3);
near('Catalog check: Altair-Deneb', sepStars('Altair', 'Deneb'), 38.0, 0.3);
near('Catalog check: Sirius-Procyon', sepStars('Sirius', 'Procyon'), 25.7, 0.3);
near('Catalog check: Arcturus-Spica', sepStars('Arcturus', 'Spica'), 32.8, 0.3);
near('Catalog check: Mizar-Alkaid', sepStars('Mizar', 'Alkaid'), 6.7, 0.15);
near('Catalog check: Alnitak-Mintaka (Orion\'s belt)', sepStars('Alnitak', 'Mintaka'), 2.74, 0.08);
near('Catalog check: Antares-Shaula', sepStars('Antares', 'Shaula'), 17.0, 0.5);
near('Catalog check: Aldebaran-Alcyone', sepStars('Aldebaran', 'Alcyone'), 13.6, 0.4);
let worst = 0, worstName = '';
for (const c of m.constellations) for (const p of c.paths) for (let k = 1; k < p.length; k++) {
  const e = m.stars.eq, i = p[k - 1] * 3, j = p[k] * 3, d = Math.acos(e[i] * e[j] + e[i + 1] * e[j + 1] + e[i + 2] * e[j + 2]) / D2R;
  if (d > worst) { worst = d; worstName = c.name; }
}
yes('No stick-figure segment is implausibly long', worst < 22, `longest ${worst.toFixed(1)} deg in ${worstName}`);
yes('All stars are unit vectors with sane magnitudes', (() => { const s = m.stars; for (let i = 0; i < s.count; i++) { const l = Math.hypot(s.eq[i * 3], s.eq[i * 3 + 1], s.eq[i * 3 + 2]); if (Math.abs(l - 1) > 1e-5 || s.mag[i] < -1.5 || s.mag[i] > 6.6) return false; } return true; })());

let p = altaz('Polaris');
near('Polaris altitude is the latitude (40 N)', p.alt, 40, 0.75);
yes('Polaris is due north', angDiff(p.az, 0) < 1.2, 'az ' + p.az.toFixed(2));
let si = altaz('Sirius');
near('Sirius culminates near local midnight on 1 Jan: altitude 90 - 40 - 16.7', si.alt, 33.3, 0.6);
yes('...in the south', angDiff(si.az, 180) < 12, 'az ' + si.az.toFixed(1));
yes('Orion is up with it', altaz('Betelgeuse').alt > 45 && altaz('Rigel').alt > 30);
yes('Southern Cross never rises at 40 N', (() => { for (let h = 0; h < 24; h++) { m.setTime(utc('2026-01-01T00:00:00') + h * 3600e3); if (altaz('Acrux').alt > 0) return false; } return true; })());
m.setLocation(-45, 170);
yes('...and never sets at 45 S', (() => { for (let h = 0; h < 24; h++) { m.setTime(utc('2026-01-01T00:00:00') + h * 3600e3); if (altaz('Acrux').alt < 0) return false; } return true; })());
yes('Polaris is below the horizon from 45 S', altaz('Polaris').alt < 0);
// transit identity: when LST equals a star's RA (of date), altitude = 90 - |lat - dec|
m.setLocation(-33.9, 151.2).setTime(utc('2026-06-15T00:00:00'));
{ // step to the moment Antares crosses the meridian
  let best = -99, bestT = 0;
  for (let k = 0; k < 1440; k++) { m.setTime(utc('2026-06-15T00:00:00') + k * 60e3); const a = altaz('Antares').alt; if (a > best) { best = a; bestT = k; } }
  near('Antares culminates from Sydney at 90 - |-33.9 + 26.4|', best, 82.5, 0.25);
  m.setTime(utc('2026-06-15T00:00:00') + bestT * 60e3);
  near('...when sidereal time equals its right ascension (247.4 + precession)', m.lst, 247.75, 0.5);
}
// precession: Polaris is closer to the pole now than in 2000 (dec +89.26 -> about +89.37 in 2026)
m.setLocation(90, 0).setTime(utc('2026-06-01T00:00:00'));
near('Precession: Polaris altitude from the north pole in 2026', altaz('Polaris').alt, 89.37, 0.03);
const gc = Sky.galacticToEquatorial(0, 0);
near('Galactic centre RA', (Math.atan2(gc[1], gc[0]) / D2R + 360) % 360, 266.405, 0.01);
near('Galactic centre Dec', Math.asin(gc[2]) / D2R, -28.936, 0.01);
const ngp = Sky.galacticToEquatorial(0, 90);
near('North galactic pole Dec', Math.asin(ngp[2]) / D2R, 27.128, 0.01);

console.log('\n# planets');
const P = Sky.PLANET_NAMES, pp = (name, t) => Sky.planetPosition(P.indexOf(name), utc(t));
const sepV = (a, b) => Math.acos(a.vec[0] * b.vec[0] + a.vec[1] * b.vec[1] + a.vec[2] * b.vec[2]) / D2R;
near('Great conjunction 2020-12-21: Jupiter-Saturn separation (0.1 deg)', sepV(pp('Jupiter', '2020-12-21T18:20:00'), pp('Saturn', '2020-12-21T18:20:00')), 0.1, 0.08);
{ const v = pp('Venus', '1992-12-20T00:00:00');       // Meeus 33.a (of date): RA 316.17, Dec -18.89; J2000 differs by ~0.1 deg
  near('Venus RA 1992-12-20 (Meeus 33.a)', v.ra, 316.17, 0.2); near('Venus Dec 1992-12-20 (Meeus 33.a)', v.dec, -18.89, 0.1);
  near('Venus distance AU (Meeus 33.a)', v.distAU, 0.9109, 0.002); }
near('Mars at opposition 2025-01-16: elongation (it passed 4 deg north of the anti-solar point)', pp('Mars', '2025-01-16T02:00:00').elongation, 176, 1.5);
near('...and magnitude', pp('Mars', '2025-01-16T02:00:00').mag, -1.4, 0.25);
near('Jupiter at opposition 2024-12-07: elongation', pp('Jupiter', '2024-12-07T21:00:00').elongation, 180, 1.5);
near('...and magnitude', pp('Jupiter', '2024-12-07T21:00:00').mag, -2.8, 0.2);
near('Saturn at opposition 2025-09-21: elongation', pp('Saturn', '2025-09-21T06:00:00').elongation, 180, 3);
near('Venus greatest eastern elongation 2025-01-10', pp('Venus', '2025-01-10T00:00:00').elongation, 47.2, 0.3);
near('...when it shines near magnitude -4.4', pp('Venus', '2025-01-10T00:00:00').mag, -4.4, 0.3);
near('Mercury greatest eastern elongation 2025-03-08', pp('Mercury', '2025-03-08T06:00:00').elongation, 18.2, 0.4);
near('Jupiter at the 2026-01-10 opposition is in Gemini: RA', pp('Jupiter', '2026-01-10T09:00:00').ra, 112, 4);
near('...Dec', pp('Jupiter', '2026-01-10T09:00:00').dec, 22, 1.5);
near('Uranus magnitude at opposition', pp('Uranus', '2025-11-21T12:00:00').mag, 5.6, 0.3);
near('Neptune distance at opposition (AU)', pp('Neptune', '2025-09-23T12:00:00').distAU, 28.9, 0.2);
m = new Sky.SkyModel({ lat: 40, lon: -75, time: utc('2025-01-11T00:00:00'), catalog });
yes('Model: Venus is the evening star in the south-west, Jan 2025, and visible', m.planets.alt[1] > 15 && m.planets.az[1] > 200 && m.planets.az[1] < 250 && m.planets.alpha[1] > 0.9, `alt ${m.planets.alt[1].toFixed(0)} az ${m.planets.az[1].toFixed(0)} alpha ${m.planets.alpha[1].toFixed(2)}`);
yes('Model: Neptune is too faint to show unaided', m.planets.alpha[6] === 0);

console.log('\n# appearance, data API, events');
m = new Sky.SkyModel({ lat: 36, lon: -100, time: utc('2025-12-20T06:00:00'), catalog });
yes('Midnight: night, stars fully visible', m.sky.phase === 'night' && m.sky.starVisibility === 1 && m.sky.limitingMagnitude > 5, m.sky.phase);
yes('...and visibleStars() returns unit vectors above the horizon', (() => { const v = m.visibleStars(); return v.length > 50 && v.every((s) => s.dir[2] > 0 && Math.abs(Math.hypot(...s.dir) - 1) < 1e-4); })(), m.visibleStars().length + ' stars');
m.setTime(utc('2025-12-20T19:00:00'));
yes('Early afternoon: day, no stars', m.sky.phase === 'day' && m.visibleStars().length === 0 && m.sky.zenith[2] > 150, m.sky.phase);
m.setMode('night');
yes('Forced night at midday: stars out, sun and star positions unchanged', !m.sky.isDay && m.visibleStars().length > 50 && m.sun.alt > 10);
m.setMode('day').setTime(utc('2025-12-20T06:00:00'));
yes('Forced day at midnight: blue sky, no stars', m.sky.isDay && m.visibleStars().length === 0 && m.sun.alt < -30);
m.setMode('auto');
const seen = [];
m.on('phase', (_, ph) => seen.push(ph)); m.on('sunset', () => seen.push('SUNSET')); m.on('daynight', (_, v) => seen.push('->' + v));
m.setTime(utc('2025-12-20T21:00:00')).setRate(600);
seen.length = 0;
for (let k = 0; k < 400; k++) m.advance(100);       // 400 frames of 0.1 s at 600x = 6h40m
yes('Fast-forward through dusk fires events in order', seen.join(' ') === 'golden SUNSET civil ->night nautical astronomical night' || seen.join(' ') === 'golden civil ->night SUNSET nautical astronomical night', seen.join(' '));
// three.js matrix agrees with the east/north/up vectors
{ const T = m.threeMatrix, i = starIdx('Vega') * 3, e = m.stars.eq, n = m.stars.enu;
  const x = T[0] * e[i] + T[4] * e[i + 1] + T[8] * e[i + 2], y = T[1] * e[i] + T[5] * e[i + 1] + T[9] * e[i + 2], z = T[2] * e[i] + T[6] * e[i + 1] + T[10] * e[i + 2];
  yes('threeMatrix maps J2000 vectors to x east, y up, z south', Math.abs(x - n[i]) < 1e-5 && Math.abs(y - n[i + 2]) < 1e-5 && Math.abs(z + n[i + 1]) < 1e-5);
  const det = T[0] * (T[5] * T[10] - T[9] * T[6]) - T[4] * (T[1] * T[10] - T[9] * T[2]) + T[8] * (T[1] * T[6] - T[5] * T[2]);
  near('...and is a proper rotation (determinant)', det, 1, 1e-5); }
yes('skyData() one-shot works', (() => { const d = Sky.skyData({ lat: 10, lon: 20, time: '2026-01-01T00:00:00Z', catalog }); return d.sun.vec.length === 3 && d.stars.count > 100 && d.sky.zenith.length === 3; })());
let g = Sky.guessLocation('America/Los_Angeles');
yes('guessLocation: Los Angeles', Math.abs(g.lat - 34.1) < 0.2 && Math.abs(g.lon + 118.2) < 0.2 && g.source === 'timezone');
g = Sky.guessLocation('Australia/Sydney');
yes('guessLocation: Sydney is in the south', g.lat < -30 && g.lon > 150);
g = Sky.guessLocation('Nowhere/Unknown');
yes('guessLocation: unknown zone falls back to 36 N', g.lat === 36 && g.source !== 'timezone');
m = new Sky.SkyModel({ lat: 36, lon: -100, time: utc('2025-12-20T06:00:00'), catalog, lowData: true });
yes('Low-data mode keeps only bright real stars, no Milky Way', m.stars.count === m.stars.realCount && m.stars.count < 1000 && m.sky.milkyWay === 0, m.stars.count + ' stars');

console.log('\n# languages (sky-strings.js)');
{ const { LANGS, STRINGS, skyStrings, normalizeLang, skyPosition } = await import('./sky-strings.js');
  const starter = JSON.parse(readFileSync(join(here, 'starter.json'), 'utf8'));
  const en = STRINGS.en, figIds = starter.lines.map((c) => c.id).sort().join(), starNames = new Set(starter.stars.map((r) => r[1]).filter(Boolean));
  const shape = (v) => (Array.isArray(v) ? 'a' + v.length : v && typeof v === 'object' ? 'o' + Object.keys(v).sort().join() : typeof v);
  yes('nine languages', LANGS.length === 9 && LANGS.every((l) => STRINGS[l]));
  yes('English names every figure in starter.json', Object.keys(en.figures).sort().join() === figIds);
  yes('English planet names match sky.js', en.planets.join() === Sky.PLANET_NAMES.join());
  for (const l of LANGS) {
    const d = STRINGS[l], bad = [];
    for (const k in en) if (k !== 'stars' && shape(d[k]) !== shape(en[k])) bad.push(k);
    for (const k in d) if (!(k in en)) bad.push('extra ' + k);
    for (const k in d.stars) if (!starNames.has(k)) bad.push('star ' + k);
    if (!d.geoUsing.includes('{pos}') || !d.pos.every((p) => p.includes('{v}'))) bad.push('placeholder');
    yes(`${l}: every string present, same shape as English`, bad.length === 0, bad.join(', '));
    if (l !== 'en') {
      const same = ['now', 'go', 'when', 'scrub', 'speed', 'place', 'looking', 'lookingUp', 'sky', 'night', 'day', 'trails', 'geoBtn', 'geoNote', 'aimBtn', 'aimNote', 'sun', 'set', 'paused'].filter((k) => d[k] === en[k]);
      yes(`${l}: nothing left in English`, same.length === 0, same.join(', '));
    }
  }
  const seen = new Set();
  for (let d = 0; d < 30; d++) seen.add(new Sky.SkyModel({ lat: 0, lon: 0, time: utc('2026-03-01T00:00:00') + d * 86400e3, catalog: null, filler: false }).moon.phaseName);
  yes('moon phase names from sky.js are all in the English list', seen.size === 8 && [...seen].every((n) => en.moon.includes(n)));
  yes('normalizeLang follows the site rules', normalizeLang('JA') === 'ja' && normalizeLang('pt') === 'pt-BR' && normalizeLang('zh-CN') === 'zh-Hans' && normalizeLang('de-AT') === 'de' && normalizeLang('xx') === null);
  yes('fallback fills gaps from English', skyStrings('fr').stars !== undefined && skyStrings('nope').lang === 'en' && skyStrings('de').figures.UMa === STRINGS.de.figures.UMa);
  yes('positions are formatted for the language', skyPosition(-33.9, -70.7, 'de') === STRINGS.de.pos[1].replace('{v}', '33,9') + ', ' + STRINGS.de.pos[3].replace('{v}', '70,7'), skyPosition(35.68, 139.69, 'ja') + ' | ' + skyPosition(-33.9, -70.7, 'de'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
