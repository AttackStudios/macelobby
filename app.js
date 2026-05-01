// ============================================================
// EDIT THIS LINE after deploying your Cloudflare Worker.
// You'll get the URL after running `wrangler deploy`.
// ============================================================
const AUTH_API = 'https://macelobby-auth.YOUR-CF-SUBDOMAIN.workers.dev';

const $ = (id) => document.getElementById(id);
const subtitle = $('subtitle');
const tabs = $('tabs');
const form = $('auth-form');
const submitBtn = $('submit-btn');
const statusEl = $('status');
const successBox = $('success');
const confirmLabel = $('confirm-label');
const confirmInput = $('confirm');
const codeInput = $('code');
const passwordInput = $('password');

let mode = 'signup';

function setStatus(text, kind) {
  statusEl.textContent = text || '';
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.mode === m);
  });
  if (m === 'signup') {
    confirmLabel.style.display = '';
    confirmInput.required = true;
    submitBtn.textContent = 'Sign Up';
  } else {
    confirmLabel.style.display = 'none';
    confirmInput.required = false;
    submitBtn.textContent = 'Log In';
  }
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => setMode(t.dataset.mode));
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase();
});

async function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) {
    subtitle.textContent = 'Join the Minecraft server to get your code.';
    return;
  }
  const upper = code.toUpperCase();
  codeInput.value = upper;

  setStatus('Verifying code…', 'info');
  let r;
  try {
    r = await fetch(`${AUTH_API}/api/check-code?code=${encodeURIComponent(upper)}`);
  } catch (e) {
    setStatus('Cannot reach auth server. Try again in a moment.');
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

  submitBtn.disabled = true;
  setStatus(mode === 'signup' ? 'Creating account…' : 'Logging in…', 'info');

  let r;
  try {
    r = await fetch(`${AUTH_API}/api/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password }),
    });
  } catch (err) {
    setStatus('Network error. Check your connection.');
    submitBtn.disabled = false;
    return;
  }
  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok || !data.ok) {
    setStatus(data.error || 'Authentication failed.');
    submitBtn.disabled = false;
    return;
  }

  // Success — hide form, show welcome
  form.hidden = true;
  tabs.hidden = true;
  statusEl.style.display = 'none';
  $('success-name').textContent = data.username;
  successBox.hidden = false;
});

init();
