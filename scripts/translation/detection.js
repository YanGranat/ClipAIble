// Language detection module for ClipAIble extension
// Handles detection of source language from content

// @ts-check

import { log, logWarn } from '../utils/logging.js';
import { getProviderFromModel, parseModelConfig } from '../api/index.js';
import { getDecryptedKeyCached } from '../utils/encryption.js';
import { stripHtml } from '../utils/html.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Detect source language from content
 * Uses improved character-based detection that supports multiple languages
 * @param {Array} content - Content array
 * @returns {string} Language code (en, ru, ua, de, fr, es, it, pt, zh, ja, ko, ar, or 'unknown' if no text)
 */
export function detectSourceLanguage(content) {
  log('=== detectSourceLanguage: ENTRY ===', {
    contentItemsCount: content?.length || 0,
    timestamp: Date.now()
  });
  
  log('🔍 LANGUAGE DETECTION: Starting source language detection', {
    contentItemsCount: content?.length || 0,
    method: 'detectSourceLanguage (character-based)'
  });
  
  if (!content || content.length === 0) {
    log('⚠️ LANGUAGE DETECTION: No content for source language detection', { 
      detectedLanguage: 'unknown', 
      reason: 'no content' 
    });
    return 'unknown';
  }
  
  // Extract text from content items
  let allText = '';
  for (const item of content) {
    if (item.text) {
      // Strip HTML tags for better detection
      const textOnly = stripHtml(item.text);
      allText += textOnly + ' ';
    }
    if (item.alt) {
      allText += item.alt + ' ';
    }
  }
  
  allText = allText.trim();
  
  const textPreview = allText.length > 500 ? allText.substring(0, 500) + '...' : allText;
  log('🔍 LANGUAGE DETECTION: Text extracted for source language detection', {
    totalTextLength: allText.length,
    textPreview,
    timestamp: Date.now()
  });
  
  if (!allText || allText.length === 0) {
    log('⚠️ LANGUAGE DETECTION: No text found for source language detection', { 
      detectedLanguage: 'unknown', 
      reason: 'no text found in content' 
    });
    return 'unknown';
  }
  
  // Use improved character-based detection
  log('🔍 LANGUAGE DETECTION: Calling character-based detection', {
    textLength: allText.length,
    method: 'detectLanguageByCharacters'
  });
  const detectedLanguage = detectLanguageByCharacters(allText);
  
  log('🌍 LANGUAGE DETECTION: Source language detected', { 
    detectedLanguage, 
    method: 'detectLanguageByCharacters',
    textLength: allText.length,
    source: 'character-based analysis'
  });
  
  return detectedLanguage;
}

/**
 * Detect language from text using character analysis (offline fallback)
 * Supports: en, ru, ua, de, fr, es, it, pt, zh, ja, ko, ar
 * @param {string} text - Text to analyze
 * @returns {string} Language code (defaults to 'en' if uncertain)
 */
