// Processing module
// Handles PDF saving, cancellation, and content extraction

/**
 * Initialize processing module
 * @param {Object} deps - Dependencies
 * @returns {Object} Processing functions
 */
export function initProcessing(deps) {
  const {
    elements,
    t,
    logError,
    log,
    showToast,
    setStatus,
    setProgress,
    stopTimerDisplay,
    decryptApiKey,
    getProviderFromModel,
    startStatePolling,
    checkProcessingState,
    stateRefs
  } = deps;

  // Handle Cancel button click
  async function handleCancel() {
    if (!elements.cancelBtn) {
      log('Cancel button not found');
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

  // Handle Save PDF button click
  async function handleSavePdf() {
    log('=== handleSavePdf: ENTRY ===', {
      timestamp: Date.now()
    });
    
    const model = elements.modelSelect.value;
    // Use selected provider from dropdown, fallback to model-based detection for backward compatibility
    const provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
    
    log('=== handleSavePdf: Got model and provider ===', {
      model: model,
      provider: provider,
      timestamp: Date.now()
    });
    
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
    // Check API key only if not using automatic mode
    const mode = elements.modeSelect.value;
    if (mode !== 'automatic' && !apiKey) {
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
      
      log('=== handleSavePdf: Tab found ===', {
        tabId: tab.id,
        url: tab.url,
        status: tab.status,
        timestamp: Date.now()
      });
      
      // Check if we can inject scripts on this page
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
        throw new Error('Cannot extract content from browser internal pages');
      }

      log('=== handleSavePdf: Setting status and disabling button ===', {
        timestamp: Date.now()
      });
      
      setStatus('processing', await t('extractingPageContent'));
      setProgress(0);
      elements.savePdfBtn.disabled = true;

      log('=== handleSavePdf: Waiting 500ms for dynamic content ===', {
        timestamp: Date.now()
      });

      // Wait a bit for dynamic content to load (Notion, React apps, etc.)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to get HTML via content script message first (faster and more reliable)
      let pageData = null;
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
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('extractPageContent timeout after 5 seconds')), 5000);
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
          
          htmlResult = await Promise.race([scriptPromise, timeoutPromise]);
          
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
          throw new Error(`Failed to extract page content: ${scriptError.message}`);
        }
      }
      
      if (!pageData || !pageData.html) {
        throw new Error('Failed to extract page content: no HTML data received');
      }

      log('=== handleSavePdf: Page data extracted ===', {
        hasPageData: !!pageData,
        hasHtml: !!pageData?.html,
        htmlLength: pageData?.html?.length || 0,
        url: pageData?.url,
        title: pageData?.title,
        timestamp: Date.now()
      });

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

      log('=== handleSavePdf: About to send processArticle message ===', {
        mode: elements.modeSelect.value,
        outputFormat: elements.mainFormatSelect?.value || elements.outputFormat.value,
        hasApiKey: !!apiKey,
        hasTabId: !!tab.id,
        tabId: tab.id,
        timestamp: Date.now()
      });

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
          // CRITICAL: Get actual voice ID, not index
          // If audioVoice.value is a number (index), get the actual value from options
          audioVoice: (() => {
            const provider = elements.audioProvider?.value || 'openai';
            if (!elements.audioVoice) {
              console.warn('[ClipAIble Processing] ===== NO AUDIO VOICE ELEMENT =====', {
                timestamp: Date.now(),
                provider,
                willUseDefault: 'nova'
              });
              return 'nova';
            }
            const voiceValue = elements.audioVoice.value;
            const selectedIndex = elements.audioVoice.selectedIndex;
            const selectedOption = elements.audioVoice.options[selectedIndex];
            
            // DETAILED LOGGING: Voice value before processing
            console.log('[ClipAIble Processing] ===== EXTRACTING VOICE FROM UI =====', {
              timestamp: Date.now(),
              provider,
              voiceValue,
              voiceValueType: typeof voiceValue,
              selectedIndex,
              selectedOptionValue: selectedOption?.value,
              selectedOptionText: selectedOption?.textContent,
              datasetVoiceId: selectedOption?.dataset?.voiceId,
              isNumericIndex: /^\d+$/.test(String(voiceValue)),
              optionsCount: elements.audioVoice.options.length
            });
            
            // CRITICAL: Get voice ID from dataset.voiceId first (most reliable), then option.value
            // This ensures we always get the actual voice ID, not an index
            let finalVoice = null;
            
            if (selectedOption) {
              // Priority 1: dataset.voiceId (most reliable - always contains actual voice ID)
              if (selectedOption.dataset && selectedOption.dataset.voiceId) {
                finalVoice = selectedOption.dataset.voiceId;
                console.log('[ClipAIble Processing] ===== USING dataset.voiceId =====', {
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
                console.log('[ClipAIble Processing] ===== USING option.value =====', {
                  timestamp: Date.now(),
                  provider,
                  optionValue: finalVoice,
                  VOICE_STRING: `VOICE="${finalVoice}"`,
                  isValidFormat: finalVoice.includes('_') || finalVoice.includes('-') || provider !== 'offline'
                });
              }
              // Priority 3: Use getVoiceIdByIndex if value is an index
              else if (selectedOption.value && /^\d+$/.test(String(selectedOption.value)) && window.settingsModule && window.settingsModule.getVoiceIdByIndex) {
                const voiceIdFromCache = window.settingsModule.getVoiceIdByIndex(provider, selectedIndex);
                if (voiceIdFromCache && (voiceIdFromCache.includes('_') || voiceIdFromCache.includes('-') || provider !== 'offline')) {
                  finalVoice = voiceIdFromCache;
                  console.log('[ClipAIble Processing] ===== USING getVoiceIdByIndex =====', {
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
              console.log('[ClipAIble Processing] ===== USING voiceValue as fallback =====', {
                timestamp: Date.now(),
                provider,
                voiceValue: finalVoice,
                VOICE_STRING: `VOICE="${finalVoice}"`
              });
            }
            
            // Final fallback: use default
            if (!finalVoice) {
              finalVoice = provider === 'offline' ? 'en_US-lessac-medium' : 'nova';
              console.warn('[ClipAIble Processing] ===== USING DEFAULT VOICE =====', {
                timestamp: Date.now(),
                provider,
                defaultVoice: finalVoice,
                VOICE_STRING: `VOICE="${finalVoice}"`,
                reason: 'No valid voice found in UI'
              });
            }
            
            console.log('[ClipAIble Processing] ===== VOICE EXTRACTED FROM UI =====', {
              timestamp: Date.now(),
              provider,
              finalVoice,
              VOICE_STRING: `VOICE="${finalVoice}"`, // Explicit string for visibility
              isValidFormat: finalVoice.includes('_') || finalVoice.includes('-') || provider !== 'offline',
              willSendToBackground: true
            });
            return finalVoice;
          })(),
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
      
      log('=== handleSavePdf: processArticle response received ===', {
        hasResponse: !!response,
        hasError: !!response?.error,
        error: response?.error,
        started: response?.started,
        timestamp: Date.now()
      });

      if (chrome.runtime.lastError) {
        logError('=== handleSavePdf: chrome.runtime.lastError after sendMessage ===', {
          error: chrome.runtime.lastError.message,
          timestamp: Date.now()
        });
        throw new Error(chrome.runtime.lastError.message || 'Failed to communicate with background script');
      }

      if (response.error) {
        logError('=== handleSavePdf: Response contains error ===', {
          error: response.error,
          timestamp: Date.now()
        });
        throw new Error(response.error);
      }
      
      log('=== handleSavePdf: Processing started successfully ===', {
        timestamp: Date.now()
      });

      // Processing started in background
      // Ensure state polling is active to update UI
      if (!stateRefs.statePollingTimeout) {
        startStatePolling();
      }
      // Immediately check state to update UI
      await checkProcessingState();

    } catch (error) {
      logError('=== handleSavePdf: EXCEPTION CAUGHT ===', {
        error: error?.message || String(error),
        errorStack: error?.stack,
        errorName: error?.name,
        timestamp: Date.now()
      });
      logError('Error', error);
      setStatus('error', error.message);
      showToast(error.message, 'error');
      elements.savePdfBtn.disabled = false;
    }
  }

  return {
    handleCancel,
    handleSavePdf,
    extractPageContent
  };
}

