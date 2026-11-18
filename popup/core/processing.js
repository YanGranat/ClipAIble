// @ts-check
// Processing module
// Handles PDF saving, cancellation, and content extraction

import { DEFAULT_GOOGLE_TTS_MODEL, DEFAULT_ELEVENLABS_TTS_MODEL, DEFAULT_QWEN_TTS_MODEL, getDefaultTtsVoice } from '../../scripts/api/tts-catalog.js';
import { getUILanguage, t, tSync } from '../../scripts/locales.js';
import { getUserFriendlyError, getUserFriendlyErrorDescriptor, createUserFriendlyError } from '../../scripts/utils/error-messages.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, supportsImageTranslation } from '../../scripts/api/image-translation-catalog.js';
import { resolveProviderApiKey, readApiKeyDraft } from '../utils/settings-helpers.js';

/**
 * Initialize processing module
 * @param {Object} deps - Dependencies
 * @param {Record<string, HTMLElement|null>} deps.elements - DOM elements
 * @param {function(string, string?): Promise<string>} deps.t - Translation function
 * @param {function(...*): void} deps.logError - Error logging function
 * @param {function(...*): void} deps.log - Log function
 * @param {function(...*): void} deps.logWarn - Warning logging function
 * @param {function(string, string?): void} deps.showToast - Show toast notification function
 * @param {function(string, string?, number?): void} deps.setStatus - Set status function
 * @param {function(number, boolean?): void} deps.setProgress - Set progress function
 * @param {function(): void} deps.stopTimerDisplay - Stop timer display function
 * @param {function(string, string): Promise<string>} deps.decryptApiKey - Decrypt API key function
 * @param {function(string): import('../../scripts/types.js').AIProvider} deps.getProviderFromModel - Get provider from model function
 * @param {function(): void} deps.startStatePolling - Start state polling function
 * @param {function(): Promise<void>} deps.checkProcessingState - Check processing state function
 * @param {Object} deps.stateRefs - State references object
 * @param {import('../../scripts/types.js').SettingsModule} [deps.settingsModule] - Settings module (optional, for getVoiceIdByIndex)
 * @returns {Object} Processing functions (handleSavePdf, handleCancel, handleGenerateSummary, etc.)
 */
