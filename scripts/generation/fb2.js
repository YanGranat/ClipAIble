// FB2 (FictionBook 2) generation module for ClipAIble extension
// FB2 is an XML-based format popular for e-readers in Russian-speaking countries

import { log, logError } from '../utils/logging.js';
import { stripHtml } from '../utils/html.js';
import { imageToBase64, processImagesInBatches } from '../utils/images.js';
import { PDF_LOCALIZATION, formatDateForDisplay, getLocaleFromLanguage } from '../utils/config.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';

/**
 * Generate FB2 file from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
 */
export async function generateFb2(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'en'
  } = data;
  
  // Collect headings for TOC and sections
  const headings = [];
  (content || []).forEach((item, index) => {
    if (item.type === 'heading' && item.level >= 2) {
      const text = stripHtml(item.text || '');
      if (text) {
        headings.push({ text, level: item.level, index });
      }
    }
  });
  
  log('=== FB2 GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate FB2');
  }
  
  if (updateState) updateState({ status: 'Building FB2 structure...', progress: 85 });
  
  const langCode = language === 'auto' ? 'en' : language;
  const safeTitle = title || 'Article';
  // Format ISO date to readable format using language code
  const pubDate = formatDateForDisplay(publishDate, langCode) || new Date().toLocaleDateString(getLocaleFromLanguage(langCode), { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Parse author name
  const authorParts = parseAuthorName(author);
  
  // Generate unique document ID
  const docId = generateDocId();
  
  // Collect and embed images for binary section
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, status: loadingStatus, progress: 86 });
  }
  const images = await collectFb2Images(content, updateState);
  
  log('Collected', { headings: headings.length, images: images.length });
  
  if (updateState) updateState({ status: 'Generating FB2 content...', progress: 90 });
  
  // Build FB2 XML
  let fb2 = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
${generateDescription(safeTitle, authorParts, langCode, pubDate, sourceUrl, docId)}
${generateBody(content, safeTitle, authorParts, generateToc, headings, pubDate, sourceUrl, langCode, generateAbstract, abstract)}
${generateBinaries(images)}
</FictionBook>`;
  
  if (updateState) updateState({ status: 'Saving FB2 file...', progress: 95 });
  
  // Generate safe filename
  const safeFilename = sanitizeFilename(safeTitle);
  const filename = `${safeFilename}.fb2`;
  
  // Create blob/object URL for download to avoid large base64 strings
  const blob = new Blob([fb2], { type: 'application/x-fictionbook+xml' });
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);

  log('Downloading FB2...', { filename, length: fb2.length });
  
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
    log('Downloading FB2 (data URL fallback)...', { filename, length: fb2.length });
  }
  
  log('=== FB2 GENERATION END ===');
  if (updateState) updateState({ status: 'Done!', progress: 100 });
  
  return { success: true };
}

/**
 * Parse author name into first/middle/last parts
 */
function parseAuthorName(author) {
  if (!author) {
    return { firstName: '', middleName: '', lastName: '' };
  }
  
  const parts = author.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: '', lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], middleName: '', lastName: parts[1] };
  } else {
    return { 
      firstName: parts[0], 
      middleName: parts.slice(1, -1).join(' '), 
      lastName: parts[parts.length - 1] 
    };
  }
}

/**
 * Generate unique document ID
 */
function generateDocId() {
  return 'clipaible-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Collect and embed images for FB2
 * Uses parallel loading for better performance
 */
async function collectFb2Images(content, updateState) {
  const images = [];
  const imageItems = content.filter((item, index) => {
    if (item.type === 'image' && (item.src || item.base64)) {
      item._contentIndex = index;
      return true;
    }
    return false;
  });
  
  log('FB2: Found images to embed', { count: imageItems.length });
  
  if (imageItems.length === 0) {
    return images;
  }
  
  if (updateState) {
    updateState({ status: `Loading ${imageItems.length} images...`, progress: 86 });
  }
  
  // Process images in parallel batches
  const CONCURRENCY = 8;
  const results = await processImagesInBatches(
    imageItems,
    CONCURRENCY,
    updateState,
    async (item, index) => {
      let imageSource = item.src || item.base64;
      if (!imageSource) {
        return { item, imageSource: null, index };
      }
      
      // If not base64, fetch and convert
      if (!imageSource.startsWith('data:')) {
        log(`FB2: Fetching image ${index + 1}`, { url: imageSource.substring(0, 80) });
        const base64 = await imageToBase64(imageSource);
        if (!base64) {
          log(`FB2: Failed to fetch image ${index + 1}, skipping`);
          return { item, imageSource: null, index };
        }
        imageSource = base64;
      }
      
      return { item, imageSource, index };
    }
  );
  
  // Process results
  for (const { item, imageSource, index } of results) {
    if (!imageSource) continue;
    
    try {
      const imageData = parseBase64Image(imageSource);
      if (imageData) {
        const id = `img_${item._contentIndex}`;
        images.push({
          id: id,
          contentType: imageData.contentType,
          data: imageData.data
        });
        // Store reference ID in item for later use
        item._fb2Id = id;
        log(`FB2: Embedded image ${index + 1}`, { id });
      }
    } catch (error) {
      logError('FB2: Failed to process image', error);
    }
  }
  
  return images;
}

/**
 * Parse base64 image data
 */
function parseBase64Image(base64) {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      contentType: match[1],
      data: match[2]
    };
  }
  return null;
}

/**
 * Generate FB2 description section
 */
function generateDescription(title, author, lang, pubDate, sourceUrl, docId) {
  const escapedTitle = escapeXml(title);
  
  let authorXml = '';
  if (author.firstName || author.lastName) {
    authorXml = `      <author>
        <first-name>${escapeXml(author.firstName)}</first-name>
