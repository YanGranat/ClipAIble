// @ts-check
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
    const mainFormatSelect = getElement('mainFormatSelect');
    
    if (!languageSelect || !translateImages || !outputFormat) return;
    
    // CRITICAL: Read format from mainFormatSelect first (user-facing control),
    // then fallback to outputFormat. This ensures we use the actual selected value.
    let format = outputFormat.value;
    if (mainFormatSelect && mainFormatSelect.value) {
      format = mainFormatSelect.value;
    }
    
    const isTranslating = languageSelect.value !== 'auto';
    const translateImagesEnabled = translateImages.checked;
    const isAudio = format === 'audio';
    const isMarkdown = format === 'markdown';
    
    // Show image translation option for PDF, EPUB, FB2 formats (not for Markdown or Audio)
    // Markdown doesn't support embedded images with translation, Audio doesn't use images
    const supportsImageTranslation = format === 'pdf' || format === 'epub' || format === 'fb2';
    
    // Show image translation option when:
    // 1. Format supports image translation (PDF, EPUB, FB2)
    // 2. AND user has selected a target language (not 'auto')
    const shouldShowTranslateImages = supportsImageTranslation && isTranslating;
    setElementGroupDisplay('translateImagesGroup', shouldShowTranslateImages ? 'block' : 'none');
    
    // Show Google API key input when image translation is enabled
    setElementGroupDisplay('googleApiGroup', (supportsImageTranslation && isTranslating && translateImagesEnabled) ? 'block' : 'none');
    
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
    const pdfSettingsDivider = document.getElementById('pdfSettingsDivider');
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

