// @ts-check
// PDF file selection dialog for popup

import { logError } from '../../scripts/utils/logging.js';
import { getUILanguage, UI_LOCALES } from '../../scripts/locales.js';
import { ELEMENT_IDS } from '../constants.js';
import { activateModalDialog } from './dom-helpers.js';
import { localizePdfError, pdfFailurePayload } from '../../scripts/utils/pdf-errors.js';
import { isTrustedExtensionSender } from '../../scripts/utils/security/message-sender.js';
import { requestPdfFileSelection } from '../../scripts/api/pdf-file-picker.js';
import { putPdfOperationBlob } from '../../scripts/api/pdf-operation-storage.js';

/**
 * Show PDF file selection dialog and wait for user confirmation
 * @returns {Promise<boolean>} true if user clicked OK, false if cancelled
 */
export async function showPdfFileSelectionDialog() {
  const modal = document.getElementById(ELEMENT_IDS.PDF_FILE_SELECTION_MODAL);
  const closeBtn = document.getElementById(ELEMENT_IDS.PDF_FILE_SELECTION_MODAL_CLOSE);
  const okBtn = document.getElementById(ELEMENT_IDS.PDF_FILE_SELECTION_MODAL_OK);
  
  if (!modal || !closeBtn || !okBtn) {
    logError('[Popup] PDF file selection modal elements not found');
    return false;
  }
  
  // Apply localization BEFORE showing modal
  const langCode = await getUILanguage();
  const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
  
  const titleEl = document.getElementById(ELEMENT_IDS.PDF_FILE_SELECTION_MODAL_TITLE);
  const messageEl = document.getElementById(ELEMENT_IDS.PDF_FILE_SELECTION_MODAL_MESSAGE);
  
  if (titleEl) titleEl.textContent = locale.pdfFileSelectionDialogTitle || UI_LOCALES.en.pdfFileSelectionDialogTitle;
  if (messageEl) messageEl.textContent = locale.pdfFileSelectionDialogMessage || UI_LOCALES.en.pdfFileSelectionDialogMessage;
  if (okBtn) okBtn.textContent = locale.ok || UI_LOCALES.en.ok;
  
  return new Promise((resolve) => {
    let releaseFocus = () => {};
    // Handle OK button
    const handleOk = () => {
      modal.classList.add('hidden');
      releaseFocus();
      okBtn.removeEventListener('click', handleOk);
      closeBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleOverlayClick);
      resolve(true);
    };
    
    // Handle close button and overlay click
    const handleCancel = () => {
      modal.classList.add('hidden');
      releaseFocus();
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
    releaseFocus = activateModalDialog(modal, handleCancel, okBtn);
  });
}

/**
 * Handle PDF file selection request from service worker
 * Should be called during popup initialization
 */
export function initPdfFileSelectionHandler() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isTrustedExtensionSender(sender)) return false;
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
          const pdfData = await requestPdfFileSelection(request.expectedPdfUrl);
          
          if (pdfData) {
            const ref = await putPdfOperationBlob(request.operationId, request.processingRunId ?? null,
              0, new Blob([pdfData], { type: 'application/pdf' }), 'selection');
            
            sendResponse({ 
              success: true, 
              ref,
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
          sendResponse(pdfFailurePayload(await localizePdfError(error, 'errorPdfDataUnavailable')));
        }
      })();
      return true; // Keep channel open for async response
    }
  });
}