export function detectLanguageByCharacters(text) {
  const textPreview = text && text.length > 500 ? text.substring(0, 500) + '...' : text;
  log('🔍 LANGUAGE DETECTION: Starting character-based language detection', {
    textLength: text?.length || 0,
    textPreview,
    method: 'detectLanguageByCharacters',
    timestamp: Date.now()
  });
  
  if (!text || text.length < 50) {
    log('⚠️ LANGUAGE DETECTION: Text too short for character-based detection, using default', { 
      detectedLanguage: 'en', 
      reason: 'text too short or empty',
      textLength: text?.length || 0
    });
    return 'en';
  }
  
  // Use sample for pattern matching (first 10k chars for better accuracy)
  const sample = text.substring(0, 10000);
  
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
  
  log('=== detectLanguageByCharacters: CHARACTER COUNTS ===', {
    cyrillicCount: cyrillicMatch.length,
    ukrainianCount: ukrainianMatch.length,
    latinCount: latinMatch.length,
    chineseCount: chineseMatch.length,
    japaneseCount: japaneseMatch.length,
    koreanCount: koreanMatch.length,
    arabicCount: arabicMatch.length,
    totalLetters,
    timestamp: Date.now()
  });
  
  if (totalLetters < 20) {
    log('⚠️ LANGUAGE DETECTION: Too few letters for character-based detection, using default', { 
      detectedLanguage: 'en', 
      reason: 'too few letters',
      totalLetters
    });
    return 'en';
  }
  
  // Check for specific scripts (CJK, Arabic) - these have unique character sets
  if (chineseMatch.length > totalLetters * 0.3) {
    log('🌍 LANGUAGE DETECTION: Chinese script detected', { 
      detectedLanguage: 'zh', 
      reason: 'chinese script detected',
      chineseRatio: (chineseMatch.length / totalLetters).toFixed(2)
    });
    return 'zh';
  }
  if (japaneseMatch.length > totalLetters * 0.2) {
    log('🌍 LANGUAGE DETECTION: Japanese script detected', { 
      detectedLanguage: 'ja', 
      reason: 'japanese script detected',
      japaneseRatio: (japaneseMatch.length / totalLetters).toFixed(2)
    });
    return 'ja';
  }
  if (koreanMatch.length > totalLetters * 0.3) {
    log('🌍 LANGUAGE DETECTION: Korean script detected', { 
      detectedLanguage: 'ko', 
      reason: 'korean script detected',
      koreanRatio: (koreanMatch.length / totalLetters).toFixed(2)
    });
    return 'ko';
  }
  if (arabicMatch.length > totalLetters * 0.3) {
    log('🌍 LANGUAGE DETECTION: Arabic script detected', { 
      detectedLanguage: 'ar', 
      reason: 'arabic script detected',
      arabicRatio: (arabicMatch.length / totalLetters).toFixed(2)
    });
    return 'ar';
  }
  
  // Cyrillic vs Latin
  const cyrillicRatio = cyrillicMatch.length / totalLetters;
  
  if (cyrillicRatio > 0.5) {
    // Cyrillic text - check for Ukrainian specific letters
    if (ukrainianMatch.length > 3) {
      log('🌍 LANGUAGE DETECTION: Ukrainian detected (Cyrillic with Ukrainian markers)', { 
        detectedLanguage: 'ua', 
        reason: 'cyrillic with Ukrainian markers', 
        cyrillicRatio: cyrillicRatio.toFixed(2), 
        ukrainianCount: ukrainianMatch.length 
      });
      return 'ua';
    }
    log('🌍 LANGUAGE DETECTION: Russian detected (Cyrillic without Ukrainian markers)', { 
      detectedLanguage: 'ru', 
      reason: 'cyrillic without Ukrainian markers', 
      cyrillicRatio: cyrillicRatio.toFixed(2) 
    });
    return 'ru';
  }
  
  // For Latin-based languages, use word pattern matching
  // IMPORTANT: Use specific patterns to avoid false positives
  // Single-letter words like "a", "o", "e" are too common across languages
  const patterns = {
    'de': /\b(der|die|das|und|ist|sind|haben|sein|werden|können|mit|für|von|auf|zu|nicht|auch|wenn|oder|aber|dass|kann|wird|sich|nur|noch|nach|über|vor|durch|bei|gegen|ohne|während|seit|bis|innerhalb|außerhalb|wegen|trotz|statt|anstatt)\b/gi,
    'fr': /\b(le|la|les|et|est|sont|avoir|être|peuvent|dans|pour|avec|sans|sur|sous|par|de|du|des|une|un|ce|que|qui|dont|où|mais|ou|car|donc|alors|puis|ensuite|toujours|jamais|souvent|parfois|maintenant|hier|aujourd\'hui|demain|ici|là|où|comment|pourquoi|combien|quel|quelle|quels|quelles)\b/gi,
    'es': /\b(el|la|los|las|y|es|son|tener|ser|estar|pueden|con|por|para|de|del|en|sobre|bajo|entre|desde|hasta|durante|mediante|según|contra|sin|ante|tras|mientras|aunque|pero|o|ni|sino|también|tampoco|así|entonces|ahora|aquí|allí|allá|dónde|cuándo|cómo|por qué|cuánto|cuánta|cuántos|cuántas|qué|quién|quiénes)\b/gi,
    'it': /\b(il|la|lo|gli|le|e|è|sono|avere|essere|possono|con|per|di|del|della|dei|delle|in|su|sotto|sopra|tra|fra|da|dal|dalla|dai|dalle|verso|durante|mentre|prima|dopo|quando|dove|come|perché|perchè|quanto|quanta|quanti|quante|che|chi|cosa|ma|o|anche|pure|ancora|già|sempre|mai|spesso|raramente|oggi|ieri|domani|qui|qua|là|dove)\b/gi,
    'pt': /\b(o|a|os|as|e|é|são|ter|ser|estar|podem|com|para|de|do|da|dos|das|em|no|na|nos|nas|sobre|sob|entre|até|durante|mediante|segundo|contra|sem|ante|após|atrás|enquanto|embora|mas|ou|nem|também|ainda|já|sempre|nunca|muitas vezes|raramente|hoje|ontem|amanhã|aqui|ali|aí|onde|quando|como|por quê|porque|quanto|quanta|quantos|quantas|que|quem|o que|qual|quais)\b/gi,
    'en': /\b(the|and|is|are|have|has|been|will|would|could|should|this|that|with|from|for|about|into|through|during|including|against|among|throughout|despite|towards|upon|concerning|to|of|in|on|at|by|as|but|or|if|when|where|how|why|what|which|who|whom|whose|while|although|because|since|until|unless|before|after|above|below|between|among|within|without|across|around|behind|beside|beyond|inside|outside|under|over|near|far|here|there|now|then|always|never|often|sometimes|usually|today|yesterday|tomorrow)\b/gi
  };
  
  // Count matches for each language
  const matchCounts = {};
  let maxMatches = 0;
  let detectedLang = 'en';
  
  for (const [code, pattern] of Object.entries(patterns)) {
    const matches = (sample.match(pattern) || []).length;
    matchCounts[code] = matches;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedLang = code;
    }
  }
  
  // Require minimum threshold to avoid false positives
  // If no language has significant matches, default to English
  // With 10k chars sample, we need at least 10 matches or 0.1% of text for reliability
  const minThreshold = Math.max(10, Math.floor(sample.length / 1000));
  
  if (maxMatches < minThreshold) {
    log('🌍 LANGUAGE DETECTION: Defaulting to English (no significant language patterns)', { 
      detectedLanguage: 'en', 
      reason: 'mostly latin but no significant language patterns found', 
      maxMatches, 
      minThreshold,
      matchCounts,
      cyrillicRatio 
    });
    return 'en';
  }
  
  log('🌍 LANGUAGE DETECTION: Language detected from character patterns', { 
    detectedLanguage: detectedLang, 
    reason: 'latin script with language-specific patterns detected', 
    maxMatches, 
    minThreshold,
    matchCounts,
    cyrillicRatio 
  });
  return detectedLang;
}

