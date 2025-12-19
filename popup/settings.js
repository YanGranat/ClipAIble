// Settings module for popup
// Handles settings loading, saving, API keys, models, UI updates, etc.

import { encryptApiKey, decryptApiKey, maskApiKey } from '../scripts/utils/encryption.js';
import { t, tSync, getUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { log, logError, logWarn } from '../scripts/utils/logging.js';
import { CONFIG } from '../scripts/utils/config.js';
import { getProviderFromModel } from '../scripts/api/index.js';
import { sanitizeMarkdownHtml } from '../scripts/utils/html.js';

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
    // Ensure audioVoiceMap has 'current' property
    if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
      // This should not happen if audioVoiceMap is passed correctly, but handle it gracefully
      logWarn('audioVoiceMap is not properly initialized');
      return;
    }
    if (!('current' in audioVoiceMap)) {
      audioVoiceMap.current = {};
    }
    // Ensure current is an object
    if (!audioVoiceMap.current || typeof audioVoiceMap.current !== 'object' || Array.isArray(audioVoiceMap.current)) {
      audioVoiceMap.current = {};
    }
    audioVoiceMap.current[provider] = voice;
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE, voice);
    debouncedSaveSettings(STORAGE_KEYS.AUDIO_VOICE_MAP, audioVoiceMap.current);
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
    
    // Google API key is now saved separately via saveGoogleApiKey button in settings
    // Removed from here to avoid confusion

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
    const voiceMap = (audioVoiceMap && typeof audioVoiceMap === 'object' && 'current' in audioVoiceMap) 
      ? audioVoiceMap.current 
      : (audioVoiceMap || {});
    const savedProviderVoice = voiceMap[provider] || '';
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
    setElementGroupDisplay('googleApiGroup', (isTranslating && translateImagesEnabled) ? 'block' : 'none');
    
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

  // Load saved settings from storage
  // This is a large function (800+ lines) that loads all settings from chrome.storage.local
  // and populates the UI elements with the saved values
  async function loadSettings() {
    log('loadSettings: starting');
    try {
      log('loadSettings: requesting settings from storage');
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.API_PROVIDER,
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.CLAUDE_API_KEY,
        STORAGE_KEYS.GEMINI_API_KEY,
        STORAGE_KEYS.GROK_API_KEY,
        STORAGE_KEYS.OPENROUTER_API_KEY,
        STORAGE_KEYS.GOOGLE_API_KEY,
        STORAGE_KEYS.MODEL, 
        STORAGE_KEYS.MODE,
        STORAGE_KEYS.USE_CACHE,
        STORAGE_KEYS.ENABLE_CACHE,
        STORAGE_KEYS.ENABLE_STATS,
        STORAGE_KEYS.OUTPUT_FORMAT,
        STORAGE_KEYS.GENERATE_TOC,
        STORAGE_KEYS.GENERATE_ABSTRACT,
        STORAGE_KEYS.PAGE_MODE,
        STORAGE_KEYS.LANGUAGE,
        STORAGE_KEYS.TRANSLATE_IMAGES,
        STORAGE_KEYS.STYLE_PRESET,
        STORAGE_KEYS.FONT_FAMILY,
        STORAGE_KEYS.FONT_SIZE,
        STORAGE_KEYS.BG_COLOR,
        STORAGE_KEYS.TEXT_COLOR,
        STORAGE_KEYS.HEADING_COLOR,
        STORAGE_KEYS.LINK_COLOR,
        STORAGE_KEYS.THEME,
        STORAGE_KEYS.UI_LANGUAGE,
        STORAGE_KEYS.AUDIO_PROVIDER,
        STORAGE_KEYS.ELEVENLABS_API_KEY,
        STORAGE_KEYS.ELEVENLABS_MODEL,
        STORAGE_KEYS.ELEVENLABS_STABILITY,
        STORAGE_KEYS.ELEVENLABS_SIMILARITY,
        STORAGE_KEYS.ELEVENLABS_STYLE,
        STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST,
        STORAGE_KEYS.ELEVENLABS_FORMAT,
        STORAGE_KEYS.QWEN_API_KEY,
        STORAGE_KEYS.RESPEECHER_API_KEY,
        STORAGE_KEYS.RESPEECHER_TEMPERATURE,
        STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY,
        STORAGE_KEYS.RESPEECHER_TOP_P,
        STORAGE_KEYS.GOOGLE_TTS_API_KEY,
        STORAGE_KEYS.GOOGLE_TTS_MODEL,
        STORAGE_KEYS.GOOGLE_TTS_VOICE,
        STORAGE_KEYS.GOOGLE_TTS_PROMPT,
        STORAGE_KEYS.OPENAI_INSTRUCTIONS,
        STORAGE_KEYS.AUDIO_VOICE,
        STORAGE_KEYS.AUDIO_VOICE_MAP,
        STORAGE_KEYS.AUDIO_SPEED,
        STORAGE_KEYS.SUMMARY_TEXT,
        STORAGE_KEYS.SUMMARY_GENERATING
      ]);
      
      log('loadSettings: settings retrieved from storage', { 
        hasResult: !!result,
        keysCount: Object.keys(result).length,
        apiProvider: result[STORAGE_KEYS.API_PROVIDER]
      });
      
      // Load API provider (default: openai)
      const apiProvider = result[STORAGE_KEYS.API_PROVIDER] || 'openai';
      log('loadSettings: setting API provider', { apiProvider, hasElement: !!elements.apiProviderSelect });
      if (elements.apiProviderSelect) {
        elements.apiProviderSelect.value = apiProvider;
      } else {
        logWarn('loadSettings: apiProviderSelect element not found');
      }
      
      // Load and mask API key for selected provider
      let apiKeyValue = '';
      let apiKeyEncrypted = null;
      
      if (apiProvider === 'openai' && result[STORAGE_KEYS.API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
        } catch (error) {
          logError('Failed to decrypt OpenAI API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
        }
      } else if (apiProvider === 'claude' && result[STORAGE_KEYS.CLAUDE_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Claude API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
        }
      } else if (apiProvider === 'gemini' && result[STORAGE_KEYS.GEMINI_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Gemini API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
        }
      } else if (apiProvider === 'grok' && result[STORAGE_KEYS.GROK_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Grok API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
        }
      } else if (apiProvider === 'openrouter' && result[STORAGE_KEYS.OPENROUTER_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
          apiKeyValue = maskApiKey(decrypted);
          apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
        } catch (error) {
          logError('Failed to decrypt OpenRouter API key', error);
          apiKeyValue = maskApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
          apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
        }
      }
      
      if (elements.apiKey) {
        elements.apiKey.value = apiKeyValue;
        if (apiKeyEncrypted) {
          elements.apiKey.dataset.encrypted = apiKeyEncrypted;
        }
      }
      
      // Update UI for selected provider
      await updateApiProviderUI();
      
      // Keep old API keys in storage for backward compatibility, but don't display them
      // They will be loaded when user switches provider
      
      if (result[STORAGE_KEYS.GOOGLE_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
          elements.googleApiKey.value = maskApiKey(decrypted);
          elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Google API key', error);
          elements.googleApiKey.value = maskApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
          elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
        }
      }
      
      // Model is already set by updateApiProviderUI() -> updateModelList()
      // But we need to ensure saved model is selected if it belongs to current provider
      if (result[STORAGE_KEYS.MODEL] && elements.modelSelect) {
        const savedModel = result[STORAGE_KEYS.MODEL];
        const savedModelProvider = getProviderFromModel(savedModel);
        const currentProvider = elements.apiProviderSelect?.value || 'openai';
        
        // Only set saved model if it belongs to current provider
        // Otherwise updateModelList() has already set the first model of the provider
        if (savedModelProvider === currentProvider) {
          // Check if the model option exists in the select
          const optionExists = Array.from(elements.modelSelect.options).some(
            opt => opt.value === savedModel
          );
          if (optionExists) {
            elements.modelSelect.value = savedModel;
          }
        }
      }
      
      if (result[STORAGE_KEYS.MODE]) {
        elements.modeSelect.value = result[STORAGE_KEYS.MODE];
      }
      
      // Default: enabled (true) - cache selectors by default
      // Explicitly check for boolean false to distinguish from undefined/null
      // CRITICAL FIX: Preserve current checkbox state if storage value is undefined/null
      // This prevents race conditions where loadSettings() might overwrite a value being saved
      const useCacheValue = result[STORAGE_KEYS.USE_CACHE];
      
      if (useCacheValue === false) {
        // User explicitly disabled - respect their choice
        elements.useCache.checked = false;
      } else if (useCacheValue === true) {
        // Explicitly enabled
        elements.useCache.checked = true;
      } else {
        // First time or undefined/null
        // CRITICAL: If checkbox is already unchecked, user likely just unchecked it
        // Don't override their choice - preserve the unchecked state
        // Only set to true (default) if checkbox is in its default/checked state
        if (elements.useCache.checked === false) {
          // Checkbox is unchecked - preserve user's choice, don't save default
          // The change event handler will save the value when user changes it
          // This prevents race conditions where loadSettings() overwrites a value being saved
        } else {
          // Checkbox is checked or in default state - safe to set default
          elements.useCache.checked = true;
          try {
            // Save explicitly as boolean true to ensure it's preserved
            await chrome.storage.local.set({ [STORAGE_KEYS.USE_CACHE]: true });
          } catch (error) {
            logError('Failed to save default use_selector_cache setting', error);
          }
        }
      }
      
      // Load enableCache setting (enable_selector_caching) - INDEPENDENT setting, NO SYNC with useCache
      if (elements.enableCache) {
        const enableCacheValue = result[STORAGE_KEYS.ENABLE_CACHE];
        
        if (enableCacheValue === false) {
          elements.enableCache.checked = false;
        } else if (enableCacheValue === true) {
          elements.enableCache.checked = true;
        } else {
          // First time or undefined/null - default to true
          elements.enableCache.checked = true;
          try {
            await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_CACHE]: true });
          } catch (error) {
            logError('Failed to save default enable_selector_caching setting', error);
          }
        }
      }
      
      // Load enableStats setting with migration
      if (elements.enableStats) {
        const enableStatsValue = result[STORAGE_KEYS.ENABLE_STATS];
        
        if (enableStatsValue === false) {
          // User explicitly disabled - respect their choice
          elements.enableStats.checked = false;
        } else if (enableStatsValue === true) {
          // Explicitly enabled
          elements.enableStats.checked = true;
        } else {
          // First time or undefined/null - check if stats exist for migration
          try {
            const statsResult = await chrome.storage.local.get(['extension_stats']);
            const stats = statsResult.extension_stats;
            
            // If user has existing stats (totalSaved > 0), enable by default
            // Otherwise, default to enabled (first time)
            const shouldEnable = !stats || stats.totalSaved === 0 ? true : stats.totalSaved > 0;
            
            elements.enableStats.checked = shouldEnable;
            
            // Save default value
            try {
              await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: shouldEnable });
            } catch (error) {
              logError('Failed to save default enable_statistics setting', error);
            }
          } catch (error) {
            logError('Failed to check stats for migration', error);
            // On error, default to enabled
            elements.enableStats.checked = true;
            try {
              await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: true });
            } catch (saveError) {
              logError('Failed to save default enable_statistics setting', saveError);
            }
          }
        }
      }
      
      if (result[STORAGE_KEYS.OUTPUT_FORMAT]) {
        elements.outputFormat.value = result[STORAGE_KEYS.OUTPUT_FORMAT];
        if (elements.mainFormatSelect) {
          elements.mainFormatSelect.value = result[STORAGE_KEYS.OUTPUT_FORMAT];
        }
      }
      
      if (result[STORAGE_KEYS.GENERATE_TOC]) {
        elements.generateToc.checked = result[STORAGE_KEYS.GENERATE_TOC];
      }
      
      if (result[STORAGE_KEYS.GENERATE_ABSTRACT] !== undefined) {
        elements.generateAbstract.checked = result[STORAGE_KEYS.GENERATE_ABSTRACT];
      } else {
        elements.generateAbstract.checked = false; // Default: disabled
      }
      
      if (result[STORAGE_KEYS.PAGE_MODE]) {
        elements.pageMode.value = result[STORAGE_KEYS.PAGE_MODE];
      }
      
      if (result[STORAGE_KEYS.LANGUAGE]) {
        elements.languageSelect.value = result[STORAGE_KEYS.LANGUAGE];
      }
      
      if (result[STORAGE_KEYS.TRANSLATE_IMAGES]) {
        elements.translateImages.checked = result[STORAGE_KEYS.TRANSLATE_IMAGES];
      }
      
      // Load style preset
      const savedPreset = result[STORAGE_KEYS.STYLE_PRESET] || 'dark';
      elements.stylePreset.value = savedPreset;
      
      // Sync custom select display for stylePreset
      const stylePresetContainer = document.getElementById('stylePresetContainer');
      if (stylePresetContainer) {
        const valueSpan = stylePresetContainer.querySelector('.custom-select-value');
        const selectedOption = stylePresetContainer.querySelector(`[data-value="${savedPreset}"]`);
        if (valueSpan && selectedOption) {
          valueSpan.textContent = selectedOption.textContent;
          stylePresetContainer.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          selectedOption.classList.add('selected');
        }
      }
      
      if (result[STORAGE_KEYS.FONT_FAMILY]) {
        elements.fontFamily.value = result[STORAGE_KEYS.FONT_FAMILY];
        setCustomSelectValue(result[STORAGE_KEYS.FONT_FAMILY]);
      }
      
      if (result[STORAGE_KEYS.FONT_SIZE]) {
        // Convert old preset values to numbers
        const oldToNew = { 'small': '24', 'medium': '31', 'large': '38', 'xlarge': '45' };
        const savedSize = result[STORAGE_KEYS.FONT_SIZE];
        elements.fontSize.value = oldToNew[savedSize] || savedSize;
      }
      
      // Apply colors: if preset is not 'custom', use preset colors; otherwise use saved colors
      if (savedPreset !== 'custom' && STYLE_PRESETS[savedPreset]) {
        // Apply preset colors (always use preset colors, not saved ones)
        const colors = STYLE_PRESETS[savedPreset];
        elements.bgColor.value = colors.bgColor;
        elements.bgColorText.value = colors.bgColor;
        elements.textColor.value = colors.textColor;
        elements.textColorText.value = colors.textColor;
        elements.headingColor.value = colors.headingColor;
        elements.headingColorText.value = colors.headingColor;
        elements.linkColor.value = colors.linkColor;
        elements.linkColorText.value = colors.linkColor;
      } else {
        // Load custom colors from storage (only for 'custom' preset)
        if (result[STORAGE_KEYS.BG_COLOR]) {
          elements.bgColor.value = result[STORAGE_KEYS.BG_COLOR];
          elements.bgColorText.value = result[STORAGE_KEYS.BG_COLOR];
        } else {
          elements.bgColor.value = DEFAULT_STYLES.bgColor;
          elements.bgColorText.value = DEFAULT_STYLES.bgColor;
        }
        
        if (result[STORAGE_KEYS.TEXT_COLOR]) {
          elements.textColor.value = result[STORAGE_KEYS.TEXT_COLOR];
          elements.textColorText.value = result[STORAGE_KEYS.TEXT_COLOR];
        } else {
          elements.textColor.value = DEFAULT_STYLES.textColor;
          elements.textColorText.value = DEFAULT_STYLES.textColor;
        }
        
        if (result[STORAGE_KEYS.HEADING_COLOR]) {
          elements.headingColor.value = result[STORAGE_KEYS.HEADING_COLOR];
          elements.headingColorText.value = result[STORAGE_KEYS.HEADING_COLOR];
        } else {
          elements.headingColor.value = DEFAULT_STYLES.headingColor;
          elements.headingColorText.value = DEFAULT_STYLES.headingColor;
        }
        
        if (result[STORAGE_KEYS.LINK_COLOR]) {
          elements.linkColor.value = result[STORAGE_KEYS.LINK_COLOR];
          elements.linkColorText.value = result[STORAGE_KEYS.LINK_COLOR];
        } else {
          elements.linkColor.value = DEFAULT_STYLES.linkColor;
          elements.linkColorText.value = DEFAULT_STYLES.linkColor;
        }
      }
      
      if (result[STORAGE_KEYS.THEME] && elements.themeSelect) {
        elements.themeSelect.value = result[STORAGE_KEYS.THEME];
      }
      
      if (result[STORAGE_KEYS.UI_LANGUAGE] && elements.uiLanguageSelect) {
        elements.uiLanguageSelect.value = result[STORAGE_KEYS.UI_LANGUAGE];
      } else if (elements.uiLanguageSelect) {
        elements.uiLanguageSelect.value = 'en';
      }
      
      // Load audio settings
      if (result[STORAGE_KEYS.AUDIO_PROVIDER]) {
        elements.audioProvider.value = result[STORAGE_KEYS.AUDIO_PROVIDER];
      } else {
        elements.audioProvider.value = 'openai'; // Default
      }

      // Load per-provider voice map (backward compatible)
      if (result[STORAGE_KEYS.AUDIO_VOICE_MAP] && typeof result[STORAGE_KEYS.AUDIO_VOICE_MAP] === 'object' && !Array.isArray(result[STORAGE_KEYS.AUDIO_VOICE_MAP])) {
        // Ensure audioVoiceMap has 'current' property
        if (!audioVoiceMap || typeof audioVoiceMap !== 'object' || Array.isArray(audioVoiceMap)) {
          logWarn('audioVoiceMap is not properly initialized in loadSettings');
        } else {
          audioVoiceMap.current = result[STORAGE_KEYS.AUDIO_VOICE_MAP];
        }
      } else {
        // Initialize empty map if not exists
        if (audioVoiceMap && typeof audioVoiceMap === 'object' && !Array.isArray(audioVoiceMap)) {
          if (!('current' in audioVoiceMap)) {
            audioVoiceMap.current = {};
          }
        } else {
          logWarn('audioVoiceMap is not properly initialized in loadSettings');
        }
      }
      
      // Load and mask ElevenLabs API key
      if (result[STORAGE_KEYS.ELEVENLABS_API_KEY]) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.ELEVENLABS_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('ElevenLabs API key in storage is corrupted (contains mask), clearing...');
            elements.elevenlabsApiKey.value = '';
            elements.elevenlabsApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.ELEVENLABS_API_KEY);
          } else {
            elements.elevenlabsApiKey.value = maskApiKey(decrypted);
            elements.elevenlabsApiKey.dataset.encrypted = result[STORAGE_KEYS.ELEVENLABS_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt ElevenLabs API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.elevenlabsApiKey.value = '';
          elements.elevenlabsApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.ELEVENLABS_API_KEY);
        }
      }
      
      // Load and mask Qwen API key
      if (result[STORAGE_KEYS.QWEN_API_KEY] && elements.qwenApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.QWEN_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('Qwen API key in storage is corrupted (contains mask), clearing...');
            elements.qwenApiKey.value = '';
            elements.qwenApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.QWEN_API_KEY);
          } else {
            elements.qwenApiKey.value = maskApiKey(decrypted);
            elements.qwenApiKey.dataset.encrypted = result[STORAGE_KEYS.QWEN_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt Qwen API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.qwenApiKey.value = '';
          elements.qwenApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.QWEN_API_KEY);
        }
      }
      
      // Load and mask Respeecher API key
      if (result[STORAGE_KEYS.RESPEECHER_API_KEY] && elements.respeecherApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.RESPEECHER_API_KEY]);
          
          // Check if decrypted value is a mask (corrupted data in storage)
          if (decrypted.startsWith('****') || decrypted.startsWith('••••')) {
            logWarn('Respeecher API key in storage is corrupted (contains mask), clearing...');
            elements.respeecherApiKey.value = '';
            elements.respeecherApiKey.placeholder = await t('keyCorrupted');
            await chrome.storage.local.remove(STORAGE_KEYS.RESPEECHER_API_KEY);
          } else {
            elements.respeecherApiKey.value = maskApiKey(decrypted);
            elements.respeecherApiKey.dataset.encrypted = result[STORAGE_KEYS.RESPEECHER_API_KEY];
          }
        } catch (error) {
          logError('Failed to decrypt Respeecher API key', error);
          // Clear corrupted key - user needs to re-enter
          elements.respeecherApiKey.value = '';
          elements.respeecherApiKey.placeholder = await t('keyCorrupted');
          await chrome.storage.local.remove(STORAGE_KEYS.RESPEECHER_API_KEY);
        }
      }
      
      // Load and mask Google TTS API key
      if (result[STORAGE_KEYS.GOOGLE_TTS_API_KEY] && elements.googleTtsApiKey) {
        try {
          const decrypted = await decryptApiKey(result[STORAGE_KEYS.GOOGLE_TTS_API_KEY]);
          elements.googleTtsApiKey.value = maskApiKey(decrypted);
          elements.googleTtsApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_TTS_API_KEY];
        } catch (error) {
          logError('Failed to decrypt Google TTS API key', error);
          // Keep the encrypted key in dataset even if decryption fails (same as Gemini key)
          elements.googleTtsApiKey.value = maskApiKey(result[STORAGE_KEYS.GOOGLE_TTS_API_KEY]);
          elements.googleTtsApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_TTS_API_KEY];
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_MODEL]) {
        elements.elevenlabsModel.value = result[STORAGE_KEYS.ELEVENLABS_MODEL];
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_STABILITY] !== undefined) {
        // Normalize old values to valid ElevenLabs values: 0.0, 0.5, or 1.0
        const normalizeStability = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.5;
          if (num <= 0.25) return 0.0;
          if (num <= 0.75) return 0.5;
          return 1.0;
        };
        const normalizedValue = normalizeStability(result[STORAGE_KEYS.ELEVENLABS_STABILITY]);
        elements.elevenlabsStability.value = normalizedValue;
        if (elements.elevenlabsStabilityValue) {
          elements.elevenlabsStabilityValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_STABILITY])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STABILITY, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_SIMILARITY] !== undefined) {
        // Normalize to step 0.1 (round to nearest 0.1)
        const normalizeSimilarity = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.75;
          return Math.round(num * 10) / 10;
        };
        const normalizedValue = normalizeSimilarity(result[STORAGE_KEYS.ELEVENLABS_SIMILARITY]);
        elements.elevenlabsSimilarity.value = normalizedValue;
        if (elements.elevenlabsSimilarityValue) {
          elements.elevenlabsSimilarityValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_SIMILARITY])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SIMILARITY, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_STYLE] !== undefined) {
        // Normalize to step 0.1 (round to nearest 0.1)
        const normalizeStyle = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 0.0;
          return Math.round(num * 10) / 10;
        };
        const normalizedValue = normalizeStyle(result[STORAGE_KEYS.ELEVENLABS_STYLE]);
        elements.elevenlabsStyle.value = normalizedValue;
        if (elements.elevenlabsStyleValue) {
          elements.elevenlabsStyleValue.textContent = normalizedValue.toFixed(1);
        }
        // Save normalized value if it was different
        if (normalizedValue !== parseFloat(result[STORAGE_KEYS.ELEVENLABS_STYLE])) {
          debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STYLE, normalizedValue);
        }
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST] !== undefined) {
        elements.elevenlabsSpeakerBoost.checked = result[STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST];
      }
      
      if (result[STORAGE_KEYS.ELEVENLABS_FORMAT] && elements.elevenlabsFormat) {
        elements.elevenlabsFormat.value = result[STORAGE_KEYS.ELEVENLABS_FORMAT];
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_TEMPERATURE] !== undefined && elements.respeecherTemperature) {
        elements.respeecherTemperature.value = result[STORAGE_KEYS.RESPEECHER_TEMPERATURE];
        if (elements.respeecherTemperatureValue) {
          elements.respeecherTemperatureValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_TEMPERATURE]).toFixed(1);
        }
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY] !== undefined && elements.respeecherRepetitionPenalty) {
        elements.respeecherRepetitionPenalty.value = result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY];
        if (elements.respeecherRepetitionPenaltyValue) {
          elements.respeecherRepetitionPenaltyValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY]).toFixed(1);
        }
      }
      
      if (result[STORAGE_KEYS.RESPEECHER_TOP_P] !== undefined && elements.respeecherTopP) {
        elements.respeecherTopP.value = result[STORAGE_KEYS.RESPEECHER_TOP_P];
        if (elements.respeecherTopPValue) {
          elements.respeecherTopPValue.textContent = parseFloat(result[STORAGE_KEYS.RESPEECHER_TOP_P]).toFixed(2);
        }
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_MODEL] && elements.googleTtsModel) {
        elements.googleTtsModel.value = result[STORAGE_KEYS.GOOGLE_TTS_MODEL];
      }
      
      if (result[STORAGE_KEYS.OPENAI_INSTRUCTIONS] !== undefined) {
        elements.openaiInstructions.value = result[STORAGE_KEYS.OPENAI_INSTRUCTIONS];
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_VOICE] && elements.googleTtsVoice) {
        elements.googleTtsVoice.value = result[STORAGE_KEYS.GOOGLE_TTS_VOICE];
      }
      
      if (result[STORAGE_KEYS.GOOGLE_TTS_PROMPT] !== undefined && elements.googleTtsPrompt) {
        elements.googleTtsPrompt.value = result[STORAGE_KEYS.GOOGLE_TTS_PROMPT] || '';
      }
      
      // Determine initial voice: prefer per-provider map, fallback to legacy single value
      const initialProvider = elements.audioProvider.value || 'openai';
      const legacyVoice = result[STORAGE_KEYS.AUDIO_VOICE];
      const voiceMap = (audioVoiceMap && typeof audioVoiceMap === 'object' && 'current' in audioVoiceMap) 
        ? audioVoiceMap.current 
        : (audioVoiceMap || {});
      const mappedVoice = voiceMap[initialProvider];
      const initialVoice = mappedVoice || legacyVoice;
      if (initialVoice) {
        elements.audioVoice.value = initialVoice;
        // Migrate legacy value into map for current provider
        if (!mappedVoice && legacyVoice) {
          saveAudioVoice(initialProvider, legacyVoice);
        }
      }
      
      if (result[STORAGE_KEYS.AUDIO_SPEED]) {
        elements.audioSpeed.value = result[STORAGE_KEYS.AUDIO_SPEED];
        if (elements.audioSpeedValue) {
          elements.audioSpeedValue.textContent = result[STORAGE_KEYS.AUDIO_SPEED] + 'x';
        }
      }
      
      // Update voice list based on provider (AFTER loading audio_voice from storage)
      // This ensures that invalid voices (e.g., 'volodymyr' for Ukrainian text, or 'nova' for Respeecher)
      // are replaced with valid defaults and restores per-provider voice selection
      // ============================================
      // UI VISIBILITY INITIALIZATION
      // ============================================
      // IMPORTANT: Order matters! updateOutputFormatUI() must be called LAST because:
      // 1. It calls updateAudioProviderUI() internally (which depends on format)
      // 2. It calls updateTranslationVisibility() internally (which depends on format)
      // 3. It handles all format-specific visibility (PDF style, audio fields, TOC/abstract)
      
      // Step 1: Update voice list for current provider (populates dropdown)
      updateVoiceList(elements.audioProvider.value);
      
      // Step 2: Apply preset colors (if preset is selected) - already done in loadSettings()
      // This code is kept for backward compatibility but colors are now applied in loadSettings()
      
      // Step 3: Update mode hint (selector vs extract mode)
      updateModeHint();
      
      // Step 4: Update cache visibility (only for selector mode)
      updateCacheVisibility();
      
      // Step 5: Update output format UI (MASTER FUNCTION - calls other update functions)
      // This is async because it calls updateTranslationVisibility() which is async
      await updateOutputFormatUI();
      
      // Step 6: Final safety check - ensure all audio fields are hidden if format is not audio
      // This is a defensive check in case format changed during async operations
      // or if updateOutputFormatUI() didn't properly hide fields
      const currentFormat = getElement('outputFormat')?.value;
      if (currentFormat !== 'audio') {
        hideAllAudioFields();
      }
      
      // Step 7: Update theme icon after loading theme setting
      log('loadSettings: applying theme');
      applyTheme();
      
      // Step 8: Restore summary if it exists or check if generation is in progress
      // Check if generation flag is stale first
      if (result[STORAGE_KEYS.SUMMARY_GENERATING]) {
        const stored = await chrome.storage.local.get(['summary_generating_start_time']);
        // CRITICAL: Use shorter threshold - summary should not take more than 15 minutes
        // If it takes longer, it's likely stuck or failed
        const STALE_THRESHOLD = 15 * 60 * 1000; // 15 minutes (reduced from 30)
        
        // If no timestamp exists, or timestamp is stale, reset the flag
        if (!stored.summary_generating_start_time) {
          // No timestamp - flag is from old version or was set incorrectly, reset it
          logWarn('Summary generation flag has no timestamp, resetting', {});
          await chrome.storage.local.set({ 
            [STORAGE_KEYS.SUMMARY_GENERATING]: false,
            summary_generating_start_time: null
          });
          result[STORAGE_KEYS.SUMMARY_GENERATING] = false;
          
          // Ensure button is enabled after reset
          if (elements.generateSummaryBtn) {
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
          }
        } else {
          const timeSinceStart = Date.now() - stored.summary_generating_start_time;
          
          if (timeSinceStart > STALE_THRESHOLD) {
            // Flag is stale - reset it
            logWarn('Summary generation flag is stale on load, resetting', { timeSinceStart });
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            result[STORAGE_KEYS.SUMMARY_GENERATING] = false;
            
            // Ensure button is enabled after reset
            if (elements.generateSummaryBtn) {
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
            }
          }
        }
      }
      
      if (result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.generateSummaryBtn) {
        // Summary generation was in progress - show status
        const generatingText = await t('generatingSummary') || 'Generating summary...';
        elements.generateSummaryBtn.textContent = generatingText;
        elements.generateSummaryBtn.disabled = true;
        
        // CRITICAL: Don't automatically restore summary here
        // Summary will be handled by checkSummaryStatus polling
        // This prevents showing stale summary after extension reload
        log('loadSettings: Summary generation in progress - will be handled by checkSummaryStatus polling');
      }
      
      // CRITICAL: Summary persists across popup opens/closes
      // Only cleared by: 1) extension reload (handled in background.js), 2) new generation start, 3) close button
      // If summary exists and not generating, show it immediately
      // Background.js clears summary on reload, so if it exists here, it's valid
      if (result[STORAGE_KEYS.SUMMARY_TEXT] && !result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.summaryText && elements.summaryContainer) {
        const savedSummary = result[STORAGE_KEYS.SUMMARY_TEXT];
        elements.summaryText.dataset.originalMarkdown = savedSummary;
        const htmlSummary = markdownToHtml(savedSummary);
        // SECURITY: Sanitize HTML to prevent XSS attacks from AI-generated content
        const sanitizedHtml = sanitizeMarkdownHtml(htmlSummary);
        elements.summaryText.innerHTML = sanitizedHtml;
        elements.summaryContainer.style.display = 'block';
        log('loadSettings: Summary restored from storage');
      } else if (!result[STORAGE_KEYS.SUMMARY_GENERATING] && elements.summaryContainer) {
        // No summary and not generating - hide container
        elements.summaryContainer.style.display = 'none';
        log('loadSettings: No summary to restore');
      }
      
      log('loadSettings: completed successfully');
    } catch (error) {
      logError('CRITICAL: loadSettings() failed', error);
      logError('loadSettings: error details', { 
        message: error.message, 
        stack: error.stack,
        errorName: error.name
      });
      // Re-throw to prevent silent failures
      throw error;
    }
  }

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
    updateVoiceList,
    loadSettings
  };
}
