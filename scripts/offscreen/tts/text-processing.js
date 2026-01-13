// @ts-check
// Text processing for Piper TTS

import { log, logWarn } from '../../utils/logging.js';

const MAX_SENTENCE_LENGTH = 200;

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
  
  let sanitized = text
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Replace non-breaking spaces
    .replace(/\u00A0/g, ' ')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Normalize dashes
    .replace(/—/g, ' - ')
    .replace(/–/g, '-')
    // Remove control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove special symbols
    .replace(/[←→↑↓↔↕⇐⇒⇑⇓⇔⇕]/g, '')
    .replace(/[•◦▪▫]/g, ' ')
    .replace(/[©®™]/g, '')
    .replace(/[€£¥]/g, '')
    .replace(/[°±×÷]/g, '')
    .replace(/[…]/g, '...')
    // Normalize whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // Language-specific sanitization
  if (langCode === 'en') {
    sanitized = sanitizeEnglish(sanitized);
  } else {
    sanitized = sanitizeNonEnglish(sanitized, langCode);
  }
  
  const afterStats = {
    length: sanitized.length,
    lengthChange: sanitized.length - text.length
  };
  
  log(`[ClipAIble TTS] Text sanitization complete`, { messageId, ...afterStats });
  
  return sanitized;
}

/**
 * Sanitize English text (strict ASCII)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeEnglish(text) {
  return text
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      // Allow printable ASCII, newline, tab
      if ((code >= 32 && code <= 126) || code === 10 || code === 9) {
        return char;
      }
      return ' ';
    })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitize non-English text (preserve Unicode letters)
 * @param {string} text - Text to sanitize
 * @param {string} langCode - Language code
 * @returns {string} Sanitized text
 */
function sanitizeNonEnglish(text, langCode) {
  return text
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\t]/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split text into sentences/phrases for streaming
 * @param {string} text - Text to split
 * @returns {string[]} Array of sentences/phrases
 */
export function splitIntoSentences(text) {
  // Split by sentence endings
  let sentences = text.match(/[^.!?…]+[.!?…]+/g) || [text];
  sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);
  
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
  // @ts-ignore - performance.memory is non-standard
  if (performance.memory) {
    // @ts-ignore
    const used = performance.memory.usedJSHeapSize / 1024 / 1024;
    // @ts-ignore
    const limit = performance.memory.jsHeapSizeLimit / 1024 / 1024;
    const usage = used / limit;
    
    if (usage > 0.9) {
      logWarn(`[ClipAIble TTS] Memory usage critical`, { usagePercent: (usage * 100).toFixed(1) });
      return false;
    }
  }
  return true;
}
