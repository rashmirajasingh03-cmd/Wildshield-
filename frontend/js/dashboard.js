/**
 * Dashboard page logic - requires valid JWT authentication.
 * Validates token with backend on every page load.
 */
(function () {
  var token = localStorage.getItem('wildshield.token');
  var userStr = localStorage.getItem('wildshield.user');

  if (!token || !userStr) {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
    return;
  }

  var user;
  try {
    user = JSON.parse(userStr);
  } catch (e) {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
    return;
  }

  var API = window.WildShield.API_BASE;
  var headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Validate token with backend before rendering anything
  fetch(API + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('Token invalid');
      }
      return res.json();
    })
    .then(function (data) {
      if (!data.success || !data.user) {
        throw new Error('Invalid response');
      }
      // Update user data from server
      user = data.user;
      localStorage.setItem('wildshield.user', JSON.stringify(user));
      renderDashboard();
    })
    .catch(function () {
      localStorage.removeItem('wildshield.token');
      localStorage.removeItem('wildshield.user');
      window.location.href = 'login.html';
    });

  function renderDashboard() {
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userRole').textContent = user.role;
    document.getElementById('userSince').textContent = new Date(user.createdAt).toLocaleDateString();
    document.getElementById('userInfo').textContent = user.name + ' (' + user.role + ')';

    if (user.role === 'VIEWER') {
      var uploadBtn = document.querySelector('.dash-actions .btn-primary');
      if (uploadBtn) uploadBtn.style.display = 'none';
    }

    loadStats();
  }

  function loadStats() {
    fetch(API + '/analysis/dashboard', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error('Failed');
        var stats = data.stats;
        document.getElementById('statVideos').textContent = stats.totalVideos;
        document.getElementById('statAnalyses').textContent = stats.totalAnalyses;

        var totalThreats = 0;
        if (stats.threats) {
          for (var k in stats.threats) {
            if (k !== 'NONE' && k !== 'LOW') totalThreats += stats.threats[k];
          }
        }
        document.getElementById('statThreats').textContent = totalThreats;

        var container = document.getElementById('recentAnalyses');
        if (stats.recentAnalyses && stats.recentAnalyses.length > 0) {
          container.innerHTML = '';
          stats.recentAnalyses.forEach(function (a) {
            var div = document.createElement('div');
            div.className = 'recent-item';
            var videoName = a.videoId ? (a.videoId.originalName || 'Unknown') : 'Unknown';
            var threat = a.summary ? a.summary.highestThreat : 'NONE';
            div.innerHTML =
              '<span class="recent-name">' + videoName + '</span>' +
              '<span class="badge badge-' + threat.toLowerCase() + '">' + threat + '</span>' +
              '<span class="recent-date">' + new Date(a.createdAt).toLocaleDateString() + '</span>';
            container.appendChild(div);
          });
        } else {
          container.innerHTML = '<p class="muted">No analyses yet. <a href="upload.html">Upload a video</a> to get started.</p>';
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

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
  });
})();
