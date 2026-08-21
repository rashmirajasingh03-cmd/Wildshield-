/**
 * Login page logic.
 * Phase 1: posts to /api/auth/login which is an intentional stub (HTTP 501)
 * until real JWT auth lands in Phase 3. The UI communicates this honestly
 * instead of pretending to authenticate.
 */
(function () {
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');
  const msg = document.getElementById('formMsg');

  function show(kind, text) {
    msg.className = 'form-msg ' + kind;
    msg.textContent = text;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      show('error', 'Please enter both email and password.');
      return;
    }
    if (password.length < 8) {
      show('error', 'Password must be at least 8 characters.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const res = await fetch(window.WildShield.API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 501) {
        show(
          'info',
          'Authentication is not implemented yet - it arrives in Phase 3 of the build plan. This page is complete and will connect automatically.'
        );
      } else if (res.ok) {
        // Real handler will be added in Phase 3 (JWT storage + redirect)
        const data = await res.json();
        show('info', 'Login succeeded. Redirect is implemented in Phase 3.');
      } else if (res.status === 401 || res.status === 400) {
        const data = await res.json().catch(function () { return {}; });
        show('error', data.message || 'Invalid credentials.');
      } else {
        show('error', 'Unexpected server response (HTTP ' + res.status + ').');
      }
    } catch (err) {
      show(
        'error',
        'Cannot reach the backend API. Start it with "npm start" inside backend/ (default http://localhost:5000).'
      );
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
})();
