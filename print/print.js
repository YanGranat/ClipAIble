// Print page script - prepares content and signals background for PDF generation

import { getLargeData, removeLargeData } from '../scripts/utils/storage.js';
import { cleanTitleForFilename } from '../scripts/utils/html.js';

const LOG_PREFIX = '[ClipAIble:Print]';

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

async function init() {
  // NOTE: setTimeout delays below (200ms, 300ms) are render/reflow waits.
  // They are NOT magic numbers to extract - contextually clear, used once.
  log('=== INIT START ===');
  
  try {
    // Get HTML from storage (checks both chrome.storage and IndexedDB)
    const printHtml = await getLargeData('printHtml');
    
    if (!printHtml) {
      throw new Error('No content in storage');
    }
    
    // Get metadata from chrome.storage
    const result = await chrome.storage.local.get(['printTitle', 'pageMode']);
    
    // Use cleanTitleForFilename to remove invalid filename chars (print page title is used for PDF filename)
    const title = cleanTitleForFilename(result.printTitle, 'Untitled');
    const pageMode = result.pageMode || 'single';
    
    log(`Content loaded: ${printHtml.length} chars, pageMode=${pageMode}`);
    
    // Write HTML to document
    document.open();
    document.write(printHtml);
    document.close();
    document.title = title;
    
    log('Document written');
    
    // Wait for render
    await new Promise(r => setTimeout(r, 300));
    
    // Wait for images
    const images = document.querySelectorAll('img');
    log(`Waiting for ${images.length} images...`);
    
    await Promise.all(Array.from(images).map(img => {
      return new Promise(resolve => {
        if (img.complete) resolve();
        else {
          img.onload = resolve;
          img.onerror = resolve;
        }
      });
    }));
    
    log('Images loaded');
    await new Promise(r => setTimeout(r, 200));
    
    // Get article element
    const article = document.querySelector('.article') || document.body;
    
    // For single page mode, fix width to match print layout
    // @media print has padding: 5mm on body = 19px on each side
    // So content width = A4 width - 2*padding = 794 - 38 = 756px
    if (pageMode === 'single') {
      const printPaddingPx = 19; // 5mm at 96dpi
      const a4WidthPx = 794; // 8.27 inches * 96 dpi
      const contentWidthPx = a4WidthPx - (printPaddingPx * 2);
      
      article.style.width = contentWidthPx + 'px';
      article.style.maxWidth = contentWidthPx + 'px';
      document.body.style.width = contentWidthPx + 'px';
      
      // Wait for reflow
      await new Promise(r => setTimeout(r, 200));
      log(`Fixed width to ${contentWidthPx}px (A4 minus padding)`);
    }
    
    // Measure content height accurately
    const contentWidth = article.offsetWidth;
    
    // Get multiple height measurements
    const articleScrollH = article.scrollHeight;
    const articleOffsetH = article.offsetHeight;
    const bodyScrollH = document.body.scrollHeight;
    const documentH = document.documentElement.scrollHeight;
    
    // Use the most accurate height - typically scrollHeight is most reliable
    // But compare with body height to catch any outliers
    const contentHeight = Math.ceil(Math.min(articleScrollH, bodyScrollH, documentH));
    
    log(`Height measurements: articleScroll=${articleScrollH}, articleOffset=${articleOffsetH}, bodyScroll=${bodyScrollH}, doc=${documentH}, using=${contentHeight}`);
    
    log(`Content dimensions: ${contentWidth}x${contentHeight}px`);
    
    // Send message to background to generate PDF via debugger
    log('Requesting PDF generation from background...');
    
    const response = await chrome.runtime.sendMessage({
      action: 'generatePdfDebugger',
      data: {
        title: title,
        pageMode: pageMode,
        contentWidth: contentWidth,
        contentHeight: contentHeight
      }
    });
    
    if (response && response.success) {
      log('PDF generation started');
      // Tab will be closed by background script after PDF is saved
    } else {
      throw new Error(response?.error || 'PDF generation failed');
    }
    
    log('=== DONE ===');
    
  } catch (error) {
    console.error(`${LOG_PREFIX} ERROR:`, error);
    // Error message - no localization needed as this is a fallback error page
    document.body.innerHTML = `<div style="padding:40px;color:red;font-family:sans-serif;">
      <h2>Error</h2>
      <p>${error.message}</p>
    </div>`;
  } finally {
    // Always clean up storage, even if error occurred
    try {
      await removeLargeData('printHtml');
      await chrome.storage.local.remove(['printTitle', 'pageMode']);
      log('Storage cleaned up');
    } catch (cleanupError) {
      log(`Failed to clean up storage: ${cleanupError.message}`);
    }
  }
}

init();
