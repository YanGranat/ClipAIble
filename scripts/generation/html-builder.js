// @ts-check
// HTML builder for PDF generation

import { log, logWarn } from '../utils/logging.js';
import { escapeHtml, escapeAttr, sanitizeHtml, adjustColorBrightness, cleanTitle } from '../utils/html.js';
import { PDF_LOCALIZATION } from '../utils/config.js';

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
  
  // Get localization strings
  const l10n = PDF_LOCALIZATION[language] || PDF_LOCALIZATION['auto'];
  
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
      subtitleHtml = `<p class="standfirst"${idAttr}>${sanitizeHtml(item.text, sourceUrl)}</p>`;
      subtitleIndex = i;
      break;
    }
  }
  
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
      const idAttr = item.id ? ` id="${escapeAttr(item.id)}"` : '';
      const anchorTag = item.id ? `<a name="${escapeAttr(item.id)}"></a>` : '';
      
      switch (item.type) {
        case 'heading':
          const level = Math.min(Math.max(item.level || 2, 1), 6);
          return `${anchorTag}<h${level}${idAttr}>${sanitizeHtml(item.text, sourceUrl)}</h${level}>`;
        
        case 'paragraph':
          return `${anchorTag}<p${idAttr}>${sanitizeHtml(item.text, sourceUrl)}</p>`;
        
        case 'image':
          if (!item.src || item.src.startsWith('data:image/svg') || item.src.includes('placeholder')) {
            return '';
          }
          const altLower = (item.alt || '').toLowerCase();
          const isSeparator = altLower.includes('separator') || altLower.includes('divider');
          if (isSeparator) {
            return `<hr class="decorative-separator"${idAttr}>`;
          }
          const captionText = item.caption || item.alt || '';
          const caption = captionText ? sanitizeHtml(captionText, sourceUrl) : '';
          const altText = (item.alt || '').replace(/<[^>]*>/g, '');
          return `${anchorTag}<figure class="article-image"${idAttr}>
            <img src="${escapeAttr(item.src)}" alt="${escapeAttr(altText)}" data-original-src="${escapeAttr(item.src)}" onerror="this.parentElement.style.display='none'">
            ${caption ? `<figcaption>${caption}</figcaption>` : ''}
          </figure>`;
        
        case 'quote':
          return `${anchorTag}<blockquote${idAttr}>${sanitizeHtml(item.text, sourceUrl)}</blockquote>`;
        
        case 'list':
          const tag = item.ordered ? 'ol' : 'ul';
          const items = (item.items || []).map(i => {
            if (typeof i === 'string') {
              return `<li>${sanitizeHtml(i, sourceUrl)}</li>`;
            }
            const liId = i.id ? ` id="${escapeAttr(i.id)}"` : '';
            const liAnchor = i.id ? `<a name="${escapeAttr(i.id)}"></a>` : '';
            return `<li${liId}>${liAnchor}${sanitizeHtml(i.html, sourceUrl)}</li>`;
          }).join('');
          return `${anchorTag}<${tag}${idAttr}>${items}</${tag}>`;
        
        case 'code':
          return `${anchorTag}<pre${idAttr}><code class="language-${escapeAttr(item.language || 'text')}">${escapeHtml(item.text)}</code></pre>`;
        
        case 'table':
          const headers = (item.headers || []).map(h => `<th>${sanitizeHtml(h, sourceUrl)}</th>`).join('');
          const rows = (item.rows || []).map(row => 
            `<tr>${(row || []).map(cell => `<td>${sanitizeHtml(cell, sourceUrl)}</td>`).join('')}</tr>`
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
      logWarn(`Error processing item at index ${index}`, { error: itemError.message });
      return '';
    }
  }).join('\n');

  // Count words in content
  const wordCount = countWords(content, title);
  
  // Build meta info block
  const metaItems = [];
  if (sourceUrl) {
    const cleanSourceUrl = sourceUrl.split('#')[0];
    metaItems.push(`<a href="${escapeAttr(cleanSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l10n.originalArticle)}</a>`);
  }
  if (author) {
    metaItems.push(`<span class="article-author">${escapeHtml(author)}</span>`);
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

  // Generate Table of Contents if enabled
  let tocHtml = '';
  if (generateToc && headings.length > 0) {
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
<html lang="${docLang}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(cleanedTitle)}</title>
  <style>${styles}</style>
</head>
<body>
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
 * @param {Object} customColors - Custom color settings
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


