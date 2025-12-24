// @ts-check
// TTS Worker API functions

import { log, logError } from '../../utils/logging.js';
import { state } from '../state.js';
import { ensureTTSWorker } from './init.js';
import { resetWorkerInactivityTimer } from './lifecycle.js';

/**
 * Execute TTS predict using Web Worker
 * Throws error if worker is not available
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - Voice ID to use
 * @returns {Promise<Blob>} Audio blob (WAV format)
 */
export async function predictWithWorker(text, voiceId) {
  const callStartTime = Date.now();
  const callId = 'predict_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  log('[ClipAIble Offscreen] === predictWithWorker CALL START ===', {
    callId,
    textLength: text?.length,
    voiceId,
    hasTTSWorker: state.hasTTSWorker(),
    useWorker: state.shouldUseWorker(),
    timestamp: callStartTime
  });
  
  // Ensure Worker is initialized before use
  const worker = await ensureTTSWorker();
  
  return new Promise((resolve, reject) => {
    const id = callId;
    const requestStartTime = Date.now();
    const timeout = setTimeout(() => {
      const timeoutError = new Error('TTS Worker predict timeout (60s)');
      logError('[ClipAIble Offscreen] predictWithWorker timeout', {
        callId: id,
        textLength: text?.length,
        voiceId,
        duration: Date.now() - requestStartTime
      });
      reject(timeoutError);
    }, 60000); // 60 second timeout
    
    const handler = (event) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        
        const handlerTime = Date.now();
        const totalDuration = handlerTime - callStartTime;
        const requestDuration = handlerTime - requestStartTime;
        
        if (event.data.type === 'PREDICT_SUCCESS') {
          // Convert ArrayBuffer back to Blob
          const blob = new Blob([event.data.data], { type: 'audio/wav' });
          
          log('[ClipAIble Offscreen] === predictWithWorker SUCCESS ===', {
            callId: id,
            textLength: text?.length,
            voiceId,
            blobSize: blob.size,
            blobType: blob.type,
            requestDuration,
            totalDuration,
            workerDuration: event.data.duration,
            timestamp: handlerTime
          });
          resolve(blob);
        } else if (event.data.type === 'ERROR') {
          const error = new Error(event.data.error || 'Worker predict failed');
          logError('[ClipAIble Offscreen] === predictWithWorker ERROR ===', {
            callId: id,
            textLength: text?.length,
            voiceId,
            error: error.message,
            errorStack: event.data.stack,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          reject(error);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    
    // Handle worker errors during predict
    const errorHandler = (error) => {
      clearTimeout(timeout);
      worker.removeEventListener('message', handler);
      worker.removeEventListener('error', errorHandler);
      const workerError = new Error(`Worker error during predict: ${error.message}`);
      logError('[ClipAIble Offscreen] === predictWithWorker WORKER ERROR ===', {
        callId: id,
        textLength: text?.length,
        voiceId,
        error: workerError.message,
        errorFilename: error.filename,
        errorLineno: error.lineno,
        errorColno: error.colno,
        duration: Date.now() - requestStartTime
      });
      reject(workerError);
    };
    worker.addEventListener('error', errorHandler);
    
    log('[ClipAIble Offscreen] Sending PREDICT message to Worker', {
      callId: id,
      textLength: text?.length,
      voiceId,
      textPreview: text?.substring(0, 100),
      timestamp: requestStartTime
    });
    
    // Send predict message
    worker.postMessage({
      type: 'PREDICT',
      id,
      data: { text, voiceId }
    });
  });
}

/**
 * Get voices using Web Worker
 * @returns {Promise<Array>} Array of available voices
 */
export async function getVoicesWithWorker() {
  const callStartTime = Date.now();
  const callId = 'voices_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  log('[ClipAIble Offscreen] === getVoicesWithWorker CALL START ===', {
    callId,
    hasTTSWorker: state.hasTTSWorker(),
    useWorker: state.shouldUseWorker(),
    timestamp: callStartTime
  });
  
  // Ensure Worker is initialized before use
  const worker = await ensureTTSWorker();
  
  return new Promise((resolve, reject) => {
    const id = callId;
    const requestStartTime = Date.now();
    const timeout = setTimeout(() => {
      const timeoutError = new Error('TTS Worker voices timeout (10s)');
      logError('[ClipAIble Offscreen] getVoicesWithWorker timeout', {
        callId: id,
        duration: Date.now() - requestStartTime
      });
      reject(timeoutError);
    }, 10000);
    
    const handler = (event) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        
        const handlerTime = Date.now();
        const totalDuration = handlerTime - callStartTime;
        const requestDuration = handlerTime - requestStartTime;
        
        if (event.data.type === 'VOICES_SUCCESS') {
          const voices = event.data.data;
          log('[ClipAIble Offscreen] === getVoicesWithWorker SUCCESS ===', {
            callId: id,
            voicesCount: Array.isArray(voices) ? voices.length : 0,
            isArray: Array.isArray(voices),
            requestDuration,
            totalDuration,
            firstFewVoices: Array.isArray(voices) ? voices.slice(0, 3).map(v => ({
              key: v?.key,
              name: v?.name
            })) : null,
            timestamp: handlerTime
          });
          resolve(voices);
        } else if (event.data.type === 'ERROR') {
          const error = new Error(event.data.error || 'Worker voices failed');
          logError('[ClipAIble Offscreen] === getVoicesWithWorker ERROR ===', {
            callId: id,
            error: error.message,
            errorStack: event.data.stack,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          reject(error);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    
    log('[ClipAIble Offscreen] Sending VOICES message to Worker', {
      callId: id,
      timestamp: requestStartTime
    });
    
    worker.postMessage({ type: 'VOICES', id });
  });
}

/**
 * Get stored voices using Web Worker
 * @returns {Promise<Array<string>>} Array of stored voice IDs
 */
export async function getStoredWithWorker() {
  const callStartTime = Date.now();
  const callId = 'stored_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  log('[ClipAIble Offscreen] === getStoredWithWorker CALL START ===', {
    callId,
    hasTTSWorker: state.hasTTSWorker(),
    useWorker: state.shouldUseWorker(),
    timestamp: callStartTime
  });
  
  // Ensure Worker is initialized before use
  const worker = await ensureTTSWorker();
  
  return new Promise((resolve, reject) => {
    const id = callId;
    const requestStartTime = Date.now();
    const timeout = setTimeout(() => {
      const timeoutError = new Error('TTS Worker stored timeout (10s)');
      logError('[ClipAIble Offscreen] getStoredWithWorker timeout', {
        callId: id,
        duration: Date.now() - requestStartTime
      });
      reject(timeoutError);
    }, 10000);
    
    const handler = (event) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        
        const handlerTime = Date.now();
        const totalDuration = handlerTime - callStartTime;
        const requestDuration = handlerTime - requestStartTime;
        
        if (event.data.type === 'STORED_SUCCESS') {
          const stored = event.data.data;
          log('[ClipAIble Offscreen] === getStoredWithWorker SUCCESS ===', {
            callId: id,
            storedCount: Array.isArray(stored) ? stored.length : 0,
            isArray: Array.isArray(stored),
            storedVoices: Array.isArray(stored) ? stored : null,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          resolve(stored);
        } else if (event.data.type === 'ERROR') {
          const error = new Error(event.data.error || 'Worker stored failed');
          logError('[ClipAIble Offscreen] === getStoredWithWorker ERROR ===', {
            callId: id,
            error: error.message,
            errorStack: event.data.stack,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          reject(error);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    
    log('[ClipAIble Offscreen] Sending STORED message to Worker', {
      callId: id,
      timestamp: requestStartTime
    });
    
    worker.postMessage({ type: 'STORED', id });
  });
}

/**
 * Download voice model using Web Worker
 * @param {string} voiceId - Voice ID to download
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<any>} Download result
 */
export async function downloadWithWorker(voiceId, progressCallback) {
  const callStartTime = Date.now();
  const callId = 'download_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  log('[ClipAIble Offscreen] === downloadWithWorker CALL START ===', {
    callId,
    voiceId,
    hasProgressCallback: typeof progressCallback === 'function',
    hasTTSWorker: state.hasTTSWorker(),
    useWorker: state.shouldUseWorker(),
    timestamp: callStartTime
  });
  
  // Ensure Worker is initialized before use
  const worker = await ensureTTSWorker();
  
  return new Promise((resolve, reject) => {
    const id = callId;
    const requestStartTime = Date.now();
    let lastProgressPercent = -1;
    const timeout = setTimeout(() => {
      const timeoutError = new Error('TTS Worker download timeout (300s)');
      logError('[ClipAIble Offscreen] downloadWithWorker timeout', {
        callId: id,
        voiceId,
        duration: Date.now() - requestStartTime
      });
      reject(timeoutError);
    }, 300000); // 5 minutes timeout for large downloads
    
    const handler = (event) => {
      if (event.data.id === id) {
        if (event.data.type === 'DOWNLOAD_PROGRESS') {
          const progress = event.data.data;
          const percent = progress.total > 0 
            ? Math.round((progress.loaded * 100) / progress.total)
            : 0;
          
          // Log progress every 10% or on completion
          if (percent >= lastProgressPercent + 10 || percent === 100) {
            log('[ClipAIble Offscreen] downloadWithWorker progress', {
              callId: id,
              voiceId,
              percent,
              loaded: progress.loaded,
              total: progress.total,
              timestamp: Date.now()
            });
            lastProgressPercent = percent;
          }
          
          // Forward progress to callback if provided
          if (progressCallback && typeof progressCallback === 'function') {
            progressCallback(progress);
          }
          return; // Don't remove listener, wait for success/error
        }
        
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        
        const handlerTime = Date.now();
        const totalDuration = handlerTime - callStartTime;
        const requestDuration = handlerTime - requestStartTime;
        
        if (event.data.type === 'DOWNLOAD_SUCCESS') {
          log('[ClipAIble Offscreen] === downloadWithWorker SUCCESS ===', {
            callId: id,
            voiceId,
            result: event.data.data,
            requestDuration,
            totalDuration,
            workerDuration: event.data.data?.duration,
            timestamp: handlerTime
          });
          resolve(event.data.data);
        } else if (event.data.type === 'ERROR') {
          const error = new Error(event.data.error || 'Worker download failed');
          logError('[ClipAIble Offscreen] === downloadWithWorker ERROR ===', {
            callId: id,
            voiceId,
            error: error.message,
            errorStack: event.data.stack,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          reject(error);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    
    log('[ClipAIble Offscreen] Sending DOWNLOAD message to Worker', {
      callId: id,
      voiceId,
      timestamp: requestStartTime
    });
    
    worker.postMessage({ 
      type: 'DOWNLOAD', 
      id,
      data: { voiceId, progressCallback: null } // Progress handled via messages
    });
  });
}

/**
 * Remove voice model using Web Worker
 * @param {string} voiceId - Voice ID to remove
 * @returns {Promise<any>} Remove result
 */
export async function removeWithWorker(voiceId) {
  const callStartTime = Date.now();
  const callId = 'remove_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  log('[ClipAIble Offscreen] === removeWithWorker CALL START ===', {
    callId,
    voiceId,
    hasTTSWorker: state.hasTTSWorker(),
    useWorker: state.shouldUseWorker(),
    timestamp: callStartTime
  });
  
  // Ensure Worker is initialized before use
  const worker = await ensureTTSWorker();
  
  return new Promise((resolve, reject) => {
    const id = callId;
    const requestStartTime = Date.now();
    const timeout = setTimeout(() => {
      const timeoutError = new Error('TTS Worker remove timeout (30s)');
      logError('[ClipAIble Offscreen] removeWithWorker timeout', {
        callId: id,
        voiceId,
        duration: Date.now() - requestStartTime
      });
      reject(timeoutError);
    }, 30000);
    
    const handler = (event) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        
        const handlerTime = Date.now();
        const totalDuration = handlerTime - callStartTime;
        const requestDuration = handlerTime - requestStartTime;
        
        if (event.data.type === 'REMOVE_SUCCESS') {
          log('[ClipAIble Offscreen] === removeWithWorker SUCCESS ===', {
            callId: id,
            voiceId,
            result: event.data.data,
            requestDuration,
            totalDuration,
            workerDuration: event.data.data?.duration,
            timestamp: handlerTime
          });
          resolve(event.data.data);
        } else if (event.data.type === 'ERROR') {
          const error = new Error(event.data.error || 'Worker remove failed');
          logError('[ClipAIble Offscreen] === removeWithWorker ERROR ===', {
            callId: id,
            voiceId,
            error: error.message,
            errorStack: event.data.stack,
            requestDuration,
            totalDuration,
            timestamp: handlerTime
          });
          reject(error);
        }
      }
    };
    
    worker.addEventListener('message', handler);
    
    log('[ClipAIble Offscreen] Sending REMOVE message to Worker', {
      callId: id,
      voiceId,
      timestamp: requestStartTime
    });
    
    worker.postMessage({ 
      type: 'REMOVE', 
      id,
      data: { voiceId }
    });
  });
}


