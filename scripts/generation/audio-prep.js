// Audio preparation module for Webpage to PDF extension
// Handles text chunking and cleanup for TTS conversion

import { log, logError, logWarn } from '../utils/logging.js';
import { callAI } from '../api/index.js';

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
  if (!content || !Array.isArray(content)) return '';
  
  const textParts = [];
  
  for (const item of content) {
    switch (item.type) {
      case 'heading':
        // Add heading with newlines for natural pauses
        const headingText = stripHtml(item.text || '');
        if (headingText) {
          textParts.push(`\n\n${headingText}\n`);
        }
        break;
        
      case 'paragraph':
        const paraText = stripHtml(item.text || '');
        if (paraText) {
          textParts.push(paraText);
        }
        break;
        
      case 'quote':
        const quoteText = stripHtml(item.text || '');
        if (quoteText) {
          textParts.push(`Quote: ${quoteText}`);
        }
        break;
        
      case 'list':
        if (item.items && Array.isArray(item.items)) {
          const listItems = item.items.map((li, index) => {
            const text = typeof li === 'string' ? li : stripHtml(li.html || '');
            return item.ordered ? `${index + 1}. ${text}` : `• ${text}`;
          }).filter(t => t);
          if (listItems.length > 0) {
            textParts.push(listItems.join('\n'));
          }
        }
        break;
        
      case 'code':
        // Skip code blocks - not suitable for audio
        break;
        
      case 'image':
        // Include image caption if present
        if (item.caption) {
          const captionText = stripHtml(item.caption);
          if (captionText) {
            textParts.push(`Image: ${captionText}`);
          }
        }
        break;
        
      case 'table':
        // Skip tables - too complex for audio
        break;
        
      case 'separator':
        textParts.push('\n');
        break;
        
      case 'infobox_start':
        if (item.title) {
          textParts.push(`\n${item.title}:`);
        }
        break;
        
      case 'infobox_end':
        textParts.push('\n');
        break;
    }
  }
  
  return textParts.join('\n\n').trim();
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
  'uk': 'Ukrainian',
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
  log('Preparing chunk for audio', { chunkIndex, totalChunks, textLength: chunkText.length, language });
  
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
    const cleaned = await callAI(systemPrompt, userPrompt, apiKey, model, false);
    
    // Additional cleanup
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
    
    log('Chunk prepared for audio', { 
      chunkIndex, 
      originalLength: chunkText.length, 
      cleanedLength: result.length 
    });
    
    return result;
  } catch (error) {
    logError('Failed to prepare chunk for audio', { chunkIndex, error });
    // Fallback: basic cleanup without AI
    return basicCleanup(chunkText);
  }
}

/**
 * Basic text cleanup without AI (fallback)
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
function basicCleanup(text) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/www\.\S+/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\^\d+/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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
export async function prepareContentForAudio(content, title, apiKey, model, language = 'auto', updateState) {
  log('Starting audio preparation', { contentItems: content?.length, title, language });
  
  // Convert content to plain text
  updateState?.({ status: 'Converting article to text...', progress: 10 });
  const plainText = contentToPlainText(content);
  
  if (!plainText) {
    throw new Error('No text content to convert to audio');
  }
  
  log('Converted to plain text', { length: plainText.length });
  
  // Add title at the beginning
  const fullText = title ? `${title}\n\n${plainText}` : plainText;
  
  // Split into chunks
  updateState?.({ status: 'Splitting into audio segments...', progress: 15 });
  const chunks = splitTextIntoChunks(fullText);
  
  if (chunks.length === 0) {
    throw new Error('Failed to split text into chunks');
  }
  
  // Prepare each chunk for audio
  const preparedChunks = [];
  const progressBase = 20;
  const progressRange = 40; // Use 20-60% for preparation
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const progress = progressBase + Math.floor((i / chunks.length) * progressRange);
    updateState?.({ 
      status: `Preparing segment ${i + 1}/${chunks.length} for audio...`, 
      progress 
    });
    
    const preparedText = await prepareChunkForAudio(
      chunk.text, 
      i, 
      chunks.length, 
      apiKey, 
      model,
      language
    );
    
    if (preparedText && preparedText.length > 0) {
      preparedChunks.push({
        text: preparedText,
        index: i,
        originalIndex: chunk.index
      });
    }
  }
  
  log('Audio preparation complete', { 
    totalChunks: preparedChunks.length,
    totalCharacters: preparedChunks.reduce((sum, c) => sum + c.text.length, 0)
  });
  
  return preparedChunks;
}

