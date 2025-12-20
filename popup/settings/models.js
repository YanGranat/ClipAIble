// Models management module
// Handles model list updates, custom models, hidden models

import { t, getUILanguage, UI_LOCALES } from '../../scripts/locales.js';
import { getProviderFromModel } from '../../scripts/api/index.js';

/**
 * Initialize models module
 * @param {Object} deps - Dependencies
 * @returns {Object} Models functions
 */
export function initModels(deps) {
  const {
    elements,
    STORAGE_KEYS,
    formatModelLabel
  } = deps;

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
        { value: 'gemini-3-flash-preview', isCustom: false },
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
      gemini: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
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

  return {
    updateModelList,
    showCustomModelDropdown,
    showAddModelDialog,
    addCustomModel,
    hideDefaultModel,
    removeCustomModel
  };
}

