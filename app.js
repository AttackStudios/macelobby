// ============================================================
// EDIT after deploying your Cloudflare Worker:
const AUTH_API = 'https://macelobby-auth.jhsuttonca.workers.dev';
// EDIT after creating your Turnstile widget in Cloudflare dashboard:
//   Cloudflare → Turnstile → Add Site → use attackstudios.github.io
//   Replace this with your real sitekey.
//   Currently: official Cloudflare testing key (always passes — does not
//   actually protect anything until swapped for a production key).
const TURNSTILE_SITEKEY = '0x4AAAAAADHLZQNZdiKrZZOV';
// ============================================================

const $ = (id) => document.getElementById(id);
const subtitle = $('subtitle');
const tabs = $('tabs');
const form = $('auth-form');
const submitBtn = $('submit-btn');
const statusEl = $('status');
const successBox = $('success');
const confirmField = $('confirm-field');
const confirmInput = $('confirm');
const codeInput = $('code');
const passwordInput = $('password');
const revealBtn = $('reveal-password');
const forgotLink = $('forgot-link');
const backToLoginLink = $('back-to-login');
const passwordLabel = $('password-label');
const confirmLabelText = $('confirm-label-text');

let mode = 'signup';
let lastNonResetMode = 'login';
let turnstileToken = null;
let turnstileWidgetId = null;

function renderTurnstile(attempt) {
  attempt = attempt || 0;
  if (!window.turnstile || !window.__turnstileReady) {
    if (attempt > 60) {
      console.error('[turnstile] script never loaded after 6s');
      const c = document.getElementById('turnstile-container');
      if (c) c.innerHTML = '<span style="color:#f87171;font-size:12px">Verification failed to load. Disable adblocker / try another browser.</span>';
      return;
    }
    setTimeout(() => renderTurnstile(attempt + 1), 100);
    return;
  }
  if (turnstileWidgetId !== null) {
    console.log('[turnstile] reset existing widget');
    window.turnstile.reset(turnstileWidgetId);
    return;
  }
  console.log('[turnstile] rendering widget, sitekey=' + TURNSTILE_SITEKEY);
  try {
    turnstileWidgetId = window.turnstile.render('#turnstile-container', {
      sitekey: TURNSTILE_SITEKEY,
      theme: 'dark',
      size: 'normal',
      callback: (token) => {
        console.log('[turnstile] token received');
        turnstileToken = token;
      },
      'error-callback': (err) => {
        console.error('[turnstile] error:', err);
        turnstileToken = null;
        setStatus('Verification error: ' + (err || 'unknown'));
      },
      'expired-callback': () => { turnstileToken = null; },
      'timeout-callback': () => { turnstileToken = null; },
    });
    console.log('[turnstile] render returned widgetId=' + turnstileWidgetId);
  } catch (e) {
    console.error('[turnstile] render threw:', e);
    setStatus('Captcha render failed: ' + e.message);
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function setMode(m) {
  mode = m;
  if (m === 'signup' || m === 'login') lastNonResetMode = m;

  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === m);
  });
  tabs.hidden = (m === 'reset');

  if (m === 'signup') {
    confirmField.style.display = '';
    confirmInput.required = true;
    submitBtn.textContent = 'Sign Up';
    passwordLabel.textContent = 'Password';
    confirmLabelText.textContent = 'Confirm password';
    forgotLink.hidden = true;
    backToLoginLink.hidden = true;
  } else if (m === 'login') {
    confirmField.style.display = 'none';
    confirmInput.required = false;
    confirmInput.value = '';
    submitBtn.textContent = 'Log In';
    passwordLabel.textContent = 'Password';
    forgotLink.hidden = false;
    backToLoginLink.hidden = true;
  } else if (m === 'reset') {
    confirmField.style.display = '';
    confirmInput.required = true;
    submitBtn.textContent = 'Reset password';
    passwordLabel.textContent = 'New password';
    confirmLabelText.textContent = 'Confirm new password';
    passwordInput.value = '';
    confirmInput.value = '';
    forgotLink.hidden = true;
    backToLoginLink.hidden = false;
  }
}

forgotLink.addEventListener('click', (e) => { e.preventDefault(); setMode('reset'); passwordInput.focus(); });
backToLoginLink.addEventListener('click', (e) => { e.preventDefault(); setMode(lastNonResetMode); passwordInput.focus(); });

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => setMode(t.dataset.mode));
});

revealBtn.addEventListener('click', () => {
  const pressed = revealBtn.getAttribute('aria-pressed') === 'true';
  const next = !pressed;
  revealBtn.setAttribute('aria-pressed', String(next));
  revealBtn.setAttribute('aria-label', next ? 'Hide password' : 'Show password');
  passwordInput.type = next ? 'text' : 'password';
  passwordInput.focus();
});

async function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) {
    subtitle.textContent = 'Join the Minecraft server to get a code.';
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
  tabs.hidden = false;
  form.hidden = false;
  setMode(data.isSignup ? 'signup' : 'login');
  passwordInput.focus();
  renderTurnstile();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  const password = passwordInput.value;
  if (password.length < 8) {
    setStatus('Password must be at least 8 characters.');
    return;
  }
  if (mode === 'signup' && password !== confirmInput.value) {
    setStatus('Passwords do not match.');
    return;
  }
  // Fallback: if callback hasn't fired yet, grab the token directly.
  if (!turnstileToken && window.turnstile && turnstileWidgetId !== null) {
    try { turnstileToken = window.turnstile.getResponse(turnstileWidgetId); } catch {}
  }
  if (!turnstileToken) {
    setStatus('Please complete the verification check.');
    return;
  }

  submitBtn.disabled = true;
  setStatus(mode === 'signup' ? 'Creating account…' : 'Logging in…', 'info');

  let r;
  try {
    r = await fetch(`${AUTH_API}/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password, turnstileToken }),
    });
  } catch (err) {
    setStatus('Network error. Check your connection.');
    submitBtn.disabled = false;
    if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
    return;
  }
  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok || !data.ok) {
    setStatus(data.error || 'Authentication failed.');
    submitBtn.disabled = false;
    if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    turnstileToken = null;
    return;
  }

  form.hidden = true;
  tabs.hidden = true;
  statusEl.style.display = 'none';
  $('success-name').textContent = data.username;
  successBox.hidden = false;
});

init();
