// @ts-check
// Key theses generation handler (mirrors summary.js flow)

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { getProcessingState } from '../state/processing.js';
import { generateKeyTheses } from '../translation/index.js';
import { getUILanguage, tSync } from '../locales.js';
import { CONFIG } from '../utils/config.js';
import { isPopupOpen } from '../background/popup-connection.js';
import { createNotification } from '../background/notifications.js';

const STORAGE_KEYS = { KEY_THESES_TEXT: 'key_theses_text', KEY_THESES_GENERATING: 'key_theses_generating' };

/**
 * Start key theses generation with proper state management
 * @param {{contentItems: import('../types.js').ContentItem[], apiKey: string, model: string, url: string, language: string}} data
 * @param {function(): void} startKeepAlive
 * @param {function(): Promise<void>} stopKeepAlive
 * @param {function(import('../types.js').MessageResponse): void} [sendResponse]
 * @returns {Promise<void>}
 */
export async function startKeyThesesGeneration(data, startKeepAlive, stopKeepAlive, sendResponse = null) {
  const startTime = Date.now();

  log('[generateKeyTheses] startKeyThesesGeneration called', {
    contentItemsCount: data?.contentItems?.length ?? 0,
    url: data?.url?.slice?.(0, 50) + (data?.url?.length > 50 ? '...' : ''),
    model: data?.model,
    language: data?.language,
    hasApiKey: !!data?.apiKey,
    hasSendResponse: !!sendResponse,
    timestamp: startTime
  });

  try {
    const existingState = await chrome.storage.local.get(['key_theses_generating', 'key_theses_generating_start_time']);
    if (existingState.key_theses_generating && existingState.key_theses_generating_start_time) {
      const timeSinceStart = Date.now() - Number(existingState.key_theses_generating_start_time);
      const progressCheck = await chrome.storage.local.get(['key_theses_text', 'key_theses_saved_timestamp']);
      const hasKeyTheses = !!progressCheck.key_theses_text;
      const hasRecentSave = progressCheck.key_theses_saved_timestamp &&
        (Date.now() - Number(progressCheck.key_theses_saved_timestamp)) < 60000;
      const HUNG_THRESHOLD_MS = 5 * 1000;

      log('[generateKeyTheses] Existing generation state', {
        timeSinceStart,
        hasKeyTheses,
        hasRecentSave,
        HUNG_THRESHOLD_MS,
        STALE_MS: CONFIG.KEY_THESES_STALE_THRESHOLD_MS,
        timestamp: Date.now()
      });

      if (timeSinceStart < HUNG_THRESHOLD_MS && (hasKeyTheses || hasRecentSave)) {
        logWarn('[generateKeyTheses] Skipping: generation already in progress (recent, with progress)', { timeSinceStart });
        if (sendResponse) sendResponse({ error: 'Key theses generation is already in progress' });
        return;
      }
      if (timeSinceStart < HUNG_THRESHOLD_MS && !hasKeyTheses && !hasRecentSave) {
        log('[generateKeyTheses] Clearing hung flag (recent, no progress)', { timeSinceStart });
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
      } else if (timeSinceStart < CONFIG.KEY_THESES_STALE_THRESHOLD_MS) {
        if (!hasKeyTheses && !hasRecentSave) {
          log('[generateKeyTheses] Clearing hung flag (stale, no progress)', { timeSinceStart });
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        } else {
          logWarn('[generateKeyTheses] Skipping: generation already in progress (progress detected)', { timeSinceStart });
          if (sendResponse) sendResponse({ error: 'Key theses generation is already in progress' });
          return;
        }
      } else {
        log('[generateKeyTheses] Clearing stale flag', { timeSinceStart });
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
      }
    }

    log('[generateKeyTheses] Setting key_theses_generating=true, starting keep-alive', { timestamp: Date.now() });
    await chrome.storage.local.set({
      key_theses_generating: true,
      key_theses_generating_start_time: startTime
    });
    startKeepAlive();
    if (sendResponse) {
      sendResponse({ started: true });
      log('[generateKeyTheses] Sent started:true to popup', { timestamp: Date.now() });
    }

    const timeoutMs = CONFIG.KEY_THESES_TIMEOUT_MS;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Key theses generation timed out after ${Math.round(timeoutMs / 1000 / 60)} minutes`));
      }, timeoutMs);
    });

    log('[generateKeyTheses] Calling generateKeyTheses (AI)', { timeoutMs, timestamp: Date.now() });
    let result;
    try {
      result = await Promise.race([generateKeyTheses(data), timeoutPromise]);
      log('[generateKeyTheses] generateKeyTheses returned', {
        hasKeyTheses: !!result?.keyTheses,
        keyThesesLength: result?.keyTheses?.length ?? 0,
        timestamp: Date.now()
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    log('[generateKeyTheses] Saving to storage, clearing generating flag', {
      keyThesesLength: result?.keyTheses?.length ?? 0,
      timestamp: Date.now()
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.KEY_THESES_TEXT]: result.keyTheses,
      key_theses_generating: false,
      key_theses_generating_start_time: null,
      key_theses_saved_timestamp: Date.now()
    });

    try {
      if (!isPopupOpen()) {
        const uiLang = await getUILanguage();
        const message = tSync('notificationKeyThesesReady', uiLang);
        await createNotification(message);
        log('[generateKeyTheses] Notification sent (popup was closed)', { timestamp: Date.now() });
      } else {
        log('[generateKeyTheses] Popup open, no notification', { timestamp: Date.now() });
      }
    } catch (notifError) {
      logWarn('[generateKeyTheses] Failed to show notification', { error: notifError?.message });
    }

    const finalState = getProcessingState();
    if (!finalState.isProcessing) {
      await stopKeepAlive();
      log('[generateKeyTheses] stopKeepAlive called', { timestamp: Date.now() });
    } else {
      log('[generateKeyTheses] keep-alive left active (other processing)', { timestamp: Date.now() });
    }
    log('[generateKeyTheses] COMPLETE', {
      durationMs: Date.now() - startTime,
      keyThesesLength: result?.keyTheses?.length ?? 0,
      timestamp: Date.now()
    });
  } catch (error) {
    const isTimeout = error.message && error.message.includes('timed out');
    logError('[generateKeyTheses] FAILED', {
      error: error?.message,
      isTimeout,
      durationMs: Date.now() - startTime,
      url: data?.url?.slice?.(0, 50),
      timestamp: Date.now()
    });
    await handleError(error, {
      source: 'keyThesesGeneration',
      errorType: 'abstractGenerationFailed',
      logError: true,
      createUserMessage: true,
      context: { url: data.url || '', timestamp: Date.now(), isTimeout }
    });
    try {
      await chrome.storage.local.set({
        key_theses_generating: false,
        key_theses_generating_start_time: null
      });
    } catch (storageError) {
      logError('Failed to clear key_theses_generating on error', storageError);
    }
    const finalState = getProcessingState();
    if (!finalState.isProcessing) await stopKeepAlive();
    throw error;
  }
}
