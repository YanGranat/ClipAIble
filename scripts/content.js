// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';
  
  // КРИТИЧНО: Немедленная регистрация listener'ов ДО всего остального
  // Это гарантирует, что listener'ы будут готовы к получению сообщений
  
  // КРИТИЧНО: Проверить, что мы на YouTube странице
  if (!window.location.hostname.includes('youtube.com')) {
    // Silent - non-YouTube pages are expected
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
    try {
      // Проверка что body существует
      if (!document.body) {
        // Попробовать подождать и повторить
        if (document.readyState === 'loading') {
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
      
      // Проверка что элемент действительно в DOM
      const verification = document.getElementById('ClipAIblePendingSubtitles');
      if (!verification) {
        console.error('[ClipAIble:Content] DOM element NOT found after adding');
      }
    } catch (domError) {
      console.error('[ClipAIble:Content] Failed to save to DOM fallback:', domError);
    }
  }
  
  // НЕМЕДЛЕННАЯ регистрация postMessage и CustomEvent listeners
  window.addEventListener('message', function handlePostMessage(event) {
    
    // КРИТИЧНО: НЕ блокировать сообщения по source!
    // Обрабатываем два типа сообщений: субтитры и fetch requests
    if (!event.data) {
      return;
    }
    
    // Обработка fetch requests для субтитров
    if (event.data.type === 'ClipAIbleSubtitleFetchRequest') {
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
      try {
        // КРИТИЧНО: Проверка контекста ПЕРЕД отправкой сообщения
        if (!isExtensionContextValid()) {
          if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
            const subtitleData = {
              subtitles: event.data.result.subtitles,
              metadata: event.data.result.metadata || {}
            };
            saveToDOMFallback(subtitleData);
          }
          return;
        }
        
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
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
              saveToDOMFallback(subtitleData);
            }
          }
        }, 3000);
        
        chrome.runtime.sendMessage(event.data, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            console.error('[ClipAIble:Content] Failed to forward postMessage to background:', chrome.runtime.lastError);
            
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
                  }).catch(storageError => {
                    console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                    saveToDOMFallback(subtitleData);
                  });
                } else {
                  saveToDOMFallback(subtitleData);
                }
              } catch (storageException) {
                console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
                saveToDOMFallback(subtitleData);
              }
            }
            return;
          }
        });
      } catch (e) {
        console.error('[ClipAIble:Content] Exception while forwarding postMessage:', e);
        
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
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
              saveToDOMFallback(subtitleData);
            }
          }
        }
      }
    }
  });
  

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
      sendResponse({ success: true, loaded: true, timestamp: new Date().toISOString() });
      return true;
    }
    
    return false;
  });

  // КРИТИЧНО: CustomEvent на document - ЕДИНСТВЕННЫЙ надежный способ
  // коммуникации между MAIN world (injected script) и ISOLATED world (content script)
  // window.postMessage НЕ работает между мирами!
  
  // Global flags to prevent duplicate processing
  let lastSubtitleTimestamp = 0;
  let lastSubtitleHash = null;
  
  // Register listener IMMEDIATELY (before any async operations)
  const handleCustomEvent = function(event) {
    if (!event.detail || event.detail.type !== 'ClipAIbleYouTubeSubtitles') {
      return;
    }
    
    // Save subtitle data for storage fallback if needed
    let subtitleData = null;
    if (event.detail.result && event.detail.result.subtitles && event.detail.result.subtitles.length > 0) {
      subtitleData = {
        subtitles: event.detail.result.subtitles,
        metadata: event.detail.result.metadata || {}
      };
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
      return;
    }
    
    // Update hash AFTER processing (not before), so we can track if message was sent
    // We'll update it after successful send to background
    let shouldUpdateHash = false;
    
    // Forward message to background script
    try {
      // КРИТИЧНО: Проверка контекста ПЕРЕД отправкой сообщения
      if (!isExtensionContextValid()) {
        if (subtitleData) {
          saveToDOMFallback(subtitleData);
        }
        return;
      }
      
      let backgroundResponded = false;
      let storageSaved = false;
      const fallbackTimeout = setTimeout(() => {
        if (!backgroundResponded && !storageSaved && subtitleData) {
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
              }).catch(storageError => {
                console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                saveToDOMFallback(subtitleData);
              });
            } else {
              saveToDOMFallback(subtitleData);
            }
          } catch (storageException) {
            console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
            saveToDOMFallback(subtitleData);
          }
        }
      }, 3000);
      
      // Try to send message to background
      try {
        chrome.runtime.sendMessage(event.detail, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          // КРИТИЧЕСКИ ВАЖНО: Проверить chrome.runtime.lastError!
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            console.error('[ClipAIble:Content] Failed to forward message to background:', chrome.runtime.lastError);
            
            // If "Extension context invalidated", use DOM fallback immediately
            if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated')) {
              if (subtitleData) {
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
                    }).catch(storageError => {
                      console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                      saveToDOMFallback(subtitleData);
                    });
                  } else {
                    saveToDOMFallback(subtitleData);
                  }
                } catch (storageException) {
                  console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
                  saveToDOMFallback(subtitleData);
                }
              }
            }
            return;
          }
          
          // Update hash only after successful send
          if (subtitleData && currentHash) {
            lastSubtitleTimestamp = currentTimestamp;
            lastSubtitleHash = currentHash;
          }
        });
      } catch (sendError) {
        // Synchronous error from sendMessage (e.g., Extension context invalidated)
        backgroundResponded = true;
        clearTimeout(fallbackTimeout);
        
        console.error('[ClipAIble:Content] Synchronous error from sendMessage:', sendError);
        const errorMsg = sendError.message || '';
        
        if (errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated')) {
          if (subtitleData) {
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
                }).catch(storageError => {
                  console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
              saveToDOMFallback(subtitleData);
            }
          }
        }
      }
    } catch (e) {
      console.error('[ClipAIble:Content] Exception while forwarding message:', e);
      
      // Проверяем тип ошибки
      const errorMsg = e.message || '';
      const isContextInvalidated = errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated');
      
      // Если Extension context invalidated, используем DOM fallback сразу
      if (isContextInvalidated && subtitleData) {
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
            }).catch(storageError => {
              console.error('[ClipAIble:Content] Failed to save to storage:', storageError);
              saveToDOMFallback(subtitleData);
            });
          } else {
            saveToDOMFallback(subtitleData);
          }
        } catch (storageException) {
          console.error('[ClipAIble:Content] Exception accessing chrome.storage:', storageException);
          saveToDOMFallback(subtitleData);
        }
      }
    }
  };
  
  // Register the listener IMMEDIATELY
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, true); // Use capture phase
  
  // Also register in bubble phase (just in case)
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, false);
  

  // Also listen for CustomEvent from MAIN world (for subtitle fetch requests)
  document.addEventListener('ClipAIbleSubtitleFetchRequest', (event) => {
    if (event.detail && event.detail.type === 'ClipAIbleSubtitleFetchRequest') {
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

