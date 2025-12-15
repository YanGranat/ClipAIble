// Translation module for ClipAIble extension

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG, LANGUAGE_NAMES, NO_TRANSLATION_MARKER } from '../utils/config.js';
import { getProviderFromModel, parseModelConfig } from '../api/index.js';
import { translateImageWithGemini } from '../api/gemini.js';
import { imageToBase64 } from '../utils/images.js';
import { decryptApiKey } from '../utils/encryption.js';
import { stripHtml } from '../utils/html.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { tSync, getUILanguage } from '../locales.js';

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
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for translateText, using as-is', error);
  }
  
  const systemPrompt = `Translate the given text to ${targetLang}. Output ONLY the translation, nothing else.

Rules:
- If text is already in ${targetLang}, output exactly: ${NO_TRANSLATION_MARKER}
- Preserve ALL HTML tags exactly (<a href="...">, <strong>, <em>, etc.)
- Do NOT translate URLs, code, or HTML attributes
- Use natural ${targetLang} expressions and sentence structures
- Maintain the author's tone (formal/casual/technical)
- No explanations, no notes, no comments - just the translated text`;

  const userPrompt = text;
  
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
        const uiLang = await getUILanguage();
        if ([401, 403].includes(response.status)) {
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content || text;
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
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      translated = result.content?.find(c => c.type === 'text')?.text || text;
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
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      translated = result.candidates?.[0]?.content?.parts?.[0]?.text || text;
    } else {
      translated = text;
    }
    
    // If AI says no translation needed, return original text
    if (translated.trim() === NO_TRANSLATION_MARKER) {
      log('AI: text already in target language, using original');
      return text;
    }
    
    return translated;
  } catch (error) {
    logError('translateText failed', error);
    // Don't silently return original text on authentication errors
    if (error.message?.includes('authentication')) {
      throw error;
    }
    return text;
  }
}

/**
 * Translate batch of texts
 * @param {Array<string>} texts - Texts to translate
 * @param {string} targetLang - Target language name
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {number} retryCount - Retry attempt counter
 * @returns {Promise<Array<string>>} Translated texts
 */
