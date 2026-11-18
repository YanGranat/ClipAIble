import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeDefaultSettings, migrateApiKeys, runInitialization } from '../../scripts/initialization/index.js';

const mocks = vi.hoisted(() => ({ encrypt: vi.fn() }));
vi.mock('../../scripts/utils/encryption.js', () => ({ encryptApiKey: mocks.encrypt, withApiKeyStorageLock: async operation => operation() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));
let data, storage;
beforeEach(() => {
  data = { use_selector_cache: false, enable_selector_caching: false, transcription_settings_cleaned: true };
  storage = { get: vi.fn(async () => structuredClone(data)), set: vi.fn(async update => { Object.assign(data, structuredClone(update)); }), remove: vi.fn(async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }) };
  mocks.encrypt.mockReset().mockImplementation(async key => key.startsWith('ENC:') ? key : 'ENC:unit:' + key);
  vi.stubGlobal('chrome', { storage: { local: storage } });
});
afterEach(() => vi.unstubAllGlobals());

it('propagates a failed migration read so startup can be retried', async () => {
  const error = new Error('Storage unavailable');
  storage.get.mockRejectedValueOnce(error);
  await expect(migrateApiKeys()).rejects.toBe(error);
  expect(storage.set).not.toHaveBeenCalled();
});

it('propagates a failed defaults write while preserving existing preferences', async () => {
  const error = new Error('Storage unavailable');
  delete data.use_selector_cache;
  storage.set.mockRejectedValueOnce(error);
  await expect(initializeDefaultSettings()).rejects.toBe(error);
  expect(data.enable_selector_caching).toBe(false);
});

it('removes obsolete transcript caches without removing owned fallback records', async () => {
  data.lastSubtitles = { subtitles: [{ text: 'Old transcript' }] };
  data.pendingSubtitles = { subtitles: [{ text: 'Old fallback' }] };
  data['pendingSubtitles-sample-request'] = { subtitles: [{ text: 'Owned fallback' }] };
  await initializeDefaultSettings();
  expect(data.lastSubtitles).toBeUndefined();
  expect(data.pendingSubtitles).toBeUndefined();
  expect(data['pendingSubtitles-sample-request']).toEqual({ subtitles: [{ text: 'Owned fallback' }] });
});

it('preserves a failed key and retries migration without re-encrypting an accepted value', async () => {
  data.openai_api_key = 'example-primary-key';
  data.claude_api_key = 'example-secondary-key';
  mocks.encrypt.mockImplementation(async key => {
    if (key === 'example-secondary-key') throw new Error('Encryption unavailable');
    return key.startsWith('ENC:') ? key : 'ENC:unit:' + key;
  });
  await runInitialization();
  expect(data).toMatchObject({ openai_api_key: 'ENC:unit:example-primary-key', claude_api_key: 'example-secondary-key', use_selector_cache: false, enable_selector_caching: false });
  mocks.encrypt.mockImplementation(async key => key.startsWith('ENC:') ? key : 'ENC:unit:' + key);
  await runInitialization();
  expect(data).toMatchObject({ openai_api_key: 'ENC:unit:example-primary-key', claude_api_key: 'ENC:unit:example-secondary-key', use_selector_cache: false, enable_selector_caching: false });
});

it('drains both startup phases before reporting a failure and permitting a retry', async () => {
  const error = new Error('Migration read unavailable');
  let releaseDefaults, finished = false;
  storage.get.mockImplementation(keys => keys.includes('openai_api_key') ? Promise.reject(error) : new Promise(resolve => { releaseDefaults = resolve; }));
  const result = runInitialization().catch(error => { finished = true; return error; });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(typeof releaseDefaults).toBe('function');
  releaseDefaults(structuredClone(data));
  expect(await result).toBe(error);
  expect(finished).toBe(true);
});
