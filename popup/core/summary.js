// @ts-check
// Summary management module
// Handles summary generation, display, and user interactions

import { tSync } from '../../scripts/locales.js';

/**
 * Initialize summary module
 * @param {Object} deps - Dependencies
 * @returns {Object} Summary functions
 */
export function initSummary(deps) {
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
    sanitizeMarkdownHtml,
    CONFIG
  } = deps;

  // Toggle summary expand/collapse
  function toggleSummary() {
    if (!elements.summaryContent || !elements.summaryToggle) return;
    
    const isExpanded = elements.summaryContent.classList.contains('expanded');
    const toggleIcon = elements.summaryToggle.querySelector('.summary-toggle-icon');
    
    if (isExpanded) {
      elements.summaryContent.classList.remove('expanded');
      if (toggleIcon) toggleIcon.textContent = '▶';
    } else {
      elements.summaryContent.classList.add('expanded');
      if (toggleIcon) toggleIcon.textContent = '▼';
    }
  }

  // Close summary
  async function closeSummary() {
    if (!elements.summaryContainer) return;
    
    try {
      // Hide summary container
      elements.summaryContainer.style.display = 'none';
      
      // Clear summary text
      if (elements.summaryText) {
        elements.summaryText.innerHTML = '';
        elements.summaryText.dataset.originalMarkdown = '';
      }
      
      // Clear summary from storage completely
      await chrome.storage.local.remove([STORAGE_KEYS.SUMMARY_TEXT, 'summary_saved_timestamp']);
      
      log('Summary closed and cleared completely');
    } catch (error) {
      logError('Failed to close summary', error);
    }
  }

  // Copy summary to clipboard
  async function copySummary() {
    if (!elements.summaryText) return;
    
    // Get original markdown text from data attribute, fallback to textContent
    const text = elements.summaryText.dataset.originalMarkdown || 
                 elements.summaryText.textContent || 
                 elements.summaryText.innerText;
    if (!text) return;
    
    try {
      await navigator.clipboard.writeText(text);
      const copiedText = await t('copiedToClipboard') || 'Copied to clipboard';
      showToast(copiedText, 'success');
    } catch (error) {
      logError('Failed to copy summary', error);
      const errorText = await t('copyFailed') || 'Failed to copy';
      showToast(errorText, 'error');
    }
  }

  // Download summary as markdown
  async function downloadSummary() {
    if (!elements.summaryText) return;
    
    // Get original markdown text from data attribute, fallback to textContent
    const text = elements.summaryText.dataset.originalMarkdown || 
                 elements.summaryText.textContent || 
                 elements.summaryText.innerText;
    if (!text) return;
    
    try {
      // Get title from state or use default
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      const title = (state && state.result && state.result.title) ? 
        state.result.title.replace(/[^\w\s-]/g, '').trim() : 'summary';
      
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}-summary.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(url);
      }
      
      const downloadedText = await t('downloaded') || 'Downloaded';
      showToast(downloadedText, 'success');
    } catch (error) {
      logError('Failed to download summary', error);
      const errorText = await t('downloadFailed') || 'Failed to download';
      showToast(errorText, 'error');
    }
  }

  // Check summary generation status from storage AND processingState
  async function checkSummaryStatus() {
    try {
      // CRITICAL: Summary generation now uses ONLY summary_generating flag
      // It does NOT use processingState to avoid interfering with document generation UI
      const storageResult = await chrome.storage.local.get([
        STORAGE_KEYS.SUMMARY_GENERATING,
        STORAGE_KEYS.SUMMARY_TEXT,
        'summary_generating_start_time',
        'summary_saved_timestamp'
      ]);
      
      const isSummaryGenerating = storageResult[STORAGE_KEYS.SUMMARY_GENERATING];
      
      // Check if generation flag is stale
      // CRITICAL: Use shorter threshold - summary should not take more than 15 minutes
      // If it takes longer, it's likely stuck or failed
      const STALE_THRESHOLD = CONFIG.SUMMARY_STALE_THRESHOLD_MS;
      
      if (isSummaryGenerating) {
        // Check stale threshold
        if (!storageResult.summary_generating_start_time) {
          // No timestamp - flag is from old version or was set incorrectly, reset it
          logWarn('Summary generation flag has no timestamp in checkSummaryStatus, resetting', {});
          await chrome.storage.local.set({ 
            [STORAGE_KEYS.SUMMARY_GENERATING]: false,
            summary_generating_start_time: null
          });
        } else {
          const timeSinceStart = Date.now() - storageResult.summary_generating_start_time;
          
          if (timeSinceStart > STALE_THRESHOLD) {
            // Flag is stale - reset it
            logWarn('Summary generation flag is stale, resetting', { timeSinceStart });
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            
            // Ensure button is enabled after reset
            if (elements.generateSummaryBtn) {
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
            }
            // Exit early - flag was stale
            return;
          }
        }
      }
      
      // CRITICAL: Check if summary is generating (only from flag, not processingState)
      if (isSummaryGenerating && elements.generateSummaryBtn) {
        // Summary generation is in progress - show status
        const generatingText = await t('generatingSummary') || 'Generating summary...';
        elements.generateSummaryBtn.textContent = generatingText;
        elements.generateSummaryBtn.disabled = true;
        log('checkSummaryStatus: Generation in progress - button disabled', { text: generatingText });
      } else if (storageResult[STORAGE_KEYS.SUMMARY_TEXT] && !isSummaryGenerating && elements.summaryText && elements.summaryContainer) {
        // Summary exists and generation is not in progress - display it
        // CRITICAL: Double-check that generation is not in progress (race condition protection)
        const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
        if (doubleCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
          // Generation is in progress - don't show summary
          log('checkSummaryStatus: Generation in progress on double-check, skipping summary display');
          return;
        }
        
        // CRITICAL: Summary persists - always show if it exists and not generating
        const savedSummary = storageResult[STORAGE_KEYS.SUMMARY_TEXT];
        const currentMarkdown = elements.summaryText.dataset.originalMarkdown;
        const containerWasHidden = elements.summaryContainer.style.display === 'none';
        
        // Restore button when summary is ready
        if (elements.generateSummaryBtn) {
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
        }
        
        // Update content if it changed or container is hidden
        if (currentMarkdown !== savedSummary || containerWasHidden) {
          elements.summaryText.dataset.originalMarkdown = savedSummary;
          const htmlSummary = markdownToHtmlFn(savedSummary);
          // SECURITY: Sanitize HTML to prevent XSS attacks from AI-generated content
          const sanitizedHtml = sanitizeMarkdownHtml(htmlSummary);
          elements.summaryText.innerHTML = sanitizedHtml;
          elements.summaryContainer.style.display = 'block';
          
          // Preserve expanded state if content is the same
          const wasExpanded = elements.summaryContent.classList.contains('expanded');
          if (containerWasHidden || !currentMarkdown) {
            // New summary or container was hidden - collapse
            elements.summaryContent.classList.remove('expanded');
            const toggleIcon = elements.summaryToggle?.querySelector('.summary-toggle-icon');
            if (toggleIcon) toggleIcon.textContent = '▶';
          } else if (wasExpanded && currentMarkdown === savedSummary) {
            // Same content - restore expanded state
            elements.summaryContent.classList.add('expanded');
            const toggleIcon = elements.summaryToggle?.querySelector('.summary-toggle-icon');
            if (toggleIcon) toggleIcon.textContent = '▼';
          }
          
          log('checkSummaryStatus: Summary displayed', { summaryLength: savedSummary?.length || 0 });
        }
      } else if (!isSummaryGenerating && elements.generateSummaryBtn) {
        // CRITICAL: If generation is not in progress and no summary, ensure button is enabled
        // BUT: Only restore if button is currently disabled (to avoid race conditions)
        // Don't restore if button is already enabled or if we're in the middle of generation
        if (elements.generateSummaryBtn.disabled) {
          // Double-check: make sure generation really is not in progress
          // Check only summary_generating flag (summary does NOT use processingState)
          const doubleCheckStorage = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
          
          const doubleCheckGenerating = doubleCheckStorage[STORAGE_KEYS.SUMMARY_GENERATING];
          
          if (!doubleCheckGenerating) {
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            log('checkSummaryStatus: No generation in progress - button enabled');
          } else {
            // Flag was set between checks - keep button disabled
            elements.generateSummaryBtn.disabled = true;
            const generatingText = await t('generatingSummary') || 'Generating summary...';
            elements.generateSummaryBtn.textContent = generatingText;
            log('checkSummaryStatus: Generation flag found on double-check - button kept disabled');
          }
        }
      }
    } catch (error) {
      logWarn('Error checking summary status', error);
      // On error, ensure button is enabled
      if (elements.generateSummaryBtn) {
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
      }
    }
  }

  // Handle Generate Summary button click
  // This is a large function (630+ lines) that handles summary generation
  async function handleGenerateSummary() {
    if (!elements.generateSummaryBtn || !elements.summaryContainer) {
      logWarn('Summary elements not found');
      return;
    }
    
    // CRITICAL: Check all required UI elements before proceeding
    const requiredElements = [
      'modelSelect',
      'apiKey',
      'modeSelect',
      'useCache'
    ];
    
    const missingElements = requiredElements.filter(key => !elements[key]);
    if (missingElements.length > 0) {
      logError('Required UI elements not found', { missingElements });
      const errorText = await t('uiElementsNotFound') || 'Required UI elements not found. Please refresh the page.';
      showToast(errorText, 'error');
      return;
    }
    
    // Variables for API key and model (used for both extraction and summary generation)
    let apiKey = null;
    let model = null;
    let provider = null;
    
    try {
      // CRITICAL: Clear old summary from storage FIRST, then set generating flag
      // This prevents checkSummaryStatus and loadSettings from restoring old summary
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SUMMARY_GENERATING]: true,
        summary_generating_start_time: Date.now(),
        [STORAGE_KEYS.SUMMARY_TEXT]: null // Clear summary text
      });
      
      // Also explicitly remove from storage to ensure it's gone completely
      await chrome.storage.local.remove([STORAGE_KEYS.SUMMARY_TEXT, 'summary_saved_timestamp']);
      
      // CRITICAL: Clear old summary from UI
      // Hide summary container and clear content
      if (elements.summaryContainer) {
        elements.summaryContainer.style.display = 'none';
      }
      if (elements.summaryText) {
        elements.summaryText.innerHTML = '';
        elements.summaryText.dataset.originalMarkdown = '';
      }
      
      log('Old summary cleared from UI and storage before starting new generation');
      
      // CRITICAL: Disable button immediately and show status
      elements.generateSummaryBtn.disabled = true;
      const generatingText = await t('generatingSummary') || 'Generating summary...';
      elements.generateSummaryBtn.textContent = generatingText;
      log('Generate summary button clicked - flag set, button disabled and status updated', { text: generatingText });
      
      // Get current tab URL first - needed for validation
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      log('Tab query result', { 
        hasTab: !!tab, 
        tabId: tab?.id, 
        tabUrl: tab?.url,
        tabUrlType: typeof tab?.url,
        tabUrlLength: tab?.url?.length
      });
      
      if (!tab) {
        // CRITICAL: Clear generating flag if tab is not available
        await chrome.storage.local.set({ 
          [STORAGE_KEYS.SUMMARY_GENERATING]: false,
          summary_generating_start_time: null
        });
        
        logError('No tab found when generating summary');
        const noTabText = await t('noTabAvailable') || 'No active tab found. Please open a web page.';
        showToast(noTabText, 'error');
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
        return;
      }
      
      // Check if URL is accessible (not chrome://, about:, etc.)
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        // CRITICAL: Clear generating flag if URL is not accessible
        await chrome.storage.local.set({ 
          [STORAGE_KEYS.SUMMARY_GENERATING]: false,
          summary_generating_start_time: null
        });
        
        logError('Tab URL is not accessible for content extraction', { url: tab.url, tabId: tab.id });
        const inaccessibleText = await t('pageNotAccessible') || 'This page is not accessible for content extraction. Please open a regular web page.';
        showToast(inaccessibleText, 'error');
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
        return;
      }
      
      const currentUrl = tab.url; // CRITICAL: Store URL for use in generateSummary
      
      // Normalize URLs for comparison (remove trailing slashes, fragments, etc.)
      function normalizeUrl(url) {
        if (!url) return '';
        try {
          const urlObj = new URL(url);
          // Remove fragment, normalize path
          urlObj.hash = '';
          let path = urlObj.pathname;
          if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1);
          }
          urlObj.pathname = path;
          return urlObj.toString();
        } catch {
          return url;
        }
      }
      
      // CRITICAL: Always extract content first (never use cached content from state/storage)
      // Flow: User clicks "Generate Summary" -> Extract content (with cache if enabled) -> Generate summary
      // If cached selectors exist and useCache is enabled, they will be used for faster extraction
      // But content is always extracted fresh for summary generation
      let contentItems = null;
      
      // Check if it's YouTube or regular page
      {
        // Check if it's YouTube
        const videoInfo = detectVideoPlatform(tab.url);
        
        if (videoInfo && videoInfo.platform === 'youtube') {
          // Extract and process YouTube subtitles
          // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
          elements.generateSummaryBtn.disabled = true;
          
          // CRITICAL: Ensure content script is loaded before extracting subtitles
          // Content script should be loaded via manifest.json, but give it time
          // Try sending a test message to content script to verify it's loaded
          let contentScriptLoaded = false;
          try {
            const pingResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            if (pingResponse && pingResponse.success) {
              contentScriptLoaded = true;
              log('Content script is loaded and responding', { timestamp: pingResponse.timestamp });
            }
          } catch (pingError) {
            // Content script may not respond to ping - this is normal
            // Just give it some time to load
            logWarn('Content script ping failed or not responding (may be normal)', pingError);
          }
          
          // Small delay to ensure content script is loaded (if not already loaded)
          if (!contentScriptLoaded) {
            log('Waiting for content script to load...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          try {
            // CRITICAL: Call subtitle extraction through background script
            // This ensures correct context and access to content script
            // (same approach as PDF creation)
            const extractResponse = await chrome.runtime.sendMessage({
              action: 'extractYouTubeSubtitlesForSummary',
              data: { tabId: tab.id }
            });
            
            if (extractResponse.error) {
              throw new Error(extractResponse.error);
            }
            
            const subtitlesData = extractResponse.result;
            if (!subtitlesData || !subtitlesData.subtitles || subtitlesData.subtitles.length === 0) {
              // CRITICAL: Clear generating flag if no subtitles
              await chrome.storage.local.set({ 
                [STORAGE_KEYS.SUMMARY_GENERATING]: false,
                summary_generating_start_time: null
              });
              
              const noSubtitlesText = await t('errorNoSubtitles') || 'No subtitles found.';
              showToast(noSubtitlesText, 'error');
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
              return;
            }
            
            // CRITICAL: For YouTube, just convert subtitles to contentItems format
            // No selectors needed - subtitles are already extracted text
            // Then send generateSummary message directly
            contentItems = subtitlesData.subtitles.map(subtitle => ({
              type: 'paragraph',
              text: subtitle.text || subtitle
            }));
            
            // Get API key and model for summary generation
            model = elements.modelSelect.value;
            provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
            apiKey = elements.apiKey.value.trim();
            
            if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
              try {
                apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
              } catch (error) {
                logError('Failed to decrypt API key', error);
                
                // CRITICAL: Clear generating flag on error
                await chrome.storage.local.set({ 
                  [STORAGE_KEYS.SUMMARY_GENERATING]: false,
                  summary_generating_start_time: null
                });
                
                const failedDecryptText = await t('failedToDecryptApiKey') || 'Failed to decrypt API key';
                showToast(failedDecryptText, 'error');
                elements.generateSummaryBtn.disabled = false;
                const generateSummaryText = await t('generateSummary') || 'Generate Summary';
                elements.generateSummaryBtn.textContent = generateSummaryText;
                return;
              }
            }
            
            if (!apiKey) {
              // CRITICAL: Clear generating flag if no API key
              await chrome.storage.local.set({ 
                [STORAGE_KEYS.SUMMARY_GENERATING]: false,
                summary_generating_start_time: null
              });
              
              const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'AI';
              const pleaseEnterKeyText = await t(`pleaseEnter${providerName}ApiKey`) || `Please enter ${providerName} API key`;
              showToast(pleaseEnterKeyText, 'error');
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
              return;
            }
            
            // CRITICAL: For YouTube, send generateSummary message directly with subtitles
            // No need for extractContentOnly - subtitles are already extracted text
            // Generation will continue in background
            const targetLanguage = elements.languageSelect?.value || 'auto';
            const uiLanguage = await getUILanguage();
            const summaryLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
            
            log('Sending generateSummary for YouTube subtitles', {
              contentItemsCount: contentItems?.length || 0,
              model: model,
              url: currentUrl,
              language: summaryLanguage
            });
            
            try {
              const response = await chrome.runtime.sendMessage({
                action: 'generateSummary',
                data: {
                  contentItems: contentItems,
                  apiKey: apiKey,
                  model: model,
                  url: currentUrl,
                  language: summaryLanguage
                }
              });
              
              log('generateSummary message sent for YouTube, received immediate response', { 
                started: response?.started,
                error: response?.error 
              });
              
              if (response?.error) {
                throw new Error(response.error);
              }
              
              if (!response?.started) {
                const uiLang = await getUILanguage();
                throw new Error(tSync('errorSummaryGenerationFailed', uiLang));
              }
              
              // CRITICAL: Generation started in background - exit and let checkSummaryStatus handle completion
              log('Summary generation started in background for YouTube, exiting - checkSummaryStatus will handle completion');
              return; // Exit - checkSummaryStatus will poll and handle completion
            } catch (sendError) {
              logError('Failed to send generateSummary message for YouTube', sendError);
              
              // Clear flag on error
              await chrome.storage.local.set({ 
                [STORAGE_KEYS.SUMMARY_GENERATING]: false,
                summary_generating_start_time: null
              });
              
              const errorText = await t('summaryGenerationError') || 'Error starting summary generation';
              showToast(errorText, 'error');
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
              return;
            }
          } catch (error) {
            logError('Failed to extract/process YouTube subtitles', error);
            
            // CRITICAL: Clear generating flag on error
            await chrome.storage.local.set({ 
              [STORAGE_KEYS.SUMMARY_GENERATING]: false,
              summary_generating_start_time: null
            });
            
            const errorText = await t('errorSubtitleProcessingFailed') || 'Failed to process subtitles';
            showToast(errorText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
        } else {
          // Regular page - extract content first
          log('Regular page detected, starting content extraction for summary', {
            url: tab.url,
            tabId: tab.id
          });
          
          // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
          elements.generateSummaryBtn.disabled = true;
          
          // Get page data
          log('About to execute script to get page HTML...');
          const htmlResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              html: document.documentElement.outerHTML,
              url: window.location.href,
              title: document.title
            })
          });
          
          if (!htmlResult || !htmlResult[0] || !htmlResult[0].result) {
            const noContentText = await t('noContentAvailable') || 'No content available.';
            showToast(noContentText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
          
          log('HTML extraction script executed', {
            hasResult: !!htmlResult,
            hasFirstResult: !!htmlResult?.[0],
            hasResultData: !!htmlResult?.[0]?.result
          });
          
          const pageData = htmlResult[0].result;
          
          log('Page data extracted', {
            hasHtml: !!pageData?.html,
            htmlLength: pageData?.html?.length || 0,
            url: pageData?.url,
            title: pageData?.title
          });
          
          // Get API key and model (will be used for both extraction and summary generation)
          model = elements.modelSelect.value;
          provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
          apiKey = elements.apiKey.value.trim();
          
          if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
            try {
              apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
            } catch (error) {
              logError('Failed to decrypt API key', error);
              const failedDecryptText = await t('failedToDecryptApiKey') || 'Failed to decrypt API key';
              showToast(failedDecryptText, 'error');
              elements.generateSummaryBtn.disabled = false;
              const generateSummaryText = await t('generateSummary') || 'Generate Summary';
              elements.generateSummaryBtn.textContent = generateSummaryText;
              return;
            }
          }
          
          if (!apiKey) {
            const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'gemini' ? 'Gemini' : 'AI';
            const pleaseEnterKeyText = await t(`pleaseEnter${providerName}ApiKey`) || `Please enter ${providerName} API key`;
            showToast(pleaseEnterKeyText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
          
          // Start extraction process (content only, no file generation)
          // CRITICAL: Keep button disabled and status unchanged - no intermediate status updates
          elements.generateSummaryBtn.disabled = true;
          
          log('About to send extractContentOnly request', {
            hasHtml: !!pageData.html,
            htmlLength: pageData.html?.length || 0,
            url: pageData.url,
            title: pageData.title,
            hasApiKey: !!apiKey,
            hasModel: !!model,
            mode: elements.modeSelect.value,
            tabId: tab.id
          });
          
          // Send extraction request (content only, no file generation)
          let extractResponse;
          try {
            log('Calling chrome.runtime.sendMessage for extractContentOnly...');
            // CRITICAL: Request auto-generate summary after extraction
            // This allows popup to close and summary will generate in background
            const targetLanguage = elements.languageSelect?.value || 'auto';
            const uiLanguage = await getUILanguage();
            const summaryLanguage = targetLanguage !== 'auto' ? targetLanguage : uiLanguage;
            
            extractResponse = await chrome.runtime.sendMessage({
              action: 'extractContentOnly',
              data: {
                html: pageData.html,
                url: pageData.url,
                title: pageData.title || tab.title,
                apiKey: apiKey,
                provider: provider,
                model: model,
                mode: elements.modeSelect.value,
                useCache: elements.useCache.checked,
                tabId: tab.id,
                autoGenerateSummary: true, // CRITICAL: Auto-generate summary after extraction
                language: summaryLanguage
              }
            });
            
            // Check for chrome.runtime.lastError
            if (chrome.runtime.lastError) {
              logError('extractContentOnly sendMessage error', chrome.runtime.lastError);
              throw new Error(chrome.runtime.lastError.message || 'Failed to communicate with background script');
            }
            
            log('extractContentOnly response received', {
              hasResponse: !!extractResponse,
              hasError: !!extractResponse?.error,
              hasResult: !!extractResponse?.result,
              hasContent: !!extractResponse?.result?.content,
              contentLength: extractResponse?.result?.content?.length || 0,
              responseType: typeof extractResponse,
              responseKeys: extractResponse ? Object.keys(extractResponse) : []
            });
          } catch (sendError) {
            logError('extractContentOnly sendMessage failed', sendError);
            logError('sendError details', {
              message: sendError.message,
              stack: sendError.stack,
              name: sendError.name,
              lastError: chrome.runtime.lastError?.message
            });
            throw sendError;
          }
          
          log('After extractContentOnly try-catch block', {
            hasExtractResponse: !!extractResponse,
            extractResponseType: typeof extractResponse,
            isNull: extractResponse === null,
            isUndefined: extractResponse === undefined,
            lastError: chrome.runtime.lastError?.message
          });
          
          // Check for chrome.runtime.lastError AFTER await (it might be set after async operation)
          if (chrome.runtime.lastError) {
            logError('extractContentOnly chrome.runtime.lastError after await', chrome.runtime.lastError);
            throw new Error(chrome.runtime.lastError.message || 'Failed to communicate with background script');
          }
          
          if (!extractResponse) {
            logError('extractContentOnly returned null/undefined response', {
              lastError: chrome.runtime.lastError?.message,
              responseType: typeof extractResponse
            });
            const uiLang = await getUILanguage();
            throw new Error(tSync('errorNoResponseFromBackground', uiLang));
          }
          
          if (extractResponse.error) {
            logError('extractContentOnly returned error', extractResponse.error);
            throw new Error(extractResponse.error);
          }
          
          // CRITICAL: If extracting: true, background is handling extraction asynchronously
          // Don't check result - just exit and let checkSummaryStatus poll for completion
          if (extractResponse.extracting === true) {
            log('extractContentOnly started async extraction - background will handle summary generation', {
              success: extractResponse.success,
              extracting: extractResponse.extracting,
              timestamp: Date.now()
            });
            
            // CRITICAL: Exit here - background will handle extraction and summary generation
            // extractContentOnly with autoGenerateSummary: true automatically starts summary generation
            // checkSummaryStatus will poll and show result when ready
            return;
          }
          
          // If not async extraction, check result synchronously
          if (!extractResponse.result || !extractResponse.result.content || !Array.isArray(extractResponse.result.content) || extractResponse.result.content.length === 0) {
            logWarn('extractContentOnly returned empty or invalid content', {
              hasResult: !!extractResponse?.result,
              hasContent: !!extractResponse?.result?.content,
              isArray: Array.isArray(extractResponse?.result?.content),
              length: extractResponse?.result?.content?.length || 0
            });
            const noContentText = await t('noContentAvailable') || 'Failed to extract content.';
            showToast(noContentText, 'error');
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            return;
          }
          
          contentItems = extractResponse.result.content;
          log('Content extracted successfully for summary', { 
            contentItemsCount: contentItems?.length || 0,
            hasApiKey: !!apiKey,
            hasModel: !!model,
            contentItemsType: typeof contentItems,
            isArray: Array.isArray(contentItems),
            apiKeyValue: apiKey ? 'present' : 'missing',
            modelValue: model || 'missing',
            autoGenerateSummary: true // Background will auto-generate summary
          });
          
          // CRITICAL: Summary generation is handled automatically by background
          // Background received autoGenerateSummary: true flag and will start generation
          // Popup can close now - summary will generate in background
          log('extractContentOnly completed with autoGenerateSummary flag - background will handle summary generation', {
            contentItemsCount: contentItems?.length || 0,
            timestamp: Date.now()
          });
          
          // CRITICAL: Exit here - background will handle summary generation
          // extractContentOnly with autoGenerateSummary: true automatically starts summary generation
          // checkSummaryStatus will poll and show result when ready
          return;
        }
      }
      
    } catch (error) {
      logError('Error generating summary', error);
      
      // Clear generating flag on error
      try {
        await chrome.storage.local.set({ 
          [STORAGE_KEYS.SUMMARY_GENERATING]: false,
          summary_generating_start_time: null
        });
      } catch (storageError) {
        logError('Failed to clear summary_generating flag on error', storageError);
      }
      
      // Show user-friendly error message
      let errorText;
      if (error.message && error.message.includes('Required UI elements not found')) {
        errorText = await t('uiElementsNotFound') || 'Required UI elements not found. Please refresh the page.';
      } else if (error.message) {
        errorText = error.message;
      } else {
        errorText = await t('summaryGenerationError') || 'Error generating summary';
      }
      
      showToast(errorText, 'error');
      
      // Restore button
      if (elements.generateSummaryBtn) {
        elements.generateSummaryBtn.disabled = false;
        const generateSummaryText = await t('generateSummary') || 'Generate Summary';
        elements.generateSummaryBtn.textContent = generateSummaryText;
      }
    } finally {
      // CRITICAL: Restore button only if generation is not in progress
      // Check storage to see if generation is still in progress (may continue in background)
      // Use double-check to avoid race conditions
      try {
        const checkResult = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING, 'summary_generating_start_time']);
        
        // CRITICAL: Only restore button if flag is definitely false AND we're not in a race condition
        // If flag is true, keep button disabled - generation is in progress
        if (!checkResult[STORAGE_KEYS.SUMMARY_GENERATING]) {
          // Double-check: wait a tiny bit and check again to avoid race condition
          // where flag was just set but not yet visible
          await new Promise(resolve => setTimeout(resolve, 100));
          const doubleCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
          
          if (!doubleCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
            // Generation is complete or not in progress - restore button
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
            log('Summary generation complete - button restored (double-checked)');
          } else {
            // Flag was set between checks - keep button disabled
            elements.generateSummaryBtn.disabled = true;
            const generatingText = await t('generatingSummary') || 'Generating summary...';
            elements.generateSummaryBtn.textContent = generatingText;
            log('Summary generation flag found on double-check - button kept disabled');
          }
        } else {
          // Generation is still in progress - keep button disabled and show status
          elements.generateSummaryBtn.disabled = true;
          const generatingText = await t('generatingSummary') || 'Generating summary...';
          elements.generateSummaryBtn.textContent = generatingText;
          log('Summary generation still in progress - button remains disabled');
        }
      } catch (checkError) {
        // If check fails, check one more time before restoring
        logWarn('Failed to check summary generation status, checking once more', checkError);
        try {
          const finalCheck = await chrome.storage.local.get([STORAGE_KEYS.SUMMARY_GENERATING]);
          if (!finalCheck[STORAGE_KEYS.SUMMARY_GENERATING]) {
            elements.generateSummaryBtn.disabled = false;
            const generateSummaryText = await t('generateSummary') || 'Generate Summary';
            elements.generateSummaryBtn.textContent = generateSummaryText;
          } else {
            // Keep disabled if flag is set
            elements.generateSummaryBtn.disabled = true;
            const generatingText = await t('generatingSummary') || 'Generating summary...';
            elements.generateSummaryBtn.textContent = generatingText;
          }
        } catch (finalError) {
          // Last resort - restore button only if we can't check
          logWarn('Final check also failed, restoring button', finalError);
          elements.generateSummaryBtn.disabled = false;
          const generateSummaryText = await t('generateSummary') || 'Generate Summary';
          elements.generateSummaryBtn.textContent = generateSummaryText;
        }
      }
    }
  }

  return {
    handleGenerateSummary,
    toggleSummary,
    closeSummary,
    copySummary,
    downloadSummary,
    checkSummaryStatus
  };
}

