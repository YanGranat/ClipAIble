// Message handlers for offscreen document
// Provides handler functions for different message types to reduce code duplication

// @ts-check

import { log, logError } from '../utils/logging.js';
import { extractPdfContent } from './pdf/extract.js';

/**
 * Handle GET_VOICES message
 * @param {string} messageId - Message ID for logging
 * @param {Function} initTTSWorker - Function to initialize TTS worker
 * @param {Function} getVoicesWithWorker - Function to get voices from worker
 * @param {Object} ttsWorker - TTS worker instance (reference)
 * @param {Function} sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function handleGetVoices(messageId, initTTSWorker, getVoicesWithWorker, ttsWorker, sendResponse) {
  const voicesStart = Date.now();
  log(`[ClipAIble Offscreen] GET_VOICES request for ${messageId}`, {
    messageId
  });
  
  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
  if (!ttsWorker) {
    await initTTSWorker();
  }
  if (!ttsWorker) {
    throw new Error('TTS Worker is not available. Cannot get available voices without Worker.');
  }
  const voices = await getVoicesWithWorker();
  
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
  log(`[ClipAIble Offscreen] GET_VOICES complete for ${messageId}`, {
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
  log(`[ClipAIble Offscreen] GET_VOICES: Sending response for ${messageId}`, {
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
}

/**
 * Handle GET_STORED_VOICES message
 * @param {string} messageId - Message ID for logging
 * @param {Function} initTTSWorker - Function to initialize TTS worker
 * @param {Function} getStoredWithWorker - Function to get stored voices from worker
 * @param {Object} ttsWorker - TTS worker instance (reference)
 * @param {Function} sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function handleGetStoredVoices(messageId, initTTSWorker, getStoredWithWorker, ttsWorker, sendResponse) {
  const storedStart = Date.now();
  log(`[ClipAIble Offscreen] GET_STORED_VOICES request for ${messageId}`, {
    messageId
  });
  
  // CRITICAL: All TTS operations must go through Worker - no fallback to direct calls
  if (!ttsWorker) {
    await initTTSWorker();
  }
  if (!ttsWorker) {
    throw new Error('TTS Worker is not available. Cannot get stored voices without Worker.');
  }
  const stored = await getStoredWithWorker();
  const storedDuration = Date.now() - storedStart;
  
  log(`[ClipAIble Offscreen] GET_STORED_VOICES complete for ${messageId}`, {
    messageId,
    storedCount: stored.length,
    stored: stored,
    duration: storedDuration
  });
  
  sendResponse({
    success: true,
    voices: stored
  });
}

/**
 * Handle PING message
 * @param {string} messageId - Message ID for logging
 * @param {Function} sendResponse - Response function
 * @returns {void}
 */
export function handlePing(messageId, sendResponse) {
  log(`[ClipAIble Offscreen] PING request for ${messageId}`, {
    messageId
  });
  
  // Health check from service worker
  sendResponse({
    success: true,
    ready: true
  });
  
  log(`[ClipAIble Offscreen] PING response sent for ${messageId}`, {
    messageId
  });
}

/**
 * Handle EXTRACT_PDF message
 * @param {string} messageId - Message ID for logging
 * @param {Object} data - Request data with pdfUrl
 * @param {Function} sendResponse - Response function
 * @returns {Promise<void>}
 */
export async function handleExtractPdf(messageId, data, sendResponse) {
  const extractStart = Date.now();
  log(`[ClipAIble Offscreen] EXTRACT_PDF request for ${messageId}`, {
    messageId,
    pdfUrl: data.pdfUrl
  });
  
  try {
    const result = await extractPdfContent(data.pdfUrl);
    const extractDuration = Date.now() - extractStart;
    
    log(`[ClipAIble Offscreen] EXTRACT_PDF complete for ${messageId}`, {
      messageId,
      title: result.title,
      contentItems: result.content?.length || 0,
      duration: extractDuration
    });
    
    sendResponse({
      success: true,
      result: result
    });
  } catch (error) {
    logError(`[ClipAIble Offscreen] EXTRACT_PDF failed for ${messageId}`, {
      messageId,
      error: error.message,
      stack: error.stack
    });
    
    sendResponse({
      success: false,
      error: error.message
    });
  }
}


