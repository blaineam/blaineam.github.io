/* sky.js: a small, dependency-free simulation of the real sky for a place and time.
 *
 *   SkyModel   astronomy + appearance (sun, moon, twilight colours, stars). No DOM. Works in node.
 *   SkyCanvas  2D <canvas> renderer (no WebGL): horizon-up view toward an azimuth, with pan.
 *   createSky  convenience: model + canvas + catalog loading in one call.
 *
 * No network requests except the same-origin fetch of the star catalog you point it at. The Geolocation
 * API is used only if the page calls requestLocation(), which the control bar does on an explicit click.
 * See README.md for the API. Angles are degrees unless a name says otherwise; azimuth is measured
 * from north through east; longitude is east-positive; local vectors are [east, north, up].
 */

export const VERSION = '1.0.0';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ astronomy */

/** Julian day from a Unix time in milliseconds. */
export function julianDay(ms) { return ms / 86400000 + 2440587.5; }

/** Greenwich mean sidereal time, degrees. */
export function gmstDeg(ms) {
  const d = julianDay(ms) - 2451545.0, T = d / 36525;
  return mod(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T, 360);
}

/** Local mean sidereal time, degrees, for an east-positive longitude. */
export function lstDeg(ms, lon) { return mod(gmstDeg(ms) + lon, 360); }

/** Sun, geocentric, equinox of date (Astronomical Almanac low-precision series, about 0.01 deg). */
export function sunEquatorial(ms, out) {
  out = out || {};
  const d = julianDay(ms) - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * D2R;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  out.lon = mod(L * R2D, 360);
  out.ra = mod(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * R2D, 360);
  out.dec = Math.asin(Math.sin(e) * Math.sin(L)) * R2D;
  out.distAU = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return out;
}

/** Moon, geocentric, equinox of date (Astronomical Almanac low-precision series, about 0.3 deg). */
export function moonEquatorial(ms, out) {
  out = out || {};
  const T = (julianDay(ms) - 2451545.0) / 36525;
  const s = (a, b) => Math.sin((a + b * T) * D2R), c = (a, b) => Math.cos((a + b * T) * D2R);
  const lam = (218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36)
    + 0.66 * s(235.7, 890534.22) + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05)
    - 0.11 * s(186.5, 966404.03)) * D2R;
  const bet = (5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15)
    - 0.17 * s(217.6, -407332.21)) * D2R;
  const par = (0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
    + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74)) * D2R;
  const e = (23.439 - 0.0130 * T) * D2R;
  const x = Math.cos(bet) * Math.cos(lam);
  const y = Math.cos(e) * Math.cos(bet) * Math.sin(lam) - Math.sin(e) * Math.sin(bet);
  const z = Math.sin(e) * Math.cos(bet) * Math.sin(lam) + Math.cos(e) * Math.sin(bet);
  out.lon = mod(lam * R2D, 360); out.lat = bet * R2D;
  out.ra = mod(Math.atan2(y, x) * R2D, 360);
  out.dec = Math.asin(z) * R2D;
  out.distER = 1 / Math.sin(par);          // Earth radii
  out.distKm = out.distER * 6378.14;
  return out;
}

/* Planets: Keplerian elements and their rates per century (JPL "Approximate Positions of the Planets",
 * Standish, valid 1800-2050), mean ecliptic and equinox of J2000.
 * Each row: a (AU), e, I, L, long. of perihelion, long. of node, then the six rates. */
const PLANET_EL = [
  [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]
];
export const PLANET_NAMES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const PLANET_ROW = [0, 1, 3, 4, 5, 6, 7];           // rows of PLANET_EL (row 2 is the Earth-Moon barycentre)
const PLANET_RGB = [[222, 212, 200], [255, 250, 236], [255, 152, 104], [255, 236, 208], [242, 224, 178], [178, 232, 236], [134, 164, 255]];

/* Heliocentric J2000 ecliptic position of PLANET_EL row k, into out[o..o+2] (AU). */
function heliocentric(k, T, out, o) {
  const el = PLANET_EL[k];
  const a = el[0] + el[6] * T, e = el[1] + el[7] * T, I = (el[2] + el[8] * T) * D2R, L = el[3] + el[9] * T;
  const wb = el[4] + el[10] * T, Om = (el[5] + el[11] * T) * D2R, w = wb * D2R - Om;
  const M = (mod(L - wb + 180, 360) - 180) * D2R;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  out[o] = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  out[o + 1] = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  out[o + 2] = sw * sI * xp + cw * sI * yp;
}
const _hel = new Float64Array(6);

/**
 * Geocentric J2000 equatorial unit vector, distances and magnitude of planet i (0 Mercury .. 6 Neptune,
 * see PLANET_NAMES). Good to a few arcminutes. Reuses `out` if given.
 */
export function planetPosition(i, ms, out) {
  out = out || { vec: [0, 0, 0] };
  const T = (julianDay(ms) - 2451545.0) / 36525, h = _hel;
  heliocentric(2, T, h, 0); heliocentric(PLANET_ROW[i], T, h, 3);
  const x = h[3] - h[0], y = h[4] - h[1], z = h[5] - h[2];
  const r = Math.hypot(h[3], h[4], h[5]), R = Math.hypot(h[0], h[1], h[2]), d = Math.hypot(x, y, z);
  const ce = 0.9174820621, se = 0.3977771559;             // obliquity at J2000
  out.vec[0] = x / d; out.vec[1] = (ce * y - se * z) / d; out.vec[2] = (se * y + ce * z) / d;
  out.ra = mod(Math.atan2(out.vec[1], out.vec[0]) * R2D, 360); out.dec = Math.asin(out.vec[2]) * R2D;
  out.distAU = d; out.sunDistAU = r;
  out.elongation = Math.acos(clamp((R * R + d * d - r * r) / (2 * R * d), -1, 1)) * R2D;
  const ph = Math.acos(clamp((r * r + d * d - R * R) / (2 * r * d), -1, 1)) * R2D, lg = 5 * Math.log10(r * d);
  out.phaseAngle = ph;
  out.mag = i === 0 ? -0.42 + lg + 0.0380 * ph - 0.000273 * ph * ph + 0.000002 * ph * ph * ph
    : i === 1 ? -4.40 + lg + 0.0009 * ph + 0.000239 * ph * ph - 0.00000065 * ph * ph * ph
    : i === 2 ? -1.52 + lg + 0.016 * ph : i === 3 ? -9.40 + lg + 0.005 * ph
    : i === 4 ? -8.88 + lg + 0.044 * ph : i === 5 ? -7.19 + lg : -6.87 + lg;      // Saturn: rings not modelled
  return out;
}

/** Galactic (l, b) to J2000 equatorial; writes a unit vector into out[o..o+2]. */
export function galacticToEquatorial(l, b, out, o) {
  const aG = 192.85948 * D2R, dG = 27.12825 * D2R, lN = 122.93192 * D2R;
  const cb = Math.cos(b * D2R), sb = Math.sin(b * D2R), dl = lN - l * D2R;
  const sd = Math.sin(dG) * sb + Math.cos(dG) * cb * Math.cos(dl);
  const ya = cb * Math.sin(dl), xa = Math.cos(dG) * sb - Math.sin(dG) * cb * Math.cos(dl);
  const a = Math.atan2(ya, xa) + aG, cd = Math.sqrt(1 - sd * sd);
  out = out || [0, 0, 0]; o = o || 0;
  out[o] = cd * Math.cos(a); out[o + 1] = cd * Math.sin(a); out[o + 2] = sd;
  return out;
}

/** Rotation taking equinox-of-date equatorial unit vectors to local [east, north, up]. */
function horizonMatrix(lst, lat, M) {
  const sL = Math.sin(lst * D2R), cL = Math.cos(lst * D2R), sp = Math.sin(lat * D2R), cp = Math.cos(lat * D2R);
  M[0] = -sL; M[1] = cL; M[2] = 0;
  M[3] = -sp * cL; M[4] = -sp * sL; M[5] = cp;
  M[6] = cp * cL; M[7] = cp * sL; M[8] = sp;
  return M;
}

/** Precession matrix, J2000 to the equinox of date (Meeus 21.2 angles). */
function precessionMatrix(ms, P) {
  const T = (julianDay(ms) - 2451545.0) / 36525, as = D2R / 3600;
  const ze = (2306.2181 * T + 0.30188 * T * T) * as, z = (2306.2181 * T + 1.09468 * T * T) * as;
  const th = (2004.3109 * T - 0.42665 * T * T) * as;
  const cz = Math.cos(ze), sz = Math.sin(ze), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
  P[0] = cz * ct * cZ - sz * sZ; P[1] = -sz * ct * cZ - cz * sZ; P[2] = -st * cZ;
  P[3] = cz * ct * sZ + sz * cZ; P[4] = -sz * ct * sZ + cz * cZ; P[5] = -st * sZ;
  P[6] = cz * st; P[7] = -sz * st; P[8] = ct;
  return P;
}

function mul3(A, B, C) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
}

/** Altitude/azimuth of an equinox-of-date RA/Dec for a time and place. Allocates; for one-offs. */
export function equatorialToHorizontal(ra, dec, ms, lat, lon) {
  const M = horizonMatrix(lstDeg(ms, lon), lat, new Float64Array(9));
  const cd = Math.cos(dec * D2R), x = cd * Math.cos(ra * D2R), y = cd * Math.sin(ra * D2R), z = Math.sin(dec * D2R);
  const e = M[0] * x + M[1] * y + M[2] * z, n = M[3] * x + M[4] * y + M[5] * z, u = M[6] * x + M[7] * y + M[8] * z;
  return { alt: Math.asin(clamp(u, -1, 1)) * R2D, az: mod(Math.atan2(e, n) * R2D, 360), vec: [e, n, u] };
}

/** [east, north, up] to three.js axes (x east, y up, z south, so north is -z). */
export function enuToThree(v, out) {
  out = out || [0, 0, 0];
  const e = v[0], n = v[1], u = v[2];
  out[0] = e; out[1] = u; out[2] = -n;
  return out;
}

