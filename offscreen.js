// @ts-check
// offscreen.js - Offscreen document for Chrome Extension
// Handles PDF processing and TTS synthesis in background context

// CRITICAL: Import ONLY logging utilities first - everything else will be imported dynamically
// This ensures message listener can be registered immediately
import { log, logError, logWarn, logDebug } from './scripts/utils/logging.js';
import { CONFIG } from './scripts/utils/config.js';
import { initLogPort } from './scripts/utils/logging/logging-port.js';
import { isTrustedExtensionSender } from './scripts/utils/security/message-sender.js';
import { handleImageRasterMessage } from './scripts/offscreen/image-rasterization.js';
import { pruneExpiredRasterJobs } from './scripts/api/image-raster-storage.js';
import { handleDownloadMessage } from './scripts/offscreen/download.js';
import { pruneExpiredDownloads } from './scripts/api/download-storage.js';
import { routeSupertonicMessage } from './scripts/offscreen/supertonic/controller.js';

void pruneExpiredRasterJobs().catch(error => logWarn('Image operation recovery failed', { error: error.message }));
void pruneExpiredDownloads().catch(error => logWarn('Download recovery failed', { error: error.message }));

// CRITICAL: Check for file caching issues immediately after imports
// Using regular log() instead of log() to avoid bundling issues
log('[ClipAIble Offscreen] === FILE CACHE CHECK ===', {
  timestamp: Date.now(),
  fileTimestamp: new Date().toISOString(),
  manifestVersion: chrome.runtime.getManifest?.()?.version || 'unknown',
  scriptUrl: typeof document !== 'undefined' && document.currentScript ? (/** @type {HTMLScriptElement} */ (document.currentScript)).src : 'unknown',
  documentUrl: typeof location !== 'undefined' ? location.href : 'unknown',
  userAgent: navigator.userAgent,
  chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1],
  extensionId: chrome.runtime.id,
  isOffscreen: typeof document !== 'undefined' && document.title === 'Offscreen Document',
  hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
  piperWasmBase: chrome.runtime.getURL('lib/piper-wasm/'),
  piperDataUrl: chrome.runtime.getURL('lib/piper-wasm/piper_phonemize.data'),
  piperWasmUrl: chrome.runtime.getURL('lib/piper-wasm/piper_phonemize.wasm'),
  piperJsUrl: chrome.runtime.getURL('lib/piper-wasm/piper_phonemize.js'),
  cacheBuster: Date.now()
});

log('[ClipAIble Offscreen] === OFFSCREEN DOCUMENT START LOADING ===', {
  timestamp: Date.now(),
  userAgent: navigator.userAgent,
  chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1],
  extensionId: chrome.runtime.id,
  url: typeof location !== 'undefined' ? location.href : 'unknown',
  isOffscreen: typeof document !== 'undefined' && document.title === 'Offscreen Document',
  hasWindow: typeof window !== 'undefined',
  hasDocument: typeof document !== 'undefined',
  hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
  hasChromeStorage: typeof chrome !== 'undefined' && !!chrome.storage,
  hasChromeScripting: typeof chrome !== 'undefined' && !!chrome.scripting,
  hasChromeTabs: typeof chrome !== 'undefined' && !!chrome.tabs,
  hasChromeOffscreen: typeof chrome !== 'undefined' && !!chrome.offscreen,
  hasLocalStorage: typeof localStorage !== 'undefined',
  hasSessionStorage: typeof sessionStorage !== 'undefined'
});

log('[ClipAIble Offscreen] Logging utilities imported successfully', {
  timestamp: Date.now(),
  hasLog: typeof log === 'function',
  hasLogError: typeof logError === 'function',
  hasLogWarn: typeof logWarn === 'function',
  hasLogDebug: typeof logDebug === 'function',
  hasCriticalLog: typeof log === 'function',
  hasCONFIG: !!CONFIG,
  hasInitLogPort: typeof initLogPort === 'function'
});

