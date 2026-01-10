// @ts-check
// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';
  
  // CRITICAL: Register listeners IMMEDIATELY before everything else
  // This ensures listeners are ready to receive messages
  
  // CRITICAL: Check that we are on a YouTube page
  if (!window.location.hostname.includes('youtube.com')) {
    // Silent - non-YouTube pages are expected
  }
  
  // Check extension context validity
  function isExtensionContextValid() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id !== undefined;
    } catch (e) {
      return false;
    }
  }
  
  // Send error to background script for centralized logging
  // This prevents console.error from being visible to users in page console
  function sendErrorToBackground(message, error, context = {}) {
    try {
      if (isExtensionContextValid()) {
        const errorData = {
          message: message,
          error: error ? {
            name: error.name || String(error),
            message: error.message || String(error),
            stack: error.stack
          } : null,
          context: context,
          source: 'content',
          timestamp: Date.now(),
          url: window.location.href
        };
        
        // Send to background (fire and forget)
        chrome.runtime.sendMessage({
          action: 'logError',
          data: errorData
        }, () => {
          // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
          if (chrome.runtime.lastError) {
            // Silently ignore - "Could not establish connection" is expected when receiver is closed
          }
        });
      }
    } catch (sendError) {
      // Ignore errors when sending error report (to avoid infinite loop)
      // Fallback to console.error only if background is unavailable
      if (!isExtensionContextValid()) {
        console.error('[ClipAIble:Content]', message, error);
      }
    }
  }
  
  // Helper function to save subtitles to DOM as fallback when chrome.storage is unavailable
  function saveToDOMFallback(subtitleData) {
    try {
      // Check that body exists
      if (!document.body) {
        // Try to wait and retry
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (document.body && subtitleData) {
              saveToDOMFallback(subtitleData);
            }
          }, { once: true });
        }
        return;
      }
      
      // Remove old element if exists
      const oldElement = document.getElementById('ClipAIblePendingSubtitles');
      if (oldElement) {
        oldElement.remove();
      }
      
      // Save data to a special element on the page
      // Background script can read them via executeScript
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
      
      // CRITICAL: Add at the BEGINNING of body, not at the end (faster access)
      document.body.insertBefore(dataElement, document.body.firstChild);
      
      // Check that element is actually in DOM
      const verification = document.getElementById('ClipAIblePendingSubtitles');
      if (!verification) {
        sendErrorToBackground('DOM element NOT found after adding', null, {
          action: 'saveToDOMFallback'
        });
      }
    } catch (domError) {
      sendErrorToBackground('Failed to save to DOM fallback', domError, {
        action: 'saveToDOMFallback'
      });
    }
  }
  
  // Store listener references for cleanup
  let messageListener = null;
  let runtimeMessageListener = null;
  let customEventListeners = [];
  
  const handlePostMessage = function handlePostMessage(event) {
    
    // CRITICAL: Do NOT block messages by source!
    // Handle two types of messages: subtitles and fetch requests
    if (!event.data) {
      return;
    }
    
    // SECURITY: Validate message size to prevent DoS
    try {
      const messageSize = JSON.stringify(event.data).length;
      const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB
      if (messageSize > MAX_MESSAGE_SIZE) {
        sendErrorToBackground('Message too large', null, {
          action: 'validateMessageSize',
          size: messageSize,
          maxSize: MAX_MESSAGE_SIZE
        });
        return;
      }
    } catch (e) {
      sendErrorToBackground('Failed to validate message size', e, {
        action: 'validateMessageSize'
      });
      return;
    }
    
    // Handle fetch requests for subtitles
    if (event.data.type === 'ClipAIbleSubtitleFetchRequest') {
      // SECURITY: Validate URL to prevent SSRF attacks
      const url = event.data.url;
      if (!url || typeof url !== 'string') {
        sendErrorToBackground('Invalid URL in fetch request', null, {
          action: 'validateSubtitleUrl',
          url: url
        });
        return;
      }
      
      // Validate URL is external and safe
      try {
        const urlObj = new URL(url);
        // Block non-HTTP(S) protocols
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          sendErrorToBackground('Invalid URL protocol', null, {
            action: 'validateSubtitleUrl',
            protocol: urlObj.protocol,
            url: url
          });
          return;
        }
        // Block internal addresses
        const hostname = urlObj.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
            hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
            hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
            hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
            hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
            hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
            hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
            hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
            hostname.startsWith('169.254.')) {
          sendErrorToBackground('Blocked internal URL', null, {
            action: 'validateSubtitleUrl',
            hostname: hostname,
            url: url
          });
          return;
        }
      } catch (e) {
        sendErrorToBackground('Invalid URL format', e, {
          action: 'validateSubtitleUrl',
          url: url ? url.substring(0, 100) : null
        });
        return;
      }
      
      fetch(url, {
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
        
        // SECURITY: Use specific origin instead of '*' to prevent XSS
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.data.requestId,
          responseText: responseText
        }, window.location.origin);
      })
      .catch(error => {
        sendErrorToBackground('Subtitle fetch failed', error, {
          action: 'fetchSubtitles',
          url: url
        });
        
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
        
        // SECURITY: Use specific origin instead of '*' to prevent XSS
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: event.data.requestId,
          error: error.message || String(error)
        }, window.location.origin);
      });
      return;
    }
    
    
    // Handle subtitle extraction results
    if (event.data.type !== 'ClipAIbleYouTubeSubtitles') {
      return;
    }
    
    if (event.data && event.data.type === 'ClipAIbleYouTubeSubtitles') {
      try {
        // CRITICAL: Check context BEFORE sending message
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
            
            // Try to use chrome.storage
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
                  sendErrorToBackground('Failed to save to storage (timeout fallback)', storageError, {
                    action: 'saveSubtitlesToStorage',
                    context: 'timeoutFallback'
                  });
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              sendErrorToBackground('Exception accessing chrome.storage (timeout fallback)', storageException, {
                action: 'accessStorage',
                context: 'timeoutFallback'
              });
              saveToDOMFallback(subtitleData);
            }
          }
        }, 3000);
        
        chrome.runtime.sendMessage(event.data, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            sendErrorToBackground('Failed to forward postMessage to background', chrome.runtime.lastError, {
              action: 'forwardPostMessage'
            });
            
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
                    sendErrorToBackground('Failed to save to storage', storageError, {
                      action: 'saveSubtitlesToStorage'
                    });
                    saveToDOMFallback(subtitleData);
                  });
                } else {
                  saveToDOMFallback(subtitleData);
                }
              } catch (storageException) {
                sendErrorToBackground('Exception accessing chrome.storage', storageException, {
                  action: 'accessStorage'
                });
                saveToDOMFallback(subtitleData);
              }
            }
            return;
          }
        });
      } catch (e) {
        sendErrorToBackground('Exception while forwarding postMessage', e, {
          action: 'forwardPostMessage',
          eventData: event.data ? { type: event.data.type, action: event.data.action } : null
        });
        
        // Try to save to storage if we have subtitle data
        if (event.data.result && event.data.result.subtitles && event.data.result.subtitles.length > 0) {
          const subtitleData = {
            subtitles: event.data.result.subtitles,
            metadata: event.data.result.metadata || {}
          };
          
          // Check error type
          const errorMsg = e.message || '';
          const isContextInvalidated = errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated');
          
          // If Extension context invalidated, use DOM fallback immediately
          if (isContextInvalidated) {
            saveToDOMFallback(subtitleData);
          } else {
            // Other errors - try storage, then DOM fallback
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({
                  pendingSubtitles: {
                    subtitles: subtitleData.subtitles,
                    metadata: subtitleData.metadata,
                    timestamp: Date.now()
                  }
                }).catch(storageError => {
                  sendErrorToBackground('Failed to save to storage (timeout fallback)', storageError, {
                    action: 'saveSubtitlesToStorage',
                    context: 'timeoutFallback'
                  });
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              sendErrorToBackground('Exception accessing chrome.storage (timeout fallback)', storageException, {
                action: 'accessStorage',
                context: 'timeoutFallback'
              });
              saveToDOMFallback(subtitleData);
            }
          }
        }
      }
    }
  };
  
  // Register window message listener
  window.addEventListener('message', handlePostMessage);
  messageListener = handlePostMessage;

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
    return meta && meta instanceof HTMLMetaElement ? meta.content : null;
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
  runtimeMessageListener = (request, sender, sendResponse) => {
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
  };
  
  chrome.runtime.onMessage.addListener(runtimeMessageListener);

  // CRITICAL: CustomEvent on document - the ONLY reliable way
  // to communicate between MAIN world (injected script) and ISOLATED world (content script)
  // window.postMessage does NOT work between worlds!
  
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
    // CRITICAL: Increased window to 2 seconds to catch all retries from injected script
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
      // CRITICAL: Check context BEFORE sending message
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
          
          // Try to use chrome.storage
          try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({
                pendingSubtitles: {
                  subtitles: subtitleData.subtitles,
                  metadata: subtitleData.metadata,
                  timestamp: Date.now()
                }
              }).catch(storageError => {
                sendErrorToBackground('Failed to save to storage (CustomEvent timeout)', storageError, {
                  action: 'saveSubtitlesToStorage',
                  context: 'customEventTimeout'
                });
                saveToDOMFallback(subtitleData);
              });
            } else {
              saveToDOMFallback(subtitleData);
            }
          } catch (storageException) {
            sendErrorToBackground('Exception accessing chrome.storage (CustomEvent timeout)', storageException, {
              action: 'accessStorage',
              context: 'customEventTimeout'
            });
            saveToDOMFallback(subtitleData);
          }
        }
      }, 3000);
      
      // Try to send message to background
      try {
        chrome.runtime.sendMessage(event.detail, (response) => {
          backgroundResponded = true;
          clearTimeout(fallbackTimeout);
          
          // CRITICALLY IMPORTANT: Check chrome.runtime.lastError!
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            sendErrorToBackground('Failed to forward message to background (CustomEvent)', chrome.runtime.lastError, {
              action: 'forwardCustomEventMessage'
            });
            
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
                      sendErrorToBackground('Failed to save to storage (CustomEvent sendMessage)', storageError, {
                        action: 'saveSubtitlesToStorage',
                        context: 'customEventSendMessage'
                      });
                      saveToDOMFallback(subtitleData);
                    });
                  } else {
                    saveToDOMFallback(subtitleData);
                  }
                } catch (storageException) {
                  sendErrorToBackground('Exception accessing chrome.storage (CustomEvent sendMessage)', storageException, {
                    action: 'accessStorage',
                    context: 'customEventSendMessage'
                  });
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
        
        sendErrorToBackground('Synchronous error from sendMessage', sendError, {
          action: 'sendMessage',
          context: 'synchronousError'
        });
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
                  sendErrorToBackground('Failed to save to storage (timeout fallback)', storageError, {
                    action: 'saveSubtitlesToStorage',
                    context: 'timeoutFallback'
                  });
                  saveToDOMFallback(subtitleData);
                });
              } else {
                saveToDOMFallback(subtitleData);
              }
            } catch (storageException) {
              sendErrorToBackground('Exception accessing chrome.storage (timeout fallback)', storageException, {
                action: 'accessStorage',
                context: 'timeoutFallback'
              });
              saveToDOMFallback(subtitleData);
            }
          }
        }
      }
    } catch (e) {
      sendErrorToBackground('Exception while forwarding message (CustomEvent)', e, {
        action: 'forwardCustomEventMessage',
        context: 'exception'
      });
      
      // Check error type
      const errorMsg = e.message || '';
      const isContextInvalidated = errorMsg.includes('Extension context invalidated') || errorMsg.includes('context invalidated');
      
      // If Extension context invalidated, use DOM fallback immediately
      if (isContextInvalidated && subtitleData) {
        saveToDOMFallback(subtitleData);
      } else if (subtitleData) {
        // Other errors - try storage, then DOM fallback
        let storageSaved = false;
        if (!storageSaved) {
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
                sendErrorToBackground('Failed to save to storage (CustomEvent catch)', storageError, {
                  action: 'saveSubtitlesToStorage',
                  context: 'customEventCatch'
                });
                saveToDOMFallback(subtitleData);
              });
            } else {
              saveToDOMFallback(subtitleData);
            }
          } catch (storageException) {
            sendErrorToBackground('Exception accessing chrome.storage (CustomEvent catch)', storageException, {
              action: 'accessStorage',
              context: 'customEventCatch'
            });
            saveToDOMFallback(subtitleData);
          }
        }
      }
    }
  };
  
  // Register the listener IMMEDIATELY
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, true); // Use capture phase
  customEventListeners.push({ element: document, event: 'ClipAIbleSubtitleMessage', handler: handleCustomEvent, capture: true });
  
  // Also register in bubble phase (just in case)
  document.addEventListener('ClipAIbleSubtitleMessage', handleCustomEvent, false);
  customEventListeners.push({ element: document, event: 'ClipAIbleSubtitleMessage', handler: handleCustomEvent, capture: false });
  

  // Also listen for CustomEvent from MAIN world (for subtitle fetch requests)
  const handleFetchRequest = (event) => {
    const customEvent = /** @type {CustomEvent} */ (event);
    if (customEvent.detail && customEvent.detail.type === 'ClipAIbleSubtitleFetchRequest') {
      // SECURITY: Validate URL to prevent SSRF attacks
      const url = customEvent.detail.url;
      if (!url || typeof url !== 'string') {
        sendErrorToBackground('Invalid URL in CustomEvent fetch request', null, {
          action: 'validateSubtitleUrl',
          context: 'customEvent',
          url: url
        });
        return;
      }
      
      // Validate URL is external and safe
      try {
        const urlObj = new URL(url);
        // Block non-HTTP(S) protocols
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          sendErrorToBackground('Invalid URL protocol (CustomEvent)', null, {
            action: 'validateSubtitleUrl',
            context: 'customEvent',
            protocol: urlObj.protocol,
            url: url
          });
          return;
        }
        // Block internal addresses
        const hostname = urlObj.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
            hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
            hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
            hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
            hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
            hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
            hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
            hostname.startsWith('172.30.') || hostname.startsWith('172.31.') ||
            hostname.startsWith('169.254.')) {
          sendErrorToBackground('Blocked internal URL (CustomEvent)', null, {
            action: 'validateSubtitleUrl',
            context: 'customEvent',
            hostname: hostname,
            url: url
          });
          return;
        }
      } catch (e) {
        sendErrorToBackground('Invalid URL format (CustomEvent)', e, {
          action: 'validateSubtitleUrl',
          context: 'customEvent',
          url: url ? url.substring(0, 100) : null
        });
        return;
      }
      
      // Fetch subtitle URL from content script
      fetch(url, {
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
            requestId: customEvent.detail.requestId,
            responseText: responseText
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(responseEvent);
        
        // SECURITY: Use specific origin instead of '*' to prevent XSS
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: customEvent.detail.requestId,
          responseText: responseText
        }, window.location.origin);
      })
      .catch(error => {
        sendErrorToBackground('Subtitle fetch failed via CustomEvent', error, {
          action: 'fetchSubtitles',
          context: 'customEvent',
          url: url
        });
        
        const errorEvent = new CustomEvent('ClipAIbleSubtitleFetchResponse', {
          detail: {
            type: 'ClipAIbleSubtitleFetchResponse',
            requestId: customEvent.detail.requestId,
            error: error.message || String(error)
          },
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(errorEvent);
        
        // SECURITY: Use specific origin instead of '*' to prevent XSS
        window.postMessage({
          type: 'ClipAIbleSubtitleFetchResponse',
          requestId: customEvent.detail.requestId,
          error: error.message || String(error)
        }, window.location.origin);
      });
    }
  };
  
  document.addEventListener('ClipAIbleSubtitleFetchRequest', handleFetchRequest);
  customEventListeners.push({ element: document, event: 'ClipAIbleSubtitleFetchRequest', handler: handleFetchRequest, capture: false });

  // Make function available for direct injection
  // @ts-ignore - External library may use this
  window.__webpageToPdf_extractContent = extractPageContent;
  
  // Cleanup function to remove all listeners
  function cleanupListeners() {
    try {
      // Remove window message listener
      if (messageListener) {
        window.removeEventListener('message', messageListener);
        messageListener = null;
      }
      
      // Remove chrome.runtime message listener
      if (runtimeMessageListener) {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
        runtimeMessageListener = null;
      }
      
      // Remove custom event listeners
      for (const { element, event, handler, capture } of customEventListeners) {
        try {
          element.removeEventListener(event, handler, capture);
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      customEventListeners = [];
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  
  // Register cleanup on page unload
  window.addEventListener('beforeunload', cleanupListeners);
  window.addEventListener('pagehide', cleanupListeners);
})();

