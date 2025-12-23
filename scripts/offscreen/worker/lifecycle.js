// @ts-check
// TTS Worker lifecycle management

import { log } from '../../utils/logging.js';
import { state } from '../state.js';
import { WORKER_INACTIVITY_TIMEOUT } from '../utils/constants.js';

/**
 * Reset Worker inactivity timer
 * Automatically terminates Worker after 5 minutes of inactivity to free memory
 */
export function resetWorkerInactivityTimer() {
  state.clearWorkerInactivityTimeout();
  
  if (!state.getTTSWorker()) {
    return; // No Worker to manage
  }
  
  const timeout = setTimeout(() => {
    const worker = state.getTTSWorker();
    if (worker) {
      log('[ClipAIble Offscreen] Terminating TTS Worker due to inactivity', {
        timeout: WORKER_INACTIVITY_TIMEOUT,
        timestamp: Date.now()
      });
      worker.terminate();
      state.setTTSWorker(null);
      state.clearTTSWorkerInitPromise(); // Clear promise cache for recreation
      state.setUseWorker(false);
      state.clearWorkerInactivityTimeout();
    }
  }, WORKER_INACTIVITY_TIMEOUT);
  
  state.setWorkerInactivityTimeout(timeout);
}

