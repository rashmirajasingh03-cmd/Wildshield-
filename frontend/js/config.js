/**
 * Frontend runtime configuration.
 * API base resolution order:
 *   1. localStorage override (window.WildShield.setApiBase)
 *   2. same origin (when backend serves the frontend via STATIC_FRONTEND=true)
 *   3. default local backend port
 */
(function () {
  const DEFAULT_API_BASE =
    window.location.origin.indexOf('localhost') !== -1 ||
    window.location.origin.indexOf('127.0.0.1') !== -1
      ? window.location.origin + '/api'
      : 'http://localhost:5000/api';

  const stored = localStorage.getItem('wildshield.apiBase');
  // Only trust a stored override if it points to a plausible http(s) API URL.
  // A stale/typed-in value would silently route to an old backend and break
  // upload -> videoId -> analysis flow; in that case fall back to the default.
  const storedValid =
    stored &&
    /^https?:\/\/.+/.test(stored) &&
    /\/api\/?$/.test(stored);

  window.WildShield = {
    API_BASE: storedValid ? stored : DEFAULT_API_BASE,
    setApiBase: function (url) {
      localStorage.setItem('wildshield.apiBase', url);
      window.WildShield.API_BASE = url;
    },
    appName: 'WildShield AI',
  };
})();
