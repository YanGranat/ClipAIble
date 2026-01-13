// offscreen.js - Offscreen document for Chrome Extension
// Handles PDF processing and TTS synthesis in background context

// CRITICAL: Log IMMEDIATELY - BEFORE ANY IMPORTS
// This must be the FIRST executable code in the file
// Use alert as last resort to ensure we see something
(function() {
  const version = 'CODE VERSION 2025-12-29-v6';
  const marker = '=== OFFScreen_JS_FILE_LOADED_V6 ===';
  const msg = `[ClipAIble Offscreen] JS FILE LOADED - ${version}`;
  
  // Alert removed - bundle is loading correctly
  
  // Try ALL possible logging methods
  try {
    console.error('========================================');
    console.error(marker, msg);
    console.error('========================================');
    console.warn(marker, msg);
    console.log(marker, msg);
    console.error('[BUNDLE_VERSION_V6]', version);
    console.warn('[BUNDLE_VERSION_V6]', version);
    console.log('[BUNDLE_VERSION_V6]', version);
  } catch (e) {
    // Even console might fail
  }
  
  // Try localStorage
  try {
    localStorage.setItem('clipaible_bundle_loaded', JSON.stringify({
      version,
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown'
    }));
  } catch (e) {}
  
  // Try document.write as last resort (should not be used, but for debugging)
  try {
    if (typeof document !== 'undefined' && document.body) {
      const div = document.createElement('div');
      div.style.position = 'fixed';
      div.style.top = '0';
      div.style.left = '0';
      div.style.background = 'red';
      div.style.color = 'white';
      div.style.padding = '10px';
      div.style.zIndex = '999999';
      div.style.fontSize = '20px';
      div.textContent = `BUNDLE V6 LOADED: ${Date.now()}`;
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 10000); // Keep for 10 seconds
    }
  } catch (e) {}
  
})();

// CRITICAL: Import ONLY logging utilities first - everything else will be imported dynamically
// This ensures message listener can be registered immediately
import { log, logError, logWarn, logDebug, criticalLog } from './scripts/utils/logging.js';
import { CONFIG } from './scripts/utils/config.js';
import { initLogPort } from './scripts/utils/logging/logging-port.js';

// CRITICAL: Initialize log port IMMEDIATELY after minimal imports
// This ensures port is ready before any logging happens
try {
  initLogPort();
  console.log('[ClipAIble Offscreen] Log port initialized immediately after imports');
} catch (e) {
  console.error('[ClipAIble Offscreen] Failed to initialize log port immediately:', e);
}

// CRITICAL: Store message listener references BEFORE any other code
// This allows listener to be registered synchronously
let messageListenerRef = null;
let fallbackMessageListenerRef = null;

// CRITICAL: Import message handlers - needed for listener registration
import { 
  handleGetVoices, 
  handleGetStoredVoices, 
  handlePing, 
  handleExtractPdf,
  handleExtractPdfPageText,
  handleGetPdfMetadata,
  handleGetPdfPageDimensions,
  handleRenderPdfPageImage,
  handleRenderAllPdfPages
} from './scripts/offscreen/message-handlers.js';

// CRITICAL: Import state management - needed for listener
import { state } from './scripts/offscreen/state.js';

// CRITICAL: Import constants - needed for listener
import { DEFAULT_VOICES, FALLBACK_VOICES } from './scripts/offscreen/utils/constants.js';

// CRITICAL: Import utilities - needed for listener
import { detectLanguage } from './scripts/offscreen/utils/language-detection.js';
import { concatenateWavBuffers } from './scripts/offscreen/audio/wav-utils.js';

// CRITICAL: Log before TTS imports
console.error('[ClipAIble Offscreen] === BEFORE TTS IMPORTS ===', Date.now());

// CRITICAL: Import TTS modules - needed for listener
import { initPiperTTS } from './scripts/offscreen/tts/init.js';
console.error('[ClipAIble Offscreen] === AFTER initPiperTTS IMPORT ===', Date.now());

