import { assertCompleteAIResponse } from '../api/response-validation.js';
import { fetchBufferedResponse } from '../api/fetch-buffered-response.js';
import { parseBase64Image } from '../api/image-data.js';
// Image translation module for ClipAIble extension
// Handles translation of text in images using OCR

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem

import { log, logError, logWarn } from '../utils/logging.js';
import { LANGUAGE_NAMES, CONFIG } from '../utils/config.js';
import { resolveAIProvider, parseModelConfig, callAIWithImage } from '../api/index.js';
import { translateImageWithGemini, getGeminiModelName, getGeminiGenerationConfig, getGeminiResponseText } from '../api/gemini.js';
import { getClaudeRequestConfig, getClaudeResponseText } from '../api/claude.js';
import { getOpenAIRequestConfig } from '../api/openai.js';
import { getGrokRequestConfig } from '../api/grok.js';
import { getOpenRouterRequestConfig } from '../api/openrouter.js';
import { imageToBase64 } from '../utils/images.js';
import { decryptApiKey } from '../utils/encryption.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { handleError } from '../utils/error-handler.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';

/**
 * Detect if image contains translatable text
 * @param {string} imageBase64 - Base64 image data
 * @param {string} targetLang - Target language
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<boolean>}
 */
export async function detectImageText(imageBase64, targetLang, apiKey, model, options = {}) {
  options.checkCancelled?.();
  log('detectImageText', { targetLang, model });
  
  const prompt = `Analyze this image. Does it contain meaningful text that is NOT in ${targetLang}?

Consider:
1. Does it contain readable text (not just logos, brand names, or decorative elements)?
2. Is the text meaningful content (captions, labels, diagrams, infographics)?
3. Is the text in a language OTHER than ${targetLang}?

Respond with ONLY "yes" or "no".`;

  try {
    const provider = resolveAIProvider(model, options.provider);
    const { modelName } = parseModelConfig(model);
    let answer;
    
    if (provider === 'deepseek') {
      const result = await callAIWithImage('', prompt, imageBase64, apiKey, model, false, options);
      answer = typeof result === 'string' ? result.toLowerCase().trim() : String(result).toLowerCase().trim();
    } else if (provider === 'grok') {
      // Grok API format (same as OpenAI)
      const response = await fetchBufferedResponse('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          ...getGrokRequestConfig(model, { shortResponse: true, imageInput: true }),
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
      }, undefined, options);

      if (!response.ok) {
        logWarn('Grok API error in detectImageText', { status: response.status, model: modelName });
        return false;
      }
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = data.choices?.[0]?.message?.content?.toLowerCase()?.trim();
    } else if (provider === 'openrouter') {
      // OpenRouter API format (similar to OpenAI but with different endpoint)
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      const { base64Image, mimeType } = parseBase64Image(imageBase64);
      
      const response = await fetchBufferedResponse('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/clipaiable',
          'X-Title': 'ClipAIble'
        },
        body: JSON.stringify({
          ...getOpenRouterRequestConfig(model, { shortResponse: true, imageInput: true }),
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
              ]
            }
          ]
        })
      }, undefined, options);

      if (!response.ok) {
        logWarn('OpenRouter API error in detectImageText', { status: response.status, model: modelName });
        return false;
      }
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = data.choices?.[0]?.message?.content?.toLowerCase()?.trim();
    } else if (provider === 'openai') {
      const response = await fetchBufferedResponse('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          ...getOpenAIRequestConfig(model, { shortResponse: true }),
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
      }, undefined, options);

      if (!response.ok) return false;
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = data.choices?.[0]?.message?.content?.toLowerCase()?.trim();
    } else if (provider === 'claude') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return false;
      
      const response = await fetchBufferedResponse('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          ...getClaudeRequestConfig(model, { maxTokens: 100, shortResponse: true }),
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: matches[1], data: matches[2] } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      }, undefined, options);

      if (!response.ok) return false;
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = getClaudeResponseText(data).toLowerCase().trim();
    } else if (provider === 'gemini') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return false;
      
      const response = await fetchBufferedResponse(`https://generativelanguage.googleapis.com/v1beta/models/${getGeminiModelName(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          generationConfig: getGeminiGenerationConfig(model),
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: matches[1], data: matches[2] } }
            ]
          }]
        })
      }, undefined, options);

      if (!response.ok) return false;
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = getGeminiResponseText(data).toLowerCase().trim();
    }
    
    log('detectImageText result', { answer });
    return answer === 'yes';
  } catch (error) {
    options.checkCancelled?.();
    if (error?.code === 'AI_MODEL_UNSUPPORTED_IMAGE') throw error;
    // Normalize error with context for better logging and error tracking
    await handleError(error, {
      source: 'imageTranslation',
      errorType: 'detectImageTextFailed',
      logError: true,
      createUserMessage: false, // Keep existing behavior - return false on error
      context: {
        operation: 'detectImageText',
        targetLang,
        model
      }
    });
    return false;
  }
}

/**
 * Translate text in images using OCR
 * @param {Array<import('../types.js').ContentItem>} content - Content items with images
 * @param {string} sourceLang - Source language
 * @param {string} targetLang - Target language
 * @param {string} apiKey - AI API key for translation
 * @param {string} googleApiKey - Google API key for Gemini Vision
 * @param {string} model - Model name
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<Array<import('../types.js').ContentItem>>} Content items with translated image text
 */
export async function translateImages(content, sourceLang, targetLang, apiKey, googleApiKey, model, updateState, options = {}) {
  options.checkCancelled?.();
  log('=== IMAGE TRANSLATION START ===', { sourceLang, targetLang });
  
  // Decrypt API keys if needed
  let decryptedApiKey = apiKey;
  let decryptedGoogleApiKey = googleApiKey;
  
  try {
    decryptedApiKey = await decryptApiKey(apiKey);
  } catch (error) {
    options.checkCancelled?.();
    log('API key decryption failed for image detection, using as-is', error);
  }
  
  if (googleApiKey) {
    try {
      decryptedGoogleApiKey = await decryptApiKey(googleApiKey);
    } catch (error) {
    options.checkCancelled?.();
      if (error?.code === 'AI_MODEL_UNSUPPORTED_IMAGE') throw error;
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
    // Check if processing was cancelled before processing each image
    if (options.checkCancelled) options.checkCancelled();
    else await checkCancellation(`image translation (${i + 1}/${imageIndices.length})`);
    
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
      
      const needsTranslation = await detectImageText(imageBase64, langName, decryptedApiKey, model, options);
      
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
      
      const translatedImage = await translateImageWithGemini(imageBase64, langName, decryptedGoogleApiKey, options);
      
      options.checkCancelled?.();
      if (translatedImage) {
        content[idx].src = translatedImage;
        content[idx].translated = true;
        translated++;
        log(`Image ${i + 1} translated successfully`);
      } else {
        logWarn(`Image ${i + 1} translation failed, keeping original`, {
          imageIndex: i + 1,
          totalImages: imageIndices.length,
          imageSrc: img?.src?.substring(0, 100) || 'unknown',
          reason: 'translateImageWithGemini returned null (check logs above for details)'
        });
        failed++;
      }
    } catch (error) {
    options.checkCancelled?.();
      // Normalize error with context for better logging and error tracking
      await handleError(error, {
        source: 'imageTranslation',
        errorType: 'processImageFailed',
        logError: true,
        createUserMessage: false, // Keep existing behavior - continue with other images
        context: {
          operation: 'translateImages',
          imageIndex: i + 1,
          totalImages: imageIndices.length,
          imageSrc: img?.src?.substring(0, 100) || 'unknown'
        }
      });
      failed++;
    }
  }
  
  log('=== IMAGE TRANSLATION END ===', { translated, skipped, failed });
  return content;
}

