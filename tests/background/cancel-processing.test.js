import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCancelProcessing } from '../../scripts/message-handlers/simple.js';
import { getProcessingRunId, getProcessingState, resetState, startProcessing } from '../../scripts/state/processing.js';
import { cancelOfflineTTSRun } from '../../scripts/api/offline-tts-offscreen.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', tSync: (key) => key }));
vi.mock('../../scripts/api/offline-tts-offscreen.js', () => ({ cancelOfflineTTSRun: vi.fn() }));

beforeEach(async () => {
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue(undefined);
  chrome.storage.local.remove.mockReset().mockResolvedValue(undefined);
  cancelOfflineTTSRun.mockReset();
  await resetState();
  await startProcessing(vi.fn());
});
afterEach(async () => { await resetState(); });

describe('processing cancellation delivery', () => {
  it('acknowledges cancellation without waiting for the old audio transport', async () => {
    const oldRunId = getProcessingRunId();
    cancelOfflineTTSRun.mockReturnValue(new Promise(() => {}));
    const respond = vi.fn();
    expect(handleCancelProcessing({}, {}, respond, vi.fn())).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond).toHaveBeenCalledWith({ success: true, cancelledRunId: oldRunId });
    expect(cancelOfflineTTSRun).toHaveBeenCalledWith(oldRunId);
    expect(getProcessingState()).toMatchObject({ isProcessing: false, status: 'idle' });
    expect(await startProcessing(vi.fn())).toBe(true);
    expect(getProcessingRunId()).not.toBe(oldRunId);
  });

  it('retains successful cancellation when the offline transport is unavailable', async () => {
    cancelOfflineTTSRun.mockRejectedValue(new Error('Transport unavailable'));
    const respond = vi.fn();
    handleCancelProcessing({}, {}, respond, vi.fn());
    await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
    expect(respond.mock.calls[0][0].success).toBe(true);
  });
});
