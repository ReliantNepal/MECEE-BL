/* Service worker for MECEE-BL Syllabus app.
   Goal: make nav-between-pages feel instant by serving the UI shell straight
   from cache, and bypass the network entirely for assets that haven't changed.

   Strategy per request:
     - /api/*           → never cached (sync, uploads — must be fresh).
     - /sw.js           → never intercepted (the SW upgrading itself).
     - *.pdf / *.mp3    → never SW-cached. These are large binaries already
                          covered by Cache-Control: immutable at the HTTP layer.
                          Cloning a 10–30 MB ReadableStream body to write to the
                          Cache API while simultaneously returning it to the
                          caller races the two stream readers and can corrupt the
                          body, causing PDF.js to throw "Invalid PDF structure".
     - precached shell  → cache-first, with a quiet background refresh
                          (stale-while-revalidate) so the next visit is up
                          to date without slowing down this one.
     - everything else  → cache-first too, populated on first fetch.

   To force every client to drop its cached copies, bump CACHE_VERSION below —
   the activate handler deletes any cache whose name doesn't match. */

const CACHE_VERSION = 'mecee-v20'; // bumped: library re-fetches from disk on cabinet open/close; fixed close→reopen showing previous book

const SHELL = [
  '/',
  '/index.html',
  '/tracker.html',
  '/routine.html',
  '/chat.html',
  '/library.html',
  '/flashcards.html',
  '/theme.css',
  '/player.css',
  '/cursor.css',
  '/contextmenu.css',
  '/queue.css',
  '/notes.css',
  '/chat.css',
  '/mecee_keys.js',
  '/cursor.js',
  '/contextmenu.js',
  '/queue.js',
  '/notes.js',
  '/sync.js',
  '/player.js',
  '/books.js',
  '/syllabus.js',
  '/nav-shim.js',
  '/chat.js',
  '/Playlist/tracks.js',
  /* Local pdf.js — same-origin so the worker can fetch local PDFs without
     CORS, and so the library/flashcards pages don't wait on cdnjs. */
  '/Assets/pdfjs/pdf.min.js',
  '/Assets/pdfjs/pdf.worker.min.js',
];

self.addEventListener('install', event => {
  // skipWaiting() lets the new SW take over instead of waiting for every tab
  // to close. Combined with clients.claim() in activate, fresh deploys land
  // on the very next navigation rather than after a full browser restart.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // Per-URL .add() with a catch so one missing file (e.g. a page that
      // hasn't been written yet) doesn't fail the entire install.
      Promise.all(SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[sw] precache skipped:', url, err))
      ))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests — third-party CDNs (if any) keep their
  // own caching rules.
  if (url.origin !== self.location.origin) return;

  // Sync / upload endpoints are stateful; never serve them from cache.
  if (url.pathname.startsWith('/api/')) return;

  // Don't intercept the worker itself or its updates.
  if (url.pathname === '/sw.js') return;

  // Large binaries (PDF, MP3): bypass SW entirely — don't intercept.
  // Intercepting and cloning a 10-30 MB ReadableStream while also writing
  // it to the Cache API races the two readers and can corrupt the body,
  // causing PDF.js to throw "Invalid PDF structure". Let the browser's
  // own HTTP cache layer handle these (controlled by Cache-Control headers
  // set by the server).
  if (/\.(pdf|mp3)$/i.test(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(cached => {
        // Background refresh: re-fetch silently so the cache stays warm with
        // the latest bytes, but we still answer this request from cache.
        const networkFetch = fetch(req).then(resp => {
          // Only cache real successes. opaque (no-cors) responses have
          // status=0; basic = same-origin; we restrict to basic+200 to avoid
          // poisoning the cache with redirects or partial content.
          if (resp && resp.status === 200 && resp.type === 'basic') {
            cache.put(req, resp.clone()).catch(() => {});
          }
          return resp;
        }).catch(() => cached);  // Offline? Fall back to whatever we had.

        return cached || networkFetch;
      })
    )
  );
});
