/**
 * Landing status board — presents the live backend /api/health payload.
 * Purely presentational: reads the existing health endpoint (same data and
 * endpoint already used by main.js) and maps the real fields into the
 * "Security status" board. Adds nothing else; does not alter any logic.
 */
(function () {
  var API = window.WildShield.API_BASE;
  var db = document.getElementById('valDb');
  var ai = document.getElementById('valAi');
  var model = document.getElementById('valModel');
  var uptime = document.getElementById('valUptime');
  var ledApi = document.getElementById('ledApi');
  var valApi = document.getElementById('valApi');
  if (!API || !db) return;

  function fmtUptime(seconds) {
    if (seconds == null || isNaN(seconds)) return '—';
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  fetch(API + '/health')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var apiOk = data.status === 'ok';
      var dbConnected = data.database && data.database.connected;

      ledApi.className = 'led ' + (apiOk ? 'led-green' : (data.service ? 'led-amber' : 'led-red'));
      valApi.textContent = apiOk ? 'Online' : (data.service || 'Unreachable');

      db.textContent = dbConnected ? 'Connected' : 'Disconnected';
      db.className = 'row-val ' + (dbConnected ? '' : 'neg');

      var aiState = data.aiService && data.aiService.reachable;
      ai.textContent = aiState ? 'Reachable' : 'Unreachable';
      ai.className = 'row-val ' + (aiState ? '' : 'neg');

      var modelLoaded = data.aiService && data.aiService.modelLoaded;
      model.textContent = modelLoaded ? data.aiService.modelPath || 'Loaded' : 'Not loaded';
      model.className = 'row-val ' + (modelLoaded ? '' : 'neg');

      uptime.textContent = fmtUptime(data.uptimeSeconds);
    })
    .catch(function () {
      ledApi.className = 'led led-red';
      valApi.textContent = 'Unreachable';
      db.textContent = '—';
      ai.textContent = '—';
      model.textContent = '—';
      uptime.textContent = '—';
    });
})();