// @ts-check
// Style handlers (presets, fonts, colors, reset buttons)

/**
 * Setup style-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Object} deps.STYLE_PRESETS - Style presets object
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.deferAsyncWork - Defer async work function
 * @param {Function} deps.logError - Error logging function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupStyleHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    STYLE_PRESETS,
    debouncedSaveSettings,
    deferAsyncWork,
    logError,
    settingsModule
  } = deps;

  // Style preset handler
  if (elements.stylePreset) {
    elements.stylePreset.addEventListener('change', async () => {
      const preset = elements.stylePreset.value;
      
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: preset });
      } catch (error) {
        logError('Failed to save style preset', error);
      }
      
      if (preset !== 'custom' && STYLE_PRESETS[preset]) {
        const colors = STYLE_PRESETS[preset];
        
        elements.bgColor.value = colors.bgColor;
        elements.bgColorText.value = colors.bgColor;
        elements.textColor.value = colors.textColor;
        elements.textColorText.value = colors.textColor;
        elements.headingColor.value = colors.headingColor;
        elements.headingColorText.value = colors.headingColor;
        elements.linkColor.value = colors.linkColor;
        elements.linkColorText.value = colors.linkColor;
        
        try {
          await chrome.storage.local.set({
            [STORAGE_KEYS.BG_COLOR]: colors.bgColor,
            [STORAGE_KEYS.TEXT_COLOR]: colors.textColor,
            [STORAGE_KEYS.HEADING_COLOR]: colors.headingColor,
            [STORAGE_KEYS.LINK_COLOR]: colors.linkColor
          });
        } catch (error) {
          logError('Failed to save preset colors', error);
        }
      }
    });
  }

  // Font family dropdown
  if (elements.fontFamilyTrigger) {
    elements.fontFamilyTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = elements.fontFamilyContainer.classList.contains('open');
      
      document.querySelectorAll('.custom-select.open').forEach(otherSelect => {
        if (otherSelect !== elements.fontFamilyContainer) {
          otherSelect.classList.remove('open');
        }
      });
      
      if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
        elements.customModelDropdown.style.display = 'none';
      }
      
      if (isOpen) {
        elements.fontFamilyContainer.classList.remove('open');
      } else {
        elements.fontFamilyContainer.classList.add('open');
      }
    });
  }

  if (elements.fontFamilyOptions) {
    elements.fontFamilyOptions.addEventListener('click', async (e) => {
      const option = e.target.closest('.custom-select-option');
      if (!option) return;
      
      const value = option.dataset.value;
      const text = option.textContent;
      const fontStyle = option.style.fontFamily;
      
      elements.fontFamily.value = value;
      elements.fontFamilyValue.textContent = text;
      elements.fontFamilyValue.style.fontFamily = fontStyle;
      
      elements.fontFamilyOptions.querySelectorAll('.custom-select-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      option.classList.add('selected');
      
      elements.fontFamilyContainer.classList.remove('open');
      
      debouncedSaveSettings(STORAGE_KEYS.FONT_FAMILY, value);
    });
  }

  // Close dropdown when clicking outside
  const windowWithModules = window;
  if (!windowWithModules.customSelectClickHandlerAdded) {
    document.addEventListener('click', (e) => {
      requestAnimationFrame(() => {
        document.querySelectorAll('.custom-select.open').forEach(select => {
          const target = e.target instanceof Node ? e.target : null;
          if (target && !select.contains(target)) {
            select.classList.remove('open');
          }
        });
        
        if (elements.fontFamilyContainer && !elements.fontFamilyContainer.contains(e.target)) {
          elements.fontFamilyContainer.classList.remove('open');
        }
        
        const target = e.target instanceof Node ? e.target : null;
        if (elements.customModelDropdown && 
            elements.customModelDropdown.style.display !== 'none' &&
            target &&
            !elements.customModelDropdown.contains(target) &&
            !(elements.modelSelect && elements.modelSelect.contains(target)) &&
            !(elements.addModelBtn && elements.addModelBtn.contains(target))) {
          elements.customModelDropdown.style.display = 'none';
        }
      });
    });
    windowWithModules.customSelectClickHandlerAdded = true;
  }

  // Font size handler
  if (elements.fontSize) {
    elements.fontSize.addEventListener('change', () => {
      const size = parseInt(elements.fontSize.value) || 31;
      elements.fontSize.value = size;
      debouncedSaveSettings(STORAGE_KEYS.FONT_SIZE, String(size));
    });
  }

  // Helper to switch to custom preset when colors are changed manually
  function setPresetToCustom() {
    if (elements.stylePreset && elements.stylePreset.value !== 'custom') {
      elements.stylePreset.value = 'custom';
      chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: 'custom' });
    }
  }

  // Color handlers - sync picker and text input
  if (elements.bgColor) {
    elements.bgColor.addEventListener('input', () => { 
      if (elements.bgColorText) elements.bgColorText.value = elements.bgColor.value; 
    });
    elements.bgColor.addEventListener('change', () => {
      setPresetToCustom();
      debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColor.value);
    });
  }
  if (elements.bgColorText) {
    elements.bgColorText.addEventListener('change', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(elements.bgColorText.value)) {
        elements.bgColor.value = elements.bgColorText.value;
        debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColorText.value);
      } else { 
        if (elements.bgColor) elements.bgColorText.value = elements.bgColor.value; 
      }
    });
  }

  if (elements.textColor) {
    elements.textColor.addEventListener('input', () => { 
      if (elements.textColorText) elements.textColorText.value = elements.textColor.value; 
    });
    elements.textColor.addEventListener('change', () => {
      setPresetToCustom();
      debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColor.value);
    });
  }
  if (elements.textColorText) {
    elements.textColorText.addEventListener('change', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(elements.textColorText.value)) {
        elements.textColor.value = elements.textColorText.value;
        debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColorText.value);
      } else { 
        if (elements.textColor) elements.textColorText.value = elements.textColor.value; 
      }
    });
  }

  if (elements.headingColor) {
    elements.headingColor.addEventListener('input', () => { 
      if (elements.headingColorText) elements.headingColorText.value = elements.headingColor.value; 
    });
    elements.headingColor.addEventListener('change', () => {
      setPresetToCustom();
      debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColor.value);
    });
  }
  if (elements.headingColorText) {
    elements.headingColorText.addEventListener('change', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(elements.headingColorText.value)) {
        elements.headingColor.value = elements.headingColorText.value;
        debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColorText.value);
      } else { 
        if (elements.headingColor) elements.headingColorText.value = elements.headingColor.value; 
      }
    });
  }

  if (elements.linkColor) {
    elements.linkColor.addEventListener('input', () => { 
      if (elements.linkColorText) elements.linkColorText.value = elements.linkColor.value; 
    });
    elements.linkColor.addEventListener('change', () => {
      setPresetToCustom();
      debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColor.value);
    });
  }
  if (elements.linkColorText) {
    elements.linkColorText.addEventListener('change', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(elements.linkColorText.value)) {
        elements.linkColor.value = elements.linkColorText.value;
        debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColorText.value);
      } else { 
        if (elements.linkColor) elements.linkColorText.value = elements.linkColor.value; 
      }
    });
  }

  // Reset individual settings
  document.querySelectorAll('.btn-reset-inline').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const resetType = btn.dataset.reset;
      deferAsyncWork(async () => {
        if (settingsModule) {
          await settingsModule.resetStyleSetting(resetType);
        }
      });
    });
  });

  // Reset all styles
  if (elements.resetStylesBtn) {
    elements.resetStylesBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      deferAsyncWork(async () => {
        if (settingsModule) {
          await settingsModule.resetAllStyles();
        }
      }, 0);
    });
  }
}

