// @ts-check
// Statistics-related message handlers
// Handlers: getStats, clearStats, deleteHistoryItem

import { getFormattedStats, clearStats, deleteHistoryItem } from '../stats/index.js';
import { withErrorHandling } from './utils.js';
import { log } from '../utils/logging.js';

/**
 * Handle getStats request
 */
export function handleGetStats(request, sender, sendResponse) {
  return withErrorHandling(
    getFormattedStats().then(stats => ({ stats })),
    'statsRetrievalFailed',
    sendResponse
  );
}

/**
 * Handle clearStats request
 */
export function handleClearStats(request, sender, sendResponse) {
  return withErrorHandling(
    clearStats().then(() => ({ success: true })),
    'statsClearFailed',
    sendResponse
  );
}

/**
 * Handle deleteHistoryItem request
 */
export function handleDeleteHistoryItem(request, sender, sendResponse) {
  return withErrorHandling(
    deleteHistoryItem(request.index).then(() => ({ success: true })),
    'historyDeleteFailed',
    sendResponse
  );
}


