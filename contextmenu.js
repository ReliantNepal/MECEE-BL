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

  /* Coordinates of the most-recent contextmenu event — used by the dictionary
     popup to know where to anchor itself after the menu closes. */
  var _lastCtxX = 0, _lastCtxY = 0;

  /* ===== Dictionary popup ===== */
  var _dictPop = null;

  function _dictEsc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _getDictPop() {
    if (_dictPop) return _dictPop;
    /* Inject spin keyframe once */
    if (!document.getElementById('__app_dict_kf__')) {
      var st = document.createElement('style');
      st.id = '__app_dict_kf__';
      st.textContent = '@keyframes __dictSpin{to{transform:rotate(360deg)}} @keyframes __dictIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(st);
    }
    _dictPop = document.createElement('div');
    _dictPop.id = '__app_dict_pop__';
    _dictPop.setAttribute('role', 'dialog');
    _dictPop.setAttribute('aria-label', 'Dictionary');
    document.body.appendChild(_dictPop);
    /* Close on outside click */
    document.addEventListener('mousedown', function (e) {
      if (_dictPop && _dictPop.style.display !== 'none' && !_dictPop.contains(e.target)) {
        _dictPop.style.display = 'none';
      }
    }, true);
    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _dictPop && _dictPop.style.display !== 'none') {
        _dictPop.style.display = 'none';
      }
    });
    return _dictPop;
  }

  var _DICT_BASE_STYLE = [
    'position:fixed','z-index:100001',
    'min-width:260px','max-width:360px',
    'background:var(--surface,#1a1a1a)','color:var(--text,#f5f5f5)',
    'border:1px solid var(--border,#333)','border-radius:12px',
    'box-shadow:0 16px 48px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.2)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'animation:__dictIn .13s ease-out'
  ].join(';');

  function _placeDictPop(x, y) {
    var pop = _dictPop;
    /* measure then position */
    pop.style.left = '-9999px'; pop.style.top = '-9999px';
    pop.style.display = 'block';
    requestAnimationFrame(function () {
      var r  = pop.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var nx = x, ny = y + 14;
      if (nx + r.width  > vw - 8) nx = vw - r.width  - 8;
      if (ny + r.height > vh - 8) ny = y - r.height  - 6;
      if (nx < 8) nx = 8;
      if (ny < 8) ny = 8;
      pop.style.left = nx + 'px';
      pop.style.top  = ny + 'px';
    });
  }

  /* word      — the looked-up word/phrase
     data      — raw dictionaryapi.dev response array (or null)
     x, y      — anchor coordinates
     origText  — the original full selection (passed to add-to-card)  */
  function _showDictPop(word, data, x, y, origText) {
    var pop = _getDictPop();
    var canAdd = typeof window.flashcardIsStudying === 'function' && window.flashcardIsStudying();

    /* Header — word · phonetic · [+ Add] · [✕] */
    var hdr = '<div style="display:flex;align-items:center;gap:8px;padding:11px 14px 8px;border-bottom:1px solid var(--border,#333)">'
      + '<span style="font-weight:700;font-size:16px">' + _dictEsc(word) + '</span>';
    if (data && data[0] && data[0].phonetic) {
      hdr += '<span style="color:var(--muted,#888);font-size:12px;flex-shrink:0">' + _dictEsc(data[0].phonetic) + '</span>';
    }
    hdr += '<span style="flex:1"></span>';
    if (canAdd) {
      hdr += '<button id="__dict_add__" style="'
        + 'display:inline-flex;align-items:center;gap:5px;flex-shrink:0;'
        + 'padding:4px 11px;border-radius:999px;border:1px solid var(--border,#333);'
        + 'background:var(--surface-2,#232323);color:var(--text,#f5f5f5);'
        + 'font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;'
        + 'transition:transform .15s,box-shadow .15s,background .15s;'
        + 'letter-spacing:.3px;'
        + '" onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.35)\';this.style.background=\'var(--surface-3,#2c2c2c)\'"'
        + ' onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'\';this.style.background=\'var(--surface-2,#232323)\'"'
        + '>＋ Add</button>';
    }
    hdr += '<button id="__dict_cls__" style="margin-left:4px;background:none;border:none;cursor:pointer;color:var(--muted,#888);font-size:18px;line-height:1;padding:0 4px;flex-shrink:0" title="Close">✕</button></div>';

    /* Definitions body */
    var body = '<div style="padding:10px 14px 12px;max-height:260px;overflow-y:auto">';
    if (!data || !data[0] || !Array.isArray(data[0].meanings) || !data[0].meanings.length) {
      body += '<p style="margin:0;color:var(--muted,#888);font-size:13px">No definition found for <em>' + _dictEsc(word) + '</em>.</p>';
    } else {
      data[0].meanings.slice(0, 3).forEach(function (m) {
        body += '<div style="margin-bottom:10px">'
          + '<span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:var(--muted,#888)">' + _dictEsc(m.partOfSpeech || '') + '</span>'
          + '<ol style="margin:4px 0 0;padding-left:18px">';
        (m.definitions || []).slice(0, 2).forEach(function (d) {
          body += '<li style="margin-bottom:5px;font-size:13px;line-height:1.45">' + _dictEsc(d.definition || '');
          if (d.example) {
            body += '<div style="margin-top:3px;font-size:12px;font-style:italic;color:var(--muted,#888)">&ldquo;' + _dictEsc(d.example) + '&rdquo;</div>';
          }
          body += '</li>';
        });
        body += '</ol></div>';
      });
    }
    body += '</div>';

    pop.innerHTML = hdr + body;
    pop.style.cssText = _DICT_BASE_STYLE + ';user-select:text';

    pop.querySelector('#__dict_cls__').addEventListener('click', function () {
      pop.style.display = 'none';
    });

    if (canAdd) {
      var addBtn = pop.querySelector('#__dict_add__');
      /* Capture values now — closure over current word/origText/data */
      var _w = word, _o = origText || word, _d = data;
      addBtn.addEventListener('click', function () {
        var handled = window.flashcardDictionaryAddToCard(_w, _o, _d);
        if (handled) {
          pop.style.display = 'none';
        } else {
          addBtn.textContent = '⚠ Open a flashcard first';
          addBtn.style.background = 'var(--surface-3,#333)';
          addBtn.style.color = 'var(--muted,#888)';
          addBtn.disabled = true;
        }
      });
    }

    _placeDictPop(x, y);
  }

  function _showDictLoading(word, x, y) {
    var pop = _getDictPop();
    pop.innerHTML = '<div style="padding:14px 16px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted,#888)">'
      + '<span style="display:inline-block;animation:__dictSpin 1s linear infinite">⟳</span>'
      + ' Looking up <strong style="color:var(--text,#f5f5f5)">' + _dictEsc(word) + '</strong>…</div>';
    pop.style.cssText = _DICT_BASE_STYLE;
    pop.style.display = 'block';
    var vw = window.innerWidth, vh = window.innerHeight;
    var nx = Math.min(x, vw - 228 - 8);
    var ny = y + 14;
    if (nx < 8) nx = 8;
    if (ny > vh - 60) ny = y - 50;
    pop.style.left = nx + 'px';
    pop.style.top  = ny + 'px';
  }

  async function _lookupDictionary(text, x, y) {
    var word = text.trim();
    if (!word) return;
    var lookupWord = word;

    _showDictLoading(word.split(' ')[0], x, y);

    try {
      var resp = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(lookupWord));
      var data = null;
      if (resp.ok) {
        data = await resp.json();
      } else if (lookupWord.indexOf(' ') !== -1) {
        /* Multi-word phrase not found — fall back to first word */
        var fw = lookupWord.split(' ')[0];
        var r2 = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(fw));
        if (r2.ok) { data = await r2.json(); lookupWord = fw; }
      }
      _showDictPop(lookupWord, data, x, y, word);
    } catch (_e) {
      _showDictPop(word.split(' ')[0], null, x, y, word);
    }
  }
  /* ===== End dictionary popup ===== */

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
      list.push({ icon: '📖', label: 'Dictionary',       action: (function (s, cx, cy) { return function () { _lookupDictionary(s, cx, cy); }; })(sel, _lastCtxX, _lastCtxY) });
    }
    if (editable) {
      if (hasSel) list.push({ icon: '✂️', label: 'Cut', sc: 'Ctrl+X', action: cutSelection });
      list.push({ icon: '📥', label: 'Paste',      sc: 'Ctrl+V', action: function () { pasteInto(t); } });
      list.push({ icon: '🔲', label: 'Select all', sc: 'Ctrl+A', action: function () { selectAllOf(t); } });
    } else if (hasSel) {
      list.push({ icon: '🔲', label: 'Select all', sc: 'Ctrl+A', action: function () { selectAllOf(document.body); } });
    }
    /* When text is selected, only show text-action items — no nav clutter. */
    if (!hasSel) {
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
    }

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
    _lastCtxX = e.clientX;
    _lastCtxY = e.clientY;
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
