// @ts-check
// Panel handlers (settings, stats, import/export)

/**
 * Setup panel toggle and action handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.showToast - Show toast function
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.getUILanguage - Get UI language function
 * @param {Object} deps.UI_LOCALES - UI locales object
 * @param {Function} deps.loadAndDisplayStats - Load and display stats function
 * @param {Function} deps.deferAsyncWork - Defer async work function
 * @param {Object} [deps.settingsModule] - Settings module
 */
export function setupPanelHandlers(deps) {
  const {
    elements,
    log,
    logError,
    logWarn,
    showToast,
    t,
    getUILanguage,
    UI_LOCALES,
    loadAndDisplayStats,
    deferAsyncWork,
    settingsModule
  } = deps;

  const scheduler = typeof self !== 'undefined' && 'scheduler' in self ? self.scheduler : undefined;

  // Settings panel toggle
  if (elements.toggleSettings) {
    elements.toggleSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const isOpen = elements.settingsPanel.classList.contains('open');
      
      const scheduleUpdate = (fn) => {
        if (scheduler && scheduler.postTask) {
          scheduler.postTask(fn, { priority: 'user-blocking' });
        } else {
          setTimeout(fn, 0);
        }
      };
      
      scheduleUpdate(() => {
        requestAnimationFrame(() => {
          if (isOpen) {
            requestAnimationFrame(() => {
              elements.settingsPanel.classList.remove('open');
            });
          } else {
            requestAnimationFrame(() => {
              if (elements.statsPanel && elements.statsPanel.classList.contains('open')) {
                elements.statsPanel.classList.remove('open');
              }
              if (elements.settingsPanel) {
                elements.settingsPanel.classList.add('open');
              }
            });
          }
        });
      });
    }, { passive: true });
  }

  // Stats panel toggle
  if (elements.toggleStats) {
    elements.toggleStats.addEventListener('click', (e) => {
      e.stopPropagation();
      
      requestAnimationFrame(() => {
        deferAsyncWork(() => {
          const isOpen = elements.statsPanel.classList.contains('open');
          
          if (isOpen) {
            requestAnimationFrame(() => {
              elements.statsPanel.classList.remove('open');
            });
          } else {
            requestAnimationFrame(() => {
              if (elements.settingsPanel.classList.contains('open')) {
                elements.settingsPanel.classList.remove('open');
              }
            });
            
            requestAnimationFrame(() => {
              if (elements.statsPanel) {
                elements.statsPanel.classList.add('open');
              }
            });
            
            setTimeout(() => {
              loadAndDisplayStats().catch((error) => {
                logError('Failed to load stats', error);
              });
            }, 100);
          }
        }, 0);
      });
    }, { passive: true });
  }

  // Clear stats button
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

  // Clear cache button
  if (elements.clearCacheBtn) {
    elements.clearCacheBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      requestAnimationFrame(() => {
        deferAsyncWork(async () => {
          const langCode = await getUILanguage();
          const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
          const clearCacheConfirm = locale.clearSelectorCacheConfirm || UI_LOCALES.en.clearSelectorCacheConfirm;
          if (confirm(clearCacheConfirm)) {
            deferAsyncWork(async () => {
              await chrome.runtime.sendMessage({ action: 'clearSelectorCache' });
              await loadAndDisplayStats();
              const locale = await t('cacheCleared');
              showToast(locale, 'success');
            });
          }
        });
      });
    }, { passive: true });
  }

  // Export settings button
  if (elements.exportSettingsBtn) {
    elements.exportSettingsBtn.addEventListener('click', async () => {
      try {
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

  // Import settings button
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
        
        const data = JSON.parse(text);
        if (!data.settings) {
          throw new Error('Invalid export file');
        }
        
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
        
        if (result.warnings && result.warnings.length > 0) {
          const warningsText = result.warnings.join('; ');
          logWarn('Import warnings', { warnings: result.warnings });
          showToast(`${message}. Warnings: ${warningsText}`, 'warning');
        } else {
          showToast(message, 'success');
        }
        
        if (result.errors && result.errors.length > 0) {
          const errorsText = result.errors.join('; ');
          logError('Import errors', { errors: result.errors });
          showToast(`Import completed with errors: ${errorsText}`, 'error');
        }
        
        if (settingsModule && settingsModule.loadSettings) {
          await settingsModule.loadSettings();
        }
        await loadAndDisplayStats();
        
        if (result.settingsImported > 0) {
          if (settingsModule) {
            await settingsModule.updateModelList();
          }
        }
        
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
        elements.importFileInput.value = '';
      }
    });
  }
}

