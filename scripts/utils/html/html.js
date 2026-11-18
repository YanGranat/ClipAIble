// @ts-check
// HTML utility functions for ClipAIble extension

import { decodeEntities, renderRich, plainText, stripAttributes } from './tokenizer.js';
import { markdownHtml, richMarkdown } from './markdown.js';

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, c => map[c]);
}

/**
 * Escape attribute value
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize HTML - allows only safe inline tags
 * @param {string} html - HTML to sanitize
 * @param {string} sourceUrl - Source URL for internal link detection
 * @param {object} [options={}] - Options object
 * @param {boolean} [options.allowFileProtocol=false] - Allow file:// protocol links (for PDF generation)
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html, sourceUrl = '', options = {}) {
  return renderRich(html, sourceUrl, options, false);
}

export function sanitizeMarkdownHtml(html, sourceUrl = '', options = {}) {
  return renderRich(html, sourceUrl, options, true);
}

export function removeHtmlAttributes(html, names) {
  return stripAttributes(html, names);
}

export function stripHtml(html) {
  return plainText(html);
}

const TILDA_BLOCK_ID_PREFIX = /\bT[\d\s]*\d\s*(?=\d|[А-Яа-яЁё])/g;
const TILDA_BLOCK_ID_STANDALONE_TEXT = /(^|\n)\s*T[\d\s]*\d\s*(?=\n|$)/gm;
/** Leftover single digit when ID was in another node; only 0/6 to avoid stripping "1. Введение" */
const TILDA_LEFTOVER_DIGIT_TEXT = /(^|\n)\s*[06]\s+(?=\d|[А-Яа-яЁё])/gm;

/**
 * Strip Tilda/CMS block ID artifacts from plain text (safety net for extraction).
 * Single universal pattern for block IDs (T1, T006, T00 6, T220, T22 0, etc.).
 * @param {string} text - Plain text (may contain Tilda block IDs)
 * @returns {string} Text with Tilda IDs stripped
 */
export function cleanTildaArtifactsFromText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  s = s.replace(TILDA_BLOCK_ID_PREFIX, '');
  s = s.replace(TILDA_BLOCK_ID_STANDALONE_TEXT, '$1');
  s = s.replace(TILDA_LEFTOVER_DIGIT_TEXT, '$1');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

/**
 * Decode common HTML entities
 * @param {string} text - Text with entities
 * @param {boolean} [singlePass=true] - Retained for existing callers; decoding uses one layer
 * @returns {string} Decoded text
 */
export function decodeHtmlEntities(text, singlePass = true) {
  return decodeEntities(text);
}

export function htmlToMarkdown(html, sourceUrl = '') {
  return richMarkdown(html, sourceUrl);
}

export function markdownToHtml(markdown, sourceUrl = '') {
  return markdownHtml(markdown, sourceUrl);
}

export function renderContentText(item, sourceUrl = '') {
  if (typeof item === 'string') return markdownToHtml(item, sourceUrl);
  if (!item || typeof item !== 'object') return '';
  if (item.format === 'text') return escapeHtml(item.text ?? '');
  if (typeof item.html === 'string') return sanitizeHtml(item.html, sourceUrl);
  return markdownToHtml(item.text ?? '', sourceUrl);
}

export function adjustColorBrightness(hex, percent) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  
  r = Math.min(255, Math.max(0, r + Math.round(r * percent / 100)));
  g = Math.min(255, Math.max(0, g + Math.round(g * percent / 100)));
  b = Math.min(255, Math.max(0, b + Math.round(b * percent / 100)));
  
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Clean title - basic cleaning (invisible characters, whitespace normalization)
 * Used for PDF, EPUB, FB2, HTML generation where title comes from page extraction
 * @param {string} title - Title to clean
 * @returns {string} Cleaned title
 */
export function cleanTitle(title) {
  if (!title || typeof title !== 'string') return '';
  
  return title
    .replace(/\u00AD/g, '')      // Soft hyphen
    .replace(/\u200B/g, '')       // Zero-width space
    .replace(/\u200C/g, '')       // Zero-width non-joiner
    .replace(/\u200D/g, '')       // Zero-width joiner
    .replace(/\uFEFF/g, '')       // Zero-width no-break space
    .replace(/[\u2010-\u2015]/g, '-') // Various dashes to standard hyphen
    .replace(/\s+/g, ' ')         // Collapse multiple spaces
    .trim();
}

/**
 * Clean title from service tokens - full cleaning with AI service token removal
 * Used when title comes from AI responses (extraction, chunk processing)
 * Removes budget tokens, service markers, and other AI artifacts
 * @param {string} title - Title to clean
 * @param {string} fallback - Fallback value if cleaned title is empty (default: original title)
 * @returns {string} Cleaned title
 */
export function cleanTitleFromServiceTokens(title, fallback = null) {
  if (!title || typeof title !== 'string') {
    return fallback || '';
  }
  
  let cleaned = title;
  
  // Remove budget token patterns (budgettoken_budget, budget199985, etc.)
  cleaned = cleaned.replace(/budgettoken[_\s]*budget\d*/gi, '');
  cleaned = cleaned.replace(/budget\d+/gi, '');
  
  // Remove common service markers
  cleaned = cleaned.replace(/^\s*#{1,6}\s+|\s+#{1,6}\s*$/g, '');
  
  // Clean up underscores and whitespace
  cleaned = cleaned.replace(/_+/g, ' '); // Replace underscores with spaces
  cleaned = cleaned.replace(/\s+/g, ' '); // Collapse multiple spaces
  cleaned = cleaned.trim();
  
  // Remove leading/trailing separators
  cleaned = cleaned.replace(/^[_\s-]+|[_\s-]+$/g, '');
  
  // Also apply basic cleaning (invisible characters)
  cleaned = cleanTitle(cleaned);
  
  // Return cleaned title or fallback
  return cleaned || fallback || title;
}

/**
 * Clean title for filename - removes invalid filename characters
 * Used when creating file names from titles
 * @param {string} title - Title to clean
 * @param {string} defaultTitle - Default title if cleaned is empty (default: 'article')
 * @returns {string} Cleaned title safe for filename
 */
export function cleanTitleForFilename(title, defaultTitle = 'article') {
  if (!title || typeof title !== 'string') {
    return defaultTitle;
  }
  
  // First apply service token cleaning
  let cleaned = cleanTitleFromServiceTokens(title, '');
  
  // If empty after service token cleaning, use original
  if (!cleaned) {
    cleaned = title;
  }
  
  // Remove invalid filename characters (Windows/Linux)
  cleaned = cleaned
    .replace(/[<>:"/\\|?*]/g, '-')  // Invalid filename chars
    .replace(/\s+/g, ' ')            // Collapse spaces
    .trim();
  
  // Return cleaned or default
  return cleaned || defaultTitle;
}

