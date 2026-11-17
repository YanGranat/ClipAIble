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
    getProcessingState, restoreStateFromStorage, runInitialization, startKeepAlive } = deps;

  return function initExtension() {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        let initializationStarted = false;
        try {
          log('Extension loaded', { config: CONFIG });
          clearDecryptedKeyCache();
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
          initializationStarted = true;
          await runInitialization();
          setTimeout(() => {
            const state = getProcessingState();
            if (state.isProcessing) {
              Promise.resolve(startKeepAlive()).catch((error) => logWarn('Failed to restore keep-alive', error));
            }
          }, 100);
          resolve();
        } catch (error) {
          try {
            if (!initializationStarted) await runInitialization();
            const normalized = await handleError(error, {
              source: 'initialization', errorType: 'stateCheckFailed',
              logError: false, createUserMessage: false
            });
            logWarn('Background initialization failed', normalized);
          } catch (reportError) {
            logWarn('Background initialization recovery failed', reportError);
          }
          reject(error);
        }
      }, 0);
    });
  };
}
