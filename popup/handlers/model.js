// @ts-check
// Model handlers (model select, custom dropdown, add model)

/**
 * Setup model-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupModelHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    settingsModule
  } = deps;

  // Model select change handler
  if (elements.modelSelect) {
    elements.modelSelect.addEventListener('change', async () => {
      const selectedModel = elements.modelSelect.value;
      const provider = elements.apiProviderSelect?.value || 'openai';
      
      debouncedSaveSettings(STORAGE_KEYS.MODEL, selectedModel);
      
      const storageResult = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
      const modelsByProvider = storageResult[STORAGE_KEYS.MODEL_BY_PROVIDER] || {};
      await chrome.storage.local.set({
        [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
          ...modelsByProvider,
          [provider]: selectedModel
        }
      });
    });
  }

  // Add model button handler
  if (elements.addModelBtn) {
    elements.addModelBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (settingsModule) {
        await settingsModule.showAddModelDialog();
      }
    });
  }

  // Show custom dropdown on model select click
  // Track when dropdown was opened to prevent race condition
  let dropdownOpenTime = 0;
  
  if (elements.modelSelect) {
    // Use mousedown to intercept before native dropdown opens
    elements.modelSelect.addEventListener('mousedown', async (e) => {
      const isVisible = elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none';
      
      if (isVisible) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        elements.customModelDropdown.style.display = 'none';
      } else {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        dropdownOpenTime = Date.now();
        if (settingsModule) {
          await settingsModule.showCustomModelDropdown();
        }
      }
    }, true); // Use capture phase

    // Model select change handler - update custom dropdown if visible
    elements.modelSelect.addEventListener('change', async () => {
      if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
        if (settingsModule) {
          await settingsModule.showCustomModelDropdown();
        }
      }
    });
  }

  // Close custom dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdownDisplay = elements.customModelDropdown?.style.display;
    const now = Date.now();
    const timeSinceOpen = now - dropdownOpenTime;
    
    if (!elements.customModelDropdown || dropdownDisplay === 'none') {
      return;
    }
    
    // Don't close if dropdown was just opened (within 150ms) - prevents race condition
    if (timeSinceOpen < 150) {
      return;
    }
    
    // Don't close if click is inside dropdown, on select, or on add button
    if (elements.customModelDropdown.contains(e.target) ||
        (elements.modelSelect && elements.modelSelect.contains(e.target)) ||
        (elements.addModelBtn && elements.addModelBtn.contains(e.target))) {
      return;
    }
    
    requestAnimationFrame(() => {
      if (elements.customModelDropdown) {
        elements.customModelDropdown.style.display = 'none';
      }
    });
  });
}

