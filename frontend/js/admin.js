/**
 * Admin console — Officer management (register, edit, reset password,
 * disable/enable). Read-only for nothing else; AI operations are officer-only.
 */
(function () {
  var API = window.WildShield.API_BASE;
  var token = null;
  var editingId = null;

  var form = document.getElementById('officerForm');
  var formTitle = document.getElementById('officerFormTitle');
  var submitBtn = document.getElementById('of_submit');
  var cancelBtn = document.getElementById('of_cancel');
  var formMsg = document.getElementById('of_msg');

  function msg(kind, text) {
    formMsg.className = 'form-msg ' + kind;
    formMsg.textContent = text;
  }

  function clearForm() {
    ['of_name', 'of_username', 'of_password', 'of_officerId', 'of_phone', 'of_email']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    editingId = null;
    formTitle.textContent = 'Register Officer';
    submitBtn.textContent = 'Register Officer';
    cancelBtn.style.display = 'none';
    document.getElementById('of_password').removeAttribute('disabled');
    msg('', '');
  }

  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers.Authorization = 'Bearer ' + token;
    if (options.body && typeof options.body !== 'string') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    return fetch(API + path, options).then(function (res) {
      return res.json().then(function (data) {
        data.status = res.status;
        return data;
      });
    });
  }

  function loadOfficers() {
    var list = document.getElementById('officersList');
    list.innerHTML = '<p class="muted">Loading officers...</p>';

    api('/admin/officers')
      .then(function (data) {
        if (!data.success) {
          list.innerHTML = '<p class="muted">Failed to load officers.</p>';
          return;
        }
        document.getElementById('statOfficers').textContent = data.count;
        var active = (data.officers || []).filter(function (o) { return o.active; }).length;
        document.getElementById('statActive').textContent = active;
        document.getElementById('statDisabled').textContent = (data.count || 0) - active;

        if (!data.officers || data.officers.length === 0) {
          list.innerHTML = '<p class="muted">No officers registered yet.</p>';
          return;
        }

        var rows = data.officers.map(function (o) {
          var statusBadge = o.active
            ? '<span class="badge badge-none">Active</span>'
            : '<span class="badge badge-critical">Disabled</span>';
          return (
            '<div class="officer-row">' +
              '<div class="officer-main">' +
                '<span class="officer-name">' + escapeHtml(o.name) + '</span>' +
                '<span class="officer-sub">@' + escapeHtml(o.username) +
                  (o.officerId ? ' &middot; ' + escapeHtml(o.officerId) : '') +
                  (o.phone ? ' &middot; ' + escapeHtml(o.phone) : '') +
                '</span>' +
                statusBadge +
              '</div>' +
              '<div class="officer-actions">' +
                '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + o._id + '">Edit</button>' +
                '<button class="btn btn-ghost btn-sm" data-act="password" data-id="' + o._id + '">Reset password</button>' +
                (o.active
                  ? '<button class="btn btn-ghost btn-sm" data-act="disable" data-id="' + o._id + '">Disable</button>'
                  : '<button class="btn btn-primary btn-sm" data-act="enable" data-id="' + o._id + '">Enable</button>') +
              '</div>' +
            '</div>'
          );
        }).join('');

        list.innerHTML = rows;
        list.querySelectorAll('button[data-act][data-id]').forEach(function (b) {
          b.addEventListener('click', function () {
            var act = b.getAttribute('data-act');
            var id = b.getAttribute('data-id');
            if (act === 'edit') startEdit(id);
            else if (act === 'password') resetPassword(id);
            else if (act === 'disable') setActive(id, false);
            else if (act === 'enable') setActive(id, true);
          });
        });
      })
      .catch(function () {
        list.innerHTML = '<p class="muted">Failed to load officers.</p>';
      });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function startEdit(id) {
    api('/admin/officers/' + id).then(function (data) {
      if (!data.success || !data.officer) {
        msg('error', 'Could not load officer.');
        return;
      }
      var o = data.officer;
      document.getElementById('of_name').value = o.name || '';
      document.getElementById('of_username').value = o.username || '';
      document.getElementById('of_officerId').value = o.officerId || '';
      document.getElementById('of_phone').value = o.phone || '';
      document.getElementById('of_email').value = o.email || '';
      document.getElementById('of_password').value = '';
      document.getElementById('of_password').setAttribute('disabled', 'disabled');
      editingId = id;
      formTitle.textContent = 'Edit Officer';
      submitBtn.textContent = 'Save Changes';
      cancelBtn.style.display = '';
      msg('info', 'Editing. Password is managed separately via "Reset password".');
      document.getElementById('officerForm').scrollIntoView({ behavior: 'smooth' });
    });
  }

  function resetPassword(id) {
    var pw = window.prompt('Enter a new temporary password (min 8 characters):');
    if (!pw) return;
    if (pw.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    api('/admin/officers/' + id + '/password', { method: 'PATCH', body: { password: pw } })
      .then(function (data) {
        alert(data.message || (data.success ? 'Password updated.' : 'Failed to update password.'));
        if (data.success) loadOfficers();
      });
  }

  function setActive(id, active) {
    api('/admin/officers/' + id + '/status', { method: 'PATCH', body: { active: active } })
      .then(function (data) {
        if (data.success) loadOfficers();
        else alert(data.message || 'Action failed.');
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var payload = {
      name: document.getElementById('of_name').value.trim(),
      username: document.getElementById('of_username').value.trim(),
      password: document.getElementById('of_password').value,
      officerId: document.getElementById('of_officerId').value.trim(),
      phone: document.getElementById('of_phone').value.trim(),
      email: document.getElementById('of_email').value.trim(),
    };

    if (!payload.name || !payload.username) {
      msg('error', 'Name and username are required.');
      return;
    }

    var isEdit = !!editingId;
    if (isEdit) {
      delete payload.password;
      api('/admin/officers/' + editingId, { method: 'PATCH', body: payload })
        .then(function (data) {
          if (data.success) {
            msg('info', 'Officer updated.');
            clearForm();
            loadOfficers();
          } else {
            msg('error', data.message || 'Update failed.');
          }
        });
    } else {
      if (!payload.password || payload.password.length < 8) {
        msg('error', 'Password must be at least 8 characters.');
        return;
      }
      api('/admin/officers', { method: 'POST', body: payload })
        .then(function (data) {
          if (data.success) {
            msg('info', 'Officer registered.');
            clearForm();
            loadOfficers();
          } else {
            msg('error', data.message || 'Registration failed.');
          }
        });
    }
  });

  cancelBtn.addEventListener('click', clearForm);
  document.getElementById('logoutBtn').addEventListener('click', window.WildShield.auth.logout);

  // Admin-only page.
  window.WildShield.auth.guard(['admin']).then(function (user) {
    var info = document.getElementById('userInfo');
    info.textContent = user.name + ' (' + window.WildShield.auth.label(user.role) + ')';
    token = window.WildShield.auth.getToken();
    loadOfficers();
  });
})();