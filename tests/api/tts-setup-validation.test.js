import { expect, it, vi } from 'vitest';
import { validateAudioApiKeys } from '../../scripts/utils/validation/validation.js';
import { setError } from '../../scripts/state/processing.js';
vi.mock('../../scripts/state/processing.js', () => ({ setError: vi.fn(), ERROR_CODES: { VALIDATION_ERROR: 'validation-error' } }));

it.each([
  [{}, /workspace/],
  [{ qwenWorkspaceId: 'sample-workspace', qwenRegion: 'other' }, /region/],
  [{ qwenModel: 'qwen3-tts-flash-2025-11-27' }, /retired/]
])('rejects Qwen setup before article processing: %s', async (options, message) => {
  setError.mockClear(); const stop = vi.fn();
  expect(await validateAudioApiKeys({ outputFormat: 'audio', audioProvider: 'qwen', qwenApiKey: 'synthetic-key', processingRunId: 'sample-run', ...options }, stop)).toBe(false);
  expect(setError).toHaveBeenCalledWith({ message: expect.stringMatching(message), code: 'validation-error' }, stop, 'sample-run');
});

it('accepts configured current Qwen and explicit legacy models without changing their settings', async () => {
  for (const options of [{ qwenWorkspaceId: 'sample-workspace', qwenRegion: 'beijing' }, { qwenModel: 'qwen3-tts-flash' }]) {
    const data = { outputFormat: 'audio', audioProvider: 'qwen', qwenApiKey: 'synthetic-key', ...options };
    const original = structuredClone(data);
    expect(await validateAudioApiKeys(data, vi.fn())).toBe(true);
    expect(data).toEqual(original);
  }
});
