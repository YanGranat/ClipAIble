// Injected script for WASM TTS execution in page context
// This script runs in MAIN world and has access to window object

/**
 * Execute WASM TTS in page context
 * @param {string} text - Text to convert
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID
 * @param {number} options.speed - Speech speed
 * @param {number} options.pitch - Pitch
 * @param {number} options.volume - Volume
 * @param {string} options.language - Language code
 * @param {string} options.moduleUrl - URL of the WASM TTS module (passed from service worker)
 * @returns {Promise<string>} Base64-encoded WAV audio
 */
async function executeWASMTTS(text, options) {
  const { voice, speed, pitch, volume, language, moduleUrl } = options;
  
  if (typeof window === 'undefined') {
    throw new Error('window is not available');
  }
  
  if (!moduleUrl) {
    throw new Error('moduleUrl is required. chrome.runtime is not available in MAIN world.');
  }
  
  console.log('[ClipAIble] executeWASMTTS called', { textLength: text.length, voice, speed, moduleUrl });
  
  try {
    // Import WASM TTS module dynamically using URL passed from service worker
    console.log('[ClipAIble] Importing WASM TTS module from', moduleUrl);
    
    const wasmTTSModule = await import(moduleUrl);
    
    console.log('[ClipAIble] WASM TTS module imported', { 
      hasTextToSpeech: typeof wasmTTSModule.textToSpeech === 'function',
      moduleKeys: Object.keys(wasmTTSModule)
    });
    
    if (typeof wasmTTSModule.textToSpeech !== 'function') {
      throw new Error('textToSpeech function not found in WASM TTS module');
    }
    
    // Execute TTS
    console.log('[ClipAIble] Calling textToSpeech...', { textLength: text.length });
    const audioBuffer = await wasmTTSModule.textToSpeech(text, { voice, speed, pitch, volume, language });
    
    console.log('[ClipAIble] WASM TTS synthesis complete', { 
      audioSize: audioBuffer?.byteLength,
      audioType: audioBuffer?.constructor?.name
    });
    
    if (!audioBuffer || !(audioBuffer instanceof ArrayBuffer)) {
      throw new Error(`Invalid audio buffer: expected ArrayBuffer, got ${audioBuffer?.constructor?.name || typeof audioBuffer}`);
    }
    
    // Convert ArrayBuffer to base64 for transfer
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    console.log('[ClipAIble] Audio converted to base64', { base64Length: base64.length });
    return base64;
  } catch (error) {
    console.error('[ClipAIble] WASM TTS execution error', error);
    console.error('[ClipAIble] Error stack', error.stack);
    throw new Error(`WASM TTS execution error: ${error.message}`);
  }
}

// Export function to global scope for executeScript
// This must be executed immediately when script loads
(function() {
  if (typeof window !== 'undefined') {
    window.executeWASMTTS = executeWASMTTS;
    console.log('[ClipAIble] executeWASMTTS function exported to window', typeof window.executeWASMTTS);
  } else {
    console.error('[ClipAIble] window is undefined, cannot export executeWASMTTS');
  }
})();

