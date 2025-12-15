// Selector cache module for offline mode
// Caches AI-generated selectors by domain for faster subsequent extractions

import { log, logWarn } from '../utils/logging.js';

const STORAGE_KEY = 'selector_cache';
const MAX_CACHED_DOMAINS = 100;
const MIN_SUCCESS_FOR_TRUST = 2; // Need at least 2 successes before fully trusting cache

// NOTE: Cache has NO TTL (time-to-live) - this is intentional!
// Selectors invalidate on extraction failure via invalidateCache().
// If selectors work, there's no reason to expire them.
// User can clear cache manually if needed. See systemPatterns.md.

/**
 * Extract domain from URL
 * @param {string} url 
 * @returns {string}
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Load cache from storage
 * @returns {Promise<Object>}
 */
async function loadCache() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || {};
  } catch (error) {
    logWarn('Failed to load selector cache', error);
    return {};
  }
}

/**
 * Save cache to storage
 * @param {Object} cache 
 */
async function saveCache(cache) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch (error) {
    logWarn('Failed to save selector cache', error);
  }
}

/**
 * Check if caching is enabled (for saving new selectors)
 * @returns {Promise<boolean>}
 */
async function isCachingEnabled() {
  try {
    const result = await chrome.storage.local.get(['enable_selector_caching']);
    const value = result.enable_selector_caching;
    const enabled = value !== false; // Default: true
    log('🔍🔍🔍 isCachingEnabled check', { 
      value, 
      type: typeof value,
      isUndefined: value === undefined,
      isNull: value === null,
      isFalse: value === false,
      isTrue: value === true,
      enabled,
      timestamp: Date.now()
    });
    return enabled;
  } catch (error) {
    logWarn('🔍🔍🔍 Error checking isCachingEnabled, defaulting to true', error);
    return true; // Default: enabled if error
  }
}

/**
 * Check if using cached selectors is enabled
 * @returns {Promise<boolean>}
 */
async function isUsingCacheEnabled() {
  try {
    const result = await chrome.storage.local.get(['use_selector_cache']);
    const value = result.use_selector_cache;
    // Explicit check: enabled if true or undefined/null (default: true), disabled only if explicitly false
    const enabled = value !== false; // true if undefined/null/true, false only if explicitly false
    log('🔍🔍🔍 isUsingCacheEnabled check', { 
      value, 
      type: typeof value,
      isUndefined: value === undefined,
      isNull: value === null,
      isFalse: value === false,
      isTrue: value === true,
      enabled,
      timestamp: Date.now()
    });
    return enabled;
  } catch (error) {
    logWarn('🔍🔍🔍 Error checking isUsingCacheEnabled, defaulting to true', error);
    return true; // Default: enabled if error
  }
}

/**
 * Get cached selectors for a URL
 * @param {string} url - Page URL
 * @returns {Promise<Object|null>} Cached selectors or null
 */
export async function getCachedSelectors(url) {
  // Check if using cache is enabled
  if (!(await isUsingCacheEnabled())) {
    return null;
  }
  
  const domain = extractDomain(url);
  if (!domain) return null;
  
  const cache = await loadCache();
  const entry = cache[domain];
  
  if (!entry || !entry.selectors) {
    return null;
  }
  
  // Check if cache was invalidated
  if (entry.invalidated) {
    log('Cache invalidated for domain', { domain });
    return null;
  }
  
  // Update last used timestamp
  entry.lastUsed = Date.now();
  await saveCache(cache);
  
  log('Using cached selectors', { 
    domain, 
    successCount: entry.successCount,
    age: Math.round((Date.now() - entry.created) / 1000 / 60) + ' min'
  });
  
  return {
    selectors: entry.selectors,
    fromCache: true,
    successCount: entry.successCount
  };
}

/**
 * Cache selectors after successful extraction
 * @param {string} url - Page URL
 * @param {Object} selectors - Selectors object from AI
 */
