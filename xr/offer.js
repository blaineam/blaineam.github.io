// wemiller.com /xr/ — the home page's side of "Step inside".
//
// The home page shows its #xr-offer banner when the browser reports immersive-vr, then loads this
// file. It does two things to that banner:
//
//   1. keeps it out of the way: a floating bar at the bottom of the window, not over the content;
//   2. makes its button start VR on the first tap. A WebXR session has to be asked for inside a tap
//      and cannot survive a page change, so instead of going to /xr/ and asking for a second tap,
//      the session is requested right here and the /xr/ scene is loaded into a hidden corner of this
//      page. Leaving VR puts the visitor back on the home page exactly as they left it.
//
// If anything goes wrong the button's ordinary link (/xr/?enter=1) is followed instead.
// Nothing is fetched until the banner is on screen, and nothing from outside this site, ever.

const INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };   // the same as xr-input.js
const HERE = new URL('.', import.meta.url);
const MODULES = ['app.js', 'i18n.js', 'ui.js', 'sky.js', 'experience.js', 'xr-input.js', 'music.js', 'compass.js', 'time.js', 'seasons.js', 'panels.js', 'vendor/three-0.170.0.module.min.js'];

const offer = document.getElementById('xr-offer');
const link = offer && offer.querySelector('a[href*="/xr/"]');

if (offer && link && navigator.xr) {
  const style = document.createElement('style');
  style.textContent = '.xr-offer{top:auto!important;bottom:calc(env(safe-area-inset-bottom,0px) + 14px)!important}'
    + '.xr-offer.is-busy a{opacity:.6;pointer-events:none}';
  document.head.appendChild(style);

  // Have the scene's code ready before the tap, so the headset is not left on an empty view.
  let warmed = false;
  const warm = () => {
    if (warmed) return;
    warmed = true;
    for (const m of MODULES) {
      const l = document.createElement('link');
      l.rel = 'modulepreload'; l.href = new URL(m, HERE).href;
      document.head.appendChild(l);
    }
  };
  for (const ev of ['pointerenter', 'focusin', 'touchstart']) offer.addEventListener(ev, warm, { passive: true, once: true });
  if (!(navigator.connection && navigator.connection.saveData)) {
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 2500);
  }

  // Ambient music inside VR is the home page's own: one player, one button, one state.
  const pageMusic = (onChange) => {
    const btn = document.getElementById('sound');
    const slider = document.getElementById('volume');
    const st = { on: false, tuning: false, source: '', volume: slider ? slider.value / 100 : 0.5 };
    const read = () => { st.on = !!btn && btn.getAttribute('aria-pressed') === 'true'; if (slider) st.volume = slider.value / 100; onChange(st); };
    if (slider) slider.addEventListener('input', read);
    if (btn) new MutationObserver(read).observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
    queueMicrotask(read);
    return {
      state: st, preload() {}, toggle() { if (btn) btn.click(); }, off() { if (btn && st.on) btn.click(); },
      // the home page's own slider does the work: it sets the level and remembers it
      setVolume(v) { if (!slider) return; slider.value = Math.round(Math.max(0, Math.min(1, v)) * 100); slider.dispatchEvent(new Event('input', { bubbles: true })); },
    };
  };

  // Where the headset offers AR, that is the session asked for: the scene paints its own sky over the
  // room, and its Passthrough button can then show the room at any moment (a session cannot change
  // mode once running). Not on Android phones, where AR is the hand-held camera view.
  let ar = false;
  if (!(/Android/i.test(navigator.userAgent) && !/Quest|OculusBrowser|Pico/i.test(navigator.userAgent)) && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar').then((ok) => { ar = !!ok; }, () => {});
  }

  let busy = false;
  link.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    if (busy) { e.preventDefault(); return; }
    let asked;
    const wantAR = ar;
    try {
      asked = navigator.xr.requestSession(wantAR ? 'immersive-ar' : 'immersive-vr', INIT).then(
        (session) => ({ session, ar: wantAR }),
        (err) => { if (!wantAR) throw err; return navigator.xr.requestSession('immersive-vr', INIT).then((session) => ({ session, ar: false })); },
      );
    } catch (err) { return; }   // follow the link
    e.preventDefault();
    // Same tap: ask for the compass where the device wants a permission for it (iOS), so the sky can face true north.
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (err) { /* optional */ }
    busy = true;
    offer.classList.add('is-busy');
    launch(asked);
  });

  async function launch(asked) {
    let host = null;
    const done = () => { busy = false; offer.classList.remove('is-busy'); if (host) host.remove(); host = null; };
    const giveUp = async () => {
      done();
      try { const s = await asked; await s.session.end(); } catch (err) { /* never started, or already over */ }
      location.assign(link.href);
    };
    asked.catch(() => {});      // handled below; this only stops an "unhandled rejection" report
    try {
      const [html, app] = await Promise.all([
        fetch(new URL('index.html', HERE)).then((r) => { if (!r.ok) throw new Error('xr page ' + r.status); return r.text(); }),
        import(new URL('app.js', HERE).href),
      ]);
      const stage = new DOMParser().parseFromString(html, 'text/html').getElementById('stage');
      if (!stage) throw new Error('xr page has no stage');
      host = document.createElement('div');
      host.hidden = true; host.style.display = 'none'; host.setAttribute('aria-hidden', 'true');
      host.appendChild(document.importNode(stage, true));
      document.body.appendChild(host);
      offer.hidden = true;
      const got = await asked;
      await app.start({
        root: host, embedded: true, session: got.session, ar: got.ar, music: pageMusic,
        onExit(why) {
          done();
          offer.hidden = false;
          if (why === 'failed') location.assign(link.href);     // the browser refused: the /xr/ page explains and offers the flat view
        },
      });
    } catch (err) {
      console.info('[xr] could not start in place, opening the page instead:', err && err.message);
      giveUp();
    }
  }
}
