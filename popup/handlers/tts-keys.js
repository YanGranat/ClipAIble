// @ts-check
// TTS API key save handlers (ElevenLabs, Qwen, Respeecher, Google TTS)

/**
 * Generic function to save TTS API key
 * @param {Object} config - Configuration
 * @param {HTMLInputElement} config.input - Input element
 * @param {HTMLElement} config.saveButton - Save button element
 * @param {HTMLElement} [config.toggleButton] - Toggle button element
 * @param {string} config.storageKey - Storage key
 * @param {Function} config.encryptApiKey - Encrypt API key function
 * @param {Function} config.maskApiKey - Mask API key function
 * @param {Function} config.logError - Error logging function
 * @param {Function} config.showToast - Show toast function
 * @param {Function} config.t - Translation function
 * @param {Function} config.validateKey - Optional key validation function
 * @param {string} config.keyName - Key name for error messages
 */
async function saveTtsApiKey(config) {
  const {
    input,
    saveButton,
    toggleButton,
    storageKey,
    encryptApiKey,
    maskApiKey,
    logError,
    showToast,
    t,
    validateKey,
    keyName
  } = config;

  const key = input.value.trim();
  if (!key) {
    const pleaseEnterKeyText = await t(`pleaseEnter${keyName}ApiKey`);
    showToast(pleaseEnterKeyText, 'error');
    return;
  }
  
  if (key.startsWith('****') || key.startsWith('••••')) {
    return;
  }
  
  if (!/^[\x20-\x7E]+$/.test(key)) {
    const invalidKeyText = await t('invalidKeyFormat');
    showToast(invalidKeyText, 'error');
    return;
  }
  
  if (validateKey && !validateKey(key)) {
    return;
  }
  
  try {
    const encrypted = await encryptApiKey(key);
    await chrome.storage.local.set({ [storageKey]: encrypted });
    input.value = maskApiKey(key);
    input.type = 'password';
    input.dataset.encrypted = encrypted;
    if (toggleButton) {
      const eyeIcon = toggleButton.querySelector('.eye-icon');
      if (eyeIcon) {
        eyeIcon.textContent = '👁';
      }
    }
    const keySavedText = await t(`${keyName.toLowerCase()}KeySaved`);
    showToast(keySavedText, 'success');
  } catch (error) {
    logError(`Failed to save ${keyName} API key`, error);
    const failedToSaveText = await t('failedToSave');
    showToast(failedToSaveText, 'error');
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
        saveButton: elements.saveElevenlabsApiKey,
        toggleButton: elements.toggleElevenlabsApiKey,
        storageKey: STORAGE_KEYS.ELEVENLABS_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        validateKey: (key) => {
          if (key.length < 10) {
            t('keyTooShort').then(msg => showToast(msg, 'error'));
            return false;
          }
          return true;
        },
        keyName: 'Elevenlabs'
      });
    });
  }

  // Qwen API key
  if (elements.saveQwenApiKey) {
    elements.saveQwenApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.qwenApiKey,
        saveButton: elements.saveQwenApiKey,
        toggleButton: elements.toggleQwenApiKey,
        storageKey: STORAGE_KEYS.QWEN_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        validateKey: (key) => {
          if (key.length < 10) {
            t('keyTooShort').then(msg => showToast(msg, 'error'));
            return false;
          }
          return true;
        },
        keyName: 'Qwen'
      });
    });
  }

  // Respeecher API key
  if (elements.saveRespeecherApiKey) {
    elements.saveRespeecherApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.respeecherApiKey,
        saveButton: elements.saveRespeecherApiKey,
        toggleButton: elements.toggleRespeecherApiKey,
        storageKey: STORAGE_KEYS.RESPEECHER_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        validateKey: (key) => {
          if (key.length < 10) {
            t('keyTooShort').then(msg => showToast(msg, 'error'));
            return false;
          }
          return true;
        },
        keyName: 'Respeecher'
      });
    });
  }

  // Google TTS API key
  if (elements.saveGoogleTtsApiKey) {
    elements.saveGoogleTtsApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.googleTtsApiKey,
        saveButton: elements.saveGoogleTtsApiKey,
        toggleButton: elements.toggleGoogleTtsApiKey,
        storageKey: STORAGE_KEYS.GOOGLE_TTS_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        validateKey: async (key) => {
          if (!key.startsWith('AIza')) {
            const invalidKeyText = await t('invalidGoogleTtsKeyFormat');
            showToast(invalidKeyText, 'error');
            return false;
          }
          if (key.length < 20) {
            const keyTooShortText = await t('keyTooShort');
            showToast(keyTooShortText, 'error');
            return false;
          }
          return true;
        },
        keyName: 'GoogleTts'
      });
    });
  }

  // Google API key for image translation (different from Google TTS)
  if (elements.saveGoogleApiKey) {
    elements.saveGoogleApiKey.addEventListener('click', async () => {
      await saveTtsApiKey({
        input: elements.googleApiKey,
        saveButton: elements.saveGoogleApiKey,
        toggleButton: elements.toggleGoogleApiKey,
        storageKey: STORAGE_KEYS.GOOGLE_API_KEY,
        encryptApiKey,
        maskApiKey,
        logError,
        showToast,
        t,
        validateKey: async (key) => {
          if (!key.startsWith('AIza')) {
            const invalidGoogleKeyText = await t('invalidGoogleKeyFormat');
            showToast(invalidGoogleKeyText, 'error');
            return false;
          }
          return true;
        },
        keyName: 'Google'
      });
    });
  }
}

