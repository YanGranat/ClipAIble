// @ts-check
// Offline TTS module using WASM TTS library (Sherpa-ONNX)
// Works without API keys, uses WebAssembly TTS engine
// No microphone permissions required, generates audio directly

import { log, logError } from '../utils/logging.js';
// Dynamic import - js-tts-wrapper requires window object
// Will be imported only when needed and only in contexts with window

/**
 * Configuration for offline WASM TTS
 */
export const OFFLINE_TTS_CONFIG = {
  DEFAULT_VOICE: 'vits', // Default voice type for Sherpa-ONNX
  DEFAULT_SPEED: 1.0,
  DEFAULT_PITCH: 1.0,
  DEFAULT_VOLUME: 1.0,
  MAX_INPUT: 10000, // Higher limit for WASM TTS
  SAMPLE_RATE: 22050, // Standard sample rate for Sherpa-ONNX
  CHANNELS: 1, // Mono
  // CDN URLs for Sherpa-ONNX WASM files (can be overridden)
  WASM_BASE_URL: 'https://cdn.jsdelivr.net/gh/willwade/js-tts-wrapper-assets@main/sherpaonnx/tts',
  MODELS_URL: 'https://cdn.jsdelivr.net/gh/willwade/js-tts-wrapper-assets@main/sherpaonnx/models/merged_models.json'
};

// WASM TTS instance (lazy-loaded)
let wasmTTSInstance = null;
let wasmTTSLoading = null;

/**
 * Cleanup WASM TTS instance to free memory
 * Should be called when TTS is no longer needed or before switching voices
 */
export function cleanupWASMTTS() {
  if (wasmTTSInstance) {
    try {
      // Check if instance has cleanup/dispose method
      if (typeof wasmTTSInstance.dispose === 'function') {
        wasmTTSInstance.dispose();
      } else if (typeof wasmTTSInstance.cleanup === 'function') {
        wasmTTSInstance.cleanup();
      } else if (typeof wasmTTSInstance.close === 'function') {
        wasmTTSInstance.close();
      }
      
      // Clear instance reference
      wasmTTSInstance = null;
      wasmTTSLoading = null;
      
      const useConsole = typeof log === 'undefined';
      const logFn = useConsole ? console.log : log;
      logFn('[ClipAIble] WASM TTS instance cleaned up');
    } catch (error) {
      const logErrorFn = typeof logError === 'undefined' ? console.error : logError;
      logErrorFn('[ClipAIble] Failed to cleanup WASM TTS instance', error);
      // Clear reference anyway
      wasmTTSInstance = null;
      wasmTTSLoading = null;
    }
  }
}

/**
 * Check if window object is available (required for js-tts-wrapper)
 * @returns {boolean} True if window is available
 */
function hasWindow() {
  return typeof window !== 'undefined';
}

/**
 * Initialize WASM TTS library (Sherpa-ONNX)
 * Requires window object - will throw error if called from service worker
 * @returns {Promise<SherpaOnnxWasmTTSClient>} WASM TTS instance
 */
async function initWASMTTS() {
  // Check if window is available
  if (!hasWindow()) {
    throw new Error('WASM TTS requires window object. Cannot run in service worker. Use offscreen document or content script.');
  }
  
  if (wasmTTSInstance) {
    return wasmTTSInstance;
  }
  
  if (wasmTTSLoading) {
    return wasmTTSLoading;
  }
  
  wasmTTSLoading = (async () => {
    try {
      // Use console.log when log is not available (injected script context)
      const useConsole = typeof log === 'undefined';
      const logFn = useConsole ? console.log : log;
      const logErrorFn = useConsole ? console.error : logError;
      
      logFn('[ClipAIble] Initializing Sherpa-ONNX WASM TTS...');
      
      // Dynamic import - only load when window is available
      // Use chrome.runtime.getURL to get the correct path in extension context
      const libUrl = typeof chrome !== 'undefined' && chrome.runtime 
        ? chrome.runtime.getURL('lib/js-tts-wrapper.js')
        : '../../lib/js-tts-wrapper.js';
      
      logFn('[ClipAIble] Importing js-tts-wrapper from', libUrl);
      const { SherpaOnnxWasmTTSClient } = await import(libUrl);
      logFn('[ClipAIble] js-tts-wrapper imported successfully');
      
      // Create Sherpa-ONNX WASM client
      // Using CDN URLs for WASM files and models
      const ttsClient = new SherpaOnnxWasmTTSClient({
        wasmPath: `${OFFLINE_TTS_CONFIG.WASM_BASE_URL}/sherpa-onnx-tts.js`,
        wasmBaseUrl: OFFLINE_TTS_CONFIG.WASM_BASE_URL,
        mergedModelsUrl: OFFLINE_TTS_CONFIG.MODELS_URL
      });
      
      logFn('[ClipAIble] WASM TTS client created');
      // Note: Initialization happens lazily on first use (synthToBytes or getVoices)
      // No need to call initialize() or initializeWasm() explicitly
      // The client will auto-initialize when needed
      
      logFn('[ClipAIble] Sherpa-ONNX WASM TTS client ready (will initialize on first use)');
      return ttsClient;
      
    } catch (error) {
      const logErrorFn = typeof logError === 'undefined' ? console.error : logError;
      logErrorFn('[ClipAIble] Failed to initialize WASM TTS', error);
      wasmTTSLoading = null;
      throw new Error(`Failed to initialize WASM TTS: ${error.message}`);
    }
  })();
  
  wasmTTSInstance = await wasmTTSLoading;
  return wasmTTSInstance;
}

