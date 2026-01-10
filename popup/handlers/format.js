// @ts-check
// Format handlers (output format, TOC, abstract, page mode, language, translate images)

/**
 * Setup format-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.deferAsyncWork - Defer async work function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupFormatHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    deferAsyncWork,
    settingsModule
  } = deps;

  // Output format change handler
  if (elements.outputFormat) {
    elements.outputFormat.addEventListener('change', () => {
      const value = elements.outputFormat.value;
      debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, value, () => {
        requestAnimationFrame(() => {
          if (elements.mainFormatSelect) {
            elements.mainFormatSelect.value = value;
          }
        });
        if (settingsModule) {
          deferAsyncWork(async () => {
            await settingsModule.updateOutputFormatUI();
          });
        }
      });
    });
  }
  
  // Main format select sync
  if (elements.mainFormatSelect) {
    elements.mainFormatSelect.addEventListener('change', () => {
      const value = elements.mainFormatSelect.value;
      // CRITICAL: Sync outputFormat synchronously BEFORE calling updateOutputFormatUI
      // This ensures updateOutputFormatUI() reads the correct value
      elements.outputFormat.value = value;
      debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, value, () => {
        if (settingsModule) {
          deferAsyncWork(async () => {
            await settingsModule.updateOutputFormatUI();
          });
        }
      });
    });
  }

  // Generate TOC checkbox
  if (elements.generateToc) {
    elements.generateToc.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GENERATE_TOC, elements.generateToc.checked);
    });
  }
  
  // Generate abstract checkbox
  if (elements.generateAbstract) {
    elements.generateAbstract.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.GENERATE_ABSTRACT, elements.generateAbstract.checked);
    });
  }

  // Page mode selector
  if (elements.pageMode) {
    elements.pageMode.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.PAGE_MODE, elements.pageMode.value);
    });
  }

  // Language selector
  if (elements.languageSelect) {
    elements.languageSelect.addEventListener('change', () => {
      const value = elements.languageSelect.value;
      debouncedSaveSettings(STORAGE_KEYS.LANGUAGE, value, async () => {
        if (settingsModule) {
          await settingsModule.updateTranslationVisibility();
        }
      });
    });
  }

  // Translate images checkbox
  if (elements.translateImages) {
    elements.translateImages.addEventListener('change', () => {
      const value = elements.translateImages.checked;
      debouncedSaveSettings(STORAGE_KEYS.TRANSLATE_IMAGES, value, async () => {
        if (settingsModule) {
          await settingsModule.updateTranslationVisibility();
        }
      });
    });
  }
}

