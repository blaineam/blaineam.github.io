// wemiller.com /xr/ — the scene: a night sky with one thing in front of you at a time. It opens on
// a small overview (four tiles); choosing one opens that area (Gallery, Panoramas, Apps, Experience)
// in the same place, and choosing an item opens it in the same place again. "Sky only" hides all of
// it and leaves the planetarium. Nothing ever turns or moves the world inside a headset: it is
// anchored to where the visitor was facing when the session began.
// Also here: the flat-screen HUD and input. Inside a WebXR session, xr-input.js takes over input.
import * as THREE from './vendor/three-0.170.0.module.min.js';
import { COL, FONT, createUI } from './ui.js';
import { createSky, DEFAULT_PLACE } from './sky.js';
import { buildExperience } from './experience.js';
import { createXRInput } from './xr-input.js';
import { createMusic } from './music.js';
import { createCompass } from './compass.js';
import { tr, site, lang, loadStrings, applyDOM } from './i18n.js';
import { createCalendar, ymd, scramble } from './time.js';
import { createSeasonFx } from './seasons.js';
import { buildSearch, buildTimeMachine } from './panels.js';

const EYE = 1.6;                 // metres: flat-mode camera height, and the height content is centred on
const R = 2.0;                   // radius of the room: close enough to walk up to in 6DoF
const COLS = 4, ROWS = 3, PER_PAGE = COLS * ROWS;
const STEP = 0.33;               // radians between columns; an area spans about 76 degrees
const CELL_W = 0.6, CELL_H = 0.4, ROW_PITCH = 0.47;
const DETAIL_R = 1.5, PHOTO_R = 2.0;
const SLIDE_MS = 5000;              // the same pace as the home page's slideshow
const TRAIL_MAX = Math.PI / 3;      // star trails grow to a sixth of a turn (four hours of sky), then keep that length
// Time-lapse speeds, in seconds of sky per second; the button steps through them and then off.
const LAPSE_RATES = [600, 3600, 14400];
const LAPSE_CALM = 600;             // the most the sky may turn while the portfolio is in front of it
const JPEG_PANOS = [2, 16, 75, 85, 95];   // wider than WebP allows; see /panos/index.html
const SPHERES = 8, STRIPS = 99;           // same counts /panos/index.html lists
const HASHES = { gallery: 0, panoramas: 1, panos: 1, apps: 2, experience: 3 };

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowPower = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile|Quest|OculusBrowser|Pico|VisionOS/i.test(navigator.userAgent);

