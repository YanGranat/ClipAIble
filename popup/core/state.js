// @ts-check
// State management module
// Handles processing state polling, UI updates, and stage mapping

import { getDocumentReadyMessage, getExportFormatLabelKey } from '../../scripts/locales.js';
import { getProcessingPhase, readProcessingSnapshot } from '../../scripts/state/processing-messages.js';

/** @typedef {import('../../scripts/state/processing-messages.js').ProcessingSnapshot} ProcessingSnapshot */

const STAGE_MESSAGES = {
  starting: 'stageStarting', analyzing: 'stageAnalyzing', extracting: 'stageExtracting', translating: 'stageTranslating',
  loading_images: 'stageLoadingImages', generating: 'stageGenerating', complete: 'stageComplete'
};

const STATE_READ_TIMEOUT_MS = 5000;
const STATE_RECOVERY_WINDOW_MS = 15000;
const STATE_RECOVERY_POLL_MS = 2000;

/**
 * @template T
 * @param {Promise<T>} attempt
 * @returns {Promise<T>}
 */
function withinStateReadDeadline(attempt) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Processing state read timed out')), STATE_READ_TIMEOUT_MS);
  });
  return Promise.race([attempt, deadline]).finally(() => clearTimeout(timer));
}

/** @returns {Promise<ProcessingSnapshot|null>} */
function requestProcessingState() {
  return withinStateReadDeadline(new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getState' }, response => {
      const transportError = chrome.runtime.lastError;
      if (transportError) {
        reject(new Error(transportError.message));
      } else if (response?.success === false) {
        resolve({
          isProcessing: false,
          error: response.error || 'Unable to read processing state',
          errorCode: response.errorCode,
          errorTranslationKey: response.translationKey,
          errorTranslationParams: response.translationParams
        });
      } else {
        resolve(readProcessingSnapshot(response));
      }
    });
  }));
}

/**
 * Initialize state module
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Function} deps.t - Translation function
 * @param {Function} [deps.log] - Log function
 * @param {Function} [deps.logError] - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.setStatus - Set status function
 * @param {Function} deps.setProgress - Set progress function
 * @param {Function} deps.stopTimerDisplay - Stop timer display function
 * @param {Function} deps.startTimerDisplay - Start timer display function
 * @param {Function} deps.checkSummaryStatus - Check summary status function
 * @param {Function} [deps.checkKeyThesesStatus] - Check key theses status function
 * @param {() => Promise<import('../../scripts/types.js').LocalizedMessage|null>} [deps.getExportReadiness]
 * @param {Object} deps.stateRefs - State references object
 * @returns {Object} State functions
 */
