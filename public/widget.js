(function () {
  'use strict';

  if (window.__SMM_SUPPORT_WIDGET_LOADED__) return;
  window.__SMM_SUPPORT_WIDGET_LOADED__ = true;

  var currentScript =
    document.currentScript ||
    document.querySelector('script[data-tenant]') ||
    document.querySelector('script[src*="widget.js"]');

  var hostUrl = '';
  if (currentScript && currentScript.src) {
    try {
      var parsed = new URL(currentScript.src);
      hostUrl = parsed.origin;
    } catch (e) {
      hostUrl = window.location.origin;
    }
  } else {
    hostUrl = window.location.origin;
  }

  var tenantId = currentScript ? currentScript.getAttribute('data-tenant') || currentScript.getAttribute('data-tenant-id') : null;
  if (!tenantId) {
    console.warn('[SupportWidget] Missing data-tenant attribute on script tag.');
    return;
  }

  var accentColor = (currentScript && currentScript.getAttribute('data-accent')) || '#4f46e5';
  var customTitle = (currentScript && currentScript.getAttribute('data-title')) || 'Customer Support';
  var customWelcome =
    (currentScript && currentScript.getAttribute('data-welcome')) ||
    'Hello! Welcome to 24/7 Support. How can we help you today? Ask about our services, pricing, or order status.';

  // Session ID per tenant
  function getSessionId(tid) {
    var key = 'smm_chat_session_' + tid;
    var sid = localStorage.getItem(key);
    if (!sid || sid.length < 16) {
      sid =
        'web_' +
        Math.random().toString(36).substring(2, 12) +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2, 8);
      localStorage.setItem(key, sid);
    }
    return sid;
  }

  var sessionId = getSessionId(tenantId);
  var isChatOpen = false;
  var hasLoadedHistory = false;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    var safe = escapeHtml(text);

    // Code blocks
    safe = safe.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, '<pre class="smm-code-block"><code>$1</code></pre>');
    // Inline code
    safe = safe.replace(/`([^`]+)`/g, '<code class="smm-code-inline">$1</code>');
    // Bold
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Markdown Links
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bullet points
    safe = safe.replace(/^[•*-]\s+(.+)$/gm, '<li class="smm-bullet">$1</li>');
    safe = safe.replace(/(<li class="smm-bullet">.*<\/li>(\n)?)+/g, '<ul class="smm-list">$&</ul>');
    // Line breaks
    safe = safe.replace(/\n/g, '<br>');

    return safe;
  }

  // Inject host container into DOM
  var host = document.createElement('div');
  host.id = 'smm-support-widget-root';
  host.style.position = 'relative';
  host.style.zIndex = '2147483647';
  document.body.appendChild(host);

  // Shadow DOM for total isolation from host page styles
  var shadow = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    :host {
      --smm-accent: ${accentColor};
      --smm-bg: #0f172a;
      --smm-surface: #1e293b;
      --smm-surface-hover: #334155;
      --smm-border: rgba(255, 255, 255, 0.1);
      --smm-text: #f8fafc;
      --smm-text-muted: #94a3b8;
      --smm-radius: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--smm-text);
      z-index: 2147483647;
      position: relative;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    /* Circular Floating Widget Launcher */
    .widget-launcher {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--smm-accent);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-shadow: 0 10px 25px -4px rgba(79, 70, 229, 0.45), 0 8px 16px -6px rgba(0, 0, 0, 0.35);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, background 0.2s ease;
      z-index: 2147483647;
    }

    .widget-launcher:focus-visible {
      outline: 2px solid #ffffff;
      outline-offset: 3px;
      box-shadow: 0 0 0 4px var(--smm-accent);
    }

    .widget-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 16px 32px -4px rgba(79, 70, 229, 0.55), 0 10px 20px -4px rgba(0, 0, 0, 0.4);
    }

    .widget-launcher:active {
      transform: scale(0.94);
    }

    .launcher-icon-chat,
    .launcher-icon-close {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .launcher-icon-chat svg,
    .launcher-icon-close svg {
      width: 28px;
      height: 28px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .launcher-icon-close {
      opacity: 0;
      transform: rotate(-90deg) scale(0.7);
      pointer-events: none;
    }

    .widget-launcher[aria-expanded="true"] .launcher-icon-chat {
      opacity: 0;
      transform: rotate(90deg) scale(0.7);
      pointer-events: none;
    }

    .widget-launcher[aria-expanded="true"] .launcher-icon-close {
      opacity: 1;
      transform: rotate(0) scale(1);
      pointer-events: auto;
    }

    /* Online status indicator dot */
    .launcher-badge {
      position: absolute;
      top: 1px;
      right: 1px;
      width: 14px;
      height: 14px;
      background: #10b981;
      border: 2.5px solid var(--smm-bg);
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
    }

    .launcher-badge::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      border: 1.5px solid rgba(16, 185, 129, 0.6);
      animation: launcherPulse 2.4s infinite cubic-bezier(0.4, 0, 0.6, 1);
    }

    @keyframes launcherPulse {
      0%, 100% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.4); opacity: 0; }
    }

    .widget-launcher[aria-expanded="true"] .launcher-badge {
      opacity: 0;
      transform: scale(0.5);
    }

    /* Chat Window Dialog */
    .widget-dialog {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      max-width: calc(100vw - 32px);
      height: 580px;
      max-height: calc(100vh - 120px);
      background: var(--smm-bg);
      border: 1px solid var(--smm-border);
      border-radius: var(--smm-radius);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.96);
      pointer-events: none;
      transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 2147483647;
    }

    .widget-dialog.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* Header */
    .dialog-header {
      background: var(--smm-surface);
      border-bottom: 1px solid var(--smm-border);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--smm-accent);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .header-titles {
      display: flex;
      flex-direction: column;
    }

    .header-title {
      font-weight: 700;
      font-size: 15px;
      color: var(--smm-text);
    }

    .header-status {
      font-size: 11px;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--smm-text-muted);
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: var(--smm-surface-hover);
      color: var(--smm-text);
    }

    /* Quick Action Chips */
    .quick-chips-bar {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(15, 23, 42, 0.7);
      border-bottom: 1px solid var(--smm-border);
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;
    }

    .quick-chips-bar::-webkit-scrollbar { display: none; }

    .chip-btn {
      background: var(--smm-surface);
      border: 1px solid var(--smm-border);
      color: var(--smm-text);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 9999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .chip-btn:hover {
      background: var(--smm-accent);
      border-color: var(--smm-accent);
      color: #ffffff;
      transform: translateY(-1px);
    }

    /* Message List */
    .message-list {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: var(--smm-bg);
    }

    .msg-row {
      display: flex;
      flex-direction: column;
      max-width: 86%;
    }

    .msg-row.bot {
      align-self: flex-start;
    }

    .msg-row.user {
      align-self: flex-end;
    }

    .msg-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      line-height: 1.45;
      font-size: 13.5px;
      word-break: break-word;
    }

    .msg-row.bot .msg-bubble {
      background: var(--smm-surface);
      color: var(--smm-text);
      border: 1px solid var(--smm-border);
      border-bottom-left-radius: 4px;
    }

    .msg-row.user .msg-bubble {
      background: var(--smm-accent);
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .msg-time {
      font-size: 10px;
      color: var(--smm-text-muted);
      margin-top: 4px;
      align-self: flex-end;
    }

    .msg-row.bot .msg-time {
      align-self: flex-start;
    }

    /* Typography inside messages */
    .smm-code-inline {
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .smm-code-block {
      background: #090d16;
      border: 1px solid var(--smm-border);
      border-radius: 8px;
      padding: 8px 10px;
      font-family: monospace;
      font-size: 12px;
      overflow-x: auto;
      margin: 6px 0;
    }

    .smm-list {
      margin: 6px 0 6px 18px;
    }

    .smm-bullet {
      margin-bottom: 4px;
    }

    .msg-bubble a {
      color: #38bdf8;
      text-decoration: underline;
    }

    /* Typing indicator */
    .typing-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--smm-surface);
      border-radius: 12px;
      align-self: flex-start;
      border: 1px solid var(--smm-border);
    }

    .typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--smm-text-muted);
      animation: typingBounce 1.4s infinite ease-in-out both;
    }

    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes typingBounce {
      0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* Composer */
    .dialog-composer {
      padding: 12px 14px;
      background: var(--smm-surface);
      border-top: 1px solid var(--smm-border);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .composer-input {
      flex: 1;
      background: var(--smm-bg);
      border: 1px solid var(--smm-border);
      color: var(--smm-text);
      padding: 10px 14px;
      border-radius: 9999px;
      font-size: 13.5px;
      outline: none;
      transition: border-color 0.2s;
    }

    .composer-input:focus-visible {
      outline: 2px solid var(--smm-accent);
      outline-offset: 1px;
    }

    .composer-input:focus {
      border-color: var(--smm-accent);
    }

    .composer-input::placeholder {
      color: var(--smm-text-muted);
    }

    .send-btn {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--smm-accent);
      color: #ffffff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .send-btn:hover {
      transform: scale(1.05);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .send-btn svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @media (max-width: 480px) {
      .widget-launcher {
        bottom: 16px;
        right: 16px;
        width: 56px;
        height: 56px;
      }
      .widget-dialog {
        bottom: 84px;
        right: 16px;
        left: 16px;
        width: auto;
        max-width: none;
        height: calc(100vh - 100px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .widget-launcher,
      .widget-dialog,
      .chip-btn,
      .send-btn,
      .close-btn,
      .launcher-icon-chat,
      .launcher-icon-close,
      .launcher-badge::after {
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
      .widget-dialog.open {
        transition: none !important;
        transform: none !important;
      }
      .typing-dot {
        animation: none !important;
        opacity: 0.8 !important;
      }
    }
  `;
  shadow.appendChild(style);

  // Shell structure
  var shell = document.createElement('div');
  shell.innerHTML = `
    <!-- Circular Launcher Button -->
    <button type="button" class="widget-launcher" id="smmLauncher" aria-label="Open support chat" aria-expanded="false">
      <span class="sr-only">
        <strong id="launcherTitle">${escapeHtml(customTitle)}</strong>
        <small>24/7 Live Support</small>
      </span>
      <span class="launcher-icon-chat" id="launcherSvg">
        <svg viewBox="0 0 24 24">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      </span>
      <span class="launcher-icon-close">
        <svg viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </span>
      <span class="launcher-badge" aria-hidden="true"></span>
    </button>

    <!-- Dialog Modal -->
    <div class="widget-dialog" id="smmDialog" role="dialog" aria-modal="true" aria-labelledby="smmDialogTitle">
      <header class="dialog-header">
        <div class="header-info">
          <div class="header-avatar" id="smmAvatar">⚡</div>
          <div class="header-titles">
            <span class="header-title" id="smmDialogTitle">${escapeHtml(customTitle)}</span>
            <span class="header-status">
              <span class="status-dot"></span> Online & Answering
            </span>
          </div>
        </div>
        <button type="button" class="close-btn" id="smmCloseBtn" aria-label="Close support chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </header>

      <!-- Quick Action Prompt Chips -->
      <div class="quick-chips-bar">
        <button type="button" class="chip-btn" data-query="services">⚡ All Services</button>
        <button type="button" class="chip-btn" data-query="instagram">📸 Instagram</button>
        <button type="button" class="chip-btn" data-query="youtube">▶️ YouTube</button>
        <button type="button" class="chip-btn" data-query="telegram">✈️ Telegram</button>
        <button type="button" class="chip-btn" data-query="track order">📦 Track Order</button>
      </div>

      <!-- Messages Log -->
      <div class="message-list" id="smmMessageList" role="log" aria-live="polite"></div>

      <!-- Typing Indicator Container -->
      <div id="smmTypingContainer" style="padding: 0 16px 8px 16px; display: none;">
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>

      <!-- Composer Input -->
      <form class="dialog-composer" id="smmComposerForm">
        <input type="text" class="composer-input" id="smmInput" placeholder="Ask about services, rates, order ID..." maxlength="2000" autocomplete="off" />
        <button type="submit" class="send-btn" id="smmSendBtn" aria-label="Send message">
          <svg viewBox="0 0 24 24">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    </div>
  `;
  shadow.appendChild(shell);

  // DOM bindings
  var launcher = shadow.getElementById('smmLauncher');
  var dialog = shadow.getElementById('smmDialog');
  var closeBtn = shadow.getElementById('smmCloseBtn');
  var messageList = shadow.getElementById('smmMessageList');
  var typingContainer = shadow.getElementById('smmTypingContainer');
  var composerForm = shadow.getElementById('smmComposerForm');
  var input = shadow.getElementById('smmInput');
  var sendBtn = shadow.getElementById('smmSendBtn');
  var dialogTitle = shadow.getElementById('smmDialogTitle');
  var launcherTitle = shadow.getElementById('launcherTitle');

  function appendMessage(text, role, timestamp) {
    var row = document.createElement('div');
    row.className = 'msg-row ' + role;

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble ' + role;
    bubble.innerHTML = renderMarkdown(text);

    var time = document.createElement('span');
    time.className = 'msg-time';
    var d = timestamp ? new Date(timestamp) : new Date();
    time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    row.appendChild(bubble);
    row.appendChild(time);
    messageList.appendChild(row);
    messageList.scrollTop = messageList.scrollHeight;
  }

  // Load tenant public config from API
  fetch(hostUrl + '/api/widget/config/' + encodeURIComponent(tenantId))
    .then(function (res) {
      return res.json();
    })
    .then(function (cfg) {
      if (!cfg.enabled) {
        host.style.display = 'none';
        return;
      }
      if (cfg.title) {
        dialogTitle.textContent = cfg.title;
        launcherTitle.textContent = cfg.title;
      }
      if (cfg.accent) {
        host.style.setProperty('--smm-accent', cfg.accent);
      }
      if (cfg.welcome) {
        customWelcome = cfg.welcome;
      }
    })
    .catch(function () {});

  // Load conversation history
  function loadHistory() {
    if (hasLoadedHistory) return;
    hasLoadedHistory = true;

    fetch(hostUrl + '/api/widget/history/' + encodeURIComponent(tenantId) + '/' + encodeURIComponent(sessionId))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.history && data.history.length > 0) {
          data.history.forEach(function (m) {
            appendMessage(m.content, m.role === 'user' ? 'user' : 'bot', m.createdAt);
          });
        } else {
          appendMessage(customWelcome, 'bot');
        }
      })
      .catch(function () {
        appendMessage(customWelcome, 'bot');
      });
  }

  function toggleChat(open) {
    isChatOpen = open !== undefined ? open : !isChatOpen;
    if (isChatOpen) {
      dialog.classList.add('open');
      launcher.setAttribute('aria-expanded', 'true');
      loadHistory();
      setTimeout(function () {
        input.focus();
      }, 100);
    } else {
      dialog.classList.remove('open');
      launcher.setAttribute('aria-expanded', 'false');
    }
  }

  launcher.addEventListener('click', function () {
    toggleChat();
  });

  closeBtn.addEventListener('click', function () {
    toggleChat(false);
    launcher.focus();
  });

  // Dismiss dialog on Escape key (W3C WAI-ARIA modal dialog pattern)
  function handleKeyDown(e) {
    if (isChatOpen && (e.key === 'Escape' || e.key === 'Esc')) {
      toggleChat(false);
      launcher.focus();
    }
  }
  document.addEventListener('keydown', handleKeyDown);
  shadow.addEventListener('keydown', handleKeyDown);

  // Quick Action Chips
  var chips = shadow.querySelectorAll('.chip-btn');
  chips.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var query = btn.getAttribute('data-query');
      if (query) {
        sendMessage(query);
      }
    });
  });

  // Sending a chat message
  function sendMessage(text) {
    var query = (text || input.value || '').trim();
    if (!query) return;

    appendMessage(query, 'user');
    input.value = '';
    sendBtn.disabled = true;
    typingContainer.style.display = 'block';
    messageList.scrollTop = messageList.scrollHeight;

    fetch(hostUrl + '/api/widget/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId: tenantId,
        sessionId: sessionId,
        message: query
      })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        typingContainer.style.display = 'none';
        sendBtn.disabled = false;
        if (data.reply) {
          appendMessage(data.reply, 'bot');
        } else if (data.error) {
          appendMessage('⚠️ ' + data.error, 'bot');
        }
      })
      .catch(function () {
        typingContainer.style.display = 'none';
        sendBtn.disabled = false;
        appendMessage('⚠️ Connection error. Please try again shortly.', 'bot');
      });
  }

  composerForm.addEventListener('submit', function (e) {
    e.preventDefault();
    sendMessage();
  });
})();
