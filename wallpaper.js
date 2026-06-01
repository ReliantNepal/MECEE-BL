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

  /* ── Emoji ambient layer ─────────────────────────────────────────
     Forest and Coffee themes get a subtle floating emoji background.
     The layer is inserted as the first child of <body> so all page
     content (painted later in tree order) sits naturally on top. */
  var EMOJI_LAYER = {
    forest: {
      emojis: ['🌲','🌿','🍃','🦋','🍄','🌱','🦉','🌲','🌿','🍃','🦋','🍄','🌲','🌱','🦉','🌿','🌲','🍃','🦋','🌱'],
      opacity: 0.10
    },
    coffee: {
      emojis: ['☕','📚','🫘','🍵','✏️','📖','🌙','☕','🫘','📚','🍵','✏️','☕','📖','🌙','🫘','☕','📚','🍵','✏️'],
      opacity: 0.10
    },
    midnight: {
      emojis: ['✨','⭐','🌙','🌟','💫','🌠','🔭','✨','⭐','🌙','🌟','💫','✨','🌠','🔭','⭐','✨','🌙','💫','🌟'],
      opacity: 0.12
    },
    sunset: {
      emojis: ['🌅','☀️','🌤️','🌺','🌻','🦅','🌇','🌅','☀️','🌤️','🌺','🌻','🌅','🦅','🌇','☀️','🌅','🌺','🌤️','🌻'],
      opacity: 0.10
    },
    ocean: {
      emojis: ['🌊','🐚','🐠','🦈','🐬','🐋','⚓','🌊','🐚','🐠','🦈','🐬','🌊','⚓','🐋','🐚','🌊','🐠','🐬','🦈'],
      opacity: 0.10
    },
    rose: {
      emojis: ['🌸','🌹','🌺','💐','🦋','🌷','💕','🌸','🌹','🌺','💐','🦋','🌸','🌷','💕','🌹','🌸','🌺','🦋','💐'],
      opacity: 0.10
    }
  };

  /* [left%, top%, fontSize_em, animDelay_s, animDuration_s] */
  var EMOJI_POSITIONS = [
    [8,  10, 1.8, 0,  20],
    [22, 70, 1.4, 3,  18],
    [40, 30, 2.0, 7,  24],
    [60, 80, 1.6, 1,  22],
    [80, 15, 1.4, 5,  16],
    [93, 60, 2.2, 9,  26],
    [15, 90, 1.6, 12, 20],
    [50, 55, 1.2, 4,  18],
    [72, 35, 1.8, 8,  22],
    [30, 20, 1.4, 6,  24],
    [88, 88, 2.0, 2,  20],
    [4,  45, 1.6, 11, 26],
    [45, 75, 1.4, 14, 18],
    [68, 10, 2.2, 3,  22],
    [25, 50, 1.8, 7,  20],
    [55, 25, 1.2, 10, 24],
    [82, 70, 1.6, 5,  18],
    [10, 65, 2.0, 13, 26],
    [75, 48, 1.4, 1,  20],
    [38, 92, 1.8, 8,  22]
  ];

  function updateEmojiLayer(id) {
    var existing = document.getElementById('mecee-emoji-bg');
    var config = EMOJI_LAYER[id];
    if (!config) {
      if (existing) existing.remove();
      return;
    }
    var layer = existing || document.createElement('div');
    layer.id = 'mecee-emoji-bg';
    layer.innerHTML = EMOJI_POSITIONS.map(function (pos, i) {
      var emoji = config.emojis[i % config.emojis.length];
      return '<span class="em" style="' +
        'left:'              + pos[0] + '%;' +
        'top:'               + pos[1] + '%;' +
        'font-size:'         + pos[2] + 'em;' +
        'animation-duration:'+ pos[4] + 's;' +
        'animation-delay:-'  + pos[3] + 's;' +
        'opacity:'           + config.opacity +
      '">' + emoji + '</span>';
    }).join('');
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
            '<input type="password" class="wp-apikey-input" id="wpApiKeyInput" placeholder="sk-proj-…" autocomplete="off" spellcheck="false" />' +
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
      tile.addEventListener('click', function () {
        applyTheme(t.id);
        closePicker();
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
