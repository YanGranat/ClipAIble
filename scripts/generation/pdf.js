// @ts-check
// PDF generation module for ClipAIble extension

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData

import { log, logError, logWarn } from '../utils/logging.js';
import { escapeAttr, cleanTitle } from '../utils/html.js';
import { embedImages } from '../utils/images.js';
import { buildHtmlForPdf, applyCustomStyles } from './html-builder.js';
import { translateMetadata } from '../translation/index.js';
import { saveLargeData } from '../utils/storage.js';
import { getLocaleFromLanguage } from '../utils/config.js';
import { getUILanguage, tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError } from '../utils/error-handler.js';
import { sanitizeFilename } from '../utils/security.js';
import { PROCESSING_STAGES, isCancelled } from '../state/processing.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';

/**
 * Generate PDF from content
 * @param {import('../types.js').ExtendedGenerationData} data - Generation data with PDF-specific options (pageMode, fontFamily, fontSize, bgColor, textColor, headingColor, linkColor)
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<Blob|{success: boolean}>} Generated PDF blob (when using debugger API) or success object (when using print page)
 * @throws {Error} If content is empty
 * @throws {Error} If styles loading fails
 * @throws {Error} If PDF generation fails
 * @throws {Error} If image embedding fails
 * @throws {Error} If processing is cancelled
 * @see {@link DocumentGeneratorFactory.generate} For unified document generation interface
 * @see {@link generateEpub} For EPUB generation (similar structure)
 * @see {@link generateFb2} For FB2 generation (similar structure)
 * @example
 * // Generate PDF with custom styles
 * const pdfBlob = await generatePdf({
 *   content: contentItems,
 *   title: 'Article Title',
 *   author: 'Author Name',
 *   pageMode: 'single',
 *   bgColor: '#ffffff',
 *   textColor: '#000000',
 *   headingColor: '#333333',
 *   linkColor: '#0066cc',
 *   generateToc: true,
 *   generateAbstract: true
 * }, updateState);
 * const url = URL.createObjectURL(pdfBlob);
 * // Download or display PDF...
 */
