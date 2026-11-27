// @ts-check
// Supplemental API key save handlers for speech and images

import { saveApiKeySettings } from '../../scripts/utils/encryption.js';
import { isApiKeyToken, getOpenAiKeyValidationError } from '../utils/api-key-validation.js';
import { setApiKeyVisibility } from './api-keys.js';

const keySaves = new WeakMap();
const getShortKeyError = key => key.length < 10 ? 'keyTooShort' : null;
const getTokenError = key => isApiKeyToken(key) ? null : 'invalidKeyFormat';

/**
 * Save a provider key from a dedicated password field
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
 * @param {import('../../scripts/types.js').LocalizedMessage} [config.requiredMessage] - Override for the empty input message
 * @param {string} [config.savedMessageKey] - Override for the success message
 */
async function saveSupplementalApiKey(config) {
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
    keyName,
    requiredMessage = null,
    savedMessageKey = null
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
    const message = requiredMessage || { key: `pleaseEnter${inputKeyName}ApiKey` };
    const pleaseEnterKeyText = await t(message.key, message.params);
    if (revision === field.requested) showToast(pleaseEnterKeyText, 'error', message);
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
      setApiKeyVisibility(input, toggleButton, false);
      input.dataset.encrypted = encrypted;
      delete input.dataset.decrypted;
      if (toggleButton) {
        const eyeIcon = toggleButton.querySelector('.eye-icon');
        if (eyeIcon) eyeIcon.textContent = '👁';
      }
    }
    const savedKeyName = keyName === 'GoogleTts' ? 'googleTts' : keyName.toLowerCase();
    const messageKey = savedMessageKey || `${savedKeyName}KeySaved`;
    const keySavedText = await t(messageKey);
    if (revision === field.requested) showToast(keySavedText, 'success', { key: messageKey });
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
      await saveSupplementalApiKey({
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
      await saveSupplementalApiKey({
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
      await saveSupplementalApiKey({
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

  elements.saveOpenaiImageKey?.addEventListener('click', async () => {
    await saveSupplementalApiKey({
      input: elements.openaiImageKey,
      storageKey: STORAGE_KEYS.API_KEY,
      encryptApiKey,
      maskApiKey,
      logError,
      showToast,
      t,
      getValidationError: getOpenAiKeyValidationError,
      keyName: 'OpenAI',
      requiredMessage: { key: 'errorImageKeyRequired', params: { provider: 'OpenAI' } },
      savedMessageKey: 'apiKeySaved'
    });
  });

  const openRouterMedia = [
    { button: elements.saveOpenrouterImageKey, input: elements.openrouterImageKey,
      storageKey: STORAGE_KEYS.OPENROUTER_IMAGE_API_KEY, requiredKey: 'errorImageKeyRequired' },
    { button: elements.saveOpenrouterTtsKey, input: elements.openrouterTtsKey,
      storageKey: STORAGE_KEYS.OPENROUTER_TTS_API_KEY, requiredKey: 'errorAudioApiKeyRequired' }
  ];
  for (const { button, input, storageKey, requiredKey } of openRouterMedia) {
    button?.addEventListener('click', () => saveSupplementalApiKey({
      input, storageKey, encryptApiKey, maskApiKey, logError, showToast, t,
      getValidationError: getTokenError, keyName: 'OpenRouter',
      requiredMessage: { key: requiredKey, params: { provider: 'OpenRouter' } }, savedMessageKey: 'apiKeySaved'
    }));
  }

  // Google TTS API key
  if (elements.saveGoogleTtsApiKey) {
    elements.saveGoogleTtsApiKey.addEventListener('click', async () => {
      await saveSupplementalApiKey({
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
      await saveSupplementalApiKey({
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

