// Offline TTS module using Piper TTS Web
// Works without API keys, uses WebAssembly TTS engine
// No microphone permissions required, generates audio directly
// Requires browser context (window/document) - cannot run in service worker

import { log, logError } from '../utils/logging.js';

/**
 * Configuration for offline Piper TTS
 */
export const OFFLINE_TTS_CONFIG = {
  DEFAULT_VOICES: {
    'en': 'en_US-lessac-medium',      // Medium quality for English (verified: exists in library)
    'ru': 'ru_RU-dmitri-medium',      // Medium quality for Russian (verified: exists in library)
    'uk': 'uk_UA-ukrainian_tts-medium', // Medium quality for Ukrainian (verified: exists in library)
    'de': 'de_DE-thorsten-medium',     // Medium quality for German (verified: exists in library)
    'fr': 'fr_FR-siwis-medium',        // Medium quality for French (verified: exists in library)
    'es': 'es_ES-sharvard-medium',      // Medium quality for Spanish (verified: exists in library)
    'it': 'it_IT-paola-medium',        // Medium quality for Italian (verified: exists in library) - NOTE: riccardo only has x_low which is filtered
    'pt': 'pt_BR-faber-medium',        // Medium quality for Portuguese (verified: exists in library)
    'zh': 'zh_CN-huayan-medium',       // Medium quality for Chinese (verified: exists in library)
    'ja': null,                         // Japanese not available in library
    'ko': null                          // Korean not available in library
  },
  DEFAULT_SPEED: 1.0,
  DEFAULT_PITCH: 1.0,
  DEFAULT_VOLUME: 1.0,
  MAX_INPUT: 50000, // Higher limit for Piper TTS
  SAMPLE_RATE: 22050,
  CHANNELS: 1
};

// Piper TTS module (lazy-loaded)
let piperTTSModule = null;
let piperTTSLoading = null;

/**
 * Check if running in valid context (not service worker)
 */
function hasWindow() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Initialize Piper TTS module
 * Requires window object - will throw error if called from service worker
 */
async function initPiperTTS() {
  if (!hasWindow()) {
    throw new Error('Piper TTS requires window object. Cannot run in service worker. Use content script or popup.');
  }

  if (piperTTSModule) {
    return piperTTSModule;
  }

  if (piperTTSLoading) {
    return piperTTSLoading;
  }

  piperTTSLoading = (async () => {
    try {
      const useConsole = typeof log === 'undefined';
      const logFn = useConsole ? console.log : log;
      const logErrorFn = useConsole ? console.error : logError;

      logFn('[ClipAIble] Initializing Piper TTS...');

      // Dynamic import - use chrome.runtime.getURL in extension context
      // Use piper-tts-web.js (main entry point) instead of index.js
      const libUrl = typeof chrome !== 'undefined' && chrome.runtime
        ? chrome.runtime.getURL('node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js')
        : '../../node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js';

      logFn('[ClipAIble] Importing Piper TTS from', libUrl);
      
      // Set up import map for onnxruntime-web
      // Piper TTS uses dynamic import('onnxruntime-web'), which needs to be mapped
      // We'll create an import map in the document if it doesn't exist
      if (typeof document !== 'undefined' && document.head) {
        let importMap = document.querySelector('script[type="importmap"]');
        if (!importMap) {
          // Use local version from node_modules instead of CDN
          // According to package.json, default import is ort.bundle.min.mjs (includes WASM)
          const onnxRuntimeUrl = typeof chrome !== 'undefined' && chrome.runtime
            ? chrome.runtime.getURL('node_modules/onnxruntime-web/dist/ort.bundle.min.mjs')
            : '../../node_modules/onnxruntime-web/dist/ort.bundle.min.mjs';
          
          importMap = document.createElement('script');
          if (importMap instanceof HTMLScriptElement) {
            importMap.type = 'importmap';
            importMap.textContent = JSON.stringify({
              imports: {
                'onnxruntime-web': onnxRuntimeUrl
              }
            });
            document.head.appendChild(importMap);
            logFn('[ClipAIble] Created import map for onnxruntime-web', { onnxRuntimeUrl });
          }
        }
      }
      
      piperTTSModule = await import(libUrl);
      logFn('[ClipAIble] Piper TTS imported successfully', { moduleKeys: Object.keys(piperTTSModule) });
      
      // Note: The library will use CDN for WASM files (WASM_BASE, ONNX_BASE)
      // This is fine - WASM files are small and CDN is reliable
      // The import map we created handles the onnxruntime-web module import
      
      return piperTTSModule;
    } catch (error) {
      const logErrorFn = typeof logError === 'undefined' ? console.error : logError;
      logErrorFn('[ClipAIble] Failed to initialize Piper TTS', error);
      piperTTSLoading = null;
      throw new Error(`Failed to initialize Piper TTS: ${error.message}`);
    }
  })();

  piperTTSModule = await piperTTSLoading;
  return piperTTSModule;
}

