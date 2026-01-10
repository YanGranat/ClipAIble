// @ts-check
// PDF file selection dialog for popup

import { logError } from '../../scripts/utils/logging.js';
import { getUILanguage, UI_LOCALES } from '../../scripts/locales.js';

/**
 * Show PDF file selection dialog and wait for user confirmation
 * @returns {Promise<boolean>} true if user clicked OK, false if cancelled
 */
export async function showPdfFileSelectionDialog() {
  const modal = document.getElementById('pdfFileSelectionModal');
  const closeBtn = document.getElementById('pdfFileSelectionModalClose');
  const okBtn = document.getElementById('pdfFileSelectionModalOk');
  
  if (!modal || !closeBtn || !okBtn) {
    logError('[Popup] PDF file selection modal elements not found');
    return false;
  }
  
  // Apply localization BEFORE showing modal
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  
  const titleEl = document.getElementById('pdfFileSelectionModalTitle');
  const messageEl = document.getElementById('pdfFileSelectionModalMessage');
  const warningEl = document.getElementById('pdfFileSelectionModalWarning');
  
  if (titleEl) titleEl.textContent = locale.pdfFileSelectionDialogTitle || UI_LOCALES.en.pdfFileSelectionDialogTitle;
  if (messageEl) messageEl.textContent = locale.pdfFileSelectionDialogMessage || UI_LOCALES.en.pdfFileSelectionDialogMessage;
  if (warningEl) warningEl.textContent = locale.pdfFileSelectionDialogWarning || UI_LOCALES.en.pdfFileSelectionDialogWarning;
  if (okBtn) okBtn.textContent = locale.ok || UI_LOCALES.en.ok;
  
  return new Promise((resolve) => {
    // Handle OK button
    const handleOk = () => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', handleOk);
      closeBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOverlayClick);
      resolve(true);
    };
    
    // Handle close button and overlay click
    const handleCancel = () => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', handleOk);
      closeBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOverlayClick);
      resolve(false);
    };
    
    // Handle overlay click (close on background click)
    const handleOverlayClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };
    
    okBtn.addEventListener('click', handleOk);
    closeBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleOverlayClick);
    
    // Show modal
    modal.classList.remove('hidden');
  });
}

/**
 * Handle PDF file selection request from service worker
 * Should be called during popup initialization
 */
export function initPdfFileSelectionHandler() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'selectPdfFile') {
      (async () => {
        try {
          // Show dialog first and wait for user confirmation
          const userConfirmed = await showPdfFileSelectionDialog();
          
          if (!userConfirmed) {
            // User cancelled the dialog
            sendResponse({ 
              success: true, 
              pdfData: null,
              cancelled: true
            });
            return;
          }
          
          // User confirmed, proceed with file picker
          const { requestPdfFileSelection } = await import('../../scripts/api/pdf-file-picker.js');
          const pdfData = await requestPdfFileSelection(request.expectedPdfUrl);
          
          if (pdfData) {
            // Convert ArrayBuffer to base64 for transmission (chunked for large files)
            const uint8Array = new Uint8Array(pdfData);
            let binaryString = '';
            const chunkSize = 8192; // Process in chunks to avoid stack overflow
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.subarray(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(null, chunk);
            }
            const base64 = btoa(binaryString);
            
            sendResponse({ 
              success: true, 
              pdfData: base64,
              size: pdfData.byteLength
            });
          } else {
            sendResponse({ 
              success: true, 
              pdfData: null,
              cancelled: true
            });
          }
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message || 'Failed to select PDF file'
          });
        }
      })();
      return true; // Keep channel open for async response
    }
  });
}



