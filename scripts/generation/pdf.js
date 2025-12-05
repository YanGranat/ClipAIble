// PDF generation module for Webpage to PDF extension

import { log, logError, logWarn } from '../utils/logging.js';
import { escapeAttr } from '../utils/html.js';
import { embedImages } from '../utils/images.js';
import { buildHtmlForPdf, applyCustomStyles } from './html-builder.js';
import { translateMetadata } from '../translation/index.js';
import { saveLargeData } from '../utils/storage.js';
import { getLocaleFromLanguage } from '../utils/config.js';

/**
 * Generate PDF from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
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
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate PDF');
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
    const cleanTitle = (title || '')
      .replace(/\u00AD/g, '')
      .replace(/\u200B/g, '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    
    const htmlContent = buildHtmlForPdf(
      contentWithIds,
      cleanTitle,
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
    
    if (updateState) {
      updateState({ stage: 'loading_images', status: 'Loading images...', progress: 82 });
    }
    
    log('Embedding images...');
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
      throw new Error(`Failed to create tab: ${tabError.message}`);
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
    const filename = (title || 'article').replace(/[<>:"/\\|?*]/g, '-') + '.pdf';
    
    log('Downloading PDF...', { filename });
    
    const downloadId = await chrome.downloads.download({
      url: 'data:application/pdf;base64,' + pdfData,
      filename: filename,
      saveAs: true
    });
    
    log('Download started', { downloadId });
    
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


