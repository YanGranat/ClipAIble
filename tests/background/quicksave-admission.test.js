import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleQuickSave } from '../../scripts/background/quicksave.js';
const mocks = vi.hoisted(() => ({
  state: { isProcessing: false, error: null }, error: vi.fn(), notice: vi.fn(),
  extract: vi.fn(), prepare: vi.fn()
}));
vi.mock('../../scripts/state/processing.js', () => ({ getProcessingState: () => mocks.state }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn() }));
vi.mock('../../scripts/background/notifications.js', () => ({ createNotification: vi.fn() }));
vi.mock('../../scripts/utils/processing-helpers.js', () => ({ showQuickSaveNotification: mocks.notice,
  extractPageContent: mocks.extract, prepareQuickSaveProcessingData: mocks.prepare, handleQuickSaveError: mocks.error }));
beforeEach(() => {
  mocks.state = { isProcessing: false, error: null };
  vi.clearAllMocks();
  mocks.notice.mockResolvedValue(undefined);
  mocks.error.mockResolvedValue(undefined);
  mocks.extract.mockResolvedValue({ url: 'https://example.org/article', tabId: 8 });
  mocks.prepare.mockResolvedValue({ url: 'https://example.org/article', outputFormat: 'markdown' });
});
afterEach(() => vi.restoreAllMocks());

describe('Quick Save admission', () => {
  it('awaits and handles an asynchronous processing admission failure', async () => {
    let rejectAdmission, finished = false;
    const admission = new Promise((_, reject) => { rejectAdmission = reject; });
    admission.catch(() => {});
    const start = vi.fn(() => admission), failure = new Error('Startup unavailable');
    const result = handleQuickSave('markdown', start, 8).then(() => { finished = true; });
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    try { expect(finished).toBe(false); }
    finally { rejectAdmission(failure); await result; }
    expect(mocks.error).toHaveBeenCalledWith(failure, expect.any(Function));
    expect(finished).toBe(true);
  });
  it('handles failure to show the starting notification', async () => {
    const failure = new Error('Notification unavailable'), start = vi.fn();
    mocks.notice.mockRejectedValueOnce(failure);
    await handleQuickSave('markdown', start, 8);
    expect(mocks.error).toHaveBeenCalledWith(failure, expect.any(Function));
    expect(start).not.toHaveBeenCalled();
  });
  it('reports a rejected start without repeating an existing failed-run notification', async () => {
    const start = vi.fn(async () => { mocks.state.error = 'Failure already recorded'; return false; });
    await handleQuickSave('markdown', start, 8);
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('reports an admission that lost to another task', async () => {
    await handleQuickSave('markdown', vi.fn(async () => false), 8);
    expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorProcessingNotStarted' }), expect.any(Function));
  });
});
