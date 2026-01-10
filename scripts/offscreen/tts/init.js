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
  log('[ClipAIble Offscreen] initPiperTTS() called', {
    timestamp: initStartTime,
    ttsModuleExists: state.hasTTSModule()
  });
  
  if (state.getTTSModule()) {
    logDebug('[ClipAIble Offscreen] TTS module already loaded, returning cached');
    return state.getTTSModule();
  }
  
  try {
    log('[ClipAIble Offscreen] Loading Piper TTS module...');
    
    // Defer import to avoid blocking main thread during initialization
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Now import piper-tts-web - it should use the pre-configured ONNX Runtime
    const moduleUrl = chrome.runtime.getURL('node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js');
    logDebug('[ClipAIble Offscreen] Module URL:', { moduleUrl });
    
    const importStartTime = Date.now();
    const module = await import(moduleUrl);
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



























