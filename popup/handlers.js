// Event handlers for popup
// This module contains all event listeners setup

/**
 * Initialize handlers module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Object} deps.STYLE_PRESETS - Style presets object
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.showToast - Show toast notification function
 * @param {Function} deps.decryptApiKey - Decrypt API key function
 * @param {Function} deps.maskApiKey - Mask API key function
 * @param {Function} deps.encryptApiKey - Encrypt API key function
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.getUILanguage - Get UI language function
 * @param {Function} deps.setUILanguage - Set UI language function
 * @param {Object} deps.UI_LOCALES - UI locales object
 * @param {Function} deps.debouncedSaveSettings - Debounced save settings function
 * @param {Function} deps.loadAndDisplayStats - Load and display stats function
 * @param {Function} deps.applyTheme - Apply theme function
 * @param {Function} deps.applyLocalization - Apply localization function
 * @param {Function} deps.initAllCustomSelects - Initialize all custom selects function
 * @param {Function} deps.handleSavePdf - Handle save PDF function (from core)
 * @param {Function} deps.handleCancel - Handle cancel function (from core)
 * @param {Function} deps.handleGenerateSummary - Handle generate summary function (from core)
 * @param {Function} deps.toggleSummary - Toggle summary function (from core)
 * @param {Function} deps.copySummary - Copy summary function (from core)
 * @param {Function} deps.downloadSummary - Download summary function (from core)
 * @param {Function} deps.closeSummary - Close summary function (from core)
 * @returns {Function} setupEventListeners function
 */
