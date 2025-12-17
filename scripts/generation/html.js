// HTML generation module for ClipAIble extension
// Clean HTML file with preserved styles

import { log } from '../utils/logging.js';
import { escapeHtml, escapeAttr, sanitizeHtml } from '../utils/html.js';
import { embedImages } from '../utils/images.js';
import { PDF_LOCALIZATION, formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';

/**
 * Generate HTML file from content
 * @param {Object} data - Generation data
 * @param {Function} updateState - State update function
 */
export async function generateHtml(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'auto', apiKey, model
  } = data;
  
  log('=== HTML GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    throw new Error('No content to generate HTML');
  }
  
  if (updateState) updateState({ status: 'Building HTML...', progress: 82 });
  
  // Collect headings for TOC
  const headings = [];
  const contentWithIds = content.map((item, index) => {
    if (item.type === 'heading' && item.level >= 2) {
      const text = item.text ? item.text.replace(/<[^>]*>/g, '').trim() : '';
      const id = item.id || `heading-${index}`;
      headings.push({ text, level: item.level, id });
      return { ...item, id };
    }
    return item;
  });
  
  log('Headings collected for TOC', { count: headings.length });
  
  // Format ISO date to readable format before translation
  const langCode = language === 'auto' ? 'en' : language;
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
  
  // Get localization strings
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
  const dateLabel = l10n.date || 'Date';
  const sourceLabel = l10n.source || 'Source';
  const authorLabel = l10n.author || 'Author';
  const contentsLabel = l10n.contents || 'Contents';
  
  // Build HTML content
  const contentHtml = contentWithIds.map((item, index) => {
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
          log('Unknown content type', { type: item.type, index });
          return '';
      }
    } catch (itemError) {
      log('Error processing item', { error: itemError.message, index });
      return '';
    }
  }).join('\n');
  
  // Build metadata block
  const metaItems = [];
  if (author) metaItems.push(`<span class="article-author"><strong>${authorLabel}:</strong> ${escapeHtml(author)}</span>`);
  if (translatedDate) metaItems.push(`<span class="article-date"><strong>${dateLabel}:</strong> ${escapeHtml(translatedDate)}</span>`);
  if (sourceUrl) metaItems.push(`<span class="article-source"><strong>${sourceLabel}:</strong> <a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a></span>`);
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
    const tocTitle = contentsLabel;
    tocHtml = `
    <nav class="table-of-contents">
      <h2 class="toc-title">${escapeHtml(tocTitle)}</h2>
      <ul class="toc-list">
        ${headings.map(h => {
          const indent = h.level - 2;
          const indentClass = indent > 0 ? ` class="toc-level-${indent}"` : '';
          return `<li${indentClass}><a href="#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a></li>`;
        }).join('\n        ')}
      </ul>
    </nav>`;
  }
  
  // Generate CSS styles
  const styles = generateHtmlStyles();
  
  const docLang = language === 'auto' ? 'en' : language;
  
  // Build full HTML document
  let htmlContent = `<!DOCTYPE html>
<html lang="${docLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'Article')}</title>
  <style>${styles}</style>
</head>
<body>
  <article class="article">
    <header class="article-header">
      <h1 class="article-title">${escapeHtml(title || 'Untitled')}</h1>
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
  
  log('HTML built', { length: htmlContent.length, tocEnabled: generateToc, headingsCount: headings.length });
  
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, status: loadingStatus, progress: 87 });
  }
  
  log('Embedding images...');
  const htmlWithImages = await embedImages(htmlContent, content, updateState, escapeAttr);
  log('Images embedded', { finalLength: htmlWithImages.length });
  
  if (updateState) updateState({ status: 'Saving file...', progress: 95 });
  
  // Generate safe filename
  const safeTitle = sanitizeFilename(title || 'article');
  const filename = `${safeTitle}.html`;
  
  // Download the file using object URL to avoid large base64 strings
  const blob = new Blob([htmlWithImages], { type: 'text/html;charset=utf-8' });
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
    log('Downloading HTML (data URL fallback)...', { filename, length: htmlWithImages.length });
  }
  
  log('=== HTML GENERATION END ===');
  if (updateState) updateState({ status: 'Done!', progress: 100 });
}

/**
 * Generate CSS styles for HTML document
 * @returns {string} CSS styles
 */
