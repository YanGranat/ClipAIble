// Language detection module for ClipAIble extension
// Handles detection of source language from content

// @ts-check

import { log, logWarn } from '../utils/logging.js';
import { getProviderFromModel, parseModelConfig } from '../api/index.js';
import { getDecryptedKeyCached } from '../utils/encryption.js';
import { stripHtml } from '../utils/html.js';

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
 * Detect language from text using character analysis (offline fallback)
 * @param {string} text - Text to analyze
 * @returns {string} Language code (defaults to 'en' if uncertain)
 */
export function detectLanguageByCharacters(text) {
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
  
  // Get provider from model for automatic encryption
  const provider = getProviderFromModel(model);
  
  // Decrypt API key if needed (with automatic encryption for unencrypted keys)
  let decryptedApiKey = apiKey;
  try {
    decryptedApiKey = await getDecryptedKeyCached(apiKey, provider);
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
    let rawResponse = null;
    let parsedResult = null;
    
    log('Starting AI language detection', { 
      provider, 
      model: modelName, 
      textLength: textForAI.length,
      textPreview: textForAI.substring(0, 100) + '...'
    });
    
    if (provider === 'openai') {
      // GPT-5.1 and GPT-5.2 models don't support max_tokens parameter
      const supportsMaxTokens = !modelName.startsWith('gpt-5.1') && !modelName.startsWith('gpt-5.2');
      
      const requestBody = {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Detect the language of this text:\n\n${textForAI}` }
        ],
        temperature: 0
      };
      
      // Only add max_tokens for models that support it
      if (supportsMaxTokens) {
        requestBody.max_tokens = 10;
      }
      
      log('Sending request to OpenAI', { 
        model: modelName, 
        maxTokens: supportsMaxTokens ? 10 : 'not supported',
        supportsMaxTokens 
      });
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decryptedApiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      log('OpenAI response received', { 
        status: response.status, 
        ok: response.ok,
        statusText: response.statusText 
      });
      
      if (response.ok) {
        parsedResult = await response.json();
        rawResponse = JSON.stringify(parsedResult);
        
        log('OpenAI response parsed', {
          hasChoices: !!parsedResult.choices,
          choicesLength: parsedResult.choices?.length || 0,
          firstChoice: parsedResult.choices?.[0] || null,
          fullResponse: rawResponse.substring(0, 500) + (rawResponse.length > 500 ? '...' : '')
        });
        
        const rawContent = parsedResult.choices?.[0]?.message?.content;
        log('Extracting langCode from OpenAI response', {
          rawContent: rawContent,
          rawContentType: typeof rawContent,
          rawContentLength: rawContent?.length
        });
        
        if (rawContent) {
          langCode = rawContent.trim().toLowerCase();
          log('langCode after trim/toLowerCase', {
            langCode: langCode,
            langCodeLength: langCode?.length,
            isValidFormat: /^[a-z]{2}$/.test(langCode)
          });
        } else {
          log('No content in OpenAI response', {
            message: parsedResult.choices?.[0]?.message,
            fullChoice: parsedResult.choices?.[0]
          });
        }
      } else {
        const errorText = await response.text();
        log('OpenAI API error', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText.substring(0, 500)
        });
      }
    } else if (provider === 'claude') {
      const requestBody = {
        model: modelName,
        max_tokens: 10,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Detect the language of this text:\n\n${textForAI}` }]
      };
      
      log('Sending request to Claude', { model: modelName, maxTokens: 10 });
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': decryptedApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(requestBody)
      });
      
      log('Claude response received', { 
        status: response.status, 
        ok: response.ok,
        statusText: response.statusText 
      });
      
      if (response.ok) {
        parsedResult = await response.json();
        rawResponse = JSON.stringify(parsedResult);
        
        log('Claude response parsed', {
          hasContent: !!parsedResult.content,
          contentLength: parsedResult.content?.length || 0,
          firstContent: parsedResult.content?.[0] || null,
          fullResponse: rawResponse.substring(0, 500) + (rawResponse.length > 500 ? '...' : '')
        });
        
        const rawText = parsedResult.content?.[0]?.text;
        log('Extracting langCode from Claude response', {
          rawText: rawText,
          rawTextType: typeof rawText,
          rawTextLength: rawText?.length
        });
        
        if (rawText) {
          langCode = rawText.trim().toLowerCase();
          log('langCode after trim/toLowerCase', {
            langCode: langCode,
            langCodeLength: langCode?.length,
            isValidFormat: /^[a-z]{2}$/.test(langCode)
          });
        } else {
          log('No text in Claude response', {
            content: parsedResult.content?.[0],
            fullContent: parsedResult.content
          });
        }
      } else {
        const errorText = await response.text();
        log('Claude API error', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText.substring(0, 500)
        });
      }
    } else if (provider === 'gemini') {
      const requestBody = {
        contents: [{ parts: [{ text: `${systemPrompt}\n\nDetect the language of this text:\n\n${textForAI}` }] }]
      };
      
      log('Sending request to Gemini', { model: modelName });
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${decryptedApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      log('Gemini response received', { 
        status: response.status, 
        ok: response.ok,
        statusText: response.statusText 
      });
      
      if (response.ok) {
        parsedResult = await response.json();
        rawResponse = JSON.stringify(parsedResult);
        
        log('Gemini response parsed', {
          hasCandidates: !!parsedResult.candidates,
          candidatesLength: parsedResult.candidates?.length || 0,
          firstCandidate: parsedResult.candidates?.[0] || null,
          fullResponse: rawResponse.substring(0, 500) + (rawResponse.length > 500 ? '...' : '')
        });
        
        const rawText = parsedResult.candidates?.[0]?.content?.parts?.[0]?.text;
        log('Extracting langCode from Gemini response', {
          rawText: rawText,
          rawTextType: typeof rawText,
          rawTextLength: rawText?.length
        });
        
        if (rawText) {
          langCode = rawText.trim().toLowerCase();
          log('langCode after trim/toLowerCase', {
            langCode: langCode,
            langCodeLength: langCode?.length,
            isValidFormat: /^[a-z]{2}$/.test(langCode)
          });
        } else {
          log('No text in Gemini response', {
            candidate: parsedResult.candidates?.[0],
            fullCandidates: parsedResult.candidates
          });
        }
      } else {
        const errorText = await response.text();
        log('Gemini API error', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText.substring(0, 500)
        });
      }
    }
    
    // Validate language code (should be exactly 2 lowercase letters)
    log('Validating langCode', {
      langCode: langCode,
      langCodeType: typeof langCode,
      isNull: langCode === null,
      isUndefined: langCode === undefined,
      isEmpty: langCode === '',
      isValidFormat: langCode ? /^[a-z]{2}$/.test(langCode) : false,
      validationRegex: '/^[a-z]{2}$/'
    });
    
    if (langCode && /^[a-z]{2}$/.test(langCode)) {
      log('Language detected by AI', { langCode, provider });
      return langCode;
    }
    
    // AI returned invalid format, fallback to character analysis
    log('AI returned invalid language code, using character fallback', { 
      aiResponse: langCode,
      aiResponseType: typeof langCode,
      rawResponse: rawResponse ? rawResponse.substring(0, 1000) : null,
      parsedResult: parsedResult ? JSON.stringify(parsedResult).substring(0, 1000) : null
    });
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

