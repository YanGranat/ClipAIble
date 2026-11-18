// @ts-check
// Background startup recovery and initialization.

import { validateDeps } from '../utils/di-validation.js';

/**
 * @param {import('../types.js').InitializationDeps} deps
 * @returns {function(): Promise<void>}
 */
export function initInitialization(deps) {
  validateDeps(deps, 'InitializationDeps', 'initialization');
  const { log, logWarn, CONFIG, handleError, clearDecryptedKeyCache,
    getProcessingState, restoreStateFromStorage, cleanupPdfJobsAfterRestore, runInitialization, startKeepAlive } = deps;

  return function initExtension() {
    return (async () => {
        try {
          log('Extension loaded', { config: CONFIG });
          clearDecryptedKeyCache();
          await runInitialization();
          const saved = await chrome.storage.local.get(['summary_generating', 'key_theses_generating']);
          if (saved.summary_generating || saved.key_theses_generating) {
            await chrome.storage.local.set({
              summary_generating: false,
              summary_generating_start_time: null,
              key_theses_generating: false,
              key_theses_generating_start_time: null,
              key_theses_cancel_requested: false
            });
          }
          await restoreStateFromStorage();
          await cleanupPdfJobsAfterRestore();
          if (getProcessingState().isProcessing) await startKeepAlive();
        } catch (error) {
          try {
            const normalized = await handleError(error, {
              source: 'initialization', errorType: 'stateCheckFailed',
              logError: false, createUserMessage: false
            });
            logWarn('Background initialization failed', normalized);
          } catch (reportError) {
            logWarn('Background initialization recovery failed', reportError);
          }
          throw error;
        }
    })();
  };
}

/** Share an active attempt; retry a failed startup only for an explicit operation. */
export function createInitializationGate(initialize) {
  let pending, failure, ready = false;
  return function ensureInitialization(retry = false) {
    if (ready) return Promise.resolve();
    if (pending) return pending;
    if (failure && !retry) return Promise.reject(failure);
    const attempt = Promise.resolve().then(initialize);
    const current = attempt.then(() => {
      ready = true;
      failure = undefined;
    }, error => {
      failure = error;
      throw error;
    }).finally(() => { if (pending === current) pending = undefined; });
    pending = current;
    return current;
  };
}
