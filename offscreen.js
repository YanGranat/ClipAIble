// offscreen.js - Simplified version without import maps
// Just use direct imports with proper paths

console.log('[ClipAIble Offscreen] === DOCUMENT LOADED ===', {
  timestamp: Date.now(),
  url: window.location.href,
  userAgent: navigator.userAgent.substring(0, 100)
});

let ttsModule = null;
let lastUsedVoiceId = null; // Track last used voice to detect voice switching
let voiceSwitchRequested = false; // Flag to request offscreen document recreation

// Initialize Piper TTS
async function initPiperTTS() {
  const initStartTime = Date.now();
  console.log('[ClipAIble Offscreen] initPiperTTS() called', {
    timestamp: initStartTime,
    ttsModuleExists: !!ttsModule
  });
  
  if (ttsModule) {
    console.log('[ClipAIble Offscreen] TTS module already loaded, returning cached');
    return ttsModule;
  }
  
  try {
    console.log('[ClipAIble Offscreen] Loading Piper TTS module...');
    
    // Now import piper-tts-web - it should use the pre-configured ONNX Runtime
    const moduleUrl = chrome.runtime.getURL('node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js');
    console.log('[ClipAIble Offscreen] Module URL:', { moduleUrl });
    
    const importStartTime = Date.now();
    const module = await import(moduleUrl);
    const importDuration = Date.now() - importStartTime;
    
    console.log('[ClipAIble Offscreen] Module import completed', {
      duration: importDuration,
      moduleKeys: Object.keys(module),
      moduleKeysCount: Object.keys(module).length
    });
    
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
    
    console.log('[ClipAIble Offscreen] Piper TTS module loaded successfully', {
      ...moduleInfo,
      totalDuration: Date.now() - initStartTime
    });
    
    ttsModule = module;
    return ttsModule;
    
  } catch (error) {
    // Check if error is related to onnxruntime-web import
    const isOnnxError = error.message && (
      error.message.includes('onnxruntime-web') ||
      error.message.includes('Failed to resolve module specifier') ||
      error.stack?.includes('onnxruntime-web')
    );
    
    console.error('[ClipAIble Offscreen] === FAILED TO LOAD PIPER TTS ===', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      isOnnxError,
      duration: Date.now() - initStartTime
    });
    throw error;
  }
}

// Language detection (same as before)
function detectLanguage(text) {
  if (!text || text.length === 0) return 'en';
  
  const sample = text.substring(0, 1000);
  let cyrillicCount = 0;
  let cjkCount = 0;
  
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    if (char >= 0x0400 && char <= 0x04FF) cyrillicCount++;
    if (char >= 0x4E00 && char <= 0x9FFF) cjkCount++;
  }
  
  const total = sample.length;
  
  if (cyrillicCount > total * 0.1) {
    const ukMarkers = (sample.match(/[іїєґ]/gi) || []).length;
    const ruMarkers = (sample.match(/[ыэъ]/gi) || []).length;
    return ukMarkers > ruMarkers && ukMarkers > 3 ? 'uk' : 'ru';
  }
  
  if (cjkCount > total * 0.1) return 'zh';
  
  // Check for other languages
  // IMPORTANT: Use more specific patterns to avoid false positives
  // Single-letter words like "a", "o", "e" are too common across languages
  const patterns = {
    'de': /\b(der|die|das|und|ist|sind|haben|sein|werden|können)\b/gi,
    'fr': /\b(le|la|les|et|est|sont|avoir|être|être|peuvent|dans|pour)\b/gi,
    'es': /\b(el|la|los|y|es|son|tener|ser|estar|pueden|con|por)\b/gi,
    'it': /\b(il|la|lo|e|è|sono|avere|essere|possono|con|per)\b/gi,
    'pt': /\b(o|a|os|e|é|são|ter|ser|estar|podem|com|para|que|não|uma|um)\b/gi,
    'en': /\b(the|and|is|are|have|has|been|will|would|could|should|this|that|with|from|for)\b/gi
  };
  
  let maxMatches = 0;
  let lang = 'en';
  
  // Count matches for each language
  const matchCounts = {};
  for (const [code, pattern] of Object.entries(patterns)) {
    const matches = (sample.match(pattern) || []).length;
    matchCounts[code] = matches;
    if (matches > maxMatches) {
      maxMatches = matches;
      lang = code;
    }
  }
  
  // Require minimum threshold to avoid false positives
  // If no language has significant matches, default to English
  const minThreshold = Math.max(3, Math.floor(sample.length / 200)); // At least 3 matches or 0.5% of text
  if (maxMatches < minThreshold) {
    lang = 'en';
  }
  
  // Log language detection for debugging
  console.log('[ClipAIble Offscreen] Language detection result', {
    detected: lang,
    maxMatches,
    minThreshold,
    matchCounts,
    sampleLength: sample.length,
    samplePreview: sample.substring(0, 100)
  });
  
  return lang;
}

// Default voices - using MEDIUM quality models for better quality
// Based on actual available voices from piper-tts-web library
// Note: ja (Japanese) and ko (Korean) are not available in the library
const DEFAULT_VOICES = {
  'en': 'en_US-lessac-medium',      // Medium quality for English (verified: exists in library)
  'ru': 'ru_RU-dmitri-medium',      // Medium quality for Russian (verified: exists in library)
  'uk': 'uk_UA-ukrainian_tts-medium', // Medium quality for Ukrainian (verified: exists in library)
  'de': 'de_DE-thorsten-medium',     // Medium quality for German (verified: exists in library)
  'fr': 'fr_FR-siwis-medium',        // Medium quality for French (verified: exists in library)
  'es': 'es_ES-sharvard-medium',      // Medium quality for Spanish (verified: exists in library)
  'it': 'it_IT-paola-medium',         // Medium quality for Italian (verified: exists in library) - NOTE: riccardo only has x_low which is filtered
  'pt': 'pt_BR-faber-medium',        // Medium quality for Portuguese (verified: exists in library)
  'zh': 'zh_CN-huayan-medium',       // Medium quality for Chinese (verified: exists in library)
  'ja': null,                         // Japanese not available in library
  'ko': null                          // Korean not available in library
};

// Fallback voices for when primary voice fails with phoneme errors
// Based on actual available voices from piper-tts-web library
// CRITICAL: All fallback voices must be medium or high quality (x_low and low are filtered out)
const FALLBACK_VOICES = {
  'en': 'en_US-hfc_female-medium',   // Alternative English voice (verified: exists in library)
  'ru': 'ru_RU-denis-medium',        // Alternative Russian voice (verified: exists in library)
  'uk': 'uk_UA-ukrainian_tts-medium', // Alternative Ukrainian voice (only medium available, same as default but used as fallback)
  'de': 'de_DE-mls-medium',          // Alternative German voice (verified: exists in library)
  'fr': 'fr_FR-mls-medium',          // Alternative French voice (verified: exists in library)
  'es': 'es_MX-claude-high',          // Alternative Spanish voice (high quality, verified: exists in library)
  'it': 'it_IT-paola-medium',        // Alternative Italian voice (medium quality, verified: exists in library) - NOTE: riccardo only has x_low which is filtered
  'pt': 'pt_PT-tugão-medium',        // Alternative Portuguese voice (verified: exists in library)
  'zh': 'zh_CN-huayan-medium',       // Only one Chinese voice available (verified: exists in library)
  'ja': null,                         // Japanese not available in library
  'ko': null                          // Korean not available in library
};

