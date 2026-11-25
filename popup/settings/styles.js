// @ts-check
// PDF Styles management module
// Handles style presets, colors, fonts reset

import { t } from '../../scripts/locales.js';
import { refreshCustomSelectSelection } from '../utils/custom-select.js';

export const PALETTE_STORAGE_KEYS = Object.freeze({
  bgColor: 'CUSTOM_BG_COLOR',
  textColor: 'CUSTOM_TEXT_COLOR',
  headingColor: 'CUSTOM_HEADING_COLOR',
  linkColor: 'CUSTOM_LINK_COLOR'
});

function showStylePreset(select, preset) {
  select.value = preset;
  refreshCustomSelectSelection(select);
}

/** Store the same palette that the popup uses for its immediate export. */
export async function saveVisibleCustomPalette(elements, storageKeys) {
  const update = { [storageKeys.STYLE_PRESET]: 'custom' };
  for (const [field, key] of Object.entries(PALETTE_STORAGE_KEYS)) {
    update[storageKeys[key]] = elements[field].value;
  }
  showStylePreset(elements.stylePreset, 'custom');
  await chrome.storage.local.set(update);
}

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
        elements[type].value = DEFAULT_STYLES[type];
        elements[`${type}Text`].value = DEFAULT_STYLES[type];
        await saveVisibleCustomPalette(elements, STORAGE_KEYS);
        break;
    }
    const resetText = await t('resetToDefault');
    showToast(resetText, 'success', { key: 'resetToDefault' });
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
    showStylePreset(elements.stylePreset, 'dark');
    
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
    showToast(allStylesResetText, 'success', { key: 'allStylesReset' });
  }

  return {
    resetStyleSetting,
    resetAllStyles
  };
}