export function initHandlers(deps) {
  const {
    elements,
    STORAGE_KEYS,
    STYLE_PRESETS,
    log,
    logError,
    logWarn,
    showToast,
    decryptApiKey,
    maskApiKey,
    encryptApiKey,
    t,
    getUILanguage,
    setUILanguage,
    UI_LOCALES,
    debouncedSaveSettings,
    loadAndDisplayStats,
    applyTheme,
    applyLocalization,
    initAllCustomSelects,
    handleSavePdf,
    handleCancel,
    handleGenerateSummary,
    toggleSummary,
    copySummary,
    downloadSummary,
    closeSummary
  } = deps;

  /**
   * Setup all event listeners for popup
   */
  function setupEventListeners() {
    log('setupEventListeners: starting');
    
    if (elements.toggleApiKey && elements.apiKey) {
      elements.toggleApiKey.addEventListener('click', async () => {
        const input = elements.apiKey;
        if (!input) return;
        const isPassword = input.type === 'password';
      
        if (isPassword) {
          // Show full key
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted; // Store decrypted for quick hide
            } catch (error) {
              logError('Failed to decrypt API key', error);
              // If decryption fails, try to use current value if it's not masked
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            // Key is already visible or not masked
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          if (elements.toggleApiKey) {
            elements.toggleApiKey.querySelector('.eye-icon').textContent = '🔒';
          }
        } else {
          // Hide key
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          if (elements.toggleApiKey) {
            elements.toggleApiKey.querySelector('.eye-icon').textContent = '👁';
          }
        }
      });
    }

    if (elements.toggleClaudeApiKey && elements.claudeApiKey) {
      elements.toggleClaudeApiKey.addEventListener('click', async () => {
        const input = elements.claudeApiKey;
        const isPassword = input.type === 'password';
        
        if (isPassword) {
          // Show full key
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt API key', error);
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '🔒';
        } else {
          // Hide key
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '👁';
        }
      });
    }

    if (elements.toggleGeminiApiKey && elements.geminiApiKey) {
      elements.toggleGeminiApiKey.addEventListener('click', async () => {
        const input = elements.geminiApiKey;
        const isPassword = input.type === 'password';
        
        if (isPassword) {
          // Show full key
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt API key', error);
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '🔒';
        } else {
          // Hide key
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '👁';
        }
      });
    }

    if (elements.toggleGoogleApiKey) {
      elements.toggleGoogleApiKey.addEventListener('click', async () => {
        const input = elements.googleApiKey;
        const isPassword = input.type === 'password';
        
        if (isPassword) {
          // Show full key
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt API key', error);
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '🔒';
        } else {
          // Hide key
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '👁';
        }
      });
    }

    // API provider selector change handler
    if (elements.apiProviderSelect) {
      elements.apiProviderSelect.addEventListener('change', async () => {
        // Close custom dropdown when provider changes
        if (elements.customModelDropdown) {
          elements.customModelDropdown.style.display = 'none';
        }
        const provider = elements.apiProviderSelect.value;
        
        // Save selected provider
        await chrome.storage.local.set({ [STORAGE_KEYS.API_PROVIDER]: provider });
        
        // Load API key for selected provider
        const result = await chrome.storage.local.get([
          STORAGE_KEYS.API_KEY,
          STORAGE_KEYS.CLAUDE_API_KEY,
          STORAGE_KEYS.GEMINI_API_KEY,
          STORAGE_KEYS.GROK_API_KEY,
          STORAGE_KEYS.OPENROUTER_API_KEY
        ]);
        
        let apiKeyValue = '';
        let apiKeyEncrypted = null;
        
        if (provider === 'openai' && result[STORAGE_KEYS.API_KEY]) {
          try {
            const decrypted = await decryptApiKey(result[STORAGE_KEYS.API_KEY]);
            apiKeyValue = maskApiKey(decrypted);
            apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
          } catch (error) {
            logError('Failed to decrypt OpenAI API key', error);
            apiKeyValue = maskApiKey(result[STORAGE_KEYS.API_KEY]);
            apiKeyEncrypted = result[STORAGE_KEYS.API_KEY];
          }
        } else if (provider === 'claude' && result[STORAGE_KEYS.CLAUDE_API_KEY]) {
          try {
            const decrypted = await decryptApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
            apiKeyValue = maskApiKey(decrypted);
            apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
          } catch (error) {
            logError('Failed to decrypt Claude API key', error);
            apiKeyValue = maskApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
            apiKeyEncrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
          }
        } else if (provider === 'gemini' && result[STORAGE_KEYS.GEMINI_API_KEY]) {
          try {
            const decrypted = await decryptApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
            apiKeyValue = maskApiKey(decrypted);
            apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
          } catch (error) {
            logError('Failed to decrypt Gemini API key', error);
            apiKeyValue = maskApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
            apiKeyEncrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
          }
        } else if (provider === 'grok' && result[STORAGE_KEYS.GROK_API_KEY]) {
          try {
            const decrypted = await decryptApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
            apiKeyValue = maskApiKey(decrypted);
            apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
          } catch (error) {
            logError('Failed to decrypt Grok API key', error);
            apiKeyValue = maskApiKey(result[STORAGE_KEYS.GROK_API_KEY]);
            apiKeyEncrypted = result[STORAGE_KEYS.GROK_API_KEY];
          }
        } else if (provider === 'openrouter' && result[STORAGE_KEYS.OPENROUTER_API_KEY]) {
          try {
            const decrypted = await decryptApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
            apiKeyValue = maskApiKey(decrypted);
            apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
          } catch (error) {
            logError('Failed to decrypt OpenRouter API key', error);
            apiKeyValue = maskApiKey(result[STORAGE_KEYS.OPENROUTER_API_KEY]);
            apiKeyEncrypted = result[STORAGE_KEYS.OPENROUTER_API_KEY];
          }
        }
        
        if (elements.apiKey) {
          elements.apiKey.value = apiKeyValue;
          if (apiKeyEncrypted) {
            elements.apiKey.dataset.encrypted = apiKeyEncrypted;
          } else {
            delete elements.apiKey.dataset.encrypted;
          }
          // Reset to password type when switching
          elements.apiKey.type = 'password';
          if (elements.toggleApiKey) {
            elements.toggleApiKey.querySelector('.eye-icon').textContent = '👁';
          }
        }
        
        // Update UI (label, placeholder)
        if (window.settingsModule) {
          await window.settingsModule.updateApiProviderUI();
        }
      });
    }

    if (elements.saveApiKey) {
      elements.saveApiKey.addEventListener('click', () => {
        if (window.settingsModule) {
          window.settingsModule.saveApiKey();
        }
      });
    }

    if (elements.toggleSettings) {
      elements.toggleSettings.addEventListener('click', () => {
        const isOpen = elements.settingsPanel.classList.contains('open');
        
        if (isOpen) {
          elements.settingsPanel.classList.remove('open');
        } else {
          // Opening - close stats if open
          if (elements.statsPanel && elements.statsPanel.classList.contains('open')) {
            elements.statsPanel.classList.remove('open');
          }
          if (elements.settingsPanel) {
            elements.settingsPanel.classList.add('open');
          }
        }
      });
    }

    if (elements.toggleStats) {
      elements.toggleStats.addEventListener('click', async () => {
        const isOpen = elements.statsPanel.classList.contains('open');
        
        if (isOpen) {
          elements.statsPanel.classList.remove('open');
        } else {
          // Opening - close settings if open
          if (elements.settingsPanel.classList.contains('open')) {
            elements.settingsPanel.classList.remove('open');
          }
          
          // Load data BEFORE opening
          await loadAndDisplayStats();
          
          // Then open
          if (elements.statsPanel) {
            elements.statsPanel.classList.add('open');
          }
        }
      });
    }

    if (elements.clearStatsBtn) {
      elements.clearStatsBtn.addEventListener('click', async () => {
        const langCode = await getUILanguage();
        const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
        const clearStatsConfirm = locale.clearAllStatisticsConfirm || UI_LOCALES.en.clearAllStatisticsConfirm;
        if (confirm(clearStatsConfirm)) {
          await chrome.runtime.sendMessage({ action: 'clearStats' });
          await loadAndDisplayStats();
          const locale = await t('statisticsCleared');
          showToast(locale, 'success');
        }
      });
    }

    if (elements.clearCacheBtn) {
      elements.clearCacheBtn.addEventListener('click', async () => {
        const langCode = await getUILanguage();
        const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
        const clearCacheConfirm = locale.clearSelectorCacheConfirm || UI_LOCALES.en.clearSelectorCacheConfirm;
        if (confirm(clearCacheConfirm)) {
          await chrome.runtime.sendMessage({ action: 'clearSelectorCache' });
          await loadAndDisplayStats();
          const locale = await t('cacheCleared');
          showToast(locale, 'success');
        }
      });
    }

    if (elements.exportSettingsBtn) {
      elements.exportSettingsBtn.addEventListener('click', async () => {
        try {
          // Simple confirm dialogs
          const includeStatsText = await t('includeStatisticsInExport');
          const includeCacheText = await t('includeSelectorCacheInExport');
          
          const includeStats = window.confirm(includeStatsText || 'Include statistics in export?');
          const includeCache = window.confirm(includeCacheText || 'Include selector cache in export?');
          
          elements.exportSettingsBtn.disabled = true;
          const exportingText = await t('exporting');
          elements.exportSettingsBtn.textContent = exportingText;
          
          const response = await chrome.runtime.sendMessage({
            action: 'exportSettings',
            includeStats,
            includeCache
          });
          
          if (response.error) {
            throw new Error(response.error);
          }
          
          // Download file
          const blob = new Blob([response.data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = `clipaible-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } finally {
            URL.revokeObjectURL(url);
          }
          
          const settingsExportedText = await t('settingsExportedSuccessfully');
          showToast(settingsExportedText, 'success');
        } catch (error) {
          logError('Export failed', error);
          const exportFailedText = await t('exportFailed');
          showToast(`${exportFailedText}: ${error.message}`, 'error');
        } finally {
          elements.exportSettingsBtn.disabled = false;
          const exportSettingsText = await t('exportSettings');
          elements.exportSettingsBtn.textContent = exportSettingsText;
        }
      });
    }

    if (elements.importSettingsBtn && elements.importFileInput) {
      elements.importSettingsBtn.addEventListener('click', () => {
        elements.importFileInput.click();
      });

      elements.importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
          
          // Parse to check if valid
          const data = JSON.parse(text);
          if (!data.settings) {
            throw new Error('Invalid export file');
          }
          
          // Simple confirm dialogs
          const importStatsText = await t('includeStatisticsInImport');
          const importCacheText = await t('includeSelectorCacheInImport');
          const overwriteText = await t('overwriteExistingSettings');
          
          const importStats = data.statistics && window.confirm(importStatsText || 'Import statistics (if present)?');
          const importCache = data.selectorCache && window.confirm(importCacheText || 'Import selector cache (if present)?');
          const overwriteExisting = window.confirm(overwriteText || 'Overwrite existing settings?');
          
          elements.importSettingsBtn.disabled = true;
          const importingText = await t('importing');
          elements.importSettingsBtn.textContent = importingText;
          
          const response = await chrome.runtime.sendMessage({
            action: 'importSettings',
            jsonData: text,
            options: {
              importStats,
              importCache,
              overwriteExisting
            }
          });
          
          if (response.error) {
            throw new Error(response.error);
          }
          
          const result = response.result;
          let message = `Imported ${result.settingsImported} settings`;
          if (result.settingsSkipped > 0) {
            message += `, ${result.settingsSkipped} skipped`;
          }
          if (result.statsImported) message += ', statistics';
          if (result.cacheImported) message += ', cache';
          
          showToast(message, 'success');
          
          // Reload settings and stats
          if (window.settingsModule && window.settingsModule.loadSettings) {
            await window.settingsModule.loadSettings();
          }
          await loadAndDisplayStats();
          
          // Update model list if custom_models or hidden_models were imported
          if (result.settingsImported > 0) {
            if (window.settingsModule) {
              await window.settingsModule.updateModelList();
            }
          }
          
          // Reload page to apply settings
          if (result.settingsImported > 0) {
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
          
        } catch (error) {
          logError('Import failed', error);
          const importFailedText = await t('importFailed');
          showToast(`${importFailedText}: ${error.message}`, 'error');
        } finally {
          elements.importSettingsBtn.disabled = false;
          const importSettingsText = await t('importSettings');
          elements.importSettingsBtn.textContent = importSettingsText;
          elements.importFileInput.value = ''; // Reset input
        }
      });
    }

    if (elements.modelSelect) {
      elements.modelSelect.addEventListener('change', async () => {
        const selectedModel = elements.modelSelect.value;
        const provider = elements.apiProviderSelect?.value || 'openai';
        
        // Save to general model key (for backward compatibility)
        debouncedSaveSettings(STORAGE_KEYS.MODEL, selectedModel);
        
        // Save to provider-specific storage
        const storageResult = await chrome.storage.local.get([STORAGE_KEYS.MODEL_BY_PROVIDER]);
        const modelsByProvider = storageResult[STORAGE_KEYS.MODEL_BY_PROVIDER] || {};
        await chrome.storage.local.set({
          [STORAGE_KEYS.MODEL_BY_PROVIDER]: {
            ...modelsByProvider,
            [provider]: selectedModel
          }
        });
      });
    }

    // Add model button handler
    if (elements.addModelBtn) {
      elements.addModelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.settingsModule) {
          await window.settingsModule.showAddModelDialog();
        }
      });
    }

    // Show custom dropdown on model select click
    // Track when dropdown was opened to prevent race condition
    let dropdownOpenTime = 0;
    
    if (elements.modelSelect) {
      // Use mousedown to intercept before native dropdown opens
      elements.modelSelect.addEventListener('mousedown', async (e) => {
        const isVisible = elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none';
        
        if (isVisible) {
          // If dropdown is visible, close it without opening native dropdown
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          elements.customModelDropdown.style.display = 'none';
        } else {
          // If dropdown is not visible, prevent native dropdown and show custom one
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          dropdownOpenTime = Date.now();
          if (window.settingsModule) {
            await window.settingsModule.showCustomModelDropdown();
          }
        }
      }, true); // Use capture phase

      // Model select change handler - update custom dropdown if visible
      elements.modelSelect.addEventListener('change', async () => {
        // Update custom dropdown if it's visible (for when user uses keyboard navigation)
        if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
          if (window.settingsModule) {
            await window.settingsModule.showCustomModelDropdown();
          }
        }
      });
    }

    // Close custom dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdownDisplay = elements.customModelDropdown?.style.display;
      const now = Date.now();
      const timeSinceOpen = now - dropdownOpenTime;
      
      if (!elements.customModelDropdown || dropdownDisplay === 'none') {
        return;
      }
      
      // Don't close if dropdown was just opened (within 150ms) - prevents race condition
      if (timeSinceOpen < 150) {
        return;
      }
      
      // Don't close if click is inside dropdown, on select, or on add button
      if (elements.customModelDropdown.contains(e.target) ||
          (elements.modelSelect && elements.modelSelect.contains(e.target)) ||
          (elements.addModelBtn && elements.addModelBtn.contains(e.target))) {
        return;
      }
      
      // Close dropdown
      elements.customModelDropdown.style.display = 'none';
    });

    if (elements.modeSelect) {
      elements.modeSelect.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.MODE, elements.modeSelect.value, async () => {
          if (window.settingsModule) {
            await window.settingsModule.updateModeHint();
            window.settingsModule.updateCacheVisibility();
          }
        });
      });
    }

    if (elements.useCache) {
      elements.useCache.addEventListener('change', async () => {
        const value = elements.useCache.checked;
        // Save immediately (not debounced) to ensure it's preserved
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.USE_CACHE]: value });
        } catch (error) {
          logError('Failed to save use_selector_cache setting', error);
        }
      });
    }
    
    // Handle enableCache checkbox in stats section - INDEPENDENT setting, does NOT affect useCache
    if (elements.enableCache) {
      elements.enableCache.addEventListener('change', async () => {
        const value = elements.enableCache.checked;
        // Save immediately (not debounced) to ensure it's preserved
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_CACHE]: value });
        } catch (error) {
          logError('Failed to save enable_selector_caching setting', error);
        }
      });
    }
    
    // Handle enableStats checkbox in stats section
    if (elements.enableStats) {
      elements.enableStats.addEventListener('change', async () => {
        const value = elements.enableStats.checked;
        // Save immediately (not debounced) to ensure it's preserved
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_STATS]: value });
        } catch (error) {
          logError('Failed to save enable_statistics setting', error);
        }
      });
    }
    
    /**
     * Event listener for output format change
     * When format changes, update UI visibility and save setting
     */
    if (elements.outputFormat) {
      elements.outputFormat.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, elements.outputFormat.value, async () => {
          // Sync main format select
          if (elements.mainFormatSelect) {
            elements.mainFormatSelect.value = elements.outputFormat.value;
          }
          // updateOutputFormatUI() handles all UI visibility updates based on format
          // It calls updateAudioProviderUI() and updateTranslationVisibility() internally
          if (window.settingsModule) {
            await window.settingsModule.updateOutputFormatUI();
          }
        });
      });
    }
    
    // Sync main format select with settings format
    if (elements.mainFormatSelect) {
      elements.mainFormatSelect.addEventListener('change', () => {
        elements.outputFormat.value = elements.mainFormatSelect.value;
        debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, elements.mainFormatSelect.value, async () => {
          if (window.settingsModule) {
            await window.settingsModule.updateOutputFormatUI();
          }
        });
      });
    }

    if (elements.generateToc) {
      elements.generateToc.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.GENERATE_TOC, elements.generateToc.checked);
      });
    }
    
    if (elements.generateAbstract) {
      elements.generateAbstract.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.GENERATE_ABSTRACT, elements.generateAbstract.checked);
      });
    }

    if (elements.pageMode) {
      elements.pageMode.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.PAGE_MODE, elements.pageMode.value);
      });
    }

    if (elements.languageSelect) {
      elements.languageSelect.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.LANGUAGE, elements.languageSelect.value, async () => {
          if (window.settingsModule) {
            await window.settingsModule.updateTranslationVisibility();
          }
        });
      });
    }

    if (elements.translateImages) {
      elements.translateImages.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.TRANSLATE_IMAGES, elements.translateImages.checked, async () => {
          if (window.settingsModule) {
            await window.settingsModule.updateTranslationVisibility();
          }
        });
      });
    }
    
    // Style preset handler
    if (elements.stylePreset) {
      elements.stylePreset.addEventListener('change', async () => {
        const preset = elements.stylePreset.value;
        
        // Save preset immediately (no debounce) to ensure it's saved
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: preset });
        } catch (error) {
          logError('Failed to save style preset', error);
        }
        
        if (preset !== 'custom' && STYLE_PRESETS[preset]) {
          // Apply preset colors immediately (UI update)
          const colors = STYLE_PRESETS[preset];
          
          elements.bgColor.value = colors.bgColor;
          elements.bgColorText.value = colors.bgColor;
          elements.textColor.value = colors.textColor;
          elements.textColorText.value = colors.textColor;
          elements.headingColor.value = colors.headingColor;
          elements.headingColorText.value = colors.headingColor;
          elements.linkColor.value = colors.linkColor;
          elements.linkColorText.value = colors.linkColor;
          
          // Save all colors immediately (no debounce) to ensure they're saved
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

    // Custom font family dropdown
    if (elements.fontFamilyTrigger) {
      elements.fontFamilyTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = elements.fontFamilyContainer.classList.contains('open');
        
        // Close all other custom selects
        document.querySelectorAll('.custom-select.open').forEach(otherSelect => {
          if (otherSelect !== elements.fontFamilyContainer) {
            otherSelect.classList.remove('open');
          }
        });
        
        // Close model dropdown if open
        if (elements.customModelDropdown && elements.customModelDropdown.style.display !== 'none') {
          elements.customModelDropdown.style.display = 'none';
        }
        
        // Toggle current select
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
        
        // Update hidden input
        elements.fontFamily.value = value;
        
        // Update display with same font style
        elements.fontFamilyValue.textContent = text;
        elements.fontFamilyValue.style.fontFamily = fontStyle;
        
        // Update selected state
        elements.fontFamilyOptions.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Close dropdown
        elements.fontFamilyContainer.classList.remove('open');
        
        // Save setting
        debouncedSaveSettings(STORAGE_KEYS.FONT_FAMILY, value);
      });
    }

    // Close dropdown when clicking outside
    // Global click handler to close all custom selects when clicking outside
    // (This is added once, not per select)
    if (!window.customSelectClickHandlerAdded) {
      document.addEventListener('click', (e) => {
        // Close all custom selects if click is outside
        document.querySelectorAll('.custom-select.open').forEach(select => {
          if (!select.contains(e.target)) {
            select.classList.remove('open');
          }
        });
        
        // Also close font family dropdown if open
        if (elements.fontFamilyContainer && !elements.fontFamilyContainer.contains(e.target)) {
          elements.fontFamilyContainer.classList.remove('open');
        }
        
        // Also close model dropdown if open and click is outside
        if (elements.customModelDropdown && 
            elements.customModelDropdown.style.display !== 'none' &&
            !elements.customModelDropdown.contains(e.target) &&
            !(elements.modelSelect && elements.modelSelect.contains(e.target)) &&
            !(elements.addModelBtn && elements.addModelBtn.contains(e.target))) {
          elements.customModelDropdown.style.display = 'none';
        }
      });
      window.customSelectClickHandlerAdded = true;
    }

    if (elements.fontSize) {
      elements.fontSize.addEventListener('change', () => {
        const size = parseInt(elements.fontSize.value) || 31;
        elements.fontSize.value = size;
        debouncedSaveSettings(STORAGE_KEYS.FONT_SIZE, String(size));
      });
    }

    // Color handlers - sync picker and text input
    // Helper to switch to custom preset when colors are changed manually
    function setPresetToCustom() {
      if (elements.stylePreset && elements.stylePreset.value !== 'custom') {
        elements.stylePreset.value = 'custom';
        chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: 'custom' });
      }
    }

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
      btn.addEventListener('click', async () => {
        const resetType = btn.dataset.reset;
        if (window.settingsModule) {
          await window.settingsModule.resetStyleSetting(resetType);
        }
      });
    });

    // Reset all styles
    if (elements.resetStylesBtn) {
      elements.resetStylesBtn.addEventListener('click', async () => {
        if (window.settingsModule) {
          await window.settingsModule.resetAllStyles();
        }
      });
    }

    if (elements.savePdfBtn) {
      elements.savePdfBtn.addEventListener('click', handleSavePdf);
    }
    if (elements.cancelBtn) {
      elements.cancelBtn.addEventListener('click', handleCancel);
    }
    
    // Summary handlers
    if (elements.generateSummaryBtn) {
      elements.generateSummaryBtn.addEventListener('click', handleGenerateSummary);
    }
    if (elements.summaryToggle) {
      elements.summaryToggle.addEventListener('click', toggleSummary);
    }
    if (elements.summaryCopyBtn) {
      elements.summaryCopyBtn.addEventListener('click', copySummary);
    }
    if (elements.summaryDownloadBtn) {
      elements.summaryDownloadBtn.addEventListener('click', downloadSummary);
    }
    if (elements.summaryCloseBtn) {
      elements.summaryCloseBtn.addEventListener('click', closeSummary);
    }
    
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
        // Reload settings to update all UI text
        if (window.settingsModule && window.settingsModule.loadSettings) {
          await window.settingsModule.loadSettings();
        }
        // Update custom selects after localization
        initAllCustomSelects();
      });
    }
    
    // Audio settings handlers
    if (elements.elevenlabsModel) {
      elements.elevenlabsModel.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_MODEL, elements.elevenlabsModel.value);
      });
    }
    
    if (elements.elevenlabsFormat) {
      elements.elevenlabsFormat.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_FORMAT, elements.elevenlabsFormat.value);
      });
    }
    
    if (elements.audioVoice) {
      elements.audioVoice.addEventListener('change', () => {
        const provider = elements.audioProvider?.value || 'openai';
        if (window.settingsModule) {
          window.settingsModule.saveAudioVoice(provider, elements.audioVoice.value);
        }
      });
    }
    
    if (elements.audioSpeed) {
      elements.audioSpeed.addEventListener('input', () => {
        const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
        if (elements.audioSpeedValue) {
          elements.audioSpeedValue.textContent = speed + 'x';
        }
      });
      
      elements.audioSpeed.addEventListener('change', () => {
        const speed = parseFloat(elements.audioSpeed.value).toFixed(1);
        debouncedSaveSettings(STORAGE_KEYS.AUDIO_SPEED, speed);
      });
    }
    
    // ElevenLabs advanced settings
    if (elements.elevenlabsStability) {
      elements.elevenlabsStability.addEventListener('input', () => {
        const value = parseFloat(elements.elevenlabsStability.value);
        if (elements.elevenlabsStabilityValue) {
          elements.elevenlabsStabilityValue.textContent = value.toFixed(1);
        }
      });
      
      elements.elevenlabsStability.addEventListener('change', () => {
        const value = parseFloat(elements.elevenlabsStability.value);
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STABILITY, value);
      });
    }
    
    if (elements.elevenlabsSimilarity) {
      elements.elevenlabsSimilarity.addEventListener('input', () => {
        const value = parseFloat(elements.elevenlabsSimilarity.value);
        if (elements.elevenlabsSimilarityValue) {
          elements.elevenlabsSimilarityValue.textContent = value.toFixed(1);
        }
      });
      
      elements.elevenlabsSimilarity.addEventListener('change', () => {
        const value = parseFloat(elements.elevenlabsSimilarity.value);
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SIMILARITY, value);
      });
    }
    
    if (elements.elevenlabsStyle) {
      elements.elevenlabsStyle.addEventListener('input', () => {
        const value = parseFloat(elements.elevenlabsStyle.value);
        if (elements.elevenlabsStyleValue) {
          elements.elevenlabsStyleValue.textContent = value.toFixed(1);
        }
      });
      
      elements.elevenlabsStyle.addEventListener('change', () => {
        const value = parseFloat(elements.elevenlabsStyle.value);
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_STYLE, value);
      });
    }
    
    if (elements.elevenlabsSpeakerBoost) {
      elements.elevenlabsSpeakerBoost.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.ELEVENLABS_SPEAKER_BOOST, elements.elevenlabsSpeakerBoost.checked);
      });
    }
    
    // OpenAI instructions
    if (elements.openaiInstructions) {
      elements.openaiInstructions.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.OPENAI_INSTRUCTIONS, elements.openaiInstructions.value.trim());
      });
    }
    
    // Audio provider handler
    if (elements.audioProvider) {
      /**
       * Event listener for audio provider change
       * When provider changes, update voice list and provider-specific UI visibility
       */
      elements.audioProvider.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.AUDIO_PROVIDER, elements.audioProvider.value, () => {
          if (window.settingsModule) {
            // Update voice list first (populates dropdown with provider-specific voices)
            window.settingsModule.updateVoiceList(elements.audioProvider.value);
            // Then update UI visibility (shows/hides provider-specific fields)
            window.settingsModule.updateAudioProviderUI();
          }
        });
      });
    }
    
    if (elements.googleTtsModel) {
      elements.googleTtsModel.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_MODEL, elements.googleTtsModel.value);
      });
    }
    
    if (elements.googleTtsVoice) {
      elements.googleTtsVoice.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_VOICE, elements.googleTtsVoice.value);
      });
    }
    
    if (elements.googleTtsPrompt) {
      elements.googleTtsPrompt.addEventListener('change', () => {
        debouncedSaveSettings(STORAGE_KEYS.GOOGLE_TTS_PROMPT, elements.googleTtsPrompt.value.trim());
      });
    }
    
    // Respeecher advanced settings
    if (elements.respeecherTemperature) {
      elements.respeecherTemperature.addEventListener('input', () => {
        const value = parseFloat(elements.respeecherTemperature.value).toFixed(1);
        if (elements.respeecherTemperatureValue) {
          elements.respeecherTemperatureValue.textContent = value;
        }
      });
      
      elements.respeecherTemperature.addEventListener('change', () => {
        const value = parseFloat(elements.respeecherTemperature.value);
        debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TEMPERATURE, value);
      });
    }
    
    if (elements.respeecherRepetitionPenalty) {
      elements.respeecherRepetitionPenalty.addEventListener('input', () => {
        const value = parseFloat(elements.respeecherRepetitionPenalty.value).toFixed(1);
        if (elements.respeecherRepetitionPenaltyValue) {
          elements.respeecherRepetitionPenaltyValue.textContent = value;
        }
      });
      
      elements.respeecherRepetitionPenalty.addEventListener('change', () => {
        const value = parseFloat(elements.respeecherRepetitionPenalty.value);
        debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_REPETITION_PENALTY, value);
      });
    }
    
    if (elements.respeecherTopP) {
      elements.respeecherTopP.addEventListener('input', () => {
        const value = parseFloat(elements.respeecherTopP.value).toFixed(2);
        if (elements.respeecherTopPValue) {
          elements.respeecherTopPValue.textContent = value;
        }
      });
      
      elements.respeecherTopP.addEventListener('change', () => {
        const value = parseFloat(elements.respeecherTopP.value);
        debouncedSaveSettings(STORAGE_KEYS.RESPEECHER_TOP_P, value);
      });
    }
    
    // ElevenLabs API key handlers
    if (elements.toggleElevenlabsApiKey) {
      elements.toggleElevenlabsApiKey.addEventListener('click', async () => {
        const input = elements.elevenlabsApiKey;
        const isPassword = input.type === 'password';
        const eyeIcon = elements.toggleElevenlabsApiKey.querySelector('.eye-icon');
        
        if (isPassword) {
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt ElevenLabs API key', error);
              const errorMsg = await t('errorDecryptFailed');
              showToast(errorMsg, 'error');
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          if (eyeIcon) eyeIcon.textContent = '🔒';
        } else {
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else {
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          if (eyeIcon) eyeIcon.textContent = '👁';
        }
      });
    }
    
    if (elements.saveElevenlabsApiKey) {
      elements.saveElevenlabsApiKey.addEventListener('click', async () => {
        const key = elements.elevenlabsApiKey.value.trim();
        if (!key) {
          const pleaseEnterKeyText = await t('pleaseEnterElevenlabsApiKey');
          showToast(pleaseEnterKeyText, 'error');
          return;
        }
        
        // Skip if key is masked (already saved) - silently return
        if (key.startsWith('****') || key.startsWith('••••')) {
          return;
        }
        
        // Validate API key is ASCII only (required for HTTP headers)
        if (!/^[\x20-\x7E]+$/.test(key)) {
          const invalidKeyText = await t('invalidKeyFormat');
          showToast(invalidKeyText, 'error');
          return;
        }
        
        // Validate key looks like ElevenLabs format (typically starts with sk_ or is alphanumeric)
        if (key.length < 10) {
          const keyTooShortText = await t('keyTooShort');
          showToast(keyTooShortText, 'error');
          return;
        }
        
        try {
          const encrypted = await encryptApiKey(key);
          await chrome.storage.local.set({ [STORAGE_KEYS.ELEVENLABS_API_KEY]: encrypted });
          elements.elevenlabsApiKey.value = maskApiKey(key);
          elements.elevenlabsApiKey.type = 'password';
          elements.elevenlabsApiKey.dataset.encrypted = encrypted;
          if (elements.toggleElevenlabsApiKey) {
            elements.toggleElevenlabsApiKey.querySelector('.eye-icon').textContent = '👁';
          }
          const elevenlabsKeySavedText = await t('elevenlabsKeySaved');
          showToast(elevenlabsKeySavedText, 'success');
        } catch (error) {
          logError('Failed to save ElevenLabs API key', error);
          const failedToSaveText = await t('failedToSave');
          showToast(failedToSaveText, 'error');
        }
      });
    }
    
    // Qwen API key handlers
    if (elements.toggleQwenApiKey) {
      elements.toggleQwenApiKey.addEventListener('click', async () => {
        const input = elements.qwenApiKey;
        const isPassword = input.type === 'password';
        const eyeIcon = elements.toggleQwenApiKey.querySelector('.eye-icon');
        
        if (isPassword) {
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt Qwen API key', error);
              const errorMsg = await t('errorDecryptFailed');
              showToast(errorMsg, 'error');
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          if (eyeIcon) eyeIcon.textContent = '🔒';
        } else {
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else {
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          if (eyeIcon) eyeIcon.textContent = '👁';
        }
      });
    }
    
    if (elements.saveQwenApiKey) {
      elements.saveQwenApiKey.addEventListener('click', async () => {
        const key = elements.qwenApiKey.value.trim();
        if (!key) {
          const pleaseEnterKeyText = await t('pleaseEnterQwenApiKey');
          showToast(pleaseEnterKeyText, 'error');
          return;
        }
        
        // Skip if key is masked (already saved) - silently return
        if (key.startsWith('****') || key.startsWith('••••')) {
          return;
        }
        
        // Validate API key is ASCII only (required for HTTP headers)
        if (!/^[\x20-\x7E]+$/.test(key)) {
          const invalidKeyText = await t('invalidKeyFormat');
          showToast(invalidKeyText, 'error');
          return;
        }
        
        // Validate key looks like Qwen format (typically alphanumeric, at least 10 chars)
        if (key.length < 10) {
          const keyTooShortText = await t('keyTooShort');
          showToast(keyTooShortText, 'error');
          return;
        }
        
        try {
          const encrypted = await encryptApiKey(key);
          await chrome.storage.local.set({ [STORAGE_KEYS.QWEN_API_KEY]: encrypted });
          elements.qwenApiKey.value = maskApiKey(key);
          elements.qwenApiKey.type = 'password';
          elements.qwenApiKey.dataset.encrypted = encrypted;
          if (elements.toggleQwenApiKey) {
            elements.toggleQwenApiKey.querySelector('.eye-icon').textContent = '👁';
          }
          const qwenKeySavedText = await t('qwenKeySaved');
          showToast(qwenKeySavedText, 'success');
        } catch (error) {
          logError('Failed to save Qwen API key', error);
          const failedToSaveText = await t('failedToSave');
          showToast(failedToSaveText, 'error');
        }
      });
    }
    
    // Respeecher API key handlers
    if (elements.toggleRespeecherApiKey) {
      elements.toggleRespeecherApiKey.addEventListener('click', async () => {
        const input = elements.respeecherApiKey;
        const isPassword = input.type === 'password';
        const eyeIcon = elements.toggleRespeecherApiKey.querySelector('.eye-icon');
        
        if (isPassword) {
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt Respeecher API key', error);
              const errorMsg = await t('errorDecryptFailed');
              showToast(errorMsg, 'error');
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          if (eyeIcon) eyeIcon.textContent = '🔒';
        } else {
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else {
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          if (eyeIcon) eyeIcon.textContent = '👁';
        }
      });
    }
    
    if (elements.saveRespeecherApiKey) {
      elements.saveRespeecherApiKey.addEventListener('click', async () => {
        const key = elements.respeecherApiKey.value.trim();
        if (!key) {
          const pleaseEnterKeyText = await t('pleaseEnterRespecherApiKey');
          showToast(pleaseEnterKeyText, 'error');
          return;
        }
        
        // Skip if key is masked (already saved) - silently return
        if (key.startsWith('****') || key.startsWith('••••')) {
          return;
        }
        
        // Validate API key is ASCII only (required for HTTP headers)
        if (!/^[\x20-\x7E]+$/.test(key)) {
          const invalidKeyText = await t('invalidKeyFormat');
          showToast(invalidKeyText, 'error');
          return;
        }
        
        // Validate key length
        if (key.length < 10) {
          const keyTooShortText = await t('keyTooShort');
          showToast(keyTooShortText, 'error');
          return;
        }
        
        try {
          const encrypted = await encryptApiKey(key);
          await chrome.storage.local.set({ [STORAGE_KEYS.RESPEECHER_API_KEY]: encrypted });
          elements.respeecherApiKey.value = maskApiKey(key);
          elements.respeecherApiKey.type = 'password';
          elements.respeecherApiKey.dataset.encrypted = encrypted;
          if (elements.toggleRespeecherApiKey) {
            elements.toggleRespeecherApiKey.querySelector('.eye-icon').textContent = '👁';
          }
          const respeecherKeySavedText = await t('respeecherKeySaved');
          showToast(respeecherKeySavedText, 'success');
        } catch (error) {
          logError('Failed to save Respeecher API key', error);
          const failedToSaveText = await t('failedToSave');
          showToast(failedToSaveText, 'error');
        }
      });
    }
    
    // Google TTS API key handlers
    if (elements.toggleGoogleTtsApiKey) {
      elements.toggleGoogleTtsApiKey.addEventListener('click', async () => {
        const input = elements.googleTtsApiKey;
        const isPassword = input.type === 'password';
        const eyeIcon = elements.toggleGoogleTtsApiKey.querySelector('.eye-icon');
        
        if (isPassword) {
          if (input.dataset.encrypted) {
            try {
              const decrypted = await decryptApiKey(input.dataset.encrypted);
              input.value = decrypted;
              input.dataset.decrypted = decrypted;
            } catch (error) {
              logError('Failed to decrypt Google TTS API key', error);
              const errorMsg = await t('errorDecryptFailed');
              showToast(errorMsg, 'error');
              if (!input.value.startsWith('****')) {
                input.dataset.decrypted = input.value;
              }
            }
          } else if (input.value && !input.value.startsWith('****')) {
            input.dataset.decrypted = input.value;
          }
          input.type = 'text';
          if (eyeIcon) eyeIcon.textContent = '🔒';
        } else {
          if (input.dataset.decrypted) {
            input.value = maskApiKey(input.dataset.decrypted);
          } else {
            input.value = maskApiKey(input.value);
          }
          input.type = 'password';
          if (eyeIcon) eyeIcon.textContent = '👁';
        }
      });
    }
    
    if (elements.saveGoogleTtsApiKey) {
      elements.saveGoogleTtsApiKey.addEventListener('click', async () => {
        const key = elements.googleTtsApiKey.value.trim();
        if (!key) {
          const pleaseEnterKeyText = await t('pleaseEnterGoogleTtsApiKey');
          showToast(pleaseEnterKeyText, 'error');
          return;
        }
        
        // Skip if key is masked (already saved) - silently return
        if (key.startsWith('****') || key.startsWith('••••')) {
          return;
        }
        
        // Validate API key format (Google API keys start with AIza)
        if (!key.startsWith('AIza')) {
          const invalidKeyText = await t('invalidGoogleTtsKeyFormat');
          showToast(invalidKeyText, 'error');
          return;
        }
        
        // Validate API key is ASCII only
        if (!/^[\x20-\x7E]+$/.test(key)) {
          const invalidKeyText = await t('invalidKeyFormat');
          showToast(invalidKeyText, 'error');
          return;
        }
        
        // Validate key length
        if (key.length < 20) {
          const keyTooShortText = await t('keyTooShort');
          showToast(keyTooShortText, 'error');
          return;
        }
        
        try {
          const encrypted = await encryptApiKey(key);
          await chrome.storage.local.set({ [STORAGE_KEYS.GOOGLE_TTS_API_KEY]: encrypted });
          elements.googleTtsApiKey.value = maskApiKey(key);
          elements.googleTtsApiKey.type = 'password';
          elements.googleTtsApiKey.dataset.encrypted = encrypted;
          if (elements.toggleGoogleTtsApiKey) {
            elements.toggleGoogleTtsApiKey.querySelector('.eye-icon').textContent = '👁';
          }
          const googleTtsKeySavedText = await t('googleTtsKeySaved');
          showToast(googleTtsKeySavedText, 'success');
        } catch (error) {
          logError('Failed to save Google TTS API key', error);
          const failedToSaveText = await t('failedToSave');
          showToast(failedToSaveText, 'error');
        }
      });
    }
  }

  return {
    setupEventListeners
  };
}

