// Content generation module for ClipAIble extension
// Handles generation of abstracts and summaries

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem

import { log, logError, logWarn } from '../utils/logging.js';
import { LANGUAGE_NAMES } from '../utils/config.js';
import { getProviderFromModel, parseModelConfig, callAI } from '../api/index.js';
import { decryptApiKey } from '../utils/encryption.js';
import { stripHtml } from '../utils/html.js';
import { tSync, getUILanguage } from '../locales.js';

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
export async function generateAbstract(content, title, apiKey, model, language = 'auto', updateState) {
  log('=== ABSTRACT GENERATION START ===', { title, contentItems: content?.length, language });
  
  if (!content || content.length === 0) {
    logWarn('No content for abstract generation');
    return '';
  }
  
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for abstract generation, using as-is', error);
  }
  
  // Extract text content (skip code, images, etc.)
  let articleText = '';
  for (const item of content) {
    if (item.type === 'code') continue; // Skip code blocks
    if (item.type === 'image') continue; // Skip images
    
    if (item.text) {
      // Strip HTML tags for cleaner text
      const text = stripHtml(item.text);
      if (text && text.trim()) {
        articleText += text.trim() + '\n\n';
      }
    }
    
    if (item.items && Array.isArray(item.items)) {
      for (const listItem of item.items) {
        if (typeof listItem === 'string') {
          articleText += listItem.trim() + '\n';
        } else if (listItem && listItem.html) {
          const text = stripHtml(listItem.html);
          if (text && text.trim()) {
            articleText += text.trim() + '\n';
          }
        }
      }
      articleText += '\n';
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

  const systemPrompt = `You are an expert at creating concise text summaries. Generate a single paragraph (TL;DR) that captures the essence of the text.

STRICT REQUIREMENTS:
- ${langInstruction}
- Try to identify the most important ideas, theses of the text, find its fundamental essence.
- Completely avoid metadiscourse and evidential markers such as "the author thinks/writes/argues," "the article demonstrates," "the study shows." 
- Output EXACTLY ONE paragraph with 2-4 sentences
- The goal of a TL;DR to convey the essence of ideas directly, not to describe the process of their presentation or distance yourself from them through references to the author.
- NO line breaks, NO paragraph breaks - output as ONE continuous paragraph
- Start immediately with the summary content - no introductory phrases
- Never use phrases like "This article", "The article", "In summary", "To summarize", "The author", etc.
- Never use quotes or markdown formatting
- Never add explanations, greetings, or meta-commentary
- Output ONLY the summary as a single continuous block of text without any line breaks
- Focus on the core essence and key takeaways, no personal opinions
- Make it concise and to the point
- CRITICAL: The output must be a single paragraph with no line breaks or paragraph separators`;

  const userPrompt = `Article Title: ${title}

Article Content:
${articleText}

Generate the TL;DR:`;
  
  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let abstract = '';
    
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          // Translation quality is priority #1 - never reduce quality for cost savings
          // reasoning_effort: 'high' ensures best translation quality
          reasoning_effort: 'high'
        })
      });
      
      if (!response.ok) {
        const uiLang = await getUILanguage();
        if ([401, 403].includes(response.status)) {
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(response.status)));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', String(response.status)));
      }
      
      const result = await response.json();
      abstract = result.choices?.[0]?.message?.content?.trim() || '';
    } else if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': decryptedApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        })
      });
      
      if (!response.ok) {
        const uiLang = await getUILanguage();
        if ([401, 403].includes(response.status)) {
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(response.status)));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', String(response.status)));
      }
      
      const result = await response.json();
      abstract = result.content?.find(c => c.type === 'text')?.text?.trim() || '';
    } else if (provider === 'gemini') {
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': decryptedApiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: combinedPrompt }] }]
        })
      });
      
      if (!response.ok) {
        const uiLang = await getUILanguage();
        if ([401, 403].includes(response.status)) {
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(response.status)));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', String(response.status)));
      }
      
      const result = await response.json();
      abstract = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }
    
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
    logError('generateAbstract failed', error);
    // Don't throw - abstract generation is optional
    return '';
  }
}

/**
 * Generate summary for article content
 * @param {Object} data - {contentItems, apiKey, model, url, language}
 * @returns {Promise<Object>} {summary: string}
 */
export async function generateSummary(data) {
  const { contentItems, apiKey, model, url, language } = data;
  
  log('=== SUMMARY GENERATION START ===', { 
    url, 
    contentItemsCount: contentItems?.length || 0, 
    language,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  
  if (!contentItems || contentItems.length === 0) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorNoContentForSummary', uiLang));
  }
  
  if (!apiKey || !model) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorApiKeyRequiredForSummary', uiLang));
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
  let articleText = '';
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
          } else if (listItem && listItem.text) {
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
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorNoTextExtractedForSummary', uiLang));
  }
  
  const systemPrompt = `You are an expert at creating summaries. Generate a summary of the text content in Markdown format.

Task: Summarize and summarize the main points, themes, key points, ideas, and concepts. Try to retell the key points as closely as possible to the meaning contained in the text. However, your goal is to formulate everything clearly, concisely, and concisely, so that it is understandable to anyone without context.

This should be a clear retelling of the most important things. Try to make it clear and understandable.

When creating summaries, present ideas and arguments directly, as if explaining the content in your own words. Completely avoid metadiscourse and evidential markers such as "the author thinks/writes/argues," "the article demonstrates," "the study shows." Simply state the theses and facts directly. For example, instead of "The author argues that inflation is overstated," write "Inflation is overstated due to how CPI is calculated." Instead of "In the author's opinion, this doesn't explain the situation," write "This doesn't explain the situation" or "This explanation is unconvincing because..." The goal of a summary is to convey the essence of ideas directly, not to describe the process of their presentation or distance yourself from them through references to the author.

STRICT REQUIREMENTS:
- Write EXCLUSIVELY in ${langName} language
- Include all key points and important information
- Make it comprehensive but concise
- Don't write a "Summary" or any other introductions, get straight to the point.
- Output ONLY the summary content - no introductory phrases or meta-commentary
- IMPORTANT: The summary MUST be written in ${langName}, regardless of the article's original language`;

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
    
    const summary = await callAI(systemPrompt, userPrompt, apiKey, model, false); // false = text response, not JSON
    
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
    logError('=== generateSummary FUNCTION ERROR ===', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: Date.now()
    });
    throw error;
  }
}

