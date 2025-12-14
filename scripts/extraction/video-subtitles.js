// Video subtitle extraction for YouTube and Vimeo

import { log, logError } from '../utils/logging.js';

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
    
    // Set up one-time message listener
    const messageListener = (message, sender, sendResponse) => {
      log('🟢 Step A: Message received in background', { 
        action: message.action,
        hasError: !!message.error,
        hasResult: !!message.result,
        senderTabId: sender.tab?.id,
        expectedTabId: tabId
      });
      
      // Check both action and type to catch messages in different formats
      if (message.action === 'youtubeSubtitlesResult' || 
          (message.type === 'ClipAIbleYouTubeSubtitles' && message.action === 'youtubeSubtitlesResult')) {
        // Message can come from content script (forwarding from MAIN world)
        // or directly from injected script (if chrome.runtime was available)
        // Don't check tabId strictly - content script may have different sender.tab
        
        log('🟢 Step B: Processing YouTube subtitles result', {
          action: message.action,
          type: message.type,
          subtitleCount: message.result?.subtitles?.length || 0,
          hasError: !!message.error
        });
        
        if (resolved) {
          log('🟢 Already resolved, ignoring duplicate message');
          return true; // Already handled
        }
        
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(messageListener);
        
        log('🟢 Step C: Received subtitle result message', { 
          hasError: !!message.error,
          hasResult: !!message.result,
          subtitleCount: message.result?.subtitles?.length || 0,
          senderTabId: sender.tab?.id,
          expectedTabId: tabId
        });
        
        try {
        if (message.error) {
            logError('🟢 Step D: Error in subtitle extraction', message.error);
          reject(new Error(message.error));
        } else if (message.result) {
          if (!message.result.subtitles || message.result.subtitles.length === 0) {
              logError('🟢 Step D: No subtitles in result');
            reject(new Error('No subtitles found. Make sure subtitles are enabled for this video.'));
          } else {
              log('🟢 Step D: YouTube subtitles extracted successfully', { 
              count: message.result.subtitles.length,
              title: message.result.metadata.title 
            });
            resolve(message.result);
          }
        } else {
            logError('🟢 Step D: No result in message');
          reject(new Error('Subtitle extraction returned no result'));
        }
        } catch (error) {
          logError('🟢 Step D: Exception while processing result', error);
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
    log('🟢 Registering message listener for youtubeSubtitlesResult (BEFORE script execution)');
    chrome.runtime.onMessage.addListener(messageListener);
    
    // Inject and execute script in page context
    log('Executing subtitle extraction script in page context', { tabId });
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: extractYouTubeSubtitlesInlined
    }).then(results => {
      log('Script execution completed', { 
        hasResults: !!results,
        hasError: results?.[0]?.error ? true : false
      });
      
      if (!results || !results[0]) {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(messageListener);
          reject(new Error('Failed to execute subtitle extraction script'));
        }
        return;
      }
      
      if (results[0].error) {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(messageListener);
          logError('Subtitle extraction script error', results[0].error);
          reject(new Error(`Subtitle extraction failed: ${results[0].error.message || results[0].error}`));
        }
        return;
      }
      
      // Script executed successfully, wait for message with results
      // (fetch happens asynchronously in page context)
      log('Script executed successfully, waiting for subtitle data...');
    }).catch(error => {
      if (!resolved) {
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(messageListener);
        logError('Script execution failed', error);
        reject(error);
      }
    });
    
    // Check storage periodically for pendingSubtitles (fallback when Extension context invalidated)
    let storageCheckInterval = null;
    const checkStorage = async () => {
      try {
        const storage = await chrome.storage.local.get(['pendingSubtitles']);
        if (storage.pendingSubtitles && !resolved) {
          const pendingData = storage.pendingSubtitles;
          // Check if this is recent (within last 30 seconds - same as timeout)
          const age = Date.now() - (pendingData.timestamp || 0);
          if (age < 30000) {
            log('🟢 Found pendingSubtitles in storage (Extension context invalidated recovery)', {
              subtitleCount: pendingData.subtitles?.length || 0,
              age: age,
              ageSeconds: Math.round(age / 1000)
            });
            
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (storageCheckInterval) clearInterval(storageCheckInterval);
            chrome.runtime.onMessage.removeListener(messageListener);
            
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
          } else {
            log('⚠️ Found pendingSubtitles but too old', {
              age: age,
              ageSeconds: Math.round(age / 1000),
              maxAge: 30000
            });
          }
        }
      } catch (error) {
        logError('Failed to check storage for pendingSubtitles', error);
      }
    };
    
    // Check storage every 500ms
    storageCheckInterval = setInterval(checkStorage, 500);
    
    // Also check immediately
    checkStorage();
    
    // Timeout after 30 seconds
    timeoutId = setTimeout(() => {
      if (!resolved) {
        // Final check of storage before timeout
        checkStorage().then(() => {
      if (!resolved) {
        resolved = true;
            if (storageCheckInterval) clearInterval(storageCheckInterval);
        chrome.runtime.onMessage.removeListener(messageListener);
        logError('Subtitle extraction timeout - no message received from page script');
        reject(new Error('Subtitle extraction timeout. The page may be taking too long to load subtitles.'));
          }
        });
      }
    }, 30000);
  });
}

