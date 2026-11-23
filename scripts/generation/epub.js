import { imageDataError } from '../utils/html/image-bytes.js';
import { downloadBlob } from '../api/blob-download.js';
import { documentText, documentPlainText, documentMarkdown, renderTableHtml, listHtml, normalizeDocumentContent, localDocumentName } from './document-content.js';
// @ts-check
// EPUB generation module for ClipAIble extension
// EPUB is a ZIP archive with specific structure

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData
// @typedef {import('../types.js').ProcessingState} ProcessingState

import { log, logError, logWarn } from '../utils/logging.js';
import { stripHtml, markdownToHtml, sanitizeHtml } from '../utils/html.js';
import { imageToBase64, processImagesInBatches } from '../utils/images.js';
import JSZip from '../../lib/jszip-wrapper.js';
import { getDocumentLocalization, getDocumentLanguageTag, formatDateForDisplay, getLocaleFromLanguage } from '../utils/config.js';
import { getUILanguage, tSync, formatStatusUpdate } from '../locales.js';
import { PROCESSING_STAGES, isCancelled } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { filterFigureParagraphs } from './content.js';
import { buildTocStructure, renderTocAsHtml } from './toc-builder.js';
import { encodeFragmentIdentifier } from './source-fragments.js';
import { normalizeXmlCharacters, escapeXml, isNativePdfContent, protectXmlLiteralText, serializeXmlInline } from './xml.js';


/**
 * Generate EPUB file from content
 * @param {import('../types.js').GenerationData} data - Generation data
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<Blob>} Generated EPUB blob
 * @throws {Error} If content is empty
 * @throws {Error} If EPUB generation fails
 * @throws {Error} If image embedding fails
 * @throws {Error} If processing is cancelled
 * @see {@link DocumentGeneratorFactory.generate} For unified document generation interface
 * @see {@link generatePdf} For PDF generation (similar structure)
 * @see {@link generateFb2} For FB2 generation (similar structure)
 * @example
 * // Generate EPUB file
 * const epubBlob = await generateEpub({
 *   content: contentItems,
 *   title: 'Article Title',
 *   author: 'Author Name',
 *   generateToc: true,
 *   generateAbstract: true,
 *   language: 'en'
 * }, updateState);
 * const url = URL.createObjectURL(epubBlob);
 * // Download EPUB file...
 */
