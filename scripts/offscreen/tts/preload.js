// @ts-check
// TTS preload utilities

import { log, logWarn } from '../../utils/logging.js';

/**
 * Prefetch the voice catalogue without downloading voice models
 * @param {{voices?: function(): Promise<any>, download?: function(string): Promise<void>, [key: string]: any}} module - Piper TTS module
 */
export async function preloadWASMFiles(module) {
  const preloadStart = Date.now();
  log('[ClipAIble Offscreen] === WASM PRELOAD START ===', {
    timestamp: preloadStart
  });
  
  try {
    // Preload by calling a lightweight operation that triggers WASM initialization
    // We'll use the voices() function which is lightweight but triggers WASM load
    if (typeof module.voices === 'function') {
      log('[ClipAIble Offscreen] Preloading WASM via voices() call...');
      await module.voices();
      log('[ClipAIble Offscreen] WASM preload via voices() completed', {
        duration: Date.now() - preloadStart
      });
    }
    
    log('[ClipAIble Offscreen] === WASM PRELOAD COMPLETE ===', {
      duration: Date.now() - preloadStart
    });
  } catch (error) {
    logWarn('[ClipAIble Offscreen] WASM preload error (non-critical)', {
      error: error.message,
      duration: Date.now() - preloadStart
    });
    // Don't throw - preload is optional, TTS will work without it
  }
}