export async function generatePdf(data, updateState) {
  const { 
    content, title, author = '', pageMode = 'single', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'auto', apiKey = '', model = 'gpt-5.1',
    fontFamily = '', fontSize = '31', bgColor = '#303030', textColor = '#b9b9b9',
    headingColor = '#cfcfcf', linkColor = '#6cacff'
  } = data;
  
  log('=== PDF GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, pageMode, generateToc });
  
  const uiLang = await getUILanguage();
  if (!content || content.length === 0) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content provided for PDF generation');
    const normalized = await handleError(noContentError, {
      source: 'pdfGeneration',
      errorType: 'noContentError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        hasContent: !!content,
        contentLength: content?.length || 0
      }
    });
    
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(normalized.userMessage || tSync('errorPdfNoContent', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    throw error;
  }
  
  // Translate metadata if language is set
  let translatedAuthor = author;
  let formattedDate = publishDate || '';
  
  // Format ISO date to readable format before translation
  if (formattedDate) {
    const isoMatch = formattedDate.match(/^(\d{4})-(\d{2})-(\d{2})(T|$)/);
    if (isoMatch) {
      try {
        const date = new Date(formattedDate);
        if (!isNaN(date.getTime())) {
      /** @type {Intl.DateTimeFormatOptions} */
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      const locale = getLocaleFromLanguage(language);
      formattedDate = date.toLocaleDateString(locale, options);
        } else {
          formattedDate = `${isoMatch[3]} ${isoMatch[2]} ${isoMatch[1]}`;
        }
      } catch (e) {
        formattedDate = `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
      }
    }
    log('Date pre-formatted from ISO', { original: publishDate, formatted: formattedDate });
  }
  
  if (language !== 'auto' && apiKey) {
    if (updateState) updateState({ status: 'Translating metadata...', progress: 68 });
    
    // CRITICAL: Clean author BEFORE translation to avoid translating "anonymous" to anonymous variants
    // If author is already anonymous, don't translate it
    const cleanedAuthorBeforeTranslation = cleanAuthor(author);
    const shouldTranslateAuthor = cleanedAuthorBeforeTranslation && author;
    
    const [newAuthor, newDate] = await Promise.all([
      shouldTranslateAuthor ? translateMetadata(author, language, apiKey, model, 'author') : Promise.resolve(''),
      formattedDate ? translateMetadata(formattedDate, language, apiKey, model, 'date') : Promise.resolve('')
    ]);
    
    // CRITICAL: Clean translated author to remove any anonymous variants
    // Translation might convert anonymous variants to other language variants
    translatedAuthor = cleanAuthor(newAuthor || cleanedAuthorBeforeTranslation || '');
    formattedDate = newDate || formattedDate;
    log('Metadata translated and cleaned', { 
      originalAuthor: author, 
      translatedAuthor: newAuthor, 
      cleanedAuthor: translatedAuthor,
      date: formattedDate 
    });
  }
  
  try {
    if (updateState) {
      const uiLang = await getUILanguage();
      updateState({ status: tSync('statusLoadingStyles', uiLang), progress: 72 });
    }
    
    log('Loading CSS styles...');
    let styles;
    try {
      const stylesResponse = await fetch(chrome.runtime.getURL('config/pdf-styles.css'));
      if (!stylesResponse.ok) {
        // Normalize HTTP error with context
        /** @type {import('../types.js').ExtendedError} */
        const httpError = new Error(`Failed to load styles: HTTP ${stylesResponse.status}`);
        httpError.status = stylesResponse.status;
        const normalized = await handleError(httpError, {
          source: 'pdfGeneration',
          errorType: 'stylesLoadError',
          logError: true,
          createUserMessage: false, // Keep existing localized message
          context: {
            operation: 'loadStyles',
            statusCode: stylesResponse.status
          }
        });
        
        const uiLang = await getUILanguageCached();
        const userMessage = normalized.userMessage || tSync('errorPdfLoadStylesFailed', uiLang).replace('{status}', String(stylesResponse.status));
        /** @type {import('../types.js').ExtendedError} */
        const error = new Error(userMessage);
        error.code = normalized.code;
        error.status = stylesResponse.status;
        error.originalError = normalized.originalError;
        error.context = normalized.context;
        throw error;
      }
      styles = await stylesResponse.text();
      log('Styles loaded', { length: styles.length });
    } catch (styleError) {
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(styleError, {
        source: 'pdfGeneration',
        errorType: 'stylesLoadError',
        logError: true,
        createUserMessage: false, // Keep existing localized message
        context: {
          operation: 'loadStyles',
          errorMessage: styleError instanceof Error ? styleError.message : 'Unknown error'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const errorMsg = styleError instanceof Error ? styleError.message : 'Unknown error';
      const userMessage = normalized.userMessage || tSync('errorPdfLoadStylesError', uiLang).replace('{error}', errorMsg);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    // Apply custom styles
    styles = applyCustomStyles(styles, pageMode, {
      fontFamily, fontSize, bgColor, textColor, headingColor, linkColor
    });
    log('Applied custom styles');
    
    if (updateState) updateState({ status: 'Building document...', progress: 78 });
    
    log('Building HTML document...');
    
    // DETAILED LOGGING: Log content before building HTML
    log('=== CONTENT BEFORE BUILDING HTML ===', {
      contentItemsCount: content?.length || 0,
      title,
      author: translatedAuthor,
      date: formattedDate,
      timestamp: Date.now()
    });
    
    // Log ALL content items with FULL text - NO TRUNCATION
    // Log each item separately to ensure full visibility in console
    if (content && Array.isArray(content)) {
      log('=== CONTENT ITEMS FOR HTML (ALL - FULL TEXT) ===', {
        totalItems: content.length
      });
      
      // Log each item separately for full visibility
      content.forEach((item, idx) => {
        log(`=== CONTENT ITEM FOR HTML [${idx}] ===`, {
          index: idx,
          type: item.type,
          text: item.text || item.html || '', // FULL TEXT - NO TRUNCATION
          textLength: (item.text || item.html || '').length,
          html: item.html || null, // FULL HTML - NO TRUNCATION
          hasGoogleTranslateText: (item.text || item.html || '').includes('Исходный текст') || (item.text || item.html || '').includes('Оцените этот перевод') || (item.text || item.html || '').includes('Google Переводчик')
        });
      });
    }
    
    // Collect headings and assign IDs for TOC
    if (generateToc) {
      log(`📑 Collecting headings for table of contents`);
    }
    const headings = [];
    const contentWithIds = content.map((item, index) => {
      if (item.type === 'heading' && item.level >= 2) {
        const text = item.text ? item.text.replace(/<[^>]*>/g, '').trim() : '';
        const id = item.id || `toc-heading-${index}`;
        headings.push({ text, level: item.level, id });
        return { ...item, id };
      }
      return item;
    });
    
    // Clean title from soft hyphens and special characters
    const cleanedTitle = cleanTitle(title || '');
    
    const htmlContent = buildHtmlForPdf(
      contentWithIds,
      cleanedTitle,
      translatedAuthor,
      styles,
      sourceUrl,
      formattedDate,
      language,
      generateToc,
      headings,
      generateAbstract,
      abstract
    );
    log('HTML built', { length: htmlContent.length, tocEnabled: generateToc, headingsCount: headings.length });
    if (generateToc && headings.length > 1) {
      log(`✅ Table of contents generated: ${headings.length} headings`);
    }
    
    // DETAILED LOGGING: Log FULL HTML content - NO TRUNCATION
    log('=== HTML CONTENT (FULL - NO TRUNCATION) ===', {
      htmlFull: htmlContent, // FULL HTML - NO TRUNCATION
      totalLength: htmlContent.length,
      hasGoogleTranslateWidget: htmlContent.includes('Исходный текст') || htmlContent.includes('Оцените этот перевод') || htmlContent.includes('Google Переводчик')
    });
    
    // Check for Google Translate widget text in final HTML
    const googleTranslateWidgetText = "Исходный текст Оцените этот перевод Ваш отзыв поможет нам улучшить Google Переводчик";
    if (htmlContent.includes(googleTranslateWidgetText)) {
      logWarn('!!! Google Translate widget text DETECTED in final HTML !!!', {
        widgetText: googleTranslateWidgetText,
        htmlContainsWidget: true
      });
    }
    
    // Check for Google Translate widget text in HTML
    const hasGoogleTranslateText = htmlContent.includes('Исходный текст') || 
                                   htmlContent.includes('Оцените этот перевод') ||
                                   htmlContent.includes('Ваш отзыв поможет нам улучшить Google') ||
                                   htmlContent.includes('Original text') ||
                                   htmlContent.includes('Rate this translation');
    
    if (hasGoogleTranslateText) {
      logWarn('=== GOOGLE TRANSLATE WIDGET TEXT DETECTED IN HTML ===', {
        hasRussianText: htmlContent.includes('Исходный текст'),
        hasEnglishText: htmlContent.includes('Original text'),
        htmlLength: htmlContent.length
      });
    }
    
    if (updateState) {
      // Get localized status
      const uiLang = await getUILanguage();
      const loadingStatus = tSync('stageLoadingImages', uiLang);
      updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, status: loadingStatus, progress: 82 });
    }
    
    log('Embedding images...', { 
      contentLength: content.length,
      imageItems: content.filter(item => item.type === 'image').length,
      imageSources: content.filter(item => item.type === 'image').map(img => img.src?.substring(0, 80) || 'no src')
    });
    const htmlWithImages = await embedImages(htmlContent, content, updateState, escapeAttr);
    log('Images embedded', { finalLength: htmlWithImages.length });
    
    // Store HTML in chrome.storage and open print page
    // Use large data storage with size checking and IndexedDB fallback
    log('Storing HTML in storage...');
    try {
      // Save large HTML with automatic fallback to IndexedDB if needed
      await saveLargeData('printHtml', htmlWithImages);
      
      // Save small metadata to chrome.storage
      await chrome.storage.local.set({
        printTitle: title,
        pageMode: pageMode
      });
      
      log('HTML stored in storage', { length: htmlWithImages.length, pageMode });
    } catch (storageError) {
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(storageError, {
        source: 'pdfGeneration',
      errorType: 'storageError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'storeHtmlContent',
          errorMessage: storageError instanceof Error ? storageError.message : 'Unknown error'
        }
      });
      
      const uiLang = await getUILanguageCached();
      const errorMsg = storageError instanceof Error ? storageError.message : 'Unknown error';
      const userMessage = normalized.userMessage || tSync('errorPdfStoreContentFailed', uiLang).replace('{error}', errorMsg);
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }
    
    const currentWindow = await chrome.windows.getCurrent();
    log('Current window', { id: currentWindow.id });
    
    if (updateState) updateState({ status: 'Opening PDF generator...', progress: 95 });
    
    // Open print page
    const printPageUrl = chrome.runtime.getURL('print/print.html');
    log('Opening print page', { url: printPageUrl });
    
    let tab;
    try {
      tab = await chrome.tabs.create({
        url: printPageUrl,
        active: true,
        windowId: currentWindow.id
      });
      log('Print tab created', { tabId: tab.id });
    } catch (tabError) {
      // Normalize error with context for better logging and error tracking
      const normalized = await handleError(tabError, {
        source: 'pdfGeneration',
      errorType: 'tabCreationError',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
        context: {
          operation: 'createPrintTab',
          errorMessage: tabError.message || 'unknown'
        }
      });
      
      const uiLang = await getUILanguage();
      const userMessage = normalized.userMessage || tSync('errorPdfCreateTabFailed', uiLang).replace('{error}', tabError.message || 'unknown');
      /** @type {import('../types.js').ExtendedError} */
      const error = new Error(userMessage);
      error.code = normalized.code;
      error.originalError = normalized.originalError;
      error.context = normalized.context;
      throw error;
    }

    log('Print page opened, it will handle the rest');
    log('=== PDF GENERATION END ===');
    // Note: Function signature says it returns Blob, but in practice it returns success object
    // The actual PDF generation happens in the print page
    /** @type {any} */
    const result = { success: true };
    return result;

  } catch (error) {
    logError('PDF generation failed', error);
    throw error;
  }
}

/**
 * Generate PDF using Chrome DevTools Protocol via debugger API
 * @param {number} tabId - Tab ID
 * @param {string} title - Document title
 * @param {string} pageMode - 'single' or 'multi'
 * @param {number} contentWidth - Content width
 * @param {number} contentHeight - Content height
 * @param {import('../types.js').CompleteProcessingFunction} completeProcessing - Completion callback
 * @param {import('../types.js').SetErrorFunction} setError - Error callback
 */
export async function generatePdfWithDebugger(tabId, title, pageMode, contentWidth, contentHeight, completeProcessing, setError) {
  log('=== DEBUGGER PDF START ===');
  log('Input', { tabId, title, pageMode, contentWidth, contentHeight });
  
  const debuggee = { tabId };
  
  try {
    // Attach debugger to the tab
    log('Attaching debugger...');
    await chrome.debugger.attach(debuggee, '1.3');
    log('Debugger attached');
    
    // Calculate page size
    const paperWidth = 8.27; // A4 width in inches
    const a4Height = 11.69;
    
    let paperHeight;
    if (pageMode === 'single') {
      const printPaddingInches = 0.2;
      paperHeight = Math.max(a4Height, (contentHeight / 96) + printPaddingInches);
      log(`Single page: ${paperWidth}x${paperHeight.toFixed(2)} inches`);
    } else {
      paperHeight = a4Height;
      log(`A4 mode: ${paperWidth}x${paperHeight} inches`);
    }
    
    // CRITICAL: Before generating PDF, check what's actually in the DOM using Chrome DevTools Protocol
    // chrome.scripting.executeScript doesn't work on extension pages, so use Runtime.evaluate
    try {
      // Enable Runtime domain first
      await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
      
      log('=== ATTEMPTING DOM CHECK VIA DEVTOOLS PROTOCOL ===', { tabId, timestamp: Date.now() });
      
      const domCheckResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
        expression: `
          (function() {
            const firstParagraph = document.querySelector('.article-content p, article p, .article p');
            if (firstParagraph) {
              return {
                textContent: firstParagraph.textContent || '',
                innerHTML: firstParagraph.innerHTML || '',
                hasDataOriginalText: firstParagraph.hasAttribute('data-original-text'),
                dataOriginalText: firstParagraph.getAttribute('data-original-text') || null,
                hasGtOrig: firstParagraph.hasAttribute('data-gt-orig-display'),
                gtOrig: firstParagraph.getAttribute('data-gt-orig-display') || null,
                allAttributes: Array.from(firstParagraph.attributes).map(attr => ({ name: attr.name, value: attr.value }))
              };
            }
            return null;
          })()
        `,
        returnByValue: true
      });
      
      // Type assertion for Chrome DevTools Protocol response
      /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
      const typedResult = domCheckResult || {};
      
      log('=== DOM CHECK RESULT (RAW) ===', { 
        hasResult: !!domCheckResult,
        resultKeys: domCheckResult ? Object.keys(domCheckResult) : [],
        resultType: typedResult.result?.type,
        hasValue: !!typedResult.result?.value,
        valueType: typeof typedResult.result?.value,
        fullResult: domCheckResult
      });
      
      if (typedResult.result) {
        if (typedResult.result.type === 'object' && typedResult.result.value) {
          const paraInfo = typedResult.result.value;
          log('=== DOM CHECK BEFORE Page.printToPDF (via DevTools Protocol) ===', {
            textContent: paraInfo.textContent,
            innerHTML: paraInfo.innerHTML,
            hasDataOriginalText: paraInfo.hasDataOriginalText,
            dataOriginalText: paraInfo.dataOriginalText,
            hasGtOrig: paraInfo.hasGtOrig,
            gtOrig: paraInfo.gtOrig,
            allAttributes: paraInfo.allAttributes
          });
        } else {
          logWarn('DOM check returned unexpected result type', { 
            resultType: typedResult.result.type,
            result: typedResult.result
          });
        }
      } else {
        logWarn('DOM check returned no result', { domCheckResult });
      }
    } catch (domCheckError) {
      logWarn('Failed to check DOM before PDF generation via DevTools Protocol', { 
        error: domCheckError.message,
        errorStack: domCheckError.stack,
        errorName: domCheckError.name
      });
    }
    
    // CRITICAL: Try to disable Google Translate before PDF generation
    // This might help prevent Google Translate from interfering during PDF rendering
    try {
      log('=== ATTEMPTING TO DISABLE GOOGLE TRANSLATE VIA DEVTOOLS PROTOCOL ===', { tabId, timestamp: Date.now() });
      
      // Try to remove Google Translate widget if it exists
      await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
        expression: `
          (function() {
            // Remove Google Translate widget
            const gtWidget = document.querySelector('[id*="google_translate"], [class*="goog-te"], [class*="skiptranslate"]');
            if (gtWidget) {
              gtWidget.remove();
            }
            
            // Remove all Google Translate scripts
            const gtScripts = document.querySelectorAll('script[src*="translate.googleapis.com"], script[src*="translate.google.com"]');
            gtScripts.forEach(script => script.remove());
            
            // Set document.documentElement attributes to prevent translation
            document.documentElement.setAttribute('translate', 'no');
            document.documentElement.setAttribute('class', 'notranslate');
            document.documentElement.setAttribute('data-translate', 'no');
            
            // Set body attributes
            if (document.body) {
              document.body.setAttribute('translate', 'no');
              document.body.setAttribute('class', 'notranslate');
              document.body.setAttribute('data-translate', 'no');
            }
            
            // Add notranslate class to all paragraphs
            const paragraphs = document.querySelectorAll('p');
            paragraphs.forEach(p => {
              p.setAttribute('translate', 'no');
              p.classList.add('notranslate');
              p.setAttribute('data-translate', 'no');
            });
            
            return {
              removedWidget: !!gtWidget,
              removedScripts: gtScripts.length,
              paragraphsModified: paragraphs.length
            };
          })()
        `,
        returnByValue: true
      });
      
      log('=== GOOGLE TRANSLATE DISABLED VIA DEVTOOLS PROTOCOL ===', { timestamp: Date.now() });
    } catch (disableGtError) {
      logWarn('Failed to disable Google Translate via DevTools Protocol', { 
        error: disableGtError.message,
        errorStack: disableGtError.stack,
        errorName: disableGtError.name
      });
    }
    
    // Generate PDF
    log('Generating PDF...');
    const result = await chrome.debugger.sendCommand(debuggee, 'Page.printToPDF', {
      paperWidth: paperWidth,
      paperHeight: paperHeight,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      preferCSSPageSize: false,
      scale: 1,
      displayHeaderFooter: false,
      headerTemplate: '',
      footerTemplate: '',
      generateTaggedPDF: true,
      generateDocumentOutline: true
    });
    
    // Type assertion for Chrome DevTools Protocol response
    /** @type {{data?: string}} */
    const typedPdfResult = result || {};
    
    log('PDF generated', { dataLength: typedPdfResult.data?.length || 0 });
    
    // Detach debugger
    await chrome.debugger.detach(debuggee);
    log('Debugger detached');
    
    // Convert base64 to blob and download
    const pdfData = typedPdfResult.data;
    const filename = sanitizeFilename(title || 'article') + '.pdf';
    
    // Check if processing was cancelled before downloading
    if (isCancelled()) {
      log('Processing cancelled, skipping PDF download');
      throw new Error(tSync('statusCancelled', await getUILanguage()));
    }
    
    log('Downloading PDF...', { filename });
    
    // Convert base64 to blob and use object URL when available; fallback to data URL in SW
    const binary = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
    const blob = new Blob([binary], { type: 'application/pdf' });
    const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
      ? URL
      : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);

    if (urlApi && urlApi.createObjectURL) {
      const objectUrl = urlApi.createObjectURL(blob);
      try {
        // Check again before actual download
        if (isCancelled()) {
          log('Processing cancelled, skipping PDF download');
          throw new Error(tSync('statusCancelled', await getUILanguage()));
        }
        
        const downloadId = await chrome.downloads.download({
          url: objectUrl,
          filename: filename,
          saveAs: true
        });
        
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        log('📊 PDF file generated', {
          size: `${sizeMB} MB`,
          sizeBytes: blob.size,
          downloadId
        });
        log('Download started', { downloadId, size: blob.size });
      } finally {
        // Revoke URL immediately - Chrome downloads API handles the download asynchronously
        // The URL is only needed to initiate the download, not to complete it
        urlApi.revokeObjectURL(objectUrl);
      }
    } else {
      // Fallback for MV3 service worker without createObjectURL
      logWarn('⚠️ FALLBACK: createObjectURL unavailable - using data URL method (slower, larger memory)', {
        reason: 'URL.createObjectURL not available in MV3 service worker',
        method: 'data URL via FileReader (fallback)',
        impact: 'Slower download, higher memory usage',
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`
      });
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Check again before actual download
      if (isCancelled()) {
        log('Processing cancelled, skipping PDF download');
        throw new Error(tSync('statusCancelled', await getUILanguage()));
      }

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      });

      log('Download started (data URL fallback)', { downloadId, size: blob.size });
    }
    
    // Close the print tab
    setTimeout(async () => {
      try {
        await chrome.tabs.remove(tabId);
        log('Print tab closed');
      } catch (e) {
        // Tab might already be closed
      }
    }, 1000);
    
    log('=== DEBUGGER PDF END ===');
    
    if (completeProcessing) completeProcessing();
    return { success: true };
    
  } catch (error) {
    logError('Debugger PDF failed', error);
    
    // Try to detach debugger on error
    try {
      await chrome.debugger.detach(debuggee);
    } catch (e) {
      // Ignore detach errors
    }
    
    if (setError) setError(error.message);
    throw error;
  }
}


