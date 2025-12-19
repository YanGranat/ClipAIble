// Core business logic for popup
// This module contains all business logic functions that handle
// content processing, summary generation, and state management

/**
 * Initialize core module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements
 * @param {Object} deps.STORAGE_KEYS - Storage keys constants
 * @param {Function} deps.t - Translation function
 * @param {Function} deps.getUILanguage - Get UI language function
 * @param {Function} deps.logError - Error logging function
 * @param {Function} deps.log - Log function
 * @param {Function} deps.logWarn - Warning logging function
 * @param {Function} deps.showToast - Show toast notification function
 * @param {Function} deps.setStatus - Set status function
 * @param {Function} deps.setProgress - Set progress function
 * @param {Function} deps.stopTimerDisplay - Stop timer display function
 * @param {Function} deps.startTimerDisplay - Start timer display function
 * @param {Function} deps.decryptApiKey - Decrypt API key function
 * @param {Function} deps.getProviderFromModel - Get provider from model function
 * @param {Function} deps.detectVideoPlatform - Detect video platform function
 * @param {Function} deps.markdownToHtml - Markdown to HTML converter
 * @param {Function} deps.sanitizeMarkdownHtml - Sanitize markdown HTML function
 * @param {Object} deps.CONFIG - Configuration object
 * @param {Object} deps.stateRefs - State references object (for statePollingTimeout, timerInterval, currentStartTime)
 * @returns {Object} Core functions
 */