${author.middleName ? `        <middle-name>${escapeXml(author.middleName)}</middle-name>\n` : ''}        <last-name>${escapeXml(author.lastName)}</last-name>
      </author>`;
  } else {
    authorXml = `      <author>
        <first-name>Unknown</first-name>
        <last-name>Author</last-name>
      </author>`;
  }
  
  // Note: date and source URL are shown in body, not in description
  // to avoid duplicate display in some readers
  return `  <description>
    <title-info>
${authorXml}
      <book-title>${escapedTitle}</book-title>
      <lang>${lang}</lang>
    </title-info>
    <document-info>
      <author>
        <nickname>ClipAIble Extension</nickname>
      </author>
      <program-used>ClipAIble v3.0.1</program-used>
      <date value="${new Date().toISOString().split('T')[0]}">${new Date().toISOString().split('T')[0]}</date>
      <id>${docId}</id>
      <version>1.0</version>
    </document-info>
  </description>`;
}

/**
 * Generate FB2 body section
 */
function generateBody(content, title, author, generateToc, headings, pubDate, sourceUrl, language = 'en', generateAbstract = false, abstract = '') {
  const escapedTitle = escapeXml(title);
  const authorName = [author.firstName, author.middleName, author.lastName].filter(Boolean).join(' ');
  
  // Get localized labels
  const langCode = language === 'auto' ? 'en' : language;
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
  const dateLabel = l10n.date || 'Date';
  const sourceLabel = l10n.source || 'Source';
  
  // Title page section with book title, author, source and date
  let bodyContent = `  <body>
    <section>
      <title>
        <p>${escapedTitle}</p>
      </title>
      <empty-line/>`;
  
  // Add author
  if (authorName) {
    bodyContent += `
      <p><strong>${escapeXml(authorName)}</strong></p>
      <empty-line/>`;
  }
  
  // Add source URL - embed URL in the label text as a link
  if (sourceUrl) {
    bodyContent += `
      <p><a l:href="${escapeXml(sourceUrl)}">${escapeXml(sourceLabel)}</a></p>`;
  }
  
  // Add date
  if (pubDate) {
    bodyContent += `
      <p>${escapeXml(dateLabel)}: ${escapeXml(pubDate)}</p>`;
  }
  
  bodyContent += `
      <empty-line/>
      <empty-line/>
    </section>`;
  
  // Add abstract section if enabled
  if (generateAbstract && abstract) {
    const abstractLabel = l10n.abstract || 'Abstract';
    bodyContent += `
    <section>
      <title>
        <p>${escapeXml(abstractLabel)}</p>
      </title>
      <empty-line/>
      <p>${escapeXml(abstract)}</p>
      <empty-line/>
      <empty-line/>
    </section>`;
  }
  
  // Generate Table of Contents section if enabled
  if (generateToc && headings.length > 0) {
    const contentsLabel = l10n.contents || 'Contents';
    bodyContent += `
    <section>
      <title><p>${escapeXml(contentsLabel)}</p></title>