// CRITICAL: Initialize log port IMMEDIATELY after minimal imports
// This ensures port is ready before any logging happens
log('[ClipAIble Offscreen] Initializing log port immediately', { timestamp: Date.now() });
try {
  initLogPort();
  log('[ClipAIble Offscreen] Log port initialized successfully', { timestamp: Date.now() });
} catch (e) {
  logError('[ClipAIble Offscreen] Failed to initialize log port immediately', e);
}

// CRITICAL: Store message listener references BEFORE any other code
// This allows listener to be registered synchronously
log('[ClipAIble Offscreen] Initializing message listener references', { timestamp: Date.now() });
let messageListenerRef = null;
let fallbackMessageListenerRef = null;
log('[ClipAIble Offscreen] Message listener references initialized', { timestamp: Date.now() });

// CRITICAL: Import message handlers - needed for listener registration
log('[ClipAIble Offscreen] Importing message handlers', { timestamp: Date.now() });
import { handleGetVoices, handleGetStoredVoices, handlePing, handleExtractPdf, handleGetPdfMetadata, handleRenderAllPdfPages, handleCancelPdfRender } from './scripts/offscreen/message-handlers.js';
log('[ClipAIble Offscreen] Message handlers imported successfully', {
  timestamp: Date.now(),
  handlers: [
    'handleGetVoices', 'handleGetStoredVoices', 'handlePing',
    'handleExtractPdf', 'handleGetPdfMetadata',
    'handleRenderAllPdfPages'
  ].map(name => ({ name, exists: typeof window[name] === 'function' }))
});

// CRITICAL: Import state management - needed for listener
log('[ClipAIble Offscreen] Importing state management', { timestamp: Date.now() });
import { state } from './scripts/offscreen/state.js';
log('[ClipAIble Offscreen] State management imported successfully', {
  timestamp: Date.now(),
  hasState: !!state,
  stateType: typeof state
});

// CRITICAL: Import constants - needed for listener
log('[ClipAIble Offscreen] Importing constants', { timestamp: Date.now() });
import { DEFAULT_VOICES, FALLBACK_VOICES } from './scripts/offscreen/utils/constants.js';
log('[ClipAIble Offscreen] Constants imported successfully', {
  timestamp: Date.now(),
  hasDEFAULT_VOICES: !!DEFAULT_VOICES,
  defaultVoicesCount: Array.isArray(DEFAULT_VOICES) ? DEFAULT_VOICES.length : 'not array',
  hasFALLBACK_VOICES: !!FALLBACK_VOICES,
  fallbackVoicesCount: Array.isArray(FALLBACK_VOICES) ? FALLBACK_VOICES.length : 'not array'
});

// CRITICAL: Import utilities - needed for listener
log('[ClipAIble Offscreen] Importing utilities', { timestamp: Date.now() });
import { detectLanguage } from './scripts/offscreen/utils/language-detection.js';
import { concatenateWavBuffers } from './scripts/offscreen/audio/wav-utils.js';
log('[ClipAIble Offscreen] Utilities imported successfully', {
  timestamp: Date.now(),
  hasDetectLanguage: typeof detectLanguage === 'function',
  hasConcatenateWavBuffers: typeof concatenateWavBuffers === 'function'
});

// CRITICAL: Log before TTS imports
log('[ClipAIble Offscreen] === BEFORE TTS IMPORTS ===', { timestamp: Date.now() });

// CRITICAL: Import TTS modules - needed for listener
log('[ClipAIble Offscreen] Importing TTS modules', { timestamp: Date.now() });
import { initPiperTTS } from './scripts/offscreen/tts/init.js';
log('[ClipAIble Offscreen] TTS modules imported successfully', {
  timestamp: Date.now(),
  hasInitPiperTTS: typeof initPiperTTS === 'function'
});

