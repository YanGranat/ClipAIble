// @ts-check
// Markdown generation module for ClipAIble extension

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').GenerationData} GenerationData
// @typedef {import('../types.js').ProcessingState} ProcessingState

import { log, logWarn, logDebug } from '../utils/logging.js';
import { stripHtml, htmlToMarkdown } from '../utils/html.js';
import { PDF_LOCALIZATION, formatDateForDisplay } from '../utils/config.js';
import { translateMetadata } from '../translation/index.js';
import { sanitizeFilename } from '../utils/security.js';
import { isCancelled } from '../state/processing.js';
import { getUILanguage, tSync } from '../locales.js';
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
    logDebug('[Markdown] l10nCache size limit reached, removed oldest entry', {
      removedKey: firstKey,
      maxSize: MAX_L10N_CACHE_SIZE
    });
  }
  
  const l10n = PDF_LOCALIZATION[cacheKey] || PDF_LOCALIZATION['en'];
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
    throw error;
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
    // CRITICAL: Clean title from any markdown syntax (like #) that might have been added during translation or abstract generation
    // Title should be plain text, not markdown
    let cleanedTitle = title.trim();
    // Remove any leading markdown heading syntax (#, ##, ###, etc.)
    cleanedTitle = cleanedTitle.replace(/^#+\s*/, '').trim();
    // Remove any trailing markdown syntax
    cleanedTitle = cleanedTitle.replace(/\s*#+$/, '').trim();
    // Now add the markdown heading syntax
    markdown += `# ${cleanedTitle}\n\n`;
  }
  
  // Extract and add subtitle (if present)
  let subtitleText = '';
  let subtitleIndex = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === 'subtitle') {
      const item = content[i];
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
  // Only show author if it exists and is not empty/anonymous
  // Use centralized validator to check all language variants
  const cleanedAuthor = cleanAuthor(author);
  if (cleanedAuthor) {
    metaItems.push(`**${authorLabel}:** ${cleanedAuthor}`);
  }
  if (translatedDate) metaItems.push(`**${dateLabel}:** ${translatedDate}`);
  if (sourceUrl) {
    // Extract only filename from URL (for local files, show just the filename)
    // Improved regex-based extraction with URL decoding
    let displaySource = sourceUrl;
    try {
      // Try regex extraction first (more reliable for file:// URLs)
      const match = sourceUrl.match(/\/([^\/]+\.pdf)(?:\?|$)/i);
      if (match) {
        displaySource = decodeURIComponent(match[1]);
        log('Markdown: Extracted filename from URL', {
          original: sourceUrl.substring(0, 100),
          extracted: displaySource
        });
      } else {
        // Fallback to URL parsing
        if (sourceUrl.startsWith('file://')) {
          const urlObj = new URL(sourceUrl);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          displaySource = decodeURIComponent(pathParts[pathParts.length - 1] || sourceUrl);
        } else {
          // For http/https URLs, extract filename from path
          const urlObj = new URL(sourceUrl);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          const filename = pathParts[pathParts.length - 1];
          if (filename && filename.toLowerCase().endsWith('.pdf')) {
            displaySource = decodeURIComponent(filename);
          }
        }
      }
    } catch (e) {
      // If URL parsing fails, try simple extraction
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
    metaItems.push(`**${sourceLabel}:** ${displaySource}`);
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
    markdown += `## ${contentsLabel}\n\n`;
    for (const h of headings) {
      const indent = '  '.repeat(h.level - minLevel);
      // Preserve numbering if present in heading text (e.g., "1. Introduction" -> "- 1. Introduction")
      markdown += `${indent}- ${h.text}\n`;
    }
    markdown += '\n---\n\n';
  } else if (metaItems.length > 0 && !generateAbstract) {
    markdown += '---\n\n';
  }
  
  // Process content items (skip subtitle - already added)
  let prevItemType = null;
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    if (item.type === 'subtitle') {
      continue;
    }
    
    // Add appropriate spacing based on previous item type
    const itemMarkdown = contentItemToMarkdown(item);
    if (itemMarkdown) {
      let cleanedMarkdown = itemMarkdown;
      
      // CRITICAL: No extra spacing between consecutive list items
      // Lists already have proper spacing internally
      if (prevItemType === 'list' && item.type === 'list') {
        // Remove leading newlines from consecutive lists
        cleanedMarkdown = cleanedMarkdown.replace(/^\n+/, '');
      }
      
      // Ensure proper spacing after lists (before non-list items)
      // CRITICAL: This must come AFTER the consecutive list check
      if (prevItemType === 'list' && item.type !== 'list') {
        // List followed by non-list - ensure blank line
        // Heading already has \n before itself, so we need to add \n to get \n\n (blank line)
        // Other items need \n before them
        if (!cleanedMarkdown.startsWith('\n')) {
          cleanedMarkdown = '\n' + cleanedMarkdown;
        }
      }
      
      // Ensure proper spacing before lists (if not after heading)
      if (prevItemType !== 'heading' && prevItemType !== 'list' && item.type === 'list') {
        // Non-heading, non-list followed by list - ensure blank line
        if (!cleanedMarkdown.startsWith('\n')) {
          cleanedMarkdown = '\n' + cleanedMarkdown;
        }
      }
      
      // FUNDAMENTAL: Adaptive spacing based on content type and context
      // If previous was same type (e.g., two paragraphs in a row), ensure proper spacing
      if (prevItemType === item.type && item.type === 'paragraph') {
        // Two paragraphs in a row - ensure single blank line between them
        if (!cleanedMarkdown.startsWith('\n')) {
          cleanedMarkdown = '\n' + cleanedMarkdown;
        }
      }
      
      // CRITICAL: Remove extra newlines from headings ONLY if they weren't added by list spacing logic
      // Headings already have \n before and \n\n after, so if previous item ended with \n\n,
      // we'll get \n\n\n\n. But if previous was list, we need the blank line.
      // Heading format: \n# Heading\n\n
      // After list: we add \n, heading has \n, so we get \n\n# Heading\n\n (correct - blank line before heading)
      if (item.type === 'heading' && prevItemType !== 'list' && cleanedMarkdown.startsWith('\n\n')) {
        // Remove one leading newline if we have \n\n (heading already has \n before)
        // But preserve if previous was list (we need blank line after list)
        cleanedMarkdown = cleanedMarkdown.substring(1);
      }
      
      markdown += cleanedMarkdown;
      prevItemType = item.type;
    }
  }
  
  // Clean up extra newlines (max 2 consecutive newlines)
  // IMPROVED: More aggressive cleanup - remove any sequence of 3+ newlines
  // CRITICAL: Also remove empty lines between content (e.g., \n\n\n becomes \n\n)
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  // Remove empty lines that appear between headings and content
  markdown = markdown.replace(/\n\n\n+/g, '\n\n');
  markdown = markdown.trim() + '\n';
  
  log('Markdown generated', { length: markdown.length });
  
  if (updateState) updateState({ status: 'Saving file...', progress: 95 });
  
  // Calculate size metrics
  const markdownSize = new TextEncoder().encode(markdown).length;
  const sizeMB = (markdownSize / 1024 / 1024).toFixed(2);
  log('📊 Markdown file generated', {
    size: `${sizeMB} MB`,
    sizeBytes: markdownSize,
    contentItems: content?.length || 0,
    headings: headings.length
  });
  
  // Generate safe filename
  const safeTitle = sanitizeFilename(title || 'article');
  const filename = `${safeTitle}.md`;
  
  // Check if processing was cancelled before downloading
  if (isCancelled()) {
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
      if (isCancelled()) {
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
    // Fallback: data URL via FileReader
    logWarn('⚠️ FALLBACK: createObjectURL unavailable - using data URL method (slower, larger memory)', {
      reason: 'URL.createObjectURL not available in MV3 service worker',
      method: 'data URL via FileReader (fallback)',
      impact: 'Slower download, higher memory usage',
      size: `${sizeMB} MB`
    });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    // Check again before actual download
    if (isCancelled()) {
      log('Processing cancelled, skipping Markdown download');
      throw new Error(tSync('statusCancelled', await getUILanguage()));
    }
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    log('Downloading Markdown (data URL fallback)...', { filename, length: markdown.length });
  }
  
  log('=== MARKDOWN GENERATION END ===');
  if (updateState) {
    const uiLang = await getUILanguage();
    updateState({ status: tSync('statusDone', uiLang), progress: 100 });
  }
  
  return markdown;
}

/**
 * Convert single content item to Markdown
 * @param {import('../types.js').ContentItem} item - Content item
 * @returns {string} Markdown text
 */
function contentItemToMarkdown(item) {
  if (!item || !item.type) return '';
  
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
    
    if (!hasLines) {
      // Fallback to simple formatting if no lines/items available
      logDebug(`[Markdown] formatTextWithFragments - FALLBACK to simple formatting (no lines)`);
      return formatText(item?.text || '', item?.isBold, item?.isItalic, item?.isUnderlined);
    }
    
    // Process each line separately, then join with spaces
    const formattedLines = [];
    
    for (let lineIdx = 0; lineIdx < item.lines.length; lineIdx++) {
      const line = item.lines[lineIdx];
      
      if (!line.items || !Array.isArray(line.items) || line.items.length === 0) {
        // Fallback to line text with simple formatting
        logDebug(`[Markdown] formatTextWithFragments - Line ${lineIdx} has no items, using simple formatting`);
        const fallbackText = formatText(line.text || '', line.isBold, line.isItalic, line.isUnderlined);
        formattedLines.push({
          text: fallbackText,
          lastItem: null,
          firstItem: null
        });
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
        const itemText = textItem.str || '';
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
      
      formattedLines.push({
        text: lineResult || line.text || '',
        lastItem: sortedItems.length > 0 ? sortedItems[sortedItems.length - 1] : null,
        firstItem: sortedItems.length > 0 ? sortedItems[0] : null
      });
    }
    
    // Join lines with smart merging: combine adjacent items with same formatting
    let result = '';
    for (let i = 0; i < formattedLines.length; i++) {
      const currentLine = formattedLines[i];
      const nextLine = i < formattedLines.length - 1 ? formattedLines[i + 1] : null;
      
      if (i > 0) {
        const prevLine = formattedLines[i - 1];
        // Check if we can merge with previous line (same formatting on adjacent items)
        const prevLastItem = prevLine && typeof prevLine === 'object' ? prevLine.lastItem : null;
        const currFirstItem = currentLine && typeof currentLine === 'object' ? currentLine.firstItem : null;
        
        if (prevLastItem && currFirstItem) {
          const prevBold = prevLastItem.isBold || false;
          const prevItalic = prevLastItem.isItalic || false;
          const prevUnderlined = prevLastItem.isUnderlined || false;
          const currBold = currFirstItem.isBold || false;
          const currItalic = currFirstItem.isItalic || false;
          const currUnderlined = currFirstItem.isUnderlined || false;
          
          // If formatting matches, merge without space (they're part of same phrase)
          if (prevBold === currBold && prevItalic === currItalic && prevUnderlined === currUnderlined && (prevBold || prevItalic || prevUnderlined)) {
            // Same formatting - merge by removing trailing formatting from prev and leading from current
            const prevText = prevLine && typeof prevLine === 'object' ? prevLine.text : prevLine;
            const currentText = currentLine && typeof currentLine === 'object' ? currentLine.text : currentLine;
            
            // Remove trailing formatting markers from prevText (keep the text content)
            let prevTextClean = prevText;
            // Remove in reverse order (outermost first)
            if (prevUnderlined) {
              prevTextClean = prevTextClean.replace(/__([^_]+)__$/, '$1');
            }
            if (prevBold && prevItalic) {
              prevTextClean = prevTextClean.replace(/\*\*\*([^*]+)\*\*\*$/, '$1');
            } else if (prevBold) {
              prevTextClean = prevTextClean.replace(/\*\*([^*]+)\*\*$/, '$1');
            } else if (prevItalic) {
              prevTextClean = prevTextClean.replace(/\*([^*]+)\*$/, '$1');
            }
            
            // Remove leading formatting markers from currentText (keep the text content)
            let currentTextClean = currentText;
            if (currBold && currItalic) {
              currentTextClean = currentTextClean.replace(/^\*\*\*([^*]+)\*\*\*/, '$1');
            } else if (currBold) {
              currentTextClean = currentTextClean.replace(/^\*\*([^*]+)\*\*/, '$1');
            } else if (currItalic) {
              currentTextClean = currentTextClean.replace(/^\*([^*]+)\*/, '$1');
            }
            if (currUnderlined) {
              currentTextClean = currentTextClean.replace(/^__([^_]+)__/, '$1');
            }
            
            // Combine clean text with space between words
            const combinedText = prevTextClean + ' ' + currentTextClean;
            
            // Apply formatting once to combined text
            let formattedCombined = combinedText;
            if (prevBold && prevItalic) {
              formattedCombined = `***${combinedText}***`;
            } else if (prevBold) {
              formattedCombined = `**${combinedText}**`;
            } else if (prevItalic) {
              formattedCombined = `*${combinedText}*`;
            }
            
            if (prevUnderlined) {
              formattedCombined = `__${formattedCombined}__`;
            }
            
            // Replace the last part of result with the combined formatted text
            const prevTextIndex = result.lastIndexOf(prevText);
            if (prevTextIndex !== -1) {
              result = result.substring(0, prevTextIndex) + formattedCombined;
              logDebug(`[Markdown] formatTextWithFragments - Merged lines ${i-1} and ${i}: "${prevTextClean}" + "${currentTextClean}" = "${formattedCombined}"`);
            } else {
              result += formattedCombined;
            }
            continue;
          }
        }
      }
      
      // Add space between lines (normal case)
      if (i > 0) {
        result += ' ';
      }
      const currentText = currentLine && typeof currentLine === 'object' ? currentLine.text : currentLine;
      result += currentText;
    }
    
    logDebug(`[Markdown] formatTextWithFragments - FINAL: lines=${formattedLines.length}, resultLength=${result.length}, hasFormatting=${result.includes('**') || result.includes('*') || result.includes('__')}`);
    
    return result || item.text || '';
  };
  
  switch (item.type) {
    case 'heading': {
      const level = Math.min(Math.max(item.level || 2, 1), 6);
      const prefix = '#'.repeat(level);
      // CRITICAL: Headings should never have bold/italic formatting
      // Extract plain text without formatting
      let text = '';
      if (item.lines && Array.isArray(item.lines) && item.lines.length > 0) {
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
        text = stripHtml(item.text || '');
      }
      if (!text.trim()) return '';
      // Headings: one newline before, one after (will be cleaned up if needed)
      return `\n${prefix} ${text}\n\n`;
    }
    
    case 'paragraph': {
      // Use fragment-based formatting if available, otherwise fallback to simple formatting
      const text = formatTextWithFragments(item);
      if (!text.trim()) return '';
      // Paragraphs: just text with one newline after (no leading newline)
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
      
      // FUNDAMENTAL: Handle nested lists with proper indentation
      // Items can have a 'level' property indicating nesting depth
      let currentNumber = 0; // For ordered lists, track numbering per level
      const levelNumbers = {}; // Track numbering for each nesting level
      
      items.forEach((listItem, index) => {
        // Extract text and level
        const itemText = typeof listItem === 'string' ? listItem : (listItem.html || listItem.text || String(listItem));
        const text = htmlToMarkdown(itemText);
        // CRITICAL: Support both 'level' and 'listLevel' properties for nesting
        // Type guard for list item object
        const listItemObj = (typeof listItem === 'object' && listItem !== null) ? /** @type {{html?: string, text?: string, id?: string, level?: number, listLevel?: number, isOrdered?: boolean, parentIsOrdered?: boolean}} */ (listItem) : null;
        const itemLevel = listItemObj 
          ? (listItemObj.level !== undefined ? listItemObj.level : (listItemObj.listLevel !== undefined ? listItemObj.listLevel : 0))
          : 0;
        const parentIsOrdered = listItemObj && listItemObj.parentIsOrdered !== undefined ? listItemObj.parentIsOrdered : false;
        
        // FUNDAMENTAL: Adaptive numbering for ordered lists
        // Reset numbering when level decreases (returning to parent level)
        // CRITICAL: Check if this specific item is ordered or unordered
        const itemIsOrdered = listItemObj && listItemObj.isOrdered !== undefined
          ? listItemObj.isOrdered 
          : isOrdered; // Fallback to parent list type
        
        let prefix;
        if (isOrdered && itemIsOrdered) {
          // Parent list is ordered AND this item is also ordered - use numbering
          // For ordered lists, track numbering per level
          // CRITICAL: Support both 'level' and 'listLevel' properties
          const prevListItem = index > 0 && typeof items[index - 1] === 'object' && items[index - 1] !== null
            ? /** @type {{html?: string, text?: string, id?: string, level?: number, listLevel?: number, isOrdered?: boolean, parentIsOrdered?: boolean}} */ (items[index - 1])
            : null;
          const prevItemLevel = prevListItem
            ? (prevListItem.level !== undefined ? prevListItem.level : 
               (prevListItem.listLevel !== undefined ? prevListItem.listLevel : 0))
            : 0;
          
          // CRITICAL: Only count ordered items for numbering
          // Skip unordered nested items when tracking numbering
          const prevItemIsOrdered = prevListItem && prevListItem.isOrdered !== undefined
            ? prevListItem.isOrdered
            : isOrdered;
          
          if (itemLevel === 0) {
            // Top level - increment counter
            // CRITICAL: Only increment if this is actually a top-level ordered item
            currentNumber++;
            levelNumbers[0] = currentNumber;
          } else if (itemLevel > prevItemLevel) {
            // Entering nested level - start numbering from 1
            levelNumbers[itemLevel] = 1;
            currentNumber = 1;
          } else if (itemLevel === prevItemLevel && prevItemIsOrdered) {
            // Same level and previous was ordered - increment
            if (!levelNumbers[itemLevel]) {
              levelNumbers[itemLevel] = 0;
            }
            levelNumbers[itemLevel]++;
            currentNumber = levelNumbers[itemLevel];
          } else if (itemLevel === prevItemLevel && !prevItemIsOrdered) {
            // Same level but previous was unordered - don't increment, use same number
            if (!levelNumbers[itemLevel]) {
              levelNumbers[itemLevel] = 1;
            }
            currentNumber = levelNumbers[itemLevel];
          } else {
            // Returning to parent level - continue parent numbering
            // Find the appropriate number for this level
            if (!levelNumbers[itemLevel]) {
              levelNumbers[itemLevel] = 0;
            }
            levelNumbers[itemLevel]++;
            currentNumber = levelNumbers[itemLevel];
          }
          prefix = `${currentNumber}.`;
        } else if (isOrdered && !itemIsOrdered) {
          // Parent list is ordered BUT this item is unordered (nested bullet list)
          // Use bullet marker instead of numbering
          if (itemLevel > 0 && parentIsOrdered) {
            prefix = '•'; // Nested in ordered list
          } else {
            prefix = '-'; // Fallback
          }
        } else {
          // For unordered lists, use different markers based on nesting level and parent type
          // CRITICAL: In expected output:
          // - Nested items in unordered lists use '-' (example: "  - Item text")
          // - Nested items in ordered lists use '•' (example: "  • Item text")
          // So the rule is:
          // - If nested (level > 0) AND parent is ordered list, use '•'
          // - Otherwise (top level or nested in unordered), use '-'
          if (itemLevel > 0 && parentIsOrdered) {
            prefix = '•'; // Nested in ordered list
          } else {
            prefix = '-'; // Top level or nested in unordered list
          }
        }
        
        // Add indentation for nested items (2 spaces per level)
        const indent = '  '.repeat(itemLevel);
        
        // Format item with proper indentation
        listMd += `${indent}${prefix} ${text}\n`;
      });
      
      // CRITICAL: Return list without trailing newline - spacing is handled by main loop
      // The main loop will add appropriate spacing based on next item type
      return listMd;
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
  if (!item.rows || !item.rows.length) return '';
  
  let md = '\n';
  const rows = item.rows;
  const hasHeaders = item.hasHeaders !== false; // Default to true if not specified
  
  // Handle header row if present
  if (hasHeaders && rows.length > 0) {
    const headerRow = rows[0];
    if (headerRow && headerRow.length > 0) {
      // CRITICAL: Use htmlToMarkdown to preserve links in table cells
      md += '| ' + headerRow.map(cell => htmlToMarkdown(String(cell || ''))).join(' | ') + ' |\n';
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
    if (row && row.length > 0) {
      // CRITICAL: Use htmlToMarkdown to preserve links in table cells
      md += '| ' + row.map(cell => htmlToMarkdown(String(cell || ''))).join(' | ') + ' |\n';
    }
  }
  
  return md + '\n';
}
