// Video subtitle extraction for YouTube and Vimeo

import { log, logError, logWarn } from '../utils/logging.js';

/**
 * Extract subtitles from YouTube page
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} {subtitles: Array, metadata: Object}
 */
export async function extractYouTubeSubtitles(tabId) {
  log('Extracting YouTube subtitles', { tabId });
  
  // Use sendMessage/postMessage for async fetch (no CORS in page context)
  // Injected script will send window.postMessage, content script will forward to background
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let resolved = false;
    let storageCheckInterval = null; // КРИТИЧНО: Объявить раньше, чтобы использовать в ранних проверках DOM
    
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
      // КРИТИЧНО: Проверяем все возможные форматы сообщений
      const isYouTubeSubtitlesResult = 
        message.action === 'youtubeSubtitlesResult' || 
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.action === 'youtubeSubtitlesResult') ||
        (message.type === 'ClipAIbleYouTubeSubtitles' && !message.action) || // Fallback for messages without action
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.result) || // Если есть result, это наше сообщение
        (message.type === 'ClipAIbleYouTubeSubtitles' && message.error); // Если есть error, это тоже наше сообщение
      
      // КРИТИЧНО: Игнорировать другие сообщения (getState, etc.)
      if (!isYouTubeSubtitlesResult) {
        // Not our message, don't handle
        return false;
      }
      
      if (isYouTubeSubtitlesResult) {
        // Message can come from content script (forwarding from MAIN world)
        // or directly from injected script (if chrome.runtime was available)
        // Don't check tabId strictly - content script may have different sender.tab
        
        if (resolved) {
          return true; // Already handled
        }
        
        resolved = true;
        cleanup();
        
        try {
        if (message.error) {
            logError('Error in subtitle extraction', message.error);
          reject(new Error(message.error));
        } else if (message.result) {
          if (!message.result.subtitles || message.result.subtitles.length === 0) {
              logError('No subtitles in result');
            reject(new Error('No subtitles found. Make sure subtitles are enabled for this video.'));
          } else {
            log('YouTube subtitles extracted successfully', { 
              count: message.result.subtitles.length,
              title: message.result.metadata.title 
            });
            resolve(message.result);
          }
        } else {
            logError('No result in message');
          reject(new Error('Subtitle extraction returned no result'));
        }
        } catch (error) {
          logError('Exception while processing result', error);
          reject(error);
        }
        
        // Send response back to content script (optional, but good practice)
        try {
          sendResponse({ success: true, received: true });
        } catch (e) {
          // Ignore if sendResponse already called
        }
        
        return true;
      }
      
      // Not our message, don't handle
      return false;
    };
    
    // КРИТИЧНО: Регистрировать listener ДО выполнения скрипта!
    // Это гарантирует, что listener будет готов к получению сообщения
    // Listener регистрируется синхронно, так что он будет готов сразу
    chrome.runtime.onMessage.addListener(messageListener);
    
    // КРИТИЧНО: Сначала проверить, загружен ли content script
    // Если нет, попробовать принудительно инжектить content script
    // Используем async IIFE, так как мы внутри Promise executor
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
        
        // Попробовать принудительно инжектить content script
        // В Manifest V3 нельзя инжектить в ISOLATED world через executeScript,
        // но можно попробовать использовать files из manifest
        try {
          // Попробовать инжектить content script через scripting.executeScript с files
          // Но это не сработает для ISOLATED world - только для MAIN world
          // Поэтому просто продолжим - injected script попробует использовать CustomEvent
          // и если content script загрузится позже, он подхватит событие
          log('Content script will be loaded by manifest.json, continuing with injected script');
        } catch (injectError) {
          logWarn('Failed to inject content script programmatically', injectError);
        }
      }
      
      // Inject and execute script in page context
      log('Executing subtitle extraction script in page context', { 
        tabId, 
        contentScriptAvailable,
        funcType: typeof extractYouTubeSubtitlesInlined,
        funcName: extractYouTubeSubtitlesInlined?.name || 'unknown'
      });
      
      // КРИТИЧНО: Проверить, что функция может быть сериализована
      try {
        // Попытка сериализации функции для проверки
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
        args: [contentScriptAvailable] // Pass availability flag to injected script
      }).then(results => {
      
      if (!results || !results[0]) {
        if (!resolved) {
          // КРИТИЧНО: Проверить DOM перед reject (может быть уже сохранено)
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
                if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) { // Increased from 30s to 60s
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
            
            // Если DOM пустой - reject
            if (!resolved) {
              resolved = true;
              cleanup();
              logError('Script execution returned no results', {
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
      
      if (results[0].error) {
        if (!resolved) {
          // КРИТИЧНО: Проверить DOM перед reject (может быть уже сохранено)
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
                if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) { // Increased from 30s to 60s
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
            
            // Если DOM пустой - reject
            if (!resolved) {
              resolved = true;
              cleanup();
              logError('Subtitle extraction script error', {
                error: results[0].error,
                errorMessage: results[0].error?.message || String(results[0].error),
                errorName: results[0].error?.name,
                errorStack: results[0].error?.stack,
                frameId: results[0].frameId
              });
              reject(new Error(`Subtitle extraction failed: ${results[0].error?.message || results[0].error}`));
            }
          })();
        }
        return;
      }
      
      // Script executed successfully, wait for message with results
      // (fetch happens asynchronously in page context)
      
      // КРИТИЧНО: Если есть ошибка выполнения, но она не была обработана выше
      if (results[0]?.error && !resolved) {
        // КРИТИЧНО: Проверить DOM перед reject
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
          
          // Если DOM пустой - reject
          if (!resolved) {
            resolved = true;
            cleanup();
            logError('Subtitle extraction script execution error (from results)', {
              error: results[0].error,
              errorMessage: results[0].error?.message || String(results[0].error),
              errorStack: results[0].error?.stack
            });
            reject(new Error(`Subtitle extraction failed: ${results[0].error?.message || results[0].error}`));
          }
        })();
        return;
      }
      
      // КРИТИЧНО: Немедленная проверка DOM fallback (если Extension context invalidated, данные уже могут быть в DOM)
      // Это ускоряет получение данных при Extension context invalidated
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
                  // Удалить элемент после чтения
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
          // Игнорируем ошибки DOM fallback (элемент может не существовать)
          // Это нормально, если Extension context не invalidated
        }
      })();
    }).catch(async (error) => {
      if (!resolved) {
        // КРИТИЧНО: Проверить DOM перед reject (может быть уже сохранено content script)
        
        try {
          const domResult = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
              const element = document.getElementById('ClipAIblePendingSubtitles');
              if (element && element.getAttribute('data-subtitles')) {
                try {
                  const data = JSON.parse(element.getAttribute('data-subtitles'));
                  element.remove(); // Очистить после чтения
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
              if (age < 30000) { // В пределах 30 секунд
                resolved = true;
                cleanup();
                
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
                return; // КРИТИЧНО: выйти из catch, не продолжать с reject
              }
            }
          }
        } catch (domError) {
          logError('DOM check failed in catch block', domError);
        }
        
        // Если DOM пустой или проверка не удалась - продолжить с reject
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
    // КРИТИЧНО: Если content script не загружен, injected script будет использовать storage API напрямую
    // Поэтому нужно проверять storage чаще и быстрее
    // storageCheckInterval уже объявлен в начале Promise (строка 18)
    const checkStorage = async () => {
      try {
        // Check storage first
        const storage = await chrome.storage.local.get(['pendingSubtitles']);
        if (storage.pendingSubtitles && !resolved) {
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
        
        // КРИТИЧНО: Также проверяем DOM fallback (если chrome.storage недоступен)
        // Content script может сохранить данные в DOM элемент ClipAIblePendingSubtitles
        try {
          const domResult = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
              const element = document.getElementById('ClipAIblePendingSubtitles');
              if (element && element.getAttribute('data-subtitles')) {
                try {
                  const data = JSON.parse(element.getAttribute('data-subtitles'));
                  // Удалить элемент после чтения
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
          // Игнорируем ошибки DOM fallback (элемент может не существовать)
        }
      } catch (error) {
        logError('Failed to check storage for pendingSubtitles', error);
      }
    };
    
    // Check storage every 200ms (more frequent check for direct storage fallback)
    // Более частая проверка, так как injected script может использовать storage напрямую
    // если content script не загружен
    storageCheckInterval = setInterval(checkStorage, 200);
    
    // Also check immediately
    checkStorage();
    
    // Timeout after 60 seconds
    timeoutId = setTimeout(async () => {
      if (!resolved) {
        // Final check of storage before timeout
        await checkStorage();
        
        // КРИТИЧНО: Проверить DOM ПЕРЕД reject (если storage не сработал)
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
                    element.remove(); // Очистить после чтения
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
              
              // Проверка возраста данных (не старше 60 секунд)
              if (age < 60000 && domData.subtitles && domData.subtitles.length > 0) {
                
                resolved = true;
                cleanup();
                
                resolve({
                  subtitles: domData.subtitles,
                  metadata: domData.metadata || {}
                });
                return; // КРИТИЧНО: выйти из timeout, не продолжать с reject
              } else {
              }
            }
          } catch (domCheckError) {
            logError('Failed to check DOM fallback during timeout', domCheckError);
          }
        }
        
        // Если DOM тоже пустой - reject
        if (!resolved) {
          resolved = true;
          cleanup();
          logError('Subtitle extraction timeout - no message received from page script');
          reject(new Error('Subtitle extraction timeout. The page may be taking too long to load subtitles.'));
        }
      }
    }, 60000); // Increased from 30 to 60 seconds for subtitle extraction timeout
  });
}

