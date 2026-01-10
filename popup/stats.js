// @ts-check
// Statistics module for popup
// Handles statistics display, cache stats, history

import { t, getUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { logError, log } from '../scripts/utils/logging.js';

/**
 * Initialize stats module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {function(string, string?): void} deps.showToast - Show toast function
 * @returns {import('../scripts/types.js').StatsModule} Stats functions
 */
export function initStats(deps) {
  const { showToast } = deps;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    const weeks = Math.floor(diffMs / 604800000);

    if (minutes < 1) return rtf.format(-0, 'minute');
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    if (hours < 24) return rtf.format(-hours, 'hour');
    if (days < 7) return rtf.format(-days, 'day');
    return rtf.format(-weeks, 'week');
  }

  async function displayStats(stats) {
    // Defer all DOM updates to avoid blocking main thread
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        // Update main counters - batch DOM updates
        const updates = [];
        updates.push(() => {
          const el = document.getElementById('statTotal');
          if (el) el.textContent = stats.totalSaved || 0;
        });
        updates.push(() => {
          const el = document.getElementById('statMonth');
          if (el) el.textContent = stats.thisMonth || 0;
        });
        updates.push(() => {
          const el = document.getElementById('formatPdf');
          if (el) el.textContent = stats.byFormat?.pdf || 0;
        });
        updates.push(() => {
          const el = document.getElementById('formatEpub');
          if (el) el.textContent = stats.byFormat?.epub || 0;
        });
        updates.push(() => {
          const el = document.getElementById('formatFb2');
          if (el) el.textContent = stats.byFormat?.fb2 || 0;
        });
        updates.push(() => {
          const el = document.getElementById('formatMarkdown');
          if (el) el.textContent = stats.byFormat?.markdown || 0;
        });
        updates.push(() => {
          const el = document.getElementById('formatAudio');
          if (el) el.textContent = stats.byFormat?.audio || 0;
        });
        
        // Apply counter updates
        updates.forEach(update => update());
        
        // Update history - use DocumentFragment for better performance
        const historyContainer = document.getElementById('statsHistory');
        if (!historyContainer) {
          resolve();
          return;
        }
        
        if (stats.history && stats.history.length > 0) {
          // Use DocumentFragment to batch DOM operations
          const fragment = document.createDocumentFragment();
          const tempDiv = document.createElement('div');
          
          const langCode = await getUILanguage();
          const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
          const openOriginalArticleText = locale.openOriginalArticle || UI_LOCALES.en.openOriginalArticle;
          
          tempDiv.innerHTML = stats.history.map((item, index) => {
            const date = new Date(item.date);
            const dateStr = formatRelativeDate(date);
            const timeStr = item.processingTime > 0 ? `${Math.round(item.processingTime / 1000)}s` : '';
            return `
              <div class="history-item" data-index="${index}" data-url="${escapeHtml(item.url || '')}">
                <a href="${escapeHtml(item.url || '#')}" class="history-link" target="_blank" title="${escapeHtml(openOriginalArticleText)}">
                  <div class="history-title">${escapeHtml(item.title)}</div>
                  <div class="history-meta">
                    <span class="history-format">${item.format}</span>
                    <span class="history-domain">${escapeHtml(item.domain)}</span>
                    ${timeStr ? `<span class="history-time">${timeStr}</span>` : ''}
                    <span class="history-date">${dateStr}</span>
                  </div>
                </a>
                <button class="history-delete" data-index="${index}" data-i18n-title="deleteFromHistory" title="Delete from history">✕</button>
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
                // Defer async work
                setTimeout(async () => {
                  await chrome.runtime.sendMessage({ action: 'deleteHistoryItem', index });
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
    // Defer all DOM updates to avoid blocking main thread
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        const domainsEl = document.getElementById('cacheDomains');
        if (domainsEl) {
          domainsEl.textContent = stats.validDomains || 0;
        }
        
        // Display cached domains list
        const domainsListEl = document.getElementById('cacheDomainsList');
        if (domainsListEl && stats.domains) {
          if (stats.domains.length === 0) {
            const noCachedDomainsText = await t('noCachedDomains');
            domainsListEl.innerHTML = `<div class="stats-empty" data-i18n="noCachedDomains">${noCachedDomainsText}</div>`;
            resolve();
          } else {
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            
            tempDiv.innerHTML = stats.domains.map(item => {
              if (item.invalidated) return ''; // Skip invalidated domains
              
              return `
                <div class="cache-domain-item">
                  <span class="cache-domain-name" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</span>
                  <div class="cache-domain-meta">
                    <span>${item.age}</span>
                  </div>
                  <button class="cache-domain-delete" data-domain="${escapeHtml(item.domain)}" data-i18n-title="deleteFromCache">✕</button>
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
                      showToast(domainRemovedText, 'success');
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