/* ------------------------------------------------------------------ where is the visitor */

const ZONES = 'America/New_York:40.7,-74|America/Chicago:41.9,-87.6|America/Denver:39.7,-105|America/Phoenix:33.4,-112.1|' +
  'America/Los_Angeles:34.1,-118.2|America/Anchorage:61.2,-149.9|Pacific/Honolulu:21.3,-157.9|America/Toronto:43.7,-79.4|' +
  'America/Vancouver:49.3,-123.1|America/Edmonton:53.5,-113.5|America/Winnipeg:49.9,-97.1|America/Regina:50.4,-104.6|' +
  'America/Halifax:44.6,-63.6|America/St_Johns:47.6,-52.7|America/Detroit:42.3,-83|America/Boise:43.6,-116.2|' +
  'America/Indiana/Indianapolis:39.8,-86.2|America/Kentucky/Louisville:38.3,-85.8|America/Mexico_City:19.4,-99.1|' +
  'America/Monterrey:25.7,-100.3|America/Tijuana:32.5,-117|America/Guatemala:14.6,-90.5|America/Costa_Rica:9.9,-84.1|' +
  'America/Panama:9,-79.5|America/Havana:23.1,-82.4|America/Jamaica:18,-76.8|America/Santo_Domingo:18.5,-69.9|' +
  'America/Puerto_Rico:18.4,-66.1|America/Bogota:4.7,-74.1|America/Caracas:10.5,-66.9|America/Guayaquil:-2.2,-79.9|' +
  'America/Lima:-12,-77|America/La_Paz:-16.5,-68.1|America/Santiago:-33.4,-70.7|America/Asuncion:-25.3,-57.6|' +
  'America/Argentina/Buenos_Aires:-34.6,-58.4|America/Buenos_Aires:-34.6,-58.4|America/Montevideo:-34.9,-56.2|' +
  'America/Sao_Paulo:-23.5,-46.6|Europe/London:51.5,-0.1|Europe/Dublin:53.3,-6.3|Europe/Lisbon:38.7,-9.1|' +
  'Europe/Madrid:40.4,-3.7|Europe/Paris:48.9,2.3|Europe/Brussels:50.8,4.4|Europe/Amsterdam:52.4,4.9|' +
  'Europe/Luxembourg:49.6,6.1|Europe/Berlin:52.5,13.4|Europe/Zurich:47.4,8.5|Europe/Rome:41.9,12.5|' +
  'Europe/Vienna:48.2,16.4|Europe/Prague:50.1,14.4|Europe/Warsaw:52.2,21|Europe/Budapest:47.5,19|' +
  'Europe/Copenhagen:55.7,12.6|Europe/Stockholm:59.3,18.1|Europe/Oslo:59.9,10.8|Europe/Helsinki:60.2,24.9|' +
  'Europe/Tallinn:59.4,24.8|Europe/Riga:56.9,24.1|Europe/Vilnius:54.7,25.3|Europe/Athens:38,23.7|' +
  'Europe/Istanbul:41,29|Europe/Kyiv:50.5,30.5|Europe/Kiev:50.5,30.5|Europe/Bucharest:44.4,26.1|Europe/Sofia:42.7,23.3|' +
  'Europe/Belgrade:44.8,20.5|Europe/Zagreb:45.8,16|Europe/Minsk:53.9,27.6|Europe/Moscow:55.8,37.6|' +
  'Atlantic/Reykjavik:64.1,-21.9|Atlantic/Canary:28.1,-15.4|Atlantic/Azores:37.7,-25.7|Africa/Cairo:30,31.2|' +
  'Africa/Johannesburg:-26.2,28|Africa/Lagos:6.5,3.4|Africa/Nairobi:-1.3,36.8|Africa/Casablanca:33.6,-7.6|' +
  'Africa/Algiers:36.8,3.1|Africa/Tunis:36.8,10.2|Africa/Accra:5.6,-0.2|Africa/Addis_Ababa:9,38.7|' +
  'Africa/Dar_es_Salaam:-6.8,39.3|Africa/Kinshasa:-4.3,15.3|Africa/Khartoum:15.6,32.5|Africa/Maputo:-26,32.6|' +
  'Africa/Windhoek:-22.6,17.1|Asia/Dubai:25.2,55.3|Asia/Tehran:35.7,51.4|Asia/Jerusalem:31.8,35.2|Asia/Beirut:33.9,35.5|' +
  'Asia/Amman:31.95,35.9|Asia/Riyadh:24.7,46.7|Asia/Kuwait:29.4,48|Asia/Qatar:25.3,51.5|Asia/Baghdad:33.3,44.4|' +
  'Asia/Baku:40.4,49.9|Asia/Tbilisi:41.7,44.8|Asia/Yerevan:40.2,44.5|Asia/Kabul:34.5,69.2|Asia/Karachi:24.9,67|' +
  'Asia/Kolkata:23,79|Asia/Calcutta:23,79|Asia/Kathmandu:27.7,85.3|Asia/Dhaka:23.8,90.4|Asia/Colombo:6.9,79.9|' +
  'Asia/Tashkent:41.3,69.3|Asia/Almaty:43.2,76.9|Asia/Yekaterinburg:56.8,60.6|Asia/Novosibirsk:55,82.9|' +
  'Asia/Yangon:16.8,96.2|Asia/Bangkok:13.8,100.5|Asia/Ho_Chi_Minh:10.8,106.7|Asia/Saigon:10.8,106.7|' +
  'Asia/Jakarta:-6.2,106.8|Asia/Singapore:1.35,103.8|Asia/Kuala_Lumpur:3.1,101.7|Asia/Manila:14.6,121|' +
  'Asia/Hong_Kong:22.3,114.2|Asia/Shanghai:31.2,121.5|Asia/Taipei:25,121.5|Asia/Seoul:37.6,127|Asia/Tokyo:35.7,139.7|' +
  'Asia/Ulaanbaatar:47.9,106.9|Asia/Vladivostok:43.1,131.9|Australia/Sydney:-33.9,151.2|Australia/Melbourne:-37.8,145|' +
  'Australia/Brisbane:-27.5,153|Australia/Adelaide:-34.9,138.6|Australia/Perth:-31.95,115.9|Australia/Darwin:-12.5,130.8|' +
  'Australia/Hobart:-42.9,147.3|Pacific/Auckland:-36.85,174.8|Pacific/Fiji:-18.1,178.4|Pacific/Guam:13.4,144.8|' +
  'Pacific/Port_Moresby:-9.4,147.2|Pacific/Tahiti:-17.5,-149.6|Indian/Maldives:4.2,73.5|Indian/Mauritius:-20.2,57.5|' +
  'Antarctica/McMurdo:-77.8,166.7';
let zoneTable = null;

/**
 * A rough guess at where the visitor is, from the time zone name only (no Geolocation, no network).
 * Unknown zones fall back to the UTC offset for longitude and 36 N for latitude.
 */
export function guessLocation(zone) {
  if (!zoneTable) {
    zoneTable = {};
    for (const row of ZONES.split('|')) {
      const i = row.indexOf(':'), j = row.indexOf(',', i);
      zoneTable[row.slice(0, i)] = [parseFloat(row.slice(i + 1, j)), parseFloat(row.slice(j + 1))];
    }
  }
  if (zone === undefined) {
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { zone = ''; }
  }
  const hit = zone && zoneTable[zone];
  if (hit) return { lat: hit[0], lon: hit[1], zone, source: 'timezone' };
  let lon = 0, source = 'default';
  try {
    const off = -new Date().getTimezoneOffset() / 60;
    if (zone && !/^(UTC|Etc\/|GMT)/.test(zone)) { lon = clamp(off * 15, -180, 180); source = 'offset'; }
  } catch (e) { /* keep the default */ }
  return { lat: 36, lon, zone: zone || '', source };
}

/**
 * Opt-in only: ask the browser for the visitor's position and set the model's latitude and longitude.
 * Call this from a click on a control that says what it does; never on page load. The browser shows
 * its own permission prompt. The position is rounded to about a kilometre, used for the sky on this
 * page, and not stored or sent anywhere. Resolves to { lat, lon }; rejects with an Error whose
 * `code` is 'unsupported', 'denied', 'unavailable' or 'timeout'.
 */
export function requestLocation(model) {
  return new Promise((resolve, reject) => {
    const fail = (code, msg) => { const e = new Error(msg); e.code = code; reject(e); };
    const geo = typeof navigator !== 'undefined' && navigator.geolocation;
    if (!geo) return fail('unsupported', 'This browser cannot share a location.');
    geo.getCurrentPosition((pos) => {
      const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
      if (model) model.setLocation(lat, lon, 'geolocation');
      resolve({ lat, lon });
    }, (err) => {
      if (err && err.code === 1) fail('denied', 'Location permission was not given.');
      else if (err && err.code === 3) fail('timeout', 'Finding your location took too long.');
      else fail('unavailable', 'Your location is not available right now.');
    }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 });
  });
}

/* ------------------------------------------------------------------ catalog */

/** Validate a parsed stars.json (see README for the schema) and return it. */
export function parseCatalog(json) {
  if (!json || json.format !== 'sky-stars' || !Array.isArray(json.stars) || json.stars.length % 4)
    throw new Error('sky: not a sky-stars catalog');
  return json;
}

/** Fetch and parse a catalog. Same-origin URL; resolves to null if it cannot be loaded. */
export async function loadCatalog(url) {
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return null;
    return parseCatalog(await r.json());
  } catch (e) { return null; }
}

/* B-V colour index to an approximate star colour: 7 buckets, blue-white to orange. */
const BV_EDGES = [-0.15, 0.1, 0.4, 0.7, 1.0, 1.4];
const BV_RGB = [[170, 195, 255], [202, 216, 255], [240, 243, 255], [255, 246, 232], [255, 228, 196], [255, 208, 160], [255, 184, 130]];
function bvBucket(bv) { let i = 0; while (i < BV_EDGES.length && bv > BV_EDGES[i]) i++; return i; }

