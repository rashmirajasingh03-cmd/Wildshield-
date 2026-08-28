/**
 * Login page logic - real JWT authentication.
 * No auto-redirect on stale tokens. User must always authenticate explicitly.
 */
(function () {
  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var msg = document.getElementById('formMsg');

  function show(kind, text) {
    msg.className = 'form-msg ' + kind;
    msg.textContent = text;
  }

  function hideMsg() {
    msg.className = 'form-msg';
    msg.textContent = '';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideMsg();

    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;

    if (!email) {
      show('error', 'Email is required.');
      return;
    }
    if (!password) {
      show('error', 'Password is required.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      var res = await fetch(window.WildShield.API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });

      var data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('wildshield.token', data.token);
        localStorage.setItem('wildshield.user', JSON.stringify(data.user));
        show('info', 'Login successful. Redirecting...');
        setTimeout(function () {
          window.location.href = 'dashboard.html';
        }, 400);
      } else {
        show('error', data.message || 'Invalid credentials.');
      }
    } catch (err) {
      show(
        'error',
        'Cannot reach the backend API. Start it with "npm start" inside backend/.'
      );
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
})();
