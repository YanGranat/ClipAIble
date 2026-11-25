// @ts-check
// PDF generation module for ClipAIble extension

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData

import { log, logError, logWarn } from '../utils/logging.js';
import { escapeAttr, cleanTitle } from '../utils/html.js';
import { embedImages } from '../utils/images.js';
import { buildHtmlForPdf, applyCustomStyles } from './html-builder.js';
import { putPrintJob, removePrintJob } from '../api/print-storage.js';
import { downloadBlob } from '../api/blob-download.js';
import { closeOwnedPrintTab } from '../api/print-lifecycle.js';
import { formatDateForDisplay } from '../utils/config.js';
import { getUILanguage, tSync, formatStatusUpdate } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { filterFigureParagraphs } from './content.js';
import { sanitizeFilename } from '../utils/security.js';
import { PROCESSING_STAGES, isCancelled, getProcessingRunId } from '../state/processing.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { getDefaultModel } from '../utils/model-catalog.js';
import { PDF_MAX_SINGLE_PAGE_INCHES, PDF_PAGE_MARGIN_MM, preparePdfLayout } from './pdf-layout.js';


/**
 * Generate PDF from content
 * @param {import('../types.js').ExtendedGenerationData} data - Generation data with PDF-specific options (pageMode, fontFamily, fontSize, bgColor, textColor, headingColor, linkColor)
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<import('../types.js').PdfGenerationResult>} Deferred print admission
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
 * await generatePdf({
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
 */
export async function generatePdf(data, updateState) {
  const processingRunId = data.processingRunId ?? getProcessingRunId();
  const printJobId = crypto.randomUUID();
  let printTabId;
  const { 
    content, title, author = '', pageMode = 'single', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'auto', apiKey = '',
    model = getDefaultModel(data.aiRequestOptions?.provider || data.provider),
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
    Object.assign(error, getErrorTranslation(normalized));
    throw error;
  }
  
  const formattedDate = formatDateForDisplay(publishDate, language);
  const documentAuthor = cleanAuthor(author);
  
  try {
    if (updateState) {
      const uiLang = await getUILanguage();
      updateState({ ...formatStatusUpdate('statusLoadingStyles', await getUILanguage()), progress: 72 });
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
        Object.assign(error, getErrorTranslation(normalized));
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
      Object.assign(error, getErrorTranslation(normalized));
      throw error;
    }
    
    // Apply custom styles
    styles = applyCustomStyles(styles, pageMode, {
      fontFamily, fontSize, bgColor, textColor, headingColor, linkColor
    });
    log('Applied custom styles');
    
    if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingPdf', await getUILanguage()), progress: 78 });
    
    log('Building HTML document...');
    
    // Filter out paragraph elements that contain <figure> HTML when followed by image
    // This prevents duplicate content: AI Selector mode may return both <figure> HTML as paragraph
    // AND the same image separately as image type with caption, causing text duplication
    const filteredContent = filterFigureParagraphs(content, sourceUrl);
    if (filteredContent.length !== content.length) {
      log('Filtered figure-in-paragraph duplicates', {
        originalCount: content.length,
        filteredCount: filteredContent.length,
        removedCount: content.length - filteredContent.length
      });
    }
    
    // DETAILED LOGGING: Log content before building HTML
    log('=== CONTENT BEFORE BUILDING HTML ===', {
      contentItemsCount: filteredContent?.length || 0,
      title,
      author: documentAuthor,
      date: formattedDate,
      timestamp: Date.now()
    });
    
    // Log ALL content items with FULL text - NO TRUNCATION
    // Log each item separately to ensure full visibility in console
    if (filteredContent && Array.isArray(filteredContent)) {
      log('=== CONTENT ITEMS FOR HTML (ALL - FULL TEXT) ===', {
        totalItems: filteredContent.length
      });
      
      // Log each item separately for full visibility
      filteredContent.forEach((item, idx) => {
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
    
    const cleanedTitle = cleanTitle(title || '');
    const htmlContent = buildHtmlForPdf(
      filteredContent,
      cleanedTitle,
      documentAuthor,
      styles,
      sourceUrl,
      formattedDate,
      language,
      generateToc,
      generateAbstract,
      abstract,
      data.titleFragmentIds
    );
    log('HTML built', { length: htmlContent.length, tocEnabled: generateToc });

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
      updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, ...formatStatusUpdate('stageLoadingImages', await getUILanguage()), progress: 82 });
    }
    
    log('Embedding images...', { 
      contentLength: content.length,
      imageItems: content.filter(item => item.type === 'image').length,
      imageSources: content.filter(item => item.type === 'image').map(img => img.src?.substring(0, 80) || 'no src')
    });
    const htmlWithImages = await embedImages(htmlContent, content, updateState, escapeAttr, { processingRunId });
    log('Images embedded', { finalLength: htmlWithImages.length });
    
    // Store HTML in chrome.storage and open print page
    // Use large data storage with size checking and IndexedDB fallback
    log('Storing HTML in storage...');
    try {
      // Save large HTML with automatic fallback to IndexedDB if needed
      if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
      await putPrintJob(printJobId, {
        html: htmlWithImages,
        title,
        sourceUrl,
        pageMode,
        processingRunId
      });
      if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
      
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
      Object.assign(error, getErrorTranslation(normalized));
      throw error;
    }
    
    const currentWindow = await chrome.windows.getCurrent();
    log('Current window', { id: currentWindow.id });
    
    if (updateState) updateState({ ...formatStatusUpdate('statusOpeningPdfGenerator', await getUILanguage()), progress: 95 });
    
    // Keep the source tab and toolbar popup active while the print page renders.
    const printPageUrl = `${chrome.runtime.getURL('print/print.html')}?job=${encodeURIComponent(printJobId)}`;
    log('Opening print page', { url: printPageUrl });
    
    let tab;
    try {
      if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
      tab = await chrome.tabs.create({
        url: printPageUrl,
        active: false,
        windowId: currentWindow.id
      });
      printTabId = tab.id;
      if (isCancelled(processingRunId)) {
        await chrome.tabs.remove(tab.id);
        throw new Error('Processing cancelled');
      }
      updateState?.({ pdfPrintTabId: tab.id, pdfPrintJobId: printJobId });
      await chrome.tabs.get(tab.id);
      if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
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
      Object.assign(error, getErrorTranslation(normalized));
      throw error;
    }

    log('Print page opened, it will handle the rest');
    log('=== PDF GENERATION END ===');
    const result = { success: true, deferred: true };
    return result;

  } catch (error) {
    try {
      await removePrintJob(printJobId);
      await closeOwnedPrintTab(printTabId, printJobId);
    } catch (cleanupError) {
      logWarn('Failed to remove PDF preparation data', { error: cleanupError.message });
    }
    logError('PDF generation failed', error);
    throw error;
  }
}

