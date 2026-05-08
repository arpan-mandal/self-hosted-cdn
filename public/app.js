let currentPath = '';
let currentFiles = [];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  
  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized');
  }
  
  return response;
}

async function login(username, password) {
  const res = await apiRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

async function checkAuth() {
  const res = await apiRequest('/api/check-auth');
  const data = await res.json();
  return data.authenticated;
}

async function getFolderSize(folderPath) {
  return null;
}

async function loadFiles() {
  try {
    const encodedPath = encodeURIComponent(currentPath);
    const res = await fetch(`/api/files/${encodedPath}`);
    const data = await res.json();
    
    if (data.items) {
      renderFileList(data.items);
    }
    
    if (data.totalStorage !== undefined) {
      const formattedStorage = formatBytes(data.totalStorage);
      document.getElementById('storage-usage').textContent = `Storage: ${formattedStorage}`;
      document.getElementById('footer-storage').textContent = formattedStorage;
    }
    
    renderBreadcrumb();
  } catch (error) {
    console.error('Load files error:', error);
    showMessage('Failed to load files', true);
  }
}

function renderFileList(files) {
  const container = document.getElementById('file-list-items');
  
  if (!files || files.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">Empty folder</div>';
    return;
  }
  
  let html = '';
  for (const file of files) {
    html += `
      <div class="file-item" data-path="${escapeHtml(file.path)}">
        <div class="col-name">
          ${file.isDirectory ? 
            `📁 <span class="folder-link" data-path="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>` : 
            `📄 ${escapeHtml(file.name)}`
          }
        </div>
        <div class="col-size">${file.isDirectory ? '—' : formatBytes(file.size)}</div>
        <div class="action-buttons">
          ${!file.isDirectory ? `<button class="action-btn share-btn" data-path="${escapeHtml(file.path)}">Share</button>` : ''}
          <button class="action-btn rename-btn" data-path="${escapeHtml(file.path)}" data-is-dir="${file.isDirectory}">Rename</button>
          <button class="action-btn delete-btn" data-path="${escapeHtml(file.path)}" data-is-dir="${file.isDirectory}">Delete</button>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  document.querySelectorAll('.folder-link').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = el.getAttribute('data-path');
      navigateTo(path);
    });
  });
  
  document.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = btn.getAttribute('data-path');
      showShareModal(path);
    });
  });
  
  document.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = btn.getAttribute('data-path');
      const isDir = btn.getAttribute('data-is-dir') === 'true';
      showRenameModal(path, isDir);
    });
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = btn.getAttribute('data-path');
      const isDir = btn.getAttribute('data-is-dir') === 'true';
      confirmDelete(path, isDir);
    });
  });
}

function navigateTo(path) {
  currentPath = path || '';
  loadFiles();
}

function renderBreadcrumb() {
  const container = document.getElementById('breadcrumb-path');
  if (!currentPath) {
    container.innerHTML = '';
    return;
  }
  
  const parts = currentPath.split('/').filter(p => p);
  let cumulative = '';
  let html = '';
  
  for (let i = 0; i < parts.length; i++) {
    cumulative += (cumulative ? '/' : '') + parts[i];
    html += `<button class="breadcrumb-btn" data-path="${cumulative}">${escapeHtml(parts[i])}</button>`;
    if (i < parts.length - 1) html += ' / ';
  }
  
  container.innerHTML = html;
  
  document.querySelectorAll('.breadcrumb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.getAttribute('data-path');
      navigateTo(path);
    });
  });
}

function showModal(title, inputType = 'text', onSubmit) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>${escapeHtml(title)}</h3>
      <input type="${inputType}" id="modal-input" placeholder="Enter name..." autocomplete="off">
      <div class="modal-buttons">
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-confirm">Confirm</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  const input = modal.querySelector('#modal-input');
  input.focus();
  
  const cleanup = () => modal.remove();
  
  const confirm = () => {
    const value = input.value.trim();
    if (value) {
      cleanup();
      onSubmit(value);
    }
  };
  
  modal.querySelector('#modal-confirm').onclick = confirm;
  modal.querySelector('#modal-cancel').onclick = cleanup;
  input.onkeypress = (e) => {
    if (e.key === 'Enter') confirm();
  };
}

