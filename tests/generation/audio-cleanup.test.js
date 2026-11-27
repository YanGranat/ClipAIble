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
const narration = original;
const prepare = options => prepareChunkForAudio(original, 0, 1, 'synthetic-key', 'synthetic-model', 'en', options);
beforeEach(() => vi.clearAllMocks());
describe('Narration preparation', () => {
  it.each(['', '   ', null, { text: 'Unexpected response shape' }])('retains the complete source when optional cleanup returns no text: %j', async response => {
    callAI.mockResolvedValue(response);
    expect(await prepare()).toBe(narration);
    expect(callAI).toHaveBeenCalledOnce();
  });
  it('keeps paragraphs and line breaks in the text sent to the narrator', async () => {
    callAI.mockResolvedValue('Opening  paragraph.\r\n \r\nPart one.\r\n  Part two.\n\n  Closing paragraph.');
    expect(await prepare()).toBe('Opening  paragraph.\r\n \r\nPart one.\r\n  Part two.\n\n  Closing paragraph.');
  });

  it('retains facts and version numbers when optional cleanup is unavailable', async () => {
    callAI.mockRejectedValue(new TypeError('Network unavailable'));
    expect(await prepare()).toBe(narration);
  });
  it.each([400, 401, 403, 429])('does not continue admission after a terminal HTTP %s error', async status => {
    const failure = Object.assign(new Error('Request rejected'), { status, retryable: false });
    callAI.mockRejectedValue(failure);
    const options = { promptOverrides: { audioPreparation: 'Keep the source text. {{languageInstruction}}' } };
    await expect(prepareContentForAudio([{ type: 'paragraph', format: 'text', text: original.repeat(100) }], '', 'synthetic-key', 'synthetic-model', 'en', undefined, 'openai', undefined, options))
      .rejects.toBe(failure);
    expect(callAI).toHaveBeenCalledOnce();
  });
  it('preserves request cancellation identity', async () => {
    const cancelled = new DOMException('Cancelled', 'AbortError');
    callAI.mockRejectedValue(cancelled);
    await expect(prepare()).rejects.toBe(cancelled);
  });
  it.each(['openai', 'google', 'openrouter', 'elevenlabs', 'qwen', 'respeecher', 'offline', 'supertonic'])('does not ask a separate model to rewrite narration by default for %s', async provider => {
    const text = 'The filter (retained for calibration) passes 12.75% of the signal.\nIts offset is −1.25 V.';
    const chunks = await prepareContentForAudio([{ type: 'paragraph', format: 'text', text }], '', 'synthetic-key', 'synthetic-model', 'en', undefined, provider);
    expect(chunks).toEqual([{ index: 0, text }]);
    expect(callAI).not.toHaveBeenCalled();
  });
  it('applies a saved custom preparation only for a cloud voice with its own text credentials', async () => {
    const content = [{ type: 'paragraph', format: 'text', text: original }];
    const options = { promptOverrides: { audioPreparation: 'Expand the abbreviation only. {{languageInstruction}}' } };
    callAI.mockResolvedValue('Custom narration.');
    for (const provider of ['offline', 'supertonic']) {
      await expect(prepareContentForAudio(content, '', 'synthetic-key', 'synthetic-model', 'en', undefined, provider, undefined, options))
        .resolves.toEqual([{ index: 0, text: original }]);
    }
    expect(callAI).not.toHaveBeenCalled();
    await expect(prepareContentForAudio(content, '', '', 'synthetic-model', 'en', undefined, 'google', undefined, options))
      .rejects.toMatchObject({ translationKey: 'errorNoApiKey' });
    await expect(prepareContentForAudio(content, '', 'synthetic-key', 'synthetic-model', 'en', undefined, 'google', undefined, options))
      .resolves.toEqual([{ index: 0, text: 'Custom narration.' }]);
    expect(callAI).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Expand the abbreviation only.'), expect.stringContaining(original), 'synthetic-key', 'synthetic-model', false, options);
  });
});
