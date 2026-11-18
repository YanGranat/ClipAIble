// @ts-check
// Format helper functions for popup

import { escapeHtml as escapeHtmlUtil } from '../../scripts/utils/html/html.js';
import { getLocaleTag } from '../../scripts/locales.js';

/**
 * Convert markdown to HTML
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
export { markdownToHtml } from '../../scripts/utils/html/html.js';

/**
 * Format seconds to MM:SS
 * @param {number} seconds - Seconds to format
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Escape HTML to prevent XSS attacks
 * @deprecated Use escapeHtmlUtil from scripts/utils/html.js directly instead. This wrapper is kept for backward compatibility.
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(text) {
  return escapeHtmlUtil(text);
}

/**
 * Format relative date (e.g., "2 days ago", "1 hour ago")
 * @param {Date|number} date - Date to format
 * @returns {string} Formatted relative date string
 */
export function formatRelativeDate(date, language = 'en') {
  const now = new Date();
  const dateTime = date instanceof Date ? date.getTime() : (typeof date === 'number' ? date : Date.now());
  if (!Number.isFinite(dateTime)) return '';
  const diffMs = now.getTime() - dateTime;
  const direction = diffMs < 0 ? 1 : -1;
  const elapsed = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(getLocaleTag(language), { numeric: 'auto' });
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(elapsed / 3600000);
  const days = Math.floor(elapsed / 86400000);
  const weeks = Math.floor(elapsed / 604800000);

  if (minutes < 1) return rtf.format(-0, 'minute');
  if (minutes < 60) return rtf.format(direction * minutes, 'minute');
  if (hours < 24) return rtf.format(direction * hours, 'hour');
  if (days < 7) return rtf.format(direction * days, 'day');
  return rtf.format(direction * weeks, 'week');
}

