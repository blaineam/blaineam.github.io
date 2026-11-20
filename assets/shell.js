/* wemiller.com — shared header and footer for every page that is not the home page.
 *
 *   <script src="/assets/shell.js?v=1e3a5e90" defer data-active="apps"></script>
 *
 * data-active: apps | tools | photos | none   (which header link is the current section)
 * data-footer="off" leaves the footer out, for pages that are a full-screen tool.
 * One place to change the site's navigation: edit LINKS below.
 *
 * Language: on a page that loads /i18n/i18n.js, the header and footer follow the visitor's language
 * from one shared dictionary, /i18n/shell.<lang>.json (keys are the `shell.*` names below; English
 * stays here as the fallback). Pages without the runtime keep the English shell.
 */
(function () {
  'use strict';
  var script = document.currentScript || document.querySelector('script[src*="shell.js"]');
  var active = (script && script.getAttribute('data-active')) || 'none';
  var LINKS = [
    ['apps', '/apps/', 'Apps'],
    ['tools', '/tools/', 'Tools'],
    ['photos', '/?v=120', 'Photography'],
    ['work', '/?mode=hire', 'Work'],
    ['contact', '/#contact', 'Contact']
  ];
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }
  // Text the shell writes, by dictionary key: [node, attribute or null for its text].
  var TEXT = {};
  function remember(key, node, attr) { (TEXT[key] = TEXT[key] || []).push([node, attr || null]); return node; }
  var localized = false;
  function localize() {
    var lang = window.wemillerI18n && window.wemillerI18n.lang;
    if (localized || !lang || !document.querySelector('.wm-nav')) return;
    localized = true;
    if (lang === 'en') return;
    fetch('/i18n/shell.' + lang + '.json').then(function (r) {
      if (!r.ok) throw new Error('no shell dictionary for ' + lang);
      return r.json();
    }).then(function (dict) {
      for (var key in TEXT) {
        if (!Object.prototype.hasOwnProperty.call(dict, key)) continue;
        TEXT[key].forEach(function (t) {
          if (t[1]) t[0].setAttribute(t[1], dict[key]); else t[0].textContent = dict[key];
        });
      }
    }).catch(function () { /* keep the English shell */ });
  }
  /* ---------- offline: once visited (or added to a home screen) the site opens (same as assets/site.js) with no connection ----------
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

  // the visitor's light/dark choice from the home page applies here too
  try { var th = localStorage.getItem('wm-theme'); if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th); } catch (e) {}
  function mount() {
    if (document.querySelector('.wm-nav')) return;
    var nav = el('header', { 'class': 'wm-nav' });
    var brand = remember('shell.home', el('a', { 'class': 'wm-nav__brand', href: '/', 'aria-label': 'Blaine Miller, home' }), 'aria-label');
    brand.appendChild(el('img', { src: '/assets/avatar.jpg', alt: '', width: '34', height: '34' }));
    brand.appendChild(el('span', { translate: 'no' }, 'Blaine Miller'));
    nav.appendChild(brand);
    var links = remember('shell.site', el('nav', { 'class': 'wm-nav__links', 'aria-label': 'Site' }), 'aria-label');
    LINKS.forEach(function (l) {
      var a = remember('shell.' + l[0], el('a', { href: l[1] }, l[2]));
      if (l[0] === active) a.setAttribute('aria-current', 'page');
      links.appendChild(a);
    });
    nav.appendChild(links);
    document.body.insertBefore(nav, document.body.firstChild);

    if (!(script && script.getAttribute('data-footer') === 'off')) {
      var foot = el('footer', { 'class': 'wm-foot' });
      foot.appendChild(document.createTextNode('© ' + new Date().getFullYear() + ' Blaine Miller · '));
      foot.appendChild(remember('shell.noads', el('span', {}, 'No ads, no cookies.')));
      foot.appendChild(document.createTextNode(' · '));
      foot.appendChild(remember('shell.privacy', el('a', { href: '/privacy/' }, 'Privacy')));
      foot.appendChild(document.createTextNode(' · '));
      foot.appendChild(remember('shell.terms', el('a', { href: '/terms/' }, 'Terms')));
      document.body.appendChild(foot);
    }
    localize();
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  // i18n.js publishes the language when it starts; both scripts are deferred, so by DOMContentLoaded it has.
  document.addEventListener('DOMContentLoaded', function () { setTimeout(localize, 0); });
  document.addEventListener('i18n:applied', localize);
})();