export function initProcessing(deps) {
  let latestSaveAttempt = 0;
  const {
    elements,
    t,
    logError,
    log,
    logWarn,
    showToast,
    setStatus,
    setProgress,
    stopTimerDisplay,
    decryptApiKey,
    getProviderFromModel,
    startStatePolling,
    checkProcessingState,
    stateRefs,
    settingsModule
  } = deps;

  async function readStoredApiKey(storageKey) {
    try {
      const saved = await chrome.storage.local.get([storageKey]);
      return typeof saved[storageKey] === 'string' ? saved[storageKey] : '';
    } catch (error) {
      logError('Failed to read a saved API key', error);
      throw Object.assign(new Error(await t('errorApiKeyRead')), { translationKey: 'errorApiKeyRead', translationParams: {} });
    }
  }

  // Handle Cancel button click
  async function handleCancel() {
    if (!elements.cancelBtn) {
      log('Cancel button not found');
      return;
    }
    try {
      // Disable button to prevent double-clicks
      if (elements.cancelBtn) {
        /** @type {HTMLButtonElement} */ (elements.cancelBtn).disabled = true;
      }
      await chrome.runtime.sendMessage({ action: 'cancelProcessing' });
      const cancelledText = await t('processingCancelled', undefined);
      showToast(cancelledText, 'success', { key: 'processingCancelled' });
      const readyText = await t('ready', undefined);
      setStatus('ready', readyText, undefined, { key: 'ready' });
      setProgress(0, false);
      stopTimerDisplay();
      if (elements.savePdfBtn) {
        /** @type {HTMLButtonElement} */ (elements.savePdfBtn).disabled = false;
        elements.savePdfBtn.style.display = 'block';
      }
      if (elements.cancelBtn) {
        elements.cancelBtn.classList.add('hidden');
        elements.cancelBtn.style.display = 'none';
        /** @type {HTMLButtonElement} */ (elements.cancelBtn).disabled = false; // Re-enable for next time
      }
    } catch (error) {
      logError('Error cancelling', error);
      if (elements.cancelBtn) {
        /** @type {HTMLButtonElement} */ (elements.cancelBtn).disabled = false; // Re-enable on error
      }
    }
  }

  /**
   * Determine error type from error message or context
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context (e.g., { tabId, url, scriptError, responseError })
   * @returns {Promise<string>} Error type for getUserFriendlyError
   */
  async function determineErrorType(error, context = {}) {
    const errorMessage = typeof error === 'string' ? error : (error?.message || '');
    const lowerMessage = errorMessage.toLowerCase();
    
    // Tab-related errors
    if (lowerMessage.includes('no active tab') || lowerMessage.includes('tab not found') || 
        lowerMessage.includes('errornotab') || lowerMessage.includes('page tab not found')) {
      return 'tabNotFound';
    }
    
    // Generation errors (check first as they are more specific)
    if (lowerMessage.includes('pdf generation failed') || lowerMessage.includes('errorpdfgenerationfailed')) {
      return 'pdfGenerationFailed';
    }
    if (lowerMessage.includes('epub generation failed') || lowerMessage.includes('errorepubgenerationfailed')) {
      return 'epubGenerationFailed';
    }
    if (lowerMessage.includes('fb2 generation failed') || lowerMessage.includes('errorfb2generationfailed')) {
      return 'fb2GenerationFailed';
    }
    if (lowerMessage.includes('markdown generation failed') || lowerMessage.includes('errormarkdowngenerationfailed')) {
      return 'markdownGenerationFailed';
    }
    if (lowerMessage.includes('audio generation failed') || lowerMessage.includes('erroraudiogenerationfailed')) {
      return 'audioGenerationFailed';
    }
    
    // Content extraction errors (check before script execution as they are more specific)
    if (lowerMessage.includes('content extraction failed') || 
        lowerMessage.includes('errorcontentextractionfailed') ||
        lowerMessage.includes('failed to extract content from page')) {
      return 'contentExtractionFailed';
    }
    
    if (lowerMessage.includes('no content extracted') || 
        lowerMessage.includes('errornocontentextracted') ||
        lowerMessage.includes('no content found')) {
      return 'noContentExtracted';
    }
    
    if (lowerMessage.includes('selector analysis failed') || 
        lowerMessage.includes('errorselectoranalysisfailed') ||
        lowerMessage.includes('empty selectors') ||
        lowerMessage.includes('error emptyselectors')) {
      return 'selectorAnalysisFailed';
    }
    
    if (lowerMessage.includes('extract mode no content') || 
        lowerMessage.includes('errorextractmodenocontent')) {
      return 'extractModeNoContent';
    }
    
    // Script execution errors
    if (lowerMessage.includes('extractpagecontent timeout') || 
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('failed to extract page content') ||
        lowerMessage.includes('script execution failed') ||
        lowerMessage.includes('errorscriptexecutionfailed') ||
        lowerMessage.includes('scripterror') ||
        lowerMessage.includes('errorscript') ||
        lowerMessage.includes('failed to read page content') ||
        lowerMessage.includes('page may be blocking extensions') ||
        context.scriptError) {
      return 'scriptExecutionFailed';
    }
    
    // Browser internal page errors
    if (lowerMessage.includes('browser internal page') ||
        lowerMessage.includes('cannot extract content from browser') ||
        lowerMessage.includes('errorbrowserinternalpage') ||
        lowerMessage.includes('chrome://') ||
        lowerMessage.includes('chrome-extension://') ||
        lowerMessage.includes('edge://') ||
        lowerMessage.includes('about:')) {
      return 'pageNotReady';
    }
    
    // Communication errors
    if (lowerMessage.includes('communication failed') ||
        lowerMessage.includes('errorcommunicationfailed') ||
        lowerMessage.includes('could not establish connection') ||
        lowerMessage.includes('message port closed') ||
        lowerMessage.includes('failed to communicate')) {
      return 'scriptExecutionFailed'; // Treat as script execution issue
    }
    
    // No page URL or HTML data
    if (lowerMessage.includes('no page url') ||
        lowerMessage.includes('errornopageurl') ||
        lowerMessage.includes('no html data') ||
        lowerMessage.includes('errornohtmldata')) {
      return 'noContentExtracted';
    }
    
    // Response errors from background (these are usually content extraction or generation errors)
    if (context.responseError) {
      // Check if it's a content extraction error
      if (lowerMessage.includes('content extraction') || 
          lowerMessage.includes('extract') ||
          lowerMessage.includes('selector') ||
          lowerMessage.includes('no content')) {
        return 'contentExtractionFailed';
      }
    }
    
    // Default to script execution failed for unknown errors
    return 'scriptExecutionFailed';
  }

  // Function to inject into page to extract content
  function extractPageContent() {
    // Always use full HTML - let AI figure out what's important
    // This ensures we don't accidentally miss content
    const html = document.documentElement.outerHTML;
    
    // Get title from various sources
    let pageTitle = document.title;
    const h1 = document.querySelector('h1');
    if (h1) {
      // Clean title from Wikipedia edit section spans
      const titleMain = h1.querySelector('.mw-page-title-main');
      if (titleMain) {
        pageTitle = titleMain.textContent.trim();
      } else {
        const clone = h1.cloneNode(true);
        clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
        const cleanTitle = clone.textContent.trim();
        // Only use h1 if it's not just numbers (avoid counters/views on some sites)
        if (cleanTitle && !/^\d+$/.test(cleanTitle.trim())) {
          pageTitle = cleanTitle;
        }
      }
    }
    
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt || '',
      width: img.naturalWidth,
      height: img.naturalHeight
    }));

    return {
      html: html,
      images: images,
      url: window.location.href,
      title: pageTitle
    };
  }

  // Handle Save PDF button click
  async function handleSavePdf() {
    const attempt = ++latestSaveAttempt;
    let preparing = false;
    let admitted = false;
    let failed = false;
    log('=== handleSavePdf: ENTRY ===', {
      timestamp: Date.now()
    });
    
    const model = elements.modelSelect ? /** @type {HTMLSelectElement} */ (elements.modelSelect).value : '';
    // Use selected provider from dropdown, fallback to model-based detection for backward compatibility
    const provider = elements.apiProviderSelect ? /** @type {HTMLSelectElement} */ (elements.apiProviderSelect).value : getProviderFromModel(model);
    const apiKeyOwner = elements.apiKey?.dataset.provider;
    
    log('=== handleSavePdf: Got model and provider ===', {
      model: model,
      provider: provider,
      timestamp: Date.now()
    });
    
    // Get the appropriate API key based on selected provider
    try {
      const currentProvider = () => attempt === latestSaveAttempt && (!elements.apiProviderSelect || elements.apiProviderSelect.value === provider);
      const apiKey = await resolveProviderApiKey(elements.apiKey, provider, decryptApiKey, t);
      if (!currentProvider()) return;
      // Check API key only if not using automatic mode
      const mode = elements.modeSelect ? /** @type {HTMLSelectElement} */ (elements.modeSelect).value : '';
      if (mode !== 'automatic' && !apiKey) {
        const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : provider === 'grok' ? 'Grok' : provider === 'openrouter' ? 'OpenRouter' : provider === 'deepseek' ? 'DeepSeek' : 'AI';
        showToast(await t(`pleaseEnter${providerName === 'OpenAI' ? 'OpenAi' : providerName}ApiKey`, undefined), 'error', { key: `pleaseEnter${providerName === 'OpenAI' ? 'OpenAi' : providerName}ApiKey` });
        return;
      }

      // CRITICAL: Get current active tab at the moment of button click
      // This ensures we process the page that is currently active, not the one where popup was opened
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        // Use user-friendly error message directly
        const friendly = await createUserFriendlyError('tabNotFound', {});
        throw Object.assign(new Error(friendly.message), friendly);
      }
      
      log('=== handleSavePdf: Tab found (at button click moment) ===', {
        tabId: tab.id,
        url: tab.url,
        status: tab.status,
        title: tab.title,
        timestamp: Date.now()
      });
      
      // Check if we can inject scripts on this page
      // Use tab.url for initial check, but we'll verify with actual pageData.url later
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
        log('handleSavePdf: pageNotReady - tab URL is restricted', { tabUrl: tab.url });
        const friendly = await createUserFriendlyError('pageNotReady', {
          blockedPage: true,
          error: { message: 'Cannot extract content from browser internal pages' }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }

      log('=== handleSavePdf: Setting status and disabling button ===', {
        timestamp: Date.now()
      });
      
      const extractingText = await t('extractingPageContent', undefined);
      if (!currentProvider()) return;
      preparing = true;
      setStatus('processing', extractingText, undefined, { key: 'extractingPageContent' });
      setProgress(0, false);
      if (elements.savePdfBtn) {
        /** @type {HTMLButtonElement} */ (elements.savePdfBtn).disabled = true;
      }

      log('=== handleSavePdf: Waiting 500ms for dynamic content ===', {
        timestamp: Date.now()
      });

      // Wait a bit for dynamic content to load (Notion, React apps, etc.)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to get HTML via content script message first (faster and more reliable)
      let pageData = null;
      let localPdfUrl = null;
      try {
        const source = new URL(tab.url);
        if (source.protocol === 'file:' && /\.pdf$/i.test(source.pathname)) localPdfUrl = tab.url;
      } catch { /* Other pages use the existing content acquisition path. */ }
      if (localPdfUrl) {
        const currentTab = await chrome.tabs.get(tab.id);
        if (currentTab.url !== localPdfUrl) throw new Error('The page changed before processing started.');
        // PDF processing acquires its own bytes, including file selection when needed.
        pageData = { html: '<!doctype html><html><body></body></html>', images: [], url: localPdfUrl, title: tab.title || '' };
      }
      if (!pageData) {
        try {
          log('=== handleSavePdf: Trying to get HTML via content script message ===', {
            tabId: tab.id,
            timestamp: Date.now()
          });

          const contentResponse = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
          if (contentResponse && contentResponse.html) {
            log('=== handleSavePdf: Got HTML via content script ===', {
              htmlLength: contentResponse.html?.length || 0,
              timestamp: Date.now()
            });
            pageData = contentResponse;
          }
        } catch (contentError) {
          log('=== handleSavePdf: Content script not available, will use executeScript ===', {
            error: contentError?.message,
            timestamp: Date.now()
          });
        }
      }

      // If content script didn't work, use executeScript
      if (!pageData) {
        log('=== handleSavePdf: About to execute extractPageContent script ===', {
          tabId: tab.id,
          timestamp: Date.now()
        });

        // Inject content script and get page HTML with timeout
        // Use inline function to ensure proper serialization
        let htmlResult;
        try {
          let timeoutId = null;
          const timeoutPromise = new Promise((_, reject) => {
            // Timeout error will be converted to user-friendly message in catch block
            timeoutId = setTimeout(() => reject(new Error('extractPageContent timeout after 5 seconds')), 5000);
          });
          
          const scriptPromise = chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function() {
              try {
                // Always use full HTML - let AI figure out what's important
                const html = document.documentElement.outerHTML;
                
                // Get title from various sources
                let pageTitle = document.title;
                const h1 = document.querySelector('h1');
                if (h1) {
                  // Clean title from Wikipedia edit section spans
                  const titleMain = h1.querySelector('.mw-page-title-main');
                  if (titleMain) {
                    pageTitle = titleMain.textContent.trim();
                  } else {
                    const clone = h1.cloneNode(true);
                    clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
                    const cleanTitle = clone.textContent.trim();
                    if (cleanTitle) pageTitle = cleanTitle;
                  }
                }
                
                const images = Array.from(document.querySelectorAll('img')).map(img => ({
                  src: img.src,
                  alt: img.alt || '',
                  width: img.naturalWidth,
                  height: img.naturalHeight
                }));

                return {
                  html: html,
                  images: images,
                  url: window.location.href,
                  title: pageTitle
                };
              } catch (e) {
                return {
                  html: '',
                  images: [],
                  url: window.location.href,
                  title: document.title,
                  error: e.message
                };
              }
            }
          });
          
          try {
            htmlResult = await Promise.race([scriptPromise, timeoutPromise]);
            // Clear timeout if script completed successfully
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
          } catch (error) {
            // Clear timeout on error too
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            throw error;
          }
          
          log('=== handleSavePdf: extractPageContent script executed ===', {
            hasResult: !!htmlResult,
            hasFirstResult: !!htmlResult?.[0],
            timestamp: Date.now()
          });
          
          if (htmlResult && htmlResult[0]?.result) {
            pageData = htmlResult[0].result;
          }
        } catch (scriptError) {
          logError('=== handleSavePdf: extractPageContent script FAILED ===', {
            error: scriptError?.message || String(scriptError),
            errorStack: scriptError?.stack,
            tabId: tab.id,
            chromeRuntimeLastError: chrome.runtime.lastError?.message,
            timestamp: Date.now()
          });
          // Use user-friendly error message
          const friendly = await createUserFriendlyError('scriptExecutionFailed', {
            error: scriptError
          });
        throw Object.assign(new Error(friendly.message), friendly);
        }
      }
      
      if (!pageData || !pageData.html) {
        const friendly = await createUserFriendlyError('noContentExtracted', {
          error: { message: 'No HTML data received from page' }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }

      log('=== handleSavePdf: Page data extracted ===', {
        hasPageData: !!pageData,
        hasHtml: !!pageData?.html,
        htmlLength: pageData?.html?.length || 0,
        url: pageData?.url,
        title: pageData?.title,
        tabUrl: tab.url,
        urlsMatch: pageData?.url === tab.url,
        timestamp: Date.now()
      });
      
      // CRITICAL: Always use URL and title from pageData (from executeScript or content script)
      // Content script returns { html, metadata: { url, title, ... }, images }; executeScript returns { html, url, title, images }
      if (pageData.metadata && !pageData.url) {
        pageData.url = pageData.metadata.url;
        if (pageData.metadata.title) pageData.title = pageData.metadata.title;
      }
      const actualUrl = pageData.url || pageData.metadata?.url;
      if (!actualUrl) {
        log('handleSavePdf: pageNotReady - no URL in page data', { hasPageData: !!pageData, pageDataKeys: pageData ? Object.keys(pageData) : [], hasMetadata: !!pageData?.metadata, metadataKeys: pageData?.metadata ? Object.keys(pageData.metadata) : [] });
        const friendly = await createUserFriendlyError('pageNotReady', {
          error: { message: 'No page URL found' }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }
      
      if (actualUrl.startsWith('chrome://') || actualUrl.startsWith('chrome-extension://') || actualUrl.startsWith('edge://') || actualUrl.startsWith('about:')) {
        log('handleSavePdf: pageNotReady - actual URL is restricted', { actualUrl });
        const friendly = await createUserFriendlyError('pageNotReady', {
          blockedPage: true,
          error: { message: 'Cannot extract content from browser internal pages' }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }
      
      // Log URL mismatch warning if URLs don't match
      if (tab.url && actualUrl !== tab.url) {
        log('=== handleSavePdf: URL mismatch detected ===', {
          pageDataUrl: actualUrl,
          tabUrl: tab.url,
          message: 'Page URL differs from tab URL - using page URL from executeScript result',
          willUsePageDataUrl: true,
          timestamp: Date.now()
        });
      }

      // Get Google API key if needed
      let googleApiKey = elements.googleApiKey ? /** @type {HTMLInputElement} */ (elements.googleApiKey).value.trim() : '';
      // If masked, decrypt the encrypted version from dataset
      if (googleApiKey.startsWith('****') && elements.googleApiKey && elements.googleApiKey.dataset.encrypted) {
        try {
          googleApiKey = await decryptApiKey(elements.googleApiKey.dataset.encrypted, 'google');
        } catch (error) {
          logError('Failed to decrypt Google API key', error);
          // Continue without Google API key if decryption fails
          googleApiKey = '';
        }
      }
      const outputFormat = elements.mainFormatSelect?.value || elements.outputFormat?.value || 'pdf';
      const translateImages = !!(elements.translateImages && /** @type {HTMLInputElement} */ (elements.translateImages).checked && elements.languageSelect && /** @type {HTMLSelectElement} */ (elements.languageSelect).value !== 'auto' && supportsImageTranslation(outputFormat));
      const imageTranslationProvider = elements.imageTranslationProvider?.value || DEFAULT_IMAGE_TRANSLATION_PROVIDER;
      let imageApiKey = translateImages ? googleApiKey : '';
      if (translateImages && imageTranslationProvider === 'openai') {
        const ownsOpenAiDraft = provider === 'openai' && apiKeyOwner === 'openai' &&
          elements.apiProviderSelect?.value === 'openai' && elements.apiKey?.dataset.provider === 'openai';
        if (ownsOpenAiDraft) imageApiKey = apiKey;
        else {
          imageApiKey = await readStoredApiKey('openai_api_key');
        }
      }

      log('=== handleSavePdf: About to send processArticle message ===', {
        mode: elements.modeSelect ? /** @type {HTMLSelectElement} */ (elements.modeSelect).value : '',
        outputFormat: elements.mainFormatSelect ? /** @type {HTMLSelectElement} */ (elements.mainFormatSelect).value : (elements.outputFormat ? /** @type {HTMLSelectElement} */ (elements.outputFormat).value : 'pdf'),
        hasApiKey: !!apiKey,
        hasTabId: !!tab.id,
        tabId: tab.id,
        timestamp: Date.now()
      });

      // Send to background script for processing
      // CRITICAL: Use actualUrl (from pageData.url) which is the URL at the moment of button click
      // This ensures we process the correct page even if user switched tabs after opening popup
      if (!currentProvider()) return;
      const response = await chrome.runtime.sendMessage({
        action: 'processArticle',
        data: {
          html: pageData.html,
          url: actualUrl,  // Use actual page URL from executeScript result (at button click moment)
          title: pageData.title || tab.title,
          apiKey: apiKey,
          provider: provider,
          googleApiKey: googleApiKey,
          imageTranslationProvider,
          imageApiKey,
          model: model,
          mode: elements.modeSelect ? /** @type {HTMLSelectElement} */ (elements.modeSelect).value : '',
          useCache: elements.useCache ? /** @type {HTMLInputElement} */ (elements.useCache).checked : false,
          outputFormat,
          generateToc: elements.generateToc ? /** @type {HTMLInputElement} */ (elements.generateToc).checked : false,
          generateAbstract: elements.generateAbstract ? /** @type {HTMLInputElement} */ (elements.generateAbstract).checked : false,
          pageMode: elements.pageMode ? /** @type {HTMLSelectElement} */ (elements.pageMode).value : 'single',
          language: elements.languageSelect ? /** @type {HTMLSelectElement} */ (elements.languageSelect).value : 'auto',
          translateImages: translateImages,
          fontFamily: elements.fontFamily ? /** @type {HTMLSelectElement} */ (elements.fontFamily).value : 'Arial',
          fontSize: elements.fontSize ? /** @type {HTMLSelectElement} */ (elements.fontSize).value : '12pt',
          bgColor: elements.bgColor ? /** @type {HTMLInputElement} */ (elements.bgColor).value : '#ffffff',
          textColor: elements.textColor ? /** @type {HTMLInputElement} */ (elements.textColor).value : '#000000',
          headingColor: elements.headingColor ? /** @type {HTMLInputElement} */ (elements.headingColor).value : '#000000',
          linkColor: elements.linkColor ? /** @type {HTMLInputElement} */ (elements.linkColor).value : '#0066cc',
          stylePreset: elements.stylePreset ? /** @type {HTMLSelectElement} */ (elements.stylePreset).value : 'dark',
          tabId: tab.id,
          // Audio settings
          audioProvider: elements.audioProvider ? /** @type {HTMLSelectElement} */ (elements.audioProvider).value : 'openai',
          // CRITICAL: Get actual voice ID, not index
          // If audioVoice.value is a number (index), get the actual value from options
          audioVoice: (() => {
            const provider = elements.audioProvider ? /** @type {HTMLSelectElement} */ (elements.audioProvider).value : 'openai';
            if (!elements.audioVoice) {
              logWarn('[ClipAIble Processing] ===== NO AUDIO VOICE ELEMENT =====', {
                timestamp: Date.now(),
                provider,
                willUseDefault: getDefaultTtsVoice('openai')
              });
              return getDefaultTtsVoice('openai');
            }
            const audioVoiceEl = /** @type {HTMLSelectElement} */ (elements.audioVoice);
            const voiceValue = audioVoiceEl.value;
            const selectedIndex = audioVoiceEl.selectedIndex;
            const selectedOption = audioVoiceEl.options[selectedIndex];
            
            // DETAILED LOGGING: Voice value before processing
            log('[ClipAIble Processing] ===== EXTRACTING VOICE FROM UI =====', {
              timestamp: Date.now(),
              provider,
              voiceValue,
              voiceValueType: typeof voiceValue,
              selectedIndex,
              selectedOptionValue: selectedOption?.value,
              selectedOptionText: selectedOption?.textContent,
              datasetVoiceId: selectedOption?.dataset?.voiceId,
              isNumericIndex: /^\d+$/.test(String(voiceValue)),
              optionsCount: audioVoiceEl.options.length
            });
            
            // CRITICAL: Get voice ID from dataset.voiceId first (most reliable), then option.value
            // This ensures we always get the actual voice ID, not an index
            let finalVoice = null;
            
            if (selectedOption) {
              // Priority 1: dataset.voiceId (most reliable - always contains actual voice ID)
              if (selectedOption.dataset && selectedOption.dataset.voiceId) {
                finalVoice = selectedOption.dataset.voiceId;
                log('[ClipAIble Processing] ===== USING dataset.voiceId =====', {
                  timestamp: Date.now(),
                  provider,
                  datasetVoiceId: finalVoice,
                  VOICE_STRING: `VOICE="${finalVoice}"`,
                  isValidFormat: finalVoice.includes('_') || finalVoice.includes('-') || provider !== 'offline'
                });
              }
              // Priority 2: option.value (if not an index)
              else if (selectedOption.value && !/^\d+$/.test(String(selectedOption.value))) {
                finalVoice = selectedOption.value;
                log('[ClipAIble Processing] ===== USING option.value =====', {
                  timestamp: Date.now(),
                  provider,
                  optionValue: finalVoice,
                  VOICE_STRING: `VOICE="${finalVoice}"`,
                  isValidFormat: finalVoice.includes('_') || finalVoice.includes('-') || provider !== 'offline'
                });
              }
              // Priority 3: Use getVoiceIdByIndex if value is an index
              else if (selectedOption.value && /^\d+$/.test(String(selectedOption.value)) && settingsModule && settingsModule.getVoiceIdByIndex) {
                const voiceIdFromCache = settingsModule.getVoiceIdByIndex(provider, selectedIndex);
                if (voiceIdFromCache && (voiceIdFromCache.includes('_') || voiceIdFromCache.includes('-') || provider !== 'offline')) {
                  finalVoice = voiceIdFromCache;
                  log('[ClipAIble Processing] ===== USING getVoiceIdByIndex =====', {
                    timestamp: Date.now(),
                    provider,
                    selectedIndex,
                    voiceIdFromCache: finalVoice,
                    VOICE_STRING: `VOICE="${finalVoice}"`,
                    isValidFormat: true
                  });
                }
              }
            }
            
            // Fallback: if still no valid voice, use voiceValue if it's valid
            if (!finalVoice && voiceValue && !/^\d+$/.test(String(voiceValue))) {
              finalVoice = voiceValue;
              log('[ClipAIble Processing] ===== USING voiceValue as fallback =====', {
                timestamp: Date.now(),
                provider,
                voiceValue: finalVoice,
                VOICE_STRING: `VOICE="${finalVoice}"`
              });
            }
            
            // Final fallback: use default
            if (!finalVoice) {
              finalVoice = getDefaultTtsVoice(provider, elements.qwenModel?.value);
              logWarn('[ClipAIble Processing] ===== USING DEFAULT VOICE =====', {
                timestamp: Date.now(),
                provider,
                defaultVoice: finalVoice,
                VOICE_STRING: `VOICE="${finalVoice}"`,
                reason: 'No valid voice found in UI'
              });
            }
            
            log('[ClipAIble Processing] ===== VOICE EXTRACTED FROM UI =====', {
              timestamp: Date.now(),
              provider,
              finalVoice,
              VOICE_STRING: `VOICE="${finalVoice}"`, // Explicit string for visibility
              isValidFormat: finalVoice.includes('_') || finalVoice.includes('-') || provider !== 'offline',
              willSendToBackground: true
            });
            return finalVoice;
          })(),
          audioSpeed: parseFloat(elements.audioSpeed ? /** @type {HTMLInputElement} */ (elements.audioSpeed).value : '1.0'),
          audioFormat: 'mp3',
          elevenlabsApiKey: readApiKeyDraft(elements.elevenlabsApiKey),
          elevenlabsModel: elements.elevenlabsModel ? /** @type {HTMLSelectElement} */ (elements.elevenlabsModel).value : DEFAULT_ELEVENLABS_TTS_MODEL,
          elevenlabsFormat: elements.elevenlabsFormat ? /** @type {HTMLSelectElement} */ (elements.elevenlabsFormat).value : 'mp3_44100_192',
          elevenlabsStability: elements.elevenlabsStability ? parseFloat(/** @type {HTMLInputElement} */ (elements.elevenlabsStability).value) : 0.5,
          elevenlabsSimilarity: elements.elevenlabsSimilarity ? parseFloat(/** @type {HTMLInputElement} */ (elements.elevenlabsSimilarity).value) : 0.75,
          elevenlabsStyle: elements.elevenlabsStyle ? parseFloat(/** @type {HTMLInputElement} */ (elements.elevenlabsStyle).value) : 0.0,
          elevenlabsSpeakerBoost: elements.elevenlabsSpeakerBoost ? /** @type {HTMLInputElement} */ (elements.elevenlabsSpeakerBoost).checked : true,
          openaiInstructions: elements.openaiInstructions ? /** @type {HTMLTextAreaElement} */ (elements.openaiInstructions).value.trim() : null,
          googleTtsModel: elements.googleTtsModel ? /** @type {HTMLSelectElement} */ (elements.googleTtsModel).value : DEFAULT_GOOGLE_TTS_MODEL,
          googleTtsVoice: elements.googleTtsVoice ? /** @type {HTMLSelectElement} */ (elements.googleTtsVoice).value : 'Callirrhoe',
          googleTtsPrompt: elements.googleTtsPrompt ? /** @type {HTMLInputElement} */ (elements.googleTtsPrompt).value.trim() : null,
          respeecherTemperature: elements.respeecherTemperature ? parseFloat(/** @type {HTMLInputElement} */ (elements.respeecherTemperature).value) : 1.0,
          respeecherRepetitionPenalty: elements.respeecherRepetitionPenalty ? parseFloat(/** @type {HTMLInputElement} */ (elements.respeecherRepetitionPenalty).value) : 1.0,
          respeecherTopP: elements.respeecherTopP ? parseFloat(/** @type {HTMLInputElement} */ (elements.respeecherTopP).value) : 1.0,
          googleTtsApiKey: readApiKeyDraft(elements.googleTtsApiKey),
          geminiApiKey: elements.geminiApiKey?.dataset.encrypted || null,
          qwenApiKey: readApiKeyDraft(elements.qwenApiKey),
          qwenModel: elements.qwenModel?.value || DEFAULT_QWEN_TTS_MODEL,
          qwenWorkspaceId: elements.qwenWorkspaceId?.value.trim() || '',
          qwenRegion: elements.qwenRegion?.value || 'singapore',
          respeecherApiKey: readApiKeyDraft(elements.respeecherApiKey)
        }
      });
      
      log('=== handleSavePdf: processArticle response received ===', {
        hasResponse: !!response,
        responseType: typeof response,
        responseIsNull: response === null,
        responseIsUndefined: response === undefined,
        responseKeys: response && typeof response === 'object' ? Object.keys(response) : [],
        hasError: !!response?.error,
        error: response?.error,
        errorType: typeof response?.error,
        started: response?.started,
        timestamp: Date.now()
      });

      if (chrome.runtime.lastError) {
        logError('=== handleSavePdf: chrome.runtime.lastError after sendMessage ===', {
          error: chrome.runtime.lastError.message,
          timestamp: Date.now()
        });
        // Use user-friendly error message for communication failures
        const friendly = await createUserFriendlyError('scriptExecutionFailed', {
          error: { message: chrome.runtime.lastError?.message || 'Failed to communicate with background script' }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }

      if (response?.started !== true || response.success === false || (response.error && typeof response.error !== 'string')) {
        const translationKey = response?.translationKey || 'errorProcessingNotStarted';
        const translationParams = response?.translationParams || {};
        throw Object.assign(new Error(response?.error && typeof response.error === 'string' ? response.error : await t(translationKey, translationParams)), { translationKey, translationParams });
      } else if (response.error && typeof response.error === 'string') {
        if (response.translationKey) {
          throw Object.assign(new Error(response.error), { translationKey: response.translationKey, translationParams: response.translationParams || {} });
        }
        // Only treat as error if error is a non-empty string
        logError('=== handleSavePdf: Response contains error ===', {
          error: response.error,
          timestamp: Date.now()
        });
        
        // Try to determine error type from response error message
        const errorType = await determineErrorType(new Error(response.error), {
          responseError: true
        });
        const friendly = await createUserFriendlyError(errorType, {
          error: { message: response.error }
        });
        throw Object.assign(new Error(friendly.message), friendly);
      }
      admitted = true;
      if (attempt !== latestSaveAttempt) return;
      
      log('=== handleSavePdf: Processing started successfully ===', {
        timestamp: Date.now()
      });

      // Processing started in background
      // CRITICAL: For audio, defer polling and state check to avoid blocking user interactions
      // Audio generation has long-running WASM operations that should not be interrupted
      const isAudioFormat = outputFormat === 'audio';
      
      if (isAudioFormat) {
        // For audio, defer polling start to avoid blocking
        setTimeout(() => {
          if (!stateRefs.statePollingTimeout?.current) {
            startStatePolling();
          }
          // Defer state check as well
          setTimeout(async () => {
            await checkProcessingState();
          }, 0);
        }, 0);
      } else {
        // For non-audio, start polling immediately
        if (!stateRefs.statePollingTimeout?.current) {
          startStatePolling();
        }
        // Immediately check state to update UI
        await checkProcessingState();
      }

    } catch (error) {
      failed = true;
      if (attempt !== latestSaveAttempt || (elements.apiProviderSelect && elements.apiProviderSelect.value !== provider)) return;
      const errMsg = error?.message ?? String(error);
      const errStack = error?.stack ?? '';
      const errName = error?.name ?? 'Error';
      logError('=== handleSavePdf: EXCEPTION CAUGHT ===', {
        error: errMsg,
        errorStack: errStack,
        errorName: errName,
        timestamp: Date.now()
      });
      logError(`handleSavePdf error: ${errName} - ${errMsg}`, { stack: errStack });
      
      // Determine error type and get user-friendly message
      try {
        const errorType = await determineErrorType(error, {
          scriptError: error?.message?.includes('extractPageContent') || error?.message?.includes('timeout'),
          responseError: error?.message?.includes('response') || error?.message?.includes('processArticle')
        });
        
        const userFriendlyMessage = await getUserFriendlyError(errorType, {
          error: error
        });
        if (attempt !== latestSaveAttempt) return;
        
        const translation = getUserFriendlyErrorDescriptor(errorType, { error });
        setStatus('error', userFriendlyMessage, undefined, translation);
        showToast(userFriendlyMessage, 'error', translation);
      } catch (errorHandlingError) {
        // Fallback to original error message if user-friendly message generation fails
        logError('Failed to generate user-friendly error message', errorHandlingError);
        const fallbackMessage = error?.message || await t('errorUnknown', undefined);
        if (attempt !== latestSaveAttempt) return;
        setStatus('error', fallbackMessage, undefined);
        showToast(fallbackMessage, 'error');
      }
      
    } finally {
      if (!admitted && attempt === latestSaveAttempt) {
        if (elements.savePdfBtn) /** @type {HTMLButtonElement} */ (elements.savePdfBtn).disabled = false;
        if (preparing && !failed) {
          const readyText = await t('ready');
          if (attempt === latestSaveAttempt) {
            setStatus('ready', readyText, undefined, { key: 'ready' });
            setProgress(0, false);
          }
        }
      }
    }
  }

  return {
    handleCancel,
    handleSavePdf,
    extractPageContent
  };
}

