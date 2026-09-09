/**
 * Viewer portal — read-only reports. No upload, no detection controls,
 * no admin/officer management. Only report listing + download.
 */
(function () {
  var API = window.WildShield.API_BASE;
  var token = null;
  var page = 1;
  var limit = 15;
  var pages = 1;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function downloadReport(analysisId) {
    return fetch(API + '/reports/download/' + analysisId, {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed');
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'report_' + analysisId + '.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      })
      .catch(function () {
        var list = document.getElementById('reportsList');
        list.innerHTML =
          '<p class="muted">Failed to download the report. Please try again.</p>';
        return false;
      });
  }

  function loadReports() {
    var list = document.getElementById('reportsList');
    list.innerHTML = '<p class="muted">Loading reports...</p>';

    fetch(API + '/reports?page=' + page + '&limit=' + limit, {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        pages = data.pages || 1;
        document.getElementById('pageInfo').textContent = 'Page ' + page + ' of ' + pages;
        document.getElementById('pagination').style.display = pages > 1 ? '' : 'none';
        document.getElementById('prevPage').disabled = page <= 1;
        document.getElementById('nextPage').disabled = page >= pages;

        if (!data.success) throw new Error('load failed');
        if (!data.reports || data.reports.length === 0) {
          list.innerHTML = '<p class="muted">No reports have been generated yet.</p>';
          return;
        }

        var items = data.reports.map(function (r) {
          var a = r.analysisId || {};
          var video = a.videoId || {};
          var verdict = a.threatResult && a.threatResult.verdict;
          var harm = verdict === 'ANIMAL_HARM_DETECTED';
          return (
            '<div class="recent-item">' +
              '<div class="recent-detail">' +
                '<span class="recent-name">' + escapeHtml(video.originalName || 'Video analysis') + '</span>' +
                '<span class="recent-sub">' +
                  '<span class="badge ' + (harm ? 'badge-critical' : 'badge-none') + '">' +
                    (harm ? 'Attack Detected' : 'No Attacks') +
                  '</span>' +
                  '<span class="muted">' + new Date(r.createdAt).toLocaleString() + '</span>' +
                '</span>' +
              '</div>' +
              '<button class="btn btn-primary btn-sm download-report" data-id="' + a._id + '">Download PDF</button>' +
            '</div>'
          );
        }).join('');

        list.innerHTML = items;
      })
      .catch(function () {
        list.innerHTML = '<p class="muted">Failed to load reports.</p>';
      });
  }

  document.getElementById('prevPage').addEventListener('click', function () {
    if (page > 1) { page -= 1; loadReports(); }
  });
  document.getElementById('nextPage').addEventListener('click', function () {
    if (page < pages) { page += 1; loadReports(); }
  });
  document.getElementById('reportsList').addEventListener('click', function (e) {
    var btn = e.target.closest('.download-report');
    if (btn && btn.getAttribute('data-id')) {
      downloadReport(btn.getAttribute('data-id'));
    }
  });
  document.getElementById('logoutBtn').addEventListener('click', window.WildShield.auth.logout);

  // Viewer-only page.
  window.WildShield.auth.guard(['viewer']).then(function (user) {
    var info = document.getElementById('userInfo');
    info.textContent = user.username + ' (Viewer)';
    token = window.WildShield.auth.getToken();
    loadReports();
  });
})();