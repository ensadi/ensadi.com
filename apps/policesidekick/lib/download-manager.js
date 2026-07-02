// Download Manager for Police Sidekick
// Handles dataset downloads from remote server

import { storageManager } from './storage-manager.js';

const BASE_URL = '/ensadi/PoliceSidekick/DataSets';
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Download Manager Class
class DownloadManager {
  constructor() {
    this.downloadQueue = [];
    this.activeDownloads = 0;
    this.downloadListeners = [];
    this.isDownloading = false;
  }

  // Add download to queue
  async queueDownload(datasetId, datasetName) {
    const download = {
      id: datasetId,
      name: datasetName,
      status: 'pending',
      progress: 0,
      retries: 0,
      files: [],
      totalFiles: 0,
      downloadedFiles: 0,
      size: 0,
      downloadedSize: 0,
      startTime: null,
      endTime: null
    };

    this.downloadQueue.push(download);
    
    if (!this.isDownloading) {
      this.startDownloads();
    }

    return download;
  }

  // Start downloads from queue
  async startDownloads() {
    this.isDownloading = true;

    while (this.downloadQueue.length > 0 && this.activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      const download = this.downloadQueue.shift();
      this.startDownload(download);
    }

    if (this.downloadQueue.length === 0 && this.activeDownloads === 0) {
      this.isDownloading = false;
    }
  }

  // Start a single download
  async startDownload(download) {
    this.activeDownloads++;
    download.status = 'downloading';
    download.startTime = new Date().toISOString();
    this.notifyListeners(download);

    try {
      // Get dataset files list
      const datasetInfo = await this.getDatasetFiles(download.id);
      download.totalFiles = datasetInfo.files.length;
      download.files = datasetInfo.files;
      download.version = datasetInfo.version || null;
      download.versionFingerprint = datasetInfo.fingerprint || null;

      // Download each file into temporary loading storage
      for (let i = 0; i < datasetInfo.files.length; i++) {
        const file = datasetInfo.files[i];
        download.progress = ((i + 1) / datasetInfo.files.length) * 100;
        this.notifyListeners(download);

        const downloadedFile = await this.downloadFile(download.id, file.name, file.label);
        download.downloadedFiles++;
        download.downloadedSize += downloadedFile.size || 0;
      }

      // Validate and commit the loading files to permanent storage
      await storageManager.commitLoadingFiles(download.id);

      // Mark as complete
      download.status = 'completed';
      download.endTime = new Date().toISOString();
      this.notifyListeners(download);

      const version = download.version || null;
      const versionFingerprint = download.versionFingerprint || null;

      // Update dataset metadata
      await storageManager.addDataset({
        id: download.id,
        name: download.name,
        lastUpdated: download.endTime,
        fileCount: download.totalFiles,
        size: download.downloadedSize,
        downloaded: true,
        version: version,
        versionFingerprint: versionFingerprint
      });

    } catch (error) {
      console.error(`Download failed for ${download.id}:`, error);
      download.status = 'failed';
      download.error = error.message;
      this.notifyListeners(download);

      // Clean up temporary files for this download attempt
      await storageManager.deleteLoadingFiles(download.id);

      // Retry logic
      if (download.retries < MAX_RETRIES) {
        download.retries++;
        console.log(`Retrying download for ${download.id} (attempt ${download.retries + 1})`);
        setTimeout(() => {
          this.downloadQueue.unshift(download);
          if (!this.isDownloading) {
            this.startDownloads();
          }
        }, RETRY_DELAY * (download.retries + 1));
      }
    } finally {
      this.activeDownloads--;
      if (this.downloadQueue.length > 0 && this.activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
        this.startDownloads();
      }

      if (this.downloadQueue.length === 0 && this.activeDownloads === 0) {
        this.isDownloading = false;
      }
    }
  }

  // Get dataset files list and metadata from Description.plist
  async getDatasetFiles(datasetId) {
    try {
      const { plist, lastModified, etag } = await this.fetchDescriptionMetadata(datasetId);
      const files = this.extractFilesFromPlist(plist);
      const version = this.normalizeVersion(plist.version || plist.Version || null);
      const fingerprint = this.computeVersionFingerprint(files, plist, { lastModified, etag });
      return { files, version, fingerprint };
    } catch (error) {
      console.error(`Error getting files for ${datasetId}:`, error);
      throw error;
    }
  }

  // Fetch dataset file list without downloading files, using Description.plist
  async fetchDescriptionFiles(datasetId) {
    try {
      const { plist } = await this.fetchDescriptionMetadata(datasetId);
      return this.extractFilesFromPlist(plist);
    } catch (error) {
      console.error(`Error fetching description files for ${datasetId}:`, error);
      throw error;
    }
  }

