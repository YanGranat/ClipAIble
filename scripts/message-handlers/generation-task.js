// @ts-check
// Lifecycle owner for one independent generation task.

import { log, logWarn } from '../utils/logging.js';
import { handleError } from '../utils/error-handler.js';
import { getProcessingState } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';
import { isPopupOpen } from '../background/popup-connection.js';
import { createNotification } from '../background/notifications.js';

/**
 * @param {{prefix: string, label: string, generate: Function, timeoutMs: number,
 * notificationKey: string, resultUpdates: Function, progressIntervalMs?: number}} options
 */
export function createGenerationTask({ prefix, label, generate, timeoutMs, notificationKey, resultUpdates, progressIntervalMs }) {
  let owner = null;
  let writes = Promise.resolve();
  const flags = (generating, job) => ({
    [`${prefix}_generating`]: generating,
    [`${prefix}_generating_start_time`]: generating ? job.startTime : null,
    [`${prefix}_generation_id`]: job.id
  });
  const save = (job, updates) => {
    const operation = writes.then(() => {
      if (owner === job) return chrome.storage.local.set(updates);
    });
    writes = operation.catch(() => {});
    return operation;
  };

  function cancel(expectedGenerationId) {
    const job = owner;
    if (!job || expectedGenerationId !== job.id || job.cancelled || job.finished) return { success: true, ignored: true };
    job.cancelled = true;
    job.cancel();
    void save(job, { ...flags(false, job), [`${prefix}_cancel_requested`]: false })
      .catch((error) => logWarn(`Failed to save ${label} cancellation`, error));
    return { success: true, generationId: job.id };
  }

  async function start(data, startKeepAlive, stopKeepAlive, sendResponse = null) {
    if (owner && !owner.cancelled && !owner.finished) {
      const translationKey = prefix === 'summary' ? 'summaryAlreadyGenerating' : 'keyThesesAlreadyGenerating';
      sendResponse?.({ error: tSync(translationKey, await getUILanguage()), translationKey, translationParams: {} });
      return;
    }
    let cancel;
    const cancellation = new Promise((resolve) => { cancel = resolve; });
    const job = { id: crypto.randomUUID(), startTime: Date.now(), cancelled: false, finished: false, cancel };
    owner = job;
    const checkCancelled = () => {
      if (owner !== job || job.cancelled) {
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(`${label} generation cancelled`);
        error.cancelledGeneration = true;
        error.keyThesesCancelled = prefix === 'key_theses';
        throw error;
      }
    };
    const race = async (operation) => {
      const result = await Promise.race([operation, cancellation]);
      checkCancelled();
      return result;
    };
    let timer;
    let progressTimer;
    try {
      data.onAdmitted?.(checkCancelled);
      await save(job, { ...flags(true, job), [`${prefix}_cancel_requested`]: false, [`${prefix}_error`]: null, [`${prefix}_error_translation`]: null });
      checkCancelled();
      startKeepAlive();
      try { sendResponse?.({ started: true, generationId: job.id }); }
      catch (error) { logWarn(`Failed to acknowledge ${label} generation`, error); }
      const content = data.getContent ? await race(data.getContent(checkCancelled)) : {};
      checkCancelled();
      const effectiveData = { ...data, ...content, checkCancelled };
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          job.cancelled = true;
          reject(Object.assign(new Error(`${label} generation timed out after ${Math.round(timeoutMs / 1000 / 60)} minutes`), { translationKey: 'errorTimeout', translationParams: {} }));
        }, timeoutMs);
      });
      if (progressIntervalMs) {
        progressTimer = setInterval(() => log(`${label} generation still in progress`, { elapsedMs: Date.now() - job.startTime }), progressIntervalMs);
      }
      const result = await race(Promise.race([generate(effectiveData), timeout]));
      checkCancelled();
      await save(job, {
        ...resultUpdates(result, effectiveData), ...flags(false, job),
        [`${prefix}_cancel_requested`]: false, [`${prefix}_saved_timestamp`]: Date.now()
      });
      checkCancelled();
      job.finished = true;
      if (!isPopupOpen()) {
        try {
          const language = await getUILanguage();
          checkCancelled();
          await createNotification(tSync(notificationKey, language));
        } catch (error) {
          if (!error?.cancelledGeneration) logWarn(`Failed to show ${label} notification`, error);
        }
      }
      return result;
    } catch (error) {
      if (error?.cancelledGeneration || owner !== job) return { cancelled: true };
      job.cancelled = true;
      const normalized = await handleError(error, {
        source: `${prefix}Generation`, errorType: 'abstractGenerationFailed',
        logError: true, createUserMessage: true, context: { url: data.url || '' }
      });
      await save(job, {
        [`${prefix}_error`]: normalized.userMessage || normalized.message || error.message,
        [`${prefix}_error_translation`]: normalized.translationKey
          ? { key: normalized.translationKey, params: normalized.translationParams || {} } : null
      });
      throw normalized;
    } finally {
      if (timer) clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
      if (owner === job) {
        try { await save(job, { ...flags(false, job), [`${prefix}_cancel_requested`]: false }); }
        catch (error) { logWarn(`Failed to clear ${label} generation status`, error); }
        if (owner === job) owner = null;
      }
      if (!getProcessingState().isProcessing) await stopKeepAlive();
    }
  }
  return { start, cancel, isActive: () => Boolean(owner && !owner.cancelled && !owner.finished) };
}