// CRITICAL: Register message listener IMMEDIATELY at the top level
// This must be done before any async operations to avoid "Receiving end does not exist" errors
// Listener is registered synchronously, so it's ready immediately when document loads
const listenerRegisteredTime = Date.now();
console.log('[ClipAIble Offscreen] Registering chrome.runtime.onMessage listener...', {
  timestamp: listenerRegisteredTime
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const messageReceivedTime = Date.now();
  const messageId = `${message.type}_${messageReceivedTime}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[ClipAIble Offscreen] === MESSAGE RECEIVED ===', {
    messageId,
    type: message.type,
    target: message.target,
    hasData: !!message.data,
    dataKeys: message.data ? Object.keys(message.data) : [],
    senderId: sender?.id,
    senderTab: sender?.tab?.id,
    senderUrl: sender?.url,
    timestamp: messageReceivedTime,
    timeSinceListenerRegistered: messageReceivedTime - listenerRegisteredTime
  });
  
  // Only handle messages targeted to offscreen
  if (message.target !== 'offscreen') {
    console.log('[ClipAIble Offscreen] Message not for offscreen, ignoring', {
      messageId,
      target: message.target
    });
    return false;
  }
  
  console.log('[ClipAIble Offscreen] Processing offscreen message', {
    messageId,
    type: message.type
  });
  
  // Handle async operations
  (async () => {
    const processingStartTime = Date.now();
    try {
      console.log(`[ClipAIble Offscreen] Starting async processing for ${messageId}`, {
        messageId,
        type: message.type
      });
      
      // Initialize TTS module if needed
      const ttsInitStart = Date.now();
      let tts;
      try {
        tts = await initPiperTTS();
        const ttsInitDuration = Date.now() - ttsInitStart;
        console.log(`[ClipAIble Offscreen] TTS module initialized for ${messageId}`, {
          messageId,
          duration: ttsInitDuration
        });
      } catch (initError) {
        console.error(`[ClipAIble Offscreen] TTS module initialization FAILED for ${messageId}`, {
          messageId,
          error: initError.message,
          stack: initError.stack,
          hasWindow: typeof window !== 'undefined',
          importMapExists: !!document.querySelector('script[type="importmap"]'),
          importMapContent: document.querySelector('script[type="importmap"]')?.textContent?.substring(0, 300)
        });
        throw initError;
      }
      
      switch (message.type) {
        case 'PIPER_TTS': {
          const ttsRequestStart = Date.now();
          const { text, options = {} } = message.data;
          let { language = 'en', voice = null } = options;
          
          // CRITICAL: Log voice parameter in detail to debug issues
          // This is the FIRST place where we see the voice from the request
          console.log(`[ClipAIble Offscreen] ===== NEW REQUEST START ===== VOICE="${String(voice || 'null')}" ===== for ${messageId}`, {
            messageId,
            timestamp: ttsRequestStart,
            requestVoice: voice,
            VOICE_FROM_REQUEST: `VOICE="${String(voice || 'null')}"`, // Explicit string for visibility
            language,
            textLength: text?.length || 0
          });
          
          console.log(`[ClipAIble Offscreen] CRITICAL: Voice parameter received for ${messageId}`, {
            messageId,
            voice,
            voiceType: typeof voice,
            voiceValue: String(voice),
            voiceRaw: JSON.stringify(voice),
            isNumeric: /^\d+$/.test(String(voice)),
            hasUnderscore: voice && String(voice).includes('_'),
            hasDash: voice && String(voice).includes('-'),
            isFullVoiceId: voice && String(voice).includes('_') && String(voice).includes('-'),
            options: options || {},
            VOICE_STRING: `VOICE="${String(voice)}"`, // Explicit string for visibility
            optionsKeys: Object.keys(options || {}),
            language: language,
            languageType: typeof language
          });
          
          // Log all TTS settings and configuration
          const ttsSettings = {
            messageId,
            timestamp: ttsRequestStart,
            // Text Settings
            textLength: text?.length || 0,
            // Language Settings
            language,
            languageAuto: language === 'auto',
            // Voice Settings
            voice,
            voiceRequested: voice,
            voiceType: typeof voice,
            voiceValue: String(voice),
            // Options
            options: options || {},
            optionsKeys: Object.keys(options || {}),
            // Default Voices Configuration
            defaultVoices: DEFAULT_VOICES,
            // Fallback Voices Configuration
            fallbackVoices: FALLBACK_VOICES,
            // Storage Settings (will be determined later)
            storageSettings: 'Will be determined after language detection'
          };
          
          console.log(`[ClipAIble Offscreen] PIPER_TTS request with all settings for ${messageId}`, ttsSettings);
          
          // Auto-detect language
          if (language === 'auto') {
            const detectStart = Date.now();
            language = detectLanguage(text);
            console.log(`[ClipAIble Offscreen] Language detected for ${messageId}`, {
              messageId,
              detectedLanguage: language,
              duration: Date.now() - detectStart
            });
          }
          
          // Select voice
          let langCode = language.split('-')[0].toLowerCase();
          
          // CRITICAL: Validate langCode before using it
          console.log(`[ClipAIble Offscreen] === VOICE SELECTION START === for ${messageId}`, {
            messageId,
            language,
            langCode,
            requestedVoice: voice,
            requestedVoiceType: typeof voice,
            requestedVoiceValue: String(voice),
            requestedVoiceRaw: JSON.stringify(voice),
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en'],
            allDefaultVoices: DEFAULT_VOICES
          });
          
          if (!langCode || langCode === 'undefined' || langCode.trim() === '') {
            console.error(`[ClipAIble Offscreen] CRITICAL: Invalid langCode for ${messageId}`, {
              messageId,
              language,
              langCode,
              action: 'Falling back to English'
            });
            langCode = 'en';
            console.log(`[ClipAIble Offscreen] Using fallback langCode for ${messageId}`, {
              messageId,
              originalLanguage: language,
              fallbackLangCode: 'en'
            });
          }
          
          // CRITICAL: Check if default voice exists for this language
          const defaultVoiceForLang = DEFAULT_VOICES[langCode];
          const defaultVoiceEn = DEFAULT_VOICES['en'];
          
          console.log(`[ClipAIble Offscreen] Default voice lookup for ${messageId}`, {
            messageId,
            langCode,
            defaultVoiceForLang,
            defaultVoiceEn,
            hasDefaultForLang: !!defaultVoiceForLang,
            hasDefaultEn: !!defaultVoiceEn
          });
          
          // CRITICAL: Handle cases where language has no voices (ja, ko)
          // If defaultVoiceForLang is null, fallback to English
          // CRITICAL: Check if voice is already a valid voice ID format (contains _ and -)
          // If it is, use it directly. Otherwise, try to find it by name.
          let voiceId = null;
          if (voice && voice !== '0' && voice !== '') {
            // Check if voice is already a valid voice ID format (contains _ and -)
            const isValidVoiceFormat = voice.includes('_') && voice.includes('-');
            if (isValidVoiceFormat) {
              // Voice is already a valid ID format - use it directly
              voiceId = voice;
              console.log(`[ClipAIble Offscreen] CRITICAL: Using voice directly as valid ID format for ${messageId}`, {
                messageId,
                voice,
                voiceId,
                isValidVoiceFormat: true
              });
            } else {
              // Voice is not in valid format - will be processed by mapping later
              voiceId = voice;
              console.log(`[ClipAIble Offscreen] CRITICAL: Voice is not in valid ID format, will try mapping for ${messageId}`, {
                messageId,
                voice,
                voiceId,
                isValidVoiceFormat: false,
                hasUnderscore: voice.includes('_'),
                hasDash: voice.includes('-')
              });
            }
          } else {
            // No voice specified, use default
            voiceId = defaultVoiceForLang || defaultVoiceEn || 'en_US-lessac-medium';
            console.log(`[ClipAIble Offscreen] CRITICAL: No voice specified, using default for ${messageId}`, {
              messageId,
              voice,
              defaultVoiceForLang,
              defaultVoiceEn,
              selectedVoiceId: voiceId
            });
          }
          
          // If voiceId is still null (shouldn't happen, but safety check)
          if (!voiceId) {
            voiceId = 'en_US-lessac-medium';
            console.warn(`[ClipAIble Offscreen] No default voice for language ${langCode}, using English fallback for ${messageId}`, {
              messageId,
              langCode,
              defaultVoiceForLang,
              defaultVoiceEn
            });
          }
          let isFallbackVoice = false;
          
          console.log(`[ClipAIble Offscreen] === INITIAL VOICE SELECTION === for ${messageId} === VOICE="${voiceId}" === REQUESTED="${String(voice || '')}" ===`, {
            messageId,
            voiceId,
            SELECTED_VOICE_STRING: `SELECTED_VOICE="${voiceId}"`, // Explicit string for visibility
            REQUESTED_VOICE_STRING: `REQUESTED_VOICE="${String(voice || '')}"`, // Explicit string for visibility
            requestedVoice: voice,
            voiceType: typeof voice,
            isDefault: !voice || voice === '0' || voice === '',
            source: (voice && voice !== '0' && voice !== '') ? 'user' : (defaultVoiceForLang ? 'langDefault' : 'enDefault'),
            langCode,
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en']
          });
          
          // CRITICAL: Ensure voiceId is never undefined
          if (!voiceId || voiceId === 'undefined' || (typeof voiceId === 'string' && voiceId.trim() === '')) {
            console.error(`[ClipAIble Offscreen] CRITICAL: voiceId is undefined or empty for ${messageId}`, {
              messageId,
              language,
              langCode,
              voice,
              voiceId,
              voiceIdType: typeof voiceId,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES
            });
            // Force fallback to English if no voice found
            voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
            console.log(`[ClipAIble Offscreen] Forced voiceId to English fallback for ${messageId}`, {
              messageId,
              forcedVoiceId: voiceId,
              reason: 'voiceId was undefined or empty'
            });
          }
          
          // CRITICAL: Validate voice ID format
          // Voice ID must be in format like "en_US-hfc_female-medium" or "ar_JO-kareem-low"
          // If voice is just a number (e.g., "27") or doesn't match expected format, try to find it by name
          let isValidVoiceFormat = voiceId && (
            voiceId.includes('_') &&  // Contains underscore (e.g., "en_US-...")
            voiceId.includes('-')     // Contains dash (e.g., "...-medium")
          );
          
          console.log(`[ClipAIble Offscreen] CRITICAL: Voice format validation for ${messageId}`, {
            messageId,
            voice,
            voiceId,
            isValidVoiceFormat,
            hasUnderscore: voiceId && voiceId.includes('_'),
            hasDash: voiceId && voiceId.includes('-'),
            willTryMapping: !isValidVoiceFormat && voice && voice !== '0' && voice !== ''
          });
          
          // CRITICAL: Only try mapping if voiceId is NOT already in valid format
          // If voiceId is already valid (e.g., "ru_RU-denis-medium"), use it directly
          if (!isValidVoiceFormat && voice && voice !== '0' && voice !== '') {
            console.log(`[ClipAIble Offscreen] Invalid voice format detected for ${messageId}`, {
              messageId,
              requestedVoice: voice,
              voiceId,
              isValidFormat: isValidVoiceFormat,
              action: 'Trying to find voice by name first, then switching to default'
            });
            
            // CRITICAL: Try to find voice by name using voice mapping
            // This handles cases where user selected voice by display name (e.g., "dmitri")
            try {
              // Import voice mapping
              const { findVoiceIdByName, PIPER_VOICES_MAPPING } = await import(chrome.runtime.getURL('scripts/api/piper-voices-mapping.js'));
              
              console.log(`[ClipAIble Offscreen] CRITICAL: Attempting voice mapping for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                requestedVoiceType: typeof voice,
                requestedVoiceString: String(voice),
                language,
                langCode,
                mappingKeys: Object.keys(PIPER_VOICES_MAPPING || {}).slice(0, 20),
                hasDirectMapping: PIPER_VOICES_MAPPING && PIPER_VOICES_MAPPING[String(voice).toLowerCase()],
                directMappingValue: PIPER_VOICES_MAPPING && PIPER_VOICES_MAPPING[String(voice).toLowerCase()]
              });
              
              const mappedVoiceId = findVoiceIdByName(voice, language || langCode);
              
              console.log(`[ClipAIble Offscreen] CRITICAL: Voice mapping result for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                mappedVoiceId,
                language,
                langCode,
                mappingFound: !!mappedVoiceId
              });
              
              if (mappedVoiceId) {
                console.log(`[ClipAIble Offscreen] Found voice by name mapping for ${messageId}`, {
                  messageId,
                  requestedVoice: voice,
                  mappedVoiceId,
                  language,
                  langCode
                });
                console.log(`[ClipAIble Offscreen] CRITICAL: Setting voiceId from mapping for ${messageId}`, {
                  messageId,
                  beforeVoiceId: voiceId,
                  mappedVoiceId,
                  willSetTo: mappedVoiceId
                });
                voiceId = mappedVoiceId;
                isValidVoiceFormat = voiceId && (
                  voiceId.includes('_') || voiceId.includes('-')
                );
                
                console.log(`[ClipAIble Offscreen] CRITICAL: voiceId after mapping assignment for ${messageId}`, {
                  messageId,
                  voiceId,
                  voiceIdType: typeof voiceId,
                  isValidVoiceFormat
                });
                
                if (isValidVoiceFormat) {
                  console.log(`[ClipAIble Offscreen] Voice mapped and format validated for ${messageId}`, {
                    messageId,
                    originalVoice: voice,
                    mappedVoiceId: voiceId
                  });
                }
              } else {
                // Fallback: try to find in available voices from library
                // This handles voices that exist in library but not in types.d.ts
                // (e.g., "bryce", "john", "norman", "paola", "gwryw_gogleddol")
                // CRITICAL: Also handle numeric indices (e.g., "107") - don't try to construct ID from them
                if (tts && typeof tts.voices === 'function') {
                  const availableVoices = await tts.voices();
                  // CRITICAL: tts.voices() returns Voice[] array, not an object!
                  // Each Voice has structure: { key: VoiceId, name: string, language: {...}, quality: Quality, ... }
                  
                  console.log(`[ClipAIble Offscreen] Searching for voice by name in library for ${messageId}`, {
                    messageId,
                    requestedVoice: voice,
                    requestedVoiceType: typeof voice,
                    isNumeric: /^\d+$/.test(String(voice)),
                    language,
                    availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                    isArray: Array.isArray(availableVoices)
                  });
                  
                  // CRITICAL: If voice is a number (index), try to find voice by index in available voices
                  if (/^\d+$/.test(String(voice))) {
                    const voiceIndex = parseInt(voice, 10);
                    console.log(`[ClipAIble Offscreen] Voice is numeric index, trying to find by index for ${messageId}`, {
                      messageId,
                      requestedVoice: voice,
                      voiceIndex,
                      language,
                      langCode,
                      availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0
                    });
                    
                    // CRITICAL: Use the SAME filtering and sorting logic as GET_VOICES
                    // This ensures index matches the position in UI dropdown
                    const supportedLanguages = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh'];
                    
                    // Filter voices: exclude low quality and unsupported languages
                    const filteredVoices = (Array.isArray(availableVoices) ? availableVoices : []).filter((voice) => {
                      const quality = voice.quality || 'medium';
                      const isLowQuality = quality === 'low' || quality === 'x_low';
                      if (isLowQuality) {
                        return false;
                      }
                      
                      // Extract language code from voice key or use language property
                      let langCode = '';
                      if (voice.language?.code) {
                        const countryCode = voice.language.code.toLowerCase();
                        langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
                      } else {
                        const langMatch = voice.key.match(/^([a-z]{2})_/i);
                        langCode = langMatch ? langMatch[1].toLowerCase() : '';
                      }
                      
                      // Check if language is supported
                      return supportedLanguages.includes(langCode);
                    });
                    
                    // Map to result format (same as GET_VOICES)
                    const result = filteredVoices.map((voice) => {
                      // Extract base language code
                      let langCode = '';
                      if (voice.language?.code) {
                        const countryCode = voice.language.code.toLowerCase();
                        langCode = countryCode.split('_')[0];
                      } else {
                        const langMatch = voice.key.match(/^([a-z]{2})_/i);
                        langCode = langMatch ? langMatch[1].toLowerCase() : 'unknown';
                      }
                      
                      return {
                        id: voice.key, // CRITICAL: Use voice.key as id
                        name: voice.name || voice.key,
                        language: langCode,
                        quality: voice.quality || 'medium',
                        gender: voice.gender || 'unknown'
                      };
                    });
                    
                    // Sort voices: SAME logic as GET_VOICES
                    // First by language (in supported order), then by quality (high > medium), then by name
                    const languageOrder = { 'en': 0, 'ru': 1, 'uk': 2, 'de': 3, 'fr': 4, 'es': 5, 'it': 6, 'pt': 7, 'zh': 8, 'ja': 9, 'ko': 10 };
                    const qualityOrder = { 'high': 0, 'medium': 1 };
                    result.sort((a, b) => {
                      // First sort by language (in supported order)
                      const aLangOrder = languageOrder[a.language] ?? 99;
                      const bLangOrder = languageOrder[b.language] ?? 99;
                      if (aLangOrder !== bLangOrder) {
                        return aLangOrder - bLangOrder;
                      }
                      // Then by quality (high > medium)
                      const aQuality = qualityOrder[a.quality] ?? 99;
                      const bQuality = qualityOrder[b.quality] ?? 99;
                      if (aQuality !== bQuality) {
                        return aQuality - bQuality;
                      }
                      // Finally by name
                      return a.name.localeCompare(b.name);
                    });
                    
                    const filteredVoicesList = result;
                    
                    console.log(`[ClipAIble Offscreen] Filtered voices for index lookup for ${messageId}`, {
                      messageId,
                      voiceIndex,
                      filteredVoicesCount: filteredVoicesList.length,
                      filteredVoices: filteredVoicesList.slice(0, 10).map(v => ({ id: v.id, name: v.name, language: v.language, quality: v.quality })),
                      totalAvailableVoices: Array.isArray(availableVoices) ? availableVoices.length : 0
                    });
                    
                    // Get voice by index (0-based) - index should match UI dropdown position
                    if (voiceIndex >= 0 && voiceIndex < filteredVoicesList.length) {
                      const selectedVoice = filteredVoicesList[voiceIndex];
                      voiceId = selectedVoice.id;
                      isValidVoiceFormat = voiceId && (
                        voiceId.includes('_') && voiceId.includes('-')
                      );
                      
                      console.log(`[ClipAIble Offscreen] Found voice by index for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        selectedVoiceId: voiceId,
                        selectedVoiceName: selectedVoice.name,
                        selectedVoiceLanguage: selectedVoice.language,
                        selectedVoiceQuality: selectedVoice.quality,
                        isValidVoiceFormat,
                        totalFilteredVoices: filteredVoicesList.length
                      });
                    } else {
                      console.warn(`[ClipAIble Offscreen] Voice index ${voiceIndex} out of range for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        originalVoice: voice,
                        filteredVoicesCount: filteredVoicesList.length,
                        availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                        willTryNameMapping: true,
                        firstFewVoices: filteredVoicesList.slice(0, 5).map(v => ({ id: v.id, name: v.name }))
                      });
                      
                      // CRITICAL: If index is out of range, the saved value is likely invalid
                      // This can happen if:
                      // 1. Index was saved from a different (unfiltered) list
                      // 2. Voice list changed after saving
                      // 3. Index was incorrectly saved instead of voice ID
                      // Solution: Use default voice for the detected language
                      // The user will need to re-select their voice in settings
                      console.warn(`[ClipAIble Offscreen] Index ${voiceIndex} is invalid, using default voice for language ${langCode} for ${messageId}`, {
                        messageId,
                        voiceIndex,
                        originalVoice: voice,
                        langCode,
                        filteredVoicesCount: filteredVoicesList.length
                      });
                      
                      // Use default voice for the language - this is the safest approach
                      // The user's saved index is invalid, so we fall back to language default
                      // The user will need to re-select their preferred voice in settings
                    }
                  } else {
                    // Try to find voice by name in available voices
                    // CRITICAL: availableVoices is Voice[] array, not an object!
                    let foundVoice = null;
                    if (Array.isArray(availableVoices)) {
                      for (const voiceObj of availableVoices) {
                        const voiceKey = voiceObj?.key || '';
                        const voiceName = voiceObj?.name || '';
                        const voiceAliases = voiceObj?.aliases || [];
                        
                        // Check if requested voice matches key, name, or aliases
                        const normalizedRequest = voice.toLowerCase();
                        const normalizedKey = voiceKey.toLowerCase();
                        const normalizedName = voiceName.toLowerCase();
                        
                        if (normalizedKey === normalizedRequest || 
                            normalizedName === normalizedRequest ||
                            normalizedKey.includes(normalizedRequest) ||
                            normalizedName.includes(normalizedRequest) ||
                            voiceAliases.some(alias => alias.toLowerCase() === normalizedRequest)) {
                          foundVoice = { id: voiceKey, name: voiceName, ...voiceObj };
                          break;
                        }
                      }
                    }
                    
                    if (foundVoice && foundVoice.id) {
                      console.log(`[ClipAIble Offscreen] Found voice by name in library for ${messageId}`, {
                        messageId,
                        requestedVoice: voice,
                        foundVoiceId: foundVoice.id,
                        foundVoiceName: foundVoice.name,
                        foundVoiceAliases: foundVoice.aliases
                      });
                      voiceId = foundVoice.id;
                      isValidVoiceFormat = voiceId && (
                        voiceId.includes('_') || voiceId.includes('-')
                      );
                    } else {
                      console.log(`[ClipAIble Offscreen] Voice not found by name for ${messageId}`, {
                        messageId,
                        requestedVoice: voice,
                        language,
                        availableVoicesCount: Array.isArray(availableVoices) ? availableVoices.length : 0,
                        firstFewVoices: Array.isArray(availableVoices) ? availableVoices.slice(0, 5).map(v => v?.key || v?.id || 'N/A') : []
                      });
                    }
                  }
                }
              }
            } catch (findError) {
              console.error(`[ClipAIble Offscreen] Error finding voice by name for ${messageId}`, {
                messageId,
                requestedVoice: voice,
                language,
                error: findError.message,
                errorStack: findError.stack
              });
            }
            
            // If still invalid format after trying to find by name, use default
            if (!isValidVoiceFormat) {
            // Switch to default voice for detected language
            const replacementVoice = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'];
            console.log(`[ClipAIble Offscreen] Attempting voice replacement for ${messageId}`, {
              messageId,
              langCode,
              replacementVoice,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en']
            });
            
            voiceId = replacementVoice;
            
            // CRITICAL: Double-check voiceId is not undefined after replacement
            if (!voiceId || voiceId === 'undefined' || (typeof voiceId === 'string' && voiceId.trim() === '')) {
              console.error(`[ClipAIble Offscreen] CRITICAL: voiceId still undefined after replacement for ${messageId}`, {
                messageId,
                langCode,
                replacementVoice,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en'],
                allDefaultVoices: DEFAULT_VOICES
              });
              voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              console.log(`[ClipAIble Offscreen] Forced voiceId to English fallback after replacement for ${messageId}`, {
                messageId,
                forcedVoiceId: voiceId
              });
            }
            
            console.log(`[ClipAIble Offscreen] Voice replaced with default for ${messageId}`, {
              messageId,
              originalVoice: voice,
              newVoice: voiceId,
              reason: `Invalid voice format (expected format: "lang_COUNTRY-name-quality", got: "${voice}")`
            });
            
            // Re-validate format after replacement
            isValidVoiceFormat = voiceId && (
              voiceId.includes('_') || voiceId.includes('-')
            );
            }
          }
          
          // CRITICAL: Validate voice-language compatibility
          // CRITICAL: DO NOT automatically replace user-selected voice
          // User explicitly selected a voice - respect their choice
          // Only log a warning if language mismatch, but do not replace
          if (voiceId && isValidVoiceFormat) {
            // Extract language from voice ID (e.g., "ar_JO-kareem-low" -> "ar")
            const voiceLangCode = voiceId.split('_')[0].toLowerCase();
            
            // If voice language doesn't match detected language, only warn (do not replace)
            if (voiceLangCode !== langCode) {
              console.warn(`[ClipAIble Offscreen] Voice-language mismatch detected for ${messageId} (NOT replacing - using user-selected voice)`, {
                messageId,
                requestedVoice: voice,
                voiceId,
                voiceLanguage: voiceLangCode,
                detectedLanguage: langCode,
                action: 'Keeping user-selected voice despite language mismatch'
              });
              // DO NOT replace voiceId - user explicitly selected it
            } else {
              console.log(`[ClipAIble Offscreen] Voice-language match confirmed for ${messageId}`, {
                messageId,
                voiceId,
                voiceLanguage: voiceLangCode,
                detectedLanguage: langCode
              });
            }
          }
          
          // CRITICAL: Final validation - ensure voiceId is never undefined before use
          if (!voiceId || !isValidVoiceFormat) {
            console.error(`[ClipAIble Offscreen] CRITICAL: voiceId is invalid before download for ${messageId}`, {
              messageId,
              voiceId,
              isValidVoiceFormat,
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES
            });
            // Force fallback to English voice
            voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
            isValidVoiceFormat = true;
            console.log(`[ClipAIble Offscreen] Forced voiceId to English fallback for ${messageId}`, {
              messageId,
              forcedVoiceId: voiceId
            });
          }
          
          // SPECIAL LOGGING FOR RUSSIAN LANGUAGE
          if (langCode === 'ru') {
            console.log(`[ClipAIble Offscreen] === RUSSIAN LANGUAGE DETECTED === for ${messageId}`, {
              messageId,
              language,
              langCode,
              voiceId,
              requestedVoice: voice,
              defaultVoiceForRussian: DEFAULT_VOICES['ru'],
              fallbackVoiceForRussian: FALLBACK_VOICES['ru'],
              isValidVoiceFormat,
              voiceIdStartsWithRu: voiceId && voiceId.toLowerCase().startsWith('ru_'),
              allRussianVoices: Object.entries(DEFAULT_VOICES).filter(([lang]) => lang === 'ru'),
              allFallbackVoices: Object.entries(FALLBACK_VOICES).filter(([lang]) => lang === 'ru')
            });
          }
          
          // Log all settings after language detection and voice selection
          // Note: Storage settings will be determined later when processing audio
          const allTtsSettings = {
            messageId,
            timestamp: Date.now(),
            // Language Settings
            language,
            langCode,
            languageDetected: language !== 'auto',
            // Voice Settings
            voiceId,
            requestedVoice: voice,
            voiceSelected: voiceId,
            isDefaultVoice: !voice || voice === '0' || voice === '',
            defaultVoiceForLang: DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'],
            isFallbackVoice,
            // Fallback Configuration
            fallbackAvailable: langCode in FALLBACK_VOICES,
            fallbackVoice: FALLBACK_VOICES[langCode] || null,
            // Default Voices
            defaultVoices: DEFAULT_VOICES
          };
          
          console.log(`[ClipAIble Offscreen] Voice selected with all settings for ${messageId}`, allTtsSettings);
          
          // CRITICAL: Final validation - ensure voiceId is never undefined before use
          console.log(`[ClipAIble Offscreen] === FINAL VOICE VALIDATION === for ${messageId}`, {
            messageId,
            voiceId,
            voiceIdType: typeof voiceId,
            voiceIdLength: voiceId ? voiceId.length : 0,
            isValidVoiceFormat,
            langCode,
            defaultVoiceForLang: DEFAULT_VOICES[langCode],
            defaultVoiceEn: DEFAULT_VOICES['en'],
            // Special check for Russian
            isRussian: langCode === 'ru',
            russianDefaultVoice: DEFAULT_VOICES['ru']
          });
          
          // SPECIAL LOGGING FOR RUSSIAN LANGUAGE
          if (langCode === 'ru') {
            console.log(`[ClipAIble Offscreen] === RUSSIAN LANGUAGE DETECTED === for ${messageId}`, {
              messageId,
              language,
              langCode,
              voiceId,
              requestedVoice: voice,
              defaultVoiceForRussian: DEFAULT_VOICES['ru'],
              fallbackVoiceForRussian: FALLBACK_VOICES['ru'],
              isValidVoiceFormat,
              voiceIdStartsWithRu: voiceId && voiceId.toLowerCase().startsWith('ru_'),
              allRussianVoices: Object.entries(DEFAULT_VOICES).filter(([lang]) => lang === 'ru'),
              allFallbackVoices: Object.entries(FALLBACK_VOICES).filter(([lang]) => lang === 'ru')
            });
          }
          
          if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
            const errorMsg = `Invalid voiceId before download: ${voiceId}`;
            console.error(`[ClipAIble Offscreen] ${errorMsg} for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en'],
              allDefaultVoices: DEFAULT_VOICES,
              // Special error logging for Russian
              isRussian: langCode === 'ru',
              russianDefaultVoice: DEFAULT_VOICES['ru']
            });
            throw new Error(errorMsg);
          }
          
          console.log(`[ClipAIble Offscreen] === VOICE SELECTION COMPLETE === for ${messageId}`, {
            messageId,
            finalVoiceId: voiceId,
            langCode,
            isValidVoiceFormat,
            // Special completion logging for Russian
            isRussian: langCode === 'ru',
            russianVoiceSelected: langCode === 'ru' && voiceId && voiceId.toLowerCase().startsWith('ru_')
          });
          
          // CRITICAL: Declare downloadVoiceId in wider scope so it's available for predict() calls
          let downloadVoiceId = null;
          
          // Check if voice is downloaded
          const storedCheckStart = Date.now();
          const stored = await tts.stored();
          const storedCheckDuration = Date.now() - storedCheckStart;
          console.log(`[ClipAIble Offscreen] Stored voices check for ${messageId}`, {
            messageId,
            storedCount: stored.length,
            voiceId,
            isStored: stored.includes(voiceId),
            duration: storedCheckDuration,
            note: 'Models are stored permanently in IndexedDB - survive extension restarts'
          });
          
          if (!stored.includes(voiceId)) {
            // CRITICAL: Final validation before download - ensure voiceId is valid
            if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
              const errorMsg = `Invalid voiceId before download: ${voiceId}`;
              console.error(`[ClipAIble Offscreen] ${errorMsg} for ${messageId}`, {
                messageId,
                voiceId,
                voiceIdType: typeof voiceId,
                langCode,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en'],
                allDefaultVoices: DEFAULT_VOICES
              });
              // Try to use fallback voice
              const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              console.log(`[ClipAIble Offscreen] Using fallback voice for ${messageId}`, {
                messageId,
                originalVoiceId: voiceId,
                fallbackVoiceId
              });
              voiceId = fallbackVoiceId;
              
              // Final check - if still invalid, throw error
              if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
                throw new Error(`Cannot determine valid voice ID. Language: ${langCode}, Requested voice: ${voice}`);
              }
            }
            
            // CRITICAL: Final check before download - log everything
            console.log(`[ClipAIble Offscreen] Starting voice download for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              voiceIdLength: voiceId ? voiceId.length : 0,
              voiceIdValue: String(voiceId),
              isValid: voiceId && typeof voiceId === 'string' && voiceId !== 'undefined' && voiceId.trim() !== '',
              langCode,
              defaultVoiceForLang: DEFAULT_VOICES[langCode],
              defaultVoiceEn: DEFAULT_VOICES['en']
            });
            
            // CRITICAL: One more validation right before download
            if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
              console.error(`[ClipAIble Offscreen] CRITICAL: voiceId is invalid right before download for ${messageId}`, {
                messageId,
                voiceId,
                voiceIdType: typeof voiceId,
                langCode,
                defaultVoiceForLang: DEFAULT_VOICES[langCode],
                defaultVoiceEn: DEFAULT_VOICES['en']
              });
              // Force fallback
              voiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
              console.log(`[ClipAIble Offscreen] Forced voiceId to fallback right before download for ${messageId}`, {
                messageId,
                forcedVoiceId: voiceId
              });
            }
            
            // CRITICAL: Store voiceId in a const to prevent mutation
            // CRITICAL: Log voiceId before assignment to track any changes
            console.log(`[ClipAIble Offscreen] CRITICAL: voiceId before downloadVoiceId assignment for ${messageId}`, {
              messageId,
              voiceId,
              voiceIdType: typeof voiceId,
              voiceIdValue: String(voiceId),
              requestedVoice: voice,
              langCode
            });
            
            downloadVoiceId = String(voiceId).trim();
            if (!downloadVoiceId || downloadVoiceId === 'undefined') {
              throw new Error(`Cannot download voice: voiceId is invalid (${voiceId}). Language: ${langCode}`);
            }
            
            console.log(`[ClipAIble Offscreen] Calling tts.download with voiceId: "${downloadVoiceId}" for ${messageId}`, {
              messageId,
              downloadVoiceId,
              downloadVoiceIdType: typeof downloadVoiceId,
              downloadVoiceIdLength: downloadVoiceId.length,
              originalVoiceId: voiceId,
              requestedVoice: voice
            });
            
            // CRITICAL: Check stored voices BEFORE download to compare after
            const storedBeforeDownload = await tts.stored();
            console.log(`[ClipAIble Offscreen] Stored voices BEFORE download for ${messageId}`, {
              messageId,
              downloadVoiceId,
              storedBeforeDownload,
              storedCount: storedBeforeDownload.length,
              alreadyStored: storedBeforeDownload.includes(downloadVoiceId)
            });
            
            const downloadStart = Date.now();
            let lastPercent = -1;
            let finalProgress = null;
            
            try {
              const downloadResult = await tts.download(downloadVoiceId, (progress) => {
                finalProgress = progress;
                if (progress.total > 0) {
                  const percent = Math.round((progress.loaded * 100) / progress.total);
                  // Log only every 10%
                  if (percent >= lastPercent + 10 || percent === 100) {
                    console.log(`[ClipAIble Offscreen] Download progress for ${messageId}`, {
                      messageId,
                      voiceId: downloadVoiceId,
                      percent,
                      loaded: progress.loaded,
                      total: progress.total
                    });
                    lastPercent = percent;
                  }
                }
              });
              
              const downloadDuration = Date.now() - downloadStart;
              console.log(`[ClipAIble Offscreen] Voice download complete for ${messageId}`, {
                messageId,
                voiceId: downloadVoiceId,
                duration: downloadDuration,
                downloadResult: downloadResult,
                downloadResultType: typeof downloadResult,
                finalProgress: finalProgress,
                finalProgressLoaded: finalProgress?.loaded,
                finalProgressTotal: finalProgress?.total
              });
              
              // CRITICAL: Check stored voices IMMEDIATELY after download() resolves
              const storedImmediatelyAfter = await tts.stored();
              console.log(`[ClipAIble Offscreen] Stored voices IMMEDIATELY after download() resolved for ${messageId}`, {
                messageId,
                downloadVoiceId,
                storedImmediatelyAfter,
                storedCount: storedImmediatelyAfter.length,
                foundImmediately: storedImmediatelyAfter.includes(downloadVoiceId),
                newVoices: storedImmediatelyAfter.filter(v => !storedBeforeDownload.includes(v)),
                removedVoices: storedBeforeDownload.filter(v => !storedImmediatelyAfter.includes(v))
              });
              // CRITICAL: Update voiceId variable after successful download
              // This ensures voiceId is always valid for subsequent predict() calls
              voiceId = downloadVoiceId;
              
              // CRITICAL: Verify voice is actually stored after download
              // IndexedDB operations are async - model may not appear immediately
              // Retry verification with delays to allow IndexedDB to complete
              let isActuallyStored = false;
              let verifyStored = [];
              const maxVerificationAttempts = 10; // Increased to 10 attempts
              const verificationDelay = 1000; // Increased to 1000ms between attempts
              
              for (let attempt = 1; attempt <= maxVerificationAttempts; attempt++) {
                verifyStored = await tts.stored();
                isActuallyStored = verifyStored.includes(downloadVoiceId);
                
                // CRITICAL: Check for partial matches (maybe voice is stored with different format)
                const partialMatches = verifyStored.filter(v => 
                  v.includes(downloadVoiceId.split('-')[0]) || // Match language code
                  v.includes(downloadVoiceId.split('-')[1]) || // Match voice name
                  downloadVoiceId.includes(v.split('-')[0]) || // Reverse match
                  downloadVoiceId.includes(v.split('-')[1])
                );
                
                console.log(`[ClipAIble Offscreen] Voice storage verification attempt ${attempt}/${maxVerificationAttempts} for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  isActuallyStored,
                  storedVoices: verifyStored,
                  storedCount: verifyStored.length,
                  attempt,
                  partialMatches: partialMatches.length > 0 ? partialMatches : null,
                  allStoredVoicesDetails: verifyStored.map(v => ({
                    voice: v,
                    matchesDownloadId: v === downloadVoiceId,
                    containsDownloadId: v.includes(downloadVoiceId),
                    downloadIdContainsVoice: downloadVoiceId.includes(v)
                  }))
                });
                
                if (isActuallyStored) {
                  console.log(`[ClipAIble Offscreen] Voice ${downloadVoiceId} found in storage after ${attempt} attempt(s) for ${messageId}`, {
                    messageId,
                    downloadVoiceId,
                    attempt
                  });
                  break;
                }
                
                if (attempt < maxVerificationAttempts) {
                  console.log(`[ClipAIble Offscreen] Voice ${downloadVoiceId} not found yet, waiting ${verificationDelay}ms before retry for ${messageId}`, {
                    messageId,
                    downloadVoiceId,
                    attempt,
                    nextAttempt: attempt + 1,
                    storedVoices: verifyStored
                  });
                  await new Promise(resolve => setTimeout(resolve, verificationDelay));
                }
              }
              
              if (!isActuallyStored) {
                // CRITICAL: Detailed error with all information to understand what went wrong
                const errorDetails = {
                  messageId,
                  downloadVoiceId,
                  storedVoices: verifyStored,
                  storedCount: verifyStored.length,
                  attempts: maxVerificationAttempts,
                  storedBeforeDownload,
                  storedImmediatelyAfter,
                  downloadResult,
                  finalProgress,
                  downloadDuration: Date.now() - downloadStart
                };
                
                console.error(`[ClipAIble Offscreen] CRITICAL: Voice ${downloadVoiceId} not found in stored voices after ${maxVerificationAttempts} attempts for ${messageId}`, errorDetails);
                
                // Throw detailed error without fallback - user needs to see what's wrong
                throw new Error(
                  `Voice "${downloadVoiceId}" was not properly stored after download. ` +
                  `Download completed but voice not found in storage after ${maxVerificationAttempts} attempts. ` +
                  `Stored voices: ${verifyStored.join(', ')}. ` +
                  `This indicates a problem with the Piper TTS library's download() or stored() functions. ` +
                  `Check browser console for detailed logs.`
                );
              }
              
              // CRITICAL: Wait for model to be fully loaded and indexed in IndexedDB
              // This prevents "No graph was found in the protobuf" errors
              console.log(`[ClipAIble Offscreen] Waiting for model to be fully indexed after download for ${messageId}`, {
                messageId,
                downloadVoiceId
              });
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for IndexedDB to complete
              
              // CRITICAL: Test model integrity by attempting a minimal predict() call
              // This catches corrupted models before they cause errors during actual synthesis
              try {
                console.log(`[ClipAIble Offscreen] Testing model integrity for ${messageId}`, {
                  messageId,
                  downloadVoiceId
                });
                const testBlob = await tts.predict({
                  text: 'test',
                  voiceId: downloadVoiceId
                });
                if (!testBlob || testBlob.size === 0) {
                  throw new Error('Model integrity test failed: empty result');
                }
                console.log(`[ClipAIble Offscreen] Model integrity test passed for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  testBlobSize: testBlob.size
                });
              } catch (integrityError) {
                console.error(`[ClipAIble Offscreen] CRITICAL: Model integrity test failed for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  error: integrityError.message,
                  errorName: integrityError.name
                });
                // Remove corrupted model and re-download
                if (tts.remove && typeof tts.remove === 'function') {
                  try {
                    await tts.remove(downloadVoiceId);
                    console.log(`[ClipAIble Offscreen] Removed corrupted model ${downloadVoiceId} after integrity test failure`, {
                      messageId,
                      downloadVoiceId
                    });
                    // Re-download the model
                    await tts.download(downloadVoiceId, () => {});
                    console.log(`[ClipAIble Offscreen] Re-downloaded model ${downloadVoiceId} after integrity test failure`, {
                      messageId,
                      downloadVoiceId
                    });
                  } catch (recoveryError) {
                    console.error(`[ClipAIble Offscreen] Failed to recover from integrity test failure for ${messageId}`, {
                      messageId,
                      downloadVoiceId,
                      recoveryError: recoveryError.message
                    });
                    throw new Error(`Model integrity test failed and recovery failed: ${integrityError.message}`);
                  }
                } else {
                  throw new Error(`Model integrity test failed: ${integrityError.message}`);
                }
              }
            } catch (downloadError) {
              console.error(`[ClipAIble Offscreen] Voice download failed for ${messageId}`, {
                messageId,
                voiceId: downloadVoiceId,
                originalVoiceId: voiceId,
                error: downloadError.message,
                errorName: downloadError.name,
                errorStack: downloadError.stack
              });
              
              // Handle JSON parsing errors from HuggingFace 404 responses
              const isJsonParseError = downloadError.message && (
                downloadError.message.includes('Unexpected token') ||
                downloadError.message.includes('is not valid JSON') ||
                downloadError.message.includes('JSON.parse')
              );
              
              // Handle "Entry not found" errors (404 from HuggingFace)
              const isEntryNotFound = downloadError.message && (
                downloadError.message.includes('Entry not found') ||
                downloadError.message.includes('404') ||
                downloadError.message.includes('not found')
              );
              
              if (isJsonParseError || isEntryNotFound) {
                const errorMsg = `Voice "${downloadVoiceId}" not found on HuggingFace. The voice ID may be invalid or the voice may have been removed. Please select a valid voice from the list.`;
                console.error(`[ClipAIble Offscreen] Voice not found error for ${messageId}`, {
                  messageId,
                  downloadVoiceId,
                  originalVoiceId: voiceId,
                  errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                  originalError: downloadError.message
                });
                throw new Error(errorMsg);
              }
              
              // Re-throw other download errors
              throw downloadError;
            }
          } else {
            // Voice is already stored, use current voiceId
            downloadVoiceId = voiceId;
          }
          
          // CRITICAL: Ensure downloadVoiceId is set before predict() calls
          if (!downloadVoiceId) {
            downloadVoiceId = voiceId;
          }
          
          // CRITICAL: Final validation of downloadVoiceId before synthesis
          if (!downloadVoiceId || typeof downloadVoiceId !== 'string' || downloadVoiceId === 'undefined' || downloadVoiceId.trim() === '') {
            throw new Error(`Invalid downloadVoiceId before synthesis: ${downloadVoiceId}. Original voiceId: ${voiceId}, Language: ${langCode}`);
          }
          
          // CRITICAL: Smart voice switching - ensure library uses correct voice
          // Models are stored in IndexedDB permanently (survive extension restarts)
          // But library may cache InferenceSession per voice, so we need to force switch
          const finalVoiceId = voiceId || downloadVoiceId;
          const voiceChanged = lastUsedVoiceId !== null && lastUsedVoiceId !== finalVoiceId;
          
          if (voiceChanged) {
            console.log(`[ClipAIble Offscreen] ===== VOICE SWITCHING DETECTED ===== for ${messageId}`, {
              messageId,
              previousVoice: lastUsedVoiceId,
              newVoice: finalVoiceId,
              action: 'AGGRESSIVE CACHE CLEARING - forcing complete module reload'
            });
            
            // CRITICAL: AGGRESSIVE CACHE CLEARING
            // The library caches InferenceSession internally, so we need to completely destroy and recreate everything
            console.log(`[ClipAIble Offscreen] === AGGRESSIVE CACHE CLEARING START ===`, {
              messageId,
              previousVoice: lastUsedVoiceId,
              newVoice: finalVoiceId,
              action: 'Clearing ALL caches and forcing complete reload'
            });
            
            // Step 1: CRITICAL - Clear TtsSession singleton instance
            // The library uses TtsSession._instance singleton which caches the session
            // We MUST clear it to force creation of new session with new voice
            // According to library source: TtsSession uses singleton pattern
            // When voice changes, we need to clear _instance to force new session creation
            let singletonCleared = false;
            try {
              // Try to access TtsSession from the module
              // The module exports TtsSession class which has static _instance property
              if (tts && tts.TtsSession) {
                const hadInstance = tts.TtsSession._instance !== null && tts.TtsSession._instance !== undefined;
                const instanceVoiceId = tts.TtsSession._instance?.voiceId;
                
                console.log(`[ClipAIble Offscreen] === CLEARING TtsSession._instance SINGLETON ===`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  hasTtsSession: true,
                  hadInstance: hadInstance,
                  instanceVoiceId: instanceVoiceId,
                  action: 'Clearing singleton to force new session creation'
                });
                
                // Clear the singleton instance to force new session creation
                // This is the KEY fix - library reuses _instance even when voiceId changes
                tts.TtsSession._instance = null;
                singletonCleared = true;
                
                console.log(`[ClipAIble Offscreen] ✅ TtsSession._instance cleared successfully (SINGLETON CLEARED)`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  instanceIsNull: tts.TtsSession._instance === null,
                  mechanism: 'singleton_clear',
                  willCreateNewSession: true
                });
              } else {
                // TtsSession might not be exported, try to access it differently
                // The predict() function creates TtsSession internally, so we need to clear it before next predict()
                console.log(`[ClipAIble Offscreen] ⚠️ TtsSession not directly accessible, will clear via module reload`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  hasTts: !!tts,
                  ttsKeys: tts ? Object.keys(tts).slice(0, 20) : [],
                  mechanism: 'module_reload',
                  note: 'Module reload should clear singleton'
                });
              }
            } catch (clearError) {
              console.warn(`[ClipAIble Offscreen] ⚠️ Error clearing TtsSession._instance`, {
                messageId,
                previousVoice: lastUsedVoiceId,
                newVoice: finalVoiceId,
                error: clearError.message,
                mechanism: 'module_reload_fallback',
                note: 'Will rely on module reload to clear singleton'
              });
            }
            
            // Step 2: Clear module cache completely
            ttsModule = null;
            
            // Step 3: Force complete module reload
            console.log(`[ClipAIble Offscreen] 🔄 Forcing complete module reload`, {
              messageId,
              previousVoice: lastUsedVoiceId,
              newVoice: finalVoiceId,
              mechanism: 'module_reload',
              singletonCleared: singletonCleared
            });
            
            let moduleReloaded = false;
            try {
              // Re-initialize to get completely fresh module instance
              // This should create a new InferenceSession with no cached state
              const freshTts = await initPiperTTS();
              
              // Verify we got a fresh instance
              if (freshTts && typeof freshTts.predict === 'function') {
                moduleReloaded = true;
                console.log(`[ClipAIble Offscreen] ✅ Module reloaded successfully (MODULE RELOADED)`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  hasPredict: typeof freshTts.predict === 'function',
                  hasStored: typeof freshTts.stored === 'function',
                  mechanism: 'module_reload',
                  note: 'Fresh module instance created - ALL caches cleared, will use new voice'
                });
                
                // CRITICAL: Update tts reference to use fresh instance
                // This ensures all subsequent predict() calls use the new module instance
                tts = freshTts;
                
                console.log(`[ClipAIble Offscreen] TTS reference updated to fresh instance after aggressive cache clear`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  ttsIsFresh: tts === freshTts
                });
              } else {
                console.error(`[ClipAIble Offscreen] ❌ Module reload failed - invalid module`, {
                  messageId,
                  previousVoice: lastUsedVoiceId,
                  newVoice: finalVoiceId,
                  hasTts: !!freshTts,
                  hasPredict: freshTts && typeof freshTts.predict === 'function',
                  action: 'Module reload failed - voice switching may not work'
                });
              }
            } catch (reinitError) {
              console.error(`[ClipAIble Offscreen] ❌ Module reload error`, {
                messageId,
                previousVoice: lastUsedVoiceId,
                newVoice: finalVoiceId,
                error: reinitError.message,
                stack: reinitError.stack,
                action: 'Module reload failed - voice switching may not work'
              });
            }
            
            console.log(`[ClipAIble Offscreen] === AGGRESSIVE CACHE CLEARING COMPLETE ===`, {
              messageId,
              previousVoice: lastUsedVoiceId,
              newVoice: finalVoiceId,
              mechanisms: {
                singletonCleared: singletonCleared,
                moduleReloaded: moduleReloaded
              },
              note: 'All caches cleared, module reloaded - synthesis will use new voice. Singleton clear + module reload is sufficient for voice switching.'
            });
          } else {
            // No voice change - log for debugging
            console.log(`[ClipAIble Offscreen] No voice change detected for ${messageId}`, {
              messageId,
              lastUsedVoiceId: lastUsedVoiceId,
              finalVoiceId: finalVoiceId,
              voiceChanged: false,
              note: 'Using same voice as previous request - no cache clearing needed'
            });
          }
          
          // CRITICAL: Update last used voice BEFORE synthesis starts
          // This ensures we track the voice that will be used
          lastUsedVoiceId = finalVoiceId;
          
          console.log(`[ClipAIble Offscreen] === VOICE TRACKING UPDATED === for ${messageId}`, {
            messageId,
            currentVoice: finalVoiceId,
            VOICE_STRING: `VOICE="${finalVoiceId}"`, // Explicit string for visibility
            voiceChanged: voiceChanged,
            previousVoice: voiceChanged ? (lastUsedVoiceId === finalVoiceId ? null : lastUsedVoiceId) : null,
            note: 'Voice tracking updated - synthesis will use this voice. Models are stored permanently in IndexedDB.'
          });
          
          console.log(`[ClipAIble Offscreen] === VOICE READY FOR SYNTHESIS === for ${messageId}`, {
            messageId,
            voiceId,
            downloadVoiceId,
            langCode,
            isStored: stored.includes(voiceId || downloadVoiceId),
            requestedVoice: voice,
            finalVoiceId: finalVoiceId,
            voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown'),
            voiceChanged: voiceChanged,
            previousVoice: lastUsedVoiceId === finalVoiceId ? null : (voiceChanged ? lastUsedVoiceId : null)
          });
          
          // Sanitize text for Piper TTS
          // Piper TTS uses espeak-ng phonemizer which may fail on certain characters
          // CRITICAL: Aggressive sanitization to prevent phoneme index errors
          // The error "idx=141 must be within the inclusive range [-130,129]" indicates
          // that the phonemizer generated an invalid token index, likely due to unsupported characters
          
          // Log before sanitization
          const beforeSanitization = {
            length: text.length,
            nonAsciiCount: (text.match(/[^\x00-\x7F]/g) || []).length,
            controlCharsCount: (text.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length,
            zeroWidthCount: (text.match(/[\u200B-\u200D\uFEFF]/g) || []).length,
            typographicQuotes: (text.match(/[""]/g) || []).length,
            typographicDashes: (text.match(/[—–]/g) || []).length,
            preview: text.substring(0, 200),
            end: '...' + text.substring(Math.max(0, text.length - 100))
          };
          
          console.log(`[ClipAIble Offscreen] === TEXT SANITIZATION START === for ${messageId}`, {
            messageId,
            beforeSanitization
          });
          
          let sanitizedText = text
            // Remove zero-width characters
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Replace non-breaking spaces with regular spaces
            .replace(/\u00A0/g, ' ')
            // Normalize typographic quotes (smart quotes to regular quotes)
            .replace(/[""]/g, '"')  // Left/right double quotes to regular quote
            .replace(/['']/g, "'")  // Left/right single quotes to apostrophe
            // Normalize typographic dashes
            .replace(/—/g, ' - ')   // Em dash to hyphen with spaces
            .replace(/–/g, '-')     // En dash to hyphen
            // Remove control characters except newlines and tabs
            .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
            // Remove other problematic Unicode characters that may cause phoneme errors
            // Remove mathematical symbols, arrows, and other special symbols
            .replace(/[←→↑↓↔↕⇐⇒⇑⇓⇔⇕]/g, '')  // Arrows
            .replace(/[•◦▪▫]/g, ' ')  // Bullets to space
            .replace(/[©®™]/g, '')  // Copyright symbols
            .replace(/[€£¥]/g, '')  // Currency symbols (keep $ as it's common)
            .replace(/[°±×÷]/g, '')  // Math symbols
            .replace(/[…]/g, '...')  // Ellipsis to three dots
            // Normalize whitespace (but preserve paragraph breaks)
            .replace(/[ \t]+/g, ' ')  // Multiple spaces/tabs to single space
            .replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double newline
            .trim();
          
          // Additional aggressive sanitization: remove any remaining problematic characters
          // Keep only printable ASCII + common punctuation + newlines for English text
          // For non-English, we'll be more permissive but still remove clearly problematic chars
          if (langCode === 'en') {
            // For English, be very strict - only allow ASCII printable + newlines
            sanitizedText = sanitizedText
              .split('')
              .map(char => {
                const code = char.charCodeAt(0);
                // Allow: ASCII printable (32-126), newline (10), tab (9)
                if ((code >= 32 && code <= 126) || code === 10 || code === 9) {
                  return char;
                }
                // Replace with space for other characters
                return ' ';
              })
              .join('')
              .replace(/[ \t]+/g, ' ')  // Normalize spaces again
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          } else {
            // For non-English, remove only clearly problematic characters
            // Keep most Unicode letters and common punctuation
            sanitizedText = sanitizedText
              .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\t]/gu, ' ')  // Keep letters, numbers, punctuation, whitespace
              .replace(/[ \t]+/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          }
          
          // Log after sanitization
          const afterSanitization = {
            length: sanitizedText.length,
            nonAsciiCount: (sanitizedText.match(/[^\x00-\x7F]/g) || []).length,
            controlCharsCount: (sanitizedText.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length,
            zeroWidthCount: (sanitizedText.match(/[\u200B-\u200D\uFEFF]/g) || []).length,
            typographicQuotes: (sanitizedText.match(/[""]/g) || []).length,
            typographicDashes: (sanitizedText.match(/[—–]/g) || []).length,
            preview: sanitizedText.substring(0, 200),
            end: '...' + sanitizedText.substring(Math.max(0, sanitizedText.length - 100)),
            lengthChange: sanitizedText.length - text.length,
            lengthChangePercent: Math.round(((sanitizedText.length - text.length) / text.length) * 100)
          };
          
          console.log(`[ClipAIble Offscreen] === TEXT SANITIZATION COMPLETE === for ${messageId}`, {
            messageId,
            afterSanitization,
            sanitizationChanges: {
              lengthReduction: text.length - sanitizedText.length,
              nonAsciiRemoved: beforeSanitization.nonAsciiCount - afterSanitization.nonAsciiCount,
              controlCharsRemoved: beforeSanitization.controlCharsCount - afterSanitization.controlCharsCount,
              zeroWidthRemoved: beforeSanitization.zeroWidthCount - afterSanitization.zeroWidthCount,
              typographicQuotesRemoved: beforeSanitization.typographicQuotes - afterSanitization.typographicQuotes,
              typographicDashesRemoved: beforeSanitization.typographicDashes - afterSanitization.typographicDashes
            }
          });
          
          // Log detailed text analysis for debugging phoneme errors
          const nonAsciiChars = sanitizedText.match(/[^\x00-\x7F]/g) || [];
          const uniqueNonAscii = [...new Set(nonAsciiChars)];
          const hasTypographicQuotes = /[""]/.test(sanitizedText);
          const hasEmDash = /—/.test(sanitizedText);
          const hasEnDash = /–/.test(sanitizedText);
          
          console.log(`[ClipAIble Offscreen] Starting speech generation for ${messageId}`, {
            messageId,
            voiceId,
            originalTextLength: text.length,
            sanitizedTextLength: sanitizedText.length,
            textPreview: sanitizedText.substring(0, 300),
            textEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 150)),
            nonAsciiCount: nonAsciiChars.length,
            uniqueNonAsciiChars: uniqueNonAscii.slice(0, 20), // First 20 unique non-ASCII chars
            hasTypographicQuotes,
            hasEmDash,
            hasEnDash,
            firstChars: Array.from(sanitizedText.substring(0, 50)).map(c => `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
          });
          
          if (sanitizedText.length === 0) {
            throw new Error('Text is empty after sanitization');
          }
          
          // Memory monitoring function
          const checkMemory = () => {
            if (performance.memory) {
              const used = performance.memory.usedJSHeapSize / 1024 / 1024;
              const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
              const usage = used / limit;
              
              console.log(`[ClipAIble Offscreen] Memory check for ${messageId}`, {
                messageId,
                usedMB: used.toFixed(2),
                limitMB: limit.toFixed(2),
                usagePercent: (usage * 100).toFixed(1)
              });
              
              if (usage > 0.9) {
                console.warn(`[ClipAIble Offscreen] Memory usage critical (>90%) for ${messageId}`, {
                  messageId,
                  usagePercent: (usage * 100).toFixed(1)
                });
                return false;
              }
            }
            return true;
          };
          
          // Streaming inference: split text into sentences for lower peak memory
          // Perplexity recommendation: process sentence by sentence to reduce memory pressure
          const splitIntoSentences = (text) => {
            // Split by sentence endings, but keep punctuation with sentence
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            // Filter out empty sentences
            return sentences.map(s => s.trim()).filter(s => s.length > 0);
          };
          
          const sentences = splitIntoSentences(sanitizedText);
          let useStreaming = sentences.length > 1 && sanitizedText.length > 2000; // Use streaming for long texts
          
          console.log(`[ClipAIble Offscreen] Text splitting for ${messageId}`, {
            messageId,
            totalLength: sanitizedText.length,
            sentencesCount: sentences.length,
            useStreaming,
            avgSentenceLength: sentences.length > 0 ? Math.round(sanitizedText.length / sentences.length) : 0
          });
          
          const synthesisStart = Date.now();
          let lastPercent = -1;
          
          // Try synthesis with current voice, fallback to alternative voice on phoneme error
          // Also handle model corruption errors with retry after cache cleanup
          let wavBlob;
          let retryCount = 0;
          const maxRetries = 2;
          
          while (retryCount <= maxRetries) {
            try {
              // Check memory before synthesis
              if (!checkMemory()) {
                console.warn(`[ClipAIble Offscreen] Memory check failed, using streaming mode for ${messageId}`, {
                  messageId
                });
                // Force streaming if memory is high
                useStreaming = true;
              }
              
              if (useStreaming && sentences.length > 1) {
                // Streaming mode: process sentences one by one
                console.log(`[ClipAIble Offscreen] Using streaming inference for ${messageId}`, {
                  messageId,
                  sentencesCount: sentences.length
                });
                
                const audioChunks = [];
                
                for (let i = 0; i < sentences.length; i++) {
                  const sentence = sentences[i];
                  
                  console.log(`[ClipAIble Offscreen] Processing sentence ${i + 1}/${sentences.length} for ${messageId}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    totalSentences: sentences.length,
                    sentenceLength: sentence.length,
                    sentencePreview: sentence.substring(0, 100)
                  });
                  
                  // Check memory before each sentence
                  if (!checkMemory()) {
                    console.warn(`[ClipAIble Offscreen] Memory critical, skipping remaining sentences for ${messageId}`, {
                      messageId,
                      processedSentences: i,
                      totalSentences: sentences.length
                    });
                    break;
                  }
                  
                  // CRITICAL: Validate voiceId before predict() call
                  const predictVoiceId = voiceId || downloadVoiceId;
                  if (!predictVoiceId || typeof predictVoiceId !== 'string' || predictVoiceId === 'undefined' || predictVoiceId.trim() === '') {
                    throw new Error(`Invalid voiceId before predict() for sentence ${i + 1}: ${predictVoiceId}. Original voiceId: ${voiceId}, downloadVoiceId: ${downloadVoiceId}`);
                  }
                  
                  console.log(`[ClipAIble Offscreen] === CALLING tts.predict FOR SENTENCE ${i + 1}/${sentences.length} === VOICE="${predictVoiceId}" ===`, {
                    messageId,
                    sentenceIndex: i + 1,
                    totalSentences: sentences.length,
                    predictVoiceId,
                    PREDICT_VOICE_STRING: `VOICE="${predictVoiceId}"`, // Explicit string for visibility
                    predictVoiceIdType: typeof predictVoiceId,
                    predictVoiceIdLength: predictVoiceId.length,
                    sentenceLength: sentence.length,
                    originalVoiceId: voiceId,
                    downloadVoiceId: downloadVoiceId,
                    voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown')
                  });
                  
                  // CRITICAL: Log stored voices before predict to verify model availability
                  const storedBeforePredict = await tts.stored();
                  console.log(`[ClipAIble Offscreen] Stored voices BEFORE predict() for sentence ${i + 1}/${sentences.length}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    storedVoices: storedBeforePredict,
                    isVoiceStored: storedBeforePredict.includes(predictVoiceId),
                    storedCount: storedBeforePredict.length
                  });
                  
                  // CRITICAL: Verify voice matches expected voice
                  // This ensures we're using the voice selected in popup, not a cached one
                  // Models are stored in IndexedDB permanently (survive extension restarts)
                  // But we need to ensure library uses the correct voice for this request
                  const expectedVoice = voiceId || downloadVoiceId;
                  
                  if (lastUsedVoiceId !== null && lastUsedVoiceId !== predictVoiceId) {
                    console.error(`[ClipAIble Offscreen] CRITICAL ERROR: Voice mismatch with tracked voice!`, {
                      messageId,
                      sentenceIndex: i + 1,
                      expectedVoice: lastUsedVoiceId,
                      actualVoice: predictVoiceId,
                      action: 'Voice changed during sentence processing - correcting to tracked voice!',
                      willUse: lastUsedVoiceId
                    });
                    // Use the tracked voice (from popup)
                    predictVoiceId = lastUsedVoiceId;
                    console.log(`[ClipAIble Offscreen] Corrected voice to tracked voice`, {
                      messageId,
                      sentenceIndex: i + 1,
                      correctedVoice: predictVoiceId
                    });
                  }
                  
                  // CRITICAL: Final verification before predict()
                  // Ensure we're using the voice from popup, not a cached one
                  if (predictVoiceId !== expectedVoice) {
                    console.warn(`[ClipAIble Offscreen] Voice mismatch before predict() - correcting`, {
                      messageId,
                      sentenceIndex: i + 1,
                      predictVoiceId,
                      expectedVoice,
                      action: 'Correcting to expected voice from popup'
                    });
                    predictVoiceId = expectedVoice;
                  }
                  
                  // Synthesize sentence
                  const predictStartTime = Date.now();
                  
                  // CRITICAL: Explicitly pass voiceId to ensure library uses correct voice
                  // Log the exact parameters being passed
                  console.log(`[ClipAIble Offscreen] === CALLING tts.predict WITH PARAMETERS ===`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    VOICE_PARAM: `voiceId="${predictVoiceId}"`, // Explicit string for visibility
                    textLength: sentence.length,
                    textPreview: sentence.substring(0, 50) + '...',
                    lastUsedVoiceId: lastUsedVoiceId,
                    expectedVoice: expectedVoice,
                    voiceMatchesExpected: predictVoiceId === expectedVoice,
                    voiceMatchesLastUsed: lastUsedVoiceId === predictVoiceId
                  });
                  
                  // CRITICAL: Double-check voiceId before predict()
                  // This is the final check to ensure correct voice is used
                  if (!predictVoiceId || predictVoiceId !== expectedVoice) {
                    console.error(`[ClipAIble Offscreen] CRITICAL: Invalid voiceId before predict() - using expected voice`, {
                      messageId,
                      sentenceIndex: i + 1,
                      predictVoiceId,
                      expectedVoice,
                      action: 'Forcing expected voice'
                    });
                    predictVoiceId = expectedVoice;
                  }
                  
                  const sentenceBlob = await tts.predict({
                    text: sentence,
                    voiceId: predictVoiceId // CRITICAL: Always use the voice from popup
                  });
                  const predictDuration = Date.now() - predictStartTime;
                  
                  console.log(`[ClipAIble Offscreen] tts.predict COMPLETED for sentence ${i + 1}/${sentences.length}`, {
                    messageId,
                    sentenceIndex: i + 1,
                    predictVoiceId,
                    predictDuration,
                    blobSize: sentenceBlob?.size || 0,
                    blobType: sentenceBlob?.type || 'unknown'
                  });
                  
                  audioChunks.push(sentenceBlob);
                  
                  // Free memory hint: release reference to sentence text
                  // Give browser time for GC between sentences
                  await new Promise(resolve => setTimeout(resolve, 10));
                }
                
                // Concatenate audio chunks properly
                // CRITICAL: WAV files have headers - we can't just concatenate them
                // We need to extract PCM data from each WAV and create a new valid WAV file
                const audioBuffers = await Promise.all(
                  audioChunks.map(blob => blob.arrayBuffer())
                );
                
                console.log(`[ClipAIble Offscreen] Concatenating ${audioBuffers.length} WAV buffers for ${messageId}`, {
                  messageId,
                  buffersCount: audioBuffers.length,
                  firstBufferSize: audioBuffers[0]?.byteLength || 0
                });
                
                // Use proper WAV concatenation function
                const combinedBuffer = concatenateWavBuffers(audioBuffers);
                
                // Convert back to Blob
                wavBlob = new Blob([combinedBuffer], { type: 'audio/wav' });
                
                console.log(`[ClipAIble Offscreen] Streaming synthesis complete for ${messageId}`, {
                  messageId,
                  sentencesProcessed: audioChunks.length,
                  totalSize: wavBlob.size,
                  duration: Date.now() - synthesisStart
                });
              } else {
                // Single-pass mode: process entire text at once
                console.log(`[ClipAIble Offscreen] Attempting synthesis with voice ${voiceId} for ${messageId}`, {
                  messageId,
                  voiceId,
                  retryCount,
                  maxRetries,
                  sanitizedTextLength: sanitizedText.length,
                  sanitizedTextPreview: sanitizedText.substring(0, 200),
                  sanitizedTextEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 100))
                });
                
                // CRITICAL: Validate voiceId before predict() call
                // Use the voice from popup (voiceId || downloadVoiceId)
                // This ensures we always use the voice selected in popup, not a cached one
                let predictVoiceId = voiceId || downloadVoiceId;
                
                // CRITICAL: Final verification - ensure we're using the voice from popup
                // This is the voice that was selected in popup and should be used
                const expectedVoice = voiceId || downloadVoiceId;
                if (predictVoiceId !== expectedVoice) {
                  console.warn(`[ClipAIble Offscreen] Voice mismatch in single-pass mode - correcting`, {
                    messageId,
                    predictVoiceId,
                    expectedVoice,
                    action: 'Correcting to expected voice from popup'
                  });
                  predictVoiceId = expectedVoice;
                }
                
                // CRITICAL: Verify voice matches lastUsedVoiceId (the voice we're tracking)
                if (lastUsedVoiceId !== null && predictVoiceId !== lastUsedVoiceId) {
                  console.warn(`[ClipAIble Offscreen] Voice mismatch with tracked voice in single-pass mode - correcting`, {
                    messageId,
                    predictVoiceId,
                    lastUsedVoiceId,
                    action: 'Correcting to tracked voice (from popup)'
                  });
                  predictVoiceId = lastUsedVoiceId;
                }
                
                if (!predictVoiceId || typeof predictVoiceId !== 'string' || predictVoiceId === 'undefined' || predictVoiceId.trim() === '') {
                  throw new Error(`Invalid voiceId before predict(): ${predictVoiceId}. Original voiceId: ${voiceId}, downloadVoiceId: ${downloadVoiceId}, finalVoiceId: ${typeof finalVoiceId !== 'undefined' ? finalVoiceId : 'undefined'}`);
                }
                
                console.log(`[ClipAIble Offscreen] === CALLING tts.predict (SINGLE-PASS MODE) === VOICE="${predictVoiceId}" ===`, {
                  messageId,
                  predictVoiceId,
                  VOICE_PARAM: `voiceId="${predictVoiceId}"`, // Explicit string for visibility
                  PREDICT_VOICE_STRING: `VOICE="${predictVoiceId}"`, // Explicit string for visibility
                  predictVoiceIdType: typeof predictVoiceId,
                  predictVoiceIdLength: predictVoiceId.length,
                  textLength: sanitizedText.length,
                  originalVoiceId: voiceId,
                  downloadVoiceId: downloadVoiceId,
                  finalVoiceId: typeof finalVoiceId !== 'undefined' ? finalVoiceId : 'undefined',
                  expectedVoice: expectedVoice,
                  voiceMatchesExpected: predictVoiceId === expectedVoice,
                  voiceIdSource: voiceId ? 'voiceId' : (downloadVoiceId ? 'downloadVoiceId' : 'unknown')
                });
                
                // CRITICAL: Log stored voices before predict to verify model availability
                const storedBeforePredict = await tts.stored();
                console.log(`[ClipAIble Offscreen] Stored voices BEFORE predict() (single-pass mode)`, {
                  messageId,
                  predictVoiceId,
                  storedVoices: storedBeforePredict,
                  isVoiceStored: storedBeforePredict.includes(predictVoiceId),
                  storedCount: storedBeforePredict.length
                });
                
                const predictStartTime = Date.now();
                wavBlob = await tts.predict({
                  text: sanitizedText,
                  voiceId: predictVoiceId
                }, (progress) => {
                  if (progress.total > 0) {
                    const percent = Math.round((progress.loaded * 100) / progress.total);
                    // Log only every 10%
                    if (percent >= lastPercent + 10 || percent === 100) {
                      console.log(`[ClipAIble Offscreen] Synthesis progress for ${messageId}`, {
                        messageId,
                        percent,
                        loaded: progress.loaded,
                        total: progress.total
                      });
                      lastPercent = percent;
                    }
                  }
                });
                
                const predictDuration = Date.now() - predictStartTime;
                console.log(`[ClipAIble Offscreen] tts.predict COMPLETED (single-pass mode)`, {
                  messageId,
                  predictVoiceId,
                  predictDuration,
                  blobSize: wavBlob?.size || 0,
                  blobType: wavBlob?.type || 'unknown'
                });
              }
              
              // Success - break out of retry loop
              break;
            } catch (predictError) {
              // CRITICAL: Log full error details for debugging
              console.error(`[ClipAIble Offscreen] CRITICAL: predict() error for ${messageId}`, {
                messageId,
                voiceId,
                downloadVoiceId,
                errorMessage: predictError.message,
                errorName: predictError.name,
                errorStack: predictError.stack,
                errorKeys: Object.keys(predictError),
                errorString: String(predictError),
                retryCount
              });
              
              // Check if it's a model corruption error or WASM abort
              const isModelError = predictError.message && (
                predictError.message.includes('No graph was found in the protobuf') ||
                predictError.message.includes('Can\'t create a session') ||
                predictError.message.includes('protobuf') ||
                predictError.message.includes('ERROR_CODE: 2') ||
                predictError.message.includes('Aborted()') ||
                predictError.message.includes('ASSERTIONS')
              );
              
              // If it's a model error and we haven't exhausted retries, clear cache and retry
              if (isModelError && retryCount < maxRetries) {
                console.log(`[ClipAIble Offscreen] Model corruption detected for ${voiceId}, clearing cache and retrying (attempt ${retryCount + 1}/${maxRetries})`, {
                  messageId,
                  voiceId,
                  error: predictError.message,
                  retryCount: retryCount + 1
                });
                
                try {
                  // CRITICAL: More aggressive cache clearing - try multiple methods
                  console.log(`[ClipAIble Offscreen] Attempting aggressive cache clearing for ${voiceId}`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  // Method 1: Use tts.remove() if available
                  if (tts.remove && typeof tts.remove === 'function') {
                    try {
                    await tts.remove(voiceId);
                      console.log(`[ClipAIble Offscreen] Removed corrupted model ${voiceId} from cache (method 1)`, {
                        messageId,
                        voiceId
                      });
                    } catch (removeError) {
                      console.warn(`[ClipAIble Offscreen] Failed to remove model using tts.remove()`, {
                        messageId,
                        voiceId,
                        error: removeError.message
                      });
                    }
                  }
                  
                  // Method 2: Wait a bit for cache to clear
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Method 3: Verify it's actually removed
                  const storedAfterRemove = await tts.stored();
                  const stillStored = storedAfterRemove.includes(voiceId);
                  if (stillStored) {
                    console.warn(`[ClipAIble Offscreen] Model ${voiceId} still in cache after removal attempt`, {
                      messageId,
                      voiceId,
                      storedVoices: storedAfterRemove
                    });
                    // Try removing again
                    if (tts.remove && typeof tts.remove === 'function') {
                      try {
                        await tts.remove(voiceId);
                        await new Promise(resolve => setTimeout(resolve, 500));
                      } catch (retryRemoveError) {
                        console.warn(`[ClipAIble Offscreen] Second removal attempt also failed`, {
                          messageId,
                          voiceId,
                          error: retryRemoveError.message
                        });
                      }
                    }
                  } else {
                    console.log(`[ClipAIble Offscreen] Model ${voiceId} successfully removed from cache`, {
                      messageId,
                      voiceId
                    });
                  }
                  
                  // Re-download the model
                  // CRITICAL: Validate voiceId before re-download
                  if (!voiceId || typeof voiceId !== 'string' || voiceId === 'undefined' || voiceId.trim() === '') {
                    const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                    console.error(`[ClipAIble Offscreen] Invalid voiceId during re-download for ${messageId}, using fallback`, {
                      messageId,
                      originalVoiceId: voiceId,
                      fallbackVoiceId
                    });
                    voiceId = fallbackVoiceId;
                  }
                  
                  console.log(`[ClipAIble Offscreen] Re-downloading model ${voiceId} after corruption`, {
                    messageId,
                    voiceId
                  });
                  
                  try {
                    let downloadComplete = false;
                    let finalProgress = null;
                  
                  await tts.download(voiceId, (progress) => {
                      finalProgress = progress;
                    if (progress.total > 0) {
                      const percent = Math.round((progress.loaded * 100) / progress.total);
                      if (percent >= lastPercent + 10 || percent === 100) {
                        console.log(`[ClipAIble Offscreen] Re-download progress for ${messageId}`, {
                            messageId,
                            voiceId,
                            percent,
                            loaded: progress.loaded,
                            total: progress.total,
                            isComplete: progress.loaded >= progress.total
                          });
                          lastPercent = percent;
                        }
                        // Check if download is complete
                        if (progress.loaded >= progress.total && progress.total > 0) {
                          downloadComplete = true;
                        }
                      }
                    });
                    
                    // CRITICAL: Verify download completed successfully
                    if (finalProgress && finalProgress.total > 0) {
                      const isComplete = finalProgress.loaded >= finalProgress.total;
                      console.log(`[ClipAIble Offscreen] Re-download verification for ${messageId}`, {
                        messageId,
                        voiceId,
                        loaded: finalProgress.loaded,
                        total: finalProgress.total,
                        isComplete,
                        percent: Math.round((finalProgress.loaded * 100) / finalProgress.total)
                      });
                      
                      if (!isComplete) {
                        throw new Error(`Model download incomplete: ${finalProgress.loaded}/${finalProgress.total} bytes`);
                      }
                    }
                    
                    // CRITICAL: Verify model is stored after re-download
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for storage to complete
                    const verifyAfterRedownload = await tts.stored();
                    const isStoredAfterRedownload = verifyAfterRedownload.includes(voiceId);
                    
                    console.log(`[ClipAIble Offscreen] Post-re-download verification for ${messageId}`, {
                      messageId,
                      voiceId,
                      isStoredAfterRedownload,
                      storedVoices: verifyAfterRedownload
                    });
                    
                    if (!isStoredAfterRedownload) {
                      throw new Error(`Model ${voiceId} not found in storage after re-download`);
                    }
                  } catch (redownloadError) {
                    // Handle JSON parsing errors from HuggingFace 404 responses
                    const isJsonParseError = redownloadError.message && (
                      redownloadError.message.includes('Unexpected token') ||
                      redownloadError.message.includes('is not valid JSON') ||
                      redownloadError.message.includes('JSON.parse')
                    );
                    
                    // Handle "Entry not found" errors (404 from HuggingFace)
                    const isEntryNotFound = redownloadError.message && (
                      redownloadError.message.includes('Entry not found') ||
                      redownloadError.message.includes('404') ||
                      redownloadError.message.includes('not found')
                    );
                    
                    if (isJsonParseError || isEntryNotFound) {
                      console.error(`[ClipAIble Offscreen] Voice ${voiceId} not found during re-download for ${messageId}`, {
                        messageId,
                        voiceId,
                        errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                        originalError: redownloadError.message
                      });
                      // Try fallback voice
                      const fallbackVoiceId = DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                      if (fallbackVoiceId !== voiceId) {
                        console.log(`[ClipAIble Offscreen] Trying fallback voice ${fallbackVoiceId} for ${messageId}`, {
                          messageId,
                          originalVoiceId: voiceId,
                          fallbackVoiceId
                        });
                        voiceId = fallbackVoiceId;
                        // Retry download with fallback
                        await tts.download(voiceId, (progress) => {
                          if (progress.total > 0) {
                            const percent = Math.round((progress.loaded * 100) / progress.total);
                            if (percent >= lastPercent + 10 || percent === 100) {
                              console.log(`[ClipAIble Offscreen] Fallback re-download progress for ${messageId}`, {
                          messageId,
                          voiceId,
                          percent,
                          loaded: progress.loaded,
                          total: progress.total
                        });
                        lastPercent = percent;
                      }
                    }
                  });
                      } else {
                        throw new Error(`Voice "${voiceId}" not found and no fallback available. Please select a valid voice from the list.`);
                      }
                    } else {
                      throw redownloadError;
                    }
                  }
                  
                  // CRITICAL: Try to verify model can be loaded before retrying synthesis
                  // This helps catch corruption early
                  console.log(`[ClipAIble Offscreen] Model ${voiceId} re-downloaded, verifying integrity before retry`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  // Wait a bit more for storage to fully complete
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Verify model is still stored
                  const finalVerify = await tts.stored();
                  const isFinalStored = finalVerify.includes(voiceId);
                  
                  if (!isFinalStored) {
                    console.error(`[ClipAIble Offscreen] Model ${voiceId} disappeared from storage after re-download`, {
                      messageId,
                      voiceId,
                      storedVoices: finalVerify
                    });
                    throw new Error(`Model ${voiceId} not found in storage after re-download`);
                  }
                  
                  console.log(`[ClipAIble Offscreen] Model ${voiceId} verified in storage, retrying synthesis`, {
                    messageId,
                    voiceId,
                    retryCount: retryCount + 1
                  });
                  
                  retryCount++;
                  lastPercent = -1; // Reset progress tracking
                  continue; // Retry synthesis
                } catch (cleanupError) {
                  console.error(`[ClipAIble Offscreen] Failed to clear cache and re-download model ${voiceId}`, {
                    messageId,
                    voiceId,
                    cleanupError: cleanupError.message,
                    originalError: predictError.message
                  });
                  // If cleanup fails, break and let error propagate
                  throw predictError;
                }
              }
              
              // If model error persists after all retries, try fallback voice
              if (isModelError && retryCount >= maxRetries) {
                console.error(`[ClipAIble Offscreen] Model corruption persists after ${maxRetries} retries for ${voiceId}, trying fallback voice for ${messageId}`, {
                  messageId,
                  voiceId,
                  langCode,
                  fallbackVoice: FALLBACK_VOICES[langCode]
                });
                
                // Try fallback voice if available
                const fallbackVoiceId = FALLBACK_VOICES[langCode] || DEFAULT_VOICES[langCode] || DEFAULT_VOICES['en'];
                if (fallbackVoiceId && fallbackVoiceId !== voiceId) {
                  console.log(`[ClipAIble Offscreen] Switching to fallback voice ${fallbackVoiceId} for ${messageId}`, {
                    messageId,
                    originalVoiceId: voiceId,
                    fallbackVoiceId
                  });
                  
                  // Clear corrupted voice
                  if (tts.remove && typeof tts.remove === 'function') {
                    try {
                      await tts.remove(voiceId);
                    } catch (removeError) {
                      console.warn(`[ClipAIble Offscreen] Failed to remove corrupted voice`, {
                        messageId,
                        voiceId,
                        error: removeError.message
                      });
                    }
                  }
                  
                  // Switch to fallback
                  voiceId = fallbackVoiceId;
                  downloadVoiceId = fallbackVoiceId;
                  
                  // Check if fallback is downloaded
                  const stored = await tts.stored();
                  if (!stored.includes(fallbackVoiceId)) {
                    console.log(`[ClipAIble Offscreen] Downloading fallback voice ${fallbackVoiceId} for ${messageId}`);
                    try {
                      await tts.download(fallbackVoiceId);
                    } catch (fallbackDownloadError) {
                      console.error(`[ClipAIble Offscreen] Failed to download fallback voice`, {
                        messageId,
                        fallbackVoiceId,
                        error: fallbackDownloadError.message
                      });
                      throw new Error(`Failed to download fallback voice: ${fallbackDownloadError.message}`);
                    }
                  }
                  
                  // Reset retry count and continue with fallback
                  retryCount = 0;
                  continue;
                }
              }
              
              // If not a model error or retries exhausted, check for phoneme error
              const isPhonemeError = predictError.message && (
                predictError.message.includes('indices element out of data bounds') ||
                predictError.message.includes('Gather node') ||
                predictError.message.includes('idx=') ||
                predictError.message.includes('inclusive range')
              );
              
              if (isPhonemeError && !isFallbackVoice) {
              // Try fallback voice for current language first
              let fallbackVoiceId = null;
              
              if (langCode in FALLBACK_VOICES) {
                fallbackVoiceId = FALLBACK_VOICES[langCode];
                // Only use fallback if it's different from current voice
                if (fallbackVoiceId === voiceId) {
                  fallbackVoiceId = null;
                }
              }
              
              // If no fallback for current language or fallback is same, try English fallback
              if (!fallbackVoiceId && langCode !== 'en' && 'en' in FALLBACK_VOICES) {
                fallbackVoiceId = FALLBACK_VOICES['en'];
                console.log(`[ClipAIble Offscreen] No fallback for ${langCode}, trying English fallback voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  originalVoice: voiceId,
                  originalLang: langCode,
                  fallbackVoice: fallbackVoiceId,
                  error: predictError.message
                });
              } else if (fallbackVoiceId) {
                console.log(`[ClipAIble Offscreen] Phoneme error with ${voiceId}, trying fallback voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  originalVoice: voiceId,
                  fallbackVoice: fallbackVoiceId,
                  error: predictError.message
                });
              }
              
              if (fallbackVoiceId) {
                // CRITICAL: Validate fallback voice ID
                if (!fallbackVoiceId || typeof fallbackVoiceId !== 'string' || fallbackVoiceId === 'undefined' || fallbackVoiceId.trim() === '') {
                  console.error(`[ClipAIble Offscreen] Invalid fallback voice ID for ${messageId}`, {
                    messageId,
                    fallbackVoiceId,
                    langCode,
                    fallbackVoices: FALLBACK_VOICES
                  });
                  // Try English fallback
                  fallbackVoiceId = FALLBACK_VOICES['en'] || DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                  if (!fallbackVoiceId || typeof fallbackVoiceId !== 'string' || fallbackVoiceId === 'undefined' || fallbackVoiceId.trim() === '') {
                    throw new Error(`Cannot determine valid fallback voice. Language: ${langCode}`);
                  }
                }
                
                // Check if fallback voice is downloaded
                const stored = await tts.stored();
                if (!stored.includes(fallbackVoiceId)) {
                  console.log(`[ClipAIble Offscreen] Downloading fallback voice ${fallbackVoiceId} for ${messageId}`);
                  try {
                  await tts.download(fallbackVoiceId);
                  } catch (fallbackDownloadError) {
                    // Handle JSON parsing errors from HuggingFace 404 responses
                    const isJsonParseError = fallbackDownloadError.message && (
                      fallbackDownloadError.message.includes('Unexpected token') ||
                      fallbackDownloadError.message.includes('is not valid JSON') ||
                      fallbackDownloadError.message.includes('JSON.parse')
                    );
                    
                    // Handle "Entry not found" errors (404 from HuggingFace)
                    const isEntryNotFound = fallbackDownloadError.message && (
                      fallbackDownloadError.message.includes('Entry not found') ||
                      fallbackDownloadError.message.includes('404') ||
                      fallbackDownloadError.message.includes('not found')
                    );
                    
                    if (isJsonParseError || isEntryNotFound) {
                      console.error(`[ClipAIble Offscreen] Fallback voice ${fallbackVoiceId} not found for ${messageId}`, {
                        messageId,
                        fallbackVoiceId,
                        errorType: isJsonParseError ? 'JSON parse error (likely 404)' : 'Entry not found',
                        originalError: fallbackDownloadError.message
                      });
                      // Try English default as last resort
                      const englishFallback = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
                      if (englishFallback !== fallbackVoiceId) {
                        console.log(`[ClipAIble Offscreen] Trying English default ${englishFallback} as last resort for ${messageId}`, {
                          messageId,
                          originalFallback: fallbackVoiceId,
                          englishFallback
                        });
                        fallbackVoiceId = englishFallback;
                        try {
                          await tts.download(fallbackVoiceId);
                        } catch (englishDownloadError) {
                          throw new Error(`Cannot download any valid voice. Original: ${voiceId}, Fallback: ${fallbackVoiceId}, Error: ${englishDownloadError.message}`);
                        }
                      } else {
                        throw new Error(`Fallback voice "${fallbackVoiceId}" not found and no alternative available. Please select a valid voice from the list.`);
                      }
                    } else {
                      throw fallbackDownloadError;
                    }
                  }
                }
                
                // Retry with fallback voice
                voiceId = fallbackVoiceId;
                isFallbackVoice = true;
                lastPercent = -1;
                
                // Log before fallback synthesis attempt
                console.log(`[ClipAIble Offscreen] Attempting fallback synthesis with voice ${fallbackVoiceId} for ${messageId}`, {
                  messageId,
                  fallbackVoiceId,
                  sanitizedTextLength: sanitizedText.length,
                  sanitizedTextPreview: sanitizedText.substring(0, 200),
                  sanitizedTextEnd: sanitizedText.substring(Math.max(0, sanitizedText.length - 100)),
                  originalError: predictError.message
                });
                
                wavBlob = await tts.predict({
                  text: sanitizedText,
                  voiceId: fallbackVoiceId
                }, (progress) => {
                  if (progress.total > 0) {
                    const percent = Math.round((progress.loaded * 100) / progress.total);
                    if (percent >= lastPercent + 10 || percent === 100) {
                      console.log(`[ClipAIble Offscreen] Fallback synthesis progress for ${messageId}`, {
                        messageId,
                        percent,
                        loaded: progress.loaded,
                        total: progress.total
                      });
                      lastPercent = percent;
                    }
                  }
                });
              } else {
                // No valid fallback voice found, re-throw error
                throw predictError;
              }
            } else {
              // Re-throw if not a phoneme error or fallback already tried
              throw predictError;
            }
            } // End of catch block
          } // End of while loop
          
          const synthesisDuration = Date.now() - synthesisStart;
          console.log(`[ClipAIble Offscreen] Speech generation complete for ${messageId}`, {
            messageId,
            duration: synthesisDuration,
            blobType: wavBlob.type,
            blobSize: wavBlob.size
          });
          
          // Convert Blob to ArrayBuffer to Uint8Array
          const convertStart = Date.now();
          const arrayBuffer = await wavBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const convertDuration = Date.now() - convertStart;
          
          console.log(`[ClipAIble Offscreen] Audio converted for ${messageId}`, {
            messageId,
            arrayBufferSize: arrayBuffer.byteLength,
            uint8ArrayLength: uint8Array.length,
            convertDuration
          });
          
          // Optimize data transfer: use storage for large audio
          // Use hasUnlimitedStorage passed from service worker (getManifest is not available in offscreen)
          const hasUnlimitedStorage = message.data.hasUnlimitedStorage || false;
          
          // With unlimitedStorage: 50 MB threshold (practically unlimited)
          // Without unlimitedStorage: 8 MB threshold (safe margin from 10 MB limit)
          const STORAGE_THRESHOLD = hasUnlimitedStorage 
            ? 50 * 1024 * 1024  // 50 MB
            : 8 * 1024 * 1024;  // 8 MB (safe margin from 10 MB limit)
          
          // Maximum audio size validation (absolute limit)
          const MAX_AUDIO_SIZE = hasUnlimitedStorage 
            ? 100 * 1024 * 1024  // 100 MB absolute max with unlimitedStorage
            : 10 * 1024 * 1024;  // 10 MB max without unlimitedStorage
          
          // Validate maximum size before processing
          if (uint8Array.length > MAX_AUDIO_SIZE) {
            console.error(`[ClipAIble Offscreen] Audio too large for ${messageId}`, {
              messageId,
              size: uint8Array.length,
              maxSize: MAX_AUDIO_SIZE,
              hasUnlimitedStorage
            });
            
            sendResponse({
              success: false,
              error: `Audio too large: ${(uint8Array.length / 1024 / 1024).toFixed(2)} MB exceeds maximum limit of ${(MAX_AUDIO_SIZE / 1024 / 1024).toFixed(2)} MB`,
              code: 'AUDIO_TOO_LARGE',
              audioSize: uint8Array.length,
              maxSize: MAX_AUDIO_SIZE,
              hasUnlimitedStorage
            });
            return;
          }
          
          // Log all storage settings when they are determined
          const storageSettings = {
            messageId,
            timestamp: Date.now(),
            hasUnlimitedStorage,
            storageThreshold: STORAGE_THRESHOLD,
            storageThresholdMB: (STORAGE_THRESHOLD / 1024 / 1024).toFixed(2),
            maxAudioSize: MAX_AUDIO_SIZE,
            maxAudioSizeMB: (MAX_AUDIO_SIZE / 1024 / 1024).toFixed(2),
            audioSize: uint8Array.length,
            audioSizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
            willUseStorage: uint8Array.length >= STORAGE_THRESHOLD,
            willUseInline: uint8Array.length < STORAGE_THRESHOLD
          };
          
          console.log(`[ClipAIble Offscreen] Storage threshold determined with all settings for ${messageId}`, storageSettings);
          
          const responseStart = Date.now();
          
          if (uint8Array.length < STORAGE_THRESHOLD) {
            // Small audio - send inline (faster for small files)
            console.log(`[ClipAIble Offscreen] Sending audio inline for ${messageId}`, {
              messageId,
              size: uint8Array.length,
              method: 'inline',
              threshold: STORAGE_THRESHOLD
            });
            
            const responseData = {
              success: true,
              audioData: Array.from(uint8Array),
              size: uint8Array.length,
              method: 'inline'
            };
            
            console.log(`[ClipAIble Offscreen] Response prepared (inline) for ${messageId}`, {
              messageId,
              responseSize: JSON.stringify(responseData).length,
              audioDataLength: responseData.audioData.length
            });
            
            try {
              sendResponse(responseData);
              console.log(`[ClipAIble Offscreen] Response sent successfully (inline) for ${messageId}`, {
                messageId,
                method: 'inline',
                size: uint8Array.length
              });
              
              // Voice switching works with singleton clear + module reload only
              // No need to close offscreen document - tested and confirmed
              
              return; // CRITICAL: Return after sending response to prevent fallthrough to error handler
            } catch (sendError) {
              console.error(`[ClipAIble Offscreen] Failed to send inline response for ${messageId}`, {
                messageId,
                error: sendError.message,
                errorName: sendError.name,
                errorStack: sendError.stack,
                size: uint8Array.length,
                sizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
                responseDataSize: JSON.stringify(responseData).length,
                responseDataSizeMB: (JSON.stringify(responseData).length / 1024 / 1024).toFixed(2)
              });
              // If inline send fails (e.g., message too large), try storage instead
              // Fall through to storage method
            }
          }
          
          // If inline failed or audio is too large, use storage
          // This block executes if inline send failed OR if audio was already >= threshold
          {
            // Large audio - use storage (faster for large files)
            const storageKey = `clipaible_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            console.log(`[ClipAIble Offscreen] Saving audio to storage for ${messageId}`, {
              messageId,
              storageKey,
              size: uint8Array.length,
              method: 'storage',
              threshold: STORAGE_THRESHOLD
            });
            
            try {
              // CRITICAL: Save metadata with timestamp for cleanup protection
              const metadata = {
                timestamp: Date.now(),
                size: uint8Array.length
              };
              
              // Save to chrome.storage.local with metadata
              await chrome.storage.local.set({
                [storageKey]: Array.from(uint8Array),
                [`${storageKey}_meta`]: metadata
              });
              
              console.log(`[ClipAIble Offscreen] Audio saved to storage for ${messageId}`, {
                messageId,
                storageKey,
                size: uint8Array.length,
                metadata
              });
              
              // CRITICAL: Do NOT schedule cleanup here!
              // Offscreen document can be closed, setTimeout will be lost
              // Cleanup will be handled by service worker
              
              const responseData = {
                success: true,
                storageKey: storageKey,
                size: uint8Array.length,
                method: 'storage'
              };
              
              console.log(`[ClipAIble Offscreen] Response prepared (storage) for ${messageId}`, {
                messageId,
                storageKey,
                size: uint8Array.length
              });
              
              sendResponse(responseData);
              console.log(`[ClipAIble Offscreen] Response sent successfully (storage) for ${messageId}`, {
                messageId,
                method: 'storage',
                storageKey,
                size: uint8Array.length
              });
              
              // Voice switching works with singleton clear + module reload only
              // No need to close offscreen document - tested and confirmed
              
              return; // CRITICAL: Return after sending response
            } catch (storageError) {
              console.error(`[ClipAIble Offscreen] Failed to save to storage for ${messageId}`, {
                messageId,
                error: storageError.message,
                errorName: storageError.name,
                stack: storageError.stack,
                audioSize: uint8Array.length,
                audioSizeMB: (uint8Array.length / 1024 / 1024).toFixed(2),
                threshold: STORAGE_THRESHOLD,
                thresholdMB: (STORAGE_THRESHOLD / 1024 / 1024).toFixed(2),
                hasUnlimitedStorage: hasUnlimitedStorage
              });
              
              // CRITICAL: Do NOT fallback to inline for large data!
              // This would cause message timeout and performance issues
              // Return error instead
              try {
                sendResponse({
                  success: false,
                  error: `Failed to store large audio (${uint8Array.length} bytes): ${storageError.message}. Audio exceeds storage threshold.`,
                  code: 'STORAGE_QUOTA_EXCEEDED',
                  audioSize: uint8Array.length,
                  threshold: STORAGE_THRESHOLD,
                  hasUnlimitedStorage: hasUnlimitedStorage
                });
                console.log(`[ClipAIble Offscreen] Error response sent for ${messageId}`, {
                  messageId,
                  errorCode: 'STORAGE_QUOTA_EXCEEDED'
                });
                return; // CRITICAL: Return after sending error response
              } catch (responseError) {
                console.error(`[ClipAIble Offscreen] CRITICAL: Failed to send error response for ${messageId}`, {
                  messageId,
                  responseError: responseError.message,
                  originalError: storageError.message
                });
                // Cannot send response - channel may be closed
                // This will be caught by outer try-catch
                throw new Error(`Failed to send error response: ${responseError.message}`);
              }
            }
          }
          
          const totalDuration = Date.now() - ttsRequestStart;
          console.log(`[ClipAIble Offscreen] === PIPER_TTS COMPLETE ===`, {
            messageId,
            totalDuration,
            breakdown: {
              ttsInit: ttsInitDuration,
              storedCheck: storedCheckDuration,
              synthesis: synthesisDuration,
              convert: convertDuration
            }
          });
          break;
        }
        
        case 'GET_VOICES': {
          const voicesStart = Date.now();
          console.log(`[ClipAIble Offscreen] GET_VOICES request for ${messageId}`, {
            messageId
          });
          
          const voices = await tts.voices();
          
          // CRITICAL: voices() returns Voice[] array, not an object!
          // Each Voice has structure: { key: VoiceId, name: string, language: {...}, quality: Quality, ... }
          // key is the voice ID like "ru_RU-irina-medium"
          
          // Supported languages: en, ru, uk, de, fr, es, it, pt, zh
          // Note: ja (Japanese) and ko (Korean) are not available in piper-tts-web library
          const supportedLanguages = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh'];
          
          // Filter voices:
          // 1. Only medium and high quality (exclude low and x_low)
          // 2. Only supported languages (extract base language code from CountryCode)
          const filteredVoices = voices.filter((voice) => {
            const quality = voice.quality || 'medium';
            const isLowQuality = quality === 'low' || quality === 'x_low';
            if (isLowQuality) {
              return false;
            }
            
            // Extract language code from voice key or use language property
            let langCode = '';
            if (voice.language?.code) {
              // CountryCode format: 'en_GB', 'en_US', 'ru_RU', etc.
              // Extract base language code (first 2 letters before underscore)
              const countryCode = voice.language.code.toLowerCase();
              langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
            } else {
              // Extract from voice key (e.g., "en_US-lessac-medium" -> "en")
              const langMatch = voice.key.match(/^([a-z]{2})_/i);
              langCode = langMatch ? langMatch[1].toLowerCase() : '';
            }
            
            // Check if language is supported
            return supportedLanguages.includes(langCode);
          });
          
          const result = filteredVoices.map((voice) => {
            // Extract base language code (en from en_GB, en_US, etc.)
            let langCode = '';
            if (voice.language?.code) {
              const countryCode = voice.language.code.toLowerCase();
              langCode = countryCode.split('_')[0]; // 'en_GB' -> 'en', 'ru_RU' -> 'ru'
            } else {
              const langMatch = voice.key.match(/^([a-z]{2})_/i);
              langCode = langMatch ? langMatch[1].toLowerCase() : 'unknown';
            }
            
                      return {
                        key: voice.key, // Use key directly for offline TTS
                        id: voice.key, // Keep id for backward compatibility with UI code
                        name: voice.name || voice.key,
                        language: langCode, // Base language code (en, ru, etc.)
                        quality: voice.quality || 'medium',
                        gender: voice.gender || 'unknown'
                      };
          });
          
          // Sort voices: first by language (in supported order), then by quality (high > medium), then by name
          const languageOrder = { 'en': 0, 'ru': 1, 'uk': 2, 'de': 3, 'fr': 4, 'es': 5, 'it': 6, 'pt': 7, 'zh': 8, 'ja': 9, 'ko': 10 };
          const qualityOrder = { 'high': 0, 'medium': 1 };
          result.sort((a, b) => {
            // First sort by language (in supported order)
            const aLangOrder = languageOrder[a.language] ?? 99;
            const bLangOrder = languageOrder[b.language] ?? 99;
            if (aLangOrder !== bLangOrder) {
              return aLangOrder - bLangOrder;
            }
            // Then by quality (high > medium)
            const aQuality = qualityOrder[a.quality] ?? 99;
            const bQuality = qualityOrder[b.quality] ?? 99;
            if (aQuality !== bQuality) {
              return aQuality - bQuality;
            }
            // Finally by name
            return a.name.localeCompare(b.name);
          });
          
          const voicesDuration = Date.now() - voicesStart;
          // CRITICAL: voices is Voice[] array, not an object!
          const totalVoices = Array.isArray(voices) ? voices.length : 0;
          const filteredOut = totalVoices - result.length;
          console.log(`[ClipAIble Offscreen] GET_VOICES complete for ${messageId}`, {
            messageId,
            totalVoices,
            returnedVoices: result.length,
            filteredOut,
            duration: voicesDuration,
            supportedLanguages: supportedLanguages,
            languages: [...new Set(result.map(v => v.language))],
            qualities: [...new Set(result.map(v => v.quality))],
            sampleVoices: result.slice(0, 5).map(v => ({ id: v.id, name: v.name, language: v.language, quality: v.quality }))
          });
          
          // CRITICAL: Log the exact structure being sent
          console.log(`[ClipAIble Offscreen] GET_VOICES: Sending response for ${messageId}`, {
            messageId,
            resultCount: result.length,
            sampleResult: result.slice(0, 3).map(v => ({
              id: v.id,
              idType: typeof v.id,
              name: v.name,
              language: v.language,
              quality: v.quality,
              hasUnderscore: v.id && v.id.includes('_'),
              hasDash: v.id && v.id.includes('-'),
              fullObj: JSON.stringify(v)
            })),
            firstVoiceId: result[0]?.id,
            firstVoiceIdType: typeof result[0]?.id,
            isFirstVoiceIdValid: result[0]?.id && result[0].id.includes('_') && result[0].id.includes('-')
          });
          
          sendResponse({
            success: true,
            voices: result
          });
          break;
        }
        
        case 'GET_STORED_VOICES': {
          const storedStart = Date.now();
          console.log(`[ClipAIble Offscreen] GET_STORED_VOICES request for ${messageId}`, {
            messageId
          });
          
          const stored = await tts.stored();
          const storedDuration = Date.now() - storedStart;
          
          console.log(`[ClipAIble Offscreen] GET_STORED_VOICES complete for ${messageId}`, {
            messageId,
            storedCount: stored.length,
            stored: stored,
            duration: storedDuration
          });
          
          sendResponse({
            success: true,
            voices: stored
          });
          break;
        }
        
        case 'PING': {
          console.log(`[ClipAIble Offscreen] PING request for ${messageId}`, {
            messageId
          });
          
          // Health check from service worker
          sendResponse({
            success: true,
            ready: true
          });
          
          console.log(`[ClipAIble Offscreen] PING response sent for ${messageId}`, {
            messageId
          });
          break;
        }
        
        default:
          console.error(`[ClipAIble Offscreen] Unknown message type for ${messageId}`, {
            messageId,
            type: message.type
          });
          
          sendResponse({
            success: false,
            error: `Unknown message type: ${message.type}`
          });
      }
      
      const totalProcessingDuration = Date.now() - processingStartTime;
      console.log(`[ClipAIble Offscreen] === MESSAGE PROCESSING COMPLETE ===`, {
        messageId,
        type: message.type,
        totalDuration: totalProcessingDuration,
        timestamp: Date.now()
      });
      
    } catch (error) {
      const errorTime = Date.now();
      const processingDuration = errorTime - processingStartTime;
      
      // Enhanced error logging for Piper TTS phoneme index errors
      const isPhonemeError = error.message && (
        error.message.includes('indices element out of data bounds') ||
        error.message.includes('Gather node') ||
        error.message.includes('phoneme') ||
        error.message.includes('idx=') ||
        error.message.includes('inclusive range')
      );
      
      // Check if it's an ONNX Runtime error that might be recoverable with Web Speech API
      const isOnnxError = error.message && (
        error.message.includes('No graph was found in the protobuf') ||
        error.message.includes('Can\'t create a session') ||
        error.message.includes('Aborted()') ||
        error.message.includes('ERROR_CODE: 2') ||
        error.message.includes('ASSERTIONS')
      );
      
      // Try Web Speech API fallback for ONNX Runtime errors
      // Perplexity recommendation: Use Web Speech API as fallback when Piper TTS fails
      if (isOnnxError && message.type === 'PIPER_TTS' && message.data && message.data.text) {
        console.warn(`[ClipAIble Offscreen] ONNX Runtime error detected, attempting Web Speech API fallback for ${messageId}`, {
          messageId,
          originalError: error.message,
          textLength: message.data.text.length
        });
        
        try {
          const webSpeechAudio = await synthesizeWithWebSpeechAPI(
            message.data.text,
            message.data.language || 'en',
            message.data.speed || 1.0,
            message.data.pitch || 1.0
          );
          
          if (webSpeechAudio) {
            console.log(`[ClipAIble Offscreen] Web Speech API fallback succeeded for ${messageId}`, {
              messageId,
              audioSize: webSpeechAudio.byteLength
            });
            
            // Convert to same format as Piper TTS (Uint8Array)
            const uint8Array = new Uint8Array(webSpeechAudio);
            
            // Use same storage logic as Piper TTS
            const manifest = chrome.runtime.getManifest();
            const hasUnlimitedStorage = manifest.permissions?.includes('unlimitedStorage') || false;
            const STORAGE_THRESHOLD = hasUnlimitedStorage 
              ? 50 * 1024 * 1024
              : 8 * 1024 * 1024;
            const MAX_AUDIO_SIZE = hasUnlimitedStorage 
              ? 100 * 1024 * 1024
              : 10 * 1024 * 1024;
            
            if (uint8Array.length > MAX_AUDIO_SIZE) {
              throw new Error(`Audio size ${uint8Array.length} exceeds maximum ${MAX_AUDIO_SIZE}`);
            }
            
            if (uint8Array.length < STORAGE_THRESHOLD) {
              sendResponse({
                success: true,
                method: 'inline',
                audioData: Array.from(uint8Array),
                messageId
              });
            } else {
              const storageKey = `tts_audio_${messageId}`;
              await chrome.storage.local.set({
                [storageKey]: Array.from(uint8Array),
                [`${storageKey}_meta`]: {
                  timestamp: Date.now(),
                  size: uint8Array.length
                }
              });
              
              sendResponse({
                success: true,
                method: 'storage',
                storageKey,
                messageId
              });
            }
            
            return; // Success with fallback
          }
        } catch (fallbackError) {
          console.error(`[ClipAIble Offscreen] Web Speech API fallback also failed for ${messageId}`, {
            messageId,
            fallbackError: fallbackError.message,
            originalError: error.message
          });
          // Continue to error response below
        }
      }
      
      console.error(`[ClipAIble Offscreen] === ERROR PROCESSING MESSAGE ===`, {
        messageId,
        type: message.type,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        duration: processingDuration,
        timestamp: errorTime,
        isPhonemeError,
        isOnnxError,
        ...(isPhonemeError && {
          suggestion: 'This error usually means the text contains characters that cannot be phonemized by the selected voice model. The text has been sanitized, but some characters may still be incompatible. Try using a different voice or further cleaning the text.'
        }),
        ...(isOnnxError && {
          suggestion: 'ONNX Runtime error - this may be due to memory limitations or WASM initialization issues. Web Speech API fallback was attempted but may have also failed.'
        })
      });
      
      sendResponse({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  })();
  
  console.log(`[ClipAIble Offscreen] Returning true to keep channel open for ${messageId}`, {
    messageId,
    type: message.type
  });
  return true; // Keep channel open for async response
});