export function initCore(deps) {
  const {
    elements,
    STORAGE_KEYS,
    t,
    getUILanguage,
    logError,
    log,
    logWarn,
    showToast,
    setStatus,
    setProgress,
    stopTimerDisplay,
    startTimerDisplay,
    decryptApiKey,
    getProviderFromModel,
    detectVideoPlatform,
    markdownToHtml,
    sanitizeMarkdownHtml,
    CONFIG,
    stateRefs
  } = deps;

  // Format seconds to MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Markdown to HTML converter
  function markdownToHtmlLocal(markdown) {
    if (!markdown) return '';
    
    let html = markdown;
    
    // Code blocks first (to avoid processing markdown inside code)
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      const id = `CODE_BLOCK_${codeBlocks.length}`;
      codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
      return id;
    });
    
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Headers (process from largest to smallest to avoid conflicts)
    // Process headers BEFORE converting newlines to preserve structure
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Horizontal rules (--- or ***)
    html = html.replace(/^(\s*[-*]{3,}\s*)$/gm, '<hr>');
    
    // Bold (must come before italic)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic (single asterisk/underscore, but not inside code)
    html = html.replace(/(?<!`)(?<!\*)\*(?!\*)([^*`]+?)(?<!\*)\*(?!\*)(?!`)/g, '<em>$1</em>');
    html = html.replace(/(?<!`)(?<!_)_(?!_)([^_`]+?)(?<!_)_(?!_)(?!`)/g, '<em>$1</em>');
    
    // Restore code blocks
    codeBlocks.forEach((codeBlock, index) => {
      html = html.replace(`CODE_BLOCK_${index}`, codeBlock);
    });
    
    // Convert newlines to <br> - but preserve headers and horizontal rules (they already have their own structure)
    // Split by lines and process each line
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      // If line is already a header tag or horizontal rule, don't add <br> after it
      if (line.match(/^<(h[1-6])>.*<\/\1>$/)) {
        return line;
      }
      if (line.trim() === '<hr>') {
        return line;
      }
      // Otherwise, convert newline to <br> at the end
      return line + '<br>';
    });
    
    html = processedLines.join('');
    
    // Clean up: remove <br> before closing header tags and before/after horizontal rules
    html = html.replace(/<br><\/(h[1-6])>/g, '</$1>');
    html = html.replace(/<br><hr>/g, '<hr>');
    html = html.replace(/<hr><br>/g, '<hr>');
    
    return html;
  }

  // Use provided markdownToHtml or fallback to local
  const markdownToHtmlFn = markdownToHtml || markdownToHtmlLocal;

  // Handle Cancel button click
  async function handleCancel() {
    if (!elements.cancelBtn) {
      logWarn('Cancel button not found');
      return;
    }
    try {
      // Disable button to prevent double-clicks
      elements.cancelBtn.disabled = true;
      await chrome.runtime.sendMessage({ action: 'cancelProcessing' });
      const cancelledText = await t('processingCancelled');
      showToast(cancelledText, 'success');
      const readyText = await t('ready');
      setStatus('ready', readyText);
      setProgress(0, false);
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
        elements.cancelBtn.disabled = false; // Re-enable for next time
      }
    } catch (error) {
      logError('Error cancelling', error);
      if (elements.cancelBtn) {
        elements.cancelBtn.disabled = false; // Re-enable on error
      }
    }
  }

  // Handle Generate Summary button click
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
                throw new Error('Summary generation failed to start');
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
            throw new Error('No response from background script. Service worker may have died.');
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

  // Check processing state
  async function checkProcessingState() {
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      await updateUIFromState(state);
    } catch (error) {
      logError('Error getting state from background', error);
      // Fallback: try to load from storage
      try {
        const stored = await chrome.storage.local.get(['processingState']);
        if (stored.processingState) {
          const savedState = stored.processingState;
          const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
          
          // If state is recent (< 2 minutes), show it
          if (timeSinceUpdate < 2 * 60 * 1000 && savedState.isProcessing) {
            updateUIFromState(savedState);
          }
        }
      } catch (storageError) {
        logError('Error loading from storage', storageError);
      }
    }
  }

  // Start polling for state updates
  function startStatePolling() {
    // Clear existing timeout
    if (stateRefs.statePollingTimeout) {
      clearTimeout(stateRefs.statePollingTimeout);
    }
    
    let pollInterval = 2000; // Default 2s for idle (increased from 1s to reduce load)
    let failedAttempts = 0;
    let lastState = null; // Track last state for adaptive polling
    let noChangeCount = 0; // Count consecutive polls with no changes
    let isPolling = false; // Flag to prevent concurrent poll() calls
    
    async function poll() {
      // Prevent concurrent calls
      if (isPolling) {
        return;
      }
      
      isPolling = true;
      try {
        const state = await chrome.runtime.sendMessage({ action: 'getState' });
        
        // Check if state changed
        const stateChanged = JSON.stringify(state) !== JSON.stringify(lastState);
        
        if (stateChanged) {
          // State changed - reset adaptive polling
          noChangeCount = 0;
          await updateUIFromState(state);
          lastState = state;
          
          // Use faster polling when processing (increased from 300ms to 500ms)
          pollInterval = state.isProcessing ? 500 : 2000;
        } else {
          // State didn't change - increase interval (adaptive polling)
          noChangeCount++;
          
          // Exponential backoff: 500ms → 750ms → 1125ms → 1687ms → 2000ms (for processing)
          // For idle: 2000ms (no backoff needed)
          if (state.isProcessing) {
            pollInterval = Math.min(500 * Math.pow(1.5, noChangeCount), 2000);
          } else {
            pollInterval = 2000; // Keep 2s for idle state
          }
        }
        
        failedAttempts = 0;
        
        // Check summary generation status from storage
        await checkSummaryStatus();
        
      } catch (error) {
        failedAttempts++;
        logWarn('Failed to get state from background', { attempt: failedAttempts });
        
        // After 3 failed attempts, try storage
        if (failedAttempts >= 3) {
          try {
            const stored = await chrome.storage.local.get(['processingState']);
            if (stored.processingState && stored.processingState.isProcessing) {
              const timeSinceUpdate = Date.now() - (stored.processingState.lastUpdate || 0);
              if (timeSinceUpdate < 2 * 60 * 1000) {
                await updateUIFromState(stored.processingState);
              }
            }
          } catch (e) {
            // Ignore storage errors
          }
        }
        
        // Check summary status even on errors
        await checkSummaryStatus();
        
        // Increase interval on errors
        pollInterval = Math.min(pollInterval * 2, 5000);
      } finally {
        // Always reset polling flag to allow next poll
        isPolling = false;
      }
      
      // Schedule next poll
      stateRefs.statePollingTimeout = setTimeout(poll, pollInterval);
    }
    
    poll();
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

  // Update UI based on processing state
  async function updateUIFromState(state) {
    if (!state) return;
    const stageLabel = await mapStageLabel(state.currentStage);
    const statusText = stageLabel || state.status;
    
    if (state.isProcessing) {
      // Use startTime from background (persists across popup reopens)
      if (state.startTime) {
        if (stateRefs.currentStartTime !== state.startTime) {
          startTimerDisplay(state.startTime);
        }
        // Ensure timer is running even if startTime was already set
        if (!stateRefs.timerInterval && state.startTime) {
          startTimerDisplay(state.startTime);
        }
      }
      elements.savePdfBtn.disabled = true;
      elements.savePdfBtn.style.display = 'none';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'block';
        elements.cancelBtn.disabled = false;
      }
      setStatus('processing', statusText, state.startTime || stateRefs.currentStartTime);
      setProgress(state.progress);
    } else if (state.error) {
      // Check if error is actually a cancellation - don't show as error
      const isCancelled = state.isCancelled || 
                         (state.error && (
                           state.error.includes('Cancelled') || 
                           state.error.includes('Отменено') || 
                           state.error.includes('Скасовано') ||
                           state.error.includes('Abgebrochen') ||
                           state.error.includes('Annulé') ||
                           state.error.includes('Cancelado') ||
                           state.error.includes('Annullato') ||
                           state.error.includes('已取消') ||
                           state.error.includes('キャンセル') ||
                           state.error.includes('취소됨')
                         ));
      
      if (isCancelled) {
        // Treat cancellation as ready state, not error
        stopTimerDisplay();
        elements.savePdfBtn.disabled = false;
        elements.savePdfBtn.style.display = 'block';
        if (elements.cancelBtn) {
          elements.cancelBtn.style.display = 'none';
        }
        const readyText = await t('ready');
        setStatus('ready', readyText);
        setProgress(0, false);
      } else {
        // Real error - show as error
        stopTimerDisplay();
        elements.savePdfBtn.disabled = false;
        elements.savePdfBtn.style.display = 'block';
        if (elements.cancelBtn) {
          elements.cancelBtn.style.display = 'none';
        }
        // Use localized error message if errorCode is available
        let errorMessage = state.error;
        if (state.errorCode) {
          const errorKeyMap = {
            'auth_error': 'errorAuth',
            'rate_limit': 'errorRateLimit',
            'timeout': 'errorTimeout',
            'network_error': 'errorNetwork',
            'parse_error': 'errorParse',
            'provider_error': 'errorProvider',
            'validation_error': 'errorValidation',
            'unknown_error': 'errorUnknown'
          };
          const errorKey = errorKeyMap[state.errorCode];
          if (errorKey) {
            errorMessage = await t(errorKey).catch(() => state.error);
          }
        }
        setStatus('error', errorMessage);
        setProgress(0, false);
      }
    } else if (state.status === 'Done!') {
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      // Get saved format from state or current selection
      const savedFormat = state.outputFormat || elements.mainFormatSelect?.value || elements.outputFormat?.value || 'pdf';
      const formatNames = {
        pdf: await t('saveAsPdf'),
        epub: await t('saveAsEpub'),
        fb2: await t('saveAsFb2'),
        markdown: await t('saveAsMarkdown'),
        audio: await t('saveAsAudio')
      };
      const formatName = formatNames[savedFormat] || formatNames.pdf;
      // Extract format name without "Save as" prefix
      const formatNameOnly = formatName.replace(/^(Save as|Сохранить как|Зберегти як|Speichern als|Enregistrer|Guardar|Salva|Salvar|另存为|として保存|로 저장)\s+/i, '');
      const savedText = await t('savedSuccessfully');
      const successMessage = `${formatNameOnly} ${savedText}`;
      setStatus('ready', successMessage);
      setProgress(0, false); // Hide progress bar immediately
    } else {
      stopTimerDisplay();
      elements.savePdfBtn.disabled = false;
      elements.savePdfBtn.style.display = 'block';
      if (elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
      }
      const readyText = await t('ready');
      setStatus('ready', readyText);
      setProgress(0, false);
    }
  }

  async function mapStageLabel(stageId) {
    switch (stageId) {
      case 'starting': return await t('stageStarting');
      case 'analyzing': return await t('stageAnalyzing');
      case 'extracting': return await t('stageExtracting');
      case 'translating': return await t('stageTranslating');
      case 'loading_images': return await t('stageLoadingImages');
      case 'generating': return await t('stageGenerating');
      case 'complete': return await t('stageComplete');
      default: return null;
    }
  }

  // Handle Save PDF button click
  async function handleSavePdf() {
    const model = elements.modelSelect.value;
    // Use selected provider from dropdown, fallback to model-based detection for backward compatibility
    const provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
    
    // Get the appropriate API key based on selected provider
    let apiKey = '';
    apiKey = elements.apiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (apiKey.startsWith('****') && elements.apiKey.dataset.encrypted) {
      try {
        apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
      } catch (error) {
        logError(`Failed to decrypt ${provider} API key`, error);
        showToast(await t('failedToDecryptApiKey'), 'error');
        return;
      }
    }
    if (!apiKey) {
      const providerName = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : 'Gemini';
      showToast(await t(`pleaseEnter${providerName}ApiKey`), 'error');
      return;
    }

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      setStatus('processing', await t('extractingPageContent'));
      setProgress(0);
      elements.savePdfBtn.disabled = true;

      // Wait a bit for dynamic content to load (Notion, React apps, etc.)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Inject content script and get page HTML
      const htmlResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent
      });

      if (!htmlResult || !htmlResult[0]?.result) {
        throw new Error('Failed to extract page content');
      }

      const pageData = htmlResult[0].result;

      // Get Google API key if needed
      let googleApiKey = elements.googleApiKey.value.trim();
      // If masked, decrypt the encrypted version from dataset
      if (googleApiKey.startsWith('****') && elements.googleApiKey.dataset.encrypted) {
        try {
          googleApiKey = await decryptApiKey(elements.googleApiKey.dataset.encrypted);
        } catch (error) {
          logError('Failed to decrypt Google API key', error);
          // Continue without Google API key if decryption fails
          googleApiKey = '';
        }
      }
      const translateImages = elements.translateImages.checked && elements.languageSelect.value !== 'auto';

      // Send to background script for processing
      const response = await chrome.runtime.sendMessage({
        action: 'processArticle',
        data: {
          html: pageData.html,
          url: pageData.url,  // Use actual page URL (with current anchor), not tab.url
          title: pageData.title || tab.title,
          apiKey: apiKey,
          provider: provider,
          googleApiKey: googleApiKey,
          model: model,
          mode: elements.modeSelect.value,
          useCache: elements.useCache.checked,
          outputFormat: elements.mainFormatSelect?.value || elements.outputFormat.value,
          generateToc: elements.generateToc.checked,
          generateAbstract: elements.generateAbstract.checked,
          pageMode: elements.pageMode.value,
          language: elements.languageSelect.value,
          translateImages: translateImages,
          fontFamily: elements.fontFamily.value,
          fontSize: elements.fontSize.value,
          bgColor: elements.bgColor.value,
          textColor: elements.textColor.value,
          headingColor: elements.headingColor.value,
          linkColor: elements.linkColor.value,
          stylePreset: elements.stylePreset?.value || 'dark',
          tabId: tab.id,
          // Audio settings
          audioProvider: elements.audioProvider?.value || 'openai',
          audioVoice: elements.audioVoice?.value || 'nova',
          audioSpeed: parseFloat(elements.audioSpeed?.value || 1.0),
          audioFormat: 'mp3',
          elevenlabsApiKey: elements.elevenlabsApiKey?.dataset.encrypted || null,
          elevenlabsModel: elements.elevenlabsModel?.value || 'eleven_v3',
          elevenlabsFormat: elements.elevenlabsFormat?.value || 'mp3_44100_192',
          elevenlabsStability: elements.elevenlabsStability ? parseFloat(elements.elevenlabsStability.value) : 0.5,
          elevenlabsSimilarity: elements.elevenlabsSimilarity ? parseFloat(elements.elevenlabsSimilarity.value) : 0.75,
          elevenlabsStyle: elements.elevenlabsStyle ? parseFloat(elements.elevenlabsStyle.value) : 0.0,
          elevenlabsSpeakerBoost: elements.elevenlabsSpeakerBoost ? elements.elevenlabsSpeakerBoost.checked : true,
          openaiInstructions: elements.openaiInstructions ? elements.openaiInstructions.value.trim() : null,
          googleTtsModel: elements.googleTtsModel?.value || 'gemini-2.5-pro-preview-tts',
          googleTtsVoice: elements.googleTtsVoice?.value || 'Callirrhoe',
          googleTtsPrompt: elements.googleTtsPrompt?.value.trim() || null,
          respeecherTemperature: elements.respeecherTemperature ? parseFloat(elements.respeecherTemperature.value) : 1.0,
          respeecherRepetitionPenalty: elements.respeecherRepetitionPenalty ? parseFloat(elements.respeecherRepetitionPenalty.value) : 1.0,
          respeecherTopP: elements.respeecherTopP ? parseFloat(elements.respeecherTopP.value) : 1.0,
          googleTtsApiKey: elements.googleTtsApiKey?.dataset.encrypted || null,
          geminiApiKey: elements.geminiApiKey?.dataset.encrypted || null,
          qwenApiKey: elements.qwenApiKey?.dataset.encrypted || null,
          respeecherApiKey: elements.respeecherApiKey?.dataset.encrypted || null
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Processing started in background
      // Ensure state polling is active to update UI
      if (!stateRefs.statePollingTimeout) {
        startStatePolling();
      }
      // Immediately check state to update UI
      await checkProcessingState();

    } catch (error) {
      logError('Error', error);
      setStatus('error', error.message);
      showToast(error.message, 'error');
      elements.savePdfBtn.disabled = false;
    }
  }

  // Function to inject into page to extract content
  function extractPageContent() {
    // Always use full HTML - let AI figure out what's important
    // This ensures we don't accidentally miss content
    const html = document.documentElement.outerHTML;
    
    // Get title from various sources
    let pageTitle = document.title;
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) {
      pageTitle = h1.textContent.trim();
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

  // Return all core functions
  return {
    handleCancel,
    handleGenerateSummary,
    handleSavePdf,
    toggleSummary,
    copySummary,
    downloadSummary,
    closeSummary,
    checkProcessingState,
    startStatePolling,
    checkSummaryStatus,
    updateUIFromState,
    mapStageLabel,
    extractPageContent,
    markdownToHtml: markdownToHtmlFn
  };
}

