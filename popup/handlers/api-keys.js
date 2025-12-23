// API Key event handlers for popup
// Handles toggle/show/hide functionality for all API key inputs

// @ts-check

/**
 * Setup toggle handler for API key input
 * @param {HTMLElement} toggleButton - Toggle button element
 * @param {HTMLInputElement} input - Input element
 * @param {Function} decryptApiKey - Decrypt API key function
 * @param {Function} maskApiKey - Mask API key function
 * @param {Function} logError - Error logging function
 * @param {Function} [showToast] - Optional function to show toast notification
 * @param {Function} [t] - Optional translation function for error messages
 */
export function setupApiKeyToggle(toggleButton, input, decryptApiKey, maskApiKey, logError, showToast = null, t = null) {
  if (!toggleButton || !input) return;
  
  toggleButton.addEventListener('click', async () => {
    const isPassword = input.type === 'password';
    const eyeIcon = toggleButton.querySelector('.eye-icon');
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted; // Store decrypted for quick hide
        } catch (error) {
          logError('Failed to decrypt API key', error);
          // Show toast if provided
          if (showToast && t) {
            const errorMsg = await t('errorDecryptFailed');
            showToast(errorMsg, 'error');
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
      input.type = 'text';
      if (eyeIcon) {
        eyeIcon.textContent = '🔒';
      }
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('****')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      } else {
        // Fallback: mask current value if no decrypted value available
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
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
  setupApiKeyToggle(elements.toggleApiKey, elements.apiKey, decryptApiKey, maskApiKey, logError);
  
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