// CRITICAL: Import Worker modules - needed for listener
import { initTTSWorker, ensureTTSWorker } from './scripts/offscreen/worker/init.js';
console.error('[ClipAIble Offscreen] === AFTER worker/init IMPORT ===', Date.now());
import { resetWorkerInactivityTimer } from './scripts/offscreen/worker/lifecycle.js';
console.error('[ClipAIble Offscreen] === AFTER worker/lifecycle IMPORT ===', Date.now());
import { 
  predictWithWorker, 
  getVoicesWithWorker, 
  getStoredWithWorker, 
  downloadWithWorker, 
  removeWithWorker 
} from './scripts/offscreen/worker/api.js';

// Import modular TTS handler
import { handlePiperTTS } from './scripts/offscreen/tts/handler.js';
console.error('[ClipAIble Offscreen] === AFTER ALL IMPORTS ===', Date.now());

// CRITICAL: Log document load with version marker
const offscreenVersion = 'CODE VERSION 2025-12-29-v6';
// CRITICAL: Log bundle version IMMEDIATELY - FIRST THING IN FILE
// Use criticalLog after imports are loaded
// For now, use direct console methods before imports
console.error('=== OFFScreen_DOCUMENT_LOADED_V6 ===', offscreenVersion);
console.warn('=== OFFScreen_DOCUMENT_LOADED_V6 ===', offscreenVersion);
console.log('[ClipAIble Offscreen] === DOCUMENT LOADED V6 ===', offscreenVersion);
console.error('[BUNDLE_VERSION_V6]', offscreenVersion);
console.warn('[BUNDLE_VERSION_V6]', offscreenVersion);
console.log('[BUNDLE_VERSION_V6]', offscreenVersion);

// Try localStorage immediately (before any imports)
try {
  const storageKey = 'clipaible_bundle_loaded';
  localStorage.setItem(storageKey, JSON.stringify({
    version: offscreenVersion,
    timestamp: Date.now(),
    url: window.location.href
  }));
} catch (e) {
  // Ignore
}

// After imports are loaded, use criticalLog
// This will be called after log import is available
try {
  criticalLog('[ClipAIble Offscreen] === DOCUMENT LOADED V6 ===', '=== OFFScreen_DOCUMENT_LOADED_V6 ===', {
    version: offscreenVersion,
    timestamp: Date.now(),
    url: window.location.href,
    userAgent: navigator.userAgent.substring(0, 100)
  });
} catch (e) {
  // Ignore if criticalLog is not available yet
}