function mulberry(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ appearance */

/* Sun altitude -> zenith colour, horizon colour, colour and strength of the glow on the sun's side. */
const SKY_KEYS = [
  [-18, 3, 5, 12, 8, 12, 24, 10, 14, 30, 0],
  [-12, 5, 8, 20, 16, 26, 52, 40, 48, 92, 0.3],
  [-6, 14, 24, 56, 52, 66, 110, 214, 110, 76, 0.8],
  [-3, 28, 48, 100, 112, 112, 142, 240, 130, 84, 1],
  [0, 52, 92, 160, 208, 164, 140, 255, 150, 92, 1],
  [3, 64, 116, 196, 214, 198, 184, 255, 200, 152, 0.9],
  [8, 62, 124, 214, 190, 214, 236, 255, 236, 212, 0.6],
  [20, 52, 116, 214, 176, 208, 240, 255, 250, 240, 0.45],
  [60, 40, 104, 208, 160, 200, 240, 255, 255, 250, 0.4]
];

function skyColours(alt, sky) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && alt > SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = clamp((alt - a[0]) / (b[0] - a[0]), 0, 1);
  for (let k = 0; k < 3; k++) {
    sky.zenith[k] = a[1 + k] + (b[1 + k] - a[1 + k]) * t;
    sky.horizon[k] = a[4 + k] + (b[4 + k] - a[4 + k]) * t;
    sky.glow[k] = a[7 + k] + (b[7 + k] - a[7 + k]) * t;
  }
  sky.glowStrength = a[10] + (b[10] - a[10]) * t;
}

function phaseOf(alt) {
  return alt > 6 ? 'day' : alt > -0.833 ? 'golden' : alt > -6 ? 'civil' : alt > -12 ? 'nautical' : alt > -18 ? 'astronomical' : 'night';
}

const MOON_NAMES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

/* ------------------------------------------------------------------ events */

