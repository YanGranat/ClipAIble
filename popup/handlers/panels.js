// @ts-check
// Panel handlers (settings, stats, import/export)
import { formatMessage } from '../../scripts/locales.js';
import { mutateStatistics } from '../stats.js';
import { activateModalDialog } from '../utils/dom-helpers.js';

/** @returns {Promise<{includeStats: boolean, includeCache: boolean, overwriteExisting: boolean, dataMode: 'add' | 'replace'}|null>} */
function reviewSettingsTransfer(mode, origin, language, onAbort, available = { statistics: true, cache: true }) {
  const modal = document.getElementById('settingsTransferModal');
  const form = document.getElementById('settingsTransferForm');
  const cancel = document.getElementById('settingsTransferCancel');
  const confirmButton = document.getElementById('settingsTransferConfirm');
  const title = document.getElementById('settingsTransferTitle');
  const statistics = document.getElementById('settingsTransferStatistics');
  const cache = document.getElementById('settingsTransferCache');
  const overwrite = document.getElementById('settingsTransferOverwrite');
  const dataModeGroup = document.getElementById('settingsTransferDataMode');
  const dataHint = document.getElementById('settingsTransferDataHint');
  const add = document.getElementById('settingsTransferAdd');
  const replace = document.getElementById('settingsTransferReplace');
  if (!modal || !form || !cancel || !confirmButton || !title || !dataHint ||
      !(dataModeGroup instanceof HTMLFieldSetElement) || !(add instanceof HTMLInputElement) || !(replace instanceof HTMLInputElement) ||
      !(statistics instanceof HTMLInputElement) || !(cache instanceof HTMLInputElement) ||
      !(overwrite instanceof HTMLInputElement)) return Promise.resolve(null);
  const isImport = mode === 'import';
  const bind = (element, key) => {
    element.dataset.i18n = key;
    element.textContent = formatMessage(key, language);
  };
  const toggleOption = (input, shown, key) => {
    input.checked = false;
    input.disabled = !shown;
    input.closest('label').classList.toggle('hidden', !shown);
    bind(input.nextElementSibling, key);
  };
  const action = isImport ? 'importSettings' : 'exportSettings';
  bind(title, action);
  bind(cancel, 'cancel');
  toggleOption(statistics, available.statistics, isImport ? 'includeStatisticsInImport' : 'includeStatisticsInExport');
  toggleOption(cache, available.cache, isImport ? 'includeSelectorCacheInImport' : 'includeSelectorCacheInExport');
  toggleOption(overwrite, isImport, 'overwriteExistingSettings');
  add.checked = true;
  bind(dataModeGroup.querySelector('legend'), 'backupDataMode');
  bind(add.nextElementSibling, 'backupDataAdd');
  bind(replace.nextElementSibling, 'backupDataReplace');

  const selected = input => !input.disabled && input.checked;
  const syncDataMode = () => {
    const active = isImport && (selected(statistics) || selected(cache));
    dataModeGroup.disabled = !active;
    dataModeGroup.classList.toggle('hidden', !active);
    if (!active) add.checked = true;
    const replacing = active && replace.checked;
    bind(confirmButton, replacing ? 'backupReplaceConfirm' : active ? 'backupImportConfirm' : action);
    const section = selected(statistics) && selected(cache) ? 'Both' : selected(statistics) ? 'Stats' : 'Cache';
    bind(dataHint, replacing ? 'backupDataReplaceHint' : `backupDataAdd${section}Hint`);
  };
  syncDataMode();

  return new Promise(resolve => {
    origin.focus({ preventScroll: true });
    let releaseFocus = () => {};
    const finish = choices => {
      modal.classList.add('hidden');
      cancel.removeEventListener('click', onCancel);
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('change', syncDataMode);
      modal.removeEventListener('click', onOverlayClick);
      releaseFocus();
      if (!choices) onAbort();
      resolve(choices);
    };
    const onCancel = () => finish(null);
    const onOverlayClick = event => { if (event.target === modal) onCancel(); };
    const onSubmit = event => {
      event.preventDefault();
      finish({
        includeStats: selected(statistics),
        includeCache: selected(cache),
        overwriteExisting: selected(overwrite),
        dataMode: isImport && (selected(statistics) || selected(cache)) && replace.checked ? 'replace' : 'add'
      });
    };
    cancel.addEventListener('click', onCancel);
    form.addEventListener('submit', onSubmit);
    form.addEventListener('change', syncDataMode);
    modal.addEventListener('click', onOverlayClick);
    modal.classList.remove('hidden');
    releaseFocus = activateModalDialog(modal, onCancel, cancel);
  });
}

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
  let transferOwner = null;
  function releaseTransfer(owner, fileInput) {
    if (transferOwner !== owner) return;
    if (fileInput) fileInput.value = '';
    transferOwner = null;
  }

  for (const [button, panel] of [[elements.toggleSettings, elements.settingsPanel], [elements.toggleStats, elements.statsPanel]]) {
    if (!button || !panel) continue;
    button.setAttribute('aria-controls', panel.id);
    const sync = () => {
      const open = panel.classList.contains('open');
      if (!open && panel.contains(document.activeElement)) button.focus();
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
      button.setAttribute('aria-expanded', String(open));
    };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // Settings panel toggle
  if (elements.toggleSettings) {
    elements.toggleSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const isOpen = elements.settingsPanel.classList.contains('open');
      
      const scheduleUpdate = (fn) => {
        if (scheduler && typeof scheduler === 'object' && 'postTask' in scheduler && typeof scheduler.postTask === 'function') {
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
            
            loadAndDisplayStats().catch((error) => {
              logError('Failed to load stats', error);
            });
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
        await mutateStatistics({ action: 'clearStats' }, loadAndDisplayStats, showToast, 'statisticsCleared');
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
              await mutateStatistics({ action: 'clearSelectorCache' }, loadAndDisplayStats, showToast, 'cacheCleared');
            });
          }
        });
      });
    }, { passive: true });
  }

  // Export settings button
  if (elements.exportSettingsBtn) {
    const feedback = document.getElementById('settingsExportFeedback');
    elements.exportSettingsBtn.addEventListener('click', async () => {
      if (transferOwner) return;
      const owner = {};
      transferOwner = owner;
      try {
        const choices = await reviewSettingsTransfer('export', elements.exportSettingsBtn, await getUILanguage(),
          () => releaseTransfer(owner, null));
        if (!choices) return;
        const { includeStats, includeCache } = choices;
        if (feedback) {
          feedback.hidden = true;
          feedback.removeAttribute('data-i18n-parts');
          feedback.textContent = '';
        }
        
        elements.exportSettingsBtn.disabled = true;
        const exportingText = await t('exporting');
        elements.exportSettingsBtn.textContent = exportingText;
        elements.exportSettingsBtn.dataset.i18n = 'exporting';
        
        const response = await chrome.runtime.sendMessage({
          action: 'exportSettings',
          includeStats,
          includeCache
        });
        
        if (response?.error) {
          throw Object.assign(new Error(response.error), { translationKey: response.translationKey, translationParams: response.translationParams || {} });
        }
        if (response?.success === false || typeof response?.data !== 'string' || !response.data) {
          throw new Error('No backup data received');
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
        
        if (response.warnings?.length) {
          /** @type {import('../../scripts/types.js').LocalizedMessage[]} */
          const parts = [{ key: 'backupExportPartial' }];
          if (response.includesStatistics) parts.push({ key: 'backupExportStatisticsIncluded' });
          if (response.includesCache) parts.push({ key: 'backupExportCacheIncluded' });
          parts.push(...response.warnings);
          const language = await getUILanguage();
          const message = parts.map(part => formatMessage(part.key, language, part.params)).join(' ');
          if (feedback) {
            feedback.dataset.i18nParts = JSON.stringify(parts.flatMap((part, i) => i ? [{ text: ' ' }, part] : [part]));
            feedback.hidden = false;
            feedback.textContent = message;
            requestAnimationFrame(() => {
              if (!feedback.hidden) feedback.scrollIntoView?.({ block: 'end' });
            });
          }
        } else {
          const settingsExportedText = await t('settingsExportedSuccessfully');
          showToast(settingsExportedText, 'success', { key: 'settingsExportedSuccessfully' });
        }
      } catch (error) {
        logError('Export failed', error);
        const descriptor = error?.translationKey ? { key: error.translationKey, params: error.translationParams || {} } : { key: 'errorSettingsExportFailed', params: {} };
        showToast(formatMessage(descriptor.key, await getUILanguage(), descriptor.params), 'error', descriptor);
      } finally {
        if (transferOwner === owner && elements.exportSettingsBtn.disabled) {
          elements.exportSettingsBtn.disabled = false;
          elements.exportSettingsBtn.textContent = await t('exportSettings');
          elements.exportSettingsBtn.dataset.i18n = 'exportSettings';
        }
        releaseTransfer(owner, null);
      }
    });
  }

  // Import settings button
  if (elements.importSettingsBtn && elements.importFileInput) {
    elements.importSettingsBtn.addEventListener('click', () => {
      if (!transferOwner) elements.importFileInput.click();
    });

    elements.importFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || transferOwner) return;
      const owner = {};
      transferOwner = owner;
      
      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = async (e) => {
            const { t } = await import('../../scripts/locales.js');
            const { getUILanguage } = await import('../../scripts/locales.js');
            const uiLang = await getUILanguage();
            const errorMsg = await t('errorImportJsonParseFailed');
            reject(Object.assign(new Error(errorMsg), { translationKey: 'errorImportJsonParseFailed' }));
          };
          reader.readAsText(file);
        });
        
        let data;
        try { data = JSON.parse(text); }
        catch { throw Object.assign(new Error(await t('errorImportJsonParseFailed')), { translationKey: 'errorImportJsonParseFailed' }); }
        if (!data?.settings) {
          const { t, getUILanguage } = await import('../../scripts/locales.js');
          const uiLang = await getUILanguage();
          const errorMsg = await t('errorImportMissingSettings');
          throw Object.assign(new Error(errorMsg), { translationKey: 'errorImportMissingSettings' });
        }
        
        const choices = await reviewSettingsTransfer('import', elements.importSettingsBtn, await getUILanguage(),
          () => releaseTransfer(owner, elements.importFileInput),
          { statistics: Boolean(data.statistics), cache: Boolean(data.selectorCache) });
        if (!choices) return;
        const { includeStats: importStats, includeCache: importCache, overwriteExisting, dataMode } = choices;
        
        elements.importSettingsBtn.disabled = true;
        const importingText = await t('importing');
        elements.importSettingsBtn.textContent = importingText;
        elements.importSettingsBtn.dataset.i18n = 'importing';
        
        const response = await chrome.runtime.sendMessage({
          action: 'importSettings',
          jsonData: text,
          options: {
            importStats,
            importCache,
            overwriteExisting,
            dataMode
          }
        });
        
        if (response.error) {
          throw Object.assign(new Error(response.error), { translationKey: response.translationKey, translationParams: response.translationParams || {} });
        }
        
        const result = response.result;
        const uiLang = await getUILanguage();
        const locale = UI_LOCALES[uiLang] || UI_LOCALES.en;
        
        /** @type {Array<import('../../scripts/types.js').LocalizedMessage>} */
        const parts = [{ key: 'importSettingsCount', params: { count: result.settingsImported } }];
        if (result.settingsSkipped > 0) {
          parts.push({ key: 'importSettingsSkipped', params: { count: result.settingsSkipped } });
        }
        if (result.statsImported) parts.push({ key: 'importWithStatistics' });
        if (result.cacheImported) parts.push({ key: 'importWithCache' });
        const render = values => values.map(part => part.key ? formatMessage(part.key, uiLang, part.params) : part.text).join('');
        const message = render(parts);
        
        if (result.warnings && result.warnings.length > 0) {
          const warningsText = result.warnings.join('; ');
          logWarn('Import warnings', { warnings: result.warnings });
          const warningsMsg = locale.importWarnings.replace('{warnings}', warningsText);
          const warnings = result.warningTranslations?.length === result.warnings.length
            ? result.warningTranslations.flatMap((part, index) => index ? [{ text: '; ' }, part] : [part])
            : [{ text: warningsText }];
          const warningParts = [...parts, { text: '. ' }, ...warnings];
          showToast(render(warningParts), 'warning', { parts: warningParts });
        } else {
          showToast(message, 'success', { parts });
        }
        
        if (result.errors && result.errors.length > 0) {
          const errorsText = result.errors.join('; ');
          logError('Import errors', { errors: result.errors });
          const errorMsg = locale.importCompletedWithErrors.replace('{errors}', errorsText);
          const errorParts = result.errorTranslations?.length === result.errors.length
            ? result.errorTranslations.flatMap((part, index) => index ? [{ text: '; ' }, part] : [part])
            : [{ key: 'importCompletedWithErrors', params: { errors: errorsText } }];
          showToast(render(errorParts), 'error', { parts: errorParts });
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
        const descriptor = error?.translationKey ? { key: error.translationKey, params: error.translationParams || {} } : { key: 'errorSettingsImportFailed', params: {} };
        showToast(formatMessage(descriptor.key, await getUILanguage(), descriptor.params), 'error', descriptor);
      } finally {
        if (transferOwner === owner && elements.importSettingsBtn.disabled) {
          elements.importSettingsBtn.disabled = false;
          elements.importSettingsBtn.textContent = await t('importSettings');
          elements.importSettingsBtn.dataset.i18n = 'importSettings';
        }
        releaseTransfer(owner, elements.importFileInput);
      }
    });
  }
}

