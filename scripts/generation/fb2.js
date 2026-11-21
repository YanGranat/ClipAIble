import { imageDataError } from '../utils/html/image-bytes.js';
import { fb2ListParagraphs } from './fb2-list.js';
import { downloadBlob } from '../api/blob-download.js';
import { documentText, documentPlainText, documentMarkdown, tableCellHtml, listHtml, normalizeDocumentContent, flatTableProjection } from './document-content.js';
// @ts-check
// FB2 (FictionBook 2) generation module for ClipAIble extension
// FB2 is an XML-based format popular for e-readers in Russian-speaking countries

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData

import { log, logError, logWarn } from '../utils/logging.js';
import { stripHtml, htmlToMarkdown, markdownToHtml, cleanTildaArtifactsFromText, sanitizeHtml } from '../utils/html.js';
import { imageToBase64, processImagesInBatches } from '../utils/images.js';
import { getDocumentLocalization, getDocumentLanguageTag, formatDateForDisplay, getLocaleFromLanguage, getExtensionVersion } from '../utils/config.js';
import { getUILanguage, tSync, formatStatusUpdate } from '../locales.js';
import { PROCESSING_STAGES, isCancelled } from '../state/processing.js';
import { sanitizeFilename } from '../utils/security.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { filterFigureParagraphs } from './content.js';
import { normalizeXmlCharacters, escapeXml, xmlIdentifier, isNativePdfContent, protectXmlLiteralText, serializeXmlInline } from './xml.js';
import { buildTocStructure, renderTocAsFb2 } from './toc-builder.js';


/**
 * Generate FB2 file from content
 * @param {import('../types.js').GenerationData} data - Generation data
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<Blob>} Generated FB2 blob
 * @throws {Error} If content is empty
 * @throws {Error} If FB2 generation fails
 * @throws {Error} If image embedding fails
 * @throws {Error} If processing is cancelled
 * @see {@link DocumentGeneratorFactory.generate} For unified document generation interface
 * @see {@link generatePdf} For PDF generation (similar structure)
 * @see {@link generateEpub} For EPUB generation (similar structure)
 * @example
 * // Generate FB2 file (popular e-reader format in Russian-speaking countries)
 * const fb2Blob = await generateFb2({
 *   content: contentItems,
 *   title: 'Article Title',
 *   author: 'Author Name',
 *   generateToc: true,
 *   language: 'ru'
 * }, updateState);
 * const url = URL.createObjectURL(fb2Blob);
 * // Download FB2 file...
 */
