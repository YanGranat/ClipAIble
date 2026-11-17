// @ts-check
// PDF Styles management module
// Handles style presets, colors, fonts reset

import { t } from '../../scripts/locales.js';
import { ELEMENT_IDS, STORAGE_KEYS, DEFAULT_STYLES } from '../constants.js';

/**
 * Initialize styles module
 * @param {Object} deps - Dependencies
 * @returns {Object} Styles functions
 */
export function initStyles(deps) {
  const {
    elements,
    STORAGE_KEYS,
    DEFAULT_STYLES,
    showToast,
    setCustomSelectValue
  } = deps;

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
      case 'textColor':
      case 'headingColor':
      case 'linkColor':
        const colorKeys = {
          bgColor: STORAGE_KEYS.CUSTOM_BG_COLOR,
          textColor: STORAGE_KEYS.CUSTOM_TEXT_COLOR,
          headingColor: STORAGE_KEYS.CUSTOM_HEADING_COLOR,
          linkColor: STORAGE_KEYS.CUSTOM_LINK_COLOR
        };
        elements[type].value = DEFAULT_STYLES[type];
        elements[`${type}Text`].value = DEFAULT_STYLES[type];
        elements.stylePreset.value = 'custom';
        await chrome.storage.local.set({
          [colorKeys[type]]: DEFAULT_STYLES[type],
          [STORAGE_KEYS.STYLE_PRESET]: 'custom'
        });
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
    const stylePresetContainer = document.getElementById(ELEMENT_IDS.STYLE_PRESET_CONTAINER);
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

  return {
    resetStyleSetting,
    resetAllStyles
  };
}

