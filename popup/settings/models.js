// @ts-check
// Models management module
// Handles model list updates, custom models, hidden models

import { t, tSync, getUILanguage, UI_LOCALES } from '../../scripts/locales.js';
import { getModelCatalog, getModelMetadata, resolveHiddenModel, resolveSavedModel, resolveStoredModelSelection, normalizeModelSelection, parseModelSelection } from '../../scripts/utils/model-catalog.js';

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

  let listRevision = 0;
  let dropdownRevision = 0;
  let renderedProvider = null;
  let presentationLanguage = null;
  let storageQueue = Promise.resolve();
  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const recordValue = value => isRecord(value) ? value : {};
  const providerValues = (map, provider) => isRecord(map) && Array.isArray(map[provider])
    ? map[provider].filter(value => typeof value === 'string' && value)
    : [];
  const settingsKeys = [STORAGE_KEYS.CUSTOM_MODELS, STORAGE_KEYS.HIDDEN_MODELS,
    STORAGE_KEYS.MODEL_BY_PROVIDER, STORAGE_KEYS.MODEL, STORAGE_KEYS.API_PROVIDER];

  function normalizeModelInput(provider, value, language = 'en') {
    const normalized = normalizeModelSelection(provider, value, (key, params) => tSync(key, language, params));
    const { apiModel } = parseModelSelection(normalized);
    if (normalized.length > 4096 || !/^[a-z0-9][a-z0-9\-_\/:.]*$/i.test(apiModel)) {
      /** @type {import('../../scripts/types.js').ExtendedError} */
      const error = new Error('Enter a valid API model ID.');
      error.translationKey = 'addModelInvalidFormat';
      throw error;
    }
    return normalized;
  }

  function normalizedStoredModel(provider, value) {
    try { return normalizeModelSelection(provider, value); }
    catch { return null; }
  }

  function hiddenModelIdentity(provider, value, customIds) {
    const resolved = resolveHiddenModel(provider, value, customIds);
    return normalizedStoredModel(provider, resolved) || resolved;
  }

  function queueStorage(operation) {
    const pending = storageQueue.then(operation);
    storageQueue = pending.catch(() => {});
    return pending;
  }

  function visibleModels(settings, provider, selection) {
    const customIds = providerValues(settings[STORAGE_KEYS.CUSTOM_MODELS], provider);
    const hiddenIds = providerValues(settings[STORAGE_KEYS.HIDDEN_MODELS], provider);
    const hidden = new Set(hiddenIds.flatMap(id => [id, hiddenModelIdentity(provider, id, customIds)]));
    const entries = new Map(getModelCatalog(provider).map(entry => [entry.id,
      { value: entry.id, isCustom: customIds.includes(entry.id), isLegacy: false }]));
    for (const id of customIds) entries.set(id, { value: id, isCustom: true, isLegacy: false });
    if (selection && !entries.has(selection)) {
      entries.set(selection, { value: selection, isCustom: customIds.includes(selection), isLegacy: true });
    }
    return [...entries.values()].filter(entry => !hidden.has(entry.value) &&
      !hidden.has(normalizedStoredModel(provider, entry.value)));
  }

  function modelLabel(entry, provider, language) {
    const unavailable = !entry.isCustom && getModelMetadata(provider, entry.value)?.available === false;
    const key = entry.isLegacy ? (unavailable ? 'modelSavedUnavailable' : 'modelSaved') : (unavailable ? 'modelUnavailable' : null);
    const currentLanguage = presentationLanguage || language;
    const model = formatModelLabel(entry.value, currentLanguage);
    return key ? tSync(key, currentLanguage, { model }) : model;
  }

  function refreshModelLabels(language) {
    presentationLanguage = language;
    const provider = elements.apiProviderSelect?.value;
    if (renderedProvider !== provider) return;
    for (const option of elements.modelSelect.options) {
      option.textContent = modelLabel({ value: option.value, isCustom: option.dataset.isCustom === 'true',
        isLegacy: option.dataset.isLegacy === 'true' }, provider, language);
    }
  }

  function persistSelection(provider, modelValue, isCurrent = () => elements.apiProviderSelect?.value === provider) {
    return queueStorage(async () => {
      const saved = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
      if (!isCurrent() || !modelValue) return;
      const byProvider = recordValue(saved[STORAGE_KEYS.MODEL_BY_PROVIDER]);
      await chrome.storage.local.set({
        [STORAGE_KEYS.MODEL]: modelValue,
        [STORAGE_KEYS.MODEL_BY_PROVIDER]: { ...byProvider, [provider]: modelValue }
      });
    });
  }

  async function selectModel(modelValue) {
    const provider = elements.apiProviderSelect?.value;
    if (renderedProvider !== provider || !modelValue) return;
    ++dropdownRevision;
    const revision = ++listRevision;
    await persistSelection(provider, modelValue, () => revision === listRevision && elements.apiProviderSelect?.value === provider);
  }

  async function updateModelList(preferredModel) {
    if (!elements.apiProviderSelect || !elements.modelSelect) return;
    ++dropdownRevision;
    const provider = elements.apiProviderSelect.value;
    const revision = ++listRevision;
    const isCurrent = () => revision === listRevision && elements.apiProviderSelect.value === provider;
    const [settings, language] = await Promise.all([chrome.storage.local.get(settingsKeys), getUILanguage()]);
    if (!isCurrent()) return;
    const customIds = providerValues(settings[STORAGE_KEYS.CUSTOM_MODELS], provider);
    const byProvider = isRecord(settings[STORAGE_KEYS.MODEL_BY_PROVIDER]) ? settings[STORAGE_KEYS.MODEL_BY_PROVIDER] : {};
    let saved = typeof preferredModel === 'string' ? preferredModel : byProvider[provider];
    if (!saved && renderedProvider === provider) saved = elements.modelSelect.value;
    if (!saved && renderedProvider === null) {
      const selection = resolveStoredModelSelection(settings);
      if (selection.provider === provider) saved = selection.model;
    }
    const selection = typeof saved === 'string' && saved ? resolveSavedModel(provider, saved, customIds) : null;
    const allModels = visibleModels(settings, provider, selection);
    const chosen = allModels.find(entry => entry.value === selection)?.value || allModels[0]?.value;
    elements.modelSelect.replaceChildren();
    for (const entry of allModels) {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = modelLabel(entry, provider, language);
      option.dataset.isCustom = String(entry.isCustom);
      option.dataset.isLegacy = String(entry.isLegacy);
      elements.modelSelect.appendChild(option);
    }
    renderedProvider = provider;
    elements.modelSelect.dataset.provider = provider;
    if (chosen) {
      elements.modelSelect.value = chosen;
      await persistSelection(provider, chosen, isCurrent);
    }
  }

  // Show custom model dropdown with delete buttons
  async function showCustomModelDropdown() {
    if (!elements.customModelDropdown || !elements.customModelOptions) {
      return;
    }
    if (renderedProvider !== elements.apiProviderSelect?.value) return;
    elements.customModelOptions.setAttribute('aria-busy', 'true');
    elements.customModelOptions.replaceChildren();
    
    // Close all other custom selects
    document.querySelectorAll('.custom-select.open').forEach(select => {
      select.classList.remove('open');
    });
    if (elements.fontFamilyContainer) {
      elements.fontFamilyContainer.classList.remove('open');
    }
    
    // Show dropdown immediately to prevent race condition with click handler
    // CRITICAL: Remove 'hidden' class first (it has display: none !important)
    // Then set display to block
    elements.customModelDropdown.classList.remove('hidden');
    elements.customModelDropdown.style.display = 'block';
    
    const provider = elements.apiProviderSelect.value;
    const revision = ++dropdownRevision;
    const storageResult = await chrome.storage.local.get(settingsKeys);
    if (revision !== dropdownRevision || elements.apiProviderSelect.value !== provider) return;
    const visible = visibleModels(storageResult, provider, elements.modelSelect?.value);
    const providerCustomModels = providerValues(storageResult[STORAGE_KEYS.CUSTOM_MODELS], provider);
    const visibleIds = visible.map(entry => entry.value);
    const [deleteModelText, hideModelText, language] = await Promise.all([t('deleteModel'), t('hideModel'), getUILanguage()]);
    if (revision !== dropdownRevision || elements.apiProviderSelect.value !== provider) return;

    // Get currently selected model
    const currentModel = elements.modelSelect ? elements.modelSelect.value : null;
    
    // Add models to dropdown
    for (const modelValue of visibleIds) {
      const isCustom = providerCustomModels.includes(modelValue);
      const isSelected = modelValue === currentModel;
      const optionDiv = document.createElement('div');
      optionDiv.className = 'custom-model-option' + (isSelected ? ' selected' : '');
      optionDiv.dataset.modelValue = modelValue;
      optionDiv.setAttribute('role', 'row');
      optionDiv.id = `modelRow-${encodeURIComponent(provider)}-${encodeURIComponent(modelValue)}`;
      
      const labelSpan = document.createElement('span');
      labelSpan.className = 'custom-model-label';
      labelSpan.textContent = modelLabel(visible.find(entry => entry.value === modelValue), provider, language);
      labelSpan.title = labelSpan.textContent;
      labelSpan.setAttribute('role', 'gridcell');
      labelSpan.id = `modelLabel-${encodeURIComponent(provider)}-${encodeURIComponent(modelValue)}`;
      
      optionDiv.appendChild(labelSpan);
      
      // Add delete button for all models
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'custom-model-delete';
      deleteBtn.type = 'button';
      deleteBtn.tabIndex = -1;
      deleteBtn.innerHTML = '×';
      deleteBtn.title = isCustom ? deleteModelText : hideModelText;
      deleteBtn.setAttribute('aria-label', `${deleteBtn.title}: ${labelSpan.textContent}`);
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (revision !== dropdownRevision || elements.apiProviderSelect.value !== provider) return;
        if (isCustom) {
          await removeCustomModel(modelValue, provider);
        } else {
          await hideDefaultModel(modelValue, provider);
        }
      });
      const actions = document.createElement('span');
      actions.className = 'custom-model-actions';
      actions.setAttribute('role', 'gridcell');
      actions.appendChild(deleteBtn);
      optionDiv.appendChild(actions);
      
      // Add click handler to entire option div for full-width clickable area
      optionDiv.addEventListener('click', (e) => {
        if (revision !== dropdownRevision || elements.apiProviderSelect.value !== provider) return;
        // Don't trigger selection if clicking on delete button
        const target = e.target instanceof Element ? e.target : null;
        if (target && (target.classList.contains('custom-model-delete') || target.closest('.custom-model-delete'))) {
          return;
        }
        
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Update select value and close dropdown
        elements.modelSelect.value = modelValue;
        // CRITICAL: Add 'hidden' class (it has display: none !important)
        elements.customModelDropdown.classList.add('hidden');
        elements.customModelDropdown.style.display = 'none';
        // Trigger change event to save settings
        elements.modelSelect.dispatchEvent(new Event('change'));
      });
      
      elements.customModelOptions.appendChild(optionDiv);
    }
    elements.customModelOptions.setAttribute('aria-busy', 'false');
  }

  // Show dialog for adding new model
  async function showAddModelDialog() {
    const provider = elements.apiProviderSelect.value;
    const uiLang = await getUILanguage();
    const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
    if (elements.apiProviderSelect.value !== provider) return;
    
    const modelName = prompt(locale.addModelPrompt || 'Enter model name:');
    
    if (!modelName || !modelName.trim()) {
      return;
    }
    
    let modelValue;
    try {
      modelValue = normalizeModelInput(provider, modelName, uiLang);
    } catch (error) {
      alert(locale[error.translationKey] || locale.addModelInvalidFormat || 'Enter a valid API model ID with an optional (reasoning: high).');
      return;
    }
    
    // Check if model already exists
    const storageResult = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS, STORAGE_KEYS.HIDDEN_MODELS]);
    const providerCustomModels = providerValues(storageResult[STORAGE_KEYS.CUSTOM_MODELS], provider);
    
    const existing = providerCustomModels.find(id => normalizedStoredModel(provider, id) === modelValue);
    const hidden = providerValues(storageResult[STORAGE_KEYS.HIDDEN_MODELS], provider)
      .some(id => hiddenModelIdentity(provider, id, providerCustomModels) === modelValue);
    if (existing && !hidden) {
      const errorMsg = locale.addModelAlreadyExists || 'This model already exists';
      alert(errorMsg);
      return;
    }
    
    // Add model
    await addCustomModel(modelValue, provider);
  }

  async function addCustomModel(modelValue, provider = elements.apiProviderSelect.value) {
    modelValue = normalizeModelInput(provider, modelValue);
    let selectedValue = modelValue;
    if (elements.apiProviderSelect.value === provider) ++listRevision;
    await queueStorage(async () => {
      const saved = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_MODELS, STORAGE_KEYS.HIDDEN_MODELS]);
      const custom = recordValue(saved[STORAGE_KEYS.CUSTOM_MODELS]);
      const hidden = recordValue(saved[STORAGE_KEYS.HIDDEN_MODELS]);
      const customIds = providerValues(custom, provider);
      const existing = customIds.find(id => normalizedStoredModel(provider, id) === modelValue);
      selectedValue = existing || modelValue;
      const builtIn = getModelCatalog(provider).some(entry => entry.id === modelValue);
      await chrome.storage.local.set({
        [STORAGE_KEYS.CUSTOM_MODELS]: { ...custom, [provider]: existing || builtIn ? customIds : [...customIds, modelValue] },
        [STORAGE_KEYS.HIDDEN_MODELS]: { ...hidden, [provider]: providerValues(hidden, provider)
          .filter(id => hiddenModelIdentity(provider, id, customIds) !== modelValue) }
      });
    });
    if (elements.apiProviderSelect.value === provider) await updateModelList(selectedValue);
  }

  async function removeModel(modelValue, provider, custom) {
    if (elements.apiProviderSelect.value === provider) ++listRevision;
    await queueStorage(async () => {
      const saved = await chrome.storage.local.get(settingsKeys);
      const field = custom ? STORAGE_KEYS.CUSTOM_MODELS : STORAGE_KEYS.HIDDEN_MODELS;
      const values = isRecord(saved[field]) ? saved[field] : {};
      const byProvider = { ...recordValue(saved[STORAGE_KEYS.MODEL_BY_PROVIDER]) };
      const entries = providerValues(values, provider);
      const changes = { [field]: { ...values, [provider]: custom ? entries.filter(id => id !== modelValue) : [...new Set([...entries, modelValue])] } };
      if (byProvider[provider] === modelValue) {
        delete byProvider[provider];
        changes[STORAGE_KEYS.MODEL_BY_PROVIDER] = byProvider;
      }
      if (elements.apiProviderSelect.value === provider && saved[STORAGE_KEYS.MODEL] === modelValue) changes[STORAGE_KEYS.MODEL] = '';
      await chrome.storage.local.set(changes);
    });
    if (elements.apiProviderSelect.value !== provider) return;
    if (elements.modelSelect?.value === modelValue) elements.modelSelect.value = '';
    await updateModelList();
    if (elements.customModelDropdown && !elements.customModelDropdown.classList.contains('hidden') &&
        elements.customModelDropdown.style.display !== 'none') await showCustomModelDropdown();
  }

  async function hideDefaultModel(modelValue, provider = elements.apiProviderSelect.value) {
    await removeModel(modelValue, provider, false);
  }

  async function removeCustomModel(modelValue, provider = elements.apiProviderSelect.value) {
    await removeModel(modelValue, provider, true);
  }

  return {
    refreshModelLabels,
    updateModelList,
    selectModel,
    showCustomModelDropdown,
    showAddModelDialog,
    addCustomModel,
    hideDefaultModel,
    removeCustomModel
  };
}

