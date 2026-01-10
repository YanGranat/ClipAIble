// @ts-check
// PDF storage - saves PDF data to IndexedDB for reuse without tab access

import { log, logError, logWarn } from '../utils/logging.js';

const DB_NAME = 'ClipAIblePDFStorage';
const STORE_NAME = 'pdfFiles';
const DB_VERSION = 1;

// Singleton pattern: reuse database connection to avoid multiple connections
let dbInstance = null;
let dbPromise = null;
let dbInactivityTimeout = null;
const DB_INACTIVITY_TIMEOUT_MS = 30 * 1000; // 30 seconds - close connection after inactivity

/**
 * Safely close database connection
 * @param {IDBDatabase} db - Database instance to close
 */
function safeCloseDatabase(db) {
  try {
    if (db && typeof db.close === 'function') {
      // Check if database is still open (not already closed)
      // objectStoreNames is only available on open databases
      if (db.objectStoreNames && db.objectStoreNames.length > 0) {
        db.close();
      }
    }
  } catch (e) {
    // Ignore errors during cleanup - database might already be closed
    logWarn('[PDF Storage] Error during database cleanup (non-critical)', { error: e.message });
  }
}

/**
 * Schedule database connection closure after inactivity timeout
 * This prevents the connection from staying open indefinitely
 */
function scheduleDbClose() {
  // Clear existing timeout
  if (dbInactivityTimeout) {
    clearTimeout(dbInactivityTimeout);
    dbInactivityTimeout = null;
  }
  
  // Schedule new timeout
  dbInactivityTimeout = setTimeout(() => {
    if (dbInstance) {
      log('[PDF Storage] Closing database connection due to inactivity timeout', {
        timeout: DB_INACTIVITY_TIMEOUT_MS
      });
      safeCloseDatabase(dbInstance);
      dbInstance = null;
      dbPromise = null;
    }
    dbInactivityTimeout = null;
  }, DB_INACTIVITY_TIMEOUT_MS);
}

/**
 * Reset inactivity timeout - call this before each database operation
 */
function resetDbInactivityTimeout() {
  if (dbInstance) {
    scheduleDbClose();
  }
}

/**
 * Get IndexedDB database for PDF storage
 * Uses singleton pattern to reuse connection and avoid race conditions
 * @returns {Promise<IDBDatabase>}
 */
function getPDFDatabase() {
  // Return existing connection if available and still open
  if (dbInstance && dbInstance.objectStoreNames && dbInstance.objectStoreNames.length > 0) {
    return Promise.resolve(dbInstance);
  }
  
  // Return existing promise if database is being opened
  if (dbPromise) {
    return dbPromise;
  }
  
  // Create new connection
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB is not available'));
      return;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      dbPromise = null;
      const error = request.error || new Error('Failed to open PDF IndexedDB');
      logError('[PDF Storage] IndexedDB open error', error);
      reject(error);
    };
    
    request.onsuccess = () => {
      const db = request.result;
      if (!db) {
        dbPromise = null;
        reject(new Error('PDF IndexedDB database is null'));
        return;
      }
      dbInstance = db;
      // Schedule automatic closure after inactivity
      scheduleDbClose();
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      /** @type {any} */
      const eventTarget = event.target;
      /** @type {import('../types.js').IDBUpgradeEventTarget} */
      const target = eventTarget;
      const db = target.result;
      if (!db) {
        dbPromise = null;
        reject(new Error('PDF IndexedDB database is null during upgrade'));
        return;
      }
      try {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      } catch (error) {
        dbPromise = null;
        logError('[PDF Storage] IndexedDB upgrade error', error);
        reject(error);
      }
    };
  });
  
  return dbPromise;
}

/**
 * Validate PDF data structure and header
 * @param {*} pdfData - Data to validate
 * @param {string} source - Source of data for error messages
 * @returns {ArrayBuffer} Validated ArrayBuffer
 * @throws {Error} If validation fails
 */
