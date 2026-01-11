// @ts-check
// HTML builder for PDF generation

import { log, logWarn, logDebug, logError } from '../utils/logging.js';
import { escapeHtml, escapeAttr, sanitizeHtml, adjustColorBrightness, cleanTitle, markdownToHtml } from '../utils/html.js';
import { PDF_LOCALIZATION } from '../utils/config.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { handleError } from '../utils/error-handler.js';

// Simple cache for localization strings (performance optimization)
// Limited to prevent unbounded growth
const l10nCache = new Map();
const MAX_L10N_CACHE_SIZE = 20; // Maximum cache entries

/**
 * Get localization strings with caching
 * Limits cache size to prevent memory leaks
 * @param {string} language - Language code
 * @returns {Object} Localization strings object
 */
function getLocalization(language) {
  const cacheKey = language || 'auto';
  if (l10nCache.has(cacheKey)) {
    return l10nCache.get(cacheKey);
  }
  
  // Limit cache size - remove oldest entry if cache is full
  if (l10nCache.size >= MAX_L10N_CACHE_SIZE) {
    // Remove first (oldest) entry
    const firstKey = l10nCache.keys().next().value;
    l10nCache.delete(firstKey);
    logDebug('[HTML Builder] l10nCache size limit reached, removed oldest entry', {
      removedKey: firstKey,
      maxSize: MAX_L10N_CACHE_SIZE
    });
  }
  
  const l10n = PDF_LOCALIZATION[cacheKey] || PDF_LOCALIZATION['auto'];
  l10nCache.set(cacheKey, l10n);
  return l10n;
}

/**
 * Build HTML document for PDF
 * @param {Array} content - Content array
 * @param {string} title - Article title
 * @param {string} author - Author name
 * @param {string} styles - CSS styles
 * @param {string} sourceUrl - Source URL
 * @param {string} publishDate - Publish date
 * @param {string} language - Language code
 * @param {boolean} generateToc - Whether to generate TOC
 * @param {Array} headings - Collected headings for TOC
 * @param {boolean} generateAbstract - Whether to generate abstract
 * @param {string} abstract - Abstract text
 * @returns {string} HTML document
 */
