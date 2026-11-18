// @ts-check
// Quick save handler for context menu

import { log } from '../utils/logging.js';
import { getProcessingState } from '../state/processing.js';
import { 
  showQuickSaveNotification,
  extractPageContent,
  prepareQuickSaveProcessingData,
  handleQuickSaveError
} from '../utils/processing-helpers.js';
import { createNotification } from './notifications.js';
import { tSync } from '../locales.js';

/**
 * Handle quick save from context menu
 * @param {import('../types.js').ExportFormat} outputFormat - Output format
 * @param {function(import('../types.js').ProcessingData): Promise<boolean>} startArticleProcessing - Function to start article processing (already wrapped with extractFromPageInlined)
 * @param {number} [tabId] - Optional tab ID from context menu (if not provided, will use active tab)
 * @returns {Promise<void>}
 */
export async function handleQuickSave(outputFormat, startArticleProcessing, tabId = null) {
  log('Quick save triggered', { outputFormat, tabId });
  
  const state = getProcessingState();
  if (state.isProcessing) {
    log('Already processing, ignoring quick save');
    return;
  }
  
  try {
    await showQuickSaveNotification(outputFormat, createNotification);
    // Extract page content - use provided tabId if available (from context menu)
    const pageData = await extractPageContent(tabId);
    
    // Prepare processing data from settings
    const processingData = await prepareQuickSaveProcessingData(outputFormat, pageData);
    
    log('Starting quick save processing', { url: pageData.url, model: processingData.model });
    
    const started = await startArticleProcessing(processingData);
    if (started === false && !getProcessingState().error) {
      throw Object.assign(new Error(tSync('errorProcessingNotStarted', 'en')), {
        translationKey: 'errorProcessingNotStarted', translationParams: {}
      });
    }
    
  } catch (error) {
    await handleQuickSaveError(error, createNotification);
  }
}

