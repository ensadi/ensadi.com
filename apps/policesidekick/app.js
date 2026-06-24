// Police Sidekick Web Application - Main Application Logic

import { storageManager } from './lib/storage-manager.js';
import { downloadManager } from './lib/download-manager.js';

const DATASET_BASE_URL = '/ensadi/PoliceSidekick/DataSets';

const AppState = {
  datasets: [],
  selectedDataset: null,
  currentView: 'datasets',
  searchQuery: '',
  downloadedOnly: false,
  currentFileName: '',
  updateAvailable: false,
  updateMessage: ''
};

class PoliceSidekickApp {
  constructor() {
    window.policeSidekickApp = this;
    window.AppState = AppState;
    window.downloadManager = downloadManager;
    this.init();
  }

  async init() {
    this.cacheElements();
    this.setupEventListeners();
    await storageManager.init();
    this.registerServiceWorker();
    this.setupNetworkListeners();
    this.updateConnectionStatus();
    this.datasets = this.getSampleDatasets();
    await this.loadSavedDownloads();
    await this.loadCatalog();
    downloadManager.addListener((download) => this.onDownloadUpdate(download));
    this.handleRouteFromHash();
    this.renderDatasets();
    this.showAppStatus('Ready');
    this.setAppUpdateMessage('If updates are available, the app shell will refresh automatically.');
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('./serviceworker.js');
      console.log('Service worker registered:', registration.scope);
      this.setupServiceWorkerUpdateFlow(registration);
      if (registration.active) {
        registration.update();
      }
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  }

  showAppStatus(message) {
    if (this.appStatusText) {
      this.appStatusText.textContent = message;
    }
  }

  setAppUpdateMessage(message) {
    if (this.appUpdateMessage) {
      this.appUpdateMessage.textContent = message;
    }
  }

