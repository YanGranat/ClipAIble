// @ts-check
// Statistics module for ClipAIble extension

/**
 * @typedef {import('../types.js').StatsData} StatsData
 * @typedef {import('../types.js').HistoryItem} HistoryItem
 * @typedef {import('../types.js').ExportFormat} ExportFormat
 */

import { log, logError } from '../utils/logging.js';
import { getUILanguage, tSync } from '../locales.js';
import { stripHtml } from '../utils/html.js';

const STORAGE_KEY = 'extension_stats';

/**
 * Get default stats structure
 */
function getDefaultStats() {
  return {
    totalSaved: 0,
    byFormat: {
      pdf: 0,
      epub: 0,
      fb2: 0,
      markdown: 0,
      // Note: docx, html, txt formats removed from UI but kept in structure for backward compatibility with existing stats data
      docx: 0,
      html: 0,
      txt: 0,
      audio: 0
    },
    byMonth: {},  // { "2025-12": 5, "2025-11": 3 }
    topSites: {}, // { "medium.com": 12, "habr.com": 5 }
    totalProcessingTime: 0, // in milliseconds
    lastSaved: null, // timestamp
    history: [] // last 50 items: { title, url, format, date, processingTime }
  };
}

/**
 * Load stats from storage
 * @returns {Promise<StatsData>} Stats object
 */
export async function loadStats() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const stats = result[STORAGE_KEY];
    if (!stats || typeof stats !== 'object') {
      return getDefaultStats();
    }
    // Type assertion: chrome.storage returns any, but we know it should be StatsData
    return /** @type {StatsData} */ (stats);
  } catch (error) {
    logError('Failed to load stats', error);
    return getDefaultStats();
  }
}

/**
 * Save stats to storage
 * @param {import('../types.js').StatsData} stats - Stats object to save
 */
async function saveStats(stats) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: stats });
  } catch (error) {
    logError('Failed to save stats', error);
    throw error; // Re-throw to let caller handle it
  }
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain name
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix
    return hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Get current month key (YYYY-MM)
 * @returns {string} Month key
 */
function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Record a successful save
 * @param {{title: string, url: string, format: ExportFormat, processingTime: number}} data - Save data
 */
export async function recordSave(data) {
  try {
    const { title, url, format, processingTime } = data;
    
    // Check if statistics collection is enabled
    try {
      const settingsResult = await chrome.storage.local.get(['enable_statistics']);
      const enableStats = settingsResult.enable_statistics;
      
      // If explicitly disabled, don't record stats
      if (enableStats === false) {
        log('Statistics collection disabled, skipping recordSave');
        return null;
      }
      
      // If undefined/null, default to enabled (backward compatibility)
      // This allows existing users to continue collecting stats until they explicitly disable
    } catch (error) {
      logError('Failed to check enable_statistics setting', error);
      // On error, continue with recording (fail-safe)
    }
    
    log(`📊 Recording statistics: ${format.toUpperCase()} saved`, { title, processingTime: `${(processingTime / 1000).toFixed(1)}s` });
    
    const stats = await loadStats();
    
    // Update counters
    stats.totalSaved++;
    stats.byFormat[format] = (stats.byFormat[format] || 0) + 1;
    
    // Update monthly stats
    const monthKey = getCurrentMonthKey();
    stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
    
    // Update site stats
    const domain = extractDomain(url);
    stats.topSites[domain] = (stats.topSites[domain] || 0) + 1;
    
    // Update timing
    if (processingTime && processingTime > 0) {
      stats.totalProcessingTime += processingTime;
    }
    
    stats.lastSaved = Date.now();
    
    // Add to history (keep last 50)
    // SECURITY: Sanitize title to remove any HTML before saving to storage
    const sanitizedTitle = title ? stripHtml(title).substring(0, 100).trim() : 'Untitled';
    stats.history.unshift({
      title: sanitizedTitle || 'Untitled', // Note: This is for stats, not user-facing, so English is acceptable
      url,
      domain,
      format,
      date: Date.now(),
      processingTime: processingTime || 0
    });
    
    if (stats.history.length > 50) {
      stats.history = stats.history.slice(0, 50);
    }
    
    await saveStats(stats);
    
    log('Stats updated successfully', { totalSaved: stats.totalSaved, format, domain });
    
    return stats;
  } catch (error) {
    logError('Failed to record save statistics', error);
    // Don't throw - statistics failure shouldn't break the main flow
    return null;
  }
}

/**
 * Get formatted stats for display
 * @returns {Promise<Object>} Formatted stats
 */
export async function getFormattedStats() {
  try {
    const stats = await loadStats();
    
    // Get top 5 sites
    const topSitesArray = Object.entries(stats.topSites)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    // Calculate this month's saves
    const monthKey = getCurrentMonthKey();
    const thisMonth = stats.byMonth[monthKey] || 0;
    
    // Calculate average processing time
    const avgProcessingTime = stats.totalSaved > 0 
      ? Math.round(stats.totalProcessingTime / stats.totalSaved / 1000) 
      : 0;
    
    // Format last saved date
    const uiLang = await getUILanguage();
    let lastSavedText = tSync('lastSavedNever', uiLang);
    if (stats.lastSaved) {
      const diff = Date.now() - stats.lastSaved;
      if (diff < 60000) {
        lastSavedText = tSync('lastSavedJustNow', uiLang);
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        lastSavedText = tSync('lastSavedMinutesAgo', uiLang).replace('{count}', String(minutes));
      } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        lastSavedText = tSync('lastSavedHoursAgo', uiLang).replace('{count}', String(hours));
      } else {
        const days = Math.floor(diff / 86400000);
        lastSavedText = tSync('lastSavedDaysAgo', uiLang).replace('{count}', String(days));
      }
    }
    
    return {
      totalSaved: stats.totalSaved,
      thisMonth,
      byFormat: stats.byFormat,
      topSites: topSitesArray,
      avgProcessingTime,
      lastSavedText,
      history: stats.history.slice(0, 10) // Last 10 for display
    };
  } catch (error) {
    logError('Failed to get formatted stats', error);
    throw error;
  }
}

/**
 * Clear all stats
 */
export async function clearStats() {
  log('Clearing all stats');
  await saveStats(getDefaultStats());
}

/**
 * Delete a specific history item by index
 * @param {number} index - Index of item to delete
 */
export async function deleteHistoryItem(index) {
  const stats = await loadStats();
  
  if (index >= 0 && index < stats.history.length) {
    // Keep cumulative counters; only remove from history list.
    stats.history.splice(index, 1);
    
    await saveStats(stats);
    log('Deleted history item', { index });
  }
}

/**
 * Export stats as JSON
 * @returns {Promise<string>} JSON string
 */
export async function exportStats() {
  const stats = await loadStats();
  return JSON.stringify(stats, null, 2);
}