/**
 * Detect language from text using simple heuristics
 * Only used when language='auto' in offline TTS context
 * @param {string} text - Text to analyze
 * @returns {string} Detected language code (e.g., 'en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko')
 */
function detectLanguageFromText(text) {
  if (!text || text.length === 0) return 'en';
  
  // Sample first 1000 characters for faster detection
  const sample = text.substring(0, 1000);
  const sampleLower = sample.toLowerCase();
  
  // Count character types
  let cyrillicCount = 0;
  let latinCount = 0;
  let cjkCount = 0;
  let arabicCount = 0;
  
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    
    // Cyrillic: U+0400-U+04FF
    if (char >= 0x0400 && char <= 0x04FF) {
      cyrillicCount++;
    }
    // Basic Latin: U+0000-U+007F, Latin-1 Supplement: U+0080-U+00FF
    else if ((char >= 0x0000 && char <= 0x007F) || (char >= 0x0080 && char <= 0x00FF)) {
      latinCount++;
    }
    // CJK (Chinese, Japanese, Korean): U+4E00-U+9FFF, U+3040-U+309F, U+30A0-U+30FF, U+AC00-U+D7AF
    else if ((char >= 0x4E00 && char <= 0x9FFF) || 
             (char >= 0x3040 && char <= 0x309F) || 
             (char >= 0x30A0 && char <= 0x30FF) ||
             (char >= 0xAC00 && char <= 0xD7AF)) {
      cjkCount++;
    }
    // Arabic: U+0600-U+06FF
    else if (char >= 0x0600 && char <= 0x06FF) {
      arabicCount++;
    }
  }
  
  const total = sample.length;
  
  // Determine primary script
  if (cyrillicCount > total * 0.1) {
    // Cyrillic detected - determine if Russian or Ukrainian
    // Ukrainian has specific letters: і, ї, є, ґ
    const ukrainianMarkers = (sample.match(/[іїєґІЇЄҐ]/gi) || []).length;
    const russianMarkers = (sample.match(/[ыэъЫЭЪ]/gi) || []).length;
    
    if (ukrainianMarkers > russianMarkers && ukrainianMarkers > 3) {
      return 'uk';
    }
    return 'ru';
  }
  
  if (cjkCount > total * 0.1) {
    // CJK detected - determine Chinese, Japanese, or Korean
    // Japanese has hiragana/katakana: U+3040-U+30FF
    // Korean has hangul: U+AC00-U+D7AF
    // Chinese is mostly U+4E00-U+9FFF
    
    let japaneseCount = 0;
    let koreanCount = 0;
    let chineseCount = 0;
    
    for (let i = 0; i < sample.length; i++) {
      const char = sample.charCodeAt(i);
      if (char >= 0x3040 && char <= 0x30FF) japaneseCount++;
      else if (char >= 0xAC00 && char <= 0xD7AF) koreanCount++;
      else if (char >= 0x4E00 && char <= 0x9FFF) chineseCount++;
    }
    
    if (japaneseCount > koreanCount && japaneseCount > chineseCount) return 'ja';
    if (koreanCount > chineseCount) return 'ko';
    return 'zh';
  }
  
  if (arabicCount > total * 0.1) {
    return 'ar';
  }
  
  // Latin script - use common words to determine language
  // Check for common words/phrases in different languages
  const commonWords = {
    'en': /\b(the|and|is|are|was|were|this|that|with|from|have|has|will|would|should|could)\b/gi,
    'de': /\b(der|die|das|und|ist|sind|war|waren|mit|von|haben|hat|wird|würde|sollte|könnte)\b/gi,
    'fr': /\b(le|la|les|et|est|sont|était|étaient|avec|de|avoir|a|sera|serait|devrait|pourrait)\b/gi,
    'es': /\b(el|la|los|las|y|es|son|era|eran|con|de|tener|tiene|será|sería|debería|podría)\b/gi,
    'it': /\b(il|la|lo|gli|le|e|è|sono|era|erano|con|di|avere|ha|sarà|sarebbe|dovrebbe|potrebbe)\b/gi,
    'pt': /\b(o|a|os|as|e|é|são|era|eram|com|de|ter|tem|será|seria|deveria|poderia)\b/gi
  };
  
  let maxMatches = 0;
  let detectedLang = 'en';
  
  for (const [lang, regex] of Object.entries(commonWords)) {
    const matches = (sampleLower.match(regex) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedLang = lang;
    }
  }
  
  // If no strong signal, default to English
  return detectedLang;
}

