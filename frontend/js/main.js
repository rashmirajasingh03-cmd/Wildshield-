/**
 * Shared page behavior: footer year + live service status chip.
 * The status chip pings the backend /api/health endpoint so evaluators
 * can immediately see that frontend and backend are connected.
 */
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear() + ' WildShield AI';

  const chip = document.getElementById('systemStatus');
  if (!chip) return;

  const textEl = document.getElementById('systemStatusText');

  async function ping() {
    try {
      const res = await fetch(window.WildShield.API_BASE + '/health', {
        method: 'GET',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      chip.className = 'status-chip online';
      textEl.textContent =
        'API online · DB ' + (data.database && data.database.connected ? 'connected' : 'offline') +
        ' · AI service ' + (data.aiServiceUrl || '');
    } catch (err) {
      chip.className = 'status-chip offline';
      textEl.textContent = 'Backend offline - start it from backend/ (npm start)';
    }
  }

  ping();
  setInterval(ping, 30000);
})();
