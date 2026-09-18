/**
 * A way back to the apps index, for pages that have no portfolio navigation
 * of their own.
 *
 * The app sites mirrored under /apps/<slug>/ (Haven, Blip, Lathe, Glint) are
 * rsynced from each app's own repo, so nothing can be edited into them here —
 * anything added would be overwritten on the next mirror. The mirror workflow
 * injects this instead.
 *
 * It goes INSIDE the site's own header rather than floating over it: a pill
 * pinned to the corner sat on top of whatever the site put there, which on
 * Haven meant its own wordmark with ours over the top of it. For the same
 * reason it says only "Apps" — the site is already telling you whose it is,
 * and repeating the name next to the site's own logo reads as a mistake.
 *
 * It does nothing on a page that already carries the portfolio nav.
 */
(function () {
  'use strict';

  if (!/^\/apps\/[^/]+(?:\/|$)/.test(location.pathname)) return;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /** The site's own top bar, if it has one we can sit inside. */
  function topBar() {
    var candidates = document.querySelectorAll('header, nav, .nav, .navbar, .masthead');
    for (var i = 0; i < candidates.length; i++) {
      var box = candidates[i].getBoundingClientRect();
      // Near the top of the page, and wide enough to be the bar rather than
      // something inside it.
      if (box.top < 160 && box.width > window.innerWidth * 0.5 && box.height > 0) {
        return candidates[i];
      }
    }
    return null;
  }

  ready(function () {
    if (document.querySelector('.nav-brand') || document.getElementById('back-to-apps')) return;

    var bar = topBar();

    var style = document.createElement('style');
    style.textContent = [
      '#back-to-apps{display:inline-flex;align-items:center;gap:.4em;',
      'text-decoration:none;font:600 .82rem/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'letter-spacing:.01em;color:inherit;opacity:.72;white-space:nowrap;',
      'padding:.45em .85em;border-radius:999px;border:1px solid currentColor;',
      'transition:opacity .15s ease;}',
      '#back-to-apps:hover{opacity:1;}',
      '#back-to-apps .bta-arrow{font-weight:400;}',
      // Only the floating fallback needs a surface of its own to sit on.
      '#back-to-apps.bta-floating{position:fixed;top:14px;left:14px;z-index:2147483000;',
      'color:#1a202c;background:rgba(255,255,255,.86);border-color:rgba(0,0,0,.08);',
      'box-shadow:0 6px 20px rgba(0,0,0,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:1;}',
      '@media (prefers-color-scheme:dark){#back-to-apps.bta-floating{color:#f1f5f9;',
      'background:rgba(20,22,28,.82);border-color:rgba(255,255,255,.14);}}',
      '@media (max-width:600px){#back-to-apps{font-size:.76rem;padding:.4em .7em;}',
      '#back-to-apps.bta-floating{top:10px;left:10px;}}',
      '@media print{#back-to-apps{display:none;}}'
    ].join('');
    document.head.appendChild(style);

    var link = document.createElement('a');
    link.id = 'back-to-apps';
    link.href = '/apps/';
    link.title = 'All apps by Blaine Miller';
    link.setAttribute('aria-label', 'Back to all apps');
    link.innerHTML = '<span class="bta-arrow" aria-hidden="true">←</span><span>Apps</span>';

    if (bar) {
      // Into the row the bar lays its own logo and links out on, so the back
      // control joins that line instead of stacking above it.
      var row = bar, width = bar.getBoundingClientRect().width;
      var inner = bar.querySelectorAll('*');
      for (var i = 0; i < inner.length; i++) {
        var style2 = getComputedStyle(inner[i]);
        if (style2.display !== 'flex' && style2.display !== 'grid') continue;
        if (inner[i].getBoundingClientRect().width < width * 0.6) continue;
        row = inner[i];
        break;
      }
      row.insertBefore(link, row.firstChild);
      link.style.flex = 'none';
    } else {
      link.className = 'bta-floating';
      document.body.appendChild(link);
    }
  });
})();