/**
 * Find the data chunk in a WAV file
 * @param {Uint8Array} view - WAV file as Uint8Array
 * @returns {{dataStart: number, dataSize: number}} Position and size of data chunk
 */
function findWavDataChunk(view) {
  let offset = 12; // Skip RIFF header
  
  while (offset < view.length - 8) {
    const chunkId = String.fromCharCode(view[offset], view[offset + 1], view[offset + 2], view[offset + 3]);
    const chunkSize = view[offset + 4] | (view[offset + 5] << 8) | (view[offset + 6] << 16) | (view[offset + 7] << 24);
    
    if (chunkId === 'data') {
      return { dataStart: offset + 8, dataSize: chunkSize };
    }
    
    offset += 8 + chunkSize;
    // Ensure even offset
    if (chunkSize % 2 !== 0) offset++;
  }
  
  // If no data chunk found, assume everything after header is data
  return { dataStart: 44, dataSize: view.length - 44 };
}

/**
 * Concatenate multiple WAV buffers into one valid WAV file
 * Extracts PCM data from each WAV and creates a new WAV with correct header
 * @param {Array<ArrayBuffer>} buffers - Array of WAV buffers
 * @returns {ArrayBuffer} Combined WAV buffer with valid header
 */
function concatenateWavBuffers(buffers) {
  console.log(`[ClipAIble Offscreen] === WAV CONCATENATION START ===`, { 
    buffersCount: buffers.length 
  });
  
  if (!buffers || buffers.length === 0) {
    throw new Error('No buffers to concatenate');
  }
  
  if (buffers.length === 1) {
    console.log(`[ClipAIble Offscreen] Single buffer, returning as-is`);
    return buffers[0];
  }
  
  // Extract audio data from each buffer
  const dataChunks = [];
  let totalDataSize = 0;
  let sampleRate = 22050; // Default for Piper TTS
  let bitsPerSample = 16;
  let numChannels = 1;
  
  for (let i = 0; i < buffers.length; i++) {
    const view = new Uint8Array(buffers[i]);
    
    // Validate WAV format (starts with "RIFF")
    if (view.length < 44 || 
        view[0] !== 0x52 || view[1] !== 0x49 || view[2] !== 0x46 || view[3] !== 0x46) {
      console.warn(`[ClipAIble Offscreen] Buffer ${i} is not a valid WAV file, skipping`, {
        bufferIndex: i,
        bufferSize: view.length,
        firstBytes: Array.from(view.slice(0, 4))
      });
      continue;
    }
    
    const { dataStart, dataSize } = findWavDataChunk(view);
    
    // Extract format info from first valid buffer
    if (i === 0 && view.length >= 44) {
      numChannels = view[22] | (view[23] << 8);
      sampleRate = view[24] | (view[25] << 8) | (view[26] << 16) | (view[27] << 24);
      bitsPerSample = view[34] | (view[35] << 8);
      console.log(`[ClipAIble Offscreen] WAV format detected from first buffer`, { 
        numChannels, 
        sampleRate, 
        bitsPerSample,
        dataStart,
        dataSize
      });
    }
    
    const audioData = view.slice(dataStart, dataStart + dataSize);
    dataChunks.push(audioData);
    totalDataSize += audioData.length;
    
    console.log(`[ClipAIble Offscreen] Extracted audio data from buffer ${i + 1}/${buffers.length}`, {
      bufferIndex: i,
      dataStart,
      dataSize,
      audioDataLength: audioData.length,
      totalDataSizeSoFar: totalDataSize
    });
  }
  
  if (dataChunks.length === 0) {
    throw new Error('No valid WAV data chunks found');
  }
  
  // Create new WAV file with proper header
  const headerSize = 44;
  const totalSize = headerSize + totalDataSize;
  const result = new ArrayBuffer(totalSize);
  const view = new Uint8Array(result);
  const dataView = new DataView(result);
  
  // Write WAV header
  // "RIFF"
  view[0] = 0x52; view[1] = 0x49; view[2] = 0x46; view[3] = 0x46;
  // File size - 8
  dataView.setUint32(4, totalSize - 8, true);
  // "WAVE"
  view[8] = 0x57; view[9] = 0x41; view[10] = 0x56; view[11] = 0x45;
  // "fmt "
  view[12] = 0x66; view[13] = 0x6D; view[14] = 0x74; view[15] = 0x20;
  // fmt chunk size (16 for PCM)
  dataView.setUint32(16, 16, true);
  // Audio format (1 = PCM)
  dataView.setUint16(20, 1, true);
  // Number of channels
  dataView.setUint16(22, numChannels, true);
  // Sample rate
  dataView.setUint32(24, sampleRate, true);
  // Byte rate
  dataView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  // Block align
  dataView.setUint16(32, numChannels * (bitsPerSample / 8), true);
  // Bits per sample
  dataView.setUint16(34, bitsPerSample, true);
  // "data"
  view[36] = 0x64; view[37] = 0x61; view[38] = 0x74; view[39] = 0x61;
  // Data size
  dataView.setUint32(40, totalDataSize, true);
  
  // Copy all audio data
  let offset = headerSize;
  for (let i = 0; i < dataChunks.length; i++) {
    const chunk = dataChunks[i];
    view.set(chunk, offset);
    offset += chunk.length;
    
    if (i < 3 || i === dataChunks.length - 1) {
      console.log(`[ClipAIble Offscreen] Copied chunk ${i + 1}/${dataChunks.length}`, {
        chunkIndex: i,
        chunkSize: chunk.length,
        offsetBefore: offset - chunk.length,
        offsetAfter: offset
      });
    }
  }
  
  console.log(`[ClipAIble Offscreen] === WAV CONCATENATION COMPLETE ===`, { 
    chunksCount: dataChunks.length, 
    totalDataSize,
    totalSize,
    headerSize,
    sampleRate,
    numChannels,
    bitsPerSample,
    estimatedDurationSeconds: Math.round(totalDataSize / (sampleRate * numChannels * (bitsPerSample / 8)))
  });
  
  return result;
}

// Signal ready
const readyTime = Date.now();
console.log('[ClipAIble Offscreen] === READY AND LISTENING FOR MESSAGES ===', {
  timestamp: readyTime,
  timeSinceLoad: readyTime - listenerRegisteredTime
});
