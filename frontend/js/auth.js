/**
 * Shared authentication + role helpers for every console page.
 * Load AFTER config.js so window.WildShield exists.
 */
(function () {
  var WS = window.WildShield;

  function getToken() {
    return localStorage.getItem('wildshield.token');
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('wildshield.user'));
    } catch (e) {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem('wildshield.token', token);
    localStorage.setItem('wildshield.user', JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
  }

  function logout() {
    clearSession();
    window.location.href = 'login.html';
  }

  // Where each role lands after login.
  function homeFor(role) {
    if (role === 'admin') return 'admin.html';
    if (role === 'officer') return 'dashboard.html';
    if (role === 'viewer') return 'viewer.html';
    return 'login.html';
  }

  // Validate the stored token with the backend and refresh the stored user.
  function validate() {
    var token = getToken();
    var stored = getUser();
    if (!token || !stored) {
      clearSession();
      window.location.href = 'login.html';
      return Promise.reject(new Error('no-session'));
    }
    return fetch(WS.API_BASE + '/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('invalid-token');
        return res.json();
      })
      .then(function (data) {
        if (!data.success || !data.user) throw new Error('invalid-data');
        setSession(token, data.user);
        return data.user;
      })
      .catch(function (err) {
        clearSession();
        window.location.href = 'login.html';
        throw err;
      });
  }

  // Guard a page for one or more roles. Redirects elsewhere on mismatch.
  function guard(roles) {
    return validate().then(function (user) {
      if (roles.indexOf(user.role) === -1) {
        window.location.href = homeFor(user.role);
        throw new Error('wrong-role');
      }
      return user;
    });
  }

  function label(role) {
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : '';
  }

  WS.auth = {
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    logout: logout,
    homeFor: homeFor,
    validate: validate,
    guard: guard,
    label: label,
  };
})();