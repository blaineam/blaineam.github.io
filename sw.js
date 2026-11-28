/* sw.js: lets wemiller.com open with no connection once it has been visited or added to a home screen.
 *
 * - Pages: network first, so a visitor online always gets the current page; the saved copy is the fallback.
 * - Everything else on this origin (styles, scripts, images, data): served from the saved copy at once and
 *   refreshed in the background, so the next visit has the new one.
 * - Data a page asks for with `cache: 'no-cache'` (the trail register and its lights, the trail's settings):
 *   network first, like a page. The page said it wants today's copy, and a list that only catches up on the
 *   visit after next looks broken. The saved copy is still the fallback with no connection.
 * - After the first visit the page asks this worker to "warm" the cache: every page of the site plus its
 *   styles, scripts, small data files and the home page's thumbnails, listed in /offline-files.json (written
 *   by scripts/build-offline.mjs). Full-size photographs, panoramas, app screenshots and audio are large
 *   (hundreds of MB), so they are saved as they are viewed rather than all at once.
 * - A visitor can choose to save all of that media too, and remove it again: the "Offline copy" dialog on the
 *   home page (assets/site.js) fills and empties a separate cache, wm-media-v1, which is read here as a fallback.
 * - Nothing is sent anywhere: this only ever talks to this site.
 *
 * The three tools that ship their own service worker keep it; this one leaves their folders alone.
 */
const VERSION = '90dc11ae080a';   // rewritten by scripts/build-offline.mjs
const PAGES = 'wm-pages-v1', FILES = 'wm-files-v1';
// Haven's web client (a linked, end-to-end encrypted device) is left alone too: it is always loaded
// from the network exactly as its release published it, never saved or answered by this worker.
const OWN_WORKER = ['/tools/tom/app/', '/tools/monkr/app/', '/apps/shepherd/demo/', '/apps/haven/app/'];
const NEVER = ['/edit/', '/pay/', '/out/', '/scripts/', '/sw.js'];
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    await pages.addAll(['/', '/offline.html']);
    const files = await caches.open(FILES);
    await files.add('/manifest.webmanifest').catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('wm-') && key !== PAGES && key !== FILES && key !== 'wm-media-v1') await caches.delete(key);
    await self.clients.claim();
  })());
});

const skip = (url) => OWN_WORKER.some((p) => url.pathname.startsWith(p)) || NEVER.some((p) => url.pathname.startsWith(p));
const good = (res) => res && res.ok && res.status === 200 && res.type === 'basic';

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(request), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
    if (good(res)) cache.put(request, res.clone());
    return res;
  } catch (e) {
    // the same page with other query parameters (?when=, ?v=, ?lang=) is the same file
    return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true })) || (await cache.match('/offline.html'));
  }
}

async function file(request, event) {
  const cache = await caches.open(FILES);
  const saved = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true })) || (await caches.match(request, { ignoreSearch: true }));
  const fresh = fetch(request).then((res) => { if (good(res)) cache.put(request, res.clone()); return res; });
  if (LOCAL) return fresh.catch(() => saved || Response.error());     // while developing, never serve a stale file
  if (saved) { event.waitUntil(fresh.catch(() => {})); return saved; }
  return fresh;
}

/* A file the page asked for fresh: the network's copy if it comes in time, else the saved one. */
async function live(request) {
  const cache = await caches.open(FILES);
  try {
    const res = await Promise.race([fetch(request), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
    if (good(res)) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || skip(url) || url.searchParams.has('wm')) return;   // ?wm= : the page is filling the opt-in media cache itself
  event.respondWith(req.mode === 'navigate' ? page(req) : req.cache === 'no-cache' || req.cache === 'reload' ? live(req) : file(req, event));
});

/* Save the whole site's pages and small files, a few at a time, without getting in the visitor's way. */
async function warm() {
  const res = await fetch('/offline-files.json', { cache: 'no-cache' });
  if (!res.ok) return 0;
  const list = await res.json();
  const pages = await caches.open(PAGES), files = await caches.open(FILES);
  const meta = await files.match('/__warm');
  if (meta && (await meta.text()) === list.version) return 0;             // already have this build
  let saved = 0;
  const one = async (cache, path) => {
    try {
      const r = await fetch(path, { cache: 'no-cache' });
      if (good(r)) { await cache.put(path, r); saved++; } else if (r.status >= 500) throw new Error('server');
    } catch (e) { throw e; }
  };
  const all = list.pages.map((p) => [pages, p]).concat(list.files.map((f) => [files, f]));
  const again = [];
  for (let i = 0; i < all.length; i += 6) await Promise.all(all.slice(i, i + 6).map((e) => one(e[0], e[1]).catch(() => { again.push(e); })));
  for (const e of again) await one(e[0], e[1]).catch(() => {});          // one slow retry for anything that hiccuped
  if (saved >= all.length * 0.9) await files.put('/__warm', new Response(list.version));
  return saved;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'warm') event.waitUntil(warm().then((n) => event.source && event.source.postMessage({ type: 'warmed', saved: n, version: VERSION })).catch(() => {}));
});
