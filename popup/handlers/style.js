// @ts-check
import { enhanceCustomSelect } from '../utils/custom-select.js';
import { PALETTE_STORAGE_KEYS, saveVisibleCustomPalette } from '../settings/styles.js';
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
  let paletteRevision = 0;

  // Style preset handler
  if (elements.stylePreset) {
    elements.stylePreset.addEventListener('change', async () => {
      const preset = elements.stylePreset.value;
      const revision = ++paletteRevision;
      const colors = preset !== 'custom' && STYLE_PRESETS[preset];
      if (colors) {
        // The next export or edit must see the new palette even while storage is pending.
        for (const field of Object.keys(PALETTE_STORAGE_KEYS)) {
          elements[field].value = colors[field];
          elements[`${field}Text`].value = colors[field];
        }
      }
      
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: preset });
      } catch (error) {
        logError('Failed to save style preset', error);
      }
      if (revision !== paletteRevision || elements.stylePreset.value !== preset) return;
      
      if (preset === 'custom') {
        // Load custom user colors from dedicated storage keys and apply to UI
        try {
          const result = await chrome.storage.local.get([
            STORAGE_KEYS.CUSTOM_BG_COLOR,
            STORAGE_KEYS.CUSTOM_TEXT_COLOR,
            STORAGE_KEYS.CUSTOM_HEADING_COLOR,
            STORAGE_KEYS.CUSTOM_LINK_COLOR
          ]);
          if (revision !== paletteRevision || elements.stylePreset.value !== preset) return;

          // Apply custom colors (or defaults if none exist)
          if (result[STORAGE_KEYS.CUSTOM_BG_COLOR]) {
            const bgColorStr = String(result[STORAGE_KEYS.CUSTOM_BG_COLOR]);
            elements.bgColor.value = bgColorStr;
            elements.bgColorText.value = bgColorStr;
          }

          if (result[STORAGE_KEYS.CUSTOM_TEXT_COLOR]) {
            const textColorStr = String(result[STORAGE_KEYS.CUSTOM_TEXT_COLOR]);
            elements.textColor.value = textColorStr;
            elements.textColorText.value = textColorStr;
          }

          if (result[STORAGE_KEYS.CUSTOM_HEADING_COLOR]) {
            const headingColorStr = String(result[STORAGE_KEYS.CUSTOM_HEADING_COLOR]);
            elements.headingColor.value = headingColorStr;
            elements.headingColorText.value = headingColorStr;
          }

          if (result[STORAGE_KEYS.CUSTOM_LINK_COLOR]) {
            const linkColorStr = String(result[STORAGE_KEYS.CUSTOM_LINK_COLOR]);
            elements.linkColor.value = linkColorStr;
            elements.linkColorText.value = linkColorStr;
          }
        } catch (error) {
          logError('Failed to load custom colors when switching to custom preset', error);
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
        // CRITICAL: Add 'hidden' class (it has display: none !important)
        elements.customModelDropdown.classList.add('hidden');
        elements.customModelDropdown.style.display = 'none';
      }
      
      if (isOpen) {
        elements.fontFamilyContainer.classList.remove('open');
      } else {
        elements.fontFamilyContainer.classList.add('open');
      }
    });
  }

  // Sync native select (hidden input) changes with custom select
  if (elements.fontFamily) {
    elements.fontFamily.addEventListener('change', () => {
      const value = elements.fontFamily.value || '';
      // Find option in custom select
      const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        opt.classList.remove('selected');
        const optValue = opt.dataset.value || '';
        if (optValue === value) {
          opt.classList.add('selected');
          elements.fontFamilyValue.textContent = opt.textContent;
          // Apply font family style
          if (opt.classList.contains('font-segoe-ui')) {
            elements.fontFamilyValue.style.fontFamily = 'Segoe UI, sans-serif';
          } else if (opt.classList.contains('font-arial')) {
            elements.fontFamilyValue.style.fontFamily = 'Arial, sans-serif';
          } else if (opt.classList.contains('font-georgia')) {
            elements.fontFamilyValue.style.fontFamily = 'Georgia, serif';
          } else if (opt.classList.contains('font-times-new-roman')) {
            elements.fontFamilyValue.style.fontFamily = 'Times New Roman, serif';
          } else if (opt.classList.contains('font-verdana')) {
            elements.fontFamilyValue.style.fontFamily = 'Verdana, sans-serif';
          } else if (opt.classList.contains('font-tahoma')) {
            elements.fontFamilyValue.style.fontFamily = 'Tahoma, sans-serif';
          } else if (opt.classList.contains('font-trebuchet-ms')) {
            elements.fontFamilyValue.style.fontFamily = 'Trebuchet MS, sans-serif';
          } else {
            elements.fontFamilyValue.style.fontFamily = opt.style.fontFamily || '';
          }
        }
      });
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

  enhanceCustomSelect(elements.fontFamily, elements.fontFamilyContainer);

  // Close dropdown when clicking outside
  const windowWithModules = /** @type {Window & { customSelectClickHandlerAdded?: boolean }} */ (window);
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

  function saveCustomPalette() {
    paletteRevision++;
    void saveVisibleCustomPalette(elements, STORAGE_KEYS).catch(error => logError('Failed to save custom palette', error));
  }

  for (const field of Object.keys(PALETTE_STORAGE_KEYS)) {
    const picker = elements[field];
    const text = elements[`${field}Text`];
    if (!picker || !text) continue;
    picker.addEventListener('input', () => { text.value = picker.value; });
    picker.addEventListener('change', () => {
      text.value = picker.value;
      saveCustomPalette();
    });
    text.addEventListener('change', () => {
      if (!/^#[0-9A-Fa-f]{6}$/.test(text.value)) {
        text.value = picker.value;
        return;
      }
      picker.value = text.value;
      text.value = picker.value;
      saveCustomPalette();
    });
  }

  // Reset individual settings
  document.querySelectorAll('.btn-reset-inline').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      paletteRevision++;
      const resetType = btn instanceof HTMLElement ? btn.dataset.reset : null;
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
      paletteRevision++;
      deferAsyncWork(async () => {
        if (settingsModule) {
          await settingsModule.resetAllStyles();
        }
      }, 0);
    });
  }
}

