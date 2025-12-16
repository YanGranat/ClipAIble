// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';
  
  // КРИТИЧНО: Немедленная регистрация listener'ов ДО всего остального
  // Это гарантирует, что listener'ы будут готовы к получению сообщений
  console.log('[ClipAIble:Content] 🔵 Content script loaded and executing...', {
    url: window.location.href,
    readyState: document.readyState,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent.substring(0, 50)
  });
  
  // КРИТИЧНО: Проверить, что мы на YouTube странице
  if (!window.location.hostname.includes('youtube.com')) {
    console.warn('[ClipAIble:Content] ⚠️ Content script loaded on non-YouTube page:', window.location.hostname);
  }
  
  // Проверка валидности контекста расширения
  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id !== undefined;
    } catch (e) {
      return false;
    }
  }
  
  // Helper function to save subtitles to DOM as fallback when chrome.storage is unavailable
  function saveToDOMFallback(subtitleData) {
    console.log('[ClipAIble:Content] 🔵 Attempting to save to DOM fallback...', {
      hasSubtitles: !!subtitleData?.subtitles,
      count: subtitleData?.subtitles?.length || 0,
      hasMetadata: !!subtitleData?.metadata,
      bodyExists: !!document.body,
      readyState: document.readyState
    });
    
    try {
      // Проверка что body существует
      if (!document.body) {
        console.error('[ClipAIble:Content] ❌ document.body is null, cannot save to DOM');
        // Попробовать подождать и повторить
        if (document.readyState === 'loading') {
          console.log('[ClipAIble:Content] 🔵 Document still loading, waiting for body...');
          document.addEventListener('DOMContentLoaded', () => {
            if (document.body && subtitleData) {
              saveToDOMFallback(subtitleData);
            }
          }, { once: true });
        }
        return;
      }
      
      // Удалить старый элемент, если есть
      const oldElement = document.getElementById('ClipAIblePendingSubtitles');
      if (oldElement) {
        oldElement.remove();
        console.log('[ClipAIble:Content] 🔵 Removed old DOM element');
      }
      
      // Сохранить данные в специальный элемент на странице
      // Background script может прочитать их через executeScript
      const dataElement = document.createElement('div');
      dataElement.id = 'ClipAIblePendingSubtitles';
      dataElement.style.display = 'none';
      
      const dataToSave = {
        subtitles: subtitleData.subtitles,
        metadata: subtitleData.metadata,
        timestamp: Date.now(),
        source: 'dom_fallback'
      };
      
      dataElement.setAttribute('data-subtitles', JSON.stringify(dataToSave));
      
      // КРИТИЧНО: Добавить В НАЧАЛО body, не в конец (быстрее доступ)
      document.body.insertBefore(dataElement, document.body.firstChild);
      
      console.log('[ClipAIble:Content] ✅ Saved subtitles to DOM fallback (inserted at body start)', {
        elementId: dataElement.id,
        hasAttribute: !!dataElement.getAttribute('data-subtitles'),
        attributeLength: dataElement.getAttribute('data-subtitles')?.length || 0,
        count: subtitleData.subtitles?.length || 0,
        timestamp: dataToSave.timestamp
      });
      
      // Проверка что элемент действительно в DOM
      const verification = document.getElementById('ClipAIblePendingSubtitles');
      if (verification) {
        console.log('[ClipAIble:Content] ✅ DOM element verified - successfully added to document', {
          parentNode: verification.parentNode?.tagName || 'none',
          isInBody: document.body.contains(verification)
        });
      } else {
        console.error('[ClipAIble:Content] ❌ DOM element NOT found after adding!');
      }
    } catch (domError) {
      console.error('[ClipAIble:Content] ❌ Failed to save to DOM fallback:', domError);
      console.error('[ClipAIble:Content] ❌ DOM error stack:', domError.stack);
    }
  }
  
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
        // КРИТИЧНО: Проверка контекста ПЕРЕД отправкой сообщения
        if (!isExtensionContextValid()) {
          console.warn('[ClipAIble:Content] ⚠️ Extension context is invalid (postMessage) - using DOM fallback immediately');
          if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
            const subtitleData = {
              subtitles: event.data.result.subtitles,
              metadata: event.data.result.metadata || {}
            };
            saveToDOMFallback(subtitleData);
          }
          return;
        }
        
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
            
            // Попробовать использовать chrome.storage
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                  pendingSubtitles: {
                    subtitles: subtitleData.subtitles,
                    metadata: subtitleData.metadata,
                    timestamp: Date.now(),
                    source: 'content_script_timeout_fallback'
                  }
                }).then(() => {
                  console.log('[ClipAIble:Content] ✅ Saved to storage - background will check storage');
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] ❌ Failed to save to storage:', storageError);
                  // Если storage не работает, попробовать сохранить в DOM
                  saveToDOMFallback(subtitleData);
                });
              } else {
                // chrome.storage недоступен, используем DOM fallback
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
              // Используем DOM fallback
              saveToDOMFallback(subtitleData);
            }
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
            
            if (subtitleData && !storageSaved) {
              storageSaved = true;
              try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
                    saveToDOMFallback(subtitleData);
                  });
                } else {
                  console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
                  saveToDOMFallback(subtitleData);
                }
              } catch (storageException) {
                console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
                saveToDOMFallback(subtitleData);
              }
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
        if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
          const subtitleData = {
            subtitles: event.data.result.subtitles,
            metadata: event.data.result.metadata || {}
          };
          
          // Проверяем тип ошибки
          const errorMsg = e.message || '';
          const isContextInvalidated = errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated');
          
          // Если Extension context invalidated, используем DOM fallback сразу
          if (isContextInvalidated) {
            console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated in postMessage catch - using DOM fallback immediately');
            saveToDOMFallback(subtitleData);
          } else {
            // Другие ошибки - пробуем storage, потом DOM fallback
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
                  saveToDOMFallback(subtitleData);
                });
              } else {
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
              saveToDOMFallback(subtitleData);
            }
          }
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
      return true;
    }
    
    // Handle ping request to verify content script is loaded
    if (request.action === 'ping') {
      console.log('[ClipAIble:Content] ✅ Ping received - content script is loaded and responding');
      sendResponse({ success: true, loaded: true, timestamp: new Date().toISOString() });
      return true;
    }
    
    return false;
  });

  // КРИТИЧНО: CustomEvent на document - ЕДИНСТВЕННЫЙ надежный способ
  // коммуникации между MAIN world (injected script) и ISOLATED world (content script)
  // window.postMessage НЕ работает между мирами!
  console.log('[ClipAIble:Content] 🔵 Registering ClipAIbleSubtitleMessage CustomEvent listener...');
  console.log('[ClipAIble:Content] 🔵 Document readyState:', document.readyState);
  console.log('[ClipAIble:Content] 🔵 Current URL:', window.location.href);
  console.log('[ClipAIble:Content] 🔵 Content script loaded at:', new Date().toISOString());
  console.log('[ClipAIble:Content] 🔵 Testing CustomEvent dispatch...');
  
  // Test if CustomEvent works by dispatching a test event
  try {
    const testEvent = new CustomEvent('ClipAIbleTestEvent', {
      detail: { test: true },
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(testEvent);
    console.log('[ClipAIble:Content] ✅ Test CustomEvent dispatched successfully');
  } catch (testError) {
    console.error('[ClipAIble:Content] ❌ Failed to dispatch test CustomEvent:', testError);
  }
  
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
    
    // Only check for duplicates if we have a hash AND it's very recent (2 seconds)
    // This allows retries from injected script but prevents true duplicates
    // КРИТИЧНО: Увеличено окно до 2 секунд, чтобы поймать все ретраи из injected script
    const isDuplicate = subtitleData && 
                        currentHash && 
                        currentHash === lastSubtitleHash &&
                        currentTimestamp - lastSubtitleTimestamp < 2000; // 2 second window to catch all retries
    
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
      // КРИТИЧНО: Проверка контекста ПЕРЕД отправкой сообщения
      if (!isExtensionContextValid()) {
        console.warn('[ClipAIble:Content] ⚠️ Extension context is invalid - using DOM fallback immediately');
        if (subtitleData) {
          saveToDOMFallback(subtitleData);
        }
        return;
      }
      
      console.log('[ClipAIble:Content] 🔵 Step 2: Sending message to background script...');
      
      let backgroundResponded = false;
        let storageSaved = false;
        const fallbackTimeout = setTimeout(() => {
          if (!backgroundResponded && !storageSaved && subtitleData) {
            console.warn('[ClipAIble:Content] ⚠️ Background did not respond in 3 seconds, saving to storage');
            storageSaved = true;
            
            // Попробовать использовать chrome.storage
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
                  // Fallback to DOM if storage fails
                  saveToDOMFallback(subtitleData);
                });
              } else {
                // chrome.storage недоступен, используем DOM fallback
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
              // Fallback to DOM if exception occurs
              saveToDOMFallback(subtitleData);
            }
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
            
            // If "Extension context invalidated", use DOM fallback immediately
            if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated')) {
              console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated - service worker died, using DOM fallback immediately');
              if (subtitleData) {
                // КРИТИЧНО: После Extension context invalidated chrome.storage НЕДОСТУПЕН!
                // НЕ пытаемся использовать chrome.storage - сразу используем DOM fallback
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable (Extension context invalidated), cannot save subtitles - using DOM fallback');
                saveToDOMFallback(subtitleData);
              }
            } else {
              // Other error - try storage first
              if (subtitleData && !storageSaved) {
                storageSaved = true;
                try {
                  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
                      saveToDOMFallback(subtitleData);
                    });
                  } else {
                    console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
                    saveToDOMFallback(subtitleData);
                  }
                } catch (storageException) {
                  console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
                  saveToDOMFallback(subtitleData);
                }
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
          console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated - service worker died, using DOM fallback immediately');
          
          // КРИТИЧНО: После Extension context invalidated chrome.storage НЕДОСТУПЕН!
          // НЕ пытаемся использовать chrome.storage - сразу используем DOM fallback
          if (subtitleData) {
            console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable (Extension context invalidated), cannot save subtitles - using DOM fallback');
            saveToDOMFallback(subtitleData);
          }
        } else {
          // Other error - try storage first
          if (subtitleData && !storageSaved) {
            storageSaved = true;
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
                  saveToDOMFallback(subtitleData);
                });
              } else {
                console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
              saveToDOMFallback(subtitleData);
            }
          }
        }
      }
      
      console.log('[ClipAIble:Content] 🔵 Step 4: sendMessage call finished (callback will be called asynchronously)');
    } catch (e) {
      console.error('[ClipAIble:Content] ❌ Exception while forwarding message:', e);
      console.error('[ClipAIble:Content] ❌ Exception stack:', e.stack);
      
      // Проверяем тип ошибки
      const errorMsg = e.message || '';
      const isContextInvalidated = errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated');
      
      // Если Extension context invalidated, используем DOM fallback сразу
      if (isContextInvalidated && subtitleData) {
        console.warn('[ClipAIble:Content] ⚠️ Extension context invalidated in catch block - using DOM fallback immediately');
        saveToDOMFallback(subtitleData);
      } else if (subtitleData && !storageSaved) {
        // Другие ошибки - пробуем storage, потом DOM fallback
        storageSaved = true;
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
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
              saveToDOMFallback(subtitleData);
            });
          } else {
            console.warn('[ClipAIble:Content] ⚠️ chrome.storage unavailable, using DOM fallback');
            saveToDOMFallback(subtitleData);
          }
        } catch (storageException) {
          console.error('[ClipAIble:Content] ❌ Exception accessing chrome.storage:', storageException);
          saveToDOMFallback(subtitleData);
        }
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

