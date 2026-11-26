// @ts-check

/** @typedef {'idle'|'running'|'cancelled'|'failed'|'complete'} ProcessingPhase */
/** @typedef {Partial<import('../types.js').ProcessingState> & {isProcessing: boolean, phase?: ProcessingPhase}} ProcessingSnapshot */
/** @typedef {{started: true, processingRunId: string} | {started: false, success: false, error: string, translationKey?: string, translationParams?: Object, busy?: true, activeRunId?: string}} ProcessingAdmission */
/** @typedef {{success: true, cancelledRunId?: string} | {success: false, error: string, translationKey?: string, translationParams?: Object}} ProcessingCancellation */

/** @param {unknown} runId */
export function isValidProcessingRunId(runId) {
  return typeof runId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId);
}

/** @param {ProcessingSnapshot} state @returns {ProcessingPhase} */
export function getProcessingPhase(state) {
  if (state.isProcessing) return 'running';
  if (state.isCancelled) return 'cancelled';
  if (state.error) return 'failed';
  return state.statusTranslationKey === 'statusDone' ? 'complete' : 'idle';
}

/** @param {unknown} value @returns {ProcessingSnapshot|null} */
export function readProcessingSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  const state = /** @type {ProcessingSnapshot} */ (value);
  if (typeof state.isProcessing !== 'boolean' ||
      (state.processingRunId != null && !isValidProcessingRunId(state.processingRunId)) ||
      (state.progress !== undefined && (!Number.isFinite(state.progress) || state.progress < 0 || state.progress > 100)) ||
      (state.startTime != null && (!Number.isFinite(state.startTime) || state.startTime <= 0)) ||
      (state.status !== undefined && typeof state.status !== 'string') ||
      (state.error != null && typeof state.error !== 'string') ||
      (state.phase !== undefined && state.phase !== getProcessingPhase(state))) return null;
  return state;
}

/** @param {unknown} value @returns {import('../types.js').TTSProgressData|null} */
export function readTtsProgress(value) {
  if (!value || typeof value !== 'object') return null;
  const { processingRunId, sentenceIndex, totalSentences, progressBase = 60, progressRange = 35 } =
    /** @type {import('../types.js').TTSProgressData} */ (value);
  if (!isValidProcessingRunId(processingRunId) || !Number.isSafeInteger(sentenceIndex) || !Number.isSafeInteger(totalSentences) ||
      sentenceIndex < 1 || sentenceIndex > totalSentences || !Number.isFinite(progressBase) || !Number.isFinite(progressRange) ||
      progressBase < 0 || progressRange < 0 || progressBase + progressRange > 100) return null;
  return { processingRunId, sentenceIndex, totalSentences, progressBase, progressRange };
}
