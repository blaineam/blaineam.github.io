/**
 * A way back to the apps index, for pages that have no portfolio navigation
 * of their own.
 *
 * The app sites mirrored under /apps/<slug>/ (Haven, Blip, Lathe, Glint) are
 * rsynced from each app's own repo, so nothing can be edited into them here —
 * anything added would be overwritten on the next mirror. This script is
 * injected by the mirror workflow instead, and adds one pill: the app's icon,
 * its name, and a link back to the index. Someone who lands on a docs page
 * from a search result can then see whose app this is and find the others.
 *
 * It does nothing on a page that already carries the portfolio nav.
 */
(function () {
  'use strict';

  var match = location.pathname.match(/^\/apps\/([^\/]+)(?:\/|$)/);
  if (!match) return;
  var slug = match[1];

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    // The portfolio's own pages already say all of this in their nav bar.
    if (document.querySelector('.nav-brand') || document.getElementById('back-to-apps')) return;

    var style = document.createElement('style');
    style.textContent = [
      '#back-to-apps{position:fixed;top:14px;left:14px;z-index:2147483000;',
      'display:inline-flex;align-items:center;gap:8px;padding:7px 14px 7px 9px;',
      'border-radius:999px;text-decoration:none;font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'color:#1a202c;background:rgba(255,255,255,.82);border:1px solid rgba(0,0,0,.08);',
      'box-shadow:0 6px 20px rgba(0,0,0,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
      'transition:transform .15s ease,box-shadow .15s ease;}',
      '#back-to-apps:hover{transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,0,0,.22);}',
      '#back-to-apps .bta-arrow{opacity:.55;font-weight:400;}',
      '#back-to-apps img{width:22px;height:22px;border-radius:6px;display:block;}',
      '@media (prefers-color-scheme:dark){#back-to-apps{color:#f1f5f9;background:rgba(20,22,28,.78);',
      'border-color:rgba(255,255,255,.12);}}',
      '@media (max-width:600px){#back-to-apps{top:10px;left:10px;padding:6px 12px 6px 8px;font-size:13px;}',
      '#back-to-apps img{width:19px;height:19px;}}',
      '@media print{#back-to-apps{display:none;}}'
    ].join('');
    document.head.appendChild(style);

    var link = document.createElement('a');
    link.id = 'back-to-apps';
    link.href = '/apps/';

    var arrow = document.createElement('span');
    arrow.className = 'bta-arrow';
    arrow.textContent = '←';
    link.appendChild(arrow);

    // Each app keeps its icon where its own site keeps it; a missing icon
    // just leaves the pill as an arrow and a word rather than a broken image.
    var candidates = [
      '/apps/' + slug + '/assets/images/icon.png',
      '/apps/' + slug + '/assets/images/app-icon.png',
      '/apps/' + slug + '/assets/icon.png'
    ];
    var attempt = 0;
    var icon = document.createElement('img');
    icon.alt = '';
    icon.onerror = function () {
      attempt += 1;
      if (attempt >= candidates.length) { icon.remove(); return; }
      icon.src = candidates[attempt];
    };
    icon.src = candidates[0];
    link.appendChild(icon);

    var name = document.createElement('span');
    name.textContent = slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    link.appendChild(name);

    link.title = 'All apps by Blaine Miller';
    link.setAttribute('aria-label', 'Back to all apps');
    document.body.appendChild(link);

    // The index knows every app's real name — "Enter Space", not "Enter-Space".
    fetch('/apps/projects.json', { cache: 'force-cache' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !data.apps) return;
        for (var i = 0; i < data.apps.length; i++) {
          if (data.apps[i].id === slug && data.apps[i].title) {
            name.textContent = data.apps[i].title;
            return;
          }
        }
      })
      .catch(function () { /* the slug-derived name is good enough */ });
  });
})();
