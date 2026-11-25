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

/** Reports success only after the worker confirms the storage mutation. */
export async function mutateStatistics(request, refresh, showToast, successKey) {
  let response;
  try {
    response = await chrome.runtime.sendMessage(request);
  } catch (error) {
    logError('Statistics mutation failed', error);
  }
  if (response?.success !== true) {
    const key = response?.translationKey || 'errorUnknown';
    const translation = response?.translationParams ? { key, params: response.translationParams } : { key };
    showToast(await t(key, undefined, translation.params), 'error', translation);
    return;
  }
  await refresh();
  if (successKey) showToast(await t(successKey), 'success', { key: successKey });
}

function replaceRows(container, content, selector) {
  const focused = document.activeElement;
  const previousRow = container.contains(focused) ? focused.closest(selector) : null;
  const index = previousRow ? [...container.querySelectorAll(selector)].indexOf(previousRow) : -1;
  container.replaceChildren(content);
  if (!previousRow) return;
  const rows = [...container.querySelectorAll(selector)];
  const row = rows.find(item => item.getAttribute('data-entry') === previousRow.getAttribute('data-entry')) ||
    rows[Math.min(index, rows.length - 1)];
  const target = row?.querySelector(focused.matches('a') ? 'a' : 'button');
  if (target) {
    target.focus();
    return;
  }
  const heading = container.parentElement?.querySelector('.stats-section-title');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

function showListMessage(container, selector, key, language) {
  const message = document.createElement('div');
  message.className = 'stats-empty';
  message.dataset.i18n = key;
  message.setAttribute('role', 'status');
  message.textContent = formatMessage(key, language);
  replaceRows(container, message, selector);
}

/**
 * Initialize stats module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {import('../scripts/types.js').UIModule['showToast']} deps.showToast - Show toast function
 * @returns {import('../scripts/types.js').StatsModule} Stats functions
 */
export function initStats(deps) {
  const { showToast } = deps;

  let historyRevision = 0;
  let cacheRevision = 0;
  let loadRevision = 0;
  let historyLoaded = false;
  let cacheLoaded = false;

  async function displayStats(stats) {
    const revision = ++historyRevision;
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    const numbers = new Intl.NumberFormat(getLocaleTag(langCode));
    const seconds = new Intl.NumberFormat(getLocaleTag(langCode), { style: 'unit', unit: 'second', unitDisplay: 'narrow' });
    // Defer all DOM updates to avoid blocking main thread
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (revision !== historyRevision) { resolve(); return; }
        historyLoaded = true;
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
            const entry = item.id || JSON.stringify([item.url, item.date, item.format]);
            return `
              <div class="history-item" data-index="${index}" data-entry="${escapeHtml(entry)}" data-url="${escapeHtml(item.url || '')}">
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
          
          fragment.querySelectorAll('.history-delete').forEach(btn => {
            const index = Number(/** @type {HTMLButtonElement} */ (btn).dataset.index);
            const item = stats.history[index];
            btn.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await mutateStatistics({ action: 'deleteHistoryItem', item }, loadAndDisplayStats, showToast);
            });
          });
          replaceRows(historyContainer, fragment, '.history-item');
        } else {
          showListMessage(historyContainer, '.history-item', 'noDataYet', langCode);
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
      requestAnimationFrame(() => {
        if (revision !== cacheRevision) { resolve(); return; }
        cacheLoaded = true;
        const domainsEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS);
        if (domainsEl) {
          domainsEl.textContent = new Intl.NumberFormat(getLocaleTag(langCode)).format(stats.validDomains || 0);
          const label = document.querySelector('[data-i18n="domainsCached"]');
          if (label) {
            label.setAttribute('data-i18n-params', JSON.stringify({ count: stats.validDomains || 0 }));
            label.textContent = formatMessage('domainsCached', langCode, { count: stats.validDomains || 0 });
          }
        }
        
        // Display cached domains list
        const domainsListEl = document.getElementById(ELEMENT_IDS.CACHE_DOMAINS_LIST);
        if (domainsListEl) {
          const domains = Array.isArray(stats.domains) ? stats.domains.filter(item => item && !item.invalidated) : [];
          if (domains.length === 0) {
            showListMessage(domainsListEl, '.cache-domain-item', 'noCachedDomains', langCode);
            resolve();
          } else {
            // Use DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            
            tempDiv.innerHTML = domains.map(item => {
              if (!item || typeof item !== 'object') return '';
              
              return `
                <div class="cache-domain-item" data-entry="${escapeHtml(item.domain)}">
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
            
            fragment.querySelectorAll('.cache-domain-delete').forEach(btn => {
              const domain = /** @type {HTMLButtonElement} */ (btn).dataset.domain || '';
              btn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const deleteConfirm = formatMessage('deleteDomainFromCache', await getUILanguage(), { domain });
                if (confirm(deleteConfirm)) {
                  await mutateStatistics({ action: 'deleteDomainFromCache', domain }, loadAndDisplayStats, showToast, 'domainRemovedFromCache');
                }
              });
            });
            replaceRows(domainsListEl, fragment, '.cache-domain-item');
            
            resolve();
          }
        } else {
          resolve();
        }
      });
    });
  }

  async function loadAndDisplayStats() {
    const revision = ++loadRevision;
    const panel = document.getElementById(ELEMENT_IDS.STATS_PANEL);
    panel?.setAttribute('aria-busy', 'true');
    const read = async (action, display, id, selector, loaded) => {
      try {
        const response = await chrome.runtime.sendMessage({ action });
        if (revision !== loadRevision) return;
        if (response?.stats) {
          await display(response.stats);
          return;
        }
      } catch (error) {
        logError('Failed to load stats', { action, error });
      }
      const language = await getUILanguage();
      if (revision !== loadRevision || loaded()) return;
      const container = document.getElementById(id);
      if (container) showListMessage(container, selector, 'errorUnknown', language);
    };
    try {
      await Promise.all([
        read('getStats', displayStats, ELEMENT_IDS.STATS_HISTORY, '.history-item', () => historyLoaded),
        read('getCacheStats', displayCacheStats, ELEMENT_IDS.CACHE_DOMAINS_LIST, '.cache-domain-item', () => cacheLoaded)
      ]);
    } finally {
      if (revision === loadRevision) panel?.setAttribute('aria-busy', 'false');
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

