import { afterEach, expect, it, vi } from 'vitest';
import { initState } from '../../popup/core/state.js';

afterEach(() => vi.unstubAllGlobals());
it.each(['cancelled', 'old error', 'connection failure'])('does not remove a new background run after reading %s state', async kind => {
  const previous = kind === 'cancelled'
    ? { isCancelled: true, lastUpdate: Date.now() }
    : { isProcessing: false, error: 'Earlier error', lastUpdate: Date.now() - 20000 };
  const stored = { processingState: previous };
  chrome.storage.local.get.mockImplementation(async () => ({ processingState: previous }));
  chrome.storage.local.remove.mockImplementation(async keys => { for (const key of keys) delete stored[key]; });
  let respond;
  chrome.runtime.sendMessage.mockImplementation((_message, callback) => { respond = callback; });
  const state = initState({ elements: {}, t: async key => key, log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), stateRefs: {} });
  const pending = state.checkProcessingState();
  const current = { isProcessing: true, processingRunId: 'current-run', lastUpdate: Date.now() };
  stored.processingState = current;
  if (kind === 'connection failure') chrome.runtime.lastError = { message: 'Receiving end does not exist' };
  respond(null);
  chrome.runtime.lastError = null;
  await pending;
  expect(stored.processingState).toBe(current);
  expect(chrome.storage.local.remove).not.toHaveBeenCalled();
});
