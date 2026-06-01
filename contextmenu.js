/* Custom right-click menu.
   ---------------------------------------------------------------------------
   Intercepts `contextmenu` and renders an in-app, theme-matched menu instead
   of the browser's native one. Items are built dynamically based on what's
   under the pointer (text selection → Copy; input field → Cut/Paste/Select
   All), plus standing app-level shortcuts (navigation, theme, reload).

   Lives at document scope — sub-pages run inside the shell's iframe, so each
   page (including the shell) has to include this file independently. Same
   pattern as cursor.js. */
(function () {
  var menuEl  = null;
  var items   = [];
  var focusIx = -1;

  /* ---------- DOM helpers ---------- */
  function getMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'app-ctx-menu';
    menuEl.id = '__app_ctx_menu__';
    menuEl.setAttribute('role', 'menu');
    document.body.appendChild(menuEl);
    return menuEl;
  }

  function closeMenu() {
    if (menuEl) {
      menuEl.classList.remove('open');
      menuEl.innerHTML = '';
    }
    items = [];
    focusIx = -1;
  }

  /* ---------- Actions ---------- */
  function inIframe() { return window.parent && window.parent !== window; }

  function navigate(page) {
    if (inIframe()) {
      try { window.parent.postMessage({ type: 'nav', href: page }, '*'); return; }
      catch (_) { /* fall through to direct */ }
    }
    location.href = page + '.html';
  }

  function toggleTheme() {
    var root = document.documentElement;
    var cur  = root.getAttribute('data-theme') || 'dark';
    var nxt  = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', nxt);
    try { localStorage.setItem(MeceeKeys.THEME, nxt); } catch (_) {}
  }

  function copySelection() {
    try { document.execCommand('copy'); } catch (_) {}
  }
  function searchInGoogle(text) {
    var url = 'https://www.google.com/search?q=' + encodeURIComponent(text);
    try { window.open(url, '_blank', 'noopener,noreferrer'); }
    catch (_) { location.href = url; }
  }
  /* "Ask AI" routes to the shell's queue (queue.js). When we're inside the
     shell iframe, postMessage to the parent. When standalone, call directly. */
  function askAi(text) {
    if (inIframe()) {
      try { window.parent.postMessage({ type: 'askAi', text: text }, '*'); return; }
      catch (_) { /* fall through */ }
    }
    if (typeof window.aiAskQuestion === 'function') {
      window.aiAskQuestion(text);
    } else {
      alert('The AI queue is only available when the app is opened through Start-MECEE.bat (it lives in the shell).');
    }
  }
  function cutSelection() {
    try { document.execCommand('cut'); } catch (_) {}
  }
  function selectAllOf(el) {
    if (!el) return;
    if (el.select) { try { el.select(); return; } catch (_) {} }
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }
  async function pasteInto(target) {
    if (!target) return;
    try {
      var text = await navigator.clipboard.readText();
      if (target.setRangeText) {
        target.focus();
        var start = target.selectionStart || 0;
        var end   = target.selectionEnd || 0;
        target.setRangeText(text, start, end, 'end');
        /* Fire input so Vue/React-style listeners notice. */
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (_) {
      /* Some browsers block clipboard.readText() on file:// or without focus.
         Silently no-op rather than throw an error toast at the user. */
    }
  }

  /* ---------- Build menu for a given event ---------- */
  function buildItems(event) {
    var t = event.target;
    var sel  = (window.getSelection && window.getSelection().toString()) || '';
    var hasSel = !!sel;
    /* Pages can inject context-specific items at the top by defining
       window.appCtxExtraItems(event) → array of item objects. */
    var extraItems = [];
    if (typeof window.appCtxExtraItems === 'function') {
      try { extraItems = window.appCtxExtraItems(event) || []; } catch (_) {}
    }
    var editable = t && (
      (t.matches && t.matches('input, textarea')) ||
      (t.isContentEditable)
    );

    var list = [];

    if (hasSel) {
      list.push({ icon: '📋', label: 'Copy',             sc: 'Ctrl+C', action: copySelection });
      list.push({ icon: '🔍', label: 'Search in Google', action: function () { searchInGoogle(sel); } });
      list.push({ icon: '🤖', label: 'Ask AI',           action: function () { askAi(sel); } });
    }
    if (editable) {
      if (hasSel) list.push({ icon: '✂️', label: 'Cut', sc: 'Ctrl+X', action: cutSelection });
      list.push({ icon: '📥', label: 'Paste',      sc: 'Ctrl+V', action: function () { pasteInto(t); } });
      list.push({ icon: '🔲', label: 'Select all', sc: 'Ctrl+A', action: function () { selectAllOf(t); } });
    } else if (hasSel) {
      list.push({ icon: '🔲', label: 'Select all', sc: 'Ctrl+A', action: function () { selectAllOf(document.body); } });
    }
    if (list.length) list.push({ sep: true });

    /* Navigation — works both inside the shell iframe and standalone. */
    list.push({ section: 'Navigate' });
    list.push({ icon: '✅', label: 'Tracker',    action: function () { navigate('tracker'); } });
    list.push({ icon: '📅', label: 'Routine',    action: function () { navigate('routine'); } });
    list.push({ icon: '📚', label: 'Library',    action: function () { navigate('library'); } });
    list.push({ icon: '🧠', label: 'Flashcards', action: function () { navigate('flashcards'); } });
    list.push({ icon: '🤖', label: 'AI Tutor',   action: function () { navigate('chat'); } });
    list.push({ sep: true });

    list.push({ icon: '🌓', label: 'Toggle theme', action: toggleTheme });
    list.push({ icon: '🔄', label: 'Reload page',  sc: 'F5', action: function () { location.reload(); } });

    if (extraItems.length) {
      list = extraItems.concat(list.length ? [{ sep: true }] : []).concat(list);
    }
    return list;
  }

  /* ---------- Render & position ---------- */
  function renderMenu(list) {
    var menu = getMenu();
    menu.innerHTML = '';
    items = [];
    list.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement('div');
        sep.className = 'app-ctx-sep';
        menu.appendChild(sep);
        return;
      }
      if (item.section) {
        var h = document.createElement('div');
        h.className = 'app-ctx-section';
        h.textContent = item.section;
        menu.appendChild(h);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-ctx-item';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML =
        '<span class="ic">' + (item.icon || '') + '</span>' +
        '<span class="lb"></span>' +
        (item.sc ? '<span class="sc">' + item.sc + '</span>' : '');
      btn.querySelector('.lb').textContent = item.label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        setTimeout(function () { try { item.action(); } catch (_) {} }, 0);
      });
      menu.appendChild(btn);
      items.push(btn);
    });
  }

  function positionAndShow(x, y) {
    var menu = getMenu();
    /* Show invisibly first to measure, then position. */
    menu.style.left = '-9999px';
    menu.style.top  = '-9999px';
    menu.classList.add('open');
    var rect = menu.getBoundingClientRect();
    var vw   = window.innerWidth;
    var vh   = window.innerHeight;
    var nx = x, ny = y;
    if (nx + rect.width  > vw - 6) nx = vw - rect.width  - 6;
    if (ny + rect.height > vh - 6) ny = vh - rect.height - 6;
    if (nx < 6) nx = 6;
    if (ny < 6) ny = 6;
    menu.style.left = nx + 'px';
    menu.style.top  = ny + 'px';
  }

  /* ---------- Event wiring ---------- */
  document.addEventListener('contextmenu', function (e) {
    /* Allow the native menu inside our own menu (none of our items expects it
       but just in case the user wants browser-level on a developer tool, hold
       Shift to bypass — matches Chrome behavior). */
    if (e.shiftKey) return;
    e.preventDefault();
    var list = buildItems(e);
    renderMenu(list);
    positionAndShow(e.clientX, e.clientY);
    focusIx = -1;
  }, false);

  /* Any normal click closes the menu. mousedown (capture) handles clicks
     outside before the click event reaches the underlying element. */
  document.addEventListener('mousedown', function (e) {
    if (menuEl && menuEl.classList.contains('open') && !menuEl.contains(e.target)) {
      closeMenu();
    }
  }, true);
  document.addEventListener('scroll',   closeMenu, true);
  window.addEventListener('blur',       closeMenu);
  window.addEventListener('resize',     closeMenu);

  document.addEventListener('keydown', function (e) {
    if (!menuEl || !menuEl.classList.contains('open')) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      focusIx = ((focusIx + (e.key === 'ArrowDown' ? 1 : -1)) + items.length) % items.length;
      items[focusIx].focus();
    } else if (e.key === 'Enter' && focusIx >= 0) {
      e.preventDefault();
      items[focusIx].click();
    }
  });
})();
