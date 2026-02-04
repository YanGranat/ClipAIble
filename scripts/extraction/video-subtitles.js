// @ts-check
// Video subtitle extraction for YouTube and Vimeo

import { log, logDebug, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';

/**
 * Extract subtitles from YouTube page
 * @param {number} tabId - Tab ID
 * @param {string} [targetLanguage] - Target language ('auto' or language code like 'en', 'ru')
 * @param {string} [detectedVideoLanguage] - Detected video language from AI (e.g., 'en', 'ru')
 * @returns {Promise<Object>} {subtitles: Array, metadata: Object}
 */
export async function extractYouTubeSubtitles(tabId, targetLanguage = 'auto', detectedVideoLanguage = 'en') {
  log('[YouTube subtitles] START', { tabId, targetLanguage, detectedVideoLanguage });
  logDebug('[YouTube subtitles] CONFIG', {
    VIDEO_SUBTITLES_TIMEOUT: CONFIG.VIDEO_SUBTITLES_TIMEOUT,
    VIDEO_SUBTITLES_CHECK_INTERVAL: CONFIG.VIDEO_SUBTITLES_CHECK_INTERVAL,
    VIDEO_SUBTITLES_WAIT_INTERVAL: CONFIG.VIDEO_SUBTITLES_WAIT_INTERVAL
  });

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let resolved = false;
    let storageCheckInterval = null; // CRITICAL: Declare earlier to use in early DOM checks
    
    // Cleanup function to prevent memory leaks - ensures all timers and listeners are cleared
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (storageCheckInterval) {
        clearInterval(storageCheckInterval);
        storageCheckInterval = null;
      }
      try {
        chrome.runtime.onMessage.removeListener(messageListener);
      } catch (e) {
        // Ignore errors when removing listener (may already be removed)
      }
    };
    
    // Set up one-time message listener
    const messageListener = (message, sender, sendResponse) => {
      // Check both action and type to catch messages in different formats
      // CRITICAL: Check all possible message formats
      const isYouTubeSubtitlesResult = 
        message.action === 'youtubeSubtitlesResult' || 
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.action === 'youtubeSubtitlesResult') ||
        (message.type === 'ClipAIbleYouTubeSubtitles' && !message.action) || // Fallback for messages without action
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.result) || // If result exists, this is our message
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.error); // If error exists, this is also our message
      
      // CRITICAL: Ignore other messages (getState, etc.)
      if (!isYouTubeSubtitlesResult) {
        // Not our message, don't handle
        return false;
      }
      
      if (isYouTubeSubtitlesResult) {
        log('[YouTube subtitles] Message received', {
          hasError: !!message.error,
          hasResult: !!message.result,
          resultSubtitleCount: message.result?.subtitles?.length ?? 0,
          messageKeys: Object.keys(message || {})
        });

        if (resolved) {
          logDebug('[YouTube subtitles] Ignoring duplicate message (already resolved)');
          return true;
        }

        resolved = true;
        cleanup();

        if (message.pageLogs && Array.isArray(message.pageLogs)) {
          log('[YouTube subtitles] Page script logs (from MAIN world):');
          message.pageLogs.forEach((line, i) => {
            log(`  [page ${i + 1}] ${line}`);
          });
        }

        try {
          if (message.error) {
            if (message.debug && typeof message.debug === 'object') {
              log('[YouTube subtitles] Debug (why each method failed)', message.debug);
            }
            logError('[YouTube subtitles] Error in subtitle extraction', message.error);
            reject(new Error(message.error));
          } else if (message.result) {
            if (!message.result.subtitles || message.result.subtitles.length === 0) {
              logError('[YouTube subtitles] No subtitles in result', {
                hasMetadata: !!message.result.metadata,
                metadataTitle: message.result.metadata?.title
              });
              reject(new Error('No subtitles found. Make sure subtitles are enabled for this video.'));
            } else {
              log('[YouTube subtitles] SUCCESS from message', {
                count: message.result.subtitles.length,
                title: message.result.metadata?.title
              });
              resolve(message.result);
            }
          } else {
            logError('[YouTube subtitles] No result in message', { messageKeys: Object.keys(message || {}) });
            reject(new Error('Subtitle extraction returned no result'));
          }
        } catch (error) {
          logError('[YouTube subtitles] Exception while processing result', error);
          reject(error);
        }

        try {
          sendResponse({ success: true, received: true });
        } catch (e) {
          // ignore
        }
        return true;
      }
      
      // Not our message, don't handle
      return false;
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
    logDebug('[YouTube subtitles] Message listener registered (waiting for youtubeSubtitlesResult)');

    // CRITICAL: First check if content script is loaded
    // If not, try to forcefully inject content script
    // Use async IIFE since we're inside Promise executor
    (async () => {
      let contentScriptAvailable = false;
      try {
        const pingResult = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (pingResult && pingResult.success) {
          contentScriptAvailable = true;
          log('Content script is available and responding', { timestamp: pingResult.timestamp });
        }
      } catch (pingError) {
        logWarn('Content script not available, attempting to inject it programmatically', pingError);
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['scripts/content.js']
          });
          log('Content script injected programmatically, waiting for listeners to register');
          await new Promise(r => setTimeout(r, 450));
          const retryPing = await chrome.tabs.sendMessage(tabId, { action: 'ping' }).catch(() => null);
          if (retryPing?.success) {
            contentScriptAvailable = true;
            log('Content script responding after programmatic injection');
          }
        } catch (injectError) {
          logWarn('Failed to inject content script programmatically', injectError);
        }
        if (!contentScriptAvailable) {
          log('Continuing with inlined script only (result will be returned via executeScript return value)');
        }
      }
      
      // Inject and execute script in page context
      log('Executing subtitle extraction script in page context', { 
        tabId, 
        contentScriptAvailable,
        funcType: typeof extractYouTubeSubtitlesInlined,
        funcName: extractYouTubeSubtitlesInlined?.name || 'unknown'
      });
      
      // CRITICAL: Check that function can be serialized
      try {
        // Attempt function serialization for verification
        const funcString = extractYouTubeSubtitlesInlined.toString();
        log('Function can be serialized', { 
          funcLength: funcString.length,
          funcStartsWith: funcString.substring(0, 50)
        });
      } catch (serializeError) {
        logError('Function serialization check failed', serializeError);
      }
      
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: extractYouTubeSubtitlesInlined,
        args: [
          contentScriptAvailable,
          CONFIG.VIDEO_SUBTITLES_WAIT_INTERVAL,
          CONFIG.VIDEO_SUBTITLES_RETRY_DELAY_1,
          CONFIG.VIDEO_SUBTITLES_RETRY_DELAY_2,
          targetLanguage,
          detectedVideoLanguage
        ]
      }).then(results => {
      log('[YouTube subtitles] executeScript resolved', {
        hasResults: !!results,
        resultsLength: results?.length ?? 0,
        firstResultKeys: results?.[0] ? Object.keys(results[0]) : [],
        hasResultResult: !!results?.[0]?.result,
        resultSubtitleCount: results?.[0]?.result?.subtitles?.length ?? 0,
        hasError: !!(results?.[0] && 'error' in results[0] && results[0].error)
      });

      if (results?.[0]?.result?.subtitles?.length > 0 && !resolved) {
        resolved = true;
        cleanup();
        log('[YouTube subtitles] SUCCESS from executeScript return value');
        resolve({
          subtitles: results[0].result.subtitles,
          metadata: results[0].result.metadata || {}
        });
        return;
      }

      if (!results || !results[0]) {
        logDebug('[YouTube subtitles] No results from executeScript, trying DOM fallback');
        if (!resolved) {
          // CRITICAL: Check DOM before reject (may already be saved)
          (async () => {
            try {
              const domResult = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => {
                  const element = document.getElementById('ClipAIblePendingSubtitles');
                  if (element && element.getAttribute('data-subtitles')) {
                    try {
                      // SECURITY: Safe JSON parse to prevent crashes on malformed data
                      const subtitleAttr = element.getAttribute('data-subtitles');
                      if (!subtitleAttr) {
                        return null;
                      }
                      let data;
                      try {
                        data = JSON.parse(subtitleAttr);
                      } catch (e) {
                        // CRITICAL: This runs in MAIN world where modules are not available
                        // console.error is acceptable here as logging module cannot be imported
                        console.error('[ClipAIble:Video] Failed to parse subtitle data', e);
                        return null;
                      }
                      element.remove();
                      return data;
                    } catch (e) {
                      return null;
                    }
                  }
                  return null;
                }
              });
              
              if (domResult?.[0]?.result && !resolved) {
                const domData = domResult[0].result;
                const age = Date.now() - (domData.timestamp || 0);
                if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) {
                  resolved = true;
                  cleanup();
                  log('[YouTube subtitles] SUCCESS from DOM fallback (no results branch)');
                  resolve({
                    subtitles: domData.subtitles,
                    metadata: domData.metadata || {}
                  });
                  return;
                }
              }
            } catch (domError) {
              logDebug('[YouTube subtitles] DOM fallback check error', domError);
            }
            if (!resolved) {
              resolved = true;
              cleanup();
              logError('[YouTube subtitles] Script returned no results', {
                results: results,
                resultsType: typeof results,
                resultsIsArray: Array.isArray(results)
              });
              reject(new Error('Failed to execute subtitle extraction script - no results returned'));
            }
          })();
        }
        return;
      }
      
      if ('error' in results[0] && results[0].error) {
        log('[YouTube subtitles] executeScript returned error in results[0]', {
          errorMessage: results[0].error?.message ?? String(results[0].error)
        });
        if (!resolved) {
          (async () => {
            try {
              const domResult = await chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => {
                  const element = document.getElementById('ClipAIblePendingSubtitles');
                  if (element && element.getAttribute('data-subtitles')) {
                    try {
                      // SECURITY: Safe JSON parse to prevent crashes on malformed data
                      const subtitleAttr = element.getAttribute('data-subtitles');
                      if (!subtitleAttr) {
                        return null;
                      }
                      let data;
                      try {
                        data = JSON.parse(subtitleAttr);
                      } catch (e) {
                        // CRITICAL: This runs in MAIN world where modules are not available
                        // console.error is acceptable here as logging module cannot be imported
                        console.error('[ClipAIble:Video] Failed to parse subtitle data', e);
                        return null;
                      }
                      element.remove();
                      return data;
                    } catch (e) {
                      return null;
                    }
                  }
                  return null;
                }
              });
              
              if (domResult?.[0]?.result && !resolved) {
                const domData = domResult[0].result;
                const age = Date.now() - (domData.timestamp || 0);
                if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) {
                  resolved = true;
                  cleanup();
                  log('[YouTube subtitles] SUCCESS from DOM fallback (error branch)');
                  resolve({
                    subtitles: domData.subtitles,
                    metadata: domData.metadata || {}
                  });
                  return;
                }
              }
            } catch (domError) {
              logDebug('[YouTube subtitles] DOM fallback error (error branch)', domError);
            }
            if (!resolved) {
              resolved = true;
              cleanup();
              /** @type {any} */
              const errorObj = ('error' in results[0] ? results[0].error : null);
              logError('[YouTube subtitles] Subtitle script error', {
                error: errorObj,
                errorMessage: errorObj?.message || String(errorObj),
                errorName: errorObj?.name,
                errorStack: errorObj?.stack,
                frameId: results[0].frameId
              });
              reject(new Error(`Subtitle extraction failed: ${errorObj?.message || errorObj}`));
            }
          })();
        }
        return;
      }
      
      logDebug('[YouTube subtitles] Script finished, no immediate result; waiting for message or storage/DOM');

      if (results[0] && 'error' in results[0] && results[0].error && !resolved) {
        log('[YouTube subtitles] Handling execution error path (results[0].error)');
        // CRITICAL: Check DOM before reject
        (async () => {
          try {
            const domResult = await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: () => {
                const element = document.getElementById('ClipAIblePendingSubtitles');
                if (element && element.getAttribute('data-subtitles')) {
                  try {
                    const data = JSON.parse(element.getAttribute('data-subtitles'));
                    element.remove();
                    return data;
                  } catch (e) {
                    return null;
                  }
                }
                return null;
              }
            });
            
            if (domResult?.[0]?.result && !resolved) {
              const domData = domResult[0].result;
              const age = Date.now() - (domData.timestamp || 0);
              if (age < 30000 && domData.subtitles && domData.subtitles.length > 0) {
                resolved = true;
                cleanup();
                
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
                return;
              }
            }
          } catch (domError) {
            // Ignore DOM check errors
          }
          
          // If DOM is empty - reject
          if (!resolved) {
            resolved = true;
            cleanup();
            /** @type {any} */
            const errorObj = (results[0] && 'error' in results[0] ? results[0].error : null);
            logError('Subtitle extraction script execution error (from results)', {
              error: errorObj,
              errorMessage: errorObj?.message || String(errorObj),
              errorStack: errorObj?.stack
            });
            reject(new Error(`Subtitle extraction failed: ${errorObj?.message || errorObj}`));
          }
        })();
        return;
      }
      
      // CRITICAL: Immediate DOM fallback check (if Extension context invalidated, data may already be in DOM)
      // This speeds up data retrieval when Extension context is invalidated
      (async () => {
        try {
          const domResult = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
              const element = document.getElementById('ClipAIblePendingSubtitles');
              if (element && element.getAttribute('data-subtitles')) {
                try {
                  const data = JSON.parse(element.getAttribute('data-subtitles'));
                  // Remove element after reading
                  element.remove();
                  return data;
                } catch (e) {
                  return null;
                }
              }
              return null;
            }
          });
          
          if (domResult && domResult[0] && domResult[0].result && !resolved) {
            const domData = domResult[0].result;
            const age = Date.now() - (domData.timestamp || 0);
            if (age < 60000) { // Increased from 30s to 60s
              
              resolved = true;
              cleanup();
              
              if (domData.subtitles && domData.subtitles.length > 0) {
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
              } else {
                reject(new Error('No subtitles found in DOM fallback'));
              }
            }
          }
        } catch (domError) {
          // Ignore DOM fallback errors (element may not exist)
          // This is normal if Extension context is not invalidated
        }
      })();
    }).catch(async (error) => {
      if (!resolved) {
        // CRITICAL: Check DOM before reject (may already be saved by content script)
        
        try {
          const domResult = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
              const element = document.getElementById('ClipAIblePendingSubtitles');
              if (element && element.getAttribute('data-subtitles')) {
                try {
                  const data = JSON.parse(element.getAttribute('data-subtitles'));
                  element.remove(); // Clear after reading
                  return data;
                } catch (e) {
                  return null;
                }
              }
              return null;
            }
          });
          
          if (domResult?.[0]?.result && !resolved) {
            const domData = domResult[0].result;
            if (domData.subtitles && domData.subtitles.length > 0) {
              const age = Date.now() - (domData.timestamp || 0);
              if (age < 30000) { // Within 30 seconds
                resolved = true;
                cleanup();
                
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
                return; // CRITICAL: exit from catch, don't continue with reject
              }
            }
          }
        } catch (domError) {
          logError('DOM check failed in catch block', domError);
        }
        
        // If DOM is empty or check failed - continue with reject
        resolved = true;
        cleanup();
        logError('Script execution failed (catch block)', {
          error: error,
          errorMessage: error?.message || String(error),
          errorStack: error?.stack,
          errorName: error?.name
        });
        reject(error);
      }
    });
    })(); // End of async IIFE
    
    // Check storage periodically for pendingSubtitles (fallback when Extension context invalidated or content script not loaded)
    // CRITICAL: If content script is not loaded, injected script will use storage API directly
    // Therefore need to check storage more frequently and faster
    // storageCheckInterval already declared at start of Promise (line 18)
    const checkStorage = async () => {
      try {
        const storage = await chrome.storage.local.get(['pendingSubtitles']);
        if (storage.pendingSubtitles && !resolved) {
          logDebug('[YouTube subtitles] Found pendingSubtitles in storage', {
            age: Date.now() - (storage.pendingSubtitles.timestamp || 0),
            subtitleCount: storage.pendingSubtitles.subtitles?.length ?? 0
          });
          /** @type {any} */
          const pendingData = storage.pendingSubtitles;
          // Check if this is recent (within last 60 seconds - same as timeout)
          const age = Date.now() - (pendingData.timestamp || 0);
          if (age < 60000) {
            // Check if this is from injected script direct storage (source: 'injected_script_direct')
            const isDirectStorage = pendingData.source === 'injected_script_direct';
            
            
            resolved = true;
            cleanup();
            
            // Clear pendingSubtitles
            chrome.storage.local.remove('pendingSubtitles').catch(() => {});
            
            if (pendingData.subtitles && pendingData.subtitles.length > 0) {
              resolve({
                subtitles: pendingData.subtitles,
                metadata: pendingData.metadata || {}
              });
            } else {
              reject(new Error('No subtitles found in pendingSubtitles'));
            }
            return;
          } else {
          }
        }
        
        // CRITICAL: Also check DOM fallback (if chrome.storage is unavailable)
        // Content script may save data to DOM element ClipAIblePendingSubtitles
        try {
          const domResult = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
              const element = document.getElementById('ClipAIblePendingSubtitles');
              if (element && element.getAttribute('data-subtitles')) {
                try {
                  const data = JSON.parse(element.getAttribute('data-subtitles'));
                  // Remove element after reading
                  element.remove();
                  return data;
                } catch (e) {
                  return null;
                }
              }
              return null;
            }
          });
          
          if (domResult && domResult[0] && domResult[0].result && !resolved) {
            const domData = domResult[0].result;
            const age = Date.now() - (domData.timestamp || 0);
            if (age < 60000) { // Increased from 30s to 60s
              
              resolved = true;
              cleanup();
              
              if (domData.subtitles && domData.subtitles.length > 0) {
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
              } else {
                reject(new Error('No subtitles found in DOM fallback'));
              }
            }
          }
        } catch (domError) {
          // Ignore DOM fallback errors (element may not exist)
        }
      } catch (error) {
        logError('Failed to check storage for pendingSubtitles', error);
      }
    };
    
    // Check storage every 200ms (more frequent check for direct storage fallback)
    // More frequent check, as injected script may use storage directly
    // if content script is not loaded
    storageCheckInterval = setInterval(checkStorage, CONFIG.VIDEO_SUBTITLES_CHECK_INTERVAL);
    
        checkStorage();
    logDebug('[YouTube subtitles] Storage/DOM check interval started', {
      interval: CONFIG.VIDEO_SUBTITLES_CHECK_INTERVAL,
      timeout: CONFIG.VIDEO_SUBTITLES_TIMEOUT
    });

    timeoutId = setTimeout(async () => {
      if (!resolved) {
        log('[YouTube subtitles] Timeout reached, final storage/DOM check');
        await checkStorage();
        
        // CRITICAL: Check DOM BEFORE reject (if storage didn't work)
        if (!resolved) {
          
          try {
            const domResult = await chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: () => {
                const element = document.getElementById('ClipAIblePendingSubtitles');
                if (element && element.getAttribute('data-subtitles')) {
                  try {
                    const data = JSON.parse(element.getAttribute('data-subtitles'));
                    element.remove(); // Clear after reading
                    return data;
                  } catch (e) {
                    logError(' ❌ Failed to parse DOM data:', e);
                    return null;
                  }
                }
                return null;
              }
            });
            
            if (domResult?.[0]?.result && !resolved) {
              const domData = domResult[0].result;
              const age = Date.now() - (domData.timestamp || 0);
              
              // Check data age (not older than 60 seconds)
              if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) {
                
                resolved = true;
                cleanup();
                
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
                return; // CRITICAL: exit from timeout, don't continue with reject
              } else {
              }
            }
          } catch (domCheckError) {
            logError('Failed to check DOM fallback during timeout', domCheckError);
          }
        }
        
        // If DOM is also empty - reject
        if (!resolved) {
          resolved = true;
          cleanup();
          logError('[YouTube subtitles] TIMEOUT - no message received from page script', {
            timeoutMs: CONFIG.VIDEO_SUBTITLES_TIMEOUT
          });
          reject(new Error('Subtitle extraction timeout. The page may be taking too long to load subtitles.'));
        }
      }
    }, CONFIG.VIDEO_SUBTITLES_TIMEOUT);
  });
}

