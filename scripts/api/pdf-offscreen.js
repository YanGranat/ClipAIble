// @ts-check
// PDF extraction using Offscreen Document API
// This is the proper way to use PDF.js in Manifest V3 service worker

import { log, logError, logWarn } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { tSync } from '../locales.js';
import { getUILanguageCached } from '../utils/pipeline-helpers.js';

let creating = null;
let offscreenReady = false;

/**
 * Setup offscreen document for PDF extraction
 * Reuses existing offscreen document if available
 */
async function setupOffscreenDocument() {
  if (offscreenReady) {
    return;
  }
  
  if (creating) {
    await creating;
    return;
  }
  
  creating = (async () => {
    try {
      if (!chrome.offscreen) {
        throw new Error('Offscreen API not available');
      }
      
      const offscreenUrl = chrome.runtime.getURL('offscreen.html');
      
      // Check if offscreen document already exists
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });
      
      if (existingContexts.length > 0) {
        log('[ClipAIble PDF Offscreen] Offscreen document already exists');
        // Check if it has the right reasons (DOM_SCRAPING for PDF.js)
        const context = existingContexts[0];
        // If document exists, we can reuse it, but we need to ensure it has DOM_SCRAPING
        // For now, let's close and recreate to ensure fresh code with EXTRACT_PDF handler
        log('[ClipAIble PDF Offscreen] Closing existing document to ensure fresh code with EXTRACT_PDF handler');
        try {
          await chrome.offscreen.closeDocument();
          // Wait a bit for cleanup
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (closeError) {
          logWarn('[ClipAIble PDF Offscreen] Failed to close existing offscreen document', closeError);
        }
      }
      
      // Create offscreen document
      // Note: We reuse the existing offscreen document created by TTS module
      // Both TTS and PDF extraction can use the same offscreen document
      // The document is created with reasons: ['BLOBS', 'DOM_SCRAPING']
      // BLOBS: for TTS audio generation
      // DOM_SCRAPING: for PDF.js (needs DOM and ES modules)
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['BLOBS', 'DOM_SCRAPING'],
        justification: 'PDF extraction and TTS require DOM and ES modules support. PDF.js needs DOM for parsing, TTS needs DOM for WASM.'
      });
      
      // Wait for document to initialize
      await new Promise(resolve => setTimeout(resolve, CONFIG.OFFLINE_TTS_SETUP_DELAY || 500));
      
      offscreenReady = true;
      log('[ClipAIble PDF Offscreen] Offscreen document created successfully');
    } catch (error) {
      logError('[ClipAIble PDF Offscreen] Failed to setup offscreen document', error);
      throw error;
    } finally {
      creating = null;
    }
  })();
  
  await creating;
}

/**
 * Send message to offscreen document for PDF extraction
 * @param {string} pdfUrl - PDF file URL
 * @returns {Promise<Object>} Extracted content result
 */
export async function extractPdfViaOffscreen(pdfUrl) {
  log('[ClipAIble PDF Offscreen] === EXTRACT PDF VIA OFFScreen START ===', { pdfUrl });
  
  try {
    await setupOffscreenDocument();
    
    // Send message to offscreen document
    return new Promise((resolve, reject) => {
      const messageId = `EXTRACT_PDF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      log('[ClipAIble PDF Offscreen] Sending EXTRACT_PDF message', { messageId, pdfUrl });
      
      chrome.runtime.sendMessage(
        {
          target: 'offscreen',
          type: 'EXTRACT_PDF',
          data: { pdfUrl }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logError('[ClipAIble PDF Offscreen] Message send failed', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            logError('[ClipAIble PDF Offscreen] No response from offscreen');
            reject(new Error('No response from offscreen document'));
            return;
          }
          
          if (response.success) {
            log('[ClipAIble PDF Offscreen] PDF extraction successful', {
              messageId,
              title: response.result?.title,
              contentItems: response.result?.content?.length || 0
            });
            resolve(response.result);
          } else {
            logError('[ClipAIble PDF Offscreen] PDF extraction failed', {
              messageId,
              error: response.error
            });
            const uiLang = getUILanguageCached();
            reject(new Error(response.error || tSync('errorPdfExtractionFailed', uiLang)));
          }
        }
      );
    });
  } catch (error) {
    logError('[ClipAIble PDF Offscreen] PDF extraction via offscreen failed', error);
    const uiLang = await getUILanguageCached();
    throw new Error(tSync('errorPdfExtractionFailed', uiLang)?.replace('{error}', error.message) || error.message);
  }
}

