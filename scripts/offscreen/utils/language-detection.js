// @ts-check
// Language detection utility for offline TTS

import { log } from '../../utils/logging.js';

/**
 * Detect language from text using character analysis
 * @param {string} text - Text to analyze
 * @returns {string} Language code (en, ru, uk, de, fr, es, it, pt, zh)
 */
export function detectLanguage(text) {
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
    // Ukrainian has specific letters: і, ї, є, ґ (both lowercase and uppercase)
    const ukMarkers = (sample.match(/[іїєґІЇЄҐ]/gi) || []).length;
    const ruMarkers = (sample.match(/[ыэъЫЭЪ]/gi) || []).length;
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
  log('[ClipAIble Offscreen] Language detection result', {
    detected: lang,
    maxMatches,
    minThreshold,
    matchCounts,
    sampleLength: sample.length,
    samplePreview: sample.substring(0, 100)
  });
  
  return lang;
}

