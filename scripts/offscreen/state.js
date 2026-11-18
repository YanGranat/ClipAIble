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
    this.activePredictCalls = 0; // Track active predict calls to prevent termination during processing
    this.processingRunId = null;
    this.workerRequests = new Set();
  }

  // TTS Module management
  getProcessingRunId() {
    return this.processingRunId;
  }

  setProcessingRunId(processingRunId) {
    this.processingRunId = processingRunId;
  }

  registerWorkerRequest(onCancel) {
    this.workerRequests.add(onCancel);
    return () => this.workerRequests.delete(onCancel);
  }

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

  // Active predict calls tracking (prevents Worker termination during processing)
  getActivePredictCalls() {
    return this.activePredictCalls || 0;
  }

  incrementActivePredictCalls() {
    this.activePredictCalls = (this.activePredictCalls || 0) + 1;
  }

  decrementActivePredictCalls() {
    this.activePredictCalls = Math.max(0, (this.activePredictCalls || 0) - 1);
  }

  /** Retire only the captured worker, retaining the active processing owner. */
  retireTTSWorker(expectedWorker = this.ttsWorker, error = new Error('TTS Worker restarted')) {
    if (expectedWorker !== this.ttsWorker) return false;
    this.ttsWorker = null;
    this.clearTTSWorkerInitPromise();
    this.clearWorkerInactivityTimeout();
    this.activePredictCalls = 0;
    const requests = [...this.workerRequests];
    this.workerRequests.clear();
    for (const cancel of requests) {
      try { cancel(error); } catch (failure) {
        logWarn('[ClipAIble Offscreen] Failed to release a worker request', { error: failure.message });
      }
    }
    if (expectedWorker) {
      try { expectedWorker.terminate(); } catch (failure) {
        logWarn('[ClipAIble Offscreen] Failed to retire a worker', { error: failure.message });
      }
    }
    return true;
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
    this.processingRunId = null;
    this.retireTTSWorker(this.ttsWorker, new Error('TTS processing cancelled'));
    
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
    this.processingRunId = null;
    
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



