// CRITICAL: Import Worker modules - needed for listener
log('[ClipAIble Offscreen] Importing Worker modules', { timestamp: Date.now() });
import { initTTSWorker, ensureTTSWorker } from './scripts/offscreen/worker/init.js';
import { resetWorkerInactivityTimer } from './scripts/offscreen/worker/lifecycle.js';
import {
  predictWithWorker,
  getVoicesWithWorker,
  getStoredWithWorker,
  downloadWithWorker,
  removeWithWorker
} from './scripts/offscreen/worker/api.js';
log('[ClipAIble Offscreen] Worker modules imported successfully', {
  timestamp: Date.now(),
  hasInitTTSWorker: typeof initTTSWorker === 'function',
  hasEnsureTTSWorker: typeof ensureTTSWorker === 'function',
  hasResetWorkerInactivityTimer: typeof resetWorkerInactivityTimer === 'function',
  hasPredictWithWorker: typeof predictWithWorker === 'function',
  hasGetVoicesWithWorker: typeof getVoicesWithWorker === 'function',
  hasGetStoredWithWorker: typeof getStoredWithWorker === 'function',
  hasDownloadWithWorker: typeof downloadWithWorker === 'function',
  hasRemoveWithWorker: typeof removeWithWorker === 'function'
});

// Import modular TTS handler
log('[ClipAIble Offscreen] Importing TTS handler', { timestamp: Date.now() });
import { handlePiperTTS } from './scripts/offscreen/tts/handler.js';
log('[ClipAIble Offscreen] TTS handler imported successfully', {
  timestamp: Date.now(),
  hasHandlePiperTTS: typeof handlePiperTTS === 'function'
});

// Register cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Remove message listeners
    if (messageListenerRef) {
      try {
        chrome.runtime.onMessage.removeListener(messageListenerRef);
        messageListenerRef = null;
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    if (fallbackMessageListenerRef) {
      try {
        chrome.runtime.onMessage.removeListener(fallbackMessageListenerRef);
        fallbackMessageListenerRef = null;
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    state.cleanupTTSResources();
  });
  
  // Also cleanup on visibility change (when offscreen document might be closed)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Don't cleanup immediately - might be temporary
      // But reset inactivity timer to prevent memory buildup
      state.clearWorkerInactivityTimeout();
    }
  });
}

