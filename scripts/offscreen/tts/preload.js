// @ts-check
// TTS preload utilities

import { log, logWarn } from '../../utils/logging.js';
import { state } from '../state.js';

/**
 * Preload WASM files to avoid blocking during first TTS call
 * This loads ONNX Runtime WASM files in advance
 * @param {Object} module - Piper TTS module
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
    
    // Also preload common voice models in background
    if (!state.isVoiceModelsPreloaded() && typeof module.download === 'function') {
      state.setVoiceModelsPreloaded(true);
      preloadCommonVoiceModels(module).catch(error => {
        logWarn('[ClipAIble Offscreen] Voice models preload failed (non-critical)', error);
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

/**
 * Preload common voice models to avoid blocking during first use
 * Downloads most commonly used voices in background
 * @param {Object} module - Piper TTS module
 */
export async function preloadCommonVoiceModels(module) {
  const preloadStart = Date.now();
  log('[ClipAIble Offscreen] === VOICE MODELS PRELOAD START ===', {
    timestamp: preloadStart
  });
  
  try {
    // Preload most common voices: English and Russian (most used)
    const commonVoices = [
      'en_US-lessac-medium',  // English
      'ru_RU-dmitri-medium'    // Russian
    ];
    
    // Check which voices are already stored
    if (typeof module.stored === 'function') {
      const storedVoices = await module.stored();
      log('[ClipAIble Offscreen] Checking stored voices for preload', {
        storedCount: storedVoices.length,
        storedVoices: storedVoices
      });
      
      // Download only voices that aren't already stored
      const voicesToDownload = commonVoices.filter(voice => !storedVoices.includes(voice));
      
      if (voicesToDownload.length > 0) {
        log('[ClipAIble Offscreen] Preloading voice models', {
          voicesToDownload,
          count: voicesToDownload.length
        });
        
        // Download voices one at a time to avoid overwhelming the system
        for (const voiceId of voicesToDownload) {
          try {
            log('[ClipAIble Offscreen] Preloading voice model', { voiceId });
            await module.download(voiceId);
            log('[ClipAIble Offscreen] Voice model preloaded', { voiceId });
            
            // Yield between downloads to avoid blocking
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            logWarn('[ClipAIble Offscreen] Failed to preload voice model (non-critical)', {
              voiceId,
              error: error.message
            });
            // Continue with next voice
          }
        }
      } else {
        log('[ClipAIble Offscreen] All common voices already stored, skipping preload');
      }
    }
    
    log('[ClipAIble Offscreen] === VOICE MODELS PRELOAD COMPLETE ===', {
      duration: Date.now() - preloadStart
    });
  } catch (error) {
    logWarn('[ClipAIble Offscreen] Voice models preload error (non-critical)', {
      error: error.message,
      duration: Date.now() - preloadStart
    });
    // Don't throw - preload is optional
  }
}