export function validatePdfData(pdfData, source = 'unknown') {
  if (!(pdfData instanceof ArrayBuffer)) {
    throw new Error(`Invalid PDF data type: expected ArrayBuffer, got ${typeof pdfData} (source: ${source})`);
  }
  
  if (pdfData.byteLength < 4) {
    throw new Error(`PDF data too small: ${pdfData.byteLength} bytes (source: ${source})`);
  }
  
  const headerBytes = new Uint8Array(pdfData).slice(0, 4);
  const headerText = String.fromCharCode(...headerBytes);
  
  if (headerText !== '%PDF') {
    const firstBytesHex = Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error(`Invalid PDF header: expected '%PDF', got '${headerText}' (source: ${source}, bytes: ${firstBytesHex})`);
  }
  
  return pdfData;
}

/**
 * Save PDF data to IndexedDB
 * @param {string} pdfUrl - PDF file URL (used as key)
 * @param {ArrayBuffer} pdfData - PDF file data
 * @returns {Promise<void>}
 * @throws {Error} If PDF data validation fails
 * @throws {Error} If IndexedDB is not available
 * @throws {Error} If IndexedDB operation fails
 * @throws {Error} If database connection fails
 */
export async function savePdfData(pdfUrl, pdfData) {
  const startTime = Date.now();
  log('[PDF Storage] Saving PDF data to IndexedDB', { 
    pdfUrl, 
    size: pdfData.byteLength,
    sizeMB: (pdfData.byteLength / 1024 / 1024).toFixed(2)
  });
  
  let db = null;
  
  try {
    // Validate PDF data before opening database
    validatePdfData(pdfData, 'savePdfData');
    
    // Get database connection with retry if connection is closed
    const getDbWithRetry = async () => {
      db = await getPDFDatabase();
      
      // Check if database is still open
      if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
        logWarn('[PDF Storage] Database connection is closed, reconnecting...', { pdfUrl });
        // Reset singleton to force new connection
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
        // Get new connection
        db = await getPDFDatabase();
        
        // Verify new connection is open
        if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
          throw new Error('Failed to get open database connection after retry');
        }
      }
      
      return db;
    };
    
    db = await getDbWithRetry();
    
    // Reset inactivity timeout before operation
    resetDbInactivityTimeout();
    
    return new Promise((resolve, reject) => {
      // Track if we need to close DB on error
      let shouldCloseOnError = false;
      
      // Ensure database is properly handled on any error path
      const cleanup = () => {
        // Only close DB if it was closed by error (not reusable)
        // Check if connection is still open - if not, it means error closed it
        if (db && (!db.objectStoreNames || db.objectStoreNames.length === 0)) {
          shouldCloseOnError = true;
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
        }
      };
      
      let transaction;
      try {
        // Double-check database is still open before creating transaction
        if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
          throw new Error('Database connection is closed');
        }
        
        transaction = db.transaction([STORE_NAME], 'readwrite');
      } catch (transactionError) {
        logError('[PDF Storage] Failed to create transaction', {
          error: transactionError.message,
          pdfUrl,
          dbState: db && db.objectStoreNames && db.objectStoreNames.length > 0 ? 'open' : 'closed',
          errorName: transactionError.name
        });
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(transactionError);
        return;
      }
      
      transaction.onerror = () => {
        const error = transaction.error || new Error('Transaction failed');
        logError('[PDF Storage] Transaction error (save)', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
      
      transaction.oncomplete = () => {
        const duration = Date.now() - startTime;
        log('[PDF Storage] PDF data saved to IndexedDB', {
          pdfUrl,
          size: pdfData.byteLength,
          duration
        });
        // Reset inactivity timeout after successful operation
        resetDbInactivityTimeout();
        resolve();
      };
      
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.put({
        url: pdfUrl,
        data: pdfData,
        timestamp: Date.now()
      });
      
      request.onerror = () => {
        const error = request.error || new Error('Put operation failed');
        logError('[PDF Storage] Put error', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
    });
  } catch (error) {
    // CRITICAL: Ensure cleanup on any error - close DB if it exists
    // This prevents memory leaks when errors occur before Promise is created
    if (db) {
      try {
        // Check if DB is still open before closing
        if (db.objectStoreNames && db.objectStoreNames.length > 0) {
          // Only close if it's not the singleton (to avoid breaking other operations)
          // But if error occurred, it's safer to close
          safeCloseDatabase(db);
        }
        // Reset singleton if this was the instance
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
      } catch (cleanupError) {
        logWarn('[PDF Storage] Error during cleanup in catch block', { error: cleanupError.message });
      }
    }
    
    logError('[PDF Storage] Failed to save PDF data', {
      error: error.message,
      pdfUrl,
      duration: Date.now() - startTime
    });
    throw error;
  }
}

/**
 * Get PDF data from IndexedDB
 * @param {string} pdfUrl - PDF file URL (used as key)
 * @returns {Promise<ArrayBuffer|null>} PDF data or null if not found
 * @throws {Error} If IndexedDB is not available
 * @throws {Error} If IndexedDB operation fails
 * @throws {Error} If database connection fails
 */
export async function getPdfData(pdfUrl) {
  const startTime = Date.now();
  log('[PDF Storage] Getting PDF data from IndexedDB', { pdfUrl });
  
  let db = null;
  
  try {
    // Get database connection with retry if connection is closed
    const getDbWithRetry = async () => {
      db = await getPDFDatabase();
      
      // Check if database is still open
      if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
        logWarn('[PDF Storage] Database connection is closed, reconnecting...', { pdfUrl });
        // Reset singleton to force new connection
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
        // Get new connection
        db = await getPDFDatabase();
        
        // Verify new connection is open
        if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
          throw new Error('Failed to get open database connection after retry');
        }
      }
      
      return db;
    };
    
    db = await getDbWithRetry();
    
    // Reset inactivity timeout before operation
    resetDbInactivityTimeout();
    
    return new Promise((resolve, reject) => {
      // Track if we need to close DB on error
      let shouldCloseOnError = false;
      
      const cleanup = () => {
        // Only close DB if it was closed by error (not reusable)
        // Check if connection is still open - if not, it means error closed it
        if (db && (!db.objectStoreNames || db.objectStoreNames.length === 0)) {
          shouldCloseOnError = true;
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
        }
      };
      
      let transaction;
      try {
        // Double-check database is still open before creating transaction
        if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
          throw new Error('Database connection is closed');
        }
        
        transaction = db.transaction([STORE_NAME], 'readonly');
      } catch (transactionError) {
        logError('[PDF Storage] Failed to create transaction (get)', {
          error: transactionError.message,
          pdfUrl,
          dbState: db && db.objectStoreNames && db.objectStoreNames.length > 0 ? 'open' : 'closed',
          errorName: transactionError.name
        });
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(transactionError);
        return;
      }
      
      transaction.onerror = () => {
        const error = transaction.error || new Error('Transaction failed');
        logError('[PDF Storage] Transaction error (get)', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
      
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(pdfUrl);
      
      request.onsuccess = () => {
        const result = request.result;
        
        if (result && result.data) {
          // CRITICAL: Verify retrieved data is ArrayBuffer
          let pdfData = result.data;
          
          // Check if data is ArrayBuffer
          if (!(pdfData instanceof ArrayBuffer)) {
            logWarn('[PDF Storage] Retrieved data is not ArrayBuffer, attempting conversion', {
              pdfUrl,
              type: typeof pdfData,
              constructor: pdfData?.constructor?.name,
              isArrayBuffer: pdfData instanceof ArrayBuffer
            });
            
            // Try to convert if it's a typed array
            if (pdfData instanceof Uint8Array) {
              pdfData = pdfData.buffer;
            } else if (Array.isArray(pdfData)) {
              // Convert array to ArrayBuffer
              pdfData = new Uint8Array(pdfData).buffer;
            } else {
              logError('[PDF Storage] Cannot convert retrieved data to ArrayBuffer', {
                pdfUrl,
                type: typeof pdfData,
                constructor: pdfData?.constructor?.name
              });
              resolve(null);
              return;
            }
          }
          
          // Validate PDF data using shared validation function
          try {
            validatePdfData(pdfData, 'getPdfData');
          } catch (validationError) {
            logError('[PDF Storage] Retrieved PDF data validation failed', {
              pdfUrl,
              error: validationError.message
            });
            resolve(null);
            return;
          }
          
          const duration = Date.now() - startTime;
          log('[PDF Storage] PDF data retrieved from IndexedDB', {
            pdfUrl,
            size: pdfData.byteLength,
            age: Date.now() - result.timestamp,
            duration
          });
          // Reset inactivity timeout after successful operation
          resetDbInactivityTimeout();
          resolve(pdfData);
        } else {
          log('[PDF Storage] PDF data not found in IndexedDB', { pdfUrl });
          // Reset inactivity timeout after successful operation
          resetDbInactivityTimeout();
          resolve(null);
        }
      };
      
      request.onerror = () => {
        const error = request.error || new Error('Get operation failed');
        logError('[PDF Storage] Get error', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        } else if (db) {
          // Even if reusable, close on request error to prevent issues
          safeCloseDatabase(db);
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
        }
        reject(error);
      };
    });
  } catch (error) {
    // CRITICAL: Ensure cleanup on any error - close DB if it exists
    // This prevents memory leaks when errors occur before Promise is created
    if (db) {
      try {
        // Check if DB is still open before closing
        if (db.objectStoreNames && db.objectStoreNames.length > 0) {
          // Only close if it's not the singleton (to avoid breaking other operations)
          // But if error occurred, it's safer to close
          safeCloseDatabase(db);
        }
        // Reset singleton if this was the instance
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
      } catch (cleanupError) {
        logWarn('[PDF Storage] Error during cleanup in catch block (get)', { error: cleanupError.message });
      }
    }
    
    logError('[PDF Storage] Failed to get PDF data', {
      error: error.message,
      pdfUrl,
      duration: Date.now() - startTime
    });
    throw error;
  }
}

