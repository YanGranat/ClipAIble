// @ts-check
// TTS Worker lifecycle management

import { log } from '../../utils/logging.js';
import { state } from '../state.js';
import { WORKER_INACTIVITY_TIMEOUT } from '../utils/constants.js';

/**
 * Reset Worker inactivity timer
 * Automatically terminates Worker after 5 minutes of inactivity to free memory
 * CRITICAL: Does NOT terminate if there are active predict calls (processing in progress)
 */
export function resetWorkerInactivityTimer() {
  state.clearWorkerInactivityTimeout();
  
  if (!state.getTTSWorker()) {
    return; // No Worker to manage
  }
  
  const timeout = setTimeout(() => {
    const worker = state.getTTSWorker();
    // CRITICAL: Don't terminate Worker if there are active predict calls
    // This prevents termination during long PDF processing with multiple chunks
    if (worker && state.getActivePredictCalls() === 0) {
      log('[ClipAIble Offscreen] Terminating TTS Worker due to inactivity', {
        timeout: WORKER_INACTIVITY_TIMEOUT,
        activePredictCalls: state.getActivePredictCalls(),
        timestamp: Date.now()
      });
      worker.terminate();
      state.setTTSWorker(null);
      state.clearTTSWorkerInitPromise(); // Clear promise cache for recreation
      state.setUseWorker(false);
      state.clearWorkerInactivityTimeout();
    } else if (worker && state.getActivePredictCalls() > 0) {
      log('[ClipAIble Offscreen] Worker termination skipped - active processing in progress', {
        activePredictCalls: state.getActivePredictCalls(),
        timeout: WORKER_INACTIVITY_TIMEOUT,
        timestamp: Date.now()
      });
      // Reset timer to check again later
      resetWorkerInactivityTimer();
    }
  }, WORKER_INACTIVITY_TIMEOUT);
  
  state.setWorkerInactivityTimeout(timeout);
}



























