/* wemiller.com — home page behaviour. No dependencies, no build step, ~everything optional:
 * the page reads fine without this file. Sections below are independent of one another. */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var $ = function (s, el) { return (el || doc).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lite = root.classList.contains('lite');
  var dict = null; // the active i18n dictionary, once /i18n/i18n.js has applied it
  doc.addEventListener('i18n:applied', function (e) { dict = e.detail && e.detail.dict; });
  // Words this script writes itself: the active language first, else the English the build left in the page.
  var WORDS = null;
  function L(key) { if (!WORDS) { try { WORDS = JSON.parse($('#future').textContent).s || {}; } catch (e) { WORDS = {}; } } return (dict && dict[key]) || WORDS[key] || ''; }

  /* ---------- time machine: the page can be visited as if it were another day ----------
   * ?when=2027-10-22 or a named day (?when=christmas, ?when=luma, any season id) sets the date
   * that everything calendar-driven reads: the seasons, Luma's birthday and her age.
   * A named day means its most recent occurrence, so a celebration can be replayed afterwards.
   * (?date= still works; it was the original preview switch.) */
  function easterOf(yr) { // Gregorian computus
    var a = yr % 19, b = Math.floor(yr / 100), c = yr % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(yr, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1, 12);
  }
  function memorialOf(yr) { var d = new Date(yr, 4, 31, 12); d.setDate(31 - ((d.getDay() + 6) % 7)); return d; } // last Monday of May
  var SEASONS = []; try { SEASONS = JSON.parse($('#season').getAttribute('data-seasons')) || []; } catch (e) {}
  var DOG_BORN = {};                                           // the named days that are a dog's birthday
  [['luma', '#bday'], ['nova', '#bday-nova']].forEach(function (d) { var el = $(d[1]); if (el) DOG_BORN[d[0]] = el.getAttribute('data-born'); });
  function eventDate(id, today) {
    var s = SEASONS.filter(function (x) { return x.id === id; })[0], k, d = null, y = today.getFullYear();
    var born = DOG_BORN[id];
    if (born) {                                                // the latest birthday, or the first one while it is still to come
      var at = function (yr) { return new Date(yr, +born.slice(5, 7) - 1, +born.slice(8, 10), 12); };
      d = at(at(y) <= today ? y : y - 1);
      return d.getFullYear() > +born.slice(0, 4) ? d : at(+born.slice(0, 4) + 1);
    }
    if (!s || s.date) return s && s.date ? new Date(s.date + 'T12:00:00') : null;
    for (k = 0; k < 2; k++) {
      d = s.rule === 'easter' ? easterOf(y - k) : s.rule === 'memorial' ? memorialOf(y - k) : new Date(y - k, +(s.day || s.from).slice(0, 2) - 1, +(s.day || s.from).slice(3, 5), 12);
      if (d <= today) return d;
    }
    return d;
  }
  var travelClock = '';                                        // "21:30" when the visitor chose a time of day too
  var travelTo = (function () {
    var q = new URLSearchParams(location.search), w = q.get('when') || q.get('date');
    if (!w) return null;
    var m = /^(\d{4}-\d\d-\d\d)(?:T(\d\d:\d\d))?$/.exec(w);
    if (m) { if (m[2]) travelClock = m[2]; return isNaN(Date.parse(m[1] + 'T' + (m[2] || '12:00') + ':00')) ? null : new Date(m[1] + 'T' + (m[2] || '12:00') + ':00'); }
    return eventDate(w.replace(/^(luma|nova)-birthday$/, '$1'), new Date());
  })();
  function nowDate() { return travelTo ? new Date(travelTo.getTime()) : new Date(); }
  // Travelling into the past takes away whatever had not happened yet: apps not released, jobs not
  // started, photographs not taken. They are removed before anything else on the page counts or
  // lays them out, so the gallery, the search and the numbers in the hero all agree with the date.
  var goneIds = {}, goneTitles = {};
  if (travelTo && travelTo < new Date()) (function () {
    var p2 = function (n) { return ('0' + n).slice(-2); };
    var day = travelTo.getFullYear() + '-' + p2(travelTo.getMonth() + 1) + '-' + p2(travelTo.getDate()), month = day.slice(0, 7);
    var drop = function (el) { if (el.id) goneIds[el.id] = 1; var s = $('strong', el); if (s) goneTitles[s.textContent] = 1; el.parentNode.removeChild(el); };
    var before = $$('.ph').length;
    $$('[data-since]').forEach(function (el) { if (el.getAttribute('data-since').slice(0, 7) > month) drop(el); });
    $$('.ph[data-taken]').forEach(function (el) { if (el.getAttribute('data-taken') > day) drop(el); });
    $$('.year').forEach(function (el) { if (!$('.tl', el)) el.parentNode.removeChild(el); });
    $$('.cards').forEach(function (el) { if (!$('.card', el)) el.hidden = true; });
    var set = function (key, value) { var el = $('[data-stat="' + key + '"]'); if (el) { el.setAttribute('data-count', value); el.textContent = value; } };
    var num = function (key) { var el = $('[data-stat="' + key + '"]'); return el ? parseInt(el.getAttribute('data-count'), 10) || 0 : 0; };
    var left = $$('.ph').length, apps = $$('.tl').length;
    set('stat.apps', apps >= 5 ? Math.floor(apps / 5) * 5 + '+' : String(apps));
    set('stat.years', Math.max(0, num('stat.years') - (new Date().getFullYear() - travelTo.getFullYear())) + '+');
    set('stat.media', String(Math.max(0, num('stat.media') - (before - left))));
    set('stat.photos', String(left));
    set('stat.luma', String($$('.ph.t-luma, .ph.t-nova').length));
    root.setAttribute('data-past', '');
  })();
  // the sky behind "Say hello" reads the destination from here (named days are resolved above)
  if (travelTo && travelClock) root.setAttribute('data-when-time', travelClock);
  if (travelTo) root.setAttribute('data-when', travelTo.getFullYear() + '-' + ('0' + (travelTo.getMonth() + 1)).slice(-2) + '-' + ('0' + travelTo.getDate()).slice(-2));

  /* ---------- offline: once visited (or added to a home screen) the site opens with no connection ----------
   * /sw.js keeps a copy of every page and its styles and scripts on this device; photographs are kept as
   * they are viewed. Nothing is sent anywhere. Off on localhost unless ?sw=1 (and ?sw=0 turns it off again),
   * so a saved copy never gets in the way while developing. */
  (function () {
    if (!('serviceWorker' in navigator)) return;
    var on = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    try {
      if (/[?&]sw=1\b/.test(location.search)) localStorage.setItem('wm-sw', '1');
      if (/[?&]sw=0\b/.test(location.search)) localStorage.removeItem('wm-sw');
      on = on || localStorage.getItem('wm-sw') === '1';
    } catch (e) {}
    if (!on) {   // clean up after a local test
      if (/[?&]sw=0\b/.test(location.search)) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { if (/\/sw\.js$/.test((r.active || r.installing || r.waiting || {}).scriptURL || '')) r.unregister(); }); });
      return;
    }
    var start = function () {
      navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        var c = navigator.connection;
        if (c && c.saveData) return;                 // on Save-Data, keep only what is actually visited
        (window.requestIdleCallback || function (f) { setTimeout(f, 3000); })(function () { if (reg.active) reg.active.postMessage({ type: 'warm' }); });
      }).catch(function () {});
    };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  })();

  /* ---------- offline copy: media is opt-in ----------
   * Pages save themselves (above). Photos, panoramas, screenshots and the rest are large, so they are only
   * downloaded when the visitor asks for them here, into their own cache, and one press removes them again.
   * The list and its size come from /offline-media.json (scripts/build-offline.mjs). */
  (function () {
    var open = $('#off-open'), dlg = $('#off');
    if (!open || !dlg || !dlg.showModal || !('caches' in window) || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller && !navigator.serviceWorker.getRegistration) return;
    var MEDIA = 'wm-media-v1', state = $('#off-state'), bar = $('#off-bar'), save = $('#off-save'), stop = $('#off-stop'), rem = $('#off-remove');
    var list = null, busy = false, halt = false, failed = false;
    function mb(b) { return b > 1.5e9 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB'; }
    function words(key, vals) { var s = dlg.getAttribute('data-' + key) || ''; for (var k in vals) s = s.replace('{' + k + '}', vals[k]); return s; }
    function load() { return list ? Promise.resolve(list) : fetch('/offline-media.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { list = j; return j; }); }
    function saved() { return caches.open(MEDIA).then(function (c) { return c.keys(); }).then(function (keys) { var have = {}; keys.forEach(function (k) { have[new URL(k.url).pathname] = 1; }); return have; }); }
    function refresh() {
      return Promise.all([load(), saved()]).then(function (a) {
        var total = a[0].files.length, n = a[0].files.filter(function (f) { return a[1][decodeURI(f)] || a[1][f]; }).length;
        save.textContent = words('save', { size: mb(a[0].bytes) });
        if (busy) return;
        state.textContent = failed ? words('full', {}) : n >= total ? words('done', { size: mb(a[0].bytes) }) : n ? words('part', { n: n, total: total }) : words('none', {});
        save.hidden = n >= total; rem.hidden = !n; stop.hidden = true; bar.hidden = true;
      }).catch(function () { state.textContent = words('none', {}); save.hidden = true; });
    }
    function run() {
      busy = true; halt = false; failed = false; save.hidden = true; rem.hidden = true; stop.hidden = false; bar.hidden = false;
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      Promise.all([load(), saved(), caches.open(MEDIA)]).then(function (a) {
        var l = a[0], have = a[1], c = a[2], todo = l.files.filter(function (f) { return !(have[decodeURI(f)] || have[f]); }), done = l.files.length - todo.length, i = 0;
        function next() {
          if (halt || i >= todo.length) return null;
          var f = todo[i++];
          // ?wm=1 tells sw.js to stay out of the way, so the file is stored once, here
          return fetch(f + '?wm=1').then(function (r) { if (!r.ok) return null; return c.put(f, r); })
            .then(function () { done++; bar.value = done / l.files.length; state.textContent = words('saving', { n: done, total: l.files.length }); }, function () { halt = true; failed = true; })
            .then(next);
        }
        return Promise.all([next(), next(), next(), next()]);
      }).catch(function () { failed = true; }).then(function () { busy = false; refresh(); });
    }
    save.addEventListener('click', run);
    stop.addEventListener('click', function () { halt = true; });
    rem.addEventListener('click', function () {
      halt = true; failed = false;
      // the opt-in cache goes entirely, and so do any of the same files kept from ordinary viewing
      Promise.all([load(), caches.delete(MEDIA), caches.open('wm-files-v1')]).then(function (a) {
        var c = a[2], is = {}; a[0].files.forEach(function (f) { is[decodeURI(f)] = 1; });
        return c.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return is[decodeURI(new URL(k.url).pathname)]; }).map(function (k) { return c.delete(k); })); });
      }).catch(function () {}).then(refresh);
    });
    doc.addEventListener('i18n:applied', function () { if (dlg.open) refresh(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    open.addEventListener('click', function () { dlg.showModal(); refresh(); });
    // only offer it where the offline worker is actually in charge of this page
    navigator.serviceWorker.getRegistration().then(function (reg) { if (reg) open.hidden = false; });
  })();

  /* ---------- nav ---------- */
  var nav = $('#nav');
  function onScroll() { nav.classList.toggle('is-stuck', window.scrollY > window.innerHeight * 0.55); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuBtn = $('#nav-menu');
  if (menuBtn) {
    var setMenu = function (open) { nav.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', function (e) { e.stopPropagation(); setMenu(!nav.classList.contains('is-open')); });
    doc.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('#nav-links') || e.target.closest('a')) setMenu(false); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); } });
  }
  // Light or dark hero: follows the visitor's choice, else the device, and changes with either.
  function syncHero() {
    var th = root.getAttribute('data-theme'), light = th ? th === 'light' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    if (light) root.setAttribute('data-hero', 'light'); else root.removeAttribute('data-hero');
  }
  syncHero();
  if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: light)'); if (mq.addEventListener) mq.addEventListener('change', syncHero); }

  /* ---------- reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach(function (el) {
      // stagger siblings that arrive together
      var sibs = el.parentNode ? Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains('reveal'); }) : [];
      el.style.setProperty('--i', Math.min(sibs.indexOf(el), 6));
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- hero: photographs that follow the view ---------- */
  var hero = $('#top'), heroSets = {};
  try { heroSets = JSON.parse(hero.getAttribute('data-hero')); } catch (e) {}
  var layers = [$('#hero-a'), $('#hero-b')], front = 0, heroIndex = 0, heroTimer = null;
  var wide = window.innerWidth * (window.devicePixelRatio || 1) > 700 && !lite;

  function showHero(item) {
    var next = layers[1 - front], url = wide ? item.l : item.s;
    var pre = new Image();
    pre.onload = function () {
      next.removeAttribute('srcset');
      next.src = url;
      next.style.background = item.c;
      next.classList.add('is-on');
      layers[front].classList.remove('is-on');
      front = 1 - front;
    };
    pre.src = url;
  }
  function cycleHero(view, immediate) {
    clearInterval(heroTimer);
    var set = heroSets[view] || [];
    if (!set.length) return; // the work view has no photograph
    heroIndex = 0;
    if (immediate) showHero(set[0]);
    if (set.length < 2 || reduced || lite) return;
    heroTimer = setInterval(function () {
      if (doc.hidden || window.scrollY > window.innerHeight) return;
      heroIndex = (heroIndex + 1) % set.length;
      showHero(set[heroIndex]);
    }, 9000);
  }

  /* ---------- views ---------- */
  var VIEWS = ['maker', 'hire', 'photo', 'luma'];
  var defaultView = root.getAttribute('data-default-view') || 'maker';
  var viewButtons = $$('.views [data-view-to]'), pill = $('.views__pill');
  var gallery = $('#g'), setButtons = $$('.sets [data-set]'), allPhotos = $$('.ph', gallery), PAGE = 24, PREVIEW = 12, galleryLimit = PAGE, galleryOpen = false;

  // Pack the gallery without reordering it. A tile reports a new size when it is first shown, when the
  // columns change width and when a filter brings it back, so nothing else has to ask for a repack.
  if (gallery && window.ResizeObserver) {
    var sizes = new ResizeObserver(function (entries) {
      entries.map(function (e) {
        var el = e.target, h = el.offsetHeight;
        return [el, h && Math.round(h + parseFloat(getComputedStyle(el).marginBottom || 0))];
      }).forEach(function (m) { if (m[1]) m[0].style.gridRowEnd = 'span ' + m[1]; });
    });
    var watch = function (el) { if (el.nodeType === 1) sizes.observe(el); };
    gallery.classList.add('is-packed');
    Array.prototype.forEach.call(gallery.children, watch);
    if (window.MutationObserver) new MutationObserver(function (changes) {
      changes.forEach(function (c) { Array.prototype.forEach.call(c.addedNodes, watch); });
    }).observe(gallery, { childList: true });
  }

  function movePill() {
    var on = viewButtons.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
    if (!on || !pill) return;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    // on a narrow phone the switcher scrolls sideways: keep the chosen view in sight
    var box = on.parentNode; if (box.scrollWidth > box.clientWidth + 1) box.scrollLeft = Math.max(0, on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2);
  }
  function urlFor(view) {
    var u = new URL(location.href);
    u.searchParams.delete('v'); u.searchParams.delete('mode');
    if (view === 'photo') u.searchParams.set('v', '120');
    else if (view === 'luma') u.searchParams.set('v', 'nova');
    else if (view !== defaultView) u.searchParams.set('mode', view);
    return u;
  }
  // Which photographs belong to the chosen set, in order. The gallery shows the first few and
  // keeps adding more as the visitor nears the end, so nothing has to be asked for.
  var sortMode = 'mine', myOrder = allPhotos.slice();
  function inSet() {
    var set = gallery.getAttribute('data-set');
    return allPhotos.filter(function (a) {
      return set === 'all' || a.classList.contains('t-' + set) || (set === 'luma' && a.classList.contains('t-nova'));
    });
  }
  // Order: the owner's own, or by capture date (photographs with no known date go last).
  function sortGallery(mode) {
    sortMode = mode;
    var dated = function (a) { return a.getAttribute('data-taken') || ''; };
    allPhotos = myOrder.slice();
    if (mode !== 'mine') allPhotos.sort(function (a, b) {
      var x = dated(a), y = dated(b);
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return mode === 'new' ? (x < y ? 1 : x > y ? -1 : 0) : (x < y ? -1 : x > y ? 1 : 0);
    });
    allPhotos.forEach(function (a) { gallery.appendChild(a); });
  }
  function paintGallery() {
    var list = inSet();
    allPhotos.forEach(function (a) { a.classList.remove('is-later'); });
    var limit = galleryOpen ? galleryLimit : PREVIEW;   // a taste while scrolling past; everything once asked for
    allPhotos.forEach(function (a) { if (list.indexOf(a) < 0) a.classList.add('is-later'); });   // filtered out
    list.forEach(function (a, i) { if (i >= limit) a.classList.add('is-later'); });
    var more = $('#g-more'); if (more) more.hidden = galleryOpen || list.length <= PREVIEW;
  }
  function openGallery() { if (!galleryOpen) { galleryOpen = true; paintGallery(); } }
  // The timeline works the same way: the newest few until someone asks for all of it.
  var years = $('.years');
  function openTimeline() { if (years) years.setAttribute('data-open', 'true'); var b = $('#tl-more'); if (b) b.hidden = true; }
  function setGallery(set, keep) {
    if (set) {
      gallery.setAttribute('data-set', set);
      setButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set') === set)); });
    }
    if (!keep) galleryLimit = PAGE;
    paintGallery();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      if (!galleryOpen || !en[0].isIntersecting || galleryLimit >= inSet().length) return;
      galleryLimit += PAGE; paintGallery();
    }, { rootMargin: '0px 0px 900px 0px' }).observe($('#g-end'));
  } else galleryLimit = 9999;
  function applyView(view, opts) {
    opts = opts || {};
    root.setAttribute('data-view', view);
    viewButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-to') === view)); });
    galleryOpen = view === 'photo' || view === 'luma';
    setGallery(view === 'photo' ? '120' : view === 'luma' ? 'luma' : 'all');
    movePill();
    cycleHero(view, !opts.initial);
    if (!opts.initial) {
      var u = urlFor(view); u.hash = '';
      history.replaceState(null, '', u);
    }
  }
  function switchView(view) {
    if (VIEWS.indexOf(view) < 0 || view === root.getAttribute('data-view')) { window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
    var run = function () { applyView(view); window.scrollTo(0, 0); };
    if (doc.startViewTransition && !reduced) doc.startViewTransition(run); else run();
  }
  doc.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-view-to]');
    if (!t || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    switchView(t.getAttribute('data-view-to'));
  });
  applyView(root.getAttribute('data-view'), { initial: true });
  window.addEventListener('resize', movePill);
  window.addEventListener('load', movePill);
  doc.addEventListener('i18n:applied', function () { requestAnimationFrame(movePill); });
  requestAnimationFrame(function () { root.classList.add('pill-ready'); });

  /* ---------- seasons: a little weather in the hero, and a greeting on the day ----------
   * 2D canvas only; off for reduced motion, constrained connections and the Work view; paused
   * when the hero is off screen or the tab is hidden. Preview a date with ?date=YYYY-MM-DD. */
  var seasonEl = $('#season');
  if (seasonEl && root.getAttribute('data-state') !== 'contingency') (function () {   // no celebrations in the contingency state
    var now = nowDate();
    var y = now.getFullYear(), day = function (d) { return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5); }, today = day(now);
    function active(s) {
      if (s.date) return s.date === now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      if (s.rule) { var base = day(s.rule === 'easter' ? easterOf(y) : memorialOf(y)); return today >= base - (s.before || 0) && today <= base + (s.after || 0); }
      var md = ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
      return s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to; // a range may wrap the new year
    }
    var list = []; try { list = JSON.parse(seasonEl.getAttribute('data-seasons')); } catch (e) {}
    var season = list.filter(active)[0];
    if (!season) return;
    root.setAttribute('data-season', season.id);
    // the effect can run for a few days around a holiday; the greeting is for the day itself
    var md = ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    var onDay = season.date ? true : season.rule ? today === day(season.rule === 'easter' ? easterOf(y) : memorialOf(y)) : md === (season.day || season.from) || (!season.day && season.from === season.to);
    if (season.greet && onDay) {
      var greet = function () { seasonEl.textContent = seasonEl.getAttribute('data-g-' + season.id) || ''; seasonEl.hidden = !seasonEl.textContent; };
      greet(); doc.addEventListener('i18n:applied', greet);
    }
    if (lite) return;

    // Christmas lights: a strand swagged under the header, running a light show that changes
    // pattern every few seconds. No yellow bulbs on this tree.
    var BULBS = ['#ff3b4e', '#35e08a', '#4aa8ff', '#ffffff', '#ff6fd0'];
    var GLOWS = {};
    function glow(col, dpr) {
      var k = col + dpr;
      if (!GLOWS[k]) {
        var s = Math.round(88 * dpr), cv = doc.createElement('canvas'), gx = cv.getContext('2d'), gr;
        cv.width = cv.height = s;
        gr = gx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, col); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        gx.globalAlpha = 0.5; gx.fillStyle = gr; gx.fillRect(0, 0, s, s);
        GLOWS[k] = cv;
      }
      return GLOWS[k];
    }
    function lights(ctx, W, dpr, ts) {
      var seg = 250 * dpr, y0 = 66 * dpr, sag = 30 * dpr, step = 34 * dpr, t = ts / 1000, x, y, i, b, col;
      // Brightness of bulb i in pattern p. Each is a continuous function of time, so nothing
      // jumps between frames, and the hand-over from one pattern to the next is a cross-fade.
      var level = function (p, i) {
        var d;
        if (p === 0) { d = ((i - t * 4) % 6 + 6) % 6; d = Math.min(d, 6 - d); return Math.max(0.14, 1 - d / 1.6); }      // a chase that glides
        if (p === 1) return 0.14 + 0.86 * (0.5 + 0.5 * Math.sin(t * 2.2 + (i % 2) * Math.PI));                               // every other bulb, breathing
        if (p === 2) { d = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 12.9898); return 0.2 + 0.8 * d * d; }                           // twinkle
        if (p === 3) return 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(t * 2.4 - i * 0.45));                                         // a wave down the strand
        return 0.72 + 0.28 * Math.sin(t * 1.6 + i * 0.3);                                                                     // all on, shimmering
      };
      var cyc = Math.max(0, ts) / 7000, pattern = Math.floor(cyc) % 5, frac = cyc - Math.floor(cyc);
      var mix = frac > 0.8 ? (frac - 0.8) / 0.2 : 0; mix = mix * mix * (3 - 2 * mix);
      var yAt = function (px) { return y0 + sag * Math.sin(Math.PI * ((px % seg) / seg)); };
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(14, 32, 24, .95)'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      for (x = 0; x <= W + 8; x += 8 * dpr) { if (x === 0) ctx.moveTo(x, yAt(x)); else ctx.lineTo(x, yAt(x)); }
      ctx.stroke();
      for (x = step / 2, i = 0; x < W; x += step, i++) {
        y = yAt(x) + 12 * dpr; col = BULBS[i % BULBS.length];
        b = level(pattern, i) * (1 - mix) + level((pattern + 1) % 5, i) * mix;
        if (ts < 0) b = 1;                                                                    // still frame
        ctx.fillStyle = '#0e2018'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.fillRect(x - 3.5 * dpr, y - 13 * dpr, 7 * dpr, 5 * dpr);                           // the socket
        // the glow is a small picture made once per colour and stamped at the bulb's brightness:
        // blurring every bulb every frame is what made the show stutter when many lit at once
        var g = glow(col, dpr);
        ctx.globalAlpha = b; ctx.drawImage(g, x - g.width / 2, y - g.height / 2);
        ctx.fillStyle = col; ctx.globalAlpha = 0.3 + 0.7 * b;
        ctx.beginPath(); ctx.ellipse(x, y, 5.5 * dpr, 9 * dpr, 0, 0, 6.283); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    if (reduced) {                               // no motion asked for: the lights are simply on
      if (season.lights) {
        var sc = $('#season-fx'), sr = sc.parentNode.getBoundingClientRect(), sd = Math.min(window.devicePixelRatio || 1, 2);
        sc.hidden = false; sc.width = Math.round(sr.width * sd); sc.height = Math.round(sr.height * sd);
        lights(sc.getContext('2d'), sc.width, sd, -1);
      }
      return;
    }

    var c = $('#season-fx'), ctx = c.getContext('2d'), W = 0, H = 0, dpr = 1, bits = [], raf = null, seen = true, fx = season.effect, t0 = 0;
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var PAL = { snow: ['#ffffff', '#dbeaff'], leaves: ['#b5482a', '#8c3b22', '#c9663a', '#6e2f1f'], fireflies: ['#b8ffb0', '#8ef0c0'], embers: ['#b98cff', '#ff7a3d', '#8a5cff'],
      petals: ['#ffc9de', '#cfe3ff', '#d9c8ff', '#c8f2dc'], stars: ['#ffffff', '#e2483f', '#4f8cff'], confetti: ['#6fe0c0', '#6cb6ff', '#ff8fb1', '#ffffff', '#b79cff'],
      fireworks: ['#6cb6ff', '#ff6b6b', '#ffffff', '#9dffcf', '#c9a8ff'] };
    if (season.colors && season.colors.length) PAL[fx] = season.colors;   // this day's own palette
    var COUNT = { snow: 90, leaves: 18, fireflies: 28, embers: 40, petals: 36, stars: 30, confetti: 140, fireworks: 0 };
    function spawn(first) {
      var p = PAL[fx], b = { c: p[Math.floor(Math.random() * p.length)], a: rnd(0, 6.3), va: rnd(-0.03, 0.03), s: rnd(1, 3) * dpr, life: 1 };
      b.x = rnd(0, W); b.y = first ? rnd(0, H) : -20 * dpr; b.vx = rnd(-0.3, 0.3) * dpr; b.vy = rnd(0.35, 1.1) * dpr;
      if (fx === 'leaves') { b.s = rnd(3, 6) * dpr; b.vy = rnd(0.5, 1.2) * dpr; b.va = rnd(-0.04, 0.04); }
      if (fx === 'petals' || fx === 'confetti') { b.s = rnd(4, 7) * dpr; b.vy = rnd(0.6, 1.6) * dpr; b.va = rnd(-0.08, 0.08); }
      if (fx === 'stars') { b.s = rnd(3, 6) * dpr; b.vy = rnd(0.3, 0.8) * dpr; }
      if (fx === 'fireflies') { b.y = rnd(H * 0.35, H); b.vy = rnd(-0.15, 0.15) * dpr; b.s = rnd(1.5, 3) * dpr; }
      if (fx === 'embers') { b.y = first ? rnd(0, H) : H + 20 * dpr; b.vy = -rnd(0.3, 0.9) * dpr; b.s = rnd(1, 2.6) * dpr; }
      return b;
    }
    function burst() {
      var x = rnd(W * 0.15, W * 0.85), yy = rnd(H * 0.12, H * 0.5), col = PAL.fireworks[Math.floor(Math.random() * PAL.fireworks.length)];
      for (var i = 0; i < 46; i++) { var ang = (i / 46) * 6.283, sp = rnd(1.2, 3.4) * dpr; bits.push({ x: x, y: yy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, c: col, life: 1, s: 1.6 * dpr }); }
    }
    function size() {
      var r = c.parentNode.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = c.width = Math.round(r.width * dpr); H = c.height = Math.round(r.height * dpr);
      bits = []; for (var i = 0; i < (COUNT[fx] || 0) * Math.min(1, r.width / 1100 + 0.35); i++) bits.push(spawn(true));
    }
    function star(x, yy, r) { ctx.beginPath(); for (var i = 0; i < 10; i++) { var ang = i * 0.6283 - 1.5708, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(ang) * rr, yy + Math.sin(ang) * rr); } ctx.closePath(); ctx.fill(); }
    var last = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(64, ts - last) : 16, k = dt / 33; last = ts; if (!t0) t0 = ts;   // k: how much of a 30 fps step this frame is
      var age = ts - t0, finite = fx === 'confetti';   // fireworks go on for as long as you watch
      if (finite && age > 14000 && !bits.length) { stop(); c.hidden = true; return; }
      ctx.clearRect(0, 0, W, H);
      if (fx === 'fireworks' && Math.random() < 0.05 * k && bits.length < 420) burst();
      for (var i = bits.length - 1; i >= 0; i--) {
        var b = bits[i];
        b.x += (b.vx + (fx === 'fireworks' ? 0 : Math.sin(b.a) * 0.4 * dpr)) * k; b.y += b.vy * k; b.a += (b.va || 0.02) * k;
        if (fx === 'fireworks') { b.vy += 0.03 * dpr * k; b.vx *= Math.pow(0.985, k); b.life -= 0.013 * k; if (b.life <= 0) { bits.splice(i, 1); continue; } }
        else if (b.y > H + 30 * dpr || b.y < -40 * dpr || b.x < -40 * dpr || b.x > W + 40 * dpr) { if (finite && age > 6000) { bits.splice(i, 1); continue; } bits[i] = spawn(false); continue; }
        ctx.fillStyle = b.c;
        ctx.globalAlpha = fx === 'fireflies' ? 0.25 + 0.75 * Math.abs(Math.sin(b.a * 3)) : fx === 'fireworks' ? Math.max(0, b.life) : fx === 'snow' ? 0.85 : 0.9;
        if (fx === 'leaves' || fx === 'petals' || fx === 'confetti') {
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a * 2);
          if (fx === 'confetti') ctx.fillRect(-b.s / 2, -b.s * Math.abs(Math.cos(b.a * 3)), b.s, b.s * 2 * Math.abs(Math.cos(b.a * 3)));
          else { ctx.beginPath(); ctx.ellipse(0, 0, b.s, b.s * (fx === 'leaves' ? 0.5 : 0.62), 0, 0, 6.283); ctx.fill(); }
          ctx.restore();
        } else if (fx === 'stars') star(b.x, b.y, b.s);
        else { ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, 6.283); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      if (season.lights) lights(ctx, W, dpr, ts);
    }
    function ok() { return seen && !doc.hidden && root.getAttribute('data-view') !== 'hire'; }
    function start() { if (!raf && ok()) { c.hidden = false; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }
    size(); start();
    var sw = window.innerWidth;
    window.addEventListener('resize', function () { if (window.innerWidth !== sw) { sw = window.innerWidth; size(); } });
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else start(); });
    doc.addEventListener('click', function () { setTimeout(function () { if (ok()) start(); else { stop(); c.hidden = true; } }, 500); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { seen = en[0].isIntersecting; if (seen) start(); else stop(); }).observe(c.parentNode);
  })();

  /* ---------- the dogs' birthdays: a countdown through the month, a party on the day ---------- */
  $$('.bday').forEach(function (bday) {
    var born = bday.getAttribute('data-born').split('-').map(Number);
    var now = nowDate();
    if (now.getMonth() + 1 !== born[1]) return;
    var age = now.getFullYear() - born[0], left = born[2] - now.getDate();
    if (age < 1) return;                                       // the month a puppy was born is not a birthday
    var key = left > 1 ? 'count' : left === 1 ? 'one' : left === 0 ? 'today' : 'after';
    function draw() {
      bday.textContent = bday.getAttribute('data-' + key).replace('{n}', left).replace('{age}', age);
      bday.classList.toggle('is-today', key === 'today');
      bday.hidden = false;
    }
    draw();
    doc.addEventListener('i18n:applied', draw);
    if (key !== 'today' || reduced) return;
    var partied = false;
    function party() {
      if (partied || root.getAttribute('data-view') !== 'luma') return;
      partied = true;
      var c = $('#confetti'), ctx = c.getContext('2d'), r = c.parentNode.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.hidden = false; c.width = r.width * dpr; c.height = r.height * dpr;
      var colors = ['#6fe0c0', '#6cb6ff', '#ff8fb1', '#ffffff', '#b79cff'], bits = [], t0 = null;
      for (var i = 0; i < 160; i++) bits.push({ x: Math.random() * c.width, y: -Math.random() * c.height * 0.6, w: (5 + Math.random() * 7) * dpr, h: (8 + Math.random() * 10) * dpr,
        vy: (1.6 + Math.random() * 2.6) * dpr, vx: (Math.random() - 0.5) * 1.4 * dpr, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.24, c: colors[i % colors.length] });
      requestAnimationFrame(function frame(ts) {
        if (t0 === null) t0 = ts;
        var age = ts - t0;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.globalAlpha = age > 6000 ? Math.max(0, 1 - (age - 6000) / 1500) : 1;
        bits.forEach(function (b) {
          b.x += b.vx + Math.sin(b.a) * dpr; b.y += b.vy; b.a += b.va;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.fillStyle = b.c;
          ctx.fillRect(-b.w / 2, -b.h / 2 * Math.abs(Math.cos(b.a * 1.7)), b.w, b.h * Math.abs(Math.cos(b.a * 1.7))); ctx.restore();
        });
        if (age < 7500) requestAnimationFrame(frame); else c.hidden = true;
      });
    }
    party();
    doc.addEventListener('click', function () { if (bday.isConnected) setTimeout(party, 400); }); // also on switching to the dogs' view
  });

  $$('[data-age-from]').forEach(function (el) {
    var b = el.getAttribute('data-age-from').split('-').map(Number), n = nowDate();
    var age = n.getFullYear() - b[0] - ((n.getMonth() + 1 < b[1] || (n.getMonth() + 1 === b[1] && n.getDate() < b[2])) ? 1 : 0);
    el.setAttribute('data-count', age); el.textContent = age;
  });

  /* ---------- numbers count up once ---------- */
  if (!reduced) {
    $$('[data-count]').forEach(function (el) {
      var raw = el.getAttribute('data-count'), n = parseInt(raw, 10), tail = raw.replace(/^\d+/, '');
      if (!n) return;
      var t0 = null, dur = 1100 + Math.min(n, 300) * 2;
      el.textContent = '0' + tail;
      setTimeout(function () {
        requestAnimationFrame(function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 4);
          el.textContent = Math.round(n * eased) + tail;
          if (p < 1) requestAnimationFrame(step);
        });
      }, 650);
    });
  }

  /* ---------- cards: a light that follows the pointer ---------- */
  $$('.card').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------- app previews: a sheet from a featured card, a screenshot strip in the timeline ----------
   * The data (titles, store links, which screenshots exist in which language) is one small file
   * fetched the first time it is needed. Without it, cards and rows are plain links. */
  var sheet = $('#sheet'), sheetData = null, sheetLoading = null;
  function loadSheets() {
    if (!sheetLoading) sheetLoading = fetch('/app-sheets.json').then(function (r) { return r.json(); }).then(function (d) { sheetData = d; return d; });
    return sheetLoading;
  }
  function shotStrip(app, box) {
    box.textContent = '';
    var lang = root.getAttribute('lang') || 'en';
    (app.shots || []).forEach(function (s) {
      var img = doc.createElement('img');
      img.alt = app.t + ': ' + s.x; img.width = s.w; img.height = s.h; img.loading = 'lazy'; img.decoding = 'async';
      if (s.src) { img.src = '/' + s.src; img.className = 'is-plain'; }   // a plain screenshot, not a framed render
      else {
        var l = s.l.indexOf(lang) >= 0 ? lang : 'en', base = app.base + l + '/' + s.n + '-';
        img.srcset = base + s.a + '.webp ' + s.a + 'w, ' + base + s.b + '.webp ' + s.b + 'w';
        img.sizes = '(max-width: 560px) 60vw, 240px';
        img.src = base + s.a + '.webp';
      }
      img.addEventListener('load', function () { img.classList.add('is-loaded'); });
      img.addEventListener('error', function () { img.remove(); });
      box.appendChild(img);
    });
  }
  function showSheet(id) {
    var a = sheetData && sheetData[id];
    if (!a || !sheet.showModal) return false;
    $('#sheet-i').src = a.i ? '/' + a.i : ''; $('#sheet-i').hidden = !a.i;
    $('#sheet-t').textContent = a.t;
    $('#sheet-g').textContent = (dict && dict['ft.' + id]) || a.g;
    $('#sheet-u').href = a.u;
    [['#sheet-s', a.s], ['#sheet-p', a.p], ['#sheet-ms', a.m], ['#sheet-src', a.src]].forEach(function (x) { var el = $(x[0]); el.hidden = !x[1]; if (x[1]) el.href = x[1]; });
    var m = $('#sheet-m'); m.textContent = '';
    var rows = [[m.getAttribute('data-released'), (dict && dict['tl.' + id + '.date']) || a.r]];
    if (a.free) rows.push([m.getAttribute('data-price'), m.getAttribute('data-free')]);
    if (a.shots && a.shots.length) rows.push([m.getAttribute('data-screens'), String(a.shots.length)]);
    rows.forEach(function (r) {
      var d = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1]; d.appendChild(dt); d.appendChild(dd); m.appendChild(d);
    });
    shotStrip(a, $('#sheet-shots'));
    $('#sheet-d').innerHTML = (dict && dict['tl.' + id + '.desc']) || a.d; // our own build output, not user input
    var chips = $('#sheet-c'); chips.textContent = '';
    a.k.forEach(function (k) { var li = doc.createElement('li'); li.textContent = k; chips.appendChild(li); });
    sheet.showModal();
    sheet.scrollTop = 0;
    return true;
  }
  $$('.card[data-app]').forEach(function (card) {
    card.addEventListener('pointerenter', loadSheets, { passive: true });
    card.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || !sheet.showModal) return; // new tab, or no <dialog>: follow the link
      e.preventDefault();
      loadSheets().then(function () { if (!showSheet(card.getAttribute('data-app'))) location.href = card.href; },
        function () { location.href = card.href; });
    });
  });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); });
  $$('details.tl[data-app]').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open || d.querySelector('.shots')) return;
      loadSheets().then(function () {
        var a = sheetData[d.getAttribute('data-app')];
        if (!a || !a.shots || !a.shots.length || d.querySelector('.shots')) return;
        var box = doc.createElement('div'); box.className = 'shots';
        var body = d.querySelector('.tl__body'); body.insertBefore(box, body.querySelector('.chips'));
        shotStrip(a, box);
      }, function () {});
    });
  });

  /* ---------- timeline: deep links open their entry ---------- */
  function openHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = doc.getElementById(id);
    if (!el) return;
    if (el.classList.contains('ph')) { openPhoto(el); return; }
    if (el.tagName === 'DETAILS') {
      openTimeline();
      if (el.offsetParent === null) applyView(defaultView === 'hire' ? 'hire' : 'maker');
      el.open = true;
      el.scrollIntoView({ block: 'center' });
    }
  }

  /* ---------- gallery ---------- */
  $$('.ph img').forEach(function (img) {
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
    else {
      img.addEventListener('load', function () { img.classList.add('is-loaded'); });
      img.addEventListener('error', function () { img.classList.add('is-loaded'); });
    }
  });
  setButtons.forEach(function (b) {
    b.addEventListener('click', function () { galleryOpen = true; setGallery(b.getAttribute('data-set')); });
  });
  if ($('#g-sort')) $('#g-sort').addEventListener('change', function () { sortGallery(this.value); galleryOpen = true; galleryLimit = PAGE; paintGallery(); });
  $('#g-more').addEventListener('click', openGallery);
  if ($('#tl-more')) $('#tl-more').addEventListener('click', openTimeline);
  // Jumping to a section from the menu (or a button) means you came for it: open it up.
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var h = a.getAttribute('href');
    if (h === '#gallery') openGallery();
    if (h === '#work' || h === '#projects') openTimeline();
  });

  /* ---------- lightbox ---------- */
  var lb = $('#lb'), lbLayers = $$('.lb__img', lb), lbFront = 0, lbCap = $('#lb-cap'), lbN = $('#lb-n'), lbPlay = $('#lb-play'), lbPuzzle = $('#lb-puzzle');
  var shown = [], at = 0, playing = null, idle = null, opener = null, lbFrame = $('#lb-frame'), lbVideo = $('#lb-video');
  lbVideo.addEventListener('click', function () {
    var id = shown[at] && shown[at].getAttribute('data-video');
    if (!id || !/^[\w-]{11}$/.test(id)) return;
    togglePlay(false);                            // the slideshow waits while a video plays
    var f = doc.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
    f.title = $('img', shown[at]).alt || L('lb.video');
    lbFrame.textContent = ''; lbFrame.appendChild(f); lbFrame.hidden = false; lbVideo.hidden = true;
  });

  function visiblePhotos() { return inSet(); }   // the whole set, not only what has scrolled into view
  // dir: 1 = forward (the new frame comes in from the right), -1 = back, 0 = dissolve in place
  function render(dir) {
    var a = shown[at], img = $('img', a), next = lbLayers[1 - lbFront], cur = lbLayers[lbFront];
    var slide = playing || reduced ? 0 : dir;
    var pre = new Image();
    pre.onload = pre.onerror = function () {
      if (shown[at] !== a) return;
      next.classList.remove('is-on', 'is-out');
      next.style.transition = 'none';
      next.style.setProperty('--from', (slide * 7) + '%');
      next.src = a.href;
      next.alt = img.alt;
      void next.offsetWidth; // commit the starting position before animating from it
      next.style.transition = '';
      cur.style.setProperty('--to', (slide * -7) + '%');
      cur.classList.remove('is-on');
      cur.classList.add('is-out');
      next.classList.add('is-on');
      lbFront = 1 - lbFront;
    };
    pre.src = a.href;
    var title = a.getAttribute('data-title'), cap = a.getAttribute('data-caption');
    lbCap.textContent = '';
    if (title) { var s = doc.createElement('strong'); s.textContent = title; lbCap.appendChild(s); }
    var line = doc.createElement('span'); line.textContent = cap || (title ? '' : img.alt); lbCap.appendChild(line);
    // The details under the caption: what took it, when, and how. Each gets a small icon.
    var icons = $('#meta-icons'), row = doc.createElement('span'); row.className = 'lb__meta';
    var detail = function (icon, text, label) {
      if (!text) return;
      var d = doc.createElement('span'), src = icons && icons.content.querySelector('[data-i="' + icon + '"] svg');
      if (src) d.appendChild(src.cloneNode(true));
      d.appendChild(doc.createTextNode(text)); d.title = label; d.setAttribute('aria-label', label + ': ' + text);
      row.appendChild(d);
    };
    var when = a.getAttribute('data-taken'), nice = when;
    try { if (when) nice = new Date(when + 'T12:00:00').toLocaleDateString(root.getAttribute('lang') || 'en', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) {}
    detail(a.getAttribute('data-kind') || 'camera', a.getAttribute('data-camera'), L('lb.camera'));
    detail('date', nice, L('lb.taken'));
    detail('lens', a.getAttribute('data-lens'), L('lb.lens'));
    detail('focal', a.getAttribute('data-f35') && a.getAttribute('data-f35') + ' mm', L('lb.focal'));
    detail('aperture', a.getAttribute('data-fn') && 'f/' + a.getAttribute('data-fn'), L('lb.aperture'));
    detail('shutter', a.getAttribute('data-ss') && a.getAttribute('data-ss') + ' s', L('lb.shutter'));
    detail('iso', a.getAttribute('data-iso') && 'ISO ' + a.getAttribute('data-iso'), L('lb.iso'));
    if (row.childNodes.length) lbCap.appendChild(row);
    lbN.textContent = (at + 1) + ' / ' + shown.length;
    // a video rides on its photograph: the still shows first, the player only after play is pressed
    lbFrame.hidden = true; lbFrame.textContent = '';
    lbVideo.hidden = !a.getAttribute('data-video');
    lbPuzzle.href = '/puzzles/index.html?image=' + encodeURIComponent('../slides/' + a.id + '.webp');
    var nx = shown[(at + 1) % shown.length];
    if (nx && !lite) { new Image().src = nx.href; }
    history.replaceState(null, '', '#' + a.id);
  }
  function openPhoto(a, autoplay) {
    if (inSet().indexOf(a) < 0) setGallery('all');
    galleryOpen = true;
    if (inSet().indexOf(a) >= galleryLimit) galleryLimit = inSet().indexOf(a) + PAGE;
    paintGallery();
    shown = visiblePhotos();
    at = Math.max(0, shown.indexOf(a));
    opener = doc.activeElement;
    lb.hidden = false;
    doc.body.classList.add('is-locked');
    render(0);
    $('#lb-close').focus();
    if (autoplay) togglePlay(true);
  }
  function closePhoto() {
    togglePlay(false);
    lb.hidden = true;
    lb.classList.remove('is-idle');
    doc.body.classList.remove('is-locked');
    lbFrame.hidden = true; lbFrame.textContent = ''; lbVideo.hidden = true;
    lbLayers.forEach(function (l) { l.removeAttribute('src'); l.classList.remove('is-on', 'is-out'); });
    history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.focus) opener.focus();
  }
  function step(d) { at = (at + d + shown.length) % shown.length; render(d); }
  function togglePlay(on) {
    on = on == null ? !playing : on;
    clearInterval(playing); playing = null;
    if (on) playing = setInterval(function () { step(1); }, 5000);
    lbPlay.setAttribute('aria-pressed', String(!!on));
    lb.classList.toggle('is-playing', !!on);
    wake();
  }
  function wake() {
    lb.classList.remove('is-idle');
    clearTimeout(idle);
    if (playing) idle = setTimeout(function () { lb.classList.add('is-idle'); }, 2600);
  }
  gallery.addEventListener('click', function (e) {
    var a = e.target.closest('.ph');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openPhoto(a);
  });
  $('#slideshow').addEventListener('click', function () { var v = visiblePhotos(); if (v.length) openPhoto(v[0], true); });
  $('#lb-close').addEventListener('click', closePhoto);
  $('#lb-prev').addEventListener('click', function () { step(-1); });
  $('#lb-next').addEventListener('click', function () { step(1); });
  lbPlay.addEventListener('click', function () { togglePlay(); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closePhoto(); });
  lb.addEventListener('pointermove', wake);
  var sx = null, sy = null;
  lb.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; wake(); });
  lb.addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closePhoto();
  });
  doc.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closePhoto();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'Tab') {
      // keep focus inside the dialog
      var f = $$('button, a', lb), i = f.indexOf(doc.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  window.addEventListener('hashchange', openHash);
  openHash();

  /* ---------- contact: decoded only when a person reaches for it ---------- */
  function decode(k) {
    var s = atob(k), out = '';
    for (var i = s.length - 1; i >= 0; i--) out += String.fromCharCode(s.charCodeAt(i) ^ 0x5a);
    return out;
  }
  $$('a[data-k]').forEach(function (a) {
    var arm = function () { if (a.getAttribute('data-k')) { a.href = decode(a.getAttribute('data-k')); a.removeAttribute('data-k'); } };
    ['pointerenter', 'focus', 'touchstart', 'click'].forEach(function (ev) { a.addEventListener(ev, arm, { passive: true }); });
  });
  var email = $('#email'), emailOut = $('#email-out');
  if (email) email.addEventListener('click', function () {
    var href = decode(email.getAttribute('data-k')), addr = href.replace(/^mailto:/, '');
    emailOut.hidden = false;
    emailOut.textContent = '';
    var a = doc.createElement('a'); a.href = href; a.textContent = addr; emailOut.appendChild(a);
    if (navigator.clipboard) navigator.clipboard.writeText(addr).then(function () {
      emailOut.appendChild(doc.createTextNode('  ✓ ' + ((dict && dict['c.email.copied']) || 'Copied')));
    }, function () {});
    location.href = href;
  });

  /* ---------- ?cleared: an unlisted link shows what the public page leaves out ---------- */
  if (new URLSearchParams(location.search).has('cleared')) {
    $$('[data-cleared]').forEach(function (el) { el.textContent = decode(el.getAttribute('data-cleared')); el.hidden = false; });
    $$('[data-keep-cleared], .hero__copy a[href="/resume/"]').forEach(function (a) { a.href = '/resume/?cleared'; });
  }

  /* ---------- Work view: contour lines ----------
   * A fixed terrain the view pans across without end, drawn as iso-lines with marching squares
   * on a coarse grid. 2D canvas, only while the Work hero is on screen;
   * a single still frame for reduced motion or a constrained connection. */
  var topo = $('#topo');
  if (topo && topo.getContext) (function () {
    var ctx = topo.getContext('2d'), W = 0, H = 0, dpr = 1, NX = 0, NY = 0, field = [], raf = null, seen = true, last = 0;
    // A phone or a modest processor gets a coarser grid and half the frame rate: the lines stay
    // smooth to the eye and the page stays responsive.
    var modest = window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4, CELL = modest ? 10 : 6, GAP = modest ? 33 : 0;
    // One fixed landscape: gradient noise in two broad octaves, sampled in world coordinates. The
    // terrain never changes; the view travels across it, like a map sliding under a window.
    var GX = [], GY = [];
    (function () { for (var n = 0; n < 256; n++) { var a = (n * 0.61803398875 % 1) * 6.2831853; GX[n] = Math.cos(a); GY[n] = Math.sin(a); } })();
    function corner(ix, iy, dx, dy) {
      var h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) & 255;
      return GX[h] * dx + GY[h] * dy;
    }
    function noise(x, y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      var u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      var a = corner(ix, iy, fx, fy), b = corner(ix + 1, iy, fx - 1, fy), c = corner(ix, iy + 1, fx, fy - 1), d = corner(ix + 1, iy + 1, fx - 1, fy - 1);
      return a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v;
    }
    function height(gx, gy) {                                  // gx, gy: whole grid cells in the world
      var x = gx * CELL * 0.0020833, y = gy * CELL * 0.0020833;                    // broad hills only: no fine detail to kink a line
      return noise(x, y) + 0.34 * noise(x * 1.9 + 17.3, y * 1.9 + 31.7);
    }
    // A quiet network on the map: a tower on each summit, a few other devices in the valleys, and
    // traffic passing between neighbours. Everything is decided by the place itself (a hash of the
    // map square), so the same tower is always on the same hill as the view pans by.
    var BLOCK = Math.round(276 / CELL), nodes = {}, nodeCount = 0;
    function rnd(ix, iy, n) {
      var h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(n, 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function nodeAt(bx, by) {
      var key = bx + ',' + by, n = nodes[key];
      if (n !== undefined) return n;
      var gx, gy, h, best = -9, px = 0, py = 0;
      for (gy = by * BLOCK + 6; gy < (by + 1) * BLOCK - 6; gy += 3) for (gx = bx * BLOCK + 6; gx < (bx + 1) * BLOCK - 6; gx += 3) {
        h = height(gx, gy); if (h > best) { best = h; px = gx; py = gy; }
      }
      // a tower only on a true summit: nothing higher anywhere near it, so one hill gets one tower
      var top = best > 0.3;
      for (gy = py - 28; top && gy <= py + 28; gy += 4) for (gx = px - 28; gx <= px + 28; gx += 4) if (height(gx, gy) > best) { top = false; break; }
      if (top) n = { x: px, y: py, kind: 'tower' };
      else if (rnd(bx, by, 1) < 0.38) n = { x: bx * BLOCK + 8 + rnd(bx, by, 2) * (BLOCK - 16), y: by * BLOCK + 8 + rnd(bx, by, 3) * (BLOCK - 16), kind: rnd(bx, by, 4) < 0.5 ? 'server' : 'phone' };
      else n = null;
      if (nodeCount++ > 400) { nodes = {}; nodeCount = 0; }
      nodes[key] = n;
      return n;
    }
    function box(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.stroke(); }
    function icon(kind, u) {                                   // drawn around 0,0; u is one CSS pixel
      ctx.lineWidth = 1.4 * u;
      if (kind === 'tower') {
        ctx.beginPath(); ctx.moveTo(0, -6 * u); ctx.lineTo(-4 * u, 8 * u); ctx.moveTo(0, -6 * u); ctx.lineTo(4 * u, 8 * u);
        ctx.moveTo(-2 * u, 1.5 * u); ctx.lineTo(2 * u, 1.5 * u); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -6 * u, 1.7 * u, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -6 * u, 5 * u, -0.7, 0.7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -6 * u, 5 * u, 3.1416 - 0.7, 3.1416 + 0.7); ctx.stroke();
      } else if (kind === 'server') {
        box(-6.5 * u, -6 * u, 13 * u, 5.4 * u, 1.5 * u); box(-6.5 * u, 0.6 * u, 13 * u, 5.4 * u, 1.5 * u);
        ctx.beginPath(); ctx.arc(-3.6 * u, -3.3 * u, 0.9 * u, 0, 6.2832); ctx.arc(-3.6 * u, 3.3 * u, 0.9 * u, 0, 6.2832); ctx.fill();
      } else {
        box(-4 * u, -7 * u, 8 * u, 14 * u, 2 * u);
        ctx.beginPath(); ctx.moveTo(-1.3 * u, 4.4 * u); ctx.lineTo(1.3 * u, 4.4 * u); ctx.stroke();
      }
    }
    function network(t, i0, j0, s) {
      var u = dpr * 1.3, bx, by, k, a, b, list = [], links = [];
      var bx0 = Math.floor(i0 / BLOCK) - 1, bx1 = Math.floor((i0 + NX) / BLOCK) + 1, by0 = Math.floor(j0 / BLOCK) - 1, by1 = Math.floor((j0 + NY) / BLOCK) + 1;
      for (by = by0; by <= by1; by++) for (bx = bx0; bx <= bx1; bx++) {
        a = nodeAt(bx, by); if (!a) continue;
        list.push(a);
        b = nodeAt(bx + 1, by); if (b && rnd(bx, by, 5) < 0.75) links.push([a, b, rnd(bx, by, 6)]);
        b = nodeAt(bx, by + 1); if (b && rnd(bx, by, 7) < 0.6) links.push([a, b, rnd(bx, by, 8)]);
      }
      var X = function (n) { return (n.x - i0) * s; }, Y = function (n) { return (n.y - j0) * s; };
      // the links, faint and dashed, each with one packet travelling along it
      ctx.lineWidth = u; ctx.setLineDash([2 * u, 6 * u]); ctx.globalAlpha = 0.3;
      ctx.beginPath();
      for (k = 0; k < links.length; k++) { ctx.moveTo(X(links[k][0]), Y(links[k][0])); ctx.lineTo(X(links[k][1]), Y(links[k][1])); }
      ctx.stroke(); ctx.setLineDash([]);
      for (k = 0; k < links.length; k++) {
        var h = links[k][2], p = (t * (0.11 + h * 0.07) + h * 7) % 1.6;                    // a pause between packets
        if (p > 1) continue;
        if (h < 0.5) p = 1 - p;                                                              // half of them travel the other way
        var ax = X(links[k][0]), ay = Y(links[k][0]), cx = ax + (X(links[k][1]) - ax) * p, cy = ay + (Y(links[k][1]) - ay) * p;
        var beat = 0.5 + 0.5 * Math.sin(t * 5 + h * 40);                                     // the packet pulses as it goes
        ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(cx, cy, (1.8 + beat * 0.9) * u, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.4 * (1 - beat); ctx.lineWidth = u; ctx.beginPath(); ctx.arc(cx, cy, (3 + beat * 6) * u, 0, 6.2832); ctx.stroke();
      }
      // a clearing in the contours for each device, then the device
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      for (k = 0; k < list.length; k++) { ctx.beginPath(); ctx.arc(X(list[k]), Y(list[k]), 14 * u, 0, 6.2832); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      for (k = 0; k < list.length; k++) {
        a = list[k];
        ctx.save(); ctx.translate(X(a), Y(a)); ctx.globalAlpha = 0.9; icon(a.kind, u);
        if (a.kind === 'tower') {                                // a slow ring leaving the mast
          var r = (t * 0.22 + rnd(a.x, a.y, 9)) % 1;
          ctx.globalAlpha = 0.5 * (1 - r); ctx.lineWidth = u; ctx.beginPath(); ctx.arc(0, -6 * u, (6 + r * 20) * u, 0, 6.2832); ctx.stroke();
        }
        ctx.restore();
      }
    }
    function size() {
      var r = topo.getBoundingClientRect(); if (!r.width) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = topo.width = Math.round(r.width * dpr); H = topo.height = Math.round(r.height * dpr);
      NX = Math.ceil(r.width / CELL) + 3; NY = Math.ceil(r.height / CELL) + 3;
      return true;
    }
    function draw(t) {
      // The camera's position on the map, in CSS pixels: a steady drift east and a little south.
      // Samples stay pinned to the world's grid and the drawing is shifted by the remainder, so
      // the lines slide rigidly instead of shimmering. The grid is fine and the terrain broad, so
      // every bend is a long, round curve.
      var i, j, k, s = CELL * dpr, accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#6cb6ff';
      var px = t * 14, py = t * 5, i0 = Math.floor(px / CELL), j0 = Math.floor(py / CELL);
      for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) field[j * NX + i] = height(i + i0, j + j0);
      var thin = new Path2D(), bold = new Path2D(), STEP = 0.07;
      for (j = 0; j < NY - 1; j++) for (i = 0; i < NX - 1; i++) {
        var a = field[j * NX + i], b = field[j * NX + i + 1], c = field[(j + 1) * NX + i + 1], d = field[(j + 1) * NX + i];
        var lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d), x = i * s, y = j * s;
        for (k = Math.ceil(lo / STEP); k * STEP < hi; k++) {      // only the contours that cross this cell
          var lv = k * STEP, p = k % 5 === 0 ? bold : thin;        // every fifth line is an index contour
          var code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
          if (code === 0 || code === 15) continue;
          var tx = x + s * (lv - a) / (b - a), ty = y;                 // crossing on the top edge
          var rx = x + s, ry = y + s * (lv - b) / (c - b);             // right
          var bx = x + s * (lv - d) / (c - d), by = y + s;             // bottom
          var lx = x, ly = y + s * (lv - a) / (d - a);                 // left
          switch (code) {
            case 1: case 14: p.moveTo(lx, ly); p.lineTo(bx, by); break;
            case 2: case 13: p.moveTo(bx, by); p.lineTo(rx, ry); break;
            case 3: case 12: p.moveTo(lx, ly); p.lineTo(rx, ry); break;
            case 4: case 11: p.moveTo(tx, ty); p.lineTo(rx, ry); break;
            case 6: case 9: p.moveTo(tx, ty); p.lineTo(bx, by); break;
            case 7: case 8: p.moveTo(lx, ly); p.lineTo(tx, ty); break;
            case 5: p.moveTo(lx, ly); p.lineTo(tx, ty); p.moveTo(bx, by); p.lineTo(rx, ry); break;
            case 10: p.moveTo(lx, ly); p.lineTo(bx, by); p.moveTo(tx, ty); p.lineTo(rx, ry); break;
          }
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.translate(-(px - i0 * CELL) * dpr, -(py - j0 * CELL) * dpr);
      ctx.strokeStyle = accent; ctx.lineJoin = ctx.lineCap = 'round';
      ctx.globalAlpha = 0.26; ctx.lineWidth = dpr; ctx.stroke(thin);
      ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5 * dpr; ctx.stroke(bold);
      ctx.fillStyle = accent; network(t, i0, j0, s);
      ctx.globalAlpha = 1;
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (GAP && ts - last < GAP) return;
      last = ts;
      draw(ts / 1000);
    }
    function wanted() { return root.getAttribute('data-view') === 'hire' && seen && !doc.hidden; }
    function sync() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (!wanted() || !size()) return;
      if (reduced || lite) draw(12); else raf = requestAnimationFrame(frame);
    }
    // Start once the page has painted and settled, so the map never delays the words above it.
    (window.requestIdleCallback || function (f) { setTimeout(f, 250); })(sync, { timeout: 1500 });
    var tw = window.innerWidth;
    window.addEventListener('resize', function () { if (window.innerWidth !== tw) { tw = window.innerWidth; sync(); } });
    doc.addEventListener('visibilitychange', sync);
    doc.addEventListener('click', function () { setTimeout(sync, 450); });   // view switch, theme switch
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { seen = en[0].isIntersecting; sync(); }).observe(hero);
  })();

  /* ---------- VR: in a browser that can do it, say so straight away ---------- */
  var xrOffer = $('#xr-offer');
  if (xrOffer && navigator.xr && navigator.xr.isSessionSupported) {
    try { sessionStorage.removeItem('wm-xr-no'); } catch (e) {}      // an older build remembered "Not now"
    navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
      if (!ok) return;
      xrOffer.hidden = false;
      // /xr/offer.js docks the banner at the bottom and starts VR on the first tap of its button
      var s = doc.createElement('script'); s.type = 'module'; s.src = '/xr/offer.js'; doc.head.appendChild(s);
    }, function () {});
    // "Not now" hides the banner for this page view only: it is back on the next load
    $('#xr-no').addEventListener('click', function () { xrOffer.hidden = true; });
  }

  /* ---------- time machine: the future ----------
   * Travelling forward shows what cannot be known yet. Work that is still to come appears as
   * unreadable placeholders; the dogs change with the years (stand-in names until real ones are
   * chosen, see content/site.json → future), and those who have gone move into a small museum so
   * the view switcher never grows; far enough ahead, the site reads as carried on by others, with
   * a founder note where the hero was. All of it is a simulation: nothing here runs on a real day. */
  var FUT = null;
  try { FUT = JSON.parse($('#future').textContent); } catch (e) {}
  if (FUT && travelTo && travelTo > new Date()) (function () {
    var real = new Date(), tr = function (k) { return (dict && dict[k]) || FUT.s[k] || ''; };
    var plus = function (d, years) { var x = new Date(d.getTime()); x.setMonth(x.getMonth() + Math.round(years * 12)); return x; };
    var make = function (tag, cls, text) { var el = doc.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
    var plain = function (el, text) { if (!el) return; el.removeAttribute('data-i18n'); el.removeAttribute('data-i18n-html'); el.textContent = text; };

    /* -- work still to come -- */
    var yearsBox = $('.years'), GLYPHS = '▚▞▙▟▛▜░▒▓█▄▀/\\<>_#=+', ghosts = [];
    var scramble = function (n) { for (var s = '', i = 0; i < n; i++) s += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)); return s; };
    var note = null;
    if (yearsBox && travelTo.getFullYear() > real.getFullYear()) {
      // Newest first, like the rest of the timeline: the year arrived in, then the stretch that was
      // skipped (with the note explaining it), then the first years after today, then the present.
      var now = real.getFullYear(), to = travelTo.getFullYear(), list = [], y;
      for (y = now + 1; y <= Math.min(now + 2, to - 1); y++) list.push(y);
      var skipped = to - (list.length ? list[list.length - 1] : now) > 1;
      if (skipped) list.push('gap');
      list.push(to);
      note = make('p', 'ghost__note'); note.appendChild(make('strong')); note.appendChild(make('span'));
      list.forEach(function (y) {
        var gap = y === 'gap', block = make('div', 'year year--ghost' + (gap ? ' year--gap' : '')), items = make('div', 'year__items');
        block.appendChild(make('h3', 'year__n', gap ? (list[list.length - 3] || now) + 1 + ' – ' + (to - 1) : String(y)));
        if (gap) items.appendChild(note);
        else for (var g = 0; g < 1 + (y * 7) % 3; g++) {
          var row = make('div', 'tl tl--ghost'), head = make('span', 'tl__head');
          row.setAttribute('aria-hidden', 'true');
          var a = make('strong', '', scramble(7 + (y + g * 5) % 8)), b = make('time', '', scramble(9 + (y * 3 + g) % 6));
          ghosts.push(a, b); head.appendChild(a); head.appendChild(b);
          row.appendChild(make('span', 'tl__icon')); row.appendChild(head); items.appendChild(row);
        }
        block.appendChild(items);
        yearsBox.insertBefore(block, yearsBox.firstChild);
      });
      if (!skipped) $('.year__items', yearsBox.firstChild).appendChild(note);
      if (!reduced) setInterval(function () {                    // a few of them flicker into other nonsense
        if (doc.hidden) return;
        for (var k = 0; k < 2; k++) { var el = ghosts[Math.floor(Math.random() * ghosts.length)]; el.textContent = scramble(el.textContent.length); }
      }, 160);
    }

    /* -- the dogs of that year -- */
    var cfg = FUT.dogs || {}, dogs = [], last = null, n = 0, names = cfg.names || [];
    (cfg.real || []).forEach(function (d) {
      var born = new Date(d.born + 'T12:00:00');
      last = { name: d.name, born: born, end: d.passed ? new Date(d.passed + 'T12:00:00') : plus(born, cfg.lifespan || 12), real: true };
      dogs.push(last);
    });
    if (last && names.length) {
      var next = plus(last.born, cfg.adoptAt || 6), soon = plus(real, 1);
      if (next < soon) next = soon;                              // a stand-in never arrives before next year
      while (next <= travelTo && n < 400) {
        var round = Math.floor(n / names.length);
        dogs.push({ name: names[n % names.length] + (round ? ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(round, 9) - 1] : ''), born: next, end: plus(next, cfg.lifespan || 12) });
        next = plus(next, cfg.adoptAt || 6); n++;
      }
    }
    var alive = dogs.filter(function (d) { return d.born <= travelTo && travelTo < d.end; });
    var gone = dogs.filter(function (d) { return d.end <= travelTo; });
    var changed = gone.length || !alive.length || alive.some(function (d) { return !d.real; });
    var lumaCopy = $('.hero__copy[data-views="luma"]'), museum = null, tiles = [], cards = [];
    var lumaHere = alive.some(function (d) { return d.real && d.name === 'Luma'; });
    var PALETTES = [[200, 262, 322], [168, 212, 282], [150, 192, 252], [284, 324, 204], [190, 232, 302], [316, 268, 196]];
    // A photograph nobody has taken yet: colour and noise where the dog will be.
    var ghostTile = function (seed, set) {
      var t = make('div', 'gph'), p = PALETTES[seed % PALETTES.length], paw = lumaCopy && $('.eyebrow svg', lumaCopy);
      t.setAttribute('aria-hidden', 'true'); t.setAttribute('data-dog-set', set);
      t.style.setProperty('--h1', p[0]); t.style.setProperty('--h2', p[1]); t.style.setProperty('--h3', p[2]);
      t.style.setProperty('--ar', ['4 / 5', '1', '3 / 4', '4 / 3', '1', '5 / 4'][seed % 6]);
      t.style.setProperty('--d', (-(seed * 1.7) % 9) + 's');
      if (paw) t.appendChild(paw.cloneNode(true));
      var cap = make('span', '', scramble(6 + seed % 7)); ghosts.push(cap); t.appendChild(cap);
      return t;
    };
    if (changed && lumaCopy && gallery) {
      root.setAttribute('data-dogs', lumaHere ? 'mixed' : 'future');
      gone.forEach(function (d) { if (!d.real) return; var line = $(d.name === 'Luma' ? '#bday' : '#bday-' + d.name.toLowerCase()); if (line) line.parentNode.removeChild(line); });
      var scrim = $('.hero__scrim'), big = ghostTile(alive.length ? alive[0].k || 2 : 2, '');   // the backdrop of the dogs' view: nobody has photographed them yet
      big.className = 'gph hero__ghost'; if (scrim) scrim.parentNode.insertBefore(big, scrim);
      if (!lumaHere) {
        ['stat.lumaage', 'stat.luma'].forEach(function (k) { var el = $('[data-stat="' + k + '"]'); if (el) el.parentNode.hidden = true; });
        // her photographs leave the living dogs' category and become her room in the museum
        allPhotos.forEach(function (a) { if (a.classList.contains('t-luma')) { a.classList.remove('t-luma'); a.classList.add('t-lumapast'); } });
      }
      dogs.forEach(function (d, k) { var here = alive.indexOf(d) >= 0; d.set = d.real ? (here ? 'luma' : d.name.toLowerCase() + 'past') : here ? 'luma' : 'dog-' + k; d.k = k; });
      if (gone.some(function (d) { return d.real && d.name === 'Nova'; })) allPhotos.forEach(function (a) { if (a.classList.contains('t-nova')) { a.classList.remove('t-nova'); a.classList.add('t-novapast'); } });
      alive.concat(gone.slice(-24)).forEach(function (d) {
        if (d.real) return;
        for (var q = 0; q < (alive.indexOf(d) >= 0 ? 4 : 7); q++) { var t = ghostTile(d.k * 5 + q, d.set); tiles.push(t); gallery.appendChild(t); }
      });
      if (gone.length) {
        museum = make('section', 'sec museum'); museum.id = 'museum'; museum.setAttribute('data-views', 'luma');
        var mh = make('header', 'sec__head'); mh.appendChild(make('h2')); mh.appendChild(make('p')); museum.appendChild(mh);
        var grid = make('div', 'museum__grid'), lumaPic = $('.ph.t-lumapast img, .ph.t-luma img');
        gone.slice(-24).reverse().forEach(function (d) {
          var card = make('button', 'museum__dog'), cap = make('span', 'museum__cap');
          card.type = 'button'; card.setAttribute('data-set', d.set); card.setAttribute('aria-pressed', 'false');
          var own = d.name === 'Nova' ? $('.ph.t-novapast img') : lumaPic;
          if (d.real && own) { var im = make('img'); im.src = own.getAttribute('src') || own.currentSrc; im.alt = ''; im.loading = 'lazy'; card.appendChild(im); }
          else card.appendChild(ghostTile(d.k * 5 + 3, ''));
          cap.appendChild(make('strong', '', d.name)); cap.appendChild(make('span', '', d.born.getFullYear() + ' – ' + d.end.getFullYear()));
          card.appendChild(cap); grid.appendChild(card); cards.push(card);
          card.addEventListener('click', function () {             // a room of the museum: that dog's photographs
            galleryOpen = true; setGallery(d.set);
            $('.gbar').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          });
        });
        museum.appendChild(grid);
        var gal = $('#gallery'); gal.parentNode.insertBefore(museum, gal);
      }
      var room = function () {
        var set = gallery.getAttribute('data-set');
        tiles.forEach(function (t) { t.hidden = t.getAttribute('data-dog-set') !== set; });
        cards.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-set') === set)); });
      };
      if (window.MutationObserver) new MutationObserver(room).observe(gallery, { attributes: true, attributeFilter: ['data-set'] });
      setGallery(gallery.getAttribute('data-set')); room();
    }

    /* -- beyond a lifetime: carried on by others -- */
    var founder = FUT.founderFrom && travelTo >= new Date(FUT.founderFrom + 'T00:00:00');
    if (founder) {
      root.setAttribute('data-era', 'founder');
      if (root.getAttribute('data-view') === 'hire') applyView('maker', { initial: true });
      var brand = $('.nav__brand span'); if (brand) brand.textContent = location.hostname.replace(/^www\./, '') || 'wemiller.com';
    }

    var ctaLuma = lumaCopy && $('.hero__cta .btn--solid span', lumaCopy) ? $('.hero__cta .btn--solid span', lumaCopy).textContent : '';
    function paint() {
      if (note) { note.firstChild.textContent = tr('fut.unwritten'); note.lastChild.textContent = tr('fut.unwritten.p'); }
      if (changed && lumaCopy) {
        var who = alive.map(function (d) { return d.name; }).join(' & ') || gone[gone.length - 1].name;
        plain($('.views [data-view-to="luma"]'), who);
        plain($('.sets [data-set="luma"]'), who);
        var go = $('.hero__cta .btn--solid span', lumaCopy); if (go) plain(go, ((dict && dict['cta.luma']) || ctaLuma).replace('Luma', who));
        plain($('h1', lumaCopy), who);
        plain($('.lede', lumaCopy), tr('fut.dogs.p').replace('{year}', travelTo.getFullYear()));
      }
      if (museum) { $('h2', museum).textContent = tr('fut.museum.h'); $('.sec__head p', museum).textContent = tr('fut.museum.p'); }
      if (founder) {
        var copy = $('.hero__copy[data-views="maker"]');
        plain($('.eyebrow', copy), tr('fut.founder.eyebrow'));
        plain($('h1', copy), tr('fut.founder.h'));
        plain($('.lede', copy), tr('fut.founder.p'));
        plain($('.hero__cta .btn--solid span', copy), tr('fut.founder.cta'));
      }
      window.dispatchEvent(new Event('resize'));                // the view switcher's pill follows the new labels
    }
    paint(); doc.addEventListener('i18n:applied', function () { setTimeout(paint, 0); });
  })();

  /* ---------- time machine: controls ---------- */
  var tm = $('#tm'), tmBar = $('#tm-bar');
  function travelUrl(when, view) {
    var u = new URL(location.href);
    u.searchParams.delete('date');
    if (when) u.searchParams.set('when', when); else u.searchParams.delete('when');
    if (view) { u.searchParams.delete('mode'); u.searchParams.set('v', view); }
    u.hash = '';
    return u.toString();
  }
  function warp(url) {
    // leave the moment the sky was showing, so on arrival it can wind from there to the new date
    try { if (window.__skyTime) sessionStorage.setItem('sky:from', JSON.stringify({ time: window.__skyTime(), at: Date.now() })); } catch (e) {}
    if (reduced) { location.href = url; return; }
    root.classList.add('is-warping');
    setTimeout(function () { location.href = url; }, 500);
  }
  window.addEventListener('pageshow', function () { root.classList.remove('is-warping'); }); // coming back with the Back button
  if (tm && tm.showModal) {
    var openTm = function () {
      $$('[data-tm-now]', tm).forEach(function (a) { a.hidden = !travelTo; });
      var d = nowDate();
      var c = travelClock ? d : new Date();                 // a chosen time of day, else the time it is now
      $('#tm-input').value = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + 'T' + ('0' + c.getHours()).slice(-2) + ':' + ('0' + c.getMinutes()).slice(-2);
      tm.showModal();
    };
    $('#tm-open').addEventListener('click', openTm);
    $('#tm-change').addEventListener('click', openTm);
    tm.addEventListener('click', function (e) {
      if (e.target === tm) { tm.close(); return; }
      var a = e.target.closest('[data-when]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      var id = a.getAttribute('data-when');
      warp(travelUrl(id, id === 'luma' || id === 'nova' ? 'nova' : null));
    });
    $('#tm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#tm-input').value;
      if (v) warp(travelUrl(v.slice(0, 16)));
    });
  } else if ($('#tm-open')) $('#tm-open').hidden = true;
  $$('[data-tm-now]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); warp(travelUrl(null)); });
  });
  if (travelTo && tmBar) {
    var stampDate = function () {
      var out = travelTo.getFullYear() + '-' + (travelTo.getMonth() + 1) + '-' + travelTo.getDate();
      var fmt = { month: 'short', day: '2-digit', year: 'numeric' }; if (travelClock) { fmt.hour = 'numeric'; fmt.minute = '2-digit'; }
      try { out = travelTo.toLocaleString(root.getAttribute('lang') || 'en', fmt); } catch (e) {}
      $('#tm-date').textContent = out.toUpperCase();
    };
    stampDate(); doc.addEventListener('i18n:applied', stampDate);
    tmBar.hidden = false;
    // The bar takes a second row where its labels are long; the sky view's buttons sit above it.
    if (window.ResizeObserver) new ResizeObserver(function () { root.style.setProperty('--tm-h', tmBar.offsetHeight + 'px'); }).observe(tmBar);
    if (!reduced) root.classList.add('is-arriving');
  }

  /* ---------- terminal one-liner ---------- */
  var copy = $('#tui-copy');
  if (copy) copy.addEventListener('click', function () {
    var text = $('#tui-cmd').textContent, label = $('span', copy), was = label.textContent;
    var done = function () { label.textContent = copy.getAttribute('data-copied'); setTimeout(function () { label.textContent = was; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    else { var r = doc.createRange(); r.selectNodeContents($('#tui-cmd')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  });

  /* ---------- theme: follow the device, or the visitor's own choice ---------- */
  var themeBtn = $('#theme');
  if (themeBtn) {
    var themeNow = function () { return root.getAttribute('data-theme') || 'auto'; };
    var themeLabel = function () { var l = themeBtn.getAttribute('data-' + themeNow()); themeBtn.setAttribute('aria-label', l); themeBtn.title = l; };
    themeLabel(); doc.addEventListener('i18n:applied', themeLabel);
    themeBtn.addEventListener('click', function () {
      var next = { auto: 'light', light: 'dark', dark: 'auto' }[themeNow()];
      if (next === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
      try { if (next === 'auto') localStorage.removeItem('wm-theme'); else localStorage.setItem('wm-theme', next); } catch (e) {}
      themeLabel(); syncHero();
    });
  }

  /* ---------- language ---------- */
  var langSel = $('#lang');
  if (langSel) {
    var syncLang = function () { langSel.value = root.getAttribute('lang') || 'en'; };
    syncLang();
    doc.addEventListener('i18n:applied', syncLang);
    langSel.addEventListener('change', function () {
      try { localStorage.setItem('wemiller-lang', langSel.value); } catch (e) {}
      var u = new URL(location.href);
      if (langSel.value === 'en') u.searchParams.delete('lang'); else u.searchParams.set('lang', langSel.value);
      location.href = u.toString();
    });
  }

  /* ---------- ambient sound: Tom plays live; the recorded loop is only a fallback ----------
   * Tom (/tools/tom/) composes an endless station in the browser: synthwave, lo-fi and rock.
   * Its player is fetched when someone reaches for the speaker button (hover, focus or touch),
   * so by the click it is usually ready and starts inside the gesture. Nothing else plays while
   * it tunes. The loop is used only if Tom can't load, errors, or never starts (and on
   * constrained connections, where composing live would be wasteful). */
  var sound = $('#sound'), audio = $('#bgaudio');
  if (sound && audio) (function () {
    var on = false, tomModule = null, radio = null, loading = null, watchdog = null, usingLoop = false, VOL = 0.5;
    // Volume: a small vertical slider under the button. It shows on hover or keyboard focus, and
    // on a touch screen while the sound is on (tap elsewhere to put it away). The level is kept.
    var box = $('#snd'), vol = $('#volume');
    try { var saved = parseFloat(localStorage.getItem('wm-vol')); if (saved >= 0 && saved <= 1) VOL = saved; } catch (e) {}
    if (vol) {
      vol.value = Math.round(VOL * 100);
      vol.addEventListener('input', function () {
        VOL = vol.value / 100; audio.volume = VOL;
        if (radio) { try { radio.setVolume(VOL); } catch (e) {} }
        try { localStorage.setItem('wm-vol', String(VOL)); } catch (e) {}
      });
      doc.addEventListener('click', function (e) { if (box && !box.contains(e.target)) box.classList.remove('is-open'); });
    }
    var STYLES = ['synthwave', 'lofi', 'rock'];
    function preload() {
      if (loading) return loading;
      if (lite) { loading = Promise.resolve(); return loading; }
      loading = fetch('/tools/tom/app/index.html').then(function (r) { return r.text(); }).then(function (html) {
        var v = (html.match(/app\.js\?v=([\w-]+)/) || [])[1];
        return import('/tools/tom/app/radio.js' + (v ? '?v=' + v : ''));
      }).then(function (m) { tomModule = m; }).catch(function () { tomModule = null; });
      return loading;
    }
    function off() {
      on = false; usingLoop = false; clearTimeout(watchdog);
      sound.setAttribute('aria-pressed', 'false'); sound.classList.remove('is-tuning'); if (box) box.classList.remove('is-open');
      audio.pause(); if (radio) { try { radio.pause(); } catch (e) {} }
    }
    function fallback() {
      if (!on || usingLoop) return;
      usingLoop = true; clearTimeout(watchdog); sound.classList.remove('is-tuning');
      if (radio) { try { radio.pause(); } catch (e) {} }
      audio.volume = VOL;
      audio.play().catch(off); // the browser wants a fresh tap: show the button as off again
    }
    function onRadio() {
      if (!on || usingLoop || !radio) return;
      var st = radio.state;
      sound.classList.toggle('is-tuning', st.status === 'tuning');
      if (st.status === 'playing') clearTimeout(watchdog);
      else if (st.error || st.status === 'paused') fallback(); // Tom failed, or the browser refused to let it start
    }
    function tune() {
      if (!on) return;
      if (!tomModule) { fallback(); return; }
      try {
        if (!radio) { radio = tomModule.createRadio({ onChange: onRadio }); radio.setVolume(VOL); radio.tune('mix', { styles: STYLES }); }
        else radio.resume();
        sound.classList.add('is-tuning');
        clearTimeout(watchdog);
        watchdog = setTimeout(function () { if (on && radio && radio.state.status !== 'playing') fallback(); }, 30000);
      } catch (e) { radio = null; fallback(); }
    }
    ['pointerenter', 'focus', 'touchstart'].forEach(function (ev) { sound.addEventListener(ev, preload, { passive: true }); });
    sound.addEventListener('click', function () {
      if (on) { off(); return; }
      on = true; usingLoop = false;
      sound.setAttribute('aria-pressed', 'true'); if (box) box.classList.add('is-open');
      if (tomModule) tune(); else { sound.classList.add('is-tuning'); preload().then(tune); }
    });
  })();

  /* ---------- search ---------- */
  var dialog = $('#search'), q = $('#search-q'), list = $('#search-r'), hint = $('#search-hint');
  var index = null, loading = null, sel = 0, results = [];
  var kinds = {};
  function kindLabel(k) {
    var el = $('#search-kinds').content.querySelector('[data-kind="' + k + '"]');
    return (dict && dict['search.k.' + k]) || (el ? el.textContent : k);
  }
  function loadIndex() {
    if (!loading) loading = fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) { index = d.filter(function (e) { return !(e.k === 'photo' && goneIds[String(e.u).split('#')[1]]) && !(e.k === 'project' && goneTitles[e.t]); }); }).catch(function () { index = []; });
    return loading;
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function labelOf(e) { return (dict && (e.k === 'section' ? dict[e.i] : e.k === 'photo' ? dict['ph.' + String(e.u).split('#')[1] + '.alt'] : '')) || e.t; }
  function score(e, words) {
    var title = norm(labelOf(e));
    var body = norm(e.d) + ' ' + (e.x || '') + ' ' + norm(dict && e.k === 'project' && dict[e.i]);
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i], s = 0;
      if (title === w) s = 100;
      else if (title.indexOf(w) === 0) s = 60;
      else if (title.indexOf(' ' + w) >= 0) s = 40;
      else if (title.indexOf(w) >= 0) s = 25;
      else if ((' ' + body).indexOf(' ' + w) >= 0) s = 8;
      if (!s) return 0;
      total += s;
    }
    return total + (e.k === 'project' ? 6 : e.k === 'section' ? 4 : e.k === 'page' ? 2 : 0);
  }
  function mark(text, words) {
    var frag = doc.createDocumentFragment(), low = norm(text), i = 0;
    while (i < text.length) {
      var hit = -1, len = 0;
      for (var w = 0; w < words.length; w++) { var p = low.indexOf(words[w], i); if (p >= 0 && (hit < 0 || p < hit)) { hit = p; len = words[w].length; } }
      if (hit < 0 || low.length !== text.length) { frag.appendChild(doc.createTextNode(text.slice(i))); break; }
      if (hit > i) frag.appendChild(doc.createTextNode(text.slice(i, hit)));
      var m = doc.createElement('mark'); m.textContent = text.slice(hit, hit + len); frag.appendChild(m);
      i = hit + len;
    }
    return frag;
  }
  function draw() {
    var words = norm(q.value).split(/\s+/).filter(Boolean);
    list.textContent = '';
    results = [];
    if (!words.length || !index) { hint.hidden = false; hint.textContent = (dict && dict['search.hint']) || hint.getAttribute('data-hint') || hint.textContent; return; }
    results = index.map(function (e) { return [score(e, words), e]; }).filter(function (r) { return r[0] > 0; })
      .sort(function (a, b) { return b[0] - a[0]; }).slice(0, 24).map(function (r) { return r[1]; });
    hint.hidden = results.length > 0;
    if (!results.length) hint.textContent = hint.getAttribute('data-empty');
    sel = 0;
    results.forEach(function (e, i) {
      var li = doc.createElement('li'); li.setAttribute('role', 'option'); li.id = 'sr-' + i; li.setAttribute('aria-selected', String(i === 0));
      var a = doc.createElement('a'); a.href = e.u;
      if (e.c) { var im = doc.createElement('img'); im.src = '/' + e.c; im.alt = ''; im.loading = 'lazy'; im.width = im.height = 40; a.appendChild(im); }
      else { var ic = doc.createElement('span'); ic.className = 'search__ic'; ic.textContent = e.t.charAt(0); a.appendChild(ic); }
      var st = doc.createElement('strong'); st.appendChild(mark(labelOf(e), words)); a.appendChild(st);
      var em = doc.createElement('em'); em.textContent = kindLabel(e.k); a.appendChild(em);
      var sm = doc.createElement('small'); sm.textContent = e.d || (e.k === 'photo' ? '' : e.u); a.appendChild(sm);
      li.appendChild(a); list.appendChild(li);
    });
  }
  function select(i) {
    var items = $$('li', list); if (!items.length) return;
    sel = (i + items.length) % items.length;
    items.forEach(function (li, n) { li.setAttribute('aria-selected', String(n === sel)); });
    items[sel].scrollIntoView({ block: 'nearest' });
    q.setAttribute('aria-activedescendant', items[sel].id);
  }
  function go(e) {
    dialog.close();
    var u = new URL(e.u, location.origin);
    if (u.pathname === location.pathname && u.hash) {
      if (u.search && u.search !== location.search) { location.href = e.u; return; }
      location.hash = u.hash;
      var target = doc.getElementById(u.hash.slice(1));
      if (target && target.tagName === 'SECTION') {
        if (target.offsetParent === null) applyView(defaultView);
        if (target.id === 'gallery') openGallery();
        if (target.id === 'projects' || target.id === 'work') openTimeline();
        target.scrollIntoView();
      }
    } else location.href = e.u;
  }
  function openSearch() {
    if (!dialog.showModal) { location.href = '/apps/'; return; }
    if (!hint.getAttribute('data-hint')) hint.setAttribute('data-hint', hint.textContent);
    dialog.showModal();
    q.value = ''; draw(); q.focus();
    loadIndex().then(draw);
  }
  $('#search-open').addEventListener('click', openSearch);
  q.addEventListener('input', draw);
  q.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) go(results[sel]); }
  });
  list.addEventListener('click', function (e) {
    var li = e.target.closest('li'); if (!li || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); go(results[$$('li', list).indexOf(li)]);
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  doc.addEventListener('keydown', function (e) {
    if (dialog.open || !lb.hidden) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
  });

})();
