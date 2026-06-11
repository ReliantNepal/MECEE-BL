/* MECEE-BL R2 sync — frontend orchestrator.
   ---------------------------------------------------------------------------
   What it does:
     - Builds per-category snapshots from localStorage (and the server-side
       library for the library category).
     - Posts each snapshot to /api/sync/state/<cat>; the launcher merges with
       what's in R2 (per-item last-write-wins, with tombstones) and returns
       the merged result.
     - Applies the merged result back into localStorage so the local data
       reflects whatever the cloud now considers canonical.
     - Exposes window.MeceeSync.{ stamp, syncAll, syncCategory, mountButton }.

   The "stamp" call is what the rest of the app uses to record activity:
       MeceeSync.stamp('tracker', chapterKey, 'updated')
       MeceeSync.stamp('flashcards', deckId,  'deleted')
   Stamps go into mecee_sync_meta_<cat> — a flat { id: {updatedAt|deletedAt} }
   map. The snapshot builder joins this meta map against the current data, so
   deletions survive even after the underlying row has been removed from its
   home localStorage key.

   Sync runs in the background — failures don't block the UI. */

(function () {
  if (window.MeceeSync) return; // idempotent — every page loads this

  /* Keys come from window.MeceeKeys (mecee_keys.js) — single source of truth
     across pages. The literal strings are intentionally not duplicated here.
     Falls back to inline literals on the (vanishingly unlikely) chance that
     mecee_keys.js failed to load before this script ran. */
  const K = window.MeceeKeys || {};
  const META_PREFIX  = K.SYNC_META_PREFIX || 'mecee_sync_meta_';
  const STATUS_KEY   = K.SYNC_STATUS      || 'mecee_sync_last';

  /* ---------- Storage helpers ---------- */

  /* ---------- Device identity (for server-side sync history) ---------- */

  const DEVICE_ID_KEY   = 'mecee_device_id';
  const DEVICE_NAME_KEY = 'mecee_device_name';

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function getDeviceName() {
    let name = localStorage.getItem(DEVICE_NAME_KEY);
    if (!name) {
      const ua = navigator.userAgent || '';
      const platform = navigator.platform || '';
      let label = platform || 'device';
      if (/Android/i.test(ua)) label = 'Android';
      else if (/iPhone|iPad|iPod/i.test(ua)) label = 'iOS';
      else if (/Windows/i.test(ua)) label = 'Windows';
      else if (/Mac/i.test(ua)) label = 'Mac';
      else if (/Linux/i.test(ua)) label = 'Linux';
      const browser = /Edg\//.test(ua) ? 'Edge'
        : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
        : /Safari\//.test(ua) ? 'Safari' : '';
      name = browser ? `${label} (${browser})` : label;
      localStorage.setItem(DEVICE_NAME_KEY, name);
    }
    return name;
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (_) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  function readMeta(cat) { return readJSON(META_PREFIX + cat, {}); }
  function writeMeta(cat, m) { writeJSON(META_PREFIX + cat, m); }

  function now() { return Date.now(); }

  /* ---------- Public stamp API ---------- */
  /* Called by the rest of the app at every write site so we know when each
     row last changed. `op` is 'updated' or 'deleted'. */
  function stamp(cat, id, op) {
    if (!id) return;
    const m = readMeta(cat);
    if (op === 'deleted') {
      m[id] = Object.assign(m[id] || {}, { deletedAt: now() });
    } else {
      m[id] = Object.assign(m[id] || {}, { updatedAt: now(), deletedAt: null });
    }
    writeMeta(cat, m);
  }

  /* ---------- Per-category adapters ----------
     Each adapter knows how to:
       - read the current rows from localStorage as { id: data }
       - write merged rows back to localStorage
       - notify the active page so its UI re-renders (best effort) */

  /* In-place re-render after sync is driven by the iframe `mecee-sync-applied`
     postMessage handler near the bottom of this file; each page registers a
     window.onMeceeSyncApplied hook to repaint from the freshly-merged
     localStorage. The adapters here just own the read/write contract. */
  const adapters = {
    tracker: {
      key: K.PROGRESS,
      build() {
        const raw = readJSON(K.PROGRESS, {}) || {};
        const items = {};
        Object.keys(raw).forEach(k => { items[k] = { done: true }; });
        return items;
      },
      apply(liveItems) {
        const next = {};
        Object.keys(liveItems).forEach(k => { next[k] = true; });
        writeJSON(K.PROGRESS, next);
      }
    },

    flashcards: {
      key: K.FLASHCARDS,
      build() {
        const raw = readJSON(K.FLASHCARDS, { decks: [] }) || { decks: [] };
        const items = {};
        (raw.decks || []).forEach(d => { if (d && d.id) items[d.id] = d; });
        return items;
      },
      apply(liveItems) {
        /* Preserve any non-deck fields that might be in the root payload. */
        const cur = readJSON(K.FLASHCARDS, { decks: [] }) || { decks: [] };
        cur.decks = Object.values(liveItems);
        writeJSON(K.FLASHCARDS, cur);
      }
    },

    chats: {
      key: K.CHATS,
      build() {
        const arr = readJSON(K.CHATS, []) || [];
        const items = {};
        arr.forEach(c => { if (c && c.id) items[c.id] = c; });
        return items;
      },
      apply(liveItems) {
        const arr = Object.values(liveItems);
        /* Stable order: by updatedAt desc so newest chats appear first. */
        arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        writeJSON(K.CHATS, arr);
      }
    },

    library_bookmarks: {
      key: K.BOOKMARKS,
      /* Bookmarks store is { "subj/file": [...marks] }. We treat the file path
         as the row id and the array of marks as the row data. Whole-file LWW
         (not per-mark) — keeps the merge simple. */
      build() {
        const raw = readJSON(K.BOOKMARKS, {}) || {};
        const items = {};
        Object.keys(raw).forEach(k => { items[k] = { marks: raw[k] }; });
        return items;
      },
      apply(liveItems) {
        const next = {};
        Object.keys(liveItems).forEach(k => {
          const m = liveItems[k] && liveItems[k].marks;
          if (Array.isArray(m) && m.length) next[k] = m;
        });
        writeJSON(K.BOOKMARKS, next);
      }
    },

    /* Chat settings — API key, model, system prompt. Stored as a single
       "self" item so the user can fill in the OpenAI key on the desktop,
       hit Sync, then open the app on the phone (same R2 bucket) and
       have the key already there. Whole-object LWW: whichever device
       saved most recently wins. */
    chat_settings: {
      key: null,   /* multi-key category — no single localStorage key */
      build() {
        const apiKey = localStorage.getItem(K.CHAT_API)    || '';
        const model  = localStorage.getItem(K.CHAT_MODEL)  || '';
        const prompt = localStorage.getItem(K.CHAT_PROMPT) || '';
        /* Skip the snapshot entirely if nothing's set yet — avoids pushing
           empty strings on a freshly-opened phone before the user has
           pulled. */
        if (!apiKey && !model && !prompt) return {};
        return { self: { apiKey, model, prompt } };
      },
      apply(liveItems) {
        const s = liveItems.self;
        if (!s) return;
        if (s.apiKey) localStorage.setItem(K.CHAT_API,    s.apiKey);
        if (s.model)  localStorage.setItem(K.CHAT_MODEL,  s.model);
        if (s.prompt) localStorage.setItem(K.CHAT_PROMPT, s.prompt);
      }
    }
  };

  /* ---------- Snapshot build / apply ---------- */

  function buildSnapshot(cat) {
    const a = adapters[cat];
    if (!a) throw new Error('unknown category: ' + cat);
    const live = a.build();
    const meta = readMeta(cat);
    const items = {};
    /* Live items (carry stamps if we have them; otherwise fall back to a
       baseline so the server has something to compare against). */
    Object.keys(live).forEach(id => {
      const m = meta[id] || {};
      items[id] = {
        data:      live[id],
        updatedAt: m.updatedAt || 1,   // 1 = older than anything else stamped
        deletedAt: null
      };
    });
    /* Tombstones for rows that no longer live in `live`. */
    Object.keys(meta).forEach(id => {
      if (!live[id] && meta[id].deletedAt) {
        items[id] = {
          data:      null,
          updatedAt: meta[id].updatedAt || 0,
          deletedAt: meta[id].deletedAt
        };
      }
    });
    return { schema: 1, updatedAt: now(), items };
  }

  function applySnapshot(cat, merged) {
    const a = adapters[cat];
    if (!a) return;
    const items = (merged && merged.items) || {};
    const live = {};
    const newMeta = {};
    Object.keys(items).forEach(id => {
      const it = items[id];
      if (it.deletedAt) {
        /* Keep the tombstone in our meta so subsequent syncs propagate it. */
        newMeta[id] = { deletedAt: it.deletedAt, updatedAt: it.updatedAt || 0 };
      } else if (it.data != null) {
        live[id] = it.data;
        newMeta[id] = { updatedAt: it.updatedAt || now(), deletedAt: null };
      }
    });
    writeMeta(cat, newMeta);
    a.apply(live);
  }

  /* ---------- Network ---------- */

  async function postJSON(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mecee-Device': getDeviceId(),
        'X-Mecee-Device-Name': getDeviceName()
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
    if (!res.ok) {
      const msg = (parsed && parsed.error) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return parsed;
  }
  async function getJSON(path) {
    const res = await fetch(path);
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
    if (!res.ok) {
      const msg = (parsed && parsed.error) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return parsed;
  }

  /* ---------- Top-level sync entry points ---------- */

  async function syncCategory(cat) {
    if (cat === 'library') return syncLibrary();
    const snap = buildSnapshot(cat);
    const res  = await postJSON('/api/sync/state/' + encodeURIComponent(cat), snap);
    /* Server now returns { snapshot, pushed, pulled } so the UI can tell
       "synced N items" from "nothing changed". Older deploys returned the
       merged snapshot inline — fall back gracefully in that case. */
    const merged = (res && res.snapshot) ? res.snapshot : res;
    applySnapshot(cat, merged);
    return {
      category: cat,
      items:    Object.keys((merged && merged.items) || {}).length,
      pushed:   (res && typeof res.pushed === 'number') ? res.pushed : null,
      pulled:   (res && typeof res.pulled === 'number') ? res.pulled : null
    };
  }

  async function syncLibrary() {
    /* Build a metadata snapshot from /api/library (server is source of truth
       for the file list). Stamps come from mecee_sync_meta_library — keep
       a parallel store so deletes via the UI persist as tombstones. */
    const list = await getJSON('/api/library');
    const meta = readMeta('library');
    const items = {};
    list.forEach(it => {
      if (!it.id) return;
      const m = meta[it.id] || {};
      items[it.id] = {
        data:      it,
        updatedAt: m.updatedAt || (it.addedAt ? it.addedAt * 1000 : now()),
        deletedAt: null
      };
    });
    Object.keys(meta).forEach(id => {
      if (!items[id] && meta[id].deletedAt) {
        items[id] = { data: null, updatedAt: meta[id].updatedAt || 0, deletedAt: meta[id].deletedAt };
      }
    });
    const snap = { schema: 1, updatedAt: now(), items };
    const result = await postJSON('/api/sync/library', snap);
    const merged = result.snapshot;
    /* Update local meta from merged snapshot. */
    const newMeta = {};
    Object.keys(merged.items || {}).forEach(id => {
      const it = merged.items[id];
      newMeta[id] = {
        updatedAt: it.updatedAt || 0,
        deletedAt: it.deletedAt || null
      };
    });
    writeMeta('library', newMeta);
    return {
      category: 'library',
      items:    Object.keys(merged.items || {}).length,
      uploaded: (result.uploaded || []).length,
      missing:  (result.missing_locally || []).length,
      pushed:   (typeof result.pushed === 'number') ? result.pushed : null,
      pulled:   (typeof result.pulled === 'number') ? result.pulled : null
    };
  }

  /* Categories shown in the popup, in the order they sync. The labels are
     what the user sees; the keys map to adapter / endpoint names. */
  const CATEGORY_PLAN = [
    { key: 'tracker',           label: 'Tracker progress' },
    { key: 'flashcards',        label: 'Flashcards' },
    { key: 'chats',             label: 'AI tutor chats' },
    { key: 'library_bookmarks', label: 'Library bookmarks' },
    { key: 'library',           label: 'Library (metadata + PDFs)' },
  ];

  async function syncAll(onProgress) {
    setStatus({ state: 'syncing', startedAt: now() });
    /* Run all categories in parallel — they touch independent R2 keys,
       so there's no need to serialise. The progress callback fires as each
       one resolves, and `results` is filled in CATEGORY_PLAN order so the
       aggregate tallies in the caller stay stable. */
    const results = new Array(CATEGORY_PLAN.length);
    let failure = null;
    await Promise.all(CATEGORY_PLAN.map(async (step, i) => {
      if (onProgress) onProgress({ key: step.key, label: step.label, state: 'syncing' });
      try {
        const r = await syncCategory(step.key);
        results[i] = { ...r, label: step.label };
        if (onProgress) onProgress({ key: step.key, label: step.label, state: 'done', detail: r });
      } catch (e) {
        failure = failure || e;
        results[i] = { category: step.key, label: step.label, error: e.message };
        if (onProgress) onProgress({ key: step.key, label: step.label, state: 'error', error: e.message });
      }
    }));
    const status = failure
      ? { state: 'error', lastError: failure.message, lastSyncAt: readStatus().lastSyncAt || null }
      : { state: 'ok',    lastError: null,             lastSyncAt: now() };
    setStatus(status);
    return { results, status };
  }

  /* ---------- Status (persisted so the indicator survives a reload) ---------- */

  function readStatus() { return readJSON(STATUS_KEY, { state: 'idle' }) || { state: 'idle' }; }
  function setStatus(s) {
    writeJSON(STATUS_KEY, s);
    /* Notify any UI mounted via mountButton. */
    document.dispatchEvent(new CustomEvent('mecee-sync-status', { detail: s }));
  }

  /* ---------- UI mount helper ----------
     mountButton(container) injects a small "⟳ Sync" button + status into the
     given element. Auto-updates based on the sync state. */

  function fmtRel(ts) {
    if (!ts) return 'never';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5)        return 'just now';
    if (sec < 60)       return sec + 's ago';
    if (sec < 3600)     return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400)    return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
  }

  /* ---------- Floating launcher + progress modal ----------
     One single round button at bottom-left, just above the notes launcher.
     Clicking it pops a centred modal that runs sync and shows live progress
     per category. Auto-mounted once per top-level window (the shell). */

  let floatBtn, modalEl, rowsEl, statusEl, closeBtnEl;
  let syncRunning = false;

  function ensureFloater() {
    if (floatBtn) return floatBtn;
    floatBtn = document.createElement('button');
    floatBtn.type = 'button';
    floatBtn.className = 'mecee-sync-launcher';
    floatBtn.title = 'Sync to Cloudflare R2';
    floatBtn.innerHTML = '<span class="mecee-sync-icon">⟳</span>';
    document.body.appendChild(floatBtn);
    floatBtn.addEventListener('click', openSyncDialog);
    return floatBtn;
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.className = 'mecee-sync-modal';
    modalEl.innerHTML = `
      <div class="mecee-sync-backdrop"></div>
      <div class="mecee-sync-card" role="dialog" aria-modal="true">
        <div class="mecee-sync-head">
          <div>
            <div class="mecee-sync-title">Sync</div>
            <div class="mecee-sync-sub" id="meceeSyncSub">Cloudflare R2 · mecee-sync</div>
          </div>
          <button type="button" class="mecee-sync-close" title="Close">×</button>
        </div>
        <div class="mecee-sync-banner" id="meceeSyncBanner" hidden></div>
        <div class="mecee-sync-rows" id="meceeSyncRows"></div>
        <div class="mecee-sync-footer">
          <span class="mecee-sync-summary" id="meceeSyncSummary"></span>
          <button type="button" class="mecee-sync-action" id="meceeSyncAction">Sync now</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    rowsEl    = modalEl.querySelector('#meceeSyncRows');
    statusEl  = modalEl.querySelector('#meceeSyncSummary');
    closeBtnEl= modalEl.querySelector('.mecee-sync-close');
    const actionBtn = modalEl.querySelector('#meceeSyncAction');

    closeBtnEl.addEventListener('click', () => {
      if (!syncRunning) modalEl.classList.remove('open');
    });
    modalEl.querySelector('.mecee-sync-backdrop').addEventListener('click', () => {
      if (!syncRunning) modalEl.classList.remove('open');
    });
    actionBtn.addEventListener('click', startSync);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl.classList.contains('open') && !syncRunning) {
        modalEl.classList.remove('open');
      }
    });
    return modalEl;
  }

  function renderInitialRows() {
    rowsEl.innerHTML = CATEGORY_PLAN.map(c => `
      <div class="mecee-sync-row" data-cat="${c.key}">
        <div class="mecee-sync-row-icon" aria-hidden="true">
          <span class="dot"></span>
        </div>
        <div class="mecee-sync-row-body">
          <div class="mecee-sync-row-label">${c.label}</div>
          <div class="mecee-sync-row-state idle">waiting</div>
        </div>
      </div>
    `).join('');
    /* Hide the "up to date" banner — it's shown only after a no-op sync. */
    const banner = document.getElementById('meceeSyncBanner');
    if (banner) { banner.hidden = true; banner.textContent = ''; }
  }

  function describeDetail(d) {
    /* Translate the server's push/pull counts into a one-line human summary
       per row. "up to date" wins when nothing moved in either direction. */
    if (!d) return 'done';
    const hasCounts = typeof d.pushed === 'number' && typeof d.pulled === 'number';
    if (hasCounts && d.pushed === 0 && d.pulled === 0) return 'up to date';
    const parts = [];
    if (d.pushed > 0) parts.push(`↑ ${d.pushed} pushed`);
    if (d.pulled > 0) parts.push(`↓ ${d.pulled} pulled`);
    if (typeof d.uploaded === 'number' && d.uploaded > 0) parts.push(`${d.uploaded} PDF`);
    if (typeof d.missing === 'number' && d.missing > 0) parts.push(`${d.missing} missing`);
    if (!parts.length && typeof d.items === 'number') parts.push(`${d.items} item${d.items === 1 ? '' : 's'}`);
    return parts.join(' · ') || 'done';
  }

  function updateRow(progress) {
    const row = rowsEl.querySelector(`.mecee-sync-row[data-cat="${progress.key}"]`);
    if (!row) return;
    row.dataset.state = progress.state;
    const stateEl = row.querySelector('.mecee-sync-row-state');
    const iconEl  = row.querySelector('.mecee-sync-row-icon');
    stateEl.className = 'mecee-sync-row-state ' + progress.state;

    if (progress.state === 'syncing') {
      iconEl.innerHTML = '<span class="mecee-sync-spin">⟳</span>';
      stateEl.textContent = 'syncing…';
    } else if (progress.state === 'done') {
      const text = describeDetail(progress.detail);
      const isUpToDate = (text === 'up to date');
      iconEl.innerHTML = isUpToDate
        ? '<span class="mecee-sync-check muted">✓</span>'
        : '<span class="mecee-sync-check ok">✓</span>';
      stateEl.textContent = text;
      stateEl.classList.toggle('muted', isUpToDate);
    } else if (progress.state === 'error') {
      iconEl.innerHTML = '<span class="mecee-sync-err">!</span>';
      stateEl.textContent = progress.error || 'failed';
      stateEl.title = progress.error || '';
    }
  }

  function setActionBtnState(running) {
    const actionBtn = modalEl.querySelector('#meceeSyncAction');
    actionBtn.disabled = running;
    actionBtn.textContent = running ? 'Syncing…' : 'Sync now';
    closeBtnEl.disabled = running;
    syncRunning = running;
    floatBtn && floatBtn.classList.toggle('busy', running);
  }

  async function startSync() {
    if (syncRunning) return;
    renderInitialRows();
    statusEl.textContent = '';
    setActionBtnState(true);
    let res;
    try {
      res = await syncAll(updateRow);
    } catch (e) {
      statusEl.textContent = 'Sync failed: ' + e.message;
      statusEl.className = 'mecee-sync-summary err';
      setActionBtnState(false);
      return;
    }
    setActionBtnState(false);
    const s = res.status;
    const banner = document.getElementById('meceeSyncBanner');

    /* Aggregate the push/pull counts across all categories so we can give one
       clear top-line message: "everything already up to date" vs "X pushed,
       Y pulled". */
    let totalPushed = 0, totalPulled = 0, anyMoved = false, hadCounts = false;
    (res.results || []).forEach(r => {
      if (typeof r.pushed === 'number' && typeof r.pulled === 'number') {
        hadCounts = true;
        totalPushed += r.pushed;
        totalPulled += r.pulled;
        if (r.pushed > 0 || r.pulled > 0) anyMoved = true;
      }
    });

    if (s.state === 'error') {
      banner.hidden = false;
      banner.className = 'mecee-sync-banner err';
      banner.textContent = 'Some categories failed — see rows above.';
      statusEl.textContent = 'last sync attempt · ' + new Date().toLocaleTimeString();
      statusEl.className = 'mecee-sync-summary err';
    } else if (hadCounts && !anyMoved) {
      banner.hidden = false;
      banner.className = 'mecee-sync-banner ok';
      banner.textContent = 'Everything is already up to date.';
      statusEl.textContent = new Date(s.lastSyncAt).toLocaleTimeString();
      statusEl.className = 'mecee-sync-summary muted';
    } else {
      banner.hidden = false;
      banner.className = 'mecee-sync-banner ok';
      const parts = [];
      if (totalPushed > 0) parts.push(`${totalPushed} pushed to cloud`);
      if (totalPulled > 0) parts.push(`${totalPulled} pulled from cloud`);
      banner.textContent = parts.length ? parts.join(' · ') : 'Synced.';
      statusEl.textContent = new Date(s.lastSyncAt).toLocaleTimeString();
      statusEl.className = 'mecee-sync-summary ok';
    }

    /* Tell any iframe to re-render with the merged data — only if something
       actually changed. */
    if (anyMoved) {
      try {
        const frame = document.getElementById('appFrame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'mecee-sync-applied' }, '*');
        }
      } catch (_) {}
    }
  }

  function openSyncDialog() {
    ensureModal();
    renderInitialRows();
    statusEl.textContent = '';
    statusEl.className = 'mecee-sync-summary';
    modalEl.classList.add('open');
    /* Auto-start — that's what the user clicked Sync for. */
    startSync();
  }

  /* Only the top-level window (the shell) gets the launcher. Iframes share
     the same MeceeSync.stamp API for write tracking but don't render their
     own button. */
  function isShellWindow() {
    if (window.parent === window) return true;
    try { return !window.parent.MeceeSync; } catch (_) { return true; }
  }

  function autoMountIfShell() {
    if (!isShellWindow()) return;
    ensureFloater();
    ensureModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountIfShell);
  } else {
    autoMountIfShell();
  }

  /* Shell-side hide/show hook for iframe pages that need the FAB out of the
     way (e.g. flashcards MCQ on phone, where the FAB overlaps the Next
     button). Iframe sends { type: 'mecee-sync-fab', visible: false } when
     entering and { visible: true } when leaving. The FAB itself isn't
     removed — just .style.display toggled. */
  if (isShellWindow()) {
    window.addEventListener('message', (e) => {
      if (!e || !e.data || e.data.type !== 'mecee-sync-fab') return;
      ensureFloater();
      floatBtn.style.display = (e.data.visible === false) ? 'none' : '';
    });
  }

  /* Listen in iframe pages for the post-sync ping. Pages that opt in by
     defining window.onMeceeSyncApplied get an in-place refresh — preserves
     scroll position, focus, modal state, etc. Pages that don't opt in fall
     back to a full reload, which is the original (heavy) behaviour. */
  if (!isShellWindow()) {
    window.addEventListener('message', (e) => {
      if (!e || !e.data || e.data.type !== 'mecee-sync-applied') return;
      if (typeof window.onMeceeSyncApplied === 'function') {
        try { window.onMeceeSyncApplied(); return; } catch (_) { /* fall through */ }
      }
      try { location.reload(); } catch (_) {}
    });
  }

  /* ---------- Public API ---------- */
  window.MeceeSync = {
    stamp,
    syncCategory,
    syncLibrary,
    syncAll,
    buildSnapshot,
    applySnapshot,
    openSyncDialog,
    readStatus
  };
})();
