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

  window.WildShield = {
    API_BASE: stored || DEFAULT_API_BASE,
    setApiBase: function (url) {
      localStorage.setItem('wildshield.apiBase', url);
      window.WildShield.API_BASE = url;
    },
    appName: 'WildShield AI',
  };
})();
