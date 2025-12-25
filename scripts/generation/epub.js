// @ts-check
// EPUB generation module for ClipAIble extension
// EPUB is a ZIP archive with specific structure

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData

import { log, logError } from '../utils/logging.js';
import { stripHtml } from '../utils/html.js';
import { imageToBase64, processImagesInBatches } from '../utils/images.js';
import JSZip from '../../lib/jszip-wrapper.js';
import { PDF_LOCALIZATION, formatDateForDisplay, getLocaleFromLanguage } from '../utils/config.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES, isCancelled } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';

/**
 * Generate EPUB file from content
 * @param {GenerationData} data - Generation data
 * @param {function(Partial<import('../types.js').ProcessingState>): void} [updateState] - State update function
 * @returns {Promise<Blob>} Generated EPUB blob
 */
export async function generateEpub(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'en'
  } = data;
  
  log('=== EPUB GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    const uiLang = await getUILanguage();
    throw new Error(tSync('errorNoContentToGenerateEpub', uiLang));
  }
  
  if (updateState) updateState({ status: 'Building EPUB structure...', progress: 82 });
  
  const zip = new JSZip();
  
  // Generate unique identifier for the book
  const bookId = `urn:uuid:${generateUUID()}`;
  const langCode = language === 'auto' ? 'en' : language;
  const safeTitle = title || 'Article';
  const safeAuthor = author || 'Unknown';
  // Format ISO date to readable format using language code
  const pubDate = formatDateForDisplay(publishDate, langCode) || new Date().toLocaleDateString(getLocaleFromLanguage(langCode), { year: 'numeric', month: 'long', day: 'numeric' });
  
  if (updateState) updateState({ status: 'Building EPUB structure...', progress: 85 });
  
  // 1. mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // 2. META-INF/container.xml
  zip.file('META-INF/container.xml', generateContainerXml());
  
  // 3. Collect headings for TOC (preserve original IDs for internal links)
  const headings = [];
  content.forEach((item, index) => {
    if (item.type === 'heading' && item.level >= 2) {
      const text = stripHtml(item.text || '');
      if (text) {
        // Use original id from page (e.g. "TradRevi") or generate fallback
        const originalId = item.id || `heading-${index}`;
        headings.push({ text, level: item.level, id: originalId });
      }
    }
  });
  
  // 4. Embed images FIRST (sets _epubSrc on items)
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, status: loadingStatus, progress: 87 });
  }
  const imageManifest = await embedEpubImages(zip, content, updateState);
  
  // 5. Generate content XHTML (uses _epubSrc for images)
  if (updateState) updateState({ status: 'Converting content...', progress: 90 });
  const contentXhtml = generateContentXhtml(content, safeTitle, safeAuthor, pubDate, sourceUrl, headings, language, generateAbstract, abstract);
  zip.file('OEBPS/content.xhtml', contentXhtml);
  
  // 6. Generate TOC navigation
  const navXhtml = generateNavXhtml(safeTitle, headings, generateToc, langCode);
  zip.file('OEBPS/nav.xhtml', navXhtml);
  
  // 7. Generate NCX for EPUB 2 compatibility
  const tocNcx = generateTocNcx(bookId, safeTitle, headings, generateToc);
  zip.file('OEBPS/toc.ncx', tocNcx);
  
  // 8. Generate styles
  zip.file('OEBPS/style.css', generateEpubStyles());
  
  // 9. Generate content.opf (package file with image manifest)
  let contentOpf = generateContentOpf(bookId, safeTitle, safeAuthor, langCode, pubDate, sourceUrl, generateToc);
  if (imageManifest.length > 0) {
    contentOpf = addImagesToOpf(contentOpf, imageManifest);
  }
  zip.file('OEBPS/content.opf', contentOpf);
  
  if (updateState) updateState({ status: 'Creating EPUB file...', progress: 95 });
  
  // Generate the ZIP file as blob to avoid large base64 in memory
  log('Generating ZIP...');
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  // Create EPUB blob with correct MIME type
  const epubBlob = new Blob([zipBlob], { type: 'application/epub+zip' });
  
  // Generate safe filename
  const safeFilename = sanitizeFilename(safeTitle);
  const filename = `${safeFilename}.epub`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled()) {
    log('Processing cancelled, skipping EPUB download');
    throw new Error(tSync('statusCancelled', await getUILanguage()));
  }
  
  log('Downloading EPUB...', { filename, size: epubBlob.size });
  
  // MV3 SW: createObjectURL may be unavailable; add safe fallback
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);

  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(epubBlob);
    try {
      // Check again before actual download
      if (isCancelled()) {
        log('Processing cancelled, skipping EPUB download');
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
      reader.readAsDataURL(epubBlob);
    });

    // Check again before actual download
    if (isCancelled()) {
      log('Processing cancelled, skipping EPUB download');
      throw new Error(tSync('statusCancelled', await getUILanguage()));
    }

    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    log('Downloading EPUB (data URL fallback)...', { filename, size: epubBlob.size });
  }
  
  log('=== EPUB GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ status: tSync('statusDone', uiLang), progress: 100 });
  }
  
  return epubBlob;
}

