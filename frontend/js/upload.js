/**
 * Upload page logic — OFFICER only (videos:upload).
 */
(function () {
  var auth = window.WildShield.auth;
  var API = window.WildShield.API_BASE;
  var token = null;

  var headers = { };
  var selectedFile = null;
  var uploadedVideoId = null;

  // Officer-only page. Admins/viewers are redirected before the form renders.
  auth.guard(['officer']).then(function (user) {
    token = auth.getToken();
    headers = { Authorization: 'Bearer ' + token };
    document.getElementById('userInfo').textContent =
      user.name + ' (' + auth.label(user.role) + ')';
  });

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

    uploadedVideoId = null;
    localStorage.removeItem('wildshield.lastVideoId');
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
    uploadedVideoId = null;
    localStorage.removeItem('wildshield.lastVideoId');
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
        var video =
          result.data.video ||
          (result.data.videoId ? { _id: result.data.videoId } : null);
        if (!video || !video._id) {
          throw new Error('Upload succeeded but no videoId was returned.');
        }
        uploadedVideoId = video._id;
        localStorage.setItem('wildshield.lastVideoId', uploadedVideoId);
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
    var analyzeBtn = document.getElementById('analyzeBtn');
    var id = uploadedVideoId || localStorage.getItem('wildshield.lastVideoId');

    if (!id) {
      alert(
        'No video is selected for analysis. Please upload the video first.'
      );
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Starting analysis...';

    fetch(API + '/analysis/run', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ videoId: id }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.data.message || 'Failed');
        localStorage.removeItem('wildshield.lastVideoId');
        window.location.href = 'analysis.html?id=' + result.data.analysis._id;
      })
      .catch(function (err) {
        var msg = err.message || 'Failed';
        if (msg && msg.indexOf('videoId is required') !== -1) {
          msg = 'The uploaded video could not be found. Please upload the video again and retry.';
        }
        alert('Analysis start failed: ' + msg);
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

  document.getElementById('logoutBtn').addEventListener('click', auth.logout);
})();
