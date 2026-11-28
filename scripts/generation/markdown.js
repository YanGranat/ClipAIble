import { documentText, documentPlainText, documentMarkdown, imageCaptionItem, tableCellHtml, listHtml, prepareDocumentContent, localDocumentName, flatTableProjection } from './document-content.js';
import { downloadBlob } from '../api/blob-download.js';
// @ts-check
// Markdown generation module for ClipAIble extension

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData
// @typedef {import('../types.js').ProcessingState} ProcessingState

import { log, logWarn, logDebug } from '../utils/logging.js';
import { stripHtml, htmlToMarkdown, escapeAttr } from '../utils/html.js';
import { getDocumentLocalization, formatDateForDisplay } from '../utils/config.js';
import { sanitizeFilename } from '../utils/security.js';
import { isCancelled } from '../state/processing.js';
import { getUILanguage, tSync, formatStatusUpdate } from '../locales.js';
import { isAnonymousAuthor, cleanAuthor } from '../utils/author-validator.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { filterFigureParagraphs } from './content.js';
import { collateLine } from '../offscreen/pdf/core/text-collation.js';


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
    logDebug('[Markdown] l10nCache size limit reached, removed oldest entry', {
      removedKey: firstKey,
      maxSize: MAX_L10N_CACHE_SIZE
    });
  }
  
  const l10n = getDocumentLocalization(cacheKey);
  l10nCache.set(cacheKey, l10n);
  return l10n;
}

/**
 * Generate Markdown file from content
 * @param {import('../types.js').GenerationData} data - Generation data
 * @param {function(Partial<import('../types.js').ProcessingState> & {stage?: string}): void} [updateState] - State update function
 * @returns {Promise<string>} Generated markdown content
 * @throws {Error} If content is empty
 * @throws {Error} If markdown generation fails
 * @throws {Error} If processing is cancelled
 * @see {@link DocumentGeneratorFactory.generate} For unified document generation interface
 * @see {@link generatePdf} For PDF generation (similar structure)
 * @see {@link generateEpub} For EPUB generation (similar structure)
 */