/**
 * Generate UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate container.xml
 */
function generateContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

/**
 * Generate content.opf (package document)
 */
function generateContentOpf(bookId, title, author, lang, pubDate, sourceUrl, generateToc) {
  const escapedTitle = escapeXml(title);
  const escapedAuthor = escapeXml(author);
  const escapedSource = escapeXml(sourceUrl);
  
  // Content always first, then nav (TOC) if enabled
  const navInSpine = generateToc ? '\n    <itemref idref="nav"/>' : '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapedTitle}</dc:title>
    <dc:creator>${escapedAuthor}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:date>${pubDate}</dc:date>
    <dc:source>${escapedSource}</dc:source>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>${navInSpine}
  </spine>
</package>`;
}

/**
 * Add images to content.opf manifest
 */
function addImagesToOpf(opf, imageManifest) {
  const manifestItems = imageManifest.map(img => 
    `    <item id="${img.id}" href="${img.href}" media-type="${img.mediaType}"/>`
  ).join('\n');
  
  // Insert before </manifest>
  return opf.replace('  </manifest>', manifestItems + '\n  </manifest>');
}

/**
 * Generate navigation document (EPUB 3)
 */
function generateNavXhtml(title, headings, generateToc, language = 'en') {
  const escapedTitle = escapeXml(title);
  const langCode = language === 'auto' ? 'en' : language;
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
  const contentsLabel = l10n.contents || 'Contents';
  
  let tocHtml = '';
  if (generateToc && headings.length > 0) {
    tocHtml = `    <nav epub:type="toc" id="toc">
      <h2>${escapeXml(contentsLabel)}</h2>
      <ol>
${headings.map(h => {
  const indent = '        '.repeat(h.level - 1);
  return `${indent}<li><a href="content.xhtml#${h.id}">${escapeXml(h.text)}</a></li>`;
}).join('\n')}
      </ol>
    </nav>`;
  } else {
    tocHtml = `    <nav epub:type="toc" id="toc">
      <h2>${escapeXml(contentsLabel)}</h2>
      <ol>
        <li><a href="content.xhtml">${escapedTitle}</a></li>
      </ol>
    </nav>`;
  }
  
  const langAttr = langCode;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${langAttr}">
<head>
  <meta charset="UTF-8"/>
  <title>Navigation</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${tocHtml}
</body>
</html>`;
}

/**
 * Generate NCX table of contents (EPUB 2 compatibility)
 */
function generateTocNcx(bookId, title, headings, generateToc) {
  const escapedTitle = escapeXml(title);
  
  let navPoints = '';
  if (generateToc && headings.length > 0) {
    navPoints = headings.map((h, i) => `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(h.text)}</text></navLabel>
      <content src="content.xhtml#${h.id}"/>
    </navPoint>`).join('');
  } else {
    navPoints = `
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>${escapedTitle}</text></navLabel>
      <content src="content.xhtml"/>
    </navPoint>`;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapedTitle}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
}

/**
 * Generate main content XHTML
 */