/**
 * Inline function to extract YouTube subtitles
 * Runs in page context (MAIN world) - can fetch without CORS issues
 * Sends result back via chrome.runtime.sendMessage
 * Fetch and parsing happens here (in page context)
 */
function extractYouTubeSubtitlesInlined() {
  // Wrap in async IIFE to handle async operations
  (async () => {
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
      
      console.log('[ClipAIble] Starting subtitle extraction', { videoId });
      
      // ============================================
      // METHOD 1 (ОСНОВНОЙ): Внутренний YouTube API (/youtubei/v1/player)
      // Based on: Real-world testing shows this is the most reliable method (Dec 2025)
      // YouTube Internal API работает стабильнее, чем прямой запрос к timedtext
      // ============================================
      let subtitleData = null;
      let subtitleUrl = null;
      
      console.log('[ClipAIble] METHOD 1: Trying internal YouTube API (most reliable)');
      
      try {
        const apiKey = window.yt?.config_?.INNERTUBE_API_KEY;
        if (!apiKey) {
          throw new Error('INNERTUBE_API_KEY not found');
        }
        
        const clientName = window.yt?.config_?.INNERTUBE_CLIENT_NAME || 'WEB';
        const clientVersion = window.yt?.config_?.INNERTUBE_CLIENT_VERSION || '2.0';
        
        console.log('[ClipAIble] METHOD 1: Calling internal YouTube API', {
          apiKey: apiKey.substring(0, 20) + '...',
          clientName,
          clientVersion,
          videoId
        });
        
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
          
          console.log('[ClipAIble] METHOD 1: Found caption tracks in API response', {
            trackCount: tracks.length
          });
          
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
            
            console.log('[ClipAIble] METHOD 1: Fetching subtitles with JSON format');
            
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
                  console.log('[ClipAIble] METHOD 1: Successfully fetched JSON subtitles', {
                    eventCount: jsonData.events.length,
                    source: 'internal-api'
                  });
            } else {
                  throw new Error('Invalid JSON format: missing events array');
                }
              } catch (parseError) {
                console.warn('[ClipAIble] METHOD 1: Failed to parse JSON, trying XML fallback', parseError);
                // Попробуем XML формат как fallback
                if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText; // Сохраним как XML
                  console.log('[ClipAIble] METHOD 1: Got XML format (fallback)');
          } else {
                  throw new Error('Unknown subtitle format');
                }
              }
            } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
              // XML формат (fallback)
              subtitleData = responseText;
              console.log('[ClipAIble] METHOD 1: Got XML format (fallback)', {
                length: responseText.length
              });
            } else {
              throw new Error('Unknown subtitle format');
            }
          }
        }
      } catch (apiError) {
        console.warn('[ClipAIble] METHOD 1: Internal API failed, trying fallback methods', apiError);
      }
      
      // ============================================
      // METHOD 2 (FALLBACK): ytInitialPlayerResponse + &fmt=json3
      // Based on: MouseTooltipTranslator approach
      // Используется, если Internal API недоступен или не сработал
      // ВАЖНО: Может возвращать пустой ответ из-за expire параметра или POT токена
      // ============================================
      if (!subtitleData) {
        console.log('[ClipAIble] METHOD 2: Trying ytInitialPlayerResponse (fallback)');
      
        // Wait for ytInitialPlayerResponse to be available (YouTube may load it asynchronously)
      let attempts = 0;
        const maxAttempts = 5; // Уменьшено с 10 до 5, т.к. это fallback
        const waitInterval = 500;
        let method2Failed = false; // Track if METHOD 2 fetch failed (empty response)
      
        while (!subtitleData && !method2Failed && attempts < maxAttempts) {
        attempts++;
        
        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          
            console.log('[ClipAIble] METHOD 2: Found caption tracks in ytInitialPlayerResponse', {
            attempt: attempts,
            trackCount: tracks.length,
            tracks: tracks.map(t => ({
              kind: t.kind,
              languageCode: t.languageCode,
              name: t.name?.simpleText || t.name?.runs?.[0]?.text,
                hasBaseUrl: !!t.baseUrl
            }))
          });
          
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
              
              console.log('[ClipAIble] METHOD 2: Fetching subtitles with JSON format', {
                originalUrl: subtitleUrl.substring(0, 200),
                jsonUrl: jsonUrl.substring(0, 200),
                languageCode: selectedTrack.languageCode
              });
              
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
                  console.warn('[ClipAIble] METHOD 2: Subtitle response is empty, skipping to METHOD 3');
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
                      console.log('[ClipAIble] METHOD 2: Successfully fetched JSON subtitles', {
                        eventCount: jsonData.events.length,
                        source: 'ytInitialPlayerResponse'
                      });
                      break; // Успех!
                    }
                  } catch (parseError) {
                    console.warn('[ClipAIble] METHOD 2: Failed to parse JSON, trying XML fallback', parseError);
                    // Попробуем XML формат как fallback
                    if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                      subtitleData = responseText; // Сохраним как XML
                      break;
                    }
                  }
                } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  // XML формат (fallback)
                  subtitleData = responseText;
                  console.log('[ClipAIble] METHOD 2: Got XML format (fallback)', {
                    length: responseText.length
                  });
                  break;
                } else {
                  throw new Error('Unexpected response format');
                }
              } catch (fetchError) {
                // Если ошибка "empty response", не повторять попытки
                if (fetchError.message && fetchError.message.includes('empty')) {
                  console.warn('[ClipAIble] METHOD 2: Fetch failed with empty response, skipping to METHOD 3', fetchError);
                  method2Failed = true;
                  break;
                }
                console.warn('[ClipAIble] METHOD 2: Fetch failed, will try fallback methods', fetchError);
                subtitleUrl = null; // Сбросить для следующего метода
              }
            }
          }
          
          // Если не нашли и не было ошибки пустого ответа, подождать и попробовать снова
          if (!subtitleData && !method2Failed && attempts < maxAttempts) {
            console.log(`[ClipAIble] METHOD 2: Waiting for ytInitialPlayerResponse... (attempt ${attempts}/${maxAttempts})`);
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
        console.log('[ClipAIble] METHOD 3: Trying HTML parsing method');
        
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
                  
                  console.log('[ClipAIble] METHOD 3: Found caption tracks in HTML', {
                    trackCount: tracks.length
                  });
                  
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
                    
                    console.log('[ClipAIble] METHOD 3: Fetching subtitles with JSON format');
                    
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
                              console.log('[ClipAIble] METHOD 3: Successfully fetched JSON subtitles', {
                                eventCount: jsonData.events.length,
                                source: 'html-parsing'
                              });
                            }
                          } catch (parseError) {
                            console.warn('[ClipAIble] METHOD 3: Failed to parse JSON', parseError);
                          }
                        } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                          subtitleData = responseText; // XML fallback
                          console.log('[ClipAIble] METHOD 3: Got XML format (fallback)');
                        }
                      }
                    }
                  }
                }
              } catch (parseError) {
                console.warn('[ClipAIble] METHOD 3: Failed to parse captions from HTML', parseError);
              }
            }
          }
        } catch (htmlError) {
          console.warn('[ClipAIble] METHOD 3: HTML parsing failed', htmlError);
        }
      }
      
      // ============================================
      // METHOD 4 (ПОСЛЕДНИЙ FALLBACK): Прямой Timedtext API
      // Используется только если все предыдущие методы не сработали
      // ============================================
      if (!subtitleData) {
        console.log('[ClipAIble] METHOD 4: Trying direct Timedtext API (last resort)');
        
        const browserLang = navigator.language.split('-')[0];
        const languagesToTry = [browserLang, 'en', 'ru', 'ua'];
        const uniqueLangs = [...new Set(languagesToTry)];
        
        for (const lang of uniqueLangs) {
          try {
            // Всегда использовать JSON формат
            const timedtextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
            
            console.log('[ClipAIble] METHOD 4: Trying Timedtext API', { lang });
            
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
                      console.log('[ClipAIble] METHOD 4: Successfully fetched JSON subtitles', {
                        eventCount: jsonData.events.length,
                        source: 'timedtext-api',
                        lang
                      });
                      break; // Успех!
                    }
                  } catch (parseError) {
                    console.warn('[ClipAIble] METHOD 4: Failed to parse JSON', parseError);
                  }
                } else if (trimmed.startsWith('<?xml') || trimmed.includes('<text')) {
                  subtitleData = responseText; // XML fallback
                  console.log('[ClipAIble] METHOD 4: Got XML format (fallback)', { lang });
                  break;
                }
              }
            }
          } catch (fetchError) {
            console.warn('[ClipAIble] METHOD 4: Timedtext API failed', { lang, error: fetchError.message });
            // Продолжить с следующим языком
          }
        }
      }
      
      // ============================================
      // METHOD 5 (ОПЦИОНАЛЬНЫЙ): video.textTracks
      // Используется только если все предыдущие методы не сработали
      // ============================================
      if (!subtitleData) {
        console.log('[ClipAIble] METHOD 5: Trying video.textTracks (optional fallback)');
        
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
                console.log('[ClipAIble] METHOD 5: Successfully extracted from video.textTracks', {
                  count: subtitles.length
                });
                
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
                console.log('[ClipAIble] ✅ METHOD 5: Result sent via CustomEvent');
                
                return; // Выход из функции
              }
            }
          }
        } catch (textTracksError) {
          console.warn('[ClipAIble] METHOD 5: video.textTracks failed', textTracksError);
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
        console.log('[ClipAIble] Parsing JSON subtitle format', {
          eventCount: subtitleData.events.length
        });
        
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
        
        console.log('[ClipAIble] JSON parsing complete', {
          eventsProcessed: subtitleData.events.length,
          subtitlesExtracted: subtitles.length
        });
      } else if (typeof subtitleData === 'string') {
        // XML формат (fallback)
        console.log('[ClipAIble] Parsing XML subtitle format (fallback)');
        
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
        
        console.log('[ClipAIble] XML parsing complete', { 
          matchesFound: matchCount,
          subtitlesExtracted: subtitles.length 
        });
      }
      
      if (subtitles.length === 0) {
        throw new Error('Subtitles data is empty or invalid');
      }
      
      console.log('[ClipAIble] Subtitles extracted, sending result', { 
        count: subtitles.length,
        title: metadata.title 
      });
      
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
      
      console.log('[ClipAIble] 🔵 Step 0: Preparing to send message', {
        hasResult: !!messageData.result,
        subtitleCount: messageData.result?.subtitles?.length || 0,
        action: messageData.action
      });
      
      // КРИТИЧНО: CustomEvent на document - ЕДИНСТВЕННЫЙ надежный способ
      // между MAIN world и ISOLATED world в Chrome Extensions
      // window.postMessage НЕ работает между мирами!
      
      const sendViaCustomEvent = () => {
        try {
          console.log('[ClipAIble] 🔵 Sending via CustomEvent on document...');
          console.log('[ClipAIble] 🔵 Document readyState:', document.readyState);
          console.log('[ClipAIble] 🔵 Document has listeners?', document.addEventListener ? 'yes' : 'no');
          
          // Основной способ: CustomEvent на document
        const customEvent = new CustomEvent('ClipAIbleSubtitleMessage', {
          detail: messageData,
          bubbles: true,
          cancelable: true
        });
          
        document.dispatchEvent(customEvent);
          console.log('[ClipAIble] ✅ CustomEvent dispatched on document', {
            eventType: 'ClipAIbleSubtitleMessage',
            hasDetail: !!customEvent.detail,
            subtitleCount: messageData.result?.subtitles?.length || 0,
            bubbles: customEvent.bubbles,
            cancelable: customEvent.cancelable
          });
          
          // Also try window.postMessage as fallback (though it may not work between worlds)
          try {
            window.postMessage(messageData, window.location.origin);
            console.log('[ClipAIble] ✅ Also sent via window.postMessage (fallback)');
          } catch (postMsgError) {
            console.warn('[ClipAIble] ⚠️ window.postMessage failed (expected if cross-world)', postMsgError);
          }
          
      } catch (e) {
          console.error('[ClipAIble] ❌ Failed to dispatch CustomEvent:', e);
        }
      };
      
      // Wait a bit for content script to be ready
      // Content script should be loaded by manifest.json, but give it a moment
      // Use setTimeout to ensure content script listener is registered
      const sendWithDelay = () => {
        // Try sending immediately first
        sendViaCustomEvent();
        
        // Also send after a short delay to ensure content script is ready
        setTimeout(() => {
          console.log('[ClipAIble] 🔵 Retrying CustomEvent after delay (ensuring content script is ready)');
          sendViaCustomEvent();
        }, 100);
        
        // One more retry after longer delay
        setTimeout(() => {
          console.log('[ClipAIble] 🔵 Final retry CustomEvent after longer delay');
          sendViaCustomEvent();
        }, 500);
      };
      
      if (document.readyState === 'loading') {
        console.log('[ClipAIble] 🔵 Document still loading, waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', () => {
          console.log('[ClipAIble] 🔵 DOMContentLoaded fired, sending CustomEvent');
          sendWithDelay();
        });
      } else {
        // Document is ready, send with delay to ensure content script is ready
        sendWithDelay();
      }
      
      console.log('[ClipAIble] ✅ Result sent via CustomEvent (with retries)');
    } catch (error) {
      console.error('[ClipAIble] Error in subtitle extraction:', error);
      
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
        console.log('[ClipAIble] ✅ Error sent via CustomEvent on document');
      } catch (e) {
        console.error('[ClipAIble] Failed to send error message', e);
      }
    }
  })();
}

