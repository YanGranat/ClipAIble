// @ts-check
// HTML utility functions for ClipAIble extension

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, c => map[c]);
}

/**
 * Escape attribute value
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize HTML - allows only safe inline tags
 * @param {string} html - HTML to sanitize
 * @param {string} sourceUrl - Source URL for internal link detection
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html, sourceUrl = '') {
  if (!html) return '';
  
  // Only allow inline formatting tags (not block tags like p, div - they would create invalid nesting)
  const allowedTags = [
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'code', 'br', 'sub', 'sup', 
    'mark', 'small', 'span', 'abbr', 'cite', 'q', 'time', 'dfn', 'kbd', 'var', 'samp'
  ];
  const allowedAttrs = { 
    'a': ['href', 'title', 'target', 'id', 'name'],
    'span': ['class', 'id'], 
    'code': ['class'],
    'abbr': ['title'],
    'time': ['datetime'],
    'q': ['cite'],
    'sup': ['id'],
    'sub': ['id']
  };
  
  let result = String(html);
  
  // Remove dangerous content completely
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi, '');
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>/gi, '');
  
  // Process tags - keep allowed, remove others but keep their text content
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName) => {
    const tag = tagName.toLowerCase();
    
    if (allowedTags.includes(tag)) {
      if (match.startsWith('</')) return `</${tag}>`;
      
      const attrs = [];
      const allowed = allowedAttrs[tag] || [];
      
      let isInternalLink = false;
      
      for (const attr of allowed) {
        const m = match.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
        if (m) {
          if (attr === 'href') {
            let href = m[1];
            
            // Check if this is an internal anchor link
            if (isInternalAnchorLink(href, sourceUrl)) {
              const anchor = '#' + href.split('#')[1];
              href = anchor;
              isInternalLink = true;
            }
            
            // Allow valid URL schemes
            if (href.startsWith('http://') || href.startsWith('https://') || 
                href.startsWith('/') || href.startsWith('#') || 
                href.startsWith('mailto:') || href.startsWith('tel:')) {
              attrs.push(`${attr}="${escapeAttr(href)}"`);
            }
          } else {
            attrs.push(`${attr}="${escapeAttr(m[1])}"`);
          }
        }
      }
      
      // Only add target="_blank" for external links
      if (tag === 'a' && attrs.some(a => a.startsWith('href=')) && !isInternalLink) {
        attrs.push('target="_blank"', 'rel="noopener noreferrer"');
      }
      
      if (tag === 'br') return '<br>';
      
      return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    }
    
    // For non-allowed tags: 
    // Opening tags: remove completely
    // Closing block tags: replace with <br> to preserve line breaks
    if (match.startsWith('</')) {
      const blockTags = ['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      if (blockTags.includes(tag)) {
        return '<br>';
      }
    }
    return '';
  });
  
  // Clean up multiple <br> tags
  result = result.replace(/(<br>\s*)+/g, '<br>');
  result = result.replace(/^(\s*<br>\s*)+/, '');
  result = result.replace(/(\s*<br>\s*)+$/, '');
  result = result.trim();
  
  return result;
}

/**
 * Sanitize HTML from markdown - allows block tags (h1-h6, hr, pre, code) but protects against XSS
 * This is a specialized sanitizer for markdown-generated HTML that needs to preserve block structure
 * @param {string} html - HTML to sanitize (from markdown conversion)
 * @returns {string} Sanitized HTML safe for innerHTML
 */
export function sanitizeMarkdownHtml(html) {
  if (!html) return '';
  
  let result = String(html);
  
  // Remove dangerous content completely
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, ''); // Remove event handlers
  result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"'); // Remove javascript: links
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi, '');
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>/gi, '');
  
  // Allowed tags for markdown HTML (includes block tags)
  const allowedTags = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // Headers
    'p', 'br', 'hr', // Block elements
    'pre', 'code', // Code blocks
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', // Inline formatting
    'a', 'span', 'mark', 'small', 'sub', 'sup' // Other inline
  ];
  
  const allowedAttrs = {
    'a': ['href', 'title', 'target'],
    'code': ['class'],
    'span': ['class']
  };
  
  // Process tags - keep allowed, escape content of others
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName) => {
    const tag = tagName.toLowerCase();
    
    if (allowedTags.includes(tag)) {
      if (match.startsWith('</')) {
        return `</${tag}>`;
      }
      
      // Extract and sanitize attributes
      const attrs = [];
      const allowed = allowedAttrs[tag] || [];
      
      for (const attr of allowed) {
        const m = match.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
        if (m) {
          if (attr === 'href') {
            let href = m[1];
            // Allow valid URL schemes only
            if (href.startsWith('http://') || href.startsWith('https://') || 
                href.startsWith('/') || href.startsWith('#') || 
                href.startsWith('mailto:') || href.startsWith('tel:')) {
              attrs.push(`${attr}="${escapeAttr(href)}"`);
            }
          } else {
            attrs.push(`${attr}="${escapeAttr(m[1])}"`);
          }
        }
      }
      
      // Add target="_blank" for external links
      if (tag === 'a' && attrs.some(a => a.startsWith('href='))) {
        const hrefMatch = match.match(/href\s*=\s*["']([^"']*)["']/i);
        if (hrefMatch && (hrefMatch[1].startsWith('http://') || hrefMatch[1].startsWith('https://'))) {
          attrs.push('target="_blank"', 'rel="noopener noreferrer"');
        }
      }
      
      return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
    }
    
    // For non-allowed tags: escape the tag itself
    return escapeHtml(match);
  });
  
  return result;
}

