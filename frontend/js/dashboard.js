/**
 * Officer dashboard — AI operations. Officer-only; admins and viewers are
 * redirected to their own portals.
 */
(function () {
  var API = window.WildShield.API_BASE;
  var auth = window.WildShield.auth;

  function renderDashboard(user) {
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email || '—';
    document.getElementById('userRole').textContent = auth.label(user.role);
    document.getElementById('userSince').textContent =
      new Date(user.createdAt).toLocaleDateString();
    document.getElementById('userInfo').textContent =
      user.name + ' (' + auth.label(user.role) + ')';

    loadStats(user);
  }

  function loadStats(user) {
    var token = auth.getToken();
    var headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

    fetch(API + '/analysis/dashboard', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error('Failed');
        var stats = data.stats;
        document.getElementById('statVideos').textContent = stats.totalVideos;
        document.getElementById('statAnalyses').textContent = stats.totalAnalyses;
        document.getElementById('statThreats').textContent = stats.harmDetectedCount || 0;

        var container = document.getElementById('recentAnalyses');
        if (stats.recentAnalyses && stats.recentAnalyses.length > 0) {
          container.innerHTML = '';
          stats.recentAnalyses.forEach(function (a) {
            var div = document.createElement('div');
            div.className = 'recent-item';
            var videoName = a.videoId ? (a.videoId.originalName || 'Unknown') : 'Unknown';
            var harm = a.threatResult && a.threatResult.verdict === 'ANIMAL_HARM_DETECTED';
            div.innerHTML =
              '<span class="recent-name">' + videoName + '</span>' +
              '<span class="badge ' + (harm ? 'badge-critical' : 'badge-none') + '">' +
                (harm ? '&#9888;&#65039; Attack Detected' : 'No Attacks') +
              '</span>' +
              '<span class="recent-date">' + new Date(a.createdAt).toLocaleDateString() + '</span>';
            container.appendChild(div);
          });
        } else {
          container.innerHTML =
            '<p class="muted">No analyses yet. <a href="upload.html">Upload a video</a> to get started.</p>';
        }
      })
      .catch(function () {
        document.getElementById('statVideos').textContent = '0';
        document.getElementById('statAnalyses').textContent = '0';
        document.getElementById('statThreats').textContent = '0';
      });

    fetch(API + '/health')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        document.getElementById('statStatus').textContent = data.status === 'ok' ? 'Online' : 'Degraded';
      })
      .catch(function () {
        document.getElementById('statStatus').textContent = 'Offline';
      });
  }

  document.getElementById('logoutBtn').addEventListener('click', auth.logout);

  // Officer-only page.
  auth.guard(['officer']).then(renderDashboard);
})();