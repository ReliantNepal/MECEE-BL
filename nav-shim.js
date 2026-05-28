/* Shared topbar nav interceptor.
   ---------------------------------------------------------------------------
   Sub-pages live inside the shell's iframe (index.html). Their topbar links
   are plain <a href="tracker.html"> etc. Letting that click bubble normally
   navigates the iframe but bypasses the shell's router — so the shell's
   URL hash falls out of sync and the browser Back button does the wrong
   thing.

   This shim intercepts every topbar nav-link click that targets a sibling
   sub-page (tracker / routine / library / chat / flashcards). When we're
   inside the shell it forwards the navigation to the shell via postMessage
   ({type:'nav', href:'tracker'}). The shell's navigate() takes care of the
   iframe + history.pushState properly.

   Outside the shell (page opened standalone) the click is left alone so the
   browser does a normal full navigation. */
(function () {
  if (window.parent === window) return;   // standalone — don't intercept

  /* Map filename → router target name. Keep in sync with index.html PAGES. */
  const TARGETS = {
    'tracker.html':    'tracker',
    'routine.html':    'routine',
    'library.html':    'library',
    'chat.html':       'chat',
    'flashcards.html': 'flashcards'
  };

  document.addEventListener('click', e => {
    /* Walk up to the nearest anchor so clicks on inner spans/icons still work. */
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    /* Only intercept same-origin links to a known sub-page. */
    const target = TARGETS[href.split(/[?#]/)[0]];
    if (!target) return;
    e.preventDefault();
    try {
      window.parent.postMessage({ type: 'nav', href: target }, '*');
    } catch (_) {
      /* If postMessage fails for any reason, fall back to direct navigation. */
      location.href = href;
    }
  });

  /* Hover-prefetch: when the user even *thinks* about clicking a nav link,
     fire a low-priority <link rel="prefetch"> for that sub-page. Browsers
     schedule prefetch after the critical path so it doesn't fight the page
     you're already on. Once per target — subsequent hovers are no-ops.

     Note: this is belt-and-suspenders with the shell's eager warm-iframes
     pool. On a totally fresh first visit (no SW cache, iframes not yet
     spawned) hover still buys ~50-150 ms of head-start. */
  const prefetched = new Set();
  document.addEventListener('mouseover', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const raw = a.getAttribute('href');
    if (!raw) return;
    const file = raw.split(/[?#]/)[0];
    if (!TARGETS[file] || prefetched.has(file)) return;
    prefetched.add(file);
    const link = document.createElement('link');
    link.rel  = 'prefetch';
    link.href = file;
    link.as   = 'document';
    document.head.appendChild(link);
  });
})();
