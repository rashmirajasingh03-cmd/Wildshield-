/**
 * Analysis page logic - list and detail views.
 */
(function () {
  var token = localStorage.getItem('wildshield.token');
  var userStr = localStorage.getItem('wildshield.user');

  if (!token || !userStr) {
    window.location.href = 'login.html';
    return;
  }

  var user;
  try {
    user = JSON.parse(userStr);
  } catch (e) {
    window.location.href = 'login.html';
    return;
  }

  var API = window.WildShield.API_BASE;
  var headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  var currentPage = 1;

  document.getElementById('userInfo').textContent = user.name + ' (' + user.role + ')';

  // Check if we have a detail view via query param
  var params = new URLSearchParams(window.location.search);
  var detailId = params.get('id');

  if (detailId) {
    showDetail(detailId);
  } else {
    loadList();
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
      var highest = a.summary ? a.summary.highestThreat : 'NONE';
      var threats = a.summary ? a.summary.threatsFound : 0;
      var statusClass = a.status === 'completed' ? 'ok' : a.status === 'failed' ? 'error' : 'pending';

      var div = document.createElement('div');
      div.className = 'analysis-card';
      div.innerHTML =
        '<div class="analysis-card-header">' +
          '<span class="analysis-name">' + videoName + '</span>' +
          '<span class="status-chip ' + statusClass + '"><span class="status-dot"></span>' + a.status + '</span>' +
        '</div>' +
        '<div class="analysis-card-body">' +
          '<div class="analysis-meta">' +
            '<span>Detections: <strong>' + (a.summary ? a.summary.totalDetections : 0) + '</strong></span>' +
            '<span>Threats: <strong>' + threats + '</strong></span>' +
            '<span>Highest: <span class="badge badge-' + highest.toLowerCase() + '">' + highest + '</span></span>' +
          '</div>' +
          '<span class="analysis-date">' + new Date(a.createdAt).toLocaleString() + '</span>' +
        '</div>';

      div.addEventListener('click', function () {
        showDetail(a._id);
      });

      container.appendChild(div);
    });

    // Pagination
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

    fetch(API + '/analysis/' + id, { headers: headers })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) throw new Error('Not found');
        renderDetail(data.analysis);
      })
      .catch(function () {
        card.innerHTML = '<p class="muted">Analysis not found.</p>';
      });
  }

  function renderDetail(analysis) {
    var card = document.getElementById('detailCard');
    var videoName = analysis.videoId ? (analysis.videoId.originalName || 'Unknown') : 'Unknown';
    var summary = analysis.summary || {};
    var detections = analysis.detections || [];

    var html =
      '<h2>' + videoName + '</h2>' +
      '<div class="detail-meta">' +
        '<span class="status-chip ' + (analysis.status === 'completed' ? 'ok' : 'error') + '"><span class="status-dot"></span>' + analysis.status + '</span>' +
        '<span>Requested by: ' + (analysis.requestedBy ? analysis.requestedBy.name : 'Unknown') + '</span>' +
        '<span>Date: ' + new Date(analysis.createdAt).toLocaleString() + '</span>' +
        (analysis.processingTimeMs ? '<span>Processing time: ' + Math.round(analysis.processingTimeMs) + 'ms</span>' : '') +
      '</div>' +
      '<div class="detail-section">' +
        '<h3>Summary</h3>' +
        '<div class="summary-grid">' +
          '<div class="summary-item"><span class="summary-label">Total Detections</span><span class="summary-value">' + (summary.totalDetections || 0) + '</span></div>' +
          '<div class="summary-item"><span class="summary-label">Threats Found</span><span class="summary-value">' + (summary.threatsFound || 0) + '</span></div>' +
          '<div class="summary-item"><span class="summary-label">Highest Threat</span><span class="summary-value"><span class="badge badge-' + (summary.highestThreat || 'none').toLowerCase() + '">' + (summary.highestThreat || 'NONE') + '</span></span></div>' +
          '<div class="summary-item"><span class="summary-label">Frames Analyzed</span><span class="summary-value">' + (summary.framesAnalyzed || 0) + ' / ' + (summary.totalFrames || 0) + '</span></div>' +
        '</div>' +
      '</div>';

    if (summary.uniqueLabels && summary.uniqueLabels.length > 0) {
      html += '<div class="detail-section"><h3>Labels Detected</h3><div class="stack-row">';
      summary.uniqueLabels.forEach(function (label) {
        html += '<span class="tag">' + label + '</span>';
      });
      html += '</div></div>';
    }

    if (detections.length > 0) {
      html += '<div class="detail-section"><h3>Detections (' + detections.length + ')</h3>';
      html += '<div class="detections-table"><table><thead><tr>' +
        '<th>Label</th><th>Confidence</th><th>Threat</th><th>Category</th><th>Frame</th>' +
        '</tr></thead><tbody>';

      var sorted = detections.slice().sort(function (a, b) {
        var order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
        return (order[a.threatLevel] || 4) - (order[b.threatLevel] || 4);
      });

      sorted.forEach(function (d) {
        html += '<tr>' +
          '<td>' + d.label + '</td>' +
          '<td>' + (d.confidence * 100).toFixed(1) + '%</td>' +
          '<td><span class="badge badge-' + (d.threatLevel || 'none').toLowerCase() + '">' + (d.threatLevel || 'NONE') + '</span></td>' +
          '<td>' + (d.threatCategory || '-') + '</td>' +
          '<td>' + d.frameIndex + '</td>' +
          '</tr>';
      });

      html += '</tbody></table></div></div>';
    }

    if (analysis.status === 'completed' && analysis.reportPath) {
      html += '<div class="detail-actions"><a href="' + API + '/reports/download/' + analysis._id + '" class="btn btn-primary" target="_blank">Download PDF Report</a></div>';
    } else if (analysis.status === 'completed') {
      html += '<div class="detail-actions"><button class="btn btn-primary" id="generateReport">Generate PDF Report</button></div>';
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
              window.location.href = 'analysis.html?id=' + analysis._id;
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
  }

  document.getElementById('backToList').addEventListener('click', function () {
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
