import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isEncrypted, encryptApiKey, decryptApiKey, getDecryptedKeyCached, clearDecryptedKeyCache,
  withApiKeyStorageLock, saveApiKeySettings, removeApiKeyIfUnchanged
} from '../../scripts/utils/encryption.js';
import { getInstallationKey } from '../../scripts/utils/security/key-store.js';
import { migrateApiKeys, runInitialization } from '../../scripts/initialization/index.js';
import { createChromeStorage } from '../helpers/chrome-storage.js';

vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn()
}));

vi.mock('../../scripts/utils/security/key-store.js', () => {
  let key;
  return { getInstallationKey: vi.fn(() => key ||= webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])) };
});

async function legacyCiphertext(value) {
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('test-extension-id'), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('clipaible-salt-v1'), iterations: 100000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return Buffer.concat([iv, new Uint8Array(data)]).toString('base64');
}

const plaintext = 'sk-synthetic-key-for-encryption-tests-0123456789';
let storage;

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  const queues = new Map();
  vi.stubGlobal('navigator', { locks: { request: vi.fn((name, operation) => {
    const result = (queues.get(name) || Promise.resolve()).catch(() => {}).then(operation);
    queues.set(name, result);
    return result;
  }) } });
  const runtime = { id: 'test-extension-id' };
  const area = createChromeStorage(runtime);
  storage = area.local;
  vi.stubGlobal('chrome', { runtime, storage: { local: storage } });
  clearDecryptedKeyCache();
});

