// Content generation module for ClipAIble extension
// Handles generation of abstracts and summaries

// @ts-check

/**
 * @typedef {import('../types.js').ContentItem} ContentItem
 */

import { renderPrompt } from '../settings/prompt-catalog.js';
import { log, logError, logWarn } from '../utils/logging.js';
import { LANGUAGE_NAMES } from '../utils/config.js';
import { callAI } from '../api/index.js';
import { stripHtml } from '../utils/html.js';
import { tSync, getUILanguage } from '../locales.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Generate abstract for content
 * @param {Array<ContentItem>} content - Content items
 * @param {string} title - Article title
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} [language='auto'] - Target language
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update function
 * @returns {Promise<string>} Generated abstract
 */
export async function generateAbstract(content, title, apiKey, model, language = 'auto', updateState, options = {}) {
  options.checkCancelled?.();
  log('=== ABSTRACT GENERATION START ===', { title, contentItems: content?.length, language });
  
  if (!content || content.length === 0) {
    logWarn('No content for abstract generation');
    return '';
  }
  
  // Extract text content (skip code, images, etc.)
  // CRITICAL: Use same extraction logic as generateSummary for consistency
  let articleText = '';
  for (const item of content) {
    if (item.type === 'code') continue; // Skip code blocks
    if (item.type === 'image') continue; // Skip images
    
    switch (item.type) {
      case 'heading': {
        const level = Math.min(Math.max(item.level || 2, 1), 6);
        const prefix = '#'.repeat(level);
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          articleText += `${prefix} ${text.trim()}\n\n`;
        }
        break;
      }
      
      case 'paragraph': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          articleText += `${text.trim()}\n\n`;
        }
        break;
      }
      
      case 'quote':
      case 'blockquote': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          const quoted = text.trim().split('\n').map(line => `> ${line}`).join('\n');
          articleText += `${quoted}\n\n`;
        }
        break;
      }
      
      case 'list': {
        const items = item.items || [];
        const isOrdered = item.ordered || false;
        items.forEach((listItem, index) => {
          const prefix = isOrdered ? `${index + 1}.` : '-';
          let itemText = '';
          if (typeof listItem === 'string') {
            itemText = listItem.trim();
          } else if (listItem && listItem.html) {
            itemText = stripHtml(listItem.html).trim();
          } else if (listItem && 'text' in listItem && listItem.text && typeof listItem.text === 'string') {
            itemText = stripHtml(listItem.text).trim();
          }
          if (itemText) {
            articleText += `${prefix} ${itemText}\n`;
          }
        });
        articleText += '\n';
        break;
      }
      
      default: {
        // Fallback for other types
        if (item.text) {
          const text = stripHtml(item.text);
          if (text && text.trim()) {
            articleText += `${text.trim()}\n\n`;
          }
        }
        if (item.items && Array.isArray(item.items)) {
          for (const listItem of item.items) {
            if (typeof listItem === 'string') {
              articleText += `${listItem.trim()}\n`;
            } else if (listItem && listItem.html) {
              const text = stripHtml(listItem.html);
              if (text && text.trim()) {
                articleText += `${text.trim()}\n`;
              }
            }
          }
          articleText += '\n';
        }
        break;
      }
    }
  }
  
  if (!articleText.trim()) {
    logWarn('No text extracted for abstract generation');
    return '';
  }
  
  // Determine target language for abstract
  let langInstruction;
  if (language === 'auto') {
    // Let AI detect language and write abstract in the same language as the article
    langInstruction = 'Write the abstract in the SAME LANGUAGE as the article content (detect automatically)';
  } else {
    const targetLang = LANGUAGE_NAMES[language] || 'English';
    langInstruction = `Write in ${targetLang}`;
  }

  const systemPrompt = renderPrompt('abstract', options, { languageInstruction: langInstruction });

  const userPrompt = `Article Title: ${title}

Article Content:
${articleText}

Generate the TL;DR:`;
  
  try {
    // CRITICAL: Use callAI which automatically routes to the correct provider based on model
    // callAI handles API key decryption internally (supports both encrypted and plain keys)
    // This ensures support for all providers including DeepSeek, Qwen, Grok, etc.
    log('=== CALLING AI FOR ABSTRACT ===', { 
      model, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      timestamp: Date.now()
    });
    
    const abstractResponse = await callAI(systemPrompt, userPrompt, apiKey, model, false, options); // false = text response, not JSON
    
    // Extract string from response (callAI returns string when jsonResponse=false, but TypeScript sees AIResponse|string)
    let abstract = typeof abstractResponse === 'string' ? abstractResponse : (abstractResponse?.content || '');
    
    if (abstract) {
      // Post-process to ensure single paragraph: remove extra newlines and merge into one paragraph
      abstract = abstract
        .trim()
        .replace(/\n\s*\n\s*/g, ' ') // Replace multiple newlines with space
        .replace(/\n/g, ' ') // Replace single newlines with space
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
      
      log('=== ABSTRACT GENERATION END ===', { abstractLength: abstract.length });
      return abstract;
    }
    
    log('=== ABSTRACT GENERATION END ===', { abstractLength: 0 });
    return '';
  } catch (error) {
    options.checkCancelled?.();
    logError('generateAbstract failed', error);
    // Don't throw - abstract generation is optional
    return '';
  }
}

