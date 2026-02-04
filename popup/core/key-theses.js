// @ts-check
// Key theses management module (mirrors summary.js)

import { tSync } from '../../scripts/locales.js';

const CONFIG = { KEY_THESES_STALE_THRESHOLD_MS: 15 * 60 * 1000 };

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

  const STALE_THRESHOLD = (deps.CONFIG && deps.CONFIG.KEY_THESES_STALE_THRESHOLD_MS) || CONFIG.KEY_THESES_STALE_THRESHOLD_MS;

  /** Set button to generating state (text + red cancel X) or back to normal. Button stays enabled so clicks on X are received. */
  async function setGeneratingView(isGenerating) {
    if (!elements.generateKeyThesesBtn) return;
    if (isGenerating) {
      const generatingText = await t('generatingKeyTheses') || 'Generating key theses...';
      const cancelTitle = await t('cancel') || 'Cancel';
      elements.generateKeyThesesBtn.classList.add('key-theses-generating');
      elements.generateKeyThesesBtn.disabled = false;
      elements.generateKeyThesesBtn.innerHTML = `<span class="key-theses-generating-text">${escapeHtml(generatingText)}</span><span class="key-theses-cancel" role="button" tabindex="0" title="${escapeHtml(cancelTitle)}">✕</span>`;
    } else {
      elements.generateKeyThesesBtn.classList.remove('key-theses-generating');
      elements.generateKeyThesesBtn.disabled = false;
      elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  const CANCEL_REQUESTED_KEY = 'key_theses_cancel_requested';

  async function cancelKeyTheses() {
    try {
      await chrome.storage.local.set({ [CANCEL_REQUESTED_KEY]: true });
    } catch (_) {}
    try {
      await chrome.runtime.sendMessage({ action: 'cancelKeyThesesGeneration' });
    } catch (e) {
      logWarn('Cancel key theses message failed', e);
    }
    try {
      await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
    } catch (_) {}
    await setGeneratingView(false);
    showToast(await t('processingCancelled') || 'Cancelled', 'success');
  }

  async function wasKeyThesesCancelled() {
    const r = await chrome.storage.local.get(CANCEL_REQUESTED_KEY);
    return !!r[CANCEL_REQUESTED_KEY];
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
      await chrome.storage.local.remove([STORAGE_KEYS.KEY_THESES_TEXT, 'key_theses_saved_timestamp']);
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
      showToast(copiedText, 'success');
    } catch (error) {
      logError('Failed to copy key theses', error);
      showToast((await t('copyFailed')) || 'Failed to copy', 'error');
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
      showToast((await t('downloadStarted')) || 'Download started', 'success');
    } catch (error) {
      logError('Failed to download key theses', error);
      showToast((await t('downloadFailed')) || 'Failed to download', 'error');
    }
  }

  async function checkKeyThesesStatus() {
    try {
      const storageResult = await chrome.storage.local.get([
        STORAGE_KEYS.KEY_THESES_GENERATING,
        STORAGE_KEYS.KEY_THESES_TEXT,
        'key_theses_generating_start_time',
        'key_theses_saved_timestamp'
      ]);
      const isGenerating = storageResult[STORAGE_KEYS.KEY_THESES_GENERATING];

      if (isGenerating && storageResult.key_theses_generating_start_time) {
        const startTime = Number(storageResult.key_theses_generating_start_time);
        const timeSinceStart = Date.now() - startTime;
        const hasKeyTheses = !!storageResult[STORAGE_KEYS.KEY_THESES_TEXT];
        const HUNG_THRESHOLD_MS = 90 * 1000;
        const isHung = timeSinceStart > HUNG_THRESHOLD_MS && !hasKeyTheses;
        if (timeSinceStart > STALE_THRESHOLD || isHung) {
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
          if (elements.generateKeyThesesBtn) await setGeneratingView(false);
          return;
        }
      }

      if (isGenerating && elements.generateKeyThesesBtn) {
        await setGeneratingView(true);
      } else if (storageResult[STORAGE_KEYS.KEY_THESES_TEXT] && !isGenerating && elements.keyThesesText && elements.keyThesesContainer) {
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) return;

        const saved = storageResult[STORAGE_KEYS.KEY_THESES_TEXT];
        const currentMarkdown = elements.keyThesesText.dataset.originalMarkdown;
        const containerWasHidden = elements.keyThesesContainer.style.display === 'none';

        if (elements.generateKeyThesesBtn) await setGeneratingView(false);
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
        if (!doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) await setGeneratingView(false);
        else await setGeneratingView(true);
      }
    } catch (error) {
      logWarn('Error checking key theses status', error);
      if (elements.generateKeyThesesBtn) await setGeneratingView(false);
    }
  }

  async function handleGenerateKeyTheses(ev) {
    if (!elements.generateKeyThesesBtn || !elements.keyThesesContainer) return;
    if (ev && ev.target && ev.target.closest && ev.target.closest('.key-theses-cancel')) {
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
      showToast((await t('uiElementsNotFound')) || 'Required UI elements not found.', 'error');
      return;
    }

    let apiKey = null;
    let model = null;
    let provider = null;

    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.KEY_THESES_GENERATING]: true,
        key_theses_generating_start_time: Date.now(),
        [STORAGE_KEYS.KEY_THESES_TEXT]: null,
        key_theses_cancel_requested: false
      });
      await chrome.storage.local.remove([STORAGE_KEYS.KEY_THESES_TEXT, 'key_theses_saved_timestamp']);
      if (elements.keyThesesContainer) {
        elements.keyThesesContainer.classList.add('hidden');
        elements.keyThesesContainer.style.display = 'none';
      }
      if (elements.keyThesesText) {
        elements.keyThesesText.innerHTML = '';
        elements.keyThesesText.dataset.originalMarkdown = '';
      }
      await setGeneratingView(true);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('noTabAvailable')) || 'No active tab found.', 'error');
        await setGeneratingView(false);
        return;
      }
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('pageNotAccessible')) || 'This page is not accessible.', 'error');
        await setGeneratingView(false);
        return;
      }

      const currentUrl = tab.url;
      let contentItems = null;
      const videoInfo = detectVideoPlatform(tab.url);

      if (videoInfo && videoInfo.platform === 'youtube') {
        try {
          const extractResponse = await chrome.runtime.sendMessage({
            action: 'extractYouTubeSubtitlesForSummary',
            data: { tabId: tab.id }
          });
          if (extractResponse?.error) throw new Error(extractResponse.error);
          const subtitlesData = extractResponse?.result;
          if (!subtitlesData?.subtitles?.length) {
            await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
            showToast((await t('errorNoSubtitles')) || 'No subtitles found.', 'error');
            await setGeneratingView(false);
            return;
          }
          contentItems = subtitlesData.subtitles.map(s => ({ type: 'paragraph', text: s.text || s }));
        } catch (err) {
          logError('YouTube key theses extraction failed', err);
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
          showToast((await t('errorSubtitleProcessingFailed')) || 'Failed to process subtitles', 'error');
          await setGeneratingView(false);
          return;
        }
        model = elements.modelSelect.value;
        provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
        apiKey = elements.apiKey.value.trim();
        if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
          try { apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted); } catch (e) {
            await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
            showToast((await t('failedToDecryptApiKey')) || 'Failed to decrypt API key', 'error');
            await setGeneratingView(false);
            return;
          }
        }
        if (!apiKey) {
          const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
          showToast((await t(`pleaseEnter${name}ApiKey`)) || `Please enter ${name} API key`, 'error');
          await setGeneratingView(false);
          return;
        }
        const targetLanguage = elements.languageSelect?.value || 'auto';
        const uiLanguage = await getUILanguage();
        const thesesLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
        if (await wasKeyThesesCancelled()) {
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null, key_theses_cancel_requested: false });
          await setGeneratingView(false);
          showToast(await t('processingCancelled') || 'Cancelled', 'success');
          return;
        }
        const articleTitle = tab?.title || '';
        const response = await chrome.runtime.sendMessage({
          action: 'generateKeyTheses',
          data: { contentItems, apiKey, model, url: currentUrl, language: thesesLanguage, title: articleTitle }
        });
        if (response?.error) throw new Error(response.error);
        if (!response?.started) throw new Error(tSync('errorSummaryGenerationFailed', await getUILanguage()));
        return;
      }

      // Regular page: extract content then send generateKeyTheses
      const htmlResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let pageTitle = document.title;
          const h1 = document.querySelector('h1');
          if (h1) {
            const main = h1.querySelector('.mw-page-title-main');
            pageTitle = main ? main.textContent.trim() : (() => {
              const clone = h1.cloneNode(true);
              clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
              const t = clone.textContent.trim();
              return (t && !/^\d+$/.test(t)) ? t : pageTitle;
            })();
          }
          return { html: document.documentElement.outerHTML, url: window.location.href, title: pageTitle };
        }
      });
      if (!htmlResult?.[0]?.result) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('noContentAvailable')) || 'No content available.', 'error');
        await setGeneratingView(false);
        return;
      }
      const pageData = htmlResult[0].result;
      model = elements.modelSelect.value;
      provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
      apiKey = elements.apiKey.value.trim();
      if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
        try { apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted); } catch (e) {
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
          showToast((await t('failedToDecryptApiKey')) || 'Failed to decrypt API key', 'error');
          await setGeneratingView(false);
          return;
        }
      }
      if (!apiKey) {
        const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
        showToast((await t(`pleaseEnter${name}ApiKey`)) || `Please enter ${name} API key`, 'error');
        await setGeneratingView(false);
        return;
      }
      const targetLanguage = elements.languageSelect?.value || 'auto';
      const uiLanguage = await getUILanguage();
      const thesesLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
      const extractResponse = await chrome.runtime.sendMessage({
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
      });
      if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
      if (!extractResponse) throw new Error(tSync('errorNoResponseFromBackground', await getUILanguage()));
      if (extractResponse.cancelled) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null, key_theses_cancel_requested: false });
        await setGeneratingView(false);
        showToast(await t('processingCancelled') || 'Cancelled', 'success');
        return;
      }
      if (extractResponse.error) throw new Error(extractResponse.error);
      if (extractResponse.success && extractResponse.extracting === true) {
        return;
      }
      contentItems = extractResponse?.result?.content;
      if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('noContentAvailable')) || 'Failed to extract content.', 'error');
        await setGeneratingView(false);
        return;
      }
      if (await wasKeyThesesCancelled()) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null, key_theses_cancel_requested: false });
        await setGeneratingView(false);
        showToast(await t('processingCancelled') || 'Cancelled', 'success');
        return;
      }
      const articleTitle = extractResponse?.result?.title || tab?.title || '';
      const response = await chrome.runtime.sendMessage({
        action: 'generateKeyTheses',
        data: { contentItems, apiKey, model, url: currentUrl, language: thesesLanguage, title: articleTitle }
      });
      if (response?.error) throw new Error(response.error);
      if (!response?.started) throw new Error(tSync('errorSummaryGenerationFailed', await getUILanguage()));
    } catch (error) {
      logError('Error generating key theses', error);
      try {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
      } catch (_) {}
      showToast(error?.message || (await t('keyThesesGenerationError')) || 'Error generating key theses', 'error');
      await setGeneratingView(false);
    } finally {
      try {
        const check = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (!check[STORAGE_KEYS.KEY_THESES_GENERATING]) {
          await new Promise(r => setTimeout(r, 100));
          const again = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
          if (!again[STORAGE_KEYS.KEY_THESES_GENERATING]) await setGeneratingView(false);
          else await setGeneratingView(true);
        } else {
          await setGeneratingView(true);
        }
      } catch (_) {
        await setGeneratingView(false);
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
