/**
 * Login page — three role choices.
 * Admin/Officer: username or email + password (backend resolves the real role,
 * never trusts a client-supplied role).
 * Viewer: username only, no password, no registration.
 */
(function () {
  var tabs = document.querySelectorAll('.role-tab');
  var form = document.getElementById('loginForm');
  var identifierInput = document.getElementById('identifier');
  var passwordField = document.getElementById('passwordField');
  var passwordInput = document.getElementById('password');
  var btn = document.getElementById('loginBtn');
  var msg = document.getElementById('formMsg');
  var selectedRole = 'admin';

  function show(kind, text) {
    msg.className = 'form-msg ' + kind;
    msg.textContent = text;
  }

  function hideMsg() {
    msg.className = 'form-msg';
    msg.textContent = '';
  }

  function setRole(role) {
    selectedRole = role;
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-role') === role);
    });

    if (role === 'viewer') {
      identifierInput.setAttribute('placeholder', 'Your viewing username');
      identifierInput.setAttribute('autocomplete', 'username');
      passwordField.style.display = 'none';
      passwordInput.removeAttribute('required');
    } else {
      passwordField.style.display = '';
      passwordInput.setAttribute('required', 'required');
      identifierInput.setAttribute(
        'placeholder',
        role === 'admin'
          ? 'Admin username or email'
          : 'Officer username or email'
      );
    }
    hideMsg();
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      setRole(t.getAttribute('data-role'));
    });
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideMsg();

    var identifier = identifierInput.value.trim();

    if (!identifier) {
      show('error', selectedRole === 'viewer' ? 'Username is required.' : 'Username or email is required.');
      return;
    }

    var url;
    var payload;
    var isPasswordless = selectedRole === 'viewer';

    if (isPasswordless) {
      url = window.WildShield.API_BASE + '/auth/viewer-login';
      payload = { username: identifier };
    } else {
      if (!passwordInput.value) {
        show('error', 'Password is required.');
        return;
      }
      url = window.WildShield.API_BASE + '/auth/login';
      payload = { identifier: identifier, password: passwordInput.value };
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      var data = await res.json();

      if (res.ok && data.token) {
        window.WildShield.auth.setSession(data.token, data.user);
        show('info', 'Login successful. Redirecting...');
        setTimeout(function () {
          window.location.href = window.WildShield.auth.homeFor(data.user.role);
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