function generateContentXhtml(content, title, author, pubDate, sourceUrl, headings, language = 'en', generateAbstract = false, abstract = '') {
  const escapedTitle = escapeXml(title);
  const escapedAuthor = escapeXml(author);
  
  // Get localized labels
  const langCode = language === 'auto' ? 'en' : language;
  const l10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
  const sourceLabel = l10n.source || 'Source';
  const dateLabel = l10n.date || 'Date';
  
  // Extract subtitle from content (if present)
  let subtitleHtml = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
      const subtitleText = item.text || item.html || '';
      if (subtitleText) {
        const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
        subtitleHtml = `\n    <p class="standfirst"${idAttr}>${sanitizeHtmlForXhtml(subtitleText, sourceUrl)}</p>`;
        subtitleIndex = i;
        break;
      }
    }
  }
  
  // Build header
  let headerHtml = `<header class="article-header">
    <h1>${escapedTitle}</h1>`;
  
  // Add subtitle after title, before meta
  if (subtitleHtml) {
    headerHtml += subtitleHtml;
  }
  
  if (author || pubDate) {
    headerHtml += '\n    <p class="meta">';
    if (author) headerHtml += `<span class="author">${escapeXml(escapedAuthor)}</span>`;
    if (author && pubDate) headerHtml += ' · ';
    if (pubDate) headerHtml += `<span class="date-label">${escapeXml(dateLabel)}:</span> <span class="date">${escapeXml(pubDate)}</span>`;
    headerHtml += '</p>';
  }
  
  if (sourceUrl) {
    // Embed source URL in the label text as a link
    headerHtml += `\n    <p class="source"><a href="${escapeXml(sourceUrl)}">${escapeXml(sourceLabel)}</a></p>`;
  }
  
  headerHtml += '\n  </header>';
  
  // Add abstract if enabled
  let abstractHtml = '';
  if (generateAbstract && abstract) {
    // langCode already computed above
    const abstractL10n = PDF_LOCALIZATION[langCode] || PDF_LOCALIZATION['en'];
    const abstractLabel = abstractL10n.abstract || 'Abstract';
    abstractHtml = `\n  <section class="abstract">
    <h2>${escapeXml(abstractLabel)}</h2>
    <p class="abstract-text">${escapeXml(abstract)}</p>
  </section>`;
  }
  
  // Build content
  let contentHtml = '';
  let headingIndex = 0;
  
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    // Skip subtitle - it's already in header
    if (item.type === 'subtitle') {
      continue;
    }
    contentHtml += contentItemToXhtml(item, headings, headingIndex, sourceUrl);
    if (item.type === 'heading' && item.level >= 2) {
      headingIndex++;
    }
  }
  
  // langCode already computed above, use it for xml:lang
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${langCode}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapedTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  ${headerHtml}
  ${abstractHtml}
  <main class="article-content">
${contentHtml}
  </main>
