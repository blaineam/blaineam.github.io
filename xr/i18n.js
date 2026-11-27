// wemiller.com /xr/ — languages. Every word the visitor can see or hear in here comes through tr().
//
// English is in this file (so it is always there, with no request). The other eight languages the
// site speaks are in xr/i18n/<lang>.json with the same keys; a key missing there falls back to
// English. The language is chosen exactly as /i18n/i18n.js chooses it: ?lang=, then localStorage
// "wemiller-lang", then the browser's languages, else English.
//
//   await loadStrings();            // once, before anything is drawn
//   tr('btn.exit')                  // "Exit VR"
//   tr('count.gallery', { n: 184 }) // "184 photographs"
//   site('tl.haven.desc', fallback) // the site's own translation of its content, where it has one
//
// Markup: data-i18n="key" (text), data-i18n-html="key" (trusted markup from these files only),
// data-i18n-attr="attr:key;attr2:key2". applyDOM(root) fills them in.
//
// Not translated here, on purpose: product and app names, people's names and the proper names of stars.

export const LANGS = ['en', 'zh-Hans', 'ja', 'de', 'fr', 'es', 'ko', 'pt-BR', 'it'];
const STORE_KEY = 'wemiller-lang';

function normalize(code) {
  if (!code) return null;
  const lower = String(code).toLowerCase();
  for (const l of LANGS) if (l.toLowerCase() === lower) return l;
  const primary = lower.split('-')[0];
  if (primary === 'zh') return 'zh-Hans';
  if (primary === 'pt') return 'pt-BR';
  for (const l of LANGS) if (l.toLowerCase().split('-')[0] === primary) return l;
  return null;
}
function resolveLang() {
  let param = null;
  try { param = new URLSearchParams(location.search).get('lang'); } catch (e) { /* fall through */ }
  const fromParam = normalize(param);
  if (fromParam) { try { localStorage.setItem(STORE_KEY, fromParam); } catch (e) { /* private mode */ } return fromParam; }
  let stored = null;
  try { stored = localStorage.getItem(STORE_KEY); } catch (e) { /* private mode */ }
  const fromStore = normalize(stored);
  if (fromStore) return fromStore;
  for (const n of navigator.languages || [navigator.language || 'en']) { const l = normalize(n); if (l) return l; }
  return 'en';
}
export const lang = resolveLang();
// zh, ja and ko are written without spaces: text has to be allowed to break between any two characters.
export const cjk = lang === 'zh-Hans' || lang === 'ja' || lang === 'ko';

