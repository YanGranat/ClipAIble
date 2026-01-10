// @ts-check
// State management for offscreen document

import { log, logError, logWarn } from '../utils/logging.js';

/**
 * State manager for offscreen document
 * Encapsulates all global state variables to improve testability and maintainability
 */
class OffscreenState {
  constructor() {
    this.ttsModule = null;
    this.lastUsedVoiceId = null;
    this.voiceSwitchRequested = false;
    this.wasmPreloaded = false;
    this.voiceModelsPreloaded = false;
    this.ttsWorker = null;
    this.ttsWorkerInitPromise = null;
    this.workerInactivityTimeout = null;
    this.useWorker = true; // Enabled: Using esbuild bundle
  }

  // TTS Module management
  getTTSModule() {
    return this.ttsModule;
  }

  setTTSModule(module) {
    this.ttsModule = module;
  }

  hasTTSModule() {
    return !!this.ttsModule;
  }

  // Voice management
  getLastUsedVoiceId() {
    return this.lastUsedVoiceId;
  }

  setLastUsedVoiceId(voiceId) {
    this.lastUsedVoiceId = voiceId;
  }

  isVoiceSwitchRequested() {
    return this.voiceSwitchRequested;
  }

  setVoiceSwitchRequested(value) {
    this.voiceSwitchRequested = value;
  }

  // Preload status
  isWasmPreloaded() {
    return this.wasmPreloaded;
  }

  setWasmPreloaded(value) {
    this.wasmPreloaded = value;
  }

  isVoiceModelsPreloaded() {
    return this.voiceModelsPreloaded;
  }

  setVoiceModelsPreloaded(value) {
    this.voiceModelsPreloaded = value;
  }

  // Worker management
  getTTSWorker() {
    return this.ttsWorker;
  }

  setTTSWorker(worker) {
    this.ttsWorker = worker;
  }

  hasTTSWorker() {
    return !!this.ttsWorker;
  }

  getTTSWorkerInitPromise() {
    return this.ttsWorkerInitPromise;
  }

  setTTSWorkerInitPromise(promise) {
    this.ttsWorkerInitPromise = promise;
  }

  clearTTSWorkerInitPromise() {
    this.ttsWorkerInitPromise = null;
  }

  getWorkerInactivityTimeout() {
    return this.workerInactivityTimeout;
  }

  setWorkerInactivityTimeout(timeout) {
    this.workerInactivityTimeout = timeout;
  }

  clearWorkerInactivityTimeout() {
    if (this.workerInactivityTimeout) {
      clearTimeout(this.workerInactivityTimeout);
      this.workerInactivityTimeout = null;
    }
  }

  // Worker usage flag
  shouldUseWorker() {
    return this.useWorker;
  }

  setUseWorker(value) {
    this.useWorker = value;
  }

  /**
   * Cleanup all TTS resources to prevent memory leaks
   * Should be called when offscreen document is closing or when switching voices
   */
  cleanupTTSResources() {
    log('[ClipAIble Offscreen] === CLEANUP TTS RESOURCES ===', {
      timestamp: Date.now(),
      hasTtsModule: this.hasTTSModule(),
      hasTtsWorker: this.hasTTSWorker(),
      hasWorkerTimeout: !!this.workerInactivityTimeout
    });
    
    // Clear worker inactivity timeout
    this.clearWorkerInactivityTimeout();
    
    // Terminate TTS Worker if exists
    if (this.ttsWorker) {
      try {
        log('[ClipAIble Offscreen] Terminating TTS Worker during cleanup');
        this.ttsWorker.terminate();
        this.ttsWorker = null;
        this.clearTTSWorkerInitPromise();
      } catch (error) {
        logError('[ClipAIble Offscreen] Failed to terminate TTS Worker', error);
      }
    }
    
    // Cleanup Piper TTS module - release ONNX Runtime sessions
    if (this.ttsModule) {
      try {
        // Try to release ONNX Runtime sessions if accessible
        if (this.ttsModule.TtsSession && this.ttsModule.TtsSession._instance) {
          const instance = this.ttsModule.TtsSession._instance;
          
          // Try to release ONNX Runtime session
          if (instance._ortSession && typeof instance._ortSession.release === 'function') {
            try {
              instance._ortSession.release();
              log('[ClipAIble Offscreen] ONNX Runtime session released during cleanup');
            } catch (releaseError) {
              logWarn('[ClipAIble Offscreen] Failed to release ONNX Runtime session', releaseError);
            }
          }
          
          // Clear singleton instance
          this.ttsModule.TtsSession._instance = null;
        }
        
        // Clear module reference
        this.ttsModule = null;
        log('[ClipAIble Offscreen] TTS module cleared');
      } catch (error) {
        logError('[ClipAIble Offscreen] Failed to cleanup TTS module', error);
        // Clear reference anyway
        this.ttsModule = null;
      }
    }
    
    // Reset flags
    this.wasmPreloaded = false;
    this.voiceModelsPreloaded = false;
    this.lastUsedVoiceId = null;
    this.voiceSwitchRequested = false;
    
    log('[ClipAIble Offscreen] === CLEANUP COMPLETE ===', {
      timestamp: Date.now()
    });
  }

  /**
   * Reset all state to initial values
   * Useful for testing or complete reset
   */
  reset() {
    this.cleanupTTSResources();
    this.useWorker = true;
  }
}

// Export singleton instance
export const state = new OffscreenState();



























