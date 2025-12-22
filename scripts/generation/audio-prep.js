// Audio preparation module for ClipAIble extension
// Handles text chunking and cleanup for TTS conversion

import { log, logError, logWarn } from '../utils/logging.js';
import { callAI } from '../api/index.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES, getProcessingState } from '../state/processing.js';

// Configuration for audio preparation
export const AUDIO_CONFIG = {
  // Target chunk size in characters (4-6k for efficiency, will be within TTS limit after cleanup)
  MIN_CHUNK_SIZE: 4000,
  MAX_CHUNK_SIZE: 6000,
  IDEAL_CHUNK_SIZE: 5000,
  
  // TTS API limits (4096 chars, but text shrinks after AI cleanup)
  TTS_MAX_INPUT: 4096,
  
  // Voice options for gpt-4o-mini-tts
  VOICES: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'],
  DEFAULT_VOICE: 'nova',
  
  // Speed range
  MIN_SPEED: 0.25,
  MAX_SPEED: 4.0,
  DEFAULT_SPEED: 1.0
};

/**
 * Convert content items to plain text
 * @param {Array} content - Array of content items from extraction
 * @returns {string} Plain text representation
 */
export function contentToPlainText(content) {
  log('=== contentToPlainText START ===', { 
    itemCount: content?.length,
    itemTypes: content?.map(i => i.type) || []
  });
  
  if (!content || !Array.isArray(content)) return '';
  
  const textParts = [];
  let skippedItems = [];
  let processedItems = [];
  let itemIndex = 0;
  
  for (const item of content) {
    itemIndex++;
    const itemLog = {
      index: itemIndex,
      type: item.type,
      originalLength: item.text?.length || item.html?.length || 0
    };
    
    switch (item.type) {
      case 'heading':
        // Add heading with newlines for natural pauses
        const headingText = stripHtml(item.text || '');
        if (headingText) {
          textParts.push(`\n\n${headingText}\n`);
          itemLog.extractedLength = headingText.length;
          itemLog.added = true;
        } else {
          itemLog.added = false;
          itemLog.reason = 'Empty after stripHtml';
        }
        processedItems.push(itemLog);
        break;
        
      case 'paragraph':
        const paraText = stripHtml(item.text || '');
        if (paraText) {
          textParts.push(paraText);
          itemLog.extractedLength = paraText.length;
          itemLog.added = true;
        } else {
          itemLog.added = false;
          itemLog.reason = 'Empty after stripHtml';
        }
        processedItems.push(itemLog);
        break;
        
      case 'quote':
        const quoteText = stripHtml(item.text || '');
        if (quoteText) {
          textParts.push(`Quote: ${quoteText}`);
          itemLog.extractedLength = quoteText.length;
          itemLog.added = true;
        } else {
          itemLog.added = false;
          itemLog.reason = 'Empty after stripHtml';
        }
        processedItems.push(itemLog);
        break;
        
      case 'list':
        if (item.items && Array.isArray(item.items)) {
          const listItems = item.items.map((li, index) => {
            const text = typeof li === 'string' ? li : stripHtml(li.html || '');
            return item.ordered ? `${index + 1}. ${text}` : `• ${text}`;
          }).filter(t => t);
          if (listItems.length > 0) {
            const listText = listItems.join('\n');
            textParts.push(listText);
            itemLog.extractedLength = listText.length;
            itemLog.itemsCount = listItems.length;
            itemLog.added = true;
          } else {
            itemLog.added = false;
            itemLog.reason = 'No valid list items';
          }
        } else {
          itemLog.added = false;
          itemLog.reason = 'No items array';
        }
        processedItems.push(itemLog);
        break;
        
      case 'code':
        // Skip code blocks - not suitable for audio
        skippedItems.push({ type: 'code', length: item.text?.length || 0 });
        itemLog.skipped = true;
        itemLog.reason = 'Code blocks not suitable for audio';
        processedItems.push(itemLog);
        break;
        
      case 'image':
        // Include image caption if present
        if (item.caption) {
          const captionText = stripHtml(item.caption);
          if (captionText) {
            textParts.push(`Image: ${captionText}`);
            itemLog.extractedLength = captionText.length;
            itemLog.added = true;
            itemLog.hasCaption = true;
          } else {
            itemLog.added = false;
            itemLog.reason = 'Empty caption after stripHtml';
          }
        } else {
          itemLog.added = false;
          itemLog.reason = 'No caption';
        }
        processedItems.push(itemLog);
        break;
        
      case 'table':
        // Skip tables - too complex for audio
        skippedItems.push({ type: 'table', rows: item.rows?.length || 0 });
        itemLog.skipped = true;
        itemLog.reason = 'Tables too complex for audio';
        itemLog.rows = item.rows?.length || 0;
        processedItems.push(itemLog);
        break;
        
      case 'separator':
        textParts.push('\n');
        itemLog.added = true;
        itemLog.extractedLength = 1;
        processedItems.push(itemLog);
        break;
        
      case 'infobox_start':
        if (item.title) {
          textParts.push(`\n${item.title}:`);
          itemLog.extractedLength = item.title.length;
          itemLog.added = true;
        } else {
          itemLog.added = false;
          itemLog.reason = 'No title';
        }
        processedItems.push(itemLog);
        break;
        
      case 'infobox_end':
        textParts.push('\n');
        itemLog.added = true;
        itemLog.extractedLength = 1;
        processedItems.push(itemLog);
        break;
        
      default:
        itemLog.added = false;
        itemLog.reason = `Unknown type: ${item.type}`;
        processedItems.push(itemLog);
        logWarn('Unknown content item type in contentToPlainText', itemLog);
    }
  }
  
  // Log detailed extraction summary
  const addedCount = processedItems.filter(i => i.added).length;
  const skippedCount = processedItems.filter(i => i.skipped).length;
  const emptyCount = processedItems.filter(i => !i.added && !i.skipped).length;
  
  log('=== contentToPlainText EXTRACTION DETAILS ===', {
    totalItems: content.length,
    addedItems: addedCount,
    skippedItems: skippedCount,
    emptyItems: emptyCount,
    itemsByType: processedItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    processedItemsPreview: processedItems.slice(0, 10).map(i => ({
      index: i.index,
      type: i.type,
      added: i.added,
      skipped: i.skipped,
      length: i.extractedLength || i.originalLength
    }))
  });
  
  const result = textParts.join('\n\n').trim();
  
  log('=== contentToPlainText COMPLETE ===', {
    inputItems: content.length,
    outputParts: textParts.length,
    outputLength: result.length,
    skippedItems: skippedItems.length > 0 ? skippedItems : 'none',
    preview: result.substring(0, 200) + '...',
    endPreview: '...' + result.substring(Math.max(0, result.length - 100)),
    nonAsciiCount: (result.match(/[^\x00-\x7F]/g) || []).length,
    hasNewlines: result.includes('\n'),
    newlineCount: (result.match(/\n/g) || []).length
  });
  
  return result;
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  
  return html
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart text chunking for TTS
 * Splits text into chunks of 2-4k characters at natural boundaries
 * @param {string} text - Full text to split
 * @returns {Array<{text: string, index: number}>} Array of text chunks with indices
 */
export function splitTextIntoChunks(text) {
  if (!text) return [];
  
  const chunks = [];
  let currentChunk = '';
  let chunkIndex = 0;
  
  // Split by paragraphs first (double newline)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  
  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;
    
    // If adding this paragraph would exceed max, finalize current chunk
    if (currentChunk && (currentChunk.length + trimmedPara.length + 2) > AUDIO_CONFIG.MAX_CHUNK_SIZE) {
      // Check if current chunk is large enough
      if (currentChunk.length >= AUDIO_CONFIG.MIN_CHUNK_SIZE) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
        currentChunk = trimmedPara;
      } else {
        // Try to split the paragraph by sentences
        const sentences = splitIntoSentences(trimmedPara);
        for (const sentence of sentences) {
          if ((currentChunk.length + sentence.length + 1) > AUDIO_CONFIG.MAX_CHUNK_SIZE) {
            if (currentChunk.length >= AUDIO_CONFIG.MIN_CHUNK_SIZE) {
              chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
              currentChunk = sentence;
            } else {
              // Force split within sentence if needed
              currentChunk += ' ' + sentence;
              if (currentChunk.length > AUDIO_CONFIG.MAX_CHUNK_SIZE) {
                const forceSplit = forceSplitText(currentChunk, AUDIO_CONFIG.IDEAL_CHUNK_SIZE);
                for (let i = 0; i < forceSplit.length - 1; i++) {
                  chunks.push({ text: forceSplit[i].trim(), index: chunkIndex++ });
                }
                currentChunk = forceSplit[forceSplit.length - 1];
              }
            }
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
    }
  }
  
  // Add remaining content
  if (currentChunk.trim()) {
    // If last chunk is too small, try to merge with previous
    if (currentChunk.length < AUDIO_CONFIG.MIN_CHUNK_SIZE / 2 && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.text.length + currentChunk.length <= AUDIO_CONFIG.MAX_CHUNK_SIZE) {
        lastChunk.text += '\n\n' + currentChunk.trim();
      } else {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex });
      }
    } else {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex });
    }
  }
  
  log('Text split into chunks', { 
    totalChunks: chunks.length, 
    chunkSizes: chunks.map(c => c.text.length)
  });
  
  return chunks;
}