/**
 * Generate PDF using Chrome DevTools Protocol via debugger API
 * @param {number} tabId - Tab ID
 * @param {string} title - Document title
 * @param {string} pageMode - 'single' or 'multi'
 * @param {import('../types.js').CompleteProcessingFunction} completeProcessing - Completion callback
 * @param {import('../types.js').SetErrorFunction} setError - Error callback
 */
export async function generatePdfWithDebugger(tabId, title, pageMode, completeProcessing, setError, processingRunId) {
  log('=== DEBUGGER PDF START ===');
  log('Input', { tabId, title, pageMode });
  
  const debuggee = { tabId };
  let attached = false;
  let ownedJobId;
  
  try {
    if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) {
      try {
        const actual = new URL(tab.url);
        const expected = new URL(chrome.runtime.getURL('print/print.html'));
        if (actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname) ownedJobId = actual.searchParams.get('job');
      } catch {}
    }
    if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
    // Attach debugger to the tab
    log('Attaching debugger...');
    await chrome.debugger.attach(debuggee, '1.3');
    attached = true;
    log('Debugger attached');
    
    // Calculate page size
    const paperWidth = 8.27; // A4 width in inches
    const a4Height = 11.69;
    
    await chrome.debugger.sendCommand(debuggee, 'Emulation.setEmulatedMedia', { media: 'print' });
    const layoutResult = /** @type {{result?: {value?: {contentHeight?: number, pageMode?: string}}, exceptionDetails?: unknown}} */ (await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
      expression: `(${preparePdfLayout.toString()})(${paperWidth}, ${JSON.stringify(pageMode)}, ${a4Height}, ${PDF_PAGE_MARGIN_MM}, ${PDF_MAX_SINGLE_PAGE_INCHES})`,
      awaitPromise: true,
      returnByValue: true
    }));
    if (layoutResult.exceptionDetails) throw new Error('Failed to prepare the PDF print layout.');
    const layout = layoutResult.result?.value;
    if (!Number.isFinite(layout?.contentHeight) || layout.contentHeight <= 0) throw new Error('Invalid PDF print dimensions.');
    let paperHeight;
    if (pageMode === 'single' && layout.pageMode !== 'multi') {
      paperHeight = layout.contentHeight / 96;
      log(`Single page: ${paperWidth}x${paperHeight.toFixed(2)} inches`);
    } else {
      paperHeight = a4Height;
      log(`A4 mode: ${paperWidth}x${paperHeight} inches`);
    }
    
    // Generate PDF
    if (isCancelled(processingRunId)) throw new Error('Processing cancelled');
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
    
    /** @type {{data?: string}} */
    const pdf = result || {};
    const translationKey = 'errorPdfGenerationFailed';
    const binary = typeof pdf.data === 'string' ? atob(pdf.data) : '';
    if (!binary.startsWith('%PDF-')) {
      throw Object.assign(new Error(tSync(translationKey, await getUILanguageCached())), { translationKey });
    }

    await chrome.debugger.detach(debuggee);
    attached = false;
    if (isCancelled(processingRunId)) throw new Error('Processing cancelled');

    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    await downloadBlob(new Blob([bytes], { type: 'application/pdf' }), sanitizeFilename(title || 'article') + '.pdf', processingRunId);

    if (!isCancelled(processingRunId) && completeProcessing) await completeProcessing();
    return { success: true };

  } catch (error) {
    logError('Debugger PDF failed', error);
    if (!isCancelled(processingRunId) && setError) {
      await setError({ message: error.message, ...getErrorTranslation(error) });
    }
    throw error;
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch {}
    }
    await closeOwnedPrintTab(tabId, ownedJobId);
  }
}