/**
 * Extract subtitles from Vimeo page
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} {subtitles: Array, metadata: Object}
 */
export async function extractVimeoSubtitles(tabId) {
  log('Extracting Vimeo subtitles', { tabId });
  
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: extractVimeoSubtitlesInlined
  });
  
  if (!results || !results[0]) {
    throw new Error('Failed to execute subtitle extraction script');
  }
  
  if (results[0].error) {
    logError('Subtitle extraction script error', results[0].error);
    throw new Error(`Subtitle extraction failed: ${results[0].error.message || results[0].error}`);
  }
  
  if (!results[0].result) {
    throw new Error('Subtitle extraction returned no result');
  }
  
  const result = results[0].result;
  
  if (!result.subtitles || result.subtitles.length === 0) {
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
 */
function extractVimeoSubtitlesInlined() {
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
  
  // Vimeo stores subtitle data in player config
  // Check for player data
  if (window.vimeoPlayerConfig) {
    const config = window.vimeoPlayerConfig;
    if (config.video && config.video.textTracks) {
      const tracks = config.video.textTracks;
      // Find best track (prefer manual, then auto-generated)
      const selectedTrack = tracks.find(t => t.kind === 'captions' && !t.auto) || 
                          tracks.find(t => t.kind === 'captions') ||
                          tracks[0];
      
      if (selectedTrack && selectedTrack.src) {
        // Fetch subtitles (Vimeo uses WebVTT format)
        return fetch(selectedTrack.src)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch subtitles: ${response.status}`);
            }
            return response.text();
          })
          .then(vtt => {
            // Parse WebVTT format
            const lines = vtt.split('\n');
            let currentTime = null;
            let currentText = [];
            
            for (const line of lines) {
              // Time cue: 00:00:00.000 --> 00:00:03.500
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
              } else if (line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('NOTE') && currentTime !== null) {
                // Text line (remove HTML tags)
                const cleanText = line.replace(/<[^>]*>/g, '').trim();
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
            
            if (subtitles.length === 0) {
              throw new Error('Subtitles VTT is empty or invalid');
            }
            
            return { subtitles, metadata };
          })
          .catch(error => {
            console.error('[ClipAIble] Failed to fetch/parse Vimeo subtitles:', error);
            throw new Error(`Failed to fetch subtitles: ${error.message}`);
          });
      }
    }
  }
  
  // Alternative: Check for Vimeo API data in page
  if (window.__INITIAL_STATE__) {
    try {
      const state = window.__INITIAL_STATE__;
      // Vimeo stores video data in different structures
      // This may need adjustment based on actual Vimeo page structure
    } catch (e) {
      console.error('[ClipAIble] Failed to parse Vimeo initial state', e);
    }
  }
  
  // If no subtitles found
  throw new Error('No subtitles found. Make sure subtitles are enabled for this video.');
}

