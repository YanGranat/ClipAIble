import { renderPrompt } from '../settings/prompt-catalog.js';
import { assertCompleteAIResponse } from '../api/response-validation.js';
import { fetchBufferedResponse } from '../api/fetch-buffered-response.js';
import { parseBase64Image, readRasterDataUrl } from '../api/image-data.js';
// Image translation module for ClipAIble extension
// Handles translation of text in images using OCR

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem

import { log, logWarn } from '../utils/logging.js';
import { LANGUAGE_NAMES, CONFIG } from '../utils/config.js';
import { resolveAIProvider, callAIWithImage } from '../api/index.js';
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
import { getUILanguage, formatStatusUpdate } from '../locales.js';
import { translateImageWithOpenAI } from '../api/openai-images.js';
import { translateImageWithOpenRouter } from '../api/openrouter-images.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, IMAGE_TRANSLATION_PROVIDERS, OPENAI_IMAGE_DETECTION_MODEL, OPENROUTER_IMAGE_DETECTION_MODEL, getImageTranslationApiKey, supportsImageTranslation } from '../api/image-translation-catalog.js';

const IMAGE_EDITORS = Object.freeze({
  gemini: translateImageWithGemini, openai: translateImageWithOpenAI, openrouter: translateImageWithOpenRouter
});

async function checkImageOwner(options) {
  if (options.signal?.aborted) throw options.signal.reason;
  await options.checkCancelled?.();
  if (options.signal?.aborted) throw options.signal.reason;
}

function requireDetectionResponse(response) {
  if (!response.ok) throw Object.assign(new Error('Image text detection failed'), {
    status: response.status, retryable: false
  });
}

/**
 * Detect if image contains translatable text
 * @param {string} imageBase64 - Base64 image data
 * @param {string} targetLang - Target language
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<boolean>}
 */
