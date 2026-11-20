// wemiller.com /xr/ — ambient music, the same way the home page does it: Tom (/tools/tom/) composes
// an endless station live in the browser; the recorded loop (/loop.mp3) is only a fallback for when
// Tom cannot load, errors, never starts, or the visitor has asked for reduced data.
//
//   const music = createMusic((s) => { /* s.on, s.tuning, s.source: 'tom' | 'loop' | '' */ });
//   music.preload();   // optional: fetch Tom's player ahead of the click
//   music.toggle();    // call from a click, tap or XR select so the browser allows sound
//   music.setVolume(0.4);   // 0..1; kept in localStorage "wm-vol", the same level the home page uses
const STYLES = ['synthwave', 'lofi', 'rock'];
const VOL_KEY = 'wm-vol';        // shared with the home page's volume slider

export function createMusic(onChange) {
  const lite = !!(navigator.connection && navigator.connection.saveData);
  const st = { on: false, tuning: false, source: '', volume: 0.5 };
  try { const saved = parseFloat(localStorage.getItem(VOL_KEY)); if (saved >= 0 && saved <= 1) st.volume = saved; } catch (e) { /* private mode */ }
  let tom = null, radio = null, loading = null, watchdog = 0, audio = null;
  const changed = () => { try { onChange(st); } catch (e) { /* a listener must not stop the music */ } };

  function preload() {
    if (loading) return loading;
    if (lite) { loading = Promise.resolve(); return loading; }
    loading = fetch('/tools/tom/app/index.html').then((r) => r.text()).then((html) => {
      const v = (html.match(/app\.js\?v=([\w-]+)/) || [])[1];
      return import('/tools/tom/app/radio.js' + (v ? '?v=' + v : ''));
    }).then((m) => { tom = m; }).catch(() => { tom = null; });
    return loading;
  }
  function off() {
    st.on = false; st.tuning = false; st.source = '';
    clearTimeout(watchdog);
    if (audio) audio.pause();
    if (radio) { try { radio.pause(); } catch (e) { /* already stopped */ } }
    changed();
  }
  function fallback() {
    if (!st.on || st.source === 'loop') return;
    st.source = 'loop'; st.tuning = false;
    clearTimeout(watchdog);
    if (radio) { try { radio.pause(); } catch (e) { /* already stopped */ } }
    if (!audio) { audio = new Audio('/loop.mp3'); audio.loop = true; audio.preload = 'none'; }
    audio.volume = st.volume;
    audio.play().then(changed, off);      // refused: the browser wants a fresh tap, so show it as off
    changed();
  }
  function onRadio() {
    if (!st.on || st.source === 'loop' || !radio) return;
    const s = radio.state;
    st.tuning = s.status === 'tuning';
    if (s.status === 'playing') { clearTimeout(watchdog); st.source = 'tom'; }
    else if (s.error || s.status === 'paused') { fallback(); return; }
    changed();
  }
  function tune() {
    if (!st.on) return;
    if (!tom) { fallback(); return; }
    try {
      if (!radio) { radio = tom.createRadio({ onChange: onRadio }); radio.setVolume(st.volume); radio.tune('mix', { styles: STYLES }); }
      else radio.resume();
      st.tuning = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (st.on && radio && radio.state.status !== 'playing') fallback(); }, 30000);
      changed();
    } catch (e) { radio = null; fallback(); }
  }
  function toggle() {
    if (st.on) { off(); return; }
    st.on = true; st.source = ''; st.tuning = true;
    changed();
    if (tom) tune(); else preload().then(tune);
  }
  function setVolume(v) {
    st.volume = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    if (audio) audio.volume = st.volume;
    if (radio) { try { radio.setVolume(st.volume); } catch (e) { /* not started yet */ } }
    try { localStorage.setItem(VOL_KEY, String(st.volume)); } catch (e) { /* private mode */ }
    changed();
  }
  return { state: st, preload, toggle, off, setVolume };
}
