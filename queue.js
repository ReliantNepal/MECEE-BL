/* AI question queue — lives only in the shell (index.html).
   ---------------------------------------------------------------------------
   UX:
     - Each "Ask AI" call adds a small CIRCULAR badge to a stack in the top-
       right corner. Empty stack = no badges visible at all.
     - While the request is in flight, the badge shows three juggling dots.
     - When the answer lands, the badge turns into a clickable 🤖.
     - Clicking the badge opens a CENTERED modal showing the question + answer
       (or "Still thinking…" if it's still in flight).
     - Closing the modal removes that badge entirely.
     - The full Q&A is also written to localStorage's `mecee_chats`, so it
       shows up in the AI Tutor sidebar — clicking "Open in AI Tutor" jumps
       there with the chat selected. */
(function () {
  /* Pulled from window.MeceeKeys (mecee_keys.js) — same registry chat.js uses,
     so the two stay in lockstep automatically. */
  var KEY_API    = MeceeKeys.CHAT_API;
  var KEY_MODEL  = MeceeKeys.CHAT_MODEL;
  var KEY_PROMPT = MeceeKeys.CHAT_PROMPT;
  var KEY_CHATS  = MeceeKeys.CHATS;
  var KEY_ACTIVE = MeceeKeys.CHAT_ACTIVE;

  var FALLBACK_PROMPT =
    "You are a focused, friendly study tutor for MECEE-BL 2027 — Nepal's medical entrance exam. " +
    "Be concise, use bullets, and prefer plain language. The student is asking about a fragment " +
    "of text they highlighted while studying — explain it simply, list key things to memorise, " +
    "and add 1-2 sample MCQs only if it would help.";

  var items   = [];    /* { id, text, status:'pending'|'done'|'error', answer?, chatId?, dotEl } */
  var stackEl, backdropEl, cardEl, ansEl, headTextEl, openTutorBtn;
  var currentItemId = null;     /* what the centered modal is currently showing */

  /* ---------- DOM ---------- */
  function buildUI() {
    stackEl = document.createElement('div');
    stackEl.className = 'ai-queue-stack';
    document.body.appendChild(stackEl);

    backdropEl = document.createElement('div');
    backdropEl.className = 'ai-q-backdrop';
    backdropEl.innerHTML =
      '<div class="ai-q-card" role="dialog" aria-modal="true">' +
      '  <div class="ai-q-head">' +
      '    <div class="icon">🤖</div>' +
      '    <div class="qbody">' +
      '      <div class="qtag">Question</div>' +
      '      <div class="qtext" id="__aiQHeadText"></div>' +
      '    </div>' +
      '    <button class="ai-q-close" id="__aiQClose" type="button" title="Close (Esc)">✕</button>' +
      '  </div>' +
      '  <div class="ai-q-ans" id="__aiQAns"></div>' +
      '  <div class="ai-q-foot">' +
      '    <button id="__aiQOpenTutor" type="button" class="primary">Open in AI Tutor</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(backdropEl);

    cardEl       = backdropEl.querySelector('.ai-q-card');
    ansEl        = document.getElementById('__aiQAns');
    headTextEl   = document.getElementById('__aiQHeadText');
    openTutorBtn = document.getElementById('__aiQOpenTutor');

    document.getElementById('__aiQClose').addEventListener('click', closeModal);
    backdropEl.addEventListener('click', function (e) {
      if (e.target === backdropEl) closeModal();
    });
    openTutorBtn.addEventListener('click', function () {
      var it = items.find(function (x) { return x.id === currentItemId; });
      if (it && it.chatId) {
        closeModal();
        removeItem(it.id);
        navigateToChat(it.chatId);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdropEl.classList.contains('open')) closeModal();
    });
  }

  function escapeText(s) { return String(s == null ? '' : s); }

  /* ---------- Badge management ---------- */
  function makeDot(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ai-q-dot ' + item.status;
    btn.title = item.status === 'pending'
      ? 'Thinking…'
      : (item.status === 'error' ? 'Request failed — click for details' : 'Answer ready — click to view');
    /* Same layout in every state: 🤖 emoji on top, indicator below.
         pending → three white juggling dots
         done    → small green ✓
         error   → small red !  */
    var indicator = item.status === 'pending'
      ? '<span class="ai-q-dots"><i></i><i></i><i></i></span>'
      : (item.status === 'error'
          ? '<span class="ai-q-mark err">!</span>'
          : '<span class="ai-q-mark ok">✓</span>');
    btn.innerHTML =
      '<span class="ai-q-face">🤖</span>' +
      indicator;
    btn.addEventListener('click', function () { openModal(item.id); });
    return btn;
  }

  function updateDot(item) {
    if (!item.dotEl) return;
    var fresh = makeDot(item);
    item.dotEl.replaceWith(fresh);
    item.dotEl = fresh;
  }

  function removeItem(id) {
    var idx = items.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var it = items[idx];
    if (it.dotEl && it.dotEl.parentNode) it.dotEl.parentNode.removeChild(it.dotEl);
    items.splice(idx, 1);
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    var it = items.find(function (x) { return x.id === id; });
    if (!it) return;
    currentItemId = id;
    headTextEl.textContent = it.text;
    ansEl.className = 'ai-q-ans ' + it.status;
    if (it.status === 'pending') {
      /* If streaming has already produced some text, show it live — otherwise
         fall back to the thinking placeholder. */
      ansEl.textContent = it.answer || 'Still thinking…';
      openTutorBtn.style.display = 'none';
    } else if (it.status === 'error') {
      ansEl.textContent = it.answer || 'Unknown error.';
      openTutorBtn.style.display = 'none';
    } else {
      ansEl.textContent = it.answer || '(no reply)';
      openTutorBtn.style.display = it.chatId ? '' : 'none';
    }
    backdropEl.classList.add('open');
  }

  function closeModal() {
    backdropEl.classList.remove('open');
    /* If the question is done/error, viewing it counts as "read" — remove the
       badge. If still pending, leave the badge alone so the user can return
       to it once the answer lands. */
    var it = items.find(function (x) { return x.id === currentItemId; });
    if (it && it.status !== 'pending') removeItem(it.id);
    currentItemId = null;
  }

  /* Navigate the shell to chat.html with the given chat selected. We force
     reload by appending a timestamp query — otherwise an already-open chat.html
     keeps its in-memory state and ignores the new entry. */
  function navigateToChat(chatId) {
    try { localStorage.setItem(KEY_ACTIVE, chatId); } catch (_) {}
    var frame = document.getElementById('appFrame');
    if (frame) {
      frame.setAttribute('src', 'chat.html?_t=' + Date.now());
      if (location.hash !== '#chat') history.pushState(null, '', '#chat');
    } else {
      location.href = 'chat.html';
    }
  }

  /* Stream tokens from OpenAI's chat completion SSE endpoint. Calls
     onChunk(text) for every delta. Throws on HTTP error. */
  async function streamCompletion(apiKey, body, onChunk) {
    var res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(Object.assign({}, body, { stream: true }))
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error((err && err.error && err.error.message) || ('HTTP ' + res.status));
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    while (true) {
      var step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      var nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        var line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line || line.indexOf('data:') !== 0) continue;
        var data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          var obj = JSON.parse(data);
          var delta = obj && obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
          if (delta) onChunk(delta);
        } catch (_) { /* skip malformed chunk */ }
      }
    }
  }

  /* ---------- The actual ask ---------- */
  function ask(text) {
    text = String(text || '').trim();
    if (!text) return;
    var apiKey = localStorage.getItem(KEY_API);
    if (!apiKey) {
      alert("Set your OpenAI API key first — open the AI Tutor (🤖) and click ⚙️ Settings.");
      return;
    }

    var item = {
      id:     'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      text:   text,
      status: 'pending',
      answer: '',
      ts:     Date.now()
    };
    items.push(item);
    item.dotEl = makeDot(item);
    stackEl.appendChild(item.dotEl);

    /* Open the modal right away so the user sees text appearing live —
       no need for them to click the badge first. The badge stays in the
       corner; closing the modal mid-stream keeps the badge (status still
       'pending'), and closing after completion removes it (closeModal). */
    openModal(item.id);

    var model     = localStorage.getItem(KEY_MODEL)  || 'gpt-4o-mini';
    var sysPrompt = localStorage.getItem(KEY_PROMPT) || FALLBACK_PROMPT;

    /* Stream tokens into item.answer. If the user has the modal open on this
       item, also push each chunk into the visible answer area so they see
       text appear live. We don't save to mecee_chats per chunk — that would
       fire a storage event to chat.html on every token. Save once at the end. */
    streamCompletion(apiKey, {
      model:       model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user',   content: text }
      ]
    }, function (chunk) {
      item.answer += chunk;
      if (currentItemId === item.id) {
        /* Drop the .pending class as soon as real text arrives — otherwise the
           muted-italic "Still thinking…" styling stays on and incoming text
           looks identical to the placeholder. */
        ansEl.classList.remove('pending');
        ansEl.textContent = item.answer;
      }
    }).then(function () {
      if (!item.answer) item.answer = '(no reply)';
      item.status = 'done';
      saveToChats(item);
      updateDot(item);
      /* Refresh the modal so the "Open in AI Tutor" button appears now that
         the chat has been persisted. */
      if (currentItemId === item.id) openModal(item.id);
    }).catch(function (e) {
      item.status = 'error';
      item.answer = 'Error: ' + (e && e.message ? e.message : e);
      updateDot(item);
      if (currentItemId === item.id) openModal(item.id);
    });
  }

  /* Persist the Q&A as a new chat in mecee_chats. chat.html reads this on
     load — and an already-open chat.html picks it up via the `storage` event
     (we're a different window than the iframe, so it fires there). */
  function saveToChats(item) {
    var chats;
    try { chats = JSON.parse(localStorage.getItem(KEY_CHATS) || '[]'); } catch (_) { chats = []; }
    if (!Array.isArray(chats)) chats = [];
    var title = item.text.replace(/\s+/g, ' ').trim();
    if (title.length > 44) title = title.slice(0, 44) + '…';
    var newChat = {
      id:        'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      title:     title || 'Ask AI',
      messages:  [
        { role: 'user',      content: item.text },
        { role: 'assistant', content: item.answer }
      ],
      updatedAt: Date.now()
    };
    chats.push(newChat);
    try { localStorage.setItem(KEY_CHATS, JSON.stringify(chats)); } catch (_) {}
    item.chatId = newChat.id;
  }

  /* ---------- Wiring ---------- */
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (d && d.type === 'askAi' && typeof d.text === 'string') ask(d.text);
  });

  /* Expose for direct in-shell callers (e.g. shell's own right-click). */
  window.aiAskQuestion = ask;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
