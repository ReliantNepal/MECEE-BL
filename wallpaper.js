/* wallpaper.js — Shared theme / wallpaper picker.
   Loaded by every sub-page. Wires up a ⚙️ button (id="wallpaperBtn" or
   id="settingsBtn") to a popup that lets the user choose from 8 visual
   themes. Saves to localStorage (mecee_keys.js storage-event handler
   propagates the change to all other warm iframes automatically). */

(function () {
  if (window.__meceeWallpaperLoaded) return;
  window.__meceeWallpaperLoaded = true;

  const THEMES = [
    { id: 'dark',     label: 'Dark',     icon: '🌙', bg: '#0e0e0e', surface: '#1a1a1a', text: '#f5f5f5', accent: '#9333ea' },
    { id: 'light',    label: 'Light',    icon: '☀️',  bg: '#f0f0f0', surface: '#ffffff', text: '#111111', accent: '#7c3aed' },
    { id: 'midnight', label: 'Midnight', icon: '🌌', bg: '#070d1a', surface: '#0f1929', text: '#dce8f5', accent: '#4d9de0' },
    { id: 'forest',   label: 'Forest',   icon: '🌲', bg: '#060f08', surface: '#0e1c11', text: '#d4f0db', accent: '#3db85c' },
    { id: 'sunset',   label: 'Sunset',   icon: '🌅', bg: '#150800', surface: '#231200', text: '#fde8c8', accent: '#f97316' },
    { id: 'ocean',    label: 'Ocean',    icon: '🌊', bg: '#020c18', surface: '#081829', text: '#d4eeff', accent: '#06b6d4' },
    { id: 'rose',     label: 'Rose',     icon: '🌸', bg: '#0d0409', surface: '#1c0c18', text: '#fce7f3', accent: '#ec4899' },
    { id: 'coffee',   label: 'Coffee',   icon: '☕', bg: '#0e0905', surface: '#1e1308', text: '#f5e6cc', accent: '#b45309' },
  ];

  function themeKey() {
    return window.MeceeKeys ? window.MeceeKeys.THEME : 'mecee_theme';
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(themeKey(), id); } catch (_) {}
    refreshPickerActive(id);
    refreshBtnTitle(id);
    window.dispatchEvent(new CustomEvent('mecee:themeChange', { detail: id }));
  }

  function refreshBtnTitle(id) {
    var t = THEMES.find(function (t) { return t.id === id; });
    var label = t ? (t.icon + ' ' + t.label) : '⚙️';
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
      '<div class="wp-card" role="dialog" aria-modal="true" aria-labelledby="wpTitle">' +
        '<div class="wp-head">' +
          '<div>' +
            '<div class="wp-title" id="wpTitle">🎨 Wallpaper</div>' +
            '<div class="wp-sub">Choose a theme — applied to all pages</div>' +
          '</div>' +
          '<button type="button" class="wp-close" id="wpClose" title="Close">×</button>' +
        '</div>' +
        '<div class="wp-grid" id="wpGrid"></div>' +
      '</div>';
    document.body.appendChild(modal);

    var grid = document.getElementById('wpGrid');
    var cur = currentTheme();

    THEMES.forEach(function (t) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'wp-tile' + (t.id === cur ? ' wp-tile--active' : '');
      tile.dataset.theme = t.id;
      tile.title = t.icon + ' ' + t.label;
      tile.style.setProperty('--wp-accent', t.accent);
      tile.innerHTML =
        '<div class="wp-preview" style="background:linear-gradient(145deg,' + t.bg + ' 0%,' + t.surface + ' 100%)">' +
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

    document.getElementById('wpClose').addEventListener('click', closePicker);
    document.getElementById('wpBackdrop').addEventListener('click', closePicker);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePicker();
    });
  }

  function openPicker() {
    buildPicker();
    refreshPickerActive(currentTheme());
    var modal = document.getElementById('wallpaperModal');
    if (modal) modal.classList.add('wp-modal--open');
  }

  function closePicker() {
    var modal = document.getElementById('wallpaperModal');
    if (modal) modal.classList.remove('wp-modal--open');
  }

  /* ── React to theme changes made by other pages ───────────────── */
  window.addEventListener('mecee:themeChange', function (e) {
    refreshBtnTitle(e.detail);
    refreshPickerActive(e.detail);
  });

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    var saved = localStorage.getItem(themeKey());
    if (saved) document.documentElement.setAttribute('data-theme', saved);

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