/**
 * Generate summary for article content
 * @param {{contentItems: import('../types.js').ContentItem[], apiKey: string, model: string, url: string, language: string, provider?: import('../types.js').AIProvider, checkCancelled?: () => void, promptOverrides?: import('../settings/prompt-catalog.js').PromptOverrides}} data - Summary generation data
 * @returns {Promise<{summary: string}>} Generated summary
 * @throws {Error} If contentItems is empty
 * @throws {Error} If API key is missing
 * @throws {Error} If summary generation fails
 * @throws {Error} If network error occurs
 */
export async function generateSummary(data) {
  const { contentItems, apiKey, model, url, language } = data;
  const options = { provider: data.provider, checkCancelled: data.checkCancelled, promptOverrides: data.promptOverrides };
  options.checkCancelled?.();
  
  log('=== SUMMARY GENERATION START ===', { 
    url, 
    contentItemsCount: contentItems?.length || 0, 
    language,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  
  if (!contentItems || contentItems.length === 0) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content provided for summary generation');
    const normalized = await handleError(noContentError, {
      source: 'summaryGeneration',
      errorType: 'noContentForSummary',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        hasContentItems: !!contentItems,
        contentItemsLength: contentItems?.length || 0
      }
    });
    
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(normalized.userMessage || tSync('errorNoContentForSummary', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }
  
  if (!apiKey || !model) {
    // Normalize error with context for better logging and error tracking
    const noApiKeyError = new Error('API key or model not provided for summary generation');
    const normalized = await handleError(noApiKeyError, {
      source: 'summaryGeneration',
      errorType: 'noApiKeyForSummary',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateApiKey',
        hasApiKey: !!apiKey,
        hasModel: !!model
      }
    });
    
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(normalized.userMessage || tSync('errorApiKeyRequiredForSummary', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }
  
  // Determine target language for summary
  // If language is provided, use it; otherwise use UI language as fallback
  let targetLang = language;
  if (!targetLang || targetLang === 'auto') {
    targetLang = await getUILanguage();
  }
  
  // Get language name from code
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  
  log('Summary target language', { targetLang, langName });
  
  // Note: callAI will handle API key decryption internally with caching
  // No need to decrypt here - callAI uses getDecryptedKeyCached which handles both encrypted and plain keys
  
  // Extract structured text content (preserve headings, lists, quotes, but skip code and images)
  // CRITICAL: contentItems should already be translated if translation was performed
  // (translation happens before summary generation in the pipeline)
  let articleText = '';
  log('=== EXTRACTING TEXT FROM CONTENT ITEMS FOR SUMMARY ===', {
    contentItemsCount: contentItems.length,
    targetLanguage: targetLang,
    langName,
    timestamp: Date.now()
  });
  
  for (const item of contentItems) {
    if (item.type === 'code') continue; // Skip code blocks
    if (item.type === 'image') continue; // Skip images
    
    switch (item.type) {
      case 'heading': {
        const level = Math.min(Math.max(item.level || 2, 1), 6);
        const prefix = '#'.repeat(level);
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          articleText += `${prefix} ${text.trim()}\n\n`;
        }
        break;
      }
      
      case 'paragraph': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          articleText += `${text.trim()}\n\n`;
        }
        break;
      }
      
      case 'quote':
      case 'blockquote': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          const quoted = text.trim().split('\n').map(line => `> ${line}`).join('\n');
          articleText += `${quoted}\n\n`;
        }
        break;
      }
      
      case 'list': {
        const items = item.items || [];
        const isOrdered = item.ordered || false;
        items.forEach((listItem, index) => {
          const prefix = isOrdered ? `${index + 1}.` : '-';
          let itemText = '';
          if (typeof listItem === 'string') {
            itemText = listItem.trim();
          } else if (listItem && listItem.html) {
            itemText = stripHtml(listItem.html).trim();
          } else if (listItem && 'text' in listItem && listItem.text && typeof listItem.text === 'string') {
            itemText = stripHtml(listItem.text).trim();
          }
          if (itemText) {
            articleText += `${prefix} ${itemText}\n`;
          }
        });
        articleText += '\n';
        break;
      }
      
      case 'table': {
        // Extract table as structured text
        const headers = item.headers || [];
        const rows = item.rows || [];
        if (headers.length > 0) {
          articleText += `Table:\n`;
          articleText += `Headers: ${headers.map(h => stripHtml(h || '')).join(' | ')}\n`;
          rows.forEach((row, index) => {
            const rowText = (row || []).map(cell => stripHtml(cell || '')).join(' | ');
            if (rowText) {
              articleText += `Row ${index + 1}: ${rowText}\n`;
            }
          });
          articleText += '\n';
        }
        break;
      }
      
      default: {
        // Fallback for other types
        if (item.text) {
          const text = stripHtml(item.text);
          if (text && text.trim()) {
            articleText += `${text.trim()}\n\n`;
          }
        }
        if (item.items && Array.isArray(item.items)) {
          for (const listItem of item.items) {
            if (typeof listItem === 'string') {
              articleText += `${listItem.trim()}\n`;
            } else if (listItem && listItem.html) {
              const text = stripHtml(listItem.html);
              if (text && text.trim()) {
                articleText += `${text.trim()}\n`;
              }
            }
          }
          articleText += '\n';
        }
        break;
      }
    }
  }
  
  if (!articleText.trim()) {
    // Normalize error with context for better logging and error tracking
    const noTextError = new Error('No text extracted from content for summary generation');
    const normalized = await handleError(noTextError, {
      source: 'summaryGeneration',
      errorType: 'noTextExtractedForSummary',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'extractText',
        contentItemsCount: contentItems?.length || 0,
        articleTextLength: articleText.length
      }
    });
    
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(normalized.userMessage || tSync('errorNoTextExtractedForSummary', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }
  
  const systemPrompt = renderPrompt('summary', options, { targetLanguage: langName });

  const userPrompt = `Article URL: ${url || 'Unknown'}

Article Content:
${articleText}

Generate a summary in Markdown format in ${langName} language:`;
  
  try {
    log('Starting AI generation for summary', { timestamp: Date.now() });
    
    // CRITICAL: Summary generation should NOT use processingState
    // It should only use summary_generating flag to avoid interfering with document generation UI
    // Save generating flag to storage (already set in background.js before calling this function)
    log('Calling AI for summary generation', { 
      articleTextLength: articleText.length,
      promptLength: userPrompt.length,
      timestamp: Date.now()
    });
    
    // Use callAI which automatically routes to the correct provider based on model
    // callAI handles API key decryption internally (supports both encrypted and plain keys)
    log('=== CALLING AI FOR SUMMARY ===', { 
      model, 
      promptLength: userPrompt.length,
      systemPromptLength: systemPrompt.length,
      timestamp: Date.now()
    });
    
    const summaryResponse = await callAI(systemPrompt, userPrompt, apiKey, model, false, options); // false = text response, not JSON
    
    // Extract string from response (callAI returns string when jsonResponse=false, but TypeScript sees AIResponse|string)
    const summary = typeof summaryResponse === 'string' ? summaryResponse : (summaryResponse?.content || '');
    
    log('=== AI RESPONSE RECEIVED ===', { 
      summaryLength: summary?.length || 0,
      hasSummary: !!summary,
      timestamp: Date.now()
    });
    
    if (summary && typeof summary === 'string' && summary.trim()) {
      log('AI returned valid summary', { summaryLength: summary.length, timestamp: Date.now() });
      
      log('=== SUMMARY GENERATION END ===', { 
        summaryLength: summary.length,
        timestamp: Date.now()
      });
      return { summary: summary.trim() };
    }
    
    logError('AI returned empty or invalid summary', { 
      hasSummary: !!summary,
      summaryType: typeof summary,
      summaryLength: summary?.length || 0
    });
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorEmptySummary', uiLang));
  } catch (error) {
    options.checkCancelled?.();
    logError('=== generateSummary FUNCTION ERROR ===', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: Date.now()
    });
    throw error;
  }
}

