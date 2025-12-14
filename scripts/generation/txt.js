// TXT generation module for ClipAIble extension
// Plain text format without formatting

import { log } from '../utils/logging.js';
import { stripHtml } from '../utils/html.js';
import { formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';

/**
 * Generate TXT file from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
 */
export async function generateTxt(data, updateState) {
  const { content, title, author = '', sourceUrl = '', publishDate = '', generateToc = false, generateAbstract = false, abstract = '', language = 'en', apiKey, model } = data;
  
  log('=== TXT GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate TXT');
  }
  
  if (updateState) updateState({ status: 'Building TXT...', progress: 85 });
  
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
  
  let txt = '';
  
  // Add title
  if (title) {
    txt += `${title}\n`;
    txt += '='.repeat(Math.min(title.length, 80)) + '\n\n';
  }
  
  // Add metadata
  const langCode = language === 'auto' ? 'en' : language;
  
  // Format ISO date to readable format before translation
  let translatedDate = formatDateForDisplay(publishDate, langCode) || publishDate;
  
  // Translate date if language is not auto and API key is available
  if (language !== 'auto' && apiKey && translatedDate) {
    try {
      const translated = await translateMetadata(translatedDate, language, apiKey, model, 'date');
      if (translated) translatedDate = translated;
    } catch (error) {
      log('Failed to translate date, using formatted original', error);
    }
  }
  
  const metaItems = [];
  if (author) metaItems.push(`Author: ${author}`);
  if (translatedDate) metaItems.push(`Date: ${translatedDate}`);
  if (sourceUrl) metaItems.push(`Source: ${sourceUrl}`);
  
  if (metaItems.length > 0) {
    txt += metaItems.join('\n') + '\n\n';
  }
  
  // Add abstract if enabled
  if (generateAbstract && abstract) {
    txt += `ABSTRACT\n`;
    txt += '-'.repeat(80) + '\n';
    txt += `${abstract}\n\n`;
  }
  
  // Generate Table of Contents if enabled
  if (generateToc && headings.length > 0) {
    txt += `TABLE OF CONTENTS\n`;
    txt += '-'.repeat(80) + '\n';
    for (const h of headings) {
      const indent = '  '.repeat(Math.max(0, h.level - 2));
      txt += `${indent}${h.text}\n`;
    }
    txt += '\n' + '='.repeat(80) + '\n\n';
  } else if (metaItems.length > 0 || (generateAbstract && abstract)) {
    txt += '='.repeat(80) + '\n\n';
  }
  
  // Process content items
  for (const item of content) {
    txt += contentItemToTxt(item);
  }
  
  // Clean up extra newlines
  txt = txt.replace(/\n{4,}/g, '\n\n\n');
  txt = txt.trim() + '\n';
  
  log('TXT generated', { length: txt.length });
  
  if (updateState) updateState({ status: 'Saving file...', progress: 95 });
  
  // Generate safe filename
  const safeTitle = (title || 'article')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  const filename = `${safeTitle}.txt`;
  
  // Download the file using object URL to avoid large base64 strings
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);
  
  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
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
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    log('Downloading TXT (data URL fallback)...', { filename, length: txt.length });
  }
  
  log('=== TXT GENERATION END ===');
  if (updateState) updateState({ status: 'Done!', progress: 100 });
}

/**
 * Convert single content item to TXT
 * @param {Object} item - Content item
 * @returns {string} Plain text
 */
function contentItemToTxt(item) {
  if (!item || !item.type) return '';
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const text = stripHtml(item.text || '');
      if (!text) return '';
      
      // Use different formatting for different heading levels
      if (level === 1) {
        return `\n${text}\n${'='.repeat(Math.min(text.length, 80))}\n\n`;
      } else if (level === 2) {
        return `\n${text}\n${'-'.repeat(Math.min(text.length, 80))}\n\n`;
      } else {
        const prefix = '#'.repeat(level - 1) + ' ';
        return `\n${prefix}${text}\n\n`;
      }
    }
    
    case 'paragraph': {
      const text = stripHtml(item.text || '');
      if (!text.trim()) return '';
      return `${text}\n\n`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = stripHtml(item.text || '');
      if (!text.trim()) return '';
      const quoted = text.split('\n').map(line => `  > ${line}`).join('\n');
      return `${quoted}\n\n`;
    }
    
    case 'code': {
      const code = stripHtml(item.text || item.code || '');
      return `\n[CODE]\n${code}\n[/CODE]\n\n`;
    }
    
    case 'list': {
      const items = item.items || [];
      const isOrdered = item.ordered || false;
      let listTxt = '';
      items.forEach((listItem, index) => {
        const prefix = isOrdered ? `${index + 1}. ` : '- ';
        const itemText = typeof listItem === 'string' ? listItem : (listItem.html || listItem.text || '');
        const text = stripHtml(itemText);
        listTxt += `${prefix}${text}\n`;
      });
      return listTxt + '\n';
    }
    
    case 'image': {
      // Include image description in text
      const alt = stripHtml(item.alt || item.caption || '');
      if (alt) {
        return `[Image: ${alt}]\n\n`;
      }
      return '';
    }
    
    case 'hr':
    case 'divider':
    case 'separator': {
      return '\n' + '-'.repeat(80) + '\n\n';
    }
    
    case 'table': {
      return tableToTxt(item);
    }
    
    default: {
      if (item.text) {
        const text = stripHtml(item.text);
        return text ? `${text}\n\n` : '';
      }
      return '';
    }
  }
}

/**
 * Convert table to TXT
 * @param {Object} item - Table item
 * @returns {string} Plain text table
 */
function tableToTxt(item) {
  if (!item.rows || !item.rows.length) return '';
  
  let txt = '\n';
  const rows = item.rows;
  
  // First row is header
  if (rows.length > 0) {
    const headerRow = rows[0].map(cell => stripHtml(cell).padEnd(20));
    txt += headerRow.join(' | ') + '\n';
    txt += '-'.repeat(headerRow.join(' | ').length) + '\n';
  }
  
  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map(cell => stripHtml(cell).padEnd(20));
    txt += row.join(' | ') + '\n';
  }
  
  return txt + '\n';
}












