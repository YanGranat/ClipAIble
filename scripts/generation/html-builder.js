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
          
          // CRITICAL: Check if itemText already contains HTML (from extraction)
          // If it contains HTML tags, use it directly; otherwise convert markdown to HTML
          const headingHasHtmlTags = /<[a-z][\s\S]*>/i.test(itemText);
          
          let headingText = itemText.trim();
          
          // Remove any leading # characters and spaces (in case markdown syntax leaked in)
          headingText = headingText.replace(/^#+\s*/, '').trim();
          
          let headingHtml;
          if (headingHasHtmlTags) {
            // Already HTML - sanitizeHtml will remove SVG and decorative elements but preserve text content
            // It will also remove HTML comments like <!--[--> and <!--]--> that we added earlier
            headingHtml = headingText;
          } else {
            // Markdown - convert first, then sanitize
            headingHtml = markdownToHtml(headingText);
          }
          
          const sanitizedHeadingHtml = sanitizeHtml(headingHtml, sourceUrl, { allowFileProtocol: true });
          
          return `${anchorTag}<h${level}${idAttr}>${sanitizedHeadingHtml}</h${level}>`;
        
        case 'paragraph':
          // CRITICAL: Check if itemText already contains HTML (from extraction)
          // If it contains HTML tags, use it directly; otherwise convert markdown to HTML
          const hasHtmlTags = /<[a-z][\s\S]*>/i.test(itemText);
          const paragraphHtml = hasHtmlTags ? itemText : markdownToHtml(itemText);
          const sanitizedParagraphHtml = sanitizeHtml(paragraphHtml, sourceUrl, { allowFileProtocol: true });
          
          return `${anchorTag}<p${idAttr} translate="no" class="notranslate" data-translate="no">${sanitizedParagraphHtml}</p>`;
        
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
          // Supports all 11 languages: en, ru, ua, de, fr, es, it, pt, zh, ja, ko
          const isGenericAltText = (alt) => {
            if (!alt || !alt.trim()) return false;
            const lowerAlt = alt.trim().toLowerCase();
            
            // Comprehensive list of generic image alt texts in all supported languages
            // English (en)
            const english = ['image', 'photo', 'picture', 'img', 'image:', 'photo:', 'picture:', 'img:'];
            
            // Russian (ru)
            const russian = ['изображение', 'фото', 'картинка', 'изображение:', 'фото:', 'картинка:'];
            
            // Ukrainian (ua)
            const ukrainian = ['зображення', 'фотографія', 'картинка', 'зображення:', 'фотографія:', 'картинка:'];
            
            // German (de)
            const german = ['bild', 'foto', 'abbildung', 'bild:', 'foto:', 'abbildung:'];
            
            // French (fr)
            const french = ['image', 'photo', 'image:', 'photo:'];
            
            // Spanish (es)
            const spanish = ['imagen', 'foto', 'imagen:', 'foto:'];
            
            // Italian (it)
            const italian = ['immagine', 'foto', 'immagine:', 'foto:'];
            
            // Portuguese (pt)
            const portuguese = ['imagem', 'foto', 'imagem:', 'foto:'];
            
            // Chinese (zh)
            const chinese = ['图像', '图片', '照片', '图像:', '图片:', '照片:'];
            
            // Japanese (ja)
            const japanese = ['画像', '写真', '画像:', '写真:'];
            
            // Korean (ko)
            const korean = ['이미지', '사진', '그림', '이미지:', '사진:', '그림:'];
            
            const genericTexts = [
              ...english,
              ...russian,
              ...ukrainian,
              ...german,
              ...french,
              ...spanish,
              ...italian,
              ...portuguese,
              ...chinese,
              ...japanese,
              ...korean
            ];
            
            return genericTexts.includes(lowerAlt);
          };
          
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
            
            // Also check against the same generic texts list
            return isGenericAltText(caption);
          };
          
          const captionText = item.caption || (item.alt && !isGenericAltText(item.alt) ? item.alt : '');
          // CRITICAL: If caption already contains HTML (from getFormattedHtml), use sanitizeHtml directly
          // Otherwise, convert markdown to HTML first
          let caption = '';
          if (captionText && !isGenericCaption(captionText)) {
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
  }).filter(html => html.trim().length > 0).join('\n');
  
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
    
    // Build nested TOC structure based on heading hierarchy
    // Find minimum level to normalize (usually 2, but could be 1)
    const minLevel = Math.min(...headings.map(h => h.level));
    
    log('=== TOC GENERATION START ===', {
      headingsCount: headings.length,
      minLevel,
      headings: headings.map((h, idx) => ({
        index: idx,
        level: h.level,
        text: h.text?.substring(0, 50) || '',
        id: h.id || ''
      }))
    });
    
    // Build nested structure using proper HTML nesting
    // Track previous level and properly manage <ul> and <li> tags
    let tocListHtml = '<ul class="toc-list">';
    let prevLevel = null; // Track previous heading level (null for first item)
    let hasOpenLi = false; // Track if there's an open <li> tag
    const stepLogs = []; // Log each step for debugging
    
    headings.forEach((h, index) => {
      const level = h.level;
      const nextHeading = headings[index + 1];
      const nextLevel = nextHeading ? nextHeading.level : minLevel - 1;
      const stepLog = {
        index,
        heading: h.text?.substring(0, 50) || '',
        level,
        prevLevel,
        nextLevel,
        hasOpenLiBefore: hasOpenLi,
        htmlBefore: tocListHtml.substring(Math.max(0, tocListHtml.length - 200))
      };
      
      if (prevLevel !== null) {
        // Close previous <li> and nested lists if going up or staying at same level
        if (level <= prevLevel) {
          stepLog.action = 'going_up_or_same';
          // First close the <li> of previous heading (if it's still open)
          // NOTE: Previous <li> might already be closed if nextLevel <= prevLevel was true in previous iteration
          if (hasOpenLi) {
            tocListHtml += '</li>';
            hasOpenLi = false;
            stepLog.closedLi = true;
          }
          // Then close nested <ul> tags (one for each level we're going up)
          const levelsToClose = prevLevel - level;
          stepLog.levelsToClose = levelsToClose;
          if (levelsToClose > 0) {
            // Close nested lists and their parent <li> tags
            // Example: going from H2 to H1: close </ul></li> (close nested list and parent H1's <li>)
            // For each level we go up, we close: </ul></li>
            for (let i = 0; i < levelsToClose; i++) {
              tocListHtml += '</ul></li>';
              stepLog.closedUlCount = (stepLog.closedUlCount || 0) + 1;
              stepLog.closedLiCount = (stepLog.closedLiCount || 0) + 1;
            }
            // After closing nested lists, hasOpenLi should be false (all parent <li> are closed)
            hasOpenLi = false;
          }
          // NOTE: For same level (level === prevLevel), previous <li> is already closed above
          // (if hasOpenLi was true) or was closed in previous iteration (if nextLevel <= prevLevel)
          // So we don't need to close it again here
        }
        
        // Open nested lists if going down (must be inside previous open <li>)
        if (level > prevLevel) {
          stepLog.action = 'going_down';
          // Open nested lists for each level between previous and current
          // Number of lists to open = level - prevLevel
          // These must be opened inside the previous open <li>
          const listsToOpen = level - prevLevel;
          stepLog.listsToOpen = listsToOpen;
          for (let i = 0; i < listsToOpen; i++) {
            tocListHtml += '<ul class="toc-list">';
          }
        }
      } else {
        stepLog.action = 'first_item';
      }
      
      // Add list item
      tocListHtml += `<li><a href="#${escapeAttr(h.id)}">${escapeHtml(h.text)}</a>`;
      hasOpenLi = true;
      stepLog.addedLi = true;
      
      // Determine if we should close <li> now
      if (nextLevel <= level) {
        // Next heading is same or higher level - close <li>
        tocListHtml += '</li>';
        hasOpenLi = false;
        stepLog.closedLiAfter = true;
      } else {
        stepLog.keptLiOpen = true;
      }
      // If nextLevel > level, keep <li> open for nested list
      
      stepLog.htmlAfter = tocListHtml.substring(Math.max(0, tocListHtml.length - 200));
      stepLog.hasOpenLiAfter = hasOpenLi;
      stepLogs.push(stepLog);
      
      prevLevel = level;
    });
    
    // Close remaining open <li> and lists
    // CRITICAL: Close in reverse order - first close open <li>, then close nested lists with their parent <li> tags
    if (hasOpenLi) {
      tocListHtml += '</li>';
      hasOpenLi = false;
      log('TOC: Closing remaining open <li>');
    }
    // Close all open nested <ul> tags and their parent <li> tags
    // Example: if finalPrevLevel=3, minLevel=1, we need to close:
    // - </ul></li> for level 3 (nested list + parent H2's <li>)
    // - </ul></li> for level 2 (nested list + parent H1's <li>)
    const finalPrevLevel = prevLevel;
    if (finalPrevLevel !== null && finalPrevLevel > minLevel) {
      const remainingLevels = finalPrevLevel - minLevel;
      log('TOC: Closing remaining nested lists', { remainingLevels, prevLevel: finalPrevLevel, minLevel });
      for (let i = finalPrevLevel; i > minLevel; i--) {
        tocListHtml += '</ul></li>';
      }
    }
    tocListHtml += '</ul>'; // Close root list
    
    log('=== TOC GENERATION COMPLETE ===', {
      finalHtmlLength: tocListHtml.length,
      finalHtmlPreview: tocListHtml.substring(0, 500),
      finalHtmlEnd: tocListHtml.substring(Math.max(0, tocListHtml.length - 500)),
      stepLogs: stepLogs.slice(0, 10) // First 10 steps for brevity
    });
    
    // Log full HTML structure for debugging
    const ulOpenCount = (tocListHtml.match(/<ul[^>]*>/g) || []).length;
    const ulCloseCount = (tocListHtml.match(/<\/ul>/g) || []).length;
    const liOpenCount = (tocListHtml.match(/<li[^>]*>/g) || []).length;
    const liCloseCount = (tocListHtml.match(/<\/li>/g) || []).length;
    
    log('=== TOC FULL HTML STRUCTURE ===', {
      fullHtml: tocListHtml,
      htmlLength: tocListHtml.length,
      ulOpenCount,
      ulCloseCount,
      liOpenCount,
      liCloseCount,
      ulBalanced: ulOpenCount === ulCloseCount,
      liBalanced: liOpenCount === liCloseCount,
      structureCheck: {
        hasNestedLists: tocListHtml.includes('</ul><ul'),
        hasProperNesting: tocListHtml.match(/<ul[^>]*>.*<ul[^>]*>/g) !== null
      }
    });
    
    // Also log as debug for detailed inspection
    logDebug('=== TOC FULL HTML (DEBUG) ===', {
      fullHtml: tocListHtml
    });
    
    tocHtml = `
    <nav class="table-of-contents">
      <h2 class="toc-title">${tocTitle}</h2>
      ${tocListHtml}
    </nav>`;
  }

  const docLang = language || 'en';

  const finalHtml = `<!DOCTYPE html>
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
  
  // DETAILED LOGGING: Log final HTML before returning
  // Using logDebug for service worker context
  logDebug('=== FINAL HTML FOR PDF (buildHtmlForPdf) ===', {
    title: cleanedTitle,
    author: author,
    sourceUrl: sourceUrl,
    finalHtml: finalHtml, // FULL HTML - NO TRUNCATION
    finalHtmlLength: finalHtml.length,
    contentItemsCount: content.length,
    contentHtmlLength: contentHtml.length,
    timestamp: Date.now()
  });
  
  return finalHtml;
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


