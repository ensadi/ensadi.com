// UI Components for Police Sidekick
// Reusable UI components and utilities

// Utility functions
const UI = {
  // Show loading indicator
  showLoading(container = document.body) {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = `
      <div class="loading-spinner"></div>
    `;
    container.appendChild(loading);
    return loading;
  },

  // Hide loading indicator
  hideLoading(loadingElement) {
    if (loadingElement && loadingElement.parentNode) {
      loadingElement.parentNode.removeChild(loadingElement);
    }
  },

  // Show error message
  showError(message, container = document.body) {
    const error = document.createElement('div');
    error.className = 'card';
    error.style.backgroundColor = '#f8d7da';
    error.style.border = '1px solid #f5c6cb';
    error.innerHTML = `
      <div class="card-header">Error</div>
      <div class="card-body">${message}</div>
    `;
    container.appendChild(error);
    setTimeout(() => {
      if (error.parentNode) {
        error.parentNode.removeChild(error);
      }
    }, 5000);
  },

  // Show success message
  showSuccess(message, container = document.body) {
    const success = document.createElement('div');
    success.className = 'card';
    success.style.backgroundColor = '#d4edda';
    success.style.border = '1px solid #c3e6cb';
    success.innerHTML = `
      <div class="card-header">Success</div>
      <div class="card-body">${message}</div>
    `;
    container.appendChild(success);
    setTimeout(() => {
      if (success.parentNode) {
        success.parentNode.removeChild(success);
      }
    }, 3000);
  },

  // Create download button
  createDownloadButton(datasetId, datasetName, status = 'pending') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary download-btn';
    btn.dataset.id = datasetId;
    btn.dataset.name = datasetName;
    btn.dataset.status = status;

    let icon = '⬇';
    let text = 'Download';

    if (status === 'downloading') {
      icon = '⏳';
      text = 'Downloading...';
      btn.disabled = true;
      btn.classList.add('downloading');
    } else if (status === 'downloaded') {
      icon = '✓';
      text = 'Downloaded';
      btn.disabled = true;
      btn.classList.add('btn-secondary');
    } else if (status === 'failed') {
      icon = '⚠';
      text = 'Retry';
      btn.classList.add('btn-danger');
    }

    btn.innerHTML = `${icon} ${text}`;
    return btn;
  },

  // Create view button for free dataset content
  createViewButton(datasetId, datasetName, fileName) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary view-btn';
    btn.dataset.id = datasetId;
    btn.dataset.name = datasetName;
    btn.dataset.fileName = fileName;
    btn.textContent = 'View Free Content';
    return btn;
  },

  // Create progress bar
  createProgressBar(current, total) {
    const container = document.createElement('div');
    container.className = 'progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.width = `${(current / total) * 100}%`;

    container.appendChild(progressBar);
    return container;
  },

  // Create dataset card
  createDatasetCard(dataset) {
    const card = document.createElement('div');
    card.className = 'card dataset-card';
    card.dataset.id = dataset.id;

    let statusBadge = '';
    if (dataset.downloaded) {
      statusBadge = '<span class="dataset-status downloaded">Downloaded</span>';
    } else if (dataset.free) {
      statusBadge = '<span class="dataset-status free">Free</span>';
    }

    const departmentText = dataset.department ? `<p><strong>Department:</strong> ${dataset.department}</p>` : '';
    const locationText = dataset.state || dataset.county || dataset.city ? `<p><strong>Location:</strong> ${[dataset.state, dataset.county, dataset.city].filter(Boolean).join(' · ')}</p>` : '';

    card.innerHTML = `
      <div class="card-header">
        <span>${dataset.name}</span>
        ${statusBadge}
      </div>
      <div class="card-body">
        ${dataset.description ? `<p>${dataset.description}</p>` : ''}
        ${departmentText}
        ${locationText}
        ${dataset.fileCount ? `<p><strong>Files:</strong> ${dataset.fileCount}</p>` : ''}
        ${dataset.size ? `<p><strong>Size:</strong> ${this.formatSize(dataset.size)}</p>` : ''}
      </div>
    `;

    return card;
  },

  // Format file size
  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Debounce function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Check if element is in viewport
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  // Smooth scroll to element
  scrollToElement(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Generate unique ID
  generateId() {
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Deep clone object
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Check if object is empty
  isEmpty(obj) {
    return Object.keys(obj).length === 0;
  },

  // Get current network status
  getNetworkStatus() {
    return navigator.onLine ? 'online' : 'offline';
  },

  // Update connection status indicator
  updateConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      const status = this.getNetworkStatus();
      statusEl.textContent = status === 'online' ? 'Online' : 'Offline';
      statusEl.className = status;
    }
  }
};

// Event listeners for network status
window.addEventListener('online', () => UI.updateConnectionStatus());
window.addEventListener('offline', () => UI.updateConnectionStatus());

// Export UI object
export { UI };