export async function generateFb2(data, updateState) {
  const { 
    content, title, author = '', sourceUrl = '', publishDate = '', 
    generateToc = false, generateAbstract = false, abstract = '', language = 'en'
  } = data;
  
  // Filter out paragraph elements that contain <figure> HTML when followed by image
  const filteredContent = normalizeDocumentContent(content, title, sourceUrl, { inlineFragmentTargets: false });
  if (filteredContent.length !== (content?.length || 0)) {
    log('Filtered figure-in-paragraph duplicates', {
      originalCount: content?.length || 0,
      filteredCount: filteredContent.length,
      removedCount: (content?.length || 0) - filteredContent.length
    });
  }
  
  // Collect headings for TOC and sections
  // Include all headings starting from level 1 (same as PDF/Markdown/EPUB)
  if (generateToc) {
    log('📑 Collecting headings for FB2 table of contents');
  }
  const headings = [];
  const allHeadings = [];
  (filteredContent || []).forEach((item, index) => {
    // Log ALL heading items for debugging
    if (item.type === 'heading') {
      let text = documentPlainText(item, sourceUrl);
      text = cleanTildaArtifactsFromText(text) || text;
      allHeadings.push({
        index,
        level: item.level,
        text: text.substring(0, 50),
        textLength: text.length,
        id: item.id || 'no-id',
        rawText: item.text?.substring(0, 100) || ''
      });
      
      if (item.level >= 1 && text) {
        headings.push({ 
          text, 
          level: item.level, 
          index,
          id: item.id || `heading-${index}` // Include id for TOC links
        });
      }
    }
  });
  
  log('FB2: All heading items found in content', {
    totalHeadings: allHeadings.length,
    headingsForToc: headings.length,
    allHeadings: allHeadings,
    headingsForTocDetails: headings.map(h => ({
      index: h.index,
      level: h.level,
      text: h.text.substring(0, 50),
      id: h.id
    }))
  });
  
  log('=== FB2 GENERATION START ===');
  log('Input', { title, author, contentItems: filteredContent?.length, generateToc, headingsCount: headings.length });
  
  if (!content || content.length === 0) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content provided for FB2 generation');
    const normalized = await handleError(noContentError, {
      source: 'fb2Generation',
      errorType: 'noContentToGenerateFb2',
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
    const error = new Error(normalized.userMessage || tSync('errorNoContentToGenerateFb2', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    Object.assign(error, getErrorTranslation(normalized));
    throw error;
  }
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingFb2', await getUILanguage()), progress: 85 });
  
  const langCode = language || 'auto';
  const safeTitle = title || 'Article';
  // Format ISO date to readable format using language code
  const pubDate = formatDateForDisplay(publishDate, langCode) || publishDate || '';
  
  // Parse author name
  const authorParts = parseAuthorName(author);
  
  // Generate unique document ID
  const docId = generateDocId();
  
  // Collect and embed images for binary section
  const imageCount = filteredContent.filter(item => item.type === 'image').length;
  if (imageCount > 0) {
    log(`🖼️ Loading and embedding ${imageCount} images for FB2`);
  }
  if (updateState) {
    const uiLang = await getUILanguage();
    const loadingStatus = tSync('stageLoadingImages', uiLang);
    updateState({ stage: PROCESSING_STAGES.LOADING_IMAGES.id, ...formatStatusUpdate('stageLoadingImages', await getUILanguage()), progress: 86 });
  }
  const images = await collectFb2Images(filteredContent, updateState, { processingRunId: data.processingRunId });
  
  log('Collected', { headings: headings.length, images: images.length });
  if (imageCount > 0) {
    log(`✅ Images embedded in FB2: ${images.length} images`);
  }
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingFb2', await getUILanguage()), progress: 90 });
  
  // Build FB2 XML
  let fb2 = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
${generateDescription(safeTitle, authorParts, langCode, pubDate, sourceUrl, docId)}
${generateBody(filteredContent, safeTitle, authorParts, generateToc, headings, pubDate, sourceUrl, langCode, generateAbstract, abstract)}
${generateBinaries(images)}
</FictionBook>`;
  fb2 = normalizeXmlCharacters(fb2);
  
  if (updateState) updateState({ ...formatStatusUpdate('statusSavingFile', await getUILanguage()), progress: 95 });
  
  // Calculate size metrics
  const fb2Size = new TextEncoder().encode(fb2).length;
  const sizeMB = (fb2Size / 1024 / 1024).toFixed(2);
  log('📊 FB2 file generated', {
    size: `${sizeMB} MB`,
    sizeBytes: fb2Size,
    contentItems: filteredContent?.length || 0,
    images: images.length,
    headings: headings.length
  });
  
  // Generate safe filename
  const safeFilename = sanitizeFilename(safeTitle);
  const filename = `${safeFilename}.fb2`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled(data.processingRunId)) {
    log('Processing cancelled, skipping FB2 download');
    throw new Error(tSync('statusCancelled', await getUILanguage()));
  }
  
  // Create blob/object URL for download to avoid large base64 strings
  const blob = new Blob([fb2], { type: 'application/x-fictionbook+xml' });
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);

  log('Downloading FB2...', { filename, length: fb2.length });
  
  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
      // Check again before actual download
      if (isCancelled(data.processingRunId)) {
        log('Processing cancelled, skipping FB2 download');
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
    await downloadBlob(blob, filename, data.processingRunId);
  }
  
  log('=== FB2 GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ ...formatStatusUpdate('statusDone', await getUILanguage()), progress: 100 });
  }
  
  return blob;
}

/**
 * Parse author name into first/middle/last parts
 */
function parseAuthorName(author) {
  if (!author) {
    return { firstName: '', middleName: '', lastName: '' };
  }
  
  // Only parse author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const cleanedAuthor = cleanAuthor(author);
  if (!cleanedAuthor) {
    return { firstName: '', middleName: '', lastName: '' };
  }
  
  const parts = cleanedAuthor.split(/\s+/);
  
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
async function collectFb2Images(content, updateState, options) {
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
    updateState({ ...formatStatusUpdate('statusLoadingImagesCount', await getUILanguage(), { count: imageItems.length }), progress: 86 });
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
      
      imageSource = await imageToBase64(imageSource, options);
      
      return { item, imageSource, index };
    }
  );
  
  if (options?.processingRunId !== undefined && isCancelled(options.processingRunId)) throw new DOMException('Processing cancelled', 'AbortError');
  const rejected = results.find(result => result.errorCode?.startsWith('IMAGE_') && result.errorCode !== 'IMAGE_FETCH_FAILED');
  if (rejected) throw imageDataError(rejected.errorCode);

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
  
  let authorXml = '      <author><nickname/></author>';
  // Only include author if it exists (not empty/anonymous)
  if (author.firstName || author.lastName) {
    authorXml = `      <author>
        <first-name>${escapeXml(author.firstName)}</first-name>
${author.middleName ? `        <middle-name>${escapeXml(author.middleName)}</middle-name>\n` : ''}        <last-name>${escapeXml(author.lastName)}</last-name>
      </author>`;
  }
  // If author is empty/anonymous, don't include author tag at all
  
  // Note: date and source URL are shown in body, not in description
  // to avoid duplicate display in some readers
  return `  <description>
    <title-info>
      <genre>unrecognised</genre>
${authorXml}
      <book-title>${escapedTitle}</book-title>
      <lang>${escapeXml(getDocumentLanguageTag(lang))}</lang>
    </title-info>
    <document-info>
      <author>
        <nickname>ClipAIble Extension</nickname>
      </author>
      <program-used>ClipAIble v${getExtensionVersion()}</program-used>
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
  const langCode = language || 'auto';
  const l10n = getDocumentLocalization(langCode);
  const dateLabel = l10n.date || 'Date';
  const sourceLabel = l10n.source || 'Source';
  
  // Extract subtitle from content (if present)
  let subtitleText = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
      subtitleText = documentText(item, sourceUrl);
      if (subtitleText) {
        subtitleIndex = i;
        break;
      }
    }
  }
  
  // Title page section with book title, author, source and date
  let bodyContent = `  <body>
    <section>
      <title>
        <p>${escapedTitle}</p>
      </title>`;
  
  // Add subtitle after title if present (FB2 has native <subtitle> tag)
  if (subtitleText) {
    bodyContent += `
      <subtitle>${serializeXmlInline(subtitleText, 'fb2')}</subtitle>`;
  }
  
  bodyContent += `
      <empty-line/>`;
  
  // Add author
  if (authorName) {
    bodyContent += `
      <p><strong>${escapeXml(authorName)}</strong></p>
      <empty-line/>`;
  }
  
  // Add source URL
  if (sourceUrl) {
    // For local PDF files, show "Source:" label with filename (no link)
    const isLocalPdf = sourceUrl.startsWith('file://') && sourceUrl.toLowerCase().includes('.pdf');
    if (isLocalPdf) {
      // Extract filename from file:// URL
      let displaySource = sourceUrl;
      try {
        const match = sourceUrl.match(/\/([^\/]+\.pdf)(?:\?|$)/i);
        if (match) {
          displaySource = decodeURIComponent(match[1]);
        } else if (sourceUrl.startsWith('file://')) {
          const urlObj = new URL(sourceUrl);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          displaySource = decodeURIComponent(pathParts[pathParts.length - 1] || sourceUrl);
        }
      } catch (e) {
        const parts = sourceUrl.split('/');
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
      bodyContent += `
      <p>${escapeXml(sourceLabel)}: ${escapeXml(displaySource)}</p>`;
    } else {
      // For non-local files, show "Source:" label with link
      bodyContent += `
      <p>${convertInlineHtmlToFb2(`<a href="${escapeXml(sourceUrl)}">${escapeXml(sourceLabel)}</a>`, sourceUrl)}</p>`;
    }
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
  
  // Generate Table of Contents section if enabled (only if more than 1 heading)
  if (generateToc && headings.length > 1) {
    const contentsLabel = l10n.contents || 'Contents';
    
    // Build TOC structure using universal builder
    // Headings already have id from collection step
    const tocStructure = buildTocStructure(headings);
    
    // Count total items in structure (including nested)
    function countItems(items) {
      let count = 0;
      for (const item of items) {
        count++;
        if (item.children && item.children.length > 0) {
          count += countItems(item.children);
        }
      }
      return count;
    }
    
    log('FB2 TOC: Generating table of contents', {
      headingsCount: headings.length,
      minLevel: tocStructure.minLevel,
      structureItemsCount: tocStructure.items.length,
      totalItemsInStructure: countItems(tocStructure.items),
      structurePreview: JSON.stringify(tocStructure.items.map(item => ({
        text: item.text?.substring(0, 30),
        level: item.level,
        hasChildren: !!(item.children && item.children.length > 0),
        childrenCount: item.children?.length || 0
      }))).substring(0, 500),
      headings: headings.map((h, idx) => ({
        index: idx,
        level: h.level,
        text: h.text?.substring(0, 50) || '',
        id: h.id,
        indent: h.level - tocStructure.minLevel
      }))
    });
    
    // Render TOC as FB2 XML with proper hierarchical indentation
    const tocXml = renderTocAsFb2(tocStructure.items, escapeXml);
    
    bodyContent += `
    <section>
      <title><p>${escapeXml(contentsLabel)}</p></title>
${tocXml}
    </section>`;
    // TOC generation logged above
  }
  
  // Split content into sections by headings (excluding subtitle)
  const filteredContent = content.filter((item, index) => item.type !== 'subtitle');
  const sections = splitIntoSections(filteredContent, headings, sourceUrl);
  
  for (const section of sections) {
    bodyContent += generateSection(section, sourceUrl);
  }
  
  bodyContent += `
  </body>`;
  
  return bodyContent;
}

/**
 * Split content into sections based on headings
 * CRITICAL: Creates nested sections for proper hierarchy in FB2 readers
 * H1 creates top-level sections, H2+ create nested sections within parent sections
 */
function splitIntoSections(content, headings, sourceUrl = '') {
  
  if (headings.length === 0) {
    // No headings - single section with all content
    log('FB2 splitIntoSections: No headings found, returning single section');
    return [{ title: null, items: content, level: 0, nestedSections: [] }];
  }
  
  const topLevelSections = [];
  const sectionStack = []; // Stack for nested sections: [{section, level}, ...]
  
  log('FB2 splitIntoSections: Starting', {
    contentLength: content.length,
    headingsCount: headings.length,
    headingsPreview: headings.slice(0, 5).map(h => ({ level: h.level, text: h.text.substring(0, 30) }))
  });
  
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    
    if (item.type === 'heading') {
      const headingLevel = item.level || 1;
      let headingText = documentPlainText(item, sourceUrl);
      headingText = cleanTildaArtifactsFromText(headingText) || headingText;
      
      log('FB2 splitIntoSections: Processing heading', {
        index: i,
        level: headingLevel,
        text: headingText.substring(0, 50),
        id: item.id || 'no-id',
        stackDepth: sectionStack.length,
        stackLevels: sectionStack.map(s => s.level)
      });
      
      // Pop stack until we find the correct parent level
      // Parent level must be less than current level
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= headingLevel) {
        const popped = sectionStack.pop();
        log('FB2 splitIntoSections: Popped section from stack', {
          level: popped.level,
          title: popped.section.title?.substring(0, 50),
          reason: `current heading level ${headingLevel} <= stack level ${popped.level}`
        });
      }
      
      // Create new section
      const newSection = {
        title: headingText,
        level: headingLevel,
        id: item.id || null,
        items: [],
        nestedSections: []
      };
      
      if (sectionStack.length === 0) {
        // Top-level section (H1 or first heading)
        topLevelSections.push(newSection);
        log('FB2 splitIntoSections: Created top-level section', {
          level: headingLevel,
          title: headingText.substring(0, 50),
          id: item.id || 'no-id'
        });
      } else {
        // Nested section - add to parent's nestedSections
        const parent = sectionStack[sectionStack.length - 1];
        parent.section.nestedSections.push(newSection);
        log('FB2 splitIntoSections: Created nested section', {
          level: headingLevel,
          title: headingText.substring(0, 50),
          parentLevel: parent.level,
          parentTitle: parent.section.title?.substring(0, 50),
          id: item.id || 'no-id'
        });
      }
      
      // Push new section onto stack
      sectionStack.push({ section: newSection, level: headingLevel });
      
    } else {
      // Non-heading item: add to current section (top of stack)
      if (sectionStack.length > 0) {
        sectionStack[sectionStack.length - 1].section.items.push(item);
      } else {
        // No sections yet - create a temporary section for content before first heading
        if (topLevelSections.length === 0 || topLevelSections[topLevelSections.length - 1].title !== null) {
          topLevelSections.push({ title: null, items: [], level: 0, nestedSections: [] });
        }
        topLevelSections[topLevelSections.length - 1].items.push(item);
      }
    }
  }
  
  log('FB2 splitIntoSections: Complete', {
    topLevelSectionsCount: topLevelSections.length,
    sections: topLevelSections.map(s => ({
      title: s.title?.substring(0, 50) || 'null',
      level: s.level,
      itemsCount: s.items.length,
      nestedSectionsCount: s.nestedSections?.length || 0
    }))
  });
  
  return topLevelSections;
}

/**
 * Generate FB2 section (recursive for nested sections)
 */
function generateSection(section, sourceUrl = '', indent = 0) {
  const indentStr = '  '.repeat(indent);
  
  // Add id attribute to section for internal link targets
  const idAttr = section.id ? ` id="${escapeXml(xmlIdentifier(section.id))}"` : '';
  let sectionXml = `\n${indentStr}<section${idAttr}>`;
  
  log('FB2 generateSection: Starting', {
    sectionTitle: section.title?.substring(0, 50) || 'null',
    sectionLevel: section.level || 'unknown',
    sectionId: section.id || 'no-id',
    itemsCount: section.items.length,
    nestedSectionsCount: section.nestedSections?.length || 0,
    indent
  });
  
  if (section.title) {
    sectionXml += `
${indentStr}  <title><p>${escapeXml(section.title)}</p></title>`;
    log('FB2 generateSection: Added section title', {
      title: section.title.substring(0, 50)
    });
  }
  
  let ownItems = section.items.map(item => contentItemToFb2(item, sourceUrl, indent + 1)).join('');
  ownItems = ownItems.replace(/^(\s*<image\b[^>]*\/>)(?=\s*(?:<image\b|$))/, `$1\n${indentStr}  <empty-line/>`);
  sectionXml += ownItems && section.nestedSections?.length ? `\n${indentStr}  <section>${ownItems}\n${indentStr}  </section>` : ownItems;
  if (!ownItems && !section.nestedSections?.length) sectionXml += `\n${indentStr}  <empty-line/>`;
  
  // Process nested sections recursively
  if (section.nestedSections && section.nestedSections.length > 0) {
    log('FB2 generateSection: Processing nested sections', {
      count: section.nestedSections.length,
      parentTitle: section.title?.substring(0, 50)
    });
    for (const nestedSection of section.nestedSections) {
      sectionXml += generateSection(nestedSection, sourceUrl, indent + 1);
    }
  }
  
  sectionXml += `\n${indentStr}</section>`;
  
  log('FB2 generateSection: Complete', {
    sectionTitle: section.title?.substring(0, 50) || 'null',
    xmlLength: sectionXml.length,
    indent
  });
  
  return sectionXml;
}

/**
 * Create a schema-valid ID attribute for a block target.
 */
function createFb2Anchor(id) {
  if (!id) return '';
  return ` id="${escapeXml(xmlIdentifier(id))}"`;
}

/**
 * Convert content item to FB2 XML
 */
function contentItemToFb2(item, sourceUrl = '', indent = 1) {
  if (!item || !item.type) return '';
  
  // Calculate indentation string
  const indentStr = '  '.repeat(indent);
  
  // Create anchor for internal link targets
  const anchor = createFb2Anchor(item.id);
  
  switch (item.type) {
    case 'heading': {
      // CRITICAL: Headings should NOT appear as items in sections
      // They should have already been used to create sections in splitIntoSections
      // If a heading appears here, it means it wasn't processed correctly
      // Log warning and skip it (shouldn't happen in normal flow)
      log('FB2 contentItemToFb2: WARNING - heading found as item, should have been section title', {
        level: item.level,
        text: documentPlainText(item, sourceUrl).substring(0, 50),
        id: item.id || 'no-id'
      });
      // Return empty - heading should not be rendered as content item
      return '';
    }
    
    case 'paragraph': {
      const text = documentText(item, sourceUrl);
      if (!text.trim()) return '';
      return `\n${indentStr}  <p${anchor}>${serializeXmlInline(text, 'fb2')}</p>`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = documentText(item, sourceUrl);
      if (!text.trim()) return '';
      return `\n${indentStr}  <cite><p${anchor}>${serializeXmlInline(text, 'fb2')}</p></cite>`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      // FB2 doesn't have native code blocks, use preformatted paragraph
      const lines = code.split('\n');
      const firstLine = lines[0] || '';
      const restLines = lines.slice(1);
      // Add anchor to first line
      let result = `\n${indentStr}  <p${anchor}><code>${escapeXml(firstLine)}</code></p>`;
      result += restLines.map(line => `\n${indentStr}  <p><code>${escapeXml(line)}</code></p>`).join('');
      return result;
    }
    
    case 'list': {
      return fb2ListParagraphs(listHtml(item, sourceUrl)).map(part =>
        `\n${indentStr}  <p${createFb2Anchor(part.id)}>${escapeXml('\u00a0'.repeat(part.depth * 3) + part.prefix)}${serializeXmlInline(part.html, 'fb2')}</p>`).join('');
    }
    
    case 'image': {
      if (!item._fb2Id) {
        const label = item.caption || item.alt || item.src || '';
        const fallback = item.src ? convertInlineHtmlToFb2(`<a href="${escapeXml(item.src)}">${escapeXml(label)}</a>`, sourceUrl) : escapeXml(label);
        return fallback ? `\n${indentStr}  <p${anchor}>${fallback}</p>` : '';
      }
      const alt = escapeXml(item.alt || '');
      // CRITICAL: Use convertInlineHtmlToFb2 to preserve links in captions (like PDF)
      // This handles cases where caption contains HTML with links, e.g., <span>text</span><a href="...">(source)</a>
      const caption = item.caption ? convertInlineHtmlToFb2(item.caption, sourceUrl, isNativePdfContent(item)) : '';
      
      // Add anchor paragraph before image if id exists
      let imageXml = anchor ? `\n${indentStr}  <p${anchor}></p>` : '';
      imageXml += `\n${indentStr}  <image l:href="#${item._fb2Id}" alt="${alt}"/>`;
      if (caption) {
        imageXml += `\n${indentStr}  <p><emphasis>${caption}</emphasis></p>`;
      }
      return imageXml;
    }
    
    case 'hr':
    case 'divider':
    case 'separator': {
      return `\n${indentStr}  <empty-line/>\n${indentStr}  <p>* * *</p>\n${indentStr}  <empty-line/>`;
    }
    
    case 'table': {
      return tableToFb2(item, sourceUrl, indent);
    }
    
    case 'subtitle': {
      // Subtitle is already handled in generateBody, skip here
      return '';
    }
    
    default: {
      if (item.text) {
        return `\n${indentStr}  <p${anchor}>${convertInlineHtmlToFb2(item.text, sourceUrl, isNativePdfContent(item))}</p>`;
      }
      return '';
    }
  }
}

/**
 * Convert table cells to FB2 paragraphs.
 */
function tableToFb2(item, sourceUrl = '', indent = 1) {
  const projection = flatTableProjection(item);
  const rows = Array.isArray(projection.headers) && projection.headers.length
    ? [projection.headers, ...(projection.rows || [])] : projection.rows;
  if (!rows || !rows.length) return '';
  const indentStr = '  '.repeat(indent);
  
  let fb2 = `\n${indentStr}  <empty-line/>`;
  
  for (const row of rows) {
    const cells = row.map(cell => serializeXmlInline(tableCellHtml(item, cell, sourceUrl), 'fb2')).join(' | ');
    fb2 += `\n${indentStr}  <p>${cells}</p>`;
  }
  
  fb2 += `\n${indentStr}  <empty-line/>`;
  return fb2;
}

/**
 * Convert inline HTML tags to FB2 equivalents
 */
function convertInlineHtmlToFb2(html, sourceUrl = '', plainText = false) {
  if (!html) return '';
  if (plainText) return escapeXml(html);
  let result = normalizeXmlCharacters(html);
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(result);
  const hasMarkdown = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s\n]+\*|_[^_\s\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~)/.test(result);
  if (hasMarkdown && !hasHtmlTags) result = markdownToHtml(result);
  result = sanitizeHtml(protectXmlLiteralText(result), sourceUrl);
  return serializeXmlInline(result, 'fb2');
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