afterEach(() => {
  clearDecryptedKeyCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('API key encryption', () => {
  it('round-trips plaintext through authenticated encryption', async () => {
    const encrypted = await encryptApiKey(plaintext);
    expect(encrypted).toMatch(/^ENC:/);
    expect(encrypted).not.toContain(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(await decryptApiKey(encrypted)).toBe(plaintext);
  });

  it('round-trips a short value using the current marker', async () => {
    const encrypted = await encryptApiKey('x');
    expect(isEncrypted(encrypted)).toBe(true);
    expect(await decryptApiKey(encrypted)).toBe('x');
  });

  it('uses a fresh IV and preserves existing prefixed ciphertext', async () => {
    const first = await encryptApiKey(plaintext);
    const second = await encryptApiKey(plaintext);
    expect(first).not.toBe(second);
    expect(await decryptApiKey(second)).toBe(plaintext);
    expect(await encryptApiKey(first)).toBe(first);
  });

  it('encrypts long hexadecimal and base64-shaped plaintext keys', async () => {
    for (const key of ['a1'.repeat(32), 'AbCd0123'.repeat(8)]) {
      const encrypted = await encryptApiKey(key);
      expect(encrypted).not.toBe(key);
      expect(encrypted).toMatch(/^ENC:/);
      expect(await decryptApiKey(encrypted)).toBe(key);
    }
  });

  it('authenticates legacy ciphertext before preserving it', async () => {
    const legacy = await legacyCiphertext(plaintext);
    expect(await decryptApiKey(legacy)).toBe(plaintext);
    expect(await decryptApiKey(await encryptApiKey(legacy))).toBe(plaintext);
  });

  it('rejects marked ciphertext authentication failures without caching a fallback', async () => {
    const encrypted = await encryptApiKey(plaintext);
    const bytes = Buffer.from(encrypted.slice(7), 'base64');
    bytes[bytes.length - 1] ^= 1;
    const corrupted = 'ENC:v2:' + bytes.toString('base64');
    await expect(decryptApiKey(corrupted)).rejects.toThrow('could not be decrypted');
    const decrypt = vi.spyOn(webcrypto.subtle, 'decrypt');
    await expect(getDecryptedKeyCached(corrupted, 'openai')).rejects.toThrow();
    await expect(getDecryptedKeyCached(corrupted, 'openai')).rejects.toThrow();
    expect(decrypt).toHaveBeenCalledTimes(2);
    await expect(decryptApiKey('ENC:invalid')).rejects.toThrow();
  });

  it('rejects empty or non-string inputs and passes through plain values on read', async () => {
    for (const value of [null, undefined, '', 123, {}]) {
      expect(isEncrypted(value)).toBe(false);
      await expect(encryptApiKey(value)).rejects.toThrow('Invalid plaintext');
      await expect(decryptApiKey(value)).rejects.toThrow('Invalid encrypted');
    }
    expect(await decryptApiKey('plain-key')).toBe('plain-key');
  });
});

describe('decrypted key cache', () => {
  it('keeps distinct authenticated values separate for the same provider', async () => {
    const values = [
      ['ENC:AAAAAAAAAAAAAGd85yQOj1iPX+L4b+iFz9eJn7oPJGAnhuAfE6zwCO4z0ckMJ1fa1MvMvKM=', 'synthetic-cache-key-26492'],
      ['ENC:AAAAAAAAAAAAAI3Ft92ePR527djwYMGbLKUyu0QPzpKnA1l+91lWMNerLoFQmIJ/sfmnBQ4=', 'synthetic-cache-key-36293']
    ];
    for (const [encrypted, key] of values) {
      expect(await decryptApiKey(encrypted)).toBe(key);
      expect(await getDecryptedKeyCached(encrypted, 'openai')).toBe(key);
    }
  });

  it('decrypts once per provider and decrypts again after clearing', async () => {
    const encrypted = await encryptApiKey(plaintext);
    const decrypt = vi.spyOn(webcrypto.subtle, 'decrypt');
    expect(await getDecryptedKeyCached(encrypted, 'openai')).toBe(plaintext);
    expect(await getDecryptedKeyCached(encrypted, 'openai')).toBe(plaintext);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(await getDecryptedKeyCached(encrypted, 'claude')).toBe(plaintext);
    expect(decrypt).toHaveBeenCalledTimes(2);
    clearDecryptedKeyCache();
    expect(await getDecryptedKeyCached(encrypted, 'openai')).toBe(plaintext);
    expect(decrypt).toHaveBeenCalledTimes(3);
  });

  it('does not restore a cached key when decryption finishes after a clear', async () => {
    const encrypted = await encryptApiKey(plaintext);
    const realDecrypt = webcrypto.subtle.decrypt.bind(webcrypto.subtle);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const decrypt = vi.spyOn(webcrypto.subtle, 'decrypt').mockImplementationOnce(async (...args) => {
      await pending;
      return realDecrypt(...args);
    });
    const reading = getDecryptedKeyCached(encrypted, 'openai');
    try {
      await vi.waitFor(() => expect(decrypt).toHaveBeenCalledOnce());
      clearDecryptedKeyCache();
    } finally {
      release();
    }
    await expect(reading).resolves.toBe(plaintext);
    await getDecryptedKeyCached(encrypted, 'openai');
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it('expires the first cached key within the maximum lifetime during continued inserts', async () => {
    const encrypted = await encryptApiKey(plaintext);
    const decrypt = vi.spyOn(webcrypto.subtle, 'decrypt');
    vi.useFakeTimers();
    try {
      await getDecryptedKeyCached(encrypted, 'openai');
      for (const provider of ['claude', 'gemini', 'deepseek']) {
        await vi.advanceTimersByTimeAsync(9 * 60_000);
        await getDecryptedKeyCached(encrypted, provider);
      }
      expect(decrypt).toHaveBeenCalledTimes(4);
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      await getDecryptedKeyCached(encrypted, 'openai');
      expect(decrypt).toHaveBeenCalledTimes(5);
    } finally {
      clearDecryptedKeyCache();
      vi.useRealTimers();
    }
  });

  it('reads a long unmarked key without mutating stored provider settings', async () => {
    const key = 'a1'.repeat(32);
    expect(await getDecryptedKeyCached(key, 'deepseek')).toBe(key);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('keeps authenticated legacy ciphertext without rewriting it', async () => {
    const legacy = await legacyCiphertext(plaintext);
    expect(await getDecryptedKeyCached(legacy, 'openai')).toBe(plaintext);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('does not replace a newly saved key when decrypting an older plaintext argument', async () => {
    const replacement = await encryptApiKey('sk-synthetic-new-key');
    const saved = { openai_api_key: plaintext };
    storage.get.mockImplementation(async () => ({ ...saved }));
    storage.set.mockImplementation(async values => { Object.assign(saved, values); });
    await storage.set({ openai_api_key: replacement });
    storage.set.mockClear();
    expect(await getDecryptedKeyCached(plaintext, 'openai')).toBe(plaintext);
    expect(saved.openai_api_key).toBe(replacement);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('rejects missing cache parameters', async () => {
    await expect(getDecryptedKeyCached(null, 'openai')).rejects.toThrow('Invalid parameters');
    await expect(getDecryptedKeyCached('key', null)).rejects.toThrow('Invalid parameters');
  });
});

describe('stored key migration', () => {
  it('does not replace a newly saved key while encrypting a startup snapshot', async () => {
    const replacement = await encryptApiKey('sk-synthetic-new-key');
    const saved = { openai_api_key: plaintext, api_keys_migrated: true };
    storage.get.mockImplementation(async () => ({ ...saved }));
    storage.set.mockImplementation(async values => { Object.assign(saved, values); });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const encrypt = webcrypto.subtle.encrypt.bind(webcrypto.subtle);
    const delayed = vi.spyOn(webcrypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
      await pending;
      return encrypt(...args);
    });
    const migration = migrateApiKeys();
    await vi.waitFor(() => expect(delayed).toHaveBeenCalledOnce());
    let keySaved = false;
    const saving = saveApiKeySettings({ openai_api_key: replacement }).then(() => { keySaved = true; });
    await Promise.resolve();
    expect(keySaved).toBe(false);
    release();
    await Promise.all([migration, saving]);
    expect(saved.openai_api_key).toBe(replacement);
  });

  it('reads its migration snapshot after acquiring the shared storage lock', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const held = withApiKeyStorageLock(() => pending);
    const replacement = await encryptApiKey('sk-synthetic-new-key');
    const saved = { openai_api_key: plaintext, api_keys_migrated: true };
    storage.get.mockImplementation(async () => ({ ...saved }));
    storage.set.mockImplementation(async values => { Object.assign(saved, values); });
    const saving = saveApiKeySettings({ openai_api_key: replacement });
    const migration = migrateApiKeys();
    expect(storage.get).not.toHaveBeenCalled();
    release();
    await Promise.all([held, saving, migration]);
    expect(saved.openai_api_key).toBe(replacement);
    expect(storage.set).toHaveBeenCalledTimes(1);
  });

  it('removes a corrupt key only if the inspected value is still current', async () => {
    const saved = { openai_api_key: 'new-value', claude_api_key: '****' };
    storage.get.mockImplementation(async () => ({ ...saved }));
    storage.remove = vi.fn(async key => { delete saved[key]; });
    await removeApiKeyIfUnchanged('openai_api_key', '****');
    expect(saved.openai_api_key).toBe('new-value');
    await removeApiKeyIfUnchanged('claude_api_key', '****');
    expect(saved.claude_api_key).toBeUndefined();
    expect(storage.remove).toHaveBeenCalledOnce();
  });

  it('releases the storage lock after a failed key save', async () => {
    storage.set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(saveApiKeySettings({ openai_api_key: 'first' })).rejects.toThrow('Storage unavailable');
    await expect(saveApiKeySettings({ openai_api_key: 'second' })).resolves.toBeUndefined();
    expect(storage.set).toHaveBeenLastCalledWith({ openai_api_key: 'second' });
  });

  it('waits for both migration and default settings before initialization completes', async () => {
    let resolveMigration;
    let resolveDefaults;
    const migration = new Promise(resolve => { resolveMigration = resolve; });
    const defaults = new Promise(resolve => { resolveDefaults = resolve; });
    storage.get.mockImplementation(keys => keys.includes('openai_api_key') ? migration : defaults);
    let completed = false;
    const initialization = runInitialization().then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolveMigration({ api_keys_migrated: true });
    await Promise.resolve();
    expect(completed).toBe(false);
    resolveDefaults({ use_selector_cache: false, enable_selector_caching: false, transcription_settings_cleaned: true });
    await initialization;
    expect(completed).toBe(true);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('repairs long plaintext keys even when migration was previously marked complete', async () => {
    const legacy = await legacyCiphertext(plaintext);
    const current = await encryptApiKey(plaintext);
    const longKey = 'a1'.repeat(32);
    storage.get.mockResolvedValue({
      api_keys_migrated: true, openai_api_key: longKey, deepseek_api_key: longKey,
      claude_api_key: legacy, gemini_api_key: current
    });
    await migrateApiKeys();
    expect(storage.get.mock.calls[0][0]).toContain('deepseek_api_key');
    const saved = storage.set.mock.calls[0][0];
    expect(Object.keys(saved).sort()).toEqual(['api_keys_migrated', 'claude_api_key', 'deepseek_api_key', 'openai_api_key']);
    expect(await decryptApiKey(saved.openai_api_key)).toBe(longKey);
    expect(await decryptApiKey(saved.deepseek_api_key)).toBe(longKey);
    expect(saved.openai_api_key).not.toBe(longKey);
  });
});

