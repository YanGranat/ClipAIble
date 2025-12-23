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
import { sanitizeFilename } from '../utils/security.js';
import { PROCESSING_STAGES } from '../state/processing.js';

/**
 * Generate PDF from content
 * @param {GenerationData & {pageMode?: string, fontFamily?: string, fontSize?: string, bgColor?: string, textColor?: string, headingColor?: string, linkColor?: string}} data - Generation data with PDF-specific options
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update function
 * @returns {Promise<Blob>} Generated PDF blob
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
    throw new Error(tSync('errorPdfNoContent', uiLang));
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
    
    const [newAuthor, newDate] = await Promise.all([
      author ? translateMetadata(author, language, apiKey, model, 'author') : Promise.resolve(''),
      formattedDate ? translateMetadata(formattedDate, language, apiKey, model, 'date') : Promise.resolve('')
    ]);
    
    translatedAuthor = newAuthor || author;
    formattedDate = newDate || formattedDate;
    log('Metadata translated', { author: translatedAuthor, date: formattedDate });
  }
  
  try {
    if (updateState) updateState({ status: 'Loading styles...', progress: 72 });
    
    log('Loading CSS styles...');
    let styles;
    try {
      const stylesResponse = await fetch(chrome.runtime.getURL('config/pdf-styles.css'));
      if (!stylesResponse.ok) {
        throw new Error(`Failed to load styles: ${stylesResponse.status}`);
      }
      styles = await stylesResponse.text();
      log('Styles loaded', { length: styles.length });
    } catch (styleError) {
      logError('Failed to load styles', styleError);
      throw new Error(`Failed to load PDF styles: ${styleError.message}`);
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
      logError('Failed to store HTML', storageError);
      throw new Error(`Failed to store content: ${storageError.message}`);
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
      logError('Failed to create tab', tabError);
      const uiLang = await getUILanguage();
      throw new Error(tSync('errorPdfCreateTabFailed', uiLang).replace('{error}', tabError.message || 'unknown'));
    }

    log('Print page opened, it will handle the rest');
    log('=== PDF GENERATION END ===');
    return { success: true };

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
 * @param {Function} completeProcessing - Completion callback
 * @param {Function} setError - Error callback
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
      
      log('=== DOM CHECK RESULT (RAW) ===', { 
        hasResult: !!domCheckResult,
        resultKeys: domCheckResult ? Object.keys(domCheckResult) : [],
        resultType: domCheckResult?.result?.type,
        hasValue: !!domCheckResult?.result?.value,
        valueType: typeof domCheckResult?.result?.value,
        fullResult: domCheckResult
      });
      
      if (domCheckResult && domCheckResult.result) {
        if (domCheckResult.result.type === 'object' && domCheckResult.result.value) {
          const paraInfo = domCheckResult.result.value;
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
            resultType: domCheckResult.result.type,
            result: domCheckResult.result
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
    
    log('PDF generated', { dataLength: result.data?.length || 0 });
    
    // Detach debugger
    await chrome.debugger.detach(debuggee);
    log('Debugger detached');
    
    // Convert base64 to blob and download
    const pdfData = result.data;
    const filename = sanitizeFilename(title || 'article') + '.pdf';
    
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
        const downloadId = await chrome.downloads.download({
          url: objectUrl,
          filename: filename,
          saveAs: true
        });
        
        log('Download started', { downloadId, size: blob.size });
      } finally {
        // Revoke URL immediately - Chrome downloads API handles the download asynchronously
        // The URL is only needed to initiate the download, not to complete it
        urlApi.revokeObjectURL(objectUrl);
      }
    } else {
      // Fallback for MV3 service worker without createObjectURL
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

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


