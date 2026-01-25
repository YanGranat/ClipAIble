// @ts-check
// Piper TTS module initialization

import { log, logError, logWarn, logDebug } from '../../utils/logging.js';
import { state } from '../state.js';
import { preloadWASMFiles } from './preload.js';

/**
 * Initialize Piper TTS module
 * @returns {Promise<Object>} Piper TTS module
 */
export async function initPiperTTS() {
  const initStartTime = Date.now();
  log('[ClipAIble Offscreen] ========== initPiperTTS() CALLED ==========', {
    timestamp: initStartTime,
    ttsModuleExists: state.hasTTSModule(),
    location: typeof location !== 'undefined' ? location.href : 'N/A',
    hasChrome: typeof chrome !== 'undefined',
    hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime
  });

  if (state.getTTSModule()) {
    logDebug('[ClipAIble Offscreen] TTS module already loaded, returning cached');
    return state.getTTSModule();
  }

  try {
    log('[ClipAIble Offscreen] Loading Piper TTS module...');

    // Defer import to avoid blocking main thread during initialization
    await new Promise(resolve => setTimeout(resolve, 0));

    // CRITICAL: Try both dev (node_modules) and production (lib) paths
    // In production archive, files are in /lib/
    // In dev mode, files are in /node_modules/
    let moduleUrl;
    let module;
    const importStartTime = Date.now();

    try {
      // Try dev path first
      moduleUrl = chrome.runtime.getURL('node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js');
      log('[ClipAIble Offscreen] ATTEMPT 1: Trying dev path (node_modules)...', {
        moduleUrl,
        fullUrl: moduleUrl,
        isExtensionUrl: moduleUrl.startsWith('chrome-extension://'),
        urlLength: moduleUrl.length,
        timestamp: Date.now()
      });

      module = await import(moduleUrl);

      log('[ClipAIble Offscreen] ✅ SUCCESS: Loaded from dev path (node_modules)', {
        moduleKeys: Object.keys(module).slice(0, 15),
        hasPredict: typeof module.predict === 'function',
        hasVoices: typeof module.voices === 'function',
        duration: Date.now() - importStartTime
      });
    } catch (devError) {
      // Fallback to production path
      log('[ClipAIble Offscreen] ❌ ATTEMPT 1 FAILED: Dev path error', {
        error: devError.message,
        stack: devError.stack,
        name: devError.name,
        attemptedUrl: moduleUrl,
        timestamp: Date.now()
      });

      moduleUrl = chrome.runtime.getURL('lib/piper-tts-web.js');
      log('[ClipAIble Offscreen] ATTEMPT 2: Trying production path (lib)...', {
        moduleUrl,
        fullUrl: moduleUrl,
        isExtensionUrl: moduleUrl.startsWith('chrome-extension://'),
        urlLength: moduleUrl.length,
        timestamp: Date.now()
      });

      try {
        module = await import(moduleUrl);
        log('[ClipAIble Offscreen] ✅ SUCCESS: Loaded from production path (lib)', {
          moduleKeys: Object.keys(module).slice(0, 15),
          hasPredict: typeof module.predict === 'function',
          hasVoices: typeof module.voices === 'function',
          duration: Date.now() - importStartTime
        });
      } catch (prodError) {
        logError('[ClipAIble Offscreen] ❌ ATTEMPT 2 FAILED: Production path error', {
          error: prodError.message,
          stack: prodError.stack,
          name: prodError.name,
          attemptedUrl: moduleUrl,
          timestamp: Date.now(),
          '== BOTH PATHS FAILED ==': 'This is a critical error - piper-tts-web.js cannot be loaded'
        });
        throw prodError;
      }
    }

    const importDuration = Date.now() - importStartTime;
    
    log('[ClipAIble Offscreen] Module import completed', {
      duration: importDuration,
      moduleKeys: Object.keys(module),
      moduleKeysCount: Object.keys(module).length
    });
    
    // Defer WASM initialization to avoid blocking
    await new Promise(resolve => setTimeout(resolve, 0));
    
    const moduleInfo = {
      hasPredict: typeof module.predict === 'function',
      hasVoices: typeof module.voices === 'function',
      hasDownload: typeof module.download === 'function',
      hasStored: typeof module.stored === 'function',
      moduleKeys: Object.keys(module),
      predictType: typeof module.predict,
      voicesType: typeof module.voices,
      downloadType: typeof module.download,
      storedType: typeof module.stored
    };
    
    log('[ClipAIble Offscreen] Piper TTS module loaded successfully', {
      ...moduleInfo,
      totalDuration: Date.now() - initStartTime
    });
    
    state.setTTSModule(module);
    
    // CRITICAL: Preload WASM files and common voice models to avoid blocking during first use
    // This prevents Long Tasks when TTS is first called
    if (!state.isWasmPreloaded()) {
      log('[ClipAIble Offscreen] Starting WASM preload...');
      state.setWasmPreloaded(true);
      
      // Preload WASM files in background (don't await - let it happen asynchronously)
      preloadWASMFiles(module).catch(error => {
        logWarn('[ClipAIble Offscreen] WASM preload failed (non-critical)', error);
      });
    }
    
    return state.getTTSModule();
    
  } catch (error) {
    // Check if error is related to onnxruntime-web import
    const isOnnxError = error.message && (
      error.message.includes('onnxruntime-web') ||
      error.message.includes('Failed to resolve module specifier') ||
      error.stack?.includes('onnxruntime-web')
    );
    
    logError('[ClipAIble Offscreen] === FAILED TO LOAD PIPER TTS ===', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      isOnnxError,
      duration: Date.now() - initStartTime
    });
    throw error;
  }
}



























