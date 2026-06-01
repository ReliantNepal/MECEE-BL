/* MECEE-BL shared key registry — single source of truth.
   ---------------------------------------------------------------------------
   localStorage key strings used to live as inline `const KEY_X = "mecee_x"`
   declarations scattered across every page and helper script. Renaming a key
   meant chasing every duplicate by grep; missing one would silently break
   sync or persistence. This file collects every key that crosses file
   boundaries so there is exactly one place to edit.

   Per-page-only keys (achievements, flashcard session, notes pages, music
   player state) are intentionally NOT in here — they live in the one file
   that owns them. Only put a key here if more than one file uses it.

   Loaded as the first non-defer script in every HTML page, so it is
   guaranteed to be present when inline <script> blocks run during parse. */

(function () {
  /* Don't redefine on hot-reload or repeated injections. */
  if (window.MeceeKeys) return;

  window.MeceeKeys = Object.freeze({
    /* --- Synced data (every change here must also be reflected in the
       Python `CATEGORIES` set in mecee_sync.py — those are the routes the
       launcher actually accepts). --- */
    PROGRESS:    'mecee_progress_v1',   // tracker chapter completion
    FLASHCARDS:  'mecee_flashcards_v1', // flashcard decks + cards
    CHATS:       'mecee_chats',         // AI tutor chat history
    BOOKMARKS:   'mecee_bookmarks_v1',  // PDF reader bookmarks (library)
    HIGHLIGHTS:  'mecee_highlights_v1', // PDF reader highlights (library)

    /* --- Cross-page UI / config (not synced; just shared between pages so
       toggles like theme stay consistent across the shell and iframes). --- */
    THEME:        'mecee_theme',
    CHAT_API:     'mecee_api_key',
    CHAT_MODEL:   'mecee_model',
    CHAT_PROMPT:  'mecee_sys_prompt',
    CHAT_ACTIVE:  'mecee_active_chat',

    /* Flashcard generation mode: 'local' (browser → OpenAI directly) or
       'cloud' (browser → Worker → OpenAI, deck merged into R2 sync state). */
    FLASHCARD_AI_MODE: 'mecee_flashcard_ai_mode',

    /* --- Local cache of user-uploaded books (used as fallback when the
       launcher isn't running). Stores the same JSON that /api/library returns
       so the shelf still populates even without the server. --- */
    USER_LIBRARY: 'mecee_user_library',

    /* --- Custom thumbnails for library books/notes (data URLs keyed by
       book id or file path). Stored locally only — not synced. --- */
    THUMBNAILS: 'mecee_thumbnails_v1',

    /* --- Sync system internals. --- */
    SYNC_META_PREFIX: 'mecee_sync_meta_', // append <category>
    SYNC_STATUS:      'mecee_sync_last',

    /* --- Sync category list. Mirrored in mecee_sync.py CATEGORIES — keep
       both in lockstep when adding/removing categories. The Python set
       gates the URL paths; this list drives the in-app sync UI plan. --- */
    SYNC_CATEGORIES: Object.freeze([
      'tracker',
      'flashcards',
      'chats',
      'library_bookmarks',
      'library',
      'chat_settings',    // API key + model + prompt — synced so the user
                          // doesn't have to re-enter their OpenAI key on
                          // every device.
      // 'library_highlights' — server-side route exists, UI plan does not
      //                       use it yet. Add here when the UI catches up.
    ]),
  });

  /* ===== Cross-iframe theme sync =====
     The shell keeps all sub-pages mounted as warm iframes (see index.html
     showTab/spawnTab). Each page reads localStorage[THEME] on load, so the
     initial value is consistent — but when the user toggles theme on one
     page, the OTHER warm iframes don't react. They keep their stale
     data-theme attribute and their theme button text gets out of sync.

     Fix: listen for the browser's `storage` event, which fires in every
     same-origin document EXCEPT the one that wrote the change. So when
     iframe A flips theme, iframes B/C/D get the event automatically.
     We update data-theme + best-effort update the visible toggle button. */
  window.addEventListener('storage', function (e) {
    if (e.key !== window.MeceeKeys.THEME || !e.newValue) return;
    document.documentElement.setAttribute('data-theme', e.newValue);

    /* Best-effort update of the page's theme button. Tracker/Routine use
       "☀️ Light"/"🌙 Dark"; Chat uses bare emoji. We detect which format
       the existing label uses (by looking for the word "light" or "dark")
       and keep that style. */
    var btn = document.getElementById('themeToggle');
    if (btn) {
      var hasWord = /light|dark/i.test(btn.textContent || '');
      btn.textContent = e.newValue === 'dark'
        ? (hasWord ? '☀️ Light' : '☀️')
        : (hasWord ? '🌙 Dark'  : '🌙');
    }

    /* Custom event for pages that want to do more on theme change
       (e.g. re-render a canvas with new colors). */
    window.dispatchEvent(new CustomEvent('mecee:themeChange', { detail: e.newValue }));
  });
})();
