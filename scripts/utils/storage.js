// Storage utility with size checking and IndexedDB fallback

import { log, logWarn, logError } from './logging.js';

/**
 * Maximum size for chrome.storage.local (5MB per item)
 * Using 4MB as safe limit to account for other data
 */
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB

/**
 * Get size of string in bytes
 * @param {string} str - String to measure
 * @returns {number} Size in bytes
 */
function getStringSize(str) {
  return new Blob([str]).size;
}

/**
 * Get IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function getIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('webpageToPdf', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('largeData')) {
        db.createObjectStore('largeData', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Save data to IndexedDB
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
async function saveToIndexedDB(key, value) {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['largeData'], 'readwrite');
    const store = transaction.objectStore('largeData');
    const request = store.put({ key, value, timestamp: Date.now() });
    
    request.onsuccess = () => {
      log(`Saved ${key} to IndexedDB`, { size: getStringSize(JSON.stringify(value)) });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get data from IndexedDB
 * @param {string} key - Storage key
 * @returns {Promise<any>}
 */
async function getFromIndexedDB(key) {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['largeData'], 'readonly');
    const store = transaction.objectStore('largeData');
    const request = store.get(key);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove data from IndexedDB
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
async function removeFromIndexedDB(key) {
  const db = await getIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['largeData'], 'readwrite');
    const store = transaction.objectStore('largeData');
    const request = store.delete(key);
    
    request.onsuccess = () => {
      log(`Removed ${key} from IndexedDB`);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save data to storage with size checking and IndexedDB fallback
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
export async function saveLargeData(key, value) {
  const valueString = typeof value === 'string' ? value : JSON.stringify(value);
  const size = getStringSize(valueString);
  
  log(`Checking size for ${key}`, { size, maxSize: MAX_STORAGE_SIZE });
  
  if (size > MAX_STORAGE_SIZE) {
    logWarn(`${key} exceeds storage limit (${size} > ${MAX_STORAGE_SIZE}), using IndexedDB`);
    await saveToIndexedDB(key, value);
    // Store flag in chrome.storage to indicate data is in IndexedDB
    await chrome.storage.local.set({ [`${key}_inIndexedDB`]: true });
  } else {
    // Try chrome.storage first
    try {
      await chrome.storage.local.set({ [key]: value });
      // Clear IndexedDB flag if exists
      await chrome.storage.local.remove([`${key}_inIndexedDB`]);
      log(`Saved ${key} to chrome.storage.local`, { size });
    } catch (error) {
      // If chrome.storage fails (e.g., quota exceeded), use IndexedDB
      if (error.message?.includes('QUOTA') || error.message?.includes('quota')) {
        logWarn(`chrome.storage quota exceeded for ${key}, using IndexedDB`);
        await saveToIndexedDB(key, value);
        await chrome.storage.local.set({ [`${key}_inIndexedDB`]: true });
      } else {
        throw error;
      }
    }
  }
}

/**
 * Get data from storage (checks both chrome.storage and IndexedDB)
 * @param {string} key - Storage key
 * @returns {Promise<any>}
 */
export async function getLargeData(key) {
  // Check if data is in IndexedDB
  const result = await chrome.storage.local.get([`${key}_inIndexedDB`]);
  
  if (result[`${key}_inIndexedDB`]) {
    log(`Getting ${key} from IndexedDB`);
    return await getFromIndexedDB(key);
  } else {
    // Get from chrome.storage
    const storageResult = await chrome.storage.local.get([key]);
    return storageResult[key];
  }
}

/**
 * Remove data from storage (both chrome.storage and IndexedDB)
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
export async function removeLargeData(key) {
  // Remove from chrome.storage
  await chrome.storage.local.remove([key, `${key}_inIndexedDB`]);
  
  // Remove from IndexedDB (in case it exists)
  try {
    await removeFromIndexedDB(key);
  } catch (error) {
    // Ignore errors if key doesn't exist
    logWarn(`Could not remove ${key} from IndexedDB`, error);
  }
}





