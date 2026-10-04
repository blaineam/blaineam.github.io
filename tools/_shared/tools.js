/* /tools/ pages: the scroll reveal, and the "already entered" flag behind the
 * Monkr and Tom marketing pages.
 *
 * A link with data-enter-app="<slug>" records localStorage
 * `tools.<slug>.entered = 1` when followed; the marketing page's inline head
 * script reads it and sends a returning visitor straight into the app. The
 * mirrored Tom app sets the same flag itself (scripts/inject-tool-shell.py).
 */
(function () {
  document.querySelectorAll('[data-enter-app]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('tools.' + link.getAttribute('data-enter-app') + '.entered', '1'); } catch (e) { /* private mode */ }
    });
  });

  // A quiet reveal as each story arrives: only when motion is welcome, and only
  // once JavaScript is known to be running, so nothing can stay hidden.
  if (!('IntersectionObserver' in window)) return;
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  document.documentElement.classList.add('tl-motion');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
})();