function showShareModal(filePath) {
  const shareUrl = `${window.location.origin}/api/share/${encodeURIComponent(filePath)}`;
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Share File</h3>
      <div class="share-url-container">
        <input type="text" id="share-url" value="${escapeHtml(shareUrl)}" readonly>
        <button class="copy-btn" id="copy-btn">Copy</button>
      </div>
      <div class="modal-buttons" style="justify-content: center;">
        <button class="btn-primary" id="close-modal">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const copyBtn = modal.querySelector('#copy-btn');
  const urlInput = modal.querySelector('#share-url');
  
  copyBtn.onclick = () => {
    urlInput.select();
    document.execCommand('copy');
    showMessage('Link copied to clipboard!', false);
  };
  
  modal.querySelector('#close-modal').onclick = () => modal.remove();
}

function showRenameModal(oldPath, isDirectory) {
  const oldName = oldPath.split('/').pop();
  showModal(`Rename "${oldName}"`, 'text', async (newName) => {
    if (newName === oldName) return;
    
    try {
      const res = await apiRequest('/api/rename', {
        method: 'PUT',
        body: JSON.stringify({ oldPath, newName, isDirectory })
      });
      
      const data = await res.json();
      if (data.success) {
        showMessage(`Renamed to "${newName}"`, false);
        loadFiles();
      } else {
        showMessage(data.error || 'Rename failed', true);
      }
    } catch (error) {
      showMessage('Rename failed', true);
    }
  });
}

function confirmDelete(path, isDirectory) {
  const name = path.split('/').pop();
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Confirm Delete</h3>
      <p>Delete ${isDirectory ? 'folder' : 'file'} "${escapeHtml(name)}"?</p>
      <p style="color: #ff0000; font-size: 12px; margin-top: 10px;">This cannot be undone!</p>
      <div class="modal-buttons" style="margin-top: 20px;">
        <button class="btn-secondary" id="cancel-delete">Cancel</button>
        <button class="delete-btn" id="confirm-delete">Delete</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const cleanup = () => modal.remove();
  
  modal.querySelector('#cancel-delete').onclick = cleanup;
  modal.querySelector('#confirm-delete').onclick = async () => {
    cleanup();
    try {
      const res = await apiRequest('/api/delete', {
        method: 'DELETE',
        body: JSON.stringify({ path, isDirectory })
      });
      
      const data = await res.json();
      if (data.success) {
        showMessage(`Deleted "${name}"`, false);
        loadFiles();
      } else {
        showMessage(data.error || 'Delete failed', true);
      }
    } catch (error) {
      showMessage('Delete failed', true);
    }
  };
}

async function uploadFiles(files) {
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('currentPath', currentPath);
    
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (res.ok) {
        showMessage(`Uploaded: ${file.name}`, false);
      } else {
        const error = await res.json();
        showMessage(`Failed: ${file.name} - ${error.error}`, true);
      }
    } catch (error) {
      showMessage(`Failed: ${file.name}`, true);
    }
  }
  
  loadFiles();
}

async function createFolder() {
  showModal('New Folder Name', 'text', async (name) => {
    try {
      const res = await apiRequest('/api/create-folder', {
        method: 'POST',
        body: JSON.stringify({ folderName: name, currentPath })
      });
      
      const data = await res.json();
      if (data.success) {
        showMessage(`Folder "${name}" created`, false);
        loadFiles();
      } else {
        showMessage(data.error || 'Failed to create folder', true);
      }
    } catch (error) {
      showMessage('Failed to create folder', true);
    }
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function showMessage(msg, isError = true) {
  const toast = document.createElement('div');
  toast.className = `toast-message ${isError ? 'error' : ''}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function logout() {
  await apiRequest('/api/logout', { method: 'POST' });
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('login-container').classList.remove('hidden');
  currentPath = '';
}

async function init() {
  const isAuth = await checkAuth();
  
  if (isAuth) {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    await loadFiles();
  } else {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const result = await login(username, password);
    if (result.success) {
      init();
    } else {
      document.getElementById('login-error').textContent = 'Invalid credentials';
      document.getElementById('login-error').classList.remove('hidden');
    }
  } catch (error) {
    document.getElementById('login-error').textContent = 'Login failed';
    document.getElementById('login-error').classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('create-folder-btn').addEventListener('click', createFolder);
document.getElementById('root-btn').addEventListener('click', () => navigateTo(''));

document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files.length) {
    uploadFiles(Array.from(e.target.files));
    e.target.value = '';
  }
});

const dropZone = document.getElementById('upload-area');
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.opacity = '0.7';
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.style.opacity = '1';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.opacity = '1';
  const files = Array.from(e.dataTransfer.files);
  if (files.length) uploadFiles(files);
});

init();
