/**
 * Upload page logic - requires JWT authentication.
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

  if (user.role === 'VIEWER') {
    window.location.href = 'dashboard.html';
    return;
  }

  var API = window.WildShield.API_BASE;
  var headers = { Authorization: 'Bearer ' + token };
  var selectedFile = null;
  var uploadedVideoId = null;

  document.getElementById('userInfo').textContent = user.name + ' (' + user.role + ')';

  // Drop zone
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('videoFile');
  var fileInfo = document.getElementById('fileInfo');
  var uploadBtn = document.getElementById('uploadBtn');

  dropZone.addEventListener('click', function () { fileInput.click(); });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var allowed = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'];
    if (allowed.indexOf(ext) === -1) {
      showMsg('formMsg', 'error', 'Invalid file type. Allowed: ' + allowed.join(', '));
      return;
    }

    var maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      showMsg('formMsg', 'error', 'File exceeds 200MB limit.');
      return;
    }

    selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatSize(file.size);
    fileInfo.style.display = 'flex';
    dropZone.style.display = 'none';
    uploadBtn.disabled = false;
    hideMsg('formMsg');
  }

  document.getElementById('removeFile').addEventListener('click', function () {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.style.display = 'none';
    dropZone.style.display = 'block';
    uploadBtn.disabled = true;
  });

  // Upload form
  document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!selectedFile) return;

    var formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('tags', document.getElementById('tags').value);
    formData.append('notes', document.getElementById('notes').value);

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    hideMsg('formMsg');

    fetch(API + '/videos', {
      method: 'POST',
      headers: headers,
      body: formData,
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.data.message || 'Upload failed');
        }
        uploadedVideoId = result.data.video._id;
        showUploadSuccess();
      })
      .catch(function (err) {
        showMsg('formMsg', 'error', err.message || 'Upload failed. Check your connection.');
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload & Analyze';
      });
  });

  function showUploadSuccess() {
    document.getElementById('uploadCard').style.display = 'none';
    var result = document.getElementById('uploadResult');
    result.style.display = 'block';
    document.getElementById('uploadResultMsg').textContent =
      'Video "' + selectedFile.name + '" uploaded successfully. You can now start the analysis.';
  }

  document.getElementById('analyzeBtn').addEventListener('click', function () {
    if (!uploadedVideoId) return;

    var analyzeBtn = document.getElementById('analyzeBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Starting analysis...';

    fetch(API + '/analysis/run', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ videoId: uploadedVideoId }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.data.message || 'Failed');
        window.location.href = 'analysis.html?id=' + result.data.analysis._id;
      })
      .catch(function (err) {
        alert('Analysis start failed: ' + err.message);
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Start Analysis';
      });
  });

  function showMsg(id, type, msg) {
    var el = document.getElementById(id);
    el.className = 'form-msg ' + type;
    el.textContent = msg;
  }

  function hideMsg(id) {
    var el = document.getElementById(id);
    el.className = 'form-msg';
    el.textContent = '';
  }

  function formatSize(bytes) {
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(1) + ' ' + units[i];
  }

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
  });
})();