// opts (all optional): root — element holding this page's markup (default: the document);
// embedded — run without a visible page (the home page's one-tap launcher); session — an XRSession
// or a promise of one to start in at once; music — a replacement for createMusic; onExit — called
// when an embedded session is over; ar — that session is an immersive-ar one (passthrough available).
export async function start(opts) {
  opts = opts || {};
  const root = opts.root || document, embedded = !!opts.embedded;
  const $ = (id) => root.querySelector('#' + id);
  let dead = false;
  await loadStrings();
  if (embedded) applyDOM(root);
  const canvas = $('view'), stage = $('stage');
  const params = new URLSearchParams(location.search);

  // ------------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });   // alpha: for passthrough
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(COL.bg, 1);
  renderer.xr.enabled = true;
  const maxTex = renderer.capabilities.maxTextureSize;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.03, 400);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, EYE, 0);

  let dirty = true;
  const invalidate = () => { dirty = true; };
  const ui = createUI(THREE, renderer, invalidate);

  // Everything the visitor looks at hangs off `world`, which is placed once per session, in front of
  // where they are facing, and then left alone. `content` is what "Sky only" hides.
  // `world` pivots at the visitor's eyes (so it can be swung round or tipped overhead with the Move
  // handle); `rig` puts the floor EYE metres below that, which is the frame everything is laid out in.
  const world = new THREE.Group(), rig = new THREE.Group(), content = new THREE.Group();
  world.rotation.order = 'YXZ';
  world.position.set(0, EYE, 0);
  rig.position.y = -EYE;
  rig.add(content);
  world.add(rig);
  scene.add(world);

  // ------------------------------------------------------------------ sky (replaceable) and floor
  const sky = createSky(THREE, { invalidate });
  scene.add(sky.object);                 // not in `world`: the sky keeps its own compass, and follows the viewer
  sky.object.position.set(0, EYE, 0);
  let skyT = Date.now(), lapse = false, lapseRate = 0;
  let place = DEFAULT_PLACE;
  const skyNow = () => sky.update(new Date(skyT), place.lat, place.lon);
  skyNow();
  // The sky for roughly where the visitor is (from the time zone: no prompt, nothing sent anywhere).
  sky.detect().then(() => { const g = sky.guessPlace(); if (g) place = { lat: g.lat, lon: g.lon }; skyNow(); if (ready) rebuildTargets(); });
  let ready = false;       // the simulation can arrive before the rest of the scene exists
  let skyBase = () => Date.now();          // replaced below, once the time machine exists
  const skyClock = setInterval(() => { if (!document.hidden && !lapse) { skyT = skyBase(); skyNow(); } }, 60000);

  const floor = new THREE.Group();
  for (const [r, o] of [[0.7, 0.3], [1.35, 0.22], [R + 0.25, 0.32]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r + 0.006, 96), new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: o, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    floor.add(ring);
  }
  content.add(floor);

  // ------------------------------------------------------------------ data
  const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  const loaded = await Promise.allSettled([
    getJSON('/slides/thumbs/manifest.json'), getJSON('/content/photos.json'), getJSON('/app-sheets.json'),
    getJSON('/content/resume.json'), getJSON('/content/projects.json'),
    getJSON('/content/site.json'), getJSON('/content/photo-meta.json'),
  ]);
  const val = (i, d) => (loaded[i].status === 'fulfilled' && loaded[i].value ? loaded[i].value : d);
  const manifest = val(0, {}), photoMeta = val(1, {}).photos || {}, sheets = val(2, {}), resume = val(3, null), projectList = val(4, []);
  const cal = createCalendar(val(5, {})), photoExif = val(6, {}).photos || {};
  const projectById = {};
  for (const p of projectList) projectById[p.id] = p;

  // `photosAll` and `appsAll` are everything; `photos` and `apps` are what exists on the date the time machine is set to.
  const photosAll = Object.keys(manifest).map((file) => {
    const m = manifest[file], meta = photoMeta[file] || {};
    return {
      kind: 'photo', file, taken: meta.taken || (photoExif[file] && photoExif[file].taken) || '', w: m.w || 3, h: m.h || 2, c: m.c || COL.bg2, tags: meta.tags || [],
      title: meta.title || '', text: meta.caption || meta.alt || '', label: meta.title || meta.alt || tr('photo'),
      thumb: '/slides/thumbs/' + file, src: '/slides/' + file,
    };
  });
  let photos = photosAll;
  const panos = [];
  for (let n = SPHERES; n >= 1; n--) {
    panos.push({ kind: 'sphere', label: tr('pano.sphere.label', { n }), title: tr('pano.sphere.title'), text: tr('pano.sphere.text'), src: '/panos/panoramas/bmp-pano-sphere-' + n + '.webp', thumb: '/panos/panoramas/bmp-pano-sphere-thumb-' + n + '.webp' });
  }
  for (let n = STRIPS; n >= 1; n--) {
    panos.push({ kind: 'strip', label: tr('pano.strip.label', { n }), title: tr('pano.strip.title'), text: tr('pano.strip.text'), src: '/panos/panoramas/bmp-pano-' + n + (JPEG_PANOS.includes(n) ? '.jpg' : '.webp'), thumb: '/panos/panoramas/bmp-pano-thumb-' + n + '.webp' });
  }
  const appsById = {};
  const appsAll = Object.keys(sheets).map((id) => {
    const s = sheets[id];
    // names stay as they are; the tagline and description use the site's own translations where it has them
    const tagline = site('ft.' + id, s.g || ''), desc = site('tl.' + id + '.desc', s.d || '');
    return (appsById[id] = {
      kind: 'app', id, date: (projectById[id] && projectById[id].date) || '', label: s.t + (tagline ? ': ' + tagline : ''), title: s.t, tagline, text: tagline, desc, url: s.u || '/',
      icon: '/' + String(s.i || '').replace(/^\//, ''),
      // two shapes in app-sheets.json: a ready path (src), or a name and width under the app's screens folder
      shots: (s.shots || []).filter((x) => x.src || (s.base && x.n)).slice(0, 3)
        .map((x) => ({
          // the larger of the two sizes on offer: these are looked at from close up
          url: x.src ? '/' + String(x.src).replace(/^\//, '') : s.base + 'en/' + x.n + '-' + (x.b || x.a) + '.webp',
          w: x.w || 1, h: x.h || 2, framed: !x.src,       // framed: a device render with a transparent surround
        })),
    });
  });
  let apps = appsAll;
  // What exists on the date in force. Everything that draws or counts reads these, never the full lists.
  let panosNow = panos, resumeNow = resume, projectsNow = projectList;
  // Photographs and panoramas with no known date cannot be placed in time. They are shown from the
  // day of the earliest dated photograph onward, and not before it: nothing here is older than that.
  const firstPhotoDay = photosAll.reduce((m, x) => (x.taken && (!m || x.taken < m) ? x.taken : m), '');
  let SETS = { all: tr('set.all'), 120: tr('set.120'), luma: tr('set.luma') };

  // ------------------------------------------------------------------ picking and hover
  const targets = [];            // meshes a pointer can hit right now
  const detailTargets = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 200;
  const hits = [];
  function pick() {
    hits.length = 0;
    raycaster.intersectObjects(targets, false, hits);
    for (let i = 0; i < hits.length; i++) if (hits[i].object.userData.enabled !== false) return hits[i];
    return null;
  }
  let hovered = null, statusIdle = '';
  function setHover(obj) {
    if (obj === hovered) return;
    if (hovered && hovered.userData.setHover) hovered.userData.setHover(false);
    hovered = obj;
    if (obj && obj.userData.setHover) obj.userData.setHover(true);
    $('status').textContent = obj ? obj.userData.label || '' : statusIdle;
    canvas.classList.toggle('is-target', !!obj);
    invalidate();
  }
  function setStatus(t) { statusIdle = t; if (!hovered) $('status').textContent = t; }

  // ------------------------------------------------------------------ the four areas
  // All four open in the same place, straight ahead; only one is ever shown.
  const AREAS = [
    { key: 'gallery', hash: 'gallery', title: tr('area.gallery'), wall: true, set: 'all', all: photos },
    { key: 'panos', hash: 'panoramas', title: tr('area.panos'), wall: true, all: panos },
    { key: 'apps', hash: 'apps', title: tr('area.apps'), wall: true, all: apps },
    { key: 'experience', hash: 'experience', title: tr('area.experience'), wall: false, all: [] },
  ];
  // view: 'home' (the overview), 'area', or an open item: 'photo' | 'pano' | 'app' | 'text'.
  // at: index of the area in use, -1 on the overview. area: the area object while an item is open.
  const state = { at: -1, view: 'home', area: null, item: null, index: -1, textPage: 0, hidden: false, playing: false, passthrough: false };
  const realCount = (a) => a.all.reduce((n, x) => n + (x.kind === 'ghost' ? 0 : 1), 0);
  // "did not load" is for a list that never arrived; a list the time machine has emptied says 0
  const countOf = (a) => (a.failed ? tr('list.failed') : tr('count.' + a.key, { n: realCount(a) }));
  const isOpen = () => state.view !== 'home' && state.view !== 'area' && state.view !== 'search' && state.view !== 'time';
  let presenting = false;

  function makeSign(title, sub, y) {
    const { ctx, tex } = ui.canvasTexture(768, 176);
    const mesh = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.scale.set(0.8, 0.8 * 176 / 768, 1);
    ui.place(mesh, 0, y, R);
    mesh.userData.draw = (s, t) => {
      if (t !== undefined) title = t;
      ctx.clearRect(0, 0, 768, 176);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COL.ink; ctx.font = '700 88px ' + FONT; ctx.fillText(title, 384, 92, 760);
      ctx.fillStyle = COL.accent; ctx.font = '500 36px ' + FONT; ctx.fillText(s, 384, 150, 740);
      tex.needsUpdate = true; invalidate();
    };
    mesh.userData.draw(sub);
    return mesh;
  }

  for (const a of AREAS) {
    a.group = new THREE.Group();
    a.group.visible = false;
    a.body = a.group;
    a.targets = []; a.cards = []; a.page = 0; a.gen = 0; a.key2 = '';
    a.items = a.all;
    a.failed = a.wall && !a.all.length;
    content.add(a.group);
  }
  const areaIndex = (a) => AREAS.indexOf(a);
  const pageCount = (a) => Math.max(1, Math.ceil(a.items.length / PER_PAGE));
  const cardTheta = (slot) => ((slot % COLS) - (COLS - 1) / 2) * STEP;
  const cardY = (slot) => EYE + ((ROWS - 1) / 2 - Math.floor(slot / COLS)) * ROW_PITCH;

  // Things from the future cannot be read yet. Work still to come is a card of glyphs that keeps
  // changing; a dog nobody has photographed yet is colour and noise where the picture will be.
  const GHOST_HUES = [[200, 262, 322], [168, 212, 282], [150, 192, 252], [284, 324, 204], [190, 232, 302], [316, 268, 196]];
  const ghostCards = [];             // redraw functions of the glyph cards on show, for the flicker
  function makeCard(a, item, slot, gen) {
    const theta = cardTheta(slot);
    const onSelect = item.kind === 'ghost' ? () => openItem(a, unwritten(item), null, -1) : item.kind === 'ghost-photo' ? null
      : () => openItem(a, item, tile.face.userData.image, a.page * PER_PAGE + slot);
    const tile = ui.makeTile(item.c, item.label, onSelect, item.kind === 'app' || item.kind === 'ghost' ? 0.04 : 0.024);
    if (item.kind === 'ghost') {
      const { ctx, tex } = ui.canvasTexture(384, 432);
      tile.size(CELL_H * 384 / 432, CELL_H);
      const draw = () => {
        ctx.fillStyle = '#0a1120'; ctx.fillRect(0, 0, 384, 432);
        ctx.fillStyle = '#12203a'; ui.roundRect(ctx, 92, 36, 200, 200, 44); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = COL.accent; ctx.globalAlpha = 0.7; ctx.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillText(scramble(3), 192, 124); ctx.fillText(scramble(3), 192, 196);
        ctx.globalAlpha = 1; ctx.fillStyle = COL.ink; ctx.font = '700 34px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillText(item.note ? item.title : scramble(item.n), 192, 300, 352);
        ctx.fillStyle = COL.soft; ctx.font = '400 26px ' + FONT;
        ctx.fillText(item.note ? site('fut.unwritten', 'From after your time') : item.year + '  ' + scramble(5), 192, 346, 352);
        tex.needsUpdate = true; invalidate();
      };
      tile.setMap(tex);
      draw();
      if (!item.note) ghostCards.push(draw);
    } else if (item.kind === 'ghost-photo') {
      const { ctx, tex } = ui.canvasTexture(320, 400), h = GHOST_HUES[item.seed % GHOST_HUES.length];
      tile.fit(0.8, CELL_W, CELL_H);
      const g = ctx.createLinearGradient(0, 0, 320, 400);
      g.addColorStop(0, 'hsl(' + h[0] + ' 62% 34%)'); g.addColorStop(0.55, 'hsl(' + h[1] + ' 58% 30%)'); g.addColorStop(1, 'hsl(' + h[2] + ' 60% 26%)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 400);
      let seed = item.seed * 7919 + 13;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let k = 0; k < 90; k++) { ctx.fillStyle = 'hsla(' + h[k % 3] + ' 70% ' + (40 + rnd() * 30) + '% / ' + (0.08 + rnd() * 0.2) + ')'; ctx.fillRect(rnd() * 320, rnd() * 400, 8 + rnd() * 70, 3 + rnd() * 10); }
      ctx.fillStyle = 'rgba(238,242,248,.85)'; ctx.font = '700 30px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(scramble(6 + (item.seed % 5)), 160, 372, 300);
      tex.needsUpdate = true;
      tile.setMap(tex);
      tile.face.userData.enabled = false;
    } else if (item.kind === 'app') {
      const { ctx, tex } = ui.canvasTexture(384, 432);
      tile.size(CELL_H * 384 / 432, CELL_H);
      const draw = (icon) => {
        ctx.fillStyle = COL.bg2; ctx.fillRect(0, 0, 384, 432);
        ui.roundRect(ctx, 92, 36, 200, 200, 44);
        if (icon) { ctx.save(); ctx.clip(); ctx.drawImage(icon, 92, 36, 200, 200); ctx.restore(); }
        else { ctx.fillStyle = '#16223a'; ctx.fill(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = COL.ink; ctx.font = '700 40px ' + FONT;
        ctx.fillText(item.title, 192, 296, 352);
        ctx.fillStyle = COL.soft; ctx.font = '400 26px ' + FONT;
        ui.wrapLines(ctx, item.tagline, 344, 3).forEach((l, i) => ctx.fillText(l, 192, 338 + i * 32));
        tex.needsUpdate = true; invalidate();
      };
      tile.setMap(tex);
      draw(null);
      ui.loadImage(item.icon).then((im) => { if (gen === a.gen) { tile.face.userData.image = im; draw(im); } }).catch(() => {});
    } else {
      tile.fit(item.kind === 'photo' ? item.w / item.h : item.kind === 'sphere' ? 2 : 2.8, CELL_W, CELL_H);
      ui.loadImage(item.thumb).then((im) => {
        if (gen !== a.gen) return;
        tile.face.userData.image = im;
        if (item.kind !== 'photo') tile.fit(im.naturalWidth / im.naturalHeight, CELL_W, CELL_H);
        tile.setMap(ui.imageTexture(im));
      }).catch(() => {});
    }
    ui.place(tile.group, theta, cardY(slot), R);
    return tile;
  }

  function buildWall(a) {
    const key = (a.set || '') + '|' + a.page;
    if (key === a.key2) return;
    a.key2 = key; a.gen++;
    if (a.key === 'apps') ghostCards.length = 0;
    if (hovered && a.targets.includes(hovered)) setHover(null);
    ui.emptyGroup(a.wallGroup);
    a.targets.length = 0; a.cards.length = 0;
    const first = a.page * PER_PAGE, n = Math.min(PER_PAGE, a.items.length - first);
    for (let i = 0; i < n; i++) {
      const item = a.items[first + i], tile = makeCard(a, item, i, a.gen);
      a.wallGroup.add(tile.group);
      a.targets.push(tile.face);
      a.cards.push({ item, label: item.label, face: tile.face, theta: cardTheta(i), y: cardY(i) });
    }
    if (areaIndex(a) === state.at) buildItemList();
    invalidate();
  }

  for (const a of AREAS) {
    if (!a.wall) continue;
    a.wallGroup = new THREE.Group();
    a.body.add(a.wallGroup);
    a.sign = makeSign(a.title, countOf(a), EYE + 0.86);
    a.group.add(a.sign);
  }

  // Experience: built for a date, so the time machine can take away what had not happened yet
  const xp = AREAS[3];
  let xpGroup = null;
  function buildXp(resumeNow, projectsNow) {
    if (xpGroup) { ui.emptyGroup(xpGroup); xp.body.remove(xpGroup); }
    if (hovered && xp.targets.includes(hovered)) setHover(null);
    const built = buildExperience({ THREE, ui, R, EYE, invalidate, open: (item, theta, preview) => openItem(xp, item, preview, -1) }, resumeNow, projectsNow, appsById);
    xpGroup = built.group;
    xp.body.add(xpGroup);
    xp.targets = built.targets;
    xp.cards = built.items.map((it) => ({ item: it.ref || it, label: it.label, face: it.face, theta: it.theta, y: it.y || EYE + 0.3 }));
    const sub = resumeNow ? tr('xp.sign', { roles: built.count, projects: projectsNow.length }) : tr('list.failed');
    if (!xp.sign) { xp.sign = makeSign(xp.title, sub, EYE + 1.3); xp.group.add(xp.sign); } else xp.sign.userData.draw(sub);
  }
  buildXp(resume, projectList);

  // ------------------------------------------------------------------ the overview: four tiles, nothing else
  const home = new THREE.Group();
  content.add(home);
  const homeCards = [];
  const homeSign = makeSign('Blaine Miller', tr('home.sub'), EYE + 0.56), homeDraws = [];
  home.add(homeSign);
  // Each tile is a picture of what is behind it: photographs, a panorama, app icons, a timeline.
  const cover = (ctx, im, x, y, w, h) => {
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight), sw = w / s, sh = h / s;
    ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  };
  const TW = 640, TH = 720, ART = 440;
  const ART_DRAW = {
    gallery(ctx, ims) {            // one large photograph and two small
      if (ims[0]) cover(ctx, ims[0], 0, 0, 424, ART);
      if (ims[1]) cover(ctx, ims[1], 430, 0, 210, 217);
      if (ims[2]) cover(ctx, ims[2], 430, 223, 210, 217);
    },
    panos(ctx, ims) {              // a sphere preview over a wide strip
      if (ims[0]) cover(ctx, ims[0], 0, 0, TW, 262);
      if (ims[1]) cover(ctx, ims[1], 0, 268, TW, 172);
    },
    apps(ctx, ims, srcs) {         // a shelf of icons: only as many as there are; work not yet written is glyphs
      const g = ctx.createLinearGradient(0, 0, TW, ART);
      g.addColorStop(0, '#13233f'); g.addColorStop(1, '#0b1322');
      ctx.fillStyle = g; ctx.fillRect(0, 0, TW, ART);
      for (let k = 0; k < Math.min(8, srcs.length); k++) {
        const x = 40 + (k % 4) * 146, y = 46 + Math.floor(k / 4) * 186, sz = 122;
        ui.roundRect(ctx, x, y, sz, sz, sz * 0.225);
        if (ims[k]) { ctx.save(); ctx.clip(); ctx.drawImage(ims[k], x, y, sz, sz); ctx.restore(); }
        else {
          ctx.fillStyle = srcs[k] ? '#1b2b4a' : '#12203a'; ctx.fill();
          if (!srcs[k]) { ctx.fillStyle = COL.accent; ctx.globalAlpha = 0.7; ctx.font = '700 40px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText(scramble(3), x + sz / 2, y + sz / 2 + 14); ctx.globalAlpha = 1; }
        }
      }
    },
    experience(ctx) {              // the timeline itself, in miniature
      const g = ctx.createLinearGradient(0, 0, 0, ART);
      g.addColorStop(0, '#0d1930'); g.addColorStop(1, '#0b1322');
      ctx.fillStyle = g; ctx.fillRect(0, 0, TW, ART);
      const jobs = (resumeNow && resumeNow.experience) || [], n = jobs.length, dots = Math.min(22, projectsNow.length);
      let seed = 11;
      const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      ctx.strokeStyle = 'rgba(108,182,255,.4)'; ctx.lineWidth = 2;        // skills, as a constellation
      ctx.beginPath();
      const pts = [];
      for (let k = 0; k < (n ? 14 : 0); k++) pts.push([50 + k * 41 + rnd() * 18, 40 + rnd() * 110]);     // no work yet, no skills from it
      pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.shadowColor = COL.accent; ctx.shadowBlur = 14;
      pts.forEach((p, k) => { ctx.beginPath(); ctx.arc(p[0], p[1], 4 + (k % 3) * 1.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.shadowBlur = 0;
      for (let k = 0; k < n; k++) {                                      // roles, as cards on a rail
        const x = 40 + (k * 560) / n, w = 560 / n - 14;
        ctx.fillStyle = '#16264a'; ui.roundRect(ctx, x, 196, w, 96, 14); ctx.fill();
        ctx.fillStyle = COL.accent; ui.roundRect(ctx, x + 12, 212, Math.min(48, w - 24), 7, 3.5); ctx.fill();
        ctx.fillStyle = 'rgba(238,242,248,.75)'; ui.roundRect(ctx, x + 12, 236, w - 24, 9, 4.5); ctx.fill();
        ctx.fillStyle = 'rgba(185,195,214,.5)'; ui.roundRect(ctx, x + 12, 258, (w - 24) * 0.6, 8, 4); ctx.fill();
        ctx.strokeStyle = COL.edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w / 2, 292); ctx.lineTo(x + w / 2, 330); ctx.stroke();
      }
      ctx.fillStyle = COL.edge; ui.roundRect(ctx, 40, 330, 560, 5, 2.5); ctx.fill();
      if (n) { ctx.fillStyle = COL.accent; ui.roundRect(ctx, 150, 322, 450, 10, 5); ctx.fill(); }
      if (resumeNow && (resumeNow.education || []).length) { ctx.fillStyle = COL.green; ui.roundRect(ctx, 40, 322, 96, 10, 5); ctx.fill(); }
      const hue = ['#6cb6ff', '#6fe0c0', '#9db4ff', '#58c9e8'];
      for (let k = 0; k < dots; k++) {                                   // projects under their years: as many as there are
        ctx.fillStyle = hue[k % 4]; ctx.globalAlpha = 0.55 + rnd() * 0.45;
        ui.roundRect(ctx, 52 + Math.floor(k / 2) * 50 + (k > 9 ? 0 : 0), 356 + (k % 2) * 34, 24, 24, 6); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
  // What each tile pictures, taken from the lists as they stand on the date in force. A null
  // entry is something that cannot be pictured yet (unwritten work).
  const artSources = (key) => {
    if (key === 'gallery') return [0, 5, 9].map((k) => photos[Math.min(k, photos.length - 1)]).filter((x, k, l) => x && l.indexOf(x) === k).map((x) => x.thumb);
    if (key === 'panos') return [panosNow.find((x) => x.kind === 'sphere'), panosNow.find((x) => x.kind === 'strip')].filter(Boolean).map((x) => x.thumb);
    if (key === 'apps') return apps.slice(0, 8).map((x) => (x.kind === 'app' ? x.icon : null));
    return [];
  };
  const artCache = new Map();          // url -> image, or 'wait' while it loads
  const artImage = (u, redraw) => {
    if (!u) return null;
    const got = artCache.get(u);
    if (got && got !== 'wait') return got;
    if (!got) { artCache.set(u, 'wait'); ui.loadImage(u).then((im) => { artCache.set(u, im); redraw(); }).catch(() => {}); }
    return null;
  };
  const nothingYet = (key) => (key === 'experience' ? !((resumeNow && (resumeNow.experience || []).length) || projectsNow.length) : !AREAS.find((x) => x.key === key).all.length);
  AREAS.forEach((a, i) => {
    let sub = '', card = null, tile = null;
    const { ctx, tex } = ui.canvasTexture(TW, TH);
    const draw = () => {
      const srcs = artSources(a.key), ims = srcs.map((u) => artImage(u, draw));
      sub = a.key === 'experience' ? (resume ? tr('home.xp') : tr('list.failed')) : countOf(a);
      ctx.fillStyle = COL.bg2; ctx.fillRect(0, 0, TW, TH);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, TW, ART); ctx.clip();
      ctx.fillStyle = '#101a2e'; ctx.fillRect(0, 0, TW, ART);
      if (nothingYet(a.key)) {           // nothing here yet on this date: an empty frame, no picture
        ctx.strokeStyle = COL.edge; ctx.lineWidth = 4; ctx.setLineDash([18, 16]);
        ui.roundRect(ctx, 60, 60, TW - 120, ART - 130, 36); ctx.stroke(); ctx.setLineDash([]);
      } else ART_DRAW[a.key](ctx, ims, srcs);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, ART - 90, 0, ART);            // the picture settles into the card
      fade.addColorStop(0, 'rgba(12,18,32,0)'); fade.addColorStop(1, 'rgba(12,18,32,.9)');
      ctx.fillStyle = fade; ctx.fillRect(0, ART - 90, TW, 90);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COL.ink; ctx.font = '700 72px ' + FONT; ctx.fillText(a.title, 44, ART + 96, TW - 88);
      ctx.fillStyle = COL.soft; ctx.font = '400 34px ' + FONT;
      ui.wrapLines(ctx, sub, TW - 88, 2).forEach((l, n) => ctx.fillText(l, 44, ART + 152 + n * 42));
      ctx.fillStyle = COL.accent; ctx.font = '600 34px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(tr('home.open'), TW - 44, TH - 40);
      if (card) card.label = tile.face.userData.label = a.title + ': ' + sub;        // what is read out matches what is drawn
      tex.needsUpdate = true; invalidate();
    };
    const theta = (i - 1.5) * 0.3, y = EYE + 0.04;
    tile = ui.makeTile(COL.bg2, a.title, () => showArea(i), 0.05);
    tile.size(0.52, 0.52 * TH / TW); tile.setMap(tex);
    ui.place(tile.group, theta, y, R);
    home.add(tile.group);
    card = { label: a.title, face: tile.face, theta, y };
    homeCards.push(card);
    draw();
    homeDraws.push(draw);
  });
  const homeSky = ui.makeButton(tr('home.sky'), 0.62, 0.1, () => setHidden(true));
  ui.place(homeSky.face, 0, EYE - 0.42, R);
  home.add(homeSky.face);
  homeCards.push({ label: tr('home.sky.label'), face: homeSky.face, theta: 0, y: EYE - 0.42 });
  // Far enough ahead, the site is carried on by others: a note about who started it.
  const founderItem = () => ({ kind: 'text', title: site('fut.founder.h', 'Started by Blaine Miller.'), sub: site('fut.founder.eyebrow', 'Founder'), meta: '', pages: [site('fut.founder.p', '')], pageWord: 'page', color: COL.green });
  const founderBtn = ui.makeButton(site('fut.founder.eyebrow', 'Founder') + ' ›', 0.3, 0.1, () => openItem(AREAS[3], founderItem(), null, -1));
  ui.place(founderBtn.face, 0, EYE - 0.55, R);
  founderBtn.face.visible = false;
  home.add(founderBtn.face);
  homeCards.push({ label: site('fut.founder.h', 'Founder'), face: founderBtn.face, theta: 0, y: EYE - 0.55 });

  // ------------------------------------------------------------------ detail views
  const detail = new THREE.Group();          // always straight ahead
  content.add(detail);
  let detailGen = 0;
  const DY = EYE + 0.1;

  // photo
  // photo: a slideshow viewer, centred, with the wall put away while it is up
  const photoTile = ui.makeTile(COL.bg2, '', null, 0.03);
  photoTile.face.userData.enabled = false;
  photoTile.group.position.set(0, DY + 0.22, -PHOTO_R);        // high enough that its caption clears the control bar
  const caption = ui.canvasTexture(1536, 208);
  const captionMesh = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: caption.tex, transparent: true }));
  captionMesh.scale.set(1.7, 1.7 * 208 / 1536, 1);
  captionMesh.position.set(0, DY - 0.57, -PHOTO_R + 0.05);
  photoTile.group.visible = captionMesh.visible = false;
  detail.add(photoTile.group, captionMesh);

  function drawCaption(title, text) {
    const { ctx, tex } = caption;
    ctx.clearRect(0, 0, 1536, 208);
    ui.roundRect(ctx, 4, 4, 1528, 200, 40);
    ctx.fillStyle = 'rgba(9,14,26,.95)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COL.edge; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.ink; ctx.font = '700 46px ' + FONT;
    let y = 78;
    if (title) { ctx.fillText(title, 768, y, 1440); y += 56; ctx.font = '400 38px ' + FONT; ctx.fillStyle = COL.soft; }
    else { ctx.font = '500 44px ' + FONT; y = text && ctx.measureText(text).width > 1440 ? 86 : 118; }
    ui.wrapLines(ctx, text, 1440, title ? 1 : 2).forEach((l, i) => ctx.fillText(l, 768, y + i * 54));
    tex.needsUpdate = true;
  }
  function setPhoto(tex, aspect, color) {
    const m = photoTile.face.material;
    if (m.map) { m.map.dispose(); m.map = null; }
    if (tex) photoTile.setMap(tex); else { m.color.set(color || COL.bg2); m.needsUpdate = true; }
    photoTile.fit(aspect, 2.5, 1.3);
    invalidate();
  }
  // `swap`: a photograph is already up (stepping through the slideshow). It stays until the next one
  // has something to show: its preview when stepping by hand, the full image while playing.
  function showPhoto(item, thumbImage, gen, swap) {
    photoTile.group.visible = true;
    if (!swap) setPhoto(thumbImage ? ui.imageTexture(thumbImage) : null, item.w / item.h, item.c);
    if (!(swap && state.playing)) drawCaption(item.title, item.text);
    setStatus(tr('status.photo.loading'));
    let full = false;
    if (!thumbImage && !(swap && state.playing)) ui.loadImage(item.thumb).then((im) => { if (gen === detailGen && !full) setPhoto(ui.imageTexture(im), item.w / item.h); }).catch(() => {});
    ui.loadImage(item.src).then((im) => {
      if (gen !== detailGen) return;
      full = true;
      drawCaption(item.title, item.text);
      if (state.playing) { const list = state.area.items, nx = list[(state.index + 1) % list.length]; if (nx) new Image().src = nx.src; }   // warm the next one
      const cap = Math.min(maxTex, lowPower ? 2048 : 4096), big = Math.max(im.naturalWidth, im.naturalHeight);
      const s = Math.min(1, cap / big);
      setPhoto(s < 1 ? ui.scaledTexture(im, 0, im.naturalWidth, Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s)) : ui.imageTexture(im), im.naturalWidth / im.naturalHeight);
      setStatus('');
    }).catch(() => {
      if (gen !== detailGen) return;
      setStatus(tr('status.photo.failed'));
      if (swap && state.playing) ui.loadImage(item.thumb).then((t) => { if (gen === detailGen) { setPhoto(ui.imageTexture(t), item.w / item.h); drawCaption(item.title, item.text); } }).catch(() => {});
    });
  }
  let playTimer = 0;
  function setPlaying(on) {
    on = !!on && state.view === 'photo';
    clearInterval(playTimer);
    state.playing = on;
    if (on) playTimer = setInterval(() => { if (state.view === 'photo' && !document.hidden) step(1); }, SLIDE_MS);
    syncUI();
  }
  // The Play control: in the gallery it starts a slideshow from the page being shown; in the viewer it pauses and resumes.
  function togglePlay() {
    if (state.view === 'photo') { setPlaying(!state.playing); return; }
    const a = AREAS[0];
    let i = a.page * PER_PAGE;
    while (a.items[i] && a.items[i].kind !== 'photo') i++;
    if (state.hidden || state.view !== 'area' || state.at !== 0 || !a.items[i]) return;
    openItem(a, a.items[i], null, i);
    setPlaying(true);
  }

  // panorama: lives in the scene, not the room, so it can stay centred on the head while you lean or walk
  const panoRoot = new THREE.Group(), panoGroup = new THREE.Group();
  panoRoot.add(panoGroup); panoRoot.visible = false;
  panoRoot.position.set(0, EYE, 0);
  scene.add(panoRoot);
  function buildPano(item, textures, aspect) {
    ui.emptyGroup(panoGroup);
    const n = textures.length;
    for (let i = 0; i < n; i++) {
      let geo;
      if (item.kind === 'sphere') {
        geo = new THREE.SphereGeometry(60, Math.max(8, Math.ceil(72 / n)), 36, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
      } else {
        const span = Math.min(Math.PI * 2, aspect * 1.4), r = 12, h = (span * r) / aspect;
        geo = new THREE.CylinderGeometry(r, r, h, Math.max(6, Math.ceil((96 * span) / (Math.PI * 2) / n)), 1, true, Math.PI - span / 2 + (span * i) / n, span / n);
      }
      geo.scale(-1, 1, 1);    // seen from inside
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: textures[i] }));
      mesh.frustumCulled = false;
      panoGroup.add(mesh);
    }
    panoGroup.rotation.y = item.kind === 'sphere' ? -Math.PI / 2 : 0;   // image centre straight ahead
    invalidate();
  }
  // Cut a large panorama into tiles that fit the GPU: a pixel budget for memory, a tile cap for texture size.
  function panoTiles(im) {
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const tileMax = Math.min(maxTex, lowPower ? 4096 : 8192);
    const s = Math.min(1, (lowPower ? 8192 : 16384) / iw, tileMax / ih, Math.sqrt((lowPower ? 14e6 : 36e6) / (iw * ih)));
    const tw = Math.max(1, Math.round(iw * s)), th = Math.max(1, Math.round(ih * s));
    const n = Math.ceil(tw / tileMax), out = [];
    for (let i = 0; i < n; i++) out.push(ui.scaledTexture(im, (i * iw) / n, iw / n, Math.round(tw / n), th));
    return out;
  }
  function showPano(item, thumbImage, gen) {
    panoRoot.visible = true;
    sky.object.visible = item.kind !== 'sphere';
    floor.visible = false;
    const preview = (im) => buildPano(item, [ui.imageTexture(im)], im.naturalWidth / im.naturalHeight);
    let full = false;
    if (thumbImage) preview(thumbImage);
    else ui.loadImage(item.thumb).then((im) => { if (gen === detailGen && !full) preview(im); }).catch(() => {});
    setStatus(tr('status.pano.loading'));
    ui.loadImage(item.src).then((im) => {
      if (gen !== detailGen) return;
      full = true;
      buildPano(item, panoTiles(im), im.naturalWidth / im.naturalHeight);
      setStatus('');
    }).catch(() => { if (gen === detailGen) setStatus(tr('status.pano.failed')); });
  }

  // app
  const appGroup = new THREE.Group();
  appGroup.visible = false;
  detail.add(appGroup);
  const appPanel = ui.canvasTexture(1024, 704);
  const appPanelMesh = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: appPanel.tex, transparent: true }));
  const APP_W = 0.86, APP_H = APP_W * 704 / 1024;
  appPanelMesh.scale.set(APP_W, APP_H, 1);
  const shotMeshes = [0, 1, 2].map(() => new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ color: COL.bg2, transparent: true, premultipliedAlpha: true })));
  let appUrl = '/';
  const openBtn = ui.makeButton(tr('open.site'), 0.36, 0.095, () => openSite(appUrl));
  appGroup.add(appPanelMesh, openBtn.face, ...shotMeshes);

  function drawAppPanel(item, icon) {
    const { ctx, tex } = appPanel;
    ctx.clearRect(0, 0, 1024, 704);
    ui.roundRect(ctx, 4, 4, 1016, 696, 44);
    ctx.fillStyle = 'rgba(12,18,32,.97)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COL.edge; ctx.stroke();
    ui.roundRect(ctx, 48, 48, 168, 168, 38);
    if (icon) { ctx.save(); ctx.clip(); ctx.drawImage(icon, 48, 48, 168, 168); ctx.restore(); }
    else { ctx.fillStyle = '#16223a'; ctx.fill(); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.ink; ctx.font = '700 64px ' + FONT;
    ctx.fillText(item.title, 248, 112, 730);
    ctx.fillStyle = COL.accent; ctx.font = '500 32px ' + FONT;
    ui.wrapLines(ctx, item.tagline, 730, 2).forEach((l, i) => ctx.fillText(l, 248, 164 + i * 40));
    ctx.fillStyle = COL.soft; ctx.font = '400 28px ' + FONT;
    ui.wrapLines(ctx, item.desc, 928, 11).forEach((l, i) => ctx.fillText(l, 48, 276 + i * 38));
    tex.needsUpdate = true; invalidate();
  }
  function showApp(item, iconImage, gen) {
    appGroup.visible = true;
    appUrl = item.url;
    drawAppPanel(item, iconImage);
    if (!iconImage) ui.loadImage(item.icon).then((im) => { if (gen === detailGen) drawAppPanel(item, im); }).catch(() => {});
    // Device renders (phones, watches) float in front of the panel's plane, fanned a little toward the
    // visitor; they are cut out by their own transparency, not boxed. Plain wide screenshots stack in a column.
    const wide = item.shots.length > 0 && item.shots[0].w > item.shots[0].h;
    const n = wide ? Math.min(2, item.shots.length) : item.shots.length, shotW = wide ? 0.62 : 0.27, gap = wide ? 0.045 : 0.03;
    const total = APP_W + (n ? 0.06 + (wide ? shotW : n * shotW + (n - 1) * gap) : 0);
    let x = -total / 2 + APP_W / 2;
    appPanelMesh.position.set(x, DY, -DETAIL_R);
    openBtn.face.position.set(x, DY - APP_H / 2 - 0.085, -DETAIL_R);
    x += APP_W / 2 + 0.06;
    shotMeshes.forEach((m, i) => {
      if (m.material.map) { m.material.map.dispose(); m.material.map = null; }
      m.visible = false;
      if (i >= n) return;
      const s = item.shots[i], maxH = wide ? (APP_H - gap * (n - 1)) / n : 0.64;
      let w = shotW, h = (w * s.h) / s.w;
      if (h > maxH) { h = maxH; w = (h * s.w) / s.h; }
      m.geometry = s.framed ? ui.PLANE : ui.roundedGeo(w, h, 0.022);
      m.scale.set(w, h, 1);
      const cx = x + shotW / 2;
      if (wide) { m.position.set(cx, DY + (n > 1 ? (i ? -1 : 1) * (maxH + gap) / 2 : 0), -DETAIL_R); m.rotation.set(0, 0, 0); }
      else { m.position.set(cx, DY + 0.01, -DETAIL_R + 0.16 + i * 0.035); m.rotation.set(0, -0.1 - i * 0.07, 0); x += shotW + gap; }
      ui.loadImage(s.url).then((im) => {
        if (gen !== detailGen) return;
        const tex = ui.imageTexture(im);
        tex.premultiplyAlpha = true;                       // clean edges on the cut-out, at every mip level
        m.material.map = tex; m.material.color.set('#ffffff'); m.material.needsUpdate = true;
        m.visible = true;                                   // nothing is shown until there is a picture: no placeholder boxes
        invalidate();
      }).catch(() => {});
    });
  }

  // text: jobs, education, skills and older projects. One point per page, in large type.
  const textPanel = ui.canvasTexture(1280, 800);
  const textMesh = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: textPanel.tex, transparent: true }));
  textMesh.scale.set(1.3, 1.3 * 800 / 1280, 1);
  textMesh.position.set(0, DY, -DETAIL_R);
  textMesh.visible = false;
  detail.add(textMesh);
  function drawText(item, page) {
    const { ctx, tex } = textPanel, n = item.pages.length;
    ctx.clearRect(0, 0, 1280, 800);
    ui.roundRect(ctx, 4, 4, 1272, 792, 48);
    ctx.fillStyle = 'rgba(12,18,32,.97)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = COL.edge; ctx.stroke();
    ctx.fillStyle = item.color || COL.accent; ui.roundRect(ctx, 60, 56, 10, 150, 5); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.ink; ctx.font = '700 62px ' + FONT;
    ctx.fillText(item.title, 96, 108, 1120);
    ctx.fillStyle = item.color || COL.accent; ctx.font = '500 40px ' + FONT;
    ctx.fillText(item.sub || '', 96, 162, 1120);
    ctx.fillStyle = COL.soft; ctx.font = '400 30px ' + FONT;
    ctx.fillText(item.meta || '', 96, 208, 1120);
    ctx.fillStyle = COL.ink; ctx.font = '400 50px ' + FONT;
    ui.wrapLines(ctx, item.pages[page] || '', 1140, 7).forEach((l, i) => ctx.fillText(l, 70, 318 + i * 62));
    if (n > 1) {
      ctx.fillStyle = COL.soft; ctx.font = '500 30px ' + FONT; ctx.textAlign = 'right';
      ctx.fillText(tr('pos.' + (item.pageWord || 'page'), { n: page + 1, total: n }), 1210, 752);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === page ? COL.accent : COL.edge;
        ctx.beginPath(); ctx.arc(84 + i * 34, 742, i === page ? 10 : 7, 0, Math.PI * 2); ctx.fill();
      }
    }
    tex.needsUpdate = true; invalidate();
  }

  function clearDetail() {
    detailGen++;
    photoTile.group.visible = captionMesh.visible = panoRoot.visible = appGroup.visible = textMesh.visible = false;
    setPhoto(null, 1.5);
    ui.emptyGroup(panoGroup);
    shotMeshes.forEach((m) => { if (m.material.map) { m.material.map.dispose(); m.material.map = null; } });
    sky.object.visible = floor.visible = true;
    detailTargets.length = 0;
    clearInterval(playTimer); state.playing = false;
    state.view = state.at < 0 ? 'home' : 'area'; state.area = null; state.item = null; state.index = -1;
  }
  const viewOf = (item) => (item.kind === 'photo' ? 'photo' : item.kind === 'app' ? 'app' : item.kind === 'text' ? 'text' : 'pano');

  // Open one item, straight ahead, in place of the area it came from.
  function openItem(a, item, preview, index) {
    const fromList = $('items').contains(document.activeElement);
    clearDetail();
    setHover(null);
    state.hidden = false;
    state.at = areaIndex(a);
    state.view = viewOf(item);
    state.area = a; state.item = item; state.index = index; state.textPage = 0;
    if (state.view === 'photo') showPhoto(item, preview, detailGen, false);
    else if (state.view === 'app') { showApp(item, preview, detailGen); detailTargets.push(openBtn.face); }
    else if (state.view === 'text') { textMesh.visible = true; drawText(item, 0); setStatus(''); }
    else showPano(item, preview, detailGen);
    if (!presenting) lookAt(0, 0);
    syncUI();
    if (fromList) $('info-close').focus();
  }
  function closeDetail() {
    if (!isOpen()) return;
    const a = state.area, index = state.index, item = state.item, inInfo = $('info').contains(document.activeElement);
    clearDetail();
    setStatus('');
    if (a.wall && index >= 0) { a.page = Math.floor(index / PER_PAGE); buildWall(a); }
    buildItemList();
    syncUI();
    if (inInfo) {
      let i = a.wall ? index % PER_PAGE : 0;
      if (!a.wall) for (let k = 0; k < a.cards.length; k++) if (a.cards[k].item === item) { i = k; break; }
      const b = $('items').querySelectorAll('button')[i];
      if (b) b.focus();
    }
  }
  // Back: an open item closes to its area, an area closes to the overview, and "Sky only" ends.
  function back() {
    if (state.hidden) setHidden(false);
    else if (isPanel()) closePanel();
    else if (isOpen()) closeDetail();
    else if (state.view === 'area') showArea(-1);
  }
  // Prev/next: pages of text, else neighbouring items, else pages of the wall.
  function step(d) {
    if (state.hidden) return;
    if (isOpen()) {
      const item = state.item, a = state.area;
      if (state.view === 'text') {
        const n = item.pages.length;
        if (n > 1) { state.textPage = (state.textPage + d + n) % n; drawText(item, state.textPage); syncUI(); }
      } else if (a.wall && state.index >= 0) {
        const list = a.items;
        let i = (state.index + d + list.length) % list.length;
        for (let k = 0; k < list.length && state.view === 'photo' && list[i].kind !== 'photo'; k++) i = (i + d + list.length) % list.length;
        if (state.view === 'photo') {            // the viewer stays up; only the picture changes
          state.item = list[i]; state.index = i;
          showPhoto(list[i], null, ++detailGen, true);
          syncUI();
        } else openItem(a, list[i], null, i);
      }
      return;
    }
    const a = AREAS[state.at];
    if (a && a.wall) setPage(a, a.page + d);
  }
  function setPage(a, p) {
    p = Math.max(0, Math.min(pageCount(a) - 1, p));
    if (p === a.page) return;
    a.page = p;
    buildWall(a); syncUI();
  }
  function setSet(s) {
    const a = AREAS[0];
    if (!SETS[s]) return;
    if (isOpen() && state.area === a) clearDetail();
    a.set = s; a.page = 0;
    a.items = galleryItems(s);
    a.sign.userData.draw(galleryCount());
    buildWall(a); syncUI();
  }
  function openSite(url) {
    const session = renderer.xr.getSession();
    leaving = true;
    if (session) session.end().catch(() => {}).then(() => location.assign(url));
    else location.assign(url);
  }

  // ------------------------------------------------------------------ turning
  let yaw = 0, pitch = 0, yawTo = 0, pitchTo = 0;
  const PITCH_MAX = 1.35;
  function lookAt(y, p) {
    yawTo = yaw + wrapAngle(y - yaw);        // the short way round
    pitchTo = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p));
    if (reducedMotion) { yaw = yawTo; pitch = pitchTo; }
    invalidate();
  }
  function lookBy(dy, dp) {
    yawTo += dy; pitchTo = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitchTo + dp));
    yaw = yawTo; pitch = pitchTo;
    invalidate();
  }
  function turnBy(rad) { world.rotation.y += rad; invalidate(); }     // a controller's thumbstick only: a deliberate snap turn

  // Show one area in place of whatever is up (-1: the overview).
  function showArea(i) {
    if (i >= AREAS.length || i < -1) return;
    if (isOpen()) clearDetail();
    setHover(null);
    setStatus('');
    state.hidden = false;
    state.at = i; state.view = i < 0 ? 'home' : 'area';
    if (!embedded) {
      const want = i < 0 ? '' : '#' + AREAS[i].hash;
      if (location.hash !== want) { try { history.replaceState(null, '', want || location.pathname + location.search); } catch (e) { /* file: or sandboxed */ } }
    }
    if (!presenting) lookAt(0, 0);
    buildItemList();
    syncUI();
  }
  // "Sky only": everything put away, the planetarium left.
  function setHidden(on) {
    on = !!on;
    if (on === state.hidden) return;
    if (on && isOpen()) closeDetail();
    setHover(null);
    state.hidden = on;
    buildItemList();
    syncUI();
  }
  // The time-lapse and the trails belong to the sky, not to "Sky only": they keep running when the
  // portfolio comes back, only never faster than LAPSE_CALM while it is in front of them.
  function setLapse(on, rate) {
    lapse = !!on;
    lapseRate = lapse ? rate || lapseRate || LAPSE_RATES[0] : 0;
    if (!lapse) { trails = false; sky.setTrails(0); skyT = skyBase(); skyNow(); }
    syncUI();
  }
  // The button: off, then each speed in turn, then off again.
  function cycleLapse() {
    const i = LAPSE_RATES.indexOf(lapseRate);
    if (i === LAPSE_RATES.length - 1) setLapse(false); else setLapse(true, LAPSE_RATES[i + 1]);
  }
  const lapseLabel = () => (lapse ? tr('btn.lapse.rate', { rate: tr('lapse.' + (LAPSE_RATES.indexOf(lapseRate) + 1)) }) : tr('btn.lapse'));
  // Star trails: a long exposure. They only mean something while the sky is turning, so turning them
  // on starts the time-lapse, and they grow from nothing as it runs.
  let trails = false, trailFrom = 0;
  function setTrails(on) {
    trails = !!on;
    if (trails) { trailFrom = skyT; if (!lapse) { lapse = true; lapseRate = LAPSE_RATES[0]; } }
    else sky.setTrails(0);
    syncUI();
  }

  // ------------------------------------------------------------------ the time machine
  // The same idea as the home page's ?when=: everything calendar-driven reads `nowDate()`. Going
  // back takes away what did not exist yet; going forward adds what cannot be read yet, changes
  // the dogs, and far enough ahead hands the place on. Here it happens in place (a page load
  // would end the VR session), behind a short fade so nothing appears to rush past the visitor.
  let travel = null;                 // { date, clock, sky, at } while away from the present
  const nowDate = () => (travel ? new Date(travel.date.getTime()) : new Date());
  skyBase = () => (travel ? travel.sky + (Date.now() - travel.at) : Date.now());
  let dogs = null, founder = false, inPast = false;
  const fmtWhen = (d, clock) => {
    const f = { month: 'short', day: '2-digit', year: 'numeric' };
    if (clock) { f.hour = 'numeric'; f.minute = '2-digit'; }
    try { return d.toLocaleString(lang, f).toLocaleUpperCase(lang); } catch (e) { return ymd(d); }
  };
  const unwritten = (item) => ({ kind: 'text', title: site('fut.unwritten', 'From after your time'), sub: item.note ? item.title : String(item.year), meta: '', pages: [site('fut.unwritten.p', '')], pageWord: 'page', color: COL.accent });
  const dogTiles = (list, each) => { const out = []; for (const d of list) if (!d.real) for (let q = 0; q < each; q++) out.push({ kind: 'ghost-photo', label: d.name, seed: d.k * 5 + q, c: COL.bg2 }); return out; };
  function galleryItems(set) {
    if (set === 'all') return photos;
    const lumas = photos.filter((p) => p.tags.includes('luma'));
    if (set === 'luma') return dogs && dogs.changed ? (dogs.lumaHere ? lumas : []).concat(dogTiles(dogs.alive, 4)) : lumas;
    if (set === 'museum') return dogs ? (dogs.lumaHere ? [] : lumas).concat(dogTiles(dogs.gone.slice(-12), 3)) : [];
    return photos.filter((p) => p.tags.includes(set));
  }
  const galleryCount = () => { const a = AREAS[0], n = a.items.reduce((k, x) => k + (x.kind === 'photo' ? 1 : 0), 0); return a.set === 'all' ? tr('count.gallery', { n }) : n ? tr('count.set', { n, set: SETS[a.set] }) : SETS[a.set]; };     // dogs nobody has photographed yet: just their names

  // One line above everything: today's greeting if there is one, and where in time this is.
  const banner = ui.canvasTexture(1536, 208);
  const bannerMesh = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: banner.tex, transparent: true, depthWrite: false }));
  bannerMesh.scale.set(1.5, 1.5 * 208 / 1536, 1);
  ui.place(bannerMesh, 0, EYE + 1.56, R);
  bannerMesh.visible = false;
  rig.add(bannerMesh);
  let greeting = '';
  function drawBanner() {
    const { ctx, tex } = banner, dest = travel ? site('tm.dest', 'Destination time').toLocaleUpperCase(lang) + '  ·  ' + fmtWhen(travel.date, travel.clock) : '';
    ctx.clearRect(0, 0, 1536, 208);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (greeting) { ctx.fillStyle = COL.ink; ctx.font = '700 76px ' + FONT; ctx.fillText(greeting, 768, dest ? 84 : 124, 1480); }
    if (dest) { ctx.fillStyle = COL.green; ctx.font = '600 46px ' + FONT; ctx.fillText(dest, 768, greeting ? 166 : 124, 1480); }
    tex.needsUpdate = true;
    $('greet').textContent = greeting; $('greet').hidden = !greeting;
    $('tm-bar').hidden = !travel; $('tm-date').textContent = dest;
    invalidate();
  }

  // Weather and lights for the day (see seasons.js). Nothing in the founder era.
  const fx = createSeasonFx(THREE, { reduced: reducedMotion });
  fx.object.position.set(0, EYE, 0);
  scene.add(fx.object);
  function applySeason() {
    const on = cal.seasonOn(nowDate());
    fx.set(on ? { effect: on.season.effect, colors: on.season.colors, lights: on.season.lights } : null);
    greeting = !on || !on.onDay || !on.season.greet ? '' : on.season.id === 'luma' ? site('bday.today', '').replace('{age}', on.age) : site('season.' + on.season.id, '');
  }

  // Rebuild what the scene shows for the date in force.
  function applyTime() {
    const when = nowDate(), past = !!travel && when < new Date(), future = !!travel && when > new Date();
    const day = ymd(when), month = day.slice(0, 7);
    inPast = past;
    const undatedOK = !past || !firstPhotoDay || day >= firstPhotoDay;
    photos = past ? photosAll.filter((x) => (x.taken ? x.taken <= day : undatedOK)) : photosAll;
    panosNow = undatedOK ? panos : [];
    apps = past ? appsAll.filter((x) => !x.date || x.date.slice(0, 7) <= month) : appsAll.slice();
    if (future) {
      const list = [];
      for (const f of cal.futureYears(when)) {
        if (f.gap) list.push({ kind: 'ghost', note: true, title: f.from === f.to ? String(f.from) : f.from + ' – ' + f.to, label: site('fut.unwritten', 'From after your time') });
        else for (let g = 0; g < f.count; g++) list.push({ kind: 'ghost', year: f.year, n: 7 + ((f.year + g * 5) % 8), label: site('fut.unwritten', 'From after your time') + ', ' + f.year });
      }
      apps = list.concat(apps);
    }
    dogs = future ? cal.dogsAt(when) : null;
    founder = future && cal.isFounder(when);
    const who = dogs && dogs.changed ? dogs.alive.map((d) => d.name).join(' & ') || dogs.gone[dogs.gone.length - 1].name : tr('set.luma');
    SETS = { all: tr('set.all'), 120: tr('set.120'), luma: who };
    if (dogs && dogs.gone.length) SETS.museum = site('fut.museum.h', 'The best of doggos');
    const ym2 = (v) => { const m = /^(\d{1,2})\/(\d{4})$/.exec(String(v || '')); return m ? m[2] + '-' + ('0' + m[1]).slice(-2) : ''; };
    resumeNow = !past || !resume ? resume : Object.assign({}, resume, {
      experience: (resume.experience || []).filter((j) => !ym2(j.start) || ym2(j.start) <= month),
      education: (resume.education || []).filter((j) => !ym2(j.start) || ym2(j.start) <= month),
    });
    // skills have no dates of their own: they come from the work, so before any work there are none
    if (past && resumeNow && !(resumeNow.experience || []).length) resumeNow.skills = [];
    projectsNow = past ? projectList.filter((x) => !x.date || String(x.date).slice(0, 7) <= month) : projectList;

    if (isOpen()) clearDetail();
    const g = AREAS[0], ap = AREAS[2];
    g.all = photos; if (!SETS[g.set]) g.set = 'all';
    g.items = galleryItems(g.set); g.page = 0; g.key2 = '';
    ap.all = ap.items = apps; ap.page = 0; ap.key2 = '';
    const pn = AREAS[1];
    pn.all = pn.items = panosNow; pn.page = 0; pn.key2 = '';
    pn.sign.userData.draw(countOf(pn)); buildWall(pn);
    g.sign.userData.draw(galleryCount()); ap.sign.userData.draw(countOf(ap));
    buildWall(g); buildWall(ap);
    buildXp(resumeNow, projectsNow);
    for (const d of homeDraws) d();
    homeSign.userData.draw(founder ? site('fut.founder.h', '') : travel ? '' : tr('home.sub'),     // "fourteen years of work" is only true today
       founder ? (location.hostname.replace(/^www\./, '') || 'wemiller.com') : 'Blaine Miller');
    founderBtn.face.visible = founder;
    const lumaBtn = root.querySelector('#hud [data-set="luma"]'), museumBtn = root.querySelector('#hud [data-set="museum"]');
    if (lumaBtn) lumaBtn.textContent = SETS.luma;
    if (museumBtn) { museumBtn.hidden = !SETS.museum; museumBtn.textContent = SETS.museum || ''; }
    applySeason();
    drawBanner();
    if (!lapse) { skyT = skyBase(); skyNow(); }
    search.refresh();
    buildItemList();
    syncUI();
  }
  // A few of the unreadable cards flicker into other nonsense, as on the home page.
  const ghostTimer = setInterval(() => {
    if (document.hidden || reducedMotion || state.hidden || state.view !== 'area' || state.at !== 2 || !ghostCards.length) return;
    for (let k = 0; k < 2; k++) ghostCards[Math.floor(Math.random() * ghostCards.length)]();
  }, 160);

  // The fade. A dark shell closes round the visitor's head, the destination resolves out of
  // noise in front of them, the scene is swapped while it cannot be seen, and the shell opens
  // again. Nothing streams past, so there is no sense of being moved. With reduced motion asked
  // for there is no fade at all: the scene changes and the destination is shown for a moment.
  const warpShell = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), new THREE.MeshBasicMaterial({ color: COL.bg, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  warpShell.renderOrder = 60; warpShell.visible = false; warpShell.frustumCulled = false;
  const warpText = ui.canvasTexture(1536, 384);
  const warpSign = new THREE.Mesh(ui.PLANE, new THREE.MeshBasicMaterial({ map: warpText.tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  warpSign.renderOrder = 61; warpSign.visible = false; warpSign.scale.set(1.1, 1.1 * 384 / 1536, 1);
  scene.add(warpShell, warpSign);
  const warp = { on: false, t: 0, swapped: false, text: '', fn: null };
  const WARP = { close: 450, hold: 750, open: 550 };
  function drawWarp(k) {             // k: how much of the destination has resolved, 0..1
    const { ctx, tex } = warpText;
    ctx.clearRect(0, 0, 1536, 384);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.green; ctx.font = '600 56px ' + FONT;
    ctx.fillText(warp.label, 768, 120, 1480);
    let out = '';
    for (let i = 0; i < warp.text.length; i++) out += warp.text[i] === ' ' || i < warp.text.length * k ? warp.text[i] : scramble(1);
    ctx.fillStyle = COL.ink; ctx.font = '700 132px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(out, 768, 286, 1480);
    tex.needsUpdate = true;
  }
  function startWarp(text, label, fn) {
    if (warp.on) { fn(); return; }
    warp.on = true; warp.t = 0; warp.swapped = false; warp.text = text; warp.label = label; warp.fn = fn;
    const pos = presenting ? xr.head.pos : camera.position, fwd = presenting ? xr.head.fwd : camera.getWorldDirection(new THREE.Vector3());
    warpSign.position.copy(pos).addScaledVector(fwd, 1.2);
    warpSign.lookAt(pos);
    warpShell.visible = !reducedMotion; warpSign.visible = true;
    drawWarp(reducedMotion ? 1 : 0);
    if (reducedMotion) { warp.swapped = true; fn(); }
    invalidate();
  }
  function updateWarp(dt) {
    if (!warp.on) return;
    warp.t += dt;
    const total = WARP.close + WARP.hold + WARP.open, t = warp.t;
    const dark = t < WARP.close ? t / WARP.close : t < WARP.close + WARP.hold ? 1 : Math.max(0, 1 - (t - WARP.close - WARP.hold) / WARP.open);
    warpShell.position.copy(presenting ? xr.head.pos : camera.position);
    warpShell.material.opacity = 0.96 * dark * dark * (3 - 2 * dark);
    warpSign.material.opacity = reducedMotion ? Math.min(1, (total - t) / 300) : Math.min(1, dark * 1.6);
    if (!reducedMotion && t > WARP.close * 0.5) drawWarp(Math.min(1, (t - WARP.close * 0.5) / (WARP.hold * 0.9)));
    if (!warp.swapped && t >= WARP.close + 80) { warp.swapped = true; warp.fn(); }
    if (t >= total) { warp.on = false; warpShell.visible = warpSign.visible = false; }
    invalidate();
  }

  // Go to a date (null: back to the present). `clock` is "HH:MM" when a time of day was chosen too.
  function travelTo(date, clock) {
    const real = new Date();
    const apply = () => {
      if (!date) travel = null;
      else {
        const skyAt = clock ? date : new Date(date.getFullYear(), date.getMonth(), date.getDate(), real.getHours(), real.getMinutes());
        travel = { date, clock: clock || '', sky: skyAt.getTime(), at: Date.now() };
      }
      if (!embedded) {
        try {
          const u = new URL(location.href);
          u.searchParams.delete('date');
          if (travel) u.searchParams.set('when', ymd(date) + (clock ? 'T' + clock : '')); else u.searchParams.delete('when');
          history.replaceState(null, '', u.toString());
        } catch (e) { /* file: or sandboxed */ }
      }
      if (lapse) setLapse(false);
      state.at = -1; state.view = 'home';
      applyTime();
    };
    startWarp(date ? fmtWhen(date, clock) : fmtWhen(real, ''), site(date ? 'tm.dest' : 'tm.now', date ? 'Destination time' : 'Back to the present').toLocaleUpperCase(lang), apply);
  }

  // ------------------------------------------------------------------ search and time machine panels
  const SECTION_AREA = { '#gallery': 0, '#work': 2, '#projects': 2, '#experience': 3, '/?mode=hire#experience': 3 };
  const search = buildSearch({
    THREE, ui, EYE, invalidate,
    // only what exists on the date in force, and only what can be shown or reached from here
    accept(e) {
      e.leaves = false;
      if (e.k === 'photo') return photos.some((x) => x.file === String(e.u).split('#')[1] + '.webp');
      if (e.k === 'section') return SECTION_AREA[e.u] !== undefined;
      if (e.k === 'project') {
        if (apps.some((x) => x.kind === 'app' && x.title === e.t) || xp.cards.some((c) => c.item && c.item.title === e.t)) return true;
        return false;
      }
      if (e.u === '/xr/') return false;
      // a page that belongs to an app or tool exists only once that app does
      if (inPast && /^\/(apps|tools)\/[^/]+\//.test(e.u) && !apps.some((x) => x.kind === 'app' && x.url && e.u.indexOf(x.url) === 0)) return false;
      e.leaves = e.u !== '/panos/';          // an ordinary page: choosing it leaves this view (and VR)
      return e.u !== '/panos/' || panosNow.length > 0;
    },
    onPick(e) {
      if (e.k === 'photo') {
        const g = AREAS[0], i = photos.findIndex((x) => x.file === String(e.u).split('#')[1] + '.webp');
        if (i < 0) return;
        g.set = 'all'; g.items = photos; g.sign.userData.draw(galleryCount());
        openItem(g, photos[i], null, i);
      } else if (e.k === 'section') showArea(SECTION_AREA[e.u]);
      else if (e.k === 'project') {
        const app = apps.find((x) => x.kind === 'app' && x.title === e.t), card = xp.cards.find((c) => c.item && c.item.title === e.t);
        if (app) openItem(AREAS[2], app, null, apps.indexOf(app)); else if (card) openItem(xp, card.item, null, -1);
      } else if (e.u === '/panos/') showArea(1);
      else openSite(e.u);
    },
    onQuery(q) { if ($('search-q').value !== q) $('search-q').value = q; },
    onResults(labels) { $('search-sr').textContent = labels.length ? labels.join(', ') : ''; if (state.view === 'search') rebuildTargets(); },
  });
  const timeMachine = buildTimeMachine({
    THREE, ui, EYE, invalidate, cal,
    onGo(d) { travelTo(d, ''); },
    onNow() { travelTo(null); },
    onNamed(id) { const d = cal.eventDate(id, new Date()); if (d) { if (id === 'luma') AREAS[0].set = 'luma'; travelTo(d, ''); } },
    onChange() { rebuildTargets(); },
  });
  search.group.visible = timeMachine.group.visible = false;
  content.add(search.group, timeMachine.group);
  const isPanel = () => state.view === 'search' || state.view === 'time';
  function openPanel(name) {
    if (isOpen()) clearDetail();
    setHover(null);
    state.hidden = false;
    state.view = name;
    if (name === 'search') search.open();
    else {
      const d = nowDate(), c = travel && travel.clock ? d : new Date(), p2 = (n) => ('0' + n).slice(-2);
      $('tm-input').value = ymd(d) + 'T' + p2(c.getHours()) + ':' + p2(c.getMinutes());
      timeMachine.open(d, !!travel);
    }
    if (!presenting) lookAt(0, 0);
    syncUI();
    if (name === 'search' && !presenting) $('search-q').focus({ preventScroll: true });
  }
  function closePanel() { if (!isPanel()) return; state.view = state.at < 0 ? 'home' : 'area'; buildItemList(); syncUI(); }

  // ------------------------------------------------------------------ moving everything (headset only)
  // The Move handle on the bar is the one way to re-place the content: point at it, hold the pinch or
  // trigger, and drag. Everything swings round the visitor's eyes with the pointer, left and right and
  // up and down, so it can be put overhead for lying back. Nothing else moves it. Selecting the handle
  // without a drag (a fingertip press, or a dwell with no pointer) brings everything to where the
  // visitor is looking.
  const PITCH_LIMIT = 1.45;
  const moveFrom = { yaw: 0, pitch: 0, wy: 0, wx: 0 };
  function placeWorld(yaw, pitch) {
    world.rotation.set(Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)), yaw, 0);
    floor.visible = Math.abs(world.rotation.x) < 0.06 && state.view !== 'pano';     // floor rings only make sense when level
    invalidate();
  }
  function dragStart(yaw, pitch) {
    world.position.copy(xr.head.pos);            // pivot on where the eyes are now (they may have lain down since coming in)
    moveFrom.yaw = yaw; moveFrom.pitch = pitch; moveFrom.wy = world.rotation.y; moveFrom.wx = world.rotation.x;
    B.move.set({ active: true });
  }
  function dragMove(yaw, pitch) { placeWorld(moveFrom.wy - wrapAngle(yaw - moveFrom.yaw), moveFrom.wx + (pitch - moveFrom.pitch)); }
  function dragEnd() { B.move.set({ active: false }); }
  function bringHere() {
    if (!presenting || !xr.head.valid) return;
    world.position.copy(xr.head.pos);
    // the bar sits about 26 degrees below the centre of the content; aim so that the content, not the bar, is ahead
    placeWorld(-xr.head.theta, Math.asin(Math.max(-1, Math.min(1, xr.head.fwd.y))));
  }

  // ------------------------------------------------------------------ passthrough (headset only)
  // A session cannot change between VR and AR while it runs. So where the headset offers AR, that is
  // the session asked for, and the scene paints its own sky and ground over the real room: it looks
  // and behaves as VR. Passthrough is then just not painting them, which can be switched at any moment.
  function setPassthrough(on) {
    state.passthrough = !!on && presenting && xr.ar;
    sky.setPassthrough(state.passthrough);
    syncUI();
  }

  // ------------------------------------------------------------------ where north is (headset only)
  // A WebXR session has no compass, so by default the sky's north is simply "ahead". Where the device
  // reports a compass heading (phones and phone viewers) the sky is turned to the real north and kept
  // there. Otherwise the visitor can face north and choose "Set north here".
  const compass = createCompass();
  const north = { mode: '', theta: 0 };
  function setNorthByHand() {
    if (!presenting) return;
    north.mode = 'hand'; north.theta = xr.head.theta;
    sky.setNorth(north.theta);
    setStatus(tr('status.north'));
    syncUI();
  }
  function followCompass() {
    if (north.mode === 'hand') return;
    const h = compass.heading();
    if (h === null) return;
    const t = xr.head.theta - h;               // looking at scene heading head.theta, which is compass heading h
    if (north.mode !== 'compass') { north.mode = 'compass'; north.theta = t; syncUI(); }
    else north.theta += wrapAngle(t - north.theta) * 0.03;      // eased: a compass is jittery
    sky.setNorth(north.theta);
  }

  // ------------------------------------------------------------------ in-world controls (headset only)
  // One bar, low and straight ahead: a row for what is open, a row for getting about.
  const BH = 0.09;
  const bar = new THREE.Group();
  bar.visible = false;
  rig.add(bar);                // not in `content`: it stays when everything else is hidden
  // A row never spans more than about 70 degrees: in a language with long words the whole row is
  // drawn a little smaller instead of running round the visitor.
  const ROW_MAX = 1.22;
  function layoutRow(list, y, r, tilt) {
    const gap = 0.028;
    let total = -gap;
    for (const b of list) total += b.w + gap;
    const k = Math.min(1, (ROW_MAX * r) / Math.max(total, 0.01));
    let x = (-total * k) / 2;
    for (const b of list) { b.face.scale.set(b.w * k, b.h * k, 1); ui.place(b.face, (x + (b.w * k) / 2) / r, y, r, tilt); x += (b.w + gap) * k; }
  }
  const exitVR = () => { const s = renderer.xr.getSession(); if (s) s.end(); };
  const nextSet = () => { const k = Object.keys(SETS); setSet(k[(k.indexOf(String(AREAS[0].set)) + 1) % k.length]); };
  let music = null;
  const B = {
    back: ui.makeButton(tr('btn.back'), 0.26, BH, () => back()),
    prev: ui.makeButton(tr('btn.prev'), 0.25, BH, () => step(-1)),
    pos: ui.makeButton('', 0.42, BH, null, ['pos.page', 'pos.point', 'pos.group'].map((k) => tr(k, { n: 88, total: 88 }))),
    next: ui.makeButton(tr('btn.next'), 0.25, BH, () => step(1)),
    set: ui.makeButton(tr('btn.set', { set: SETS.all }), 0.3, BH, nextSet, Object.keys(SETS).map((k) => tr('btn.set', { set: SETS[k] }))),
    play: ui.makeButton(tr('btn.slideshow'), 0.3, BH, () => togglePlay(), [tr('btn.play'), tr('btn.pause')]),
    areas: AREAS.map((a, i) => ui.makeButton(a.title, 0.2, BH, () => showArea(i))),
    sky: ui.makeButton(tr('btn.sky'), 0.2, BH, () => setHidden(true)),
    show: ui.makeButton(tr('btn.show'), 0.3, BH, () => setHidden(false)),
    guides: ui.makeButton(tr('btn.guides'), 0.3, BH, () => { sky.setGuides(!sky.guides); syncUI(); }),
    lapse: ui.makeButton(tr('btn.lapse'), 0.3, BH, () => cycleLapse(), [1, 2, 3].map((k) => tr('btn.lapse.rate', { rate: tr('lapse.' + k) }))),
    trails: ui.makeButton(tr('btn.trails'), 0.3, BH, () => setTrails(!trails)),
    north: ui.makeButton(tr('btn.north'), 0.3, BH, () => setNorthByHand(), [tr('btn.north.compass'), tr('btn.north.done')]),
    move: ui.makeButton(tr('btn.move'), 0.26, BH, () => bringHere()),
    search: ui.makeButton(site('nav.search', 'Search'), 0.24, BH, () => openPanel('search')),
    time: ui.makeButton(site('tm.title', 'Time machine'), 0.3, BH, () => openPanel('time')),
    now: ui.makeButton(site('tm.now', 'Back to the present'), 0.3, BH, () => travelTo(null)),
    volDown: ui.makeButton('−', 0.1, BH, () => music.setVolume(music.state.volume - 0.1)),
    vol: ui.makeButton('50%', 0.2, BH, null, ['100%']),
    volUp: ui.makeButton('+', 0.1, BH, () => music.setVolume(music.state.volume + 0.1)),
    pass: ui.makeButton(tr('btn.pass'), 0.3, BH, () => setPassthrough(!state.passthrough)),
    music: ui.makeButton(tr('btn.music.off'), 0.3, BH, () => music.toggle(), [tr('btn.music.on'), tr('btn.music.tuning')]),
    exit: ui.makeButton(tr('btn.exit'), 0.24, BH, exitVR),
  };
  const barAll = [B.back, B.prev, B.pos, B.next, B.set, B.play, ...B.areas, B.sky, B.show, B.guides, B.lapse, B.trails, B.north, B.move, B.search, B.time, B.now, B.pass, B.music, B.volDown, B.vol, B.volUp, B.exit];
  B.move.face.userData.draggable = true;        // held and dragged, not just selected: see "moving everything"
  for (const b of barAll) bar.add(b.face);

  // ------------------------------------------------------------------ ambient music (Tom, as on the home page)
  music = (opts.music || createMusic)((s) => {
    B.music.set({ label: tr(!s.on ? 'btn.music.off' : s.tuning ? 'btn.music.tuning' : 'btn.music.on'), active: s.on && !s.tuning });
    const pct = Math.round((s.volume === undefined ? 0.5 : s.volume) * 100);
    B.vol.set({ label: pct + '%' }); B.volDown.set({ disabled: pct <= 0 }); B.volUp.set({ disabled: pct >= 100 });
    if (+$('volume').value !== pct) $('volume').value = pct;
    const b = $('sound');
    b.setAttribute('aria-pressed', String(s.on));
    b.textContent = tr(!s.on ? 'hud.music' : s.tuning ? 'hud.music.tuning' : 'hud.music.on');
    const live = tr('status.tom');
    if (s.on && !s.tuning && s.source === 'tom') setStatus(live); else if (statusIdle === live) setStatus('');
    invalidate();
  });
  { const pct = Math.round((music.state.volume === undefined ? 0.5 : music.state.volume) * 100); B.vol.set({ label: pct + '%' }); $('volume').value = pct; }

  // ------------------------------------------------------------------ keep DOM, in-world controls and targets in step
  function detailPos() {
    const it = state.item;
    if (!it) return '';
    if (state.view === 'text') return it.pages.length > 1 ? tr('pos.' + (it.pageWord || 'page'), { n: state.textPage + 1, total: it.pages.length }) : '';
    if (state.area.wall && state.index >= 0) return tr('pos.item', { n: state.index + 1, total: state.area.items.length });
    return '';
  }
  function canStep() {
    if (state.view === 'text') return state.item.pages.length > 1;
    return state.area.wall && state.index >= 0;
  }
  function rebuildTargets() {
    targets.length = 0;
    if (!state.hidden) {
      if (state.view === 'home') for (const c of homeCards) targets.push(c.face);
      else if (state.view === 'area') { const t = AREAS[state.at].targets; for (let i = 0; i < t.length; i++) targets.push(t[i]); }
      for (let i = 0; i < detailTargets.length; i++) targets.push(detailTargets[i]);
      if (isPanel()) { const t = state.view === 'search' ? search.targets : timeMachine.targets; for (let i = 0; i < t.length; i++) if (t[i].visible) targets.push(t[i]); }
    }
    // the planets, the moon and the sun can be pointed at whenever the sky is in view
    if (sky.object.visible && state.view !== 'pano') { const t = sky.targets; for (let i = 0; i < t.length; i++) targets.push(t[i]); }
    if (presenting) {
      for (const b of barAll) if (b.face.visible) targets.push(b.face);
    }
  }
  function syncUI() {
    const open = isOpen(), item = state.item, fa = state.at >= 0 ? AREAS[state.at] : null, hid = state.hidden;
    const walled = !open && !hid && !!fa && fa.wall;
    const pos = hid ? '' : open ? detailPos() : walled ? tr('pos.page', { n: fa.page + 1, total: pageCount(fa) }) : '';
    const stepOn = !hid && (open ? canStep() : walled);
    const prevOff = !stepOn || (walled && fa.page === 0), nextOff = !stepOn || (walled && fa.page >= pageCount(fa) - 1);
    const galleryUp = !hid && state.at === 0 && (state.view === 'area' || state.view === 'photo');
    const playLabel = tr(state.view !== 'photo' ? 'btn.slideshow' : state.playing ? 'btn.pause' : 'btn.play');

    // what is in the scene
    home.visible = state.view === 'home';
    for (let i = 0; i < AREAS.length; i++) AREAS[i].group.visible = state.view === 'area' && state.at === i;
    detail.visible = open;
    search.group.visible = state.view === 'search'; timeMachine.group.visible = state.view === 'time';
    content.visible = !hid;
    bannerMesh.visible = !!(greeting || travel) && state.view !== 'pano';
    fx.object.visible = state.view !== 'pano';
    captionMesh.visible = presenting && state.view === 'photo';

    // DOM
    root.querySelectorAll('#hud [data-area]').forEach((b) => b.setAttribute('aria-pressed', String(!hid && (fa ? b.dataset.area === fa.key : b.dataset.area === 'home'))));
    root.querySelectorAll('#hud [data-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === String(AREAS[0].set))));
    $('sets').hidden = !galleryUp || state.view !== 'area';
    $('pos').textContent = pos;
    $('pos').hidden = !pos;
    $('prev').hidden = $('next').hidden = !stepOn;
    $('prev').disabled = prevOff; $('next').disabled = nextOff;
    const what = open ? (state.view === 'text' ? item.pageWord || 'page' : 'item') : 'page';
    $('prev').setAttribute('aria-label', tr('aria.prev.' + what));
    $('next').setAttribute('aria-label', tr('aria.next.' + what));
    $('play').hidden = !galleryUp;
    $('play').textContent = playLabel;
    $('play').setAttribute('aria-pressed', String(state.playing));
    $('hud').classList.toggle('is-sky', hid);
    $('sky-only').setAttribute('aria-pressed', String(hid));
    $('sky-only').textContent = tr(hid ? 'btn.show' : 'btn.sky');
    $('guides').hidden = $('lapse').hidden = $('trails').hidden = !hid;
    $('trails').setAttribute('aria-pressed', String(trails));
    $('guides').setAttribute('aria-pressed', String(sky.guides));
    $('lapse').setAttribute('aria-pressed', String(lapse));
    $('lapse').textContent = lapseLabel();
    $('items').hidden = open || hid || isPanel();
    $('search-q').hidden = state.view !== 'search';
    $('tm-form').hidden = state.view !== 'time';
    $('search-open').setAttribute('aria-pressed', String(state.view === 'search'));
    $('tm-open').setAttribute('aria-pressed', String(state.view === 'time'));
    $('info').hidden = !open;
    if (open) {
      $('info-title').textContent = item.title || (item.kind === 'photo' ? tr('photo') : item.label);
      // Text items are already shown large in the scene; the panel keeps the heading visible and gives
      // the current point to screen readers only.
      $('info-text').textContent = state.view === 'text' ? [item.sub, item.meta].filter(Boolean).join(' · ') : item.text;
      $('info-sr').textContent = state.view === 'text' ? item.pages[state.textPage] || '' : '';
      const link = $('info-link');
      link.hidden = state.view === 'text';
      link.textContent = tr(item.kind === 'app' ? 'open.site.plain' : 'open.image');
      link.href = item.kind === 'app' ? item.url : item.src || '/';
    }

    // in-world bar
    B.pos.set({ label: pos });
    B.prev.set({ disabled: prevOff }); B.next.set({ disabled: nextOff });
    B.set.set({ label: tr('btn.set', { set: SETS[AREAS[0].set] }) });
    B.play.set({ label: playLabel, active: state.playing });
    B.guides.set({ active: sky.guides }); B.lapse.set({ active: lapse, label: lapseLabel() }); B.trails.set({ active: trails });
    B.areas.forEach((b, i) => b.set({ active: !hid && i === state.at }));
    // three rows: what is open; where to go; the room itself
    const rowA = [], rowB = [], rowC = [];
    B.north.set({ label: tr(north.mode === 'compass' ? 'btn.north.compass' : north.mode === 'hand' ? 'btn.north.done' : 'btn.north'), active: north.mode !== '' });
    B.pass.set({ active: state.passthrough });
    B.search.set({ active: state.view === 'search' }); B.time.set({ active: state.view === 'time' || !!travel });
    rowC.push(B.move); if (xr.ar) rowC.push(B.pass);
    rowC.push(B.music, B.volDown, B.vol, B.volUp, B.exit);
    if (hid) { rowA.push(B.guides, B.lapse, B.trails, B.north); rowB.push(B.show, B.time); }
    else {
      if (state.view !== 'home') rowA.push(B.back);
      if (stepOn) { rowA.push(B.prev); if (pos) rowA.push(B.pos); rowA.push(B.next); }
      if (galleryUp && state.view === 'area') rowA.push(B.set);
      if (galleryUp) rowA.push(B.play);
      if (state.view !== 'home') rowB.push(...B.areas);
      rowB.push(B.search, B.time, B.sky);
    }
    if (travel) rowB.push(B.now);
    for (const b of barAll) b.face.visible = false;
    let line = 0;
    for (const r of [rowA, rowB, rowC]) {
      if (!r.length) continue;
      for (const b of r) b.face.visible = true;
      layoutRow(r, EYE - 0.84 - line * 0.115, R - 0.15 - line * 0.05, -0.45);
      line++;
    }
    bar.visible = presenting;

    rebuildTargets();
    invalidate();
  }

  // One real button per item being shown, so Tab and screen readers reach everything.
  function buildItemList() {
    const a = state.at >= 0 ? AREAS[state.at] : null, list = $('items');
    list.textContent = '';
    list.setAttribute('aria-label', a ? tr('items.in', { area: a.title }) : tr('hud.areas'));
    (a ? a.cards : homeCards).forEach((c) => {
      const li = document.createElement('li'), btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = c.label;
      btn.addEventListener('focus', () => { lookAt(-c.theta, Math.atan2(c.y - EYE, R)); setHover(c.face); });
      btn.addEventListener('blur', () => { if (hovered === c.face) setHover(null); });
      btn.addEventListener('click', () => c.face.userData.select());
      li.appendChild(btn); list.appendChild(li);
    });
  }

  // ------------------------------------------------------------------ flat-screen input
  // device orientation (phones): opt-in, because iOS needs a permission prompt from a tap
  let motionOn = false, haveMotion = false;
  const devQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const Q_SCREEN = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), Z_AXIS = new THREE.Vector3(0, 0, 1), Y_AXIS = new THREE.Vector3(0, 1, 0);
  function onOrientation(e) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const d = Math.PI / 180, orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d;
    tmpE.set(e.beta * d, e.alpha * d, -e.gamma * d, 'YXZ');
    devQ.setFromEuler(tmpE).multiply(Q_SCREEN).multiply(tmpQ.setFromAxisAngle(Z_AXIS, -orient));
    haveMotion = true;
    invalidate();
  }
  async function toggleMotion() {
    if (!motionOn) {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
          if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') { setStatus(tr('status.motion.denied')); return; }
        }
      } catch (e) { setStatus(tr('status.motion.none')); return; }
      addEventListener('deviceorientation', onOrientation);
      motionOn = true;
    } else {
      removeEventListener('deviceorientation', onOrientation);
      motionOn = false; haveMotion = false;
    }
    $('motion').setAttribute('aria-pressed', String(motionOn));
    invalidate();
  }
  function updateCamera() {
    let moving = false;
    if (yaw !== yawTo || pitch !== pitchTo) {
      yaw += (yawTo - yaw) * 0.18; pitch += (pitchTo - pitch) * 0.18;
      if (Math.abs(yawTo - yaw) < 1e-4 && Math.abs(pitchTo - pitch) < 1e-4) { yaw = yawTo; pitch = pitchTo; }
      moving = true;
    }
    if (motionOn && haveMotion) camera.quaternion.setFromAxisAngle(Y_AXIS, yaw).multiply(devQ);
    else camera.rotation.set(pitch, yaw, 0);
    return moving;
  }

  const ndc = new THREE.Vector2();
  function pickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    updateCamera();
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    return pick();
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (presenting || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no capture */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (presenting) return;
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; canvas.classList.add('is-dragging'); setHover(null); }
      if (drag.moved) {
        const k = (camera.fov * Math.PI / 180) / canvas.clientHeight;
        lookBy((e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
      }
      drag.x = e.clientX; drag.y = e.clientY;
    } else if (e.pointerType === 'mouse') {
      const h = pickAt(e.clientX, e.clientY);
      setHover(h ? h.object : null);
    }
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    canvas.classList.remove('is-dragging');
    if (cancelled || d.moved || presenting) return;
    const h = pickAt(e.clientX, e.clientY);
    if (h) h.object.userData.select();
  }
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
  canvas.addEventListener('pointerleave', (e) => { if (!drag && e.pointerType === 'mouse') setHover(null); });

  function hoverCentre() {
    const r = canvas.getBoundingClientRect();
    const h = pickAt(r.left + r.width / 2, r.top + r.height / 2);
    setHover(h ? h.object : null);
    return h;
  }
  const overlayUp = () => !$('intro').hidden || !$('enter-now').hidden;
  document.addEventListener('keydown', (e) => {
    if (dead || embedded || e.altKey || e.ctrlKey || e.metaKey || presenting || !$('fallback').hidden) return;
    const onCanvas = e.target === canvas, k = e.key, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '');
    if (typing && k !== 'Escape') { if (k === 'Enter' && e.target === $('search-q')) { search.first(); e.preventDefault(); } return; }
    if (k === 'Escape') {
      if (overlayUp()) hideIntro(); else back();
      return;
    }
    if (overlayUp()) return;
    if (k === '/' && !isPanel()) { openPanel('search'); e.preventDefault(); return; }
    if (state.view === 'photo' && (k === 'ArrowLeft' || k === 'ArrowRight')) { step(k === 'ArrowLeft' ? -1 : 1); e.preventDefault(); }   // as in the home page's viewer
    else if (k === ' ' && (onCanvas || e.target === document.body) && !$('play').hidden) { togglePlay(); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      const a = e.shiftKey ? 0.35 : 0.12;
      if (k === 'ArrowLeft') lookAt(yawTo + a, pitchTo); else if (k === 'ArrowRight') lookAt(yawTo - a, pitchTo);
      else if (k === 'ArrowUp') lookAt(yawTo, pitchTo + a); else lookAt(yawTo, pitchTo - a);
      if (onCanvas) { const y = yaw, p = pitch; yaw = yawTo; pitch = pitchTo; hoverCentre(); yaw = y; pitch = p; }
      e.preventDefault();
    } else if (k === 'Enter' && onCanvas) {
      const h = hoverCentre();
      if (h) h.object.userData.select();
      e.preventDefault();
    } else if (k === ',' || k === 'PageUp') { step(-1); e.preventDefault(); }
    else if (k === '.' || k === 'PageDown') { step(1); e.preventDefault(); }
    else if (k >= '0' && k <= '4' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) showArea(+k - 1);
  });

  // ------------------------------------------------------------------ DOM controls
  let flatUsed = false, wasFlat = false, leaving = false;
  function hideIntro() { $('intro').hidden = true; $('enter-now').hidden = true; $('hud').hidden = false; canvas.focus({ preventScroll: true }); invalidate(); }
  function showIntro() { $('enter-now').hidden = true; $('intro').hidden = false; $('start').focus(); }
  $('start').addEventListener('click', () => { flatUsed = true; hideIntro(); });
  $('enter-skip').addEventListener('click', () => { flatUsed = true; hideIntro(); });
  $('help').addEventListener('click', showIntro);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('info-close').addEventListener('click', closeDetail);
  $('motion').addEventListener('click', toggleMotion);
  $('sound').addEventListener('click', () => music.toggle());
  for (const ev of ['pointerenter', 'focus', 'touchstart']) $('sound').addEventListener(ev, () => music.preload(), { passive: true });
  $('play').addEventListener('click', () => togglePlay());
  // words borrowed from the site's dictionary, so they are already in every language
  $('search-open').textContent = site('nav.search', 'Search'); $('tm-open').textContent = site('tm.title', 'Time machine');
  $('tm-now').textContent = site('tm.now', 'Back to the present'); $('tm-go').textContent = site('tm.go', 'Go');
  $('search-q').placeholder = site('search.placeholder', 'Search…'); $('search-q').setAttribute('aria-label', site('nav.search', 'Search'));
  $('volume').setAttribute('aria-label', site('snd.volume', 'Volume')); $('tm-input').setAttribute('aria-label', site('tm.pick', 'Date'));
  $('search-open').addEventListener('click', () => (state.view === 'search' ? closePanel() : openPanel('search')));
  $('tm-open').addEventListener('click', () => {
    if (state.view === 'time') closePanel(); else openPanel('time');
  });
  $('tm-now').addEventListener('click', () => travelTo(null));
  $('tm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const got = cal.parseWhen(String($('tm-input').value || '').slice(0, 16));
    if (got) travelTo(got.date, got.clock);
  });
  $('search-q').addEventListener('input', () => search.setQuery($('search-q').value));
  $('volume').addEventListener('input', () => music.setVolume($('volume').value / 100));
  $('sky-only').addEventListener('click', () => setHidden(!state.hidden));
  $('guides').addEventListener('click', () => { sky.setGuides(!sky.guides); syncUI(); });
  $('lapse').addEventListener('click', () => cycleLapse());
  $('trails').addEventListener('click', () => setTrails(!trails));
  root.querySelectorAll('#hud [data-area]').forEach((b) => b.addEventListener('click', () => showArea(AREAS.findIndex((a) => a.key === b.dataset.area))));
  root.querySelectorAll('#hud [data-set]').forEach((b) => b.addEventListener('click', () => setSet(b.dataset.set)));
  if (lowPower && 'DeviceOrientationEvent' in window) $('motion').hidden = false;
  const onHash = () => { if (dead || embedded) return; const i = HASHES[location.hash.slice(1).toLowerCase()]; if (i !== undefined && i !== state.at) showArea(i); };
  addEventListener('hashchange', onHash);

  // ------------------------------------------------------------------ WebXR
  const xr = createXRInput({
    THREE, renderer, scene,
    getTargets: () => targets,
    setHover, setStatus, turnBy,
    activate: (obj) => { if (obj.userData.select) obj.userData.select(); },
    // Anchor everything in front of the visitor, at their own eye height (seated or standing, 3DoF or
    // 6DoF), facing the way they were facing when the session began. It then stays put: looking or
    // walking around never moves it. (Called again only if the headset itself is re-centred.)
    onFirstPose(head) {
      world.position.copy(head.pos);
      fx.object.position.copy(head.pos);
      placeWorld(-head.theta, 0);
    },
    dragStart, dragMove, dragEnd,
    onSessionStart() {
      presenting = true;
      if (xr.ar) renderer.setClearColor(0x000000, 0);      // an AR session: the painted sky covers the room until Passthrough is chosen
      wasFlat = flatUsed;
      $('intro').hidden = $('enter-now').hidden = true; $('hud').hidden = false;
      setHover(null);
      syncUI(); loop();
    },
    onSessionEnd() {
      presenting = false;
      renderer.setClearColor(COL.bg, 1); state.passthrough = false; sky.setPassthrough(false);
      north.mode = ''; north.theta = 0; sky.setNorth(0);
      world.position.set(0, EYE, 0); world.rotation.set(0, 0, 0); floor.visible = true;
      panoRoot.position.set(0, EYE, 0); panoRoot.rotation.y = 0;
      sky.object.position.set(0, EYE, 0); fx.object.position.set(0, EYE, 0);
      if (embedded) { destroy(); if (opts.onExit) opts.onExit(); return; }
      // Leaving VR goes back to the home page, unless the visitor was already using this page's
      // flat view before they went in (then they come back to where they were).
      if (!wasFlat && !leaving) { leaving = true; location.assign('/'); return; }
      yaw = yawTo = 0; pitch = pitchTo = 0;
      camera.position.set(0, EYE, 0);
      camera.rotation.order = 'YXZ';
      camera.scale.set(1, 1, 1);
      setHover(null);
      syncUI(); resize(); loop();
    },
  });
  // Where the headset offers AR, ask for that (see "passthrough" above). Not on Android phones, where
  // an AR session is the hand-held camera view rather than a headset.
  let arBase = false;
  const handheldAR = /Android/i.test(navigator.userAgent) && !/Quest|OculusBrowser|Pico/i.test(navigator.userAgent);
  // compass.start() is not awaited: the session has to be asked for inside the tap itself
  for (const id of ['enter-vr', 'enter-vr-intro', 'enter-vr-now']) $(id).addEventListener('click', () => { music.preload(); compass.start(); xr.enter(arBase ? 'immersive-ar' : 'immersive-vr'); });
  if (embedded) compass.start();

  const note = $('vr-note');
  const noVR = tr('vr.none');
  const wantEnter = params.has('enter') && params.get('enter') !== '0';
  function vrAvailable(ok) {
    if (ok) {
      $('enter-vr').hidden = $('enter-vr-intro').hidden = false;
      note.textContent = tr('vr.available');
    } else {
      note.textContent = noVR;
      if (!$('enter-now').hidden) showIntro();        // arrived with ?enter=1 but there is nothing to enter
    }
  }
  if (wantEnter && navigator.xr) {
    // A session needs a tap or click, so the most we can do on arrival is make that one button unmissable.
    $('intro').hidden = true;
    $('enter-now').hidden = false;
    $('enter-vr-now').focus();
  }
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(vrAvailable).catch(() => vrAvailable(false));
    if (!handheldAR) navigator.xr.isSessionSupported('immersive-ar').then((ok) => { arBase = !!ok; }).catch(() => {});
  }
  else vrAvailable(false);

  // ------------------------------------------------------------------ size and frame loop
  function resize() {
    if (presenting || renderer.xr.isPresenting) return;
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep at least ~64 degrees across on tall phone screens
    camera.fov = Math.min(100, Math.max(70, (2 * Math.atan(Math.tan(32 * Math.PI / 180) / camera.aspect) * 180) / Math.PI));
    camera.updateProjectionMatrix();
    invalidate();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  let lastT = 0;
  function frame(time, xrFrame) {
    const dt = Math.min(100, time - lastT); lastT = time;
    if (lapse) { skyT += dt * (state.hidden ? lapseRate : Math.min(lapseRate, LAPSE_CALM)); skyNow(); }
    updateWarp(dt);
    if (fx.active && fx.object.visible) fx.update(dt, time / 1000);
    if (trails) sky.setTrails(Math.min(TRAIL_MAX, ((skyT - trailFrom) / 86164000) * Math.PI * 2));     // one turn per sidereal day
    if (renderer.xr.isPresenting) {
      xr.update(xrFrame, time);
      if (xr.head.valid) {
        followCompass();
        sky.object.position.copy(xr.head.pos);          // the sky is infinitely far: it never shows parallax
        // a panorama stays centred on the head: leaning or walking must not distort it
        if (panoRoot.visible) { panoRoot.position.copy(xr.head.pos); panoRoot.rotation.y = world.rotation.y; }
      }
      sky.tick(time / 1000);
      renderer.render(scene, camera);
      return;
    }
    const moving = updateCamera();
    const alive = lapse || warp.on || (fx.active && fx.object.visible) || (state.hidden && !reducedMotion);      // weather, a time-lapse and "Sky only" animate; otherwise draw on demand
    if (dirty || moving || alive) {
      dirty = false;
      if (alive) sky.tick(time / 1000);
      renderer.render(scene, camera);
    }
  }
  // Nothing is drawn while the tab is hidden (a running XR session keeps its own loop).
  function loop() { if (dead) return; renderer.setAnimationLoop((document.hidden || embedded) && !presenting ? null : frame); invalidate(); }
  document.addEventListener('visibilitychange', loop);
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', invalidate);
  function destroy() {
    if (dead) return;
    dead = true;
    clearInterval(skyClock); clearInterval(playTimer); clearInterval(ghostTimer);
    compass.stop();
    document.removeEventListener('visibilitychange', loop);
    removeEventListener('hashchange', onHash);
    ro.disconnect();
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }

  // ------------------------------------------------------------------ go
  for (const a of AREAS) if (a.wall) buildWall(a);
  const startAt = embedded ? undefined : HASHES[location.hash.slice(1).toLowerCase()];
  if (startAt !== undefined) { state.at = startAt; state.view = 'area'; }
  ready = true;
  {
    const w = params.get('when') || params.get('date'), got = w ? cal.parseWhen(w) : null;
    if (got) {
      const real = new Date(), skyAt = got.clock ? got.date : new Date(got.date.getFullYear(), got.date.getMonth(), got.date.getDate(), real.getHours(), real.getMinutes());
      travel = { date: got.date, clock: got.clock, sky: skyAt.getTime(), at: Date.now() };
    }
  }
  applyTime();
  resize();
  loop();

  // For debugging and automated checks only.
  const handle = { homeCards, travelTo, openPanel, closePanel, search, timeMachine, fx, cal, get travel() { return travel; }, get dogs() { return dogs; }, get SETS() { return SETS; }, cycleLapse, setPassthrough, setTrails, north, compass, state, AREAS, showArea, setPage, setSet, openItem, music, closeDetail, back, step, setHidden, setLapse, togglePlay, renderer, scene, camera, world, content, targets, sky, xr, bar, B, invalidate, lookAt, syncUI, destroy };
  if (!embedded) window.__xr = handle;
  if (opts.session) {
    let session = null;
    try { session = await opts.session; } catch (err) { session = null; }
    if (!session || !(await xr.begin(session, !!opts.ar))) { destroy(); if (opts.onExit) opts.onExit('failed'); }
  }
  return handle;
}
