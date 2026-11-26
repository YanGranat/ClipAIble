// @ts-check
// TTS API key save handlers (ElevenLabs, Qwen, Respeecher, Google TTS)

import { saveApiKeySettings } from '../../scripts/utils/encryption.js';
import { isApiKeyToken } from '../utils/api-key-validation.js';

const keySaves = new WeakMap();
const getShortKeyError = key => key.length < 10 ? 'keyTooShort' : null;
const getTokenError = key => isApiKeyToken(key) ? null : 'invalidKeyFormat';

/**
 * Generic function to save TTS API key
 * @param {Object} config - Configuration
 * @param {HTMLInputElement} config.input - Input element
 * @param {HTMLElement} [config.toggleButton] - Toggle button element
 * @param {string} config.storageKey - Storage key
 * @param {Function} config.encryptApiKey - Encrypt API key function
 * @param {Function} config.maskApiKey - Mask API key function
 * @param {Function} config.logError - Error logging function
 * @param {Function} config.showToast - Show toast function
 * @param {Function} config.t - Translation function
 * @param {(key: string) => string | null} config.getValidationError - Key validation error translation key
 * @param {string} config.keyName - Key name for error messages
 */
async function saveTtsApiKey(config) {
  const {
    input,
    toggleButton,
    storageKey,
    encryptApiKey,
    maskApiKey,
    logError,
    showToast,
    t,
    getValidationError,
    keyName
  } = config;

  const field = keySaves.get(input) || { requested: 0, accepted: 0 };
  keySaves.set(input, field);
  const revision = ++field.requested;
  const draft = input.value;
  const type = input.type;
  const previousCiphertext = input.dataset.encrypted;
  const key = draft.trim();
  if (!key) {
    const inputKeyName = keyName === 'Respeecher' ? 'Respecher' : keyName;
    const pleaseEnterKeyText = await t(`pleaseEnter${inputKeyName}ApiKey`);
    if (revision === field.requested) showToast(pleaseEnterKeyText, 'error', { key: `pleaseEnter${inputKeyName}ApiKey` });
    return;
  }
  
  if (key.startsWith('****') || key.startsWith('••••')) {
    return;
  }
  
  const validationError = /^[\x20-\x7E]+$/.test(key) ? getValidationError(key) : 'invalidKeyFormat';
  if (validationError) {
    const message = await t(validationError);
    if (revision === field.requested) showToast(message, 'error', { key: validationError });
    return;
  }
  field.accepted = revision;

  try {
    const encrypted = await encryptApiKey(key);
    if (revision !== field.accepted) return;
    await saveApiKeySettings({ [storageKey]: encrypted });
    if (revision !== field.accepted) return;
    if (input.value === draft && input.type === type && input.dataset.encrypted === previousCiphertext) {
      input.value = maskApiKey(key);
      input.type = 'password';
      input.dataset.encrypted = encrypted;
      delete input.dataset.decrypted;
      if (toggleButton) {
        const eyeIcon = toggleButton.querySelector('.eye-icon');
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    }
    const savedKeyName = keyName === 'GoogleTts' ? 'googleTts' : keyName.toLowerCase();
    const keySavedText = await t(`${savedKeyName}KeySaved`);
    if (revision === field.requested) showToast(keySavedText, 'success', { key: `${savedKeyName}KeySaved` });
  } catch (error) {
    logError(`Failed to save ${keyName} API key`, error);
    const failedToSaveText = await t('failedToSave');
    if (revision === field.requested) showToast(failedToSaveText, 'error', { key: 'failedToSave' });
  }
}

/**
 * Setup TTS API key save handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.encryptApiKey - Encrypt API key function
 * @param {Function} deps.maskApiKey - Mask API key function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.showToast - Show toast function
 * @param {Function} deps.t - Translation function
 */
export function setupTtsKeyHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    encryptApiKey,
    maskApiKey,
    logError,
    showToast,
    t
  } = deps;

  // ElevenLabs API key
  if (elements.saveElevenlabsApiKey) {
    elements.saveElevenlabsApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.elevenlabsApiKey,
        toggleButton: elements.toggleElevenlabsApiKey,
        storageKey: STORAGE_KEYS.STORAGE_ELEVENLABS_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        getValidationError: getShortKeyError,
        keyName: 'Elevenlabs'
      });
    });
  }

  // Qwen API key
  if (elements.saveQwenApiKey) {
    elements.saveQwenApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.qwenApiKey,
        toggleButton: elements.toggleQwenApiKey,
        storageKey: STORAGE_KEYS.STORAGE_QWEN_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        getValidationError: getShortKeyError,
        keyName: 'Qwen'
      });
    });
  }

  // Respeecher API key
  if (elements.saveRespeecherApiKey) {
    elements.saveRespeecherApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.respeecherApiKey,
        toggleButton: elements.toggleRespeecherApiKey,
        storageKey: STORAGE_KEYS.STORAGE_RESPEECHER_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        getValidationError: getShortKeyError,
        keyName: 'Respeecher'
      });
    });
  }

  // Google TTS API key
  if (elements.saveGoogleTtsApiKey) {
    elements.saveGoogleTtsApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.googleTtsApiKey,
        toggleButton: elements.toggleGoogleTtsApiKey,
        storageKey: STORAGE_KEYS.STORAGE_GOOGLE_TTS_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        getValidationError: getTokenError,
        keyName: 'GoogleTts'
      });
    });
  }

  // Google API key for image translation (different from Google TTS)
  if (elements.saveGoogleApiKey) {
    elements.saveGoogleApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.googleApiKey,
        toggleButton: elements.toggleGoogleApiKey,
        storageKey: STORAGE_KEYS.GOOGLE_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        getValidationError: getTokenError,
        keyName: 'Google'
      });
    });
  }
}

