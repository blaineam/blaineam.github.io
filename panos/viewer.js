/* wemiller.com — panorama gallery and its viewer. No library.
 *
 * The viewer is the home page's photo viewer (same bar, buttons, fades and keys), with two
 * things a panorama needs: a wide photograph can be panned and zoomed, and a 360° photograph
 * opens in sphere.js. Nothing large is requested until a panorama is opened.
 *
 *   drag                    pan / look around          pinch, wheel, double-tap   zoom
 *   arrows                  pan / look around          + - 0                      zoom, reset
 *   swipe past the edge     next / previous            Page Down / Page Up        next / previous
 *   swipe down, Esc         close
 */
(function () {
  'use strict';
  var doc = document, grid = doc.querySelector('.gallery');
  if (!grid) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var noGL = /[?&]flat\b/.test(location.search);     // ?flat shows 360° photos without WebGL, as a browser without it would

  /* ---------- words ----------
   * English here; /i18n/i18n.js hands over the page's dictionary (i18n/panos.<lang>.json) with
   * "i18n:applied", and everything already on screen is relabelled. {n} is the photograph's number. */
  var T = {
    'pv.alt360': '360° photograph {n}', 'pv.altPano': 'Panorama {n}', 'pv.dialog': 'Panorama',
    'pv.zoomOut': 'Zoom out', 'pv.zoomIn': 'Zoom in', 'pv.prev': 'Previous panorama', 'pv.next': 'Next panorama',
    'pv.close': 'Close', 'pv.title360': '360° photo', 'pv.titlePano': 'Panorama',
    'pv.hintLook': 'Drag to look around. Pinch or scroll to zoom.', 'pv.hintPan': 'Drag to pan. Pinch or scroll to zoom.',
    'pv.failed': 'This panorama could not be loaded.'
  };
  function t(k) { return T[k]; }
  function alt(it) { return t(it.sphere ? 'pv.alt360' : 'pv.altPano').replace('{n}', it.n); }

  /* ---------- the photographs ---------- */
  var SPHERES = 8, FLATS = 99;
  var JPEG = [2, 16, 75, 85, 95];                    // wider than WebP's 16,383 px limit, so these stay JPEG
  var items = [], i;
  for (i = SPHERES; i >= 1; i--) items.push({ id: 'sphere-' + i, sphere: true, n: i,
    src: 'panoramas/bmp-pano-sphere-' + i + '.webp', thumb: 'panoramas/bmp-pano-sphere-thumb-' + i + '.webp' });
  for (i = FLATS; i >= 1; i--) items.push({ id: 'pano-' + i, sphere: false, n: i,
    src: 'panoramas/bmp-pano-' + i + (JPEG.indexOf(i) < 0 ? '.webp' : '.jpg'), thumb: 'panoramas/bmp-pano-thumb-' + i + '.webp' });

  function el(tag, cls) { var n = doc.createElement(tag); if (cls) n.className = cls; return n; }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  items.forEach(function (it) {
    var a = el('a'), img = el('img');
    a.href = it.src; a.id = it.id;
    img.loading = 'lazy'; img.decoding = 'async'; img.alt = alt(it); img.src = it.thumb;
    a.appendChild(img);
    if (it.sphere) { var b = el('span', 'pano-360'); b.textContent = '360°'; a.appendChild(b); }
    grid.appendChild(a);
    it.a = a; it.img = img;
  });

  /* ---------- the viewer's frame (the home page's .lb, as .pv) ---------- */
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var pv = el('div', 'pv');
  pv.id = 'pv'; pv.hidden = true;
  pv.setAttribute('role', 'dialog'); pv.setAttribute('aria-modal', 'true'); 
  pv.innerHTML =
    '<div class="pv__stage" id="pv-stage"></div>' +
    '<div class="pv__bar">' +
      '<p class="pv__cap" id="pv-cap" aria-live="polite"></p>' +
      '<span class="pv__n" id="pv-n"></span>' +
      '<button type="button" id="pv-out">' + ICON + '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5"/></svg></button>' +
      '<button type="button" id="pv-in">' + ICON + '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5M11 8.500v5"/></svg></button>' +
      '<button type="button" id="pv-prev">' + ICON + '<path d="m15 5-7 7 7 7"/></svg></button>' +
      '<button type="button" id="pv-next">' + ICON + '<path d="m9 5 7 7-7 7"/></svg></button>' +
      '<button type="button" id="pv-close">' + ICON + '<path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
    '</div>';
  doc.body.appendChild(pv);
  var stage = pv.querySelector('#pv-stage'), cap = pv.querySelector('#pv-cap'), count = pv.querySelector('#pv-n');
  var at = 0, slide = null, ctl = null, opener = null, shownFlat = false;
  function labels() {
    pv.setAttribute('aria-label', t('pv.dialog'));
    [['out', 'pv.zoomOut', 1], ['in', 'pv.zoomIn', 1], ['prev', 'pv.prev'], ['next', 'pv.next'], ['close', 'pv.close']].forEach(function (b) {
      var n = pv.querySelector('#pv-' + b[0]);
      n.setAttribute('aria-label', t(b[1]));
      if (b[2]) n.title = t(b[1]);
    });
    pv.style.setProperty('--pv-failed', JSON.stringify(t('pv.failed')));
  }
  labels();

  /* ---------- a flat photograph you can pan and zoom ----------
   * z is the zoom, 1 = the whole photograph fits the screen. x, y is its top-left corner. */
  function Flat(host, it) {
    var img = el('img', 'pv__flat');
    img.alt = alt(it); img.draggable = false;
    host.appendChild(img);
    var ratio = 0, natW = 0, vw, vh, fw, fh, zHome, zMax, z = 0, x = 0, y = 0;
    var pts = {}, n = 0, pinch = null, down = null, lastTap = null, vx = 0, vy = 0, raf = 0, dead = false;

    function measure() {
      vw = host.clientWidth; vh = host.clientHeight;
      if (ratio > vw / vh) { fw = vw; fh = vw / ratio; } else { fh = vh; fw = vh * ratio; }
      zHome = Math.max(1, Math.min(vh, vw * 1.25) / fh);          // a wide panorama opens tall, ready to pan
      zMax = Math.max(zHome * 4, natW / fw, 4);
    }
    function limits() {
      var cw = fw * z, ch = fh * z;
      return { x0: cw > vw ? vw - cw : (vw - cw) / 2, x1: cw > vw ? 0 : (vw - cw) / 2,
               y0: ch > vh ? vh - ch : (vh - ch) / 2, y1: ch > vh ? 0 : (vh - ch) / 2 };
    }
    // soft: while a finger is down the photograph may be pulled a little past its edge
    function place(soft, glide) {
      var l = limits(), px = x, py = clamp(y, l.y0, l.y1);
      if (soft) px = x < l.x0 ? l.x0 + (x - l.x0) * 0.4 : x > l.x1 ? l.x1 + (x - l.x1) * 0.4 : x;
      else px = x = clamp(x, l.x0, l.x1);
      y = py;
      img.classList.toggle('is-glide', !!glide && !reduced);
      img.style.width = fw * z + 'px'; img.style.height = fh * z + 'px';
      img.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)';
    }
    function home() { z = zHome; x = (vw - fw * z) / 2; y = (vh - fh * z) / 2; }
    function zoomAt(f, px, py, glide) {
      var nz = clamp(z * f, 1, zMax);
      x = px - (px - x) * nz / z; y = py - (py - y) * nz / z; z = nz;
      place(false, glide);
    }
    function start(w, h) {
      var first = !ratio;
      ratio = w / h; measure();
      if (first) home(); else z = clamp(z, 1, zMax);
      place();
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; vx = vy = 0; }
    function coast() {
      var t0 = 0;
      raf = requestAnimationFrame(function tick(now) {
        var dt = Math.min(now - (t0 || now - 16), 50), l = limits(); t0 = now;
        x += vx * dt; y += vy * dt;
        var k = Math.pow(0.94, dt / 16); vx *= k; vy *= k;
        if (x < l.x0 || x > l.x1) vx = 0;
        if (y < l.y0 || y > l.y1) vy = 0;
        place();
        raf = !dead && Math.abs(vx) + Math.abs(vy) > 0.02 ? requestAnimationFrame(tick) : 0;
      });
    }
    function mid() {
      var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]], r = host.getBoundingClientRect();
      return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    }
    function onDown(e) {
      if (!ratio || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { host.setPointerCapture(e.pointerId); } catch (x) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; n++;
      stop();
      if (n === 1) down = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
      if (n === 2) { pinch = mid(); if (down) down.moved = true; }
      host.classList.add('is-held');
    }
    function onMove(e) {
      var p = pts[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (n >= 2) {
        if (!pinch) return;
        var m = mid();
        x += m.x - pinch.x; y += m.y - pinch.y;
        zoomAt(m.d / pinch.d, m.x, m.y);
        pinch = m;
        return;
      }
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
      var dt = Math.max(8, e.timeStamp - (p.t || e.timeStamp - 16));
      p.t = e.timeStamp;
      x += dx; y += dy;
      vx = clamp(0.6 * vx + 0.4 * dx / dt, -3, 3); vy = clamp(0.6 * vy + 0.4 * dy / dt, -3, 3);   // glide no faster than a brisk flick
      place(true);
    }
    function onUp(e) {
      var p = pts[e.pointerId];
      if (!p) return;
      delete pts[e.pointerId]; n--;
      if (n < 2) pinch = null;
      if (n) { vx = vy = 0; return; }
      host.classList.remove('is-held');
      var l = limits(), over = x < l.x0 ? x - l.x0 : x > l.x1 ? x - l.x1 : 0;
      var dx = down ? e.clientX - down.x : 0, dy = down ? e.clientY - down.y : 0;
      var tap = down && !down.moved && e.type === 'pointerup' && e.timeStamp - down.t < 350;
      down = null;
      // pulled past the edge: on to the next (or previous) one, as a swipe does in the photo viewer
      if (Math.abs(over) > 60 && e.type === 'pointerup') { step(over < 0 ? 1 : -1); return; }
      // pulled down when there is nothing above to pan to: close
      if (l.y0 === l.y1 && dy > 90 && dy > Math.abs(dx) * 1.5 && e.type === 'pointerup') { close(); return; }
      if (tap) {
        if (lastTap && e.timeStamp - lastTap.t < 340 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
          lastTap = null;
          var r = host.getBoundingClientRect();
          if (z > zHome * 1.05) { home(); place(false, true); }            // double-tap: in, then back out
          else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top, true);
          return;
        }
        lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      }
      if (over) { vx = vy = 0; place(false, true); return; }
      if (reduced || !p.t || e.timeStamp - p.t > 80 || Math.abs(vx) + Math.abs(vy) < 0.05) { vx = vy = 0; place(); return; }
      coast();
    }
    function onWheel(e) {
      e.preventDefault();
      if (!ratio) return;
      stop();
      var k = e.deltaMode === 1 ? 16 : 1, r = host.getBoundingClientRect();
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) { x -= e.deltaX * k; place(); return; }   // sideways scroll pans
      zoomAt(Math.exp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }
    function onResize() { if (!ratio) return; var c = (vw / 2 - x) / (fw * z); measure(); z = clamp(z, 1, zMax); x = vw / 2 - c * fw * z; place(); }
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    // The thumbnail stands in, already in position, until the full photograph arrives.
    if (it.img.complete && it.img.naturalWidth) { img.src = it.img.currentSrc || it.img.src; start(it.img.naturalWidth, it.img.naturalHeight); }
    var full = new Image();
    full.onload = function () {
      if (dead) return;
      natW = full.naturalWidth;
      img.src = full.src;
      start(full.naturalWidth, full.naturalHeight);
      host.classList.add('is-ready');
    };
    full.onerror = function () { if (!dead) host.classList.add('is-failed'); };
    full.src = it.src;

    return {
      zoom: function (f) { if (ratio) { stop(); zoomAt(f, vw / 2, vh / 2, true); } },
      key: function (e) {
        if (!ratio) return false;
        var l = limits(), k = e.key;
        stop();
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          var to = clamp(x + (k === 'ArrowLeft' ? 1 : -1) * vw * 0.3, l.x0, l.x1);
          if (Math.abs(to - x) < 1) return false;                // already at that edge: the viewer moves on
          x = to;
        }
        else if (k === 'ArrowUp') y += vh * 0.3;
        else if (k === 'ArrowDown') y -= vh * 0.3;
        else if (k === '+' || k === '=') { zoomAt(1.4, vw / 2, vh / 2, true); return true; }
        else if (k === '-' || k === '_') { zoomAt(1 / 1.4, vw / 2, vh / 2, true); return true; }
        else if (k === '0') home();
        else return false;
        place(false, true);
        return true;
      },
      view: function () { return { z: z, x: x, y: y, home: zHome, ready: host.classList.contains('is-ready') }; },
      destroy: function () {
        dead = true; stop();
        full.onload = full.onerror = null;
        window.removeEventListener('resize', onResize);
      }
    };
  }

  /* ---------- a 360° photograph: sphere.js, or the flat image where WebGL is missing ---------- */
  function Sphere(host, it) {
    var ghost = el('img', 'pv__ghost');                // the thumbnail, soft, while the sphere loads
    ghost.alt = ''; ghost.src = it.thumb;
    host.appendChild(ghost);
    var flat = function () {
      if (slide !== host) return;
      if (ctl) ctl.destroy();
      host.textContent = ''; host.classList.remove('is-ready');
      ctl = Flat(host, it);
      caption(it, true);
    };
    var s = !noGL && window.PanoSphere && window.PanoSphere(host, it.src, {
      label: alt(it), reduced: reduced,
      onload: function () { host.classList.add('is-ready'); },
      onerror: flat
    });
    if (s) return s;
    host.textContent = '';
    return null;
  }

  function caption(it, flatOnly) {
    cap.textContent = '';
    shownFlat = !!flatOnly;
    var s = el('strong'), line = el('span');
    s.textContent = t(it.sphere ? 'pv.title360' : 'pv.titlePano');
    line.textContent = t(it.sphere && !flatOnly ? 'pv.hintLook' : 'pv.hintPan');
    cap.appendChild(s); cap.appendChild(line);
  }

  /* ---------- open, move between, close: as the home page's viewer does ---------- */
  // dir: 1 = forward (the new one comes in from the right), -1 = back, 0 = dissolve in place
  function render(dir) {
    var it = items[at], old = slide, oldCtl = ctl, shift = reduced ? 0 : dir;
    if (old) {
      old.style.setProperty('--to', (shift * -7) + '%');
      old.classList.remove('is-on'); old.classList.add('is-out');
      setTimeout(function () { if (oldCtl) oldCtl.destroy(); if (old.parentNode) old.parentNode.removeChild(old); }, reduced ? 0 : 900);
    }
    slide = el('div', 'pv__slide');
    slide.style.setProperty('--from', (shift * 7) + '%');
    stage.appendChild(slide);
    caption(it);
    ctl = it.sphere ? Sphere(slide, it) : null;
    if (!ctl) { ctl = Flat(slide, it); if (it.sphere) caption(it, true); }
    void slide.offsetWidth;                            // commit the starting position before animating from it
    slide.classList.add('is-on');
    count.textContent = (at + 1) + ' / ' + items.length;
    history.replaceState(null, '', '#' + it.id);
  }
  function open(it) {
    at = items.indexOf(it);
    opener = doc.activeElement;
    pv.hidden = false;
    doc.body.classList.add('is-locked');
    render(0);
    pv.querySelector('#pv-close').focus();
  }
  function close() {
    pv.hidden = true;
    doc.body.classList.remove('is-locked');
    if (ctl) ctl.destroy();
    ctl = slide = null;
    stage.textContent = '';
    history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.focus) opener.focus();
  }
  function step(d) { at = (at + d + items.length) % items.length; render(d); }

  grid.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    items.some(function (it) { if (it.a === a) { open(it); return true; } });
  });
  pv.querySelector('#pv-close').addEventListener('click', close);
  pv.querySelector('#pv-prev').addEventListener('click', function () { step(-1); });
  pv.querySelector('#pv-next').addEventListener('click', function () { step(1); });
  pv.querySelector('#pv-in').addEventListener('click', function () { if (ctl) ctl.zoom(1.5); });
  pv.querySelector('#pv-out').addEventListener('click', function () { if (ctl) ctl.zoom(1 / 1.5); });
  doc.addEventListener('keydown', function (e) {
    if (pv.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'Escape') close();
    else if (k === 'PageDown') { e.preventDefault(); step(1); }
    else if (k === 'PageUp') { e.preventDefault(); step(-1); }
    else if (k === 'Tab') {
      // keep focus inside the dialog
      var f = [].slice.call(pv.querySelectorAll('button')), n = f.indexOf(doc.activeElement);
      e.preventDefault();
      f[(n + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    else if (ctl && ctl.key(e)) e.preventDefault();
    else if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowLeft') step(-1);
  });

  // the dictionary arrives after the page is built: relabel what is already there
  doc.addEventListener('i18n:applied', function (e) {
    var d = e.detail && e.detail.dict, k;
    if (!d) return;
    for (k in T) if (typeof d[k] === 'string' && d[k]) T[k] = d[k];
    items.forEach(function (it) { it.img.alt = alt(it); });
    labels();
    if (slide) {
      var it = items[at], pic = slide.querySelector('.pv__flat'), cv = slide.querySelector('canvas');
      caption(it, shownFlat);
      if (pic) pic.alt = alt(it);
      if (cv) cv.setAttribute('aria-label', alt(it));
    }
  });

  function openHash() {
    var id = location.hash.slice(1);
    items.some(function (it) { if (it.id === id) { if (pv.hidden) open(it); return true; } });
  }
  window.addEventListener('hashchange', openHash);
  openHash();

  window.PanoViewer = { view: function () { return ctl && ctl.view ? ctl.view() : null; } };   // read-only, for checking it
})();
