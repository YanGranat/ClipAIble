import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAI, callAIWithImage, callAIWithImageAndHistory } from '../../scripts/api/index.js';
import { detectContentLanguage } from '../../scripts/translation/detection.js';
import { translateBatch, translateText } from '../../scripts/translation/text.js';

const mocks = vi.hoisted(() => ({ decrypt: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ getDecryptedKeyCached: mocks.decrypt, decryptApiKey: mocks.decrypt, clearDecryptedKeyCache: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('request credential admission', () => {
  it.each([
    ['text', () => callAI('', 'Sample', 'ENC:synthetic', 'gpt-6.1-sol', false, { provider: 'openai' })],
    ['image', () => callAIWithImage('', 'Sample', 'data:image/png;base64,c2FtcGxl', 'ENC:synthetic', 'gpt-6.1-sol', false, { provider: 'openai' })],
    ['history', () => callAIWithImageAndHistory('', 'Sample', 'data:image/png;base64,c2FtcGxl', [], 'ENC:synthetic', 'gpt-6.1-sol', false, { provider: 'openai' })],
    ['language detection', () => detectContentLanguage([{ type: 'paragraph', text: 'Source reading' }], 'ENC:synthetic', 'gpt-6.1-sol', { provider: 'openai' })],
    ['translation', () => translateText('Source reading', 'French', 'ENC:synthetic', 'gpt-6.1-sol', { provider: 'openai' })],
    ['batch translation', () => translateBatch(['Source A', 'Source B'], 'French', 'ENC:synthetic', 'gpt-6.1-sol', { provider: 'openai' })]
  ])('rejects failed %s key decryption before any network request', async (_name, request) => {
    const failure = Object.assign(new Error('Stored key cannot be read'), { translationKey: 'errorApiKeyRead', translationParams: {} });
    mocks.decrypt.mockRejectedValue(failure);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(request()).rejects.toBe(failure);
    expect(fetch).not.toHaveBeenCalled();
  });
});
