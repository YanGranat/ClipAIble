// @ts-check
// Format helper functions for popup

import { escapeHtml as escapeHtmlUtil } from '../../scripts/utils/html.js';

/**
 * Convert markdown to HTML
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown;
  
  // Code blocks first (to avoid processing markdown inside code)
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return id;
  });
  
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Headers (process from largest to smallest to avoid conflicts)
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Horizontal rules
  html = html.replace(/^(\s*[-*]{3,}\s*)$/gm, '<hr>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/(?<!`)(?<!\*)\*(?!\*)([^*`]+?)(?<!\*)\*(?!\*)(?!`)/g, '<em>$1</em>');
  html = html.replace(/(?<!`)(?<!_)_(?!_)([^_`]+?)(?<!_)_(?!_)(?!`)/g, '<em>$1</em>');
  
  // Restore code blocks
  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`CODE_BLOCK_${index}`, codeBlock);
  });
  
  // Convert newlines to <br>
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.match(/^<(h[1-6])>.*<\/\1>$/)) {
      return line;
    }
    if (line.trim() === '<hr>') {
      return line;
    }
    return line + '<br>';
  });
  
  html = processedLines.join('');
  
  // Clean up
  html = html.replace(/<br><\/(h[1-6])>/g, '</$1>');
  html = html.replace(/<br><hr>/g, '<hr>');
  html = html.replace(/<hr><br>/g, '<hr>');
  
  return html;
}

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
export function formatRelativeDate(date) {
  const now = new Date();
  const dateTime = date instanceof Date ? date.getTime() : (typeof date === 'number' ? date : Date.now());
  const diffMs = now.getTime() - dateTime;
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