export async function cacheSelectors(url, selectors) {
  // Check if caching is enabled
  if (!(await isCachingEnabled())) {
    log('Caching disabled, skipping cache save');
    return;
  }
  
  const domain = extractDomain(url);
  if (!domain || !selectors) return;
  
  // Don't cache if selectors are incomplete
  if (!selectors.content && !selectors.articleContainer) {
    log('Not caching - no content selector');
    return;
  }
  
  const cache = await loadCache();
  
  // Check if we need to evict old entries
  const domains = Object.keys(cache);
  if (domains.length >= MAX_CACHED_DOMAINS) {
    // Remove least recently used
    const sorted = domains.sort((a, b) => 
      (cache[a].lastUsed || 0) - (cache[b].lastUsed || 0)
    );
    const toRemove = sorted.slice(0, Math.floor(MAX_CACHED_DOMAINS / 4));
    toRemove.forEach(d => delete cache[d]);
    log('Evicted old cache entries', { count: toRemove.length });
  }
  
  const existing = cache[domain];
  
  if (existing && !existing.invalidated) {
    // Update existing entry
    existing.selectors = selectors;
    existing.successCount = (existing.successCount || 0) + 1;
    existing.lastUsed = Date.now();
    existing.invalidated = false;
    log('Updated cached selectors', { domain, successCount: existing.successCount });
  } else {
    // Create new entry
    cache[domain] = {
      selectors,
      successCount: 1,
      created: Date.now(),
      lastUsed: Date.now(),
      invalidated: false
    };
    log('Cached new selectors', { domain });
  }
  
  await saveCache(cache);
}

/**
 * Increment success count for cached selectors
 * Call this after successful content extraction
 * @param {string} url - Page URL
 */
export async function markCacheSuccess(url) {
  // Check if caching is enabled (for saving)
  if (!(await isCachingEnabled())) {
    return;
  }
  
  const domain = extractDomain(url);
  if (!domain) return;
  
  const cache = await loadCache();
  const entry = cache[domain];
  
  if (entry) {
    entry.successCount = (entry.successCount || 0) + 1;
    entry.lastUsed = Date.now();
    entry.invalidated = false;
    await saveCache(cache);
    log('Cache success recorded', { domain, successCount: entry.successCount });
  }
}

/**
 * Invalidate cache for a domain (call when extraction fails)
 * @param {string} url - Page URL
 */
export async function invalidateCache(url) {
  const domain = extractDomain(url);
  if (!domain) return;
  
  const cache = await loadCache();
  const entry = cache[domain];
  
  if (entry) {
    entry.invalidated = true;
    entry.successCount = 0;
    await saveCache(cache);
    log('Cache invalidated', { domain });
  }
}

/**
 * Delete specific domain from cache
 * @param {string} domain - Domain to delete
 */
export async function deleteDomainFromCache(domain) {
  if (!domain) return;
  
  const cache = await loadCache();
  if (cache[domain]) {
    delete cache[domain];
    await saveCache(cache);
    log('Domain deleted from cache', { domain });
  }
}

/**
 * Clear entire selector cache
 */
export async function clearSelectorCache() {
  await chrome.storage.local.remove([STORAGE_KEY]);
  log('Selector cache cleared');
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
export async function getCacheStats() {
  const cache = await loadCache();
  const domains = Object.keys(cache);
  
  const validCount = domains.filter(d => !cache[d].invalidated).length;
  const totalSuccesses = domains.reduce((sum, d) => sum + (cache[d].successCount || 0), 0);
  
  // Get all valid domains sorted by last used (most recent first)
  const validDomainsList = domains
    .filter(d => !cache[d].invalidated)
    .map(d => ({
      domain: d,
      successCount: cache[d].successCount || 0,
      invalidated: false,
      lastUsed: cache[d].lastUsed || cache[d].created,
      age: Math.round((Date.now() - (cache[d].lastUsed || cache[d].created)) / 1000 / 60 / 60) + 'h'
    }))
    .sort((a, b) => b.lastUsed - a.lastUsed); // Most recently used first
  
  return {
    totalDomains: domains.length,
    validDomains: validCount,
    invalidatedDomains: domains.length - validCount,
    totalSuccesses,
    domains: validDomainsList
  };
}

/**
 * Check if we should trust cached selectors
 * (have enough successful extractions)
 * @param {string} url 
 * @returns {Promise<boolean>}
 */
export async function shouldTrustCache(url) {
  const domain = extractDomain(url);
  if (!domain) return false;
  
  const cache = await loadCache();
  const entry = cache[domain];
  
  if (!entry || entry.invalidated) return false;
  
  return entry.successCount >= MIN_SUCCESS_FOR_TRUST;
}