/**
 * Check if a URL points to the same page (internal anchor link)
 * @param {string} href - Link href
 * @param {string} sourceUrl - Source page URL
 * @returns {boolean}
 */
function isInternalAnchorLink(href, sourceUrl) {
  if (!href || !href.includes('#')) return false;
  
  // Case 1: Pure anchor links
  if (href.startsWith('#')) return true;
  
  if (!sourceUrl) return false;
  
  try {
    let sourceUrlObj;
    try {
      sourceUrlObj = new URL(sourceUrl);
    } catch {
      return false;
    }
    
    const hrefBeforeHash = href.split('#')[0];
    
    // Case 2: Empty path before hash
    if (hrefBeforeHash === '') return true;
    
    // Case 3: Relative URL pointing to same page
    if (!hrefBeforeHash.startsWith('http://') && !hrefBeforeHash.startsWith('https://')) {
      try {
        const resolvedUrl = new URL(hrefBeforeHash, sourceUrl);
        // Decode paths for comparison (handles URL-encoded Cyrillic)
        const resolvedPath = decodeURIComponent(resolvedUrl.pathname).replace(/\/$/, '');
        const srcPath = decodeURIComponent(sourceUrlObj.pathname).replace(/\/$/, '');
        if (resolvedUrl.origin === sourceUrlObj.origin && resolvedPath === srcPath) {
          return true;
        }
      } catch {
        const sourceFilename = decodeURIComponent(sourceUrlObj.pathname).split('/').pop()?.split('?')[0] || '';
        const hrefFilename = decodeURIComponent(hrefBeforeHash).split('/').pop()?.split('?')[0] || '';
        if (sourceFilename && hrefFilename && sourceFilename === hrefFilename) {
          return true;
        }
      }
      return false;
    }
    
    // Case 4: Absolute URL - compare normalized versions
    try {
      const hrefUrlObj = new URL(hrefBeforeHash);
      if (hrefUrlObj.origin !== sourceUrlObj.origin) return false;
      
      // Decode paths for comparison (handles URL-encoded Cyrillic)
      const sourcePath = decodeURIComponent(sourceUrlObj.pathname).replace(/\/$/, '');
      const hrefPath = decodeURIComponent(hrefUrlObj.pathname).replace(/\/$/, '');
      
      return sourcePath === hrefPath;
    } catch {
      return false;
    }
  } catch (e) {
    return false;
  }
}

/**
 * Strip all HTML tags from text
 * @param {string} html - HTML to strip
 * @returns {string} Plain text
 */
export function stripHtml(html) {
  if (!html) return '';
  let text = typeof html === 'string' ? html : String(html);
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  return text.trim();
}

/**
 * Decode common HTML entities
 * @param {string} text - Text with entities
 * @returns {string} Decoded text
 */
export function decodeHtmlEntities(text) {
  if (!text) return '';
  text = typeof text === 'string' ? text : String(text);
  
  // First pass: decode &amp; to handle double-encoded entities like &amp;nbsp;
  text = text.replace(/&amp;/g, '&');
  
  // Second pass: decode all other named entities
  const entities = {
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&laquo;': '«',
    '&raquo;': '»',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char);
  }
  
  // Handle numeric entities
  text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  text = text.replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return text;
}

/**
 * Convert HTML formatting to Markdown
 * @param {string} html - HTML to convert
 * @returns {string} Markdown text
 */