export async function translateBatch(texts, targetLang, apiKey, model, retryCount = 0) {
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for translateBatch, using as-is', error);
  }
  
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 10000, 20000];
  
  // If only one text, use simple translation
  if (texts.length === 1) {
    const result = await translateText(texts[0], targetLang, decryptedApiKey, model);
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

  const userPrompt = `Translate to ${targetLang}:\n${JSON.stringify(texts)}`;
  
  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let content;
    
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
          response_format: { type: 'json_object' },
          // Translation quality is priority #1 - never reduce quality for cost savings
          // reasoning_effort: 'high' ensures best translation quality
          reasoning_effort: 'high'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Don't retry on authentication errors (401, 403)
        const uiLang = await getUILanguage();
        if ([401, 403].includes(response.status)) {
          logError('Translation API authentication error', { status: response.status, error: errorData });
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        
        logError('Translation API error', { status: response.status, error: errorData });
        
        if ([503, 429, 500, 502, 504].includes(response.status) && retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount] || 20000;
          logWarn(`Translation API returned ${response.status}, retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return translateBatch(texts, targetLang, apiKey, model, retryCount + 1);
        }
        
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      content = result.choices?.[0]?.message?.content;
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
        if ([503, 429, 500, 502, 504].includes(response.status) && retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount] || 20000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return translateBatch(texts, targetLang, apiKey, model, retryCount + 1);
        }
        const uiLang = await getUILanguage();
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      content = result.content?.find(c => c.type === 'text')?.text;
    } else if (provider === 'gemini') {
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
      
      if (!response.ok) {
        if ([503, 429, 500, 502, 504].includes(response.status) && retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAYS[retryCount] || 20000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return translateBatch(texts, targetLang, apiKey, model, retryCount + 1);
        }
        const uiLang = await getUILanguage();
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
      }
      
      const result = await response.json();
      content = result.candidates?.[0]?.content?.parts?.[0]?.text;
    }
    
    log('Translation response', { contentLength: content?.length, preview: content?.substring(0, 100) });
    
    if (!content) {
      logWarn('No content in translation response');
      return texts;
    }
    
    let parsed;
    try {
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1].trim();
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
        const translated = translatedTexts[i];
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
    
    if (parsed.translations && Array.isArray(parsed.translations)) {
      const translations = parsed.translations;
      
      if (translations.length === texts.length) {
        return processTranslationResult(translations, texts);
      }
      
      // Count mismatch - graceful degradation, NOT a bug!
      // processTranslationResult will return original text when translated is null.
      // User gets partial translation rather than error. See systemPatterns.md.
      logWarn('Translation count mismatch', { expected: texts.length, got: translations.length });
      const paddedTranslations = [];
      for (let i = 0; i < texts.length; i++) {
        paddedTranslations.push(translations[i] || null);
      }
      return processTranslationResult(paddedTranslations, texts);
    }
    
    // Fallback: try to find any array in response
    const values = Object.values(parsed);
    for (const val of values) {
      if (Array.isArray(val)) {
        const paddedTranslations = [];
        for (let i = 0; i < texts.length; i++) {
          paddedTranslations.push(val[i] || null);
        }
        return processTranslationResult(paddedTranslations, texts);
      }
    }
    
    logWarn('Could not find translations array in response');
    return texts;
  } catch (error) {
    logError('translateBatch failed', error);
    // Don't silently return original texts on authentication errors
    if (error.message?.includes('authentication')) {
      throw error;
    }
    return texts;
  }
}

/**
 * Translate entire content result
 * @param {Object} result - Content result with title and content array
 * @param {string} targetLang - Target language code
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {Function} updateState - State update function
 * @returns {Promise<Object>} Translated result
 */
export async function translateContent(result, targetLang, apiKey, model, updateState) {
  log('=== TRANSLATION START ===', { targetLang, contentItems: result.content?.length });
  
  if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
    log('No content to translate');
    return result;
  }

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
      translateText(result.title, langName, decryptedApiKey, model)
        .then(translated => {
          result.title = translated;
          return 'title';
        })
        .catch(error => {
          if (error.message?.includes('authentication')) {
            logError('Translation stopped: authentication error in title translation', error);
            throw error; // Re-throw auth errors to stop translation
          }
          logError('Title translation failed, using original', error);
          return null; // Continue with original title
        })
    );
  }
  
  if (result.author && result.author.trim()) {
    translationPromises.push(
      translateText(result.author, langName, decryptedApiKey, model)
        .then(translated => {
          result.author = translated;
          log('Author translated', { translated: result.author });
          return 'author';
        })
        .catch(error => {
          logWarn('Author translation failed, using original', error);
          return null; // Continue with original author
        })
    );
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
        } else if (listItem && listItem.html && listItem.html.trim()) {
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
  
  log('Translation chunks created', { count: chunks.length });
  
  // Pre-calc weights for smoother progress: weight = sum of text lengths in chunk
  const chunkWeights = chunks.map(chunk => chunk.reduce((sum, item) => sum + item.text.length, 0));
  const totalWeight = chunkWeights.reduce((sum, w) => sum + w, 0) || 1;

  // Translate each chunk
  for (let i = 0; i < chunks.length; i++) {
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
        const translatedText = translated[j] || item.text;
        
        if (item.field === 'text') {
          result.content[item.index].text = translatedText;
        } else if (item.field === 'alt') {
          result.content[item.index].alt = translatedText;
        } else if (item.field === 'caption') {
          result.content[item.index].caption = translatedText;
        } else if (item.field === 'items') {
          if (item.subField === 'html') {
            result.content[item.index].items[item.subIndex].html = translatedText;
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
      // If authentication error, stop translation and throw
      if (error.message?.includes('authentication')) {
        logError(`Translation stopped: authentication error`, error);
        throw error;
      }
      logError(`Translation chunk ${i + 1} FAILED`, error);
      // Continue with other chunks, but log the failure
    }
  }
  
  log('=== TRANSLATION END ===');
  // Ensure progress reaches the end of translation phase
  if (updateState) updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: 'Translation complete', progress: 60 });
  return result;
}

/**
 * Detect source language from content
 * @param {Array} content - Content array
 * @returns {string} Language code: 'en', 'ru', 'ua', or 'unknown'
 */
export function detectSourceLanguage(content) {
  let allText = '';
  for (const item of content) {
    if (item.text) allText += item.text + ' ';
    if (item.alt) allText += item.alt + ' ';
  }
  
  const cyrillicCount = (allText.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (allText.match(/[a-zA-Z]/g) || []).length;
  const ukrainianChars = (allText.match(/[іїєґІЇЄҐ]/g) || []).length;
  const russianChars = (allText.match(/[ёыэЁЫЭ]/g) || []).length;
  
  const total = cyrillicCount + latinCount;
  if (total === 0) return 'unknown';
  
  if (cyrillicCount / total > 0.3) {
    if (ukrainianChars > russianChars * 2 || allText.includes('що') || allText.includes('які') || allText.includes('від')) {
      return 'ua';
    }
    return 'ru';
  }
  
  return 'en';
}

/**
 * Detect if image contains translatable text
 * @param {string} imageBase64 - Base64 image data
 * @param {string} targetLang - Target language
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<boolean>}
 */
export async function detectImageText(imageBase64, targetLang, apiKey, model) {
  log('detectImageText', { targetLang, model });
  
  const prompt = `Analyze this image. Does it contain meaningful text that is NOT in ${targetLang}?

Consider:
1. Does it contain readable text (not just logos, brand names, or decorative elements)?
2. Is the text meaningful content (captions, labels, diagrams, infographics)?
3. Is the text in a language OTHER than ${targetLang}?

Respond with ONLY "yes" or "no".`;

  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let answer;
    
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } }
              ]
            }
          ]
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      answer = data.choices?.[0]?.message?.content?.toLowerCase()?.trim();
    } else if (provider === 'claude') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return false;
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: matches[1], data: matches[2] } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      answer = data.content?.find(c => c.type === 'text')?.text?.toLowerCase()?.trim();
    } else if (provider === 'gemini') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return false;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: matches[1], data: matches[2] } }
            ]
          }]
        })
      });

      if (!response.ok) return false;
      const data = await response.json();
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase()?.trim();
    }
    
    log('detectImageText result', { answer });
    return answer === 'yes';
  } catch (error) {
    logError('detectImageText failed', error);
    return false;
  }
}

/**
 * Translate images in content
 * @param {Array} content - Content array
 * @param {string} sourceLang - Source language code
 * @param {string} targetLang - Target language code
 * @param {string} apiKey - API key
 * @param {string} googleApiKey - Google API key for image translation
 * @param {string} model - Model name
 * @param {Function} updateState - State update function
 * @returns {Promise<Array>} Content with translated images
 */
export async function translateImages(content, sourceLang, targetLang, apiKey, googleApiKey, model, updateState) {
  log('=== IMAGE TRANSLATION START ===', { sourceLang, targetLang });
  
  // Decrypt API keys if needed
  let decryptedApiKey = apiKey;
  let decryptedGoogleApiKey = googleApiKey;
  
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for image detection, using as-is', error);
  }
  
  if (googleApiKey) {
    try {
      decryptedGoogleApiKey = await decryptApiKey(googleApiKey);
    } catch (error) {
      log('Google API key decryption failed, using as-is', error);
    }
  }
  
  if (!decryptedGoogleApiKey) {
    logWarn('No Google API key provided, skipping image translation');
    return content;
  }
  
  const imageIndices = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'image' && content[i].src) {
      imageIndices.push(i);
    }
  }
  
  log('Found images to process', { count: imageIndices.length });
  
  if (imageIndices.length === 0) return content;
  
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  let translated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < imageIndices.length; i++) {
    const idx = imageIndices[i];
    const img = content[idx];
    
    if (updateState) {
      updateState({ 
        stage: PROCESSING_STAGES.TRANSLATING.id,
        status: `Analyzing image ${i + 1}/${imageIndices.length}...`, 
        progress: 10 + Math.floor((i / imageIndices.length) * 5) 
      });
    }
    
    try {
      let imageBase64 = img.src;
      if (!imageBase64.startsWith('data:')) {
        imageBase64 = await imageToBase64(img.src);
        if (!imageBase64) {
          logWarn(`Could not fetch image ${i + 1}`);
          failed++;
          continue;
        }
      }
      
      const needsTranslation = await detectImageText(imageBase64, langName, decryptedApiKey, model);
      
      if (!needsTranslation) {
        log(`Image ${i + 1} does not need translation`);
        skipped++;
        continue;
      }
      
      log(`Image ${i + 1} needs translation`);
      if (updateState) {
        updateState({ 
          stage: PROCESSING_STAGES.TRANSLATING.id,
          status: `Translating image ${i + 1}/${imageIndices.length}...`, 
          progress: 10 + Math.floor((i / imageIndices.length) * 5) 
        });
      }
      
      const translatedImage = await translateImageWithGemini(imageBase64, langName, decryptedGoogleApiKey);
      
      if (translatedImage) {
        content[idx].src = translatedImage;
        content[idx].translated = true;
        translated++;
        log(`Image ${i + 1} translated successfully`);
      } else {
        logWarn(`Image ${i + 1} translation failed, keeping original`);
        failed++;
      }
    } catch (error) {
      logError(`Error processing image ${i + 1}`, error);
      failed++;
    }
  }
  
  log('=== IMAGE TRANSLATION END ===', { translated, skipped, failed });
  return content;
}

/**
 * Translate metadata (author, date) to target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} type - 'author' or 'date'
 * @returns {Promise<string>} Translated text
 */
export async function translateMetadata(text, targetLang, apiKey, model, type = 'author') {
  if (!text || !apiKey || targetLang === 'auto') return text;
  
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
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
            { role: 'user', content: text }
          ]
        })
      });
      
      if (!response.ok) return text;
      const result = await response.json();
      translated = result.choices?.[0]?.message?.content?.trim();
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
      
      if (!response.ok) return text;
      const result = await response.json();
      translated = result.content?.find(c => c.type === 'text')?.text?.trim();
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
      
      if (!response.ok) return text;
      const result = await response.json();
      translated = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }
    
    return translated || text;
  } catch (e) {
    log('Metadata translation error', { error: e.message });
    return text;
  }
}

/**
 * Detect language from text using character analysis (offline fallback)
 * @param {string} text - Text to analyze
 * @returns {string} Language code (defaults to 'en' if uncertain)
 */
function detectLanguageByCharacters(text) {
  if (!text || text.length < 50) return 'en';
  
  // Count character types
  const cyrillicMatch = text.match(/[а-яёА-ЯЁ]/g) || [];
  const ukrainianMatch = text.match(/[іїєґІЇЄҐ]/g) || [];
  const latinMatch = text.match(/[a-zA-Z]/g) || [];
  const chineseMatch = text.match(/[\u4e00-\u9fff]/g) || [];
  const japaneseMatch = text.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || [];
  const koreanMatch = text.match(/[\uac00-\ud7af]/g) || [];
  const arabicMatch = text.match(/[\u0600-\u06ff]/g) || [];
  
  const totalLetters = cyrillicMatch.length + latinMatch.length + chineseMatch.length + 
                       japaneseMatch.length + koreanMatch.length + arabicMatch.length;
  
  if (totalLetters < 20) return 'en';
  
  // Check for specific scripts
  if (chineseMatch.length > totalLetters * 0.3) return 'zh';
  if (japaneseMatch.length > totalLetters * 0.2) return 'ja';
  if (koreanMatch.length > totalLetters * 0.3) return 'ko';
  if (arabicMatch.length > totalLetters * 0.3) return 'ar';
  
  // Cyrillic vs Latin
  const cyrillicRatio = cyrillicMatch.length / totalLetters;
  
  if (cyrillicRatio > 0.5) {
    // Cyrillic text - check for Ukrainian specific letters
    if (ukrainianMatch.length > 3) return 'ua';
    return 'ru';
  }
  
  return 'en';
}

/**
 * Detect content language using AI (primary), character analysis (fallback for offline)
 * @param {Array} content - Content array
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<string>} Detected language code (e.g., 'ru', 'en', 'ua')
 */
export async function detectContentLanguage(content, apiKey, model) {
  if (!content || content.length === 0) {
    return 'en';
  }
  
  // Extract sample text (up to 30k chars for accurate AI detection)
  let sampleText = '';
  for (const item of content) {
    if (item.text) {
      sampleText += stripHtml(item.text) + ' ';
      if (sampleText.length > 30000) break;
    }
  }
  
  sampleText = sampleText.trim();
  if (!sampleText) {
    return 'en';
  }
  
  // If no API key, use offline character-based detection
  if (!apiKey) {
    const lang = detectLanguageByCharacters(sampleText);
    log('Language detected by characters (no API key)', { langCode: lang });
    return lang;
  }
  
  // Decrypt API key if needed
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    log('API key decryption failed for detectContentLanguage, using as-is', error);
  }
  
  const systemPrompt = `You are a language detection agent. Your task is to identify the language of the provided text.

INSTRUCTIONS:
1. Read the text carefully
2. Determine what language the MAIN CONTENT is written in
3. Ignore any English words that might appear (like technical terms, names, URLs)
4. Return ONLY the ISO 639-1 two-letter language code

SUPPORTED CODES:
- ru = Russian (русский)
- ua = Ukrainian (українська)  
- en = English
- de = German (Deutsch)
- fr = French (français)
- es = Spanish (español)
- it = Italian (italiano)
- pt = Portuguese (português)
- zh = Chinese (中文)
- ja = Japanese (日本語)
- ko = Korean (한국어)
- ar = Arabic (العربية)
- pl = Polish (polski)
- nl = Dutch (Nederlands)
- tr = Turkish (Türkçe)

OUTPUT FORMAT: Return ONLY the 2-letter code, nothing else. No quotes, no explanation.

Example outputs: ru, en, ua, de`;
  
  // Use more text for AI analysis (30k chars for accurate detection)
  const textForAI = sampleText.substring(0, 30000);
  
  try {
    const provider = getProviderFromModel(model);
    const { modelName } = parseModelConfig(model);
    let langCode = null;
    
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
            { role: 'user', content: `Detect the language of this text:\n\n${textForAI}` }
          ],
          max_tokens: 10,
          temperature: 0
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        langCode = result.choices?.[0]?.message?.content?.trim().toLowerCase();
      }
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
          max_tokens: 10,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Detect the language of this text:\n\n${textForAI}` }]
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        langCode = result.content?.[0]?.text?.trim().toLowerCase();
      }
    } else if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${decryptedApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nDetect the language of this text:\n\n${textForAI}` }] }]
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        langCode = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
      }
    }
    
    // Validate language code (should be exactly 2 lowercase letters)
    if (langCode && /^[a-z]{2}$/.test(langCode)) {
      log('Language detected by AI', { langCode, provider });
      return langCode;
    }
    
    // AI returned invalid format, fallback to character analysis
    log('AI returned invalid language code, using character fallback', { aiResponse: langCode });
    const fallbackLang = detectLanguageByCharacters(sampleText);
    log('Language detected by characters (AI fallback)', { langCode: fallbackLang });
    return fallbackLang;
  } catch (error) {
    // API error - fallback to character-based detection
    logWarn('Language detection API failed, using character fallback', { error: error.message });
    const fallbackLang = detectLanguageByCharacters(sampleText);
    log('Language detected by characters (offline fallback)', { langCode: fallbackLang });
    return fallbackLang;
  }
}

/**
 * Generate abstract (summary) for article content
 * @param {Array} content - Content array
 * @param {string} title - Article title
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} language - Target language code ('auto' or specific language)
 * @param {Function} updateState - State update function
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
- Output EXACTLY ONE paragraph with 2-4 sentences
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
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
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
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
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
          throw new Error(tSync('errorApiAuthentication', uiLang).replace('{status}', response.status));
        }
        throw new Error(tSync('errorApiError', uiLang).replace('{status}', response.status));
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

