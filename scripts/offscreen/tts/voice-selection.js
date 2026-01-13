// @ts-check
// Voice selection logic for Piper TTS

import { log, logError, logWarn } from '../../utils/logging.js';
import { DEFAULT_VOICES, FALLBACK_VOICES } from '../utils/constants.js';

// Re-export for convenience
export { DEFAULT_VOICES, FALLBACK_VOICES };

/**
 * Normalize language code (ua -> uk for Ukrainian)
 * @param {string} language - Language code
 * @returns {string} Normalized language code
 */
export function normalizeLanguageCode(language) {
  if (!language || language === 'auto') {
    return language;
  }
  
  const langBase = language.split('-')[0].toLowerCase();
  if (langBase === 'ua') {
    return language.replace(/^ua/i, 'uk');
  }
  return language;
}

/**
 * Get base language code from full language string
 * @param {string} language - Full language string (e.g., 'en-US')
 * @returns {string} Base language code (e.g., 'en')
 */
export function getBaseLangCode(language) {
  let langCode = language.split('-')[0].toLowerCase();
  if (langCode === 'ua') {
    langCode = 'uk';
  }
  return langCode;
}

/**
 * Check if voice ID has valid format (contains _ and -)
 * @param {string} voiceId - Voice ID to check
 * @returns {boolean} True if valid format
 */
export function isValidVoiceFormat(voiceId) {
  return voiceId && voiceId.includes('_') && voiceId.includes('-');
}

/**
 * Select voice for TTS
 * @param {Object} params - Selection parameters
 * @param {string|null} params.requestedVoice - User-requested voice
 * @param {string} params.langCode - Language code
 * @param {string} params.messageId - Message ID for logging
 * @param {function(): Promise<any[]>} params.getVoicesWithWorker - Function to get voices
 * @param {function(): Promise<void>} params.initTTSWorker - Function to init TTS worker
 * @param {Object} params.state - State object
 * @returns {Promise<{voiceId: string, isFallback: boolean}>} Selected voice
 */
export async function selectVoice({ requestedVoice, langCode, messageId, getVoicesWithWorker, initTTSWorker, state }) {
  let voiceId = null;
  let isFallback = false;
  
  const defaultVoiceForLang = DEFAULT_VOICES[langCode];
  const defaultVoiceEn = DEFAULT_VOICES['en'];
  
  log(`[ClipAIble TTS] Voice selection start`, {
    messageId,
    requestedVoice,
    langCode,
    defaultVoiceForLang,
    defaultVoiceEn
  });
  
  // Check if voice is already a valid voice ID format
  if (requestedVoice && requestedVoice !== '0' && requestedVoice !== '') {
    if (isValidVoiceFormat(requestedVoice)) {
      voiceId = requestedVoice;
      log(`[ClipAIble TTS] Using requested voice directly`, { messageId, voiceId });
    } else {
      // Try to find voice by name using mapping
      voiceId = await findVoiceByNameOrIndex({
        requestedVoice,
        langCode,
        messageId,
        getVoicesWithWorker,
        initTTSWorker,
        state
      });
      
      if (!voiceId) {
        // Fallback to default
        voiceId = defaultVoiceForLang || defaultVoiceEn || 'en_US-lessac-medium';
        isFallback = true;
        log(`[ClipAIble TTS] Voice not found, using default`, { messageId, voiceId });
      }
    }
  } else {
    // No voice specified, use default
    voiceId = defaultVoiceForLang || defaultVoiceEn || 'en_US-lessac-medium';
    log(`[ClipAIble TTS] No voice specified, using default`, { messageId, voiceId });
  }
  
  // Final validation
  if (!voiceId || voiceId === 'undefined' || voiceId.trim() === '') {
    voiceId = DEFAULT_VOICES['en'] || 'en_US-lessac-medium';
    isFallback = true;
    logWarn(`[ClipAIble TTS] Invalid voiceId, forced to English`, { messageId, voiceId });
  }
  
  log(`[ClipAIble TTS] Voice selection complete`, { messageId, voiceId, isFallback });
  
  return { voiceId, isFallback };
}

/**
 * Find voice by name or numeric index
 * @param {Object} params - Parameters
 * @param {string} params.requestedVoice - Requested voice
 * @param {string} params.langCode - Language code
 * @param {string} params.messageId - Message ID
 * @param {function(): Promise<any[]>} params.getVoicesWithWorker - Get voices function
 * @param {function(): Promise<void>} params.initTTSWorker - Init worker function
 * @param {Object} params.state - State object
 * @returns {Promise<string|null>} Voice ID or null if not found
 */