export function htmlToMarkdown(html) {
  if (!html) return '';
  
  let text = typeof html === 'string' ? html : String(html);
  
  // Convert links
  text = text.replace(/<a\s+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<a\s+href='([^']*)'[^>]*>([^<]*)<\/a>/gi, '[$2]($1)');
  
  // Convert bold
  text = text.replace(/<(strong|b)>([^<]*)<\/\1>/gi, '**$2**');
  
  // Convert italic
  text = text.replace(/<(em|i)>([^<]*)<\/\1>/gi, '*$2*');
  
  // Convert inline code
  text = text.replace(/<code>([^<]*)<\/code>/gi, '`$1`');
  
  // Convert strikethrough
  text = text.replace(/<(s|del|strike)>([^<]*)<\/\1>/gi, '~~$2~~');
  
  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ').trim();
  
  return text;
}

/**
 * Adjust hex color brightness by percent (-100 to +100)
 * @param {string} hex - Hex color
 * @param {number} percent - Brightness adjustment
 * @returns {string} Adjusted hex color
 */
export function adjustColorBrightness(hex, percent) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  
  r = Math.min(255, Math.max(0, r + Math.round(r * percent / 100)));
  g = Math.min(255, Math.max(0, g + Math.round(g * percent / 100)));
  b = Math.min(255, Math.max(0, b + Math.round(b * percent / 100)));
  
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Clean title - basic cleaning (invisible characters, whitespace normalization)
 * Used for PDF, EPUB, FB2, HTML generation where title comes from page extraction
 * @param {string} title - Title to clean
 * @returns {string} Cleaned title
 */
export function cleanTitle(title) {
  if (!title || typeof title !== 'string') return '';
  
  return title
    .replace(/\u00AD/g, '')      // Soft hyphen
    .replace(/\u200B/g, '')       // Zero-width space
    .replace(/\u200C/g, '')       // Zero-width non-joiner
    .replace(/\u200D/g, '')       // Zero-width joiner
    .replace(/\uFEFF/g, '')       // Zero-width no-break space
    .replace(/[\u2010-\u2015]/g, '-') // Various dashes to standard hyphen
    .replace(/\s+/g, ' ')         // Collapse multiple spaces
    .trim();
}

/**
 * Clean title from service tokens - full cleaning with AI service token removal
 * Used when title comes from AI responses (extraction, chunk processing)
 * Removes budget tokens, service markers, and other AI artifacts
 * @param {string} title - Title to clean
 * @param {string} fallback - Fallback value if cleaned title is empty (default: original title)
 * @returns {string} Cleaned title
 */
export function cleanTitleFromServiceTokens(title, fallback = null) {
  if (!title || typeof title !== 'string') {
    return fallback || '';
  }
  
  let cleaned = title;
  
  // Remove budget token patterns (budgettoken_budget, budget199985, etc.)
  cleaned = cleaned.replace(/budgettoken[_\s]*budget\d*/gi, '');
  cleaned = cleaned.replace(/budget\d+/gi, '');
  cleaned = cleaned.replace(/token/gi, '');
  cleaned = cleaned.replace(/budget\w+/gi, '');
  
  // Remove common service markers
  cleaned = cleaned.replace(/#+/g, ''); // Remove # symbols
  
  // Clean up underscores and whitespace
  cleaned = cleaned.replace(/_+/g, ' '); // Replace underscores with spaces
  cleaned = cleaned.replace(/\s+/g, ' '); // Collapse multiple spaces
  cleaned = cleaned.trim();
  
  // Remove leading/trailing separators
  cleaned = cleaned.replace(/^[_\s-]+|[_\s-]+$/g, '');
  
  // Also apply basic cleaning (invisible characters)
  cleaned = cleanTitle(cleaned);
  
  // Return cleaned title or fallback
  return cleaned || fallback || title;
}

/**
 * Clean title for filename - removes invalid filename characters
 * Used when creating file names from titles
 * @param {string} title - Title to clean
 * @param {string} defaultTitle - Default title if cleaned is empty (default: 'article')
 * @returns {string} Cleaned title safe for filename
 */
export function cleanTitleForFilename(title, defaultTitle = 'article') {
  if (!title || typeof title !== 'string') {
    return defaultTitle;
  }
  
  // First apply service token cleaning
  let cleaned = cleanTitleFromServiceTokens(title, '');
  
  // If empty after service token cleaning, use original
  if (!cleaned) {
    cleaned = title;
  }
  
  // Remove invalid filename characters (Windows/Linux)
  cleaned = cleaned
    .replace(/[<>:"/\\|?*]/g, '-')  // Invalid filename chars
    .replace(/\s+/g, ' ')            // Collapse spaces
    .trim();
  
  // Return cleaned or default
  return cleaned || defaultTitle;
}

