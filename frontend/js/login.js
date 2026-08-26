/**
 * Login page logic - Phase 3: Real JWT authentication.
 */
(function () {
  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var msg = document.getElementById('formMsg');

  function show(kind, text) {
    msg.className = 'form-msg ' + kind;
    msg.textContent = text;
  }

  var token = localStorage.getItem('wildshield.token');
  if (token) {
    fetch(window.WildShield.API_BASE + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) {
        if (res.ok) window.location.href = 'dashboard.html';
      })
      .catch(function () {});
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;

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
      var res = await fetch(window.WildShield.API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });

      var data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('wildshield.token', data.token);
        localStorage.setItem('wildshield.user', JSON.stringify(data.user));
        show('success', 'Login successful. Redirecting...');
        setTimeout(function () {
          window.location.href = 'dashboard.html';
        }, 500);
      } else if (res.status === 401 || res.status === 400) {
        show('error', data.message || 'Invalid credentials.');
      } else {
        show('error', data.message || 'Unexpected server response.');
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