// CRITICAL: Register message listener IMMEDIATELY after all imports
// This must be done BEFORE any async operations to avoid "Receiving end does not exist" errors
// Listener is registered synchronously, so it's ready immediately when document loads
try {
  const listenerRegisteredTime = Date.now();
  log('[ClipAIble Offscreen] Registering chrome.runtime.onMessage listener...', {
    timestamp: listenerRegisteredTime
  });

    messageListenerRef = (message, sender, sendResponse) => {
      if (!isTrustedExtensionSender(sender)) return false;
    const messageReceivedTime = Date.now();
    
    // CRITICAL: Filter messages EARLY (before creating messageId)
    // This prevents undefined from appearing in messageId and logs
    
    // Only handle messages targeted to offscreen
    if (!message || message.target !== 'offscreen') {
      if (CONFIG.LOG_LEVEL === 0) {
        log('[OFFSCREEN RAW] Message not for offscreen, ignoring:', {
          hasMessage: !!message,
          target: message?.target,
          type: message?.type,
          action: message?.action,
          messageKeys: message ? Object.keys(message) : []
        });
      }
      return false;
    }
    
    // Ignore messages without type (likely system messages or malformed messages)
    // CRITICAL: Check BEFORE creating messageId to prevent undefined_... IDs
    if (!message.type || typeof message.type !== 'string') {
      if (CONFIG.LOG_LEVEL === 0) {
        log('[OFFSCREEN RAW] Message without type, ignoring:', {
          hasMessage: !!message,
          type: message?.type,
          action: message?.action,
          target: message?.target,
          messageKeys: message ? Object.keys(message) : []
        });
      }
      return false;
    }

    if (message.type === 'RASTERIZE_IMAGE' || message.type === 'CANCEL_IMAGE_RASTER') {
      handleImageRasterMessage(message).then(sendResponse, () => sendResponse({ success: false, code: 'IMAGE_DECODE_FAILED' }));
      return true;
    }
    if (message.type === 'CREATE_DOWNLOAD_URL' || message.type === 'RELEASE_DOWNLOAD_URL') {
      handleDownloadMessage(message.type, message.data).then(sendResponse, () => sendResponse({ success: false }));
      return true;
    }
    if (message.type.startsWith('SUPERTONIC_')) {
      routeSupertonicMessage(message.type, message.data).then(sendResponse, () => sendResponse({ ok: false }));
      return true;
    }
    
    // Now safe to create messageId - we know message.type exists and is a string
    const messageId = `${message.type}_${messageReceivedTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // CRITICAL: Log ALL messages immediately, before any filtering (only in DEBUG mode)
    if (CONFIG.LOG_LEVEL === 0) {
      log('[OFFSCREEN RAW] Message received:', {
        type: message.type,
        target: message.target,
        hasData: !!message.data,
        messageKeys: Object.keys(message || {})
      });
    }
    
    log('[ClipAIble Offscreen] === MESSAGE RECEIVED ===', {
      messageId,
      type: message.type,
      target: message.target,
      hasData: !!message.data,
      dataKeys: message.data ? Object.keys(message.data) : [],
      senderId: sender?.id,
      senderTab: sender?.tab?.id,
      senderUrl: sender?.url,
      timestamp: messageReceivedTime,
      timeSinceListenerRegistered: messageReceivedTime - listenerRegisteredTime
    });
    

    
    // Note: message.target and message.type already validated above (lines 212-238)
    
    log('[ClipAIble Offscreen] Processing offscreen message', {
      messageId,
      type: message.type
    });
  
    // Handle CLEANUP_RESOURCES synchronously (before async block)
    if (message.type === 'CLEANUP_RESOURCES' || message.type === 'CANCEL_TTS') {
      if ((message.type === 'CANCEL_TTS' && !message.data?.processingRunId) ||
          (message.data?.processingRunId && message.data.processingRunId !== state.getProcessingRunId())) {
        sendResponse({ success: true, skipped: true, messageId });
        return true;
      }
      log(`[ClipAIble Offscreen] === CLEANUP_RESOURCES REQUEST ===`, {
        messageId,
        timestamp: Date.now()
      });
      
      try {
        state.cleanupTTSResources();
        sendResponse({
          success: true,
          messageId,
          message: 'Resources cleaned up successfully'
        });
      } catch (error) {
        logError(`[ClipAIble Offscreen] Cleanup failed`, {
          messageId,
          error: error.message
        });
        sendResponse({
          success: false,
          messageId,
          error: error.message
        });
      }
      return true; // Keep channel open for async response
    }
    
    // Handle async operations
  (async () => {
    const processingStartTime = Date.now();
    try {
      log(`[ClipAIble Offscreen] Starting async processing for ${messageId}`, {
        messageId,
        type: message.type,
        typeString: String(message.type),
        typeLength: message.type ? message.type.length : 0,
        typeCharCodes: message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : []
      });
      
      // CRITICAL: Log before switch to debug case matching

      
      // CRITICAL DEBUG: Log message type directly to console
      


      
      switch (message.type) {
        // PIPER_TTS handler - refactored to scripts/offscreen/tts/handler.js
        case 'PIPER_TTS': {
          state.setProcessingRunId(message.data?.processingRunId || null);
          const ttsContext = {
            initTTSWorker,
            initPiperTTS,
            predictWithWorker,
            getVoicesWithWorker,
            getStoredWithWorker,
            downloadWithWorker,
            removeWithWorker,
            state
          };
          await handlePiperTTS(messageId, message.data, sendResponse, ttsContext);
          break;
        }
        
        case 'GET_VOICES': {
          await handleGetVoices(messageId, initTTSWorker, getVoicesWithWorker, state.getTTSWorker(), sendResponse);
          break;
        }
        
        case 'GET_STORED_VOICES': {
          await handleGetStoredVoices(messageId, initTTSWorker, getStoredWithWorker, state.getTTSWorker(), sendResponse);
          break;
        }
        
        case 'PING': {
          handlePing(messageId, sendResponse);
          break;
        }









        case 'EXTRACT_PDF': {
          await handleExtractPdf(messageId, message.data, sendResponse);
          break;
        }
        

        
        case 'GET_PDF_METADATA': {
          await handleGetPdfMetadata(messageId, message.data, sendResponse);
          break;
        }
        
        


        
        case 'RENDER_ALL_PDF_PAGES': {
          await handleRenderAllPdfPages(messageId, message.data, sendResponse);
          break;
        }

        case 'CANCEL_PDF_RENDER': {
          handleCancelPdfRender(messageId, message.data, sendResponse);
          break;
        }
        
        default:
          if (CONFIG.LOG_LEVEL === 0) {

          }
          


          
          sendResponse({
            success: false,
            error: `Unknown message type: ${message.type}`
          });
      }
      
      const totalProcessingDuration = Date.now() - processingStartTime;
      log(`[ClipAIble Offscreen] === MESSAGE PROCESSING COMPLETE ===`, {
        messageId,
        type: message.type,
        totalDuration: totalProcessingDuration,
        timestamp: Date.now()
      });
      
    } catch (error) {
      const errorTime = Date.now();
      const processingDuration = errorTime - processingStartTime;
      
      // Web Speech API fallback disabled - function not implemented
      // TODO: Implement Web Speech API fallback for ONNX Runtime errors
      
      logError(`[ClipAIble Offscreen] === ERROR PROCESSING MESSAGE ===`, {
        messageId,
        type: message.type,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration: processingDuration,
        timestamp: errorTime
      });
      
      sendResponse({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  })();
  
  log(`[ClipAIble Offscreen] Returning true to keep channel open for ${messageId}`, {
    messageId,
    type: message.type
  });
  return true; // Keep channel open for async response
};

// Register the main message listener
chrome.runtime.onMessage.addListener(messageListenerRef);

// Initialize persistent log port connection for reliable logging
// This is more reliable than sendMessage for frequent messages
try {
  initLogPort();
  log('[ClipAIble Offscreen] Log port initialized', {
    timestamp: Date.now()
  });
} catch (e) {
  logError('[ClipAIble Offscreen] Failed to initialize log port', e);
}

// findWavDataChunk and concatenateWavBuffers are now imported from scripts/offscreen/audio/wav-utils.js
// Removed duplicate definitions

// Signal ready
const readyTime = Date.now();
log('[ClipAIble Offscreen] === READY AND LISTENING FOR MESSAGES ===', {
  timestamp: readyTime,
  timeSinceLoad: readyTime - listenerRegisteredTime
});

// Export to global scope for bundle compatibility
if (typeof window !== 'undefined') {
  const initializedWindow = /** @type {Window & {offscreenReady?: boolean, offscreenInitialized?: boolean}} */ (window);
  initializedWindow.offscreenReady = true;
  initializedWindow.offscreenInitialized = true;
  log('[ClipAIble Offscreen] Bundle loaded and ready', {
    timestamp: readyTime
  });
}
} catch (error) {
  logError('[ClipAIble Offscreen] ❌ CRITICAL ERROR during initialization', {
    error: error.message,
    stack: error.stack,
    timestamp: Date.now()
  });
  // Still register listener even if there's an error, so we can see what's wrong
  fallbackMessageListenerRef = (message, sender, sendResponse) => {
    if (!isTrustedExtensionSender(sender)) return false;
    logError('[ClipAIble Offscreen] Message received but initialization failed', {
      type: message.type,
      error: error.message
    });
    return false;
  };
  chrome.runtime.onMessage.addListener(fallbackMessageListenerRef);
}