/**
 * Get available voices from WASM TTS
 * @returns {Promise<Array<Object>>} Array of available voices
 */
export async function getAvailableVoices() {
  try {
    const tts = await initWASMTTS();
    
    // Get voices from Sherpa-ONNX
    const voices = await tts.getVoices();
    
    // Map to our format
    return voices.map(voice => ({
      id: voice.id || voice.name,
      name: voice.name || voice.id,
      language: voice.language,
      gender: voice.gender
    }));
  } catch (error) {
    logError('Failed to get available voices', error);
    // Return default voices if initialization fails
    return [
      { id: 'vits', name: 'VITS (Default)' },
      { id: 'kokoro', name: 'Kokoro' },
      { id: 'matcha', name: 'Matcha' }
    ];
  }
}

/**
 * Find voice by name or language
 * @param {string} voiceName - Voice name to find (optional)
 * @param {string} language - Language code (e.g., 'en-US', 'ru-RU') (optional)
 * @returns {Promise<Object|null>} Found voice or null
 */
export async function findVoice(voiceName = null, language = null) {
  const voices = await getAvailableVoices();
  
  if (voiceName) {
    // Try exact match first
    let voice = voices.find(v => v.id === voiceName || v.name === voiceName);
    if (voice) return voice;
    
    // Try partial match
    voice = voices.find(v => 
      v.id.toLowerCase().includes(voiceName.toLowerCase()) ||
      v.name.toLowerCase().includes(voiceName.toLowerCase())
    );
    if (voice) return voice;
  }
  
  if (language) {
    // Try language prefix match (e.g., 'en' matches 'en_US', 'en_GB')
    const langPrefix = language.split('-')[0].toLowerCase();
    let voice = voices.find(v => v.id.toLowerCase().startsWith(langPrefix));
    if (voice) return voice;
  }
  
  // Return default voice
  return voices.length > 0 ? voices[0] : null;
}

/**
 * Convert text to speech using WASM TTS
 * 
 * @param {string} text - Text to convert
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID (optional, uses default if not provided)
 * @param {number} options.speed - Speech speed 0.1-10.0 (default: 1.0)
 * @param {number} options.pitch - Pitch 0-2.0 (default: 1.0, may not be supported by all WASM TTS)
 * @param {number} options.volume - Volume 0-1.0 (default: 1.0, may not be supported by all WASM TTS)
 * @param {string} options.language - Language code (e.g., 'en-US', 'ru-RU') (optional)
 * @returns {Promise<ArrayBuffer>} Audio data as WAV ArrayBuffer
 */
export async function textToSpeech(text, options = {}) {
  const {
    voice: voiceName = null,
    speed = OFFLINE_TTS_CONFIG.DEFAULT_SPEED,
    pitch = OFFLINE_TTS_CONFIG.DEFAULT_PITCH,
    volume = OFFLINE_TTS_CONFIG.DEFAULT_VOLUME,
    language = null
  } = options;
  
  // Use console.log instead of log() when called from injected script (no logging module available)
  const useConsole = typeof log === 'undefined';
  const logFn = useConsole ? console.log : log;
  const logErrorFn = useConsole ? console.error : logError;
  
  logFn('[ClipAIble] WASM TTS request', { 
    textLength: text?.length, 
    voiceName, 
    speed, 
    pitch,
    volume,
    language
  });
  
  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }
  
  if (text.length > OFFLINE_TTS_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds WASM TTS limit: ${text.length} > ${OFFLINE_TTS_CONFIG.MAX_INPUT} characters`);
  }
  
  try {
    // Initialize WASM TTS
    logFn('[ClipAIble] Initializing WASM TTS...');
    const tts = await initWASMTTS();
    
    // Find voice
    const voice = await findVoice(voiceName, language);
    const voiceId = voice ? voice.id : OFFLINE_TTS_CONFIG.DEFAULT_VOICE;
    
    logFn('[ClipAIble] Using WASM TTS voice', { voiceId, voiceName: voice?.name });
    
    // Set voice before synthesis
    // Note: setVoice is synchronous, and synthToBytes will handle initialization automatically
    try {
      logFn('[ClipAIble] Setting voice...', { voiceId });
      tts.setVoice(voiceId);
    } catch (voiceError) {
      logFn('[ClipAIble] Voice setting failed, will use default or auto-select', { error: voiceError.message });
      // Continue anyway - synthToBytes may handle voice selection automatically
    }
    
    // Synthesize speech using Sherpa-ONNX
    // synthToBytes automatically initializes WASM if needed and returns audio as Uint8Array (already in WAV format)
    logFn('[ClipAIble] Synthesizing speech...', { textLength: text.length });
    const audioBytes = await tts.synthToBytes(text, {
      rate: speed, // Speed control
      // Note: pitch and volume may not be directly supported by Sherpa-ONNX
    });
    
    logFn('[ClipAIble] WASM TTS synthesis complete', { 
      audioSize: audioBytes.length,
      sampleRate: tts.sampleRate || OFFLINE_TTS_CONFIG.SAMPLE_RATE
    });
    
    // synthToBytes already returns WAV format bytes
    // Convert Uint8Array to ArrayBuffer
    const buffer = audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength);
    logFn('[ClipAIble] Audio buffer ready', { bufferSize: buffer.byteLength });
    return buffer;
    
  } catch (error) {
    logErrorFn('[ClipAIble] WASM TTS synthesis failed', error);
    throw new Error(`WASM TTS failed: ${error.message}`);
  }
}

// Note: audioBytesToWav function removed - synthToBytes already returns WAV format

