/* Service worker for MECEE-BL Syllabus app.
   Goal: make nav-between-pages feel instant by serving static assets straight
   from cache, while keeping actively-edited code (.html/.js/.css) honest by
   always preferring the network for it.

   Strategy per request:
     - /api/*             → never cached (sync, uploads — must be fresh).
     - /sw.js             → never intercepted (the SW upgrading itself).
     - *.pdf / *.mp3      → never SW-cached. These are large binaries already
                            covered by Cache-Control: immutable at the HTTP
                            layer. Cloning a 10–30 MB ReadableStream body to
                            write to the Cache API while simultaneously
                            returning it to the caller races the two stream
                            readers and can corrupt the body, causing PDF.js
                            to throw "Invalid PDF structure".
     - *.html/.js/.css    → network-first, cache only as an offline fallback.
                            Cache-first on these meant every CSS/JS edit needed
                            a CACHE_VERSION bump *and* a couple of reloads
                            before it actually showed up — exactly the
                            "I changed it, restarted, still seeing the old
                            version" loop this project kept hitting. Network-
                            first removes that lag entirely; the cache write
                            on each successful fetch still gives offline mode
                            something to fall back on.
     - everything else    → cache-first with a quiet background refresh
                            (stale-while-revalidate). These are genuinely
                            static (images, fonts, icons, the vendored pdf.js
                            bundle) — they only change when CACHE_VERSION
                            bumps and drops the whole old cache, so cache-first
                            is the right call for instant repeat loads.

   To force every client to drop its cached copies, bump CACHE_VERSION below —
   the activate handler deletes any cache whose name doesn't match. */

const CACHE_VERSION = 'mecee-v49'; // bumped: reworked the fetch strategy — .html/.js/.css now go network-first (cache only as an offline fallback), since cache-first on actively-edited code is exactly what caused the repeated "bumped the version, restarted, still seeing the old UI" headaches this session. Genuinely static assets (images, fonts, pdf.js, icons) stay cache-first with background revalidation for instant repeat loads

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
  '/wallpaper.js',
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

  // Code & markup (.html/.js/.css) change constantly during active
  // development — cache-first on these is what caused the repeated
  // "bumped CACHE_VERSION, restarted, still seeing the old version"
  // headaches (the cache would keep answering instantly with stale
  // bytes while the background refetch raced in unseen). Go
  // network-first for these: try the network, and only fall back to
  // the cache if you're offline. Whatever comes back over the network
  // also gets cached, so offline mode still has *something* to serve.
  if (/\.(html|js|css)$/i.test(url.pathname) || url.pathname === '/') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        fetch(req).then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            cache.put(req, resp.clone()).catch(() => {});
          }
          return resp;
        }).catch(() => cache.match(req))
      )
    );
    return;
  }

  // Everything else (images, fonts, icons, the vendored pdf.js bundle,
  // audio thumbnails, …) is genuinely static — it only changes when you
  // replace the file outright, which a CACHE_VERSION bump already
  // handles by dropping the whole old cache. Cache-first here is the
  // right call: instant repeat loads, with a quiet background refresh
  // so the cache stays warm.
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(cached => {
        const networkFetch = fetch(req).then(resp => {
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
