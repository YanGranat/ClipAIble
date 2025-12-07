// Markdown generation module for ClipAIble extension

import { log, logWarn } from '../utils/logging.js';
import { stripHtml, htmlToMarkdown } from '../utils/html.js';
import { PDF_LOCALIZATION, formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';

/**
 * Generate Markdown file from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
 */
export async function generateMarkdown(data, updateState) {
  const { content, title, author = '', sourceUrl = '', publishDate = '', generateToc = false, generateAbstract = false, abstract = '', language = 'en', apiKey, model } = data;
  
  log('=== MARKDOWN GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate Markdown');
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
  
  // Add metadata block
  const langCode = language === 'auto' ? 'en' : language;
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
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
  
  // Process content items
  for (const item of content) {
    markdown += contentItemToMarkdown(item);
  }
  
  // Clean up extra newlines
  markdown = markdown.replace(/\n{4,}/g, '\n\n\n');
  markdown = markdown.trim() + '\n';
  
  log('Markdown generated', { length: markdown.length });
  
  if (updateState) updateState({ status: 'Saving file...', progress: 95 });
  
  // Generate safe filename
  const safeTitle = (title || 'article')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  const filename = `${safeTitle}.md`;
  
  // Download the file using data URL
  const base64Content = btoa(unescape(encodeURIComponent(markdown)));
  const dataUrl = `data:text/markdown;charset=utf-8;base64,${base64Content}`;
  
  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
  });
  
  log('=== MARKDOWN GENERATION END ===');
  if (updateState) updateState({ status: 'Done!', progress: 100 });
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


