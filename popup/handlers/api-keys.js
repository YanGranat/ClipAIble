// API Key event handlers for popup
// Handles toggle/show/hide functionality for all API key inputs

// @ts-check

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement | null | undefined} toggleButton
 * @param {boolean} visible
 */
export function setApiKeyVisibility(input, toggleButton, visible) {
  input.type = visible ? 'text' : 'password';
  toggleButton?.setAttribute('aria-pressed', String(visible));
}

/**
 * Setup toggle handler for API key input
 * @param {HTMLElement} toggleButton - Toggle button element
 * @param {HTMLInputElement} input - Input element
 * @param {Function} decryptApiKey - Decrypt API key function
 * @param {Function} maskApiKey - Mask API key function
 * @param {Function} logError - Error logging function
 * @param {Function} [showToast] - Optional function to show toast notification
 * @param {Function} [t] - Optional translation function for error messages
 * @param {HTMLSelectElement|null} [providerSelect] - Provider selector for a shared key input
 */
export function setupApiKeyToggle(toggleButton, input, decryptApiKey, maskApiKey, logError, showToast = null, t = null, providerSelect = null) {
  if (!toggleButton || !input) return;
  let revision = 0;
  const selectStoredMask = () => {
    if (input.dataset.encrypted && /^(?:\*{4}|••••)/.test(input.value)) input.select();
  };
  input.addEventListener('paste', selectStoredMask);
  input.addEventListener('beforeinput', event => {
    if (event.inputType?.startsWith('insert')) selectStoredMask();
  });
  providerSelect?.addEventListener('change', () => { revision++; });
  input.addEventListener('input', () => {
    revision++;
    delete input.dataset.decrypted;
    delete input.dataset.encrypted;
  });
  
  toggleButton.addEventListener('click', async () => {
    const currentRevision = ++revision;
    const provider = input.dataset.provider;
    const selectedProvider = providerSelect?.value;
    const encrypted = input.dataset.encrypted;
    const value = input.value;
    const type = input.type;
    const isCurrent = () => revision === currentRevision && input.dataset.provider === provider &&
      providerSelect?.value === selectedProvider &&
      input.dataset.encrypted === encrypted && input.value === value && input.type === type;
    const isPassword = input.type === 'password';
    const eyeIcon = toggleButton.querySelector('.eye-icon');
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(encrypted);
          if (!isCurrent()) return;
          input.value = decrypted;
          input.dataset.decrypted = decrypted; // Store decrypted for quick hide
        } catch (error) {
          if (!isCurrent()) return;
          logError('Failed to decrypt API key', error);
          // Show toast if provided
          if (showToast && t) {
            const errorMsg = await t('errorDecryptFailed');
            if (!isCurrent()) return;
            showToast(errorMsg, 'error', { key: 'errorDecryptFailed' });
          }
          // If decryption fails, try to use current value if it's not masked
          if (!input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('****')) {
        // Key is already visible or not masked
        input.dataset.decrypted = input.value;
      }
      setApiKeyVisibility(input, toggleButton, true);
      if (eyeIcon) {
        eyeIcon.textContent = '🔒';
      }
    } else {
      // Hide key
      if (!input.dataset.encrypted) {
        delete input.dataset.decrypted;
      } else if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      } else {
        // Fallback: mask current value if no decrypted value available
        input.value = maskApiKey(input.value);
      }
      setApiKeyVisibility(input, toggleButton, false);
      if (eyeIcon) {
        eyeIcon.textContent = '👁';
      }
    }
  });
}

/**
 * Setup all API key toggle handlers
 * @param {Object} elements - DOM elements
 * @param {Function} decryptApiKey - Decrypt API key function
 * @param {Function} maskApiKey - Mask API key function
 * @param {Function} logError - Error logging function
 * @param {Function} [showToast] - Optional function to show toast notification
 * @param {Function} [t] - Optional translation function for error messages
 */
export function setupAllApiKeyToggles(elements, decryptApiKey, maskApiKey, logError, showToast = null, t = null) {
  // Main API key (OpenAI) - no toast on error
  setupApiKeyToggle(elements.toggleApiKey, elements.apiKey, decryptApiKey, maskApiKey, logError, null, null, elements.apiProviderSelect);
  
  // Claude API key - no toast on error
  setupApiKeyToggle(elements.toggleClaudeApiKey, elements.claudeApiKey, decryptApiKey, maskApiKey, logError);
  
  // Gemini API key - no toast on error
  setupApiKeyToggle(elements.toggleGeminiApiKey, elements.geminiApiKey, decryptApiKey, maskApiKey, logError);
  
  // Google API key - no toast on error
  setupApiKeyToggle(elements.toggleGoogleApiKey, elements.googleApiKey, decryptApiKey, maskApiKey, logError);
  
  // ElevenLabs API key - show toast on error
  setupApiKeyToggle(elements.toggleElevenlabsApiKey, elements.elevenlabsApiKey, decryptApiKey, maskApiKey, logError, showToast, t);
  
  // Qwen API key - show toast on error
  setupApiKeyToggle(elements.toggleQwenApiKey, elements.qwenApiKey, decryptApiKey, maskApiKey, logError, showToast, t);
  
  // Respeecher API key - show toast on error
  setupApiKeyToggle(elements.toggleRespeecherApiKey, elements.respeecherApiKey, decryptApiKey, maskApiKey, logError, showToast, t);
  
  // Google TTS API key - show toast on error
  setupApiKeyToggle(elements.toggleGoogleTtsApiKey, elements.googleTtsApiKey, decryptApiKey, maskApiKey, logError, showToast, t);
}