export const EN = {
  // ---- the page
  '_title': "Step inside · Blaine Miller's portfolio in VR",
  '_desc': "Browse Blaine Miller's photographs, 360° panoramas, apps and work history as a space you stand inside. Works in a VR headset through WebXR, and on a flat screen with mouse, touch or keyboard.",
  'page.home': 'Blaine Miller',
  'page.home.aria': "Back to Blaine Miller's home page",
  'page.h1': 'Step inside the portfolio',
  'page.canvas': '3D view of the portfolio. Arrow keys look around, 1 to 4 open an area, Enter selects what is in the centre of the view, Escape goes back.',
  'intro.h': 'A night sky you can walk around in',
  'intro.p': "Tonight's real sky, with one thing in front of you at a time: a <strong>gallery</strong> of photographs with a slideshow, <strong>panoramas</strong> you can stand inside, the <strong>apps</strong> I build, and my <strong>experience</strong> as a timeline. Or choose <strong>Sky only</strong> and use it as a planetarium.",
  'intro.k1': '<b>Look</b> drag with a mouse or finger, or use the arrow keys',
  'intro.k2': '<b>Select</b> click, tap, or press Enter; Tab moves through the items',
  'intro.k3': '<b>Go back</b> Escape. <b>Open an area</b> 1, 2, 3, 4. <b>Page</b> comma and full stop. <b>Slideshow</b> Space',
  'intro.k4': '<b>In a headset, hands only</b> point and pinch to select, or push a button with a fingertip. Everything stays put unless you drag the Move handle on the control bar, which swings it wherever you like, overhead included',
  'intro.k5': '<b>Controllers or a simple viewer</b> point and pull the trigger; or just look at something until the ring fills',
  'intro.k6': "<b>The sky</b> is tonight's, for roughly where you are. Point at a planet, the moon or the sun to see what it is",
  'intro.k7': '<b>Passthrough</b> where the headset has it, a button inside VR swaps the painted sky for your own room',
  'intro.checking': 'Checking for a VR headset…',
  'intro.start': 'Start exploring',
  'intro.plain': 'Prefer ordinary pages? <a href="/?v=120">Photo gallery</a> · <a href="/panos/">Panoramas</a> · <a href="/apps/">Apps</a>',
  'enter.h': 'Step inside',
  'enter.p': 'Your browser can show this in VR. A session has to start from a tap or click, so here is the one button.',
  'enter.skip': 'Explore on this screen instead',
  'enter.home': 'Back to the home page',
  'vr.enter': 'Enter VR',
  'vr.none': 'No VR headset found in this browser, so this is the flat-screen version. Open this page in a headset browser to step inside.',
  'vr.available': 'A VR headset is available: choose Enter VR to step inside, or explore on this screen first.',
  'hud.areas': 'Areas',
  'hud.overview': 'Overview',
  'hud.motion': 'Use motion',
  'hud.help': 'Help',
  'hud.sets': 'Photo set',
  'hud.selected': 'Selected item',
  'hud.close': 'Close',
  'hud.items': 'Items on this page',
  'hud.music': 'Music',
  'hud.music.on': 'Music on',
  'hud.music.tuning': 'Tuning…',
  'hud.music.title': 'Ambient music, played live by Tom',
  'hud.sky.title': 'Hide everything but the sky',
  'hud.lapse.title': 'Speeds up the sky: press again for faster, and again to stop',
  'hud.trails.title': 'A long exposure: the stars draw arcs round the pole as the time-lapse runs',
  'fallback.h': 'This view needs WebGL, and it is turned off here',
  'fallback.why': "Your browser would not start a 3D context. That is expected in Safari's Lockdown Mode and in some locked-down or older browsers.",
  'fallback.p': 'Everything in here is on ordinary pages too:',
  'fallback.gallery': 'Photo gallery',
  'fallback.err': 'The 3D view could not start in this browser ({why}).',
  'err.unknown': 'unknown error',

  // ---- areas and counts
  'area.gallery': 'Gallery',
  'area.panos': 'Panoramas',
  'area.apps': 'Apps',
  'area.experience': 'Experience',
  'count.gallery': '{n} photographs',
  'count.panos': '{n} panoramas to stand inside',
  'count.apps': '{n} apps and tools',
  'count.set': '{n} in {set}',
  'list.failed': 'This list did not load',
  'set.all': 'All',
  'set.120': 'Landscape & sky',
  'set.luma': 'Luma & Nova',
  'home.sub': 'Photographs, panoramas, apps and fourteen years of work',
  'home.xp': 'Roles, projects and skills on a timeline',
  'home.open': 'Open ›',
  'home.sky': 'Or just look at the sky',
  'home.sky.label': 'Sky only: hide everything but the planetarium',
  'xp.sign': '{roles} roles, {projects} projects, one sky of skills',

  // ---- items
  'photo': 'Photograph',
  'pano.sphere.label': '360° panorama {n}',
  'pano.sphere.title': '360° panorama',
  'pano.sphere.text': 'A full sphere. Look all the way around, up and down.',
  'pano.strip.label': 'Panorama {n}',
  'pano.strip.title': 'Panorama',
  'pano.strip.text': 'A wide panorama wrapped around you. Look left and right.',
  'status.photo.loading': 'Loading the full photograph…',
  'status.photo.failed': 'The full photograph did not load; showing the preview.',
  'status.pano.loading': 'Loading the panorama at full size…',
  'status.pano.failed': 'The full panorama did not load; showing the preview.',
  'open.site': 'Open site ›',
  'open.site.plain': 'Open site',
  'open.image': 'Open the image',
  'pos.page': 'Page {n} of {total}',
  'pos.point': 'Point {n} of {total}',
  'pos.group': 'Group {n} of {total}',
  'pos.item': '{n} of {total}',
  'aria.prev.page': 'Previous page',
  'aria.next.page': 'Next page',
  'aria.prev.item': 'Previous item',
  'aria.next.item': 'Next item',
  'aria.prev.point': 'Previous point',
  'aria.next.point': 'Next point',
  'aria.prev.group': 'Previous group',
  'aria.next.group': 'Next group',
  'items.in': 'Items in {area}',

  // ---- controls (in the headset and in the HUD)
  'btn.back': '‹ Back',
  'btn.prev': '‹ Prev',
  'btn.next': 'Next ›',
  'btn.set': 'Set: {set}',
  'btn.slideshow': '▶ Slideshow',
  'btn.play': '▶ Play',
  'btn.pause': 'Pause',
  'btn.sky': 'Sky only',
  'btn.show': 'Show portfolio',
  'btn.guides': 'Constellations',
  'btn.lapse': 'Time-lapse',
  'btn.lapse.rate': 'Time-lapse: {rate}',
  'lapse.1': '10 min/s',
  'lapse.2': '1 hr/s',
  'lapse.3': '4 hr/s',
  'btn.trails': 'Star trails',
  'btn.north': 'Set north here',
  'btn.north.compass': 'North: compass',
  'btn.north.done': 'North set ✓',
  'btn.move': '✥ Move',
  'btn.pass': 'Passthrough',
  'btn.music.off': 'Music: off',
  'btn.music.on': 'Music: on',
  'btn.music.tuning': 'Music: tuning…',
  'btn.exit': 'Exit VR',
  'status.north': 'North set to where you are looking.',
  'status.tom': 'Music played live by Tom.',
  'status.motion.denied': 'Motion access was not allowed.',
  'status.motion.none': 'Motion access is not available here.',
  'xr.fail': 'VR did not start: {why}.',
  'xr.refused': 'the browser refused the session',

  // ---- experience
  'xp.range': '{a} to {b}',
  'xp.education': 'Education',
  'xp.points': '{n} points ›',
  'xp.skills': 'Skills',
  'xp.skills.sub': 'Grouped by years of use',
  'xp.skills.label': 'Skills, grouped by years of use',
  'xp.earlier': 'An earlier project.',

  // ---- the sky
  'sky.mercury': 'Mercury',
  'sky.venus': 'Venus',
  'sky.mars': 'Mars',
  'sky.jupiter': 'Jupiter',
  'sky.saturn': 'Saturn',
  'sky.uranus': 'Uranus',
  'sky.neptune': 'Neptune',
  'sky.moon': 'Moon',
  'sky.sun': 'Sun',
  'sky.mag': 'magnitude {m}',
  'sky.lit': '{pct}% lit',
  'sky.where': '{alt}° up, {dir}',
  'sky.dir.0': 'north',
  'sky.dir.1': 'north-east',
  'sky.dir.2': 'east',
  'sky.dir.3': 'south-east',
  'sky.dir.4': 'south',
  'sky.dir.5': 'south-west',
  'sky.dir.6': 'west',
  'sky.dir.7': 'north-west',
  'sky.N': 'N',
  'sky.E': 'E',
  'sky.S': 'S',
  'sky.W': 'W',
  'moon.new': 'New Moon',
  'moon.waxc': 'Waxing Crescent',
  'moon.first': 'First Quarter',
  'moon.waxg': 'Waxing Gibbous',
  'moon.full': 'Full Moon',
  'moon.wang': 'Waning Gibbous',
  'moon.last': 'Last Quarter',
  'moon.wanc': 'Waning Crescent',

  // ---- the figures in the sky simulation's catalogue, by the name it gives them
  'con.Orion': 'Orion',
  'con.Big Dipper': 'Big Dipper',
  'con.Little Dipper': 'Little Dipper',
  'con.Cassiopeia': 'Cassiopeia',
  'con.Cygnus': 'Cygnus',
  'con.Lyra': 'Lyra',
  'con.Aquila': 'Aquila',
  'con.Scorpius': 'Scorpius',
  'con.Teapot': 'Teapot',
  'con.Southern Cross': 'Southern Cross',
  'con.Pointers': 'Pointers',
  'con.Southern Triangle': 'Southern Triangle',
  'con.Taurus': 'Taurus',
  'con.Auriga': 'Auriga',
  'con.Gemini': 'Gemini',
  'con.Canis Major': 'Canis Major',
  'con.Canis Minor': 'Canis Minor',
  'con.Leo': 'Leo',
  'con.Boötes': 'Boötes',
  'con.Corvus': 'Corvus',
  'con.Great Square': 'Great Square',
  'con.Andromeda': 'Andromeda',
};