${headings.map(h => `      <p>${'  '.repeat(h.level - 2)}• ${escapeXml(h.text)}</p>`).join('\n')}
    </section>`;
  }
  
  // Split content into sections by headings
  const sections = splitIntoSections(content, headings);
  
  for (const section of sections) {
    bodyContent += generateSection(section, sourceUrl);
  }
  
  bodyContent += `
  </body>`;
  
  return bodyContent;
}

/**
 * Split content into sections based on headings
 */
function splitIntoSections(content, headings) {
  if (headings.length === 0) {
    // No headings - single section with all content
    return [{ title: null, items: content }];
  }
  
  const sections = [];
  let currentSection = { title: null, items: [] };
  
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    
    if (item.type === 'heading' && item.level >= 2) {
      // Start new section
      if (currentSection.items.length > 0 || currentSection.title) {
        sections.push(currentSection);
      }
      currentSection = { 
        title: stripHtml(item.text || ''), 
        level: item.level,
        id: item.id || null, // Preserve original id for internal links
        items: [] 
      };
    } else {
      currentSection.items.push(item);
    }
  }
  
  // Push last section
  if (currentSection.items.length > 0 || currentSection.title) {
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Generate FB2 section
 */
function generateSection(section, sourceUrl = '') {
  // Add id attribute to section for internal link targets
  const idAttr = section.id ? ` id="${escapeXml(section.id)}"` : '';
  let sectionXml = `\n    <section${idAttr}>`;
  
  if (section.title) {
    sectionXml += `
      <title><p>${escapeXml(section.title)}</p></title>`;
  }
  
  for (const item of section.items) {
    sectionXml += contentItemToFb2(item, sourceUrl);
  }
  
  sectionXml += '\n    </section>';
  return sectionXml;
}

/**
 * Create FB2 anchor tag for internal links target
 * FB2 uses <a id="xxx"/> inside <p> as anchor target
 */
function createFb2Anchor(id) {
  if (!id) return '';
  return `<a id="${escapeXml(id)}"/>`;
}

/**
 * Convert content item to FB2 XML
 */
function contentItemToFb2(item, sourceUrl = '') {
  if (!item || !item.type) return '';
  
  // Create anchor for internal link targets
  const anchor = createFb2Anchor(item.id);
  
  switch (item.type) {
    case 'heading': {
      // Headings within sections become subtitles
      const text = stripHtml(item.text || '');
      if (!text) return '';
      // Add anchor before subtitle if id exists
      const anchorTag = anchor ? `\n      <p>${anchor}</p>` : '';
      return `${anchorTag}\n      <subtitle>${escapeXml(text)}</subtitle>`;
    }
    
    case 'paragraph': {
      const text = item.text || '';
      if (!text.trim()) return '';
      return `\n      <p>${anchor}${convertInlineHtmlToFb2(text, sourceUrl)}</p>`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = item.text || '';
      if (!text.trim()) return '';
      return `\n      <cite><p>${anchor}${convertInlineHtmlToFb2(text, sourceUrl)}</p></cite>`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      // FB2 doesn't have native code blocks, use preformatted paragraph
      const lines = code.split('\n');
      const firstLine = lines[0] || '';
      const restLines = lines.slice(1);
      // Add anchor to first line
      let result = `\n      <p>${anchor}<code>${escapeXml(firstLine)}</code></p>`;
      result += restLines.map(line => `\n      <p><code>${escapeXml(line)}</code></p>`).join('');
      return result;
    }
    
    case 'list': {
      const items = item.items || [];
      return items.map((li, index) => {
        const text = typeof li === 'string' ? li : (li.html || li.text || '');
        const liId = (typeof li === 'object' && li.id) ? li.id : '';
        const liAnchor = createFb2Anchor(liId);
        const prefix = item.ordered ? `${index + 1}. ` : '• ';
        return `\n      <p>${liAnchor}${prefix}${convertInlineHtmlToFb2(text, sourceUrl)}</p>`;
      }).join('');
    }
    
    case 'image': {
      if (!item._fb2Id) return '';
      const alt = escapeXml(item.alt || '');
      const caption = item.caption ? escapeXml(stripHtml(item.caption)) : '';
      
      // Add anchor paragraph before image if id exists
      let imageXml = anchor ? `\n      <p>${anchor}</p>` : '';
      imageXml += `\n      <image l:href="#${item._fb2Id}" alt="${alt}"/>`;
      if (caption) {
        imageXml += `\n      <p><emphasis>${caption}</emphasis></p>`;
      }
      return imageXml;
    }
    
    case 'hr':
    case 'divider':
    case 'separator': {
      return '\n      <empty-line/>\n      <p>* * *</p>\n      <empty-line/>';
    }
    
    case 'table': {
      return tableToFb2(item, sourceUrl);
    }
    
    default: {
      if (item.text) {
        return `\n      <p>${anchor}${convertInlineHtmlToFb2(item.text, sourceUrl)}</p>`;
      }
      return '';
    }
  }
}

/**
 * Convert table to FB2 (simplified - FB2 doesn't support tables natively)
 */
function tableToFb2(item, sourceUrl = '') {
  if (!item.rows || !item.rows.length) return '';
  
  let fb2 = '\n      <empty-line/>';
  
  for (const row of item.rows) {
    const cells = row.map(cell => stripHtml(cell)).join(' | ');
    fb2 += `\n      <p>${escapeXml(cells)}</p>`;
  }
  
  fb2 += '\n      <empty-line/>';
  return fb2;
}

/**
 * Convert internal links to local anchors for FB2
 * Links like https://site.com/page#anchor or /page#anchor -> #anchor
 */
function convertInternalLinks(html, sourceUrl) {
  if (!html || !sourceUrl) return html;
  
  try {
    const sourceUrlObj = new URL(sourceUrl);
    const sourceOrigin = sourceUrlObj.origin;
    const sourcePath = decodeURIComponent(sourceUrlObj.pathname).replace(/\/$/, '');
    
    // Match all href attributes
    return html.replace(/href=["']([^"']+)["']/gi, (match, href) => {
      if (!href.includes('#')) return match;
      
      // Already a local anchor
      if (href.startsWith('#')) return match;
      
      try {
        // Handle both absolute and relative URLs
        const hrefUrl = new URL(href, sourceUrl);
        const hrefPath = decodeURIComponent(hrefUrl.pathname).replace(/\/$/, '');
        
        // Check if same origin and same page
        if (hrefUrl.origin === sourceOrigin && hrefPath === sourcePath) {
          // Convert to local anchor
          const anchor = '#' + href.split('#')[1];
          return `href="${anchor}"`;
        }
      } catch {
        // Not a valid URL, keep as is
      }
      
      return match;
    });
  } catch {
    return html;
  }
}

/**
 * Convert inline HTML tags to FB2 equivalents
 */
function convertInlineHtmlToFb2(html, sourceUrl = '') {
  if (!html) return '';
  
  let result = html;
  
  // Convert internal links to local anchors first
  if (sourceUrl) {
    result = convertInternalLinks(result, sourceUrl);
  }
  
  // Convert common inline tags
  result = result.replace(/<strong>(.*?)<\/strong>/gi, '<strong>$1</strong>');
  result = result.replace(/<b>(.*?)<\/b>/gi, '<strong>$1</strong>');
  result = result.replace(/<em>(.*?)<\/em>/gi, '<emphasis>$1</emphasis>');
  result = result.replace(/<i>(.*?)<\/i>/gi, '<emphasis>$1</emphasis>');
  result = result.replace(/<code>(.*?)<\/code>/gi, '<code>$1</code>');
  result = result.replace(/<sup>(.*?)<\/sup>/gi, '<sup>$1</sup>');
  result = result.replace(/<sub>(.*?)<\/sub>/gi, '<sub>$1</sub>');
  result = result.replace(/<s>(.*?)<\/s>/gi, '<strikethrough>$1</strikethrough>');
  result = result.replace(/<strike>(.*?)<\/strike>/gi, '<strikethrough>$1</strikethrough>');
  
  // Convert anchor links (targets for internal links) - preserve id/name as FB2 anchors
  // <a id="xxx"></a> or <a name="xxx"></a> -> <a id="xxx"/>
  result = result.replace(/<a\s+(?:id|name)=["']([^"']+)["'][^>]*>\s*<\/a>/gi, '<a id="$1"/>');
  result = result.replace(/<a\s+(?:id|name)=["']([^"']+)["'][^>]*\/>/gi, '<a id="$1"/>');
  
  // Convert links with href - FB2 supports <a> with l:href
  result = result.replace(/<a\s+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '<a l:href="$1">$2</a>');
  
  // Remove other HTML tags (but not our converted FB2 tags)
  result = result.replace(/<br\s*\/?>/gi, ' ');
  // Remove HTML tags but preserve FB2 tags (a, strong, emphasis, code, sup, sub, strikethrough)
  result = result.replace(/<(?!\/?(?:a|strong|emphasis|code|sup|sub|strikethrough)\b)[^>]+>/gi, '');
  
  // Escape remaining special characters (but not in tags)
  result = escapeXmlContent(result);
  
  return result;
}

/**
 * Generate binary section for images
 */
function generateBinaries(images) {
  if (images.length === 0) return '';
  
  let binaries = '';
  for (const img of images) {
    binaries += `  <binary id="${img.id}" content-type="${img.contentType}">${img.data}</binary>\n`;
  }
  
  return binaries;
}

/**
 * Escape XML special characters for attributes
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape XML content (preserve allowed FB2 tags)
 */
function escapeXmlContent(str) {
  if (!str) return '';
  // Decode &nbsp; to regular space first
  str = str.replace(/&nbsp;/gi, ' ');
  // Only escape & that are not part of valid XML entities
  return str.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