export async function detectImageText(imageBase64, targetLang, apiKey, model, options = {}) {
  await checkImageOwner(options);
  log('detectImageText', { targetLang, model });
  
  const prompt = renderPrompt('detectImageText', options, { targetLanguage: targetLang });

  try {
    const provider = resolveAIProvider(model, options.provider);
    let answer;
    
    if (provider === 'deepseek') {
      answer = await callAIWithImage('', prompt, imageBase64, apiKey, model, false, options);
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

      requireDetectionResponse(response);
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = data.choices?.[0]?.message?.content;
    } else if (provider === 'openrouter') {
      // OpenRouter API format (similar to OpenAI but with different endpoint)
      const { base64Image, mimeType } = parseBase64Image(imageBase64);
      
      const response = await fetchBufferedResponse('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/YanGranat/ClipAIble',
          'X-Title': 'ClipAIble'
        },
        body: JSON.stringify({
          ...getOpenRouterRequestConfig(model, { shortResponse: true, imageInput: true }),
          ...(model === OPENROUTER_IMAGE_DETECTION_MODEL ? { max_tokens: 32, reasoning: { enabled: false } } : {}),
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

      requireDetectionResponse(response);
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = data.choices?.[0]?.message?.content;
    } else if (provider === 'openai') {
      const controller = new AbortController();
      const onAbort = () => controller.abort(options.signal.reason);
      let settled = false, timer;
      const poll = async () => {
        try { await checkImageOwner(options); }
        catch (error) { if (!settled) controller.abort(error); return; }
        if (!settled) timer = setTimeout(poll, 100);
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      if (options.checkCancelled) timer = setTimeout(poll, 100);
      try {
        const response = await fetchBufferedResponse('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            ...getOpenAIRequestConfig(model, { shortResponse: true, maxTokens: 16 }),
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: imageBase64, detail: options.imageDetail || 'low' } }
                ]
              }
            ]
          })
        }, undefined, options);

        requireDetectionResponse(response);
        const data = await response.json();
        assertCompleteAIResponse(data, provider);
        answer = data.choices?.[0]?.message?.content;
      } finally {
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    } else if (provider === 'claude') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new Error('Image text detection requires a data URL');
      
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

      requireDetectionResponse(response);
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = getClaudeResponseText(data);
    } else if (provider === 'gemini') {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) throw new Error('Image text detection requires a data URL');
      
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

      requireDetectionResponse(response);
      const data = await response.json();
      assertCompleteAIResponse(data, provider);
      answer = getGeminiResponseText(data);
    }
    
    await checkImageOwner(options);
    const decision = typeof answer === 'string' && /^(yes|no)\.?$/.exec(answer.trim().toLowerCase());
    if (!decision) throw new Error('Invalid image text detection response');
    return decision[1] === 'yes';
  } catch (error) {
    await checkImageOwner(options);
    throw error;
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
 * @param {import('../types.js').ImageTranslationOptions} [options] - Image routing and cancellation
 * @returns {Promise<Array<import('../types.js').ContentItem>>} Content items with translated image text
 */
export async function translateImages(content, sourceLang, targetLang, apiKey, googleApiKey, model, updateState, options = {}) {
  const check = async () => {
    await checkImageOwner(options);
    if (!options.checkCancelled) await checkCancellation('image translation');
  };
  await check();
  if (targetLang === 'auto' || !supportsImageTranslation(options.outputFormat || 'pdf')) return content;
  log('=== IMAGE TRANSLATION START ===', { sourceLang, targetLang });
  const provider = options.imageTranslationProvider ?? DEFAULT_IMAGE_TRANSLATION_PROVIDER;
  if (!IMAGE_TRANSLATION_PROVIDERS.includes(provider)) throw Object.assign(new Error('Unsupported image translation provider'), {
    translationKey: 'errorImageProviderUnsupported', translationParams: { provider: String(provider) }
  });
  let decryptedApiKey = apiKey;
  let editKey = getImageTranslationApiKey({ ...options, googleApiKey });
  let detectionModel = model;
  let detectionOptions = options;
  if (provider === 'openai' || provider === 'openrouter') {
    const providerLabel = provider === 'openai' ? 'OpenAI' : 'OpenRouter';
    if (typeof editKey !== 'string' || !editKey.trim() || editKey.startsWith('****')) throw Object.assign(new Error('Image translation API key required'), {
      translationKey: 'errorImageKeyRequired', translationParams: { provider: providerLabel }
    });
    if (editKey.startsWith('ENC:')) editKey = await decryptApiKey(editKey);
    await check();
    if (!editKey || editKey.startsWith('ENC:') || editKey.startsWith('****')) throw Object.assign(new Error('Image translation API key required'), {
      translationKey: 'errorImageKeyRequired', translationParams: { provider: providerLabel }
    });
    decryptedApiKey = editKey;
    detectionModel = provider === 'openai' ? OPENAI_IMAGE_DETECTION_MODEL : OPENROUTER_IMAGE_DETECTION_MODEL;
    detectionOptions = { ...options, provider, imageDetail: 'high' };
  } else {
    try {
      decryptedApiKey = await decryptApiKey(apiKey);
    } catch (error) {
      await check();
      log('API key decryption failed for image detection, using as-is', error);
    }
    await check();
    if (editKey) {
      try { editKey = await decryptApiKey(editKey); }
      catch (error) { await check(); log('Image API key decryption failed, using as-is', error); }
      await check();
    }
    if (!editKey) return content;
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
    await check();
    
    const idx = imageIndices[i];
    const img = content[idx];
    
    if (updateState) {
      const status = formatStatusUpdate('statusAnalyzingImage', await getUILanguage(), { current: i + 1, total: imageIndices.length });
      await check();
      updateState({ 
        stage: PROCESSING_STAGES.TRANSLATING.id,
        ...status,
        progress: 10 + Math.floor((i / imageIndices.length) * 5) 
      });
    }
    
    try {
      let imageBase64 = img.src;
      if (!imageBase64.startsWith('data:')) {
        imageBase64 = await imageToBase64(img.src, { signal: options.signal });
        await check();
        if (!imageBase64) {
          logWarn(`Could not fetch image ${i + 1}`);
          failed++;
          continue;
        }
      }
      
      if (provider === 'openrouter') imageBase64 = readRasterDataUrl(imageBase64).dataUrl;
      const needsTranslation = await detectImageText(imageBase64, langName, decryptedApiKey, detectionModel, detectionOptions);
      await check();
      
      if (!needsTranslation) {
        log(`Image ${i + 1} does not need translation`);
        skipped++;
        continue;
      }
      
      log(`Image ${i + 1} needs translation`);
      if (updateState) {
        const status = formatStatusUpdate('statusTranslatingImage', await getUILanguage(), { current: i + 1, total: imageIndices.length });
        await check();
        updateState({ 
          stage: PROCESSING_STAGES.TRANSLATING.id,
          ...status,
          progress: 10 + Math.floor((i / imageIndices.length) * 5) 
        });
      }
      
      const translatedImage = await IMAGE_EDITORS[provider](imageBase64, langName, editKey, options);
      
      await check();
      if (translatedImage) {
        content[idx].src = translatedImage;
        content[idx].translated = true;
        translated++;
        log(`Image ${i + 1} translated successfully`);
      } else {
        logWarn(`Image ${i + 1} translation failed, keeping original`, {
          imageIndex: i + 1,
          totalImages: imageIndices.length,
          reason: 'Image editor returned no image'
        });
        failed++;
      }
    } catch (error) {
      await check();
      // Normalize error with context for better logging and error tracking
      await handleError(error, {
        source: 'imageTranslation',
        errorType: 'processImageFailed',
        logError: true,
        createUserMessage: false, // Keep existing behavior - continue with other images
        context: {
          operation: 'translateImages',
          imageIndex: i + 1,
          totalImages: imageIndices.length
        }
      });
      failed++;
    }
  }
  await check();
  if (failed > 0) updateState?.({ imageTranslationFailureCount: failed });
  log('=== IMAGE TRANSLATION END ===', { translated, skipped, failed });
  return content;
}