/**
 * Split text into sentences
 * @param {string} text - Text to split
 * @returns {Array<string>} Array of sentences
 */
function splitIntoSentences(text) {
  if (!text) return [];
  
  // Split by sentence-ending punctuation followed by space and capital letter
  // Also handle common abbreviations
  const sentences = [];
  let current = '';
  
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    current += (current ? ' ' : '') + word;
    
    // Check if this looks like end of sentence
    if (/[.!?]$/.test(word)) {
      // Check if next word starts with capital (if exists)
      const nextWord = words[i + 1];
      if (!nextWord || /^[A-ZА-ЯЁЇІЄҐ]/.test(nextWord)) {
        // Check it's not an abbreviation
        if (!isAbbreviation(word)) {
          sentences.push(current);
          current = '';
        }
      }
    }
  }
  
  if (current) {
    sentences.push(current);
  }
  
  return sentences.filter(s => s.trim());
}

/**
 * Check if word is a common abbreviation
 * @param {string} word - Word to check
 * @returns {boolean} True if abbreviation
 */
function isAbbreviation(word) {
  const abbreviations = [
    'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.',
    'inc.', 'ltd.', 'corp.', 'co.', 'etc.', 'e.g.', 'i.e.',
    'vs.', 'fig.', 'al.', 'no.', 'vol.', 'pp.', 'p.',
    'т.е.', 'т.д.', 'т.п.', 'др.', 'пр.', 'см.', 'ср.'
  ];
  return abbreviations.includes(word.toLowerCase());
}

