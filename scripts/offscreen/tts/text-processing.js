// @ts-check
// Text processing for Piper TTS

import { log, logWarn } from '../../utils/logging.js';
import { normalizeSpeechText } from '../../utils/audio-text.js';

const MAX_SENTENCE_LENGTH = 200;
const RUSSIAN_DECIMAL = /(?<![\p{L}\p{N}.,(\[])(?<![(\[][+−-])(\d+),(\d+)(?:[ \t]*(%|°[CС]))?(?![\p{L}\p{N}]|[.,]\d)/gu;

/** Preserve leading zeroes and units Piper can mispronounce in Russian decimals. */
function normalizeRussianDecimals(text) {
  return text.replace(RUSSIAN_DECIMAL, (original, whole, fraction, unit) => {
    if (!unit && !fraction.startsWith('0')) return original;
    const spoken = `${whole} запятая ${[...fraction].join(' ')}`;
    if (unit === '%') return spoken + ' процента';
    if (unit) return spoken + ' градуса Цельсия';
    return spoken;
  });
}

/**
 * Sanitize text for Piper TTS
 * @param {string} text - Text to sanitize
 * @param {string} langCode - Language code
 * @param {string} messageId - Message ID for logging
 * @returns {string} Sanitized text
 */
export function sanitizeText(text, langCode, messageId) {
  const beforeStats = {
    length: text.length,
    nonAsciiCount: (text.match(/[^\x00-\x7F]/g) || []).length,
    controlCharsCount: (text.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g) || []).length
  };
  
  log(`[ClipAIble TTS] Text sanitization start`, { messageId, ...beforeStats });
  
  const normalized = normalizeSpeechText(text);
  const sanitized = langCode === 'ru' ? normalizeRussianDecimals(normalized) : normalized;

  const afterStats = {
    length: sanitized.length,
    lengthChange: sanitized.length - text.length
  };
  
  log(`[ClipAIble TTS] Text sanitization complete`, { messageId, ...afterStats });
  
  return sanitized;
}

/**
 * Split text into sentences/phrases for streaming
 * @param {string} text - Text to split
 * @returns {string[]} Array of sentences/phrases
 */
export function splitIntoSentences(text) {
  // Keep decimal points and short abbreviations inside a narration chunk.
  const sentences = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?…]+(?=\s|$)/g)) {
    const end = match.index + match[0].length;
    const fragment = text.slice(start, end);
    if (match[0] === '.' && /(?:^|\s)(?:\p{L}{1,4}|(?:\p{L}\.)+\p{L})\.$/u.test(fragment)) continue;
    if (fragment.trim()) sentences.push(fragment.trim());
    start = end;
  }
  if (text.slice(start).trim()) sentences.push(text.slice(start).trim());
  
  // Split long sentences
  const result = [];
  for (const sentence of sentences) {
    result.push(...splitLongSentence(sentence));
  }
  
  return result;
}

/**
 * Split a long sentence into smaller phrases
 * @param {string} sentence - Sentence to split
 * @returns {string[]} Array of phrases
 */
function splitLongSentence(sentence) {
  if (sentence.length <= MAX_SENTENCE_LENGTH) {
    return [sentence];
  }
  
  // Split by commas, semicolons
  const phrases = sentence.split(/([,;:]\s+)/);
  const result = [];
  let current = '';
  
  for (const phrase of phrases) {
    if ((current + phrase).length <= MAX_SENTENCE_LENGTH) {
      current += phrase;
    } else {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = phrase;
    }
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  // If still too long, split by words
  const final = [];
  for (const phrase of result) {
    if (phrase.length <= MAX_SENTENCE_LENGTH) {
      final.push(phrase);
    } else {
      final.push(...splitByWords(phrase));
    }
  }
  
  return final.length > 0 ? final : [sentence];
}

/**
 * Split text by words
 * @param {string} text - Text to split
 * @returns {string[]} Array of chunks
 */
function splitByWords(text) {
  const words = text.split(/\s+/);
  const result = [];
  let current = '';
  
  for (const word of words) {
    if (word.length > MAX_SENTENCE_LENGTH) {
      if (current) {
        result.push(current);
        current = '';
      }
      let offset = 0;
      while (offset < word.length) {
        let end = Math.min(offset + MAX_SENTENCE_LENGTH, word.length);
        if (end < word.length && /[\uD800-\uDBFF]/.test(word[end - 1]) && /[\uDC00-\uDFFF]/.test(word[end])) {
          end--;
        }
        result.push(word.slice(offset, end));
        offset = end;
      }
      continue;
    }
    if ((current + ' ' + word).length <= MAX_SENTENCE_LENGTH) {
      current = current ? current + ' ' + word : word;
    } else {
      if (current) {
        result.push(current);
      }
      current = word;
    }
  }
  
  if (current) {
    result.push(current);
  }
  
  return result;
}

/**
 * Check memory usage
 * @returns {boolean} True if memory is OK
 */
export function checkMemory() {
  /** @type {Performance & {memory?: {usedJSHeapSize: number, jsHeapSizeLimit: number}}} */
  const memoryPerformance = performance;
  if (memoryPerformance.memory) {
    const used = memoryPerformance.memory.usedJSHeapSize / 1024 / 1024;
    const limit = memoryPerformance.memory.jsHeapSizeLimit / 1024 / 1024;
    const usage = used / limit;
    
    if (usage > 0.9) {
      logWarn(`[ClipAIble TTS] Memory usage critical`, { usagePercent: (usage * 100).toFixed(1) });
      return false;
    }
  }
  return true;
}