/**
 * Detect content language using AI (primary), character analysis (fallback for offline)
 * Supports: en, ru, ua, de, fr, es, it, pt, zh, ja, ko, ar
 * @param {Array} content - Content array
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @returns {Promise<string>} Detected language code (e.g., 'ru', 'en', 'ua', 'de', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko', 'ar')
 */
export async function detectContentLanguage(content, apiKey, model) {
  log('🔍 LANGUAGE DETECTION: Starting AI-based content language detection', {
    contentItemsCount: content?.length || 0,
    hasApiKey: !!apiKey,
    model: model,
    method: 'detectContentLanguage (AI)',
    timestamp: Date.now()
  });
  
  if (!content || content.length === 0) {
    log('⚠️ LANGUAGE DETECTION: No content for AI detection, using default', { 
      detectedLanguage: 'en', 
      reason: 'no content' 
    });
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
  
  log('🔍 LANGUAGE DETECTION: Sample text extracted for AI detection', {
    sampleTextLength: sampleText.length,
    sampleTextFull: sampleText, // FULL TEXT - NO TRUNCATION
    timestamp: Date.now()
  });
  
  if (!sampleText) {
    log('⚠️ LANGUAGE DETECTION: No text in content for AI detection, using default', { 
      detectedLanguage: 'en', 
      reason: 'no text in content' 
    });
    return 'en';
  }
  
  // If no API key, use offline character-based detection
  if (!apiKey) {
    log('⚠️ LANGUAGE DETECTION: No API key - falling back to character-based detection', {
      reason: 'No API key provided',
      method: 'character analysis (offline)',
      accuracy: 'Lower - may be less accurate than AI detection'
    });
    log('🔍 LANGUAGE DETECTION: Calling character-based detection (fallback)', {
      textLength: sampleText.length
    });
    const lang = detectLanguageByCharacters(sampleText);
    log('🌍 LANGUAGE DETECTION: Character-based detection result (fallback)', { 
      detectedLanguage: lang, 
      method: 'offline character analysis' 
    });
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
      textFull: textForAI, // FULL TEXT - NO TRUNCATION (for logging, AI gets first 30k)
      sampleTextFull: sampleText // FULL SAMPLE TEXT - NO TRUNCATION
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
          fullResponseFull: rawResponse // FULL RESPONSE - NO TRUNCATION
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
          errorBodyFull: errorText // FULL ERROR - NO TRUNCATION
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
          fullResponseFull: rawResponse // FULL RESPONSE - NO TRUNCATION
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
          errorBodyFull: errorText // FULL ERROR - NO TRUNCATION
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
          fullResponseFull: rawResponse // FULL RESPONSE - NO TRUNCATION
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
          errorBodyFull: errorText // FULL ERROR - NO TRUNCATION
        });
      }
    }
    
    // Validate language code (should be exactly 2 lowercase letters)
    log('=== detectContentLanguage: VALIDATING AI RESPONSE ===', {
      langCode: langCode,
      langCodeType: typeof langCode,
      isNull: langCode === null,
      isUndefined: langCode === undefined,
      isEmpty: langCode === '',
      isValidFormat: langCode ? /^[a-z]{2}$/.test(langCode) : false,
      validationRegex: '/^[a-z]{2}$/',
      rawResponseFull: rawResponse || null, // FULL RESPONSE - NO TRUNCATION
      parsedResultFull: parsedResult ? JSON.stringify(parsedResult) : null // FULL RESULT - NO TRUNCATION
    });
    
    if (langCode && /^[a-z]{2}$/.test(langCode)) {
      log('=== detectContentLanguage: RESULT ===', { detectedLanguage: langCode, method: 'AI detection', provider });
      return langCode;
    }
    
    // AI returned invalid format, fallback to character analysis
    log('=== detectContentLanguage: AI RETURNED INVALID FORMAT, USING FALLBACK ===', { 
      aiResponse: langCode,
      aiResponseType: typeof langCode,
      rawResponseFull: rawResponse || null, // FULL RESPONSE - NO TRUNCATION
      parsedResultFull: parsedResult ? JSON.stringify(parsedResult) : null // FULL RESULT - NO TRUNCATION
    });
    log('🔍 LANGUAGE DETECTION: AI returned invalid format, falling back to character-based detection', {
      textLength: sampleText.length
    });
    const fallbackLang = detectLanguageByCharacters(sampleText);
    log('🌍 LANGUAGE DETECTION: Character-based detection result (AI fallback)', { 
      detectedLanguage: fallbackLang, 
      method: 'character analysis (AI fallback)' 
    });
    return fallbackLang;
  } catch (error) {
    // Normalize error with context for better logging and error tracking
    await handleError(error, {
      source: 'languageDetection',
      errorType: 'detectContentLanguageFailed',
      logError: true,
      createUserMessage: false, // Keep existing behavior - fallback to character-based detection
      context: {
        operation: 'detectContentLanguage',
        provider,
        sampleTextLength: sampleText?.length || 0
      }
    });
    // API error - fallback to character-based detection
    logWarn('⚠️ FALLBACK: AI language detection failed - using offline character-based detection', { 
      error: error.message,
      reason: 'AI detection API call failed',
      method: 'character analysis (offline fallback)',
      accuracy: 'Lower - may be less accurate than AI detection',
      originalError: error.message
    });
    log('🔍 LANGUAGE DETECTION: AI detection failed, falling back to character-based detection', {
      textLength: sampleText.length,
      error: error.message
    });
    const fallbackLang = detectLanguageByCharacters(sampleText);
    log('🌍 LANGUAGE DETECTION: Character-based detection result (error fallback)', { 
      detectedLanguage: fallbackLang, 
      method: 'character analysis (offline fallback)' 
    });
    return fallbackLang;
  }
}

