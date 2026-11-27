// @ts-check
// Key theses management module (mirrors summary.js)

import { isProviderModelReady, resolveProviderApiKey } from '../utils/settings-helpers.js';
import { createGenerationErrorPresenter, createGenerationResponseError, createGenerationResultGuard, describeGenerationError } from '../utils/generation-status.js';

/**
 * Initialize key theses module
 * @param {Object} deps - Dependencies (same shape as summary: elements, STORAGE_KEYS, t, getUILanguage, logError, log, logWarn, showToast, decryptApiKey, getProviderFromModel, detectVideoPlatform, markdownToHtmlFn, sanitizeMarkdownHtml, CONFIG)
 * @returns {Object} Key theses functions
 */
export function initKeyTheses(deps) {
  const {
    elements,
    STORAGE_KEYS,
    t,
    getUILanguage,
    logError,
    log,
    logWarn,
    showToast,
    decryptApiKey,
    getProviderFromModel,
    detectVideoPlatform,
    markdownToHtmlFn,
    sanitizeMarkdownHtml
  } = deps;

  let isPreparing = false;
  const presentGenerationError = createGenerationErrorPresenter('key_theses', showToast, logWarn);
  const resultGuard = createGenerationResultGuard();
  let currentAttempt = 0;
  let activeGenerationId = null;
  let latestStatusRead = 0;

  /** Set button to generating state (text + red cancel X) or back to normal. Button stays enabled so clicks on X are received. */
  async function setGeneratingView(isGenerating, attempt, canPresent = () => true) {
    if (!canPresent() || (attempt !== undefined && attempt !== currentAttempt)) return;
    if (!elements.generateKeyThesesBtn) return;
    if (isGenerating) {
      const generatingText = await t('generatingKeyTheses') || 'Generating key theses...';
      const cancelTitle = await t('cancel') || 'Cancel';
      if (!canPresent() || (attempt !== undefined && attempt !== currentAttempt)) return;
      elements.generateKeyThesesBtn.classList.add('key-theses-generating');
      elements.generateKeyThesesBtn.disabled = false;
      elements.generateKeyThesesBtn.removeAttribute('data-i18n');
      elements.generateKeyThesesBtn.setAttribute('aria-label', cancelTitle);
      elements.generateKeyThesesBtn.setAttribute('data-i18n-aria-label', 'cancel');
      elements.generateKeyThesesBtn.innerHTML = `<span class="key-theses-generating-text" data-i18n="generatingKeyTheses">${escapeHtml(generatingText)}</span><span class="key-theses-cancel" data-i18n-title="cancel" title="${escapeHtml(cancelTitle)}" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></span>`;
    } else {
      elements.generateKeyThesesBtn.classList.remove('key-theses-generating');
      elements.generateKeyThesesBtn.removeAttribute('aria-label');
      elements.generateKeyThesesBtn.removeAttribute('data-i18n-aria-label');
      elements.generateKeyThesesBtn.disabled = false;
      const label = await t('generateKeyTheses') || 'Key theses';
      if (!canPresent() || (attempt !== undefined && attempt !== currentAttempt)) return;
      elements.generateKeyThesesBtn.textContent = label;
      elements.generateKeyThesesBtn.dataset.i18n = 'generateKeyTheses';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function cancelKeyTheses() {
    const generationId = activeGenerationId;
    activeGenerationId = null;
    const attempt = ++currentAttempt;
    isPreparing = false;
    try {
      const response = generationId
        ? await chrome.runtime.sendMessage({ action: 'cancelKeyThesesGeneration', data: { generationId } })
        : { success: true };
      if (attempt !== currentAttempt) return;
      if (response?.error) throw Object.assign(new Error(response.error), { translationKey: response.translationKey, translationParams: response.translationParams || {} });
      await setGeneratingView(false, attempt);
      const message = await t('processingCancelled') || 'Cancelled';
      if (attempt === currentAttempt) showToast(message, 'success', { key: 'processingCancelled' });
    } catch (error) {
      if (attempt !== currentAttempt) return;
      logWarn('Cancel key theses message failed', error);
      const translation = describeGenerationError(error, 'errorCommunicationFailed');
      const message = await t(translation.key, undefined, translation.params);
      if (attempt !== currentAttempt) return;
      showToast(message, 'error', translation);
      await checkKeyThesesStatus();
    }
  }

  async function awaitAttempt(operation, attempt) {
    const result = await operation;
    if (result?.generationId && (result.started || result.extracting)) {
      if (attempt !== currentAttempt) {
        await chrome.runtime.sendMessage({ action: 'cancelKeyThesesGeneration', data: { generationId: result.generationId } });
      } else {
        activeGenerationId = result.generationId;
      }
    }
    if (attempt !== currentAttempt) throw new Error('Key theses preparation cancelled');
    return result;
  }

  function toggleKeyTheses() {
    if (!elements.keyThesesContent || !elements.keyThesesToggle) return;
    const isExpanded = elements.keyThesesContent.classList.contains('expanded');
    const toggleIcon = elements.keyThesesToggle.querySelector('.summary-toggle-icon');
    if (isExpanded) {
      elements.keyThesesContent.classList.remove('expanded');
      if (toggleIcon) toggleIcon.textContent = '▶';
    } else {
      elements.keyThesesContent.classList.add('expanded');
      if (toggleIcon) toggleIcon.textContent = '▼';
    }
  }

  async function closeKeyTheses() {
    if (!elements.keyThesesContainer) return;
    try {
      elements.keyThesesContainer.classList.add('hidden');
      elements.keyThesesContainer.style.display = 'none';
      if (elements.keyThesesText) {
        elements.keyThesesText.innerHTML = '';
        elements.keyThesesText.dataset.originalMarkdown = '';
      }
      await resultGuard.clear([STORAGE_KEYS.KEY_THESES_TEXT, 'key_theses_saved_timestamp']);
      log('Key theses closed and cleared');
    } catch (error) {
      logError('Failed to close key theses', error);
    }
  }

  async function copyKeyTheses() {
    if (!elements.keyThesesText) return;
    const text = elements.keyThesesText.dataset.originalMarkdown || elements.keyThesesText.textContent || elements.keyThesesText.innerText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const copiedText = await t('copiedToClipboard') || 'Copied to clipboard';
      showToast(copiedText, 'success', { key: 'copiedToClipboard' });
    } catch (error) {
      logError('Failed to copy key theses', error);
      showToast((await t('copyFailed')) || 'Failed to copy', 'error', { key: 'copyFailed' });
    }
  }

  function sanitizeFilename(s) {
    if (!s || typeof s !== 'string') return '';
    const sanitized = s.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    return sanitized.slice(0, 120) || '';
  }

  async function downloadKeyTheses() {
    if (!elements.keyThesesText) return;
    const text = elements.keyThesesText.dataset.originalMarkdown || elements.keyThesesText.textContent || elements.keyThesesText.innerText;
    if (!text) return;
    try {
      const stored = await chrome.storage.local.get(['key_theses_article_title']);
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      const rawTitle = stored.key_theses_article_title || state?.result?.title || '';
      const baseName = sanitizeFilename(rawTitle);
      const a = document.createElement('a');
      a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
      a.download = baseName ? `${baseName}, key-theses.md` : 'key-theses.md';
      a.click();
      showToast((await t('downloadStarted')) || 'Download started', 'success', { key: 'downloadStarted' });
    } catch (error) {
      logError('Failed to download key theses', error);
      showToast((await t('downloadFailed')) || 'Failed to download', 'error', { key: 'downloadFailed' });
    }
  }

  async function checkKeyThesesStatus() {
    if (isPreparing) return;
    const canShowResult = resultGuard.capture();
    const attempt = currentAttempt;
    const read = ++latestStatusRead;
    const isCurrent = () => read === latestStatusRead && attempt === currentAttempt && !isPreparing;
    try {
      const storageResult = await chrome.storage.local.get([
        STORAGE_KEYS.KEY_THESES_GENERATING,
        STORAGE_KEYS.KEY_THESES_TEXT,
        'key_theses_generating_start_time',
        'key_theses_saved_timestamp',
        'key_theses_generation_id',
        'key_theses_error',
        'key_theses_error_translation',
        'key_theses_error_seen'
      ]);
      if (!isCurrent()) return;
      const isGenerating = storageResult[STORAGE_KEYS.KEY_THESES_GENERATING];
      activeGenerationId = isGenerating ? storageResult.key_theses_generation_id || null : null;
      const failed = await presentGenerationError(storageResult);
      if (failed === null || !isCurrent()) return;
      if (failed && elements.keyThesesContainer) {
        elements.keyThesesContainer.classList.add('hidden');
        elements.keyThesesContainer.style.display = 'none';
        if (elements.keyThesesText) {
          elements.keyThesesText.innerHTML = '';
          elements.keyThesesText.dataset.originalMarkdown = '';
        }
      }

      if (isGenerating && elements.generateKeyThesesBtn) {
        await setGeneratingView(true, attempt, isCurrent);
      } else if (storageResult[STORAGE_KEYS.KEY_THESES_TEXT] && !failed && !isGenerating && elements.keyThesesText && elements.keyThesesContainer) {
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (!canShowResult() || !isCurrent() || doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) return;

        const saved = storageResult[STORAGE_KEYS.KEY_THESES_TEXT];
        const currentMarkdown = elements.keyThesesText.dataset.originalMarkdown;
        const containerWasHidden = elements.keyThesesContainer.style.display === 'none';

        if (elements.generateKeyThesesBtn) await setGeneratingView(false, attempt, isCurrent);
        if (!canShowResult() || !isCurrent()) return;
        const keyThesesStr = typeof saved === 'string' ? saved : String(saved || '');
        if (currentMarkdown !== keyThesesStr || containerWasHidden) {
          elements.keyThesesText.dataset.originalMarkdown = keyThesesStr;
          elements.keyThesesText.innerHTML = sanitizeMarkdownHtml(markdownToHtmlFn(keyThesesStr));
          elements.keyThesesContainer.classList.remove('hidden');
          elements.keyThesesContainer.style.display = 'block';
          if (containerWasHidden || currentMarkdown !== keyThesesStr) {
            elements.keyThesesContent?.classList.remove('expanded');
            const icon = elements.keyThesesToggle?.querySelector('.summary-toggle-icon');
            if (icon) icon.textContent = '▶';
          }
        }
      } else if (!isGenerating && elements.generateKeyThesesBtn) {
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (!isCurrent()) return;
        if (!doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) await setGeneratingView(false, attempt, isCurrent);
        else await setGeneratingView(true, attempt, isCurrent);
      }
    } catch (error) {
      if (!isCurrent()) return;
      logWarn('Error checking key theses status', error);
      if (elements.generateKeyThesesBtn) await setGeneratingView(false, attempt, isCurrent);
    }
  }

  async function handleGenerateKeyTheses(ev) {
    const cancel = ev?.target?.closest?.('.key-theses-cancel') ||
      (ev?.detail === 0 && elements.generateKeyThesesBtn?.classList.contains('key-theses-generating'));
    if (isPreparing && !cancel) return;
    if (!elements.generateKeyThesesBtn || !elements.keyThesesContainer) return;
    if (cancel) {
      await cancelKeyTheses();
      return;
    }
    if (elements.generateKeyThesesBtn.classList.contains('key-theses-generating')) {
      return;
    }

    const required = ['modelSelect', 'apiKey', 'modeSelect', 'useCache'];
    const missing = required.filter(k => !elements[k]);
    if (missing.length > 0) {
      logError('Required UI elements not found', { missing });
      showToast((await t('uiElementsNotFound')) || 'Required UI elements not found.', 'error', { key: 'uiElementsNotFound' });
      return;
    }

    let apiKey = null;
    const model = elements.modelSelect.value;
    const provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
    if (!isProviderModelReady(elements.modelSelect, provider)) {
      showToast(await t('errorProviderModelsLoading'), 'error', { key: 'errorProviderModelsLoading' });
      return;
    }
    const currentProvider = () => !elements.apiProviderSelect || elements.apiProviderSelect.value === provider;

    const attempt = ++currentAttempt;
    isPreparing = true;
    try {
      apiKey = await awaitAttempt(resolveProviderApiKey(elements.apiKey, provider, decryptApiKey, t), attempt);
      if (!currentProvider()) return;

      if (elements.keyThesesContainer) {
        elements.keyThesesContainer.classList.add('hidden');
        elements.keyThesesContainer.style.display = 'none';
      }
      if (elements.keyThesesText) {
        elements.keyThesesText.innerHTML = '';
        elements.keyThesesText.dataset.originalMarkdown = '';
      }
      await awaitAttempt(setGeneratingView(true, attempt), attempt);

      const [tab] = await awaitAttempt(chrome.tabs.query({ active: true, currentWindow: true }), attempt);
      if (!tab) {

        showToast((await awaitAttempt(t('noTabAvailable'), attempt)) || 'No active tab found.', 'error', { key: 'noTabAvailable' });
        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        return;
      }
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {

        showToast((await awaitAttempt(t('pageNotAccessible'), attempt)) || 'This page is not accessible.', 'error', { key: 'pageNotAccessible' });
        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        return;
      }

      const currentUrl = tab.url;
      let contentItems = null;
      const videoInfo = detectVideoPlatform(tab.url);

      if (videoInfo && videoInfo.platform === 'youtube') {
        try {
          const extractResponse = await awaitAttempt(chrome.runtime.sendMessage({
            action: 'extractYouTubeSubtitlesForSummary',
            data: { tabId: tab.id }
          }), attempt);
          if (!extractResponse || extractResponse.error || extractResponse.success === false) {
            throw createGenerationResponseError(extractResponse, 'errorSubtitleProcessingFailed');
          }
          const subtitlesData = extractResponse?.result;
          if (!subtitlesData?.subtitles?.length) {

            showToast((await awaitAttempt(t('errorNoSubtitles'), attempt)) || 'No subtitles found.', 'error', { key: 'errorNoSubtitles' });
            await awaitAttempt(setGeneratingView(false, attempt), attempt);
            return;
          }
          contentItems = subtitlesData.subtitles.map(s => ({ type: 'paragraph', text: s.text || s }));
        } catch (err) {
          if (attempt !== currentAttempt) return;
          logError('YouTube key theses extraction failed', err);

          const translation = describeGenerationError(err, 'errorSubtitleProcessingFailed');
          const message = await awaitAttempt(t(translation.key, undefined, translation.params), attempt);
          showToast(message, 'error', translation);
          await awaitAttempt(setGeneratingView(false, attempt), attempt);
          return;
        }
        if (!apiKey) {
          const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
          showToast((await awaitAttempt(t(`pleaseEnter${name === 'OpenAI' ? 'OpenAi' : name}ApiKey`), attempt)) || `Please enter ${name} API key`, 'error', { key: `pleaseEnter${name === 'OpenAI' ? 'OpenAi' : name}ApiKey` });
          await awaitAttempt(setGeneratingView(false, attempt), attempt);
          return;
        }
        const targetLanguage = elements.languageSelect?.value || 'auto';
        const uiLanguage = await awaitAttempt(getUILanguage(), attempt);
        const thesesLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;


        const articleTitle = tab?.title || '';
        if (!currentProvider()) return;
        const response = await awaitAttempt(chrome.runtime.sendMessage({
          action: 'generateKeyTheses',
          data: { contentItems, apiKey, model, provider, url: currentUrl, language: thesesLanguage, title: articleTitle }
        }), attempt);
        if (response?.error || !response?.started) throw createGenerationResponseError(response, 'keyThesesGenerationError');

        return;
      }

      // Regular page: extract content then send generateKeyTheses
      const htmlResult = await awaitAttempt(chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let pageTitle = document.title;
          const h1 = document.querySelector('h1');
          if (h1) {
            const main = h1.querySelector('.mw-page-title-main');
            pageTitle = main ? main.textContent.trim() : (() => {
              const clone = /** @type {Element} */ (h1.cloneNode(true));
              clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
              const t = clone.textContent.trim();
              return (t && !/^\d+$/.test(t)) ? t : pageTitle;
            })();
          }
          return { html: document.documentElement.outerHTML, url: window.location.href, title: pageTitle };
        }
      }), attempt);
      if (!htmlResult?.[0]?.result) {

        showToast((await awaitAttempt(t('noContentAvailable'), attempt)) || 'No content available.', 'error', { key: 'noContentAvailable' });
        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        return;
      }
      const pageData = htmlResult[0].result;
      if (!apiKey) {
        const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
        showToast((await awaitAttempt(t(`pleaseEnter${name === 'OpenAI' ? 'OpenAi' : name}ApiKey`), attempt)) || `Please enter ${name} API key`, 'error', { key: `pleaseEnter${name === 'OpenAI' ? 'OpenAi' : name}ApiKey` });
        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        return;
      }
      const targetLanguage = elements.languageSelect?.value || 'auto';
      const uiLanguage = await awaitAttempt(getUILanguage(), attempt);
      const thesesLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
      if (!currentProvider()) return;
      const extractResponse = await awaitAttempt(chrome.runtime.sendMessage({
        action: 'extractContentOnly',
        data: {
          html: pageData.html,
          url: pageData.url,
          title: pageData.title || tab.title,
          apiKey,
          provider,
          model,
          mode: elements.modeSelect.value,
          useCache: elements.useCache.checked,
          tabId: tab.id,
          autoGenerateKeyTheses: true,
          language: thesesLanguage
        }
      }), attempt);
      if (chrome.runtime.lastError) throw createGenerationResponseError({ error: chrome.runtime.lastError.message }, 'errorNoResponseFromBackground');
      if (!extractResponse) throw createGenerationResponseError(null, 'errorNoResponseFromBackground');
      if (extractResponse.cancelled) {

        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        showToast(await awaitAttempt(t('processingCancelled'), attempt) || 'Cancelled', 'success', { key: 'processingCancelled' });
        return;
      }
      if (extractResponse.error || extractResponse.success === false) {
        throw createGenerationResponseError(extractResponse, 'errorContentExtractionFailed');
      }
      if (extractResponse.success && extractResponse.extracting === true) {

        return;
      }
      contentItems = extractResponse?.result?.content;
      if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {

        showToast((await awaitAttempt(t('noContentAvailable'), attempt)) || 'Failed to extract content.', 'error', { key: 'noContentAvailable' });
        await awaitAttempt(setGeneratingView(false, attempt), attempt);
        return;
      }

      const articleTitle = extractResponse?.result?.title || tab?.title || '';
      if (!currentProvider()) return;
      const response = await awaitAttempt(chrome.runtime.sendMessage({
        action: 'generateKeyTheses',
        data: { contentItems, apiKey, model, provider, url: currentUrl, language: thesesLanguage, title: articleTitle }
      }), attempt);
      if (response?.error || !response?.started) throw createGenerationResponseError(response, 'keyThesesGenerationError');

    } catch (error) {
      if (attempt !== currentAttempt) return;
      logError('Error generating key theses', error);

      const translation = describeGenerationError(error, 'keyThesesGenerationError');
      const message = await awaitAttempt(t(translation.key, undefined, translation.params), attempt);
      showToast(message, 'error', translation);
      await awaitAttempt(setGeneratingView(false, attempt), attempt);
    } finally {
      if (attempt === currentAttempt) {
        isPreparing = false;
        await checkKeyThesesStatus();
      }
    }
  }

  return {
    handleGenerateKeyTheses,
    toggleKeyTheses,
    closeKeyTheses,
    copyKeyTheses,
    downloadKeyTheses,
    checkKeyThesesStatus
  };
}