export function initState(deps) {
  const {
    elements,
    t,
    logWarn,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    checkSummaryStatus,
    checkKeyThesesStatus,
    getExportReadiness,
    stateRefs
  } = deps;

  // Read the language already applied to this view. A storage read is not needed
  // to display progress, including when background communication is interrupted.
  function translate(key, params) {
    const language = globalThis.document?.documentElement.lang.toLowerCase().split(/[-_]/)[0];
    return t(key, language === 'uk' ? 'ua' : language || 'en', params);
  }

  async function mapStageLabel(stageId) {
    const key = STAGE_MESSAGES[stageId];
    return key ? translate(key) : null;
  }

  let renderRevision = 0;
  let readRevision = 0;
  let acceptedRead = 0;
  /** @type {string|null} */
  let presentedRunId = null;
  /** @type {ProcessingSnapshot|null} */
  let lastScheduledState = null;
  /** @type {number|null} */
  let recoveryStartedAt = null;
  /** @type {string|null} */
  let admittedRunId = null;
  let preparingLocally = false;
  let localFailure = false;
  let lastIdleStatus = null;
  let paintedRevision = 0;

  async function readReadinessIssue() {
    return getExportReadiness
      ? await withinStateReadDeadline(Promise.resolve().then(getExportReadiness))
        .catch(() => ({ key: 'errorCommunicationFailed', params: {} })) : null;
  }

  async function presentReadinessIssue(issue) {
    return { kind: 'error', text: await translate(issue.key, issue.params), translation: issue, blocked: true };
  }

  async function presentReadiness() {
    const issue = await readReadinessIssue();
    return issue ? presentReadinessIssue(issue) : { kind: 'ready', text: await translate('ready'), translation: { key: 'ready' } };
  }

  /** @param {ProcessingSnapshot} state */
  async function preparePresentation(state) {
    const phase = state.phase ?? getProcessingPhase(state);
    if (phase === 'running') {
      const key = state.statusTranslationKey || STAGE_MESSAGES[state.currentStage];
      if (key) {
        const params = state.statusTranslationParams || {};
        return { kind: 'processing', text: await translate(key, params), translation: { key, params } };
      }
      return { kind: 'processing', text: state.status, translation: null };
    }

    if (phase === 'failed') {
      const cancelledText = state.phase === undefined ? await translate('statusCancelled') : null;
      if (!cancelledText || !state.error?.includes(cancelledText)) {
        const errorKeys = {
          auth_error: 'errorAuth', rate_limit: 'errorRateLimit', timeout: 'errorTimeout', network_error: 'errorNetwork',
          parse_error: 'errorParse', provider_error: 'errorProvider', validation_error: 'errorValidation', unknown_error: 'errorUnknown'
        };
        const key = state.errorTranslationKey || errorKeys[state.errorCode];
        const translation = key ? (state.errorTranslationKey ? { key, params: state.errorTranslationParams || {} } : { key }) : null;
        const text = translation ? await translate(key, translation.params).catch(() => state.error) : state.error;
        return { kind: 'error', text, translation };
      }
    }

    if (phase === 'complete' || (phase === 'idle' && !state.phase && state.status && state.status === await translate('statusDone'))) {
      const issue = await readReadinessIssue();
      if (issue) return presentReadinessIssue(issue);
      const format = state.outputFormat || elements.mainFormatSelect?.value || elements.outputFormat?.value;
      const formatKey = getExportFormatLabelKey(format) || 'formatPdf';
      const message = getDocumentReadyMessage(await translate(formatKey), state.imageTranslationFailureCount);
      return { kind: 'ready', text: await translate(message.key, message.params), translation: { ...message, formatKey } };
    }
    if (phase === 'cancelled') {
      const readiness = await presentReadiness();
      return readiness.kind === 'error' ? readiness :
        { kind: 'pending', text: await translate('statusCancelled'), translation: { key: 'statusCancelled' } };
    }
    return presentReadiness();
  }

  /** @param {ProcessingSnapshot} state @param {number} revision */
  async function updateUIFromState(state, revision = ++renderRevision) {
    if (!state) return;
    const phase = state.phase ?? getProcessingPhase(state);
    if (preparingLocally && phase !== 'running') return;
    if (phase === 'idle' && localFailure) return;
    const presentation = await preparePresentation(state);
    if (revision !== renderRevision) return;
    paintedRevision = revision;

    const isProcessing = presentation.kind === 'processing';
    presentedRunId = isProcessing ? state.processingRunId ?? null : null;
    if (isProcessing) {
      if (state.startTime && (stateRefs.currentStartTime?.current !== state.startTime || !stateRefs.timerInterval?.current)) {
        startTimerDisplay(state.startTime);
      }
    } else {
      stopTimerDisplay();
    }
    if (elements.savePdfBtn) {
      elements.savePdfBtn.disabled = isProcessing || presentation.blocked === true;
      elements.savePdfBtn.style.display = isProcessing ? 'none' : 'block';
    }
    if (elements.cancelBtn) {
      elements.cancelBtn.classList.toggle('hidden', !isProcessing);
      elements.cancelBtn.style.display = isProcessing ? 'block' : 'none';
      if (isProcessing) elements.cancelBtn.disabled = false;
    }
    const idleStatus = phase === 'idle' ? JSON.stringify([presentation.kind, presentation.text, presentation.translation]) : null;
    if (idleStatus === null || idleStatus !== lastIdleStatus) {
      setStatus(presentation.kind, presentation.text, isProcessing ? state.startTime || stateRefs.currentStartTime?.current : null,
        presentation.translation);
    }
    lastIdleStatus = idleStatus;
    if (isProcessing) setProgress(state.progress ?? 0);
    else setProgress(0, false);
  }

  /** Read a recent saved view without assuming the service worker is still running. */
  async function readRecoverySnapshot() {
    const { processingState } = await withinStateReadDeadline(chrome.storage.local.get(['processingState']));
    const state = readProcessingSnapshot(processingState);
    if (!state?.isProcessing || state.isCancelled || !state.processingRunId) return null;
    const now = Date.now();
    if (!Number.isFinite(state.lastUpdate) || now - state.lastUpdate >= STATE_RECOVERY_WINDOW_MS ||
        state.lastUpdate > now || (Number.isFinite(state.inactivityDeadlineAt) && state.inactivityDeadlineAt <= now)) {
      return null;
    }
    return state;
  }

  async function observeProcessingState(read, ownsObservation = () => true, forceRender = false) {
    const isCurrent = () => ownsObservation() && read >= acceptedRead;
    const superseded = () => ({ state: lastScheduledState, connected: recoveryStartedAt === null, changed: false });
    try {
      const state = await requestProcessingState();
      if (!state) throw new Error('Processing state is unavailable');
      if (!isCurrent()) return superseded();
      recoveryStartedAt = null;
      admittedRunId = null;
      const changed = scheduleUIUpdate(state, read, false, forceRender);
      return { state, connected: true, changed };
    } catch (error) {
      if (!isCurrent()) return superseded();
      acceptedRead = read;
      if (recoveryStartedAt === null) {
        recoveryStartedAt = Date.now();
        logWarn?.('Unable to read processing state', { error: error?.message || String(error) });
        if (getExportReadiness && !lastScheduledState?.isProcessing && !preparingLocally && !localFailure) {
          const revision = ++renderRevision;
          const text = await translate('statusCheckingExport');
          if (revision === renderRevision && isCurrent()) {
            if (elements.savePdfBtn) elements.savePdfBtn.disabled = true;
            lastIdleStatus = null;
            setStatus('pending', text, null, { key: 'statusCheckingExport' });
          }
        }
      }

      const withinRecoveryWindow = () => Date.now() - recoveryStartedAt < STATE_RECOVERY_WINDOW_MS;
      const invalidated = error?.message?.includes('Extension context invalidated');
      if (withinRecoveryWindow() && !invalidated) {
        const saved = await readRecoverySnapshot().catch(() => null);
        if (!isCurrent()) return superseded();
        if (saved && withinRecoveryWindow() && scheduleUIUpdate(saved, read, true)) {
          return { state: saved, connected: false, changed: true };
        }
      }
      if (!withinRecoveryWindow() || invalidated) {
        scheduleUIUpdate({
          phase: 'failed',
          isProcessing: false,
          error: 'Failed to communicate with background script',
          errorTranslationKey: 'errorCommunicationFailed'
        }, read);
      }
      return { state: null, connected: false, changed: false };
    }
  }

  async function checkProcessingState() {
    const { state } = await observeProcessingState(++readRevision, undefined, true);
    return state ?? undefined;
  }

  // Lightweight state comparison - only check key fields instead of full JSON.stringify
  // This avoids blocking the main thread with expensive serialization
  function stateChanged(newState, oldState) {
    if (!oldState) return true;
    
    // Compare only critical fields that affect UI
    return (
      newState.isProcessing !== oldState.isProcessing ||
      newState.processingRunId !== oldState.processingRunId ||
      newState.phase !== oldState.phase ||
      newState.progress !== oldState.progress ||
      newState.status !== oldState.status ||
      newState.currentStage !== oldState.currentStage ||
      newState.error !== oldState.error ||
      newState.errorCode !== oldState.errorCode ||
      newState.statusTranslationKey !== oldState.statusTranslationKey ||
      JSON.stringify(newState.statusTranslationParams) !== JSON.stringify(oldState.statusTranslationParams) ||
      newState.errorTranslationKey !== oldState.errorTranslationKey ||
      JSON.stringify(newState.errorTranslationParams) !== JSON.stringify(oldState.errorTranslationParams) ||
      newState.isCancelled !== oldState.isCancelled ||
      newState.outputFormat !== oldState.outputFormat ||
      newState.imageTranslationFailureCount !== oldState.imageTranslationFailureCount ||
      newState.startTime !== oldState.startTime
    );
  }

  let pendingUIUpdate = null;
  let scheduledRenderRevision = 0;

  /** @param {ProcessingSnapshot} state @param {number} read */
  function scheduleUIUpdate(state, read, fromStorage = false, forceRender = false) {
    if (read < acceptedRead) return false;
    if (fromStorage && ((admittedRunId && state.processingRunId !== admittedRunId) ||
        (lastScheduledState && (!lastScheduledState.isProcessing || state.processingRunId !== lastScheduledState.processingRunId ||
          (state.progress ?? 0) <= (lastScheduledState.progress ?? 0))))) {
      return false;
    }
    acceptedRead = read;
    const changed = stateChanged(state, lastScheduledState);
    lastScheduledState = state;
    if (!changed && !forceRender && (!getExportReadiness || getProcessingPhase(state) !== 'idle')) return false;
    scheduledRenderRevision = ++renderRevision;

    if (pendingUIUpdate === null) {
      pendingUIUpdate = requestAnimationFrame(async () => {
        pendingUIUpdate = null;
        if (lastScheduledState) await updateUIFromState(lastScheduledState, scheduledRenderRevision);
      });
    }
    return changed;
  }

  // A pending side-panel read never delays or duplicates the document observer.
  function createPanelObserver(callback) {
    let pending = false;
    return () => {
      if (!callback || pending) return;
      pending = true;
      void Promise.resolve().then(callback)
        .catch(error => logWarn?.('Unable to read generation status', { error: error?.message || String(error) }))
        .finally(() => { pending = false; });
    };
  }

  const observeSummary = createPanelObserver(checkSummaryStatus);
  const observeKeyTheses = createPanelObserver(checkKeyThesesStatus);

  function startStatePolling() {
    const pollTimer = stateRefs.statePollingTimeout;
    if (!pollTimer || pollTimer.current != null) return;

    function schedulePoll(delay) {
      const owner = setTimeout(() => { void poll(owner); }, delay);
      pollTimer.current = owner;
    }

    async function poll(owner) {
      const ownsObservation = () => pollTimer.current === owner;
      if (!ownsObservation()) return;
      observeSummary();
      observeKeyTheses();
      const { state, connected, changed } = await observeProcessingState(++readRevision, ownsObservation);
      if (!ownsObservation()) return;
      const interval = !connected ? STATE_RECOVERY_POLL_MS : changed ? 500 : state?.isProcessing ? 1000 : 2000;
      schedulePoll(interval);
    }

    schedulePoll(0);
  }

  return {
    checkProcessingState,
    startStatePolling,
    updateUIFromState,
    notePreparation() {
      preparingLocally = true;
      localFailure = false;
      lastIdleStatus = null;
      renderRevision++;
    },
    finishPreparation(failed) {
      preparingLocally = false;
      localFailure = failed;
      renderRevision++;
      if (!failed && lastScheduledState) scheduleUIUpdate(lastScheduledState, acceptedRead, false, true);
    },
    refreshExportReadiness() {
      if (!lastScheduledState || preparingLocally || recoveryStartedAt !== null ||
          lastScheduledState.errorTranslationKey === 'errorBackgroundInitializationFailed') return;
      const phase = getProcessingPhase(lastScheduledState);
      if (phase === 'running') return;
      localFailure = false;
      const revision = ++renderRevision;
      void translate('statusCheckingExport').then(text => {
        if (revision !== renderRevision || paintedRevision === revision) return;
        if (elements.savePdfBtn) elements.savePdfBtn.disabled = true;
        setStatus('pending', text, null, { key: 'statusCheckingExport' });
      });
      lastIdleStatus = null;
      void updateUIFromState({ phase: 'idle', isProcessing: false }, revision);
    },
    getPresentedProcessingRunId: () => presentedRunId,
    /** @param {string} [runId] */
    noteProcessingAdmission(runId) {
      preparingLocally = false;
      localFailure = false;
      admittedRunId = runId ?? null;
      recoveryStartedAt = null;
      acceptedRead = ++readRevision;
      renderRevision++;
      lastScheduledState = null;
      presentedRunId = null;
    },
    mapStageLabel
  };
}