</body>
</html>`;
}

/**
 * Convert content item to XHTML
 */
function contentItemToXhtml(item, headings, headingIndex, sourceUrl = '') {
  if (!item || !item.type) return '';
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const text = item.text || '';
      // Prefer original item.id, then headings array, then fallback
      const id = item.id || headings[headingIndex]?.id || `heading-${headingIndex}`;
      return `    <h${level} id="${id}">${sanitizeHtmlForXhtml(text, sourceUrl)}</h${level}>\n`;
    }
    
    case 'paragraph': {
      const text = item.text || '';
      if (!text.trim()) return '';
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      return `    <p${idAttr}>${sanitizeHtmlForXhtml(text, sourceUrl)}</p>\n`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = item.text || '';
      if (!text.trim()) return '';
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      return `    <blockquote${idAttr}><p>${sanitizeHtmlForXhtml(text, sourceUrl)}</p></blockquote>\n`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      return `    <pre><code>${escapeXml(code)}</code></pre>\n`;
    }
    
    case 'list': {
      const items = item.items || [];
      const tag = item.ordered ? 'ol' : 'ul';
      const listIdAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      const listItems = items.map(li => {
        const text = typeof li === 'string' ? li : (li.html || li.text || '');
        const liId = (typeof li === 'object' && li.id) ? li.id : '';
        const liIdAttr = liId ? ` id="${escapeXml(liId)}"` : '';
        return `      <li${liIdAttr}>${sanitizeHtmlForXhtml(text, sourceUrl)}</li>`;
      }).join('\n');
      return `    <${tag}${listIdAttr}>\n${listItems}\n    </${tag}>\n`;
    }
    
    case 'image': {
      // Use embedded path if available, otherwise original src
      const src = item._epubSrc || item.src || item.base64 || '';
      const alt = escapeXml(item.alt || '');
      const caption = item.caption ? sanitizeHtmlForXhtml(item.caption, sourceUrl) : '';
      if (!src) return '';
      
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      let figureHtml = `    <figure${idAttr}><img src="${src}" alt="${alt}"/>`;
      if (caption) {
        figureHtml += `<figcaption>${caption}</figcaption>`;
      }
      figureHtml += `</figure>\n`;
      return figureHtml;
    }
    
    case 'hr':
    case 'divider':
    case 'separator': {
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      return `    <hr${idAttr}/>\n`;
    }
    
    case 'table': {
      return tableToXhtml(item, sourceUrl);
    }
    
    case 'subtitle': {
      // Subtitle is already handled in generateContentXhtml, skip here
      return '';
    }
    
    default: {
      if (item.text) {
        return `    <p>${sanitizeHtmlForXhtml(item.text, sourceUrl)}</p>\n`;
      }
      return '';
    }
  }
}

/**
 * Convert table to XHTML
 */
function tableToXhtml(item, sourceUrl = '') {
  if (!item.rows || !item.rows.length) return '';
  
  let html = '    <table>\n';
  const rows = item.rows;
  
  // First row as header
  if (rows.length > 0) {
    html += '      <thead><tr>\n';
    rows[0].forEach(cell => {
      html += `        <th>${sanitizeHtmlForXhtml(cell, sourceUrl)}</th>\n`;
    });
    html += '      </tr></thead>\n';
  }
  
  // Body rows
  if (rows.length > 1) {
    html += '      <tbody>\n';
    for (let i = 1; i < rows.length; i++) {
      html += '      <tr>\n';
      rows[i].forEach(cell => {
        html += `        <td>${sanitizeHtmlForXhtml(cell, sourceUrl)}</td>\n`;
      });
      html += '      </tr>\n';
    }
    html += '      </tbody>\n';
  }
  
  html += '    </table>\n';
  return html;
}

/**
 * Convert internal links to local anchors
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
 * Sanitize HTML for XHTML (close tags, escape entities)
 */
function sanitizeHtmlForXhtml(html, sourceUrl = '') {
  if (!html) return '';
  
  // Preserve allowed inline tags, escape others
  let result = html;
  
  // Convert internal links to local anchors
  if (sourceUrl) {
    result = convertInternalLinks(result, sourceUrl);
  }
  
  // Decode &nbsp; to regular space before escaping
  result = result.replace(/&nbsp;/gi, ' ');
  
  // Self-closing tags must end with />
  result = result.replace(/<(br|hr|img)([^>]*)>/gi, '<$1$2/>');
  
  // Empty anchor tags (used as link targets) should be self-closing in XHTML
  // <a id="xxx"></a> or <a name="xxx"></a> -> <a id="xxx"/>
  result = result.replace(/<a\s+((?:id|name)=["'][^"']+["'][^>]*)>\s*<\/a>/gi, '<a $1/>');
  
  // Escape special XML entities (but not in existing tags)
  result = result.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  
  return result;
}

/**
 * Escape XML special characters
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
 * Generate EPUB styles
 */
function generateEpubStyles() {
  return `/* EPUB Styles - Clean reading experience */

body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 1em;
  color: #333;
}

.article-header {
  margin-bottom: 2em;
  border-bottom: 1px solid #ddd;
  padding-bottom: 1em;
}

.article-header h1 {
  font-size: 1.8em;
  margin: 0 0 0.5em 0;
  line-height: 1.2;
}

.meta {
  color: #666;
  font-size: 0.9em;
  margin: 0.5em 0;
}

.author {
  font-weight: bold;
}

.source-label, .date-label {
  font-weight: 600;
  margin-right: 0.3em;
}

.source a {
  color: #0066cc;
  font-size: 0.85em;
}

h2 {
  font-size: 1.4em;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.3em;
}

h3 {
  font-size: 1.2em;
  margin-top: 1.2em;
  margin-bottom: 0.4em;
}

