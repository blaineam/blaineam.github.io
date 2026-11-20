// IndexedDB, the only place big things are kept: image files waiting to be committed, the
// saved drafts, and this device's watermark. Everything stays in this browser.
let dbp;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  let r;
  try { r = indexedDB.open('wm-edit', 2); } catch (e) { return rej(e); }
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts');
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.onblocked = () => rej(new Error('The editor is open in another tab with an older version. Close it and reload.'));
}));
const run = (store, mode, fn) => open().then((d) => new Promise((res, rej) => {
  const tx = d.transaction(store, mode); const rq = fn(tx.objectStore(store));
  tx.oncomplete = () => res(rq && rq.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
}));

/** Image files by key. */
export const blobs = {
  put: (k, b) => run('blobs', 'readwrite', (s) => s.put(b, k)),
  get: (k) => run('blobs', 'readonly', (s) => s.get(k)).catch(() => null),
  del: (k) => run('blobs', 'readwrite', (s) => s.delete(k)).catch(() => null),
  clear: () => run('blobs', 'readwrite', (s) => s.clear()).catch(() => null),
};
/** Saved drafts by id. */
export const draftsDb = {
  put: (rec) => run('drafts', 'readwrite', (s) => s.put(rec, rec.id)),
  get: (id) => run('drafts', 'readonly', (s) => s.get(id)).catch(() => null),
  del: (id) => run('drafts', 'readwrite', (s) => s.delete(id)).catch(() => null),
  all: () => run('drafts', 'readonly', (s) => s.getAll()).catch(() => []),
  clear: () => run('drafts', 'readwrite', (s) => s.clear()).catch(() => null),
};
export const newKey = (prefix = 'b') => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
