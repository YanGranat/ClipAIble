// @ts-check
// Markdown generation module for ClipAIble extension

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData

import { log, logWarn } from '../utils/logging.js';
import { stripHtml, htmlToMarkdown } from '../utils/html.js';
import { PDF_LOCALIZATION, formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';
import { sanitizeFilename } from '../utils/security.js';
import { isCancelled } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';

// Simple cache for localization strings (performance optimization)
const l10nCache = new Map();

/**
 * Get localization strings with caching
 * @param {string} language - Language code
 * @returns {Object} Localization strings object
 */
function getLocalization(language) {
  const cacheKey = language || 'auto';
  if (l10nCache.has(cacheKey)) {
    return l10nCache.get(cacheKey);
  }
  const l10n = PDF_LOCALIZATION[cacheKey] || PDF_LOCALIZATION['en'];
  l10nCache.set(cacheKey, l10n);
  return l10n;
}

/**
 * Generate Markdown file from content
 * @param {GenerationData} data - Generation data
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update function
 * @returns {Promise<string>} Generated markdown content
 */
export async function generateMarkdown(data, updateState) {
  const { content, title, author = '', sourceUrl = '', publishDate = '', generateToc = false, generateAbstract = false, abstract = '', language = 'en', apiKey, model } = data;
  
  log('=== MARKDOWN GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorNoContentToGenerateMarkdown', uiLang));
  }
  
  if (updateState) updateState({ status: 'Building Markdown...', progress: 85 });
  
  // Collect headings for TOC
  const headings = [];
  for (const item of content) {
    if (item.type === 'heading' && item.level >= 2) {
      const text = stripHtml(item.text || '');
      if (text) {
        headings.push({ text, level: item.level });
      }
    }
  }
  
  log('Headings collected for TOC', { count: headings.length });
  
  let markdown = '';
  
  // Add title
  if (title) {
    markdown += `# ${title}\n\n`;
  }
  
  // Extract and add subtitle (if present)
  let subtitleText = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
      subtitleText = stripHtml(item.text || item.html || '');
      if (subtitleText) {
        subtitleIndex = i;
        break;
      }
    }
  }
  
  if (subtitleText) {
    markdown += `*${subtitleText}*\n\n`;
  }
  
  // Add metadata block
  const langCode = language === 'auto' ? 'en' : language;
  // Get localization strings (cached for performance)
  const l10n = getLocalization(langCode);
  const dateLabel = l10n.date || 'Date';
  const sourceLabel = l10n.source || 'Source';
  const authorLabel = l10n.author || 'Author';
  const contentsLabel = l10n.contents || 'Contents';
  
  // Format ISO date to readable format before translation
  let translatedDate = formatDateForDisplay(publishDate, langCode) || publishDate;
  
  // Translate date if language is not auto and API key is available
  if (language !== 'auto' && apiKey && translatedDate) {
    try {
      const translated = await translateMetadata(translatedDate, language, apiKey, model, 'date');
      if (translated) translatedDate = translated;
    } catch (error) {
      logWarn('Failed to translate date, using formatted original', error);
    }
  }
  
  const metaItems = [];
  if (author) metaItems.push(`**${authorLabel}:** ${author}`);
  if (translatedDate) metaItems.push(`**${dateLabel}:** ${translatedDate}`);
  if (sourceUrl) metaItems.push(`**${sourceLabel}:** ${sourceUrl}`);
  
  if (metaItems.length > 0) {
    markdown += metaItems.join('  \n') + '\n\n';
  }
  
  // Add abstract if enabled
  if (generateAbstract && abstract) {
    const abstractLabel = l10n.abstract || 'Abstract';
    markdown += `## ${abstractLabel}\n\n${abstract}\n\n---\n\n`;
  }
  
  // Generate Table of Contents if enabled
  if (generateToc && headings.length > 0) {
    const minLevel = Math.min(...headings.map(h => h.level));
    markdown += `## ${contentsLabel}\n\n`;
    for (const h of headings) {
      const indent = '  '.repeat(h.level - minLevel);
      markdown += `${indent}- ${h.text}\n`;
    }
    markdown += '\n---\n\n';
  } else if (metaItems.length > 0 && !generateAbstract) {
    markdown += '---\n\n';
  }
  
  // Process content items (skip subtitle - already added)
  for (const item of content) {
    if (item.type === 'subtitle') {
      continue;
    }
    markdown += contentItemToMarkdown(item);
  }
  
  // Clean up extra newlines
  markdown = markdown.replace(/\n{4,}/g, '\n\n\n');
  markdown = markdown.trim() + '\n';
  
  log('Markdown generated', { length: markdown.length });
  
  if (updateState) updateState({ status: 'Saving file...', progress: 95 });
  
  // Generate safe filename
  const safeTitle = sanitizeFilename(title || 'article');
  const filename = `${safeTitle}.md`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled()) {
    log('Processing cancelled, skipping Markdown download');
    throw new Error(tSync('statusCancelled', await getUILanguage()));
  }
  
  // Download the file using object URL to avoid large base64 strings
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);
  
  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
      // Check again before actual download
      if (isCancelled()) {
        log('Processing cancelled, skipping Markdown download');
        throw new Error(tSync('statusCancelled', await getUILanguage()));
      }
      
      await chrome.downloads.download({
        url: objectUrl,
        filename: filename,
        saveAs: true
      });
    } finally {
      urlApi.revokeObjectURL(objectUrl);
    }
  } else {
    // Fallback: data URL via FileReader
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    // Check again before actual download
    if (isCancelled()) {
      log('Processing cancelled, skipping Markdown download');
      throw new Error(tSync('statusCancelled', await getUILanguage()));
    }
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    log('Downloading Markdown (data URL fallback)...', { filename, length: markdown.length });
  }
  
  log('=== MARKDOWN GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ status: tSync('statusDone', uiLang), progress: 100 });
  }
}

