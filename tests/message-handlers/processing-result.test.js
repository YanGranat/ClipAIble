import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleProcessArticle } from '../../scripts/message-handlers/processing.js';
import { routeMessage } from '../../scripts/message-handlers/index.js';
import * as state from '../../scripts/state/processing.js';
const mocks = vi.hoisted(() => ({ sizeValid: false }));

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), sanitizeLogData: value => value, shouldLogDiagnostic: () => false }));
vi.mock('../../scripts/utils/security/security.js', async original => ({ ...(await original()), isValidMessageSize: () => mocks.sizeValid }));
beforeEach(() => { mocks.sizeValid = false; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('processing admission responses', () => {
  it('reports a rejected start as a localized failure', async () => {
    const response = await new Promise(resolve => {
      handleProcessArticle({ data: { url: 'https://example.org/article', mode: 'automatic' } }, {}, resolve, async () => false, vi.fn());
    });
    expect(response).toMatchObject({ started: false, success: false, translationKey: 'errorProcessingNotStarted', translationParams: {} });
    expect(response.error).toBeTruthy();
  });
  it('retains a successful admission response', async () => {
    const processingRunId = crypto.randomUUID();
    const response = await new Promise(resolve => handleProcessArticle({ data: {} }, {}, resolve, async data => {
      data.processingRunId = processingRunId;
      return true;
    }, vi.fn()));
    expect(response).toEqual({ started: true, processingRunId });
  });
  it('returns a translation identity when rejecting an oversized trusted request', () => {
    const send = vi.fn();
    const id = chrome.runtime.id;
    routeMessage({ action: 'processArticle', data: {} }, { id, url: chrome.runtime.getURL('popup.html') }, send, {});
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'errorMessageTooLarge', translationParams: {} }));
  });
  it('reports the existing owner without invoking a second processor', async () => {
    mocks.sizeValid = true;
    await state.resetState();
    try {
      expect(await state.startProcessing()).toBe(true);
      const activeRunId = state.getProcessingRunId();
      const start = vi.fn(), send = vi.fn();
      routeMessage({ action: 'processArticle', data: {} }, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }, send, { startArticleProcessing: start });
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ started: false, success: false, busy: true, activeRunId }));
      expect(start).not.toHaveBeenCalled();
      expect(state.getProcessingState()).toMatchObject({ processingRunId: activeRunId, isProcessing: true });
    } finally {
      await state.resetState();
    }
  });

  it('distinguishes a pending reservation from an idle worker', async () => {
    await state.resetState();
    let releaseLanguage;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise(resolve => { releaseLanguage = resolve; }));
    const reservation = state.startProcessing();
    try {
      expect(state.getProcessingState().isProcessing).toBe(false);
      const start = vi.fn(), send = vi.fn();
      handleProcessArticle({ data: {} }, {}, send, start, vi.fn());
      expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        started: false, busy: true, activeRunId: state.getProcessingRunId()
      }));
      expect(start).not.toHaveBeenCalled();
    } finally {
      releaseLanguage?.({ ui_language: 'en' });
      await reservation;
      await state.resetState();
    }
  });

  it('does not borrow a validation error from a previous run', async () => {
    await state.resetState();
    try {
      await state.startProcessing();
      await state.setError({ message: 'Previous validation failed', translationKey: 'errorInvalidKey' });
      const rejected = await new Promise(resolve => {
        handleProcessArticle({ data: {} }, {}, resolve, async data => {
          data.processingRunId = crypto.randomUUID();
          return false;
        }, vi.fn());
      });
      expect(rejected).toMatchObject({ started: false, translationKey: 'errorProcessingNotStarted' });
      expect(rejected.error).not.toBe('Previous validation failed');
      expect(rejected.busy).toBeUndefined();
    } finally {
      await state.resetState();
    }
  });
});

it('rejects malformed offscreen progress and ignores a late update after download completion', async () => {
  mocks.sizeValid = true;
  const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('offscreen.html') };
  const reply = (action, data) => new Promise(resolve => routeMessage({ action, data }, sender, resolve, {}));
  await state.resetState();
  try {
    expect(await state.startProcessing()).toBe(true);
    const processingRunId = state.getProcessingRunId();
    state.updateState({ outputFormat: 'audio', progress: 60 }, processingRunId);
    const progress = { processingRunId, totalSentences: 4, sentenceIndex: 4 };
    expect(await reply('TTS_PROGRESS', { ...progress, sentenceIndex: 5 })).toMatchObject({ success: false });
    expect(state.getProcessingState().progress).toBe(60);
    expect(await reply('TTS_PROGRESS', progress)).toMatchObject({ success: true });
    expect(state.getProcessingState().progress).toBe(86);
    await reply('TTS_PROGRESS', { ...progress, sentenceIndex: 2 });
    expect(state.getProcessingState().progress).toBe(86);
    expect(state.getProcessingState()).toMatchObject({ statusTranslationKey: 'statusGeneratingAudioChunks',
      statusTranslationParams: { current: 4, total: 4 } });
    await state.completeProcessing(undefined, processingRunId);
    await reply('TTS_PROGRESS', progress);
    expect(await reply('getState')).toMatchObject({ processingRunId, phase: 'complete', progress: 100 });
  } finally {
    await state.resetState();
  }
});

it('keeps the latest offscreen speech segment when two updates round to the same percentage', async () => {
  mocks.sizeValid = true;
  const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('offscreen.html') };
  await state.resetState();
  try {
    expect(await state.startProcessing()).toBe(true);
    const processingRunId = state.getProcessingRunId();
    state.updateState({ outputFormat: 'audio', progress: 60 }, processingRunId);
    const sendProgress = sentenceIndex => new Promise(resolve => routeMessage({ action: 'TTS_PROGRESS',
      data: { processingRunId, totalSentences: 200, sentenceIndex } }, sender, resolve, {}));
    expect(await sendProgress(4)).toEqual({ success: true });
    expect(await sendProgress(2)).toEqual({ success: true, ignored: true });
    expect(state.getProcessingState()).toMatchObject({ progress: 60, statusTranslationKey: 'statusGeneratingAudioChunks',
      statusTranslationParams: { current: 4, total: 200 } });
  } finally {
    await state.resetState();
  }
});