  setupServiceWorkerUpdateFlow(registration) {
    if (!navigator.serviceWorker || !registration) {
      return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this._refreshing) {
        return;
      }
      this._refreshing = true;
      window.location.reload();
    });

    const checkWaiting = () => {
      const waiting = registration.waiting;
      if (waiting) {
        this.showAppStatus('A new version is ready. Reloading...');
        this.setAppUpdateMessage('A new version is ready and will be applied now.');
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    if (registration.waiting) {
      checkWaiting();
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) {
        return;
      }

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          checkWaiting();
        }
      });
    });
  }

  async checkForUpdates() {
    if (!navigator.serviceWorker) {
      this.showAppStatus('Service worker not supported in this browser.');
      return;
    }

    this.showAppStatus('Checking for app updates...');
    this.setAppUpdateMessage('Checking for updates...');

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        this.showAppStatus('No service worker registration found.');
        return;
      }

      await registration.update();
      if (registration.waiting) {
        this.showAppStatus('Update downloaded. Applying now...');
        this.setAppUpdateMessage('Update downloaded. Applying now...');
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      this.showAppStatus('App is up to date.');
      this.setAppUpdateMessage('No new updates were found.');
    } catch (error) {
      console.warn('Update check failed:', error);
      this.showAppStatus(`Update check failed: ${error.message || error}`);
    }
  }

  async forceUpdateApp() {
    if (!navigator.serviceWorker || !caches) {
      this.showAppStatus('Unable to force update: browser does not support service workers or caches.');
      this.setAppUpdateMessage('Force update not supported in this browser.');
      return;
    }

    this.showAppStatus('Forcing app update and clearing caches...');
    this.setAppUpdateMessage('Clearing service worker caches and reloading the page.');

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((name) => name.startsWith('police-sidekick-'))
        .map((name) => caches.delete(name)));
      window.location.reload();
    } catch (error) {
      console.error('Force update failed:', error);
      this.showAppStatus(`Force update failed: ${error.message || error}`);
    }
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.updateConnectionStatus();
      this.refreshOfflineState();
    });
    window.addEventListener('offline', () => {
      this.updateConnectionStatus();
      this.refreshOfflineState();
    });
  }

  refreshOfflineState() {
    this.renderDatasets();
    if (AppState.currentView === 'dataset-detail') {
      this.renderDatasetDetail();
    }
  }

  updateConnectionStatus() {
    const statusElem = document.getElementById('connection-status');
    if (!statusElem) return;
    if (navigator.onLine) {
      statusElem.textContent = 'Online';
      statusElem.classList.remove('offline');
      statusElem.classList.add('online');
    } else {
      statusElem.textContent = 'Offline';
      statusElem.classList.remove('online');
      statusElem.classList.add('offline');
    }
  }

  cacheElements() {
    this.datasetsContainer = document.getElementById('datasets-container');
    this.datasetDetailContainer = document.getElementById('dataset-detail-container');
    this.fileViewerContainer = document.getElementById('file-viewer-container');
    this.searchInput = document.getElementById('search-input');
    this.downloadedOnlyButton = document.getElementById('downloaded-only-filter-button');
    this.checkUpdatesButton = document.getElementById('check-updates-btn');
    this.forceUpdateButton = document.getElementById('force-update-btn');
    this.appStatusText = document.getElementById('app-status');
    this.appUpdateMessage = document.getElementById('app-update-message');
    this.navLinks = Array.from(document.querySelectorAll('[data-view]'));
    this.mainNav = document.getElementById('main-nav');
    this.menuBtn = document.getElementById('menu-btn');
  }

  setupEventListeners() {
    if (this.menuBtn) {
      this.menuBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.toggleMenu();
      });
    }

    document.addEventListener('click', (event) => {
      const viewLink = event.target.closest('[data-view]');
      if (viewLink) {
        event.preventDefault();
        const view = viewLink.dataset.view;
        this.showView(view);
        this.hideMenu();
        return;
      }

      const downloadBtn = event.target.closest('.download-btn');
      if (downloadBtn) {
        event.preventDefault();
        const datasetId = downloadBtn.dataset.id;
        const datasetName = downloadBtn.dataset.name;
        this.downloadDataset(datasetId, datasetName);
        return;
      }

      const deleteBtn = event.target.closest('.delete-btn');
      if (deleteBtn) {
        event.preventDefault();
        const datasetId = deleteBtn.dataset.id;
        const dataset = this.getDatasetById(datasetId);
        if (dataset) {
          this.confirmDeleteDataset(dataset);
        }
        return;
      }

      const updateBtn = event.target.closest('.update-btn');
      if (updateBtn) {
        event.preventDefault();
        const datasetId = updateBtn.dataset.id;
        const dataset = this.getDatasetById(datasetId);
        if (dataset) {
          this.updateDataset(dataset);
        }
        return;
      }

      const viewBtn = event.target.closest('.view-btn');
      if (viewBtn) {
        event.preventDefault();
        const datasetId = viewBtn.dataset.id;
        const action = viewBtn.dataset.action || 'file';
        if (action === 'detail') {
          this.showDatasetDetail(datasetId);
        } else {
          const fileName = viewBtn.dataset.fileName;
          this.showFileViewer(datasetId, fileName);
        }
        return;
      }

      const fileLink = event.target.closest('.file-link');
      if (fileLink) {
        event.preventDefault();
        const datasetId = fileLink.dataset.datasetId;
        const fileName = fileLink.dataset.fileName;
        this.showFileViewer(datasetId, fileName);
        return;
      }

      const card = event.target.closest('.dataset-card');
      if (card) {
        event.preventDefault();
        const datasetId = card.dataset.id;
        this.showDatasetDetail(datasetId);
        return;
      }

      if (event.target.closest('.back-btn')) {
        if (AppState.currentView === 'file-viewer' && AppState.selectedDataset) {
          this.showDatasetDetail(AppState.selectedDataset.id);
        } else {
          this.showView('datasets');
        }
        this.hideMenu();
      }
    });

    window.addEventListener('hashchange', () => this.handleRouteFromHash());

    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.debounce((event) => {
        AppState.searchQuery = event.target.value;
        this.renderDatasets();
      }, 250));
    }

    if (this.downloadedOnlyButton) {
      this.downloadedOnlyButton.addEventListener('click', () => {
        AppState.downloadedOnly = !AppState.downloadedOnly;
        this.downloadedOnlyButton.classList.toggle('active', AppState.downloadedOnly);
        this.renderDatasets();
      });
    }

    if (this.checkUpdatesButton) {
      this.checkUpdatesButton.addEventListener('click', () => this.checkForUpdates());
    }

    if (this.forceUpdateButton) {
      this.forceUpdateButton.addEventListener('click', () => this.forceUpdateApp());
    }
  }

  async loadSavedDownloads() {
    try {
      const downloaded = await storageManager.getAllDatasets();
      await Promise.all(downloaded.map(async (saved) => {
        let dataset = this.datasets.find((ds) => ds.id === saved.id);
        if (!dataset) {
          dataset = {
            id: saved.id,
            name: saved.name || saved.id,
            description: saved.description || 'Downloaded dataset',
            department: saved.department || '',
            state: saved.state || '',
            county: saved.county || '',
            city: saved.city || '',
            free: false,
            downloaded: true
          };
          this.datasets.push(dataset);
        }

        dataset.downloaded = true;
        dataset.fileCount = saved.fileCount;
        dataset.size = saved.size;
        dataset.version = saved.version || null;
        dataset.versionFingerprint = saved.versionFingerprint || null;
        dataset.lastUpdated = saved.lastUpdated || null;
        const files = await storageManager.getDatasetFiles(saved.id);
        dataset.firstFile = files?.[0]?.name || null;
      }));
    } catch (error) {
      console.warn('Failed to load saved downloads:', error.message || error);
    }
  }

  async loadCatalog() {
    try {
      const cached = storageManager.getCatalog();
      if (cached && Array.isArray(cached.datasets) && cached.datasets.length) {
        this.datasets = this.mergeCatalog(this.datasets, cached.datasets);
      }

      await this.loadSavedDownloads();
      this.renderDatasets();

      const remoteCatalog = await storageManager.fetchRemoteCatalog();
      const catalogDatasets = remoteCatalog?.datasets || [];
      if (catalogDatasets.length) {
        this.datasets = this.mergeCatalog(this.datasets, catalogDatasets);
        storageManager.saveCatalog(remoteCatalog);
        await this.loadSavedDownloads();
        this.renderDatasets();
      }
    } catch (error) {
      console.warn('Catalog load failed:', error.message || error);
    }
  }

  mergeCatalog(baseDatasets, catalogDatasets) {
    const existingById = new Map(baseDatasets.map(ds => [ds.id, ds]));
    catalogDatasets.forEach((catalog) => {
      if (!existingById.has(catalog.id)) {
        existingById.set(catalog.id, catalog);
      }
    });
    return Array.from(existingById.values());
  }

  parseCatalog(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const dicts = Array.from(doc.querySelectorAll('plist > array > dict'));
    const datasets = dicts.map((dict) => {
      const entry = {};
      const nodes = Array.from(dict.children);
      for (let i = 0; i < nodes.length; i += 2) {
        const key = nodes[i];
        const value = nodes[i + 1];
        if (!key || !value) continue;
        if (key.tagName.toLowerCase() !== 'key') continue;
        entry[key.textContent.trim()] = value.textContent.trim();
      }
      return {
        id: entry.Name || entry.name || 'unknown',
        name: entry.Department || entry.Name || entry.name || 'Unknown Dataset',
        description: [entry.Department, entry.City, entry.County, entry.State].filter(Boolean).join(' · '),
        state: entry.State || '',
        county: entry.County || '',
        city: entry.City || '',
        department: entry.Department || '',
        free: String(entry.Free || '').toLowerCase() === 'true',
        file: null,
        catalogueSource: 'remote'
      };
    });
    return datasets;
  }

  getSampleDatasets() {
    return [
      {
        id: 'miranda',
        name: 'Miranda Rights',
        description: 'Free Miranda rights reference content.',
        free: true,
        file: 'Miranda.html'
      },
      {
        id: 'phoenetic',
        name: 'Phonetic Alphabet',
        description: 'Free phonetic alphabet reference content.',
        free: true,
        file: 'Phoenetic.html'
      }
    ];
  }

  showView(viewName, updateHash = true) {
    AppState.currentView = viewName;
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
    this.updateActiveNavLink(viewName);
    if (updateHash) {
      window.location.hash = `#/${viewName}`;
    }
    if (viewName === 'datasets') {
      this.renderDatasets();
    } else if (viewName === 'dataset-detail') {
      this.renderDatasetDetail();
    } else if (viewName === 'file-viewer') {
      this.renderFileViewer();
    }
  }

  handleRouteFromHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('dataset/') && hash.includes('/file/')) {
      const parts = hash.split('/');
      const datasetId = decodeURIComponent(parts[1]);
      const fileName = decodeURIComponent(parts.slice(3).join('/'));
      this.showFileViewer(datasetId, fileName, false);
      return;
    }
    if (hash.startsWith('dataset/')) {
      const datasetId = decodeURIComponent(hash.replace('dataset/', ''));
      this.showDatasetDetail(datasetId, false);
      return;
    }
    const view = ['datasets', 'about'].includes(hash) ? hash : 'datasets';
    this.showView(view, false);
  }

  updateActiveNavLink(viewName) {
    this.navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === viewName));
  }

  getDatasetById(id) {
    return this.datasets.find((dataset) => dataset.id === id);
  }

  renderDatasets() {
    if (!this.datasetsContainer) return;
    const query = AppState.searchQuery.trim().toLowerCase();
    let items = this.datasets;
    if (query) {
      items = items.filter((dataset) => {
        const fields = [dataset.name, dataset.description, dataset.state, dataset.county, dataset.city, dataset.department, dataset.id];
        return fields.some((field) => String(field || '').toLowerCase().includes(query));
      });
    }

    if (AppState.downloadedOnly) {
      items = items.filter((dataset) => dataset.downloaded || dataset.free);
    }

    if (this.downloadedOnlyButton) {
      this.downloadedOnlyButton.classList.toggle('active', AppState.downloadedOnly);
    }

    if (!items.length) {
      const message = AppState.downloadedOnly
        ? '<p>There are no downloaded or free datasets to display.</p>'
        : '<p>Try another search.</p>';
      this.datasetsContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>No datasets found</h3>${message}</div>`;
      return;
    }

    const isOffline = !navigator.onLine;
    this.datasetsContainer.innerHTML = items.map((dataset) => {
      const action = dataset.free
        ? `<button class="btn btn-primary view-btn" data-id="${dataset.id}" data-file-name="${dataset.file}" data-action="file">View Free Content</button>`
        : dataset.downloaded
          ? `<button class="btn btn-primary view-btn" data-id="${dataset.id}" data-action="detail">Open Dataset Details</button>`
          : dataset.downloading
            ? `<button class="btn btn-secondary" disabled>Downloading ${Math.round(dataset.downloadProgress || 0)}%</button>`
            : isOffline
              ? `<button class="btn btn-secondary" disabled>Offline</button>`
              : `<button class="btn btn-primary download-btn" data-id="${dataset.id}" data-name="${dataset.name}">Download</button>`;
      const status = dataset.free
        ? '<span class="dataset-status free">Free</span>'
        : dataset.downloaded
          ? '<span class="dataset-status downloaded">Downloaded</span>'
          : dataset.downloading
            ? '<span class="dataset-status downloading">Downloading</span>'
            : '<span class="dataset-status price">$0.00</span>';
      const progressBar = dataset.downloading
        ? `<div class="download-progress"><div class="download-progress-bar" style="width:${Math.round(dataset.downloadProgress || 0)}%"></div></div>`
        : '';
      return `
        <div class="card dataset-card" data-id="${dataset.id}">
          <div class="card-header">
            <span>${dataset.name}</span>
            ${status}
          </div>
          <div class="card-body">
            <p>${dataset.description || 'No description available.'}</p>
            <div class="dataset-actions">${action}</div>
            ${progressBar}
          </div>
        </div>
      `;
    }).join('');
  }

  showDatasetDetail(datasetId, updateHash = true) {
    const dataset = this.getDatasetById(datasetId);
    if (!dataset) {
      this.datasetDetailContainer.innerHTML = '<p>Dataset not found.</p>';
      this.showView('datasets', updateHash);
      return;
    }
    AppState.selectedDataset = dataset;
    if (updateHash) {
      window.location.hash = `#/dataset/${encodeURIComponent(datasetId)}`;
    }
    this.showView('dataset-detail', false);

    if (dataset.free) {
      return;
    }

    if (dataset.downloaded) {
      if (!dataset.files) {
        this.loadDatasetFiles(dataset);
      }
      this.checkForDatasetUpdate(dataset);
    } else if (!dataset.files) {
      this.loadDescriptionFiles(dataset);
    }
  }

  async checkForDatasetUpdate(dataset) {
    if (!dataset || !dataset.downloaded || dataset.updateChecking) {
      return;
    }

    dataset.updateChecking = true;
    try {
      const { version: remoteVersion, fingerprint: remoteFingerprint } = await downloadManager.getDatasetFiles(dataset.id);
      const localVersion = dataset.version || null;
      const localFingerprint = dataset.versionFingerprint || null;

      if (remoteVersion) {
        dataset.updateAvailable = !localVersion || String(remoteVersion) !== String(localVersion);
        dataset.remoteVersion = dataset.updateAvailable ? remoteVersion : null;
      } else if (remoteFingerprint && localFingerprint) {
        dataset.updateAvailable = remoteFingerprint !== localFingerprint;
        dataset.remoteVersion = dataset.updateAvailable ? 'Updated dataset content' : null;
      } else if (remoteFingerprint && !localFingerprint) {
        dataset.updateAvailable = true;
        dataset.remoteVersion = 'Updated dataset content';
      } else {
        dataset.updateAvailable = false;
        dataset.remoteVersion = null;
      }
    } catch (error) {
      console.warn(`Unable to check dataset version for ${dataset.id}:`, error);
      dataset.updateAvailable = false;
      dataset.remoteVersion = null;
    } finally {
      dataset.updateChecking = false;
      if (AppState.selectedDataset && AppState.selectedDataset.id === dataset.id) {
        this.renderDatasetDetail();
      }
    }
  }

  async updateDataset(dataset) {
    if (!dataset || dataset.downloading) {
      return;
    }
    await this.downloadDataset(dataset.id, dataset.name);
  }

  async confirmDeleteDataset(dataset) {
    const confirmed = await this.showConfirmDialog({
      title: `Delete ${dataset.name}?`,
      message: 'This will remove downloaded files and metadata for this dataset. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) {
      return;
    }

    await this.deleteDataset(dataset.id);
  }

  async deleteDataset(datasetId) {
    const dataset = this.getDatasetById(datasetId);
    if (!dataset) {
      return;
    }

    try {
      await storageManager.deleteLoadingFiles(datasetId);
      await storageManager.deleteDataset(datasetId);
    } catch (error) {
      console.error('Failed to delete dataset:', error);
      await this.showConfirmDialog({
        title: 'Delete failed',
        message: `Unable to delete ${dataset.name}: ${error.message || error}`,
        confirmText: 'OK',
        cancelText: null
      });
      return;
    }

    dataset.downloaded = false;
    dataset.downloading = false;
    dataset.downloadProgress = 0;
    dataset.fileCount = dataset.free ? dataset.fileCount : null;
    dataset.size = null;
    dataset.firstFile = null;
    dataset.files = null;
    dataset.downloadError = null;

    storageManager.saveDatasets(this.datasets);

    if (AppState.selectedDataset && AppState.selectedDataset.id === datasetId) {
      this.showDatasetDetail(datasetId);
    }
    this.renderDatasets();
  }

  async showConfirmDialog({ title, message, confirmText = 'Yes', cancelText = 'Cancel' }) {
    if (!this.confirmDialogContainer) {
      this.confirmDialogContainer = document.createElement('div');
      this.confirmDialogContainer.className = 'confirm-dialog-overlay';
      this.confirmDialogContainer.innerHTML = `
        <div class="confirm-dialog" role="dialog" aria-modal="true">
          <div class="confirm-dialog-header"><h3 class="confirm-dialog-title"></h3></div>
          <div class="confirm-dialog-body"></div>
          <div class="confirm-dialog-actions"></div>
        </div>
      `;
      document.body.appendChild(this.confirmDialogContainer);
    }

    const titleEl = this.confirmDialogContainer.querySelector('.confirm-dialog-title');
    const bodyEl = this.confirmDialogContainer.querySelector('.confirm-dialog-body');
    const actionsEl = this.confirmDialogContainer.querySelector('.confirm-dialog-actions');

    titleEl.textContent = title;
    bodyEl.textContent = message;
    actionsEl.innerHTML = '';

    return new Promise((resolve) => {
      const closeDialog = (result) => {
        this.confirmDialogContainer.classList.remove('active');
        resolve(result);
      };

      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn btn-secondary btn-sm';
      cancelButton.textContent = cancelText || 'Cancel';
      cancelButton.addEventListener('click', () => closeDialog(false));
      actionsEl.appendChild(cancelButton);

      const confirmButton = document.createElement('button');
      confirmButton.className = 'btn btn-danger btn-sm';
      confirmButton.textContent = confirmText;
      confirmButton.addEventListener('click', () => closeDialog(true));
      actionsEl.appendChild(confirmButton);

      if (!cancelText) {
        cancelButton.style.display = 'none';
      }

      this.confirmDialogContainer.classList.add('active');
    });
  }

  async loadDatasetFiles(dataset) {
    try {
      const files = await storageManager.getDatasetFiles(dataset.id);
      dataset.files = (files || []).map((file) => ({ name: file.name, label: file.name }));
      if (AppState.selectedDataset && AppState.selectedDataset.id === dataset.id) {
        this.renderDatasetDetail();
      }
    } catch (error) {
      console.warn('Unable to load dataset files:', error.message || error);
    }
  }

  async loadDescriptionFiles(dataset) {
    try {
      const files = await downloadManager.fetchDescriptionFiles(dataset.id);
      dataset.files = (files || []).map((file) => ({ name: file.name, label: file.label || file.name }));
      if (AppState.selectedDataset && AppState.selectedDataset.id === dataset.id) {
        this.renderDatasetDetail();
      }
    } catch (error) {
      console.warn('Unable to fetch description files:', error.message || error);
    }
  }

  renderDatasetDetail() {
    if (!this.datasetDetailContainer) return;
    const dataset = AppState.selectedDataset;
    if (!dataset) {
      this.datasetDetailContainer.innerHTML = '<p>No dataset selected.</p>';
      return;
    }

    const isOffline = !navigator.onLine;
    const updateButton = dataset.downloaded && dataset.updateAvailable && !dataset.downloading
      ? `<button class="btn btn-secondary update-btn" data-id="${dataset.id}">Update dataset</button>`
      : '';

    const viewButton = dataset.free
      ? `<button class="btn btn-primary view-btn" data-id="${dataset.id}" data-file-name="${dataset.file}" data-action="file">View Free Content</button>`
      : dataset.downloaded
        ? `${updateButton}<button class="btn btn-danger delete-btn" data-id="${dataset.id}">Delete Download</button>`
        : dataset.downloading
          ? `<button class="btn btn-secondary" disabled>Downloading ${Math.round(dataset.downloadProgress || 0)}%</button>`
          : isOffline
            ? `<button class="btn btn-secondary" disabled>Download Dataset</button>`
            : `<button class="btn btn-primary download-btn" data-id="${dataset.id}" data-name="${dataset.name}">Download Dataset</button>`;

    const fileListHtml = dataset.free
      ? `<div class="dataset-file-list"><h3>Free file</h3><ul><li><button class="btn btn-link file-link" data-dataset-id="${dataset.id}" data-file-name="${dataset.file}">${dataset.file}</button></li></ul></div>`
      : dataset.downloaded
        ? (dataset.files
          ? this.renderDatasetFilesList(dataset)
          : `<div class="dataset-file-list"><p>Loading files...</p></div>`)
        : (dataset.files
          ? this.renderDatasetFilesList(dataset)
          : '');

    const offlineNote = !dataset.free && !dataset.downloaded && isOffline
      ? '<p class="offline-note">Offline: this dataset cannot be downloaded until you reconnect.</p>'
      : '';

    const errorNote = dataset.downloadError
      ? `<p class="error-note">Download failed: ${dataset.downloadError}</p>`
      : '';

    this.datasetDetailContainer.innerHTML = `
      <div class="card dataset-detail-card">
        <div class="card-header"><h2>${dataset.name}</h2></div>
        <div class="card-body">
          <p>${dataset.description || 'No description available.'}</p>
          <ul class="dataset-detail-meta">
            ${dataset.department ? `<li><strong>Department:</strong> ${dataset.department}</li>` : ''}
            ${dataset.state ? `<li><strong>State:</strong> ${dataset.state}</li>` : ''}
            ${dataset.city ? `<li><strong>City:</strong> ${dataset.city}</li>` : ''}
            ${dataset.county ? `<li><strong>County:</strong> ${dataset.county}</li>` : ''}
            <li><strong>Free:</strong> ${dataset.free ? 'Yes' : 'No'}</li>
            ${dataset.fileCount ? `<li><strong>Files:</strong> ${dataset.fileCount}</li>` : ''}
            ${dataset.size ? `<li><strong>Size:</strong> ${Math.round(dataset.size / 1024)} KB</li>` : ''}
            <li><strong>Version:</strong> ${dataset.version || '0.0.0'}</li>
            ${dataset.updateAvailable ? `<li class="update-available"><strong>Update available:</strong> ${dataset.remoteVersion || 'Yes'}</li>` : ''}
          </ul>
          <div class="dataset-detail-actions">${viewButton}</div>
          ${offlineNote}
          ${errorNote}
          ${fileListHtml}
        </div>
      </div>
    `;
  }

  renderDatasetFilesList(dataset) {
    if (!dataset.files) {
      return `<div class="dataset-file-list"><p>Loading files...</p></div>`;
    }

    if (!dataset.files.length) {
      return `<div class="dataset-file-list"><p>No files found for this dataset.</p></div>`;
    }

    const items = dataset.files.map((file) => {
      if (dataset.downloaded) {
        return `<li><button class="btn btn-link file-link" data-dataset-id="${dataset.id}" data-file-name="${file.name}">${file.label || file.name}</button></li>`;
      }
      return `<li><span class="dataset-file-name">${file.label || file.name}</span></li>`;
    }).join('');

    return `
      <div class="dataset-file-list">
        <h3>Files</h3>
        <ul>${items}</ul>
      </div>
    `;
  }

  async showFileViewer(datasetId, fileName, updateHash = true) {
    const dataset = this.getDatasetById(datasetId);
    if (!dataset) {
      this.fileViewerContainer.innerHTML = '<p>Dataset not found.</p>';
      this.showView('datasets');
      return;
    }

    if (!fileName && dataset.file) {
      fileName = dataset.file;
    }

    AppState.selectedDataset = dataset;
    AppState.currentFileName = fileName;
    if (updateHash) {
      window.location.hash = `#/dataset/${encodeURIComponent(datasetId)}/file/${encodeURIComponent(fileName)}`;
    }
    this.showView('file-viewer', false);
  }

  async renderFileViewer() {
    if (!this.fileViewerContainer) return;
    const dataset = AppState.selectedDataset;
    const fileName = AppState.currentFileName;
    if (!dataset || !fileName) {
      this.fileViewerContainer.innerHTML = '<p>Unable to load file.</p>';
      return;
    }

    try {
      let content = '';
      if (dataset.free) {
        const response = await fetch(`${DATASET_BASE_URL}/${encodeURIComponent(fileName)}`);
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.status}`);
        }
        content = await response.text();
      } else if (dataset.downloaded) {
        const file = await storageManager.getFile(dataset.id, fileName);
        if (!file || !file.data) {
          throw new Error('Downloaded file not found');
        }
        content = new TextDecoder().decode(file.data instanceof ArrayBuffer ? file.data : file.data);
      } else {
        throw new Error('Dataset is not available for viewing');
      }

      const blob = new Blob([content], { type: 'text/html' });
      const viewerUrl = URL.createObjectURL(blob);
      this.fileViewerContainer.innerHTML = `
        <div class="file-viewer-header card">
          <div class="card-header"><h2>${dataset.name}</h2><p class="file-viewer-file">${fileName}</p></div>
        </div>
        <iframe id="file-viewer-frame" src="${viewerUrl}" sandbox="allow-same-origin allow-scripts" frameborder="0"></iframe>
      `;
      const topBackBtn = document.querySelector('#view-file-viewer > .back-btn');
      if (topBackBtn) {
        topBackBtn.textContent = `← Back to ${dataset.name}`;
      }
    } catch (error) {
      this.fileViewerContainer.innerHTML = `<div class="card"><div class="card-body"><p>Unable to load file: ${error.message}</p></div></div>`;
    }
  }

  async onDownloadUpdate(download) {
    const dataset = this.datasets.find((ds) => ds.id === download.id);
    if (dataset) {
      dataset.downloading = download.status === 'pending' || download.status === 'downloading';
      dataset.downloadProgress = download.progress || 0;
      dataset.downloadError = download.status === 'failed' ? download.error : null;

      if (download.status === 'completed') {
        dataset.downloaded = true;
        dataset.downloading = false;
        dataset.fileCount = download.totalFiles;
        dataset.size = download.downloadedSize;
        dataset.firstFile = download.files[0]?.name || null;
        if (download.version) {
          dataset.version = download.version;
        }
        if (download.versionFingerprint) {
          dataset.versionFingerprint = download.versionFingerprint;
        }
        dataset.updateAvailable = false;
        dataset.remoteVersion = null;
      }

      if (download.status === 'failed') {
        dataset.downloading = false;
      }

      this.renderDatasets();
      if (AppState.selectedDataset && AppState.selectedDataset.id === download.id) {
        this.renderDatasetDetail();
      }
    }
  }

  async downloadDataset(datasetId, datasetName) {
    try {
      await downloadManager.queueDownload(datasetId, datasetName);
      const dataset = this.datasets.find((ds) => ds.id === datasetId);
      if (dataset) {
        dataset.downloading = true;
      }
      this.renderDatasets();
      if (AppState.selectedDataset && AppState.selectedDataset.id === datasetId) {
        this.renderDatasetDetail();
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(`Failed to start download: ${error.message || error}`);
    }
  }

  hideMenu() {
    if (this.mainNav) {
      this.mainNav.classList.add('hidden');
    }
  }

  showMenu() {
    if (this.mainNav) {
      this.mainNav.classList.remove('hidden');
    }
  }

  toggleMenu() {
    if (this.mainNav) {
      this.mainNav.classList.toggle('hidden');
    }
  }

  debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new PoliceSidekickApp();
});