// messageListenerRef and fallbackMessageListenerRef are now defined above (after minimal imports)

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
    const messageReceivedTime = Date.now();
    
    // CRITICAL: Filter messages EARLY (before creating messageId)
    // This prevents undefined from appearing in messageId and logs
    
    // Only handle messages targeted to offscreen
    if (!message || message.target !== 'offscreen') {
      if (CONFIG.LOG_LEVEL === 0) {
        console.log('[OFFSCREEN RAW] Message not for offscreen, ignoring:', {
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
        console.log('[OFFSCREEN RAW] Message without type, ignoring:', {
          hasMessage: !!message,
          type: message?.type,
          action: message?.action,
          target: message?.target,
          messageKeys: message ? Object.keys(message) : []
        });
      }
      return false;
    }
    
    // Now safe to create messageId - we know message.type exists and is a string
    const messageId = `${message.type}_${messageReceivedTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    // CRITICAL: Log ALL messages immediately, before any filtering (only in DEBUG mode)
    if (CONFIG.LOG_LEVEL === 0) {
      console.log('[OFFSCREEN RAW] Message received:', {
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
    
    // CRITICAL: Special logging for GET_PDF_PAGE_DIMENSIONS (only in DEBUG mode)
    if (message.type === 'GET_PDF_PAGE_DIMENSIONS' || message.type?.includes('GET_PDF_PAGE_DIMENSIONS')) {
      if (CONFIG.LOG_LEVEL === 0) {
        console.log('[OFFSCREEN RAW] ✅ GET_PDF_PAGE_DIMENSIONS DETECTED IN LISTENER!', {
          type: message.type,
          target: message.target,
          exactMatch: message.type === 'GET_PDF_PAGE_DIMENSIONS'
      });
      criticalLog(`[ClipAIble Offscreen] ✅ GET_PDF_PAGE_DIMENSIONS DETECTED IN LISTENER!`, 'OFFSCREEN_GET_PDF_PAGE_DIMENSIONS_DETECTED_IN_LISTENER', {
        messageId,
        type: message.type,
        target: message.target,
        exactMatch: message.type === 'GET_PDF_PAGE_DIMENSIONS',
        hasData: !!message.data,
        dataKeys: message.data ? Object.keys(message.data) : []
      });
    }
    
    // Only handle messages targeted to offscreen
    if (message.target !== 'offscreen') {
      log('[ClipAIble Offscreen] Message not for offscreen, ignoring', {
        messageId,
        target: message.target
      });
      return false;
    }
    
    // Ignore messages without type (likely system messages or malformed messages)
    if (!message.type || typeof message.type !== 'string') {
      log('[ClipAIble Offscreen] Message without type, ignoring', {
        messageId,
        type: message.type,
        messageKeys: Object.keys(message || {})
      });
      return false;
    }
    
    log('[ClipAIble Offscreen] Processing offscreen message', {
      messageId,
      type: message.type
    });
  
    // Handle CLEANUP_RESOURCES synchronously (before async block)
    if (message.type === 'CLEANUP_RESOURCES') {
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
      criticalLog(`[ClipAIble Offscreen] 🔍 DEBUG: Message type before switch`, 'OFFSCREEN_MESSAGE_TYPE_DEBUG', {
        messageId,
        type: message.type,
        typeString: String(message.type),
        typeLength: message.type ? message.type.length : 0,
        typeCharCodes: message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : [],
        exactMatch: message.type === 'GET_PDF_PAGE_DIMENSIONS',
        includesMatch: message.type?.includes('GET_PDF_PAGE_DIMENSIONS'),
        expectedType: 'GET_PDF_PAGE_DIMENSIONS',
        expectedLength: 'GET_PDF_PAGE_DIMENSIONS'.length
      });
      
      // CRITICAL DEBUG: Log message type directly to console
      console.log('[OFFSCREEN DEBUG] Message type before switch:', message.type);
      console.log('[OFFSCREEN DEBUG] Message type === GET_PDF_PAGE_DIMENSIONS:', message.type === 'GET_PDF_PAGE_DIMENSIONS');
      console.log('[OFFSCREEN DEBUG] Message type char codes:', message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : []);
      
      // CRITICAL: If type is GET_PDF_PAGE_DIMENSIONS, handle it directly before switch
      if (message.type === 'GET_PDF_PAGE_DIMENSIONS') {
        console.log('[OFFSCREEN DEBUG] ✅ DIRECT IF CHECK MATCHED - GET_PDF_PAGE_DIMENSIONS!', messageId);
        criticalLog(`[ClipAIble Offscreen] ✅ DIRECT IF CHECK MATCHED - GET_PDF_PAGE_DIMENSIONS!`, 'OFFSCREEN_GET_PDF_PAGE_DIMENSIONS_DIRECT_IF', {
          messageId,
          type: message.type,
          hasData: !!message.data,
          dataKeys: message.data ? Object.keys(message.data) : [],
          pdfUrl: message.data?.pdfUrl,
          pageNum: message.data?.pageNum
        });
        await handleGetPdfPageDimensions(messageId, message.data, sendResponse);
        return; // Exit early
      }
      
      switch (message.type) {
        // PIPER_TTS handler - refactored to scripts/offscreen/tts/handler.js
        case 'PIPER_TTS': {
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
        
        case 'EXTRACT_PDF_PAGE_TEXT': {
          await handleExtractPdfPageText(messageId, message.data, sendResponse);
          break;
        }
        
        case 'GET_PDF_METADATA': {
          await handleGetPdfMetadata(messageId, message.data, sendResponse);
          break;
        }
        
        case 'GET_PDF_PAGE_DIMENSIONS': {
          if (CONFIG.LOG_LEVEL === 0) {
            console.log('[OFFSCREEN DEBUG] ✅ GET_PDF_PAGE_DIMENSIONS CASE MATCHED!', messageId, 'type:', message.type);
          }
          criticalLog(`[ClipAIble Offscreen] ✅ GET_PDF_PAGE_DIMENSIONS CASE MATCHED!`, 'OFFSCREEN_GET_PDF_PAGE_DIMENSIONS_CASE_MATCHED', {
            messageId,
            type: message.type,
            hasData: !!message.data,
            dataKeys: message.data ? Object.keys(message.data) : [],
            pdfUrl: message.data?.pdfUrl,
            pageNum: message.data?.pageNum
          });
          await handleGetPdfPageDimensions(messageId, message.data, sendResponse);
          break;
        }
        
        case 'RENDER_PDF_PAGE_IMAGE': {
          await handleRenderPdfPageImage(messageId, message.data, sendResponse);
          break;
        }
        
        case 'RENDER_ALL_PDF_PAGES': {
          await handleRenderAllPdfPages(messageId, message.data, sendResponse);
          break;
        }
        
        default:
          if (CONFIG.LOG_LEVEL === 0) {
            console.log('[OFFSCREEN DEBUG] ❌ DEFAULT CASE HIT - Unknown message type:', message.type);
            console.log('[OFFSCREEN DEBUG] Message type char codes:', message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : []);
            console.log('[OFFSCREEN DEBUG] Expected: GET_PDF_PAGE_DIMENSIONS, char codes:', Array.from('GET_PDF_PAGE_DIMENSIONS').map(c => c.charCodeAt(0)));
            console.log('[OFFSCREEN DEBUG] Exact match:', message.type === 'GET_PDF_PAGE_DIMENSIONS');
          }
          criticalLog(`[ClipAIble Offscreen] ❌ Unknown message type - DEFAULT CASE HIT`, 'OFFSCREEN_UNKNOWN_MESSAGE_TYPE', {
            messageId,
            type: message.type,
            typeString: String(message.type),
            typeLength: message.type ? message.type.length : 0,
            typeCharCodes: message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : [],
            expectedType: 'GET_PDF_PAGE_DIMENSIONS',
            exactMatch: message.type === 'GET_PDF_PAGE_DIMENSIONS',
            allCaseValues: ['GET_PDF_METADATA', 'GET_PDF_PAGE_DIMENSIONS', 'RENDER_PDF_PAGE_IMAGE', 'RENDER_ALL_PDF_PAGES'],
            messageKeys: Object.keys(message),
            messageFull: JSON.stringify(message, null, 2)
          });
          
          logError(`[ClipAIble Offscreen] Unknown message type for ${messageId}`, {
            messageId,
            type: message.type,
            typeString: String(message.type),
            typeLength: message.type ? message.type.length : 0,
            typeCharCodes: message.type ? Array.from(message.type).map(c => c.charCodeAt(0)) : [],
            expectedType: 'GET_PDF_PAGE_DIMENSIONS',
            exactMatch: message.type === 'GET_PDF_PAGE_DIMENSIONS',
            allCaseValues: ['GET_PDF_METADATA', 'GET_PDF_PAGE_DIMENSIONS', 'RENDER_PDF_PAGE_IMAGE', 'RENDER_ALL_PDF_PAGES']
          });
          
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
      
      // Enhanced error logging for Piper TTS phoneme index errors
      const isPhonemeError = error.message && (
        error.message.includes('indices element out of data bounds') ||
        error.message.includes('Gather node') ||
        error.message.includes('phoneme') ||
        error.message.includes('idx=') ||
        error.message.includes('inclusive range')
      );
      
      // Check if it's an ONNX Runtime error that might be recoverable with Web Speech API
      const isOnnxError = error.message && (
        error.message.includes('No graph was found in the protobuf') ||
        error.message.includes('Can\'t create a session') ||
        error.message.includes('Aborted()') ||
        error.message.includes('ERROR_CODE: 2') ||
        error.message.includes('ASSERTIONS')
      );
      
      // Try Web Speech API fallback for ONNX Runtime errors
      // Perplexity recommendation: Use Web Speech API as fallback when Piper TTS fails
      if (isOnnxError && message.type === 'PIPER_TTS' && message.data && message.data.text) {
        logWarn(`[ClipAIble Offscreen] ONNX Runtime error detected, attempting Web Speech API fallback for ${messageId}`, {
          messageId,
          originalError: error.message,
          textLength: message.data.text.length
        });
        
        try {
          const webSpeechAudio = await synthesizeWithWebSpeechAPI(
            message.data.text,
            message.data.language || 'en',
            message.data.speed || 1.0,
            message.data.pitch || 1.0
          );
          
          if (webSpeechAudio) {
            log(`[ClipAIble Offscreen] Web Speech API fallback succeeded for ${messageId}`, {
              messageId,
              audioSize: webSpeechAudio.byteLength
            });
            
            // Convert to same format as Piper TTS (Uint8Array)
            const uint8Array = new Uint8Array(webSpeechAudio);
            
            // Use same storage logic as Piper TTS
            const manifest = chrome.runtime.getManifest();
            const hasUnlimitedStorage = manifest.permissions?.includes('unlimitedStorage') || false;
            const STORAGE_THRESHOLD = hasUnlimitedStorage 
              ? 50 * 1024 * 1024
              : 8 * 1024 * 1024;
            const MAX_AUDIO_SIZE = hasUnlimitedStorage 
              ? 100 * 1024 * 1024
              : 10 * 1024 * 1024;
            
            if (uint8Array.length > MAX_AUDIO_SIZE) {
              throw new Error(`Audio size ${uint8Array.length} exceeds maximum ${MAX_AUDIO_SIZE}`);
            }
            
            if (uint8Array.length < STORAGE_THRESHOLD) {
              sendResponse({
                success: true,
                method: 'inline',
                audioData: Array.from(uint8Array),
                messageId
              });
            } else {
              const storageKey = `tts_audio_${messageId}`;
              await chrome.storage.local.set({
                [storageKey]: Array.from(uint8Array),
                [`${storageKey}_meta`]: {
                  timestamp: Date.now(),
                  size: uint8Array.length
                }
              });
              
              sendResponse({
                success: true,
                method: 'storage',
                storageKey,
                messageId
              });
            }
            
            return; // Success with fallback
          }
        } catch (fallbackError) {
          logError(`[ClipAIble Offscreen] Web Speech API fallback also failed for ${messageId}`, {
            messageId,
            fallbackError: fallbackError.message,
            originalError: error.message
          });
          // Continue to error response below
        }
      }
      
      logError(`[ClipAIble Offscreen] === ERROR PROCESSING MESSAGE ===`, {
        messageId,
        type: message.type,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration: processingDuration,
        timestamp: errorTime,
        isPhonemeError,
        isOnnxError,
        ...(isPhonemeError && {
          suggestion: 'This error usually means the text contains characters that cannot be phonemized by the selected voice model. The text has been sanitized, but some characters may still be incompatible. Try using a different voice or further cleaning the text.'
        }),
        ...(isOnnxError && {
          suggestion: 'ONNX Runtime error - this may be due to memory limitations or WASM initialization issues. Web Speech API fallback was attempted but may have also failed.'
        })
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
  window.offscreenReady = true;
  window.offscreenInitialized = true;
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
    logError('[ClipAIble Offscreen] Message received but initialization failed', {
      type: message.type,
      error: error.message
    });
    return false;
  };
  chrome.runtime.onMessage.addListener(fallbackMessageListenerRef);
}

// CRITICAL: Preload TTS module and WASM files AFTER listener is registered
// This prevents Long Tasks when TTS is first used, but doesn't block listener registration
log('[ClipAIble Offscreen] Starting TTS module preload...', {
  timestamp: Date.now()
});

// Preload in background (don't block message listener registration)
initPiperTTS().then(module => {
  log('[ClipAIble Offscreen] TTS module preloaded successfully', {
    timestamp: Date.now(),
    hasModule: !!module
  });
}).catch(error => {
  logWarn('[ClipAIble Offscreen] TTS module preload failed (non-critical)', {
    error: error.message,
    timestamp: Date.now()
  });
  // Don't throw - preload is optional, TTS will initialize on first use
});