h4, h5, h6 {
  font-size: 1.1em;
  margin-top: 1em;
  margin-bottom: 0.3em;
}

p {
  margin: 0.8em 0;
  text-align: justify;
}

a {
  color: #0066cc;
  text-decoration: none;
}

blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #ccc;
  background: #f9f9f9;
  font-style: italic;
}

pre {
  background: #f4f4f4;
  padding: 1em;
  overflow-x: auto;
  font-family: "Courier New", monospace;
  font-size: 0.9em;
  line-height: 1.4;
  border-radius: 4px;
}

code {
  font-family: "Courier New", monospace;
  font-size: 0.9em;
  background: #f4f4f4;
  padding: 0.1em 0.3em;
  border-radius: 2px;
}

pre code {
  background: none;
  padding: 0;
}

ul, ol {
  margin: 0.8em 0;
  padding-left: 1.5em;
}

li {
  margin: 0.3em 0;
}

figure {
  margin: 1em 0;
  text-align: center;
}

figcaption {
  font-size: 0.9em;
  color: #666;
  font-style: italic;
  margin-top: 0.5em;
  padding: 0 1em;
}

img {
  max-width: 100%;
  height: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.9em;
}

th, td {
  border: 1px solid #ddd;
  padding: 0.5em;
  text-align: left;
}

th {
  background: #f4f4f4;
  font-weight: bold;
}

hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2em 0;
}

/* Navigation */
nav h2 {
  font-size: 1.2em;
  margin-bottom: 1em;
}

nav ol {
  list-style: decimal;
  padding-left: 1.5em;
}

nav li {
  margin: 0.5em 0;
}

nav a {
  text-decoration: none;
}
`;
}

/**
 * Embed images into EPUB
 * Uses parallel loading for better performance
 * @returns {Promise<Array>} Image manifest entries
 */
async function embedEpubImages(zip, content, updateState) {
  const imageManifest = [];
  let imageIndex = 0;
  
  // Collect all images
  const imageItems = content.filter(item => item.type === 'image' && (item.src || item.base64));
  log('EPUB: Found images to embed', { count: imageItems.length });
  
  if (imageItems.length === 0) {
    return imageManifest;
  }
  
  if (updateState) {
    updateState({ status: `Loading ${imageItems.length} images...`, progress: 87 });
  }
  
  // Process images in parallel batches
  const CONCURRENCY = 8;
  const results = await processImagesInBatches(
    imageItems,
    CONCURRENCY,
    updateState,
    async (item, index) => {
      let imageData = item.src || item.base64;
      if (!imageData) {
        return { item, imageData: null, index };
      }
      
      // If not base64, fetch and convert
      if (!imageData.startsWith('data:')) {
        log(`EPUB: Fetching image ${index + 1}`, { url: imageData.substring(0, 80) });
        const base64 = await imageToBase64(imageData);
        if (!base64) {
          log(`EPUB: Failed to fetch image ${index + 1}, skipping`);
          return { item, imageData: null, index };
        }
        imageData = base64;
      }
      
      return { item, imageData, index };
    }
  );
  
  // Process results and add to ZIP
  for (const { item, imageData, index } of results) {
    if (!imageData) continue;
    
    try {
      // Extract base64 data
      const base64Match = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        const mediaType = base64Match[1];
        const base64Data = base64Match[2];
        
        // Determine extension
        let ext = mediaType.split('/')[1] || 'png';
        if (ext === 'jpeg') ext = 'jpg';
        const filename = `image-${imageIndex}.${ext}`;
        
        // Add to ZIP
        zip.file(`OEBPS/images/${filename}`, base64Data, { base64: true });
        
        // Add to manifest
        imageManifest.push({
          id: `img-${imageIndex}`,
          href: `images/${filename}`,
          mediaType: mediaType
        });
        
        // Update item for content XHTML reference
        item._epubSrc = `images/${filename}`;
        
        imageIndex++;
        log(`EPUB: Embedded image ${imageIndex}`, { filename });
      }
    } catch (error) {
      logError('EPUB: Failed to process image', error);
    }
  }
  
  log('EPUB: Embedded images', { count: imageIndex });
  return imageManifest;
}