export async function generateMarkdown(data, updateState) {
  const { content, title, author = '', sourceUrl = '', publishDate = '', generateToc = false, generateAbstract = false, abstract = '', language = 'en', apiKey, model } = data;
  
  log('=== MARKDOWN GENERATION START ===');
  log('Input', { title, author, contentItems: content?.length, generateToc });
  
  if (!content || content.length === 0) {
    // Normalize error with context for better logging and error tracking
    const noContentError = new Error('No content provided for Markdown generation');
    const normalized = await handleError(noContentError, {
      source: 'markdownGeneration',
      errorType: 'noContentToGenerateMarkdown',
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
    const error = new Error(normalized.userMessage || tSync('errorNoContentToGenerateMarkdown', uiLang));
    error.code = normalized.code;
    error.originalError = normalized.originalError;
    error.context = normalized.context;
    Object.assign(error, getErrorTranslation(normalized));
    throw error;
  }
  
  if (updateState) updateState({ ...formatStatusUpdate('statusGeneratingMarkdown', await getUILanguage()), progress: 85 });
  
  // Filter out paragraph elements that contain <figure> HTML when followed by image
  let { content: filteredContent, titleId } = prepareDocumentContent(content, title, sourceUrl, { titleFragmentIds: data.titleFragmentIds });
  if (filteredContent.length !== content.length) {
    log('Filtered figure-in-paragraph duplicates', {
      originalCount: content.length,
      filteredCount: filteredContent.length,
      removedCount: content.length - filteredContent.length
    });
  }

  // Collect headings for TOC (include all levels, starting from level 1)
  const headings = [];
  for (const item of filteredContent) {
    if (item.type === 'heading' && item.level >= 1) {
      const text = stripHtml(item.text || '');
      if (text) headings.push({ text, level: item.level });
    }
  }
  
  log('Headings collected for TOC', { count: headings.length });
  
  let markdown = '';
  
  // Add title
  if (title) {
    // CRITICAL: Clean title from any markdown syntax (like #) that might have been added during translation or abstract generation
    // Title should be plain text, not markdown
    let cleanedTitle = title.trim();
    // Remove any leading markdown heading syntax (#, ##, ###, etc.)
    cleanedTitle = cleanedTitle.replace(/^#+\s*/, '').trim();
    // Remove any trailing markdown syntax
    cleanedTitle = cleanedTitle.replace(/\s*#+$/, '').trim();
    // Now add the markdown heading syntax
    if (titleId) markdown += `<a id="${escapeAttr(titleId)}"></a>\n\n`;
    markdown += `# ${cleanedTitle}\n\n`;
  }
  
  // Extract and add subtitle (if present)
  let subtitleText = '';
  let subtitleIndex = -1;
  for (let i = 0; i < filteredContent.length; i++) {
    if (filteredContent[i].type === 'subtitle') {
      const item = filteredContent[i];
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
  
  
  const metaItems = [];
  // Only show author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const cleanedAuthor = cleanAuthor(author);
  if (cleanedAuthor) {
    metaItems.push(`**${authorLabel}:** ${cleanedAuthor}`);
  }
  if (translatedDate) metaItems.push(`**${dateLabel}:** ${translatedDate}`);
  if (sourceUrl) {
    const localName = localDocumentName(sourceUrl);
    let displaySource = localName ?? sourceUrl;
    if (localName === null) {
      try {
        const filename = new URL(sourceUrl).pathname.split('/').at(-1);
        if (filename?.toLowerCase().endsWith('.pdf')) displaySource = decodeURIComponent(filename);
      } catch {
        // Keep the web address when there is no usable PDF filename.
      }
    }
    if (displaySource) metaItems.push(`**${sourceLabel}:** ${displaySource}`);
  }
  
  if (metaItems.length > 0) {
    markdown += metaItems.join('  \n') + '\n\n';
  }
  
  // Add abstract if enabled
  if (generateAbstract && abstract) {
    const abstractLabel = l10n.abstract || 'Abstract';
    markdown += `## ${abstractLabel}\n\n${abstract}\n\n---\n\n`;
  }
  
  // Generate Table of Contents if enabled (only if more than 1 heading)
  if (generateToc && headings.length > 1) {
    log(`📑 Generating table of contents: ${headings.length} headings`);
    const minLevel = Math.min(...headings.map(h => h.level));
    
    // Build nested TOC structure for Markdown
    // In Markdown, nested lists are created by indentation (2 spaces per level)
    let tocMarkdown = '';
    
    headings.forEach((h) => {
      const level = h.level;
      // Calculate indentation: 2 spaces per level difference from minLevel
      const indent = '  '.repeat(level - minLevel);
      
      // Add list item with proper indentation
      tocMarkdown += `${indent}- ${h.text}\n`;
    });
    
    markdown += `## ${contentsLabel}\n\n${tocMarkdown}\n---\n\n`;
  } else if (metaItems.length > 0 && !generateAbstract) {
    markdown += '---\n\n';
  }
  
  // Place blank lines between blocks without rewriting their contents.
  const blocks = [markdown.trimEnd()];
  for (const item of filteredContent) {
    if (item.type === 'subtitle') continue;
    const body = contentItemToMarkdown(item, sourceUrl).replace(/^\n+/, '').trimEnd();
    if (body) blocks.push(body);
  }
  markdown = blocks.filter(Boolean).join('\n\n') + '\n';

  log('Markdown generated', { length: markdown.length });
  
  if (updateState) updateState({ ...formatStatusUpdate('statusSavingFile', await getUILanguage()), progress: 95 });
  
  // Calculate size metrics
  const markdownSize = new TextEncoder().encode(markdown).length;
  const sizeMB = (markdownSize / 1024 / 1024).toFixed(2);
  log('📊 Markdown file generated', {
    size: `${sizeMB} MB`,
    sizeBytes: markdownSize,
    contentItems: filteredContent?.length || 0,
    headings: headings.length
  });
  
  // Generate safe filename
  const safeTitle = sanitizeFilename(title || 'article');
  const filename = `${safeTitle}.md`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled(data.processingRunId)) {
    log('Processing cancelled, skipping Markdown download');
    throw new Error(tSync('statusCancelled', await getUILanguage()));
  }
  
  // Regular Markdown download
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const urlApi = (typeof URL !== 'undefined' && URL.createObjectURL)
    ? URL
    : (typeof self !== 'undefined' && self.URL && self.URL.createObjectURL ? self.URL : null);
  
  if (urlApi && urlApi.createObjectURL) {
    const objectUrl = urlApi.createObjectURL(blob);
    try {
      // Check again before actual download
      if (isCancelled(data.processingRunId)) {
        log('Processing cancelled, skipping Markdown download');
        throw new Error(tSync('statusCancelled', await getUILanguage()));
      }
      
      await chrome.downloads.download({
        url: objectUrl,
        filename: filename,
        saveAs: true
      });
      log('Downloading Markdown file', { filename, length: markdown.length });
    } finally {
      urlApi.revokeObjectURL(objectUrl);
    }
  } else {
    await downloadBlob(blob, filename, data.processingRunId);
  }
  
  log('=== MARKDOWN GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ ...formatStatusUpdate('statusDone', await getUILanguage()), progress: 100 });
  }
  
  return markdown;
}

/**
 * Convert single content item to Markdown
 * @param {import('../types.js').ContentItem} item - Content item
 * @returns {string} Markdown text
 */
function contentItemToMarkdown(item, sourceUrl = '') {
  if (!item || !item.type) return '';
  const normalizeFragmentText = text => text.replace(/\s+/g, ' ').trim();
  const fragmentsMatchText = typeof item.text !== 'string' || !Array.isArray(item.lines) ||
    normalizeFragmentText(item.text) === normalizeFragmentText(item.lines.map(line =>
      line.items?.length ? collateLine(line.items) : line.text || '').join(' '));
  
  // Helper to format text with bold/italic/underline
  const formatText = (text, isBold, isItalic, isUnderlined) => {
    if (!text) return '';
    // CRITICAL: Use htmlToMarkdown to preserve links in markdown format [text](url)
    // htmlToMarkdown converts HTML links to markdown and also handles bold/italic
    // We need to preserve links but apply our own formatting
    let formatted = htmlToMarkdown(text);
    
    // CRITICAL: If htmlToMarkdown already applied bold/italic (from HTML), we need to preserve it
    // But we also need to apply our own formatting if specified
    // For now, apply formatting only if text doesn't already have markdown formatting
    // This is a simplified approach - in practice, links are preserved by htmlToMarkdown
    
    // Apply formatting in order: bold+italic, then bold, then italic
    // Only if not already formatted by htmlToMarkdown
    if (!formatted.includes('**') && !formatted.includes('*')) {
      if (isBold && isItalic) {
        formatted = `***${formatted}***`;
      } else if (isBold) {
        formatted = `**${formatted}**`;
      } else if (isItalic) {
        formatted = `*${formatted}*`;
      }
    }
    
    // Underline is applied using double underscores (Markdown underline syntax)
    if (isUnderlined && !formatted.includes('__')) {
      formatted = `__${formatted}__`;
    }
    
    return formatted;
  };
  
  // Helper to format text with fragments (for mixed formatting within element)
  // Uses items from lines to preserve formatting at word level
  const formatTextWithFragments = (item) => {
    // Diagnostic logging
    const hasLines = item && item.lines && Array.isArray(item.lines) && item.lines.length > 0;
    const firstLineHasItems = hasLines && item.lines[0] && item.lines[0].items && Array.isArray(item.lines[0].items) && item.lines[0].items.length > 0;
    const firstItemHasFormatting = firstLineHasItems && (
      item.lines[0].items[0].isBold !== undefined ||
      item.lines[0].items[0].isItalic !== undefined ||
      item.lines[0].items[0].isUnderlined !== undefined
    );
    
    logDebug(`[Markdown] formatTextWithFragments - type=${item?.type}, hasLines=${hasLines}, firstLineHasItems=${firstLineHasItems}, firstItemHasFormatting=${firstItemHasFormatting}, linesCount=${hasLines ? item.lines.length : 0}, firstLineItemsCount=${firstLineHasItems ? item.lines[0].items.length : 0}`);
    
    if (!hasLines || !fragmentsMatchText) {
      // Retained geometry must describe the current content before it can supply formatting.
      logDebug(`[Markdown] formatTextWithFragments - FALLBACK to simple formatting`);
      const sourceText = fragmentsMatchText ? item?.html || item?.text || '' : item.text;
      // Normalize only horizontal whitespace so newlines from htmlToMarkdown are preserved
      const normalizedText = sourceText.replace(/[ \t]+/g, ' ').trim();
      return formatText(normalizedText, item?.isBold, item?.isItalic, item?.isUnderlined);
    }
    
    // Process each line separately, then join with spaces
    const formattedLines = [];
    
    for (let lineIdx = 0; lineIdx < item.lines.length; lineIdx++) {
      const line = item.lines[lineIdx];
      
      if (!line.items || !Array.isArray(line.items) || line.items.length === 0) {
        // Fallback to line text with simple formatting
        logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx} has no items, using simple formatting`);
        const fallbackText = formatText(line.text || '', line.isBold, line.isItalic, line.isUnderlined);
        formattedLines.push(fallbackText);
        continue;
      }
      
      // Sort items by X coordinate to maintain reading order
      const sortedItems = [...line.items].sort((a, b) => (a.x || 0) - (b.x || 0));
      
      // Build formatted text with proper spacing
      let lineResult = '';
      let lastXEnd = null;
      const xTolerance = 3; // Same tolerance as in collateLine
      
      let formattedItemsCount = 0;
      for (const textItem of sortedItems) {
        let itemText = textItem.str || '';
        if (!itemText) continue;
        
        // CRITICAL: Normalize line breaks in item text - replace newlines with spaces
        // This prevents text from being split into multiple lines in markdown paragraphs
        itemText = itemText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!itemText) continue;
        
        // Add space if there's a gap between items
        if (lastXEnd !== null) {
          const itemX = textItem.x || 0;
          const itemWidth = textItem.width || 0;
          const gap = itemX - lastXEnd;
          
          if (gap > xTolerance) {
            lineResult += ' ';
          }
        }
        
        // Format this item
        // CRITICAL: Use htmlToMarkdown to preserve links, then strip markdown formatting if needed
        // First convert HTML to markdown to preserve links
        let formatted = htmlToMarkdown(itemText);
        // Then strip any markdown formatting that we'll reapply (bold, italic, underline)
        // But preserve links in markdown format [text](url)
        const isBold = textItem.isBold || false;
        const isItalic = textItem.isItalic || false;
        const isUnderlined = textItem.isUnderlined || false;
        
        // CRITICAL: Check for word-level underlining (partial text ranges)
        const hasPartialUnderlining = textItem.underlinedRanges && textItem.underlinedRanges.length > 0;
        
        // Log ALL items with detailed information (DEBUG only)
        logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: text="${itemText.substring(0, 40)}"`, {
          textItem_isBold: textItem.isBold,
          textItem_isItalic: textItem.isItalic,
          textItem_isUnderlined: textItem.isUnderlined,
          hasPartialUnderlining: hasPartialUnderlining,
          underlinedRanges: hasPartialUnderlining ? JSON.stringify(textItem.underlinedRanges) : 'none',
          finalBold: isBold,
          finalItalic: isItalic,
          finalUnderlined: isUnderlined,
          x: textItem.x?.toFixed(2),
          width: textItem.width?.toFixed(2),
          fontSize: textItem.fontSize?.toFixed(2),
          fontName: textItem.fontName || 'N/A'
        });
        
        // CRITICAL: If partial underlining is present, apply formatting only to specific ranges
        if (hasPartialUnderlining) {
          let result = '';
          let lastIndex = 0;
          
          // CRITICAL: Clamp ranges to valid bounds of formatted text
          // Ranges are computed for full item text, but formatted may be shorter
          const formattedLength = formatted.length;
          const itemTextLength = itemText.length;
          
          // Log range processing for debugging (DEBUG only)
          logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: Processing ranges - formattedLength=${formattedLength}, itemTextLength=${itemTextLength}, originalRanges=${JSON.stringify(textItem.underlinedRanges)}, itemText="${itemText.substring(0, 80)}"`);
          
          // Log if there's a mismatch between formatted length and item text length (DEBUG only)
          if (formattedLength !== itemTextLength) {
            logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: Length mismatch - formattedLength=${formattedLength}, itemTextLength=${itemTextLength}, itemText="${itemText.substring(0, 80)}"`);
          }
          
          const validRanges = textItem.underlinedRanges
            .map(range => {
              const clampedStart = Math.max(0, Math.min(range.startIndex, formattedLength));
              const clampedEnd = Math.max(0, Math.min(range.endIndex, formattedLength));
              logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: Clamping range [${range.startIndex},${range.endIndex}] -> [${clampedStart},${clampedEnd}] (formattedLength=${formattedLength})`);
              return {
                startIndex: clampedStart,
                endIndex: clampedEnd
              };
            })
            .filter(range => {
              const isValid = range.startIndex < range.endIndex && range.startIndex >= 0 && range.endIndex <= formattedLength;
              if (!isValid) {
                logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: Filtered out invalid range [${range.startIndex},${range.endIndex}] (formattedLength=${formattedLength})`);
              }
              return isValid;
            });
          
          logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: After filtering - validRanges=${JSON.stringify(validRanges)}, count=${validRanges.length}`);
          
          if (validRanges.length === 0) {
            // No valid ranges after clamping - skip partial underlining
            logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx}, Item ${formattedItemsCount}: No valid ranges after clamping (formattedLength=${formattedLength}, itemTextLength=${itemTextLength}, originalRanges=${JSON.stringify(textItem.underlinedRanges)}, itemText="${itemText.substring(0, 80)}")`);
          } else {
            // Sort underlined ranges by start index
            const sortedRanges = [...validRanges].sort((a, b) => a.startIndex - b.startIndex);
            
            for (const range of sortedRanges) {
              // Add text before the underlined range
              if (range.startIndex > lastIndex) {
                const beforeText = formatted.substring(lastIndex, range.startIndex);
                // Apply bold/italic to text before if needed
                let beforeFormatted = beforeText;
                if (isBold && isItalic) {
                  beforeFormatted = `***${beforeFormatted}***`;
                } else if (isBold) {
                  beforeFormatted = `**${beforeFormatted}**`;
                } else if (isItalic) {
                  beforeFormatted = `*${beforeFormatted}*`;
                }
                result += beforeFormatted;
              }
              
              // Format the underlined range
              const rangeText = formatted.substring(range.startIndex, range.endIndex);
              let rangeFormatted = rangeText;
              
              // Apply bold/italic first
              if (isBold && isItalic) {
                rangeFormatted = `***${rangeFormatted}***`;
              } else if (isBold) {
                rangeFormatted = `**${rangeFormatted}**`;
              } else if (isItalic) {
                rangeFormatted = `*${rangeFormatted}*`;
              }
              
              // Apply underline
              rangeFormatted = `__${rangeFormatted}__`;
              result += rangeFormatted;
              
              lastIndex = range.endIndex;
            }
            
            // Add remaining text after the last underlined range
            if (lastIndex < formatted.length) {
              const afterText = formatted.substring(lastIndex);
              // Apply bold/italic to text after if needed
              let afterFormatted = afterText;
              if (isBold && isItalic) {
                afterFormatted = `***${afterFormatted}***`;
              } else if (isBold) {
                afterFormatted = `**${afterFormatted}**`;
              } else if (isItalic) {
                afterFormatted = `*${afterFormatted}*`;
              }
              result += afterFormatted;
            }
            
            formatted = result;
            formattedItemsCount++;
          }
        } else {
          // Apply formatting to entire item (original behavior)
          // CRITICAL: htmlToMarkdown may have already converted HTML bold/italic to markdown
          // Check if formatting is already present before applying
          const hasBold = formatted.includes('**') || formatted.includes('__');
          const hasItalic = formatted.includes('*') && !formatted.includes('**');
          
          // Only apply formatting if not already present from htmlToMarkdown
          if (!hasBold && !hasItalic) {
            if (isBold && isItalic) {
              formatted = `***${formatted}***`;
              formattedItemsCount++;
            } else if (isBold) {
              formatted = `**${formatted}**`;
              formattedItemsCount++;
            } else if (isItalic) {
              formatted = `*${formatted}*`;
              formattedItemsCount++;
            }
          }
          
          // Underline is separate - check if already present
          const hasUnderline = formatted.includes('__');
          if (isUnderlined && !hasUnderline) {
            formatted = `__${formatted}__`;
            formattedItemsCount++;
          }
        }
        
        lineResult += formatted;
        
        // Update last X position
        const itemX = textItem.x || 0;
        const itemWidth = textItem.width || 0;
        lastXEnd = itemX + itemWidth;
      }
      
      logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx} processed: items=${sortedItems.length}, formattedItems=${formattedItemsCount}, resultLength=${lineResult.length}`);
      
      formattedLines.push(lineResult || line.text || '');
    }
    
    const result = formattedLines.join(' ');

    logDebug(`[Markdown] formatTextWithFragments - FINAL: lines=${formattedLines.length}, resultLength=${result.length}, hasFormatting=${result.includes('**') || result.includes('*') || result.includes('__')}`);
    
    // CRITICAL: Normalize line breaks in final result - replace newlines with spaces
    // This prevents text from being split into multiple lines in markdown paragraphs
    const finalResult = result || item.text || '';
    const normalizedResult = finalResult.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return normalizedResult;
  };
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const prefix = '#'.repeat(level);
      // CRITICAL: Headings should never have bold/italic formatting
      // Extract plain text without formatting
      let text = '';
      if (fragmentsMatchText && item.lines && Array.isArray(item.lines) && item.lines.length > 0) {
        // Extract text from lines without formatting
        const textParts = [];
        for (const line of item.lines) {
          if (line.items && Array.isArray(line.items) && line.items.length > 0) {
            const sortedItems = [...line.items].sort((a, b) => (a.x || 0) - (b.x || 0));
            for (const textItem of sortedItems) {
              const itemText = textItem.str || '';
              if (itemText) {
                textParts.push(stripHtml(itemText));
              }
            }
          } else if (line.text) {
            textParts.push(stripHtml(line.text));
          }
        }
        text = textParts.join(' ');
      } else {
        // Fallback to item text without formatting
        text = documentPlainText(item);
      }
      if (!text.trim()) return '';
      // Headings: one newline before, one after (will be cleaned up if needed)
      const anchor = item.id ? htmlToMarkdown(`<a id="${escapeAttr(item.id)}"></a>`) + '\n' : '';
      return `\n${anchor}${prefix} ${text}\n\n`;
    }
    
    case 'paragraph': {
      // Use fragment-based formatting if available, otherwise fallback to simple formatting
      const text = item.html !== undefined || item.format === 'text' || !fragmentsMatchText || !item.lines?.length
        ? documentMarkdown(item) : formatTextWithFragments(item);
      if (!text.trim()) return '';
      const anchor = typeof item.id === 'string' && item.id ? htmlToMarkdown(`<a id="${escapeAttr(item.id)}"></a>`) : '';
      // Paragraphs: just text with one newline after (no leading newline)
      return `${anchor && !text.includes(anchor) ? anchor : ''}${text}\n\n`;
    }
    
    case 'quote':
    case 'blockquote': {
      const text = documentMarkdown(item);
      if (!text.trim()) return '';
      const quoted = text.split('\n').map(line => `> ${line}`).join('\n');
      return `${quoted}\n\n`;
    }
    
    case 'code': {
      const code = item.text || item.code || '';
      const language = item.language || '';
      const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map(match => match[0].length + 1)));
      return `${fence}${language}\n${code}\n${fence}\n\n`;
    }
    
    case 'list': {
      return htmlToMarkdown(listHtml(item)) + '\n\n';
    }
    
    case 'image': {
      const alt = String(item.alt || '').replace(/([\\\[\]])/g, '\\$1');
      const src = String(item.src || item.base64 || '').replace(/[<>\s]/g, char => encodeURIComponent(char));
      const anchor = item.id ? htmlToMarkdown(`<a id="${escapeAttr(item.id)}"></a>`) + '\n' : '';
      const captionItem = imageCaptionItem(item);
      const caption = captionItem.format === 'text' ? documentMarkdown(captionItem)
        : htmlToMarkdown(documentText(captionItem, sourceUrl), sourceUrl);
      return src ? `${anchor}![${alt}](<${src}>)\n\n${caption ? caption + '\n\n' : ''}` : '';
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
 * @param {import('../types.js').ContentItem} item - Table item (must have type='table')
 * @returns {string} Markdown table
 */
function tableToMarkdown(item) {
  const projection = flatTableProjection(item);
  const rows = Array.isArray(projection.headers) && projection.headers.length
    ? [projection.headers, ...(projection.rows || [])] : projection.rows;
  if (!rows || !rows.length) return '';
  
  let md = '\n';
  const hasHeaders = projection.hasHeaders !== false; // Default to true if not specified
  const columns = rows.reduce((width, row) => Math.max(width, Array.isArray(row) ? row.length : 0), 0);
  if (!columns) return '';
  const padRow = row => Array.from({ length: columns }, (_, index) => row[index] ?? '');
  
  // Handle header row if present
  {
    const headerRow = hasHeaders ? padRow(rows[0] || []) : Array(columns).fill('');
    if (headerRow && headerRow.length > 0) {
      // CRITICAL: Use htmlToMarkdown to preserve links in table cells
      md += '| ' + headerRow.map(cell => htmlToMarkdown(tableCellHtml(item, cell)).replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ' |\n';
      // Create separator row with minimal dashes (Markdown tables only need 3+ dashes)
      // Use a reasonable length based on header, but cap it to avoid excessive length
      const separatorWidths = headerRow.map((headerCell) => {
        // For separator width calculation, use plain text length (without markdown formatting)
        const headerText = stripHtml(String(headerCell || ''));
        // Use header length, but cap at reasonable maximum (10 chars) for readability
        return Math.min(Math.max(headerText.length, 3), 10);
      });
      md += '|' + separatorWidths.map(width => '-'.repeat(width)).join('|') + '|\n';
    }
  }
  
  // Data rows (skip first row if it's a header)
  const startRow = hasHeaders ? 1 : 0;
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row)) {
      // CRITICAL: Use htmlToMarkdown to preserve links in table cells
      md += '| ' + padRow(row).map(cell => htmlToMarkdown(tableCellHtml(item, cell)).replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ' |\n';
    }
  }
  
  return md + '\n';
}
