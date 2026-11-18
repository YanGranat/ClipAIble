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
    const response = await new Promise(resolve => handleProcessArticle({ data: {} }, {}, resolve, async () => true, vi.fn()));
    expect(response).toEqual({ started: true });
  });
  it('returns a translation identity when rejecting an oversized trusted request', () => {
    const send = vi.fn();
    const id = chrome.runtime.id;
    routeMessage({ action: 'processArticle', data: {} }, { id, url: chrome.runtime.getURL('popup.html') }, send, {});
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'errorMessageTooLarge', translationParams: {} }));
  });
  it('returns a typed failure for an already-running task before invoking a second processor', () => {
    mocks.sizeValid = true;
    vi.spyOn(state, 'getProcessingState').mockReturnValue({ isProcessing: true });
    const start = vi.fn(), send = vi.fn();
    routeMessage({ action: 'processArticle', data: {} }, { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }, send, { startArticleProcessing: start });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ started: false, success: false, translationKey: 'errorProcessingNotStarted' }));
    expect(start).not.toHaveBeenCalled();
  });
});