/**
 * Convert single content item to Markdown
 * @param {Object} item - Content item
 * @returns {string} Markdown text
 */
function contentItemToMarkdown(item) {
  if (!item || !item.type) return '';
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const prefix = '#'.repeat(level);
      const text = stripHtml(item.text || '');
      return `\n${prefix} ${text}\n\n`;
    }
    
    case 'paragraph': {
      const text = htmlToMarkdown(item.text || '');
      if (!text.trim()) return '';
      return `${text}\n\n`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = htmlToMarkdown(item.text || '');
      if (!text.trim()) return '';
      const quoted = text.split('\n').map(line => `> ${line}`).join('\n');
      return `${quoted}\n\n`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      const language = item.language || '';
      return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }
    
    case 'list': {
      const items = item.items || [];
      const isOrdered = item.ordered || false;
      let listMd = '';
      items.forEach((listItem, index) => {
        const prefix = isOrdered ? `${index + 1}.` : '-';
        const itemText = typeof listItem === 'string' ? listItem : (listItem.html || listItem.text || '');
        const text = htmlToMarkdown(itemText);
        listMd += `${prefix} ${text}\n`;
      });
      return listMd + '\n';
    }
    
    case 'image': {
      // Skip images in markdown output
      return '';
    }
    
    case 'hr':
    case 'divider':
    case 'separator': {
      return '\n---\n\n';
    }
    
    case 'table': {
      return tableToMarkdown(item);
    }
    
    case 'subtitle': {
      // Subtitle is already handled in generateMarkdown, skip here
      return '';
    }
    
    default: {
      if (item.text) {
        const text = htmlToMarkdown(item.text);
        return text ? `${text}\n\n` : '';
      }
      return '';
    }
  }
}

/**
 * Convert table to Markdown
 * @param {Object} item - Table item
 * @returns {string} Markdown table
 */
function tableToMarkdown(item) {
  if (!item.rows || !item.rows.length) return '';
  
  let md = '\n';
  const rows = item.rows;
  
  // First row is header
  if (rows.length > 0) {
    const headerRow = rows[0];
    md += '| ' + headerRow.map(cell => stripHtml(cell)).join(' | ') + ' |\n';
    md += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';
  }
  
  // Data rows
  for (let i = 1; i < rows.length; i++) {
    md += '| ' + rows[i].map(cell => stripHtml(cell)).join(' | ') + ' |\n';
  }
  
  return md + '\n';
}


