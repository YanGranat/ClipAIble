// @ts-check
// Text utility functions for extraction
// Text cleaning, normalization, and analysis helpers

/**
 * Clean heading text by removing OBJ markers and other artifacts
 * Removes U+FFFC (Object Replacement Character), OBJ tags, HTML, trailing #
 * @param {string} text - Heading text to clean
 * @returns {string} - Cleaned heading text
 */
export function cleanHeadingText(text) {
  if (!text) return '';
  return text
    // Remove U+FFFC (Object Replacement Character)
    .replace(/\uFFFC/g, '')
    // Remove OBJ markers in various formats
    .replace(/<OBJ>/gi, '')
    .replace(/<\/OBJ>/gi, '')
    .replace(/\[OBJ\]/gi, '')
    .replace(/OBJ/g, '')
    // Remove any remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove Wikipedia edit section patterns (all languages): [edit], [ред. | ред. код], etc.
    .replace(/\s*\[[^\]]{1,30}\s*\|\s*[^\]]{1,30}\]\s*$/g, '')
    .replace(/\s*\[(edit|ред\.?|редагувати|править|editar|modifier|bearbeiten|編集|编辑|편집)[^\]]*\]\s*$/gi, '')
    // Remove trailing # (often from anchor links)
    .replace(/\s*#\s*$/, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip OBJ markers from text
 * More aggressive version that handles edge cases
 * @param {string} text - Text with potential OBJ markers
 * @returns {string} - Text with OBJ markers removed
 */
export function stripObjMarkers(text) {
  if (!text) return '';
  return text
    // Remove U+FFFC (Object Replacement Character)
    .replace(/\uFFFC/g, '')
    // Remove OBJ in various formats
    .replace(/\s*OBJ\s*/gi, ' ')
    .replace(/\s*\[OBJ\]\s*/gi, ' ')
    .replace(/<\/?OBJ>/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean LaTeX formula from displaystyle wrapper
 * Converts {\\displaystyle X} to just X for cleaner markdown
 * @param {string} latex - Raw LaTeX string
 * @returns {string} - Cleaned LaTeX
 */
export function cleanLatexFormula(latex) {
  if (!latex) return '';
  return latex
    // Remove {\\displaystyle ...} wrapper
    .replace(/^\{\\displaystyle\s*(.+?)\}$/s, '$1')
    .replace(/\\displaystyle\s*/g, '')
    // Clean up extra braces
    .replace(/^\{(.+)\}$/, '$1')
    .trim();
}

/**
 * Check if heading marks end of main content (reference sections)
 * @param {string} headingText - Heading text to check
 * @returns {boolean} - True if this marks end of main content
 */
export function isEndOfContentSection(headingText) {
  const text = headingText.toLowerCase().trim();
  const endSections = [
    // Russian
    'см. также', 'примечания', 'литература', 'ссылки', 'источники',
    'комментарии', 'дополнительная литература', 'сноски',
    // English  
    'see also', 'references', 'notes', 'external links', 'further reading',
    'bibliography', 'sources', 'footnotes', 'citations',
    // German
    'siehe auch', 'einzelnachweise', 'literatur', 'weblinks', 'quellen',
    // French
    'voir aussi', 'références', 'notes et références', 'liens externes',
    // Spanish
    'véase también', 'referencias', 'enlaces externos', 'bibliografía'
  ];
  return endSections.includes(text);
}

/**
 * Normalize heading text for deduplication
 * Creates consistent lowercase version for comparison
 * @param {string} text - Heading text
 * @returns {string} - Normalized text for comparison
 */
export function normalizeHeadingForDedup(text) {
  return stripObjMarkers(text).toLowerCase().trim();
}

/**
 * Check if heading text is just a number (e.g., "1." or "23")
 * These are often section numbers, not meaningful headings
 * @param {string} text - Heading text
 * @returns {boolean} - True if heading is numeric
 */
export function isNumericHeading(text) {
  const cleaned = text.trim();
  // Match number optionally followed by period and whitespace
  return /^\d+\.?\s*$/.test(cleaned);
}

/**
 * Check if text looks like a typical article starter
 * Used to identify non-standfirst paragraphs
 * @param {string} text - Paragraph text
 * @returns {boolean} - True if text starts like a normal article
 */
export function looksLikeArticleStarter(text) {
  const lowerText = text.toLowerCase().trim();
  const commonStarters = [
    'the', 'a', 'an', 'in', 'on', 'when', 'where', 'why', 'how', 
    'what', 'this', 'that', 'these', 'those', 'it', 'there', 
    'he', 'she', 'they', 'we', 'i', 'you', 'if', 'as', 'for',
    'with', 'by', 'from', 'at', 'to', 'of', 'after', 'before',
    'during', 'since', 'until', 'while', 'although', 'though'
  ];
  
  const firstWord = lowerText.split(/\s+/)[0];
  return commonStarters.includes(firstWord);
}

/**
 * Check if text contains subscription/paywall related content
 * @param {string} text - Text to check
 * @param {string[]} paywallPatterns - Paywall patterns
 * @returns {boolean} - True if text appears to be paywall content
 */
export function containsPaywallContent(text, paywallPatterns) {
  const lowerText = text.toLowerCase();
  return paywallPatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
}

/**
 * Check if text contains related articles patterns
 * @param {string} text - Text to check
 * @param {string[]} relatedPatterns - Related articles patterns
 * @returns {boolean} - True if text appears to be related articles section
 */
export function containsRelatedContent(text, relatedPatterns) {
  const lowerText = text.toLowerCase();
  return relatedPatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
}

/**
 * Calculate reading time from word count
 * @param {string} text - Text content
 * @param {number} wordsPerMinute - Reading speed (default 200)
 * @returns {number} - Estimated reading time in minutes
 */
export function calculateReadingTime(text, wordsPerMinute = 200) {
  const wordCount = text.trim().split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Count sentences in text (rough estimate)
 * @param {string} text - Text to analyze
 * @returns {number} - Approximate sentence count
 */
export function countSentences(text) {
  // Simple sentence detection: ends with . ! ? followed by space or end
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches ? matches.length : 0;
}

/**
 * Check if text is likely metadata (author, date, etc.)
 * @param {string} text - Text to check
 * @param {number} maxLength - Maximum length threshold
 * @returns {boolean} - True if text looks like metadata
 */
export function looksLikeMetadata(text, maxLength = 100) {
  const trimmed = text.trim();
  if (trimmed.length > maxLength) return false;
  
  // Check for common metadata patterns
  const metadataPatterns = [
    /^by\s+/i,                    // "By Author Name"
    /^written\s+by/i,             // "Written by..."
    /^edited\s+by/i,              // "Edited by..."
    /^\d+\s+min(utes?)?\s+read/i, // "5 min read"
    /^\d+\s+words?$/i,            // "1234 words"
    /^updated?:?\s*/i,            // "Updated: ..."
    /^published:?\s*/i,           // "Published: ..."
    /^posted:?\s*/i               // "Posted: ..."
  ];
  
  return metadataPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Check if text is likely a date string
 * @param {string} text - Text to check
 * @returns {boolean} - True if text appears to be a date
 */
export function looksLikeDate(text) {
  const trimmed = text.trim();
  if (trimmed.length > 50) return false;
  
  const datePatterns = [
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/,           // 12/31/2024
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,             // 2024-12-31
    /^[a-z]+\s+\d{1,2},?\s+\d{4}$/i,                     // January 15, 2024
    /^\d{1,2}\s+[a-z]+\s+\d{4}$/i,                       // 15 January 2024
    /^[a-z]+\s+\d{4}$/i,                                 // January 2024
    /^\d{1,2}(st|nd|rd|th)\s+[a-z]+\s+\d{4}$/i          // 15th January 2024
  ];
  
  return datePatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Check if an element with heading tag is actually a real heading
 * vs styled text that happens to use heading tags
 * @param {Element} element - Element with h1-h6 tag
 * @param {Window} win - Window object for computed styles
 * @returns {boolean} - True if element is likely a real heading
 */
export function isRealHeading(element, win) {
  if (!element || !win) {
    // Log when we can't check (shouldn't happen in normal flow)
    return true; // Default to true if can't check
  }
  
  const text = (element.textContent || '').trim();
  const cleanedText = cleanHeadingText(text);
  const tagName = element.tagName?.toLowerCase() || 'unknown';
  
  // Check computed styles - this is the most reliable indicator
  let fontStyle = 'normal';
  let fontSize = '';
  let fontWeight = '';
  let isItalic = false;
  let result = true;
  let reason = '';
  
  try {
    const style = win.getComputedStyle(element);
    fontStyle = style.fontStyle || 'normal';
    fontSize = style.fontSize || '';
    fontWeight = style.fontWeight || '';
    isItalic = (fontStyle === 'italic' || fontStyle === 'oblique');
    
    // CRITICAL: If text is italic AND short, it's likely styled text, not a heading
    // Real headings are rarely italic (except in special cases)
    // Short italic text (like "Conclusion" or "Biomedicine" in italic) is likely styled text
    if (isItalic) {
      // If it's short text (less than 20 chars) and italic, it's likely styled text
      // Exception: very long italic text might be a heading in italic style
      if (cleanedText.length < 20) {
        result = false;
        reason = `short italic text (${cleanedText.length} chars, italic)`;
      }
    }
    
    // Additional check: if font-size is very small relative to body, might be styled text
    // But this is less reliable, so we don't use it as primary check
  } catch (e) {
    // If style check fails, continue with other checks
    reason = `style check failed: ${e.message}`;
  }
  
  // Log the check result for debugging
  // Note: This function runs in page context, so console.log will be visible in browser console
  // For service worker visibility, the caller should log via pushDebugLog
  if (typeof console !== 'undefined' && console.log) {
    console.log('[isRealHeading]', {
      tagName,
      text: cleanedText.substring(0, 50),
      textLength: cleanedText.length,
      fontStyle,
      fontSize,
      fontWeight,
      isItalic,
      result,
      reason: reason || 'passed all checks'
    });
  }
  
  // Default: assume it's a real heading if it passed style checks
  return result;
}