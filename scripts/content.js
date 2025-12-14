// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';
  
  // КРИТИЧНО: Немедленная регистрация listener'ов ДО всего остального
  // Это гарантирует, что listener'ы будут готовы к получению сообщений
  console.log('[ClipAIble:Content] 🔵 Content script loaded and executing...', {
    url: window.location.href,
    readyState: document.readyState
  });
  
  // НЕМЕДЛЕННАЯ регистрация postMessage и CustomEvent listeners
  console.log('[ClipAIble:Content] 🔵 IMMEDIATE: Registering window.postMessage listener...');
  window.addEventListener('message', function handlePostMessage(event) {
    // Логировать ВСЕ сообщения для отладки
    if (event.data && (event.data.type === 'ClipAIbleYouTubeSubtitles' || event.data.action === 'youtubeSubtitlesResult')) {
      console.log('[ClipAIble:Content] 🔵 postMessage event received (RELEVANT)', {
        source: event.source,
        origin: event.origin,
        dataType: event.data?.type,
        action: event.data?.action,
        hasData: !!event.data,
        hasResult: !!event.data?.result,
        hasError: !!event.data?.error
      });
    }
    
    // КРИТИЧНО: НЕ блокировать сообщения по source!
    // Обрабатываем два типа сообщений: субтитры и fetch requests
    if (!event.data) {
      return;
    }
    
    // Обработка fetch requests для субтитров
    if (event.data.type === 'ClipAIbleSubtitleFetchRequest') {
      console.log('[ClipAIble:Content] Received subtitle fetch request from MAIN world', {
        requestId: event.data.requestId,
        urlLength: event.data.url?.length || 0
      });
      
      fetch(event.data.url, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json, text/xml, application/xml, */*',
          'Accept-Language': navigator.language || 'en',
          'Referer': window.location.href,
          'Origin': window.location.origin
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(responseText => {
        console.log('[ClipAIble:Content] Subtitle fetched successfully', {
          requestId: event.data.requestId,
          responseLength: responseText.length
        });
        
        const responseEvent = new CustomEvent('ClipAIbleSubtitleFetchResponse', {
          detail: {
            type: 'ClipAIbleSubtitleFetchResponse',
            requestId: event.data.requestId,
            responseText: responseText
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(responseEvent);
        
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.data.requestId,
          responseText: responseText
        }, '*');
      })
      .catch(error => {
        console.error('[ClipAIble:Content] Subtitle fetch failed', error);
        
        const errorEvent = new CustomEvent('ClipAIbleSubtitleFetchResponse', {
          detail: {
            type: 'ClipAIbleSubtitleFetchResponse',
            requestId: event.data.requestId,
            error: error.message || String(error)
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(errorEvent);
        
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.data.requestId,
          error: error.message || String(error)
        }, '*');
      });
      return;
    }
    
    
    // Обработка результатов извлечения субтитров
    if (event.data.type !== 'ClipAIbleYouTubeSubtitles') {
      return;
    }
    
    if (event.data && event.data.type === 'ClipAIbleYouTubeSubtitles') {
      console.log('[ClipAIble:Content] 🔵 Step 1 (postMessage): Received postMessage from MAIN world', {
        hasError: !!event.data.error,
        hasResult: !!event.data.result,
        action: event.data.action,
        subtitleCount: event.data.result?.subtitles?.length || 0
      });
      
      try {
        console.log('[ClipAIble:Content] 🔵 Step 2 (postMessage): Sending message to background script...');
        
        let backgroundResponded = false;
        let subtitleData = null;
        if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
          subtitleData = {
            subtitles: event.data.result.subtitles,
            metadata: event.data.result.metadata || {}
          };
        }
        
        let storageSaved = false;
        const fallbackTimeout = setTimeout(() => {
          if (!backgroundResponded && !storageSaved && subtitleData) {
            console.warn('[ClipAIble:Content] ⚠️ Background did not respond in 3 seconds, saving to storage');
            storageSaved = true;
            chrome.storage.local.set({
              pendingSubtitles: {
                subtitles: subtitleData.subtitles,
                metadata: subtitleData.metadata,
                timestamp: Date.now()
              }
            }).then(() => {
              console.log('[ClipAIble:Content] ✅ Saved to storage - background will check storage');
            }).catch(storageError => {
              console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
            });
          }
        }, 3000);
        
        chrome.runtime.sendMessage(event.data, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          console.log('[ClipAIble:Content] 🔵 Step 3 (postMessage): Callback called');
          console.log('[ClipAIble:Content] 🔵 Step 3.1 (postMessage): lastError?', chrome.runtime.lastError);
          console.log('[ClipAIble:Content] 🔵 Step 3.2 (postMessage): response?', response);
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            console.error('[ClipAIble:Content] ❌ Failed to forward postMessage to background:', chrome.runtime.lastError);
            console.error('[ClipAIble:Content] ❌ Error message:', errorMsg);
            
            if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
              storageSaved = true;
              chrome.storage.local.set({
                pendingSubtitles: {
                  subtitles: subtitleData.subtitles,
                  metadata: subtitleData.metadata,
                  timestamp: Date.now()
                }
              }).then(() => {
                console.log('[ClipAIble:Content] ✅ Saved to storage as fallback');
              }).catch(storageError => {
                console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
              });
            } else if (subtitleData && !storageSaved) {
              console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, cannot save subtitles');
            }
            return;
          }
          
          if (response === undefined) {
            console.warn('[ClipAIble:Content] ⚠️ No response from background (this may be OK)');
          } else {
            console.log('[ClipAIble:Content] ✅ postMessage forwarded successfully', {
              response: response
            });
          }
        });
        
        console.log('[ClipAIble:Content] 🔵 Step 4 (postMessage): sendMessage call finished');
      } catch (e) {
        console.error('[ClipAIble:Content] ❌ Exception while forwarding postMessage:', e);
        console.error('[ClipAIble:Content] ❌ Exception stack:', e.stack);
        
        // Try to save to storage if we have subtitle data
        if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0 && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            pendingSubtitles: {
              subtitles: event.data.result.subtitles,
              metadata: event.data.result.metadata || {},
              timestamp: Date.now()
            }
          }).then(() => {
            console.log('[ClipAIble:Content] ✅ Saved to storage as fallback');
          }).catch(storageError => {
            console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
          });
        } else if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
          console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, cannot save subtitles');
        }
      }
    }
  });
  console.log('[ClipAIble:Content] ✅ IMMEDIATE: window.postMessage listener registered!');
  

  // Extract page content and metadata
  function extractPageContent() {
    // Get the full HTML
    const html = document.documentElement.outerHTML;
    
    // Get page metadata
    const metadata = {
      title: document.title,
      url: window.location.href,
      description: getMetaContent('description'),
      author: getMetaContent('author'),
      publishDate: getMetaContent('article:published_time') || 
                   getMetaContent('datePublished') ||
                   getMetaContent('date')
    };

    // Get all images with absolute URLs
    const images = Array.from(document.querySelectorAll('img'))
      .filter(img => img.src && !isTrackingPixel(img))
      .map(img => ({
        src: img.src,
        alt: img.alt || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      }));

    return {
      html: html,
      metadata: metadata,
      images: images
    };
  }

  // Get meta tag content by name or property
  function getMetaContent(name) {
    const meta = document.querySelector(
      `meta[name="${name}"], meta[property="${name}"], meta[itemprop="${name}"]`
    );
    return meta ? meta.content : null;
  }

  // Check if image is likely a tracking pixel
  function isTrackingPixel(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    // Tracking pixels are usually 1x1 or very small
    if (width <= 3 && height <= 3) return true;
    
    // Check for common tracking pixel patterns in src
    const src = img.src.toLowerCase();
    const trackingPatterns = [
      'pixel', 'tracking', 'beacon', 'analytics',
      'facebook.com/tr', 'doubleclick', 'googleads'
    ];
    
    return trackingPatterns.some(pattern => src.includes(pattern));
  }

  // Listen for extraction requests
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      const content = extractPageContent();
      sendResponse(content);
    }
    return true;
  });

  // КРИТИЧНО: CustomEvent на document - ЕДИНСТВЕННЫЙ надежный способ
  // коммуникации между MAIN world (injected script) и ISOLATED world (content script)
  // window.postMessage НЕ работает между мирами!
  console.log('[ClipAIble:Content] 🔵 Registering ClipAIbleSubtitleMessage CustomEvent listener...');
  console.log('[ClipAIble:Content] 🔵 Document readyState:', document.readyState);
  console.log('[ClipAIble:Content] 🔵 Current URL:', window.location.href);
  
  // Global flags to prevent duplicate processing
  let lastSubtitleTimestamp = 0;
  let lastSubtitleHash = null;
  
  // Register listener IMMEDIATELY (before any async operations)
  const handleCustomEvent = function(event) {
    console.log('[ClipAIble:Content] 🔵 CustomEvent received!', {
      hasDetail: !!event.detail,
      detailType: event.detail?.type,
      action: event.detail?.action,
      hasResult: !!event.detail?.result,
      hasError: !!event.detail?.error
    });
    
    if (!event.detail || event.detail.type !== 'ClipAIbleYouTubeSubtitles') {
      console.log('[ClipAIble:Content] 🔵 Ignoring event (not our type)');
      return;
    }
    
    console.log('[ClipAIble:Content] 🔵 Step 1: Processing subtitle event from MAIN world', {
      hasError: !!event.detail.error,
      hasResult: !!event.detail.result,
      action: event.detail.action,
      subtitleCount: event.detail.result?.subtitles?.length || 0,
      errorMessage: event.detail.error
    });
    
    // Save subtitle data for storage fallback if needed
    let subtitleData = null;
    if (event.detail.result && event.detail.result.subtitles && event.detail.result.subtitles.length > 0) {
      subtitleData = {
        subtitles: event.detail.result.subtitles,
        metadata: event.detail.result.metadata || {}
      };
      console.log('[ClipAIble:Content] 🔵 Saved subtitle data for storage fallback', {
        count: subtitleData.subtitles.length,
        title: subtitleData.metadata.title
      });
    }
    
    // Check if this is a duplicate event (same subtitles, recent timestamp)
    // BUT: Only check duplicates AFTER we've confirmed the message was sent successfully
    // This prevents blocking legitimate retries
    const currentTimestamp = Date.now();
    let currentHash = null;
    if (subtitleData && subtitleData.subtitles.length > 0) {
      const firstText = subtitleData.subtitles[0]?.text?.substring(0, 20) || '';
      const lastText = subtitleData.subtitles[subtitleData.subtitles.length - 1]?.text?.substring(0, 20) || '';
      currentHash = `${subtitleData.subtitles.length}_${firstText}_${lastText}`;
    }
    
    // Only check for duplicates if we have a hash AND it's very recent (1 second, not 3)
    // This allows retries from injected script but prevents true duplicates
    const isDuplicate = subtitleData && 
                        currentHash && 
                        currentHash === lastSubtitleHash &&
                        currentTimestamp - lastSubtitleTimestamp < 1000; // 1 second window (shorter for retries)
    
    if (isDuplicate) {
      console.log('[ClipAIble:Content] 🔵 Ignoring duplicate event (same subtitles within 1 second)', {
        timeSinceLast: currentTimestamp - lastSubtitleTimestamp
      });
      return;
    }
    
    // Update hash AFTER processing (not before), so we can track if message was sent
    // We'll update it after successful send to background
    let shouldUpdateHash = false;
    
    // Forward message to background script
    try {
      console.log('[ClipAIble:Content] 🔵 Step 2: Sending message to background script...');
      
      let backgroundResponded = false;
        let storageSaved = false;
        const fallbackTimeout = setTimeout(() => {
          if (!backgroundResponded && !storageSaved && subtitleData && chrome.storage && chrome.storage.local) {
            console.warn('[ClipAIble:Content] ⚠️ Background did not respond in 3 seconds, saving to storage');
            storageSaved = true;
            chrome.storage.local.set({
              pendingSubtitles: {
                subtitles: subtitleData.subtitles,
                metadata: subtitleData.metadata,
                timestamp: Date.now()
              }
            }).then(() => {
              console.log('[ClipAIble:Content] ✅ Saved to storage - background will check storage');
            }).catch(storageError => {
              console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
            });
          } else if (!backgroundResponded && !storageSaved && subtitleData) {
            console.warn('[ClipAIble:Content] ⚠️ Background did not respond and chrome.storage unavailable');
          }
        }, 3000);
      
      // Try to send message to background
      try {
        chrome.runtime.sendMessage(event.detail, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          console.log('[ClipAIble:Content] 🔵 Step 3: Callback called');
          console.log('[ClipAIble:Content] 🔵 Step 3.1: lastError?', chrome.runtime.lastError);
          console.log('[ClipAIble:Content] 🔵 Step 3.2: response?', response);
          
          // КРИТИЧЕСКИ ВАЖНО: Проверить chrome.runtime.lastError!
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            console.error('[ClipAIble:Content] ❌ Failed to forward message to background:', chrome.runtime.lastError);
            console.error('[ClipAIble:Content] ❌ Error message:', errorMsg);
            console.error('[ClipAIble:Content] ❌ This usually means background script is not listening or service worker died');
            
            // If "Extension context invalidated", try storage fallback
            if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated')) {
              console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated, trying storage fallback');
              if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
                storageSaved = true;
                // Save to storage and trigger processing via storage change
                chrome.storage.local.set({
                  pendingSubtitles: {
                    subtitles: subtitleData.subtitles,
                    metadata: subtitleData.metadata,
                    timestamp: Date.now()
                  }
                }).then(() => {
                  console.log('[ClipAIble:Content] ✅ Saved subtitles to storage for background to process');
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
                });
              } else if (subtitleData && !storageSaved) {
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable (Extension context invalidated), cannot save subtitles');
              }
            } else {
              // Other error - try storage first
              if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
                storageSaved = true;
                chrome.storage.local.set({
                  pendingSubtitles: {
                    subtitles: subtitleData.subtitles,
                    metadata: subtitleData.metadata,
                    timestamp: Date.now()
                  }
                }).then(() => {
                  console.log('[ClipAIble:Content] ✅ Saved to storage as fallback');
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
                });
              } else if (subtitleData && !storageSaved) {
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, cannot save subtitles');
              }
            }
            return;
          }
          
          // Проверить что response не пустой (если ожидается ответ)
          if (response === undefined) {
            console.warn('[ClipAIble:Content] ⚠️ No response from background (this may be OK if background doesn\'t send response)');
          } else {
            console.log('[ClipAIble:Content] ✅ Message forwarded successfully to background', {
              response: response
            });
            
            // Update hash only after successful send
            if (subtitleData && currentHash) {
              lastSubtitleTimestamp = currentTimestamp;
              lastSubtitleHash = currentHash;
              console.log('[ClipAIble:Content] ✅ Updated subtitle hash after successful send');
            }
          }
        });
      } catch (sendError) {
        // Synchronous error from sendMessage (e.g., Extension context invalidated)
        backgroundResponded = true;
        clearTimeout(fallbackTimeout);
        
        console.error('[ClipAIble:Content] ❌ Synchronous error from sendMessage:', sendError);
        const errorMsg = sendError.message || '';
        
        if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated')) {
          console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated, trying storage fallback');
          if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
            storageSaved = true;
            chrome.storage.local.set({
              pendingSubtitles: {
                subtitles: subtitleData.subtitles,
                metadata: subtitleData.metadata,
                timestamp: Date.now()
              }
            }).then(() => {
              console.log('[ClipAIble:Content] ✅ Saved subtitles to storage - background will check storage');
            }).catch(storageError => {
              console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
            });
          } else if (subtitleData && !storageSaved) {
            console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable (Extension context invalidated), cannot save subtitles');
          }
        } else {
          // Other error - try storage first
          if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
            storageSaved = true;
            chrome.storage.local.set({
              pendingSubtitles: {
                subtitles: subtitleData.subtitles,
                metadata: subtitleData.metadata,
                timestamp: Date.now()
              }
            }).then(() => {
              console.log('[ClipAIble:Content] ✅ Saved to storage as fallback');
            }).catch(storageError => {
              console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
            });
          } else if (subtitleData && !storageSaved) {
            console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, cannot save subtitles');
          }
        }
      }
      
      console.log('[ClipAIble:Content] 🔵 Step 4: sendMessage call finished (callback will be called asynchronously)');
    } catch (e) {
      console.error('[ClipAIble:Content] ❌ Exception while forwarding message:', e);
      console.error('[ClipAIble:Content] ❌ Exception stack:', e.stack);
      
      // Если произошла ошибка, пробуем storage (только один раз)
      if (subtitleData && !storageSaved && chrome.storage && chrome.storage.local) {
        storageSaved = true;
        chrome.storage.local.set({
          pendingSubtitles: {
            subtitles: subtitleData.subtitles,
            metadata: subtitleData.metadata,
            timestamp: Date.now()
          }
        }).then(() => {
          console.log('[ClipAIble:Content] ✅ Saved to storage as fallback');
        }).catch(storageError => {
          console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
        });
      } else if (subtitleData && !storageSaved) {
        console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, cannot save subtitles');
      }
    }
  };
  
  // Register the listener IMMEDIATELY
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, true); // Use capture phase
  console.log('[ClipAIble:Content] ✅ CustomEvent listener registered!', {
    listenerType: 'capture',
    documentReadyState: document.readyState
  });
  
  // Also register in bubble phase (just in case)
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, false);
  console.log('[ClipAIble:Content] ✅ CustomEvent listener also registered in bubble phase!');
  

  // Also listen for CustomEvent from MAIN world (for subtitle fetch requests)
  document.addEventListener('ClipAIbleSubtitleFetchRequest', (event) => {
    if (event.detail && event.detail.type === 'ClipAIbleSubtitleFetchRequest') {
      console.log('[ClipAIble:Content] Received subtitle fetch request via CustomEvent', {
        requestId: event.detail.requestId,
        urlLength: event.detail.url?.length || 0
      });
      
      // Fetch subtitle URL from content script
      fetch(event.detail.url, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json, text/xml, application/xml, */*',
          'Accept-Language': navigator.language || 'en',
          'Referer': window.location.href,
          'Origin': window.location.origin
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(responseText => {
        console.log('[ClipAIble:Content] Subtitle fetched successfully via CustomEvent', {
          requestId: event.detail.requestId,
          responseLength: responseText.length
        });
        
        // Send response back to MAIN world
        const responseEvent = new CustomEvent('ClipAIbleSubtitleFetchResponse', {
          detail: {
            type: 'ClipAIbleSubtitleFetchResponse',
            requestId: event.detail.requestId,
            responseText: responseText
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(responseEvent);
        
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.detail.requestId,
          responseText: responseText
        }, '*');
      })
      .catch(error => {
        console.error('[ClipAIble:Content] Subtitle fetch failed via CustomEvent', error);
        
        const errorEvent = new CustomEvent('ClipAIbleSubtitleFetchResponse', {
          detail: {
            type: 'ClipAIbleSubtitleFetchResponse',
            requestId: event.detail.requestId,
            error: error.message || String(error)
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(errorEvent);
        
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.detail.requestId,
          error: error.message || String(error)
        }, '*');
      });
    }
  });

  // Make function available for direct injection
  window.__webpageToPdf_extractContent = extractPageContent;
})();

