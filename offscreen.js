// offscreen.js - Refactored version with modular structure
// Uses separate modules for better maintainability and testability

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
        /**
         * CRITICAL: PIPER_TTS handler is ~3300 lines long and MUST remain as a single case block.
         * 
         * This handler is extremely complex and handles:
         * - Voice selection and validation (with fallbacks)
         * - Language detection and normalization
         * - Voice model downloading and caching
         * - TTS generation with retry logic
         * - Error handling with multiple fallback strategies
         * - Progress reporting
         * - Resource cleanup
         * 
         * Reasons why this handler cannot be split:
         * 1. Complex state management (voiceId, downloadVoiceId, retryCount, etc.)
         * 2. Multiple nested retry loops with fallback logic
         * 3. Tightly coupled error handling and recovery
         * 4. Shared variables across multiple code blocks
         * 5. Complex voice selection logic with multiple fallback strategies
         * 
         * Attempting to split this would:
         * - Require passing many parameters between functions
         * - Make error handling and retry logic much more complex
         * - Reduce code readability due to function call overhead
         * - Make debugging significantly harder
         * 
         * The handler is well-commented and organized with clear sections.
         * Consider this handler as a "monolithic but necessary" pattern.
         */
        case 'PIPER_TTS': {
          const ttsRequestStart = Date.now();
          const { text, options = {} } = message.data;
          let { language = 'en', voice = null } = options;
          
          // Initialize TTS module or Web Worker if needed
          const ttsInitStart = Date.now();
          let tts;
          try {
            // Initialize Web Worker - required, no fallback
            log(`[ClipAIble Offscreen] === TTS INITIALIZATION START === for ${messageId}`, {
              messageId,
              useWorker: state.shouldUseWorker(),
              hasTTSWorker: state.hasTTSWorker(),
              timestamp: Date.now()
            });
            
            if (state.shouldUseWorker()) {
              log(`[ClipAIble Offscreen] Attempting to initialize TTS Worker for ${messageId}...`, {
                messageId,
                timestamp: Date.now()
              });
              try {
                await initTTSWorker();
                log(`[ClipAIble Offscreen] ✅ TTS Worker initialized successfully for ${messageId}`, {
                  messageId,
                  duration: Date.now() - ttsInitStart,
                  method: 'worker',
                  hasWorker: state.hasTTSWorker(),
                  useWorker: state.shouldUseWorker()
                });
                // Worker is ready, tts will be null (we'll use worker)
              } catch (workerError) {
                logError(`[ClipAIble Offscreen] ❌ TTS Worker initialization FAILED for ${messageId}`, {
                  messageId,
                  error: workerError.message,
                  stack: workerError.stack,
                  duration: Date.now() - ttsInitStart
                });
                throw new Error(`TTS Worker initialization failed: ${workerError.message}`);
              }
            } else {
              throw new Error(`Web Worker is disabled (useWorker=false) for ${messageId}. Worker must be enabled.`);
            }
            
            // CRITICAL: Worker is required - no fallback to direct execution
            if (!state.getTTSWorker()) {
              throw new Error(`TTS Worker is not initialized for ${messageId}. Worker initialization must succeed.`);
            }
            
            log(`[ClipAIble Offscreen] ✅ TTS Worker ready for ${messageId}`, {
              messageId,
              useWorker: state.shouldUseWorker(),
              hasTTSWorker: state.hasTTSWorker(),
              timestamp: Date.now()
            });
          } catch (initError) {
            logError(`[ClipAIble Offscreen] TTS initialization FAILED for ${messageId}`, {
              messageId,
              error: initError.message,
              stack: initError.stack,
              hasWindow: typeof window !== 'undefined',
              importMapExists: !!document.querySelector('script[type="importmap"]'),
              importMapContent: document.querySelector('script[type="importmap"]')?.textContent?.substring(0, 300)
            });
            throw initError;
          }
          
          const ttsInitDuration = Date.now() - ttsInitStart;
          
          // CRITICAL: Always initialize ttsModule for stored() and download() operations
          // Worker is used only for predict() operations
          if (!state.getTTSModule()) {
            log(`[ClipAIble Offscreen] Initializing ttsModule for ${messageId}`, {
              messageId,
              useWorker: state.shouldUseWorker()
            });
            await initPiperTTS();
          }
          
          // Define tts as ttsModule for stored() and download() operations
          tts = state.getTTSModule();
          
          // CRITICAL: Log voice parameter in detail to debug issues
          // This is the FIRST place where we see the voice from the request
          log(`[ClipAIble Offscreen] ===== NEW REQUEST START ===== VOICE="${String(voice || 'null')}" ===== for ${messageId}`, {
            messageId,
            timestamp: ttsRequestStart,
            requestVoice: voice,
            VOICE_FROM_REQUEST: `VOICE="${String(voice || 'null')}"`, // Explicit string for visibility
            language,
            textLength: text?.length || 0
          });
          
          log(`[ClipAIble Offscreen] CRITICAL: Voice parameter received for ${messageId}`, {
            messageId,
            voice,
            voiceType: typeof voice,
            voiceValue: String(voice),
            voiceRaw: JSON.stringify(voice),
            isNumeric: /^\d+$/.test(String(voice)),
            hasUnderscore: voice && String(voice).includes('_'),
            hasDash: voice && String(voice).includes('-'),
            isFullVoiceId: voice && String(voice).includes('_') && String(voice).includes('-'),
            options: options || {},
            VOICE_STRING: `VOICE="${String(voice)}"`, // Explicit string for visibility
            optionsKeys: Object.keys(options || {}),
            language: language,
            languageType: typeof language
          });
          
          // Log all TTS settings and configuration
          const ttsSettings = {
            messageId,
            timestamp: ttsRequestStart,
            // Text Settings
            textLength: text?.length || 0,
            // Language Settings
            language,
            languageAuto: language === 'auto',
            // Voice Settings
            voice,
            voiceRequested: voice,
            voiceType: typeof voice,
            voiceValue: String(voice),
            // Options
            options: options || {},
            optionsKeys: Object.keys(options || {}),
            // Default Voices Configuration
            defaultVoices: DEFAULT_VOICES,
            // Fallback Voices Configuration
            fallbackVoices: FALLBACK_VOICES,
            // Storage Settings (will be determined later)
            storageSettings: 'Will be determined after language detection'
          };
          
          log(`[ClipAIble Offscreen] PIPER_TTS request with all settings for ${messageId}`, ttsSettings);
          
          // Auto-detect language
          if (language === 'auto') {
            const detectStart = Date.now();
            language = detectLanguage(text);
            log(`[ClipAIble Offscreen] Language detected for ${messageId}`, {
              messageId,
              detectedLanguage: language,
              duration: Date.now() - detectStart
            });
          }
          
          // Normalize Ukrainian language code: 'ua' -> 'uk' (Piper TTS uses 'uk')
          // This ensures consistency regardless of where the language code comes from
          if (language && language !== 'auto') {
            const langBase = language.split('-')[0].toLowerCase();
            if (langBase === 'ua') {
              language = language.replace(/^ua/i, 'uk');
              log(`[ClipAIble Offscreen] Normalized language code for ${messageId}`, {
                messageId,
                originalLanguage: language,
                normalizedLanguage: language
              });
            }
          }
          
          // Select voice
          let langCode = language.split('-')[0].toLowerCase();
          // Normalize Ukrainian language code: 'ua' -> 'uk' (Piper TTS uses 'uk')
          if (langCode === 'ua') {
            langCode = 'uk';
          }
          
          // CRITICAL: Validate langCode before using it
          log(`[ClipAIble Offscreen] === VOICE SELECTION START === for ${messageId}`, {
            messageId,
            language,
            langCode,
            requestedVoice: voice,
            requestedVoiceType: typeof voice,
            requestedVoiceValue: String(voice),
            requestedVoiceRaw: JSON.stringify(voice),
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en'],
            allDefaultVoices: DEFAULT_VOICES
          });
          
          if (!langCode || langCode === 'undefined' || langCode.trim() === '') {
            logError(`[ClipAIble Offscreen] CRITICAL: Invalid langCode for ${messageId}`, {
              messageId,
              language,
              langCode,
              action: 'Falling back to English'
            });
            langCode = 'en';
            log(`[ClipAIble Offscreen] Using fallback langCode for ${messageId}`, {
              messageId,
              originalLanguage: language,
              fallbackLangCode: 'en'
            });
          }
          
          // CRITICAL: Check if default voice exists for this language
          const defaultVoiceForLang = DEFAULT_VOICES[langCode];
          const defaultVoiceEn = DEFAULT_VOICES['en'];
          
          log(`[ClipAIble Offscreen] Default voice lookup for ${messageId}`, {
            messageId,
            langCode,
            defaultVoiceForLang,
            defaultVoiceEn,
            hasDefaultForLang: !!defaultVoiceForLang,
            hasDefaultEn: !!defaultVoiceEn
          });
          
          // CRITICAL: Handle cases where language has no voices (ja, ko)
          // If defaultVoiceForLang is null, fallback to English
          // CRITICAL: Check if voice is already a valid voice ID format (contains _ and -)
          // If it is, use it directly. Otherwise, try to find it by name.
          let voiceId = null;
          if (voice && voice !== '0' && voice !== '') {
            // Check if voice is already a valid voice ID format (contains _ and -)
            const isValidVoiceFormat = voice.includes('_') && voice.includes('-');
            if (isValidVoiceFormat) {
              // Voice is already a valid ID format - use it directly
              voiceId = voice;
              log(`[ClipAIble Offscreen] CRITICAL: Using voice directly as valid ID format for ${messageId}`, {
                messageId,
                voice,
                voiceId,
                isValidVoiceFormat: true
              });
            } else {
              // Voice is not in valid format - will be processed by mapping later
              voiceId = voice;
              log(`[ClipAIble Offscreen] CRITICAL: Voice is not in valid ID format, will try mapping for ${messageId}`, {
                messageId,
                voice,
                voiceId,
                isValidVoiceFormat: false,
                hasUnderscore: voice.includes('_'),
                hasDash: voice.includes('-')
              });
            }
          } else {
            // No voice specified, use default
            voiceId = defaultVoiceForLang || defaultVoiceEn || 'en_US-lessac-medium';
            log(`[ClipAIble Offscreen] CRITICAL: No voice specified, using default for ${messageId}`, {
              messageId,
              voice,
              defaultVoiceForLang,
              defaultVoiceEn,
              selectedVoiceId: voiceId
            });
          }
          
          // If voiceId is still null (shouldn't happen, but safety check)
          if (!voiceId) {
            voiceId = 'en_US-lessac-medium';
            logWarn(`[ClipAIble Offscreen] No default voice for language ${langCode}, using English fallback for ${messageId}`, {
              messageId,
              langCode,
              defaultVoiceForLang,
              defaultVoiceEn
            });
          }
          let isFallbackVoice = false;
          
          log(`[ClipAIble Offscreen] === INITIAL VOICE SELECTION === for ${messageId} === VOICE="${voiceId}" === REQUESTED="${String(voice || '')}" ===`, {
            messageId,
            voiceId,
            SELECTED_VOICE_STRING: `SELECTED_VOICE="${voiceId}"`, // Explicit string for visibility
            REQUESTED_VOICE_STRING: `REQUESTED_VOICE="${String(voice || '')}"`, // Explicit string for visibility
            requestedVoice: voice,
            voiceType: typeof voice,
            isDefault: !voice || voice === '0' || voice === '',
            source: (voice && voice !== '0' && voice !== '') ? 'user' : (defaultVoiceForLang ? 'langDefault' : 'enDefault'),
            langCode,
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en']
          });
          
          // CRITICAL: Ensure voiceId is never undefined
          if (!voiceId || voiceId === 'undefined' || (typeof voiceId === 'string' && voiceId.trim() === '')) {
            logError(`[ClipAIble Offscreen] CRITICAL: voiceId is undefined or empty for ${messageId}`, {
              messageId,
              language,
              langCode,
              voice,
              voiceId,
              voiceIdType: typeof voiceId,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES
            });
            // Force fallback to English if no voice found
            voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
            log(`[ClipAIble Offscreen] Forced voiceId to English fallback for ${messageId}`, {
              messageId,
              forcedVoiceId: voiceId,
              reason: 'voiceId was undefined or empty'
            });
          }
          
          // CRITICAL: Validate voice ID format
          // Voice ID must be in format like "en_US-hfc_female-medium" or "ar_JO-kareem-low"
          // If voice is just a number (e.g., "27") or doesn't match expected format, try to find it by name
          let isValidVoiceFormat = voiceId && (
            voiceId.includes('_') &&  // Contains underscore (e.g., "en_US-...")
            voiceId.includes('-')     // Contains dash (e.g., "...-medium")
          );
          
          log(`[ClipAIble Offscreen] CRITICAL: Voice format validation for ${messageId}`, {
            messageId,
            voice,
            voiceId,
            isValidVoiceFormat,
            hasUnderscore: voiceId && voiceId.includes('_'),
            hasDash: voiceId && voiceId.includes('-'),
            willTryMapping: !isValidVoiceFormat && voice && voice !== '0' && voice !== ''
          });
          
          // CRITICAL: Only try mapping if voiceId is NOT already in valid format
          // If voiceId is already valid (e.g., "ru_RU-denis-medium"), use it directly
          if (!isValidVoiceFormat && voice && voice !== '0' && voice !== '') {
            log(`[ClipAIble Offscreen] Invalid voice format detected for ${messageId}`, {
              messageId,
              requestedVoice: voice,
              voiceId,
              isValidFormat: isValidVoiceFormat,
              action: 'Trying to find voice by name first, then switching to default'
            });
            
            // CRITICAL: Try to find voice by name using voice mapping
            // This handles cases where user selected voice by display name (e.g., "dmitri")
            try {
              // Import voice mapping
              const { findVoiceIdByName, PIPER_VOICES_MAPPING } = await import(chrome.runtime.getURL('scripts/api/piper-voices-mapping.js'));
              
              log(`[ClipAIble Offscreen] CRITICAL: Attempting voice mapping for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                requestedVoiceType: typeof voice,
                requestedVoiceString: String(voice),
                language,
                langCode,
                mappingKeys: Object.keys(PIPER_VOICES_MAPPING || {}).slice(0, 20),
                hasDirectMapping: PIPER_VOICES_MAPPING && PIPER_VOICES_MAPPING[String(voice).toLowerCase()],
                directMappingValue: PIPER_VOICES_MAPPING && PIPER_VOICES_MAPPING[String(voice).toLowerCase()]
              });
              
              const mappedVoiceId = findVoiceIdByName(voice, language || langCode);
              
              log(`[ClipAIble Offscreen] CRITICAL: Voice mapping result for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                mappedVoiceId,
                language,
                langCode,
                mappingFound: !!mappedVoiceId
              });
              
              if (mappedVoiceId) {
                log(`[ClipAIble Offscreen] Found voice by name mapping for ${messageId}`, {
                  messageId,
                  requestedVoice: voice,
                  mappedVoiceId,
                  language,
                  langCode
                });
                log(`[ClipAIble Offscreen] CRITICAL: Setting voiceId from mapping for ${messageId}`, {
                  messageId,
                  beforeVoiceId: voiceId,
                  mappedVoiceId,
                  willSetTo: mappedVoiceId
                });
                voiceId = mappedVoiceId;
                isValidVoiceFormat = voiceId && (
                  voiceId.includes('_') || voiceId.includes('-')
                );
                
                log(`[ClipAIble Offscreen] CRITICAL: voiceId after mapping assignment for ${messageId}`, {
                  messageId,
                  voiceId,
                  voiceIdType: typeof voiceId,
                  isValidVoiceFormat
                });
                
                if (isValidVoiceFormat) {
                  log(`[ClipAIble Offscreen] Voice mapped and format validated for ${messageId}`, {
                    messageId,
                    originalVoice: voice,
                    mappedVoiceId: voiceId
                  });
                }
              } else {
                // Fallback: try to find in available voices from library
                // This handles voices that exist in library but not in types.d.ts
                // (e.g., "bryce", "john", "norman", "paola", "gwryw_gogleddol")
                // CRITICAL: Also handle numeric indices (e.g., "107") - don't try to construct ID from them
                // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                let availableVoices = null;
                if (!state.getTTSWorker()) {
                  await initTTSWorker();
                }
                if (!state.getTTSWorker()) {
                  throw new Error('TTS Worker is not available. Cannot get available voices without Worker.');
                }
                availableVoices = await getVoicesWithWorker();
                
                if (availableVoices) {
                  // CRITICAL: tts.voices() returns Voice[] array, not an object!
                  // Each Voice has structure: { key: VoiceId, name: string, language: {...}, quality: Quality, ... }
                  
                  log(`[ClipAIble Offscreen] Searching for voice by name in library for ${messageId}`, {
                    messageId,
                    requestedVoice: voice,
                    requestedVoiceType: typeof voice,
                    isNumeric: /^\d+$/.test(String(voice)),
                    language,
                    availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                    isArray: Array.isArray(availableVoices)
                  });
                  
                  // CRITICAL: If voice is a number (index), try to find voice by index in available voices
                  if (/^\d+$/.test(String(voice))) {
                    const voiceIndex = parseInt(voice, 10);
                    log(`[ClipAIble Offscreen] Voice is numeric index, trying to find by index for ${messageId}`, {
                      messageId,
                      requestedVoice: voice,
                      voiceIndex,
                      language,
                      langCode,
                      availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0
                    });
                    
                    // CRITICAL: Use the SAME filtering and sorting logic as GET_VOICES
                    // This ensures index matches the position in UI dropdown
                    const supportedLanguages = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh'];
                    
                    // Filter voices: exclude low quality and unsupported languages
                    const filteredVoices = (Array.isArray(availableVoices) ? availableVoices : []).filter((voice) => {
                      const quality = voice.quality || 'medium';
                      const isLowQuality = quality === 'low' || quality === 'x_low';
                      if (isLowQuality) {
                        return false;
                      }
                      
                      // Extract language code from voice key or use language property
                      let langCode = '';
                      if (voice.language?.code && typeof voice.language.code === 'string') {
                        const countryCode = voice.language.code.toLowerCase();
                        langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
                      } else {
                        const langMatch = voice.key.match(/^([a-z]{2})_/i);
                        langCode = langMatch ? langMatch[1].toLowerCase() : '';
                      }
                      
                      // Check if language is supported
                      return supportedLanguages.includes(langCode);
                    });
                    
                    // Map to result format (same as GET_VOICES)
                    const result = filteredVoices.map((voice) => {
                      // Extract base language code
                      let langCode = '';
                      if (voice.language?.code && typeof voice.language.code === 'string') {
                        const countryCode = voice.language.code.toLowerCase();
                        langCode = countryCode.split('_')[0];
                      } else {
                        const langMatch = voice.key.match(/^([a-z]{2})_/i);
                        langCode = langMatch ? langMatch[1].toLowerCase() : 'unknown';
                      }
                      
                      return {
                        id: voice.key, // CRITICAL: Use voice.key as id
                        name: voice.name || voice.key,
                        language: langCode,
                        quality: voice.quality || 'medium',
                        gender: voice.gender || 'unknown'
                      };
                    });
                    
                    // Sort voices: SAME logic as GET_VOICES
                    // First by language (in supported order), then by quality (high > medium), then by name
                    const languageOrder = { 'en': 0, 'ru': 1, 'uk': 2, 'de': 3, 'fr': 4, 'es': 5, 'it': 6, 'pt': 7, 'zh': 8, 'ja': 9, 'ko': 10 };
                    const qualityOrder = { 'high': 0, 'medium': 1 };
                    result.sort((a, b) => {
                      // First sort by language (in supported order)
                      const aLangOrder = languageOrder[a.language] ?? 99;
                      const bLangOrder = languageOrder[b.language] ?? 99;
                      if (aLangOrder !== bLangOrder) {
                        return aLangOrder - bLangOrder;
                      }
                      // Then by quality (high > medium)
                      const aQuality = qualityOrder[a.quality] ?? 99;
                      const bQuality = qualityOrder[b.quality] ?? 99;
                      if (aQuality !== bQuality) {
                        return aQuality - bQuality;
                      }
                      // Finally by name
                      return a.name.localeCompare(b.name);
                    });
                    
                    const filteredVoicesList = result;
                    
                    log(`[ClipAIble Offscreen] Filtered voices for index lookup for ${messageId}`, {
                      messageId,
                      voiceIndex,
                      filteredVoicesCount: filteredVoicesList.length,
                      filteredVoices: filteredVoicesList.slice(0, 10).map(v => ({ id: v.id, name: v.name, language: v.language, quality: v.quality })),
                      totalAvailableVoices: Array.isArray(availableVoices) ? availableVoices.length : 0
                    });
                    
                    // Get voice by index (0-based) - index should match UI dropdown position
                    if (voiceIndex >= 0 && voiceIndex < filteredVoicesList.length) {
                      const selectedVoice = filteredVoicesList[voiceIndex];
                      voiceId = selectedVoice.id;
                      isValidVoiceFormat = voiceId && (
                        voiceId.includes('_') && voiceId.includes('-')
                      );
                      
                      log(`[ClipAIble Offscreen] Found voice by index for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        selectedVoiceId: voiceId,
                        selectedVoiceName: selectedVoice.name,
                        selectedVoiceLanguage: selectedVoice.language,
                        selectedVoiceQuality: selectedVoice.quality,
                        isValidVoiceFormat,
                        totalFilteredVoices: filteredVoicesList.length
                      });
                    } else {
                      logWarn(`[ClipAIble Offscreen] Voice index ${voiceIndex} out of range for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        originalVoice: voice,
                        filteredVoicesCount: filteredVoicesList.length,
                        availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                        willTryNameMapping: true,
                        firstFewVoices: filteredVoicesList.slice(0, 5).map(v => ({ id: v.id, name: v.name }))
                      });
                      
                      // CRITICAL: If index is out of range, the saved value is likely invalid
                      // This can happen if:
                      // 1. Index was saved from a different (unfiltered) list
                      // 2. Voice list changed after saving
                      // 3. Index was incorrectly saved instead of voice ID
                      // Solution: Use default voice for the detected language
                      // The user will need to re-select their voice in settings
                      logWarn(`[ClipAIble Offscreen] Index ${voiceIndex} is invalid, using default voice for language ${langCode} for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        originalVoice: voice,
                        langCode,
                        filteredVoicesCount: filteredVoicesList.length
                      });
                      
                      // Use default voice for the language - this is the safest approach
                      // The user's saved index is invalid, so we fall back to language default
                      // The user will need to re-select their preferred voice in settings
                    }
                  } else {
                    // Try to find voice by name in available voices
                    // CRITICAL: availableVoices is Voice[] array, not an object!
                    let foundVoice = null;
                    if (Array.isArray(availableVoices)) {
                      for (const voiceObj of availableVoices) {
                        const voiceKey = voiceObj?.key || '';
                        const voiceName = voiceObj?.name || '';
                        const voiceAliases = voiceObj?.aliases || [];
                        
                        // Check if requested voice matches key, name, or aliases
                        const normalizedRequest = voice.toLowerCase();
                        const normalizedKey = voiceKey.toLowerCase();
                        const normalizedName = voiceName.toLowerCase();
                        
                        if (normalizedKey === normalizedRequest || 
                            normalizedName === normalizedRequest ||
                            normalizedKey.includes(normalizedRequest) ||
                            normalizedName.includes(normalizedRequest) ||
                            voiceAliases.some(alias => alias.toLowerCase() === normalizedRequest)) {
                          foundVoice = { id: voiceKey, name: voiceName, ...voiceObj };
                          break;
                        }
                      }
                    }
                    
                    if (foundVoice && foundVoice.id) {
                      log(`[ClipAIble Offscreen] Found voice by name in library for ${messageId}`, {
                        messageId,
                        requestedVoice: voice,
                        foundVoiceId: foundVoice.id,
                        foundVoiceName: foundVoice.name,
                        foundVoiceAliases: foundVoice.aliases
                      });
                      voiceId = foundVoice.id;
                      isValidVoiceFormat = voiceId && (
                        voiceId.includes('_') || voiceId.includes('-')
                      );
                    } else {
                      log(`[ClipAIble Offscreen] Voice not found by name for ${messageId}`, {
                        messageId,
                        requestedVoice: voice,
                        language,
                        availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                        firstFewVoices: Array.isArray(availableVoices) ? availableVoices.slice(0, 5).map(v => v?.key || v?.id || 'N/A') : []
                      });
                    }
                  }
                }
              }
            } catch (findError) {
              logError(`[ClipAIble Offscreen] Error finding voice by name for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                language,
                error: findError.message,
                errorStack: findError.stack
              });
            }
            
            // If still invalid format after trying to find by name, use default
            if (!isValidVoiceFormat) {
            // Switch to default voice for detected language
            const replacementVoice = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'];
            log(`[ClipAIble Offscreen] Attempting voice replacement for ${messageId}`, {
              messageId,
              langCode,
              replacementVoice,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en']
            });
            
            voiceId = replacementVoice;
            
            // CRITICAL: Double-check voiceId is not undefined after replacement
            if (!voiceId || voiceId === 'undefined' || (typeof voiceId === 'string' && voiceId.trim() === '')) {
              logError(`[ClipAIble Offscreen] CRITICAL: voiceId still undefined after replacement for ${messageId}`, {
                messageId,
                langCode,
                replacementVoice,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en'],
                allDefaultVoices: DEFAULT_VOICES
              });
              voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              log(`[ClipAIble Offscreen] Forced voiceId to English fallback after replacement for ${messageId}`, {
                messageId,
                forcedVoiceId: voiceId
              });
            }
            
            log(`[ClipAIble Offscreen] Voice replaced with default for ${messageId}`, {
              messageId,
              originalVoice: voice,
              newVoice: voiceId,
              reason: `Invalid voice format (expected format: "lang_COUNTRY-name-quality", got: "${voice}")`
            });
            
            // Re-validate format after replacement
            isValidVoiceFormat = voiceId && (
              voiceId.includes('_') || voiceId.includes('-')
            );
            }
          }
          
          // CRITICAL: Validate voice-language compatibility
          // CRITICAL: DO NOT automatically replace user-selected voice
          // User explicitly selected a voice - respect their choice
          // Only log a warning if language mismatch, but do not replace
          if (voiceId && isValidVoiceFormat) {
            // Extract language from voice ID (e.g., "ar_JO-kareem-low" -> "ar")
            const voiceLangCode = voiceId.split('_')[0].toLowerCase();
            
            // If voice language doesn't match detected language, only warn (do not replace)
            if (voiceLangCode !== langCode) {
              logWarn(`[ClipAIble Offscreen] Voice-language mismatch detected for ${messageId} (NOT replacing - using user-selected voice)`, {
                messageId,
                requestedVoice: voice,
                voiceId,
                voiceLanguage: voiceLangCode,
                detectedLanguage: langCode,
                action: 'Keeping user-selected voice despite language mismatch'
              });
              // DO NOT replace voiceId - user explicitly selected it
            } else {
              log(`[ClipAIble Offscreen] Voice-language match confirmed for ${messageId}`, {
                messageId,
                voiceId,
                voiceLanguage: voiceLangCode,
                detectedLanguage: langCode
              });
            }
          }
          
          // CRITICAL: Final validation - ensure voiceId is never undefined before use
          if (!voiceId || !isValidVoiceFormat) {
            logError(`[ClipAIble Offscreen] CRITICAL: voiceId is invalid before download for ${messageId}`, {
              messageId,
              voiceId,
              isValidVoiceFormat,
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES
            });
            // Force fallback to English voice
            voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
            isValidVoiceFormat = true;
            log(`[ClipAIble Offscreen] Forced voiceId to English fallback for ${messageId}`, {
              messageId,
              forcedVoiceId: voiceId
            });
          }
          
          // SPECIAL LOGGING FOR RUSSIAN LANGUAGE
          if (langCode === 'ru') {
            log(`[ClipAIble Offscreen] === RUSSIAN LANGUAGE DETECTED === for ${messageId}`, {
              messageId,
              language,
              langCode,
              voiceId,
              requestedVoice: voice,
              defaultVoiceForRussian: DEFAULT_VOICES['ru'],
              fallbackVoiceForRussian: FALLBACK_VOICES['ru'],
              isValidVoiceFormat,
              voiceIdStartsWithRu: voiceId && voiceId.toLowerCase().startsWith('ru_'),
              allRussianVoices: Object.entries(DEFAULT_VOICES).filter(([lang]) => lang === 'ru'),
              allFallbackVoices: Object.entries(FALLBACK_VOICES).filter(([lang]) => lang === 'ru')
            });
          }
          
          // Log all settings after language detection and voice selection
          // Note: Storage settings will be determined later when processing audio
          const allTtsSettings = {
            messageId,
            timestamp: Date.now(),
            // Language Settings
            language,
            langCode,
            languageDetected: language !== 'auto',
            // Voice Settings
            voiceId,
            requestedVoice: voice,
            voiceSelected: voiceId,
            isDefaultVoice: !voice || voice === '0' || voice === '',
            defaultVoiceForLang: DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'],
            isFallbackVoice,
            // Fallback Configuration
            fallbackAvailable: langCode in FALLBACK_VOICES,
            fallbackVoice: FALLBACK_VOICES[langCode] || null,
            // Default Voices
            defaultVoices: DEFAULT_VOICES
          };
          
          log(`[ClipAIble Offscreen] Voice selected with all settings for ${messageId}`, allTtsSettings);
          
          // CRITICAL: Final validation - ensure voiceId is never undefined before use
          log(`[ClipAIble Offscreen] === FINAL VOICE VALIDATION === for ${messageId}`, {
            messageId,
            voiceId,
            voiceIdType: typeof voiceId,
            voiceIdLength: voiceId ? voiceId.length : 0,
            isValidVoiceFormat,
            langCode,
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en'],
            // Special check for Russian
            isRussian: langCode === 'ru',
            russianDefaultVoice: DEFAULT_VOICES['ru']
          });
          
          // SPECIAL LOGGING FOR RUSSIAN LANGUAGE
          if (langCode === 'ru') {
            log(`[ClipAIble Offscreen] === RUSSIAN LANGUAGE DETECTED === for ${messageId}`, {
              messageId,
              language,
              langCode,
              voiceId,
              requestedVoice: voice,
              defaultVoiceForRussian: DEFAULT_VOICES['ru'],
              fallbackVoiceForRussian: FALLBACK_VOICES['ru'],
              isValidVoiceFormat,
              voiceIdStartsWithRu: voiceId && voiceId.toLowerCase().startsWith('ru_'),
              allRussianVoices: Object.entries(DEFAULT_VOICES).filter(([lang]) => lang === 'ru'),
              allFallbackVoices: Object.entries(FALLBACK_VOICES).filter(([lang]) => lang === 'ru')
            });
          }
          
          if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
            const errorMsg = `Invalid voiceId before download: ${voiceId}`;
            logError(`[ClipAIble Offscreen] ${errorMsg} for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES,
              // Special error logging for Russian
              isRussian: langCode === 'ru',
              russianDefaultVoice: DEFAULT_VOICES['ru']
            });
            throw new Error(errorMsg);
          }
          
          log(`[ClipAIble Offscreen] === VOICE SELECTION COMPLETE === for ${messageId}`, {
            messageId,
            finalVoiceId: voiceId,
            langCode,
            isValidVoiceFormat,
            // Special completion logging for Russian
            isRussian: langCode === 'ru',
            russianVoiceSelected: langCode === 'ru' && voiceId && voiceId.toLowerCase().startsWith('ru_')
          });
          
          // CRITICAL: Declare downloadVoiceId in wider scope so it's available for predict() calls
          let downloadVoiceId = null;
          
          // Check if voice is downloaded
          const storedCheckStart = Date.now();
          // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
          if (!state.getTTSWorker()) {
            await initTTSWorker();
          }
          if (!state.getTTSWorker()) {
            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
          }
          const stored = await getStoredWithWorker();
          const storedCheckDuration = Date.now() - storedCheckStart;
          log(`[ClipAIble Offscreen] Stored voices check for ${messageId}`, {
            messageId,
            storedCount: stored.length,
            voiceId,
            isStored: stored.includes(voiceId),
            duration: storedCheckDuration,
            note: 'Models are stored permanently in IndexedDB - survive extension restarts'
          });
          
          if (!stored.includes(voiceId)) {
            // CRITICAL: Final validation before download - ensure voiceId is valid
            if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
              const errorMsg = `Invalid voiceId before download: ${voiceId}`;
              logError(`[ClipAIble Offscreen] ${errorMsg} for ${messageId}`, {
                messageId,
                voiceId,
                voiceIdType: typeof voiceId,
                langCode,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en'],
                allDefaultVoices: DEFAULT_VOICES
              });
              // Try to use fallback voice
              const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              log(`[ClipAIble Offscreen] Using fallback voice for ${messageId}`, {
                messageId,
                originalVoiceId: voiceId,
                fallbackVoiceId
              });
              voiceId = fallbackVoiceId;
              
              // Final check - if still invalid, throw error
              if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
                throw new Error(`Cannot determine valid voice ID. Language: ${langCode}, Requested voice: ${voice}`);
              }
            }
            
            // CRITICAL: Final check before download - log everything
            log(`[ClipAIble Offscreen] Starting voice download for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              voiceIdLength: voiceId ? voiceId.length : 0,
              voiceIdValue: String(voiceId),
              isValid: voiceId && typeof voiceId === 'string' && voiceId !== 'undefined' && voiceId.trim() !== '',
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en']
            });
            
            // CRITICAL: One more validation right before download
            if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
              logError(`[ClipAIble Offscreen] CRITICAL: voiceId is invalid right before download for ${messageId}`, {
                messageId,
                voiceId,
                voiceIdType: typeof voiceId,
                langCode,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en']
              });
              // Force fallback
              voiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              log(`[ClipAIble Offscreen] Forced voiceId to fallback right before download for ${messageId}`, {
                messageId,
                forcedVoiceId: voiceId
              });
            }
            
            // CRITICAL: Store voiceId in a const to prevent mutation
            // CRITICAL: Log voiceId before assignment to track any changes
            log(`[ClipAIble Offscreen] CRITICAL: voiceId before downloadVoiceId assignment for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              voiceIdValue: String(voiceId),
              requestedVoice: voice,
              langCode
            });
            
            downloadVoiceId = String(voiceId).trim();
            if (!downloadVoiceId || downloadVoiceId === 'undefined') {
              throw new Error(`Cannot download voice: voiceId is invalid (${voiceId}). Language: ${langCode}`);
            }
            
            log(`[ClipAIble Offscreen] Calling tts.download with voiceId: "${downloadVoiceId}" for ${messageId}`, {
              messageId,
              downloadVoiceId,
              downloadVoiceIdType: typeof downloadVoiceId,
              downloadVoiceIdLength: downloadVoiceId.length,
              originalVoiceId: voiceId,
              requestedVoice: voice
            });
            
            // CRITICAL: Check stored voices BEFORE download to compare after
            const storedCheckStart = Date.now();
            log(`[ClipAIble Offscreen] === CHECKING STORED VOICES BEFORE DOWNLOAD ===`, {
              messageId,
              downloadVoiceId,
              useWorker: state.shouldUseWorker(),
              hasTTSWorker: state.hasTTSWorker(),
              timestamp: storedCheckStart
            });
            
            // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                          if (!state.getTTSWorker()) {
                            await initTTSWorker();
                          }
                          if (!state.getTTSWorker()) {
                            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                          }
            const storedBeforeDownload = await getStoredWithWorker();
            const storedCheckDuration = Date.now() - storedCheckStart;
            
            log(`[ClipAIble Offscreen] Stored voices BEFORE download for ${messageId}`, {
              messageId,
              downloadVoiceId,
              storedBeforeDownload,
              storedCount: storedBeforeDownload.length,
              alreadyStored: storedBeforeDownload.includes(downloadVoiceId),
              storedCheckDuration
            });
            
            const downloadStart = Date.now();
            let lastPercent = -1;
            let finalProgress = null;
            
            log(`[ClipAIble Offscreen] === ABOUT TO CALL downloadWithWorker ===`, {
              messageId,
              downloadVoiceId,
              useWorker: state.shouldUseWorker(),
              hasTTSWorker: state.hasTTSWorker(),
              alreadyStored: storedBeforeDownload.includes(downloadVoiceId),
              timestamp: downloadStart
            });
            
            try {
              const downloadResult = state.shouldUseWorker() && state.getTTSWorker() 
                // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                if (!state.getTTSWorker()) {
                  await initTTSWorker();
                }
                if (!state.getTTSWorker()) {
                  throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                }
                await downloadWithWorker(downloadVoiceId, (progress) => {
                  finalProgress = progress;
                  if (progress.total > 0) {
                    const percent = Math.round((progress.loaded * 100) / progress.total);
                    if (percent >= lastPercent + 10 || percent === 100) {
                      log(`[ClipAIble Offscreen] Download progress for ${messageId}`, {
                        messageId,
                        voiceId: downloadVoiceId,
                        percent,
                        loaded: progress.loaded,
                        total: progress.total
                      });
                      lastPercent = percent;
                    }
                    if (progress.loaded >= progress.total && progress.total > 0) {
                      downloadComplete = true;
                    }
                  }
                });
              
              const downloadDuration = Date.now() - downloadStart;
              log(`[ClipAIble Offscreen] Voice download complete for ${messageId}`, {
                messageId,
                voiceId: downloadVoiceId,
                duration: downloadDuration,
                downloadResult: downloadResult,
                downloadResultType: typeof downloadResult,
                finalProgress: finalProgress,
                finalProgressLoaded: finalProgress?.loaded,
                finalProgressTotal: finalProgress?.total
              });
              
              // CRITICAL: Check stored voices IMMEDIATELY after download() resolves
              // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                          if (!state.getTTSWorker()) {
                            await initTTSWorker();
                          }
                          if (!state.getTTSWorker()) {
                            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                          }
              const storedImmediatelyAfter = await getStoredWithWorker();
              log(`[ClipAIble Offscreen] Stored voices IMMEDIATELY after download() resolved for ${messageId}`, {
                messageId,
                downloadVoiceId,
                storedImmediatelyAfter,
                storedCount: storedImmediatelyAfter.length,
                foundImmediately: storedImmediatelyAfter.includes(downloadVoiceId),
                newVoices: storedImmediatelyAfter.filter(v => !storedBeforeDownload.includes(v)),
                removedVoices: storedBeforeDownload.filter(v => !storedImmediatelyAfter.includes(v))
              });
              // CRITICAL: Update voiceId variable after successful download
              // This ensures voiceId is always valid for subsequent predict() calls
              voiceId = downloadVoiceId;
              
              // CRITICAL: Verify voice is actually stored after download
              // IndexedDB operations are async - model may not appear immediately
              // Retry verification with delays to allow IndexedDB to complete
              let isActuallyStored = false;
              let verifyStored = [];
              const maxVerificationAttempts = 10; // Increased to 10 attempts
              const verificationDelay = 1000; // Increased to 1000ms between attempts
              
              for (let attempt = 1; attempt <= maxVerificationAttempts; attempt++) {
                // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                          if (!state.getTTSWorker()) {
                            await initTTSWorker();
                          }
                          if (!state.getTTSWorker()) {
                            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                          }
                verifyStored = await getStoredWithWorker();
                isActuallyStored = verifyStored.includes(downloadVoiceId);
                
                // CRITICAL: Check for partial matches (maybe voice is stored with different format)
                const partialMatches = verifyStored.filter(v => 
                  v.includes(downloadVoiceId.split('-')[0]) || // Match language code
                  v.includes(downloadVoiceId.split('-')[1]) || // Match voice name
                  downloadVoiceId.includes(v.split('-')[0]) || // Reverse match
                  downloadVoiceId.includes(v.split('-')[1])
                );
                
                log(`[ClipAIble Offscreen] Voice storage verification attempt ${attempt}/${maxVerificationAttempts} for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  isActuallyStored,
                  storedVoices: verifyStored,
                  storedCount: verifyStored.length,
                  attempt,
                  partialMatches: partialMatches.length > 0 ? partialMatches : null,
                  allStoredVoicesDetails: verifyStored.map(v => ({
                    voice: v,
                    matchesDownloadId: v === downloadVoiceId,
                    containsDownloadId: v.includes(downloadVoiceId),
                    downloadIdContainsVoice: downloadVoiceId.includes(v)
                  }))
                });
                
                if (isActuallyStored) {
                  log(`[ClipAIble Offscreen] Voice ${downloadVoiceId} found in storage after ${attempt} attempt(s) for ${messageId}`, {
                    messageId,
                    downloadVoiceId,
                    attempt
                  });
                  break;
                }
                
                if (attempt < maxVerificationAttempts) {
                  log(`[ClipAIble Offscreen] Voice ${downloadVoiceId} not found yet, waiting ${verificationDelay}ms before retry for ${messageId}`, {
                    messageId,
                    downloadVoiceId,
                    attempt,
                    nextAttempt: attempt + 1,
                    storedVoices: verifyStored
                  });
                  await new Promise(resolve => setTimeout(resolve, verificationDelay));
                }
              }
              
              if (!isActuallyStored) {
                // CRITICAL: Detailed error with all information to understand what went wrong
                const errorDetails = {
                  messageId,
                  downloadVoiceId,
                  storedVoices: verifyStored,
                  storedCount: verifyStored.length,
                  attempts: maxVerificationAttempts,
                  storedBeforeDownload,
                  storedImmediatelyAfter,
                  downloadResult,
                  finalProgress,
                  downloadDuration: Date.now() - downloadStart
                };
                
                logError(`[ClipAIble Offscreen] CRITICAL: Voice ${downloadVoiceId} not found in stored voices after ${maxVerificationAttempts} attempts for ${messageId}`, errorDetails);
                
                // Throw detailed error without fallback - user needs to see what's wrong
                throw new Error(
                  `Voice "${downloadVoiceId}" was not properly stored after download. ` +
                  `Download completed but voice not found in storage after ${maxVerificationAttempts} attempts. ` +
                  `Stored voices: ${verifyStored.join(', ')}. ` +
                  `This indicates a problem with the Piper TTS library's download() or stored() functions. ` +
                  `Check browser console for detailed logs.`
                );
              }
              
              // CRITICAL: Wait for model to be fully loaded and indexed in IndexedDB
              // This prevents "No graph was found in the protobuf" errors
              log(`[ClipAIble Offscreen] Waiting for model to be fully indexed after download for ${messageId}`, {
                messageId,
                downloadVoiceId
              });
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for IndexedDB to complete
              
              // CRITICAL: Test model integrity by attempting a minimal predict() call
              // This catches corrupted models before they cause errors during actual synthesis
              try {
                log(`[ClipAIble Offscreen] Testing model integrity for ${messageId}`, {
                  messageId,
                  downloadVoiceId
                });
                // CRITICAL: Use Worker for integrity test - no direct tts.predict() calls
                // This ensures all TTS operations go through Worker as per architecture contract
                if (!state.shouldUseWorker() || !state.getTTSWorker()) {
                  await initTTSWorker();
                }
                const testBlob = await predictWithWorker('test', downloadVoiceId);
                if (!testBlob || testBlob.size === 0) {
                  throw new Error('Model integrity test failed: empty result');
                }
                log(`[ClipAIble Offscreen] Model integrity test passed for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  testBlobSize: testBlob.size
                });
              } catch (integrityError) {
                logError(`[ClipAIble Offscreen] CRITICAL: Model integrity test failed for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  error: integrityError.message,
                  errorName: integrityError.name
                });
                // Remove corrupted model and re-download
                if (state.shouldUseWorker() && state.getTTSWorker()) {
                  try {
                    await removeWithWorker(downloadVoiceId);
                    log(`[ClipAIble Offscreen] Removed corrupted model ${downloadVoiceId} after integrity test failure`, {
                      messageId,
                      downloadVoiceId
                    });
                    // Re-download the model
                    await downloadWithWorker(downloadVoiceId);
                    log(`[ClipAIble Offscreen] Re-downloaded model ${downloadVoiceId} after integrity test failure`, {
                      messageId,
                      downloadVoiceId
                    });
                  } catch (recoveryError) {
                    logError(`[ClipAIble Offscreen] Failed to recover from integrity test failure for ${messageId}`, {
                      messageId,
                      downloadVoiceId,
                      recoveryError: recoveryError.message
                    });
                    throw new Error(`Model integrity test failed and recovery failed: ${integrityError.message}`);
                  }
                } else {
                  throw new Error(`Model integrity test failed: ${integrityError.message}`);
                }
              }
            } catch (downloadError) {
              logError(`[ClipAIble Offscreen] Voice download failed for ${messageId}`, {
                messageId,
                voiceId: downloadVoiceId,
                originalVoiceId: voiceId,
                error: downloadError.message,
                errorName: downloadError.name,
                errorStack: downloadError.stack
              });
              
              // Handle JSON parsing errors from HuggingFace 404 responses
              const isJsonParseError = downloadError.message && (
                downloadError.message.includes('Unexpected token') ||
                downloadError.message.includes('is not valid JSON') ||
                downloadError.message.includes('JSON.parse')
              );
              
              // Handle "Entry not found" errors (404 from HuggingFace)
              const isEntryNotFound = downloadError.message && (
                downloadError.message.includes('Entry not found') ||
                downloadError.message.includes('404') ||
                downloadError.message.includes('not found')
              );
              
              if (isJsonParseError || isEntryNotFound) {
                const errorMsg = `Voice "${downloadVoiceId}" not found on HuggingFace. The voice ID may be invalid or the voice may have been removed. Please select a valid voice from the list.`;
                logError(`[ClipAIble Offscreen] Voice not found error for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  originalVoiceId: voiceId,
                  errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                  originalError: downloadError.message
                });
                throw new Error(errorMsg);
              }
              
              // Re-throw other download errors
              throw downloadError;
            }
          } else {
            // Voice is already stored, use current voiceId
            downloadVoiceId = voiceId;
          }
          
          // CRITICAL: Ensure downloadVoiceId is set before predict() calls
          if (!downloadVoiceId) {
            downloadVoiceId = voiceId;
          }
          
          // CRITICAL: Final validation of downloadVoiceId before synthesis
          if (!downloadVoiceId || typeof downloadVoiceId !== 'string' || downloadVoiceId === 'undefined' || downloadVoiceId.trim() === '') {
            throw new Error(`Invalid downloadVoiceId before synthesis: ${downloadVoiceId}. Original voiceId: ${voiceId}, Language: ${langCode}`);
          }
          
          // CRITICAL: Smart voice switching - ensure library uses correct voice
          // Models are stored in IndexedDB permanently (survive extension restarts)
          // But library may cache InferenceSession per voice, so we need to force switch
          // CRITICAL: Use downloadVoiceId as primary source (it's the actual voice that will be used)
          // voiceId might be undefined or incorrect, so always prefer downloadVoiceId
          const finalVoiceId = downloadVoiceId || voiceId;
          
          // CRITICAL: Log voice state BEFORE checking for voice change
          log(`[ClipAIble Offscreen] === VOICE CHECK BEFORE SYNTHESIS === for ${messageId}`, {
            messageId,
            voiceId,
            downloadVoiceId,
            finalVoiceId,
            lastUsedVoiceId: state.getLastUsedVoiceId(),
            lastUsedVoiceIdType: typeof state.getLastUsedVoiceId(),
            finalVoiceIdType: typeof finalVoiceId,
            areEqual: state.getLastUsedVoiceId() === finalVoiceId,
            lastUsedVoiceIdIsNull: state.getLastUsedVoiceId() === null,
            finalVoiceIdIsNull: finalVoiceId === null,
            willDetectChange: state.getLastUsedVoiceId() !== null && state.getLastUsedVoiceId() !== finalVoiceId && finalVoiceId !== null
          });
          
          // CRITICAL: Check voice change BEFORE synthesis starts
          // Compare against lastUsedVoiceId BEFORE updating it
          const voiceChanged = state.getLastUsedVoiceId() !== null && state.getLastUsedVoiceId() !== finalVoiceId && finalVoiceId !== null;
          
          // CRITICAL: Update lastUsedVoiceId IMMEDIATELY after determining finalVoiceId
          // This ensures that if another request comes in with the same voice, it won't trigger cache clearing
          // But we must do this AFTER checking voiceChanged, so the check uses the OLD value
          const previousVoiceId = state.getLastUsedVoiceId();
          state.setLastUsedVoiceId(finalVoiceId);
          
          // Log voice change check result
          log(`[ClipAIble Offscreen] === VOICE CHANGE CHECK RESULT === for ${messageId}`, {
            messageId,
            previousVoiceId,
            finalVoiceId,
            voiceChanged,
            lastUsedVoiceIdAfterUpdate: state.getLastUsedVoiceId(),
            willClearCache: voiceChanged
          });
          
          if (voiceChanged) {
            log(`[ClipAIble Offscreen] ===== VOICE SWITCHING DETECTED ===== for ${messageId}`, {
              messageId,
              previousVoice: previousVoiceId,
              newVoice: finalVoiceId,
              action: 'AGGRESSIVE CACHE CLEARING - forcing complete module reload'
            });
            
            // CRITICAL: AGGRESSIVE CACHE CLEARING
            // The library caches InferenceSession internally, so we need to completely destroy and recreate everything
            log(`[ClipAIble Offscreen] === AGGRESSIVE CACHE CLEARING START ===`, {
              messageId,
              previousVoice: previousVoiceId,
              newVoice: finalVoiceId,
              action: 'Clearing ALL caches and forcing complete reload'
            });
            
            // Step 1: CRITICAL - Clear TtsSession singleton instance
            // The library uses TtsSession._instance singleton which caches the session
            // We MUST clear it to force creation of new session with new voice
            // According to library source: TtsSession uses singleton pattern
            // When voice changes, we need to clear _instance to force new session creation
            let singletonCleared = false;
            try {
              // Try to access TtsSession from the module
              // The module exports TtsSession class which has static _instance property
              if (tts && tts.TtsSession) {
                const hadInstance = tts.TtsSession._instance !== null && tts.TtsSession._instance !== undefined;
                const instanceVoiceId = tts.TtsSession._instance?.voiceId;
                
                log(`[ClipAIble Offscreen] === CLEARING TtsSession._instance SINGLETON ===`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  hasTtsSession: true,
                  hadInstance: hadInstance,
                  instanceVoiceId: instanceVoiceId,
                  action: 'Clearing singleton to force new session creation'
                });
                
                // Clear the singleton instance to force new session creation
                // This is the KEY fix - library reuses _instance even when voiceId changes
                tts.TtsSession._instance = null;
                singletonCleared = true;
                
                log(`[ClipAIble Offscreen] ✅ TtsSession._instance cleared successfully (SINGLETON CLEARED)`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  instanceIsNull: tts.TtsSession._instance === null,
                  mechanism: 'singleton_clear',
                  willCreateNewSession: true
                });
              } else {
                // TtsSession might not be exported, try to access it differently
                // The predict() function creates TtsSession internally, so we need to clear it before next predict()
                log(`[ClipAIble Offscreen] ⚠️ TtsSession not directly accessible, will clear via module reload`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  hasTts: !!tts,
                  ttsKeys: tts ? Object.keys(tts).slice(0, 20) : [],
                  mechanism: 'module_reload',
                  note: 'Module reload should clear singleton'
                });
              }
            } catch (clearError) {
              logWarn(`[ClipAIble Offscreen] ⚠️ Error clearing TtsSession._instance`, {
                messageId,
                previousVoice: previousVoiceId,
                newVoice: finalVoiceId,
                error: clearError.message,
                mechanism: 'module_reload_fallback',
                note: 'Will rely on module reload to clear singleton'
              });
            }
            
            // Step 2: Clear module cache completely
            state.setTTSModule(null);
            
            // Step 3: Force complete module reload
            log(`[ClipAIble Offscreen] 🔄 Forcing complete module reload`, {
              messageId,
              previousVoice: previousVoiceId,
              newVoice: finalVoiceId,
              mechanism: 'module_reload',
              singletonCleared: singletonCleared
            });
            
            let moduleReloaded = false;
            try {
              // Re-initialize to get completely fresh module instance
              // This should create a new InferenceSession with no cached state
              const freshTts = await initPiperTTS();
              
              // Verify we got a fresh instance
              if (freshTts && typeof freshTts.predict === 'function') {
                moduleReloaded = true;
                log(`[ClipAIble Offscreen] ✅ Module reloaded successfully (MODULE RELOADED)`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  hasPredict: typeof freshTts.predict === 'function',
                  hasStored: typeof freshTts.stored === 'function',
                  mechanism: 'module_reload',
                  note: 'Fresh module instance created - ALL caches cleared, will use new voice'
                });
                
                // CRITICAL: Update tts reference to use fresh instance
                // This ensures all subsequent predict() calls use the new module instance
                tts = freshTts;
                
                log(`[ClipAIble Offscreen] TTS reference updated to fresh instance after aggressive cache clear`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  ttsIsFresh: tts === freshTts
                });
              } else {
                logError(`[ClipAIble Offscreen] ❌ Module reload failed - invalid module`, {
                  messageId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  hasTts: !!freshTts,
                  hasPredict: freshTts && typeof freshTts.predict === 'function',
                  action: 'Module reload failed - voice switching may not work'
                });
              }
            } catch (reinitError) {
              logError(`[ClipAIble Offscreen] ❌ Module reload error`, {
                messageId,
                previousVoice: previousVoiceId,
                newVoice: finalVoiceId,
                error: reinitError.message,
                stack: reinitError.stack,
                action: 'Module reload failed - voice switching may not work'
              });
            }
            
            log(`[ClipAIble Offscreen] === AGGRESSIVE CACHE CLEARING COMPLETE ===`, {
              messageId,
              previousVoice: previousVoiceId,
              newVoice: finalVoiceId,
              mechanisms: {
                singletonCleared: singletonCleared,
                moduleReloaded: moduleReloaded
              },
              note: 'All caches cleared, module reloaded - synthesis will use new voice. Singleton clear + module reload is sufficient for voice switching.'
            });
            
            // CRITICAL: Also clear Worker cache if using Worker
            // Must clear BEFORE first PREDICT with new voice to ensure new session is created
            log(`[ClipAIble Offscreen] === CHECKING WORKER CACHE CLEAR === for ${messageId}`, {
              messageId,
              previousVoice: previousVoiceId,
              newVoice: finalVoiceId,
              useWorker: state.shouldUseWorker(),
              hasTtsWorker: state.hasTTSWorker(),
              ttsWorkerType: typeof state.getTTSWorker(),
              willClearWorkerCache: state.shouldUseWorker() && state.getTTSWorker(),
              CRITICAL: 'Worker cache MUST be cleared before synthesis with new voice'
            });
            
            if (state.shouldUseWorker() && state.getTTSWorker()) {
              try {
                // Send CLEAR_CACHE message to Worker and wait for confirmation
                // This ensures Worker clears its TtsSession._instance before creating new session
                const clearCacheId = `clear_${messageId}_${Date.now()}`;
                log(`[ClipAIble Offscreen] === PREPARING CLEAR_CACHE MESSAGE === for ${messageId}`, {
                  messageId,
                  clearCacheId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  useWorker: state.shouldUseWorker(),
                  hasTtsWorker: state.hasTTSWorker(),
                  action: 'Creating Promise to wait for CLEAR_CACHE_SUCCESS'
                });
                
                const clearCachePromise = new Promise((resolve, reject) => {
                  let timeout = setTimeout(() => {
                    logError(`[ClipAIble Offscreen] ❌ CLEAR_CACHE timeout for ${messageId}`, {
                      messageId,
                      clearCacheId,
                      timeout: 5000,
                      action: 'Worker did not respond to CLEAR_CACHE within 5 seconds'
                    });
                    // Cleanup handler before rejecting
                    state.getTTSWorker().removeEventListener('message', handler);
                    timeout = null;
                    reject(new Error('CLEAR_CACHE timeout'));
                  }, 5000);
                  
                  const handler = (event) => {
                    log(`[ClipAIble Offscreen] === CLEAR_CACHE RESPONSE RECEIVED === for ${messageId}`, {
                      messageId,
                      clearCacheId,
                      eventType: event.data?.type,
                      eventId: event.data?.id,
                      matches: event.data && event.data.type === 'CLEAR_CACHE_SUCCESS' && event.data.id === clearCacheId,
                      fullEvent: event.data
                    });
                    
                    if (event.data && event.data.type === 'CLEAR_CACHE_SUCCESS' && event.data.id === clearCacheId) {
                      if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                      }
                      state.getTTSWorker().removeEventListener('message', handler);
                      log(`[ClipAIble Offscreen] ✅ CLEAR_CACHE_SUCCESS matched for ${messageId}`, {
                        messageId,
                        clearCacheId,
                        action: 'Resolving Promise - Worker cache cleared'
                      });
                      resolve();
                    }
                  };
              
              state.getTTSWorker().addEventListener('message', handler);
                  log(`[ClipAIble Offscreen] === CLEAR_CACHE LISTENER ADDED === for ${messageId}`, {
                    messageId,
                    clearCacheId,
                    action: 'Added event listener for CLEAR_CACHE_SUCCESS'
                  });
                });
                
                log(`[ClipAIble Offscreen] === SENDING CLEAR_CACHE TO WORKER === for ${messageId}`, {
                  messageId,
                  clearCacheId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  useWorker: state.shouldUseWorker(),
                  hasTtsWorker: state.hasTTSWorker(),
                  ttsWorkerType: typeof state.getTTSWorker(),
                  action: 'postMessage({ type: "CLEAR_CACHE", id: clearCacheId })'
                });
                
                state.getTTSWorker().postMessage({ type: 'CLEAR_CACHE', id: clearCacheId });
                log(`[ClipAIble Offscreen] ✅ Sent CLEAR_CACHE to Worker for voice switch`, {
                  messageId,
                  clearCacheId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  action: 'Waiting for Worker to clear cache before synthesis'
                });
                
                // Wait for Worker to confirm cache is cleared
                await clearCachePromise;
                log(`[ClipAIble Offscreen] ✅ Worker cache cleared confirmed`, {
                  messageId,
                  clearCacheId,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  action: 'Worker confirmed cache cleared - safe to start synthesis with new voice'
                });
              } catch (workerError) {
                logError(`[ClipAIble Offscreen] ❌ Failed to clear Worker cache`, {
                  messageId,
                  error: workerError.message,
                  stack: workerError.stack,
                  previousVoice: previousVoiceId,
                  newVoice: finalVoiceId,
                  action: 'Continuing anyway - Worker may still have old session cached',
                  CRITICAL: 'This may cause wrong voice to be used!'
                });
              }
            } else {
              logWarn(`[ClipAIble Offscreen] ⚠️ Cannot clear Worker cache - Worker not available`, {
                messageId,
                previousVoice: previousVoiceId,
                newVoice: finalVoiceId,
                useWorker: state.shouldUseWorker(),
                hasTtsWorker: state.hasTTSWorker(),
                ttsWorkerType: typeof state.getTTSWorker(),
                CRITICAL: 'Worker cache will NOT be cleared - wrong voice may be used!',
                action: 'Worker should be initialized before voice switching'
              });
            }
          } else {
            // No voice change - log for debugging
            log(`[ClipAIble Offscreen] No voice change detected for ${messageId}`, {
              messageId,
              lastUsedVoiceId: previousVoiceId,
              currentVoice: finalVoiceId,
              voiceChanged: false,
              note: 'Using same voice as previous request - no cache clearing needed'
            });
          }
          
          // Note: lastUsedVoiceId was already updated above, before voice change check
          
          log(`[ClipAIble Offscreen] === VOICE TRACKING UPDATED === for ${messageId}`, {
            messageId,
            currentVoice: finalVoiceId,
            VOICE_STRING: `VOICE="${finalVoiceId}"`, // Explicit string for visibility
            voiceChanged: voiceChanged,
            previousVoice: voiceChanged ? previousVoiceId : null,
            note: 'Voice tracking updated - synthesis will use this voice. Models are stored permanently in IndexedDB.'
          });
          
          log(`[ClipAIble Offscreen] === VOICE READY FOR SYNTHESIS === for ${messageId}`, {
            messageId,
            voiceId,
            downloadVoiceId,
            langCode,
            isStored: stored.includes(voiceId || downloadVoiceId),
            requestedVoice: voice,
            finalVoiceId: finalVoiceId,
            voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown'),
            voiceChanged: voiceChanged,
            previousVoice: voiceChanged ? previousVoiceId : null
          });
          
          // Sanitize text for Piper TTS
          // Piper TTS uses espeak-ng phonemizer which may fail on certain characters
          // CRITICAL: Aggressive sanitization to prevent phoneme index errors
          // The error "idx=141 must be within the inclusive range [-130,129]" indicates
          // that the phonemizer generated an invalid token index, likely due to unsupported characters
          
          // Log before sanitization
          const beforeSanitization = {
            length: text.length,
            nonAsciiCount: (text.match(/[^\x00-\x7F]/g) || []).length,
            controlCharsCount: (text.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length,
            zeroWidthCount: (text.match(/[\u200B-\u200D\uFEFF]/g) || []).length,
            typographicQuotes: (text.match(/[""]/g) || []).length,
            typographicDashes: (text.match(/[—–]/g) || []).length,
            preview: text.substring(0, 200),
            end: '...' + text.substring(Math.max(0, text.length - 100))
          };
          
          log(`[ClipAIble Offscreen] === TEXT SANITIZATION START === for ${messageId}`, {
            messageId,
            beforeSanitization
          });
          
          let sanitizedText = text
            // Remove zero-width characters
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Replace non-breaking spaces with regular spaces
            .replace(/\u00A0/g, ' ')
            // Normalize typographic quotes (smart quotes to regular quotes)
            .replace(/[""]/g, '"')  // Left/right double quotes to regular quote
            .replace(/['']/g, "'")  // Left/right single quotes to apostrophe
            // Normalize typographic dashes
            .replace(/—/g, ' - ')   // Em dash to hyphen with spaces
            .replace(/–/g, '-')     // En dash to hyphen
            // Remove control characters except newlines and tabs
            .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
            // Remove other problematic Unicode characters that may cause phoneme errors
            // Remove mathematical symbols, arrows, and other special symbols
            .replace(/[←→↑↓↔↕⇐⇒⇑⇓⇔⇕]/g, '')  // Arrows
            .replace(/[•◦▪▫]/g, ' ')  // Bullets to space
            .replace(/[©®™]/g, '')  // Copyright symbols
            .replace(/[€£¥]/g, '')  // Currency symbols (keep $ as it's common)
            .replace(/[°±×÷]/g, '')  // Math symbols
            .replace(/[…]/g, '...')  // Ellipsis to three dots
            // Normalize whitespace (but preserve paragraph breaks)
            .replace(/[ \t]+/g, ' ')  // Multiple spaces/tabs to single space
            .replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double newline
            .trim();
          
          // Additional aggressive sanitization: remove any remaining problematic characters
          // Keep only printable ASCII + common punctuation + newlines for English text
          // For non-English, we'll be more permissive but still remove clearly problematic chars
          if (langCode === 'en') {
            // For English, be very strict - only allow ASCII printable + newlines
            sanitizedText = sanitizedText
              .split('')
              .map(char => {
                const code = char.charCodeAt(0);
                // Allow: ASCII printable (32-126), newline (10), tab (9)
                if ((code >= 32 && code <= 126) || code === 10 || code === 9) {
                  return char;
                }
                // Replace with space for other characters
                return ' ';
              })
              .join('')
              .replace(/[ \t]+/g, ' ')  // Normalize spaces again
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          } else {
            // For non-English, remove only clearly problematic characters
            // Keep most Unicode letters and common punctuation
            // Special handling for Ukrainian: preserve all Cyrillic letters including і, ї, є, ґ
            const beforeFinalSanitization = sanitizedText;
            sanitizedText = sanitizedText
              .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\t]/gu, ' ')  // Keep letters, numbers, punctuation, whitespace
              .replace(/[ \t]+/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            
            // Log detailed info for Ukrainian language to debug issues
            if (langCode === 'uk') {
              const ukrainianChars = (beforeFinalSanitization.match(/[іїєґІЇЄҐ]/g) || []).length;
              const ukrainianCharsAfter = (sanitizedText.match(/[іїєґІЇЄҐ]/g) || []).length;
              const removedChars = beforeFinalSanitization.length - sanitizedText.length;
              if (ukrainianChars > 0 || removedChars > 0) {
                // Use JSON.stringify to ensure all values are visible in logs
                log(`[ClipAIble Offscreen] === UKRAINIAN TEXT SANITIZATION === for ${messageId}`, JSON.stringify({
                  messageId,
                  langCode,
                  originalLength: text.length,
                  beforeFinalSanitizationLength: beforeFinalSanitization.length,
                  afterSanitizationLength: sanitizedText.length,
                  ukrainianCharsBefore: ukrainianChars,
                  ukrainianCharsAfter: ukrainianCharsAfter,
                  removedChars: removedChars,
                  ukrainianCharsLost: ukrainianChars - ukrainianCharsAfter,
                  preview: sanitizedText.substring(0, 200),
                  previewEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 100)),
                  // Sample of Ukrainian chars before and after
                  sampleUkrainianBefore: (beforeFinalSanitization.match(/[іїєґІЇЄҐ]/g) || []).slice(0, 20),
                  sampleUkrainianAfter: (sanitizedText.match(/[іїєґІЇЄҐ]/g) || []).slice(0, 20)
                }, null, 2));
              }
            }
          }
          
          // Log after sanitization
          const afterSanitization = {
            length: sanitizedText.length,
            nonAsciiCount: (sanitizedText.match(/[^\x00-\x7F]/g) || []).length,
            controlCharsCount: (sanitizedText.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length,
            zeroWidthCount: (sanitizedText.match(/[\u200B-\u200D\uFEFF]/g) || []).length,
            typographicQuotes: (sanitizedText.match(/[""]/g) || []).length,
            typographicDashes: (sanitizedText.match(/[—–]/g) || []).length,
            preview: sanitizedText.substring(0, 200),
            end: '...' + sanitizedText.substring(Math.max(0, sanitizedText.length - 100)),
            lengthChange: sanitizedText.length - text.length,
            lengthChangePercent: Math.round(((sanitizedText.length - text.length) / text.length) * 100)
          };
          
          log(`[ClipAIble Offscreen] === TEXT SANITIZATION COMPLETE === for ${messageId}`, {
            messageId,
            afterSanitization,
            sanitizationChanges: {
              lengthReduction: text.length - sanitizedText.length,
              nonAsciiRemoved: beforeSanitization.nonAsciiCount - afterSanitization.nonAsciiCount,
              controlCharsRemoved: beforeSanitization.controlCharsCount - afterSanitization.controlCharsCount,
              zeroWidthRemoved: beforeSanitization.zeroWidthCount - afterSanitization.zeroWidthCount,
              typographicQuotesRemoved: beforeSanitization.typographicQuotes - afterSanitization.typographicQuotes,
              typographicDashesRemoved: beforeSanitization.typographicDashes - afterSanitization.typographicDashes
            }
          });
          
          // Log detailed text analysis for debugging phoneme errors
          const nonAsciiChars = sanitizedText.match(/[^\x00-\x7F]/g) || [];
          const uniqueNonAscii = [...new Set(nonAsciiChars)];
          const hasTypographicQuotes = /[""]/.test(sanitizedText);
          const hasEmDash = /—/.test(sanitizedText);
          const hasEnDash = /–/.test(sanitizedText);
          
          log(`[ClipAIble Offscreen] Starting speech generation for ${messageId}`, {
            messageId,
            voiceId,
            originalTextLength: text.length,
            sanitizedTextLength: sanitizedText.length,
            textPreview: sanitizedText.substring(0, 300),
            textEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 150)),
            nonAsciiCount: nonAsciiChars.length,
            uniqueNonAsciiChars: uniqueNonAscii.slice(0, 20), // First 20 unique non-ASCII chars
            hasTypographicQuotes,
            hasEmDash,
            hasEnDash,
            firstChars: Array.from(sanitizedText.substring(0, 50)).map(c => `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
          });
          
          if (sanitizedText.length === 0) {
            throw new Error('Text is empty after sanitization');
          }
          
          // Memory monitoring function
          const checkMemory = () => {
            if (performance.memory) {
              const used = performance.memory.usedJSHeapSize / 1024 / 1024;
              const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
              const usage = used / limit;
              
              log(`[ClipAIble Offscreen] Memory check for ${messageId}`, {
                messageId,
                usedMB: used.toFixed(2),
                limitMB: limit.toFixed(2),
                usagePercent: (usage * 100).toFixed(1)
              });
              
              if (usage > 0.9) {
                logWarn(`[ClipAIble Offscreen] Memory usage critical (>90%) for ${messageId}`, {
                  messageId,
                  usagePercent: (usage * 100).toFixed(1)
                });
                return false;
              }
            }
            return true;
          };
          
          // Streaming inference: split text into sentences for lower peak memory
          // Perplexity recommendation: process sentence by sentence to reduce memory pressure
          // CRITICAL: Split long sentences into smaller phrases to prevent Long Tasks
          // This reduces processing time per chunk and allows more frequent yields
          const MAX_SENTENCE_LENGTH = 200; // Maximum characters per sentence/phrase
          
          const splitIntoSentences = (text) => {
            // Split by sentence endings, but keep punctuation with sentence
            // For Ukrainian, also handle ellipsis (...) and other punctuation
            let sentences = text.match(/[^.!?…]+[.!?…]+/g) || [text];
            // Filter out empty sentences
            sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);
            
            // CRITICAL: Split long sentences into smaller phrases to prevent Long Tasks
            // This reduces processing time per chunk and allows more frequent yields
            const splitLongSentences = (sentence) => {
              if (sentence.length <= MAX_SENTENCE_LENGTH) {
                return [sentence];
              }
              
              // Split long sentences by commas, semicolons, or other natural breaks
              const phrases = sentence.split(/([,;:]\s+)/);
              const result = [];
              let currentPhrase = '';
              
              for (let i = 0; i < phrases.length; i++) {
                const phrase = phrases[i];
                if ((currentPhrase + phrase).length <= MAX_SENTENCE_LENGTH) {
                  currentPhrase += phrase;
                } else {
                  if (currentPhrase.trim()) {
                    result.push(currentPhrase.trim());
                  }
                  currentPhrase = phrase;
                }
              }
              
              if (currentPhrase.trim()) {
                result.push(currentPhrase.trim());
              }
              
              // If still too long, split by spaces (last resort)
              const finalResult = [];
              for (const phrase of result) {
                if (phrase.length <= MAX_SENTENCE_LENGTH) {
                  finalResult.push(phrase);
                } else {
                  // Split by spaces
                  const words = phrase.split(/\s+/);
                  let currentChunk = '';
                  for (const word of words) {
                    if ((currentChunk + ' ' + word).length <= MAX_SENTENCE_LENGTH) {
                      currentChunk = currentChunk ? currentChunk + ' ' + word : word;
                    } else {
                      if (currentChunk) {
                        finalResult.push(currentChunk);
                      }
                      currentChunk = word;
                    }
                  }
                  if (currentChunk) {
                    finalResult.push(currentChunk);
                  }
                }
              }
              
              return finalResult.length > 0 ? finalResult : [sentence];
            };
            
            // Split all long sentences
            const finalSentences = [];
            for (const sentence of sentences) {
              finalSentences.push(...splitLongSentences(sentence));
            }
            
            return finalSentences;
          };
          
          const sentences = splitIntoSentences(sanitizedText);
          let useStreaming = sentences.length > 1 && sanitizedText.length > 2000; // Use streaming for long texts
          
          const splitLogData = {
            messageId,
            totalLength: sanitizedText.length,
            sentencesCount: sentences.length,
            useStreaming,
            avgSentenceLength: sentences.length > 0 ? Math.round(sanitizedText.length / sentences.length) : 0
          };
          
          // For Ukrainian, log first few sentences to check if splitting is correct
          if (langCode === 'uk') {
            splitLogData.firstSentences = sentences.slice(0, 5).map((s, i) => ({
              index: i + 1,
              length: s.length,
              text: s.substring(0, 100) + (s.length > 100 ? '...' : ''),
              ukrainianChars: (s.match(/[іїєґІЇЄҐ]/g) || []).length
            }));
            splitLogData.allSentencesPreview = sentences.map((s, i) => ({
              index: i + 1,
              length: s.length,
              preview: s.substring(0, 50) + '...'
            }));
          }
          
          log(`[ClipAIble Offscreen] Text splitting for ${messageId}`, splitLogData);
          
          const synthesisStart = Date.now();
          let lastPercent = -1;
          
          // Try synthesis with current voice, fallback to alternative voice on phoneme error
          // Also handle model corruption errors with retry after cache cleanup
          let wavBlob;
          let retryCount = 0;
          const maxRetries = 2;
          
          while (retryCount <= maxRetries) {
            try {
              // Check memory before synthesis
              if (!checkMemory()) {
                logWarn(`[ClipAIble Offscreen] Memory check failed, using streaming mode for ${messageId}`, {
                  messageId
                });
                // Force streaming if memory is high
                useStreaming = true;
              }
              
              if (useStreaming && sentences.length > 1) {
                // Streaming mode: process sentences one by one
                log(`[ClipAIble Offscreen] Using streaming inference for ${messageId}`, {
                  messageId,
                  sentencesCount: sentences.length
                });
                
                const audioChunks = [];
                
                for (let i = 0; i < sentences.length; i++) {
                  const sentence = sentences[i];
                  const sentenceIndex = i + 1;
                  
                  log(`[ClipAIble Offscreen] Processing sentence ${sentenceIndex}/${sentences.length} for ${messageId}`, {
                    messageId,
                    sentenceIndex,
                    totalSentences: sentences.length,
                    sentenceLength: sentence.length,
                    sentencePreview: sentence.substring(0, 100)
                  });
                  
                  // Send progress update to service worker (debounced - every 2 sentences or on last sentence)
                  if (sentenceIndex % 2 === 0 || sentenceIndex === sentences.length) {
                    try {
                      chrome.runtime.sendMessage({
                        action: 'TTS_PROGRESS',
                        data: {
                          sentenceIndex,
                          totalSentences: sentences.length,
                          progressBase: 60,
                          progressRange: 35
                        }
                      }).catch(error => {
                        logWarn(`[ClipAIble Offscreen] Failed to send TTS_PROGRESS message for sentence ${sentenceIndex}`, {
                          messageId,
                          sentenceIndex,
                          error: error.message
                        });
                      });
                    } catch (error) {
                      logWarn(`[ClipAIble Offscreen] Error sending TTS_PROGRESS message for sentence ${sentenceIndex}`, {
                        messageId,
                        sentenceIndex,
                        error: error.message
                      });
                    }
                  }
                  
                  // Check memory before each sentence
                  if (!checkMemory()) {
                    logWarn(`[ClipAIble Offscreen] Memory critical, skipping remaining sentences for ${messageId}`, {
                      messageId,
                      processedSentences: i,
                      totalSentences: sentences.length
                    });
                    break;
                  }
                  
                  // CRITICAL: Validate voiceId before predict() call
                  let predictVoiceId = voiceId || downloadVoiceId;
                  if (!predictVoiceId || typeof predictVoiceId !== 'string' || predictVoiceId === 'undefined' || predictVoiceId.trim() === '') {
                    throw new Error(`Invalid voiceId before predict() for sentence ${i + 1}: ${predictVoiceId}. Original voiceId: ${voiceId}, downloadVoiceId: ${downloadVoiceId}`);
                  }
                  
                  // No yield - maintain original quality by processing continuously
                  
                  log(`[ClipAIble Offscreen] === CALLING tts.predict FOR SENTENCE ${i + 1}/${sentences.length} === VOICE="${predictVoiceId}" ===`, {
                    messageId,
                    sentenceIndex: i + 1,
                    totalSentences: sentences.length,
                    predictVoiceId,
                    PREDICT_VOICE_STRING: `VOICE="${predictVoiceId}"`, // Explicit string for visibility
                    predictVoiceIdType: typeof predictVoiceId,
                    predictVoiceIdLength: predictVoiceId.length,
                    sentenceLength: sentence.length,
                    originalVoiceId: voiceId,
                    downloadVoiceId: downloadVoiceId,
                    voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown')
                  });
                  
                  // CRITICAL: Log stored voices before predict to verify model availability
                  const storedCheckStart = Date.now();
                  log(`[ClipAIble Offscreen] === CHECKING STORED VOICES BEFORE PREDICT === for sentence ${i + 1}/${sentences.length}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    useWorker: state.shouldUseWorker(),
                    hasTTSWorker: state.hasTTSWorker(),
                    timestamp: storedCheckStart
                  });
                  
                  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                  if (!state.getTTSWorker()) {
                    await initTTSWorker();
                  }
                  if (!state.getTTSWorker()) {
                    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                  }
                  const storedBeforePredict = await getStoredWithWorker();
                  const storedCheckDuration = Date.now() - storedCheckStart;
                  
                  log(`[ClipAIble Offscreen] Stored voices BEFORE predict() for sentence ${i + 1}/${sentences.length}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    storedVoices: storedBeforePredict,
                    isVoiceStored: storedBeforePredict.includes(predictVoiceId),
                    storedCount: storedBeforePredict.length,
                    storedCheckDuration
                  });
                  
                  // CRITICAL: Verify voice matches expected voice
                  // This ensures we're using the voice selected in popup, not a cached one
                  // Models are stored in IndexedDB permanently (survive extension restarts)
                  // But we need to ensure library uses the correct voice for this request
                  const expectedVoice = voiceId || downloadVoiceId;
                  
                  if (state.getLastUsedVoiceId() !== null && state.getLastUsedVoiceId() !== predictVoiceId) {
                    logError(`[ClipAIble Offscreen] CRITICAL ERROR: Voice mismatch with tracked voice!`, {
                      messageId,
                      sentenceIndex: i + 1,
                      expectedVoice: state.getLastUsedVoiceId(),
                      actualVoice: predictVoiceId,
                      action: 'Voice changed during sentence processing - correcting to tracked voice!',
                      willUse: state.getLastUsedVoiceId()
                    });
                    // Use the tracked voice (from popup)
                    predictVoiceId = state.getLastUsedVoiceId();
                    log(`[ClipAIble Offscreen] Corrected voice to tracked voice`, {
                      messageId,
                      sentenceIndex: i + 1,
                      correctedVoice: predictVoiceId
                    });
                  }
                  
                  // CRITICAL: Final verification before predict()
                  // Ensure we're using the voice from popup, not a cached one
                  if (predictVoiceId !== expectedVoice) {
                    logWarn(`[ClipAIble Offscreen] Voice mismatch before predict() - correcting`, {
                      messageId,
                      sentenceIndex: i + 1,
                      predictVoiceId,
                      expectedVoice,
                      action: 'Correcting to expected voice from popup'
                    });
                    predictVoiceId = expectedVoice;
                  }
                  
                  // Synthesize sentence
                  const predictStartTime = Date.now();
                  
                  // CRITICAL: Explicitly pass voiceId to ensure library uses correct voice
                  // Log the exact parameters being passed
                  // For Ukrainian, log detailed text analysis
                  const isUkrainian = langCode === 'uk';
                  const logData = {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    VOICE_PARAM: `voiceId="${predictVoiceId}"`, // Explicit string for visibility
                    textLength: sentence.length,
                    textPreview: sentence.substring(0, 50) + '...',
                    lastUsedVoiceId: state.getLastUsedVoiceId(),
                    expectedVoice: expectedVoice,
                    voiceMatchesExpected: predictVoiceId === expectedVoice,
                    voiceMatchesLastUsed: state.getLastUsedVoiceId() === predictVoiceId
                  };
                  
                  // Detailed logging for Ukrainian text
                  if (isUkrainian) {
                    const ukrainianChars = (sentence.match(/[іїєґІЇЄҐ]/g) || []).length;
                    const cyrillicChars = (sentence.match(/[А-Яа-яЁёІіЇїЄєҐґ]/g) || []).length;
                    const nonAsciiChars = (sentence.match(/[^\x00-\x7F]/g) || []).length;
                    const firstChars = Array.from(sentence.substring(0, 100)).map(c => 
                      `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
                    );
                    
                    logData.ukrainianChars = ukrainianChars;
                    logData.cyrillicChars = cyrillicChars;
                    logData.nonAsciiChars = nonAsciiChars;
                    logData.fullSentence = sentence; // Full sentence for debugging
                    logData.firstChars = firstChars;
                    logData.sentenceEnd = sentence.substring(Math.max(0, sentence.length - 50));
                  }
                  
                  // Use JSON.stringify for Ukrainian to see full data in logs
                  if (isUkrainian) {
                    log(`[ClipAIble Offscreen] === CALLING tts.predict WITH PARAMETERS (UKRAINIAN) ===`, JSON.stringify({
                      messageId,
                      sentenceIndex: i + 1,
                      voiceId: predictVoiceId,
                      textLength: sentence.length,
                      ukrainianChars: logData.ukrainianChars,
                      cyrillicChars: logData.cyrillicChars,
                      nonAsciiChars: logData.nonAsciiChars,
                      fullSentence: sentence,
                      first50Chars: sentence.substring(0, 50),
                      last50Chars: sentence.substring(Math.max(0, sentence.length - 50)),
                      firstCharsUnicode: logData.firstChars?.slice(0, 20)
                    }, null, 2));
                  } else {
                    log(`[ClipAIble Offscreen] === CALLING tts.predict WITH PARAMETERS ===`, logData);
                  }
                  
                  // CRITICAL: Double-check voiceId before predict()
                  // This is the final check to ensure correct voice is used
                  if (!predictVoiceId || predictVoiceId !== expectedVoice) {
                    logError(`[ClipAIble Offscreen] CRITICAL: Invalid voiceId before predict() - using expected voice`, {
                      messageId,
                      sentenceIndex: i + 1,
                      predictVoiceId,
                      expectedVoice,
                      action: 'Forcing expected voice'
                    });
                    predictVoiceId = expectedVoice;
                  }
                  
                  // Validate sentence before sending to TTS (especially for Ukrainian)
                  if (isUkrainian) {
                    // Check if sentence contains valid Ukrainian characters
                    const hasValidChars = /[А-Яа-яЁёІіЇїЄєҐґ\s\p{P}\p{N}]/u.test(sentence);
                    if (!hasValidChars && sentence.trim().length > 0) {
                      logWarn(`[ClipAIble Offscreen] WARNING: Sentence ${i + 1} may contain invalid characters for Ukrainian TTS`, {
                        messageId,
                        sentenceIndex: i + 1,
                        sentence,
                        sentenceLength: sentence.length,
                        firstChars: Array.from(sentence.substring(0, 20)).map(c => 
                          `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
                        )
                      });
                    }
                    
                    // Check for common issues that could cause garbled output
                    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(sentence);
                    if (hasControlChars) {
                      logError(`[ClipAIble Offscreen] ERROR: Sentence ${i + 1} contains control characters!`, {
                        messageId,
                        sentenceIndex: i + 1,
                        sentence
                      });
                    }
                    
                    // DETAILED LOGGING FOR UKRAINIAN TEXT (first 3 sentences or all if less than 3)
                    if (i < 3 || sentences.length <= 3) {
                      const ukrainianChars = (sentence.match(/[іїєґІЇЄҐ]/g) || []).length;
                      const cyrillicChars = (sentence.match(/[А-Яа-яЁёІіЇїЄєҐґ]/g) || []).length;
                      const nonAsciiChars = (sentence.match(/[^\x00-\x7F]/g) || []).length;
                      const firstCharsUnicode = Array.from(sentence.substring(0, 50)).map(c => 
                        `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
                      );
                      
                      log(`[ClipAIble Offscreen] === CALLING tts.predict WITH PARAMETERS (UKRAINIAN) ===`, {
                        messageId,
                        sentenceIndex: i + 1,
                        totalSentences: sentences.length,
                        voiceId: predictVoiceId,
                        sentenceLength: sentence.length,
                        ukrainianChars,
                        cyrillicChars,
                        nonAsciiChars,
                        fullSentence: sentence,
                        firstCharsUnicode,
                        sentenceEnd: sentence.substring(Math.max(0, sentence.length - 30))
                      });
                    }
                  }
                  
                  // Use Web Worker - required, no fallback
                  // Web Worker executes WASM in separate thread, preventing main thread blocking
                  let sentenceBlob;
                  const currentSentenceIndex = i + 1;
                  
                  log(`[ClipAIble Offscreen] Processing sentence ${currentSentenceIndex}/${sentences.length} for ${messageId}`, {
                    messageId,
                    sentenceIndex: currentSentenceIndex,
                    totalSentences: sentences.length,
                    useWorker: state.shouldUseWorker(),
                    hasTTSWorker: state.hasTTSWorker(),
                    sentenceLength: sentence.length
                  });
                  
                  // Send progress update to service worker (debounced - every 2 sentences or on last sentence)
                  const shouldSendProgress = currentSentenceIndex % 2 === 0 || currentSentenceIndex === sentences.length;
                  
                  if (shouldSendProgress) {
                    try {
                      chrome.runtime.sendMessage({
                        action: 'TTS_PROGRESS',
                        data: {
                          sentenceIndex: currentSentenceIndex,
                          totalSentences: sentences.length,
                          progressBase: 60,
                          progressRange: 35
                        }
                      }).catch(error => {
                        logWarn(`[ClipAIble Offscreen] Failed to send TTS_PROGRESS message for sentence ${currentSentenceIndex}`, {
                          messageId,
                          sentenceIndex: currentSentenceIndex,
                          error: error.message
                        });
                      });
                    } catch (error) {
                      logWarn(`[ClipAIble Offscreen] Error sending TTS_PROGRESS message for sentence ${currentSentenceIndex}`, {
                        messageId,
                        sentenceIndex: currentSentenceIndex,
                        error: error.message
                      });
                    }
                  }
                  
                  if (state.shouldUseWorker() && state.getTTSWorker()) {
                    log(`[ClipAIble Offscreen] === ABOUT TO CALL predictWithWorker === for sentence ${i + 1} of ${messageId}`, {
                      messageId,
                      sentenceIndex: i + 1,
                      totalSentences: sentences.length,
                      predictVoiceId,
                      sentenceLength: sentence.length,
                      sentencePreview: sentence.substring(0, 100),
                      useWorker: state.shouldUseWorker(),
                      hasTTSWorker: state.hasTTSWorker(),
                      timestamp: Date.now()
                    });
                    
                    log(`[ClipAIble Offscreen] Using Web Worker for sentence ${i + 1} of ${messageId}`, {
                      messageId,
                      sentenceIndex: i + 1
                    });
                    sentenceBlob = await predictWithWorker(sentence, predictVoiceId);
                    log(`[ClipAIble Offscreen] ✅ Worker predict completed for sentence ${i + 1} of ${messageId}`, {
                      messageId,
                      sentenceIndex: i + 1,
                      blobSize: sentenceBlob?.size
                    });
                  } else {
                    throw new Error(`TTS Worker is not available for sentence ${i + 1} of ${messageId}. Worker must be initialized.`);
                  }
                  
                  const predictDuration = Date.now() - predictStartTime;
                  
                  log(`[ClipAIble Offscreen] tts.predict COMPLETED for sentence ${i + 1}/${sentences.length}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    predictDuration,
                    blobSize: sentenceBlob?.size || 0,
                    blobType: sentenceBlob?.type || 'unknown'
                  });
                  
                  audioChunks.push(sentenceBlob);
                  
                  // No yield after predict - maintain original quality
                }
                
                // Concatenate audio chunks properly
                // CRITICAL: WAV files have headers - we can't just concatenate them
                // We need to extract PCM data from each WAV and create a new valid WAV file
                const audioBuffers = await Promise.all(
                  audioChunks.map(blob => blob.arrayBuffer())
                );
                
                log(`[ClipAIble Offscreen] Concatenating ${audioBuffers.length} WAV buffers for ${messageId}`, {
                  messageId,
                  buffersCount: audioBuffers.length,
                  firstBufferSize: audioBuffers[0]?.byteLength || 0
                });
                
                // Use proper WAV concatenation function
                const combinedBuffer = concatenateWavBuffers(audioBuffers);
                
                // Convert back to Blob
                wavBlob = new Blob([combinedBuffer], { type: 'audio/wav' });
                
                log(`[ClipAIble Offscreen] Streaming synthesis complete for ${messageId}`, {
                  messageId,
                  sentencesProcessed: audioChunks.length,
                  totalSize: wavBlob.size,
                  duration: Date.now() - synthesisStart
                });
              } else {
                // Single-pass mode: process entire text at once
                log(`[ClipAIble Offscreen] Attempting synthesis with voice ${voiceId} for ${messageId}`, {
                  messageId,
                  voiceId,
                  retryCount,
                  maxRetries,
                  sanitizedTextLength: sanitizedText.length,
                  sanitizedTextPreview: sanitizedText.substring(0, 200),
                  sanitizedTextEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 100))
                });
                
                // CRITICAL: Validate voiceId before predict() call
                // Use the voice from popup (voiceId || downloadVoiceId)
                // This ensures we always use the voice selected in popup, not a cached one
                let predictVoiceId = voiceId || downloadVoiceId;
                
                // CRITICAL: Final verification - ensure we're using the voice from popup
                // This is the voice that was selected in popup and should be used
                const expectedVoice = voiceId || downloadVoiceId;
                if (predictVoiceId !== expectedVoice) {
                  logWarn(`[ClipAIble Offscreen] Voice mismatch in single-pass mode - correcting`, {
                    messageId,
                    predictVoiceId,
                    expectedVoice,
                    action: 'Correcting to expected voice from popup'
                  });
                  predictVoiceId = expectedVoice;
                }
                
                // CRITICAL: Verify voice matches lastUsedVoiceId (the voice we're tracking)
                if (state.getLastUsedVoiceId() !== null && predictVoiceId !== state.getLastUsedVoiceId()) {
                  logWarn(`[ClipAIble Offscreen] Voice mismatch with tracked voice in single-pass mode - correcting`, {
                    messageId,
                    predictVoiceId,
                    lastUsedVoiceId: state.getLastUsedVoiceId(),
                    action: 'Correcting to tracked voice (from popup)'
                  });
                  predictVoiceId = state.getLastUsedVoiceId();
                }
                
                if (!predictVoiceId || typeof predictVoiceId !== 'string' || predictVoiceId === 'undefined' || predictVoiceId.trim() === '') {
                  throw new Error(`Invalid voiceId before predict(): ${predictVoiceId}. Original voiceId: ${voiceId}, downloadVoiceId: ${downloadVoiceId}, finalVoiceId: ${typeof finalVoiceId !== 'undefined' ? finalVoiceId : 'undefined'}`);
                }
                
                log(`[ClipAIble Offscreen] === CALLING tts.predict (SINGLE-PASS MODE) === VOICE="${predictVoiceId}" ===`, {
                  messageId,
                  predictVoiceId,
                  VOICE_PARAM: `voiceId="${predictVoiceId}"`, // Explicit string for visibility
                  PREDICT_VOICE_STRING: `VOICE="${predictVoiceId}"`, // Explicit string for visibility
                  predictVoiceIdType: typeof predictVoiceId,
                  predictVoiceIdLength: predictVoiceId.length,
                  textLength: sanitizedText.length,
                  originalVoiceId: voiceId,
                  downloadVoiceId: downloadVoiceId,
                  finalVoiceId: typeof finalVoiceId !== 'undefined' ? finalVoiceId : 'undefined',
                  expectedVoice: expectedVoice,
                  voiceMatchesExpected: predictVoiceId === expectedVoice,
                  voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown')
                });
                
                // CRITICAL: Log stored voices before predict to verify model availability
                const storedCheckStart = Date.now();
                log(`[ClipAIble Offscreen] === CHECKING STORED VOICES BEFORE PREDICT (SINGLE-PASS) ===`, {
                  messageId,
                  predictVoiceId,
                  useWorker: state.shouldUseWorker(),
                  hasTTSWorker: state.hasTTSWorker(),
                  timestamp: storedCheckStart
                });
                
                // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                          if (!state.getTTSWorker()) {
                            await initTTSWorker();
                          }
                          if (!state.getTTSWorker()) {
                            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                          }
                const storedBeforePredict = await getStoredWithWorker();
                const storedCheckDuration = Date.now() - storedCheckStart;
                
                log(`[ClipAIble Offscreen] Stored voices BEFORE predict() (single-pass mode)`, {
                  messageId,
                  predictVoiceId,
                  storedVoices: storedBeforePredict,
                  isVoiceStored: storedBeforePredict.includes(predictVoiceId),
                  storedCount: storedBeforePredict.length,
                  storedCheckDuration
                });
                
                const predictStartTime = Date.now();
                // CRITICAL: For single-pass mode, also split text if too long to prevent Long Tasks
                // If text is very long, use streaming mode instead
                if (sanitizedText.length > 2000) {
                  log(`[ClipAIble Offscreen] Text too long for single-pass (${sanitizedText.length} chars), forcing streaming mode`, {
                    messageId,
                    textLength: sanitizedText.length
                  });
                  useStreaming = true;
                  // Fall through to streaming mode
                } else {
                  // Use Web Worker if available for single-pass mode
                  // Note: Progress callback may not work with Worker, but quality is maintained
                  log(`[ClipAIble Offscreen] Single-pass mode for ${messageId}`, {
                    messageId,
                    useWorker: state.shouldUseWorker(),
                    hasTTSWorker: state.hasTTSWorker(),
                    textLength: sanitizedText.length
                  });
                  
                  if (state.shouldUseWorker() && state.getTTSWorker()) {
                    log(`[ClipAIble Offscreen] === ABOUT TO CALL predictWithWorker (SINGLE-PASS) ===`, {
                      messageId,
                      predictVoiceId,
                      textLength: sanitizedText.length,
                      textPreview: sanitizedText.substring(0, 100),
                      useWorker: state.shouldUseWorker(),
                      hasTTSWorker: state.hasTTSWorker(),
                      timestamp: Date.now()
                    });
                    
                    log(`[ClipAIble Offscreen] Using Web Worker for single-pass synthesis of ${messageId}`, {
                      messageId
                    });
                    wavBlob = await predictWithWorker(sanitizedText, predictVoiceId);
                    log(`[ClipAIble Offscreen] ✅ Single-pass synthesis completed via Worker for ${messageId}`, {
                      messageId,
                      blobSize: wavBlob?.size
                    });
                  } else {
                    throw new Error(`TTS Worker is not available for single-pass synthesis of ${messageId}. Worker must be initialized.`);
                  }
                }
                
                const predictDuration = Date.now() - predictStartTime;
                log(`[ClipAIble Offscreen] tts.predict COMPLETED (single-pass mode)`, {
                  messageId,
                  predictVoiceId,
                  predictDuration,
                  blobSize: wavBlob?.size || 0,
                  blobType: wavBlob?.type || 'unknown'
                });
              }
              
              // Success - break out of retry loop
              break;
            } catch (predictError) {
              // CRITICAL: Log full error details for debugging
              logError(`[ClipAIble Offscreen] CRITICAL: predict() error for ${messageId}`, {
                messageId,
                voiceId,
                downloadVoiceId,
                errorMessage: predictError.message,
                errorName: predictError.name,
                errorStack: predictError.stack,
                errorKeys: Object.keys(predictError),
                errorString: String(predictError),
                retryCount
              });
              
              // Check if it's a model corruption error or WASM abort
              const isModelError = predictError.message && (
                predictError.message.includes('No graph was found in the protobuf') ||
                predictError.message.includes('Can\'t create a session') ||
                predictError.message.includes('protobuf') ||
                predictError.message.includes('ERROR_CODE: 2') ||
                predictError.message.includes('Aborted()') ||
                predictError.message.includes('ASSERTIONS')
              );
              
              // If it's a model error and we haven't exhausted retries, clear cache and retry
              if (isModelError && retryCount < maxRetries) {
                log(`[ClipAIble Offscreen] Model corruption detected for ${voiceId}, clearing cache and retrying (attempt ${retryCount + 1}/${maxRetries})`, {
                  messageId,
                  voiceId,
                  error: predictError.message,
                  retryCount: retryCount + 1
                });
                
                try {
                  // CRITICAL: More aggressive cache clearing - try multiple methods
                  log(`[ClipAIble Offscreen] Attempting aggressive cache clearing for ${voiceId}`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  // Method 1: Use Worker remove() if available
                  if (state.shouldUseWorker() && state.getTTSWorker()) {
                    try {
                      await removeWithWorker(voiceId);
                      log(`[ClipAIble Offscreen] Removed corrupted model ${voiceId} from cache (method 1)`, {
                        messageId,
                        voiceId
                      });
                    } catch (removeError) {
                      logWarn(`[ClipAIble Offscreen] Failed to remove model using tts.remove()`, {
                        messageId,
                        voiceId,
                        error: removeError.message
                      });
                    }
                  }
                  
                  // Method 2: Wait a bit for cache to clear
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Method 3: Verify it's actually removed
                  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                  if (!state.getTTSWorker()) {
                    await initTTSWorker();
                  }
                  if (!state.getTTSWorker()) {
                    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                  }
                  const storedAfterRemove = await getStoredWithWorker();
                  const stillStored = storedAfterRemove.includes(voiceId);
                  if (stillStored) {
                    logWarn(`[ClipAIble Offscreen] Model ${voiceId} still in cache after removal attempt`, {
                      messageId,
                      voiceId,
                      storedVoices: storedAfterRemove
                    });
                    // Try removing again
                    if (state.shouldUseWorker() && state.getTTSWorker()) {
                      try {
                        await removeWithWorker(voiceId);
                        await new Promise(resolve => setTimeout(resolve, 500));
                      } catch (retryRemoveError) {
                        logWarn(`[ClipAIble Offscreen] Second removal attempt also failed`, {
                          messageId,
                          voiceId,
                          error: retryRemoveError.message
                        });
                      }
                    }
                  } else {
                    log(`[ClipAIble Offscreen] Model ${voiceId} successfully removed from cache`, {
                      messageId,
                      voiceId
                    });
                  }
                  
                  // Re-download the model
                  // CRITICAL: Validate voiceId before re-download
                  if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
                    const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                    logError(`[ClipAIble Offscreen] Invalid voiceId during re-download for ${messageId}, using fallback`, {
                      messageId,
                      originalVoiceId: voiceId,
                      fallbackVoiceId
                    });
                    voiceId = fallbackVoiceId;
                  }
                  
                  log(`[ClipAIble Offscreen] Re-downloading model ${voiceId} after corruption`, {
                    messageId,
                    voiceId
                  });
                  
                  try {
                    let downloadComplete = false;
                    let finalProgress = null;
                  
                  if (state.shouldUseWorker() && state.getTTSWorker()) {
                    await downloadWithWorker(voiceId, (progress) => {
                      finalProgress = progress;
                    if (progress.total > 0) {
                      const percent = Math.round((progress.loaded * 100) / progress.total);
                      if (percent >= lastPercent + 10 || percent === 100) {
                        log(`[ClipAIble Offscreen] Re-download progress for ${messageId}`, {
                            messageId,
                            voiceId,
                            percent,
                            loaded: progress.loaded,
                            total: progress.total,
                            isComplete: progress.loaded >= progress.total
                          });
                          lastPercent = percent;
                        }
                        // Check if download is complete
                        if (progress.loaded >= progress.total && progress.total > 0) {
                          downloadComplete = true;
                        }
                      }
                    });
                    
                    // CRITICAL: Verify download completed successfully
                    if (finalProgress && finalProgress.total > 0) {
                      const isComplete = finalProgress.loaded >= finalProgress.total;
                      log(`[ClipAIble Offscreen] Re-download verification for ${messageId}`, {
                        messageId,
                        voiceId,
                        loaded: finalProgress.loaded,
                        total: finalProgress.total,
                        isComplete,
                        percent: Math.round((finalProgress.loaded * 100) / finalProgress.total)
                      });
                      
                      if (!isComplete) {
                        throw new Error(`Model download incomplete: ${finalProgress.loaded}/${finalProgress.total} bytes`);
                      }
                    }
                    
                    // CRITICAL: Verify model is stored after re-download
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for storage to complete
                    // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                    if (!state.getTTSWorker()) {
                      await initTTSWorker();
                    }
                    if (!state.getTTSWorker()) {
                      throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                    }
                    const verifyAfterRedownload = await getStoredWithWorker();
                    const isStoredAfterRedownload = verifyAfterRedownload.includes(voiceId);
                    
                    log(`[ClipAIble Offscreen] Post-re-download verification for ${messageId}`, {
                      messageId,
                      voiceId,
                      isStoredAfterRedownload,
                      storedVoices: verifyAfterRedownload
                    });
                    
                    if (!isStoredAfterRedownload) {
                      throw new Error(`Model ${voiceId} not found in storage after re-download`);
                    }
                  } else {
                    // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                    if (!state.getTTSWorker()) {
                      await initTTSWorker();
                    }
                    if (!state.getTTSWorker()) {
                      throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                    }
                    await downloadWithWorker(voiceId, (progress) => {
                      finalProgress = progress;
                      if (progress.total > 0) {
                        const percent = Math.round((progress.loaded * 100) / progress.total);
                        if (percent >= lastPercent + 10 || percent === 100) {
                          log(`[ClipAIble Offscreen] Re-download progress for ${messageId}`, {
                            messageId,
                            voiceId,
                            percent,
                            loaded: progress.loaded,
                            total: progress.total,
                            isComplete: progress.loaded >= progress.total
                          });
                          lastPercent = percent;
                        }
                        if (progress.loaded >= progress.total && progress.total > 0) {
                          downloadComplete = true;
                        }
                      }
                    });
                    
                    // CRITICAL: Verify download completed successfully
                    if (finalProgress && finalProgress.total > 0) {
                      const isComplete = finalProgress.loaded >= finalProgress.total;
                      if (!isComplete) {
                        throw new Error(`Model download incomplete: ${finalProgress.loaded}/${finalProgress.total} bytes`);
                      }
                    }
                    
                    // CRITICAL: Verify model is stored after re-download
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const verifyAfterRedownload = await getStoredWithWorker();
                    const isStoredAfterRedownload = verifyAfterRedownload.includes(voiceId);
                    
                    if (!isStoredAfterRedownload) {
                      throw new Error(`Model ${voiceId} not found in storage after re-download`);
                    }
                  }
                  } catch (redownloadError) {
                    // Handle JSON parsing errors from HuggingFace 404 responses
                    const isJsonParseError = redownloadError.message && (
                      redownloadError.message.includes('Unexpected token') ||
                      redownloadError.message.includes('is not valid JSON') ||
                      redownloadError.message.includes('JSON.parse')
                    );
                    
                    // Handle "Entry not found" errors (404 from HuggingFace)
                    const isEntryNotFound = redownloadError.message && (
                      redownloadError.message.includes('Entry not found') ||
                      redownloadError.message.includes('404') ||
                      redownloadError.message.includes('not found')
                    );
                    
                    if (isJsonParseError || isEntryNotFound) {
                      logError(`[ClipAIble Offscreen] Voice ${voiceId} not found during re-download for ${messageId}`, {
                        messageId,
                        voiceId,
                        errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                        originalError: redownloadError.message
                      });
                      // Try fallback voice
                      const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                      if (fallbackVoiceId !== voiceId) {
                        log(`[ClipAIble Offscreen] Trying fallback voice ${fallbackVoiceId} for ${messageId}`, {
                          messageId,
                          originalVoiceId: voiceId,
                          fallbackVoiceId
                        });
                        voiceId = fallbackVoiceId;
                        // Retry download with fallback
                        if (state.shouldUseWorker() && state.getTTSWorker()) {
                          await downloadWithWorker(voiceId, (progress) => {
                            if (progress.total > 0) {
                              const percent = Math.round((progress.loaded * 100) / progress.total);
                              if (percent >= lastPercent + 10 || percent === 100) {
                                log(`[ClipAIble Offscreen] Fallback re-download progress for ${messageId}`, {
                                  messageId,
                                  voiceId,
                                  percent,
                                  loaded: progress.loaded,
                                  total: progress.total
                                });
                                lastPercent = percent;
                              }
                            }
                          });
                        } else {
                          // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                          if (!state.getTTSWorker()) {
                            await initTTSWorker();
                          }
                          if (!state.getTTSWorker()) {
                            throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                          }
                          await downloadWithWorker(voiceId, (progress) => {
                            finalProgress = progress;
                            if (progress.total > 0) {
                              const percent = Math.round((progress.loaded * 100) / progress.total);
                              if (percent >= lastPercent + 10 || percent === 100) {
                                log(`[ClipAIble Offscreen] Fallback re-download progress for ${messageId}`, {
                                  messageId,
                                  voiceId,
                                  percent,
                                  loaded: progress.loaded,
                                  total: progress.total
                                });
                                lastPercent = percent;
                              }
                            }
                          });
                        }
                      } else {
                        throw new Error(`Voice "${voiceId}" not found and no fallback available. Please select a valid voice from the list.`);
                      }
                    } else {
                      throw redownloadError;
                    }
                  }
                  
                  // CRITICAL: Try to verify model can be loaded before retrying synthesis
                  // This helps catch corruption early
                  log(`[ClipAIble Offscreen] Model ${voiceId} re-downloaded, verifying integrity before retry`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  // Wait a bit more for storage to fully complete
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Verify model is still stored
                  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                  if (!state.getTTSWorker()) {
                    await initTTSWorker();
                  }
                  if (!state.getTTSWorker()) {
                    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                  }
                  const finalVerify = await getStoredWithWorker();
                  const isFinalStored = finalVerify.includes(voiceId);
                  
                  if (!isFinalStored) {
                    logError(`[ClipAIble Offscreen] Model ${voiceId} disappeared from storage after re-download`, {
                      messageId,
                      voiceId,
                      storedVoices: finalVerify
                    });
                    throw new Error(`Model ${voiceId} not found in storage after re-download`);
                  }
                  
                  log(`[ClipAIble Offscreen] Model ${voiceId} verified in storage, retrying synthesis`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  retryCount++;
                  lastPercent = -1; // Reset progress tracking
                  continue; // Retry synthesis
                } catch (cleanupError) {
                  logError(`[ClipAIble Offscreen] Failed to clear cache and re-download model ${voiceId}`, {
                    messageId,
                    voiceId,
                    cleanupError: cleanupError.message,
                    originalError: predictError.message
                  });
                  // If cleanup fails, break and let error propagate
                  throw predictError;
                }
              }
              
              // If model error persists after all retries, try fallback voice
              if (isModelError && retryCount >= maxRetries) {
                logError(`[ClipAIble Offscreen] Model corruption persists after ${maxRetries} retries for ${voiceId}, trying fallback voice for ${messageId}`, {
                  messageId,
                  voiceId,
                  langCode,
                  fallbackVoice: FALLBACK_VOICES[langCode]
                });
                
                // Try fallback voice if available
                const fallbackVoiceId = FALLBACK_VOICES[langCode] || DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'];
                if (fallbackVoiceId && fallbackVoiceId !== voiceId) {
                  log(`[ClipAIble Offscreen] Switching to fallback voice ${fallbackVoiceId} for ${messageId}`, {
                    messageId,
                    originalVoiceId: voiceId,
                    fallbackVoiceId
                  });
                  
                  // Clear corrupted voice
                  if (state.shouldUseWorker() && state.getTTSWorker()) {
                    try {
                      await removeWithWorker(voiceId);
                    } catch (removeError) {
                      logWarn(`[ClipAIble Offscreen] Failed to remove corrupted voice`, {
                        messageId,
                        voiceId,
                        error: removeError.message
                      });
                    }
                  }
                  
                  // Switch to fallback
                  voiceId = fallbackVoiceId;
                  downloadVoiceId = fallbackVoiceId;
                  
                  // Check if fallback is downloaded
                  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                  if (!state.getTTSWorker()) {
                    await initTTSWorker();
                  }
                  if (!state.getTTSWorker()) {
                    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
                  }
                  const stored = await getStoredWithWorker();
                  if (!stored.includes(fallbackVoiceId)) {
                    log(`[ClipAIble Offscreen] Downloading fallback voice ${fallbackVoiceId} for ${messageId}`);
                    try {
                      if (state.shouldUseWorker() && state.getTTSWorker()) {
                        await downloadWithWorker(fallbackVoiceId);
                      } else {
                        // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                        if (!state.getTTSWorker()) {
                          await initTTSWorker();
                        }
                        if (!state.getTTSWorker()) {
                          throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                        }
                        await downloadWithWorker(fallbackVoiceId);
                      }
                    } catch (fallbackDownloadError) {
                      logError(`[ClipAIble Offscreen] Failed to download fallback voice`, {
                        messageId,
                        fallbackVoiceId,
                        error: fallbackDownloadError.message
                      });
                      throw new Error(`Failed to download fallback voice: ${fallbackDownloadError.message}`);
                    }
                  }
                  
                  // Reset retry count and continue with fallback
                  retryCount = 0;
                  continue;
                }
              }
              
              // If not a model error or retries exhausted, check for phoneme error
              const isPhonemeError = predictError.message && (
                predictError.message.includes('indices element out of data bounds') ||
                predictError.message.includes('Gather node') ||
                predictError.message.includes('idx=') ||
                predictError.message.includes('inclusive range')
              );
              
              if (isPhonemeError && !isFallbackVoice) {
              // Try fallback voice for current language first
              let fallbackVoiceId = null;
              
              if (langCode in FALLBACK_VOICES) {
                fallbackVoiceId = FALLBACK_VOICES[langCode];
                // Only use fallback if it's different from current voice
                if (fallbackVoiceId === voiceId) {
                  fallbackVoiceId = null;
                }
              }
              
              // If no fallback for current language or fallback is same, try English fallback
              if (!fallbackVoiceId && langCode !== 'en' && 'en' in FALLBACK_VOICES) {
                fallbackVoiceId = FALLBACK_VOICES['en'];
                log(`[ClipAIble Offscreen] No fallback for ${langCode}, trying English fallback voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  originalVoice: voiceId,
                  originalLang: langCode,
                  fallbackVoice: fallbackVoiceId,
                  error: predictError.message
                });
              } else if (fallbackVoiceId) {
                log(`[ClipAIble Offscreen] Phoneme error with ${voiceId}, trying fallback voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  originalVoice: voiceId,
                  fallbackVoice: fallbackVoiceId,
                  error: predictError.message
                });
              }
              
              if (fallbackVoiceId) {
                // CRITICAL: Validate fallback voice ID
                if (!fallbackVoiceId || typeof fallbackVoiceId !== 'string' || fallbackVoiceId === 'undefined' || fallbackVoiceId.trim() === '') {
                  logError(`[ClipAIble Offscreen] Invalid fallback voice ID for ${messageId}`, {
                    messageId,
                    fallbackVoiceId,
                    langCode,
                    fallbackVoices: FALLBACK_VOICES
                  });
                  // Try English fallback
                  fallbackVoiceId = FALLBACK_VOICES['en'] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                  if (!fallbackVoiceId || typeof fallbackVoiceId !== 'string' || fallbackVoiceId === 'undefined' || fallbackVoiceId.trim() === '') {
                    throw new Error(`Cannot determine valid fallback voice. Language: ${langCode}`);
                  }
                }
                
                // Check if fallback voice is downloaded
                // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
          if (!state.getTTSWorker()) {
            await initTTSWorker();
          }
          if (!state.getTTSWorker()) {
            throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
          }
          const stored = await getStoredWithWorker();
                if (!stored.includes(fallbackVoiceId)) {
                  log(`[ClipAIble Offscreen] Downloading fallback voice ${fallbackVoiceId} for ${messageId}`);
                  try {
                    // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                    if (!state.getTTSWorker()) {
                      await initTTSWorker();
                    }
                    if (!state.getTTSWorker()) {
                      throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                    }
                    await downloadWithWorker(fallbackVoiceId);
                  } catch (fallbackDownloadError) {
                    // Handle JSON parsing errors from HuggingFace 404 responses
                    const isJsonParseError = fallbackDownloadError.message && (
                      fallbackDownloadError.message.includes('Unexpected token') ||
                      fallbackDownloadError.message.includes('is not valid JSON') ||
                      fallbackDownloadError.message.includes('JSON.parse')
                    );
                    
                    // Handle "Entry not found" errors (404 from HuggingFace)
                    const isEntryNotFound = fallbackDownloadError.message && (
                      fallbackDownloadError.message.includes('Entry not found') ||
                      fallbackDownloadError.message.includes('404') ||
                      fallbackDownloadError.message.includes('not found')
                    );
                    
                    if (isJsonParseError || isEntryNotFound) {
                      logError(`[ClipAIble Offscreen] Fallback voice ${fallbackVoiceId} not found for ${messageId}`, {
                        messageId,
                        fallbackVoiceId,
                        errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                        originalError: fallbackDownloadError.message
                      });
                      // Try English default as last resort
                      const englishFallback = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                      if (englishFallback !== fallbackVoiceId) {
                        log(`[ClipAIble Offscreen] Trying English default ${englishFallback} as last resort for ${messageId}`, {
                          messageId,
                          originalFallback: fallbackVoiceId,
                          englishFallback
                        });
                        fallbackVoiceId = englishFallback;
                        try {
                          if (state.shouldUseWorker() && state.getTTSWorker()) {
                            await downloadWithWorker(fallbackVoiceId);
                          } else {
                            // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
                            if (!state.getTTSWorker()) {
                              await initTTSWorker();
                            }
                            if (!state.getTTSWorker()) {
                              throw new Error('TTS Worker is not available. Cannot download voice without Worker.');
                            }
                            await downloadWithWorker(fallbackVoiceId);
                          }
                        } catch (englishDownloadError) {
                          throw new Error(`Cannot download any valid voice. Original: ${voiceId}, Fallback: ${fallbackVoiceId}, Error: ${englishDownloadError.message}`);
                        }
                      } else {
                        throw new Error(`Fallback voice "${fallbackVoiceId}" not found and no alternative available. Please select a valid voice from the list.`);
                      }
                    } else {
                      throw fallbackDownloadError;
                    }
                  }
                }
                
                // Retry with fallback voice
                voiceId = fallbackVoiceId;
                isFallbackVoice = true;
                lastPercent = -1;
                
                // Log before fallback synthesis attempt
                log(`[ClipAIble Offscreen] Attempting fallback synthesis with voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  fallbackVoiceId,
                  sanitizedTextLength: sanitizedText.length,
                  sanitizedTextPreview: sanitizedText.substring(0, 200),
                  sanitizedTextEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 100)),
                  originalError: predictError.message
                });
                
                // CRITICAL: Use Worker for fallback - no direct tts.predict() calls
                // This ensures all TTS operations go through Worker as per architecture contract
                if (!state.shouldUseWorker() || !state.getTTSWorker()) {
                  await initTTSWorker();
                }
                wavBlob = await predictWithWorker(sanitizedText, fallbackVoiceId);
              } else {
                // No valid fallback voice found, re-throw error
                throw predictError;
              }
            } else {
              // Re-throw if not a phoneme error or fallback already tried
              throw predictError;
            }
            } // End of catch block
          } // End of while loop
          
          const synthesisDuration = Date.now() - synthesisStart;
          log(`[ClipAIble Offscreen] Speech generation complete for ${messageId}`, {
            messageId,
            duration: synthesisDuration,
            blobType: wavBlob.type,
            blobSize: wavBlob.size
          });
          
          // Convert Blob to ArrayBuffer to Uint8Array
          const convertStart = Date.now();
          const arrayBuffer = await wavBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const convertDuration = Date.now() - convertStart;
          
          log(`[ClipAIble Offscreen] Audio converted for ${messageId}`, {
            messageId,
            arrayBufferSize: arrayBuffer.byteLength,
            uint8ArrayLength: uint8Array.length,
            convertDuration
          });
          
          // Optimize data transfer: use storage for large audio
          // Use hasUnlimitedStorage passed from service worker (getManifest is not available in offscreen)
          const hasUnlimitedStorage = message.data.hasUnlimitedStorage || false;
          
          // Chrome has a hard 10 MB limit for chrome.runtime.sendMessage
          // JSON serialization can increase size, so use conservative threshold
          // Use storage for files >= 5 MB to stay safely under Chrome's 10 MB limit
          const STORAGE_THRESHOLD = 5 * 1024 * 1024;  // 5 MB - safe for inline transfer
          
          // IndexedDB threshold for very large files (>50MB)
          // IndexedDB is more efficient for large binary data than chrome.storage
          const INDEXEDDB_THRESHOLD = 50 * 1024 * 1024;  // 50 MB - use IndexedDB for very large files
          
          // Maximum audio size validation (absolute limit)
          const MAX_AUDIO_SIZE = hasUnlimitedStorage 
            ? 100 * 1024 * 1024  // 100 MB absolute max with unlimitedStorage
            : 10 * 1024 * 1024;  // 10 MB max without unlimitedStorage
          
          // Validate maximum size before processing
          if (uint8Array.length > MAX_AUDIO_SIZE) {
            logError(`[ClipAIble Offscreen] Audio too large for ${messageId}`, {
              messageId,
              size: uint8Array.length,
              maxSize: MAX_AUDIO_SIZE,
              hasUnlimitedStorage
            });
            
            sendResponse({
              success: false,
              error: `Audio too large: ${(uint8Array.length / 1024 / 1024).toFixed(2)} MB exceeds maximum limit of ${(MAX_AUDIO_SIZE / 1024 / 1024).toFixed(2)} MB`,
              code: 'AUDIO_TOO_LARGE',
              audioSize: uint8Array.length,
              maxSize: MAX_AUDIO_SIZE,
              hasUnlimitedStorage
            });
            return;
          }
          
          // Log all storage settings when they are determined
          const storageSettings = {
            messageId,
            timestamp: Date.now(),
            hasUnlimitedStorage,
            storageThreshold: STORAGE_THRESHOLD,
            storageThresholdMB: (STORAGE_THRESHOLD / 1024 / 1024).toFixed(2),
            maxAudioSize: MAX_AUDIO_SIZE,
            maxAudioSizeMB: (MAX_AUDIO_SIZE / 1024 / 1024).toFixed(2),
            audioSize: uint8Array.length,
            audioSizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
            chromeMessageLimit: 10 * 1024 * 1024,
            chromeMessageLimitMB: '10.00',
            willUseStorage: uint8Array.length >= STORAGE_THRESHOLD,
            willUseInline: uint8Array.length < STORAGE_THRESHOLD,
            note: 'Storage threshold is 5 MB to stay safely under Chrome 10 MB message limit'
          };
          
          log(`[ClipAIble Offscreen] Storage threshold determined with all settings for ${messageId}`, storageSettings);
          
          const responseStart = Date.now();
          
          if (uint8Array.length < STORAGE_THRESHOLD) {
            // Small audio - send inline (faster for small files)
            log(`[ClipAIble Offscreen] Sending audio inline for ${messageId}`, {
              messageId,
              size: uint8Array.length,
              method: 'inline',
              threshold: STORAGE_THRESHOLD
            });
            
            const responseData = {
              success: true,
              audioData: Array.from(uint8Array),
              size: uint8Array.length,
              method: 'inline'
            };
            
            // Check serialized size before sending (Chrome has 10 MB limit)
            const serializedSize = JSON.stringify(responseData).length;
            const CHROME_MESSAGE_LIMIT = 10 * 1024 * 1024; // 10 MB Chrome limit
            
            log(`[ClipAIble Offscreen] Response prepared (inline) for ${messageId}`, {
              messageId,
              responseSize: serializedSize,
              responseSizeMB: (serializedSize / 1024 / 1024).toFixed(2),
              audioDataLength: responseData.audioData.length,
              withinChromeLimit: serializedSize < CHROME_MESSAGE_LIMIT
            });
            
            // If serialized size exceeds Chrome limit, use storage instead
            if (serializedSize >= CHROME_MESSAGE_LIMIT) {
              log(`[ClipAIble Offscreen] Serialized size exceeds Chrome limit, switching to storage for ${messageId}`, {
                messageId,
                serializedSize,
                serializedSizeMB: (serializedSize / 1024 / 1024).toFixed(2),
                chromeLimit: CHROME_MESSAGE_LIMIT,
                chromeLimitMB: (CHROME_MESSAGE_LIMIT / 1024 / 1024).toFixed(2)
              });
              // Fall through to storage method
            } else {
              try {
                sendResponse(responseData);
                log(`[ClipAIble Offscreen] Response sent successfully (inline) for ${messageId}`, {
                  messageId,
                  method: 'inline',
                  size: uint8Array.length
                });
                
                // Voice switching works with singleton clear + module reload only
                // No need to close offscreen document - tested and confirmed
                
                return; // CRITICAL: Return after sending response to prevent fallthrough to error handler
              } catch (sendError) {
                logError(`[ClipAIble Offscreen] Failed to send inline response for ${messageId}`, {
                  messageId,
                  error: sendError.message,
                  errorName: sendError.name,
                  errorStack: sendError.stack,
                  size: uint8Array.length,
                  sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
                  responseDataSize: serializedSize,
                  responseDataSizeMB: (serializedSize / 1024 / 1024).toFixed(2)
                });
                // If inline send fails (e.g., message too large), try storage instead
                // Fall through to storage method
              }
            }
          }
          
          // If inline failed or audio is too large, use storage
          // This block executes if inline send failed OR if audio was already >= threshold
          {
            // Large audio - choose storage method based on size
            // For very large files (>50MB), use IndexedDB directly (more efficient)
            const storageKey = `clipaible_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const useIndexedDB = uint8Array.length >= INDEXEDDB_THRESHOLD;
            
            log(`[ClipAIble Offscreen] Saving audio to storage for ${messageId}`, {
              messageId,
              storageKey,
              size: uint8Array.length,
              sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
              method: useIndexedDB ? 'indexeddb' : 'storage',
              threshold: STORAGE_THRESHOLD,
              indexeddbThreshold: INDEXEDDB_THRESHOLD,
              useIndexedDB
            });
            
            // For very large files (>50MB), use IndexedDB directly
            if (useIndexedDB) {
              try {
                const dbName = 'ClipAIbleAudioStorage';
                const storeName = 'audioFiles';
                
                // Open IndexedDB
                const dbRequest = indexedDB.open(dbName, 1);
                
                const db = await new Promise((resolve, reject) => {
                  dbRequest.onerror = () => reject(new Error('Failed to open IndexedDB'));
                  dbRequest.onsuccess = () => resolve(dbRequest.result);
                  dbRequest.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(storeName)) {
                      db.createObjectStore(storeName);
                    }
                  };
                });
                
                // Save audio data to IndexedDB (store as ArrayBuffer for efficiency)
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                
                await new Promise((resolve, reject) => {
                  const putRequest = store.put(uint8Array.buffer, storageKey);
                  putRequest.onsuccess = () => resolve();
                  putRequest.onerror = () => reject(new Error('Failed to save to IndexedDB'));
                });
                
                db.close();
                
                log(`[ClipAIble Offscreen] Audio saved to IndexedDB for ${messageId}`, {
                  messageId,
                  storageKey,
                  size: uint8Array.length,
                  sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
                  method: 'indexeddb'
                });
                
                const responseData = {
                  success: true,
                  storageKey: storageKey,
                  size: uint8Array.length,
                  method: 'indexeddb'
                };
                
                sendResponse(responseData);
                log(`[ClipAIble Offscreen] Response sent successfully (indexeddb) for ${messageId}`, {
                  messageId,
                  method: 'indexeddb',
                  storageKey,
                  size: uint8Array.length
                });
                
                return; // CRITICAL: Return after sending response
              } catch (indexedDBError) {
                logError(`[ClipAIble Offscreen] Failed to save to IndexedDB for ${messageId}`, {
                  messageId,
                  error: indexedDBError.message,
                  size: uint8Array.length,
                  sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2)
                });
                // Fall through to chrome.storage fallback
              }
            }
            
            // For files <50MB, try chrome.storage first (faster for smaller files)
            try {
              // Check if chrome.storage is available in offscreen context
              if (!chrome.storage || !chrome.storage.local) {
                throw new Error('chrome.storage.local is not available in offscreen document context');
              }
              
              // CRITICAL: Save metadata with timestamp for cleanup protection
              const metadata = {
                timestamp: Date.now(),
                size: uint8Array.length
              };
              
              // Save to chrome.storage.local with metadata
              await chrome.storage.local.set({
                [storageKey]: Array.from(uint8Array),
                [`${storageKey}_meta`]: metadata
              });
              
              log(`[ClipAIble Offscreen] Audio saved to storage for ${messageId}`, {
                messageId,
                storageKey,
                size: uint8Array.length,
                metadata
              });
              
              // CRITICAL: Do NOT schedule cleanup here!
              // Offscreen document can be closed, setTimeout will be lost
              // Cleanup will be handled by service worker
              
              const responseData = {
                success: true,
                storageKey: storageKey,
                size: uint8Array.length,
                method: 'storage'
              };
              
              log(`[ClipAIble Offscreen] Response prepared (storage) for ${messageId}`, {
                messageId,
                storageKey,
                size: uint8Array.length
              });
              
              sendResponse(responseData);
              log(`[ClipAIble Offscreen] Response sent successfully (storage) for ${messageId}`, {
                messageId,
                method: 'storage',
                storageKey,
                size: uint8Array.length
              });
              
              // Voice switching works with singleton clear + module reload only
              // No need to close offscreen document - tested and confirmed
              
              return; // CRITICAL: Return after sending response
            } catch (storageError) {
              const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage;
              const hasChromeStorageLocal = hasChromeStorage && chrome.storage.local;
              
              // Check if error is due to chrome.storage being unavailable
              const isStorageUnavailable = !hasChromeStorageLocal || 
                storageError.message?.includes('undefined') ||
                storageError.message?.includes('not available') ||
                storageError.message?.includes('Cannot read properties');
              
              if (isStorageUnavailable) {
                // This is expected behavior - offscreen documents don't have chrome.storage.local
                // Fallback to IndexedDB is working correctly, so log as warning, not error
                logWarn(`[ClipAIble Offscreen] chrome.storage.local is not available in offscreen context for ${messageId}. Using IndexedDB fallback (expected behavior).`, {
                  messageId,
                  hasChromeStorage: hasChromeStorage,
                  hasChromeStorageLocal: hasChromeStorageLocal,
                  note: 'This is normal - offscreen documents use IndexedDB instead'
                });
              } else {
                // Real error - log as error
                logError(`[ClipAIble Offscreen] Failed to save to storage for ${messageId}`, {
                  messageId,
                  error: storageError.message,
                  errorName: storageError.name,
                  stack: storageError.stack,
                  audioSize: uint8Array.length,
                  audioSizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
                  threshold: STORAGE_THRESHOLD,
                  thresholdMB: (STORAGE_THRESHOLD / 1024 / 1024).toFixed(2),
                  hasUnlimitedStorage: hasUnlimitedStorage,
                  hasChromeStorage: hasChromeStorage,
                  hasChromeStorageLocal: hasChromeStorageLocal,
                  chromeAvailable: typeof chrome !== 'undefined',
                  storageErrorDetails: {
                    message: storageError.message,
                    name: storageError.name,
                    stack: storageError.stack?.substring(0, 500)
                  }
                });
              }
              
              // Use IndexedDB as fallback for large audio files
              try {
                  const dbName = 'ClipAIbleAudioStorage';
                  const storeName = 'audioFiles';
                  
                  // Open IndexedDB
                  const dbRequest = indexedDB.open(dbName, 1);
                  
                  await new Promise((resolve, reject) => {
                    dbRequest.onerror = () => reject(new Error('Failed to open IndexedDB'));
                    dbRequest.onsuccess = () => resolve(dbRequest.result);
                    dbRequest.onupgradeneeded = (event) => {
                      const db = event.target.result;
                      if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName);
                      }
                    };
                  });
                  
                  const db = dbRequest.result;
                  const transaction = db.transaction([storeName], 'readwrite');
                  const store = transaction.objectStore(storeName);
                  
                  // Save audio data to IndexedDB
                  await new Promise((resolve, reject) => {
                    const putRequest = store.put(uint8Array.buffer, storageKey);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(new Error('Failed to save to IndexedDB'));
                  });
                  
                  db.close();
                  
                  log(`[ClipAIble Offscreen] Audio saved to IndexedDB for ${messageId}`, {
                    messageId,
                    storageKey,
                    size: uint8Array.length,
                    method: 'indexeddb'
                  });
                  
                  // Return response with IndexedDB key (service worker will read from IndexedDB)
                  sendResponse({
                    success: true,
                    storageKey: storageKey,
                    size: uint8Array.length,
                    method: 'indexeddb' // Different method to indicate IndexedDB storage
                  });
                  
                  return;
                } catch (indexedDBError) {
                  logError(`[ClipAIble Offscreen] Failed to save to IndexedDB for ${messageId}`, {
                    messageId,
                    error: indexedDBError.message
                  });
                  
                  // CRITICAL: Do NOT fallback to inline for large data!
                  // This would cause message timeout and performance issues
                  // Return error instead
                  try {
                    sendResponse({
                      success: false,
                      error: `Failed to store large audio (${uint8Array.length} bytes): ${storageError.message}. Audio exceeds storage threshold.`,
                      code: 'STORAGE_QUOTA_EXCEEDED',
                      audioSize: uint8Array.length,
                      threshold: STORAGE_THRESHOLD,
                      hasUnlimitedStorage: hasUnlimitedStorage
                    });
                    log(`[ClipAIble Offscreen] Error response sent for ${messageId}`, {
                      messageId,
                      errorCode: 'STORAGE_QUOTA_EXCEEDED'
                    });
                    return; // CRITICAL: Return after sending error response
                  } catch (responseError) {
                    logError(`[ClipAIble Offscreen] CRITICAL: Failed to send error response for ${messageId}`, {
                      messageId,
                      responseError: responseError.message,
                      originalError: storageError.message
                    });
                    // Cannot send response - channel may be closed
                    // This will be caught by outer try-catch
                    throw new Error(`Failed to send error response: ${responseError.message}`);
                  }
                }
              }
            }
          
          const totalDuration = Date.now() - ttsRequestStart;
          log(`[ClipAIble Offscreen] === PIPER_TTS COMPLETE ===`, {
            messageId,
            totalDuration,
            breakdown: {
              ttsInit: ttsInitDuration,
              storedCheck: storedCheckDuration,
              synthesis: synthesisDuration,
              convert: convertDuration
            }
          });
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