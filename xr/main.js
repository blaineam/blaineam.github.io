// wemiller.com /xr/ — boot. Checks for WebGL2 before loading anything heavy, so browsers without
// it (Safari Lockdown Mode, for one) get a plain message with links instead of a blank canvas.
// `?nowebgl` forces that path for testing.

const $ = (id) => document.getElementById(id);

function hasWebGL2() {
  if (new URLSearchParams(location.search).has('nowebgl')) return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

function showFallback(why) {
  $('intro').hidden = true;
  $('hud').hidden = true;
  $('items').hidden = true;
  $('view').hidden = true;
  if (why) $('fallback-why').textContent = why;
  $('fallback').hidden = false;
}

// The page's own words first (they are needed even when the 3D view cannot start), then the scene.
import('./i18n.js').then(async (i18n) => {
  await i18n.loadStrings();
  i18n.applyDOM(document);
  if (!hasWebGL2()) { showFallback(); return; }
  try { (await import('./app.js')).start(); }
  catch (err) {
    console.error(err);
    showFallback(i18n.tr('fallback.err', { why: err && err.message ? err.message : i18n.tr('err.unknown') }));
  }
}).catch((err) => { console.error(err); showFallback(); });
