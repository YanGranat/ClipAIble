// UI Visibility management module
// Handles showing/hiding UI elements based on format, mode, language selection

import { getUILanguage, UI_LOCALES, tSync } from '../../scripts/locales.js';

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
    // Only show cache option for selector mode
    elements.useCacheGroup.style.display = mode === 'selector' ? 'flex' : 'none';
  }

  // Show/hide translation-related UI based on language selection
  async function updateTranslationVisibility() {
    const languageSelect = getElement('languageSelect');
    const translateImages = getElement('translateImages');
    const outputFormat = getElement('outputFormat');
    
    if (!languageSelect || !translateImages || !outputFormat) return;
    
    const isTranslating = languageSelect.value !== 'auto';
    const translateImagesEnabled = translateImages.checked;
    const isAudio = outputFormat.value === 'audio';
    
    // Show image translation option only when translating AND not audio format
    // Audio format doesn't use images, so translation option is not needed
    setElementGroupDisplay('translateImagesGroup', (isTranslating && !isAudio) ? 'block' : 'none');
    
    // Show Google API key input when image translation is enabled
    setElementGroupDisplay('googleApiGroup', (isTranslating && translateImagesEnabled) ? 'block' : 'none');
    
    // Show hint if translateImages is enabled but Google key is missing
    const translateImagesHint = getElement('translateImagesHint');
    if (isTranslating && translateImagesEnabled && translateImagesHint) {
      const googleApiKey = getElement('googleApiKey');
      const googleApiKeyValue = googleApiKey?.value?.trim() || '';
      const hasGoogleKey = googleApiKeyValue && !googleApiKeyValue.startsWith('****');
      
      // Check if key exists in storage (might be encrypted/masked)
      if (!hasGoogleKey) {
        try {
          const stored = await chrome.storage.local.get(['google_api_key']);
          const storedKey = stored.google_api_key;
          if (!storedKey || (typeof storedKey === 'string' && storedKey.startsWith('****'))) {
            // No key or masked key - show hint
            const uiLang = await getUILanguage();
            const hintText = tSync('translateImagesRequiresGoogleKey', uiLang) || '⚠️ Requires Google API key for image translation';
            translateImagesHint.textContent = hintText;
            translateImagesHint.style.color = 'var(--text-warning, #ffa500)';
            return;
          }
        } catch (error) {
          // Ignore errors
        }
      }
      
      // Key exists - show normal hint
      const uiLang = await getUILanguage();
      const normalHint = tSync('translateImagesHint', uiLang) || 'Uses Google Gemini AI to translate text on images';
      translateImagesHint.textContent = normalHint;
      translateImagesHint.style.color = '';
    }
  }

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
    const format = elements.outputFormat.value;
    // Sync main format select
    if (elements.mainFormatSelect && elements.mainFormatSelect.value !== format) {
      elements.mainFormatSelect.value = format;
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
    setElementGroupDisplay('pageModeGroup', isPdf ? 'flex' : 'none');

    // PDF styling controls (colors, fonts, presets) are only for PDF
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
      'linkColorText',
      'pdfSettingsDivider'
    ];
    setDisplayForIds(pdfStyleIds, showStyleSettings ? '' : 'none');

    // ============================================
    // TOC AND ABSTRACT VISIBILITY
    // ============================================
    // TOC and abstract are not applicable for audio format
    const tocIds = ['generateToc', 'generateAbstract'];
    setDisplayForIds(tocIds, isAudio ? 'none' : '');
    
    // ============================================
    // TRANSLATION SETTINGS VISIBILITY
    // ============================================
    // Update translation visibility (hides image translation for audio)
    updateTranslationVisibility();
  }

  return {
    updateModeHint,
    updateCacheVisibility,
    updateTranslationVisibility,
    updateOutputFormatUI
  };
}

