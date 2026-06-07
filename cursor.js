/* Custom cursor controller.
   ---------------------------------------------------------------------------
   We can't just set cursor on <html> — buttons / links / .badge etc. each
   declare their own `cursor` (pointer/help/...) and those win over the
   parent's cursor when the pointer is directly over them. So instead we
   inject a single <style> element with `*, *::before, *::after { cursor: ...
   !important }` and rewrite its contents whenever the desired cursor changes.
   That forces every element on the page to use whichever cursor we pick.

   State:
     - mouse pressed?          → Hand2
     - hovering Library link?  → book1 (first ~180ms) then book2
     - hovering interactive?   → magnifier1 (first ~180ms) then magnifier2
     - otherwise               → Hand1

   "Interactive" = matches CLICKABLE_SEL, OR its computed `cursor` keyword is
   one of pointer/help/grab/zoom-in/zoom-out/copy/move/cell. The computed-
   style check catches the achievement badges (cursor: help) and anything
   else styled as interactive without needing me to list every selector.
*/
(function () {
  var FRESH_MS = 180;

  /* Fallback keyword matters: `auto` resolves to `text` (I-beam) on any text
     element, so when the custom PNG can't render (composited layers, etc.)
     we'd see an I-beam over titles, paragraphs, etc. `default` is always the
     arrow, regardless of content, so it's a safe fallback for everything. */
  var CURSORS = {
    hand1: "url('Assets/Mousedesign/Hand1.png') 8 4, default",
    hand2: "url('Assets/Mousedesign/Hand2.png') 8 4, default",
    mag1:  "url('Assets/Mousedesign/magnifier1.png') 24 24, pointer",
    mag2:  "url('Assets/Mousedesign/magnifier2.png') 24 24, pointer",
    book1: "url('Assets/Mousedesign/book1.png') 24 24, pointer",
    book2: "url('Assets/Mousedesign/Book2.png') 24 24, pointer"
  };

  var CLICKABLE_SEL = [
    'a', 'button', '[role="button"]',
    'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
    'input[type="checkbox"]', 'input[type="radio"]',
    'select', 'label[for]', 'summary',
    '[onclick]', '.clickable', '.badge'
  ].join(',');

  /* --- inject (or get) the override <style> tag ----------------------- */
  function getStyleEl() {
    var s = document.getElementById('__cursor_override__');
    if (s) return s;
    s = document.createElement('style');
    s.id = '__cursor_override__';
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  var currentValue = null;
  function setCursor(value) {
    /* This used to call forceInlineCursor() (a querySelectorAll over every
       composited element, plus two style writes each) on EVERY call —
       and render() runs on every mousemove, which fires dozens of times
       per second. That's what made clicking/moving feel laggy: a DOM
       sweep per pixel of motion. The compositor's cursor-bitmap cache
       only actually needs flushing when the cursor image *changes* (e.g.
       hand1 → hand2 on press), so gate the expensive sweep on that. */
    if (value === currentValue) return;
    currentValue = value;
    getStyleEl().textContent =
      '*, *::before, *::after { cursor: ' + value + ' !important; }';
    forceInlineCursor(value);
  }

  /* Elements that get promoted to GPU compositor layers and therefore need
     their cursor written inline (not just via the global * rule). Add more
     selectors here if other animated/transformed elements show the same
     "cursor stuck as system default" issue. */
  var COMPOSITED_SEL = [
    '.player-thumb',
    '.player-thumb-spinner',
    '.player-thumb-note',
    '.player-widget',
    '.player-body',
    '.player-info',
    '.player-title',
    '.player-sub',
    /* The PDF reader's bottom toolbar uses backdrop-filter: blur(...), which
       promotes it (and every child) to its own GPU compositor layer — same
       reason the music disc needs this treatment. */
    '.pdf-bar',
    '.pdf-bar button',
    '.pdf-bar input',
    '.pdf-bar span',
    '.pdf-bar .sep'
  ].join(',');

  var lastHover = null;

  /* Returns true if `el` (or any ancestor) is the notes writing area, which
     wants its own Writing.png cursor and should not be touched by the global
     override. notes.js defines window.__isNotesWritingArea. */
  function isWritingArea(el) {
    try {
      if (typeof window.__isNotesWritingArea === 'function') {
        return !!window.__isNotesWritingArea(el);
      }
    } catch (_) {}
    return !!(el && el.closest && el.closest('#__notesPaper'));
  }

  function forceInlineCursor(value) {
    var nodes;
    try { nodes = document.querySelectorAll(COMPOSITED_SEL); }
    catch (_) { nodes = []; }
    for (var i = 0; i < nodes.length; i++) {
      if (isWritingArea(nodes[i])) continue;
      /* Setting to '' first then to the new value forces Chromium to invalidate
         its cached cursor bitmap for the compositor layer. */
      nodes[i].style.cursor = '';
      nodes[i].style.cursor = value;
    }
    /* General fallback: also stamp the element the pointer is currently over,
       so ANY composited element (even one not in COMPOSITED_SEL) refreshes.
       Skip the notes writing area — it has its own Writing.png cursor that
       must not be clobbered. */
    if (lastHover && lastHover.style && !isWritingArea(lastHover)) {
      lastHover.style.cursor = '';
      lastHover.style.cursor = value;
    }
  }

  /* --- state --------------------------------------------------------- */
  var pressed    = false;
  var hoverEl    = null;
  var hoverKind  = null;     // 'library' | 'generic' | null
  var freshUntil = 0;
  var freshTimer = null;

  function libraryAncestor(el) {
    return (el && el.closest)
      ? el.closest('a[href="library.html"], a[href^="library.html?"]')
      : null;
  }

  function isInteractive(el) {
    /* Selector-based only. We can't trust getComputedStyle here because our
       own override rule (`* { cursor: ... !important }`) makes every element
       report the active cursor — which would keep us stuck on magnifier2
       forever once we entered an interactive area. */
    return (el && el.closest) ? el.closest(CLICKABLE_SEL) : null;
  }

  function render() {
    if (pressed) { setCursor(CURSORS.hand2); return; }
    if (!hoverEl) { setCursor(CURSORS.hand1); return; }
    var fresh = Date.now() < freshUntil;
    if (hoverKind === 'library') {
      setCursor(fresh ? CURSORS.book1 : CURSORS.book2);
    } else {
      setCursor(fresh ? CURSORS.mag1 : CURSORS.mag2);
    }
  }

  function updateHover(target) {
    lastHover = (target && target.nodeType === 1) ? target : null;
    var lib = libraryAncestor(target);
    var el  = lib || isInteractive(target);
    var kind = lib ? 'library' : (el ? 'generic' : null);

    if (el !== hoverEl || kind !== hoverKind) {
      hoverEl   = el;
      hoverKind = kind;
      if (el) {
        freshUntil = Date.now() + FRESH_MS;
        if (freshTimer) clearTimeout(freshTimer);
        freshTimer = setTimeout(render, FRESH_MS + 10);
      }
    }
    render();
  }

  document.addEventListener('mousemove', function (e) { updateHover(e.target); }, true);
  document.addEventListener('mouseover', function (e) { updateHover(e.target); }, true);
  document.addEventListener('mouseout',  function (e) { updateHover(e.relatedTarget || e.target); }, true);

  function releasePress() { pressed = false; render(); }

  document.addEventListener('mousedown', function () { pressed = true; render(); }, true);
  document.addEventListener('mouseup',   releasePress, true);

  /* When the user starts a drag (e.g. drag-selecting text and then dragging
     it), the browser swallows `mouseup` in favor of drag events. Without
     these listeners, `pressed` stays true forever and the cursor sticks on
     Hand2. */
  document.addEventListener('dragend',       releasePress, true);
  document.addEventListener('drop',          releasePress, true);
  document.addEventListener('pointerup',     releasePress, true);
  document.addEventListener('pointercancel', releasePress, true);

  window.addEventListener('blur',       releasePress);
  window.addEventListener('mouseleave', function () { hoverEl = null; hoverKind = null; render(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releasePress();
  });

  /* Preload all cursor PNGs so they're in the browser cache before any hover
     happens. Without this, the first hover that needs e.g. magnifier1.png has
     to fetch it, and the fallback keyword (default arrow) flashes for one
     frame while the PNG loads. */
  var CURSOR_FILES = [
    'Assets/Mousedesign/Hand1.png',
    'Assets/Mousedesign/Hand2.png',
    'Assets/Mousedesign/magnifier1.png',
    'Assets/Mousedesign/magnifier2.png',
    'Assets/Mousedesign/book1.png',
    'Assets/Mousedesign/Book2.png'
  ];
  function preloadCursors() {
    for (var i = 0; i < CURSOR_FILES.length; i++) {
      var img = new Image();
      img.src = CURSOR_FILES[i];
    }
  }

  /* Make sure the style tag exists and an initial cursor is set ASAP. */
  function init() {
    preloadCursors();
    setCursor(CURSORS.hand1);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
