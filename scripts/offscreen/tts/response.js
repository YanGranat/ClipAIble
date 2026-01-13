// @ts-check
// Response handling for Piper TTS

import { log, logError, logWarn } from '../../utils/logging.js';

const STORAGE_THRESHOLD = 5 * 1024 * 1024;  // 5 MB
const INDEXEDDB_THRESHOLD = 50 * 1024 * 1024;  // 50 MB
const CHROME_MESSAGE_LIMIT = 10 * 1024 * 1024;  // 10 MB

/**
 * Send TTS response (audio data)
 * @param {Object} params - Parameters
 * @param {Blob} params.wavBlob - Audio blob
 * @param {string} params.messageId - Message ID
 * @param {boolean} params.hasUnlimitedStorage - Has unlimited storage permission
 * @param {function(Object): void} params.sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function sendTTSResponse({
  wavBlob,
  messageId,
  hasUnlimitedStorage,
  sendResponse
}) {
  const arrayBuffer = await wavBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  log(`[ClipAIble TTS] Preparing response`, {
    messageId,
    size: uint8Array.length,
    sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2)
  });
  
  // Validate max size
  const maxSize = hasUnlimitedStorage ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (uint8Array.length > maxSize) {
    logError(`[ClipAIble TTS] Audio too large`, { messageId, size: uint8Array.length, maxSize });
    throw new Error(`Audio too large: ${(uint8Array.length / 1024 / 1024).toFixed(2)} MB exceeds ${(maxSize / 1024 / 1024)} MB limit`);
  }
  
  // Try inline first for small files
  if (uint8Array.length < STORAGE_THRESHOLD) {
    const result = await trySendInline(uint8Array, messageId, sendResponse);
    if (result) return;
  }
  
  // Use storage for larger files
  await sendViaStorage(uint8Array, messageId, sendResponse);
}

/**
 * Try to send audio inline
 * @param {Uint8Array} audioData - Audio data
 * @param {string} messageId - Message ID
 * @param {function(Object): void} sendResponse - Response function
 * @returns {Promise<boolean>} True if sent successfully
 */
async function trySendInline(audioData, messageId, sendResponse) {
  const responseData = {
    success: true,
    audioData: Array.from(audioData),
    size: audioData.length,
    method: 'inline'
  };
  
  const serializedSize = JSON.stringify(responseData).length;
  
  if (serializedSize >= CHROME_MESSAGE_LIMIT) {
    log(`[ClipAIble TTS] Serialized size exceeds limit, using storage`, {
      messageId,
      serializedSizeMB: (serializedSize / 1024 / 1024).toFixed(2)
    });
    return false;
  }
  
  try {
    sendResponse(responseData);
    log(`[ClipAIble TTS] Response sent inline`, { messageId, size: audioData.length });
    return true;
  } catch (error) {
    logWarn(`[ClipAIble TTS] Inline send failed`, { messageId, error: error.message });
    return false;
  }
}

/**
 * Send audio via storage (chrome.storage or IndexedDB)
 * @param {Uint8Array} audioData - Audio data
 * @param {string} messageId - Message ID
 * @param {function(Object): void} sendResponse - Response function
 * @returns {Promise<void>}
 */
async function sendViaStorage(audioData, messageId, sendResponse) {
  const storageKey = `clipaible_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const useIndexedDB = audioData.length >= INDEXEDDB_THRESHOLD;
  
  log(`[ClipAIble TTS] Saving to storage`, {
    messageId,
    storageKey,
    size: audioData.length,
    method: useIndexedDB ? 'indexeddb' : 'storage'
  });
  
  // Try IndexedDB for very large files
  if (useIndexedDB) {
    const result = await trySaveToIndexedDB(audioData, storageKey, messageId);
    if (result) {
      sendResponse({
        success: true,
        storageKey,
        size: audioData.length,
        method: 'indexeddb'
      });
      return;
    }
  }
  
  // Try chrome.storage
  try {
    if (chrome.storage?.local) {
      await chrome.storage.local.set({
        [storageKey]: Array.from(audioData),
        [`${storageKey}_meta`]: { timestamp: Date.now(), size: audioData.length }
      });
      
      sendResponse({
        success: true,
        storageKey,
        size: audioData.length,
        method: 'storage'
      });
      
      log(`[ClipAIble TTS] Saved to chrome.storage`, { messageId, storageKey });
      return;
    }
  } catch (error) {
    logWarn(`[ClipAIble TTS] chrome.storage failed`, { messageId, error: error.message });
  }
  
  // Fallback to IndexedDB
  const result = await trySaveToIndexedDB(audioData, storageKey, messageId);
  if (result) {
    sendResponse({
      success: true,
      storageKey,
      size: audioData.length,
      method: 'indexeddb'
    });
    return;
  }
  
  // All storage methods failed
  throw new Error('Failed to store audio - all storage methods failed');
}

/**
 * Try to save to IndexedDB
 * @param {Uint8Array} audioData - Audio data
 * @param {string} storageKey - Storage key
 * @param {string} messageId - Message ID
 * @returns {Promise<boolean>} True if saved successfully
 */
async function trySaveToIndexedDB(audioData, storageKey, messageId) {
  try {
    const dbName = 'ClipAIbleAudioStorage';
    const storeName = 'audioFiles';
    
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        // @ts-ignore
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
    });
    
    // @ts-ignore
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.put(audioData.buffer, storageKey);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(new Error('Failed to save to IndexedDB'));
    });
    
    // @ts-ignore
    db.close();
    
    log(`[ClipAIble TTS] Saved to IndexedDB`, { messageId, storageKey });
    return true;
  } catch (error) {
    logError(`[ClipAIble TTS] IndexedDB save failed`, { messageId, error: error.message });
    return false;
  }
}
