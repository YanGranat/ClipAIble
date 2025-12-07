// Background service worker for ClipAIble extension
// Main entry point - uses ES modules for modular architecture

import { log, logError, logWarn } from './utils/logging.js';
import { CONFIG } from './utils/config.js';
import { 
  getProcessingState, 
  updateState, 
  cancelProcessing, 
  completeProcessing, 
  setError,
  startProcessing,
  setResult,
  restoreStateFromStorage,
  PROCESSING_STAGES
} from './state/processing.js';
import { callAI, getProviderFromModel } from './api/index.js';
import { 
  SELECTOR_SYSTEM_PROMPT, 
  buildSelectorUserPrompt, 
  EXTRACT_SYSTEM_PROMPT,
  buildChunkSystemPrompt,
  buildChunkUserPrompt
} from './extraction/prompts.js';
import { trimHtmlForAnalysis, splitHtmlIntoChunks, deduplicateContent } from './extraction/html-utils.js';
import { translateContent, translateImages, detectSourceLanguage, generateAbstract, detectContentLanguage } from './translation/index.js';
import { generateMarkdown } from './generation/markdown.js';
import { generatePdf, generatePdfWithDebugger } from './generation/pdf.js';
import { generateEpub } from './generation/epub.js';
import { generateFb2 } from './generation/fb2.js';
import { generateAudio } from './generation/audio.js';
import { recordSave, getFormattedStats, clearStats, deleteHistoryItem } from './stats/index.js';
import { 
  getCachedSelectors, 
  cacheSelectors, 
  markCacheSuccess, 
  invalidateCache, 
  clearSelectorCache, 
  getCacheStats,
  deleteDomainFromCache
} from './cache/selectors.js';
import { exportSettings, importSettings } from './settings/import-export.js';
import { removeLargeData } from './utils/storage.js';
import { encryptApiKey, isEncrypted, decryptApiKey } from './utils/encryption.js';

// ============================================
// INITIALIZATION
// ============================================

log('Extension loaded', { config: CONFIG });

// Restore state on service worker restart
restoreStateFromStorage();

// Migrate existing API keys to encrypted format
migrateApiKeys();

// ============================================
// KEEP-ALIVE MECHANISM
// ============================================

const KEEP_ALIVE_ALARM = 'keepAlive';

function startKeepAlive() {
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: CONFIG.KEEP_ALIVE_INTERVAL });
  log('Keep-alive started');
}

function stopKeepAlive() {
  chrome.alarms.clear(KEEP_ALIVE_ALARM);
  log('Keep-alive stopped');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    const state = getProcessingState();
    log('Keep-alive ping', { isProcessing: state.isProcessing });
    if (state.isProcessing) {
      chrome.storage.local.set({ 
        processingState: { ...state, lastUpdate: Date.now() }
      });
    }
  }
});

// ============================================
// CONTEXT MENU
// ============================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-as-pdf',
    title: 'Save article as PDF',
    contexts: ['page']
  });
  log('Context menu created');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-as-pdf') {
    log('Context menu clicked: Save as PDF', { tabId: tab?.id, url: tab?.url });
    handleQuickSave();
  }
});

// ============================================
// QUICK SAVE (Context Menu)
// ============================================

async function handleQuickSave() {
  log('Quick save triggered');
  
  const state = getProcessingState();
  if (state.isProcessing) {
    log('Already processing, ignoring quick save');
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      logError('No active tab found');
      return;
    }
    
    const settings = await chrome.storage.local.get([
      'openai_api_key', 'claude_api_key', 'gemini_api_key', 'openai_model',
      'extraction_mode', 'use_selector_cache', 'output_format', 'generate_toc', 'page_mode', 'pdf_language',
      'pdf_font_family', 'pdf_font_size', 'pdf_bg_color', 'pdf_text_color',
      'pdf_heading_color', 'pdf_link_color'
    ]);
    
    const model = settings.openai_model || 'gpt-5.1';
    let apiKey = '';
    let provider = 'openai';
    
    // Use statically imported decryptApiKey
    
    if (model.startsWith('gpt-')) {
      const encryptedKey = settings.openai_api_key;
      if (encryptedKey) {
        try {
          apiKey = await decryptApiKey(encryptedKey);
        } catch (error) {
          logError('Failed to decrypt OpenAI API key for quick save', error);
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'ClipAIble',
            message: 'Failed to decrypt API key. Please check your settings.'
          });
          return;
        }
      }
      provider = 'openai';
    } else if (model.startsWith('claude-')) {
      const encryptedKey = settings.claude_api_key;
      if (encryptedKey) {
        try {
          apiKey = await decryptApiKey(encryptedKey);
        } catch (error) {
          logError('Failed to decrypt Claude API key for quick save', error);
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'ClipAIble',
            message: 'Failed to decrypt API key. Please check your settings.'
          });
          return;
        }
      }
      provider = 'claude';
    } else if (model.startsWith('gemini-')) {
      const encryptedKey = settings.gemini_api_key;
      if (encryptedKey) {
        try {
          apiKey = await decryptApiKey(encryptedKey);
        } catch (error) {
          logError('Failed to decrypt Gemini API key for quick save', error);
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'ClipAIble',
            message: 'Failed to decrypt API key. Please check your settings.'
          });
          return;
        }
      }
      provider = 'gemini';
    }
    
    if (!apiKey) {
      logError('No API key configured for quick save');
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'ClipAIble',
        message: 'Please configure an API key in the extension settings first.'
      });
      return;
    }
    
    const htmlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML,
        url: window.location.href,
        title: document.title
      })
    });
    
    if (!htmlResult || !htmlResult[0]?.result) {
      logError('Failed to extract page content');
      return;
    }
    
    const pageData = htmlResult[0].result;
    
    log('Starting quick save processing', { url: pageData.url, model });
    
    // NOTE: No await here - this is intentional "fire and forget" pattern.
    // startArticleProcessing returns true/false synchronously, processing
    // runs async via .then()/.catch() chain with proper error handling.
    // See systemPatterns.md "Design Decisions" section.
    startArticleProcessing({
      html: pageData.html,
      url: pageData.url,
      title: pageData.title,
      apiKey: apiKey,
      provider: provider,
      model: model,
      mode: settings.extraction_mode || 'selector',
      useCache: settings.use_selector_cache !== false, // Default: true
      outputFormat: settings.output_format || 'pdf',
      generateToc: settings.generate_toc || false,
      generateAbstract: settings.generate_abstract || false,
      pageMode: settings.page_mode || 'single',
      language: settings.pdf_language || 'auto',
      translateImages: false,
      fontFamily: settings.pdf_font_family || '',
      fontSize: settings.pdf_font_size || '31',
      bgColor: settings.pdf_bg_color || '#303030',
      textColor: settings.pdf_text_color || '#b9b9b9',
      headingColor: settings.pdf_heading_color || '#cfcfcf',
      linkColor: settings.pdf_link_color || '#6cacff',
      tabId: tab.id
    });
    
  } catch (error) {
    logError('Quick save failed', error);
  }
}