/**
 * Inline function to extract YouTube subtitles
 * Runs in page context (MAIN world) - can fetch without CORS issues
 * Sends result back via chrome.runtime.sendMessage
 * Fetch and parsing happens here (in page context)
 * @param {boolean} contentScriptAvailable - Whether content script is loaded and responding
 * @param {number} waitInterval - Wait interval for checking ytInitialPlayerResponse (ms)
 * @param {number} retryDelay1 - First retry delay for video subtitles (ms)
 * @param {number} retryDelay2 - Second retry delay for video subtitles (ms)
 * @param {string} targetLanguage - Target language ('auto' or language code like 'en', 'ru')
 * @param {string} detectedVideoLanguage - Detected video language from AI (e.g., 'en', 'ru')
 */
function extractYouTubeSubtitlesInlined(contentScriptAvailable, waitInterval, retryDelay1, retryDelay2, targetLanguage, detectedVideoLanguage) {
  // CRITICAL: executeScript waits for Promise if function returns Promise
  // Therefore return Promise so executeScript waits for result
  return (async () => {
    /** @type {{ method1?: string, method2?: string, method3?: string, method4?: string, method5?: string, final?: string }} */
    const debug = {};
    /** @type {string[]} */
    const pageLogs = [];
    const pageLog = (msg) => {
      pageLogs.push(msg);
      try { console.log('[ClipAIble:page]', msg); } catch (_) {}
    };
    try {
      pageLog('start extraction');
      let metadata = {
        title: document.title.replace(' - YouTube', ''),
        author: '',
        publishDate: ''
      };
      
      // Extract title from page
      const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer yt-formatted-string, #title h1, ytd-watch-metadata h1');
      if (titleElement) {
        metadata.title = titleElement.textContent.trim();
      }
      
      // Extract channel (author)
      const channelElement = document.querySelector('ytd-channel-name a, .ytd-channel-name a, #channel-name a');
      if (channelElement) {
        metadata.author = channelElement.textContent.trim();
      }
      
      // Extract publish date
      const dateElement = document.querySelector('#info-strings yt-formatted-string, ytd-watch-info-text, #info-container yt-formatted-string');
      if (dateElement) {
        const dateText = dateElement.textContent.trim();
        const dateMatch = dateText.match(/(\w+\s+\d+,\s+\d{4})/);
        if (dateMatch) {
          metadata.publishDate = dateMatch[1];
        }
      }
      
      // Extract video ID from URL (support watch, shorts, embed, live)
      let videoId = null;
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else if (url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.split('/')[2];
      } else if (url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/')[2];
      } else if (url.pathname.startsWith('/live/')) {
        videoId = url.pathname.split('/')[2];
      }
      
      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }
      pageLog('videoId=' + videoId + ' targetLang=' + targetLanguage + ' detectedLang=' + detectedVideoLanguage);

      // detectedVideoLanguage is passed as parameter from AI detection in background script
      // No need to detect here - AI already analyzed video title/description

      console.log('[ClipAIble] Subtitle language selection:', {
        targetLanguage: targetLanguage,
        detectedVideoLanguage: detectedVideoLanguage,
        title: metadata.title,
        source: 'AI detection from background script'
      });

      // CRITICAL: Check that we are on correct YouTube page
      if (!window.location.hostname.includes('youtube.com')) {
        throw new Error('Not on YouTube page');
      }
      
      // ============================================
      // METHOD 1 (PRIMARY): Internal YouTube API (/youtubei/v1/player)
      // Based on: Real-world testing shows this is the most reliable method (Dec 2025)
      // YouTube Internal API works more reliably than direct timedtext request
      // ============================================
      let subtitleData = null;
      let subtitleUrl = null;
      
      /** @type {any} */
      const win = window;
      pageLog('method1: waiting for yt.config_');
      for (let w = 0; w < 10 && !win.yt?.config_?.INNERTUBE_API_KEY; w++) {
        await new Promise(r => setTimeout(r, 300));
      }
      pageLog('method1: yt.config_ present=' + !!(win.yt?.config_));

      try {
        const apiKey = win.yt?.config_?.INNERTUBE_API_KEY;
        if (!apiKey) {
          pageLog('method1: INNERTUBE_API_KEY not found');
          debug.method1 = 'INNERTUBE_API_KEY not found';
          throw new Error('INNERTUBE_API_KEY not found');
        }
        pageLog('method1: fetch player API (WEB client)');
        const clientName = win.yt?.config_?.INNERTUBE_CLIENT_NAME || 'WEB';
        const clientVersion = win.yt?.config_?.INNERTUBE_CLIENT_VERSION || '2.0';

        const doPlayerRequest = (cName, cVersion) => fetch(
          `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoId: videoId,
              context: {
                client: {
                  clientName: cName,
                  clientVersion: cVersion,
                },
              },
            }),
          }
        );

        let response = await doPlayerRequest(clientName, clientVersion);
        if (!response.ok) {
          debug.method1 = `API request failed: ${response.status}`;
          throw new Error(`API request failed: ${response.status}`);
        }
        let apiData = await response.json();

        if (!apiData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          pageLog('method1: WEB client has no captionTracks, retrying with ANDROID client');
          response = await doPlayerRequest('ANDROID', '20.10.38');
          if (response.ok) {
            apiData = await response.json();
            if (apiData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
              pageLog('method1: ANDROID client returned captionTracks');
            }
          }
        }

        if (!apiData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          pageLog('method1: API response has no captionTracks');
          debug.method1 = 'API response has no captionTracks';
        }
        if (apiData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = apiData.captions.playerCaptionsTracklistRenderer.captionTracks;
          pageLog('method1: tracks count=' + (tracks?.length ?? 0));

          // Select track based on targetLanguage and detected video language
          // Priority:
          // 1. If targetLanguage !== 'auto': try targetLanguage first (manual > auto)
          // 2. Fall back to detectedVideoLanguage (manual > auto)
          // 3. Fall back to any manual > any auto > first
          let selectedTrack = null;

          if (targetLanguage && targetLanguage !== 'auto') {
            // Try to find subtitles in target language first
            selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && (!t.kind || t.kind === ''));
            if (!selectedTrack) {
              selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && t.kind === 'asr');
            }
          }

          // If not found, try detected video language
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && (!t.kind || t.kind === ''));
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && t.kind === 'asr');
          }

          // Final fallback: any manual > any auto > first
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => !t.kind || t.kind === '');
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => t.kind === 'asr');
          }
          if (!selectedTrack && tracks.length > 0) {
            selectedTrack = tracks[0];
          }

          console.log('[ClipAIble] Selected subtitle track (Method 1):', {
            languageCode: selectedTrack?.languageCode,
            kind: selectedTrack?.kind,
            name: selectedTrack?.name?.simpleText,
            targetLanguage: targetLanguage,
            detectedVideoLanguage: detectedVideoLanguage
          });
                
                if (selectedTrack?.baseUrl) {
                  subtitleUrl = selectedTrack.baseUrl;
            
            // CRITICAL: Replace or add &fmt=json3 to baseUrl
            // If URL already contains fmt=, replace it, otherwise add
            let jsonUrl;
            if (subtitleUrl.includes('fmt=')) {
              // Replace existing fmt parameter
              jsonUrl = subtitleUrl.replace(/[?&]fmt=[^&]*/, (match) => {
                return match.startsWith('?') ? '?fmt=json3' : '&fmt=json3';
              });
          } else {
              // Add fmt parameter
              jsonUrl = subtitleUrl.includes('?') 
                ? subtitleUrl + '&fmt=json3'
                : subtitleUrl + '?fmt=json3';
            }
            
            // Simple fetch WITHOUT parameters
            const subtitleResponse = await fetch(jsonUrl);
            
            if (!subtitleResponse.ok) {
              throw new Error(`Subtitle fetch returned ${subtitleResponse.status}`);
            }
            
            const responseText = await subtitleResponse.text();
            
            // CRITICAL: Check that response is NOT empty
            if (!responseText || responseText.trim().length === 0) {
              throw new Error('Subtitle response is empty');
            }
            
            // Check format (JSON or XML)
            const trimmed = responseText.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                const jsonData = JSON.parse(responseText);
                if (jsonData.events && Array.isArray(jsonData.events)) {
                  subtitleData = jsonData;
            } else {
                  throw new Error('Invalid JSON format: missing events array');
                }
              } catch (parseError) {
                // Try XML format as fallback
                if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText; // Save as XML
          } else {
                  throw new Error('Unknown subtitle format');
                }
              }
            } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
              // XML format (fallback)
              subtitleData = responseText;
            } else {
              throw new Error('Unknown subtitle format');
            }
          }
        }
      } catch (apiError) {
        pageLog('method1: catch ' + (apiError?.message || String(apiError)));
        if (!debug.method1) {
          debug.method1 = apiError?.message || String(apiError);
        }
      }

      // ============================================
      // METHOD 2 (FALLBACK): ytInitialPlayerResponse + &fmt=json3
      // Based on: MouseTooltipTranslator approach
      // Used if Internal API is unavailable or didn't work
      // IMPORTANT: May return empty response due to expire parameter or POT token
      // ============================================
      if (!subtitleData) {
        // Give YouTube time to set ytInitialPlayerResponse (often present after first paint)
        for (let w = 0; w < 5 && !window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks; w++) {
          await new Promise(r => setTimeout(r, waitInterval));
        }
        if (!window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          pageLog('method2: ytInitialPlayerResponse has no captionTracks');
          debug.method2 = 'ytInitialPlayerResponse has no captionTracks';
        } else {
          pageLog('method2: ytInitialPlayerResponse has captionTracks');
        }
        let attempts = 0;
        const maxAttempts = 5;
        let method2Failed = false;
      
        while (!subtitleData && !method2Failed && attempts < maxAttempts) {
        attempts++;
        /** @type {any} */
        const win2 = window;
        if (win2.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = win2.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          pageLog('method2: tracks count=' + (tracks?.length ?? 0));

          // Select track based on targetLanguage and detected video language
          let selectedTrack = null;

          if (targetLanguage && targetLanguage !== 'auto') {
            // Try to find subtitles in target language first
            selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && (!t.kind || t.kind === ''));
            if (!selectedTrack) {
              selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && t.kind === 'asr');
            }
          }

          // If not found, try detected video language
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && (!t.kind || t.kind === ''));
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && t.kind === 'asr');
          }

          // Final fallback: any manual > any auto > first
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => !t.kind || t.kind === '');
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => t.kind === 'asr');
          }
          if (!selectedTrack && tracks.length > 0) {
            selectedTrack = tracks[0];
          }

          pageLog('method2: selectedTrack lang=' + (selectedTrack?.languageCode ?? 'null') + ' hasBaseUrl=' + !!(selectedTrack?.baseUrl));

          if (selectedTrack?.baseUrl) {
            subtitleUrl = selectedTrack.baseUrl;
            const fetchOpts = { credentials: 'same-origin', referer: window.location.href || undefined };

            const tryFetchUrl = async (url) => {
              const res = await fetch(url, fetchOpts);
              if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
              return await res.text();
            };

            let responseText = '';
            let jsonUrl;
            if (subtitleUrl.includes('fmt=')) {
              jsonUrl = subtitleUrl.replace(/[?&]fmt=[^&]*/, (m) => (m.startsWith('?') ? '?fmt=json3' : '&fmt=json3'));
            } else {
              jsonUrl = subtitleUrl.includes('?') ? subtitleUrl + '&fmt=json3' : subtitleUrl + '?fmt=json3';
            }

            try {
              responseText = await tryFetchUrl(jsonUrl);
              pageLog('method2: fetch json3 len=' + (responseText?.length ?? 0));
            } catch (e) {
              pageLog('method2: fetch json3 failed ' + (e?.message || ''));
            }

            if (!responseText || responseText.trim().length === 0) {
              pageLog('method2: json3 empty, trying baseUrl as-is (XML)');
              try {
                responseText = await tryFetchUrl(subtitleUrl);
                pageLog('method2: fetch raw len=' + (responseText?.length ?? 0));
              } catch (e2) {
                pageLog('method2: fetch raw failed ' + (e2?.message || ''));
              }
            }

            if (!responseText || responseText.trim().length === 0) {
              if (!debug.method2) debug.method2 = 'timedtext fetch returned empty (json3 and raw)';
              method2Failed = true;
              break;
            }

            const trimmed = responseText.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                const jsonData = JSON.parse(responseText);
                if (jsonData.events && Array.isArray(jsonData.events)) {
                  subtitleData = jsonData;
                  break;
                }
              } catch (parseError) {
                if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText;
                  break;
                }
                if (!debug.method2) debug.method2 = 'Invalid JSON: ' + (parseError?.message || '');
              }
            } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
              subtitleData = responseText;
              break;
            } else {
              if (!debug.method2) debug.method2 = 'Unexpected response format';
            }
          } else {
            if (!debug.method2) debug.method2 = 'selectedTrack has no baseUrl';
          }
        }
          
          if (!subtitleData && !debug.method2) {
            debug.method2 = 'no captionTracks or fetch failed after retries';
          }
          
          // If not found and no empty response error, wait and try again
          if (!subtitleData && !method2Failed && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, waitInterval));
        }
      }
      }
      
      // ============================================
      // METHOD 3 (FALLBACK): HTML Parsing
      // ============================================
      if (!subtitleData) {
        pageLog('method3: fetch page HTML');
        try {
          const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        
        if (videoPageResponse.ok) {
          const videoPageHtml = await videoPageResponse.text();
            const splittedHtml = videoPageHtml.split('"captions":');
            
            if (splittedHtml.length >= 2) {
              try {
                const captionsJsonStr = splittedHtml[1].split(',"videoDetails')[0].replace(/\n/g, '');
                const captionsJson = JSON.parse(captionsJsonStr);
                
                if (captionsJson?.playerCaptionsTracklistRenderer?.captionTracks) {
                  const tracks = captionsJson.playerCaptionsTracklistRenderer.captionTracks;

                  // Select track based on targetLanguage and detected video language
                  let selectedTrack = null;

                  if (targetLanguage && targetLanguage !== 'auto') {
                    // Try to find subtitles in target language first
                    selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && (!t.kind || t.kind === ''));
                    if (!selectedTrack) {
                      selectedTrack = tracks.find(t => (t.languageCode === targetLanguage || t.languageCode?.startsWith(targetLanguage + '-')) && t.kind === 'asr');
                    }
                  }

                  // If not found, try detected video language
                  if (!selectedTrack) {
                    selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && (!t.kind || t.kind === ''));
                  }
                  if (!selectedTrack) {
                    selectedTrack = tracks.find(t => (t.languageCode === detectedVideoLanguage || t.languageCode?.startsWith(detectedVideoLanguage + '-')) && t.kind === 'asr');
                  }

                  // Final fallback: any manual > any auto > first
                  if (!selectedTrack) {
                    selectedTrack = tracks.find(t => !t.kind || t.kind === '');
                  }
                  if (!selectedTrack) {
                    selectedTrack = tracks.find(t => t.kind === 'asr');
                  }
                  if (!selectedTrack && tracks.length > 0) {
                    selectedTrack = tracks[0];
                  }

                  console.log('[ClipAIble] Selected subtitle track (Method 3):', {
                    languageCode: selectedTrack?.languageCode,
                    kind: selectedTrack?.kind,
                    targetLanguage: targetLanguage,
                    detectedVideoLanguage: detectedVideoLanguage
                  });
                  
                  if (selectedTrack?.baseUrl) {
                    subtitleUrl = selectedTrack.baseUrl;
                    
                    // CRITICAL: Always add &fmt=json3
                    const jsonUrl = subtitleUrl.includes('?') 
                      ? subtitleUrl + '&fmt=json3'
                      : subtitleUrl + '?fmt=json3';
                    
                    // Simple fetch WITHOUT parameters
                    const subtitleResponse = await fetch(jsonUrl);
                    
                    if (subtitleResponse.ok) {
                      const responseText = await subtitleResponse.text();
                      
                      if (responseText && responseText.length > 0) {
                        const trimmed = responseText.trim();
                        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                          try {
                            const jsonData = JSON.parse(responseText);
                            if (jsonData.events && Array.isArray(jsonData.events)) {
                              subtitleData = jsonData;
                            }
                          } catch (parseError) {
                            // Ignore parse errors
                          }
                        } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                          subtitleData = responseText; // XML fallback
                        }
                      }
                    }
                  }
                }
              } catch (parseError) {
                // Ignore parse errors
              }
            }
          }
        } catch (htmlError) {
          pageLog('method3: catch ' + (htmlError?.message || String(htmlError)));
          debug.method3 = htmlError?.message || String(htmlError);
        }
        if (!subtitleData && !debug.method3) {
          pageLog('method3: no captions in HTML');
          debug.method3 = 'captions not found in page HTML or parse failed';
        }
      }

      // ============================================
      // METHOD 4 (LAST FALLBACK): Direct Timedtext API
      // Used only if all previous methods didn't work
      // ============================================
      if (!subtitleData) {
        pageLog('method4: timedtext API');
        const browserLang = navigator.language.split('-')[0];
        const languagesToTry = [detectedVideoLanguage, browserLang, 'en', 'ru', 'ua'];
        const uniqueLangs = [...new Set(languagesToTry)];
        pageLog('method4: langs=' + uniqueLangs.join(','));
        for (const lang of uniqueLangs) {
          try {
            // Always use JSON format
            const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
            
            // Simple fetch WITHOUT parameters
            const response = await fetch(timedtextUrl);
            
            if (response.ok) {
              const responseText = await response.text();
              
              if (responseText && responseText.length > 0) {
                const trimmed = responseText.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try {
                    const jsonData = JSON.parse(responseText);
                    if (jsonData.events && Array.isArray(jsonData.events)) {
                      subtitleData = jsonData;
                      break; // Success!
                    }
                  } catch (parseError) {
                    // Ignore parse errors
                  }
                } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText; // XML fallback
                  break;
                }
              }
            }
          } catch (fetchError) {
            // Continue with next language
          }
        }
        if (!subtitleData) {
          pageLog('method4: no data for any language');
          debug.method4 = 'timedtext returned no data for any tried language';
        }
      }

      // ============================================
      // METHOD 5 (OPTIONAL): video.textTracks
      // Used only if all previous methods didn't work
      // ============================================
      if (!subtitleData) {
        
        try {
          const videoElement = document.querySelector('video');
          if (videoElement && videoElement.textTracks && videoElement.textTracks.length > 0) {
            let activeTrack = Array.from(videoElement.textTracks).find(track => 
              (track.kind === 'subtitles' || track.kind === 'captions') && track.mode === 'showing'
            );
            
            if (!activeTrack) {
              activeTrack = Array.from(videoElement.textTracks).find(track => 
                track.kind === 'subtitles' || track.kind === 'captions'
              );
              
              if (activeTrack) {
                activeTrack.mode = 'showing';
                await new Promise(resolve => setTimeout(resolve, retryDelay1)); // From CONFIG.VIDEO_SUBTITLES_RETRY_DELAY_1
              }
            }
            
            if (activeTrack && activeTrack.cues && activeTrack.cues.length > 0) {
              const subtitles = Array.from(activeTrack.cues).map(cue => {
                /** @type {any} */
                const cueAny = cue;
                return {
                  start: cue.startTime,
                  duration: cue.endTime - cue.startTime,
                  text: (cueAny.text || '').trim().replace(/\n/g, ' ')
                };
              });
              
              if (subtitles.length > 0) {
                // Send result immediately
                const result = {
                  subtitles: subtitles,
                  metadata: metadata
                };
                
                // Send via CustomEvent (the only reliable way)
                document.dispatchEvent(new CustomEvent('ClipAIbleSubtitleMessage', {
                  detail: {
                    type: 'ClipAIbleYouTubeSubtitles',
                    action: 'youtubeSubtitlesResult',
                    result: result
                  },
                  bubbles: true,
                  cancelable: true
                }));
                
                return; // Exit from function
              }
            }
          }
        } catch (textTracksError) {
          debug.method5 = textTracksError?.message || String(textTracksError);
        }
        if (!subtitleData && !debug.method5) {
          debug.method5 = 'no video textTracks or cues empty';
        }
      }
      
      if (!subtitleData) {
        pageLog('all methods failed');
        debug.final = 'all methods failed';
        throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
      }

      pageLog('subtitleData obtained, parsing');
      // Parse received data
      const subtitles = [];
      
      // Check data format
      if (typeof subtitleData === 'object' && subtitleData.events) {
        // JSON format (priority)
        subtitleData.events.forEach((event) => {
          if (!event.segs || !Array.isArray(event.segs) || event.segs.length === 0) {
            return;
          }
          
          const textParts = event.segs
            .map(seg => seg.utf8 || '')
            .filter(text => text && text.trim())
            .join(' ')
            .trim();
          
          if (textParts) {
            const startMs = event.tStartMs || event.startTimeMs || 0;
            const durationMs = event.dDurationMs || event.durationMs || 0;
            
            subtitles.push({
              start: startMs / 1000,
              duration: durationMs / 1000,
              text: textParts
            });
          }
        });
      } else if (typeof subtitleData === 'string') {
        // XML format (fallback)
        
        // YouTube subtitle XML format: <text start="0.0" dur="3.5">Text content</text>
        // NOTE: DOMParser doesn't work on YouTube due to Trusted Types policy
        // Use regex parsing only
        const textRegex = /<text\s+([^>]+)>(.*?)<\/text>/gs;
        let match;
        let matchCount = 0;
        
        while ((match = textRegex.exec(subtitleData)) !== null) {
          matchCount++;
          const attributes = match[1];
          const content = match[2] || '';
          
          // Extract start attribute
          const startMatch = attributes.match(/start="([^"]+)"/);
          if (!startMatch) {
            continue;
          }
          
          const start = parseFloat(startMatch[1]);
          if (isNaN(start)) {
            continue;
          }
          
          // Extract dur attribute (optional)
          const durMatch = attributes.match(/dur="([^"]+)"/);
          const duration = durMatch ? parseFloat(durMatch[1]) : 0;
          
          // Decode HTML entities and clean text
          let textContent = content
            .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(parseInt(code, 10)))
            .replace(/&#x([0-9a-fA-F]+);/g, (m, code) => String.fromCharCode(parseInt(code, 16)))
            .trim();
          
          if (textContent) {
            subtitles.push({
              start: start,
              duration: duration,
              text: textContent
            });
          }
        }
      }
      
      if (subtitles.length === 0) {
        throw new Error('Subtitles data is empty or invalid');
      }
      
      // Send result
      const result = {
        subtitles: subtitles,
        metadata: metadata
      };
      
      const messageData = {
        type: 'ClipAIbleYouTubeSubtitles',
        action: 'youtubeSubtitlesResult',
        result: result,
        pageLogs: pageLogs
      };
      
      // CRITICAL: CustomEvent on document - the ONLY reliable way
      // between MAIN world and ISOLATED world in Chrome Extensions
      // window.postMessage does NOT work between worlds!
      
      // Define sendViaCustomEvent function first
      const sendViaCustomEvent = () => {
        try {
          // Primary method: CustomEvent on document
        const customEvent = new CustomEvent('ClipAIbleSubtitleMessage', {
          detail: messageData,
          bubbles: true,
          cancelable: true
        });
          
        document.dispatchEvent(customEvent);
          
          // Also try window.postMessage as fallback (though it may not work between worlds)
          try {
            window.postMessage(messageData, window.location.origin);
          } catch (postMsgError) {
            // Ignore postMessage errors
          }
          
      } catch (e) {
          try { console.error('[ClipAIble] CustomEvent dispatch failed', e); } catch (_) {}
        }
      };
      
      // Wait a bit for content script to be ready
      // Content script should be loaded by manifest.json, but give it a moment
      // Use setTimeout to ensure content script listener is registered
      // CRITICAL: Reduced number of retries for performance
      // 2 retries are enough (immediate + 200ms + 1000ms) instead of 5
      const sendWithDelay = () => {
        // Try sending immediately first
        sendViaCustomEvent();
        
        // One retry after short delay to ensure content script is ready
        setTimeout(() => {
          sendViaCustomEvent();
        }, 200);
        
        // Final retry after longer delay (only if content script loads very late)
        setTimeout(() => {
          sendViaCustomEvent();
        }, 1000);
      };
      
      const sendViaCustomEventWithRetries = () => {
        // Always send via CustomEvent (even if direct sendMessage was attempted)
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            sendWithDelay();
          });
        } else {
          // Document is ready, send with delay to ensure content script is ready
          sendWithDelay();
        }
      };
      
      // CRITICAL: Try chrome.runtime.sendMessage directly (if available in MAIN world)
      // In some cases chrome.runtime may be available in MAIN world
      let sendMessageSuccess = false;
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage(messageData, (response) => {
            if (chrome.runtime.lastError) {
              // Fallback to CustomEvent
              sendViaCustomEventWithRetries();
            } else {
              // Success - no need to send via CustomEvent
              sendMessageSuccess = true;
              return;
            }
          });
        } catch (runtimeError) {
          // chrome.runtime.sendMessage not available in MAIN world (expected)
          // Will use CustomEvent below
        }
      }

      // CRITICAL: If chrome.runtime.sendMessage is not available or failed,
      // MUST use CustomEvent to send result to content script
      if (!sendMessageSuccess) {
        sendViaCustomEventWithRetries();
      }

      // Also try window.postMessage as additional fallback
      // (though it usually doesn't work between MAIN and ISOLATED, but let's try)
      try {
        window.postMessage({
          type: 'ClipAIbleYouTubeSubtitles',
          action: 'youtubeSubtitlesResult',
          result: messageData.result
        }, '*');
      } catch (postMessageError) {
        // Ignore postMessage errors
      }
      
      // Always send via CustomEvent (even if direct sendMessage was attempted)
      // CustomEvent may work if content script loads later
      // CRITICAL: CustomEvent is the only way to communicate from MAIN world to ISOLATED world
      // If content script is not loaded, CustomEvent will not be processed
      // But we still send it, in case content script loads later
      sendViaCustomEventWithRetries();

      // Return result so executeScript receives it when content script is not available.
      // Background then() handler will resolve from results[0].result.
      return result;
    } catch (error) {
      try { console.error('[ClipAIble] Subtitle extraction error:', error?.message || error); } catch (_) {}
      const errorMessageData = {
        type: 'ClipAIbleYouTubeSubtitles',
        action: 'youtubeSubtitlesResult',
        error: error.message || String(error),
        debug: debug,
        pageLogs: pageLogs
      };
      try {
        document.dispatchEvent(new CustomEvent('ClipAIbleSubtitleMessage', {
          detail: errorMessageData,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}
      throw error;
    }
  })(); // Return Promise from async IIFE - executeScript will wait for it
}

/**
 * Extract subtitles from Vimeo page
 * @param {number} tabId - Tab ID
 * @param {string} [targetLanguage] - Target language ('auto' or language code like 'en', 'ru')
 * @param {string} [detectedVideoLanguage] - Detected video language from AI (e.g., 'en', 'ru')
 * @returns {Promise<Object>} {subtitles: Array, metadata: Object}
 */
export async function extractVimeoSubtitles(tabId, targetLanguage = 'auto', detectedVideoLanguage = 'en') {
  log('Extracting Vimeo subtitles', { tabId, targetLanguage, detectedVideoLanguage });
  
  let results;
  try {
    results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: extractVimeoSubtitlesInlined,
    args: [CONFIG.VIDEO_SUBTITLES_RETRY_DELAY_2]
  });
    log('Vimeo script executed', { 
      hasResults: !!results,
      resultsLength: results?.length,
      hasFirstResult: !!results?.[0],
      firstResultKeys: results?.[0] ? Object.keys(results[0]) : []
    });
  } catch (scriptError) {
    logError('Failed to execute Vimeo subtitle script', scriptError);
    throw new Error(`Failed to execute subtitle extraction script: ${scriptError.message}`);
  }
  
  if (!results || !results[0]) {
    logError('Vimeo script returned no results', { results });
    throw new Error('Failed to execute subtitle extraction script');
  }
  
  if ('error' in results[0] && results[0].error) {
    /** @type {any} */
    const errorObj = results[0].error;
    logError('Subtitle extraction script error', {
      error: errorObj,
      errorMessage: errorObj?.message,
      errorStack: errorObj?.stack
    });
    throw new Error(`Subtitle extraction failed: ${errorObj?.message || errorObj}`);
  }
  
  if (!results[0].result) {
    logError('Subtitle extraction returned no result', {
      results: results[0],
      resultType: typeof results[0].result,
      resultValue: results[0].result
    });
    throw new Error('Subtitle extraction returned no result');
  }
  
  const result = results[0].result;
  
  if (!result.subtitles || result.subtitles.length === 0) {
    logError('No subtitles in result', {
      hasSubtitles: !!result.subtitles,
      subtitlesLength: result.subtitles?.length,
      resultKeys: Object.keys(result)
    });
    throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
  }
  
  log('Vimeo subtitles extracted', { 
    count: result.subtitles.length,
    title: result.metadata.title 
  });
  
  return result;
}

/**
 * Inline function to extract Vimeo subtitles
 * Runs in page context (MAIN world)
 * Returns Promise so executeScript can wait for result
 * @param {number} retryDelay2 - Second retry delay for video subtitles (ms)
 */
function extractVimeoSubtitlesInlined(retryDelay2) {
  return (async () => {
    try {
      // CRITICAL: This runs in MAIN world where modules are not available
      // console.error is acceptable here as logging module cannot be imported
      const logError = console.error.bind(console, '[ClipAIble]');
      const subtitles = [];
      let metadata = {
        title: document.title.replace(' on Vimeo', ''),
        author: '',
        publishDate: ''
      };
      
  // Extract title
  const titleElement = document.querySelector('h1, [data-title]');
  if (titleElement) {
    metadata.title = titleElement.textContent.trim() || titleElement.getAttribute('data-title') || metadata.title;
  }
  
  // Extract author
  const authorElement = document.querySelector('[data-owner], .owner-name, a[data-owner-name]');
  if (authorElement) {
    metadata.author = authorElement.textContent.trim() || authorElement.getAttribute('data-owner-name') || '';
  }
  
  // Extract publish date
  const dateElement = document.querySelector('[data-published-time], time[datetime]');
  if (dateElement) {
    const dateValue = dateElement.getAttribute('data-published-time') || dateElement.getAttribute('datetime') || dateElement.textContent.trim();
    if (dateValue) {
      metadata.publishDate = dateValue;
    }
  }
  
      // Helper function to parse WebVTT format
      const parseWebVTT = (vtt) => {
        const subtitles = [];
            const lines = vtt.split('\n');
            let currentTime = null;
            let currentText = [];
            
            for (const line of lines) {
          // Time cue: 00:00:00.000 --> 00:00:03.500 or 00:00:00.000 --> 00:00:03.500 align:start
              const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
              if (timeMatch) {
                // Save previous subtitle if exists
                if (currentTime !== null && currentText.length > 0) {
                  subtitles.push({
                    start: currentTime.start,
                    duration: currentTime.end - currentTime.start,
                    text: currentText.join(' ').trim()
                  });
                }
                
                // Parse time
                const startHours = parseInt(timeMatch[1]);
                const startMinutes = parseInt(timeMatch[2]);
                const startSeconds = parseInt(timeMatch[3]);
                const startMs = parseInt(timeMatch[4]);
                const start = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;
                
                const endHours = parseInt(timeMatch[5]);
                const endMinutes = parseInt(timeMatch[6]);
                const endSeconds = parseInt(timeMatch[7]);
                const endMs = parseInt(timeMatch[8]);
                const end = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;
                
                currentTime = { start, end };
                currentText = [];
          } else if (line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && !line.startsWith('STYLE') && currentTime !== null) {
            // Text line (remove HTML tags and WebVTT formatting)
            const cleanText = line.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                if (cleanText) {
                  currentText.push(cleanText);
                }
              }
            }
            
            // Add last subtitle
            if (currentTime !== null && currentText.length > 0) {
              subtitles.push({
                start: currentTime.start,
                duration: currentTime.end - currentTime.start,
                text: currentText.join(' ').trim()
              });
            }
            
        return subtitles;
      };
      
      // ============================================
      // METHOD 1: window.vimeoPlayerConfig
      // ============================================
      /** @type {any} */
      const win = window;
      if (win.vimeoPlayerConfig) {
        try {
          const config = win.vimeoPlayerConfig;
          if (config.video && config.video.textTracks) {
            const tracks = config.video.textTracks;
            // Find best track (prefer manual, then auto-generated)
            const selectedTrack = tracks.find(t => t.kind === 'captions' && !t.auto) || 
                                tracks.find(t => t.kind === 'captions') ||
                                tracks[0];
            
            if (selectedTrack && selectedTrack.src) {
              const response = await fetch(selectedTrack.src);
              if (response.ok) {
                const vtt = await response.text();
                const parsedSubtitles = parseWebVTT(vtt);
                if (parsedSubtitles.length > 0) {
                  return { subtitles: parsedSubtitles, metadata };
                }
              }
            }
          }
        } catch (e) {
          logError('Method 1 failed:', e);
        }
      }
      
      // ============================================
      // METHOD 2: window.player or window.vimeoPlayer
      // ============================================
      /** @type {any} */
      const win2 = window;
      const player = win2.player || win2.vimeoPlayer;
      if (player) {
        try {
          // Try to get text tracks from player
          if (player.textTracks && player.textTracks.length > 0) {
            const tracks = Array.from(player.textTracks);
            const selectedTrack = tracks.find(t => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing') ||
                                tracks.find(t => t.kind === 'captions' || t.kind === 'subtitles') ||
                                tracks[0];
            
            if (selectedTrack && selectedTrack.cues && selectedTrack.cues.length > 0) {
              const parsedSubtitles = Array.from(selectedTrack.cues).map(cue => ({
                start: cue.startTime,
                duration: cue.endTime - cue.startTime,
                text: cue.text.trim().replace(/\n/g, ' ').replace(/<[^>]*>/g, '')
              }));
              
              if (parsedSubtitles.length > 0) {
                return { subtitles: parsedSubtitles, metadata };
              }
            }
          }
        } catch (e) {
          logError('Method 2 failed:', e);
        }
      }
      
      // ============================================
      // METHOD 3: video.textTracks (DOM element) - IMPROVED
      // ============================================
      const videoElement = document.querySelector('video');
      if (videoElement && videoElement.textTracks && videoElement.textTracks.length > 0) {
        try {
          const tracks = Array.from(videoElement.textTracks);
          let activeTrack = tracks.find(t => 
            (t.kind === 'subtitles' || t.kind === 'captions') && t.mode === 'showing'
          );
          
          if (!activeTrack) {
            activeTrack = tracks.find(t => 
              t.kind === 'subtitles' || t.kind === 'captions'
            );
            
            if (activeTrack) {
              activeTrack.mode = 'showing';
              
              // Try multiple wait times and check for cues
              for (let attempt = 0; attempt < 5; attempt++) {
                await new Promise(resolve => setTimeout(resolve, retryDelay2)); // From CONFIG.VIDEO_SUBTITLES_RETRY_DELAY_2
                
                // Force cue loading by accessing cues property
                try {
                  if (activeTrack.cues && activeTrack.cues.length > 0) {
                    break;
                  }
                  
                  // Try to trigger cue loading by accessing activeCues
                  if (activeTrack.activeCues && activeTrack.activeCues.length > 0) {
                    break;
                  }
                } catch (e) {
                  // Ignore errors when accessing cues
                }
              }
            }
          }
          
          // Check for cues
          if (activeTrack) {
            // Try both cues and activeCues
            let cues = null;
            if (activeTrack.cues && activeTrack.cues.length > 0) {
              cues = activeTrack.cues;
            } else if (activeTrack.activeCues && activeTrack.activeCues.length > 0) {
              cues = activeTrack.activeCues;
            }
            
            if (cues && cues.length > 0) {
              const parsedSubtitles = Array.from(cues).map(cue => {
                /** @type {any} */
                const cueAny = cue;
                return {
                  start: cue.startTime || 0,
                  duration: (cue.endTime || cue.startTime || 0) - (cue.startTime || 0),
                  text: (cueAny.text || cueAny.getCueAsHTML?.()?.textContent || '').trim().replace(/\n/g, ' ').replace(/<[^>]*>/g, '')
                };
              }).filter(sub => sub.text && sub.text.length > 0);
              
              if (parsedSubtitles.length > 0) {
                return { subtitles: parsedSubtitles, metadata };
              }
            }
          }
        } catch (e) {
          logError('Method 3 failed:', e);
        }
      }
      
      // ============================================
      // METHOD 4: window.__INITIAL_STATE__ or window.vimeoData
      // ============================================
      /** @type {any} */
      const win3 = window;
      const state = win3.__INITIAL_STATE__ || win3.vimeoData || win3.vimeo;
      if (state) {
        try {
          // Try different possible structures
          let videoData = null;
          
          if (state.video) {
            videoData = state.video;
          } else if (state.data && state.data.video) {
            videoData = state.data.video;
          } else if (state.player && state.player.video) {
            videoData = state.player.video;
          }
          
          if (videoData && videoData.textTracks) {
            const tracks = videoData.textTracks;
            const selectedTrack = tracks.find(t => t.kind === 'captions' && !t.auto) || 
                                tracks.find(t => t.kind === 'captions') ||
                                tracks[0];
            
            if (selectedTrack && selectedTrack.src) {
              const response = await fetch(selectedTrack.src);
              if (response.ok) {
                const vtt = await response.text();
                const parsedSubtitles = parseWebVTT(vtt);
                if (parsedSubtitles.length > 0) {
                  return { subtitles: parsedSubtitles, metadata };
                }
              }
            }
          }
        } catch (e) {
          logError(' Method 4 failed:', e);
        }
      }
      
      // ============================================
      // METHOD 5: Extract video ID and search for subtitle URLs
      // ============================================
      try {
        const url = new URL(window.location.href);
        const videoIdMatch = url.pathname.match(/\/(\d+)/);
        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          
          // Try multiple patterns for subtitle URLs
          const subtitlePatterns = [
            /https?:\/\/[^"'\s]+\.vtt[^"'\s]*/g,
            /"src"\s*:\s*"([^"]+\.vtt[^"]*)"/g,
            /'src'\s*:\s*'([^']+\.vtt[^']*)'/g,
            /textTracks[^}]*src[^}]*["']([^"']+\.vtt[^"']*)["']/g,
            /captions[^}]*src[^}]*["']([^"']+\.vtt[^"']*)["']/g
          ];
          
          // Search in scripts
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const script of scripts) {
            const scriptText = script.textContent || script.innerHTML;
            if (scriptText.includes('textTracks') || scriptText.includes('captions') || scriptText.includes('.vtt')) {
              for (const pattern of subtitlePatterns) {
                const matches = scriptText.matchAll(pattern);
                for (const match of matches) {
                  const subtitleUrl = match[1] || match[0];
                  if (subtitleUrl && subtitleUrl.includes('.vtt')) {
                    try {
                      const response = await fetch(subtitleUrl);
                      if (response.ok) {
                        const vtt = await response.text();
                        const parsedSubtitles = parseWebVTT(vtt);
                        if (parsedSubtitles.length > 0) {
                          return { subtitles: parsedSubtitles, metadata };
                        }
                      }
                    } catch (fetchError) {
                      // Continue to next match
                    }
                  }
                }
              }
            }
          }
          
          // Also search in page HTML
          const pageHtml = document.documentElement.outerHTML;
          for (const pattern of subtitlePatterns) {
            const matches = pageHtml.matchAll(pattern);
            for (const match of matches) {
              const subtitleUrl = match[1] || match[0];
              if (subtitleUrl && subtitleUrl.includes('.vtt') && !subtitleUrl.includes('example')) {
                try {
                  const response = await fetch(subtitleUrl);
                  if (response.ok) {
                    const vtt = await response.text();
                    const parsedSubtitles = parseWebVTT(vtt);
                    if (parsedSubtitles.length > 0) {
                      return { subtitles: parsedSubtitles, metadata };
                    }
                  }
                } catch (fetchError) {
                  // Continue to next match
                }
              }
            }
          }
        }
      } catch (e) {
        logError(' Method 5 failed:', e);
      }
      
      // ============================================
      // METHOD 6: DOM Parsing - Extract visible subtitles from screen
      // ============================================
      try {
        // Common Vimeo subtitle selectors
        const subtitleSelectors = [
          '.vp-captions',
          '.vp-captions-text',
          '.vp-subtitle',
          '[class*="caption"]',
          '[class*="subtitle"]',
          '[data-testid*="subtitle"]',
          '[data-testid*="caption"]',
          'track[kind="captions"]',
          'track[kind="subtitles"]',
          '.video-subtitles',
          '.vp-video-wrapper caption',
          'video + *[class*="subtitle"]',
          'video + *[class*="caption"]'
        ];
        
        let visibleSubtitles = [];
        let subtitleElements = [];
        
        // Try each selector
        for (const selector of subtitleSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              subtitleElements.push(...Array.from(elements));
            }
          } catch (e) {
            // Invalid selector, continue
          }
        }
        
        // Also search for elements near video player
        const videoContainer = document.querySelector('video')?.closest('[class*="player"], [class*="video"], [id*="player"], [id*="video"]');
        if (videoContainer) {
          const containerElements = videoContainer.querySelectorAll('*');
          for (const el of Array.from(containerElements)) {
            const text = el.textContent?.trim();
            const style = window.getComputedStyle(el);
            
            // Check if element looks like a subtitle (small text, positioned over video, visible)
            const zIndexNum = parseInt(style.zIndex, 10) || 0;
            if (text && 
                text.length > 0 && 
                text.length < 200 && // Subtitle lines are usually short
                style.position !== 'static' &&
                (zIndexNum > 0 || style.position === 'absolute' || style.position === 'fixed') &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0') {
              
              // Check if it's likely a subtitle (not navigation, buttons, etc.)
              const tagName = el.tagName.toLowerCase();
              if (tagName !== 'button' && 
                  tagName !== 'a' && 
                  !el.closest('nav') &&
                  !el.closest('header') &&
                  !el.closest('footer')) {
                subtitleElements.push(el);
              }
            }
          }
        }
        
        // Remove duplicates and extract text
        const uniqueElements = Array.from(new Set(subtitleElements));
        
        for (const el of uniqueElements) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            // Avoid duplicates
            if (!visibleSubtitles.some(s => s.text === text)) {
              visibleSubtitles.push({
                text: text,
                element: el
              });
            }
          }
        }
        
        if (visibleSubtitles.length > 0) {
          // Convert to subtitle format (without timestamps, estimate based on order)
          const parsedSubtitles = visibleSubtitles.map((sub, index) => ({
            start: index * 3, // Estimate 3 seconds per subtitle
            duration: 3,
            text: sub.text
          }));
          
          if (parsedSubtitles.length >= 5) { // Minimum threshold for reliability
            return { 
              subtitles: parsedSubtitles, 
              metadata,
              note: 'Subtitles extracted from visible DOM elements (text only, no timestamps)'
            };
          }
        }
      } catch (e) {
        logError(' Method 6 failed:', e);
      }
  
      // If no subtitles found
      logError('All methods failed - no subtitles found');
      throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
    } catch (error) {
      logError('Error in Vimeo subtitle extraction:', error);
      logError('Error stack:', error.stack);
      throw error;
    }
  })(); // Return Promise from async IIFE
}

