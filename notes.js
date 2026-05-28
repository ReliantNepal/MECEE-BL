/* Sticky-note launcher + draggable note window with KEYBOARD + MOUSE writing.
   ---------------------------------------------------------------------------
   The note window's "paper" has two stacked layers:
     • Bottom — a textarea for keyboard typing (autosaves to localStorage).
     • Top    — a transparent <canvas> for mouse drawing. The Writing.png
               cursor (hotspot at the top-left tip) shows whenever the
               pointer is over the canvas; click-and-drag draws ink strokes,
               while a quick click without dragging falls through to the
               textarea so you can keep typing.
   Pages: the notebook supports multiple pages. Press ← / → (when not typing
   inside the textarea) or click the prev/next buttons in the header. Going
   past the last page auto-creates a new blank one. Each page persists its
   own text + drawing independently.

   Storage:
     • mecee_notes_pages_v2    → JSON array of { text, draw }, one per page
     • mecee_notes_active_v2   → current page index
     • mecee_notes_v1__pos     → window left/top/width/height (carried over)
     • mecee_notes_v1          → legacy single-page text (migrated on first load)
     • mecee_notes_v1__draw    → legacy single-page drawing (migrated on first load)
*/
(function () {
  var KEY_PAGES  = 'mecee_notes_pages_v2';
  var KEY_ACTIVE = 'mecee_notes_active_v2';
  var KEY_POS    = 'mecee_notes_v1__pos';
  /* Legacy keys — read once, migrated into the pages array, then ignored. */
  var LEGACY_KEY_TEXT = 'mecee_notes_v1';
  var LEGACY_KEY_DRAW = 'mecee_notes_v1__draw';

  /* The PNG is 64x64 but the visible pencil content actually starts at pixel
     (6, 7) — the top-left 5 columns / 6 rows are transparent. Without an
     offset hotspot, ink would land 6px right + 7px below where the pencil
     tip *looks* like it should write. (6, 7) puts the cursor's click point
     exactly on the visible pen tip. */
  var WRITING_CURSOR = "url('Assets/Mousedesign/Writing.png') 6 7, crosshair";

  var launcherEl, notesBtn;
  var windowEl, headerEl, closeBtn, clearBtn, undoBtn;
  var prevPageBtn, nextPageBtn, pageLabel;
  var paperEl, textEl, canvasEl, ctx;

  /* Drawing-undo stack. Each entry is a PNG dataURL snapshot taken just
     BEFORE a stroke begins (or just before Clear). Ctrl+Z pops the top.
     Cleared on page change — each page has its own short-lived history. */
  var undoStack    = [];
  var UNDO_MAX     = 40;
  /* Whether the most-recent edit was a draw stroke (true) or text input
     (false). Tells the Ctrl+Z handler whether to undo our canvas history
     or to let the browser's native textarea undo run. */
  var lastWasDraw  = false;

  /* The notebook's pages and which one is currently shown. */
  var pages       = [{ text: '', draw: '' }];
  var pageIndex   = 0;
  /* Suppress autosave-on-input while loadCurrentPage() is repopulating the
     textarea — otherwise the load would immediately overwrite the page we
     just loaded with the stale value sitting in textEl. */
  var loadingPage = false;

  function buildUI() {
    /* === Launcher (bottom-left) === */
    /* Single 📝 button — first click opens the note window, second click
       closes it. No two-step arrow → carpet → notepad indirection. */
    launcherEl = document.createElement('div');
    launcherEl.className = 'notes-launcher';
    launcherEl.innerHTML =
      '<button class="notes-thumb" id="__notesOpen" type="button" title="Open note">📝</button>';
    document.body.appendChild(launcherEl);

    notesBtn = document.getElementById('__notesOpen');
    notesBtn.addEventListener('click', function () {
      if (windowEl && windowEl.classList.contains('open')) hideWindow();
      else showWindow();
    });

    /* === Note window === */
    windowEl = document.createElement('div');
    windowEl.className = 'notes-window';
    windowEl.id = '__notesWindow';
    windowEl.innerHTML =
      '<div class="notes-header" id="__notesHeader">' +
      '  <span>📝</span>' +
      '  <div class="title">Notes</div>' +
      '  <button class="notes-clear notes-page-btn" id="__notesPrev" type="button" title="Previous page (←)">‹</button>' +
      '  <span class="notes-page-label" id="__notesPageLbl">1 / 1</span>' +
      '  <button class="notes-clear notes-page-btn" id="__notesNext" type="button" title="Next page (→)">›</button>' +
      '  <button class="notes-clear" id="__notesUndo"  type="button" title="Undo last stroke (Ctrl+Z)">↩️</button>' +
      '  <button class="notes-clear" id="__notesClear" type="button" title="Clear drawings">🧹</button>' +
      '  <button class="notes-close" id="__notesClose" type="button" title="Close">✕</button>' +
      '</div>' +
      '<div class="notes-paper" id="__notesPaper">' +
      '  <textarea class="notes-text" id="__notesText" placeholder="Click to type — or hold and drag to draw. ← / → switch pages." spellcheck="false"></textarea>' +
      '  <canvas class="notes-draw" id="__notesDraw"></canvas>' +
      '</div>';
    document.body.appendChild(windowEl);

    headerEl    = document.getElementById('__notesHeader');
    closeBtn    = document.getElementById('__notesClose');
    clearBtn    = document.getElementById('__notesClear');
    undoBtn     = document.getElementById('__notesUndo');
    prevPageBtn = document.getElementById('__notesPrev');
    nextPageBtn = document.getElementById('__notesNext');
    pageLabel   = document.getElementById('__notesPageLbl');
    paperEl     = document.getElementById('__notesPaper');
    textEl      = document.getElementById('__notesText');
    canvasEl    = document.getElementById('__notesDraw');
    ctx         = canvasEl.getContext('2d');

    /* Apply Writing.png cursor via inline !important. Inline-important beats
       both the stylesheet `*` rule from cursor.js AND its dynamic per-element
       inline writes (which are non-important). cursor.js also skips this
       element via window.__isNotesWritingArea() as a safety net. */
    canvasEl.style.setProperty('cursor', WRITING_CURSOR, 'important');
    textEl.style.setProperty('cursor', WRITING_CURSOR, 'important');

    closeBtn.addEventListener('click', hideWindow);
    clearBtn.addEventListener('click', clearDrawing);
    undoBtn.addEventListener('click', undoDraw);
    prevPageBtn.addEventListener('click', function () { gotoPage(pageIndex - 1); });
    nextPageBtn.addEventListener('click', function () { gotoPage(pageIndex + 1); });

    /* Load the saved pages (or migrate from the old single-page format). */
    loadPages();

    textEl.addEventListener('input', function () {
      if (loadingPage) return;
      pages[pageIndex] = pages[pageIndex] || { text: '', draw: '' };
      pages[pageIndex].text = textEl.value;
      savePages();
      /* Browser handles native textarea undo for typed text — flag it so
         Ctrl+Z doesn't accidentally undo a drawing instead. */
      lastWasDraw = false;
    });

    document.addEventListener('keydown', function (e) {
      if (!windowEl.classList.contains('open')) return;

      /* Ctrl/Cmd+Z — undo the last drawing stroke if that was the most recent
         edit; otherwise let the browser's native textarea undo run. */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (lastWasDraw && undoStack.length > 0) {
          e.preventDefault();
          undoDraw();
        }
        return;
      }

      /* ← / → page navigation. Only when the textarea ISN'T focused, so the
         arrow keys still move the text caret while you're typing. Click the
         header (or use the prev/next buttons) to defocus the textarea, or
         press Escape — then arrow keys flip pages. */
      if (document.activeElement === textEl) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); gotoPage(pageIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); gotoPage(pageIndex + 1); }
      if (e.key === 'Escape')     { textEl.blur(); }
    });

    /* Initial window position */
    var saved;
    try { saved = JSON.parse(localStorage.getItem(KEY_POS) || 'null'); }
    catch (_) { saved = null; }
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      windowEl.style.left = saved.left + 'px';
      windowEl.style.top  = saved.top  + 'px';
      if (saved.w) windowEl.style.width  = saved.w + 'px';
      if (saved.h) windowEl.style.height = saved.h + 'px';
    } else {
      var w = 360, h = 320;
      windowEl.style.left = Math.max(10, Math.round((window.innerWidth  - w) / 2)) + 'px';
      windowEl.style.top  = Math.max(10, Math.round((window.innerHeight - h) / 2)) + 'px';
    }

    makeDraggable(headerEl, windowEl);
    setupDrawing();

    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        resizeCanvas();
        savePosition();
      });
      ro.observe(windowEl);
    }
  }

  function showWindow() {
    windowEl.classList.add('open');
    /* Canvas needs to be sized to its container; do it on every show in case
       the window was resized while hidden. */
    resizeCanvas();
    loadCurrentPage();
    setTimeout(function () { textEl.focus(); }, 30);
  }
  function hideWindow() { windowEl.classList.remove('open'); }

  /* ===== Pages ===== */

  function loadPages() {
    /* Read the new multi-page format first. */
    var raw = null;
    try { raw = localStorage.getItem(KEY_PAGES); } catch (_) {}
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          pages = parsed.map(function (p) {
            return { text: (p && p.text) || '', draw: (p && p.draw) || '' };
          });
        }
      } catch (_) { /* fall through to migration */ }
    } else {
      /* No multi-page data yet — migrate from the legacy single-page keys. */
      var oldText, oldDraw;
      try { oldText = localStorage.getItem(LEGACY_KEY_TEXT); } catch (_) {}
      try { oldDraw = localStorage.getItem(LEGACY_KEY_DRAW); } catch (_) {}
      if (oldText || oldDraw) {
        pages = [{ text: oldText || '', draw: oldDraw || '' }];
        savePages();
      }
    }
    if (!pages || !pages.length) pages = [{ text: '', draw: '' }];

    var saved;
    try { saved = parseInt(localStorage.getItem(KEY_ACTIVE) || '0', 10); }
    catch (_) { saved = 0; }
    if (isNaN(saved) || saved < 0 || saved >= pages.length) saved = 0;
    pageIndex = saved;
  }

  function savePages() {
    try {
      localStorage.setItem(KEY_PAGES, JSON.stringify(pages));
      localStorage.setItem(KEY_ACTIVE, String(pageIndex));
    } catch (_) {}
  }

  /* Commit the current canvas + textarea state into pages[pageIndex] so it
     survives a page switch. */
  function commitCurrentPage() {
    if (!pages[pageIndex]) pages[pageIndex] = { text: '', draw: '' };
    pages[pageIndex].text = textEl.value || '';
    try { pages[pageIndex].draw = canvasEl.toDataURL('image/png'); } catch (_) {}
    savePages();
  }

  /* Populate the textarea + canvas from pages[pageIndex]. Suppresses the
     textarea's input-autosave handler during repopulation. */
  function loadCurrentPage() {
    var p = pages[pageIndex] || { text: '', draw: '' };
    loadingPage = true;
    textEl.value = p.text || '';
    loadingPage = false;

    var rect = paperEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (p.draw) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
      img.src = p.draw;
    }

    /* Each page has its own short-lived undo history — clear on switch. */
    undoStack = [];
    lastWasDraw = false;
    updateUndoButton();
    updatePageLabel();
  }

  /* A page is "empty" if it never collected any content: no text and no
     drawing data. Note: a drawing that was made and then 🧹 Clear-ed still
     has a dataURL (of an all-transparent canvas), so it counts as
     non-empty. That's intentional — clearing was a deliberate action, so
     we preserve the page slot. */
  function isPageEmpty(p) {
    if (!p) return true;
    return (!p.text || !p.text.length) && (!p.draw || !p.draw.length);
  }

  function gotoPage(target) {
    /* Commit whatever's on screen now to its slot. */
    commitCurrentPage();

    /* Trying to push PAST the last page while we're on an empty trailing
       page would create yet another blank — pointless. Just stay put. */
    if (target >= pages.length && isPageEmpty(pages[pageIndex])) return;

    if (target < 0) return;        /* nothing before page 1 */

    /* If the page we're leaving is an empty trailing page (the typical
       result of "click → to create a new one, then click ← to go back"),
       drop it now so the count reflects reality. */
    var leavingTrailingEmpty =
      pages.length > 1 &&
      pageIndex === pages.length - 1 &&
      isPageEmpty(pages[pageIndex]);
    if (leavingTrailingEmpty) {
      pages.pop();
      /* target may have referred to the page we just popped — clamp. */
      if (target > pages.length) target = pages.length;
    }

    if (target >= pages.length) {
      /* Right-past-last → auto-create a new blank page. */
      pages.push({ text: '', draw: '' });
    }
    pageIndex = target;
    savePages();
    loadCurrentPage();
  }

  function updatePageLabel() {
    if (pageLabel) pageLabel.textContent = (pageIndex + 1) + ' / ' + pages.length;
    if (prevPageBtn) prevPageBtn.disabled = (pageIndex <= 0);
    /* nextPageBtn always enabled — going past the end creates a new page. */
  }

  /* ===== Drawing ===== */

  function resizeCanvas() {
    if (!paperEl || !canvasEl) return;
    var rect = paperEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    /* Preserve current drawing across resize. */
    var old = null;
    if (canvasEl.width && canvasEl.height) {
      try { old = canvasEl.toDataURL(); } catch (_) { old = null; }
    }
    var dpr = window.devicePixelRatio || 1;
    canvasEl.width  = Math.round(rect.width  * dpr);
    canvasEl.height = Math.round(rect.height * dpr);
    canvasEl.style.width  = rect.width  + 'px';
    canvasEl.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a1a1a';
    if (old) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
      img.src = old;
    }
  }

  /* Save the current canvas as the active page's drawing. (Used to write to
     a dedicated key; now it lives inside pages[pageIndex].draw.) */
  function saveDrawing() {
    if (!pages[pageIndex]) pages[pageIndex] = { text: '', draw: '' };
    try { pages[pageIndex].draw = canvasEl.toDataURL('image/png'); } catch (_) {}
    savePages();
  }

  /* Snapshot the current canvas state and push it to the undo stack.
     Called BEFORE a stroke starts and BEFORE clearDrawing, so undo restores
     the pre-action state. */
  function pushUndoSnapshot() {
    try {
      undoStack.push(canvasEl.toDataURL('image/png'));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      updateUndoButton();
    } catch (_) {}
  }

  function undoDraw() {
    if (undoStack.length === 0) return;
    var data = undoStack.pop();
    var img  = new Image();
    img.onload = function () {
      var rect = paperEl.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      saveDrawing();
    };
    img.src = data;
    if (undoStack.length === 0) lastWasDraw = false;
    updateUndoButton();
  }

  function updateUndoButton() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  }

  function clearDrawing() {
    if (!confirm('Clear all drawings? Typed text is kept.')) return;
    pushUndoSnapshot();
    lastWasDraw = true;     /* so Ctrl+Z right after Clear restores the drawing */
    var rect = paperEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    saveDrawing();
  }

  function setupDrawing() {
    var isDown  = false;
    var drawing = false;
    var lastX = 0, lastY = 0;
    var downX = 0, downY = 0;
    var DRAG_THRESHOLD = 3;

    function localPos(e) {
      var rect = canvasEl.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvasEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;          /* left button only */
      var p = localPos(e);
      isDown  = true;
      drawing = false;
      downX = p.x; downY = p.y;
      lastX = p.x; lastY = p.y;
      e.preventDefault();
    });

    canvasEl.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      var p = localPos(e);
      if (!drawing) {
        /* Wait until the pointer has moved past the threshold before treating
           this as a drag. Below the threshold it's still a candidate "click". */
        if (Math.abs(p.x - downX) < DRAG_THRESHOLD &&
            Math.abs(p.y - downY) < DRAG_THRESHOLD) return;
        drawing = true;
        /* Snapshot the canvas state RIGHT BEFORE this stroke modifies it. */
        pushUndoSnapshot();
        ctx.beginPath();
        ctx.moveTo(downX, downY);
      }
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    });

    function endStroke(passThroughClick) {
      if (isDown && !drawing && passThroughClick) {
        /* No drag happened → treat as a click-through to the textarea so the
           user can type. */
        textEl.focus();
      }
      if (drawing) {
        saveDrawing();
        lastWasDraw = true;
      }
      isDown = false;
      drawing = false;
    }

    canvasEl.addEventListener('mouseup',    function () { endStroke(true);  });
    canvasEl.addEventListener('mouseleave', function () { endStroke(false); });
    window.addEventListener('blur',         function () { endStroke(false); });
  }

  /* ===== Drag the whole window by its header ===== */
  function makeDraggable(handle, target) {
    var dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var rect = target.getBoundingClientRect();
      sl = rect.left; st = rect.top;
      handle.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var nl = sl + (e.clientX - sx);
      var nt = st + (e.clientY - sy);
      var maxL = window.innerWidth  - 60;
      var maxT = window.innerHeight - 30;
      if (nl < -target.offsetWidth + 60) nl = -target.offsetWidth + 60;
      if (nl > maxL) nl = maxL;
      if (nt < 0)    nt = 0;
      if (nt > maxT) nt = maxT;
      target.style.left = nl + 'px';
      target.style.top  = nt + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      savePosition();
    });
  }

  function savePosition() {
    try {
      var rect = windowEl.getBoundingClientRect();
      localStorage.setItem(KEY_POS, JSON.stringify({
        left: Math.round(rect.left),
        top:  Math.round(rect.top),
        w:    Math.round(rect.width),
        h:    Math.round(rect.height)
      }));
    } catch (_) {}
  }

  /* Lets cursor.js detect the writing area and stop clobbering its cursor. */
  window.__isNotesWritingArea = function (el) {
    return !!(el && el.closest && el.closest('#__notesPaper'));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
