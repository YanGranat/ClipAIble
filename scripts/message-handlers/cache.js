// Cache-related message handlers
// Handlers: getCacheStats, clearSelectorCache, deleteDomainFromCache

import { getCacheStats, clearSelectorCache, deleteDomainFromCache } from '../cache/selectors.js';
import { withErrorHandling } from './utils.js';

/**
 * Handle getCacheStats request
 */
export function handleGetCacheStats(request, sender, sendResponse) {
  return withErrorHandling(
    getCacheStats().then(stats => ({ stats })),
    'cacheStatsRetrievalFailed',
    sendResponse
  );
}

/**
 * Handle clearSelectorCache request
 */
export function handleClearSelectorCache(request, sender, sendResponse) {
  return withErrorHandling(
    clearSelectorCache().then(() => ({ success: true })),
    'cacheClearFailed',
    sendResponse
  );
}

/**
 * Handle deleteDomainFromCache request
 */
export function handleDeleteDomainFromCache(request, sender, sendResponse) {
  return withErrorHandling(
    deleteDomainFromCache(request.domain).then(() => ({ success: true })),
    'domainDeleteFailed',
    sendResponse
  );
}


