// @ts-check
// Injected script for Piper TTS execution in page context
// This script runs in MAIN world and has access to window object

/**
 * Execute Piper TTS in page context
 * @param {string} text - Text to convert
 * @param {{voice: string, language: string, speed: number, moduleUrl: string}} options - TTS options
 * @returns {Promise<string>} Base64-encoded WAV audio
 * @throws {Error} If window is not available
 * @throws {Error} If moduleUrl is missing
 * @throws {Error} If Piper TTS module import fails
 * @throws {Error} If textToSpeech function is not found
 * @throws {Error} If TTS synthesis fails
 */
async function executePiperTTS(text, options) {
  const { voice, language, speed, moduleUrl } = options;
  
  if (typeof window === 'undefined') {
    throw new Error('window is not available');
  }
  
  if (!moduleUrl) {
    throw new Error('moduleUrl is required. chrome.runtime is not available in MAIN world.');
  }
  
  // DEBUG: Logging in MAIN world (no access to CONFIG, always logs for debugging)
  // Note: This runs in page context where modules are not available
  console.log('[ClipAIble] executePiperTTS called', { textLength: text.length, voice, language, speed, moduleUrl });
  
  try {
    // Import Piper TTS module dynamically using URL passed from service worker
    console.log('[ClipAIble] Importing Piper TTS module from', moduleUrl);
    
    const piperTTSModule = await import(moduleUrl);
    
    console.log('[ClipAIble] Piper TTS module imported', { 
      hasTextToSpeech: typeof piperTTSModule.textToSpeech === 'function',
      moduleKeys: Object.keys(piperTTSModule)
    });
    
    if (typeof piperTTSModule.textToSpeech !== 'function') {
      throw new Error('textToSpeech function not found in Piper TTS module');
    }
    
    // Execute TTS
    console.log('[ClipAIble] Calling textToSpeech...', { textLength: text.length, voice, language });
    const audioBuffer = await piperTTSModule.textToSpeech(text, { voice, language, speed });
    
    console.log('[ClipAIble] Piper TTS synthesis complete', { 
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
    // DEBUG: Logging in MAIN world (no access to CONFIG, always logs for debugging)
    console.log('[ClipAIble] Audio converted to base64', { base64Length: base64.length });
    return base64;
  } catch (error) {
    console.error('[ClipAIble] Piper TTS execution error', error);
    console.error('[ClipAIble] Error stack', error.stack);
    throw new Error(`Piper TTS execution error: ${error.message}`);
  }
}

// Export function to global scope for executeScript
// This must be executed immediately when script loads
(function() {
  if (typeof window !== 'undefined') {
    window.executePiperTTS = executePiperTTS;
    console.log('[ClipAIble] executePiperTTS function exported to window', typeof window.executePiperTTS);
  } else {
    console.error('[ClipAIble] window is undefined, cannot export executePiperTTS');
  }
})();