/**
 * Force split text at word boundaries
 * @param {string} text - Text to split
 * @param {number} targetSize - Target chunk size
 * @returns {Array<string>} Array of text parts
 */
function forceSplitText(text, targetSize) {
  const parts = [];
  const words = text.split(/\s+/);
  let current = '';
  
  for (const word of words) {
    if (current && (current.length + word.length + 1) > targetSize) {
      parts.push(current);
      current = word;
    } else {
      current += (current ? ' ' : '') + word;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

// Language names for prompts
const LANGUAGE_NAMES_FOR_PROMPT = {
  'en': 'English',
  'ru': 'Russian',
  'ua': 'Ukrainian',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean',
  'auto': null
};

/**
 * Prepare single chunk for audio using AI
 * Cleans up text to be suitable for TTS (removes URLs, code references, etc.)
 * @param {string} chunkText - Raw chunk text
 * @param {number} chunkIndex - Index of this chunk
 * @param {number} totalChunks - Total number of chunks
 * @param {string} apiKey - API key
 * @param {string} model - Model to use
 * @param {string} language - Target language code (e.g., 'ru', 'en', 'auto')
 * @returns {Promise<string>} Cleaned text ready for TTS
 */
export async function prepareChunkForAudio(chunkText, chunkIndex, totalChunks, apiKey, model, language = 'auto') {
  // Log all chunk preparation settings
  const chunkSettings = {
    timestamp: Date.now(),
    chunkIndex, 
    totalChunks, 
    textLength: chunkText.length,
    language,
    model,
    hasApiKey: !!apiKey,
    textPreview: chunkText.substring(0, 150) + '...',
    textEnd: '...' + chunkText.substring(chunkText.length - 100),
    // Language detection
    langName: LANGUAGE_NAMES_FOR_PROMPT[language] || null,
    languageInstruction: LANGUAGE_NAMES_FOR_PROMPT[language] 
      ? `The text is in ${LANGUAGE_NAMES_FOR_PROMPT[language]}. Keep all text in ${LANGUAGE_NAMES_FOR_PROMPT[language]}.`
      : 'Keep the original language of the text.'
  };
  
  log('=== prepareChunkForAudio START with all settings ===', chunkSettings);
  
  const langName = LANGUAGE_NAMES_FOR_PROMPT[language] || null;
  const languageInstruction = langName 
    ? `The text is in ${langName}. Keep all text in ${langName}.` 
    : 'Keep the original language of the text.';
  
  const systemPrompt = `You are a text preparation assistant for text-to-speech conversion.

Your task is to clean up the provided text so it can be read aloud naturally.
${languageInstruction}

RULES:
1. REMOVE completely:
   - URLs and web addresses (replace with descriptive text if context needed)
   - Email addresses
   - Code snippets and technical syntax
   - Footnote markers like [1], [2], etc.
   - Reference markers like ^1, ^2
   - File paths
   - Version numbers in technical context
   - Markdown formatting symbols (*, _, #, etc.)

2. CONVERT to readable form:
   - Abbreviations → full words (e.g., "etc." → "and so on", "e.g." → "for example")
   - Numbers → written out for small numbers or keep as digits for large ones
   - Dates → natural spoken form
   - Technical terms → keep but ensure pronounceable

3. PRESERVE:
   - All meaningful content and ideas
   - Natural paragraph structure
   - Quotes and attributions
   - Names of people, places, companies

4. IMPROVE for listening:
   - Add transition phrases if needed for flow
   - Ensure sentences are complete and make sense when read aloud
   - ${languageInstruction}

OUTPUT: Return ONLY the cleaned text. No explanations, no prefixes, no quotes around the text.`;

  const userPrompt = `Clean this text chunk (${chunkIndex + 1} of ${totalChunks}) for audio narration:

${chunkText}`;

  try {
    // Log before AI call
    const beforeAICall = Date.now();
    log('=== prepareChunkForAudio: Calling AI for cleanup ===', {
      chunkIndex,
      originalLength: chunkText.length,
      language,
      model,
      originalPreview: chunkText.substring(0, 200),
      originalEnd: '...' + chunkText.substring(Math.max(0, chunkText.length - 100)),
      nonAsciiCount: (chunkText.match(/[^\x00-\x7F]/g) || []).length,
      urlCount: (chunkText.match(/https?:\/\/\S+/g) || []).length,
      markdownCount: (chunkText.match(/[*_`#\[\]]/g) || []).length
    });
    
    const cleanedResponse = await callAI(systemPrompt, userPrompt, apiKey, model, false);
    const aiCallDuration = Date.now() - beforeAICall;
    
    // Extract string from response (callAI returns string when jsonResponse=false)
    const cleaned = typeof cleanedResponse === 'string' ? cleanedResponse : String(cleanedResponse);
    
    log('=== prepareChunkForAudio: AI cleanup complete ===', {
      chunkIndex,
      aiCallDuration,
      aiCleanedLength: cleaned.length,
      aiLengthChange: cleaned.length - chunkText.length,
      aiCleanedPreview: cleaned.substring(0, 200),
      aiCleanedEnd: '...' + cleaned.substring(Math.max(0, cleaned.length - 100))
    });
    
    // Additional cleanup
    const beforePostCleanup = cleaned;
    let result = cleaned
      .trim()
      // Remove any remaining markdown
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // Remove leftover URLs
      .replace(/https?:\/\/\S+/g, '')
      .replace(/www\.\S+/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    const postCleanupChange = result.length - beforePostCleanup.length;
    const lengthChange = result.length - chunkText.length;
    const changePercent = Math.round((lengthChange / chunkText.length) * 100);
    
    log('=== prepareChunkForAudio COMPLETE ===', { 
      chunkIndex, 
      originalLength: chunkText.length,
      aiCleanedLength: cleaned.length,
      finalLength: result.length,
      aiLengthChange: cleaned.length - chunkText.length,
      postCleanupChange,
      totalLengthChange: `${lengthChange > 0 ? '+' : ''}${lengthChange} (${changePercent}%)`,
      cleanedPreview: result.substring(0, 150) + '...',
      cleanedEnd: '...' + result.substring(result.length - 100),
      nonAsciiCount: (result.match(/[^\x00-\x7F]/g) || []).length,
      hasUrls: /https?:\/\/\S+/.test(result),
      hasMarkdown: /[*_`#\[\]]/.test(result)
    });
    
    // Warn if text was significantly shortened
    if (changePercent < -20) {
      logWarn('AI significantly shortened text', {
        chunkIndex,
        originalLength: chunkText.length,
        cleanedLength: result.length,
        reduction: `${Math.abs(changePercent)}%`
      });
    }
    
    return result;
  } catch (error) {
    logError('Failed to prepare chunk for audio', { chunkIndex, error });
    // Fallback: basic cleanup without AI
    return basicCleanup(chunkText);
  }
}

/**
 * Sanitize text for Piper TTS phonemizer
 * Removes problematic Unicode characters that cause phoneme index errors
 * This is the same sanitization used in offscreen.js for consistency
 * @param {string} text - Text to sanitize
 * @param {string} language - Language code (optional, for language-specific sanitization)
 * @returns {string} Sanitized text safe for Piper TTS
 */
export function sanitizeForPiperTTS(text, language = 'auto') {
  if (!text || typeof text !== 'string') return '';
  
  let langCode = language.split('-')[0].toLowerCase();
  // Normalize Ukrainian language code: 'ua' -> 'uk' (Piper TTS uses 'uk')
  if (langCode === 'ua') {
    langCode = 'uk';
  }
  
  let sanitized = text
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
  
  // Additional aggressive sanitization for English text
  // For English, be very strict - only allow ASCII printable + newlines
  if (langCode === 'en') {
    sanitized = sanitized
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
    // Special handling for Ukrainian: preserve all Cyrillic letters including і, ї, є, ґ
    const beforeFinalSanitization = sanitized;
    sanitized = sanitized
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\t]/gu, ' ')  // Keep letters, numbers, punctuation, whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // Log detailed info for Ukrainian language to debug issues
    if (langCode === 'uk') {
      const ukrainianCharsBefore = (beforeFinalSanitization.match(/[іїєґІЇЄҐ]/g) || []).length;
      const ukrainianCharsAfter = (sanitized.match(/[іїєґІЇЄҐ]/g) || []).length;
      const ukrainianCharsLost = ukrainianCharsBefore - ukrainianCharsAfter;
      const removedChars = beforeFinalSanitization.length - sanitized.length;
      const ukrainianCharsSample = (beforeFinalSanitization.match(/[іїєґІЇЄҐ]/g) || []).slice(0, 10);
      const ukrainianCharsAfterSample = (sanitized.match(/[іїєґІЇЄҐ]/g) || []).slice(0, 10);
      
      // Always log for Ukrainian text to help debug issues
      log('=== sanitizeForPiperTTS: Ukrainian text sanitization ===', {
        langCode,
        originalLength: text.length,
        beforeFinalSanitizationLength: beforeFinalSanitization.length,
        afterSanitizationLength: sanitized.length,
        ukrainianCharsBefore,
        ukrainianCharsAfter,
        ukrainianCharsLost,
        removedChars,
        ukrainianCharsSample,
        ukrainianCharsAfterSample,
        previewBefore: beforeFinalSanitization.substring(0, 200),
        previewAfter: sanitized.substring(0, 200),
        // Log first 50 chars with Unicode codes for debugging
        firstCharsUnicode: Array.from(sanitized.substring(0, 50)).map(c => 
          `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
        )
      });
    }
  }
  
  return sanitized;
}

/**
 * Basic text cleanup without AI (for offline TTS or fallback)
 * Removes URLs, markdown, footnotes, and other non-speech elements
 * Also applies Piper TTS sanitization to prevent phoneme errors
 * @param {string} text - Text to clean
 * @param {string} language - Language code (optional, for language-specific sanitization)
 * @returns {string} Cleaned text ready for TTS
 */
export function basicCleanup(text, language = 'auto') {
  if (!text || typeof text !== 'string') return '';
  
  // Log before cleanup
  const beforeCleanup = {
    length: text.length,
    language,
    nonAsciiCount: (text.match(/[^\x00-\x7F]/g) || []).length,
    urlCount: (text.match(/https?:\/\/\S+/g) || []).length,
    markdownCount: (text.match(/[*_`#\[\]]/g) || []).length,
    preview: text.substring(0, 200)
  };
  
  log('=== basicCleanup START ===', beforeCleanup);
  
  // First, remove URLs, markdown, and other non-speech elements
  let cleaned = text
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    .replace(/www\.\S+/g, '')
    // Remove footnotes and references
    .replace(/\[\d+\]/g, '')
    .replace(/\^\d+/g, '')
    .replace(/\(see\s+[^)]+\)/gi, '') // Remove "see X" references
    // Remove code blocks and inline code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    // Remove markdown formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1')     // Italic
    .replace(/__([^_]+)__/g, '$1')     // Bold underscore
    .replace(/_([^_]+)_/g, '$1')       // Italic underscore
    .replace(/#{1,6}\s+/g, '')         // Headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links [text](url) -> text
    // Remove email addresses
    .replace(/\S+@\S+\.\S+/g, '')
    // Remove file paths (basic)
    .replace(/[A-Z]:\\[^\s]+/gi, '')
    .replace(/\/[^\s]+\.[a-z]{2,4}/gi, '')
    // Normalize whitespace (preserve paragraph breaks)
    .replace(/[ \t]+/g, ' ')           // Multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n')        // Multiple newlines to double newline
    .trim();
  
  // Then apply Piper TTS sanitization to prevent phoneme errors
  const beforeSanitization = {
    length: cleaned.length,
    preview: cleaned.substring(0, 200)
  };
  
  cleaned = sanitizeForPiperTTS(cleaned, language);
  
  const afterCleanup = {
    originalLength: text.length,
    cleanedLength: cleaned.length,
    lengthChange: cleaned.length - text.length,
    lengthChangePercent: Math.round(((cleaned.length - text.length) / text.length) * 100),
    nonAsciiCount: (cleaned.match(/[^\x00-\x7F]/g) || []).length,
    preview: cleaned.substring(0, 200),
    end: '...' + cleaned.substring(Math.max(0, cleaned.length - 100))
  };
  
  log('=== basicCleanup COMPLETE ===', {
    ...afterCleanup,
    beforeCleanup,
    beforeSanitization
  });
  
  return cleaned;
}

/**
 * Full audio preparation pipeline
 * Takes article content and prepares it for TTS
 * @param {Array} content - Content items from extraction
 * @param {string} title - Article title
 * @param {string} apiKey - API key
 * @param {string} model - Model to use
 * @param {string} language - Target language code (e.g., 'ru', 'en', 'auto')
 * @param {Function} updateState - State update callback
 * @returns {Promise<Array<{text: string, index: number}>>} Prepared chunks ready for TTS
 */
export async function prepareContentForAudio(content, title, apiKey, model, language = 'auto', updateState, provider = null) {
  // Determine cleanup mode: use AI cleanup for online TTS, basic cleanup for offline
  const useAICleanup = provider !== 'offline' && apiKey && model;
  
  // Log all preparation settings
  const preparationSettings = {
    timestamp: Date.now(),
    // Content Settings
    contentItems: content?.length,
    title: title?.substring(0, 100),
    titleLength: title?.length,
    // Language Settings
    language,
    // Model Settings
    model,
    hasApiKey: !!apiKey,
    // Provider and Cleanup Mode
    provider: provider || 'unknown',
    useAICleanup,
    cleanupMode: useAICleanup ? 'AI-powered' : 'basic',
    // Audio Config
    audioConfig: {
      minChunkSize: AUDIO_CONFIG.MIN_CHUNK_SIZE,
      maxChunkSize: AUDIO_CONFIG.MAX_CHUNK_SIZE,
      idealChunkSize: AUDIO_CONFIG.IDEAL_CHUNK_SIZE,
      ttsMaxInput: AUDIO_CONFIG.TTS_MAX_INPUT
    },
    // Current State
    currentProgress: getProcessingState()?.progress || 0
  };
  
  log('Starting audio preparation with all settings', preparationSettings);
  
  // Get UI language for localization
  const uiLang = await getUILanguage();
  
  // Get current progress to avoid rollback (e.g., if translation was done, progress might be 60%)
  const currentState = getProcessingState();
  const currentProgress = currentState?.progress || 0;
  
  // If current progress is already >= 60% (translation was done), use 60% as base
  // Otherwise, use normal progression 10-60%
  const progressBase = currentProgress >= 60 ? 60 : 20;
  const progressRange = currentProgress >= 60 ? 0 : 40; // No range if already at 60%
  const startProgress = currentProgress >= 60 ? 60 : 10;
  
  // Convert content to plain text
  const convertingStatus = tSync('stageConvertingToText', uiLang);
  updateState?.({ stage: PROCESSING_STAGES.GENERATING.id, status: convertingStatus, progress: startProgress });
  const plainText = contentToPlainText(content);
  
  if (!plainText) {
    throw new Error('No text content to convert to audio');
  }
  
  log('Converted to plain text', { length: plainText.length });
  
  // Add title at the beginning, but avoid duplication if plainText already starts with title
  let fullText = plainText;
  if (title) {
    // Check if plainText already starts with title (case-insensitive, ignoring whitespace)
    const titleNormalized = title.trim().toLowerCase();
    const plainTextStart = plainText.trim().substring(0, titleNormalized.length).toLowerCase();
    if (plainTextStart !== titleNormalized) {
      fullText = `${title}\n\n${plainText}`;
      log('Title added to beginning', { title, plainTextStart: plainText.substring(0, 100) });
    } else {
      log('Title already present in plainText, skipping duplicate', { title, plainTextStart: plainText.substring(0, 100) });
    }
  }
  
  // Split into chunks
  const splittingStatus = tSync('stageSplittingIntoChunks', uiLang);
  const splitProgress = currentProgress >= 60 ? 60 : 15;
  updateState?.({ stage: PROCESSING_STAGES.GENERATING.id, status: splittingStatus, progress: splitProgress });
  
  log('=== prepareContentForAudio: Splitting text into chunks ===', {
    fullTextLength: fullText.length,
    targetChunkSize: AUDIO_CONFIG.IDEAL_CHUNK_SIZE,
    minChunkSize: AUDIO_CONFIG.MIN_CHUNK_SIZE,
    maxChunkSize: AUDIO_CONFIG.MAX_CHUNK_SIZE,
    estimatedChunks: Math.ceil(fullText.length / AUDIO_CONFIG.IDEAL_CHUNK_SIZE),
    fullTextPreview: fullText.substring(0, 200),
    fullTextEnd: '...' + fullText.substring(Math.max(0, fullText.length - 100))
  });
  
  const chunks = splitTextIntoChunks(fullText);
  
  if (chunks.length === 0) {
    throw new Error('Failed to split text into chunks');
  }
  
  log('=== prepareContentForAudio: Text split into chunks ===', {
    totalChunks: chunks.length,
    chunkSizes: chunks.map(c => c.text.length),
    totalChars: chunks.reduce((sum, c) => sum + c.text.length, 0),
    avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length),
    minChunkSize: Math.min(...chunks.map(c => c.text.length)),
    maxChunkSize: Math.max(...chunks.map(c => c.text.length)),
    chunksPreview: chunks.slice(0, 3).map((c, i) => ({
      index: i,
      length: c.text.length,
      preview: c.text.substring(0, 100) + '...'
    }))
  });
  
  // Prepare each chunk for audio
  const preparedChunks = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkStartTime = Date.now();
    
    // If already at 60%, keep it there (progress protection will prevent rollback)
    // Otherwise, progress from base to 60%
    const progress = currentProgress >= 60 ? 60 : (progressBase + Math.floor((i / chunks.length) * progressRange));
    const preparingStatus = tSync('stagePreparingSegment', uiLang)
      .replace('{current}', String(i + 1))
      .replace('{total}', String(chunks.length));
    updateState?.({ 
      stage: PROCESSING_STAGES.GENERATING.id,
      status: preparingStatus, 
      progress 
    });
    
    log('=== prepareContentForAudio: Processing chunk ===', {
      chunkIndex: i,
      totalChunks: chunks.length,
      chunkLength: chunk.text.length,
      progress,
      chunkPreview: chunk.text.substring(0, 150) + '...'
    });
    
    // Use AI cleanup for online TTS, basic cleanup for offline
    let preparedText;
    if (useAICleanup) {
      preparedText = await prepareChunkForAudio(
        chunk.text, 
        i, 
        chunks.length, 
        apiKey, 
        model,
        language
      );
    } else {
      // For offline TTS, use basic cleanup without AI
      log('=== prepareContentForAudio: Using basic cleanup (offline TTS) ===', {
        chunkIndex: i,
        totalChunks: chunks.length,
        originalLength: chunk.text.length,
        originalPreview: chunk.text.substring(0, 150) + '...',
        language
      });
      
      preparedText = basicCleanup(chunk.text, language);
      
      log('=== prepareContentForAudio: Basic cleanup complete ===', {
        chunkIndex: i,
        originalLength: chunk.text.length,
        cleanedLength: preparedText.length,
        lengthChange: preparedText.length - chunk.text.length,
        cleanedPreview: preparedText.substring(0, 150) + '...'
      });
    }
    
    const chunkDuration = Date.now() - chunkStartTime;
    
    if (preparedText && preparedText.length > 0) {
      preparedChunks.push({
        text: preparedText,
        index: i,
        originalIndex: chunk.index
      });
      
      log('=== prepareContentForAudio: Chunk processed successfully ===', {
        chunkIndex: i,
        originalLength: chunk.text.length,
        preparedLength: preparedText.length,
        duration: chunkDuration,
        lengthChange: preparedText.length - chunk.text.length,
        lengthChangePercent: Math.round(((preparedText.length - chunk.text.length) / chunk.text.length) * 100)
      });
    } else {
      logWarn('=== prepareContentForAudio: Chunk resulted in empty text ===', {
        chunkIndex: i,
        originalLength: chunk.text.length,
        duration: chunkDuration
      });
    }
  }
  
  const totalOriginalChars = chunks.reduce((sum, c) => sum + c.text.length, 0);
  const totalPreparedChars = preparedChunks.reduce((sum, c) => sum + c.text.length, 0);
  const overallChange = totalPreparedChars - totalOriginalChars;
  const overallPercent = Math.round((overallChange / totalOriginalChars) * 100);
  
  log('=== AUDIO PREPARATION COMPLETE ===', { 
    originalPlainTextLength: plainText.length,
    totalOriginalChars,
    totalPreparedChars,
    overallChange: `${overallChange > 0 ? '+' : ''}${overallChange} (${overallPercent}%)`,
    chunksCreated: preparedChunks.length,
    chunkSizes: preparedChunks.map(c => c.text.length)
  });
  
  // Warn if overall text was significantly reduced
  if (overallPercent < -15) {
    logWarn('=== WARNING: Text significantly reduced during preparation ===', {
      originalLength: totalOriginalChars,
      preparedLength: totalPreparedChars,
      reduction: `${Math.abs(overallPercent)}%`
    });
  }
  
  return preparedChunks;
}

