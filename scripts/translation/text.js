// Text translation module for ClipAIble extension
// Handles translation of text content, batches, and metadata

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').ExtractionResult} ExtractionResult

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG, LANGUAGE_NAMES, NO_TRANSLATION_MARKER } from '../utils/config.js';
import { getProviderFromModel, parseModelConfig } from '../api/index.js';
import { getDecryptedKeyCached, decryptApiKey } from '../utils/encryption.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { tSync, getUILanguage } from '../locales.js';
import { sanitizePromptInput } from '../utils/security.js';
import { cleanAuthor } from '../utils/author-validator.js';
import { handleError } from '../utils/error-handler.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { callWithRetry } from '../utils/retry.js';

// Translation policy: quality-first. Do not downgrade accuracy to save cost or latency.

/**
 * Translate single text to target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language name
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<string>} Translated text
 */
export async function translateText(text, targetLang, apiKey, model) {
  const textPreview = text && text.length > 200 ? text.substring(0, 200) + '...' : text;
  log('=== translateText: ENTRY ===', {
    textLength: text?.length || 0,
    textPreview,
    targetLang,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  
  // Get provider from model for automatic encryption
  const provider = getProviderFromModel(model);
  
  // Decrypt API key if needed (with automatic encryption for unencrypted keys)
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await getDecryptedKeyCached(apiKey, provider);
  } catch (error) {
    log('API key decryption failed for translateText, using as-is', error);
  }
  
  const systemPrompt = `Translate the given text to ${targetLang}. Output ONLY the translation, nothing else.

CRITICAL RULES:
- Translate ONLY the exact text provided - do NOT add any content that is not in the original text
- Do NOT generate descriptions, examples, or additional information
- Do NOT expand on the topic or add context
- If text is already in ${targetLang}, output exactly: ${NO_TRANSLATION_MARKER}
- Preserve ALL HTML tags exactly (<a href="...">, <strong>, <em>, etc.)
- Do NOT translate URLs, code, or HTML attributes
- Use natural ${targetLang} expressions and sentence structures
- Maintain the author's tone (formal/casual/technical)
- No explanations, no notes, no comments, no additional content - just the translated text
- If the input is a title or short phrase, translate ONLY that title/phrase, nothing more`;

  // Clean HTML: remove id attributes and technical classes before translation
  // IDs and technical classes (like blockquote_*) are not needed for translation and can confuse AI models
  let cleanedText = text;
  if (typeof text === 'string' && text.includes('<')) {
    // Remove id attributes from all HTML tags
    cleanedText = cleanedText.replace(/\s+id\s*=\s*["'][^"']*["']/gi, '');
    cleanedText = cleanedText.replace(/\s+id\s*=\s*[^\s>]+/gi, '');
    
    // Remove technical classes (blockquote_*, etc.) that are used for styling but not content
    // These classes often contain random hashes that confuse AI models
    // First, remove empty span elements with technical classes (they serve no semantic purpose)
    cleanedText = cleanedText.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*>\s*<\/span>/gi, '');
    cleanedText = cleanedText.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*><\/span>/gi, '');
    
    // Then remove blockquote_* classes from remaining elements
    cleanedText = cleanedText.replace(/\s+class\s*=\s*["']([^"']*blockquote_[^"']*)["']/gi, (match, classValue) => {
      // Remove blockquote_* classes but keep other classes if any
      const classes = classValue.split(/\s+/).filter(c => !c.startsWith('blockquote_'));
      return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
    });
    
    // Remove span elements that have only technical classes (even if they have content, they're just styling wrappers)
    cleanedText = cleanedText.replace(/<span\s+class\s*=\s*["']blockquote_[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1');
  }
  
  // SECURITY: Sanitize user input to prevent prompt injection
  const userPrompt = sanitizePromptInput(cleanedText);
  
  const systemPromptPreview = systemPrompt.length > 300 ? systemPrompt.substring(0, 300) + '...' : systemPrompt;
  const userPromptPreview = userPrompt.length > 300 ? userPrompt.substring(0, 300) + '...' : userPrompt;
  log('=== translateText: PROMPT PREPARED ===', {
    systemPromptLength: systemPrompt.length,
    systemPromptPreview,
    userPromptLength: userPrompt.length,
    userPromptPreview,
    provider,
    timestamp: Date.now()
  });
  
  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let translated;
    
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
        // Normalize HTTP error with context
        const httpError = new Error(`Translation API error: HTTP ${response.status}`);
        // @ts-ignore - Adding status to error
        httpError.status = response.status;
        const normalized = await handleError(httpError, {
          source: 'translation',
          errorType: 'apiError',
          logError: true,
          createUserMessage: false, // Keep existing localized message
          context: {
            operation: 'translateText',
            provider: 'openai',
            model: modelName,
            statusCode: response.status
          }
        });
        
        const uiLang = await getUILanguage();
        let userMessage;
        if ([401, 403].includes(response.status)) {
          userMessage = tSync('errorApiAuthentication', uiLang).replace('{status}', String(response.status));
        } else {
          userMessage = tSync('errorApiError', uiLang).replace('{status}', String(response.status));
        }
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.status = response.status;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
      
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content || text;
      
      log('=== translateText: OpenAI RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
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
          max_tokens: 32000,
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
      translated = result.content?.find(c => c.type === 'text')?.text || text;
      
      log('=== translateText: Claude RESPONSE ===', {
        hasResult: !!result,
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
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
      translated = result.candidates?.[0]?.content?.parts?.[0]?.text || text;
      
      log('=== translateText: Gemini RESPONSE ===', {
        hasResult: !!result,
        hasCandidates: !!result.candidates,
        candidatesLength: result.candidates?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
    } else if (provider === 'grok') {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
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
      translated = result.choices?.[0]?.message?.content || text;
      
      log('=== translateText: Grok RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
    } else if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
      translated = result.choices?.[0]?.message?.content || text;
      
      log('=== translateText: DeepSeek RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
    } else if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: CONFIG.MAX_TOKENS_OPENROUTER
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
      translated = result.choices?.[0]?.message?.content || text;
      
      log('=== translateText: OpenRouter RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        isOriginal: translated === text,
        timestamp: Date.now()
      });
    } else {
      translated = text;
    }
    
    // If AI says no translation needed, return original text
    if (translated.trim() === NO_TRANSLATION_MARKER) {
      log('=== translateText: AI SAYS NO TRANSLATION NEEDED ===', {
        marker: NO_TRANSLATION_MARKER,
        returningOriginal: true
      });
      log('=== translateText: RESULT ===', {
        translated: text,
        translatedLength: text.length,
        wasTranslated: false,
        reason: 'already in target language'
      });
      return text;
    }
    
    // CRITICAL: If translation is much longer than original, it likely contains hallucinated content
    // For titles and short phrases, the translation should be similar length
    // If translation is more than 3x longer, it's likely hallucinated - use original or truncate
    const isTitleOrShortPhrase = text.length < 200 && !text.includes('\n');
    if (isTitleOrShortPhrase && translated.length > text.length * 3) {
      logWarn('Translation is suspiciously long for a title/short phrase - likely hallucinated', {
        originalLength: text.length,
        translatedLength: translated.length,
        ratio: translated.length / text.length,
        original: text,
        translatedPreview: translated.substring(0, 200)
      });
      // Try to extract just the first sentence or line, which should be the actual translation
      const firstLine = translated.split('\n')[0].trim();
      const firstSentence = translated.split(/[.!?]/)[0].trim();
      // Use the shorter of the two, but only if it's reasonable (not too short, not too long)
      const candidate = firstLine.length < firstSentence.length ? firstLine : firstSentence;
      if (candidate.length >= text.length * 0.5 && candidate.length <= text.length * 2) {
        log('Using extracted first line/sentence as translation', {
          extracted: candidate,
          extractedLength: candidate.length
        });
        translated = candidate;
      } else {
        // If extraction doesn't work, just return original - better than hallucinated content
        logWarn('Extraction failed, using original text to avoid hallucinated content');
        translated = text;
      }
    }
    
    // Clean technical classes from translated text (AI might include them)
    if (typeof translated === 'string' && translated.includes('<')) {
      // Remove id attributes
      translated = translated.replace(/\s+id\s*=\s*["'][^"']*["']/gi, '');
      translated = translated.replace(/\s+id\s*=\s*[^\s>]+/gi, '');
      
      // Remove empty span elements with technical classes
      translated = translated.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*>\s*<\/span>/gi, '');
      translated = translated.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*><\/span>/gi, '');
      
      // Remove blockquote_* classes from remaining elements
      translated = translated.replace(/\s+class\s*=\s*["']([^"']*blockquote_[^"']*)["']/gi, (match, classValue) => {
        const classes = classValue.split(/\s+/).filter(c => !c.startsWith('blockquote_'));
        return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
      });
      
      // Remove span elements that have only technical classes
      translated = translated.replace(/<span\s+class\s*=\s*["']blockquote_[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1');
    }
    
    // Log only metadata to reduce log size
    const originalPreview = text.length > 200 ? text.substring(0, 200) + '...' : text;
    const translatedPreview = translated.length > 200 ? translated.substring(0, 200) + '...' : translated;
    log('=== translateText: RESULT ===', {
      originalLength: text.length,
      originalPreview,
      translatedLength: translated.length,
      translatedPreview,
      wasTranslated: translated !== text,
      timestamp: Date.now()
    });
    
    return translated;
  } catch (error) {
    // Normalize error with context for better logging and error tracking
    const normalized = await handleError(error, {
      source: 'translation',
      errorType: 'translateTextFailed',
      logError: true,
      createUserMessage: false, // Keep existing behavior - return original text on non-auth errors
      context: {
        operation: 'translateText',
        targetLang,
        textLength: text?.length || 0,
        isAuthError: error.message?.includes('authentication') || error.message?.includes('401') || error.message?.includes('403')
      }
    });
    
    // Don't silently return original text on authentication errors
    if (normalized.context.isAuthError || error.message?.includes('authentication')) {
      // Re-throw normalized auth error
      /** @type {import('../types.js').ExtendedError} */
      const authError = new Error(error.message || normalized.message);
      authError.code = normalized.code;
      authError.originalError = normalized.originalError;
      authError.context = normalized.context;
      throw authError;
    }
    // Return original text for non-auth errors (existing behavior)
    return text;
  }
}

/**
 * Translate batch of texts
 * @param {Array<string>} texts - Texts to translate
 * @param {string} targetLang - Target language name
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<Array<string>>} Translated texts
 */
export async function translateBatch(texts, targetLang, apiKey, model) {
  log('=== translateBatch: ENTRY ===', {
    textsCount: texts?.length || 0,
    textsLengths: texts?.map(t => t?.length || 0) || [],
    textsFull: texts || [], // FULL TEXTS - NO TRUNCATION
    targetLang,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for translateBatch, using as-is', error);
  }
  
  // If only one text, use simple translation
  if (texts.length === 1) {
    log('=== translateBatch: SINGLE TEXT, USING translateText ===');
    const result = await translateText(texts[0], targetLang, decryptedApiKey, model);
    log('=== translateBatch: RESULT ===', {
      resultsCount: 1,
      resultLength: result.length,
      resultFull: result, // FULL TEXT - NO TRUNCATION
      wasTranslated: result !== texts[0],
      timestamp: Date.now()
    });
    return [result];
  }
  
  const systemPrompt = `Translate all texts to ${targetLang}. Return JSON only.

Rules:
- If a text is already in ${targetLang}, use "${NO_TRANSLATION_MARKER}" for that item
- Preserve ALL HTML tags exactly (<a href="...">, <strong>, <em>, etc.)
- Do NOT translate URLs, code, or HTML attributes
- Use natural ${targetLang} expressions
- Return EXACTLY ${texts.length} translations in the same order
- Output format: {"translations": ["translation1", "translation2", ...]}
- No markdown, no code blocks, no explanations - raw JSON only`;

  // Clean HTML: remove id attributes and technical classes before translation
  // IDs and technical classes (like blockquote_*) are not needed for translation and can confuse AI models
  const cleanedTexts = texts.map(text => {
    if (typeof text === 'string' && text.includes('<')) {
      // Remove id attributes from all HTML tags
      let cleaned = text.replace(/\s+id\s*=\s*["'][^"']*["']/gi, '');
      cleaned = cleaned.replace(/\s+id\s*=\s*[^\s>]+/gi, '');
      
      // Remove technical classes (blockquote_*, etc.) that are used for styling but not content
      // These classes often contain random hashes that confuse AI models
      // First, remove empty span elements with technical classes (they serve no semantic purpose)
      cleaned = cleaned.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*>\s*<\/span>/gi, '');
      cleaned = cleaned.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*><\/span>/gi, '');
      
      // Then remove blockquote_* classes from remaining elements
      cleaned = cleaned.replace(/\s+class\s*=\s*["']([^"']*blockquote_[^"']*)["']/gi, (match, classValue) => {
        // Remove blockquote_* classes but keep other classes if any
        const classes = classValue.split(/\s+/).filter(c => !c.startsWith('blockquote_'));
        return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
      });
      
      // Remove span elements that have only technical classes (even if they have content, they're just styling wrappers)
      cleaned = cleaned.replace(/<span\s+class\s*=\s*["']blockquote_[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1');
      
      return cleaned;
    }
    return text;
  });
  
  // SECURITY: Sanitize each text to prevent prompt injection
  const sanitizedTexts = cleanedTexts.map(text => sanitizePromptInput(text));
  const userPrompt = `Translate to ${targetLang}:\n${JSON.stringify(sanitizedTexts)}`;
  
  log('=== translateBatch: PROMPT PREPARED ===', {
    systemPromptLength: systemPrompt.length,
    systemPromptFull: systemPrompt, // FULL PROMPT - NO TRUNCATION
    userPromptLength: userPrompt.length,
    userPromptFull: userPrompt, // FULL PROMPT - NO TRUNCATION
    textsCount: texts.length,
    timestamp: Date.now()
  });
  
  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let content;
    
    if (provider === 'openai') {
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              response_format: { type: 'json_object' },
              // Translation quality is priority #1 - never reduce quality for cost savings
              // reasoning_effort: 'high' ensures best translation quality
              reasoning_effort: 'high'
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              let errorData = {};
              try {
                errorData = await fetchResponse.json();
              } catch (e) {
                // If JSON parse fails, use empty object
                errorData = {};
              }
              
              const httpError = new Error(`Translation API error: HTTP ${fetchResponse.status}`);
              // @ts-ignore - Adding status to error
              httpError.status = fetchResponse.status;
              // @ts-ignore
              httpError.response = fetchResponse;
              const normalized = await handleError(httpError, {
                source: 'translation',
                errorType: 'apiError',
                logError: true,
                createUserMessage: false,
                context: {
                  operation: 'translateBatch',
                  provider: 'openai',
                  model: modelName,
                  statusCode: fetchResponse.status,
                  errorData
                }
              });
              
              const uiLang = await getUILanguage();
              const userMessage = tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status));
              const error = new Error(userMessage);
              // @ts-ignore
              error.code = normalized.code;
              // @ts-ignore
              error.status = fetchResponse.status;
              // @ts-ignore
              error.originalError = normalized.originalError;
              // @ts-ignore
              error.context = normalized.context;
              throw error;
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            // Use default retry logic for other errors
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.choices?.[0]?.message?.content;
      
      log('=== translateBatch: OpenAI RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        contentLength: content?.length || 0,
        contentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'claude') {
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': decryptedApiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
              model: modelName,
              max_tokens: 32000,
              system: systemPrompt,
              messages: [
                { role: 'user', content: userPrompt }
              ]
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              const uiLang = await getUILanguage();
              throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status)));
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.content?.find(c => c.type === 'text')?.text;
      
      log('=== translateBatch: Claude RESPONSE ===', {
        hasResult: !!result,
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        extractedContentLength: content?.length || 0,
        extractedContentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'gemini') {
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': decryptedApiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: combinedPrompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              const uiLang = await getUILanguage();
              throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status)));
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      log('=== translateBatch: Gemini RESPONSE ===', {
        hasResult: !!result,
        hasCandidates: !!result.candidates,
        candidatesLength: result.candidates?.length || 0,
        extractedContentLength: content?.length || 0,
        extractedContentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'grok') {
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch('https://api.x.ai/v1/chat/completions', {
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
              response_format: { type: 'json_object' }
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              const uiLang = await getUILanguage();
              throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status)));
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.choices?.[0]?.message?.content;
      
      log('=== translateBatch: Grok RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        contentLength: content?.length || 0,
        contentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'deepseek') {
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
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
              response_format: { type: 'json_object' }
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              const uiLang = await getUILanguage();
              throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status)));
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.choices?.[0]?.message?.content;
      
      log('=== translateBatch: DeepSeek RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        contentLength: content?.length || 0,
        contentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'openrouter') {
      const response = await callWithRetry(
        async () => {
          const fetchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${decryptedApiKey}`,
              'HTTP-Referer': 'https://github.com/clipaiable',
              'X-Title': 'ClipAIble'
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              response_format: { type: 'json_object' }
            })
          });
          
          if (!fetchResponse.ok) {
            // Don't retry on authentication errors (401, 403)
            if ([401, 403].includes(fetchResponse.status)) {
              const uiLang = await getUILanguage();
              throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', String(fetchResponse.status)));
            }
            
            // For retryable errors, throw error with status for retry logic
            /** @type {Error & {status?: number, response?: Response}} */
            const error = new Error(`HTTP ${fetchResponse.status}`);
            error.status = fetchResponse.status;
            error.response = fetchResponse;
            throw error;
          }
          
          return fetchResponse;
        },
        {
          maxRetries: CONFIG.RETRY_MAX_ATTEMPTS,
          delays: CONFIG.TRANSLATION_RETRY_DELAYS,
          retryableStatusCodes: CONFIG.RETRYABLE_STATUS_CODES,
          shouldRetry: (error) => {
            // Don't retry on authentication errors
            if (error.status && [401, 403].includes(error.status)) {
              return false;
            }
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Translation API retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      );
      
      const result = await response.json();
      content = result.choices?.[0]?.message?.content;
      
      log('=== translateBatch: OpenRouter RESPONSE ===', {
        hasResult: !!result,
        hasChoices: !!result.choices,
        choicesLength: result.choices?.length || 0,
        contentLength: content?.length || 0,
        contentFull: content || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    }
    
    log('=== translateBatch: RAW RESPONSE ===', { 
      contentLength: content?.length, 
      contentFull: content || null, // FULL TEXT - NO TRUNCATION
      timestamp: Date.now()
    });
    
    if (!content) {
      logWarn('No content in translation response');
      return texts;
    }
    
    let parsed;
    try {
      let jsonContent = content.trim();
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
      }
      
      // Try to extract JSON object from the beginning if there's extra text after
      // This handles cases where AI adds reasoning or explanations after JSON
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      }
      
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      logError('Failed to parse translation JSON', { error: parseError.message });
      return texts;
    }
    
    // Process translation results
    function processTranslationResult(translatedTexts, originalTexts) {
      const result = [];
      let skippedCount = 0;
      
      for (let i = 0; i < originalTexts.length; i++) {
        let translated = translatedTexts[i];
        
        // Clean technical classes from translated text (AI might include them)
        if (typeof translated === 'string' && translated.includes('<')) {
          // Remove id attributes
          translated = translated.replace(/\s+id\s*=\s*["'][^"']*["']/gi, '');
          translated = translated.replace(/\s+id\s*=\s*[^\s>]+/gi, '');
          
          // Remove empty span elements with technical classes
          translated = translated.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*>\s*<\/span>/gi, '');
          translated = translated.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*><\/span>/gi, '');
          
          // Remove blockquote_* classes from remaining elements
          translated = translated.replace(/\s+class\s*=\s*["']([^"']*blockquote_[^"']*)["']/gi, (match, classValue) => {
            const classes = classValue.split(/\s+/).filter(c => !c.startsWith('blockquote_'));
            return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
          });
          
          // Remove span elements that have only technical classes
          translated = translated.replace(/<span\s+class\s*=\s*["']blockquote_[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1');
        }
        
        if (!translated || translated.trim() === NO_TRANSLATION_MARKER) {
          result.push(originalTexts[i]);
          skippedCount++;
        } else {
          result.push(translated);
        }
      }
      
      if (skippedCount > 0) {
        log(`AI: ${skippedCount}/${originalTexts.length} texts already in target language`);
      }
      
      return result;
    }
    
    log('=== translateBatch: PARSING JSON ===', {
      hasParsed: !!parsed,
      parsedKeys: parsed ? Object.keys(parsed) : [],
      hasTranslations: !!parsed?.translations,
      translationsLength: parsed?.translations?.length || 0,
      expectedLength: texts.length,
      timestamp: Date.now()
    });
    
    if (parsed.translations && Array.isArray(parsed.translations)) {
      const translations = parsed.translations;
      
      if (translations.length === texts.length) {
        const result = processTranslationResult(translations, texts);
        log('=== translateBatch: RESULT ===', {
          resultsCount: result.length,
          resultsLengths: result.map(r => r?.length || 0),
          resultsFull: result, // FULL TEXTS - NO TRUNCATION
          wasTranslated: result.some((r, i) => r !== texts[i]),
          timestamp: Date.now()
        });
        return result;
      }
      
      // Count mismatch - graceful degradation, NOT a bug!
      // processTranslationResult will return original text when translated is null.
      // User gets partial translation rather than error. See systemPatterns.md.
      logWarn('=== translateBatch: COUNT MISMATCH ===', { expected: texts.length, got: translations.length });
      const paddedTranslations = [];
      for (let i = 0; i < texts.length; i++) {
        paddedTranslations.push(translations[i] || null);
      }
      const result = processTranslationResult(paddedTranslations, texts);
      log('=== translateBatch: RESULT (PADDED) ===', {
        resultsCount: result.length,
        resultsLengths: result.map(r => r?.length || 0),
        resultsFull: result, // FULL TEXTS - NO TRUNCATION
        wasTranslated: result.some((r, i) => r !== texts[i]),
        timestamp: Date.now()
      });
      return result;
    }
    
    // Fallback: try to find any array in response
    const values = Object.values(parsed);
    for (const val of values) {
      if (Array.isArray(val)) {
        log('=== translateBatch: USING FALLBACK ARRAY ===', {
          arrayLength: val.length,
          expectedLength: texts.length
        });
        const paddedTranslations = [];
        for (let i = 0; i < texts.length; i++) {
          paddedTranslations.push(val[i] || null);
        }
        const result = processTranslationResult(paddedTranslations, texts);
        log('=== translateBatch: RESULT (FALLBACK) ===', {
          resultsCount: result.length,
          resultsLengths: result.map(r => r?.length || 0),
          resultsFull: result, // FULL TEXTS - NO TRUNCATION
          wasTranslated: result.some((r, i) => r !== texts[i]),
          timestamp: Date.now()
        });
        return result;
      }
    }
    
    logWarn('=== translateBatch: NO TRANSLATIONS FOUND ===', {
      parsedKeys: Object.keys(parsed),
      returningOriginal: true
    });
    log('=== translateBatch: RESULT (ORIGINAL) ===', {
      resultsCount: texts.length,
      wasTranslated: false,
      timestamp: Date.now()
    });
    return texts;
  } catch (error) {
    logError('translateBatch failed', error);
    // Don't silently return original texts on authentication errors
    if (error.message?.includes('authentication') || (error.status && [401, 403].includes(error.status))) {
      throw error;
    }
    // For other errors, return original texts (graceful degradation)
    return texts;
  }
}

/**
 * Translate content items
 * @param {import('../types.js').ExtractionResult} result - Extraction result with content items
 * @param {string} targetLang - Target language name
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<import('../types.js').ExtractionResult>} Translated extraction result
 */
export async function translateContent(result, targetLang, apiKey, model, updateState) {
  log('=== translateContent: ENTRY ===', {
    targetLang,
    contentItemsCount: result.content?.length || 0,
    hasTitle: !!result.title,
    title: result.title,
    hasAuthor: !!result.author,
    author: result.author,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  
  if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
    log('=== translateContent: NO CONTENT ===', { returningOriginal: true });
    return result;
  }
  
  log('=== translateContent: CONTENT ===', {
    contentItems: result.content.map((item, idx) => ({
      index: idx,
      type: item.type,
      textPreview: (item.text || item.html || '').substring(0, 200) + '...',
      textLength: (item.text || item.html || '').length,
      hasHtml: !!item.html
    })),
    totalItems: result.content.length
  });

  // Decrypt API key if needed (for safety, in case it comes encrypted)
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    // If decryption fails, assume key is already plain text
    log('API key decryption failed, using as-is (may be plain text)', error);
  }

  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  
  // Translate title and author in parallel (they are independent)
  const translationPromises = [];
  
  if (result.title && result.title.trim()) {
    translationPromises.push(
      // Retry title translation if result is "404"
      callWithRetry(
        async () => {
          const translated = await translateText(result.title, langName, decryptedApiKey, model);
          
          // Check if translation result is exactly "404"
          if (translated.trim() === '404' && translated !== result.title) {
            logWarn('Title translation returned "404", will retry', {
              original: result.title,
              translated: translated
            });
            throw new Error('Translation returned "404"');
          }
          
          return translated;
        },
        {
          maxRetries: 2, // Retry up to 2 times (3 total attempts)
          delays: [1000, 2000], // Short delays for title retry
          retryableStatusCodes: [],
          shouldRetry: (error) => {
            // Retry if error message indicates error-like result
            if (error.message?.includes('error-like result')) {
              return true;
            }
            // Don't retry on authentication errors
            if (error.message?.includes('authentication') || error.status && [401, 403].includes(error.status)) {
              return false;
            }
            // Retry on network/API errors
            return undefined;
          },
          onRetry: (attempt, delay) => {
            logWarn(`Title translation retry attempt ${attempt}, waiting ${delay}ms...`);
          }
        }
      )
        .then(translated => {
          result.title = translated;
          return 'title';
        })
        .catch(error => {
          if (error.message?.includes('authentication')) {
            logError('Translation stopped: authentication error in title translation', error);
            throw error; // Re-throw auth errors to stop translation
          }
          logError('Title translation failed after retries, using original', error);
          return null; // Continue with original title
        })
    );
  }
  
  if (result.author && result.author.trim()) {
    // CRITICAL: Clean author BEFORE translation to avoid translating "anonymous" to anonymous variants
    // If author is already anonymous, don't translate it
    const cleanedAuthorBeforeTranslation = cleanAuthor(result.author);
    const shouldTranslateAuthor = cleanedAuthorBeforeTranslation && result.author;
    
    if (shouldTranslateAuthor) {
      translationPromises.push(
        translateText(result.author, langName, decryptedApiKey, model)
          .then(translated => {
            // CRITICAL: Clean translated author to remove any anonymous variants
            // Translation might convert anonymous variants to other language variants
            result.author = cleanAuthor(translated);
            log('Author translated and cleaned', { 
              original: result.author, 
              translated, 
              cleaned: result.author 
            });
            return 'author';
          })
          .catch(error => {
            logWarn('Author translation failed, using original', error);
            // Use cleaned original if translation fails
            result.author = cleanedAuthorBeforeTranslation;
            return null; // Continue with original author
          })
      );
    } else {
      // Author is anonymous, don't translate, just clean it
      result.author = cleanedAuthorBeforeTranslation;
      log('Author is anonymous, skipping translation', { 
        original: result.author, 
        cleaned: result.author 
      });
    }
  }
  
  // Wait for title and author translations to complete
  if (translationPromises.length > 0) {
    if (updateState) updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: 'Translating metadata...', progress: 18 });
    try {
      await Promise.all(translationPromises);
    } catch (error) {
      // If authentication error occurred, stop translation
      if (error.message?.includes('authentication')) {
        logError('Translation stopped: authentication error', error);
        throw error;
      }
      // Other errors are already handled in individual promises
    }
  }
  
  // Collect all text content (skip code blocks)
  const textItems = [];
  for (let i = 0; i < result.content.length; i++) {
    const item = result.content[i];
    
    // Skip code blocks - they should never be translated
    if (item.type === 'code') continue;
    
    if (item.text && item.text.trim()) {
      textItems.push({ index: i, field: 'text', text: item.text });
    }
    if (item.alt && item.type === 'image' && item.alt.trim()) {
      textItems.push({ index: i, field: 'alt', text: item.alt });
    }
    if (item.caption && item.type === 'image' && item.caption.trim()) {
      textItems.push({ index: i, field: 'caption', text: item.caption });
    }
    if (item.items && Array.isArray(item.items)) {
      for (let j = 0; j < item.items.length; j++) {
        const listItem = item.items[j];
        if (typeof listItem === 'string' && listItem.trim()) {
          textItems.push({ index: i, field: 'items', subIndex: j, text: listItem });
        } else if (listItem && typeof listItem === 'object' && listItem.html && listItem.html.trim()) {
          textItems.push({ index: i, field: 'items', subIndex: j, subField: 'html', text: listItem.html });
        }
      }
    }
  }
  
  log('Text items to translate', { count: textItems.length });
  
  if (textItems.length === 0) {
    log('No text items found to translate');
    return result;
  }
  
  // Split into chunks by character count
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  
  for (const item of textItems) {
    const itemSize = item.text.length;
    
    if (itemSize > CONFIG.TRANSLATION_CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
      }
      chunks.push([item]);
      continue;
    }
    
    if (currentSize + itemSize > CONFIG.TRANSLATION_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    
    currentChunk.push(item);
    currentSize += itemSize;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  const totalTextLength = textItems.reduce((sum, item) => sum + item.text.length, 0);
  const avgChunkSize = chunks.length > 0 ? Math.round(chunks.reduce((sum, chunk) => {
    return sum + chunk.reduce((chunkSum, item) => chunkSum + item.text.length, 0);
  }, 0) / chunks.length) : 0;
  const maxChunkSize = chunks.length > 0 ? Math.max(...chunks.map(chunk => {
    return chunk.reduce((sum, item) => sum + item.text.length, 0);
  })) : 0;
  const maxChunkUsage = Math.round((maxChunkSize / CONFIG.TRANSLATION_CHUNK_SIZE) * 100);
  
  log('📊 Translation chunks created', { 
    count: chunks.length,
    totalTextLength: totalTextLength,
    chunkSizeLimit: CONFIG.TRANSLATION_CHUNK_SIZE,
    avgChunkSize: avgChunkSize,
    maxChunkSize: maxChunkSize,
    maxChunkUsage: `${maxChunkUsage}%`,
    warning: maxChunkUsage > 90 ? '⚠️ Large chunks' : 'OK'
  });
  
  // Pre-calc weights for smoother progress: weight = sum of text lengths in chunk
  const chunkWeights = chunks.map(chunk => chunk.reduce((sum, item) => sum + item.text.length, 0));
  const totalWeight = chunkWeights.reduce((sum, w) => sum + w, 0) || 1;

  // Translate each chunk
  for (let i = 0; i < chunks.length; i++) {
    // Check if processing was cancelled before processing each chunk
    await checkCancellation(`text translation chunk ${i + 1}/${chunks.length}`);
    
    // Show progress BEFORE starting chunk translation (not after)
    // Range: 20% to 60% (text translation is the longest phase)
    const completedWeight = chunkWeights.slice(0, i).reduce((s, w) => s + w, 0);
    const progressPortion = (completedWeight / totalWeight) * 40;
    const progress = 20 + Math.floor(progressPortion);
    if (updateState) updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: `Translating ${i + 1}/${chunks.length}...`, progress });
    
    const chunk = chunks[i];
    const textsToTranslate = chunk.map(item => item.text);
    
    log(`Translating chunk ${i + 1}/${chunks.length}`, { itemCount: textsToTranslate.length });
    
    try {
      const translated = await translateBatch(textsToTranslate, langName, decryptedApiKey, model);
      
      // Check if translation actually happened (not just original texts returned)
      const wasTranslated = translated.some((text, idx) => text !== textsToTranslate[idx]);
      
      // Apply translations back
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        let translatedText = translated[j] || item.text;
        
        // Clean technical classes from translated text (AI might include them)
        if (typeof translatedText === 'string' && translatedText.includes('<')) {
          // Remove id attributes
          translatedText = translatedText.replace(/\s+id\s*=\s*["'][^"']*["']/gi, '');
          translatedText = translatedText.replace(/\s+id\s*=\s*[^\s>]+/gi, '');
          
          // Remove empty span elements with technical classes
          translatedText = translatedText.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*>\s*<\/span>/gi, '');
          translatedText = translatedText.replace(/<span\s+[^>]*class\s*=\s*["'][^"']*blockquote_[^"']*["'][^>]*><\/span>/gi, '');
          
          // Remove blockquote_* classes from remaining elements
          translatedText = translatedText.replace(/\s+class\s*=\s*["']([^"']*blockquote_[^"']*)["']/gi, (match, classValue) => {
            const classes = classValue.split(/\s+/).filter(c => !c.startsWith('blockquote_'));
            return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
          });
          
          // Remove span elements that have only technical classes
          translatedText = translatedText.replace(/<span\s+class\s*=\s*["']blockquote_[^"']*["'][^>]*>([^<]*)<\/span>/gi, '$1');
        }
        
        if (item.field === 'text') {
          result.content[item.index].text = translatedText;
        } else if (item.field === 'alt') {
          result.content[item.index].alt = translatedText;
        } else if (item.field === 'caption') {
          result.content[item.index].caption = translatedText;
        } else if (item.field === 'items') {
          if (item.subField === 'html') {
            const listItem = result.content[item.index].items[item.subIndex];
            if (listItem && typeof listItem === 'object') {
              listItem.html = translatedText;
            }
          } else {
            result.content[item.index].items[item.subIndex] = translatedText;
          }
        }
      }
      
      if (wasTranslated) {
        log(`Chunk ${i + 1} translated successfully`);
      } else {
        logWarn(`Chunk ${i + 1} returned original texts (translation may have failed)`);
      }
    } catch (error) {
      // Normalize error with context for better logging and error tracking
      const isAuthError = error.message?.includes('authentication') || 
                          error.message?.includes('401') || 
                          error.message?.includes('403') ||
                          (error.status && [401, 403].includes(error.status));
      
      const normalized = await handleError(error, {
        source: 'translation',
        errorType: 'translateChunkFailed',
        logError: true,
        createUserMessage: false, // Keep existing behavior
        context: {
          operation: 'translateContent',
          chunkIndex: i + 1,
          totalChunks: chunks.length,
          isAuthError,
          statusCode: error.status
        }
      });
      
      // If authentication error, stop translation and throw
      if (isAuthError) {
        /** @type {import('../types.js').ExtendedError} */
        const authError = new Error(error.message || normalized.message);
        authError.code = normalized.code;
        if (error.status) authError.status = error.status;
        authError.originalError = normalized.originalError;
        authError.context = normalized.context;
        throw authError;
      }
      // Continue with other chunks, but log the failure (existing behavior)
    }
  }
  
  log('=== translateContent: RESULT ===', {
    title: result.title,
    author: result.author,
    contentItemsCount: result.content?.length || 0,
    translatedItemsFull: result.content?.map((item, idx) => ({
      index: idx,
      type: item.type,
      text: item.text || item.html || '', // FULL TEXT - NO TRUNCATION
      textLength: (item.text || item.html || '').length,
      html: item.html || null // FULL HTML - NO TRUNCATION
    })) || [],
    timestamp: Date.now()
  });
  
  log('=== TRANSLATION END ===');
  // Ensure progress reaches the end of translation phase
  if (updateState) updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: 'Translation complete', progress: 60 });
  return result;
}

/**
 * Translate metadata (author, date, etc.)
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} [type='author'] - Type of metadata ('author' or 'date')
 * @returns {Promise<string>} Translated metadata
 */
export async function translateMetadata(text, targetLang, apiKey, model, type = 'author') {
  log('=== translateMetadata: ENTRY ===', {
    text,
    textLength: text?.length || 0,
    targetLang,
    type,
    model,
    hasApiKey: !!apiKey,
    timestamp: Date.now()
  });
  if (!text || !apiKey || targetLang === 'auto') return text;
  
  // Get provider from model for automatic encryption
  const provider = getProviderFromModel(model);
  
  // Decrypt API key if needed (with automatic encryption for unencrypted keys)
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await getDecryptedKeyCached(apiKey, provider);
  } catch (error) {
    log('API key decryption failed for metadata translation, using as-is', error);
  }
  
  const targetLangName = LANGUAGE_NAMES[targetLang] || 'English';
  
  let systemPrompt;
  if (type === 'date') {
    const dateExamples = {
      'en': 'December 3, 2025',
      'ru': '3 декабря 2025',
      'ua': '3 грудня 2025',
      'de': '3. Dezember 2025',
      'fr': '3 décembre 2025',
      'es': '3 de diciembre de 2025',
      'it': '3 dicembre 2025',
      'pt': '3 de dezembro de 2025',
      'zh': '2025年12月3日',
      'ja': '2025年12月3日',
      'ko': '2025년 12월 3일'
    };
    const example = dateExamples[targetLang] || dateExamples['en'];
    systemPrompt = `Translate this date to ${targetLangName}.
Return ONLY the translated date, nothing else.
Example output for ${targetLangName}: "${example}"`;
  } else {
    systemPrompt = `Transliterate this author name(s) to ${targetLangName} script if needed.

Rules:
- Transliterate names between scripts (Андрей Пешков → Andrey Peshkov for Latin, John Smith → Джон Сміт for Ukrainian)
- IMPORTANT: Translate connector words to ${targetLangName}: "and" → target language equivalent (e.g., "and" → "та" for Ukrainian, "и" for Russian, "und" for German, "et" for French)
- If name already uses target script: keep name but still translate connector words
- Output ONLY the result, nothing else
- No explanations, no labels, no "Author:", no placeholders`;
  }
  
  try {
    const { modelName } = parseModelConfig(model);
    let translated;
    
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
            { role: 'user', content: text }
          ]
        })
      });
      
      if (!response.ok) {
        log('=== translateMetadata: OpenAI ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content?.trim();
      log('=== translateMetadata: OpenAI RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
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
          max_tokens: 256,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }]
        })
      });
      
      if (!response.ok) {
        log('=== translateMetadata: Claude ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.content?.find(c => c.type === 'text')?.text?.trim();
      log('=== translateMetadata: Claude RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'gemini') {
      const combinedPrompt = `${systemPrompt}\n\n${text}`;
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
        log('=== translateMetadata: Gemini ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      log('=== translateMetadata: Gemini RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'grok') {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ]
        })
      });
      
      if (!response.ok) {
        log('=== translateMetadata: Grok ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content?.trim() || text;
      log('=== translateMetadata: Grok RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ]
        })
      });
      
      if (!response.ok) {
        log('=== translateMetadata: DeepSeek ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content?.trim() || text;
      log('=== translateMetadata: DeepSeek RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    } else if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          max_tokens: CONFIG.MAX_TOKENS_OPENROUTER
        })
      });
      
      if (!response.ok) {
        log('=== translateMetadata: OpenRouter ERROR ===', { status: response.status, returningOriginal: true });
        return text;
      }
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content?.trim() || text;
      log('=== translateMetadata: OpenRouter RESPONSE ===', {
        hasResult: !!result,
        translatedLength: translated?.length || 0,
        translatedFull: translated || null, // FULL TEXT - NO TRUNCATION
        timestamp: Date.now()
      });
    }
    
    const result = translated || text;
    log('=== translateMetadata: RESULT ===', {
      original: text,
      translated: result,
      originalLength: text.length,
      translatedLength: result.length,
      wasTranslated: result !== text,
      type,
      timestamp: Date.now()
    });
    return result;
  } catch (e) {
    log('=== translateMetadata: ERROR ===', { error: e.message, errorStack: e.stack, returningOriginal: true });
    log('=== translateMetadata: RESULT ===', {
      original: text,
      translated: text,
      wasTranslated: false,
      type,
      error: e.message,
      timestamp: Date.now()
    });
    return text;
  }
}