  async fetchDescriptionMetadata(datasetId) {
    const response = await fetch(`${BASE_URL}/${datasetId}/Description.plist`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Description.plist: ${response.status}`);
    }
    const text = await response.text();
    const plist = this.parsePlist(text);
    return {
      plist,
      lastModified: response.headers.get('Last-Modified') || null,
      etag: response.headers.get('ETag') || null
    };
  }

  extractFilesFromPlist(parsedPlist) {
    const filesEntry = parsedPlist.Files || parsedPlist.files || parsedPlist.File || parsedPlist.file;
    if (!filesEntry) {
      throw new Error('No Files section found in Description.plist');
    }

    const files = [];
    if (Array.isArray(filesEntry)) {
      filesEntry.forEach((entry) => {
        if (entry && typeof entry === 'object') {
          const name = entry.name || entry.Name || entry.file || entry.File;
          if (name) {
            files.push({ name: String(name), label: entry.label || '' });
          }
        }
      });
    } else if (typeof filesEntry === 'object') {
      Object.entries(filesEntry).forEach(([label, value]) => {
        if (value) {
          files.push({ name: String(value), label });
        }
      });
    }

    return files;
  }

  normalizeVersion(version) {
    if (!version) {
      return null;
    }

    const normalized = String(version).trim();
    const dateLike = /^[A-Za-z]{3},\s\d{2}\s[A-Za-z]{3}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT$/;
    if (dateLike.test(normalized)) {
      return null;
    }

    return normalized || null;
  }

  computeVersionFingerprint(files, plist = {}, metadata = {}) {
    const fileNames = files.map((file) => file.name).sort();
    if (metadata.lastModified) {
      return `${metadata.lastModified}|${fileNames.join('|')}`;
    }
    if (metadata.etag) {
      return `${metadata.etag}|${fileNames.join('|')}`;
    }

    const fallbackFingerprint = {
      version: plist.version || plist.Version || null,
      name: plist.Name || plist.name || null,
      location: plist.Location || null,
      files: fileNames
    };
    return JSON.stringify(fallbackFingerprint);
  }

  // Download a single file
  async downloadFile(datasetId, fileName, fileLabel = null) {
    const url = `${BASE_URL}/${datasetId}/${fileName}`;
    
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // Store downloaded file in temporary loading storage
      await storageManager.addLoadingFile(datasetId, fileName, arrayBuffer, fileLabel);

      return { name: fileName, size: arrayBuffer.byteLength };
    } catch (error) {
      console.error(`Error downloading ${fileName}:`, error);
      throw error;
    }
  }

  parsePlist(xml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');

      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Failed to parse plist XML');
      }

      const plistRoot = doc.querySelector('plist');
      if (!plistRoot) {
        throw new Error('Invalid plist format');
      }

      const rootElement = Array.from(plistRoot.children).find((node) => node.nodeType === Node.ELEMENT_NODE);
      if (!rootElement) {
        throw new Error('Invalid plist root element');
      }

      return this.parsePlistElement(rootElement);
    } catch (error) {
      console.error('Error parsing plist:', error);
      return null;
    }
  }

  parsePlistElement(element) {
    if (!element) {
      return null;
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === 'dict') {
      const result = {};
      const children = Array.from(element.children);
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        if (child.tagName.toLowerCase() !== 'key') {
          continue;
        }

        const key = child.textContent || '';
        const valueElement = children[i + 1];
        result[key] = this.parsePlistElement(valueElement);
        i += 1;
      }
      return result;
    }

    if (tagName === 'array') {
      return Array.from(element.children).map((child) => this.parsePlistElement(child));
    }

    if (tagName === 'string') {
      return element.textContent || '';
    }

    if (tagName === 'integer' || tagName === 'real') {
      return Number(element.textContent) || 0;
    }

    if (tagName === 'true') {
      return true;
    }

    if (tagName === 'false') {
      return false;
    }

    if (tagName === 'data') {
      return element.textContent || '';
    }

    return element.textContent || null;
  }

  // Add download listener
  addListener(callback) {
    this.downloadListeners.push(callback);
  }

  // Remove download listener
  removeListener(callback) {
    this.downloadListeners = this.downloadListeners.filter(cb => cb !== callback);
  }

  // Notify listeners of download progress
  notifyListeners(download) {
    this.downloadListeners.forEach(callback => {
      try {
        callback(download);
      } catch (error) {
        console.error('Error in download listener:', error);
      }
    });
  }

  // Get all downloads
  getDownloads() {
    return this.downloadQueue;
  }

  // Get download by ID
  getDownload(id) {
    return this.downloadQueue.find(d => d.id === id);
  }

  // Cancel download
  cancelDownload(id) {
    const download = this.getDownload(id);
    if (download && download.status === 'downloading') {
      download.status = 'cancelled';
      this.notifyListeners(download);
    }
  }

  // Cancel all downloads
  cancelAllDownloads() {
    this.downloadQueue.forEach(download => {
      if (download.status === 'downloading') {
        download.status = 'cancelled';
        this.notifyListeners(download);
      }
    });
    this.downloadQueue = [];
    this.isDownloading = false;
  }
}

// Export singleton instance
export const downloadManager = new DownloadManager();