export async function generateEpub(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'en'
  } = data;
  
  log('=== EPUB GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content provided for EPUB generation');
    const normalized = await handleError(noContentError, {
      source: 'epubGeneration',
      errorType: 'noContentToGenerateEpub',
      logError: true,
      createUserMessage: true, // Use centralized user-friendly message
      context: {
        operation: 'validateContent',
        hasContent: !!content,
        contentLength: content?.length || 0
      }
    });
    
    const uiLang = await getUILanguage();
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error(normalized.userMessage || tSync('errorNoContentToGenerateEpub', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    Object.assign(error, getErrorTranslation(normalized));
    throw error;
  }
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingEpub', await getUILanguage()), progress: 82 });
  
  // Filter out paragraph elements that contain <figure> HTML when followed by image
  const filteredContent = normalizeDocumentContent(content, title, sourceUrl, { tableCellFragmentTargets: true });
  if (filteredContent.length !== content.length) {
    log('Filtered figure-in-paragraph duplicates', {
      originalCount: content.length,
      filteredCount: filteredContent.length,
      removedCount: content.length - filteredContent.length
    });
  }
  
  const zip = new JSZip();
  
  // Generate unique identifier for the book
  const bookId = `urn:uuid:${generateUUID()}`;
  const langCode = language || 'auto';
  const safeTitle = title || 'Article';
  // Only use author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const safeAuthor = cleanAuthor(author);
  // Format ISO date to readable format using language code
  const pubDate = formatDateForDisplay(publishDate, langCode) || publishDate || '';
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingEpub', await getUILanguage()), progress: 85 });
  
  // 1. mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  
  // 2. META-INF/container.xml
  zip.file('META-INF/container.xml', normalizeXmlCharacters(generateContainerXml()));
  
  // 3. Collect headings for TOC (preserve original IDs for internal links)
  // Include all headings starting from level 1 (same as PDF/Markdown)
  if (generateToc) {
    log('📑 Collecting headings for EPUB table of contents');
  }
  const headings = [];
  filteredContent.forEach((item, index) => {
    if (item.type === 'heading' && item.level >= 1) {
      const text = documentPlainText(item, sourceUrl);
      if (text) {
        // Use original id from page (e.g. "TradRevi") or generate fallback
        const originalId = item.id || `heading-${index}`;
        headings.push({ text, level: item.level, id: originalId });
      }
    }
  });
  
  // 4. Embed images FIRST (sets _epubSrc on items)
  const imageCount = filteredContent.filter(item => item.type === 'image').length;
  if (imageCount > 0) {
    log(`🖼️ Loading and embedding ${imageCount} images for EPUB`);
  }
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, ...formatStatusUpdate('stageLoadingImages', await getUILanguage()), progress: 87 });
  }
  const imageManifest = await embedEpubImages(zip, filteredContent, updateState, { processingRunId: data.processingRunId });
  if (imageCount > 0) {
    log(`✅ Images embedded: ${imageManifest.length} images added to EPUB`);
  }
  
  // 5. Generate content XHTML (uses _epubSrc for images)
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingEpub', await getUILanguage()), progress: 90 });
  const contentXhtml = generateContentXhtml(filteredContent, safeTitle, safeAuthor, pubDate, sourceUrl, headings, language, generateAbstract, abstract);
  zip.file('OEBPS/content.xhtml', normalizeXmlCharacters(contentXhtml));
  
  // 6. Generate TOC navigation (only if more than 1 heading)
  if (generateToc && headings.length > 1) {
    log(`📑 Generating EPUB table of contents: ${headings.length} headings`);
  }
  const navXhtml = generateNavXhtml(safeTitle, headings, generateToc && headings.length > 1, langCode);
  zip.file('OEBPS/nav.xhtml', normalizeXmlCharacters(navXhtml));
  
  // 7. Generate NCX for EPUB 2 compatibility
  const tocNcx = generateTocNcx(bookId, safeTitle, headings, generateToc && headings.length > 1);
  zip.file('OEBPS/toc.ncx', normalizeXmlCharacters(tocNcx));
  if (generateToc && headings.length > 1) {
    log('✅ EPUB table of contents generated');
  }
  
  // 8. Generate styles
  zip.file('OEBPS/style.css', generateEpubStyles());
  
  // 9. Generate content.opf (package file with image manifest)
  let contentOpf = generateContentOpf(bookId, safeTitle, safeAuthor, langCode, publishDate, sourceUrl, generateToc);
  if (imageManifest.length > 0) {
    contentOpf = addImagesToOpf(contentOpf, imageManifest);
  }
  zip.file('OEBPS/content.opf', normalizeXmlCharacters(contentOpf));
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingEpub', await getUILanguage()), progress: 95 });
  
  // Generate the ZIP file as blob to avoid large base64 in memory
  log('Generating ZIP...');
  
  // Calculate estimated size metrics
  const contentSize = new TextEncoder().encode(contentXhtml).length;
  const estimatedSize = contentSize + (imageManifest.length * 50000); // Rough estimate: content + ~50KB per image
  const estimatedSizeMB = (estimatedSize / 1024 / 1024).toFixed(2);
  
  log('📊 EPUB generation metrics', {
    contentItems: filteredContent?.length || 0,
    images: imageManifest.length,
    headings: headings.length,
    estimatedSize: `${estimatedSizeMB} MB`,
    contentSize: `${(contentSize / 1024).toFixed(1)} KB`
  });
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
  
  // Create EPUB blob with correct MIME type
  const epubBlob = new Blob([zipBlob], { type: 'application/epub+zip' });
  
  const sizeMB = (epubBlob.size / 1024 / 1024).toFixed(2);
  log('📊 EPUB file generated', {
    size: `${sizeMB} MB`,
    sizeBytes: epubBlob.size,
    images: imageManifest.length,
    headings: headings.length,
    contentItems: filteredContent?.length || 0
  });
  
  // Generate safe filename
  const safeFilename = sanitizeFilename(safeTitle);
  const filename = `${safeFilename}.epub`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled(data.processingRunId)) {
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
      if (isCancelled(data.processingRunId)) {
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
    await downloadBlob(epubBlob, filename, data.processingRunId);
  }
  
  log('=== EPUB GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ ...formatStatusUpdate('statusDone', await getUILanguage()), progress: 100 });
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
  const escapedSource = escapeXml(localDocumentName(sourceUrl) ?? sourceUrl);
  
  // Content always first, then nav (TOC) if enabled
  const navInSpine = generateToc ? '\n    <itemref idref="nav"/>' : '';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapedTitle}</dc:title>
${author ? `    <dc:creator>${escapedAuthor}</dc:creator>` : ''}
    <dc:language>${escapeXml(getDocumentLanguageTag(lang))}</dc:language>
${/^\d{4}(?:-\d{2})?(?:-\d{2})?(?:T.*)?$/.test(pubDate) && !isNaN(Date.parse(pubDate)) ? `    <dc:date>${escapeXml(pubDate)}</dc:date>` : ''}
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
  const langCode = language || 'auto';
  const l10n = getDocumentLocalization(langCode);
  const contentsLabel = l10n.contents || 'Contents';
  
  let tocHtml = '';
  if (generateToc && headings.length > 1) {
    const tocListHtml = renderTocAsHtml(buildTocStructure(headings).items, escapeXml, escapeXml,
      'ol', '', (id, text) => `<a href="content.xhtml#${escapeXml(encodeFragmentIdentifier(id))}">${escapeXml(text)}</a>`);
    tocHtml = `    <nav epub:type="toc" id="toc">
      <h2>${escapeXml(contentsLabel)}</h2>${tocListHtml}
    </nav>`;
  } else {
    tocHtml = `    <nav epub:type="toc" id="toc">
      <h2>${escapeXml(contentsLabel)}</h2>
      <ol>
        <li><a href="content.xhtml">${escapedTitle}</a></li>
      </ol>
    </nav>`;
  }
  
  const langAttr = getDocumentLanguageTag(langCode);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(langAttr)}">
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
  if (generateToc && headings.length > 1) {
    navPoints = headings.map((h, i) => `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(h.text)}</text></navLabel>
      <content src="content.xhtml#${escapeXml(encodeFragmentIdentifier(h.id))}"/>
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
  const langCode = language || 'auto';
  const l10n = getDocumentLocalization(langCode);
  const sourceLabel = l10n.source || 'Source';
  const dateLabel = l10n.date || 'Date';
  
  // Extract subtitle from content (if present)
  let subtitleHtml = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
      const subtitleText = documentText(item, sourceUrl);
      if (subtitleText) {
        const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
        subtitleHtml = `\n    <p class="standfirst"${idAttr}>${serializeXmlInline(subtitleText, 'xhtml')}</p>`;
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
  
  // Only show author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const cleanedAuthor = cleanAuthor(author);
  const hasValidAuthor = !!cleanedAuthor;
  
  if (hasValidAuthor || pubDate) {
    headerHtml += '\n    <p class="meta">';
    if (hasValidAuthor) headerHtml += `<span class="author">${escapedAuthor}</span>`;
    if (hasValidAuthor && pubDate) headerHtml += ' · ';
    if (pubDate) headerHtml += `<span class="date-label">${escapeXml(dateLabel)}:</span> <span class="date">${escapeXml(pubDate)}</span>`;
    headerHtml += '</p>';
  }
  
  if (sourceUrl) {
    const localName = localDocumentName(sourceUrl);
    if (localName !== null) {
      if (localName) headerHtml += `\n    <p class="source">${escapeXml(sourceLabel)}: ${escapeXml(localName)}</p>`;
    } else {
      // For non-local files, show "Source:" label with link
      headerHtml += `\n    <p class="source">${sanitizeHtmlForXhtml(`<a href="${escapeXml(sourceUrl)}">${escapeXml(sourceLabel)}</a>`, sourceUrl)}</p>`;
    }
  }
  
  headerHtml += '\n  </header>';
  
  // Add abstract if enabled
  let abstractHtml = '';
  if (generateAbstract && abstract) {
    // langCode already computed above
    const abstractL10n = getDocumentLocalization(langCode);
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
    if (item.type === 'heading' && item.level >= 1) {
      headingIndex++;
    }
  }
  
  // langCode already computed above, use it for xml:lang
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(getDocumentLanguageTag(langCode))}">
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
      const text = documentText(item, sourceUrl);
      // Prefer original item.id, then headings array, then fallback
      const id = item.id || headings[headingIndex]?.id || `heading-${headingIndex}`;
      return `    <h${level} id="${escapeXml(id)}">${serializeXmlInline(text, 'xhtml')}</h${level}>\n`;
    }
    
    case 'paragraph': {
      const text = documentText(item, sourceUrl);
      if (!text.trim()) return '';
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      return `    <p${idAttr}>${serializeXmlInline(text, 'xhtml')}</p>\n`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = documentText(item, sourceUrl);
      if (!text.trim()) return '';
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      return `    <blockquote${idAttr}><p>${serializeXmlInline(text, 'xhtml')}</p></blockquote>\n`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      return `    <pre><code>${escapeXml(code)}</code></pre>\n`;
    }
    
    case 'list': {
      return `    ${serializeXmlInline(listHtml(item, sourceUrl), 'xhtml', true)}\n`;
    }
    
    case 'image': {
      // Use embedded path if available, otherwise original src
      const src = item._epubSrc || '';
      const idAttr = item.id ? ` id="${escapeXml(item.id)}"` : '';
      if (!src) return item.src ? `    <p${idAttr}>${serializeXmlInline(sanitizeHtml(`<a href="${escapeXml(item.src)}">${escapeXml(item.alt || item.caption || item.src)}</a>`, sourceUrl), 'xhtml')}</p>\n` : '';
      const alt = escapeXml(item.alt || '');
      
      // Check if caption is generic (e.g., "image3", "image1", "photo2", etc.)
      const isGenericCaption = (caption) => {
        if (!caption || !caption.trim()) return false;
        const lowerCaption = caption.trim().toLowerCase();
        
        // Check if it matches pattern: generic word + optional number (e.g., "image3", "photo1", "img2")
        // Pattern: word (image, photo, etc.) optionally followed by digits
        const genericPattern = /^(image|photo|picture|img|изображение|фото|картинка|зображення|фотографія|bild|foto|abbildung|imagen|immagine|imagem|图像|图片|照片|画像|写真|이미지|사진|그림)\d*$/i;
        if (genericPattern.test(lowerCaption)) {
          return true;
        }
        
        // Also check against generic texts list
        const genericTexts = [
          'image', 'photo', 'picture', 'img', 'image:', 'photo:', 'picture:', 'img:',
          'изображение', 'фото', 'картинка', 'изображение:', 'фото:', 'картинка:',
          'зображення', 'фотографія', 'картинка', 'зображення:', 'фотографія:', 'картинка:',
          'bild', 'foto', 'abbildung', 'bild:', 'foto:', 'abbildung:',
          'image', 'photo', 'image:', 'photo:',
          'imagen', 'foto', 'imagen:', 'foto:',
          'immagine', 'foto', 'immagine:', 'foto:',
          'imagem', 'foto', 'imagem:', 'foto:',
          '图像', '图片', '照片', '图像:', '图片:', '照片:',
          '画像', '写真', '画像:', '写真:',
          '이미지', '사진', '그림', '이미지:', '사진:', '그림:'
        ];
        return genericTexts.includes(lowerCaption);
      };
      
      const captionText = item.caption || '';
      const caption = (captionText && !isGenericCaption(captionText)) ? sanitizeHtmlForXhtml(captionText, sourceUrl, isNativePdfContent(item)) : '';
      if (!src) return '';

      let figureHtml = `    <figure${idAttr}><img src="${escapeXml(src)}" alt="${alt}"/>`;
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
      return `    ${renderTableHtml(item, sourceUrl, { xhtml: true, assumeFirstRowHeader: true })}\n`;
    }
    
    case 'subtitle': {
      // Subtitle is already handled in generateContentXhtml, skip here
      return '';
    }
    
    default: {
      if (item.text) {
        return `    <p>${sanitizeHtmlForXhtml(item.text, sourceUrl, isNativePdfContent(item))}</p>\n`;
      }
      return '';
    }
  }
}

/**
 * Sanitize HTML for XHTML (close tags, escape entities)
 */
function sanitizeHtmlForXhtml(html, sourceUrl = '', plainText = false) {
  if (!html) return '';
  if (plainText) return escapeXml(html);
  let result = normalizeXmlCharacters(html);
  const hasMarkdown = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s\n]+\*|_[^_\s\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/.test(result);
  if (hasMarkdown) result = markdownToHtml(result);
  result = sanitizeHtml(protectXmlLiteralText(result), sourceUrl);
  result = result.replace(/\s*style\s*=\s*["'][^"']*color\s*:[^"']*["']/gi, '');
  result = result.replace(/\s*style\s*=\s*["']\s*["']/gi, '');
  return serializeXmlInline(result, 'xhtml').trim();
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
  display: block;
  margin: 1em 0;
  text-align: center;
}

figcaption {
  display: block;
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

.table-muted {
  opacity: 0.68;
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
async function embedEpubImages(zip, content, updateState, options) {
  const imageManifest = [];
  let imageIndex = 0;
  
  // Collect all images
  const imageItems = content.filter(item => item.type === 'image' && (item.src || item.base64));
  log('EPUB: Found images to embed', { count: imageItems.length });
  
  if (imageItems.length === 0) {
    return imageManifest;
  }
  
  if (updateState) {
    updateState({ ...formatStatusUpdate('statusLoadingImagesCount', await getUILanguage(), { count: imageItems.length }), progress: 87 });
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
      
      imageData = await imageToBase64(imageData, options);
      
      return { item, imageData, index };
    }
  );
  
  if (options?.processingRunId !== undefined && isCancelled(options.processingRunId)) throw new DOMException('Processing cancelled', 'AbortError');
  const rejected = results.find(result => result.errorCode?.startsWith('IMAGE_') && result.errorCode !== 'IMAGE_FETCH_FAILED');
  if (rejected) throw imageDataError(rejected.errorCode);

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