let dict = EN, siteDict = {}, loading = null;

// Loads this folder's strings for the language, and the site's own dictionary for content it has
// already translated (project descriptions, taglines, dates). Both are optional: English stays.
export function loadStrings() {
  if (loading) return loading;
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  // The site's dictionary is loaded for English as well: the time machine, the seasons and the
  // search borrow their words from it (tm.*, season.*, fut.*, search.*, snd.volume), in all nine languages.
  loading = Promise.all([lang === 'en' ? {} : get(new URL('i18n/' + lang + '.json', import.meta.url)), get('/i18n/index.' + lang + '.json')]).then(([mine, theirs]) => {
    dict = Object.assign({}, EN, mine || {});
    siteDict = theirs || {};
  });
  return loading;
}

export function tr(key, vars) {
  let s = dict[key];
  if (s === undefined) s = EN[key];
  if (s === undefined) return key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
// Like tr(), for names that come from data: the fallback is used when there is no entry at all.
export function trOr(key, fallback) { return dict[key] !== undefined ? dict[key] : EN[key] !== undefined ? EN[key] : fallback; }
// One decimal place, written the way the language writes numbers.
export function num1(v) {
  try { return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v).replace('-', '−'); }
  catch (e) { return v.toFixed(1).replace('-', '−'); }
}
// The site's translation of a piece of its own content, or the fallback it was given.
export function site(key, fallback) {
  const v = siteDict[key];
  return typeof v === 'string' && v ? v : fallback;
}
// A month and year the way the language writes them.
export function monthYear(year, month) {
  try { return new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1)); }
  catch (e) { return month + '/' + year; }
}

export function applyDOM(root) {
  const doc = root.ownerDocument || root;
  if (root === document) {
    document.documentElement.lang = lang;
    document.title = tr('_title');
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', tr('_desc'));
  }
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = tr(el.getAttribute('data-i18n-html')); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const i = pair.indexOf(':');
      if (i > 0) el.setAttribute(pair.slice(0, i).trim(), tr(pair.slice(i + 1).trim()));
    }
  });
  return doc;
}
