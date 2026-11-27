// @ts-check
// API Keys and Provider management module
// Handles API key encryption, validation, and provider UI updates

import { encryptApiKey, decryptApiKey, maskApiKey, saveApiKeySettings } from '../../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, UI_LOCALES } from '../../scripts/locales.js';
import { logError } from '../../scripts/utils/logging.js';
import { formatModelLabel as formatCatalogModelLabel } from '../../scripts/utils/model-catalog.js';
import { isApiKeyToken } from '../utils/api-key-validation.js';

/**
 * Initialize API keys module
 * @param {Object} deps - Dependencies
 * @returns {Object} API keys functions
 */
export function initApiKeys(deps) {
  const {
    elements,
    STORAGE_KEYS,
    showToast
  } = deps;
  
  // updateModelList will be set after models module is initialized
  let updateModelList = null;
  let openRouterSaveRevision = 0;
  
  // Set updateModelList function (called after models module initialization)
  function setUpdateModelList(fn) {
    updateModelList = fn;
  }

  // Format model label with code name and reasoning effort
  function formatModelLabel(modelValue, language = 'en') {
    return formatCatalogModelLabel(elements.apiProviderSelect?.value || 'openai', modelValue, (key, params) => tSync(key, language, params));
  }

  // Update API provider UI (label, placeholder, model list)
  async function updateApiProviderUI() {
    if (!elements.apiProviderSelect || !elements.apiKeyLabel || !elements.apiKey) return;
    
    const provider = elements.apiProviderSelect.value;
    const uiLang = await getUILanguage();
    if (elements.apiProviderSelect.value !== provider) return;
    const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
    
    let labelKey, placeholderKey, placeholderText;
    
    if (provider === 'openai') {
      labelKey = 'openaiApiKey';
      placeholderKey = 'enterOpenAiApiKey';
      placeholderText = 'sk-...';
    } else if (provider === 'claude') {
      labelKey = 'claudeApiKey';
      placeholderKey = 'enterClaudeApiKey';
      placeholderText = 'sk-ant-...';
    } else if (provider === 'gemini') {
      labelKey = 'geminiApiKey';
      placeholderKey = 'pleaseEnterApiKey';
      placeholderText = 'Enter API key';
    } else if (provider === 'grok') {
      labelKey = 'grokApiKey';
      placeholderKey = 'enterGrokApiKey';
      placeholderText = 'xai-...';
    } else if (provider === 'openrouter') {
      labelKey = 'openrouterApiKey';
      placeholderKey = 'enterOpenRouterApiKey';
      placeholderText = 'sk-or-...';
    } else if (provider === 'deepseek') {
      labelKey = 'deepseekApiKey';
      placeholderKey = 'enterDeepSeekApiKey';
      placeholderText = 'sk-...';
    }
    
    if (labelKey && elements.apiKeyLabel) {
      elements.apiKeyLabel.textContent = locale[labelKey] || labelKey;
      elements.apiKeyLabel.setAttribute('data-i18n', labelKey);
    }
    
    if (placeholderKey && elements.apiKey) {
      const placeholder = locale[placeholderKey] || placeholderText;
      elements.apiKey.setAttribute('data-i18n-placeholder', placeholderKey);
      elements.apiKey.placeholder = placeholder;
    }
    
    // Update model list based on provider
    if (updateModelList) {
      await updateModelList();
    }
  }

  // Save API keys to storage
  async function saveApiKey() {
    const provider = elements.apiProviderSelect?.value || 'openai';
    const { value: draft, type: inputType, dataset: { encrypted: previousCiphertext } } = elements.apiKey;
    const apiKey = draft.trim();
    
    // Check if main API key is provided (not masked)
    const hasKey = elements.apiKey.dataset.provider === provider && apiKey && !apiKey.startsWith('****');
    
    if (!hasKey) {
      const pleaseEnterKeyText = await t('pleaseEnterAtLeastOneApiKey');
      showToast(pleaseEnterKeyText, 'error', { key: 'pleaseEnterAtLeastOneApiKey' });
      return;
    }

    const keysToSave = {};
    let openRouterRevision;
    
    // Save API key for selected provider
    if (apiKey) {
      // If masked (user didn't change it), keep existing encrypted value
      if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
        if (provider === 'openai') {
          keysToSave[STORAGE_KEYS.API_KEY] = elements.apiKey.dataset.encrypted;
        } else if (provider === 'claude') {
          keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = elements.apiKey.dataset.encrypted;
        } else if (provider === 'gemini') {
          keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = elements.apiKey.dataset.encrypted;
        } else if (provider === 'grok') {
          keysToSave[STORAGE_KEYS.GROK_API_KEY] = elements.apiKey.dataset.encrypted;
        } else if (provider === 'openrouter') {
          keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY] = elements.apiKey.dataset.encrypted;
        } else if (provider === 'deepseek') {
          keysToSave[STORAGE_KEYS.DEEPSEEK_API_KEY] = elements.apiKey.dataset.encrypted;
        }
      } else if (!apiKey.startsWith('****')) {
        // New key provided, validate and encrypt
        if (provider === 'openai') {
          if (!apiKey.startsWith('sk-')) {
            const invalidOpenAiKeyText = await t('invalidOpenAiKeyFormat');
            showToast(invalidOpenAiKeyText, 'error', { key: 'invalidOpenAiKeyFormat' });
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'claude') {
          if (!apiKey.startsWith('sk-ant-')) {
            const invalidClaudeKeyText = await t('invalidClaudeKeyFormat');
            showToast(invalidClaudeKeyText, 'error', { key: 'invalidClaudeKeyFormat' });
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'gemini') {
          if (!isApiKeyToken(apiKey)) {
            const invalidGeminiKeyText = await t('invalidKeyFormat');
            showToast(invalidGeminiKeyText, 'error', { key: 'invalidKeyFormat' });
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'grok') {
          if (!apiKey.startsWith('xai-')) {
            const invalidGrokKeyText = await t('invalidGrokKeyFormat');
            showToast(invalidGrokKeyText, 'error', { key: 'invalidGrokKeyFormat' });
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.GROK_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'openrouter') {
          // OpenRouter API keys typically start with 'sk-or-' but we'll be lenient
          if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
            const invalidOpenRouterKeyText = await t('invalidOpenRouterKeyFormat');
            showToast(invalidOpenRouterKeyText, 'error', { key: 'invalidOpenRouterKeyFormat' });
            return;
          }
          try {
            openRouterRevision = ++openRouterSaveRevision;
            keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            if (openRouterRevision === openRouterSaveRevision) showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'deepseek') {
          // DeepSeek API keys start with 'sk-'
          if (!apiKey.startsWith('sk-')) {
            const invalidDeepSeekKeyText = await t('invalidDeepSeekKeyFormat');
            showToast(invalidDeepSeekKeyText, 'error', { key: 'invalidDeepSeekKeyFormat' });
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.DEEPSEEK_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error', { key: 'failedToEncryptApiKey' });
            logError('Encryption error', error);
            return;
          }
        }
      }
    }
    
    // Remove null values before saving (explicitly remove keys)
    const keysToRemove = [];
    for (const [key, value] of Object.entries(keysToSave)) {
      if (value === null) {
        keysToRemove.push(key);
        delete keysToSave[key];
      }
    }
    
    const isCurrentSave = () => openRouterRevision === undefined || openRouterRevision === openRouterSaveRevision;
    if (!isCurrentSave() || elements.apiProviderSelect?.value !== provider || elements.apiKey.dataset.provider !== provider) return;
    try {
      await saveApiKeySettings(keysToSave, keysToRemove);
    } catch (error) {
      logError('Failed to save API key', error);
      const message = await t('failedToSave');
      if (isCurrentSave()) showToast(message, 'error', { key: 'failedToSave' });
      return;
    }
    
    if (openRouterRevision !== undefined && isCurrentSave() &&
        elements.apiProviderSelect?.value === provider && elements.apiKey.dataset.provider === provider &&
        elements.apiKey.type === inputType && elements.apiKey.value === draft &&
        elements.apiKey.dataset.encrypted === previousCiphertext) {
      elements.apiKey.dataset.encrypted = keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY];
      if (inputType === 'password') {
        elements.apiKey.value = maskApiKey(apiKey);
        delete elements.apiKey.dataset.decrypted;
      }
    }

    const apiKeysSavedText = await t('apiKeysSaved');
    if (isCurrentSave()) showToast(apiKeysSavedText, 'success', { key: 'apiKeysSaved' });
  }

  return {
    formatModelLabel,
    updateApiProviderUI,
    saveApiKey,
    setUpdateModelList
  };
}

