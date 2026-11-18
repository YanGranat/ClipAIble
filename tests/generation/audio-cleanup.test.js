import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareChunkForAudio, prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { callAI } from '../../scripts/api/index.js';

vi.mock('../../scripts/api/index.js', () => ({ callAI: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/state/processing.js', () => ({
  PROCESSING_STAGES: { GENERATING: { id: 'generating' } }, getProcessingState: () => ({}), isCancelled: () => false
}));
vi.mock('../../scripts/utils/pipeline-helpers.js', async importOriginal => ({
  ...await importOriginal(), checkCancellation: vi.fn(async () => {})
}));

const original = 'Version 3.14 has 27 components. Every component retains its original purpose. Don’t remove these facts.';
const narration = "Version 3.14 has 27 components. Every component retains its original purpose. Don't remove these facts.";
const prepare = options => prepareChunkForAudio(original, 0, 1, 'synthetic-key', 'synthetic-model', 'en', options);
beforeEach(() => vi.clearAllMocks());
describe('Narration preparation', () => {
  it.each(['', '   ', null, { text: 'Unexpected response shape' }])('retains the complete source when optional cleanup returns no text: %j', async response => {
    callAI.mockResolvedValue(response);
    expect(await prepare()).toBe(narration);
    expect(callAI).toHaveBeenCalledOnce();
  });
  it('retains facts and version numbers when optional cleanup is unavailable', async () => {
    callAI.mockRejectedValue(new TypeError('Network unavailable'));
    expect(await prepare()).toBe(narration);
  });
  it.each([400, 401, 403, 429])('does not continue admission after a terminal HTTP %s error', async status => {
    const failure = Object.assign(new Error('Request rejected'), { status, retryable: false });
    callAI.mockRejectedValue(failure);
    await expect(prepareContentForAudio([{ type: 'paragraph', format: 'text', text: original.repeat(100) }], '', 'synthetic-key', 'synthetic-model', 'en', undefined, 'openai'))
      .rejects.toBe(failure);
    expect(callAI).toHaveBeenCalledOnce();
  });
  it('preserves request cancellation identity', async () => {
    const cancelled = new DOMException('Cancelled', 'AbortError');
    callAI.mockRejectedValue(cancelled);
    await expect(prepare()).rejects.toBe(cancelled);
  });
});
