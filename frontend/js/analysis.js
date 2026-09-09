/**
 * Analysis page logic - minimal threat-only list and detail views.
 * Raw AI detection data (labels, confidence, frames) is never shown.
 */
(function () {
  var auth = window.WildShield.auth;
  var API = window.WildShield.API_BASE;
  var token = null;
  var headers = {};
  var currentPage = 1;

  // OFFICER-only page. Admins/viewers are redirected to their portals.
  auth.guard(['officer']).then(function (user) {
    token = auth.getToken();
    headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    document.getElementById('userInfo').textContent =
      user.name + ' (' + auth.label(user.role) + ')';
    initPage();
  });

  function initPage() {
    var params = new URLSearchParams(window.location.search);
    var detailId = params.get('id');

    if (detailId) {
      showDetail(detailId);
    } else {
      loadList();
    }
  }

  function loadList(page) {
    currentPage = page || 1;
    var container = document.getElementById('analysesList');
    container.innerHTML = '<p class="muted">Loading...</p>';

    fetch(API + '/analysis?page=' + currentPage + '&limit=10', { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error('Failed');
        renderList(data.analyses, data.pagination);
      })
      .catch(function () {
        container.innerHTML = '<p class="muted">Failed to load analyses.</p>';
      });
  }

  function renderList(analyses, pagination) {
    var container = document.getElementById('analysesList');
    var paginationEl = document.getElementById('pagination');

    if (!analyses || analyses.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>No analyses yet</h3><p>Upload a video and start an analysis to see results here.</p><a href="upload.html" class="btn btn-primary" style="margin-top:1rem;">Upload Video</a></div>';
      paginationEl.style.display = 'none';
      return;
    }

    container.innerHTML = '';
    analyses.forEach(function (a) {
      var videoName = a.videoId ? (a.videoId.originalName || 'Unknown') : 'Unknown';
      var result = a.threatResult || {};
      var harm = result.verdict === 'ANIMAL_HARM_DETECTED';
      var statusClass = a.status === 'completed' ? (harm ? 'ok' : 'ok') : a.status === 'failed' ? 'error' : 'pending';

      var div = document.createElement('div');
      div.className = 'analysis-card';
      div.innerHTML =
        '<div class="analysis-card-header">' +
          '<span class="analysis-name">' + videoName + '</span>' +
          '<span class="status-chip ' + statusClass + '"><span class="status-dot"></span>' + a.status + '</span>' +
        '</div>' +
        '<div class="analysis-card-body">' +
          statusLine(a, result) +
          '<span class="analysis-date">' + new Date(a.createdAt).toLocaleString() + '</span>' +
        '</div>';

      div.addEventListener('click', function () {
        showDetail(a._id);
      });

      container.appendChild(div);
    });

    if (pagination && pagination.pages > 1) {
      paginationEl.style.display = 'flex';
      document.getElementById('pageInfo').textContent =
        'Page ' + pagination.page + ' of ' + pagination.pages;
      document.getElementById('prevPage').disabled = pagination.page <= 1;
      document.getElementById('nextPage').disabled = pagination.page >= pagination.pages;
    } else {
      paginationEl.style.display = 'none';
    }
  }

  function statusLine(analysis, result) {
    if (analysis.status !== 'completed') {
      if (analysis.status === 'failed') {
        return '<div class="verdict verdict-clear"><span class="verdict-status">Analysis Failed</span></div>';
      }
      return '<div class="verdict verdict-clear"><span class="verdict-status">' + (analysis.status || '').toUpperCase() + '...</span></div>';
    }
    return verdictLine(result);
  }

  function verdictLine(result) {
    var harm = result.verdict === 'ANIMAL_HARM_DETECTED';
    if (harm) {
      return '<div class="verdict verdict-harm">' +
        '<span class="verdict-status">&#9888;&#65039; Attack Detected</span>' +
        '</div>';
    }
    return '<div class="verdict verdict-clear"><span class="verdict-status">No Attacks Detected</span></div>';
  }

  document.getElementById('prevPage').addEventListener('click', function () {
    loadList(currentPage - 1);
  });

  document.getElementById('nextPage').addEventListener('click', function () {
    loadList(currentPage + 1);
  });

  function showDetail(id) {
    document.getElementById('analysesList').parentElement &&
      (document.getElementById('analysesList').style.display = 'none');
    document.getElementById('pagination').style.display = 'none';
    document.getElementById('detailView').style.display = 'block';

    var card = document.getElementById('detailCard');
    card.innerHTML = '<p class="muted">Loading analysis...</p>';
    stopPolling();

    fetchDetail(id, 0);
  }

  var pollTimer = null;
  var pollStartedAt = 0;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function fetchDetail(id, elapsedShown) {
    fetch(API + '/analysis/' + id, { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error('Not found');
        var status = data.analysis.status;
        if (status === 'queued' || status === 'processing') {
          renderDetail(data.analysis);
          if (!pollTimer) {
            pollStartedAt = Date.now();
            pollTimer = setInterval(function () {
              var secs = Math.round((Date.now() - pollStartedAt) / 1000);
              fetchDetail(id, secs);
            }, 3000);
          }
        } else {
          stopPolling();
          renderDetail(data.analysis);
        }
      })
      .catch(function () {
        stopPolling();
        var card = document.getElementById('detailCard');
        if (card) card.innerHTML = '<p class="muted">Analysis not found.</p>';
      });
  }

  function renderDetail(analysis) {
    var card = document.getElementById('detailCard');
    var videoName = analysis.videoId ? (analysis.videoId.originalName || 'Unknown') : 'Unknown';
    var result = analysis.threatResult || {};
    var harm = result.verdict === 'ANIMAL_HARM_DETECTED';

    var statusClass = 'error';
    var statusText = analysis.status;
    if (analysis.status === 'completed') { statusClass = 'ok'; statusText = 'COMPLETED'; }
    else if (analysis.status === 'processing') { statusClass = 'pending'; statusText = 'PROCESSING'; }
    else if (analysis.status === 'queued') { statusClass = 'pending'; statusText = 'QUEUED'; }
    else if (analysis.status === 'failed') { statusClass = 'error'; statusText = 'FAILED'; }

    var html =
      '<h2>' + videoName + '</h2>' +
      '<div class="detail-meta">' +
        '<span class="status-chip ' + statusClass + '"><span class="status-dot"></span>' + statusText + '</span>' +
        '<span>Date: ' + new Date(analysis.createdAt).toLocaleString() + '</span>' +
      '</div>';

    if (analysis.status === 'failed') {
      html += '<div class="form-msg error" style="display:block;margin-top:1rem;">' +
        '<strong>Analysis failed:</strong> ' + (analysis.error || 'Unknown error occurred while processing the video.') +
        '</div>';
      card.innerHTML = html;
      return;
    }

    if (analysis.status === 'queued' || analysis.status === 'processing') {
      var secs = pollStartedAt ? Math.round((Date.now() - pollStartedAt) / 1000) : 0;
      html += '<div class="notice" style="margin-top:1rem;">' +
        '<strong>Analysis ' + (analysis.status === 'queued' ? 'queued' : 'in progress') + '.</strong> ' +
        'The video is being processed. This page refreshes automatically. ' +
        '<span class="muted">(' + secs + 's elapsed)</span></div>';
      card.innerHTML = html;
      return;
    }

    // Completed - show ONLY the actionable verdict.
    if (!harm) {
      html += '<div class="detail-result detail-result-clear">' +
        '<h3 class="result-title">Status: No Attacks Detected</h3>' +
        '<p class="result-message">' + (result.message || 'No attacks detected.') + '</p>' +
        '</div>';
    } else {
      html += '<div class="detail-result detail-result-harm">' +
        '<h3 class="result-title">Status: &#9888;&#65039; Attack Detected</h3>' +
        '</div>';
    }

    if (analysis.status === 'completed') {
      html += '<div class="detail-actions"><button class="btn btn-primary" id="generateReport">Generate PDF Report</button></div>';
      html += '<div class="detail-actions"><button class="btn btn-ghost" id="downloadReport">Download PDF Report</button></div>';
    }

    card.innerHTML = html;

    var reportBtn = document.getElementById('generateReport');
    if (reportBtn) {
      reportBtn.addEventListener('click', function () {
        reportBtn.disabled = true;
        reportBtn.textContent = 'Generating...';
        fetch(API + '/reports/' + analysis._id, {
          method: 'POST',
          headers: headers,
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.success) {
              alert('Report generated successfully.');
              showDetail(analysis._id);
            } else {
              alert(data.message || 'Failed to generate report');
              reportBtn.disabled = false;
              reportBtn.textContent = 'Generate PDF Report';
            }
          })
          .catch(function () {
            alert('Failed to generate report');
            reportBtn.disabled = false;
            reportBtn.textContent = 'Generate PDF Report';
          });
      });
    }

    var dlBtn = document.getElementById('downloadReport');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        dlBtn.disabled = true;
        dlBtn.textContent = 'Downloading...';
        downloadReport(analysis._id).then(function (ok) {
          dlBtn.disabled = false;
          dlBtn.textContent = 'Download PDF Report';
          if (!ok) alert('No report available. Please generate the report first.');
        });
      });
    }
  }

  function downloadReport(analysisId) {
    return fetch(API + '/reports/download/' + analysisId, { headers: headers })
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
        return false;
      });
  }

  function cleanLabel(l) {
    return String(l).replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  document.getElementById('backToList').addEventListener('click', function () {
    stopPolling();
    window.history.pushState({}, '', 'analysis.html');
    document.getElementById('detailView').style.display = 'none';
    document.getElementById('analysesList').style.display = 'block';
    loadList();
  });

  document.getElementById('logoutBtn').addEventListener('click', auth.logout);
})();