/**
 * Inline function to extract YouTube subtitles
 * Runs in page context (MAIN world) - can fetch without CORS issues
 * Sends result back via chrome.runtime.sendMessage
 * Fetch and parsing happens here (in page context)
 * @param {boolean} contentScriptAvailable - Whether content script is loaded and responding
 */
function extractYouTubeSubtitlesInlined(contentScriptAvailable) {
  // КРИТИЧНО: executeScript ждет Promise, если функция возвращает Promise
  // Поэтому возвращаем Promise, чтобы executeScript дождался результата
  return (async () => {
    try {
      // Extract metadata first
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
      
      // Extract video ID from URL (support watch, shorts, embed)
      let videoId = null;
      const url = new URL(window.location.href);
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else if (url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.split('/')[2];
      } else if (url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/')[2];
      }
      
      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }
      
      // КРИТИЧНО: Проверить, что мы на правильной странице YouTube
      if (!window.location.hostname.includes('youtube.com')) {
        throw new Error('Not on YouTube page');
      }
      
      // ============================================
      // METHOD 1 (ОСНОВНОЙ): Внутренний YouTube API (/youtubei/v1/player)
      // Based on: Real-world testing shows this is the most reliable method (Dec 2025)
      // YouTube Internal API работает стабильнее, чем прямой запрос к timedtext
      // ============================================
      let subtitleData = null;
      let subtitleUrl = null;
      
      try {
        const apiKey = window.yt?.config_?.INNERTUBE_API_KEY;
        if (!apiKey) {
          throw new Error('INNERTUBE_API_KEY not found');
        }
        
        const clientName = window.yt?.config_?.INNERTUBE_CLIENT_NAME || 'WEB';
        const clientVersion = window.yt?.config_?.INNERTUBE_CLIENT_VERSION || '2.0';
        
        const response = await fetch(
          `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              videoId: videoId,
              context: {
                client: {
                  clientName: clientName,
                  clientVersion: clientVersion,
                },
              },
            }),
          }
        );
        
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const apiData = await response.json();
        
        if (apiData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = apiData.captions.playerCaptionsTracklistRenderer.captionTracks;
          
          // Выбрать трек (приоритет: manual > auto-generated)
          let selectedTrack = tracks.find(t => !t.kind || t.kind === '');
                if (!selectedTrack) {
            selectedTrack = tracks.find(t => t.kind === 'asr');
                }
          if (!selectedTrack && tracks.length > 0) {
            selectedTrack = tracks[0];
                }
                
                if (selectedTrack?.baseUrl) {
                  subtitleUrl = selectedTrack.baseUrl;
            
            // КРИТИЧНО: Заменить или добавить &fmt=json3 к baseUrl
            // Если URL уже содержит fmt=, заменить его, иначе добавить
            let jsonUrl;
            if (subtitleUrl.includes('fmt=')) {
              // Заменить существующий fmt параметр
              jsonUrl = subtitleUrl.replace(/[?&]fmt=[^&]*/, (match) => {
                return match.startsWith('?') ? '?fmt=json3' : '&fmt=json3';
              });
          } else {
              // Добавить fmt параметр
              jsonUrl = subtitleUrl.includes('?') 
                ? subtitleUrl + '&fmt=json3'
                : subtitleUrl + '?fmt=json3';
            }
            
            // Простой fetch БЕЗ параметров
            const subtitleResponse = await fetch(jsonUrl);
            
            if (!subtitleResponse.ok) {
              throw new Error(`Subtitle fetch returned ${subtitleResponse.status}`);
            }
            
            const responseText = await subtitleResponse.text();
            
            // КРИТИЧНО: Проверить что response НЕ пустой
            if (!responseText || responseText.trim().length === 0) {
              throw new Error('Subtitle response is empty');
            }
            
            // Проверить формат (JSON или XML)
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
                // Попробуем XML формат как fallback
                if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText; // Сохраним как XML
          } else {
                  throw new Error('Unknown subtitle format');
                }
              }
            } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
              // XML формат (fallback)
              subtitleData = responseText;
            } else {
              throw new Error('Unknown subtitle format');
            }
          }
        }
      } catch (apiError) {
        // Internal API failed, trying fallback methods
      }
      
      // ============================================
      // METHOD 2 (FALLBACK): ytInitialPlayerResponse + &fmt=json3
      // Based on: MouseTooltipTranslator approach
      // Используется, если Internal API недоступен или не сработал
      // ВАЖНО: Может возвращать пустой ответ из-за expire параметра или POT токена
      // ============================================
      if (!subtitleData) {
      
        // Wait for ytInitialPlayerResponse to be available (YouTube may load it asynchronously)
      let attempts = 0;
        const maxAttempts = 5; // Уменьшено с 10 до 5, т.к. это fallback
        const waitInterval = 500;
        let method2Failed = false; // Track if METHOD 2 fetch failed (empty response)
      
        while (!subtitleData && !method2Failed && attempts < maxAttempts) {
        attempts++;
        
        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          
            // Priority: manual > auto-generated > any
            let selectedTrack = tracks.find(t => !t.kind || t.kind === '');
          if (!selectedTrack) {
            selectedTrack = tracks.find(t => t.kind === 'asr');
          }
          if (!selectedTrack && tracks.length > 0) {
            selectedTrack = tracks[0];
          }
          
            if (selectedTrack?.baseUrl) {
              subtitleUrl = selectedTrack.baseUrl;
              
              // КРИТИЧНО: Заменить или добавить &fmt=json3 к baseUrl
              // Если URL уже содержит fmt=, заменить его, иначе добавить
              let jsonUrl;
              if (subtitleUrl.includes('fmt=')) {
                // Заменить существующий fmt параметр
                jsonUrl = subtitleUrl.replace(/[?&]fmt=[^&]*/, (match) => {
                  return match.startsWith('?') ? '?fmt=json3' : '&fmt=json3';
                });
              } else {
                // Добавить fmt параметр
                jsonUrl = subtitleUrl.includes('?') 
                  ? subtitleUrl + '&fmt=json3'
                  : subtitleUrl + '?fmt=json3';
              }
              
              try {
                // Простой fetch БЕЗ параметров (как в MouseTooltipTranslator)
                const response = await fetch(jsonUrl);
                
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const responseText = await response.text();
                
                // КРИТИЧНО: Проверить что response НЕ пустой
                if (!responseText || responseText.trim().length === 0) {
                  // Пустой ответ - не повторять попытки, сразу переходить к METHOD 3
                  method2Failed = true;
                  break;
                }
                
                // Проверить, что это JSON
                const trimmed = responseText.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try {
                    const jsonData = JSON.parse(responseText);
                    if (jsonData.events && Array.isArray(jsonData.events)) {
                      subtitleData = jsonData;
                      break; // Успех!
                    }
                  } catch (parseError) {
                    // Попробуем XML формат как fallback
                    if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                      subtitleData = responseText; // Сохраним как XML
                      break;
                    }
                  }
                } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  // XML формат (fallback)
                  subtitleData = responseText;
                  break;
                } else {
                  throw new Error('Unexpected response format');
                }
              } catch (fetchError) {
                // Если ошибка "empty response", не повторять попытки
                if (fetchError.message && fetchError.message.includes('empty')) {
                  method2Failed = true;
                  break;
                }
                subtitleUrl = null; // Сбросить для следующего метода
              }
            }
          }
          
          // Если не нашли и не было ошибки пустого ответа, подождать и попробовать снова
          if (!subtitleData && !method2Failed && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, waitInterval));
        }
      }
      }
      
      // ============================================
      // METHOD 3 (FALLBACK): HTML Parsing
      // Based on: kazuki-sf/YouTube_Summary_with_ChatGPT
      // Используется, если Internal API и ytInitialPlayerResponse не сработали
      // ============================================
      if (!subtitleData) {
        
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
                  
                  // Выбрать трек
                  let selectedTrack = tracks.find(t => !t.kind || t.kind === '');
                  if (!selectedTrack) {
                    selectedTrack = tracks.find(t => t.kind === 'asr');
                  }
                  if (!selectedTrack && tracks.length > 0) {
                    selectedTrack = tracks[0];
                  }
                  
                  if (selectedTrack?.baseUrl) {
                    subtitleUrl = selectedTrack.baseUrl;
                    
                    // КРИТИЧНО: Всегда добавлять &fmt=json3
                    const jsonUrl = subtitleUrl.includes('?') 
                      ? subtitleUrl + '&fmt=json3'
                      : subtitleUrl + '?fmt=json3';
                    
                    // Простой fetch БЕЗ параметров
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
          // Ignore HTML parsing errors
        }
      }
      
      // ============================================
      // METHOD 4 (ПОСЛЕДНИЙ FALLBACK): Прямой Timedtext API
      // Используется только если все предыдущие методы не сработали
      // ============================================
      if (!subtitleData) {
        const browserLang = navigator.language.split('-')[0];
        const languagesToTry = [browserLang, 'en', 'ru', 'ua'];
        const uniqueLangs = [...new Set(languagesToTry)];
        
        for (const lang of uniqueLangs) {
          try {
            // Всегда использовать JSON формат
            const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
            
            // Простой fetch БЕЗ параметров
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
                      break; // Успех!
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
            // Продолжить с следующим языком
          }
        }
      }
      
      // ============================================
      // METHOD 5 (ОПЦИОНАЛЬНЫЙ): video.textTracks
      // Используется только если все предыдущие методы не сработали
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
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            if (activeTrack && activeTrack.cues && activeTrack.cues.length > 0) {
              const subtitles = Array.from(activeTrack.cues).map(cue => ({
                start: cue.startTime,
                duration: cue.endTime - cue.startTime,
                text: cue.text.trim().replace(/\n/g, ' ')
              }));
              
              if (subtitles.length > 0) {
                // Отправить результат сразу
                const result = {
                  subtitles: subtitles,
                  metadata: metadata
                };
                
                // Отправить через CustomEvent (единственный надежный способ)
                document.dispatchEvent(new CustomEvent('ClipAIbleSubtitleMessage', {
                  detail: {
                    type: 'ClipAIbleYouTubeSubtitles',
                    action: 'youtubeSubtitlesResult',
                    result: result
                  },
                  bubbles: true,
                  cancelable: true
                }));
                
                return; // Выход из функции
              }
            }
          }
        } catch (textTracksError) {
          // Ignore textTracks errors
        }
      }
      
      // Если все методы не сработали
      if (!subtitleData) {
        throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
      }
      
      // Парсинг полученных данных
      const subtitles = [];
      
      // Проверить формат данных
      if (typeof subtitleData === 'object' && subtitleData.events) {
        // JSON формат (приоритетный)
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
        // XML формат (fallback)
        
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
      
      // Отправить результат
      const result = {
        subtitles: subtitles,
        metadata: metadata
      };
      
      const messageData = {
        type: 'ClipAIbleYouTubeSubtitles',
        action: 'youtubeSubtitlesResult',
        result: result
      };
      
      // КРИТИЧНО: CustomEvent на document - ЕДИНСТВЕННЫЙ надежный способ
      // между MAIN world и ISOLATED world в Chrome Extensions
      // window.postMessage НЕ работает между мирами!
      
      // Define sendViaCustomEvent function first
      const sendViaCustomEvent = () => {
        try {
          // Основной способ: CustomEvent на document
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
          logError(' Failed to dispatch CustomEvent:', e);
        }
      };
      
      // Wait a bit for content script to be ready
      // Content script should be loaded by manifest.json, but give it a moment
      // Use setTimeout to ensure content script listener is registered
      // КРИТИЧНО: Уменьшено количество ретраев для производительности
      // Достаточно 2 ретраев (immediate + 200ms + 1000ms) вместо 5
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
      
      // КРИТИЧНО: Попробовать chrome.runtime.sendMessage напрямую (если доступен в MAIN world)
      // В некоторых случаях chrome.runtime может быть доступен в MAIN world
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage(messageData, (response) => {
            if (chrome.runtime.lastError) {
              // Fallback to CustomEvent
              sendViaCustomEventWithRetries();
            } else {
              // Success - no need to send via CustomEvent
              return;
            }
          });
        } catch (runtimeError) {
          // chrome.runtime.sendMessage not available in MAIN world (expected)
        }
      }
      
      // КРИТИЧНО: chrome.storage НЕ доступен в MAIN world!
      // Extension APIs доступны только в ISOLATED world (content scripts) и background scripts
      // Поэтому мы не можем использовать storage API напрямую из injected script
      // Единственный способ - через CustomEvent, который должен слушать content script
      // Если content script не загружен, CustomEvent не будет обработан
      // 
      // Решение: убедиться, что content script загружается, или использовать альтернативный метод
      // 
      // Попробуем использовать window.postMessage как дополнительный fallback
      // (хотя он обычно не работает между MAIN и ISOLATED, но попробуем)
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
      // CustomEvent может работать, если content script загрузится позже
      // КРИТИЧНО: CustomEvent - единственный способ коммуникации из MAIN world в ISOLATED world
      // Если content script не загружен, CustomEvent не будет обработан
      // Но мы все равно отправляем его, на случай если content script загрузится позже
      sendViaCustomEventWithRetries();
    } catch (error) {
      logError(' Error in subtitle extraction:', error);
      
      // Send error back to background script via postMessage
      // NOTE: chrome.runtime is NOT available in MAIN world
      const errorMessageData = {
        type: 'ClipAIbleYouTubeSubtitles',
        action: 'youtubeSubtitlesResult',
        error: error.message || String(error)
      };
      
      try {
        // Отправить ошибку через CustomEvent
        const customEvent = new CustomEvent('ClipAIbleSubtitleMessage', {
          detail: errorMessageData,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(customEvent);
      } catch (e) {
        logError(' Failed to send error message', e);
      }
    }
  })(); // Return Promise from async IIFE - executeScript will wait for it
}

/**
 * Extract subtitles from Vimeo page
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} {subtitles: Array, metadata: Object}
 */
export async function extractVimeoSubtitles(tabId) {
  log('Extracting Vimeo subtitles', { tabId });
  
  let results;
  try {
    results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: extractVimeoSubtitlesInlined
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
  
  if (results[0].error) {
    logError('Subtitle extraction script error', {
      error: results[0].error,
      errorMessage: results[0].error?.message,
      errorStack: results[0].error?.stack
    });
    throw new Error(`Subtitle extraction failed: ${results[0].error.message || results[0].error}`);
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
 */
function extractVimeoSubtitlesInlined() {
  return (async () => {
    try {
      // Enable debug logging only in development (can be controlled via flag)
      const DEBUG = false; // Set to true for detailed debugging
      const log = DEBUG ? console.log.bind(console, '[ClipAIble]') : () => {};
      const logError = console.error.bind(console, '[ClipAIble]');
      
      log('Starting Vimeo subtitle extraction');
      const subtitles = [];
      let metadata = {
        title: document.title.replace(' on Vimeo', ''),
        author: '',
        publishDate: ''
      };
      
      log('Page URL:', window.location.href);
      log('Page title:', metadata.title);
  
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
      log('Method 1: Checking window.vimeoPlayerConfig');
      if (window.vimeoPlayerConfig) {
        try {
          log('Method 1: vimeoPlayerConfig found');
          const config = window.vimeoPlayerConfig;
          if (config.video && config.video.textTracks) {
            log('Method 1: textTracks found', config.video.textTracks.length);
            const tracks = config.video.textTracks;
            // Find best track (prefer manual, then auto-generated)
            const selectedTrack = tracks.find(t => t.kind === 'captions' && !t.auto) || 
                                tracks.find(t => t.kind === 'captions') ||
                                tracks[0];
            
            log('Method 1: selectedTrack', selectedTrack ? { kind: selectedTrack.kind, hasSrc: !!selectedTrack.src } : 'none');
            if (selectedTrack && selectedTrack.src) {
              log('Method 1: Fetching subtitles from', selectedTrack.src);
              const response = await fetch(selectedTrack.src);
              if (response.ok) {
                const vtt = await response.text();
                log('Method 1: VTT received, length:', vtt.length);
                const parsedSubtitles = parseWebVTT(vtt);
                log('Method 1: Parsed subtitles count:', parsedSubtitles.length);
                if (parsedSubtitles.length > 0) {
                  log('Method 1: SUCCESS');
                  return { subtitles: parsedSubtitles, metadata };
                }
              } else {
                log('Method 1: Fetch failed', response.status);
              }
            }
          } else {
            log('Method 1: No textTracks in config');
          }
        } catch (e) {
          logError('Method 1 failed:', e);
        }
      } else {
        log('Method 1: window.vimeoPlayerConfig not found');
      }
      
      // ============================================
      // METHOD 2: window.player or window.vimeoPlayer
      // ============================================
      log('Method 2: Checking window.player/vimeoPlayer');
      const player = window.player || window.vimeoPlayer;
      if (player) {
        log('Method 2: Player found');
        try {
          // Try to get text tracks from player
          if (player.textTracks && player.textTracks.length > 0) {
            log('Method 2: textTracks found', player.textTracks.length);
            const tracks = Array.from(player.textTracks);
            const selectedTrack = tracks.find(t => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing') ||
                                tracks.find(t => t.kind === 'captions' || t.kind === 'subtitles') ||
                                tracks[0];
            
            if (selectedTrack && selectedTrack.cues && selectedTrack.cues.length > 0) {
              log('Method 2: Cues found', selectedTrack.cues.length);
              const parsedSubtitles = Array.from(selectedTrack.cues).map(cue => ({
                start: cue.startTime,
                duration: cue.endTime - cue.startTime,
                text: cue.text.trim().replace(/\n/g, ' ').replace(/<[^>]*>/g, '')
              }));
              
              if (parsedSubtitles.length > 0) {
                log('Method 2: SUCCESS');
                return { subtitles: parsedSubtitles, metadata };
              }
            } else {
              log('Method 2: No cues in selectedTrack');
            }
          } else {
            log('Method 2: No textTracks in player');
          }
        } catch (e) {
          logError('Method 2 failed:', e);
        }
      } else {
        log('Method 2: Player not found');
      }
      
      // ============================================
      // METHOD 3: video.textTracks (DOM element) - IMPROVED
      // ============================================
      log('Method 3: Checking video element');
      const videoElement = document.querySelector('video');
      if (videoElement && videoElement.textTracks && videoElement.textTracks.length > 0) {
        log('Method 3: Video element with textTracks found', videoElement.textTracks.length);
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
              log('Method 3: Activating track', activeTrack.language, activeTrack.label);
              activeTrack.mode = 'showing';
              
              // Try multiple wait times and check for cues
              for (let attempt = 0; attempt < 5; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Force cue loading by accessing cues property
                try {
                  if (activeTrack.cues && activeTrack.cues.length > 0) {
                    log('Method 3: Cues loaded after', (attempt + 1), 'seconds');
                    break;
                  }
                  
                  // Try to trigger cue loading by accessing activeCues
                  if (activeTrack.activeCues && activeTrack.activeCues.length > 0) {
                    log('Method 3: Active cues found');
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
              log('Method 3: Using cues', cues.length);
            } else if (activeTrack.activeCues && activeTrack.activeCues.length > 0) {
              cues = activeTrack.activeCues;
              log('Method 3: Using activeCues', cues.length);
            }
            
            if (cues && cues.length > 0) {
              const parsedSubtitles = Array.from(cues).map(cue => ({
                start: cue.startTime || 0,
                duration: (cue.endTime || cue.startTime || 0) - (cue.startTime || 0),
                text: (cue.text || cue.getCueAsHTML?.()?.textContent || '').trim().replace(/\n/g, ' ').replace(/<[^>]*>/g, '')
              })).filter(sub => sub.text && sub.text.length > 0);
              
              if (parsedSubtitles.length > 0) {
                log('Method 3: SUCCESS', parsedSubtitles.length, 'subtitles');
                return { subtitles: parsedSubtitles, metadata };
              }
            } else {
              log('Method 3: No cues available after activation');
            }
          }
        } catch (e) {
          logError('Method 3 failed:', e);
        }
      } else {
        log('Method 3: Video element not found or no textTracks');
      }
      
      // ============================================
      // METHOD 4: window.__INITIAL_STATE__ or window.vimeoData
      // ============================================
      log('Method 4: Checking window state objects');
      const state = window.__INITIAL_STATE__ || window.vimeoData || window.vimeo;
      if (state) {
        log(' Method 4: State object found');
        try {
          // Try different possible structures
          let videoData = null;
          
          if (state.video) {
            videoData = state.video;
            log(' Method 4: Found state.video');
          } else if (state.data && state.data.video) {
            videoData = state.data.video;
            log(' Method 4: Found state.data.video');
          } else if (state.player && state.player.video) {
            videoData = state.player.video;
            log(' Method 4: Found state.player.video');
          }
          
          if (videoData && videoData.textTracks) {
            log(' Method 4: textTracks found', videoData.textTracks.length);
            const tracks = videoData.textTracks;
            const selectedTrack = tracks.find(t => t.kind === 'captions' && !t.auto) || 
                                tracks.find(t => t.kind === 'captions') ||
                                tracks[0];
            
            if (selectedTrack && selectedTrack.src) {
              log(' Method 4: Fetching subtitles from', selectedTrack.src);
              const response = await fetch(selectedTrack.src);
              if (response.ok) {
                const vtt = await response.text();
                log(' Method 4: VTT received, length:', vtt.length);
                const parsedSubtitles = parseWebVTT(vtt);
                log(' Method 4: Parsed subtitles count:', parsedSubtitles.length);
                if (parsedSubtitles.length > 0) {
                  log(' Method 4: SUCCESS');
                  return { subtitles: parsedSubtitles, metadata };
                }
              } else {
                log(' Method 4: Fetch failed', response.status);
              }
            } else {
              log(' Method 4: No selectedTrack or src');
            }
          } else {
            log(' Method 4: No textTracks in videoData');
          }
        } catch (e) {
          logError(' Method 4 failed:', e);
        }
      } else {
        log(' Method 4: No state object found');
      }
      
      // ============================================
      // METHOD 5: Extract video ID and search for subtitle URLs
      // ============================================
      log('Method 5: Searching for subtitle URLs in scripts and page data');
      try {
        const url = new URL(window.location.href);
        const videoIdMatch = url.pathname.match(/\/(\d+)/);
        if (videoIdMatch) {
          const videoId = videoIdMatch[1];
          log(' Method 5: Video ID found', videoId);
          
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
          log(' Method 5: Checking', scripts.length, 'scripts');
          for (const script of scripts) {
            const scriptText = script.textContent || script.innerHTML;
            if (scriptText.includes('textTracks') || scriptText.includes('captions') || scriptText.includes('.vtt')) {
              log(' Method 5: Found script with subtitle references');
              
              for (const pattern of subtitlePatterns) {
                const matches = scriptText.matchAll(pattern);
                for (const match of matches) {
                  const subtitleUrl = match[1] || match[0];
                  if (subtitleUrl && subtitleUrl.includes('.vtt')) {
                    log(' Method 5: Found subtitle URL', subtitleUrl);
                    try {
                      const response = await fetch(subtitleUrl);
                      if (response.ok) {
                        const vtt = await response.text();
                        log(' Method 5: VTT received, length:', vtt.length);
                        const parsedSubtitles = parseWebVTT(vtt);
                        log(' Method 5: Parsed subtitles count:', parsedSubtitles.length);
                        if (parsedSubtitles.length > 0) {
                          log(' Method 5: SUCCESS');
                          return { subtitles: parsedSubtitles, metadata };
                        }
                      } else {
                        log(' Method 5: Fetch failed', response.status);
                      }
                    } catch (fetchError) {
                      log(' Method 5: Fetch error', fetchError.message);
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
                log(' Method 5: Found subtitle URL in HTML', subtitleUrl);
                try {
                  const response = await fetch(subtitleUrl);
                  if (response.ok) {
                    const vtt = await response.text();
                    const parsedSubtitles = parseWebVTT(vtt);
                    if (parsedSubtitles.length > 0) {
                      log(' Method 5: SUCCESS from HTML');
                      return { subtitles: parsedSubtitles, metadata };
                    }
                  }
                } catch (fetchError) {
                  // Continue to next match
                }
              }
            }
          }
          
          log(' Method 5: No subtitle URLs found');
        } else {
          log(' Method 5: No video ID found in URL');
        }
      } catch (e) {
        logError(' Method 5 failed:', e);
      }
      
      // ============================================
      // METHOD 6: DOM Parsing - Extract visible subtitles from screen
      // ============================================
      log('Method 6: Parsing visible subtitles from DOM');
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
              log(' Method 6: Found elements with selector', selector, elements.length);
              subtitleElements.push(...Array.from(elements));
            }
          } catch (e) {
            // Invalid selector, continue
          }
        }
        
        // Also search for elements near video player
        const videoContainer = document.querySelector('video')?.closest('[class*="player"], [class*="video"], [id*="player"], [id*="video"]');
        if (videoContainer) {
          log(' Method 6: Searching in video container');
          const containerElements = videoContainer.querySelectorAll('*');
          for (const el of containerElements) {
            const text = el.textContent?.trim();
            const style = window.getComputedStyle(el);
            
            // Check if element looks like a subtitle (small text, positioned over video, visible)
            if (text && 
                text.length > 0 && 
                text.length < 200 && // Subtitle lines are usually short
                style.position !== 'static' &&
                (style.zIndex > 0 || style.position === 'absolute' || style.position === 'fixed') &&
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
        log(' Method 6: Found', uniqueElements.length, 'potential subtitle elements');
        
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
          log(' Method 6: Found', visibleSubtitles.length, 'visible subtitle texts');
          
          // Convert to subtitle format (without timestamps, estimate based on order)
          const parsedSubtitles = visibleSubtitles.map((sub, index) => ({
            start: index * 3, // Estimate 3 seconds per subtitle
            duration: 3,
            text: sub.text
          }));
          
          if (parsedSubtitles.length >= 5) { // Minimum threshold for reliability
            log(' Method 6: SUCCESS - extracted', parsedSubtitles.length, 'subtitles from DOM');
            return { 
              subtitles: parsedSubtitles, 
              metadata,
              note: 'Subtitles extracted from visible DOM elements (text only, no timestamps)'
            };
          } else {
            log(' Method 6: Too few subtitles found', parsedSubtitles.length);
          }
        } else {
          log(' Method 6: No visible subtitles found');
        }
      } catch (e) {
        logError(' Method 6 failed:', e);
      }
  
      // If no subtitles found
      logError('All methods failed - no subtitles found');
      log('Available window objects:', {
        hasVimeoPlayerConfig: !!window.vimeoPlayerConfig,
        hasPlayer: !!window.player,
        hasVimeoPlayer: !!window.vimeoPlayer,
        hasInitialState: !!window.__INITIAL_STATE__,
        hasVimeoData: !!window.vimeoData,
        hasVimeo: !!window.vimeo,
        hasVideoElement: !!document.querySelector('video')
      });
      throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
    } catch (error) {
      logError('Error in Vimeo subtitle extraction:', error);
      logError('Error stack:', error.stack);
      throw error;
    }
  })(); // Return Promise from async IIFE
}

