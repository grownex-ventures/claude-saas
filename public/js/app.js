// Cloud-SaaS Landing Page Interactive Controller
document.addEventListener('DOMContentLoaded', () => {
  initHealthChecker();
  initBotSimulator();
  initFaqAccordion();
});

/**
 * 1. Live Health Checker
 * Queries /health to display live system status & uptime
 */
async function initHealthChecker() {
  const statusBadge = document.getElementById('system-status');
  const statusText = document.getElementById('status-text');
  
  if (!statusBadge || !statusText) return;

  async function checkHealth() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        const uptimeMins = Math.floor(data.uptime / 60);
        statusText.textContent = `Online • ${uptimeMins}m uptime`;
        statusBadge.style.background = 'rgba(16, 185, 129, 0.12)';
        statusBadge.style.color = '#10b981';
      } else {
        throw new Error('Unhealthy');
      }
    } catch {
      statusText.textContent = 'Degraded • Reconnecting';
      statusBadge.style.background = 'rgba(239, 68, 68, 0.12)';
      statusBadge.style.color = '#ef4444';
    }
  }

  checkHealth();
  // Poll every 30 seconds
  setInterval(checkHealth, 30000);
}

/**
 * 2. Interactive Telegram Bot Simulator
 */
function initBotSimulator() {
  const chatBody = document.getElementById('chat-body');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const chipButtons = document.querySelectorAll('.chip-btn');

  if (!chatBody || !chatInput || !sendBtn) return;

  function appendMessage(text, isUser = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isUser ? 'user' : 'bot'}`;
    bubble.innerHTML = text;
    chatBody.appendChild(bubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function handleSend(userMsg) {
    const text = (userMsg || chatInput.value).trim();
    if (!text) return;

    appendMessage(text, true);
    if (!userMsg) chatInput.value = '';

    // Simulate smart bot response
    setTimeout(() => {
      const lower = text.toLowerCase();
      if (lower.startsWith('/start')) {
        appendMessage('🤖 <b>Welcome to SMM Prime Support Bot!</b><br>Connect your account with <code>/setkey YOUR_API_KEY</code>, or check your <code>/balance</code>.');
      } else if (lower.startsWith('/setkey')) {
        appendMessage('✅ <b>API Key Linked!</b> Your customer session is securely mapped to Tenant <code>smm-prime-reseller</code> with AES-256-GCM encryption.');
      } else if (lower.startsWith('/balance')) {
        appendMessage('💳 <b>Your Current Balance:</b> $142.50 USD<br><i>Fetched in real-time from SMM Panel v2 API</i>');
      } else if (lower.includes('instagram') || lower.includes('follower')) {
        appendMessage('⚡ <b>Instagram Services:</b><br>• ID #104: High Quality Followers - $0.85/k<br>• ID #205: Instant Likes - $0.20/k<br><i>(Served from 24h Redis service cache)</i>');
      } else {
        appendMessage(`🧠 <b>AI Assistant:</b> Thanks for inquiring about "<i>${escapeHtml(text)}</i>". All active services are synced automatically from your SMM provider.`);
      }
    }, 400);
  }

  sendBtn.addEventListener('click', () => handleSend());
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  chipButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const command = btn.getAttribute('data-command');
      if (command) handleSend(command);
    });
  });
}

/**
 * 3. FAQ Accordion
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach((f) => f.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, (s) => entityMap[s]);
}