/**
 * Generate key theses from article content (analytical extraction of main claims)
 * @param {{contentItems: import('../types.js').ContentItem[], apiKey: string, model: string, url: string, language: string, provider?: import('../types.js').AIProvider, checkCancelled?: () => void, promptOverrides?: import('../settings/prompt-catalog.js').PromptOverrides}} data - Same shape as summary
 * @returns {Promise<{keyTheses: string}>} Markdown string of theses (from JSON theses)
 * @throws {Error} If content/API/key missing or generation fails
 */
export async function generateKeyTheses(data) {
  const { contentItems, apiKey, model, url, language } = data;
  const options = { provider: data.provider, checkCancelled: data.checkCancelled, promptOverrides: data.promptOverrides };
  options.checkCancelled?.();

  log('=== KEY THESES GENERATION START ===', {
    url,
    contentItemsCount: contentItems?.length || 0,
    language,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });

  if (!contentItems || contentItems.length === 0) {
    const noContentError = new Error('No content provided for key theses generation');
    const normalized = await handleError(noContentError, {
      source: 'keyThesesGeneration',
      errorType: 'noContentForSummary',
      logError: true,
      createUserMessage: true,
      context: { operation: 'validateContent', hasContentItems: !!contentItems, contentItemsLength: contentItems?.length || 0 }
    });
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const err = new Error(normalized.userMessage || tSync('errorNoContentForSummary', uiLang));
    err.code = normalized.code;
    err.originalError = normalized.originalError;
    err.context = normalized.context;
    throw err;
  }

  if (!apiKey || !model) {
    const noApiKeyError = new Error('API key or model not provided for key theses generation');
    const normalized = await handleError(noApiKeyError, {
      source: 'keyThesesGeneration',
      errorType: 'noApiKeyForSummary',
      logError: true,
      createUserMessage: true,
      context: { operation: 'validateApiKey', hasApiKey: !!apiKey, hasModel: !!model }
    });
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const err = new Error(normalized.userMessage || tSync('errorApiKeyRequiredForSummary', uiLang));
    err.code = normalized.code;
    err.originalError = normalized.originalError;
    err.context = normalized.context;
    throw err;
  }

  let targetLang = language;
  if (!targetLang || targetLang === 'auto') {
    targetLang = await getUILanguage();
  }
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;

  let articleText = '';
  for (const item of contentItems) {
    if (item.type === 'code' || item.type === 'image') continue;
    switch (item.type) {
      case 'heading': {
        const level = Math.min(Math.max(item.level || 2, 1), 6);
        const prefix = '#'.repeat(level);
        const text = stripHtml(item.text || '');
        if (text && text.trim()) articleText += `${prefix} ${text.trim()}\n\n`;
        break;
      }
      case 'paragraph': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) articleText += `${text.trim()}\n\n`;
        break;
      }
      case 'quote':
      case 'blockquote': {
        const text = stripHtml(item.text || '');
        if (text && text.trim()) {
          const quoted = text.trim().split('\n').map(line => `> ${line}`).join('\n');
          articleText += `${quoted}\n\n`;
        }
        break;
      }
      case 'list': {
        const items = item.items || [];
        const isOrdered = item.ordered || false;
        items.forEach((listItem, index) => {
          const prefix = isOrdered ? `${index + 1}.` : '-';
          let itemText = '';
          if (typeof listItem === 'string') itemText = listItem.trim();
          else if (listItem && listItem.html) itemText = stripHtml(listItem.html).trim();
          else if (listItem && 'text' in listItem && listItem.text && typeof listItem.text === 'string') itemText = stripHtml(listItem.text).trim();
          if (itemText) articleText += `${prefix} ${itemText}\n`;
        });
        articleText += '\n';
        break;
      }
      case 'table': {
        const headers = item.headers || [];
        const rows = item.rows || [];
        if (headers.length > 0) {
          articleText += 'Table:\n';
          articleText += `Headers: ${headers.map(h => stripHtml(h || '')).join(' | ')}\n`;
          rows.forEach((row, index) => {
            const rowText = (row || []).map(cell => stripHtml(cell || '')).join(' | ');
            if (rowText) articleText += `Row ${index + 1}: ${rowText}\n`;
          });
          articleText += '\n';
        }
        break;
      }
      default: {
        if (item.text) {
          const text = stripHtml(item.text);
          if (text && text.trim()) articleText += `${text.trim()}\n\n`;
        }
        if (item.items && Array.isArray(item.items)) {
          for (const listItem of item.items) {
            if (typeof listItem === 'string') articleText += `${listItem.trim()}\n`;
            else if (listItem && listItem.html) {
              const text = stripHtml(listItem.html);
              if (text && text.trim()) articleText += `${text.trim()}\n`;
            }
          }
          articleText += '\n';
        }
        break;
      }
    }
  }

  if (!articleText.trim()) {
    const noTextError = new Error('No text extracted from content for key theses generation');
    const normalized = await handleError(noTextError, {
      source: 'keyThesesGeneration',
      errorType: 'noTextExtractedForSummary',
      logError: true,
      createUserMessage: true,
      context: { operation: 'extractText', contentItemsCount: contentItems?.length || 0, articleTextLength: articleText.length }
    });
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const err = new Error(normalized.userMessage || tSync('errorNoTextExtractedForSummary', uiLang));
    err.code = normalized.code;
    err.originalError = normalized.originalError;
    err.context = normalized.context;
    throw err;
  }

  const systemPrompt = renderPrompt('keyTheses', options, { targetLanguage: langName });

  const userPrompt = `URL: ${url || 'Unknown'}

Content:

${articleText}

Output the key theses as JSON only (theses array with short and expanded for each).`;

  try {
    log('Calling AI for key theses generation', { articleTextLength: articleText.length, timestamp: Date.now() });

    const rawResponse = await callAI(systemPrompt, userPrompt, apiKey, model, true, options);
    const content = typeof rawResponse === 'object' && rawResponse !== null && 'content' in rawResponse
      ? rawResponse.content
      : (typeof rawResponse === 'string' ? rawResponse : rawResponse);

    let theses = [];
    const obj = typeof content === 'object' && content !== null ? content : (typeof rawResponse === 'object' && rawResponse !== null ? rawResponse : null);
    if (obj && Array.isArray(obj.theses)) {
      theses = obj.theses;
    } else if (typeof content === 'string' && content.trim()) {
      try {
        const parsed = JSON.parse(content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, '$1'));
        if (Array.isArray(parsed.theses)) theses = parsed.theses;
      } catch (_) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.theses)) theses = parsed.theses;
      }
    }

    if (theses.length === 0) {
      logError('AI returned no valid theses', { contentType: typeof content, timestamp: Date.now() });
      const uiLang = await getUILanguage();
      throw new Error(tSync('errorEmptySummary', uiLang));
    }

    const markdown = theses
      .map((t, i) => {
        const short = (t && (t.short ?? t.shortFormulation)) ? String(t.short ?? t.shortFormulation).trim() : '';
        const expanded = (t && (t.expanded ?? t.expandedFormulation)) ? String(t.expanded ?? t.expandedFormulation).trim() : '';
        return `${i + 1}. **${short}**: ${expanded}`;
      })
      .filter(Boolean)
      .join('\n\n');

    log('=== KEY THESES GENERATION END ===', { thesesCount: theses.length, timestamp: Date.now() });
    return { keyTheses: markdown };
  } catch (error) {
    options.checkCancelled?.();
    logError('=== generateKeyTheses ERROR ===', { error: error?.message, timestamp: Date.now() });
    throw error;
  }
}

