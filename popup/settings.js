// Settings module for popup
// Handles settings loading, saving, API keys, models, UI updates, etc.

import { encryptApiKey, decryptApiKey, maskApiKey } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logError, logWarn } from '../scripts/utils/logging.js';
import { CONFIG } from '../scripts/utils/config.js';
import { getProviderFromModel } from '../scripts/api/index.js';

/**
 * Initialize settings module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements object
 * @param {Object} deps.STORAGE_KEYS - Storage keys object
 * @param {Object} deps.DEFAULT_STYLES - Default styles object
 * @param {Object} deps.STYLE_PRESETS - Style presets object
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.showToast - Show toast function
 * @param {Function} deps.setCustomSelectValue - Set custom select value function
 * @param {Function} deps.getElement - Get element helper
 * @param {Function} deps.setElementDisplay - Set element display helper
 * @param {Function} deps.setElementGroupDisplay - Set element group display helper
 * @param {Function} deps.setDisplayForIds - Set display for IDs helper
 * @param {Function} deps.applyTheme - Apply theme function
 * @param {Function} deps.markdownToHtml - Markdown to HTML converter
 * @param {Object} deps.audioVoiceMap - Audio voice map reference
 * @returns {Object} Settings functions
 */
export function initSettings(deps) {
  const {
    elements,
    STORAGE_KEYS,
    DEFAULT_STYLES,
    STYLE_PRESETS,
    debouncedSaveSettings,
    showToast,
    setCustomSelectValue,
    getElement,
    setElementDisplay,
    setElementGroupDisplay,
    setDisplayForIds,
    applyTheme,
    markdownToHtml,
    audioVoiceMap
  } = deps;

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

  // Save audio voice per provider with backward-compatible flat key
  function saveAudioVoice(provider, voice) {
    if (!provider) return;
    if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
      audioVoiceMap = {};
    }
    audioVoiceMap[provider] = voice;
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE, voice);
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE_MAP, audioVoiceMap);
  }

  // Update model list based on selected provider
  async function updateModelList() {
    if (!elements.apiProviderSelect || !elements.modelSelect) return;
    
    const provider = elements.apiProviderSelect.value;
    const uiLang = await getUILanguage();
    const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
    
    // Load custom models from storage
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS, STORAGE_KEYS.HIDDEN_MODELS]);
    const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
    const providerCustomModels = customModels[provider] || [];
    const hiddenModels = storageResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
    const providerHiddenModels = hiddenModels[provider] || [];
    
    // Define default models for each provider (using code names)
    const modelsByProvider = {
      openai: [
        { value: 'gpt-5.2', isCustom: false },
        { value: 'gpt-5.2-high', isCustom: false },
        { value: 'gpt-5.1', isCustom: false },
        { value: 'gpt-5.1-high', isCustom: false }
      ],
      claude: [
        { value: 'claude-sonnet-4-5', isCustom: false }
      ],
      gemini: [
        { value: 'gemini-3-pro-preview', isCustom: false }
      ],
      grok: [
        { value: 'grok-4-1-fast-reasoning', isCustom: false }
      ],
      openrouter: [
        { value: 'openai/gpt-5.1', isCustom: false },
        { value: 'openai/gpt-5.1-high', isCustom: false },
        { value: 'google/gemini-3-pro-preview', isCustom: false },
        { value: 'anthropic/claude-opus-4.5', isCustom: false },
        { value: 'deepseek/deepseek-v3.2', isCustom: false },
        { value: 'mistralai/mistral-nemo', isCustom: false },
        { value: 'qwen/qwen3-235b-a22b-2507', isCustom: false },
        { value: 'mistralai/devstral-2512:free', isCustom: false },
        { value: 'nex-agi/deepseek-v3.1-nex-n1:free', isCustom: false },
        { value: 'openai/gpt-oss-120b:free', isCustom: false },
        { value: 'z-ai/glm-4.5-air:free', isCustom: false }
      ]
    };
    
    // Get default models for provider and filter out hidden ones
    const defaultModels = (modelsByProvider[provider] || modelsByProvider.openai)
      .filter(model => !providerHiddenModels.includes(model.value));
    
    // Add custom models (also filter out hidden custom models)
    const customModelsList = providerCustomModels
      .filter(modelValue => !providerHiddenModels.includes(modelValue))
      .map(modelValue => ({
        value: modelValue,
        isCustom: true
      }));
    
    // Combine default and custom models
    const allModels = [...defaultModels, ...customModelsList];
    
    const currentValue = elements.modelSelect.value;
    
    // Clear existing options
    elements.modelSelect.innerHTML = '';
    
    // Add models for selected provider
    allModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = formatModelLabel(model.value);
      option.dataset.isCustom = model.isCustom ? 'true' : 'false';
      elements.modelSelect.appendChild(option);
    });
    
    // Load saved model for this provider
    const storageResult2 = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
    const savedModelsByProvider = storageResult2[STORAGE_KEYS.MODEL_BY_PROVIDER] || {};
    const savedModelForProvider = savedModelsByProvider[provider];
    
    // Try to restore saved model for this provider
    let modelToSelect = null;
    if (savedModelForProvider) {
      const modelExists = allModels.some(m => m.value === savedModelForProvider);
      if (modelExists) {
        modelToSelect = savedModelForProvider;
      }
    }
    
    // If no saved model or saved model doesn't exist, check current model
    if (!modelToSelect) {
      const currentModelProvider = getProviderFromModel(currentValue);
      if (currentModelProvider === provider) {
        // Current model belongs to this provider - check if it exists
        const modelExists = allModels.some(m => m.value === currentValue);
        if (modelExists) {
          modelToSelect = currentValue;
        }
      }
    }
    
    // If still no model, use first in list
    if (!modelToSelect && allModels.length > 0) {
      modelToSelect = allModels[0].value;
    }
    
    // Set selected model
    if (modelToSelect) {
      elements.modelSelect.value = modelToSelect;
      // Save to both general model key (for backward compatibility) and provider-specific
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.MODEL]: modelToSelect,
        [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
          ...savedModelsByProvider,
          [provider]: modelToSelect
        }
      });
    }
  }

  // Show custom model dropdown with delete buttons
  async function showCustomModelDropdown() {
    if (!elements.customModelDropdown || !elements.customModelOptions) {
      return;
    }
    
    // Close all other custom selects
    document.querySelectorAll('.custom-select.open').forEach(select => {
      select.classList.remove('open');
    });
    if (elements.fontFamilyContainer) {
      elements.fontFamilyContainer.classList.remove('open');
    }
    
    // Show dropdown immediately to prevent race condition with click handler
    elements.customModelDropdown.style.display = 'block';
    
    const provider = elements.apiProviderSelect.value;
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
    const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
    const providerCustomModels = customModels[provider] || [];
    
    // Get all models (default + custom)
    const modelsByProvider = {
      openai: ['gpt-5.2', 'gpt-5.2-high', 'gpt-5.1', 'gpt-5.1-high'],
      claude: ['claude-sonnet-4-5'],
      gemini: ['gemini-3-pro-preview'],
      grok: ['grok-4-1-fast-reasoning'],
      openrouter: [
        'openai/gpt-5.1', 'openai/gpt-5.1-high', 'google/gemini-3-pro-preview',
        'anthropic/claude-opus-4.5', 'deepseek/deepseek-v3.2', 'mistralai/mistral-nemo',
        'qwen/qwen3-235b-a22b-2507', 'mistralai/devstral-2512:free',
        'nex-agi/deepseek-v3.1-nex-n1:free', 'openai/gpt-oss-120b:free', 'z-ai/glm-4.5-air:free'
      ]
    };
    
    const defaultModels = modelsByProvider[provider] || modelsByProvider.openai;
    const allModels = [...defaultModels, ...providerCustomModels];
    
    // Get hidden models
    const hiddenResult = await chrome.storage.local.get([STORAGE_KEYS.HIDDEN_MODELS]);
    const hiddenModels = hiddenResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
    const providerHiddenModels = hiddenModels[provider] || [];
    
    // Filter out hidden models
    const visibleModels = allModels.filter(modelValue => !providerHiddenModels.includes(modelValue));
    
    // Clear dropdown
    elements.customModelOptions.innerHTML = '';
    
    // Get currently selected model
    const currentModel = elements.modelSelect ? elements.modelSelect.value : null;
    
    // Add models to dropdown
    for (const modelValue of visibleModels) {
      const isCustom = providerCustomModels.includes(modelValue);
      const isSelected = modelValue === currentModel;
      const optionDiv = document.createElement('div');
      optionDiv.className = 'custom-model-option' + (isSelected ? ' selected' : '');
      optionDiv.dataset.modelValue = modelValue;
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'custom-model-label';
      labelSpan.textContent = formatModelLabel(modelValue);
      
      optionDiv.appendChild(labelSpan);
      
      // Add delete button for all models
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'custom-model-delete';
      deleteBtn.innerHTML = '×';
      const deleteModelText = await t('deleteModel');
      const hideModelText = await t('hideModel');
      deleteBtn.title = isCustom ? deleteModelText : hideModelText;
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isCustom) {
          await removeCustomModel(modelValue);
        } else {
          await hideDefaultModel(modelValue);
        }
      });
      optionDiv.appendChild(deleteBtn);
      
      // Add click handler to entire option div for full-width clickable area
      optionDiv.addEventListener('click', (e) => {
        // Don't trigger selection if clicking on delete button
        if (e.target.classList.contains('custom-model-delete') || e.target.closest('.custom-model-delete')) {
          return;
        }
        
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Update select value and close dropdown
        elements.modelSelect.value = modelValue;
        elements.customModelDropdown.style.display = 'none';
        // Trigger change event to save settings
        elements.modelSelect.dispatchEvent(new Event('change'));
      });
      
      elements.customModelOptions.appendChild(optionDiv);
    }
  }

  // Show dialog for adding new model
  async function showAddModelDialog() {
    const provider = elements.apiProviderSelect.value;
    const uiLang = await getUILanguage();
    const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
    
    const modelName = prompt(locale.addModelPrompt || 'Enter model name (e.g., gpt-5.2, claude-sonnet-4-5):');
    
    if (!modelName || !modelName.trim()) {
      return;
    }
    
    const trimmedName = modelName.trim();
    
    // Validate model name format - allow alphanumeric, hyphens, underscores, slashes, colons, dots
    if (!trimmedName.match(/^[a-z0-9][a-z0-9\-_\/:\.]*$/i)) {
      const errorMsg = locale.addModelInvalidFormat || 'Invalid model name format. Use code name like gpt-5.2 or claude-sonnet-4-5';
      alert(errorMsg);
      return;
    }
    
    // Check if model already exists
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
    const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
    const providerCustomModels = customModels[provider] || [];
    
    if (providerCustomModels.includes(trimmedName)) {
      const errorMsg = locale.addModelAlreadyExists || 'This model already exists';
      alert(errorMsg);
      return;
    }
    
    // Add model
    await addCustomModel(trimmedName);
  }

  // Add custom model to storage
  async function addCustomModel(modelValue) {
    const provider = elements.apiProviderSelect.value;
    
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
    const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
    
    if (!customModels[provider]) {
      customModels[provider] = [];
    }
    
    if (!customModels[provider].includes(modelValue)) {
      customModels[provider].push(modelValue);
      await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_MODELS]: customModels });
      
      // Update model list
      await updateModelList();
      
      // Select the newly added model
      if (elements.modelSelect) {
        elements.modelSelect.value = modelValue;
        await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: modelValue });
      }
    }
  }

  // Hide default model from list
  async function hideDefaultModel(modelValue) {
    const provider = elements.apiProviderSelect.value;
    
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.HIDDEN_MODELS]);
    const hiddenModels = storageResult[STORAGE_KEYS.HIDDEN_MODELS] || {};
    
    if (!hiddenModels[provider]) {
      hiddenModels[provider] = [];
    }
    
    if (!hiddenModels[provider].includes(modelValue)) {
      hiddenModels[provider].push(modelValue);
      await chrome.storage.local.set({ [STORAGE_KEYS.HIDDEN_MODELS]: hiddenModels });
      
      // If hidden model was selected, select first available model
      if (elements.modelSelect && elements.modelSelect.value === modelValue) {
        const firstOption = elements.modelSelect.options[0];
        if (firstOption) {
          elements.modelSelect.value = firstOption.value;
          await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: firstOption.value });
        }
      }
      
      // Update model list
      await updateModelList();
      
      // Update custom dropdown if visible
      if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
        await showCustomModelDropdown();
      }
    }
  }

  // Remove custom model from storage
  async function removeCustomModel(modelValue) {
    const provider = elements.apiProviderSelect.value;
    
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS]);
    const customModels = storageResult[STORAGE_KEYS.CUSTOM_MODELS] || {};
    
    if (customModels[provider]) {
      customModels[provider] = customModels[provider].filter(m => m !== modelValue);
      await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_MODELS]: customModels });
      
      // If removed model was selected, select first available model
      if (elements.modelSelect && elements.modelSelect.value === modelValue) {
        const firstOption = elements.modelSelect.options[0];
        if (firstOption) {
          elements.modelSelect.value = firstOption.value;
          await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: firstOption.value });
        }
      }
      
      // Update model list
      await updateModelList();
      
      // Update custom dropdown if visible
      if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
        await showCustomModelDropdown();
      }
    }
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
    await updateModelList();
  }

  // Update mode hint text
  async function updateModeHint() {
    const mode = elements.modeSelect.value;
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    elements.modeHint.textContent = mode === 'selector' 
      ? (locale.extractionModeHint || UI_LOCALES.en.extractionModeHint)
      : (locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract);
  }

  // Show/hide cache option based on mode
  function updateCacheVisibility() {
    const mode = elements.modeSelect.value;
    // Only show cache option for selector mode
    elements.useCacheGroup.style.display = mode === 'selector' ? 'flex' : 'none';
  }

  // Reset a single style setting to default
  async function resetStyleSetting(type) {
    switch (type) {
      case 'fontFamily':
        elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
        setCustomSelectValue(DEFAULT_STYLES.fontFamily);
        await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
        break;
      case 'fontSize':
        elements.fontSize.value = DEFAULT_STYLES.fontSize;
        await chrome.storage.local.set({ [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize });
        break;
      case 'bgColor':
        elements.bgColor.value = DEFAULT_STYLES.bgColor;
        elements.bgColorText.value = DEFAULT_STYLES.bgColor;
        await chrome.storage.local.set({ [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor });
        break;
      case 'textColor':
        elements.textColor.value = DEFAULT_STYLES.textColor;
        elements.textColorText.value = DEFAULT_STYLES.textColor;
        await chrome.storage.local.set({ [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor });
        break;
      case 'headingColor':
        elements.headingColor.value = DEFAULT_STYLES.headingColor;
        elements.headingColorText.value = DEFAULT_STYLES.headingColor;
        await chrome.storage.local.set({ [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor });
        break;
      case 'linkColor':
        elements.linkColor.value = DEFAULT_STYLES.linkColor;
        elements.linkColorText.value = DEFAULT_STYLES.linkColor;
        await chrome.storage.local.set({ [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor });
        break;
    }
    const resetText = await t('resetToDefault');
    showToast(resetText, 'success');
  }

  // Reset all style settings to defaults
  async function resetAllStyles() {
    elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
    setCustomSelectValue(DEFAULT_STYLES.fontFamily);
    elements.fontSize.value = DEFAULT_STYLES.fontSize;
    elements.bgColor.value = DEFAULT_STYLES.bgColor;
    elements.bgColorText.value = DEFAULT_STYLES.bgColor;
    elements.textColor.value = DEFAULT_STYLES.textColor;
    elements.textColorText.value = DEFAULT_STYLES.textColor;
    elements.headingColor.value = DEFAULT_STYLES.headingColor;
    elements.headingColorText.value = DEFAULT_STYLES.headingColor;
    elements.linkColor.value = DEFAULT_STYLES.linkColor;
    elements.linkColorText.value = DEFAULT_STYLES.linkColor;
    
    // Reset style preset to dark (default)
    elements.stylePreset.value = 'dark';
    const stylePresetContainer = document.getElementById('stylePresetContainer');
    if (stylePresetContainer) {
      const valueSpan = stylePresetContainer.querySelector('.custom-select-value');
      const selectedOption = stylePresetContainer.querySelector('[data-value="dark"]');
      if (valueSpan && selectedOption) {
        valueSpan.textContent = selectedOption.textContent;
        stylePresetContainer.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        selectedOption.classList.add('selected');
      }
    }
    
    await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
    await chrome.storage.local.set({
      [STORAGE_KEYS.STYLE_PRESET]: 'dark',
      [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize,
      [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor,
      [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor,
      [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor,
      [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor
    });
    
    const allStylesResetText = await t('allStylesReset');
    showToast(allStylesResetText, 'success');
  }

  // Save API keys to storage
  async function saveApiKey() {
    const provider = elements.apiProviderSelect?.value || 'openai';
    const apiKey = elements.apiKey.value.trim();
    const googleApiKey = elements.googleApiKey.value.trim();
    
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
        }
      }
    }
    
    // Save Google API key for image translation if provided
    if (googleApiKey) {
      if (googleApiKey.startsWith('****') && elements.googleApiKey.dataset.encrypted) {
        // Keep existing encrypted key if masked
        keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = elements.googleApiKey.dataset.encrypted;
      } else if (!googleApiKey.startsWith('****')) {
        // New key provided, validate and encrypt
        if (!googleApiKey.startsWith('AIza')) {
          const invalidGoogleKeyText = await t('invalidGoogleKeyFormat');
          showToast(invalidGoogleKeyText, 'error');
          return;
        }
        try {
          keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = await encryptApiKey(googleApiKey);
        } catch (error) {
          const failedToEncryptText = await t('failedToEncryptApiKey');
          showToast(failedToEncryptText, 'error');
          logError('Encryption error', error);
          return;
        }
      }
    } else {
      // If field is empty, explicitly remove the key from storage
      // This ensures the key is cleared if user intentionally removed it
      keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = null;
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

  /**
   * Hide all audio-related UI fields
   * This is a centralized function to ensure all audio fields are hidden consistently
   * Used when output format is not 'audio' (PDF, EPUB, FB2, Markdown)
   */
  function hideAllAudioFields() {
    // Audio provider selector
    setElementGroupDisplay('audioProviderGroup', 'none');
    
    // Provider-specific API keys
    setElementGroupDisplay('elevenlabsApiKeyGroup', 'none');
    setElementGroupDisplay('qwenApiKeyGroup', 'none');
    setElementGroupDisplay('respeecherApiKeyGroup', 'none');
    setElementGroupDisplay('googleTtsApiKeyGroup', 'none');
    
    // Provider-specific settings
    setElementGroupDisplay('elevenlabsModelGroup', 'none');
    setElementGroupDisplay('elevenlabsFormatGroup', 'none');
    setElementGroupDisplay('elevenlabsAdvancedGroup', 'none');
    setElementGroupDisplay('googleTtsModelGroup', 'none');
    setElementGroupDisplay('googleTtsVoiceGroup', 'none');
    setElementGroupDisplay('googleTtsPromptGroup', 'none');
    setElementGroupDisplay('respeecherAdvancedGroup', 'none');
    
    // Generic audio settings (voice, speed, instructions)
    setElementGroupDisplay('audioVoiceGroup', 'none');
    setElementGroupDisplay('audioSpeedGroup', 'none');
    setElementGroupDisplay('openaiInstructionsGroup', 'none');
  }

  /**
   * Update UI based on output format selection
   * 
   * This function is the main coordinator for UI visibility based on format:
   * - PDF: Shows PDF-specific settings (style, page mode), hides audio settings
   * - EPUB/FB2/Markdown: Shows translation settings, hides PDF style and audio settings
   * - Audio: Shows audio provider settings, hides PDF style and TOC/abstract
   * 
   * IMPORTANT: This function calls updateAudioProviderUI() and updateTranslationVisibility()
   * to ensure all dependent UI elements are updated correctly.
   */
  async function updateOutputFormatUI() {
    const format = elements.outputFormat.value;
    // Sync main format select
    if (elements.mainFormatSelect && elements.mainFormatSelect.value !== format) {
      elements.mainFormatSelect.value = format;
    }
    const isPdf = format === 'pdf';
    const isEpub = format === 'epub';
    const isAudio = format === 'audio';
    const showStyleSettings = isPdf; // Only PDF has style settings
    
    // Update button icon based on format (text stays "Save")
    const formatConfig = {
      pdf: { icon: '📄' },
      epub: { icon: '📚' },
      fb2: { icon: '📖' },
      markdown: { icon: '📝' },
      audio: { icon: '🔊' }
    };
    const config = formatConfig[format] || formatConfig.pdf;
    if (elements.saveIcon) {
      elements.saveIcon.textContent = config.icon;
    }
    
    // ============================================
    // AUDIO SETTINGS VISIBILITY
    // ============================================
    if (!isAudio) {
      // Not audio format: Hide ALL audio-related fields
      // This ensures no audio settings are visible for PDF/EPUB/FB2/Markdown
      hideAllAudioFields();
    } else {
      // Audio format selected: Show provider selector and update provider-specific UI
      setElementGroupDisplay('audioProviderGroup', 'flex');
      // updateAudioProviderUI() will show/hide provider-specific fields based on selected provider
      updateAudioProviderUI();
    }

    // ============================================
    // PDF-SPECIFIC SETTINGS VISIBILITY
    // ============================================
    // Page mode (single/multi-page) is only for PDF
    setElementGroupDisplay('pageModeGroup', isPdf ? 'flex' : 'none');

    // PDF styling controls (colors, fonts, presets) are only for PDF
    const pdfStyleIds = [
      'stylePreset',
      'fontFamily',
      'fontFamilyContainer',
      'fontSize',
      'bgColor',
      'bgColorText',
      'textColor',
      'textColorText',
      'headingColor',
      'headingColorText',
      'linkColor',
      'linkColorText',
      'pdfSettingsDivider'
    ];
    setDisplayForIds(pdfStyleIds, showStyleSettings ? '' : 'none');

    // ============================================
    // TOC AND ABSTRACT VISIBILITY
    // ============================================
    // TOC and abstract are not applicable for audio format
    const tocIds = ['generateToc', 'generateAbstract'];
    setDisplayForIds(tocIds, isAudio ? 'none' : '');
    
    // ============================================
    // TRANSLATION SETTINGS VISIBILITY
    // ============================================
    // Update translation visibility (hides image translation for audio)
    updateTranslationVisibility();
  }

  // Update voice list based on TTS provider
  function updateVoiceList(provider) {
    if (!elements.audioVoice) return;
    
    // IMPORTANT: restore per-provider saved voice if available
    const savedProviderVoice = audioVoiceMap?.[provider] || '';
    const currentValue = savedProviderVoice || elements.audioVoice.value || '';
    elements.audioVoice.innerHTML = '';
    
    if (provider === 'elevenlabs') {
      // ElevenLabs voices (popular voices)
      const elevenlabsVoices = [
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (female, clear)' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (female, strong)' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (female, warm)' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (male, deep)' },
        { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (female, young)' },
        { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (male, calm)' },
        { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (male, authoritative)' },
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (male, expressive)' },
        { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (male, friendly)' }
      ];
      
      elevenlabsVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && elevenlabsVoices.find(v => v.id === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM'; // Rachel
        saveAudioVoice(provider, '21m00Tcm4TlvDq8ikWAM');
      } else {
        elements.audioVoice.value = '21m00Tcm4TlvDq8ikWAM';
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    } else if (provider === 'qwen') {
      // Qwen3-TTS-Flash-2025-11-27 voices (49 voices)
      const qwenVoices = [
        // Best for articles/education
        { id: 'Elias', name: '📚 Elias (academic, storytelling)' },
        { id: 'Neil', name: '📰 Neil (news anchor, professional)' },
        { id: 'Katerina', name: '🎭 Katerina (mature, rhythmic)' },
        { id: 'Ryan', name: '🎬 Ryan (dramatic, realistic)' },
        
        // Language-specific
        { id: 'Alek', name: '🇷🇺 Alek (Russian voice)' },
        { id: 'Jennifer', name: '🇺🇸 Jennifer (American English)' },
        { id: 'Emilien', name: '🇫🇷 Emilien (French)' },
        { id: 'Lenn', name: '🇩🇪 Lenn (German)' },
        { id: 'Dolce', name: '🇮🇹 Dolce (Italian)' },
        { id: 'Bodega', name: '🇪🇸 Bodega (Spanish)' },
        { id: 'Sonrisa', name: '🌎 Sonrisa (Latin American Spanish)' },
        { id: 'Andre', name: '🇵🇹 Andre (Portuguese European)' },
        { id: 'Radio Gol', name: '🇧🇷 Radio Gol (Portuguese Brazilian)' },
        { id: 'Sohee', name: '🇰🇷 Sohee (Korean)' },
        { id: 'Ono Anna', name: '🇯🇵 Ono Anna (Japanese)' },
        
        // General purpose
        { id: 'Cherry', name: 'Cherry (sunny, friendly)' },
        { id: 'Ethan', name: 'Ethan (warm, energetic)' },
        { id: 'Serena', name: 'Serena (gentle)' },
        { id: 'Chelsie', name: 'Chelsie (anime style)' },
        { id: 'Aiden', name: 'Aiden (American young man)' },
        { id: 'Maia', name: 'Maia (intelligent, gentle)' },
        { id: 'Kai', name: 'Kai (relaxing)' },
        { id: 'Nofish', name: 'Nofish (designer)' },
        
        // Character voices
        { id: 'Eldric Sage', name: '🧙 Eldric Sage (old wise man)' },
        { id: 'Arthur', name: '📖 Arthur (old storyteller)' },
        { id: 'Bellona', name: '⚔️ Bellona (powerful, epic)' },
        { id: 'Vincent', name: '🦸 Vincent (raspy, heroic)' },
        { id: 'Mia', name: 'Mia (gentle as snow)' },
        { id: 'Seren', name: '😴 Seren (soothing, ASMR)' }
      ];
      
      qwenVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && qwenVoices.find(v => v.id === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = 'Elias'; // Default - best for articles
        saveAudioVoice(provider, 'Elias');
      } else {
        elements.audioVoice.value = 'Elias';
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    } else if (provider === 'respeecher') {
      // Respeecher voices
      // Note: volodymyr is available on en-rt endpoint only, not on ua-rt
      // Ukrainian voices are available on ua-rt endpoint only
      const respeecherVoices = [
        // English voices (en-rt endpoint)
        { id: 'samantha', name: '🇺🇸 Samantha (female, American)' },
        { id: 'neve', name: '🇺🇸 Neve (female, emotional)' },
        { id: 'gregory', name: '🇺🇸 Gregory (male, emotional)' },
        { id: 'vincent', name: '🇺🇸 Vincent (male, deep)' },
        { id: 'volodymyr', name: '🇺🇦 Volodymyr (male, Ukrainian) - EN endpoint only' },
        // Ukrainian voices (ua-rt endpoint)
        { id: 'olesia-rozmova', name: '🇺🇦 Олеся: розмова (female, conversation)' },
        { id: 'olesia-media', name: '🇺🇦 Олеся: медіа (female, media)' },
        { id: 'olesia-ogoloshennia', name: '🇺🇦 Олеся: оголошення (female, announcement)' },
        { id: 'mariia-audioknyha', name: '🇺🇦 Марія: аудіокнига (female, audiobook)' },
        { id: 'oleksandr-radio', name: '🇺🇦 Олександр: радіо (male, radio)' },
        { id: 'oleksandr-reklama', name: '🇺🇦 Олександр: реклама (male, advertisement)' },
        { id: 'yevhen-reklama', name: '🇺🇦 Євген: реклама (male, advertisement)' },
        { id: 'yevhen-audioknyha', name: '🇺🇦 Євген: аудіокнига (male, audiobook)' },
        { id: 'dmitro-rozmova', name: '🇺🇦 Дмитро: розмова (male, conversation)' },
        { id: 'ihoreo-rozmova', name: '🇺🇦 Ігорео: розмова (male, conversation)' }
      ];
      
      respeecherVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      // IMPORTANT: Only change value if currentValue is invalid for this provider
      // This preserves user's selection across page reloads
      if (currentValue && respeecherVoices.find(v => v.id === currentValue)) {
        // Valid saved value - restore it
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        // Invalid value (e.g., 'nova' from OpenAI or 'volodymyr' for Ukrainian text)
        // Use default for this provider
        elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE; // Default English voice
        // Save the new default value
        saveAudioVoice(provider, CONFIG.DEFAULT_RESPEECHER_VOICE);
      } else {
        // No saved value - use default
        elements.audioVoice.value = CONFIG.DEFAULT_RESPEECHER_VOICE;
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    } else {
      // OpenAI voices
      const openaiVoices = [
        { value: 'nova', name: 'Nova (female, warm)' },
        { value: 'alloy', name: 'Alloy (neutral)' },
        { value: 'echo', name: 'Echo (male)' },
        { value: 'fable', name: 'Fable (expressive)' },
        { value: 'onyx', name: 'Onyx (male, deep)' },
        { value: 'shimmer', name: 'Shimmer (female, clear)' },
        { value: 'coral', name: 'Coral (female, friendly)' },
        { value: 'sage', name: 'Sage (neutral, calm)' },
        { value: 'ash', name: 'Ash (male, authoritative)' },
        { value: 'ballad', name: 'Ballad (expressive, dramatic)' },
        { value: 'verse', name: 'Verse (rhythmic)' }
      ];
      
      openaiVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.value;
        option.textContent = voice.name;
        elements.audioVoice.appendChild(option);
      });
      
      // Set value: use saved value if valid, otherwise use default
      if (currentValue && openaiVoices.find(v => v.value === currentValue)) {
        elements.audioVoice.value = currentValue;
      } else if (currentValue) {
        elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
        saveAudioVoice(provider, CONFIG.DEFAULT_AUDIO_VOICE);
      } else {
        elements.audioVoice.value = CONFIG.DEFAULT_AUDIO_VOICE;
      }
      saveAudioVoice(provider, elements.audioVoice.value);
    }
  }

  /**
   * Update UI visibility based on audio provider selection
   * 
   * This function shows/hides provider-specific fields based on selected TTS provider:
   * - OpenAI: Shows voice selector, speed control, instructions
   * - ElevenLabs: Shows API key, model, format, advanced settings, voice selector, speed control
   * - Google TTS: Shows API key, model, voice selector, prompt (NO speed control)
   * - Qwen: Shows API key, voice selector (NO speed control)
   * - Respeecher: Shows API key, advanced settings, voice selector (NO speed control)
   * 
   * IMPORTANT: This function assumes audio format is already selected.
   * If format is not 'audio', it calls hideAllAudioFields() and returns early.
   * 
   * Speed control is only shown for providers that support it (OpenAI, ElevenLabs).
   */
  function updateAudioProviderUI() {
    const audioProvider = getElement('audioProvider');
    if (!audioProvider) return;
    
    // Safety check: If format is not audio, hide all audio fields and return
    const outputFormat = getElement('outputFormat');
    const format = outputFormat?.value;
    if (format !== 'audio') {
      hideAllAudioFields();
      return;
    }
    
    const provider = audioProvider.value;
    const isElevenLabs = provider === 'elevenlabs';
    const isGoogle = provider === 'google';
    const isQwen = provider === 'qwen';
    const isRespeecher = provider === 'respeecher';
    // Speed is not supported by Qwen, Respeecher, and Google TTS (Google uses prompt for speed control)
    const supportsSpeed = !(isQwen || isRespeecher || isGoogle);
    
    // Show/hide ElevenLabs-specific fields
    setElementGroupDisplay('elevenlabsApiKeyGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsModelGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsFormatGroup', isElevenLabs ? 'flex' : 'none');
    setElementGroupDisplay('elevenlabsAdvancedGroup', isElevenLabs ? 'block' : 'none');
    
    // Show/hide Google TTS-specific fields
    // Note: format is already 'audio' at this point (checked at function start)
    setElementGroupDisplay('googleTtsApiKeyGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsModelGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsVoiceGroup', isGoogle ? 'flex' : 'none');
    setElementGroupDisplay('googleTtsPromptGroup', isGoogle ? 'block' : 'none');
    
    // Show/hide Qwen-specific fields
    setElementGroupDisplay('qwenApiKeyGroup', isQwen ? 'flex' : 'none');
    
    // Show/hide Respeecher-specific fields
    setElementGroupDisplay('respeecherApiKeyGroup', isRespeecher ? 'flex' : 'none');
    setElementGroupDisplay('respeecherAdvancedGroup', isRespeecher ? 'block' : 'none');
    
    // Show/hide OpenAI instructions (only for OpenAI provider)
    const isOpenAI = provider === 'openai';
    setElementGroupDisplay('openaiInstructionsGroup', isOpenAI ? 'block' : 'none');
    
    // Show/hide generic voice selector (for OpenAI, ElevenLabs, Qwen, Respeecher)
    // Hide for Google TTS (it has its own voice selector)
    setElementGroupDisplay('audioVoiceGroup', !isGoogle ? 'flex' : 'none');
    
    // Speed control only for providers that support it
    // Hide completely for Qwen/Respeecher/Google (they don't support speed)
    setElementGroupDisplay('audioSpeedGroup', supportsSpeed ? 'flex' : 'none');
    
    const audioSpeed = getElement('audioSpeed');
    if (audioSpeed) {
      audioSpeed.disabled = !supportsSpeed;
      if (!supportsSpeed) {
        audioSpeed.value = '1.0';
        const audioSpeedValue = getElement('audioSpeedValue');
        if (audioSpeedValue) {
          audioSpeedValue.textContent = '1.0x';
        }
      }
    }
    
    const audioSpeedNote = getElement('audioSpeedNote');
    if (audioSpeedNote) {
      audioSpeedNote.style.display = 'none'; // Not needed since we hide the group completely
    }
    
    // Update voice list when provider changes
    // This ensures that the correct voices are shown and invalid voices are replaced
    updateVoiceList(provider);
  }

  // Show/hide translation-related UI based on language selection
  async function updateTranslationVisibility() {
    const languageSelect = getElement('languageSelect');
    const translateImages = getElement('translateImages');
    const outputFormat = getElement('outputFormat');
    
    if (!languageSelect || !translateImages || !outputFormat) return;
    
    const isTranslating = languageSelect.value !== 'auto';
    const translateImagesEnabled = translateImages.checked;
    const isAudio = outputFormat.value === 'audio';
    
    // Show image translation option only when translating AND not audio format
    // Audio format doesn't use images, so translation option is not needed
    setElementGroupDisplay('translateImagesGroup', (isTranslating && !isAudio) ? 'block' : 'none');
    
    // Show Google API key input when image translation is enabled
    setElementDisplay('googleApiGroup', (isTranslating && translateImagesEnabled) ? 'block' : 'none');
    
    // Show hint if translateImages is enabled but Google key is missing
    const translateImagesHint = getElement('translateImagesHint');
    if (isTranslating && translateImagesEnabled && translateImagesHint) {
      const googleApiKey = getElement('googleApiKey');
      const googleApiKeyValue = googleApiKey?.value?.trim() || '';
      const hasGoogleKey = googleApiKeyValue && !googleApiKeyValue.startsWith('****');
      
      // Check if key exists in storage (might be encrypted/masked)
      if (!hasGoogleKey) {
        try {
          const stored = await chrome.storage.local.get(['google_api_key']);
          const storedKey = stored.google_api_key;
          if (!storedKey || (typeof storedKey === 'string' && storedKey.startsWith('****'))) {
            // No key or masked key - show hint
            const uiLang = await getUILanguage();
            const hintText = tSync('translateImagesRequiresGoogleKey', uiLang) || '⚠️ Requires Google API key for image translation';
            translateImagesHint.textContent = hintText;
            translateImagesHint.style.color = 'var(--text-warning, #ffa500)';
            return;
          }
        } catch (error) {
          // Ignore errors
        }
      }
      
      // Key exists - show normal hint
      const uiLang = await getUILanguage();
      const normalHint = tSync('translateImagesHint', uiLang) || 'Uses Google Gemini AI to translate text on images';
      translateImagesHint.textContent = normalHint;
      translateImagesHint.style.color = '';
    }
  }

  // Note: loadSettings is a very large function (800+ lines) that will be added separately
  // It requires access to many dependencies and is tightly coupled with the UI structure

  return {
    formatModelLabel,
    saveAudioVoice,
    updateModelList,
    showCustomModelDropdown,
    showAddModelDialog,
    addCustomModel,
    hideDefaultModel,
    removeCustomModel,
    updateApiProviderUI,
    updateModeHint,
    updateCacheVisibility,
    resetStyleSetting,
    resetAllStyles,
    saveApiKey,
    hideAllAudioFields,
    updateOutputFormatUI,
    updateAudioProviderUI,
    updateTranslationVisibility,
    updateVoiceList
    // loadSettings will be added in next step
  };
}