async function findVoiceByNameOrIndex({ requestedVoice, langCode, messageId, getVoicesWithWorker, initTTSWorker, state }) {
  // First try voice mapping
  try {
    const { findVoiceIdByName, PIPER_VOICES_MAPPING } = await import(chrome.runtime.getURL('scripts/api/piper-voices-mapping.js'));
    
    const mappedVoiceId = findVoiceIdByName(requestedVoice, langCode);
    if (mappedVoiceId) {
      log(`[ClipAIble TTS] Found voice via mapping`, { messageId, requestedVoice, mappedVoiceId });
      return mappedVoiceId;
    }
  } catch (err) {
    logWarn(`[ClipAIble TTS] Voice mapping lookup failed`, { messageId, error: err.message });
  }
  
  // Try to find in available voices
  if (!state.getTTSWorker()) {
    await initTTSWorker();
  }
  if (!state.getTTSWorker()) {
    return null;
  }
  
  const availableVoices = await getVoicesWithWorker();
  if (!availableVoices || !Array.isArray(availableVoices)) {
    return null;
  }
  
  // Check if numeric index
  if (/^\d+$/.test(String(requestedVoice))) {
    return findVoiceByIndex(requestedVoice, availableVoices, messageId);
  }
  
  // Search by name
  return findVoiceByName(requestedVoice, availableVoices, messageId);
}

/**
 * Find voice by numeric index in filtered/sorted list
 * @param {string} indexStr - Index string
 * @param {any[]} voices - Available voices
 * @param {string} messageId - Message ID
 * @returns {string|null} Voice ID or null
 */
function findVoiceByIndex(indexStr, voices, messageId) {
  const voiceIndex = parseInt(indexStr, 10);
  const supportedLanguages = ['en', 'ru', 'uk', 'de', 'fr', 'es', 'it', 'pt', 'zh'];
  
  // Filter and sort (same as GET_VOICES)
  const filtered = voices.filter(voice => {
    const quality = voice.quality || 'medium';
    if (quality === 'low' || quality === 'x_low') return false;
    
    let langCode = '';
    if (voice.language?.code) {
      langCode = voice.language.code.toLowerCase().split('_')[0];
    } else {
      const match = voice.key.match(/^([a-z]{2})_/i);
      langCode = match ? match[1].toLowerCase() : '';
    }
    return supportedLanguages.includes(langCode);
  });
  
  // Sort
  const languageOrder = { en: 0, ru: 1, uk: 2, de: 3, fr: 4, es: 5, it: 6, pt: 7, zh: 8 };
  const qualityOrder = { high: 0, medium: 1 };
  
  filtered.sort((a, b) => {
    const aLang = a.language?.code?.split('_')[0]?.toLowerCase() || 'zz';
    const bLang = b.language?.code?.split('_')[0]?.toLowerCase() || 'zz';
    const langDiff = (languageOrder[aLang] ?? 99) - (languageOrder[bLang] ?? 99);
    if (langDiff !== 0) return langDiff;
    
    const qualDiff = (qualityOrder[a.quality] ?? 99) - (qualityOrder[b.quality] ?? 99);
    if (qualDiff !== 0) return qualDiff;
    
    return (a.name || a.key).localeCompare(b.name || b.key);
  });
  
  if (voiceIndex >= 0 && voiceIndex < filtered.length) {
    const voice = filtered[voiceIndex];
    log(`[ClipAIble TTS] Found voice by index`, { messageId, voiceIndex, voiceId: voice.key });
    return voice.key;
  }
  
  logWarn(`[ClipAIble TTS] Voice index out of range`, { messageId, voiceIndex, count: filtered.length });
  return null;
}

/**
 * Find voice by name match
 * @param {string} name - Voice name to find
 * @param {any[]} voices - Available voices
 * @param {string} messageId - Message ID
 * @returns {string|null} Voice ID or null
 */
function findVoiceByName(name, voices, messageId) {
  const normalized = name.toLowerCase();
  
  for (const voice of voices) {
    const key = (voice.key || '').toLowerCase();
    const voiceName = (voice.name || '').toLowerCase();
    const aliases = voice.aliases || [];
    
    if (key === normalized || voiceName === normalized ||
        key.includes(normalized) || voiceName.includes(normalized) ||
        aliases.some(a => a.toLowerCase() === normalized)) {
      log(`[ClipAIble TTS] Found voice by name`, { messageId, name, voiceId: voice.key });
      return voice.key;
    }
  }
  
  return null;
}
