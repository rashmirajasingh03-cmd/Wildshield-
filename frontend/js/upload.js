/**
 * Upload page logic - requires JWT authentication.
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
      if (user.role === 'VIEWER') {
        window.location.href = 'dashboard.html';
        return;
      }
      document.getElementById('userInfo').textContent = user.name + ' (' + user.role + ')';
    })
    .catch(function () {
      localStorage.removeItem('wildshield.token');
      localStorage.removeItem('wildshield.user');
      window.location.href = 'login.html';
    });

  var headers = { Authorization: 'Bearer ' + token };
  var selectedFile = null;
  var uploadedVideoId = null;

  // Load model capability info
  fetch(API + '/health')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.aiService && data.aiService.reachable) {
        var h = data.aiService.handles || {};
        var parts = [];
        if (data.aiService.modelLoaded) {
          parts.push('YOLO model loaded (' + (data.aiService.modelClasses || '?') + ' classes)');
          if (h.human) parts.push('human detection: yes');
          if (h.wildlife_animals && h.wildlife_animals.length) parts.push('wildlife: ' + h.wildlife_animals.join(', '));
          if (h.primate_monkey_baboon) parts.push('primate/monkey/baboon: supported');
          else parts.push('primate/monkey/baboon: NOT supported by current model');
          if (h.weapons && h.weapons.length) parts.push('weapons: ' + h.weapons.join(', '));
          else parts.push('weapons: NONE supported');
          if (h.projectiles_arrows_bows && h.projectiles_arrows_bows.length) parts.push('arrows/bows: ' + h.projectiles_arrows_bows.join(', '));
          else parts.push('arrows/bows: NOT supported by current model');
          if (h.traps_snares && h.traps_snares.length) parts.push('traps: ' + h.traps_snares.join(', '));
          else parts.push('traps/snares: NOT supported by current model');
          if (h.environmental_fire && h.environmental_fire.length) parts.push('fire/smoke: ' + h.environmental_fire.join(', '));
          else parts.push('fire/smoke: NOT supported by current model');
        } else {
          parts.push('Model NOT loaded');
        }
        document.getElementById('modelInfo').textContent = parts.join(' · ') +
          '. Detecting threats like baboons, arrows, guns or traps requires a custom-trained model placed at ai-service/models/.';
      } else if (data.aiService && !data.aiService.reachable) {
        document.getElementById('modelInfo').textContent = 'AI service unreachable. Analysis will fail until it runs on port 8000.';
      } else {
        document.getElementById('modelInfo').textContent = 'Unknown model status.';
      }
    })
    .catch(function () {
      document.getElementById('modelInfo').textContent = 'Could not check model status.';
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

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('wildshield.token');
    localStorage.removeItem('wildshield.user');
    window.location.href = 'login.html';
  });
})();