/**
 * Get recommended voice for language
 * @param {string} language - Language code (e.g., 'en', 'en-US', 'ru-RU')
 * @returns {string} Voice ID
 */
function getRecommendedVoice(language) {
  if (!language) return OFFLINE_TTS_CONFIG.DEFAULT_VOICES['en'];
  const langCode = language.split('-')[0].toLowerCase();
  return OFFLINE_TTS_CONFIG.DEFAULT_VOICES[langCode] || OFFLINE_TTS_CONFIG.DEFAULT_VOICES['en'];
}

/**
 * Get available voices from Piper TTS
 * @returns {Promise<Array<Object>>} Array of available voices
 */
export async function getAvailableVoices() {
  try {
    if (!hasWindow()) {
      // Return default voices if called from service worker
      return Object.entries(OFFLINE_TTS_CONFIG.DEFAULT_VOICES).map(([lang, voiceId]) => ({
        id: voiceId,
        name: `${lang.toUpperCase()} Voice`,
        language: lang
      }));
    }

    const tts = await initPiperTTS();
    
    // Check if voices function is available (it's exported as a named export)
    if (!tts || typeof tts.voices !== 'function') {
      logError('Piper TTS voices() function not available', { 
        hasTTS: !!tts,
        ttsKeys: tts ? Object.keys(tts) : []
      });
      return Object.entries(OFFLINE_TTS_CONFIG.DEFAULT_VOICES).map(([lang, voiceId]) => ({
        id: voiceId,
        name: `${lang.toUpperCase()} Voice`,
        language: lang
      }));
    }

    const voices = await tts.voices();
    
    // CRITICAL: tts.voices() returns Voice[] array, not an object!
    // Each Voice has structure: { key: VoiceId, name: string, language: {...}, quality: Quality, ... }
    // For offline TTS, use key directly (no need to map to id - offline TTS works differently)
    return (Array.isArray(voices) ? voices : []).map((voice) => ({
      key: voice.key, // Use key directly for offline TTS
      id: voice.key, // Keep id for backward compatibility with UI code
      name: voice.name || voice.key,
      language: voice.language?.code || voice.language || 'unknown',
      quality: voice.quality || 'medium'
    }));
  } catch (error) {
    logError('Failed to get available voices', error);
    // Return default voices if initialization fails
    return Object.entries(OFFLINE_TTS_CONFIG.DEFAULT_VOICES).map(([lang, voiceId]) => ({
      id: voiceId,
      name: `${lang.toUpperCase()} Voice`,
      language: lang
    }));
  }
}