class Emitter {
  constructor() { this._ev = {}; }
  /** Subscribe; returns a function that unsubscribes. */
  on(type, fn) {
    (this._ev[type] || (this._ev[type] = [])).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { const l = this._ev[type]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(type, detail) { const l = this._ev[type]; if (l) for (let i = 0; i < l.length; i++) l[i](this, detail); }
}

/* ------------------------------------------------------------------ model */

export class SkyModel extends Emitter {
  /**
   * @param {object} [o]
   * @param {number} [o.lat] latitude; default: guessed from the time zone
   * @param {number} [o.lon] east-positive longitude; default: guessed from the time zone
   * @param {Date|number|string} [o.time] default: now, following the clock
   * @param {number} [o.rate] simulated seconds per real second (1 = real time, 0 = paused)
   * @param {'auto'|'night'|'day'} [o.mode] force the look regardless of the clock
   * @param {object} [o.catalog] parsed stars.json
   * @param {number} [o.maxMag] faintest catalog star to keep (default 6.5; 4.5 in low-data mode)
   * @param {boolean} [o.lowData] fewer stars, no filler, no Milky Way
   * @param {boolean|'auto'} [o.filler] decorative faint stars; 'auto' = only with a small catalog
   */
  constructor(o) {
    super();
    o = o || {};
    const g = (o.lat == null || o.lon == null) ? guessLocation() : null;
    this.lat = o.lat != null ? +o.lat : g.lat;
    this.lon = o.lon != null ? +o.lon : g.lon;
    this.locationSource = g ? g.source : 'given';
    this.zone = g ? g.zone : '';
    this.live = o.time == null;
    this.time = this.live ? Date.now() : +new Date(o.time);
    this.rate = o.rate != null ? +o.rate : 1;
    if (this.rate !== 1) this.live = false;
    this.mode = o.mode || 'auto';
    this.lowData = !!o.lowData;
    this.maxMag = o.maxMag;
    this.filler = o.filler == null ? 'auto' : o.filler;
    this.version = 0;
    this.catalogVersion = 0;

    this.lst = 0;
    /** J2000 equatorial -> local [east, north, up], row-major 3x3. */
    this.matrix = new Float64Array(9);
    /** J2000 equatorial -> three.js axes, column-major 4x4 (Matrix4.fromArray). */
    this.threeMatrix = new Float32Array(16); this.threeMatrix[15] = 1;
    this._H = new Float64Array(9); this._P = new Float64Array(9);

    this.sun = { ra: 0, dec: 0, lon: 0, distAU: 1, alt: 0, az: 0, up: false, vec: new Float64Array(3) };
    this.moon = { ra: 0, dec: 0, lon: 0, lat: 0, distER: 60, distKm: 0, alt: 0, az: 0, up: false, vec: new Float64Array(3),
      illumination: 0, elongation: 0, phaseAngle: 0, waxing: true, phase: 0, phaseName: '', limbAngle: 0 };
    this.sky = { phase: '', look: '', isDay: false, sunAltEffective: 0, zenith: new Float32Array(3), horizon: new Float32Array(3),
      glow: new Float32Array(3), glowStrength: 0, ground: new Float32Array(3), sunColour: new Float32Array(3),
      limitingMagnitude: 0, starVisibility: 0, milkyWay: 0, ambient: 0 };
    this.stars = null;
    /** Mercury..Neptune (PLANET_NAMES order). eq: J2000 unit vectors; enu: local; alpha: visibility now. */
    this.planets = { count: 7, names: PLANET_NAMES, eq: new Float32Array(21), enu: new Float32Array(21), mag: new Float32Array(7),
      alpha: new Float32Array(7), alt: new Float32Array(7), az: new Float32Array(7), elongation: new Float32Array(7),
      distAU: new Float32Array(7), colour: new Float32Array(21), radius: new Float32Array(7) };
    for (let i = 0; i < 7; i++) for (let k = 0; k < 3; k++) this.planets.colour[i * 3 + k] = PLANET_RGB[i][k] / 255;
    this._pl = { vec: [0, 0, 0] };
    this.milkyWay = null;
    this.constellations = [];
    this._prevPhase = null; this._prevDay = null; this._prevUp = null;
    this._dirty = true; this._tDone = -1e99;

    this._buildMilkyWay();
    this.setCatalog(o.catalog || null);
  }

  /* ---------- state ---------- */

  setTime(t) { this.time = +new Date(t); this.live = false; this._changed('time'); return this; }
  /** Follow the real clock again, at real speed. */
  now() { this.live = true; this.rate = 1; this.time = Date.now(); this._changed('time'); return this; }
  /** Simulated seconds per real second. 1 = real time, 0 = paused, 3600 = an hour a second. */
  setRate(r) { this.rate = +r || 0; if (this.rate !== 1) this.live = false; this._changed('rate'); return this; }
  setLocation(lat, lon, source) {
    this.lat = clamp(+lat, -90, 90); this.lon = mod(+lon + 180, 360) - 180; this.locationSource = source || 'given';
    this._changed('location'); return this;
  }
  /** 'auto' follows the sun; 'night' and 'day' force that look. Star and moon positions stay true. */
  setMode(m) { this.mode = (m === 'night' || m === 'day') ? m : 'auto'; this._changed('mode'); return this; }
  setLowData(v) { v = !!v; if (v !== this.lowData) { this.lowData = v; this.setCatalog(this._catalog); } return this; }

  _changed(what) { this._dirty = true; this.update(); this.emit('change', what); }

  /** Move the clock on by a real-time interval in ms (call once per frame). Returns true if the sky was recomputed. */
  advance(dtMs) {
    if (this.live) this.time = Date.now();
    else if (this.rate) this.time += dtMs * this.rate;
    return this.update();
  }

  /* ---------- catalog ---------- */

  setCatalog(cat) {
    this._catalog = cat;
    const rnd = mulberry(20260419);
    const limit = this.maxMag != null ? this.maxMag : this.lowData ? 4.5 : 6.5;
    const src = cat ? cat.stars : [];
    const nSrc = src.length / 4;
    const map = new Int32Array(nSrc).fill(-1);
    let nReal = 0;
    for (let i = 0; i < nSrc; i++) if (src[i * 4 + 2] <= limit) map[i] = nReal++;
    const complete = cat && cat.limit != null ? cat.limit : -99;
    const wantFill = this.filler === true || (this.filler === 'auto' && !this.lowData && complete < 5.5);
    const nFill = wantFill ? 3000 : 0, n = nReal + nFill;

    const s = {
      count: n, realCount: nReal,
      eq: new Float32Array(n * 3),      // J2000 unit vectors, static
      enu: new Float32Array(n * 3),     // local [east, north, up], updated
      mag: new Float32Array(n), bv: new Float32Array(n),
      alpha: new Float32Array(n),       // 0..1 visibility now (0 = below horizon or too faint)
      radius: new Float32Array(n),      // suggested point radius in CSS px
      colour: new Float32Array(n * 3),  // rgb 0..1
      bucket: new Uint8Array(n), real: new Uint8Array(n), twinkle: new Float32Array(n),
      names: {}
    };
    const put = (j, ra, dec, mag, bv, real) => {
      const cd = Math.cos(dec * D2R);
      s.eq[j * 3] = cd * Math.cos(ra * D2R); s.eq[j * 3 + 1] = cd * Math.sin(ra * D2R); s.eq[j * 3 + 2] = Math.sin(dec * D2R);
      s.mag[j] = mag; s.bv[j] = bv; s.real[j] = real;
      s.radius[j] = 0.72 + 2.1 * Math.pow(10, -0.16 * (mag + 1.5));
      const b = bvBucket(bv); s.bucket[j] = b;
      s.colour[j * 3] = BV_RGB[b][0] / 255; s.colour[j * 3 + 1] = BV_RGB[b][1] / 255; s.colour[j * 3 + 2] = BV_RGB[b][2] / 255;
      s.twinkle[j] = rnd() * 6.283;
    };
    for (let i = 0; i < nSrc; i++) if (map[i] >= 0) put(map[i], src[i * 4], src[i * 4 + 1], src[i * 4 + 2], src[i * 4 + 3], 1);
    if (cat && cat.names) for (const k in cat.names) if (map[k] >= 0) s.names[map[k]] = cat.names[k];

    // Decorative faint field, only when the catalog is too small to fill the sky. Never bright enough
    // to be mistaken for a named star, denser toward the galactic plane, deterministic.
    const lo = Math.max(3.6, complete), tmp = [0, 0, 0];
    for (let j = nReal; j < n; j++) {
      let l, b;
      do { l = rnd() * 360; b = Math.asin(rnd() * 2 - 1) * R2D; } while (rnd() > 0.35 + 0.65 * Math.exp(-(b * b) / 500));
      galacticToEquatorial(l, b, tmp, 0);
      const mag = lo + (6.5 - lo) * Math.pow(rnd(), 0.38);
      const dec = Math.asin(tmp[2]) * R2D, ra = Math.atan2(tmp[1], tmp[0]) * R2D;
      put(j, ra, dec, mag, -0.1 + rnd() * 1.3, 0);
    }
    this.stars = s;

    this.constellations = [];
    if (cat && cat.lines) for (const c of cat.lines) {
      const paths = [];
      for (const p of c.paths) {
        let run = [];
        for (const i of p) { if (map[i] >= 0) run.push(map[i]); else { if (run.length > 1) paths.push(Int32Array.from(run)); run = []; } }
        if (run.length > 1) paths.push(Int32Array.from(run));
      }
      if (paths.length) this.constellations.push({ id: c.id, name: c.name, paths });
    }
    this.catalogVersion++;
    this._dirty = true;
    this.update();
    this.emit('change', 'catalog');
    return this;
  }

  _buildMilkyWay() {
    const rnd = mulberry(7), n = 800;
    const m = { count: n, eq: new Float32Array(n * 3), enu: new Float32Array(n * 3), weight: new Float32Array(n), size: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const l = rnd() * 360, dl = Math.min(l, 360 - l);            // distance from the galactic centre
      const core = Math.exp(-(dl * dl) / 3600);
      const g = (rnd() + rnd() + rnd() - 1.5) * 2;                 // roughly normal
      galacticToEquatorial(l, g * (4.5 + 5 * core), m.eq, i * 3);
      m.weight[i] = (0.3 + 0.7 * core + 0.25 * Math.exp(-((l - 80) * (l - 80)) / 900) + 0.3 * Math.exp(-((l - 285) * (l - 285)) / 700)) * (0.5 + rnd() * 0.5);
      m.size[i] = 3.5 + rnd() * 5 + 4 * core;                        // degrees
    }
    this.milkyWay = m;
  }

  /* ---------- the computation ---------- */

  /** Recompute if anything changed (or the clock moved enough to matter). Returns true if it did. */
  update(force) {
    if (!force && !this._dirty && Math.abs(this.time - this._tDone) < 500) return false;
    this._dirty = false; this._tDone = this.time;
    const t = this.time, lat = this.lat, sun = this.sun, moon = this.moon, sky = this.sky, st = this.stars;
    const lst = this.lst = lstDeg(t, this.lon);
    const H = horizonMatrix(lst, lat, this._H), M = mul3(H, precessionMatrix(t, this._P), this.matrix);
    const T3 = this.threeMatrix;   // rows of "three" are E, U, -N; store column-major
    T3[0] = M[0]; T3[4] = M[1]; T3[8] = M[2];
    T3[1] = M[6]; T3[5] = M[7]; T3[9] = M[8];
    T3[2] = -M[3]; T3[6] = -M[4]; T3[10] = -M[5];

    // sun
    sunEquatorial(t, sun);
    let cd = Math.cos(sun.dec * D2R);
    const sx = cd * Math.cos(sun.ra * D2R), sy = cd * Math.sin(sun.ra * D2R), sz = Math.sin(sun.dec * D2R);
    sun.vec[0] = H[0] * sx + H[1] * sy + H[2] * sz; sun.vec[1] = H[3] * sx + H[4] * sy + H[5] * sz; sun.vec[2] = H[6] * sx + H[7] * sy + H[8] * sz;
    sun.alt = Math.asin(clamp(sun.vec[2], -1, 1)) * R2D; sun.az = mod(Math.atan2(sun.vec[0], sun.vec[1]) * R2D, 360);
    sun.up = sun.alt > -0.833;

    // moon: geocentric, then shifted to the observer (parallax is up to a degree)
    moonEquatorial(t, moon);
    cd = Math.cos(moon.dec * D2R);
    const gx = cd * Math.cos(moon.ra * D2R), gy = cd * Math.sin(moon.ra * D2R), gz = Math.sin(moon.dec * D2R);
    const cp = Math.cos(lat * D2R);
    let mx = gx * moon.distER - cp * Math.cos(lst * D2R), my = gy * moon.distER - cp * Math.sin(lst * D2R), mz = gz * moon.distER - Math.sin(lat * D2R);
    const ml = Math.hypot(mx, my, mz); mx /= ml; my /= ml; mz /= ml;
    const mv = moon.vec;
    mv[0] = H[0] * mx + H[1] * my + H[2] * mz; mv[1] = H[3] * mx + H[4] * my + H[5] * mz; mv[2] = H[6] * mx + H[7] * my + H[8] * mz;
    moon.alt = Math.asin(clamp(mv[2], -1, 1)) * R2D; moon.az = mod(Math.atan2(mv[0], mv[1]) * R2D, 360);
    moon.up = moon.alt > -0.6;
    const cosEl = clamp(gx * sx + gy * sy + gz * sz, -1, 1);
    moon.elongation = Math.acos(cosEl) * R2D;
    moon.phaseAngle = 180 - moon.elongation;
    moon.illumination = (1 - cosEl) / 2;
    const dLon = mod(moon.lon - sun.lon, 360);
    moon.waxing = dLon < 180;
    moon.phase = dLon / 360;                                   // 0 new, 0.25 first quarter, 0.5 full
    moon.phaseName = MOON_NAMES[Math.floor(mod(dLon + 22.5, 360) / 45)];
    // direction of the lit limb as seen by the observer: degrees clockwise from "toward the zenith"
    {
      const sv = sun.vec, d = sv[0] * mv[0] + sv[1] * mv[1] + sv[2] * mv[2];
      const tx = sv[0] - d * mv[0], ty = sv[1] - d * mv[1], tz = sv[2] - d * mv[2];
      const ux = -mv[2] * mv[0], uy = -mv[2] * mv[1], uz = 1 - mv[2] * mv[2];       // up, in the tangent plane
      const rx = mv[1] * uz - mv[2] * uy, ry = mv[2] * ux - mv[0] * uz, rz = mv[0] * uy - mv[1] * ux; // right = m x up
      moon.limbAngle = mod(Math.atan2(tx * rx + ty * ry + tz * rz, tx * ux + ty * uy + tz * uz) * R2D, 360);
    }

    // appearance
    const phase = phaseOf(sun.alt);
    const eff = this.mode === 'night' ? Math.min(sun.alt, -30) : this.mode === 'day' ? Math.max(sun.alt, 32) : sun.alt;
    sky.phase = phase; sky.look = phaseOf(eff); sky.sunAltEffective = eff;
    sky.isDay = eff > -0.833;
    skyColours(eff, sky);
    const moonLight = moon.illumination * smooth(-4, 25, moon.alt);
    const dark = 1 - smooth(-14, -4, eff);
    for (let k = 0; k < 3; k++) {            // moonlight lifts a dark sky a little
      sky.zenith[k] += dark * moonLight * (k === 2 ? 22 : 10 + k * 3);
      sky.horizon[k] += dark * moonLight * (k === 2 ? 30 : 14 + k * 4);
      sky.ground[k] = sky.horizon[k] * 0.16 + (k === 2 ? 9 : 4 + k);
    }
    const low = 1 - smooth(0, 14, eff);      // the sun reddens near the horizon
    sky.sunColour[0] = 255; sky.sunColour[1] = 250 - 104 * low; sky.sunColour[2] = 236 - 150 * low;
    sky.ambient = clamp(0.04 + 0.1 * moonLight + 0.86 * smooth(-8, 12, eff), 0, 1);
    let lim = eff >= -0.5 ? -3 : eff >= -6 ? -3 + (-0.5 - eff) / 5.5 * 4.5 : eff >= -12 ? 1.5 + (-6 - eff) / 6 * 3 : eff >= -18 ? 4.5 + (-12 - eff) / 6 * 2 : 6.5;
    lim -= 0.9 * moonLight;
    sky.limitingMagnitude = lim;
    sky.starVisibility = smooth(-1, -9, eff);
    sky.milkyWay = this.lowData ? 0 : clamp((lim - 5) / 1.4, 0, 1);

    // stars
    if (st) {
      const eq = st.eq, enu = st.enu, n = st.count, al = st.alpha, mag = st.mag;
      const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
      const nearMoon = moon.up ? 2.5 * moon.illumination : 0;
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        const x = eq[j], y = eq[j + 1], z = eq[j + 2];
        const e = m0 * x + m1 * y + m2 * z, nn = m3 * x + m4 * y + m5 * z, u = m6 * x + m7 * y + m8 * z;
        enu[j] = e; enu[j + 1] = nn; enu[j + 2] = u;
        if (u <= 0 || lim < -2) { al[i] = 0; continue; }
        let m = mag[i] + 0.22 * (1 / (u + 0.025 * Math.exp(-11 * u)) - 1);       // extinction
        if (nearMoon) { const d = e * mv[0] + nn * mv[1] + u * mv[2]; if (d > 0.9) m += nearMoon * (d - 0.9) * 10; }
        al[i] = clamp((lim - m) / 1.5, 0, 1);
      }
    }
    // planets
    {
      const pl = this.planets, q = this._pl;
      for (let i = 0, j = 0; i < 7; i++, j += 3) {
        planetPosition(i, t, q);
        const x = q.vec[0], y = q.vec[1], z = q.vec[2];
        const e = M[0] * x + M[1] * y + M[2] * z, nn = M[3] * x + M[4] * y + M[5] * z, u = M[6] * x + M[7] * y + M[8] * z;
        pl.eq[j] = x; pl.eq[j + 1] = y; pl.eq[j + 2] = z; pl.enu[j] = e; pl.enu[j + 1] = nn; pl.enu[j + 2] = u;
        pl.mag[i] = q.mag; pl.elongation[i] = q.elongation; pl.distAU[i] = q.distAU;
        pl.alt[i] = Math.asin(clamp(u, -1, 1)) * R2D; pl.az[i] = mod(Math.atan2(e, nn) * R2D, 360);
        pl.radius[i] = 0.9 + 2.1 * Math.pow(10, -0.16 * (Math.max(q.mag, -4.6) + 1.5));
        // a planet close to the sun is lost in its glare: lift the limit needed by up to 4 magnitudes inside 12 degrees
        const glare = sun.up || eff > -6 ? 4 * (1 - smooth(4, 14, q.elongation)) : 0;
        pl.alpha[i] = u <= 0 ? 0 : clamp((lim - glare - (q.mag + 0.22 * (1 / (u + 0.025 * Math.exp(-11 * u)) - 1))) / 1.5, 0, 1);
      }
    }
    const mw = this.milkyWay;
    for (let i = 0, j = 0; i < mw.count; i++, j += 3) {
      const x = mw.eq[j], y = mw.eq[j + 1], z = mw.eq[j + 2];
      mw.enu[j] = M[0] * x + M[1] * y + M[2] * z; mw.enu[j + 1] = M[3] * x + M[4] * y + M[5] * z; mw.enu[j + 2] = M[6] * x + M[7] * y + M[8] * z;
    }

    this.version++;
    const first = this._prevPhase === null;
    const pPhase = this._prevPhase, pDay = this._prevDay, pUp = this._prevUp;
    this._prevPhase = sky.look; this._prevDay = sky.isDay; this._prevUp = sun.up;
    if (!first) {
      if (pPhase !== sky.look) this.emit('phase', sky.look);
      if (pDay !== sky.isDay) this.emit('daynight', sky.isDay ? 'day' : 'night');
      if (pUp !== sun.up) this.emit(sun.up ? 'sunrise' : 'sunset', sun.up);
    }
    this.emit('update', null);
    return true;
  }

  /** J2000 equatorial -> local [east, north, up] for an extra rotation of the sky (degrees of sidereal angle). */
  matrixAt(extraDeg, out) {
    return mul3(horizonMatrix(this.lst + extraDeg, this.lat, this._H2 || (this._H2 = new Float64Array(9))), this._P, out);
  }

  /**
   * The data API: everything a renderer needs, for the current state. The returned object and its
   * typed arrays are reused between calls; copy what you need to keep.
   */
  getData() {
    this.update();
    return this._data || (this._data = {
      model: this, get time() { return this.model.time; }, get lat() { return this.model.lat; }, get lon() { return this.model.lon; },
      get lst() { return this.model.lst; }, sun: this.sun, moon: this.moon, sky: this.sky,
      get stars() { return this.model.stars; }, planets: this.planets, get constellations() { return this.model.constellations; },
      milkyWay: this.milkyWay, matrix: this.matrix, threeMatrix: this.threeMatrix
    });
  }

  /** Convenience (allocates): the stars above the horizon and bright enough to see right now. */
  visibleStars(minAlpha) {
    this.update();
    const s = this.stars, out = [], min = minAlpha == null ? 0.02 : minAlpha;
    for (let i = 0; i < s.count; i++) if (s.alpha[i] > min) {
      out.push({ index: i, name: s.names[i] || '', dir: [s.enu[i * 3], s.enu[i * 3 + 1], s.enu[i * 3 + 2]], mag: s.mag[i], bv: s.bv[i],
        colour: [s.colour[i * 3], s.colour[i * 3 + 1], s.colour[i * 3 + 2]], alpha: s.alpha[i], radius: s.radius[i], real: !!s.real[i] });
    }
    return out;
  }
}

/** One-shot data for a time and place: skyData({ time, lat, lon, catalog }). */
export function skyData(o) { return new SkyModel(o).getData(); }

/* ------------------------------------------------------------------ 2D canvas renderer */

const STAR_CSS = BV_RGB.map((c) => 'rgb(' + c.join(',') + ')');
const PLANET_CSS = PLANET_RGB.map((c) => 'rgb(' + c.join(',') + ')');
const hasDOM = typeof document !== 'undefined';

function sprite(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

function media(q) { return hasDOM && window.matchMedia ? window.matchMedia(q) : null; }
const rgb = (c, a) => 'rgba(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ',' + a + ')';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class SkyCanvas extends Emitter {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {SkyModel} model
   * @param {object} [o]
   * @param {number|'auto'} [o.azimuth] centre of view; 'auto' faces the equator (the pole in trails mode)
   * @param {number} [o.tilt] degrees to raise the view above its resting position, to look higher (0..80)
   * @param {number} [o.fov] horizontal field of view in degrees (default 100)
   * @param {number} [o.horizon] where the horizon sits, as a fraction of the height from the bottom (default 0.1)
   * @param {boolean} [o.trails] long-exposure star trails
   * @param {number} [o.trailSpeed] degrees of sky rotation per second in trails mode (default 1.2)
   * @param {boolean} [o.constellations] stick figures and names
   * @param {boolean} [o.planets] draw the planets (default true)
   * @param {boolean} [o.names] label the planets and the brightest stars (planetarium mode turns this on)
   * @param {boolean} [o.ground] hills along the horizon (default true)
   * @param {boolean} [o.labels] compass points on the horizon (default true)
   * @param {boolean} [o.milkyWay] (default true)
   * @param {boolean|'free'} [o.drag] drag to look around (default true; 'free' = both ways on touch too)
   * @param {number} [o.maxDpr] (default 2)
   * @param {number} [o.fps] (default 20)
   * @param {boolean|'auto'} [o.reducedMotion] 'auto' follows prefers-reduced-motion
   * @param {boolean|'auto'} [o.lowData] 'auto' follows Save-Data / prefers-reduced-data
   */
  constructor(canvas, model, o) {
    super();
    o = o || {};
    this.canvas = canvas; this.model = model; this.ctx = canvas.getContext('2d');
    this.fov = o.fov || 100;
    this.horizon = o.horizon != null ? o.horizon : 0.1;
    this.trails = !!o.trails; this.trailSpeed = o.trailSpeed || 1.2;
    this.constellations = !!o.constellations;
    this.planets = o.planets !== false; this.names = !!o.names; this.strings = o.strings || null;
    this.ground = o.ground !== false; this.labels = o.labels !== false; this.milkyWay = o.milkyWay !== false;
    this.maxDpr = o.maxDpr || 2; this.fps = o.fps || 20;
    this._autoAz = o.azimuth == null || o.azimuth === 'auto';
    this.azimuth = this._autoAz ? 0 : mod(+o.azimuth, 360);
    this.tilt = clamp(+o.tilt || 0, 0, 90);

    const mq = media('(prefers-reduced-motion: reduce)'), md = media('(prefers-reduced-data: reduce)');
    const conn = typeof navigator !== 'undefined' && navigator.connection;
    this._rmAuto = o.reducedMotion == null || o.reducedMotion === 'auto';
    this.reducedMotion = this._rmAuto ? !!(mq && mq.matches) : !!o.reducedMotion;
    const ldAuto = o.lowData == null || o.lowData === 'auto';
    this.lowData = ldAuto ? !!((md && md.matches) || (conn && conn.saveData)) : !!o.lowData;
    if (this.lowData) model.setLowData(true);

    this.w = 0; this.h = 0; this.dpr = 1;
    this._travel = null; this._blur = 0; this._blurPx = 0; this._sense = null;
    this._raf = 0; this._last = 0; this._visible = true; this._needs = true; this._destroyed = false;
    this._bgV = -1; this._bg = null; this._trailAngle = 0; this._trailKey = '';
    this._cam = new Float64Array(9); this._scale = 1; this._alt0 = 0; this._p = new Float64Array(3);
    this._Mt = new Float64Array(9);
    this._glow = STAR_CSS.map((_, i) => sprite(64, [0, rgb(BV_RGB[i], 1), 0.12, rgb(BV_RGB[i], 0.55), 0.4, rgb(BV_RGB[i], 0.1), 1, rgb(BV_RGB[i], 0)]));
    this._haze = sprite(96, [0, 'rgba(196,208,255,0.9)', 0.35, 'rgba(180,196,255,0.4)', 1, 'rgba(170,190,255,0)']);
    this._trail = document.createElement('canvas'); this._tctx = this._trail.getContext('2d');
    this._px = new Float32Array(0); this._py = new Float32Array(0);

    this._frame = this._frame.bind(this);
    this._off = [];
    const listen = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); this._off.push(() => t.removeEventListener(ev, fn, opt)); };
    this._off.push(model.on('change', () => { this._wake(); }));
    listen(document, 'visibilitychange', () => this._wake());
    if (mq && this._rmAuto) {
      const f = () => { this.reducedMotion = mq.matches; this._clearTrails(); this._wake(); };
      if (mq.addEventListener) listen(mq, 'change', f);
    }
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((en) => { this._visible = en[en.length - 1].isIntersecting; this._wake(); });
      this._io.observe(canvas);
    }
    if ('ResizeObserver' in window) { this._ro = new ResizeObserver(() => { this._sized = false; this._wake(); }); this._ro.observe(canvas); }
    else listen(window, 'resize', () => { this._sized = false; this._wake(); });

    {
      let id = -1, x0 = 0, a0 = 0, y0 = 0, t0 = 0;
      listen(canvas, 'pointerdown', (e) => { if (!this.drag) return; id = e.pointerId; x0 = e.clientX; a0 = this.azimuth; y0 = e.clientY; t0 = this.tilt; try { canvas.setPointerCapture(id); } catch (err) { /* fine */ } canvas.style.cursor = 'grabbing'; });
      listen(canvas, 'pointermove', (e) => {
        if (e.pointerId !== id) return;
        this.setAzimuth(a0 - (e.clientX - x0) * this.dpr / this._scale * R2D);
        // up and down too, but not for touch: a vertical swipe there must keep scrolling the page
        if (e.pointerType !== 'touch' || this.drag === 'free') this.setTilt(t0 + (e.clientY - y0) * this.dpr / this._scale * R2D);
      });
      const end = (e) => { if (e.pointerId === id) { id = -1; canvas.style.cursor = this.drag ? 'grab' : ''; } };
      listen(canvas, 'pointerup', end); listen(canvas, 'pointercancel', end);
      this._dragEnd = () => { id = -1; };
    }
    this.drag = false;
    this.setDrag(o.drag === 'free' ? 'free' : o.drag !== false);
    // a still frame keeps up with the clock without animating
    this._tick = setInterval(() => { if (!this._animFps() && this.model.live) this.invalidate(); }, 30000);
    this._wake();
  }

  /* ---------- controls ---------- */

  setAzimuth(az) {
    this._autoAz = false; az = mod(+az, 360);
    if (az !== this.azimuth) { this.azimuth = az; this._clearTrails(); this.invalidate(); this.emit('view', az); }
    return this;
  }
  /**
   * Opt-in: aim the view by pointing the device at the sky, using its compass and tilt sensors.
   * Call it from a click (iOS only shows its permission prompt for a user gesture). The readings are
   * used to turn the view on this page and nothing else. Pass false to stop.
   * Resolves to true/false (now following or not); rejects with an Error whose `code` is
   * 'unsupported' or 'denied'.
   */
  async followDevice(on) {
    if (on === false) {
      if (this._sense) { window.removeEventListener(this._sense.type, this._sense.fn); this._sense = null; this.emit('option', 'follow'); }
      return false;
    }
    if (this._sense) return true;
    const fail = (code, msg) => { const e = new Error(msg); e.code = code; throw e; };
    const DOE = typeof window !== 'undefined' && window.DeviceOrientationEvent;
    if (!DOE) fail('unsupported', 'This device has no motion sensors the page can use.');
    if (typeof DOE.requestPermission === 'function') {
      let ans = 'denied';
      try { ans = await DOE.requestPermission(); } catch (e) { /* treated as denied */ }
      if (ans !== 'granted') fail('denied', 'Motion and compass access was not given.');
    }
    const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    let got = false;
    const fn = (e) => {
      // compass heading of the device: iOS reports it directly, others give an absolute alpha
      const alpha = typeof e.webkitCompassHeading === 'number' ? 360 - e.webkitCompassHeading : (e.absolute || type === 'deviceorientationabsolute') ? e.alpha : null;
      if (alpha == null || e.beta == null || e.gamma == null) return;
      got = true;
      const a = alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
      const sA = Math.sin(a), cA = Math.cos(a), sB = Math.sin(b), cB = Math.cos(b), sG = Math.sin(g), cG = Math.cos(g);
      // where the back of the device points, in [east, north, up]
      const x = -(cG * sA * sB + cA * sG), y = -(sA * sG - cA * cG * sB), z = -cB * cG;
      const az = mod(Math.atan2(x, y) * R2D, 360), alt = Math.asin(clamp(z, -1, 1)) * R2D;
      const base = (this._alt0 * R2D) - this.tilt;                       // resting altitude of the view centre
      const dAz = mod(az - this.azimuth + 180, 360) - 180, want = clamp(alt - base, 0, 90);
      this.setAzimuth(this.azimuth + dAz * 0.25); this.setTilt(this.tilt + (want - this.tilt) * 0.25);
    };
    window.addEventListener(type, fn);
    this._sense = { type, fn };
    this._off.push(() => window.removeEventListener(type, fn));
    this.emit('option', 'follow');
    // a desktop browser has the event but never fires it: give up quietly after a moment
    await new Promise((r) => setTimeout(r, 1200));
    if (!got) { this.followDevice(false); fail('unsupported', 'This device is not reporting a compass direction.'); }
    return true;
  }
  /** True while the view is following the device's sensors. */
  get following() { return !!this._sense; }
  /** Look higher: degrees to raise the view above its resting position (0..80). */
  setTilt(deg) {
    deg = clamp(+deg || 0, 0, 90);
    if (deg !== this.tilt) { this.tilt = deg; this._clearTrails(); this.invalidate(); this.emit('view', this.azimuth); }
    return this;
  }
  setTrails(v) { this.trails = !!v; this._clearTrails(); this._wake(); this.emit('option', 'trails'); return this; }
  /**
   * Drag to look around. true: sideways on touch (so a vertical swipe still scrolls the page), both ways
   * with a mouse. 'free': both ways on touch too, like a 360 view; the page does not scroll from the canvas
   * while this is on, so use it for a mode the visitor chose (planetarium mode does). false: off.
   */
  setDrag(v) {
    this.drag = v === 'free' ? 'free' : !!v; this._dragEnd();
    this.canvas.style.touchAction = this.drag === 'free' ? 'none' : this.drag ? 'pan-y' : ''; this.canvas.style.cursor = this.drag ? 'grab' : '';
    return this;
  }
  /** Show or hide the compass letters on the horizon. */
  setLabels(v) { this.labels = !!v; this.invalidate(); return this; }
  /**
   * Words for the labels the canvas draws, for another language (sky-strings.js fills this in).
   * { compass: [8 points from north, clockwise], planets: [7], stars: { 'Sirius': '...' }, figures: { Ori: '...' } };
   * anything missing stays English. Pass null to go back to English.
   */
  setStrings(s) { this.strings = s || null; this.invalidate(); return this; }
  /** Label the planets and the brightest stars. */
  setNames(v) { this.names = !!v; this.invalidate(); this.emit('option', 'names'); return this; }
  setConstellations(v) { this.constellations = !!v; this.invalidate(); this.emit('option', 'constellations'); return this; }
  setReducedMotion(v) { this._rmAuto = false; this.reducedMotion = !!v; this._clearTrails(); this._wake(); return this; }
  setLowData(v) { this.lowData = !!v; this.model.setLowData(this.lowData); this._clearTrails(); this._wake(); return this; }
  /**
   * The time-machine effect: wind the sky from the current time to another one, blurred while it moves,
   * then settle. The duration grows with the size of the jump but only gently (about 0.6 s for an hour,
   * 1.1 s for a day, capped at 2.4 s). Long jumps do not spin through every day in between: the sky
   * skips to the last day or so before the target and winds in from there, so it never strobes.
   * With reduced motion or low data it simply jumps. If the canvas is off screen or the tab is hidden,
   * the animation waits and plays when the sky is next seen.
   * Pass `{ live: true }` (or time = 'now') to end following the real clock.
   * @returns {Promise<void>} resolves when the sky has arrived
   */
  travelTo(time, o) {
    o = o || {};
    const m = this.model, live = o.live || time === 'now', to = live ? Date.now() : +new Date(time);
    const arrive = () => { this._travel = null; this._blur = 0; this.canvas.style.filter = ''; if (live) m.now(); else m.setTime(to); this.emit('travel', 'end'); };
    if (this._travel) { const r = this._travel.resolve; this._travel = null; r(); }
    const delta = to - m.time, span = Math.abs(delta), DAY = 86400e3;
    if (isNaN(to) || this.reducedMotion || this.lowData || span < 60e3) {
      if (!isNaN(to)) arrive();
      return Promise.resolve();
    }
    const from = span <= 2 * DAY ? m.time : to - Math.sign(delta) * (DAY + span % DAY);
    const dur = o.duration || clamp(500 + 450 * Math.log10(1 + span / 3600e3), 500, 2400);
    this.emit('travel', 'start');
    return new Promise((resolve) => {
      this._travel = { from, to, el: 0, dur, resolve: () => { arrive(); resolve(); } };
      m.live = false; m.time = from; m.update(true);
      this._wake();
    });
  }
  /** Ask for one redraw. */
  invalidate() { this._needs = true; this._wake(); }
  destroy() {
    this._destroyed = true; this._travel = null; this.canvas.style.filter = ''; cancelAnimationFrame(this._raf); clearInterval(this._tick);
    if (this._io) this._io.disconnect(); if (this._ro) this._ro.disconnect();
    for (const f of this._off) f();
  }

  /* ---------- loop ---------- */

  /** Frames per second wanted right now; 0 means draw only on demand. */
  _animFps() {
    const m = this.model, running = !m.live && m.rate !== 0 && m.rate !== 1;
    if (this._travel) return 60;
    if (this.reducedMotion || this.lowData) return running ? 4 : 0;
    return (running || this.trails) ? 30 : this.fps;
  }
  _wake() {
    if (this._destroyed || this._raf || document.hidden || !this._visible) return;
    if (this._animFps() || this._needs) this._raf = requestAnimationFrame(this._frame);
  }
  _frame(ts) {
    this._raf = 0;
    const fps = this._animFps();
    if (document.hidden || !this._visible || this._destroyed) { this._last = 0; return; }
    if (fps) this._raf = requestAnimationFrame(this._frame);
    if (fps && !this._needs && this._last && ts - this._last < 1000 / fps - 2) return;
    const dt = this._last && fps ? Math.min(250, ts - this._last) : 0;
    this._last = fps ? ts : 0;
    const tr = this._travel;
    if (tr) {
      tr.el += Math.min(dt, 60);       // elapsed only counts while frames are drawn, so it waits if scrolled away
      const k = clamp(tr.el / tr.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // ease in-out
      const m = this.model;
      m.live = false; m.time = tr.from + (tr.to - tr.from) * e; m.update(true);
      this._blur = Math.sin(Math.PI * k);
      const px = Math.round(this._blur * 6) / 2;
      if (px !== this._blurPx) { this._blurPx = px; this.canvas.style.filter = px ? 'blur(' + px + 'px)' : ''; }
      this._needs = false;
      this.draw(ts, dt);
      if (k >= 1) { this._blurPx = 0; tr.resolve(); }
      return;
    }
    this.model.advance(dt);
    this._needs = false;
    this.draw(ts, dt);
  }

  /* ---------- geometry ---------- */

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    this._sized = true;
    if (w === this.w && h === this.h) return;
    this.w = this.canvas.width = w; this.h = this.canvas.height = h; this.dpr = dpr;
    this._trail.width = w; this._trail.height = h;
    this._bgV = -1; this._clearTrails();
  }

  _camera() {
    const w = this.w, h = this.h;
    if (this._autoAz) {
      const pole = this.model.lat >= 0 ? 0 : 180, az = this.trails ? pole : 180 - pole;
      if (az !== this.azimuth) { this.azimuth = az; this._clearTrails(); this.emit('view', az); }
    }
    const effW = Math.max(w, 1.6 * h);
    const s = this._scale = (effW / 2) / (2 * Math.tan(this.fov * D2R / 4));
    const alt0 = this._alt0 = Math.min(89 * D2R, 2 * Math.atan(Math.max(0, h * (0.5 - this.horizon)) / (2 * s)) + this.tilt * D2R);
    const az = this.azimuth * D2R, c = this._cam, sa = Math.sin(az), ca = Math.cos(az), s0 = Math.sin(alt0), c0 = Math.cos(alt0);
    c[0] = ca; c[1] = -sa; c[2] = 0;                 // right
    c[3] = -sa * s0; c[4] = -ca * s0; c[5] = c0;     // up
    c[6] = sa * c0; c[7] = ca * c0; c[8] = s0;       // forward
  }

  /** Project a local [east, north, up] direction to canvas pixels in this._p; false if behind the view. */
  _project(e, n, u) {
    const c = this._cam, z = c[6] * e + c[7] * n + c[8] * u;
    if (z < -0.86) return false;
    const k = 2 * this._scale / (1 + z), p = this._p;
    p[0] = this.w / 2 + (c[0] * e + c[1] * n) * k;
    p[1] = this.h / 2 - (c[3] * e + c[4] * n + c[5] * u) * k;
    p[2] = z;
    return true;
  }
  _projectAltAz(alt, az) {
    const ca = Math.cos(alt * D2R);
    return this._project(ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R));
  }

  _clearTrails() { this._trailV = -1; if (this._tctx) this._tctx.clearRect(0, 0, this._trail.width, this._trail.height); this._pOK = false; this._trailAngle = 0; }

  /* ---------- drawing ---------- */

  draw(ts, dt) {
    if (!this._sized) this._resize();
    this._camera();
    const ctx = this.ctx, w = this.w, h = this.h, m = this.model, sky = m.sky, dpr = this.dpr, p = this._p;
    const still = this.reducedMotion || this.lowData;
    ts = ts || 0;

    // sky gradient (rebuilt only when the light or the size changes)
    const y0 = h / 2 + 2 * this._scale * Math.tan(this._alt0 / 2);        // horizon at the centre column
    if (m.version !== this._bgV || w !== this._bgW || h !== this._bgH) {
      this._bgV = m.version; this._bgW = w; this._bgH = h; this._glowR = -1; this._sunG = -1;
      const hzg = this._hz = ctx.createLinearGradient(0, y0 - 0.16 * this._scale, 0, y0);
      hzg.addColorStop(0, rgb(sky.horizon, 0)); hzg.addColorStop(1, rgb(sky.horizon, 0.5));
      const yz = h / 2 - 2 * this._scale * Math.tan((Math.PI / 2 - this._alt0) / 2);
      const g = this._bg = ctx.createLinearGradient(0, y0, 0, yz), z = sky.zenith, hz = sky.horizon;
      const stop = (alt, t) => {
        const y = h / 2 - 2 * this._scale * Math.tan((alt * D2R - this._alt0) / 2);
        g.addColorStop(clamp((y0 - y) / (y0 - yz), 0, 1), rgb([hz[0] + (z[0] - hz[0]) * t, hz[1] + (z[1] - hz[1]) * t, hz[2] + (z[2] - hz[2]) * t], 1));
      };
      stop(0, 0); stop(4, 0.24); stop(12, 0.52); stop(30, 0.8); stop(60, 0.95); stop(90, 1);
      this._glowA = rgb(sky.glow, 1); this._glowB = rgb(sky.glow, 0.4); this._glowC = rgb(sky.glow, 0);
      this._groundCss = rgb(sky.ground, 1);
      this._sunCss = rgb(sky.sunColour, 1); this._sunCssB = rgb(sky.sunColour, 0.35); this._sunCss0 = rgb(sky.sunColour, 0);
    }
    // while time-travelling the old frames are only partly painted over, which smears the motion
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - 0.72 * (this._blur || 0);
    ctx.fillStyle = this._bg; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // glow on the sun's side of the sky: a wide flat band in twilight, a round aureole by day
    const sun = m.sun, sv = sun.vec, eff = sky.sunAltEffective;
    const sunShown = m.mode === 'auto' || (m.mode === 'day' && sun.up);
    if (sky.glowStrength > 0.01 && sunShown && this._projectAltAz(Math.max(sun.alt, 0), sun.az)) {
      const facing = clamp((p[2] + 0.5) / 0.9, 0, 1), flat = 0.4 + 0.6 * smooth(0, 14, eff);
      if (facing > 0) {
        const R = Math.max(w, h) * (0.85 - 0.3 * smooth(4, 30, eff));
        ctx.save();
        ctx.translate(p[0], p[1]); ctx.scale(1, flat);
        if (R !== this._glowR) {
          this._glowR = R;
          const g = this._glowG = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          g.addColorStop(0, this._glowA); g.addColorStop(0.3, this._glowB); g.addColorStop(1, this._glowC);
        }
        ctx.globalAlpha = sky.glowStrength * facing * 0.95;
        ctx.fillStyle = this._glowG; ctx.fillRect(-R, -R, 2 * R, 2 * R);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }

    // Milky Way
    const mw = m.milkyWay;
    if (this.milkyWay && sky.milkyWay > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const en = mw.enu, pxDeg = this._scale * D2R;
      for (let i = 0, j = 0; i < mw.count; i++, j += 3) {
        const u = en[j + 2];
        if (u < -0.05 || !this._project(en[j], en[j + 1], u)) continue;
        const r = mw.size[i] * pxDeg * 2 / (1 + p[2]);
        if (p[0] < -r || p[0] > w + r || p[1] < -r || p[1] > h + r) continue;
        ctx.globalAlpha = 0.075 * sky.milkyWay * mw.weight[i] * clamp(u * 6 + 0.3, 0, 1);
        ctx.drawImage(this._haze, p[0] - r, p[1] - r, 2 * r, 2 * r);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // stars
    const st = m.stars;
    if (st && sky.starVisibility > 0) {
      if (this.trails) this._drawTrails(dt || 0, still);
      else this._drawStars(ts, still);
      if (this.constellations && !this.trails) this._drawFigures();
    }
    if (this.planets && !this.trails) this._drawPlanets();

    // moon
    const moon = m.moon, mv = moon.vec;
    if (moon.alt > -1.5 && this._project(mv[0], mv[1], mv[2])) {
      const x = p[0], y = p[1], R = Math.max(7 * dpr, this._scale * 0.017);
      // where is the sun from here, on screen? (the projection is conformal, so this is the true limb direction)
      const d = sv[0] * mv[0] + sv[1] * mv[1] + sv[2] * mv[2], q = 0.02;
      let ang = 0;
      if (this._project(mv[0] + q * (sv[0] - d * mv[0]), mv[1] + q * (sv[1] - d * mv[1]), mv[2] + q * (sv[2] - d * mv[2]))) ang = Math.atan2(p[1] - y, p[0] - x);
      const k = moon.illumination, night = 1 - smooth(-8, 2, eff);
      if (night > 0 && k > 0.03) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * night * k;
        ctx.drawImage(this._glow[2], x - R * 7, y - R * 7, R * 14, R * 14);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this._bgAt(night); ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();   // unlit side, with a little earthshine
      ctx.globalAlpha = 0.55 + 0.45 * night;
      ctx.fillStyle = 'rgb(240,238,230)';
      ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2);
      const rx = R * Math.abs(1 - 2 * k);
      if (k < 0.5) ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, true);
      else ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, 1.5 * Math.PI, false);
      ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
    }

    // sun
    if (sunShown && sun.alt > -1.5 && this._project(sv[0], sv[1], sv[2])) {
      const x = p[0], y = p[1], R = Math.max(6 * dpr, this._scale * 0.014), G = R * 9;
      if (G !== this._sunG) {
        this._sunG = G;
        const g = this._sunGrad = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, G);
        g.addColorStop(0, this._sunCss); g.addColorStop(0.12, this._sunCssB); g.addColorStop(1, this._sunCss0);
      }
      ctx.save(); ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = this._sunGrad; ctx.fillRect(-G, -G, 2 * G, 2 * G);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this._sunCss; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    this._drawGround(y0);
  }

  _bgAt(night) { return night > 0.5 ? 'rgb(34,40,58)' : 'rgba(150,170,200,0.25)'; }

  _drawStars(ts, still) {
    const ctx = this.ctx, st = this.model.stars, en = st.enu, al = st.alpha, n = st.count, w = this.w, h = this.h, dpr = this.dpr, p = this._p;
    const t = ts * 0.001, tw = !still;
    let bucket = -1;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      let a = al[i];
      if (a <= 0.01 || !this._project(en[j], en[j + 1], en[j + 2])) continue;
      const x = p[0], y = p[1];
      if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
      const mag = st.mag[i];
      a *= clamp(1.25 - 0.11 * mag, 0.45, 1);
      if (tw) a *= 1 - (0.1 + 0.3 * (1 - en[j + 2])) * (0.5 + 0.5 * Math.sin(t * (2.2 + (i % 7) * 0.45) + st.twinkle[i]));
      const b = st.bucket[i], r = st.radius[i] * dpr;
      if (b !== bucket) { ctx.fillStyle = STAR_CSS[b]; bucket = b; }
      ctx.globalAlpha = a;
      if (r < 1.3) ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      else { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
      if (mag < 2.2) {
        const gr = r * (5 - mag);
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(this._glow[b], x - gr, y - gr, 2 * gr, 2 * gr);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Long exposure. The trail canvas accumulates; each frame joins every star's last position to its new one. */
  _drawTrails(dt, still) {
    const m = this.model, st = m.stars, n = st.count, t = this._tctx, w = this.w, h = this.h, dpr = this.dpr, p = this._p, eq = st.eq, M = this._Mt;
    if (this._px.length < n) { this._px = new Float32Array(n); this._py = new Float32Array(n); this._pOK = false; }
    const px = this._px, py = this._py;
    t.lineCap = 'round';
    if (still) {
      // no animation: draw a finished exposure once per state
      if (m.version !== this._trailV) {
        this._trailV = m.version;
        t.clearRect(0, 0, w, h); t.globalCompositeOperation = 'lighter';
        const steps = 16, arc = 30;
        for (let k = 0; k <= steps; k++) {
          m.matrixAt(-arc * (1 - k / steps), M);
          for (let i = 0; i < n; i++) {
            const a = st.alpha[i];
            if (a <= 0.05) continue;
            const ok = this._seg(eq, M, i);
            if (ok && k > 0 && px[i] > -1e8) {
              t.strokeStyle = STAR_CSS[st.bucket[i]]; t.globalAlpha = a * 0.55; t.lineWidth = st.radius[i] * dpr * 0.9;
              t.beginPath(); t.moveTo(px[i], py[i]); t.lineTo(p[0], p[1]); t.stroke();
            }
            px[i] = ok ? p[0] : -1e9; py[i] = p[1];
          }
        }
      }
    } else {
      this._trailAngle += this.trailSpeed * dt / 1000;
      m.matrixAt(this._trailAngle, M);
      t.globalCompositeOperation = 'destination-out'; t.globalAlpha = 1;
      t.fillStyle = 'rgba(0,0,0,0.018)'; t.fillRect(0, 0, w, h);
      t.globalCompositeOperation = 'lighter';
      const had = this._pOK, max = 80 * dpr;
      for (let i = 0; i < n; i++) {
        const a = st.alpha[i];
        if (a <= 0.05) { px[i] = -1e9; continue; }
        const ok = this._seg(eq, M, i);
        if (ok && had && px[i] > -1e8) {
          const dx = p[0] - px[i], dy = p[1] - py[i];
          if (dx < max && dx > -max && dy < max && dy > -max && p[0] > -40 && p[0] < w + 40 && p[1] > -40 && p[1] < h + 40) {
            t.strokeStyle = STAR_CSS[st.bucket[i]]; t.globalAlpha = a * 0.6; t.lineWidth = st.radius[i] * dpr * 0.9;
            t.beginPath(); t.moveTo(px[i], py[i]); t.lineTo(p[0] + (dx > 0 ? 0.3 : -0.3), p[1]); t.stroke();
          }
        }
        px[i] = ok ? p[0] : -1e9; py[i] = p[1];
      }
      this._pOK = true;
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.model.sky.starVisibility;
    ctx.drawImage(this._trail, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  /* Planets are steady discs (no twinkle); names for them and the brightest stars when this.names is on. */
  _drawPlanets() {
    const ctx = this.ctx, m = this.model, pl = m.planets, p = this._p, dpr = this.dpr, w = this.w, h = this.h;
    const named = this.names, S = this.strings;
    if (named) {
      ctx.font = '600 ' + Math.round(12 * dpr) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    }
    for (let i = 0, j = 0; i < 7; i++, j += 3) {
      // with names on, a planet that is up is always marked, even when too faint or in daylight
      const up = pl.enu[j + 2] > 0.01, a = named && up ? Math.max(pl.alpha[i], 0.55) : pl.alpha[i];
      if (a <= 0.02 || !this._project(pl.enu[j], pl.enu[j + 1], pl.enu[j + 2])) continue;
      const x = p[0], y = p[1];
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const r = pl.radius[i] * dpr * 1.15;
      ctx.fillStyle = PLANET_CSS[i]; ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      if (pl.mag[i] < 2.5 && pl.alpha[i] > 0.05) { ctx.globalAlpha = a * 0.45; const g = r * 4.5; ctx.drawImage(this._glow[3], x - g, y - g, 2 * g, 2 * g); }
      if (named) {
        ctx.globalAlpha = 0.5; ctx.strokeStyle = PLANET_CSS[i]; ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.arc(x, y, r + 5 * dpr, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 0.95; ctx.fillStyle = 'rgb(236,240,250)';
        ctx.fillText((S && S.planets ? S.planets[i] : '') || pl.names[i], x + r + 9 * dpr, y);
      }
    }
    if (named && m.sky.starVisibility > 0.3) {
      const st = m.stars, en = st.enu;
      ctx.font = '500 ' + Math.round(11 * dpr) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgb(196,210,240)';
      for (const k in st.names) {
        if (st.mag[k] > 1.6 || st.alpha[k] < 0.3) continue;
        const j = k * 3;
        if (!this._project(en[j], en[j + 1], en[j + 2])) continue;
        if (p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h) continue;
        ctx.globalAlpha = 0.7 * m.sky.starVisibility;
        ctx.fillText((S && S.stars && S.stars[st.names[k]]) || st.names[k], p[0] + 7 * dpr, p[1] - 7 * dpr);
      }
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }

  /* project star i under matrix M into this._p; false if not drawable */
  _seg(eq, M, i) {
    const j = i * 3, x = eq[j], y = eq[j + 1], z = eq[j + 2], u = M[6] * x + M[7] * y + M[8] * z;
    return u > 0.005 && this._project(M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, u);
  }

  _drawFigures() {
    const S = this.strings;
    const ctx = this.ctx, m = this.model, st = m.stars, en = st.enu, p = this._p, dpr = this.dpr, vis = m.sky.starVisibility;
    ctx.lineWidth = dpr; ctx.strokeStyle = 'rgb(150,180,235)'; ctx.fillStyle = 'rgb(196,210,240)';
    ctx.font = '500 ' + Math.round(11 * dpr) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    for (const c of m.constellations) {
      let sx = 0, sy = 0, cnt = 0, up = 0;
      ctx.globalAlpha = 0.34 * vis;
      ctx.beginPath();
      for (const path of c.paths) {
        let pen = false;
        for (let k = 0; k < path.length; k++) {
          const j = path[k] * 3;
          if (en[j + 2] < -0.12 || !this._project(en[j], en[j + 1], en[j + 2]) || p[2] < -0.3) { pen = false; continue; }
          if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          pen = true; sx += p[0]; sy += p[1]; cnt++; if (en[j + 2] > 0.03) up++;
        }
      }
      ctx.stroke();
      if (cnt > 1 && up * 2 >= cnt) {
        ctx.globalAlpha = 0.6 * vis;
        ctx.fillText((S && S.figures && S.figures[c.id]) || c.name, sx / cnt, sy / cnt - 10 * dpr);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawGround(y0) {
    const S = this.strings;
    const ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr, p = this._p, s = this._scale, a0 = this._alt0;
    // haze just above the horizon
    ctx.fillStyle = this._hz; ctx.fillRect(0, y0 - 0.16 * s, w, 0.16 * s + 2);
    // everything outside the horizon circle is ground (the upper hemisphere projects to a disc)
    ctx.fillStyle = this._groundCss;
    ctx.beginPath(); ctx.rect(-2, -2, w + 4, h + 4);
    if (a0 > 0.03) ctx.arc(w / 2, h / 2 - 2 * s / Math.tan(a0), 2 * s / Math.sin(a0), 0, 6.2832);
    else ctx.rect(-2, -2, w + 4, y0 + 2);
    ctx.fill('evenodd');
    if (this.ground) {
      ctx.beginPath();
      let pen = false;
      for (let d = -176; d <= 176; d += 1.5) {
        const az = this.azimuth + d, r = az * D2R;
        const hill = 1.0 + 0.5 * Math.sin(3 * r + 1) + 0.3 * Math.sin(7 * r + 2.3) + 0.18 * Math.sin(13 * r + 0.7) + 0.1 * Math.sin(29 * r);
        if (!this._projectAltAz(hill, az)) continue;
        if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      for (let d = 176; d >= -176; d -= 4) if (this._projectAltAz(-1.5, this.azimuth + d)) ctx.lineTo(p[0], p[1]);
      ctx.closePath(); ctx.fill();
    }
    if (this.labels) {
      ctx.font = '600 ' + Math.round(11 * dpr) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgb(226,232,244)';
      for (let i = 0; i < 8; i++) {
        if (!this._projectAltAz(0, i * 45) || p[2] < 0.2) continue;
        const y = Math.min(p[1] + 14 * dpr, h - 9 * dpr);
        if (p[0] < 12 * dpr || p[0] > w - 12 * dpr || y < p[1] + 4 * dpr) continue;
        ctx.globalAlpha = i % 2 ? 0.5 : 0.85;
        ctx.fillText((S && S.compass ? S.compass[i] : '') || COMPASS[i], p[0], y);
      }
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }
  }
}

/* ------------------------------------------------------------------ convenience */

/**
 * Model + canvas in one call. Returns { model, view, ready } where ready resolves once the star
 * catalog has loaded (the sky draws straight away without stars until then).
 * Options are those of SkyModel and SkyCanvas, plus `catalogUrl` (default: stars.json next to this file).
 */
export function createSky(canvas, o) {
  o = o || {};
  const model = new SkyModel(o);
  const view = new SkyCanvas(canvas, model, o);
  let ready = Promise.resolve(model);
  if (!o.catalog && o.catalogUrl !== false) {
    const url = o.catalogUrl || new URL('./stars.json', import.meta.url).href;
    ready = loadCatalog(url).then((cat) => { if (cat) model.setCatalog(cat); return model; });
  }
  return { model, view, ready };
}

const Sky = { VERSION, SkyModel, SkyCanvas, createSky, skyData, loadCatalog, parseCatalog, guessLocation, requestLocation, planetPosition, PLANET_NAMES, julianDay, gmstDeg, lstDeg,
  sunEquatorial, moonEquatorial, equatorialToHorizontal, galacticToEquatorial, enuToThree };
export default Sky;
// Classic scripts can use window.Sky once this module has loaded (it fires "sky:ready" on window).
if (typeof window !== 'undefined') {
  window.Sky = Sky;
  try { window.dispatchEvent(new Event('sky:ready')); } catch (e) { /* old browsers */ }
}
