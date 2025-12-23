// @ts-check
// Theme and language handlers

/**
 * Setup theme and language handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.applyTheme - Apply theme function
 * @param {Function} deps.setUILanguage - Set UI language function
 * @param {Function} deps.applyLocalization - Apply localization function
 * @param {Function} deps.initAllCustomSelects - Initialize all custom selects function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupThemeHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    debouncedSaveSettings,
    applyTheme,
    setUILanguage,
    applyLocalization,
    initAllCustomSelects,
    settingsModule
  } = deps;

  if (elements.themeSelect) {
    elements.themeSelect.addEventListener('change', () => {
      debouncedSaveSettings(STORAGE_KEYS.THEME, elements.themeSelect.value, () => {
        applyTheme();
      });
    });
  }
  
  if (elements.uiLanguageSelect) {
    elements.uiLanguageSelect.addEventListener('change', async () => {
      const langCode = elements.uiLanguageSelect.value;
      await setUILanguage(langCode);
      await applyLocalization();
      if (settingsModule && settingsModule.loadSettings) {
        await settingsModule.loadSettings();
      }
      initAllCustomSelects();
    });
  }
}