export function buildHtmlForPdf(content, title, author, styles, sourceUrl = '', publishDate = '', language = 'auto', generateToc = false, headings = [], generateAbstract = false, abstract = '') {
  const h2InContent = content.filter(item => item.type === 'heading' && item.level === 2);
  log('buildHtmlForPdf', { 
    contentItems: content.length, 
    title, 
    author, 
    generateToc,
    headingsCount: headings.length,
    h2Count: h2InContent.length
  });
  
  // Get localization strings (cached for performance)
  const l10n = getLocalization(language);
  
  // Clean title from soft hyphens and special characters
  const cleanedTitle = cleanTitle(title || '');
  
  // Check if first content item is a heading that matches the title
  // If so, we'll skip it since title is already in header
  const firstItem = content[0];
  const firstItemIsTitle = firstItem && 
    firstItem.type === 'heading' && 
    firstItem.level === 1 &&
    cleanedTitle && 
    (firstItem.text || '').replace(/<[^>]+>/g, '').trim() === cleanedTitle;
  
  // Extract subtitle from content to place it in header (after title, before meta)
  let subtitleHtml = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
      const idAttr = item.id ? ` id="${escapeAttr(item.id)}"` : '';
      const subtitleText = typeof item.text === 'string' ? item.text : (typeof item.text === 'object' && item.text?.text ? item.text.text : String(item.text || ''));
      subtitleHtml = `<p class="standfirst"${idAttr}>${sanitizeHtml(subtitleText, sourceUrl, { allowFileProtocol: true })}</p>`;
      subtitleIndex = i;
      break;
    }
  }
  
  // CRITICAL: Log content items before HTML generation - FULL TEXT (DEBUG only)
  logDebug('=== BEFORE HTML GENERATION: CONTENT ITEMS (FULL) ===', {
    totalItems: content.length,
    title,
    author,
    items: content.map((item, idx) => ({
      index: idx,
      type: item.type,
      level: item.level || null,
      // FULL TEXT - NO TRUNCATION
      textFull: item.text || item.html || item.src || item.alt || item.caption || '',
      textLength: (item.text || item.html || item.src || item.alt || item.caption || '').length,
      textFirstChars: (item.text || item.html || item.src || item.alt || item.caption || '').substring(0, 200),
      textLastChars: (item.text || item.html || item.src || item.alt || item.caption || '') && (item.text || item.html || item.src || item.alt || item.caption || '').length > 200
        ? (item.text || item.html || item.src || item.alt || item.caption || '').substring((item.text || item.html || item.src || item.alt || item.caption || '').length - 200)
        : null,
      hasId: !!item.id,
      id: item.id || null
    }))
  });
  
  // Track failed items for reporting
  const failedItems = [];
  
  const contentHtml = content.map((item, index) => {
    // Skip first heading if it matches the title (title is already in header)
    if (index === 0 && firstItemIsTitle && item.type === 'heading' && item.level === 1) {
      return '';
    }
    
    // Skip subtitle - it will be in header
    if (item.type === 'subtitle') {
      return '';
    }
    
    try {
      // CRITICAL: Ensure item.text is a string, not an object
      // If item.text is an object, convert it to string or extract text property
      let itemText = item.text || '';
      
      if (typeof itemText === 'object' && itemText !== null) {
        // If it's an object, try to extract text property or stringify
        if (itemText.text && typeof itemText.text === 'string') {
          itemText = itemText.text;
        } else if (itemText.html && typeof itemText.html === 'string') {
          itemText = itemText.html;
        } else {
          // Last resort: stringify the object (for debugging)
          logWarn(`Content item at index ${index} has object text, converting to string`, {
            type: item.type,
            textType: typeof itemText,
            textKeys: Object.keys(itemText || {}),
            textPreview: JSON.stringify(itemText).substring(0, 100)
          });
          itemText = JSON.stringify(itemText);
        }
      }
      if (typeof itemText !== 'string') {
        itemText = String(itemText || '');
      }
      
      const idAttr = item.id ? ` id="${escapeAttr(item.id)}"` : '';
      const anchorTag = item.id ? `<a name="${escapeAttr(item.id)}"></a>` : '';
      
      switch (item.type) {
        case 'heading':
          const level = Math.min(Math.max(item.level || 2, 1), 6);
          
          // CRITICAL: Log heading before processing - FULL TEXT (DEBUG only)
          logDebug(`=== HTML BUILDER: HEADING ITEM ${index} BEFORE PROCESSING (FULL) ===`, {
            index,
            type: item.type,
            level: item.level,
            itemTextFull: itemText,
            itemTextLength: itemText.length
          });
          
          // CRITICAL: If itemText already contains markdown heading syntax (#), remove it first
          // parseMarkdownToElements already extracts text without #, but check to be safe
          let headingText = itemText.trim();
          
          // CRITICAL: Log heading text after initial trim - FULL TEXT (DEBUG only)
          logDebug(`=== HTML BUILDER: HEADING ITEM ${index} AFTER TRIM (FULL) ===`, {
            index,
            level,
            headingTextBeforeClean: headingText,
            headingTextLength: headingText.length
          });
          
          // Remove any leading # characters and spaces (in case markdown syntax leaked in)
          headingText = headingText.replace(/^#+\s*/, '').trim();
          
          // CRITICAL: Log heading text after cleaning - FULL TEXT (DEBUG only)
          logDebug(`=== HTML BUILDER: HEADING ITEM ${index} AFTER CLEANING (FULL) ===`, {
            index,
            level,
            headingTextAfterClean: headingText,
            headingTextLength: headingText.length
          });
          
          // Convert markdown to HTML before sanitizing (for formatting like bold, italic, links)
          const headingHtml = markdownToHtml(headingText);
          
          // CRITICAL: Log heading HTML after markdownToHtml - FULL TEXT (DEBUG only)
          logDebug(`=== HTML BUILDER: HEADING ITEM ${index} AFTER markdownToHtml (FULL) ===`, {
            index,
            level,
            headingHtmlFull: headingHtml,
            headingHtmlLength: headingHtml.length
          });
          
          const sanitizedHeadingHtml = sanitizeHtml(headingHtml, sourceUrl, { allowFileProtocol: true });
          
          // CRITICAL: Log final heading HTML - FULL TEXT (DEBUG only)
          logDebug(`=== HTML BUILDER: HEADING ITEM ${index} FINAL HTML (FULL) ===`, {
            index,
            level,
            sanitizedHeadingHtmlFull: sanitizedHeadingHtml,
            sanitizedHeadingHtmlLength: sanitizedHeadingHtml.length,
            finalHtml: `${anchorTag}<h${level}${idAttr}>${sanitizedHeadingHtml}</h${level}>`
          });
          
          return `${anchorTag}<h${level}${idAttr}>${sanitizedHeadingHtml}</h${level}>`;
        
        case 'paragraph':
          // CRITICAL: Check if itemText already contains HTML (from extraction)
          // If it contains HTML tags, use it directly; otherwise convert markdown to HTML
          const hasHtmlTags = /<[a-z][\s\S]*>/i.test(itemText);
          const paragraphHtml = hasHtmlTags ? itemText : markdownToHtml(itemText);
          return `${anchorTag}<p${idAttr} translate="no" class="notranslate" data-translate="no">${sanitizeHtml(paragraphHtml, sourceUrl, { allowFileProtocol: true })}</p>`;
        
        case 'image':
          if (!item.src || item.src.startsWith('data:image/svg') || item.src.includes('placeholder')) {
            return '';
          }
          const altLower = (item.alt || '').toLowerCase();
          const isSeparator = altLower.includes('separator') || altLower.includes('divider');
          if (isSeparator) {
            return `<hr class="decorative-separator"${idAttr}>`;
          }
          // Don't use generic alt text as caption fallback (e.g., "Image", "Photo")
          const isGenericAltText = (alt) => {
            if (!alt || !alt.trim()) return false;
            const lowerAlt = alt.trim().toLowerCase();
            const genericTexts = [
              'изображение', 'image', 'photo', 'picture', 'img', 'фото', 'картинка',
              'imagen', 'imagem', 'immagine', 'bild', 'afbeelding', '画像', '이미지',
              'image:', 'photo:', 'picture:', 'изображение:', 'фото:', 'картинка:'
            ];
            return genericTexts.includes(lowerAlt);
          };
          const captionText = item.caption || (item.alt && !isGenericAltText(item.alt) ? item.alt : '');
          // CRITICAL: If caption already contains HTML (from getFormattedHtml), use sanitizeHtml directly
          // Otherwise, convert markdown to HTML first
          let caption = '';
          if (captionText) {
            // Check if caption already contains HTML tags
            if (captionText.includes('<') && captionText.includes('>')) {
              // Already HTML - sanitize directly to preserve links
              caption = sanitizeHtml(captionText, sourceUrl, { allowFileProtocol: true });
            } else {
              // Markdown - convert first, then sanitize
              caption = sanitizeHtml(markdownToHtml(captionText), sourceUrl, { allowFileProtocol: true });
            }
          }
          const altText = (item.alt || '').replace(/<[^>]*>/g, '');
          // SECURITY NOTE: Inline onerror handler is safe here because:
          // 1. HTML is generated by us, not from external sources
          // 2. HTML is already sanitized before this point
          // 3. onerror contains only static code (hides broken images)
          // 4. This runs in print.html context where HTML is controlled
          return `${anchorTag}<figure class="article-image"${idAttr}>
            <img src="${escapeAttr(item.src)}" alt="${escapeAttr(altText)}" data-original-src="${escapeAttr(item.src)}" onerror="this.parentElement.style.display='none'">
            ${caption ? `<figcaption>${caption}</figcaption>` : ''}
          </figure>`;
        
        case 'quote':
          // CRITICAL: Convert markdown to HTML before sanitizing
          const quoteText = typeof item.text === 'string' ? item.text : (typeof item.text === 'object' && item.text?.text ? item.text.text : String(item.text || ''));
          const quoteHtml = markdownToHtml(quoteText);
          return `${anchorTag}<blockquote${idAttr}>${sanitizeHtml(quoteHtml, sourceUrl, { allowFileProtocol: true })}</blockquote>`;
        
        case 'list':
          const tag = item.ordered ? 'ol' : 'ul';
          const items = (item.items || []).map(i => {
            if (typeof i === 'string') {
              // CRITICAL: Convert markdown to HTML before sanitizing
              const listItemHtml = markdownToHtml(i);
              return `<li>${sanitizeHtml(listItemHtml, sourceUrl, { allowFileProtocol: true })}</li>`;
            }
            const liId = i.id ? ` id="${escapeAttr(i.id)}"` : '';
            const liAnchor = i.id ? `<a name="${escapeAttr(i.id)}"></a>` : '';
            // CRITICAL: Convert markdown to HTML before sanitizing
            const listItemHtml = markdownToHtml(i.html || '');
            return `<li${liId}>${liAnchor}${sanitizeHtml(listItemHtml, sourceUrl, { allowFileProtocol: true })}</li>`;
          }).join('');
          return `${anchorTag}<${tag}${idAttr}>${items}</${tag}>`;
        
        case 'code':
          const codeText = typeof item.text === 'string' ? item.text : (typeof item.text === 'object' && item.text?.text ? item.text.text : String(item.text || ''));
          return `${anchorTag}<pre${idAttr}><code class="language-${escapeAttr(item.language || 'text')}">${escapeHtml(codeText)}</code></pre>`;
        
        case 'table':
          // CRITICAL: Convert markdown to HTML before sanitizing
          const headers = (item.headers || []).map(h => {
            const headerHtml = markdownToHtml(h || '');
            return `<th>${sanitizeHtml(headerHtml, sourceUrl, { allowFileProtocol: true })}</th>`;
          }).join('');
          const rows = (item.rows || []).map(row => 
            `<tr>${(row || []).map(cell => {
              const cellHtml = markdownToHtml(cell || '');
              return `<td>${sanitizeHtml(cellHtml, sourceUrl, { allowFileProtocol: true })}</td>`;
            }).join('')}</tr>`
          ).join('');
          return `${anchorTag}<table${idAttr}><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
        
        case 'separator':
          return `<hr${idAttr}>`;
        
        case 'infobox_start':
          const boxTitle = item.title ? `<div class="infobox-title">${escapeHtml(item.title)}</div>` : '';
          return `${anchorTag}<div class="infobox"${idAttr}>${boxTitle}<div class="infobox-content">`;
        
        case 'infobox_end':
          return `</div></div>`;
        
        default:
          logWarn(`Unknown content type at index ${index}`, { type: item.type });
          return '';
      }
    } catch (itemError) {
      // Track failed items with detailed context
      const errorInfo = {
        index,
        type: item?.type || 'unknown',
        error: itemError?.message || String(itemError),
        errorStack: itemError?.stack,
        itemPreview: {
          hasText: !!item?.text,
          textType: typeof item?.text,
          textLength: item?.text ? String(item.text).length : 0,
          hasHtml: !!item?.html,
          hasSrc: !!item?.src,
          hasItems: !!item?.items,
          itemsCount: Array.isArray(item?.items) ? item.items.length : 0
        }
      };
      
      failedItems.push(errorInfo);
      
      logWarn(`Error processing item at index ${index}`, {
        type: item?.type || 'unknown',
        error: itemError?.message || String(itemError),
        errorStack: itemError?.stack,
        itemPreview: errorInfo.itemPreview
      });
      
      return '';
    }
  }).join('\n');
  
  // Report failed items if any
  if (failedItems.length > 0) {
    const failedCount = failedItems.length;
    const totalItems = content.length;
    const failureRateNum = (failedCount / totalItems * 100);
    const failureRate = failureRateNum.toFixed(1);
    
    logWarn(`Failed to process ${failedCount} out of ${totalItems} content items (${failureRate}% failure rate)`, {
      failedCount,
      totalItems,
      failureRate: `${failureRate}%`,
      failedItems: failedItems.map(f => ({
        index: f.index,
        type: f.type,
        error: f.error
      }))
    });
    
    // If more than 10% of items failed, log as error (potential data corruption)
    if (failureRateNum > 10) {
      logError(`High failure rate in HTML generation: ${failureRate}% of items failed`, {
        failedCount,
        totalItems,
        failureRate: `${failureRate}%`,
        failedItemsSummary: failedItems.slice(0, 5).map(f => ({
          index: f.index,
          type: f.type,
          error: f.error
        }))
      });
    }
  }

  // Count words in content
  const wordCount = countWords(content, title);
  
  // Build meta info block
  const metaItems = [];
  if (sourceUrl) {
    const cleanSourceUrl = sourceUrl.split('#')[0];
    const sourceLabel = l10n.source || 'Source';
    
    // For local PDF files, show "Source:" label with filename (no link)
    const isLocalPdf = cleanSourceUrl.startsWith('file://') && cleanSourceUrl.toLowerCase().includes('.pdf');
    if (isLocalPdf) {
      // Extract filename from file:// URL
      let displaySource = cleanSourceUrl;
      try {
        const match = cleanSourceUrl.match(/\/([^\/]+\.pdf)(?:\?|$)/i);
        if (match) {
          displaySource = decodeURIComponent(match[1]);
        } else if (cleanSourceUrl.startsWith('file://')) {
          const urlObj = new URL(cleanSourceUrl);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          displaySource = decodeURIComponent(pathParts[pathParts.length - 1] || cleanSourceUrl);
        }
      } catch (e) {
        const parts = cleanSourceUrl.split('/');
        const lastPart = parts[parts.length - 1].split('?')[0];
        if (lastPart && lastPart.toLowerCase().endsWith('.pdf')) {
          try {
            displaySource = decodeURIComponent(lastPart);
          } catch (e2) {
            displaySource = lastPart;
          }
        }
      }
      // Show localized "Source:" label with filename (not hardcoded, uses sourceLabel from localization)
      metaItems.push(`${escapeHtml(sourceLabel)}: ${escapeHtml(displaySource)}`);
    } else {
      // For web pages, show "Source:" label with link (link wraps the label text)
      metaItems.push(`<a href="${escapeAttr(cleanSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabel)}</a>`);
    }
  }
  // Only show author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const cleanedAuthor = cleanAuthor(author);
  if (cleanedAuthor) {
    metaItems.push(`<span class="article-author">${escapeHtml(cleanedAuthor)}</span>`);
  }
  if (publishDate) {
    metaItems.push(`<span class="article-date">${escapeHtml(publishDate)}</span>`);
  }
  if (wordCount > 0) {
    const locale = language === 'ua' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US';
    metaItems.push(`<span class="word-count">${wordCount.toLocaleString(locale)} ${l10n.words}</span>`);
  }
  const metaHtml = metaItems.length > 0 
    ? `<div class="article-meta">${metaItems.join(' • ')}</div>` 
    : '';

  // Add abstract if enabled
  let abstractHtml = '';
  if (generateAbstract && abstract) {
    const abstractLabel = l10n.abstract || 'Abstract';
    abstractHtml = `
    <div class="article-abstract">
      <h2 class="abstract-title">${escapeHtml(abstractLabel)}</h2>
      <p class="abstract-text">${escapeHtml(abstract)}</p>
    </div>`;
  }

  // Generate Table of Contents if enabled (only if more than 1 heading)
  let tocHtml = '';
  if (generateToc && headings.length > 1) {
    // TOC generation logged in pdf.js
    const tocTitle = l10n.contents || 'Contents';
    tocHtml = `
    <nav class="table-of-contents">
      <h2 class="toc-title">${tocTitle}</h2>
      <ul class="toc-list">
        ${headings.map(h => {
          const indent = h.level - 2;
          const indentClass = indent > 0 ? ` class="toc-level-${indent}"` : '';
          return `<li${indentClass}><a href="#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a></li>`;
        }).join('\n        ')}
      </ul>
    </nav>`;
  }

  const docLang = language || 'en';

  return `<!DOCTYPE html>
<html lang="${docLang}" translate="no" class="notranslate" data-translate="no">
<head>
  <meta charset="UTF-8">
  <meta name="google" content="notranslate">
  <meta name="google-translate-customization" content="disabled">
  <meta http-equiv="Content-Language" content="${docLang}">
  <title>${escapeHtml(cleanedTitle)}</title>
  <style>${styles}</style>
</head>
<body translate="no" class="notranslate" data-translate="no">
  <article class="article">
    <header class="article-header">
      <h1 class="article-title">${escapeHtml(cleanedTitle)}</h1>
      ${subtitleHtml}
      ${metaHtml}
    </header>
    ${abstractHtml}
    ${tocHtml}
    <div class="article-content">
      ${contentHtml}
    </div>
  </article>
</body>
</html>`;
}

/**
 * Count words in content
 * @param {Array} content - Content array
 * @param {string} title - Article title
 * @returns {number} Word count
 */
function countWords(content, title) {
  function stripHtmlAndEntities(str) {
    if (!str) return '';
    return String(str)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  function extractAllText(obj, collected = []) {
    if (!obj) return collected;
    
    if (typeof obj === 'string') {
      const clean = stripHtmlAndEntities(obj);
      if (clean) collected.push(clean);
      return collected;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(item => extractAllText(item, collected));
      return collected;
    }
    
    if (typeof obj === 'object') {
      if (obj.text && typeof obj.text === 'string') {
        const clean = stripHtmlAndEntities(obj.text);
        if (clean) collected.push(clean);
      } else if (obj.html && typeof obj.html === 'string') {
        const clean = stripHtmlAndEntities(obj.html);
        if (clean) collected.push(clean);
      }
      
      if (obj.code && typeof obj.code === 'string') {
        const clean = stripHtmlAndEntities(obj.code);
        if (clean) collected.push(clean);
      }
      
      if (obj.type === 'infobox_start' && obj.title && typeof obj.title === 'string') {
        const clean = stripHtmlAndEntities(obj.title);
        if (clean) collected.push(clean);
      }
      
      if (obj.items) extractAllText(obj.items, collected);
      if (obj.headers) extractAllText(obj.headers, collected);
      if (obj.rows) extractAllText(obj.rows, collected);
    }
    
    return collected;
  }
  
  let allText = [];
  if (title) {
    const strippedTitle = stripHtmlAndEntities(title);
    if (strippedTitle) allText.push(strippedTitle);
  }
  
  extractAllText(content, allText);
  
  const fullText = allText.join(' ');
  return fullText.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Apply custom styles to CSS
 * @param {string} styles - Base CSS styles
 * @param {string} pageMode - 'single' or 'multi'
 * @param {{fontFamily?: string, fontSize?: string, bgColor?: string, textColor?: string, headingColor?: string, linkColor?: string}} customColors - Custom color settings
 * @returns {string} Modified CSS
 */
export function applyCustomStyles(styles, pageMode, customColors) {
  const { fontFamily, fontSize, bgColor, textColor, headingColor, linkColor } = customColors;
  
  // Apply page mode styles
  if (pageMode === 'multi') {
    styles = styles.replace(
      /@page\s*\{\s*margin:\s*0;\s*size:\s*210mm\s+9999mm;\s*\}/,
      '@page { margin: 0; size: A4; }'
    );
    styles = styles.replace(
      /\/\*\s*Page break rules[\s\S]*?page-break-inside: avoid;\s*\}\s*\*\//,
      `h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
  img, figure, .article-image { page-break-inside: avoid; }
  p { orphans: 3; widows: 3; }
  blockquote, pre { page-break-inside: avoid; }`
    );
  }
  
  // Parse font size
  const oldToNew = { 'small': 24, 'medium': 31, 'large': 38, 'xlarge': 45 };
  const baseFontSize = oldToNew[fontSize] || parseInt(fontSize) || 31;
  const fontSizes = {
    base: `${baseFontSize}px`,
    h1: `${Math.round(baseFontSize * 2)}px`,
    h2: `${Math.round(baseFontSize * 1.58)}px`,
    h3: `${Math.round(baseFontSize * 1.29)}px`,
    h4: `${Math.round(baseFontSize * 1.16)}px`,
    h5: `${Math.round(baseFontSize * 1.06)}px`,
    h6: `${baseFontSize}px`,
    small: `${Math.round(baseFontSize * 0.84)}px`,
    code: `${Math.round(baseFontSize * 0.84)}px`
  };
  
  // Calculate derived colors
  // For light backgrounds, make quoteBackground darker; for dark backgrounds, make it lighter
  // Determine if background is light or dark by checking luminance
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const rgb = hexToRgb(bgColor);
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  const isLight = luminance > 0.5;
  const quoteBackgroundAdjust = isLight ? -8 : 10;
  const quoteBorderAdjust = isLight ? -15 : 30;
  const quoteBackground = adjustColorBrightness(bgColor, quoteBackgroundAdjust);
  const quoteBorder = adjustColorBrightness(bgColor, quoteBorderAdjust);
  const codeBackground = adjustColorBrightness(bgColor, -10);
  
  const fontFamilyStyle = fontFamily ? `font-family: ${fontFamily}, sans-serif !important;` : '';
  const customStyles = `
/* Custom user styles - override defaults */
html {
  font-size: ${fontSizes.base} !important;
}
body {
  font-size: ${fontSizes.base} !important;
  color: ${textColor} !important;
  background-color: ${bgColor} !important;
  ${fontFamilyStyle}
}
h1, .article-title { font-size: ${fontSizes.h1} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
h2 { font-size: ${fontSizes.h2} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
h3 { font-size: ${fontSizes.h3} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
h4 { font-size: ${fontSizes.h4} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
h5 { font-size: ${fontSizes.h5} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
h6 { font-size: ${fontSizes.h6} !important; color: ${headingColor} !important; ${fontFamilyStyle} }
p, li, blockquote, td, th { font-size: ${fontSizes.base} !important; ${fontFamilyStyle} }
small, .article-meta, .word-count, .article-date, .article-meta-label, figcaption, .article-image figcaption, .setting-hint { font-size: ${fontSizes.small} !important; }
.article-meta-label { font-weight: 600; }
code, pre { font-size: ${fontSizes.code} !important; }
ul, ol { font-size: ${fontSizes.base} !important; }
.infobox, .infobox-content { font-size: ${fontSizes.base} !important; ${fontFamilyStyle} }
.infobox-title { font-size: ${Math.round(parseInt(fontSizes.base) * 1.1)}px !important; }
strong, b { color: ${headingColor} !important; }
a, a[href^="#"], blockquote a, strong a, b a, em a, i a, p a, li a, td a, th a, .article-meta a { color: ${linkColor} !important; }
blockquote { 
  background-color: ${quoteBackground} !important; 
  border-left-color: ${quoteBorder} !important;
  color: ${textColor} !important;
}
pre, code { background-color: ${codeBackground} !important; }
.article { background-color: ${bgColor} !important; }
.infobox { background-color: ${quoteBackground} !important; border-color: ${quoteBorder} !important; }
.table-of-contents {
  background-color: ${quoteBackground} !important;
  border-left-color: ${linkColor} !important;
}
.toc-title {
  color: ${headingColor} !important;
}
.toc-list li a {
  color: ${linkColor} !important;
}
.article-abstract {
  background-color: ${quoteBackground} !important;
  border-left-color: ${linkColor} !important;
}
.abstract-title {
  color: ${headingColor} !important;
}
.abstract-text {
  color: ${textColor} !important;
}
@media print {
  html { background: ${bgColor} !important; }
  body { background: ${bgColor} !important; color: ${textColor} !important; }
  .article { background: ${bgColor} !important; }
  a, a[href^="#"], blockquote a, strong a, b a, em a, i a, p a, li a, td a, th a, .article-meta a { color: ${linkColor} !important; }
  h1, h2, h3, h4, h5, h6 { color: ${headingColor} !important; }
  .table-of-contents {
    background-color: ${quoteBackground} !important;
    border-left-color: ${linkColor} !important;
  }
  .toc-title {
    color: ${headingColor} !important;
  }
  .toc-list li a {
    color: ${linkColor} !important;
  }
  .article-abstract {
    background-color: ${quoteBackground} !important;
    border-left-color: ${linkColor} !important;
  }
  .abstract-title {
    color: ${headingColor} !important;
  }
  .abstract-text {
    color: ${textColor} !important;
  }
}
`;
  
  return styles + customStyles;
}


