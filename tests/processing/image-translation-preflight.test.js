import { beforeEach, expect, it, vi } from 'vitest';
import { validateImageTranslation } from '../../scripts/utils/validation/validation.js';
import { validateAndInitializeProcessing } from '../../scripts/utils/processing/processing-helpers.js';
import { setError } from '../../scripts/state/processing.js';
vi.mock('../../scripts/state/processing.js', async original => ({ ...await original(), setError: vi.fn(async () => {}),
  startProcessing: vi.fn(async (_start, capture) => { capture('sample-run'); return true; }), isCancelled: () => false, updateState: vi.fn() }));
vi.mock('../../scripts/utils/storage/storage.js', async original => ({ ...await original(), removeLargeData: vi.fn(async () => {}) }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
const base = () => ({ translateImages: true, language: 'fr', outputFormat: 'pdf', imageTranslationProvider: 'openai',
  apiKey: 'synthetic-article-key', googleApiKey: 'synthetic-google-key', processingRunId: 'sample-run' });
beforeEach(() => vi.clearAllMocks());

it.each([undefined, '', '  ', null, 1, '****abcd'])('rejects an invalid OpenAI image credential before content processing: %s', async imageApiKey => {
  const stop = vi.fn();
  expect(await validateImageTranslation({ ...base(), imageApiKey }, stop)).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorImageKeyRequired', translationParams: { provider: 'OpenAI' } }), stop, 'sample-run');
});

it.each(['other', '__proto__', 'constructor'])('rejects unsupported image provider %s', async imageTranslationProvider => {
  expect(await validateImageTranslation({ ...base(), imageTranslationProvider, imageApiKey: 'synthetic-image-key' }, vi.fn())).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorImageProviderUnsupported', translationParams: { provider: imageTranslationProvider } }), expect.any(Function), 'sample-run');
});

it('admits a stored encrypted image key without decrypting or substituting the article key', async () => {
  const data = { ...base(), imageApiKey: 'ENC:synthetic-image-key' }, before = structuredClone(data);
  expect(await validateImageTranslation(data, vi.fn())).toBe(true);
  expect(data).toEqual(before); expect(setError).not.toHaveBeenCalled();
});

it('keeps the legacy Google key path and validates its absence', async () => {
  expect(await validateImageTranslation({ ...base(), imageTranslationProvider: undefined }, vi.fn())).toBe(true);
  expect(await validateImageTranslation({ ...base(), imageTranslationProvider: undefined, googleApiKey: '' }, vi.fn())).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorImageKeyRequired', translationParams: { provider: 'Google' } }), expect.any(Function), 'sample-run');
});

it('rejects an unsupported Google edit model before article extraction', async () => {
  const stop = vi.fn();
  expect(await validateAndInitializeProcessing({ ...base(), imageTranslationProvider: 'gemini', geminiImageModel: 'constructor' }, stop, vi.fn())).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorImageModelUnsupported' }), stop, 'sample-run');
});

it.each([{ outputFormat: 'markdown' }, { outputFormat: 'audio' }, { language: 'auto' }, { translateImages: false }])('skips inactive image settings without rejecting or charging: %s', async inactive => {
  expect(await validateImageTranslation({ ...base(), imageTranslationProvider: 'invalid', ...inactive }, vi.fn())).toBe(true);
  expect(setError).not.toHaveBeenCalled();
});

it('stops the actual initialization boundary before article extraction when the independent image key is missing', async () => {
  const stop = vi.fn();
  expect(await validateAndInitializeProcessing(base(), stop, vi.fn())).toBe(false);
  expect(setError).toHaveBeenCalledWith(expect.objectContaining({ translationKey: 'errorImageKeyRequired' }), stop, 'sample-run');
});