function generateHtmlStyles() {
  return `
/* Reset and base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #fff;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

/* Article container */
.article {
  background: #fff;
  padding: 40px 20px;
}

/* Header */
.article-header {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e0e0e0;
}

.article-title {
  font-size: 2.5em;
  font-weight: 700;
  color: #222;
  margin-bottom: 15px;
  line-height: 1.2;
}

.article-meta {
  font-size: 0.9em;
  color: #666;
  margin-top: 15px;
}

.article-meta span {
  margin-right: 15px;
}

.article-meta a {
  color: #0066cc;
  text-decoration: none;
}

.article-meta a:hover {
  text-decoration: underline;
}

/* Abstract */
.article-abstract {
  margin: 30px 0;
  padding: 20px;
  background: #f5f5f5;
  border-left: 4px solid #0066cc;
  border-radius: 4px;
}

.abstract-title {
  font-size: 1.5em;
  margin-bottom: 10px;
  color: #222;
}

.abstract-text {
  color: #555;
  line-height: 1.7;
}

/* Table of Contents */
.table-of-contents {
  margin: 30px 0;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 4px;
}

.toc-title {
  font-size: 1.5em;
  margin-bottom: 15px;
  color: #222;
}

.toc-list {
  list-style: none;
  padding-left: 0;
}

.toc-list li {
  margin: 8px 0;
  padding-left: 0;
}

.toc-list a {
  color: #0066cc;
  text-decoration: none;
  line-height: 1.6;
}

.toc-list a:hover {
  text-decoration: underline;
}

.toc-level-1 { padding-left: 20px; }
.toc-level-2 { padding-left: 40px; }
.toc-level-3 { padding-left: 60px; }
.toc-level-4 { padding-left: 80px; }

/* Content */
.article-content {
  margin-top: 30px;
}

.article-content h1 {
  font-size: 2em;
  margin: 30px 0 15px;
  color: #222;
  font-weight: 700;
}

.article-content h2 {
  font-size: 1.75em;
  margin: 25px 0 12px;
  color: #222;
  font-weight: 600;
}

.article-content h3 {
  font-size: 1.5em;
  margin: 20px 0 10px;
  color: #333;
  font-weight: 600;
}

.article-content h4 {
  font-size: 1.25em;
  margin: 18px 0 8px;
  color: #333;
  font-weight: 600;
}

.article-content h5 {
  font-size: 1.1em;
  margin: 15px 0 8px;
  color: #444;
  font-weight: 600;
}

.article-content h6 {
  font-size: 1em;
  margin: 12px 0 6px;
  color: #444;
  font-weight: 600;
}

.article-content p {
  margin: 15px 0;
  line-height: 1.7;
  color: #333;
}

.article-content a {
  color: #0066cc;
  text-decoration: none;
}

.article-content a:hover {
  text-decoration: underline;
}

.article-content blockquote {
  margin: 20px 0;
  padding: 15px 20px;
  border-left: 4px solid #ccc;
  background: #f5f5f5;
  font-style: italic;
  color: #555;
}

.article-content ul,
.article-content ol {
  margin: 15px 0;
  padding-left: 30px;
}

.article-content li {
  margin: 8px 0;
  line-height: 1.6;
}

.article-content code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  color: #c7254e;
}

.article-content pre {
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 15px;
  overflow-x: auto;
  margin: 20px 0;
}

.article-content pre code {
  background: transparent;
  padding: 0;
  color: #333;
  font-size: 0.9em;
}

.article-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.article-content table th,
.article-content table td {
  padding: 10px;
  border: 1px solid #ddd;
  text-align: left;
}

.article-content table th {
  background: #f5f5f5;
  font-weight: 600;
  color: #222;
}

.article-content table tr:nth-child(even) {
  background: #f9f9f9;
}

/* Images */
.article-image {
  margin: 25px 0;
  text-align: center;
}

.article-image img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.article-image figcaption {
  margin-top: 10px;
  font-size: 0.9em;
  color: #666;
  font-style: italic;
}

/* Infobox */
.infobox {
  margin: 20px 0;
  padding: 15px;
  background: #f0f7ff;
  border: 1px solid #b3d9ff;
  border-radius: 4px;
}

.infobox-title {
  font-weight: 600;
  margin-bottom: 10px;
  color: #0066cc;
}

.infobox-content {
  color: #333;
}

/* Separators */
hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 30px 0;
}

.decorative-separator {
  border-top: 2px solid #ccc;
  margin: 40px 0;
}

/* Print styles */
@media print {
  body {
    padding: 0;
    max-width: 100%;
  }
  
  .article {
    padding: 0;
  }
  
  .article-content a {
    color: #000;
    text-decoration: underline;
  }
  
  .article-image img {
    max-width: 100%;
    page-break-inside: avoid;
  }
  
  .article-content h1,
  .article-content h2,
  .article-content h3 {
    page-break-after: avoid;
  }
}
`;
}