/**
 * Get stored (downloaded) voice IDs
 * @returns {Promise<Array<string>>} Array of downloaded voice IDs
 */
export async function getStoredVoices() {
  try {
    if (!hasWindow()) {
      return [];
    }

    const tts = await initPiperTTS();
    
    // Check if stored function is available
    if (!tts || typeof tts.stored !== 'function') {
      logError('Piper TTS stored() function not available', { 
        hasTTS: !!tts,
        ttsKeys: tts ? Object.keys(tts) : []
      });
      return [];
    }

    return await tts.stored();
  } catch (error) {
    logError('Failed to get stored voices', error);
    return [];
  }
}

/**
 * Check if voice is already downloaded
 * @param {string} voiceId - Voice ID to check
 * @returns {Promise<boolean>} True if voice is downloaded
 */
export async function isVoiceDownloaded(voiceId) {
  try {
    const stored = await getStoredVoices();
    return stored.includes(voiceId);
  } catch (error) {
    logError('Failed to check if voice is downloaded', error);
    return false;
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
  
  // Ignore invalid voice names
  if (voiceName && voiceName !== '0' && voiceName !== '') {
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
  
  // Ignore 'auto' language
  if (language && language !== 'auto') {
    // Try language prefix match (e.g., 'en' matches 'en_US', 'en_GB')
    const langPrefix = language.split('-')[0].toLowerCase();
    let voice = voices.find(v => {
      const voiceLang = v.language?.toLowerCase() || '';
      const voiceId = v.id?.toLowerCase() || '';
      return voiceLang.startsWith(langPrefix) || voiceId.startsWith(langPrefix);
    });
    if (voice) return voice;
  }
  
  // Return recommended voice for language or first available
  if (language && language !== 'auto') {
    const recommendedId = getRecommendedVoice(language);
    const voice = voices.find(v => v.id === recommendedId);
    if (voice) return voice;
  }
  
  return voices.length > 0 ? voices[0] : null;
}

/**
 * Convert text to speech using Piper TTS
 * 
 * @param {string} text - Text to convert
 * @param {Object} options - TTS options
 * @param {string} options.voice - Voice ID (optional, auto-select by language)
 * @param {string} options.language - Language code (e.g., 'en', 'ru') (optional)
 * @param {number} options.speed - Speech speed (not directly supported, but kept for compatibility)
 * @param {Function} options.onProgress - Progress callback for model download (optional)
 * @returns {Promise<ArrayBuffer>} Audio data as WAV ArrayBuffer
 */
export async function textToSpeech(text, options = {}) {
  let {
    voice: voiceName = null,
    language = null,
    speed = OFFLINE_TTS_CONFIG.DEFAULT_SPEED,
    onProgress = null
  } = options;

  const useConsole = typeof log === 'undefined';
  const logFn = useConsole ? console.log : log;
  const logErrorFn = useConsole ? console.error : logError;

  // Normalize voice - if it's '0', empty string, or invalid, treat as null
  if (voiceName === '0' || voiceName === '' || voiceName === null || voiceName === undefined) {
    voiceName = null;
  }

  // Normalize language - if it's 'auto', detect from text
  if (language === 'auto' || language === null || language === undefined) {
    // Auto-detect language from text (only for offline TTS when language='auto')
    language = detectLanguageFromText(text);
    logFn('[ClipAIble] Auto-detected language from text', { detectedLanguage: language, textSample: text.substring(0, 100) });
  }

  logFn('[ClipAIble] Piper TTS request', { 
    textLength: text?.length, 
    voiceName, 
    language,
    speed
  });

  if (!text || text.length === 0) {
    throw new Error('No text provided for TTS');
  }

  if (text.length > OFFLINE_TTS_CONFIG.MAX_INPUT) {
    throw new Error(`Text exceeds Piper TTS limit: ${text.length} > ${OFFLINE_TTS_CONFIG.MAX_INPUT} characters`);
  }

  if (!hasWindow()) {
    throw new Error('Piper TTS requires window object. Cannot run in service worker.');
  }

  try {
    // Initialize Piper TTS
    logFn('[ClipAIble] Initializing Piper TTS...');
    const tts = await initPiperTTS();

    // Check if predict function is available
    if (!tts || typeof tts.predict !== 'function') {
      logErrorFn('[ClipAIble] Piper TTS predict() function not available', { 
        hasTTS: !!tts,
        ttsKeys: tts ? Object.keys(tts) : []
      });
      throw new Error('Piper TTS predict() function not available');
    }

    // Find or select voice
    let voice = null;
    let voiceId = null;
    
    if (voiceName) {
      voice = await findVoice(voiceName, language);
      if (voice) {
        // For offline TTS, use key directly (it's the actual voice ID for Piper TTS)
        voiceId = voice.key || voice.id;
      }
    }
    
    // If no valid voice found, use recommended voice for language
    if (!voiceId) {
      voiceId = getRecommendedVoice(language);
      logFn('[ClipAIble] Using recommended voice for language', { language, voiceId });
    }

    logFn('[ClipAIble] Using Piper TTS voice', { voiceId, voiceName: voice?.name || voiceId });

    // Check if voice is downloaded, if not - download first
    const isDownloaded = await isVoiceDownloaded(voiceId);
    if (!isDownloaded) {
      logFn('[ClipAIble] Voice not found, downloading...', { voiceId });
      
      if (!tts.download || typeof tts.download !== 'function') {
        logErrorFn('[ClipAIble] Piper TTS download() function not available', { 
          hasTTS: !!tts,
          ttsKeys: tts ? Object.keys(tts) : []
        });
        throw new Error('Piper TTS download() function not available');
      }

      // Track last logged percent to avoid spam
      let lastLoggedPercent = -1;
      
      await tts.download(voiceId, (progress) => {
        const percent = progress.total > 0 
          ? Math.round((progress.loaded * 100) / progress.total)
          : 0;
        
        // Log only every 5% to avoid spam
        if (percent >= lastLoggedPercent + 5 || percent === 100) {
          logFn('[ClipAIble] Download progress', { voiceId, percent, loaded: progress.loaded, total: progress.total });
          lastLoggedPercent = percent;
        }
        
        if (onProgress) {
          onProgress({
            voiceId,
            url: progress.url || '',
            loaded: progress.loaded || 0,
            total: progress.total || 0,
            percent
          });
        }
      });
      
      logFn('[ClipAIble] Voice downloaded successfully', { voiceId });
    }

    // Generate speech
    logFn('[ClipAIble] Generating speech...', { textLength: text.length, voiceId });
    
    // Wrap progress callback to reduce logging spam
    let lastPredictPercent = -1;
    const wrappedProgress = onProgress ? (progress) => {
      const percent = progress.total > 0 
        ? Math.round((progress.loaded * 100) / progress.total)
        : 0;
      
      // Log only every 10% for synthesis progress
      if (percent >= lastPredictPercent + 10 || percent === 100) {
        logFn('[ClipAIble] Synthesis progress', { percent, loaded: progress.loaded, total: progress.total });
        lastPredictPercent = percent;
      }
      
      onProgress({
        voiceId,
        url: progress.url || '',
        loaded: progress.loaded || 0,
        total: progress.total || 0,
        percent
      });
    } : undefined;
    
    // predict() takes config object and optional progress callback
    // voiceId is already the key from Piper TTS (e.g., "ru_RU-irina-medium")
    const wavBlob = await tts.predict({
      text,
      voiceId: voiceId // This is the key from Piper TTS library
    }, wrappedProgress);

    logFn('[ClipAIble] Piper TTS synthesis complete', { 
      size: wavBlob.size,
      type: wavBlob.type
    });

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await wavBlob.arrayBuffer();
    logFn('[ClipAIble] Audio buffer ready', { bufferSize: arrayBuffer.byteLength });
    
    return arrayBuffer;
    
  } catch (error) {
    logErrorFn('[ClipAIble] Piper TTS synthesis failed', error);
    throw new Error(`Piper TTS failed: ${error.message}`);
  }
}

