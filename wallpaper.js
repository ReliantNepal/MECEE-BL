/* wallpaper.js — Shared theme / wallpaper picker.
   Loaded by every sub-page. Wires up a ⚙️ button (id="wallpaperBtn" or
   id="settingsBtn") to a popup that lets the user choose from visual
   themes. Saves to localStorage (mecee_keys.js storage-event handler
   propagates the change to all other warm iframes automatically). */

(function () {
  if (window.__meceeWallpaperLoaded) return;
  window.__meceeWallpaperLoaded = true;

  var THEMES = [
    { id: 'dark',     label: 'Dark',     icon: '🌙', bg: '#0e0e0e', surface: '#1a1a1a', text: '#f5f5f5', accent: '#9333ea' },
    { id: 'light',    label: 'Light',    icon: '☀️',  bg: '#f0f0f0', surface: '#ffffff', text: '#111111', accent: '#7c3aed' },
    { id: 'midnight', label: 'Midnight', icon: '🌌', bg: '#070d1a', surface: '#0f1929', text: '#dce8f5', accent: '#4d9de0' },
    { id: 'forest',   label: 'Forest',   icon: '🌲', bg: '#060f08', surface: '#0e1c11', text: '#d4f0db', accent: '#3db85c' },
    { id: 'sunset',   label: 'Sunset',   icon: '🌅', bg: '#150800', surface: '#231200', text: '#fde8c8', accent: '#f97316' },
    { id: 'ocean',    label: 'Ocean',    icon: '🌊', bg: '#020c18', surface: '#081829', text: '#d4eeff', accent: '#06b6d4' },
    { id: 'rose',     label: 'Rose',     icon: '🌸', bg: '#0d0409', surface: '#1c0c18', text: '#fce7f3', accent: '#ec4899' },
    { id: 'coffee',   label: 'Coffee',   icon: '☕', bg: '#0e0905', surface: '#1e1308', text: '#f5e6cc', accent: '#b45309' },
  ];

  /* ── Ambient glow layer ──────────────────────────────────────────
     Each colour theme gets a quiet, slow-drifting field of soft blurred
     "glow" blobs tinted with its own accent palette — the same restrained
     ambiance used in modern editor/app UIs (soft light pooling in the
     corners of the viewport). Midnight additionally gets a faint pinpoint
     starfield, and Coffee a barely-there grain texture, since those read
     naturally for their respective moods. Nothing here is figurative —
     it's pure light and colour, so it stays out of the way of content and
     never looks like decoration glued onto a page.
     The layer is inserted as the first child of <body> so all page
     content (painted later in tree order) sits naturally on top. */
  var AMBIENT = {
    midnight: {
      blobs: [
        { left: '10%', top: '14%', size: 420, color: 'rgba(91,141,239,0.16)',  duration: 46, delay: 0  },
        { left: '82%', top: '60%', size: 480, color: 'rgba(124,160,242,0.10)', duration: 54, delay: -16 },
        { left: '46%', top: '92%', size: 360, color: 'rgba(70,110,200,0.12)',  duration: 50, delay: -28 }
      ],
      stars: true
    },
    forest: {
      blobs: [
        { left: '14%', top: '18%', size: 440, color: 'rgba(79,157,110,0.14)',  duration: 48, delay: 0  },
        { left: '80%', top: '64%', size: 400, color: 'rgba(126,194,152,0.10)', duration: 56, delay: -18 },
        { left: '44%', top: '94%', size: 340, color: 'rgba(60,130,90,0.12)',   duration: 52, delay: -30 }
      ]
    },
    sunset: {
      blobs: [
        { left: '18%', top: '72%', size: 480, color: 'rgba(217,122,63,0.16)',  duration: 50, delay: 0  },
        { left: '76%', top: '22%', size: 400, color: 'rgba(228,165,113,0.10)', duration: 58, delay: -20 },
        { left: '50%', top: '98%', size: 360, color: 'rgba(180,90,50,0.12)',   duration: 54, delay: -34 }
      ]
    },
    ocean: {
      blobs: [
        { left: '16%', top: '24%', size: 440, color: 'rgba(47,155,176,0.14)',  duration: 48, delay: 0  },
        { left: '84%', top: '70%', size: 480, color: 'rgba(108,190,209,0.10)', duration: 58, delay: -22 },
        { left: '48%', top: '96%', size: 340, color: 'rgba(30,110,140,0.12)',  duration: 52, delay: -32 }
      ]
    },
    rose: {
      blobs: [
        { left: '14%', top: '20%', size: 420, color: 'rgba(194,84,138,0.14)',  duration: 48, delay: 0  },
        { left: '82%', top: '66%', size: 460, color: 'rgba(214,139,174,0.10)', duration: 56, delay: -18 },
        { left: '50%', top: '94%', size: 340, color: 'rgba(150,60,110,0.12)',  duration: 52, delay: -30 }
      ]
    },
    coffee: {
      blobs: [
        { left: '18%', top: '76%', size: 460, color: 'rgba(168,116,63,0.14)',  duration: 50, delay: 0  },
        { left: '80%', top: '20%', size: 400, color: 'rgba(205,161,115,0.09)', duration: 58, delay: -20 },
        { left: '48%', top: '98%', size: 340, color: 'rgba(120,80,40,0.12)',   duration: 54, delay: -34 }
      ],
      grain: true
    }
  };

  function updateEmojiLayer(id) {
    var existing = document.getElementById('mecee-ambient-bg');
    var config = AMBIENT[id];
    if (!config) {
      if (existing) existing.remove();
      return;
    }
    var layer = existing || document.createElement('div');
    layer.id = 'mecee-ambient-bg';
    var html = config.blobs.map(function (b) {
      return '<span class="glow" style="' +
        'left:'               + b.left + ';' +
        'top:'                + b.top + ';' +
        'width:'              + b.size + 'px;' +
        'height:'             + b.size + 'px;' +
        'background:radial-gradient(circle, ' + b.color + ' 0%, transparent 70%);' +
        'animation-duration:' + b.duration + 's;' +
        'animation-delay:'    + b.delay + 's' +
      '"></span>';
    }).join('');
    if (config.stars) html += '<span class="stars"></span>';
    if (config.grain) html += '<span class="grain"></span>';
    layer.innerHTML = html;
    if (!existing) {
      /* Insert before first child so all page content paints on top */
      document.body.insertBefore(layer, document.body.firstChild);
    }
  }

  function themeKey() {
    return window.MeceeKeys ? window.MeceeKeys.THEME : 'mecee_theme';
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(themeKey(), id); } catch (_) {}
    updateEmojiLayer(id);
    refreshPickerActive(id);
    refreshBtnTitle(id);
    window.dispatchEvent(new CustomEvent('mecee:themeChange', { detail: id }));
  }

  /* ── Circular reveal on theme change ─────────────────────────────
     Grows a solid disc — filled with the *incoming* theme's background
     colour — out from the point the user clicked until it covers the
     farthest corner of the screen, then swaps the theme underneath
     (invisibly, since the disc already matches) and lifts away. A
     plain fixed overlay animated with the standard Web Animations API
     (clip-path + Element.animate) — no experimental browser API
     dependency, so it works the same everywhere. (We tried the View
     Transitions API first, but animating its pseudo-elements is still
     version-gated across browsers and produced no visible effect on
     several setups — this overlay approach is what actually renders.)
     Falls back to an instant switch when the user prefers reduced
     motion — no loss of function, just no flourish. */
  function applyThemeAnimated(id, originX, originY) {
    if (id === currentTheme()) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var target = THEMES.find(function (t) { return t.id === id; });
    if (reduced || !target || typeof Element === 'undefined' || !Element.prototype.animate) {
      applyTheme(id);
      return;
    }

    var x = (typeof originX === 'number') ? originX : window.innerWidth / 2;
    var y = (typeof originY === 'number') ? originY : window.innerHeight / 2;
    var endRadius = Math.ceil(Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )) + 4; // +4px so the disc's edge fully clears the corner, no seam

    /* Animating clip-path forces the browser to repaint the entire
       full-viewport overlay on every frame — that's what made the grow
       feel laggy/janky. Scaling a small circular div is compositor-only
       (transform), so the GPU handles it with no repaint per frame —
       buttery smooth even on weaker machines. The div is sized to its
       final on-screen diameter and grown from scale(0) to scale(1),
       centred on the click point via a negative margin offset. */
    var d = endRadius * 2;
    var overlay = document.createElement('div');
    overlay.className = 'mecee-theme-ripple';
    overlay.style.background = target.bg;
    overlay.style.width = d + 'px';
    overlay.style.height = d + 'px';
    overlay.style.left = (x - endRadius) + 'px';
    overlay.style.top = (y - endRadius) + 'px';
    overlay.style.borderRadius = '50%';
    overlay.style.transform = 'scale(0)';
    overlay.style.transformOrigin = 'center';
    document.body.appendChild(overlay);

    var grow = overlay.animate(
      [
        { transform: 'scale(0)' },
        { transform: 'scale(1)' }
      ],
      { duration: 600, easing: 'cubic-bezier(.22,.61,.16,1)', fill: 'forwards' }
    );

    grow.onfinish = function () {
      /* The disc now fully covers the viewport in the new theme's bg
         colour — swap the real theme underneath while it's hidden, then
         fade the disc out. Two rAFs ensure the new theme has actually
         painted before we start revealing it. */
      applyTheme(id);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var fade = overlay.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: 220, easing: 'ease-out', fill: 'forwards' }
          );
          fade.onfinish = function () { overlay.remove(); };
        });
      });
    };
  }

  function refreshBtnTitle(id) {
    var t = THEMES.find(function (t) { return t.id === id; });
    var label = t ? (t.icon + ' ' + t.label) : '⚙️';
    ['wallpaperBtn', 'settingsBtn'].forEach(function (bid) {
      var btn = document.getElementById(bid);
      if (btn) btn.title = label;
    });
  }

  function refreshPickerActive(id) {
    document.querySelectorAll('.wp-tile').forEach(function (tile) {
      tile.classList.toggle('wp-tile--active', tile.dataset.theme === id);
    });
  }

  /* ── Build the picker modal once ─────────────────────────────── */
  function buildPicker() {
    if (document.getElementById('wallpaperModal')) return;

    var modal = document.createElement('div');
    modal.id = 'wallpaperModal';
    modal.className = 'wp-modal';
    modal.innerHTML =
      '<div class="wp-backdrop" id="wpBackdrop"></div>' +
      '<div class="wp-card" role="dialog" aria-modal="true" aria-labelledby="wpModalTitle">' +
        '<div class="wp-head">' +
          '<div>' +
            '<div class="wp-title" id="wpModalTitle">⚙️ Settings</div>' +
            '<div class="wp-sub">Theme &amp; API key</div>' +
          '</div>' +
          '<button type="button" class="wp-close" id="wpModalClose" title="Close">×</button>' +
        '</div>' +
        '<div class="wp-grid" id="wpModalGrid"></div>' +
        '<div class="wp-apikey-section">' +
          '<div class="wp-apikey-label">🔑 ChatGPT / OpenAI API Key</div>' +
          '<div class="wp-apikey-row">' +
            /* Not type="password": this modal is injected on every page, and
               Chrome/Edge use the mere presence of a password-type field as
               the signal "this page is a login form" — once that fires, they
               offer (and sometimes auto-populate) the user's saved MECEE
               login password into it, and can sweep nearby text fields (e.g.
               a page's search bar) into the same suggestion. No
               `autocomplete` value reliably opts a password-type field out
               of this. A plain text input masked with -webkit-text-security
               (see .wp-apikey-input in theme.css) keeps the on-screen dot
               masking while staying off the password manager's radar
               entirely — and since this is the last password-type field in
               the app outside login.html, removing it stops the heuristic
               from firing anywhere else too. */
            '<input type="text" class="wp-apikey-input mecee-masked-input" id="wpApiKeyInput" placeholder="sk-proj-…" autocomplete="off" name="mecee-wallpaper-key" spellcheck="false" />' +
            '<button type="button" class="wp-apikey-save" id="wpApiKeySave">Save</button>' +
          '</div>' +
          '<div class="wp-apikey-status info" id="wpApiKeyStatus">Loading…</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    /* Use modal.querySelector to avoid ID conflicts with pages that have
       their own elements using similar IDs (e.g. flashcards deck picker) */
    var grid      = modal.querySelector('#wpModalGrid');
    var closeBtn  = modal.querySelector('#wpModalClose');
    var backdrop  = modal.querySelector('#wpBackdrop');
    var cur = currentTheme();

    THEMES.forEach(function (t) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'wp-tile' + (t.id === cur ? ' wp-tile--active' : '');
      tile.dataset.theme = t.id;
      tile.title = t.icon + ' ' + t.label;
      tile.style.setProperty('--wp-accent', t.accent);

      /* Show emoji previews on tiles that have an ambient layer */
      var TILE_PREVIEWS = {
        forest:   '🌲🍃🦋',
        coffee:   '☕📚🫘',
        midnight: '✨🌙⭐',
        sunset:   '🌅☀️🌺',
        ocean:    '🌊🐠🐚',
        rose:     '🌸🌹💐'
      };
      var emojiPreview = TILE_PREVIEWS[t.id]
        ? '<div class="wp-preview-emojis">' + TILE_PREVIEWS[t.id] + '</div>'
        : '';

      tile.innerHTML =
        '<div class="wp-preview" style="background:linear-gradient(145deg,' + t.bg + ' 0%,' + t.surface + ' 100%)">' +
          emojiPreview +
          '<div class="wp-preview-card" style="background:' + t.surface + ';border:1px solid ' + t.accent + '22">' +
            '<div class="wp-preview-row">' +
              '<div class="wp-preview-bar" style="background:' + t.text + ';width:52%"></div>' +
              '<div class="wp-preview-btn" style="background:' + t.accent + '"></div>' +
            '</div>' +
            '<div class="wp-preview-row">' +
              '<div class="wp-preview-bar" style="background:' + t.text + ';width:34%;opacity:.4"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="wp-tile-label">' + t.icon + ' ' + t.label + '<i class="wp-tile-check">✓</i></div>';
      tile.addEventListener('click', function (e) {
        /* Capture the click point before the modal closes (and the tile
           potentially moves/unmounts) so the reveal originates from
           exactly where the user tapped. */
        var ox = e.clientX, oy = e.clientY;
        closePicker();
        applyThemeAnimated(t.id, ox, oy);
      });
      grid.appendChild(tile);
    });

    closeBtn.addEventListener('click', closePicker);
    backdrop.addEventListener('click', closePicker);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePicker();
    });

    /* ── API key section ── */
    var apiInput  = modal.querySelector('#wpApiKeyInput');
    var apiSave   = modal.querySelector('#wpApiKeySave');
    var apiStatus = modal.querySelector('#wpApiKeyStatus');

    function setApiStatus(msg, cls) {
      apiStatus.textContent = msg;
      apiStatus.className = 'wp-apikey-status ' + (cls || 'info');
    }

    function loadCurrentKey() {
      setApiStatus('Checking…', 'info');
      fetch('/api/openai-key', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : { enabled: false }; })
        .then(function (j) {
          if (j.enabled && j.key) {
            var masked = j.key.slice(0, 8) + '••••••••••••••••' + j.key.slice(-4);
            setApiStatus('✓ Key saved: ' + masked, 'ok');
          } else {
            setApiStatus('No key saved yet — paste yours above.', 'info');
          }
        })
        .catch(function () { setApiStatus('Launcher not reachable — key stored locally only.', 'info'); });
    }

    /* Show/hide the actual value while typing */
    apiInput.addEventListener('focus', function () { apiInput.type = 'text'; });
    apiInput.addEventListener('blur',  function () { if (!apiInput.value) apiInput.type = 'password'; });

    apiSave.addEventListener('click', function () {
      var key = apiInput.value.trim();
      if (!key) { setApiStatus('Paste your API key first.', 'err'); return; }
      if (!key.startsWith('sk-')) { setApiStatus('Key must start with sk-', 'err'); return; }
      apiSave.disabled = true;
      setApiStatus('Saving…', 'info');
      /* Save to server file (persists across refreshes) */
      fetch('/api/set-openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.ok) {
            /* Also mirror to localStorage so any tab picks it up immediately */
            try {
              var lsKey = window.MeceeKeys ? window.MeceeKeys.CHAT_API : 'mecee_chat_api_key';
              localStorage.setItem(lsKey, key);
            } catch (_) {}
            apiInput.value = '';
            apiInput.type  = 'password';
            setApiStatus('✓ Key saved successfully!', 'ok');
            loadCurrentKey();
          } else {
            setApiStatus('Error: ' + (j.error || 'unknown'), 'err');
          }
        })
        .catch(function () {
          /* Server unreachable — save to localStorage only */
          try {
            var lsKey = window.MeceeKeys ? window.MeceeKeys.CHAT_API : 'mecee_chat_api_key';
            localStorage.setItem(lsKey, key);
          } catch (_) {}
          apiInput.value = '';
          apiInput.type  = 'password';
          setApiStatus('✓ Saved locally (launcher not reachable — key works until refresh).', 'ok');
        })
        .finally(function () { apiSave.disabled = false; });
    });

    /* Allow Enter key in the input to trigger save */
    apiInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') apiSave.click();
    });

    /* Expose so openPicker() can refresh status on every open */
    modal.__loadCurrentKey = loadCurrentKey;
  }

  function openPicker() {
    buildPicker();
    refreshPickerActive(currentTheme());
    var modal = document.getElementById('wallpaperModal');
    if (!modal) return;
    modal.classList.add('wp-modal--open');
    /* Refresh key status each time the modal opens */
    if (modal.__loadCurrentKey) modal.__loadCurrentKey();
  }

  function closePicker() {
    var modal = document.getElementById('wallpaperModal');
    if (modal) modal.classList.remove('wp-modal--open');
  }

  /* ── React to theme changes made by other pages ───────────────── */
  window.addEventListener('mecee:themeChange', function (e) {
    updateEmojiLayer(e.detail);
    refreshBtnTitle(e.detail);
    refreshPickerActive(e.detail);
  });

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    var saved = localStorage.getItem(themeKey());
    if (saved) document.documentElement.setAttribute('data-theme', saved);

    updateEmojiLayer(currentTheme());
    refreshBtnTitle(currentTheme());

    ['wallpaperBtn', 'settingsBtn'].forEach(function (bid) {
      var btn = document.getElementById(bid);
      if (btn) btn.addEventListener('click', openPicker);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
