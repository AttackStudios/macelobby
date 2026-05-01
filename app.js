const AUTH_API = 'https://macelobby-auth.jhsuttonca.workers.dev';
const TURNSTILE_SITEKEY = '0x4AAAAAADHLZQNZdiKrZZOV';

const $ = (id) => document.getElementById(id);
const subtitle = $('subtitle');
const instructions = $('instructions');
const form = $('verify-form');
const submitBtn = $('submit-btn');
const statusEl = $('status');
const successBox = $('success');
const codeInput = $('code');

let turnstileToken = null;
let turnstileWidgetId = null;

function setStatus(text, kind) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function renderTurnstile(attempt) {
  attempt = attempt || 0;
  if (!window.turnstile || !window.__turnstileReady) {
    if (attempt > 60) {
      const c = $('turnstile-container');
      if (c) c.innerHTML = '<span style="color:#f87171;font-size:12px">Verification failed to load. Disable adblocker / try another browser.</span>';
      return;
    }
    setTimeout(() => renderTurnstile(attempt + 1), 100);
    return;
  }
  if (turnstileWidgetId !== null) {
    window.turnstile.reset(turnstileWidgetId);
    submitBtn.disabled = true;
    turnstileToken = null;
    return;
  }
  try {
    turnstileWidgetId = window.turnstile.render('#turnstile-container', {
      sitekey: TURNSTILE_SITEKEY,
      theme: 'dark',
      size: 'normal',
      callback: (token) => {
        turnstileToken = token;
        submitBtn.disabled = false;
      },
      'error-callback': (err) => {
        turnstileToken = null;
        submitBtn.disabled = true;
        setStatus('Verification error: ' + (err || 'unknown'));
      },
      'expired-callback': () => {
        turnstileToken = null;
        submitBtn.disabled = true;
      },
      'timeout-callback': () => {
        turnstileToken = null;
        submitBtn.disabled = true;
      },
    });
  } catch (e) {
    setStatus('Captcha render failed: ' + e.message);
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) {
    subtitle.textContent = 'Join the Minecraft server to get a verify link.';
    return;
  }
  const upper = code.toUpperCase();
  codeInput.value = upper;

  setStatus('Verifying code…', 'info');
  let r;
  try {
    r = await fetch(`${AUTH_API}/api/check-code?code=${encodeURIComponent(upper)}`);
  } catch (e) {
    setStatus('Cannot reach server. Try again in a moment.');
    subtitle.textContent = '';
    return;
  }
  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok || !data.ok) {
    setStatus(data.error || 'Invalid or expired code.');
    subtitle.textContent = '';
    return;
  }

  setStatus('');
  subtitle.textContent = `Hello, ${data.username}`;
  instructions.hidden = false;
  form.hidden = false;
  renderTurnstile();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Defensive: grab token directly in case callback was racy
  if (!turnstileToken && window.turnstile && turnstileWidgetId !== null) {
    try { turnstileToken = window.turnstile.getResponse(turnstileWidgetId); } catch {}
  }
  if (!turnstileToken) {
    setStatus('Please complete the verification.');
    return;
  }

  const code = codeInput.value.trim().toUpperCase();
  submitBtn.disabled = true;
  setStatus('Verifying…', 'info');

  let r;
  try {
    r = await fetch(`${AUTH_API}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, turnstileToken }),
    });
  } catch (err) {
    setStatus('Network error. Check your connection.');
    if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
    return;
  }
  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok || !data.ok) {
    setStatus(data.error || 'Verification failed.');
    if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
    return;
  }

  form.hidden = true;
  instructions.hidden = true;
  statusEl.style.display = 'none';
  $('success-name').textContent = data.username;
  successBox.hidden = false;
});

init();