/**
 * Remove PDF data from IndexedDB
 * @param {string} pdfUrl - PDF file URL (used as key)
 * @returns {Promise<void>}
 * @throws {Error} If IndexedDB is not available
 * @throws {Error} If IndexedDB operation fails
 * @throws {Error} If database connection fails
 */
export async function removePdfData(pdfUrl) {
  log('[PDF Storage] Removing PDF data from IndexedDB', { pdfUrl });
  
  let db = null;
  
  try {
    db = await getPDFDatabase();
    
    // Double-check database is still open
    if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
      throw new Error('Database connection is closed');
    }
    
    // Reset inactivity timeout before operation
    resetDbInactivityTimeout();
    
    return new Promise((resolve, reject) => {
      // Track if we need to close DB on error
      let shouldCloseOnError = false;
      
      const cleanup = () => {
        // Only close DB if it was closed by error (not reusable)
        if (db && (!db.objectStoreNames || db.objectStoreNames.length === 0)) {
          shouldCloseOnError = true;
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
        }
      };
      
      let transaction;
      try {
        transaction = db.transaction([STORE_NAME], 'readwrite');
      } catch (transactionError) {
        logError('[PDF Storage] Failed to create transaction (remove)', {
          error: transactionError.message,
          pdfUrl,
          dbState: db && db.objectStoreNames && db.objectStoreNames.length > 0 ? 'open' : 'closed'
        });
        cleanup();
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(transactionError);
        return;
      }
      
      transaction.onerror = () => {
        const error = transaction.error || new Error('Transaction failed');
        logError('[PDF Storage] Transaction error (remove)', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
      
      transaction.oncomplete = () => {
        log('[PDF Storage] PDF data removed from IndexedDB', { pdfUrl });
        // Reset inactivity timeout after successful operation
        resetDbInactivityTimeout();
        resolve();
      };
      
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(pdfUrl);
      
      request.onerror = () => {
        const error = request.error || new Error('Delete operation failed');
        logError('[PDF Storage] Delete error', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
    });
  } catch (error) {
    // CRITICAL: Ensure cleanup on any error - close DB if it exists
    // This prevents memory leaks when errors occur before Promise is created
    if (db) {
      try {
        // Check if DB is still open before closing
        if (db.objectStoreNames && db.objectStoreNames.length > 0) {
          safeCloseDatabase(db);
        }
        // Reset singleton if this was the instance
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
      } catch (cleanupError) {
        logWarn('[PDF Storage] Error during cleanup in catch block (remove)', { error: cleanupError.message });
      }
    }
    
    logError('[PDF Storage] Failed to remove PDF data', {
      error: error.message,
      pdfUrl
    });
    throw error;
  }
}

/**
 * Clear all old PDF data from IndexedDB (older than maxAge milliseconds)
 * @param {number} [maxAge=3600000] - Maximum age in milliseconds (default: 1 hour)
 * @returns {Promise<number>} Number of items removed
 * @throws {Error} If IndexedDB is not available
 * @throws {Error} If IndexedDB operation fails
 * @throws {Error} If database connection fails
 */
export async function clearOldPdfData(maxAge = 3600000) {
  log('[PDF Storage] Clearing old PDF data from IndexedDB', { maxAge });
  
  let db = null;
  
  try {
    db = await getPDFDatabase();
    
    // Double-check database is still open
    if (!db || !db.objectStoreNames || db.objectStoreNames.length === 0) {
      throw new Error('Database connection is closed');
    }
    
    // Reset inactivity timeout before operation
    resetDbInactivityTimeout();
    
    const cutoffTime = Date.now() - maxAge;
    
    return new Promise((resolve, reject) => {
      // Track if we need to close DB on error
      let shouldCloseOnError = false;
      
      const cleanup = () => {
        // Only close DB if it was closed by error (not reusable)
        if (db && (!db.objectStoreNames || db.objectStoreNames.length === 0)) {
          shouldCloseOnError = true;
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
        }
      };
      
      let transaction;
      try {
        transaction = db.transaction([STORE_NAME], 'readwrite');
      } catch (transactionError) {
        logError('[PDF Storage] Failed to create transaction (clear)', {
          error: transactionError.message,
          maxAge,
          dbState: db && db.objectStoreNames && db.objectStoreNames.length > 0 ? 'open' : 'closed'
        });
        cleanup();
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(transactionError);
        return;
      }
      
      // CRITICAL: Set transaction.oncomplete BEFORE request handlers
      // This ensures it's called even if cursor completes immediately
      let removedCount = 0;
      let transactionCompleted = false;
      
      transaction.onerror = () => {
        const error = transaction.error || new Error('Transaction failed');
        logError('[PDF Storage] Transaction error (clear)', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
      
      transaction.oncomplete = () => {
        if (!transactionCompleted) {
          transactionCompleted = true;
          log('[PDF Storage] Cleared old PDF data', { removedCount, maxAge });
          // Reset inactivity timeout after successful operation
          resetDbInactivityTimeout();
          resolve(removedCount);
        }
      };
      
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          removedCount++;
          cursor.continue();
        } else {
          // Cursor finished - transaction.oncomplete will be called automatically
          // No need to manually call it here
        }
      };
      
      request.onerror = () => {
        const error = request.error || new Error('Cursor error');
        logError('[PDF Storage] Cursor error', error);
        cleanup();
        // Close DB if it's not reusable
        if (shouldCloseOnError && db) {
          safeCloseDatabase(db);
        }
        reject(error);
      };
    });
  } catch (error) {
    // CRITICAL: Ensure cleanup on any error - close DB if it exists
    // This prevents memory leaks when errors occur before Promise is created
    if (db) {
      try {
        // Check if DB is still open before closing
        if (db.objectStoreNames && db.objectStoreNames.length > 0) {
          safeCloseDatabase(db);
        }
        // Reset singleton if this was the instance
        if (dbInstance === db) {
          dbInstance = null;
          dbPromise = null;
        }
      } catch (cleanupError) {
        logWarn('[PDF Storage] Error during cleanup in catch block (clear)', { error: cleanupError.message });
      }
    }
    
    logError('[PDF Storage] Failed to clear old PDF data', {
      error: error.message,
      maxAge
    });
    throw error;
  }
}



