// Per-device settings and the token. Both live only in this browser's localStorage.
const KEY = 'wm-edit:settings', TOKEN = 'wm-edit:token';
const DEFAULTS = { owner: 'blaineam', repo: 'blaineam.github.io', branch: 'main', jpegFallback: true, watermark: true };

export function settings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(patch) {
  const next = { ...settings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts for this page only */ }
  return next;
}
export const getToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };
export const setToken = (t) => { try { localStorage.setItem(TOKEN, t); } catch { /* kept in memory by the caller */ } };
export const clearToken = () => { try { localStorage.removeItem(TOKEN); } catch { /* nothing stored */ } };

/** Local development hosts, where the dry run is offered. */
export const isLocalHost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\.(localhost|test)$/.test(location.hostname);
