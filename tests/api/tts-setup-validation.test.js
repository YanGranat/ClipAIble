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
  expect(setError).toHaveBeenCalledWith({ message: expect.stringMatching(message), code: 'validation-error',
    translationKey: options.qwenModel ? 'errorQwenModelRetired' : options.qwenRegion ? 'errorQwenRegionUnsupported' : 'errorQwenWorkspaceRequired',
    translationParams: {} }, stop, 'sample-run');
});

it('accepts configured current Qwen and explicit legacy models without changing their settings', async () => {
  for (const options of [{ qwenWorkspaceId: 'sample-workspace', qwenRegion: 'beijing' }, { qwenModel: 'qwen3-tts-flash' }]) {
    const data = { outputFormat: 'audio', audioProvider: 'qwen', qwenApiKey: 'synthetic-key', ...options };
    const original = structuredClone(data);
    expect(await validateAudioApiKeys(data, vi.fn())).toBe(true);
    expect(data).toEqual(original);
  }
});

it.each(['nova', 'fable', 'onyx'])('rejects unavailable OpenAI voice %s before key lookup or article processing', async voice => {
  setError.mockClear(); chrome.storage.local.get.mockClear();
  const stop = vi.fn();
  const data = { outputFormat: 'audio', audioProvider: 'openai', audioVoice: voice, processingRunId: 'sample-run' };
  expect(await validateAudioApiKeys(data, stop)).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ code: 'validation-error',
    translationKey: 'errorOpenaiVoiceUnavailable', translationParams: { voice } }), stop, 'sample-run');
  expect(chrome.storage.local.get.mock.calls.some(([keys]) => keys.includes('openai_api_key'))).toBe(false);
  expect(data.audioVoice).toBe(voice);
});

it.each(['unknown', '__proto__', 'constructor'])('rejects unsupported audio provider %s at preflight', async provider => {
  setError.mockClear();
  expect(await validateAudioApiKeys({ outputFormat: 'audio', audioProvider: provider }, vi.fn())).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorUnknownAudioProvider', translationParams: { provider } }), expect.any(Function), undefined);
});
