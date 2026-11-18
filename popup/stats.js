// @ts-check
// Statistics module for popup
// Handles statistics display, cache stats, history

import { t, getUILanguage, UI_LOCALES, formatMessage, getLocaleTag } from '../scripts/locales.js';
import { logError, log } from '../scripts/utils/logging.js';
import { formatRelativeDate } from './utils/format-helpers.js';
import { ELEMENT_IDS } from './constants.js';
import { escapeHtml } from '../scripts/utils/html.js';

export function getSafeHistoryUrl(value) {
  if (typeof value !== 'string') return '#';
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

/**
 * Initialize stats module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {function(string, string?): void} deps.showToast - Show toast function
 * @returns {import('../scripts/types.js').StatsModule} Stats functions
 */
export function initStats(deps) {
  const { showToast } = deps;

  let historyRevision = 0;
  let cacheRevision = 0;

  async function displayStats(stats) {
    const revision = ++historyRevision;
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    const numbers = new Intl.NumberFormat(getLocaleTag(langCode));
    const seconds = new Intl.NumberFormat(getLocaleTag(langCode), { style: 'unit', unit: 'second', unitDisplay: 'narrow' });
    // Defer all DOM updates to avoid blocking main thread
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        if (revision !== historyRevision) { resolve(); return; }
        // Update main counters - batch DOM updates
        const updates = [];
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.STAT_TOTAL);
          if (el) el.textContent = numbers.format(stats.totalSaved || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.STAT_MONTH);
          if (el) el.textContent = numbers.format(stats.thisMonth || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.FORMAT_PDF);
          if (el) el.textContent = numbers.format(stats.byFormat?.pdf || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.FORMAT_EPUB);
          if (el) el.textContent = numbers.format(stats.byFormat?.epub || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.FORMAT_FB2);
          if (el) el.textContent = numbers.format(stats.byFormat?.fb2 || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.FORMAT_MARKDOWN);
          if (el) el.textContent = numbers.format(stats.byFormat?.markdown || 0);
        });
        updates.push(() => {
          const el = document.getElementById(ELEMENT_IDS.FORMAT_AUDIO);
          if (el) el.textContent = numbers.format(stats.byFormat?.audio || 0);
        });
        
        // Apply counter updates
        updates.forEach(update => update());
        
        // Update history - use DocumentFragment for better performance
        const historyContainer = document.getElementById(ELEMENT_IDS.STATS_HISTORY);
        if (!historyContainer) {
          resolve();
          return;
        }
        
        if (Array.isArray(stats.history) && stats.history.length > 0) {
          // Use DocumentFragment to batch DOM operations
          const fragment = document.createDocumentFragment();
          const tempDiv = document.createElement('div');
          
          const openOriginalArticleText = locale.openOriginalArticle || UI_LOCALES.en.openOriginalArticle;
          
          tempDiv.innerHTML = stats.history.map((item, index) => {
            if (!item || typeof item !== 'object') return '';
            const date = new Date(item.date);
            const dateStr = formatRelativeDate(date, langCode);
            const timeStr = item.processingTime > 0 ? seconds.format(Math.round(item.processingTime / 1000)) : '';
            return `
              <div class="history-item" data-index="${index}" data-url="${escapeHtml(item.url || '')}">
                <a href="${escapeHtml(getSafeHistoryUrl(item.url))}" class="history-link" target="_blank" rel="noopener" title="${escapeHtml(openOriginalArticleText)}">
                  <div class="history-title">${escapeHtml(item.title)}</div>
                  <div class="history-meta">
                    <span class="history-format">${escapeHtml(item.format)}</span>
                    <span class="history-domain">${escapeHtml(item.domain)}</span>
                    ${timeStr ? `<span class="history-time">${timeStr}</span>` : ''}
                    <span class="history-date">${dateStr}</span>
                  </div>
                </a>
                <button class="history-delete" data-index="${index}" data-i18n-title="deleteFromHistory" title="${escapeHtml(formatMessage('deleteFromHistory', langCode))}" aria-label="${escapeHtml(formatMessage('deleteFromHistory', langCode))}" data-i18n-aria-label="deleteFromHistory">✕</button>
              </div>
            `;
          }).join('');
          
          // Move nodes to fragment
          while (tempDiv.firstChild) {
            fragment.appendChild(tempDiv.firstChild);
          }
          
          // Clear and append in one operation
          historyContainer.innerHTML = '';
          historyContainer.appendChild(fragment);
          
          // Add delete handlers - defer to avoid blocking
          setTimeout(() => {
            historyContainer.querySelectorAll('.history-delete').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = parseInt(/** @type {HTMLButtonElement} */ (btn).dataset.index || '0');
                const item = stats.history[index];
                // Defer async work
                setTimeout(async () => {
                  await chrome.runtime.sendMessage({ action: 'deleteHistoryItem', item });
                  await loadAndDisplayStats();
                }, 0);
              });
            });
          }, 0);
        } else {
          const noDataText = await t('noDataYet');
          historyContainer.innerHTML = `<div class="stats-empty" data-i18n="noDataYet">${noDataText}</div>`;
        }
        
        resolve();
      });
    });
  }

  async function displayCacheStats(stats) {
    const revision = ++cacheRevision;
    const langCode = await getUILanguage();
    // Defer all DOM updates to avoid blocking main thread
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        if (revision !== cacheRevision) { resolve(); return; }
        const domainsEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS);
        if (domainsEl) {
          domainsEl.textContent = new Intl.NumberFormat(getLocaleTag(langCode)).format(stats.validDomains || 0);
          const label = document.querySelector('[data-i18n="domainsCached"]');
          if (label) {
            label.dataset.i18nParams = JSON.stringify({ count: stats.validDomains || 0 });
            label.textContent = formatMessage('domainsCached', langCode, { count: stats.validDomains || 0 });
          }
        }
        
        // Display cached domains list
        const domainsListEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS_LIST);
        if (domainsListEl && Array.isArray(stats.domains)) {
          if (stats.domains.length === 0) {
            const noCachedDomainsText = await t('noCachedDomains');
            domainsListEl.innerHTML = `<div class="stats-empty" data-i18n="noCachedDomains">${noCachedDomainsText}</div>`;
            resolve();
          } else {
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            
            tempDiv.innerHTML = stats.domains.map(item => {
              if (!item || typeof item !== 'object') return '';
              if (item.invalidated) return ''; // Skip invalidated domains
              
              return `
                <div class="cache-domain-item">
                  <span class="cache-domain-name" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</span>
                  <div class="cache-domain-meta">
                    <span>${escapeHtml(formatRelativeDate(item.lastUsed, langCode))}</span>
                  </div>
                  <button class="cache-domain-delete" data-domain="${escapeHtml(item.domain)}" data-i18n-title="deleteFromCache" data-i18n-aria-label="deleteFromCache" title="${escapeHtml(formatMessage('deleteFromCache', langCode))}" aria-label="${escapeHtml(formatMessage('deleteFromCache', langCode))}">✕</button>
                </div>
              `;
            }).filter(html => html).join('');
            
            // Move nodes to fragment
            while (tempDiv.firstChild) {
              fragment.appendChild(tempDiv.firstChild);
            }
            
            // Clear and append in one operation
            domainsListEl.innerHTML = '';
            domainsListEl.appendChild(fragment);
            
            // Add delete handlers - defer to avoid blocking
            setTimeout(() => {
              domainsListEl.querySelectorAll('.cache-domain-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const domain = /** @type {HTMLButtonElement} */ (btn).dataset.domain || '';
                  // Defer async work
                  setTimeout(async () => {
                    const langCode = await getUILanguage();
                    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
                    const deleteConfirm = (locale.deleteDomainFromCache || UI_LOCALES.en.deleteDomainFromCache).replace('{domain}', domain);
                    if (confirm(deleteConfirm)) {
                      await chrome.runtime.sendMessage({ action: 'deleteDomainFromCache', domain });
                      await loadAndDisplayStats();
                      const domainRemovedText = await t('domainRemovedFromCache');
                      showToast(domainRemovedText, 'success', { key: 'domainRemovedFromCache' });
                    }
                  }, 0);
                });
              });
            }, 0);
            
            resolve();
          }
        } else {
          resolve();
        }
      });
    });
  }

  async function loadAndDisplayStats() {
    try {
      const [statsResponse, cacheResponse] = await Promise.all([
        chrome.runtime.sendMessage({ action: 'getStats' }),
        chrome.runtime.sendMessage({ action: 'getCacheStats' })
      ]);
      
      if (statsResponse && statsResponse.stats) {
        await displayStats(statsResponse.stats);
      }
      
      if (cacheResponse && cacheResponse.stats) {
        await displayCacheStats(cacheResponse.stats);
      }
    } catch (error) {
      logError('Failed to load stats', error);
    }
  }

  return {
    loadAndDisplayStats,
    displayStats,
    displayCacheStats,
    escapeHtml,
    formatRelativeDate
  };
}

