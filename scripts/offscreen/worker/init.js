// @ts-check
// TTS Worker initialization

import { log, logError, logDebug } from '../../utils/logging.js';
import { state } from '../state.js';
import { WORKER_INACTIVITY_TIMEOUT } from '../utils/constants.js';
import { resetWorkerInactivityTimer } from './lifecycle.js';

/**
 * Initialize TTS Web Worker for non-blocking TTS operations
 * Web Workers execute WASM operations in separate thread, preventing main thread blocking
 * @returns {Promise<Worker>} Initialized TTS Worker
 */
export async function initTTSWorker() {
  // If Worker already exists, return it immediately
  if (state.getTTSWorker()) {
    return state.getTTSWorker();
  }
  
  // If initialization is already in progress, wait for it
  // This prevents race conditions when multiple functions call initTTSWorker() simultaneously
  const existingPromise = state.getTTSWorkerInitPromise();
  if (existingPromise) {
    log('[ClipAIble Offscreen] Worker initialization already in progress, waiting...', {
      timestamp: Date.now()
    });
    return await existingPromise;
  }
  
  // Start new initialization and cache the promise
  const initPromise = (async () => {
    const initStartTime = Date.now();
    
    try {
      log('[ClipAIble Offscreen] === initTTSWorker CALL START ===', {
        hasExistingWorker: state.hasTTSWorker(),
        useWorker: state.shouldUseWorker(),
        timestamp: initStartTime
      });
      
      // Create Web Worker from esbuild bundle
      // The bundle includes all dependencies (onnxruntime-web, piper-tts-web)
      // and resolves all imports at build time - no import maps needed
      const workerUrl = chrome.runtime.getURL('dist/tts-worker-bundle.js');
      logDebug('[ClipAIble Offscreen] Loading worker from URL', {
        workerUrl,
        hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
        timestamp: Date.now()
      });
      
      const workerCreateStart = Date.now();
      let worker;
      try {
        worker = new Worker(workerUrl);
        const workerCreateDuration = Date.now() - workerCreateStart;
        log('[ClipAIble Offscreen] Worker created successfully', {
          workerUrl,
          workerCreateDuration,
          hasWorker: !!worker,
          timestamp: Date.now()
        });
        state.setTTSWorker(worker);
      } catch (workerCreationError) {
        const workerCreateDuration = Date.now() - workerCreateStart;
        logError('[ClipAIble Offscreen] === Worker creation FAILED ===', {
          error: workerCreationError.message,
          stack: workerCreationError.stack,
          workerUrl,
          workerCreateDuration,
          timestamp: Date.now()
        });
        throw workerCreationError;
      }
      
      state.setUseWorker(true);
      
      // Initialize worker - bundle is self-contained, no need to pass module URLs
      const initPromise = new Promise((resolve, reject) => {
        const initPromiseStart = Date.now();
        const timeout = setTimeout(() => {
          const timeoutError = new Error('Worker initialization timeout (30s)');
          logError('[ClipAIble Offscreen] initTTSWorker timeout', {
            duration: Date.now() - initStartTime,
            promiseDuration: Date.now() - initPromiseStart,
            timestamp: Date.now()
          });
          reject(timeoutError);
        }, 30000); // 30 second timeout
        
        const handler = (event) => {
          log('[ClipAIble Offscreen] Worker message received during init', {
            type: event.data?.type,
            id: event.data?.id,
            hasError: !!event.data?.error,
            hasData: !!event.data?.data,
            timestamp: Date.now(),
            elapsed: Date.now() - initStartTime,
            promiseElapsed: Date.now() - initPromiseStart
          });
          
          if (event.data.type === 'WORKER_READY') {
            // Worker is ready, send INIT
            // NOTE: ONNX Runtime is loaded on top level in Worker, no need to pass ortUrl
            log('[ClipAIble Offscreen] Worker sent WORKER_READY, sending INIT...', {
              timestamp: Date.now(),
              elapsed: Date.now() - initStartTime
            });
            const initId = 'init_' + Date.now();
            
            worker.postMessage({
              type: 'INIT',
              id: initId
            });
            log('[ClipAIble Offscreen] INIT message sent to Worker', {
              initId,
              timestamp: Date.now()
            });
            return;
          }
          
          if (event.data.type === 'INIT_SUCCESS') {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            const initDuration = Date.now() - initStartTime;
            const promiseDuration = Date.now() - initPromiseStart;
            log('[ClipAIble Offscreen] === initTTSWorker SUCCESS ===', {
              initDuration,
              promiseDuration,
              workerCreateDuration: workerCreateStart ? Date.now() - workerCreateStart : null,
              timestamp: Date.now()
            });
            resolve(worker);
          } else if (event.data.type === 'ERROR') {
            clearTimeout(timeout);
            worker.removeEventListener('message', handler);
            const initDuration = Date.now() - initStartTime;
            const promiseDuration = Date.now() - initPromiseStart;
            logError('[ClipAIble Offscreen] === initTTSWorker ERROR ===', {
              error: event.data.error,
              stack: event.data.stack,
              initDuration,
              promiseDuration,
              timestamp: Date.now()
            });
            reject(new Error(event.data.error || 'Worker initialization failed'));
          }
        };
        
        worker.addEventListener('message', handler);
        
        // Handle worker errors
        worker.onerror = (error) => {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          const initDuration = Date.now() - initStartTime;
          logError('[ClipAIble Offscreen] === initTTSWorker WORKER ERROR ===', {
            error: error.message,
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
            initDuration,
            timestamp: Date.now()
          });
          reject(new Error(`Worker error: ${error.message}`));
        };
      });
      
      await initPromise;
      const totalDuration = Date.now() - initStartTime;
      log('[ClipAIble Offscreen] === initTTSWorker COMPLETE ===', {
        totalDuration: Date.now() - initStartTime,
        hasWorker: state.hasTTSWorker(),
        useWorker: state.shouldUseWorker(),
        timestamp: Date.now()
      });
      return worker;
    } catch (error) {
      const initDuration = Date.now() - initStartTime;
      logError('[ClipAIble Offscreen] === initTTSWorker FAILED ===', {
        error: error.message,
        stack: error.stack,
        initDuration,
        timestamp: Date.now()
      });
      
      // Clean up on error
      const worker = state.getTTSWorker();
      if (worker) {
        log('[ClipAIble Offscreen] Terminating failed Worker', {
          timestamp: Date.now()
        });
        worker.terminate();
        state.setTTSWorker(null);
        state.setUseWorker(false);
      }
      
      // Clear promise cache on error to allow retry
      state.clearTTSWorkerInitPromise();
      
      throw error; // Re-throw error - no fallback
    }
  })();
  
  state.setTTSWorkerInitPromise(initPromise);
  
  try {
    return await initPromise;
  } catch (error) {
    // Promise cache is already cleared in catch block above
    throw error;
  }
}

/**
 * Ensure TTS Worker is initialized and available
 * Helper function to reduce code duplication across all Worker API functions
 * @returns {Promise<Worker>} Initialized TTS Worker
 * @throws {Error} If Worker cannot be initialized
 */
export async function ensureTTSWorker() {
  // If Worker already exists, return it immediately and reset inactivity timer
  if (state.getTTSWorker()) {
    resetWorkerInactivityTimer();
    return state.getTTSWorker();
  }
  
  // Initialize Worker if not already initialized
  await initTTSWorker();
  
  // Verify Worker is available after initialization
  if (!state.getTTSWorker() || !state.shouldUseWorker()) {
    throw new Error('TTS Worker is not available. Worker must be initialized before use.');
  }
  
  // Reset inactivity timer after initialization
  resetWorkerInactivityTimer();
  
  return state.getTTSWorker();
}




