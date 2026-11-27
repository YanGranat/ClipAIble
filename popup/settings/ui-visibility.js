// @ts-check
// UI Visibility management module
// Handles showing/hiding UI elements based on format, mode, language selection

import { getUILanguage, UI_LOCALES, tSync } from '../../scripts/locales.js';
import { ELEMENT_IDS } from '../constants.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, getImageTranslationModel, supportsImageTranslation } from '../../scripts/api/image-translation-catalog.js';
import { supportsDocumentAbstract } from '../../scripts/processing/export-requirements.js';
import { isMaskedKey } from '../../scripts/utils/security/encryption.js';

/**
 * Initialize UI visibility module
 * @param {Object} deps - Dependencies
 * @returns {Object} UI visibility functions
 */
export function initUIVisibility(deps) {
  const {
    elements,
    getElement,
    setElementGroupDisplay,
    setDisplayForIds,
    hideAllAudioFields,
    updateAudioProviderUI
  } = deps;
  let translationRevision = 0;

  // Update mode hint text
  async function updateModeHint() {
    const mode = elements.modeSelect.value;
    updateAbstractVisibility();
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    
    if (mode === 'automatic') {
      elements.modeHint.textContent = locale.extractionModeHintAutomatic || UI_LOCALES.en.extractionModeHintAutomatic;
    } else if (mode === 'selector') {
      elements.modeHint.textContent = locale.extractionModeHint || UI_LOCALES.en.extractionModeHint;
    } else {
      elements.modeHint.textContent = locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract;
    }
  }

  function updateAbstractVisibility() {
    const format = elements.mainFormatSelect?.value || elements.outputFormat?.value;
    const visible = supportsDocumentAbstract(elements.modeSelect?.value, format);
    setDisplayForIds(['generateAbstract'], visible ? 'block' : 'none');
  }

  // Show/hide cache option based on mode
  function updateCacheVisibility() {
    const mode = elements.modeSelect.value;
    // Show cache option for both automatic and selector modes
    elements.useCacheGroup.style.display = (mode === 'automatic' || mode === 'selector') ? 'flex' : 'none';
  }

  // Show/hide translation-related UI based on language selection
  async function updateTranslationVisibility() {
    const languageSelect = getElement('languageSelect');
    const translateImages = getElement('translateImages');
    const outputFormat = getElement('outputFormat');
    const mainFormatSelect = getElement('mainFormatSelect');
    
    if (!languageSelect || !translateImages || !outputFormat) return;
    
    const revision = ++translationRevision;
    const format = mainFormatSelect?.value || outputFormat.value;
    const imageProviderSelect = getElement('imageTranslationProvider');
    const provider = imageProviderSelect?.value || DEFAULT_IMAGE_TRANSLATION_PROVIDER;
    const targetLanguage = languageSelect.value;
    const isTranslating = languageSelect.value !== 'auto';
    const translateImagesEnabled = translateImages.checked;
    const isCurrent = () => revision === translationRevision &&
      (mainFormatSelect?.value || outputFormat.value) === format &&
      (imageProviderSelect?.value || DEFAULT_IMAGE_TRANSLATION_PROVIDER) === provider &&
      languageSelect.value === targetLanguage && translateImages.checked === translateImagesEnabled;
    const shouldShowTranslateImages = supportsImageTranslation(format) && isTranslating;
    const active = shouldShowTranslateImages && translateImagesEnabled;
    setElementGroupDisplay('translateImagesGroup', shouldShowTranslateImages ? 'block' : 'none');
    setElementGroupDisplay('imageTranslationProviderGroup', active ? 'block' : 'none');
    const showGoogleSettings = active && provider === 'gemini';
    const showOpenRouterImages = active && provider === 'openrouter';
    setElementGroupDisplay('openrouterImageModelGroup', showOpenRouterImages ? 'block' : 'none');
    setElementGroupDisplay('openrouterImageKeyGroup', showOpenRouterImages ? 'block' : 'none');
    setElementGroupDisplay('openaiImageKeyGroup', active && provider === 'openai' ? 'block' : 'none');
    setElementGroupDisplay(ELEMENT_IDS.GEMINI_IMAGE_MODEL, showGoogleSettings ? 'block' : 'none');
    setElementGroupDisplay('googleApiGroup', showGoogleSettings ? 'block' : 'none');

    const uiLanguage = await getUILanguage();
    if (!isCurrent()) return;
    const currentLanguage = () => getElement('uiLanguageSelect')?.value || uiLanguage;
    const modelHint = getElement('imageTranslationModelHint');
    if (modelHint) {
      const model = provider === 'openai' ? getImageTranslationModel(provider) : null;
      modelHint.hidden = !model;
      modelHint.dataset.i18nParams = JSON.stringify({ model: model || '' });
      modelHint.textContent = model ? tSync('imageTranslationModelHint', currentLanguage(), { model }) : '';
    }
    const translateImagesHint = getElement('translateImagesHint');
    if (!translateImagesHint) return;
    const renderHint = (key, warning = false) => {
      translateImagesHint.dataset.i18n = key;
      translateImagesHint.textContent = tSync(key, currentLanguage());
      translateImagesHint.style.color = warning ? 'var(--text-warning, #ffa500)' : '';
    };
    const normalKey = { openai: 'translateImagesOpenAiHint', openrouter: 'translateImagesOpenRouterHint' }[provider] || 'translateImagesHint';
    renderHint(normalKey);
    if (!showGoogleSettings) return;

    const draft = getElement('googleApiKey')?.value?.trim() || '';
    let hasKey = Boolean(draft) && !isMaskedKey(draft);
    if (!hasKey) {
      try {
        const { google_api_key: saved } = await chrome.storage.local.get(['google_api_key']);
        if (!isCurrent()) return;
        hasKey = typeof saved === 'string' && Boolean(saved) && !isMaskedKey(saved);
      } catch { if (!isCurrent()) return; }
    }
    if (!hasKey) renderHint('translateImagesRequiresGoogleKey', true);
  }

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && (changes.google_api_key || changes.ui_language)) {
      void updateTranslationVisibility();
    }
  });

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
    // CRITICAL: Read format from mainFormatSelect first (user-facing control),
    // then sync to hidden outputFormat. This ensures we use the actual selected value.
    let format = elements.outputFormat.value;
    if (elements.mainFormatSelect && elements.mainFormatSelect.value) {
      format = elements.mainFormatSelect.value;
      // Sync hidden outputFormat with mainFormatSelect
      if (elements.outputFormat.value !== format) {
        elements.outputFormat.value = format;
      }
    } else {
      // Fallback: sync main format select from outputFormat
      if (elements.mainFormatSelect && elements.mainFormatSelect.value !== format) {
        elements.mainFormatSelect.value = format;
      }
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
    const pageModeGroup = getElement('pageModeGroup');
    if (pageModeGroup) {
      const pageModeContainer = pageModeGroup.closest('.setting-item') || pageModeGroup;
      if (pageModeContainer instanceof HTMLElement) {
        if (isPdf) {
          pageModeContainer.classList.remove('hidden');
          pageModeContainer.style.display = 'flex';
        } else {
          pageModeContainer.classList.add('hidden');
          pageModeContainer.style.display = 'none';
        }
      }
    }

    // PDF styling controls (colors, fonts, presets) are only for PDF
    // Note: Some elements are direct IDs, some are inside .setting-item containers
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
      'linkColorText'
    ];
    setDisplayForIds(pdfStyleIds, showStyleSettings ? 'block' : 'none');
    
    // PDF settings divider (special handling - it's a .settings-divider, not .setting-item)
    const pdfSettingsDivider = document.getElementById(ELEMENT_IDS.PDF_SETTINGS_DIVIDER);
    if (pdfSettingsDivider) {
      if (showStyleSettings) {
        pdfSettingsDivider.classList.remove('hidden');
        pdfSettingsDivider.style.display = '';
      } else {
        pdfSettingsDivider.classList.add('hidden');
        pdfSettingsDivider.style.display = 'none';
      }
    }

    // ============================================
    // TOC AND ABSTRACT VISIBILITY
    // ============================================
    // TOC and abstract are not applicable for audio format
    setDisplayForIds(['generateToc'], isAudio ? 'none' : 'block');
    updateAbstractVisibility();
    
    // ============================================
    // TRANSLATION SETTINGS VISIBILITY
    // ============================================
    // Language selector: Show for ALL formats including audio
    // Audio needs target language to know in which language to generate speech
    const languageSelect = getElement('languageSelect');
    if (languageSelect) {
      const languageSelectContainer = languageSelect.closest('.setting-item');
      if (languageSelectContainer) {
        // Show for all formats (including audio)
        languageSelectContainer.classList.remove('hidden');
        languageSelectContainer.style.display = 'block';
      }
    }
    
    // Update translation visibility (hides image translation for audio, but keeps language selector)
    updateTranslationVisibility();
  }

  return {
    updateModeHint,
    updateCacheVisibility,
    updateTranslationVisibility,
    updateAbstractVisibility,
    updateOutputFormatUI
  };
}

