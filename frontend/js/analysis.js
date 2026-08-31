/**
 * Analysis page logic - minimal threat-only list and detail views.
 * Raw AI detection data (labels, confidence, frames) is never shown.
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
  var currentPage = 1;

  // Validate token with backend before rendering
  fetch(API + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (res) {
      if (!res.ok) throw new Error('Invalid');
      return res.json();
    })
    .then(function (data) {
      if (!data.success || !data.user) throw new Error('Invalid');
      user = data.user;
      localStorage.setItem('wildshield.user', JSON.stringify(user));
      document.getElementById('userInfo').textContent = user.name + ' (' + user.role + ')';
      initPage();
    })
    .catch(function () {
      localStorage.removeItem('wildshield.token');
      localStorage.removeItem('wildshield.user');
      window.location.href = 'login.html';
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
      var inc = result.incident || {};
      return '<div class="verdict verdict-harm">' +
        '<span class="verdict-status">&#9888;&#65039; Animal Harm Detected</span>' +
        (inc.incident_type ? '<span class="muted">' + inc.incident_type + '</span>' : '') +
        '</div>';
    }
    return '<div class="verdict verdict-clear"><span class="verdict-status">No Threat Detected</span></div>';
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
        '<h3 class="result-title">Status: No Threat Detected</h3>' +
        '<p class="result-message">' + (result.message || 'No animal attack, harm, or abuse was detected in this video.') + '</p>' +
        '</div>';
    } else {
      var inc = result.incident || {};
      html += '<div class="detail-result detail-result-harm">' +
        '<h3 class="result-title">Status: &#9888;&#65039; Animal Harm Detected</h3>' +
        (inc.incident_type ? '<p class="incident-line"><strong>Type of incident:</strong> ' + inc.incident_type + '</p>' : '') +
        '</div>';
    }

    // Temporal / VideoMAE analysis panel (additive - never required).
    var vm = analysis.videomae;
    if (vm) {
      html += '<div class="detail-result detail-result-clear" style="margin-top:1rem;">';
      html += '<h3 class="result-title">Temporal Analysis (VideoMAE)</h3>';
      if (vm.loaded) {
        if (vm.action_class) {
          html += '<p class="incident-line"><strong>Action detected:</strong> ' +
            vm.action_class.replace(/_/g, ' ') + '</p>';
          if (vm.action_confidence) {
            html += '<p class="incident-line"><strong>Action confidence:</strong> ' +
              Math.round(vm.action_confidence * 100) + '%</p>';
          }
        }
        if (vm.threat_level) {
          html += '<p class="incident-line"><strong>Threat level:</strong> ' +
            vm.threat_level + '</p>';
        }
        if (vm.animals_detected && vm.animals_detected.length) {
          html += '<p class="incident-line"><strong>Detected animals:</strong> ' +
            vm.animals_detected.map(cleanLabel).join(', ') + '</p>';
        }
        html += '<p class="incident-line"><strong>Person detected:</strong> ' +
          (vm.person_detected ? 'Yes' : 'No') + '</p>';
        html += '<p class="incident-line"><strong>Weapon detected:</strong> ' +
          (vm.weapon_detected ? 'Yes' : 'No') + '</p>';
        if (vm.reason) {
          html += '<p class="incident-line"><strong>Analysis:</strong> ' + vm.reason + '</p>';
        }
      } else {
        html += '<p class="result-message">Action classifier not available ' +
          (vm.limitation ? '(' + vm.limitation + ')' : '') + '</p>';
      }
      if (vm.limitation && vm.loaded) {
        html += '<p class="muted" style="font-size:0.85rem;margin-top:0.5rem;">' +
          vm.limitation + '</p>';
      }
      html += '</div>';
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

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
  });
})();