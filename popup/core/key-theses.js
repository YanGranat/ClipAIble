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

  async function downloadKeyTheses() {
    if (!elements.keyThesesText) return;
    const text = elements.keyThesesText.dataset.originalMarkdown || elements.keyThesesText.textContent || elements.keyThesesText.innerText;
    if (!text) return;
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      const title = (state?.result?.title) ? state.result.title.replace(/[^\w\s-]/g, '').trim() : 'key-theses';
      const a = document.createElement('a');
      a.href = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
      a.download = `${title}-key-theses.md`;
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
        if (timeSinceStart > STALE_THRESHOLD) {
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
          if (elements.generateKeyThesesBtn) {
            elements.generateKeyThesesBtn.disabled = false;
            elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
          }
          return;
        }
      }

      if (isGenerating && elements.generateKeyThesesBtn) {
        elements.generateKeyThesesBtn.textContent = await t('generatingKeyTheses') || 'Generating key theses...';
        elements.generateKeyThesesBtn.disabled = true;
      } else if (storageResult[STORAGE_KEYS.KEY_THESES_TEXT] && !isGenerating && elements.keyThesesText && elements.keyThesesContainer) {
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) return;

        const saved = storageResult[STORAGE_KEYS.KEY_THESES_TEXT];
        const currentMarkdown = elements.keyThesesText.dataset.originalMarkdown;
        const containerWasHidden = elements.keyThesesContainer.style.display === 'none';

        if (elements.generateKeyThesesBtn) {
          elements.generateKeyThesesBtn.disabled = false;
          elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
        }
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
        if (!doubleCheck[STORAGE_KEYS.KEY_THESES_GENERATING]) {
          elements.generateKeyThesesBtn.disabled = false;
          elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
        } else {
          elements.generateKeyThesesBtn.disabled = true;
          elements.generateKeyThesesBtn.textContent = await t('generatingKeyTheses') || 'Generating key theses...';
        }
      }
    } catch (error) {
      logWarn('Error checking key theses status', error);
      if (elements.generateKeyThesesBtn) {
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
      }
    }
  }

  async function handleGenerateKeyTheses() {
    if (!elements.generateKeyThesesBtn || !elements.keyThesesContainer) return;

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
        [STORAGE_KEYS.KEY_THESES_TEXT]: null
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
      elements.generateKeyThesesBtn.disabled = true;
      elements.generateKeyThesesBtn.textContent = await t('generatingKeyTheses') || 'Generating key theses...';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('noTabAvailable')) || 'No active tab found.', 'error');
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
        return;
      }
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('pageNotAccessible')) || 'This page is not accessible.', 'error');
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
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
            elements.generateKeyThesesBtn.disabled = false;
            elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
            return;
          }
          contentItems = subtitlesData.subtitles.map(s => ({ type: 'paragraph', text: s.text || s }));
        } catch (err) {
          logError('YouTube key theses extraction failed', err);
          await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
          showToast((await t('errorSubtitleProcessingFailed')) || 'Failed to process subtitles', 'error');
          elements.generateKeyThesesBtn.disabled = false;
          elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
          return;
        }
        model = elements.modelSelect.value;
        provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
        apiKey = elements.apiKey.value.trim();
        if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
          try { apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted); } catch (e) {
            await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
            showToast((await t('failedToDecryptApiKey')) || 'Failed to decrypt API key', 'error');
            elements.generateKeyThesesBtn.disabled = false;
            elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
            return;
          }
        }
        if (!apiKey) {
          const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
          showToast((await t(`pleaseEnter${name}ApiKey`)) || `Please enter ${name} API key`, 'error');
          elements.generateKeyThesesBtn.disabled = false;
          elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
          return;
        }
        const targetLanguage = elements.languageSelect?.value || 'auto';
        const uiLanguage = await getUILanguage();
        const thesesLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
        const response = await chrome.runtime.sendMessage({
          action: 'generateKeyTheses',
          data: { contentItems, apiKey, model, url: currentUrl, language: thesesLanguage }
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
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
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
          elements.generateKeyThesesBtn.disabled = false;
          elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
          return;
        }
      }
      if (!apiKey) {
        const name = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
        showToast((await t(`pleaseEnter${name}ApiKey`)) || `Please enter ${name} API key`, 'error');
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
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
          autoGenerateSummary: false,
          language: thesesLanguage
        }
      });
      if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
      if (!extractResponse) throw new Error(tSync('errorNoResponseFromBackground', await getUILanguage()));
      if (extractResponse.error) throw new Error(extractResponse.error);
      if (extractResponse.extracting === true) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('contentExtractionInProgress')) || 'Content extraction in progress. Try again in a moment.', 'error');
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
        return;
      }
      contentItems = extractResponse?.result?.content;
      if (!contentItems || !Array.isArray(contentItems) || contentItems.length === 0) {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
        showToast((await t('noContentAvailable')) || 'Failed to extract content.', 'error');
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
        return;
      }
      const response = await chrome.runtime.sendMessage({
        action: 'generateKeyTheses',
        data: { contentItems, apiKey, model, url: currentUrl, language: thesesLanguage }
      });
      if (response?.error) throw new Error(response.error);
      if (!response?.started) throw new Error(tSync('errorSummaryGenerationFailed', await getUILanguage()));
    } catch (error) {
      logError('Error generating key theses', error);
      try {
        await chrome.storage.local.set({ key_theses_generating: false, key_theses_generating_start_time: null });
      } catch (_) {}
      showToast(error?.message || (await t('keyThesesGenerationError')) || 'Error generating key theses', 'error');
      elements.generateKeyThesesBtn.disabled = false;
      elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
    } finally {
      try {
        const check = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
        if (!check[STORAGE_KEYS.KEY_THESES_GENERATING]) {
          await new Promise(r => setTimeout(r, 100));
          const again = await chrome.storage.local.get([STORAGE_KEYS.KEY_THESES_GENERATING]);
          if (!again[STORAGE_KEYS.KEY_THESES_GENERATING]) {
            elements.generateKeyThesesBtn.disabled = false;
            elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
          } else {
            elements.generateKeyThesesBtn.disabled = true;
            elements.generateKeyThesesBtn.textContent = await t('generatingKeyTheses') || 'Generating key theses...';
          }
        } else {
          elements.generateKeyThesesBtn.disabled = true;
          elements.generateKeyThesesBtn.textContent = await t('generatingKeyTheses') || 'Generating key theses...';
        }
      } catch (_) {
        elements.generateKeyThesesBtn.disabled = false;
        elements.generateKeyThesesBtn.textContent = await t('generateKeyTheses') || 'Key theses';
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
