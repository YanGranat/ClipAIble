// Image translation module for ClipAIble extension
// Handles translation of text in images using OCR

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem

import { log, logError, logWarn } from '../utils/logging.js';
import { LANGUAGE_NAMES } from '../utils/config.js';
import { getProviderFromModel, parseModelConfig } from '../api/index.js';
import { translateImageWithGemini } from '../api/gemini.js';
import { imageToBase64 } from '../utils/images.js';
import { decryptApiKey } from '../utils/encryption.js';
import { PROCESSING_STAGES } from '../state/processing.js';

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
 * Translate text in images using OCR
 * @param {Array<ContentItem>} content - Content items with images
 * @param {string} sourceLang - Source language
 * @param {string} targetLang - Target language
 * @param {string} apiKey - AI API key for translation
 * @param {string} googleApiKey - Google API key for Gemini Vision
 * @param {string} model - Model name
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update function
 * @returns {Promise<Array<ContentItem>>} Content items with translated image text
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

