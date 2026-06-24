// Storage Manager for Police Sidekick
// Handles LocalStorage for metadata and IndexedDB for large dataset files

const STORAGE_VERSION = '1.0.0';
const DB_NAME = 'police-sidekick-datasets';
const DB_VERSION = 2;

// Object Store Names
const STORE_DATASETS = 'datasets';
const STORE_FILES = 'files';
const STORE_LOADING = 'loading';

// LocalStorage Keys
const LS_DATASETS = 'police-sidekick-datasets';
const LS_CATALOG = 'police-sidekick-catalog';
const LS_LAST_UPDATE = 'police-sidekick-last-update';

// Storage Manager Class
class StorageManager {
  constructor() {
    this.db = null;
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(new Error('Failed to initialize database'));
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create datasets store
        if (!db.objectStoreNames.contains(STORE_DATASETS)) {
          const datasetsStore = db.createObjectStore(STORE_DATASETS, { keyPath: 'id' });
          datasetsStore.createIndex('name', 'name', { unique: false });
          datasetsStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }

        // Create files store
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const filesStore = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
          filesStore.createIndex('datasetId', 'datasetId', { unique: false });
        }

        // Create loading store for temporary files during download
        if (!db.objectStoreNames.contains(STORE_LOADING)) {
          const loadingStore = db.createObjectStore(STORE_LOADING, { keyPath: 'id' });
        }
      };
    });
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ==================== LocalStorage Methods ====================

  // Get datasets from LocalStorage
  getDatasets() {
    try {
      const data = localStorage.getItem(LS_DATASETS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading datasets from LocalStorage:', e);
      return [];
    }
  }

  // Save datasets to LocalStorage
  saveDatasets(datasets) {
    try {
      localStorage.setItem(LS_DATASETS, JSON.stringify(datasets));
    } catch (e) {
      console.error('Error saving datasets to LocalStorage:', e);
    }
  }

  // Get catalog from LocalStorage
  getCatalog() {
    try {
      const data = localStorage.getItem(LS_CATALOG);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error reading catalog from LocalStorage:', e);
      return null;
    }
  }

  // Save catalog to LocalStorage
  saveCatalog(catalog) {
    try {
      localStorage.setItem(LS_CATALOG, JSON.stringify(catalog));
    } catch (e) {
      console.error('Error saving catalog to LocalStorage:', e);
    }
  }

  // Get last update timestamp
  getLastUpdate() {
    try {
      return localStorage.getItem(LS_LAST_UPDATE);
    } catch (e) {
      console.error('Error reading last update from LocalStorage:', e);
      return null;
    }
  }

  // Save last update timestamp
  saveLastUpdate(timestamp) {
    try {
      localStorage.setItem(LS_LAST_UPDATE, timestamp);
    } catch (e) {
      console.error('Error saving last update to LocalStorage:', e);
    }
  }

  // ==================== IndexedDB Methods ====================

  // Add or update dataset metadata
  async addDataset(dataset) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATASETS], 'readwrite');
      const store = transaction.objectStore(STORE_DATASETS);
      const request = store.put(dataset);

      request.onsuccess = () => {
        console.log('Dataset added/updated:', dataset.id);
        resolve();
      };

      request.onerror = (event) => {
        console.error('Error adding dataset:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get dataset by ID
  async getDataset(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATASETS], 'readonly');
      const store = transaction.objectStore(STORE_DATASETS);
      const request = store.get(id);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error getting dataset:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get all datasets
  async getAllDatasets() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATASETS], 'readonly');
      const store = transaction.objectStore(STORE_DATASETS);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error getting all datasets:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Delete dataset
  async deleteDataset(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_DATASETS, STORE_FILES], 'readwrite');
      const datasetsStore = transaction.objectStore(STORE_DATASETS);
      const filesStore = transaction.objectStore(STORE_FILES);

      // Delete dataset metadata
      const deleteDatasetRequest = datasetsStore.delete(id);

      deleteDatasetRequest.onsuccess = () => {
        // Delete all files for this dataset
        const index = filesStore.index('datasetId');
        const request = index.getAll(id);

        request.onsuccess = (event) => {
          const files = (event && event.target && event.target.result) || request.result || [];
          const deleteFilePromises = files.map((file) => {
            return new Promise((resolve, reject) => {
              const fileRequest = filesStore.delete(file.id);
              fileRequest.onsuccess = () => resolve();
              fileRequest.onerror = (event) => reject(event.target.error);
            });
          });

          Promise.all(deleteFilePromises)
            .then(() => {
              console.log('Dataset deleted:', id);
              resolve();
            })
            .catch(reject);
        };

        request.onerror = (event) => reject(event.target.error);
      };

      deleteDatasetRequest.onerror = (event) => reject(event.target.error);
    });
  }

  // Add file to dataset
  async addFile(datasetId, fileName, fileData) {
    const id = `${datasetId}/${fileName}`;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FILES], 'readwrite');
      const store = transaction.objectStore(STORE_FILES);
      const file = {
        id: id,
        datasetId: datasetId,
        name: fileName,
        data: fileData,
        addedAt: new Date().toISOString()
      };
      const request = store.put(file);

      request.onsuccess = () => {
        console.log('File added:', id);
        resolve();
      };

      request.onerror = (event) => {
        console.error('Error adding file:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get file from dataset
  async getFile(datasetId, fileName) {
    const id = `${datasetId}/${fileName}`;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FILES], 'readonly');
      const store = transaction.objectStore(STORE_FILES);
      const request = store.get(id);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error getting file:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Get all files for a dataset
  async getDatasetFiles(datasetId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FILES], 'readonly');
      const store = transaction.objectStore(STORE_FILES);
      const index = store.index('datasetId');
      const request = index.getAll(datasetId);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error getting dataset files:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ==================== Loading Store Methods ====================

  // Add file to loading store (temporary during download)
  async addLoadingFile(datasetId, fileName, fileData) {
    const id = `zloading.${datasetId}/${fileName}`;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_LOADING], 'readwrite');
      const store = transaction.objectStore(STORE_LOADING);
      const file = {
        id: id,
        datasetId: datasetId,
        name: fileName,
        data: fileData,
        addedAt: new Date().toISOString()
      };
      const request = store.put(file);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Get all loading files for a dataset
  async getLoadingFiles(datasetId) {
    const prefix = `zloading.${datasetId}/`;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_LOADING], 'readonly');
      const store = transaction.objectStore(STORE_LOADING);
      const request = store.getAll();

      request.onsuccess = (event) => {
        const files = event.target.result.filter(file => file.id.startsWith(prefix));
        resolve(files);
      };

      request.onerror = (event) => reject(event.target.error);
    });
  }

  // Delete loading files for a dataset
  async deleteLoadingFiles(datasetId) {
    const loadingFiles = await this.getLoadingFiles(datasetId);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_LOADING], 'readwrite');
      const store = transaction.objectStore(STORE_LOADING);
      
      const deletePromises = loadingFiles.map(file => {
        return new Promise((resolve, reject) => {
          const request = store.delete(file.id);
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      });

      Promise.all(deletePromises)
        .then(() => {
          console.log('Loading files deleted for:', datasetId);
          resolve();
        })
        .catch(reject);
    });
  }

  // Commit loading files into the permanent file store
  async commitLoadingFiles(datasetId) {
    const loadingFiles = await this.getLoadingFiles(datasetId);
    if (!loadingFiles.length) {
      return;
    }

    const filePromises = loadingFiles.map((file) => {
      return this.addFile(datasetId, file.name, file.data);
    });

    await Promise.all(filePromises);
    await this.deleteLoadingFiles(datasetId);
  }

  // ==================== Storage Management ====================

  // Get storage usage
  async getStorageUsage() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { used: 0, total: 0, percent: 0 };
    }

    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage,
      total: estimate.quota,
      percent: estimate.quota > 0 ? (estimate.usage / estimate.quota) * 100 : 0
    };
  }

  // Clear all data
  async clearAll() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => {
        localStorage.clear();
        console.log('All data cleared');
        resolve();
      };

      request.onerror = (event) => {
        console.error('Error clearing data:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ==================== Remote Catalog Methods ====================

  // Fetch remote catalog from server
  async fetchRemoteCatalog() {
    try {
      const response = await fetch('/ensadi/PoliceSidekick/DataSets/DataSets.plist');
      if (!response.ok) {
        throw new Error(`Failed to fetch catalog: ${response.status}`);
      }

      const text = await response.text();
      const catalog = this.parseCatalog(text);
      this.saveCatalog(catalog);
      return catalog;
    } catch (error) {
      console.error('Error fetching remote catalog:', error);
      throw error;
    }
  }

  // Parse catalog XML
  parseCatalog(xml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');

      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Failed to parse catalog XML');
      }

      const datasets = [];
      const dictNodes = doc.querySelectorAll('plist > array > dict');

      dictNodes.forEach((dict) => {
        const keys = Array.from(dict.querySelectorAll('key')).map((key) => key.textContent);
        const values = Array.from(dict.querySelectorAll('string')).map((str) => str.textContent);
        const entry = {};

        keys.forEach((key, index) => {
          entry[key] = values[index] || '';
        });

        const descriptionParts = [];
        if (entry.Department) descriptionParts.push(entry.Department);
        if (entry.City) descriptionParts.push(entry.City);
        if (entry.County) descriptionParts.push(entry.County);
        if (entry.State) descriptionParts.push(entry.State);

        const dataset = {
          id: entry.Name || entry.name || '',
          name: entry.Department || entry.Name || 'Unknown Dataset',
          description: descriptionParts.join(' · '),
          state: entry.State || '',
          county: entry.County || '',
          city: entry.City || '',
          department: entry.Department || '',
          free: entry.Free === true || String(entry.Free || '').toLowerCase() === 'true',
          url: entry.Name ? `/ensadi/PoliceSidekick/DataSets/${entry.Name}/` : ''
        };

        datasets.push(dataset);
      });

      return { datasets };
    } catch (error) {
      console.error('Error parsing catalog:', error);
      return null;
    }
  }
}

// Export singleton instance
export const storageManager = new StorageManager();