// ============================================
// MESSAGE LISTENER
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Message received', { action: request.action, sender: sender.tab?.url || 'popup' });
  
  try {
    if (request.action === 'getState') {
      sendResponse(getProcessingState());
      return true;
    }
    
    if (request.action === 'cancelProcessing') {
      log('Cancel requested');
      sendResponse(cancelProcessing(stopKeepAlive));
      return true;
    }
    
    if (request.action === 'processArticle') {
      const started = startArticleProcessing(request.data);
      if (started) {
        sendResponse({ started: true });
      } else {
        sendResponse({ error: 'Already processing' });
      }
      return true;
    }
    
    if (request.action === 'generatePdfDebugger') {
      const { title, pageMode, contentWidth, contentHeight } = request.data;
      const tabId = sender.tab?.id;
      
      if (!tabId) {
        sendResponse({ error: 'No tab ID' });
        return true;
      }
      
      log('generatePdfDebugger', { title, pageMode, contentWidth, contentHeight, tabId });
      
      generatePdfWithDebugger(
        tabId, title, pageMode, contentWidth, contentHeight,
        () => completeProcessing(stopKeepAlive),
        (errorMsg) => setError(errorMsg, stopKeepAlive)
      )
        .then(() => log('PDF generated and downloaded'))
        .catch(error => logError('generatePdfDebugger failed', error));
      
      sendResponse({ success: true });
      return true;
    }
    
    if (request.action === 'getStats') {
      getFormattedStats()
        .then(stats => sendResponse({ stats }))
        .catch(error => {
          logError('getStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'clearStats') {
      clearStats()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('clearStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'deleteHistoryItem') {
      deleteHistoryItem(request.index)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('deleteHistoryItem failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'getCacheStats') {
      getCacheStats()
        .then(stats => sendResponse({ stats }))
        .catch(error => {
          logError('getCacheStats failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'clearSelectorCache') {
      clearSelectorCache()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('clearSelectorCache failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'deleteDomainFromCache') {
      deleteDomainFromCache(request.domain)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          logError('deleteDomainFromCache failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'exportSettings') {
      exportSettings(request.includeStats, request.includeCache)
        .then(jsonData => sendResponse({ success: true, data: jsonData }))
        .catch(error => {
          logError('exportSettings failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    if (request.action === 'importSettings') {
      importSettings(request.jsonData, request.options)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => {
          logError('importSettings failed', error);
          sendResponse({ error: error.message });
        });
      return true;
    }
    
    logWarn('Unknown action received', { action: request.action });
    sendResponse({ error: 'Unknown action' });
    return true;
    
  } catch (error) {
    logError('Message handler error', error);
    sendResponse({ error: error.message });
    return true;
  }
});

// ============================================
// ARTICLE PROCESSING
// ============================================

// Track processing start time for stats
let processingStartTime = null;

async function startArticleProcessing(data) {
  if (!startProcessing(startKeepAlive)) {
    return false;
  }
  
  // Clean up any old temporary data before starting new processing
  try {
    await removeLargeData('printHtml');
    await chrome.storage.local.remove(['printTitle', 'pageMode']);
    log('Cleaned up old temporary data');
  } catch (cleanupError) {
    logWarn('Failed to clean up old temporary data', cleanupError);
    // Continue anyway - not critical
  }
  
  processingStartTime = Date.now();
  
  log('Starting article processing', {
    mode: data.mode,
    model: data.model,
    outputFormat: data.outputFormat,
    generateToc: data.generateToc,
    url: data.url,
    htmlLength: data.html?.length || 0
  });
  
  const { mode } = data;
  
  const processFunction = mode === 'selector' 
    ? processWithSelectorMode 
    : processWithExtractMode;
  
  processFunction(data)
    .then(async result => {
      log('Processing complete', { 
        title: result.title, 
        contentItems: result.content?.length || 0 
      });
      
      // Translate if language is not auto
      const language = data.language || 'auto';
      const hasImageTranslation = data.translateImages && data.googleApiKey;
      
      if (language !== 'auto' && result.content && result.content.length > 0) {
        updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, status: 'Translating content...', progress: hasImageTranslation ? 10 : 12 });
        
        // Translate images first if enabled
        if (hasImageTranslation) {
          log('Starting image translation', { targetLanguage: language });
          updateState({ status: 'Analyzing images for translation...', progress: 10 });
          
          const sourceLang = detectSourceLanguage(result.content);
          result.content = await translateImages(
            result.content, sourceLang, language, 
            data.apiKey, data.googleApiKey, data.model, updateState
          );
          log('Image translation complete');
        }
        
        log('Starting text translation', { targetLanguage: language });
        updateState({ status: 'Translating text...', progress: 15 });
        try {
          result = await translateContent(result, language, data.apiKey, data.model, updateState);
          log('Translation complete', { title: result.title });
        } catch (error) {
          if (error.message?.includes('authentication')) {
            logError('Translation failed: authentication error', error);
            updateState({ 
              status: 'Translation failed: Invalid API key. Please check your API key in settings.', 
              progress: 0,
              error: 'AUTH_ERROR'
            });
            throw new Error('Translation failed: Invalid API key. Please check your API key in settings.');
          }
          // For other errors, log but continue without translation
          logError('Translation failed, continuing without translation', error);
          updateState({ status: 'Translation failed, using original text', progress: 60 });
        }
      } else {
        // No translation needed - skip to generation progress
        updateState({ progress: 60 });
      }
      
      // Generate abstract if enabled
      let abstract = '';
      if (data.generateAbstract && result.content && result.content.length > 0 && data.apiKey) {
        const abstractLang = data.language || 'auto';
        try {
          updateState({ status: 'Generating abstract...', progress: 62 });
          abstract = await generateAbstract(
            result.content, 
            result.title || data.title || 'Untitled',
            data.apiKey,
            data.model,
            abstractLang,
            updateState
          );
          if (abstract) {
            log('Abstract generated', { length: abstract.length });
            result.abstract = abstract;
          }
        } catch (error) {
          logWarn('Abstract generation failed, continuing without abstract', error);
          // Continue without abstract - not critical
        }
      }
      
      setResult(result);
      
      const outputFormat = data.outputFormat || 'pdf';
      
      // Detect content language for 'auto' mode to use correct localization
      let effectiveLanguage = data.language || 'auto';
      if (effectiveLanguage === 'auto' && result.content && result.content.length > 0 && data.apiKey) {
        try {
          const detectedLang = await detectContentLanguage(result.content, data.apiKey, data.model);
          if (detectedLang && detectedLang !== 'en') {
            effectiveLanguage = detectedLang;
            log('Using detected language for localization', { detectedLang });
          }
        } catch (error) {
          logWarn('Language detection failed, using auto', error);
        }
      }
      
      updateState({ stage: PROCESSING_STAGES.GENERATING.id, progress: 65 });
      
      if (outputFormat === 'markdown') {
        updateState({ status: 'Generating Markdown...', progress: 65 });
        return generateMarkdown({
          content: result.content,
          title: result.title,
          author: result.author || '',
          sourceUrl: data.url,
          publishDate: result.publishDate || '',
          generateToc: data.generateToc || false,
          generateAbstract: data.generateAbstract || false,
          abstract: result.abstract || '',
          language: effectiveLanguage,
          apiKey: data.apiKey,
          model: data.model
        }, updateState);
      } else if (outputFormat === 'epub') {
        updateState({ status: 'Generating EPUB...', progress: 65 });
        return generateEpub({
          content: result.content,
          title: result.title,
          author: result.author || '',
          sourceUrl: data.url,
          publishDate: result.publishDate || '',
          generateToc: data.generateToc || false,
          generateAbstract: data.generateAbstract || false,
          abstract: result.abstract || '',
          language: effectiveLanguage
        }, updateState);
      } else if (outputFormat === 'fb2') {
        updateState({ status: 'Generating FB2...', progress: 65 });
        return generateFb2({
          content: result.content,
          title: result.title,
          author: result.author || '',
          sourceUrl: data.url,
          publishDate: result.publishDate || '',
          generateToc: data.generateToc || false,
          generateAbstract: data.generateAbstract || false,
          abstract: result.abstract || '',
          language: effectiveLanguage
        }, updateState);
      } else if (outputFormat === 'audio') {
        updateState({ status: 'Generating audio...', progress: 65 });
        
        // Get TTS API key based on provider
        const ttsProvider = data.audioProvider || 'openai';
        let ttsApiKey = data.apiKey; // Default to main API key (OpenAI)
        
        if (ttsProvider === 'elevenlabs') {
          // Decrypt ElevenLabs API key if provided
          if (data.elevenlabsApiKey) {
            try {
              ttsApiKey = await decryptApiKey(data.elevenlabsApiKey);
              log('ElevenLabs API key decrypted', { 
                keyLength: ttsApiKey?.length,
                isAscii: /^[\x00-\x7F]*$/.test(ttsApiKey || ''),
                prefix: ttsApiKey?.substring(0, 3) + '...'
              });
            } catch (error) {
              logError('Failed to decrypt ElevenLabs API key', error);
              throw new Error('Invalid ElevenLabs API key. Please check your settings.');
            }
          } else {
            throw new Error('ElevenLabs API key is required. Please add it in settings.');
          }
        }
        
        return generateAudio({
          content: result.content,
          title: result.title,
          apiKey: data.apiKey, // For text preparation
          ttsApiKey: ttsApiKey, // For TTS conversion
          model: data.model,
          provider: ttsProvider,
          voice: data.audioVoice || 'nova',
          speed: data.audioSpeed || 1.0,
          format: data.audioFormat || 'mp3',
          language: effectiveLanguage,
          elevenlabsModel: data.elevenlabsModel || 'eleven_v3'
        }, updateState);
      } else {
        updateState({ status: 'Generating PDF...', progress: 65 });
        return generatePdf({ 
          content: result.content, 
          title: result.title,
          author: result.author || '',
          pageMode: data.pageMode || 'single',
          language: effectiveLanguage,
          sourceUrl: data.url,
          publishDate: result.publishDate || '',
          generateToc: data.generateToc || false,
          generateAbstract: data.generateAbstract || false,
          abstract: result.abstract || '',
          apiKey: data.apiKey,
          model: data.model,
          fontFamily: data.fontFamily || '',
          fontSize: data.fontSize || '31',
          bgColor: data.bgColor || '#303030',
          textColor: data.textColor || '#b9b9b9',
          headingColor: data.headingColor || '#cfcfcf',
          linkColor: data.linkColor || '#6cacff'
        }, updateState);
      }
    })
    .then(async () => {
      log('File generation complete');
      
      // Record stats
      const processingTime = processingStartTime ? Date.now() - processingStartTime : 0;
      const state = getProcessingState();
      const savedTitle = state.result?.title || data.title || 'Untitled';
      const savedFormat = data.outputFormat || 'pdf';
      
      await recordSave({
        title: savedTitle,
        url: data.url,
        format: savedFormat,
        processingTime
      });
      
      processingStartTime = null;
      completeProcessing(stopKeepAlive);
    })
    .catch(error => {
      // All processing errors are caught here - no unhandled rejections
      logError('Processing failed', error);
      processingStartTime = null;
      setError(error.message, stopKeepAlive);
    });
  
  // Returns immediately - processing continues in background via .then()/.catch()
  // This is intentional "fire and forget" pattern for Service Worker
  return true;
}

// ============================================
// MODE 1: SELECTOR MODE
// ============================================

async function processWithSelectorMode(data) {
  const { html, url, title, apiKey, model, tabId } = data;
  
  log('=== SELECTOR MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, tabId });
  
  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');
  if (!tabId) throw new Error('No tab ID provided');
  
  // Check cache first (if enabled)
  let selectors;
  let fromCache = false;
  const useCache = data.useCache !== false; // Default: true
  
  if (useCache) {
    const cached = await getCachedSelectors(url);
    if (cached) {
      selectors = cached.selectors;
      fromCache = true;
      updateState({ status: '⚡ Using cached selectors...', progress: 3 });
      log('Using cached selectors', { url, successCount: cached.successCount });
    }
  }
  
  if (!fromCache) {
    updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: 'AI analyzing page structure...', progress: 3 });
    
    // Trim HTML for analysis
    log('Trimming HTML for analysis...');
    const htmlForAnalysis = trimHtmlForAnalysis(html, CONFIG.MAX_HTML_FOR_ANALYSIS);
    log('Trimmed HTML', { originalLength: html.length, trimmedLength: htmlForAnalysis.length });
    
    // Get selectors from AI
    log('Requesting selectors from AI...');
    try {
      selectors = await getSelectorsFromAI(htmlForAnalysis, url, title, apiKey, model);
      log('Received selectors from AI', selectors);
    } catch (error) {
      logError('Failed to get selectors from AI', error);
      throw new Error(`AI selector analysis failed: ${error.message}`);
    }
    
    if (!selectors) {
      throw new Error('AI returned empty selectors');
    }
  }
  
  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: 'Extracting content from page...', progress: 5 });
  
  // Extract content using selectors
  log('Extracting content using selectors...', { tabId, selectors });
  let extractedContent;
  try {
    extractedContent = await extractContentWithSelectors(tabId, selectors, url);
    log('Content extracted', { 
      title: extractedContent?.title,
      contentItems: extractedContent?.content?.length || 0
    });
  } catch (error) {
    // Invalidate cache if extraction failed with cached selectors
    if (fromCache) {
      log('Extraction failed with cached selectors, invalidating cache');
      await invalidateCache(url);
    }
    logError('Failed to extract content with selectors', error);
    throw new Error(`Content extraction failed: ${error.message}`);
  }
  
  if (!extractedContent || !extractedContent.content) {
    if (fromCache) await invalidateCache(url);
    throw new Error('No content extracted from page');
  }
  
  if (extractedContent.content.length === 0) {
    if (fromCache) await invalidateCache(url);
    throw new Error(`Extracted content is empty. AI returned selectors: ${JSON.stringify(selectors)}. Try switching to "AI Extract" mode.`);
  }
  
  // Cache selectors after successful extraction
  if (!fromCache) {
    await cacheSelectors(url, selectors);
  } else {
    await markCacheSuccess(url);
  }
  
  updateState({ status: 'Processing complete', progress: 8 });
  
  const publishDate = selectors.publishDate || extractedContent.publishDate || '';
  let finalTitle = extractedContent.title || title;
  const finalAuthor = extractedContent.author || selectors.author || '';
  
  // Clean title: remove "от [Author]" / "by [Author]" patterns
  if (finalAuthor && finalTitle) {
    const authorPattern = new RegExp(`\\s*(от|by)\\s+${finalAuthor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    const cleanedTitle = finalTitle.replace(authorPattern, '').trim();
    if (cleanedTitle && cleanedTitle !== finalTitle) {
      finalTitle = cleanedTitle;
    }
    const genitivePattern = /\s*(от|by)\s+[\wА-Яа-яёЁ\s]+$/i;
    if (genitivePattern.test(finalTitle)) {
      const genitiveClean = finalTitle.replace(genitivePattern, '').trim();
      if (genitiveClean && genitiveClean.length > 2) {
        finalTitle = genitiveClean;
      }
    }
  }
  
  log('=== SELECTOR MODE END ===', { title: finalTitle, author: finalAuthor, items: extractedContent.content.length });
  
  return {
    title: finalTitle,
    author: finalAuthor,
    content: extractedContent.content,
    publishDate: publishDate
  };
}

async function getSelectorsFromAI(html, url, title, apiKey, model) {
  log('getSelectorsFromAI called', { url, model, htmlLength: html.length });
  
  const systemPrompt = SELECTOR_SYSTEM_PROMPT;
  const userPrompt = buildSelectorUserPrompt(html, url, title);
  
  log('Sending request to AI...', { model, promptLength: userPrompt.length });
  
  const parsed = await callAI(systemPrompt, userPrompt, apiKey, model, true);
  log('Parsed selectors', parsed);
  
  return parsed;
}

async function extractContentWithSelectors(tabId, selectors, baseUrl) {
  log('extractContentWithSelectors', { tabId, selectors, baseUrl });
  
  if (!tabId) {
    throw new Error('Tab ID is required for content extraction');
  }
  
  let results;
  try {
    // Execute extraction function directly in the page context
    // Using world: 'MAIN' to access page's DOM properly
    results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: extractFromPageInlined,
      args: [selectors, baseUrl]
    });
    log('Script executed', { resultsLength: results?.length });
  } catch (scriptError) {
    logError('Script execution failed', scriptError);
    throw new Error(`Failed to execute script on page: ${scriptError.message}`);
  }

  if (!results || !results[0]) {
    throw new Error('Script execution returned empty results');
  }
  
  if (results[0].error) {
    logError('Script execution error', results[0].error);
    throw new Error(`Script error: ${results[0].error.message || results[0].error}`);
  }
  
  if (!results[0].result) {
    throw new Error('Script returned no result');
  }

  log('Extraction result', { 
    title: results[0].result.title,
    contentItems: results[0].result.content?.length
  });
  
  return results[0].result;
}

// Inlined extraction function for chrome.scripting.executeScript
// This runs in the page's main world context
// 
// NOTE: This function is ~460 lines - DO NOT SPLIT IT!
// It's injected as a single block via executeScript. All helper functions
// must be defined inside. See systemPatterns.md "Design Decisions".
function extractFromPageInlined(selectors, baseUrl) {
  // Note: This function runs in page context, not service worker
  // Using console.log here is intentional - it appears in page console, not extension console
  console.log('[ClipAIble:Page] Starting extraction', { selectors, baseUrl });
  
  const content = [];
  const debugInfo = {
    containerFound: false,
    containerSelector: null,
    elementsProcessed: 0,
    elementsExcluded: 0,
    headingCount: 0
  };
  
  const tocMapping = {};
  let footnotesHeaderAdded = false;
  const addedImageUrls = new Set();
  
  // Helper functions
  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    try { return new URL(url, baseUrl).href; } catch (e) { return url; }
  }
  
  function normalizeText(text) {
    return (text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  
  function normalizeImageUrl(url) {
    if (!url) return '';
    try { return new URL(url, window.location.href).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
  }
  
  function isInfoboxDiv(element) {
    if (element.tagName.toLowerCase() !== 'div') return false;
    const className = element.className.toLowerCase();
    return ['spoiler', 'interview', 'terminology', 'infobox', 'note-box', 'callout'].some(cls => className.includes(cls));
  }
  
  function shouldExclude(element) {
    if (isInfoboxDiv(element) || element.tagName.toLowerCase() === 'aside' || element.tagName.toLowerCase() === 'details') return false;
    if (!selectors.exclude) return false;
    for (const selector of selectors.exclude) {
      try { if (element.matches(selector) || element.closest(selector)) return true; } catch (e) {}
    }
    return false;
  }
  
  function getFormattedHtml(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('a[href]').forEach(a => { a.href = toAbsoluteUrl(a.getAttribute('href')); });
    if (selectors.exclude) {
      selectors.exclude.forEach(sel => { try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch (e) {} });
    }
    return clone.innerHTML;
  }
  
  // Image helpers
  function isImageUrl(url) {
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
    const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
    const hosts = ['substackcdn', 'imgur', 'cloudinary', 'imgix', 'wp-content/uploads', 'media.', 'images.', 'cdn.'];
    const lowerUrl = url.toLowerCase();
    for (const ext of exts) { if (lowerUrl.includes(ext + '?') || lowerUrl.endsWith(ext) || lowerUrl.includes(ext + '#')) return true; }
    if (hosts.some(host => lowerUrl.includes(host))) return true;
    return false;
  }
  
  function isPlaceholderUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:') && url.length < 200) return true;
    return ['placeholder', 'spacer', 'blank.gif', 'pixel.gif', 'loading.'].some(p => lowerUrl.includes(p));
  }
  
  function isSmallOrAvatarImage(imgElement, src) {
    if (!src) return true;
    const resizeMatch = src.match(/resize:(fit|fill):(\d+)(?::(\d+))?/);
    if (resizeMatch) {
      const w = parseInt(resizeMatch[2]), h = resizeMatch[3] ? parseInt(resizeMatch[3]) : w;
      if (w < 100 || h < 100) return true;
    }
    if (imgElement) {
      const nw = imgElement.naturalWidth || 0, nh = imgElement.naturalHeight || 0;
      if (nw > 0 && nh > 0 && (nw < 100 || nh < 100)) return true;
      const cn = (imgElement.className || '').toLowerCase();
      if (cn.includes('avatar') || cn.includes('profile') || cn.includes('author')) return true;
    }
    return false;
  }
  
  function getBestSrcsetUrl(srcset) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(s => s);
    let bestUrl = null, bestScore = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part || part.startsWith('data:')) continue;
      const descMatch = part.match(/\s+(\d+(?:\.\d+)?[wx])$/i);
      let url = descMatch ? part.substring(0, part.length - descMatch[0].length).trim() : part;
      if (!url || url.startsWith('data:')) continue;
      url = url.replace(/^["']|["']$/g, '');
      if (!url.match(/^(https?:\/\/|\/\/|\/)/)) continue;
      let score = 1;
      if (descMatch) {
        const d = descMatch[1].toLowerCase();
        score = d.endsWith('w') ? (parseInt(d) || 1) : ((parseFloat(d) || 1) * 1000);
      }
      if (score >= bestScore) { bestScore = score; bestUrl = url; }
    }
    return bestUrl;
  }
  
  function isTrackingPixelOrSpacer(imgElement, src) {
    const w = imgElement?.naturalWidth || imgElement?.width || parseInt(imgElement?.getAttribute('width')) || 0;
    const h = imgElement?.naturalHeight || imgElement?.height || parseInt(imgElement?.getAttribute('height')) || 0;
    if ((w === 1 && h === 1) || (w === 0 && h === 0)) return true;
    if (src) {
      const ls = src.toLowerCase();
      if (ls.includes('spacer') || ls.includes('pixel') || ls.includes('tracking')) return true;
    }
    return false;
  }
  
  function extractBestImageUrl(imgElement, containerElement = null) {
    if (!imgElement) return null;
    let src = null;
    const container = containerElement || imgElement.parentElement;
    if (imgElement.currentSrc && !isPlaceholderUrl(imgElement.currentSrc)) src = imgElement.currentSrc;
    if (!src) {
      const parentLink = container?.closest('a[href]') || container?.querySelector('a[href]');
      if (parentLink) { const href = parentLink.getAttribute('href'); if (href && isImageUrl(href)) src = href; }
    }
    if (!src) { const imgSrc = imgElement.src || imgElement.getAttribute('src'); if (imgSrc && !isPlaceholderUrl(imgSrc)) src = imgSrc; }
    if (!src) src = getBestSrcsetUrl(imgElement.getAttribute('srcset'));
    if (!src) {
      const picture = imgElement.closest('picture') || container?.querySelector('picture');
      if (picture) { for (const source of picture.querySelectorAll('source[srcset]')) { const ss = getBestSrcsetUrl(source.getAttribute('srcset')); if (ss) src = ss; } }
    }
    if (!src) {
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-full-src']) {
        const val = imgElement.getAttribute(attr);
        if (val && !val.includes('data:')) { src = attr === 'data-srcset' ? getBestSrcsetUrl(val) : val; if (src) break; }
      }
    }
    return src;
  }
  
  function extractTocMapping(listElement) {
    const links = listElement.querySelectorAll('a[href^="#"]');
    if (links.length < 2) return false;
    let isToc = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const anchor = href.substring(1), text = normalizeText(link.textContent);
        if (text && anchor) { tocMapping[text] = anchor; isToc = true; }
      }
    });
    return isToc;
  }
  
  // Find containers
  let containers = [];
  let container = null;
  const aiSelectors = [selectors.content, selectors.articleContainer].filter(Boolean);
  
  for (const sel of aiSelectors) {
    try {
      const allElements = document.querySelectorAll(sel);
      if (allElements.length > 1) {
        containers = Array.from(allElements);
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        debugInfo.multipleContainers = true;
        debugInfo.containerCount = containers.length;
        break;
      } else if (allElements.length === 1) {
        container = allElements[0];
        debugInfo.containerFound = true;
        debugInfo.containerSelector = sel;
        break;
      }
    } catch (e) {}
  }
  
  if (container && containers.length === 0) {
    const articlesInside = container.querySelectorAll('article');
    if (articlesInside.length > 1) {
      containers = Array.from(articlesInside);
      debugInfo.multipleContainers = true;
      debugInfo.containerCount = containers.length;
      container = null;
    }
  }
  
  if (containers.length === 0 && !container) {
    container = document.body;
    debugInfo.containerSelector = 'body';
  }
  
  // Get title
  let articleTitle = '';
  if (selectors.title) {
    try { const titleEl = document.querySelector(selectors.title); if (titleEl) articleTitle = titleEl.textContent.trim(); } catch (e) {}
  }
  if (!articleTitle) {
    const allArticles = document.querySelectorAll('main article');
    if (allArticles.length > 1) {
      const h1OutsideMain = Array.from(document.querySelectorAll('h1')).find(h1 => !h1.closest('main'));
      if (h1OutsideMain) articleTitle = h1OutsideMain.textContent.trim();
    }
  }
  if (!articleTitle) { const h1 = document.querySelector('h1'); if (h1) articleTitle = h1.textContent.trim(); }
  
  let articleAuthor = selectors.author || '';
  if (articleAuthor) articleAuthor = articleAuthor.replace(/^by\s+/i, '').trim();
  
  let publishDate = '';
  for (const sel of ['time[datetime]', 'time', '[itemprop="datePublished"]', '.date', '.post-date']) {
    try {
      const dateEl = document.querySelector(sel);
      if (dateEl) {
        if (sel.startsWith('meta')) publishDate = dateEl.getAttribute('content') || '';
        else if (dateEl.hasAttribute('datetime')) publishDate = dateEl.getAttribute('datetime');
        else publishDate = dateEl.textContent.trim();
        if (publishDate) break;
      }
    } catch (e) {}
  }
  
  function getAnchorId(el) {
    if (el.id) return el.id;
    if (el.getAttribute && el.getAttribute('name')) return el.getAttribute('name');
    const fc = el.firstElementChild;
    if (fc) {
      const ct = fc.tagName?.toLowerCase();
      if (ct === 'a' || ct === 'span') {
        if (fc.id) return fc.id;
        if (fc.getAttribute && fc.getAttribute('name')) return fc.getAttribute('name');
      }
    }
    const nested = el.querySelector('a[id], a[name], span[id], span[name], sup[id], [id^="source"], [id^="ref"], [id^="cite"]');
    if (nested) return nested.id || nested.getAttribute('name') || '';
    return '';
  }
  
  function processElement(element) {
    if (shouldExclude(element)) { debugInfo.elementsExcluded++; return; }
    const tagName = element.tagName.toLowerCase();
    try { const style = window.getComputedStyle(element); if (style.display === 'none' || style.visibility === 'hidden') return; } catch (e) {}
    debugInfo.elementsProcessed++;
    const elementId = getAnchorId(element);
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const text = element.textContent.trim();
      const formattedText = getFormattedHtml(element);
      if (text && text !== articleTitle) {
        if (articleAuthor) {
          const tl = text.toLowerCase(), al = articleAuthor.toLowerCase();
          if (tl === al || (text.length < 50 && tl.includes(al))) return;
        }
        let headingId = elementId;
        if (!headingId) {
          const nh = normalizeText(text);
          if (tocMapping[nh]) headingId = tocMapping[nh];
          else headingId = String(debugInfo.headingCount + 1);
        }
        debugInfo.headingCount++;
        content.push({ type: 'heading', level: parseInt(tagName[1]), text: formattedText, id: headingId });
      }
    }
    else if (tagName === 'p') {
      let html = getFormattedHtml(element);
      if (html.trim()) {
        const pt = element.textContent?.trim() || '';
        if (articleAuthor && pt === articleAuthor) return;
        const ct = pt.replace(/[\s\u00A0]/g, '');
        if (ct.length <= 3 && /^[—–\-\._·•\*]+$/.test(ct)) return;
        if (elementId && !element.id && !html.startsWith(`<a id="${elementId}"`)) html = `<a id="${elementId}" name="${elementId}"></a>${html}`;
        content.push({ type: 'paragraph', text: html, id: elementId });
      }
    }
    else if (tagName === 'img') {
      if (element.closest('figure')) return;
      let src = extractBestImageUrl(element);
      src = toAbsoluteUrl(src);
      const ns = normalizeImageUrl(src);
      if (src && !isTrackingPixelOrSpacer(element, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(element, src)) {
        content.push({ type: 'image', src: src, alt: element.alt || '', id: elementId });
        addedImageUrls.add(ns);
      }
    }
    else if (tagName === 'figure') {
      const img = element.querySelector('img');
      const figcaption = element.querySelector('figcaption');
      if (img) {
        let src = extractBestImageUrl(img, element);
        src = toAbsoluteUrl(src);
        const ns = normalizeImageUrl(src);
        if (src && !isTrackingPixelOrSpacer(img, src) && !isPlaceholderUrl(src) && !addedImageUrls.has(ns) && !isSmallOrAvatarImage(img, src)) {
          const captionText = figcaption ? getFormattedHtml(figcaption) : '';
          content.push({ 
            type: 'image', 
            src: src, 
            alt: img.alt || '', 
            caption: captionText,
            id: elementId || img.id || '' 
          });
          addedImageUrls.add(ns);
        }
      }
    }
    else if (tagName === 'blockquote') {
      content.push({ type: 'quote', text: getFormattedHtml(element), id: elementId });
    }
    else if (tagName === 'ul' || tagName === 'ol') {
      if (Object.keys(tocMapping).length === 0) extractTocMapping(element);
      const items = Array.from(element.querySelectorAll(':scope > li')).map(li => {
        const liId = getAnchorId(li);
        let html = getFormattedHtml(li);
        if (liId && !html.includes(`id="${liId}"`)) html = `<a id="${liId}" name="${liId}"></a>${html}`;
        return { html, id: liId };
      }).filter(item => item.html);
      if (items.length > 0) content.push({ type: 'list', ordered: tagName === 'ol', items: items, id: elementId });
    }
    else if (tagName === 'pre') {
      const code = element.querySelector('code');
      const text = code ? code.textContent : element.textContent;
      const langClass = code?.className.match(/language-(\w+)/);
      content.push({ type: 'code', language: langClass ? langClass[1] : 'text', text: text, id: elementId });
    }
    else if (tagName === 'table') {
      const headers = Array.from(element.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(element.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => getFormattedHtml(td)));
      if (headers.length > 0 || rows.length > 0) content.push({ type: 'table', headers: headers, rows: rows, id: elementId });
    }
    else if (tagName === 'hr') {
      content.push({ type: 'separator', id: elementId });
    }
    else if (tagName === 'aside' || tagName === 'details' || isInfoboxDiv(element)) {
      const summary = element.querySelector(':scope > summary');
      const titleEl = element.querySelector(':scope > .spoiler-title, :scope > .interview-title, :scope > h3, :scope > h4');
      const titleText = summary ? summary.textContent.trim() : (titleEl ? titleEl.textContent.trim() : '');
      content.push({ type: 'infobox_start', title: titleText, id: elementId });
      for (const child of element.children) {
        const ct = child.tagName.toLowerCase();
        const isTitle = ct === 'summary' || child.classList.contains('spoiler-title') || (titleText && child.textContent.trim() === titleText);
        if (!isTitle) processElement(child);
      }
      content.push({ type: 'infobox_end' });
    }
    else if (tagName === 'div' || tagName === 'section' || tagName === 'article') {
      const cn = element.className?.toLowerCase() || '';
      const elId = element.id?.toLowerCase() || '';
      const isFootnotes = cn.includes('footnotes') || elId.includes('footnotes');
      if (isFootnotes && !footnotesHeaderAdded) {
        content.push({ type: 'separator', id: '' });
        content.push({ type: 'heading', level: 2, text: 'Notes', id: 'footnotes-section' });
        footnotesHeaderAdded = true;
      }
      for (const child of element.children) processElement(child);
    }
  }
  
  // Helper function to find content elements with fallback strategies
  function findContentElements(container, contentSelector, containerSelector) {
    if (!contentSelector || contentSelector === containerSelector) {
      return null; // No specific content selector
    }
    
    try {
      // Normalize selector: if it starts with container selector, remove it to make it relative
      let normalizedSelector = contentSelector;
      if (containerSelector && contentSelector.startsWith(containerSelector)) {
        // Remove container selector prefix (e.g., "body > p" -> "> p" when container is body)
        normalizedSelector = contentSelector.substring(containerSelector.length).trim();
        // If it starts with ">", remove it and add space, or just use as-is
        if (normalizedSelector.startsWith('>')) {
          normalizedSelector = normalizedSelector.substring(1).trim();
        }
      }
      
      // Strategy 1: Try normalized selector relative to container
      let elements = [];
      if (normalizedSelector) {
        elements = container.querySelectorAll(normalizedSelector);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      
      // Strategy 2: Try original selector as-is (in case normalization didn't help)
      elements = container.querySelectorAll(contentSelector);
      if (elements.length > 0) {
        return Array.from(elements);
      }
      
      // Strategy 3: If selector uses direct child (>), try without it to find nested elements
      if (normalizedSelector && normalizedSelector.includes(' > ')) {
        const flexibleSelector = normalizedSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      if (contentSelector.includes(' > ')) {
        const flexibleSelector = contentSelector.replace(/\s*>\s*/g, ' ');
        elements = container.querySelectorAll(flexibleSelector);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      
      // Strategy 4: Extract tag names and try to find them anywhere in container
      const tagMatch = (normalizedSelector || contentSelector).match(/([a-z]+)(?:\s|$)/i);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        elements = container.querySelectorAll(tagName);
        if (elements.length > 0) {
          return Array.from(elements);
        }
      }
      
      return null; // No elements found with any strategy
    } catch (e) {
      return null; // Selector is invalid
    }
  }
  
  // Start processing
  const containerSelector = selectors.articleContainer || 'body';
  if (containers.length > 0) {
    for (const cont of containers) {
      const contentElements = findContentElements(cont, selectors.content, containerSelector);
      if (contentElements && contentElements.length > 0) {
        // Process found elements
        for (const el of contentElements) {
          if (!shouldExclude(el)) processElement(el);
        }
      } else {
        // Fallback: process all children recursively
        for (const child of cont.children) processElement(child);
      }
    }
  } else if (container) {
    const contentElements = findContentElements(container, selectors.content, containerSelector);
    if (contentElements && contentElements.length > 0) {
      // Process found elements
      for (const el of contentElements) {
        if (!shouldExclude(el)) processElement(el);
      }
    } else {
      // Fallback: process all children recursively
      for (const child of container.children) processElement(child);
    }
  }
  
  // Note: This function runs in page context, not service worker
  // Using console.log here is intentional - it appears in page console, not extension console
  console.log('[ClipAIble:Page] Extraction complete', { contentItems: content.length, headingCount: debugInfo.headingCount });
  
  return { title: articleTitle, author: articleAuthor, content: content, publishDate: publishDate, debug: debugInfo };
}

// ============================================
// MODE 2: EXTRACT MODE
// ============================================

async function processWithExtractMode(data) {
  const { html, url, title, apiKey, model } = data;

  log('=== EXTRACT MODE START ===');
  log('Input data', { url, title, htmlLength: html?.length, model });

  if (!html) throw new Error('No HTML content provided');
  if (!apiKey) throw new Error('No API key provided');

  updateState({ stage: PROCESSING_STAGES.ANALYZING.id, status: 'Analyzing page...', progress: 5 });

  const chunks = splitHtmlIntoChunks(html, CONFIG.CHUNK_SIZE, CONFIG.CHUNK_OVERLAP);
  
  log('HTML split into chunks', { 
    totalLength: html.length, 
    chunkCount: chunks.length,
    chunkSizes: chunks.map(c => c.length)
  });

  updateState({ stage: PROCESSING_STAGES.EXTRACTING.id, status: 'Extracting content...', progress: 10 });
  
  let result;
  if (chunks.length === 1) {
    result = await processSingleChunk(chunks[0], url, title, apiKey, model);
  } else {
    result = await processMultipleChunks(chunks, url, title, apiKey, model);
  }
  
  log('=== EXTRACT MODE END ===', { title: result.title, items: result.content?.length });
  
  if (!result.content || result.content.length === 0) {
    throw new Error('AI Extract mode returned no content. The page may use dynamic loading. Try scrolling to load all content before saving.');
  }
  
  return result;
}

async function processSingleChunk(html, url, title, apiKey, model) {
  log('processSingleChunk', { url, htmlLength: html.length });
  
  const userPrompt = `Extract article content with ALL formatting preserved. Copy text EXACTLY.

Base URL: ${url}
Page title: ${title}

HTML:
${html}`;

  updateState({ status: 'AI is processing...', progress: 10 });
  
  const result = await callAI(EXTRACT_SYSTEM_PROMPT, userPrompt, apiKey, model, true);
  
  log('Single chunk result', { title: result.title, items: result.content?.length });
  
  updateState({ progress: 15 });
  return result;
}

async function processMultipleChunks(chunks, url, title, apiKey, model) {
  log('processMultipleChunks', { chunkCount: chunks.length, url });
  
  const allContent = [];
  let articleTitle = title;
  let publishDate = '';

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    
    log(`Processing chunk ${i + 1}/${chunks.length}`, { chunkLength: chunks[i].length, isFirst });
    
    const progressBase = 5 + Math.floor((i / chunks.length) * 10);
    updateState({ status: `Processing chunk ${i + 1}/${chunks.length}...`, progress: progressBase });

    const systemPrompt = buildChunkSystemPrompt(i, chunks.length);
    const userPrompt = buildChunkUserPrompt(chunks[i], url, title, i, chunks.length);

    try {
      const result = await callAI(systemPrompt, userPrompt, apiKey, model, true);
      
      log(`Chunk ${i + 1} result`, { title: result.title, contentItems: result.content?.length });
      
      if (isFirst) {
        if (result.title) articleTitle = result.title;
        if (result.publishDate) publishDate = result.publishDate;
      }
      
      if (result.content && Array.isArray(result.content)) {
        allContent.push(...result.content);
      }
    } catch (error) {
      logError(`Failed to process chunk ${i + 1}`, error);
      throw error;
    }
  }

  log('All chunks processed', { totalItems: allContent.length });
  
  const deduplicated = deduplicateContent(allContent);
  log('After deduplication', { items: deduplicated.length });

  return {
    title: articleTitle,
    content: deduplicated,
    publishDate: publishDate
  };
}

// ============================================
// API KEY MIGRATION
// ============================================

/**
 * Migrate existing plain text API keys to encrypted format
 * Runs once on extension startup
 */
async function migrateApiKeys() {
  try {
    
    const result = await chrome.storage.local.get([
      'openai_api_key',
      'claude_api_key',
      'gemini_api_key',
      'google_api_key',
      'api_keys_migrated' // Flag to prevent repeated migration
    ]);

    // Skip if already migrated
    if (result.api_keys_migrated) {
      log('API keys already migrated, skipping');
      return;
    }

    const keysToEncrypt = {};
    let hasChanges = false;

    // Check and encrypt each key if needed
    const keyNames = ['openai_api_key', 'claude_api_key', 'gemini_api_key', 'google_api_key'];
    
    for (const keyName of keyNames) {
      const value = result[keyName];
      if (value && typeof value === 'string' && !isEncrypted(value)) {
        // Key exists and is not encrypted, encrypt it
        try {
          keysToEncrypt[keyName] = await encryptApiKey(value);
          hasChanges = true;
          log(`Migrating ${keyName} to encrypted format`);
        } catch (error) {
          logError(`Failed to encrypt ${keyName}`, error);
          // Continue with other keys
        }
      }
    }

    if (hasChanges) {
      keysToEncrypt.api_keys_migrated = true;
      await chrome.storage.local.set(keysToEncrypt);
      log('API keys migrated to encrypted format', { count: Object.keys(keysToEncrypt).length - 1 });
    } else {
      // Mark as migrated even if no keys to encrypt
      await chrome.storage.local.set({ api_keys_migrated: true });
      log('API keys migration check completed (no keys to migrate)');
    }
  } catch (error) {
    logError('API keys migration failed', error);
    // Don't throw - migration failure shouldn't break extension
  }
}

log('Background script initialized');
