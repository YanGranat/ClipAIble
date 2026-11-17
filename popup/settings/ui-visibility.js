// @ts-check
// UI Visibility management module
// Handles showing/hiding UI elements based on format, mode, language selection

import { getUILanguage, UI_LOCALES, tSync } from '../../scripts/locales.js';
import { ELEMENT_IDS } from '../constants.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, getImageTranslationModel, supportsImageTranslation } from '../../scripts/api/image-translation-catalog.js';

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
    setElementGroupDisplay('googleApiGroup', active && provider === 'gemini' ? 'block' : 'none');

    const uiLanguage = await getUILanguage();
    if (!isCurrent()) return;
    const currentLanguage = () => getElement('uiLanguageSelect')?.value || uiLanguage;
    const modelHint = getElement('imageTranslationModelHint');
    if (modelHint) {
      const model = getImageTranslationModel(provider);
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
    const normalKey = provider === 'openai' ? 'translateImagesOpenAiHint' : 'translateImagesHint';
    renderHint(normalKey);
    if (!active) return;

    const keyInput = getElement(provider === 'openai' ? 'apiKey' : 'googleApiKey');
    const draft = keyInput?.value?.trim() || '';
    const ownsDraft = provider !== 'openai' ||
      (getElement('apiProviderSelect')?.value === 'openai' && keyInput?.dataset.provider === 'openai');
    let hasKey = ownsDraft && Boolean(draft) && !/^(?:\*{4}|•{4})/.test(draft);
    if (!hasKey) {
      try {
        const storageKey = provider === 'openai' ? 'openai_api_key' : 'google_api_key';
        const stored = await chrome.storage.local.get([storageKey]);
        if (!isCurrent()) return;
        hasKey = typeof stored[storageKey] === 'string' && Boolean(stored[storageKey]) && !/^(?:\*{4}|•{4})/.test(stored[storageKey]);
      } catch { if (!isCurrent()) return; }
    }
    if (!hasKey) renderHint(provider === 'openai' ? 'translateImagesRequiresOpenAiKey' : 'translateImagesRequiresGoogleKey', true);
  }

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && (changes.openai_api_key || changes.google_api_key || changes.ui_language)) {
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
    const tocIds = ['generateToc', 'generateAbstract'];
    setDisplayForIds(tocIds, isAudio ? 'none' : 'block');
    
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
    updateOutputFormatUI
  };
}

