// @ts-check
// API Keys and Provider management module
// Handles API key encryption, validation, and provider UI updates

import { encryptApiKey, decryptApiKey, maskApiKey } from '../../scripts/utils/encryption.js';
import { t, getUILanguage, UI_LOCALES } from '../../scripts/locales.js';
import { logError } from '../../scripts/utils/logging.js';
import { getProviderFromModel } from '../../scripts/api/index.js';

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
  
  // Set updateModelList function (called after models module initialization)
  function setUpdateModelList(fn) {
    updateModelList = fn;
  }

  // Format model label with code name and reasoning effort
  function formatModelLabel(modelValue) {
    if (!modelValue) return '';
    
    let modelName = modelValue;
    let reasoningEffort = null;
    
    // Check for high reasoning suffix (e.g., gpt-5.1-high)
    if (modelValue.endsWith('-high')) {
      modelName = modelValue.replace(/-high$/, '');
      reasoningEffort = 'high';
    } else if (modelValue === 'gpt-5.2' || modelValue.startsWith('gpt-5.2-pro')) {
      // GPT-5.2 models use medium reasoning by default
      reasoningEffort = 'medium';
    }
    
    // Use code name as base label
    let label = modelName;
    
    // Add reasoning effort suffix if present
    if (reasoningEffort) {
      label += ` (reasoning effort - ${reasoningEffort})`;
    }
    
    return label;
  }

  // Update API provider UI (label, placeholder, model list)
  async function updateApiProviderUI() {
    if (!elements.apiProviderSelect || !elements.apiKeyLabel || !elements.apiKey) return;
    
    const provider = elements.apiProviderSelect.value;
    const uiLang = await getUILanguage();
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
      placeholderKey = 'enterGeminiApiKey';
      placeholderText = 'AIza...';
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
    const apiKey = elements.apiKey.value.trim();
    
    // Check if main API key is provided (not masked)
    const hasKey = apiKey && !apiKey.startsWith('****');
    
    if (!hasKey) {
      const pleaseEnterKeyText = await t('pleaseEnterAtLeastOneApiKey');
      showToast(pleaseEnterKeyText, 'error');
      return;
    }

    const keysToSave = {};
    
    // Save selected provider
    keysToSave[STORAGE_KEYS.API_PROVIDER] = provider;
    
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
            showToast(invalidOpenAiKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'claude') {
          if (!apiKey.startsWith('sk-ant-')) {
            const invalidClaudeKeyText = await t('invalidClaudeKeyFormat');
            showToast(invalidClaudeKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'gemini') {
          if (!apiKey.startsWith('AIza')) {
            const invalidGeminiKeyText = await t('invalidGeminiKeyFormat');
            showToast(invalidGeminiKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'grok') {
          if (!apiKey.startsWith('xai-')) {
            const invalidGrokKeyText = await t('invalidGrokKeyFormat');
            showToast(invalidGrokKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.GROK_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'openrouter') {
          // OpenRouter API keys typically start with 'sk-or-' but we'll be lenient
          if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
            const invalidOpenRouterKeyText = await t('invalidOpenRouterKeyFormat');
            showToast(invalidOpenRouterKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.OPENROUTER_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
            logError('Encryption error', error);
            return;
          }
        } else if (provider === 'deepseek') {
          // DeepSeek API keys start with 'sk-'
          if (!apiKey.startsWith('sk-')) {
            const invalidDeepSeekKeyText = await t('invalidDeepSeekKeyFormat');
            showToast(invalidDeepSeekKeyText, 'error');
            return;
          }
          try {
            keysToSave[STORAGE_KEYS.DEEPSEEK_API_KEY] = await encryptApiKey(apiKey);
          } catch (error) {
            const failedToEncryptText = await t('failedToEncryptApiKey');
            showToast(failedToEncryptText, 'error');
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
    
    // Save keys
    if (Object.keys(keysToSave).length > 0) {
      await chrome.storage.local.set(keysToSave);
    }
    
    // Remove keys that should be deleted
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    const apiKeysSavedText = await t('apiKeysSaved');
    showToast(apiKeysSavedText, 'success');
  }

  return {
    formatModelLabel,
    updateApiProviderUI,
    saveApiKey,
    setUpdateModelList
  };
}

