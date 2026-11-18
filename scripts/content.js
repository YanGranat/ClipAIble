// @ts-check
// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';

  const subtitleRequests = new Map();
  const isSubtitleRequestId = id => typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  const hasSubtitleRequest = id => isSubtitleRequestId(id) && subtitleRequests.has(id);

  function clearSubtitleRequest(requestId) {
    if (!hasSubtitleRequest(requestId)) return;
    clearTimeout(subtitleRequests.get(requestId));
    subtitleRequests.delete(requestId);
    const element = document.getElementById(`ClipAIblePendingSubtitles-${requestId}`);
    if (element) {
      try {
        const data = JSON.parse(element.getAttribute('data-subtitles') || 'null');
        if (data?.requestId === requestId) element.remove();
      } catch {}
    }
    try { chrome.storage.local.remove(`pendingSubtitles-${requestId}`).catch(() => {}); } catch {}
  }

  function registerSubtitleRequest(requestId) {
    if (!isSubtitleRequestId(requestId) || subtitleRequests.has(requestId)) return;
    subtitleRequests.set(requestId, setTimeout(() => clearSubtitleRequest(requestId), 60000));
  }

  function saveSubtitlesToStorage(subtitleData) {
    if (!hasSubtitleRequest(subtitleData?.requestId)) return Promise.resolve();
    const requestId = subtitleData.requestId;
    const storageKey = `pendingSubtitles-${requestId}`;
    return chrome.storage.local.set({ [storageKey]: {
      requestId: subtitleData.requestId,
      subtitles: subtitleData.subtitles,
      metadata: subtitleData.metadata,
      timestamp: Date.now()
    } }).then(() => {
      if (!hasSubtitleRequest(requestId)) return chrome.storage.local.remove(storageKey);
    });
  }
  
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
    if (!hasSubtitleRequest(subtitleData?.requestId)) return;
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
      const elementId = `ClipAIblePendingSubtitles-${subtitleData.requestId}`;
      const oldElement = document.getElementById(elementId);
      if (oldElement) {
        oldElement.remove();
      }
      
      // Save data to a special element on the page
      // Background script can read them via executeScript
      const dataElement = document.createElement('div');
      dataElement.id = elementId;
      dataElement.style.display = 'none';
      
      const dataToSave = {
        requestId: subtitleData.requestId,
        subtitles: subtitleData.subtitles,
        metadata: subtitleData.metadata,
        timestamp: Date.now(),
        source: 'dom_fallback'
      };
      
      dataElement.setAttribute('data-subtitles', JSON.stringify(dataToSave));
      
      // CRITICAL: Add at the BEGINNING of body, not at the end (faster access)
      document.body.insertBefore(dataElement, document.body.firstChild);
      
      // Check that element is actually in DOM
      const verification = document.getElementById(elementId);
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
  
  const extensionId = chrome.runtime.id;
  function trustedRuntimeSender(sender) {
    if (!extensionId || sender?.id !== extensionId) return false;
    if (!sender.url) return !sender.tab;
    try {
      const url = new URL(sender.url);
      return url.protocol === 'chrome-extension:' && url.hostname === extensionId;
    } catch { return false; }
  }

  function normalizeSubtitleMessage(input) {
    if (!input || input.type !== 'ClipAIbleYouTubeSubtitles' || !hasSubtitleRequest(input.requestId)) return null;
    if (input.result && input.result.requestId !== input.requestId) return null;
    let size;
    try { size = JSON.stringify(input).length; } catch { return null; }
    if (size > 10 * 1024 * 1024) return null;
    const output = { type: 'ClipAIbleYouTubeSubtitles', action: 'youtubeSubtitlesResult', requestId: input.requestId };
    if (typeof input.error === 'string') output.error = input.error.slice(0, 4000);
    if (input.result) {
      if (!Array.isArray(input.result.subtitles) || input.result.subtitles.length > 100000) return null;
      const subtitles = [];
      for (const row of input.result.subtitles) {
        if (!row || typeof row.text !== 'string' || row.text.length > 100000 || typeof row.start !== 'number' || !Number.isFinite(row.start) || row.start < 0 || typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration < 0) return null;
        subtitles.push({ start: row.start, duration: row.duration, text: row.text });
      }
      const metadata = {};
      for (const key of ['title', 'author', 'publishDate', 'description', 'language', 'videoId', 'url', 'duration']) {
        const value = input.result.metadata?.[key];
        if (typeof value === 'string') metadata[key] = value.slice(0, 100000);
        else if (typeof value === 'number' && Number.isFinite(value)) metadata[key] = value;
      }
      output.result = { requestId: input.requestId, subtitles, metadata };
    }
    if (!output.result && !output.error) return null;
    if (Array.isArray(input.pageLogs)) output.pageLogs = input.pageLogs.filter(line => typeof line === 'string').slice(0, 500).map(line => line.slice(0, 2000));
    return output;
  }

  // Store listener references for cleanup
  let messageListener = null;
  let runtimeMessageListener = null;
  let customEventListeners = [];
  
  const handlePostMessage = function handlePostMessage(event) {
    
    if (event.source !== window || event.origin !== window.location.origin) return;
    const messageData = normalizeSubtitleMessage(event.data);
    if (!messageData) return;
    if (!messageData) {
      return;
    }
    
    // SECURITY: Validate message size to prevent DoS
    try {
      const messageSize = JSON.stringify(messageData).length;
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
    
    // Handle subtitle extraction results
    if (messageData.type !== 'ClipAIbleYouTubeSubtitles') {
      return;
    }
    
    if (messageData && messageData.type === 'ClipAIbleYouTubeSubtitles') {
      if (!hasSubtitleRequest(messageData.requestId) ||
          (messageData.result && messageData.result.requestId !== messageData.requestId)) return;
      try {
        // CRITICAL: Check context BEFORE sending message
        if (!isExtensionContextValid()) {
          if (messageData.result && messageData.result.subtitles && messageData.result.subtitles.length > 0) {
            const subtitleData = {
              requestId: messageData.requestId,
              subtitles: messageData.result.subtitles,
              metadata: messageData.result.metadata || {}
            };
            saveToDOMFallback(subtitleData);
          }
          return;
        }
        
        let backgroundResponded = false;
        let subtitleData = null;
        if (messageData.result && messageData.result.subtitles && messageData.result.subtitles.length > 0) {
          subtitleData = {
            requestId: messageData.requestId,
            subtitles: messageData.result.subtitles,
            metadata: messageData.result.metadata || {}
          };
        }
        
        let storageSaved = false;
        const fallbackTimeout = setTimeout(() => {
          if (!backgroundResponded && !storageSaved && subtitleData) {
            storageSaved = true;
            
            // Try to use chrome.storage
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
        
        chrome.runtime.sendMessage(messageData, (response) => {
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
                  saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
          eventData: messageData ? { type: messageData.type, action: messageData.action } : null
        });
        
        // Try to save to storage if we have subtitle data
        if (messageData.result && messageData.result.subtitles && messageData.result.subtitles.length > 0) {
          const subtitleData = {
            requestId: messageData.requestId,
            subtitles: messageData.result.subtitles,
            metadata: messageData.result.metadata || {}
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
                saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
    
    // Get page title - prefer clean h1 over document.title, but avoid numeric-only h1
    let pageTitle = document.title;
    const h1 = document.querySelector('h1');
    if (h1) {
      // Clean title from Wikipedia edit section spans
      const titleMain = h1.querySelector('.mw-page-title-main');
      if (titleMain) {
        pageTitle = titleMain.textContent.trim();
      } else {
        const clone = /** @type {Element} */ (h1.cloneNode(true));
        clone.querySelectorAll('.mw-editsection, [class*="edit-section"], [class*="editsection"]').forEach(el => el.remove());
        const cleanTitle = clone.textContent.trim();
        // Only use h1 if it's not just numbers (avoid counters/views on some sites)
        if (cleanTitle && !/^\d+$/.test(cleanTitle.trim())) {
          pageTitle = cleanTitle;
        }
      }
    }
    
    // Get page metadata
    const metadata = {
      title: pageTitle,
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
    if (!trustedRuntimeSender(sender)) return false;
    if (request.action === 'extractContent') {
      const content = extractPageContent();
      sendResponse(content);
      return true;
    }
    
    // Handle ping request to verify content script is loaded
    if (request.action === 'ping') {
      registerSubtitleRequest(request.subtitleRequestId);
      sendResponse({ success: true, loaded: true, timestamp: new Date().toISOString() });
      return true;
    }

    if (request.action === 'clearSubtitleRequest') {
      clearSubtitleRequest(request.requestId);
      sendResponse({ success: true });
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
    const messageData = normalizeSubtitleMessage(event.detail);
    if (!messageData) return;
    if (!messageData || messageData.type !== 'ClipAIbleYouTubeSubtitles') {
      return;
    }
    if (!hasSubtitleRequest(messageData.requestId) ||
        (messageData.result && messageData.result.requestId !== messageData.requestId)) return;
    
    // Save subtitle data for storage fallback if needed
    let subtitleData = null;
    if (messageData.result && messageData.result.subtitles && messageData.result.subtitles.length > 0) {
      subtitleData = {
        requestId: messageData.requestId,
        subtitles: messageData.result.subtitles,
        metadata: messageData.result.metadata || {}
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
      currentHash = `${subtitleData.requestId}_${subtitleData.subtitles.length}_${firstText}_${lastText}`;
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
              saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
        chrome.runtime.sendMessage(messageData, (response) => {
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
                    saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
                saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
              saveSubtitlesToStorage(subtitleData).catch(storageError => {
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
  

  // Make function available for direct injection
  (/** @type {Window & {__webpageToPdf_extractContent?: typeof extractPageContent}} */ (window)).__webpageToPdf_extractContent = extractPageContent;
  
  // Cleanup function to remove all listeners
  function cleanupListeners() {
    try {
      for (const requestId of [...subtitleRequests.keys()]) clearSubtitleRequest(requestId);
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

