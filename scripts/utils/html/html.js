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
 * @param {object} [options={}] - Options object
 * @param {boolean} [options.allowFileProtocol=false] - Allow file:// protocol links (for PDF generation)
 * @returns {string} Sanitized HTML
 */
import { log, logDebug } from '../logging.js';

export function sanitizeHtml(html, sourceUrl = '', options = {}) {
  if (!html) return '';
  
  const { allowFileProtocol = false } = options;
  
  // Only allow inline formatting tags (not block tags like p, div - they would create invalid nesting)
  const allowedTags = [
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'code', 'br', 'sub', 'sup', 
    'mark', 'small', 'span', 'abbr', 'cite', 'q', 'time', 'dfn', 'kbd', 'var', 'samp'
  ];
  const allowedAttrs = { 
    'a': ['href', 'title', 'target', 'id', 'name'],
    'span': ['class', 'id', 'style'], // style needed for color attribute (footnotes)
    'code': ['class'],
    'abbr': ['title'],
    'time': ['datetime'],
    'q': ['cite'],
    'sup': ['id'],
    'sub': ['id']
  };
  
  let result = typeof html === 'string' ? html : String(html);
  
  // CRITICAL: Log ORIGINAL INPUT - FULL TEXT (NO TRUNCATION)
  logDebug('=== SANITIZE HTML: ORIGINAL INPUT (FULL) ===', {
    originalInput: result, // FULL TEXT - NO TRUNCATION
    originalInputLength: result.length,
    sourceUrl: sourceUrl,
    options: options
  });
  
  // Remove dangerous content completely
  result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  // SECURITY: Block dangerous protocols in href attributes
  result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  result = result.replace(/href\s*=\s*["']data:[^"']*["']/gi, 'href="#"');
  result = result.replace(/href\s*=\s*["']vbscript:[^"']*["']/gi, 'href="#"');
  // Only block file:// protocol if not explicitly allowed (for PDF generation)
  if (!allowFileProtocol) {
    result = result.replace(/href\s*=\s*["']file:[^"']*["']/gi, 'href="#"');
  }
  result = result.replace(/href\s*=\s*["']about:[^"']*["']/gi, 'href="#"');
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi, '');
  result = result.replace(/<(iframe|object|embed|form|input|button)[^>]*>/gi, '');
  // Remove HTML comments (including Vue.js/Nuxt.js comments like <!--[--> and <!--]-->)
  // First remove Vue.js/Nuxt.js specific comments
  result = result.replace(/<!--\[-->/g, '');
  result = result.replace(/<!--\]-->/g, '');
  // Then remove all other HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');
  
  // Process tags - keep allowed, remove others but keep their text content
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName) => {
    const tag = tagName.toLowerCase();
    
    if (allowedTags.includes(tag)) {
      if (match.startsWith('</')) return `</${tag}>`;
      
      const attrs = [];
      const allowed = allowedAttrs[tag] || [];
      
      let isInternalLink = false;
      
      // CRITICAL: For <span> tags, preserve color attribute (used for footnotes and Notes section on old sites)
      // Example: <span color="#999999">[1]</span> should preserve color
      // Example: <a name="f1n"><span color="#000000">1</span></a> in Notes section
      // Handle both quoted and unquoted color attributes
      if (tag === 'span') {
        // Try with double quotes first
        let colorMatch = match.match(/\bcolor\s*=\s*"([^"]+)"\s*/i);
        // Then try with single quotes
        if (!colorMatch) {
          colorMatch = match.match(/\bcolor\s*=\s*'([^']+)'\s*/i);
        }
        // Then try without quotes
        if (!colorMatch) {
          colorMatch = match.match(/\bcolor\s*=\s*([^\s>]+)\s*/i);
        }
        if (colorMatch) {
          const colorValue = colorMatch[1].trim();
          // CRITICAL: For Notes section, #000000 (black) on black background is invisible
          // Replace it with text color to make it visible
          const finalColor = (colorValue === '#000000' || colorValue === '000000' || colorValue === 'black') 
            ? 'inherit' 
            : colorValue;
          
          // Convert color attribute to style attribute for better compatibility
          // Check if style attribute already exists - if so, merge with it
          const existingStyleMatch = match.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
          if (existingStyleMatch) {
            const existingStyle = existingStyleMatch[1];
            // Remove existing color from style if present, then add new one
            const cleanedStyle = existingStyle.replace(/color\s*:\s*[^;]+;?/gi, '').trim();
            const newStyle = cleanedStyle ? `${cleanedStyle}; color: ${escapeAttr(finalColor)}` : `color: ${escapeAttr(finalColor)}`;
            // Remove old style from attrs if it was already added
            const styleIndex = attrs.findIndex(a => a.startsWith('style='));
            if (styleIndex >= 0) {
              attrs.splice(styleIndex, 1);
            }
            attrs.push(`style="${escapeAttr(newStyle)}"`);
          } else {
            attrs.push(`style="color: ${escapeAttr(finalColor)}"`);
          }
        }
      }
      
      for (const attr of allowed) {
        // SECURITY: Handle attributes with quotes (preferred) and without quotes (fallback)
        // First try with quotes, then without quotes if not found
        let m = match.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
        if (!m) {
          // CRITICAL: For href, handle very long URLs that might not have quotes
          // Match until space, >, or another attribute (word followed by =)
          // This prevents href from being cut off mid-URL but also prevents capturing other attributes
          if (attr === 'href') {
            // Try to match until > or space followed by word= (another attribute)
            // This handles: href=https://example.com?param=value target="_blank"
            m = match.match(new RegExp(`${attr}\\s*=\\s*([^>\\s]+(?:\\s+[a-zA-Z-]+\\s*=)?)`, 'i'));
            // Check if we captured another attribute (space followed by word=)
            // This is different from = in URL query params
            if (m && m[1] && /\s+[a-zA-Z-]+\s*=/.test(m[1])) {
              // Trim any trailing attributes (word=value pattern)
              m[1] = m[1].replace(/\s+[a-zA-Z-]+\s*=\s*[^\s>]+.*$/, '').trim();
              if (!m[1]) m = null; // If nothing left, try fallback
            }
            // Fallback: match until > (for very long URLs without other attributes)
            if (!m || !m[1]) {
              m = match.match(new RegExp(`${attr}\\s*=\\s*([^>]+)`, 'i'));
              // Trim any trailing attributes if present (space followed by word=)
              if (m && m[1] && /\s+[a-zA-Z-]+\s*=/.test(m[1])) {
                const trimmed = m[1].replace(/\s+[a-zA-Z-]+\s*=\s*[^\s>]+.*$/, '').trim();
                if (trimmed) m[1] = trimmed;
              }
            }
          } else {
            // Try without quotes - match until space, >, or end of tag
            m = match.match(new RegExp(`${attr}\\s*=\\s*([^\\s>]+)`, 'i'));
          }
        }
        if (m) {
          if (attr === 'href') {
            // Trim whitespace that might be in unquoted href (handles line breaks in long URLs)
            let href = m[1].trim();
            
            // CRITICAL: Log href extraction for debugging
            if (tag === 'a' && (href === '#' || href.startsWith('#'))) {
              logDebug('=== SANITIZE HTML: EXTRACTED HREF (anchor link) ===', {
                tag: 'a',
                href: href,
                originalMatch: match.substring(0, 200),
                sourceUrl: sourceUrl
              });
            }
            
            // SECURITY: Decode HTML entities BEFORE protocol check to prevent bypass
            // Example: javascript&#58;alert(1) should be decoded to javascript:alert(1) before check
            if (typeof document !== 'undefined' && document.createElement) {
              // Browser context: use DOM to decode entities by creating element with href attribute
              const tempA = document.createElement('a');
              tempA.setAttribute('href', href); // Browser will decode entities automatically
              href = tempA.getAttribute('href') || href;
            } else {
              // Service worker context: decode manually - decode common entity patterns for dangerous protocols
              // Decode numeric and hex entities for colon (most common bypass vector)
              href = href
                .replace(/&#58;/g, ':')      // &#58; -> :
                .replace(/&#x3a;/gi, ':')    // &#x3a; -> :
                .replace(/&#x3A;/g, ':')    // &#x3A; -> :
                .replace(/&colon;/gi, ':')   // &colon; -> :
                .replace(/&#59;/g, ';')     // &#59; -> ;
                .replace(/&#x3b;/gi, ';')   // &#x3b; -> ;
                .replace(/&#x3B;/g, ';')    // &#x3B; -> ;
                .replace(/&semi;/gi, ';');  // &semi; -> ;
            }
            
            // SECURITY: Block dangerous protocols AFTER decoding entities
            const hrefLower = href.toLowerCase().trim();
            // Build dangerous protocols list - exclude file: if allowed
            const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'about:'];
            if (!allowFileProtocol) {
              dangerousProtocols.push('file:');
            }
            if (dangerousProtocols.some(proto => hrefLower.startsWith(proto))) {
              // Block dangerous protocol - don't add href attribute
              continue;
            }
            
            // Check if this is an internal anchor link
            if (isInternalAnchorLink(href, sourceUrl)) {
              // CRITICAL: Handle href="#" (pure anchor without target)
              if (href === '#' || href === '#') {
                href = '#';
              } else {
                // Extract hash part (everything after the last #)
                const lastHashIndex = href.lastIndexOf('#');
                if (lastHashIndex >= 0) {
                  const hashPart = href.substring(lastHashIndex + 1);
                  const beforeHash = href.substring(0, lastHashIndex);
                  
                  // CRITICAL: If beforeHash is a full URL (starts with http), check if it's the same page
                  // If it's the same page, use hash part; otherwise keep original href (don't add #)
                  if (beforeHash.startsWith('http://') || beforeHash.startsWith('https://')) {
                    // Full URL with hash - check if it's the same page
                    try {
                      const beforeHashUrl = new URL(beforeHash);
                      const sourceUrlObj = new URL(sourceUrl);
                      if (beforeHashUrl.origin === sourceUrlObj.origin && 
                          decodeURIComponent(beforeHashUrl.pathname).replace(/\/$/, '') === decodeURIComponent(sourceUrlObj.pathname).replace(/\/$/, '')) {
                        // Same page - use hash part (or just # if hashPart is empty)
                        href = hashPart ? '#' + hashPart : '#';
                      } else {
                        // Different page - keep original href (don't add #)
                        href = href;
                        isInternalLink = false;
                      }
                    } catch {
                      // URL parsing failed - keep original href (don't add #)
                      href = href;
                      isInternalLink = false;
                    }
                  } else {
                    // Relative URL or empty beforeHash - assume same page, use hash part
                    // Only use hash part if it's not a full URL (doesn't start with http)
                    if (hashPart && !hashPart.startsWith('http://') && !hashPart.startsWith('https://')) {
                      href = '#' + hashPart;
                    } else if (!hashPart) {
                      // Empty hash part - use just #
                      href = '#';
                    } else {
                      // Hash part is a URL - this shouldn't happen, but keep original href
                      href = href;
                      isInternalLink = false;
                    }
                  }
                } else {
                  // No hash found, but isInternalAnchorLink returned true - this shouldn't happen
                  href = '#';
                }
              }
              isInternalLink = true;
            }
            
            // Allow valid URL schemes (including file: if allowed)
            // CRITICAL: href="#" should always pass this check
            if (href.startsWith('http://') || href.startsWith('https://') || 
                href.startsWith('/') || href.startsWith('#') || 
                href.startsWith('mailto:') || href.startsWith('tel:') ||
                (allowFileProtocol && href.startsWith('file://'))) {
              attrs.push(`${attr}="${escapeAttr(href)}"`);
            } else {
              // CRITICAL: If href doesn't match valid schemes, log it for debugging
              // This can happen with malformed URLs or unexpected formats
              if (tag === 'a' && attr === 'href') {
                logDebug('=== SANITIZE HTML: INVALID HREF REJECTED ===', {
                  tag: 'a',
                  href: href,
                  hrefLength: href.length,
                  sourceUrl: sourceUrl,
                  isInternalAnchorLink: isInternalAnchorLink(href, sourceUrl)
                });
              }
            }
          } else {
            attrs.push(`${attr}="${escapeAttr(m[1])}"`);
          }
        }
      }
      
      // CRITICAL: For <a> tags, if href was not added, we should either:
      // 1. Remove the tag completely (safer)
      // 2. Or add href="#" as fallback (but this might create unwanted links)
      // For now, we'll keep the tag but log it for debugging
      if (tag === 'a') {
        const hasHref = attrs.some(a => a.startsWith('href='));
        if (!hasHref) {
          // CRITICAL: Anchor tag without href - this can cause issues
          // Add href="#" as fallback to prevent unclosed tags
          attrs.push('href="#"');
          logDebug('=== SANITIZE HTML: ANCHOR TAG WITHOUT HREF, ADDED href="#" ===', {
            originalMatch: match,
            attrsBefore: [...attrs],
            attrsAfter: [...attrs]
          });
          isInternalLink = true; // Mark as internal to avoid target="_blank"
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
  
  
  // CRITICAL: PROTECT VALID <a> TAGS BEFORE REMOVING ATTRIBUTE FRAGMENTS
  // After tag processing (line 94-311), all valid <a> tags have format <a href="...">
  // We MUST protect them BEFORE regex that remove attributes, otherwise href will be lost
  // Strategy: Temporarily replace valid <a> tags with placeholders, remove fragments, then restore
  
  // Step 1: Protect valid <a> tags by replacing them with placeholders
  // CRITICAL: Improved regex to find <a> tags with href in ANY position within the tag
  // Handles: <a href="...">, <a href='...'>, <a href=...>, <a target="..." href="...">, etc.
  const anchorPlaceholders = new Map();
  let anchorPlaceholderIndex = 0;
  
  // Count anchors before protection
  const anchorsBeforeProtection = (result.match(/<a\s+[^>]*>/gi) || []).length;
  
  // Improved regex: finds <a> tags that contain href attribute anywhere in the tag
  // Uses positive lookahead to ensure href exists somewhere in the tag
  result = result.replace(/<a\s+(?=[^>]*href\s*=\s*["'][^"']*["'])[^>]*>/gi, (match) => {
    const placeholder = `__ANCHOR_PLACEHOLDER_${anchorPlaceholderIndex}__`;
    anchorPlaceholders.set(placeholder, match);
    anchorPlaceholderIndex++;
    return placeholder;
  });
  
  // Also handle <a> tags with unquoted href (href=url)
  result = result.replace(/<a\s+(?=[^>]*href\s*=\s*[^\s>]+)[^>]*>/gi, (match) => {
    // Check if this tag was already protected
    if (!match.includes('__ANCHOR_PLACEHOLDER_')) {
      const placeholder = `__ANCHOR_PLACEHOLDER_${anchorPlaceholderIndex}__`;
      anchorPlaceholders.set(placeholder, match);
      anchorPlaceholderIndex++;
      return placeholder;
    }
    return match;
  });
  
  const protectedAnchorsCount = anchorPlaceholders.size;
  
  // Clean up multiple <br> tags (but preserve double <br> for paragraph breaks)
  // First, normalize multiple <br> to single <br>, but keep double <br><br> as paragraph breaks
  result = result.replace(/(<br>\s*){3,}/g, '<br><br>'); // 3+ <br> become <br><br>
  result = result.replace(/^(\s*<br>\s*)+/, '');
  result = result.replace(/(\s*<br>\s*)+$/, '');
  
  // CRITICAL: Remove <br> tags that appear before inline elements
  // BUT: DO NOT remove <br> before <b> and <strong> tags - they need line breaks for bold headings
  // (e.g., <br><br><b>Recruit</b> should become <br><b>Recruit</b> to preserve new line)
  // This prevents unwanted line breaks when block tags (div, p) are replaced with <br>
  // but the next element is inline (e.g., <a>CLAUDE.md</a><br><span> should become <a>CLAUDE.md</a><span>)
  // Inline tags that should not have <br> before them (EXCEPT <b> and <strong> which need it)
  // CRITICAL: Order matters - longer tags first to avoid partial matches (e.g., 'strong' before 's')
  const inlineTagPattern = '(a|span|code|mark|small|abbr|cite|time|dfn|kbd|samp|del|ins|sub|sup|em|var|i|u|s|q)';
  // Remove <br> before opening inline tag (most common case: </div><br><span> or </a><br><span>)
  // BUT: Keep <br> before <b> and <strong> to preserve line breaks for bold headings
  result = result.replace(new RegExp(`<br>\\s*<(${inlineTagPattern})([^>]*)>`, 'gi'), '<$1$2>');
  
  // CRITICAL: For <b> and <strong> tags, preserve double <br> before them to create empty line
  // This ensures bold headings like <br><br><b>Recruit</b> stay as <br><br><b>Recruit</b> (empty line preserved)
  // Only normalize 3+ <br> to double <br>
  result = result.replace(/(<br>\s*){3,}<(b|strong)([^>]*)>/gi, '<br><br><$2$3>');
  
  // CRITICAL: Remove any remaining HTML attribute fragments that leaked into text
  // This handles cases where broken/malformed tags cause attributes to appear as text
  // Examples: "litl?ie=UTF8&camp=1789", "target="_blank"", "rel="noopener""
  // Only remove if they're clearly attribute fragments (followed by > or at end)
  // NOTE: Valid <a> tags are already protected as placeholders, so href won't be removed from them
  
  // Remove attribute patterns followed by > (definitely a broken tag fragment)
  // Pattern: attribute="value"> or attribute='value'>
  // BUT: Skip if it's part of a placeholder
  result = result.replace(/([a-zA-Z-]+\s*=\s*["'][^"']*["'])\s*>/gi, (match, p1, offset, fullString) => {
    // Check if this is inside a placeholder (shouldn't happen, but be safe)
    if (fullString.substring(Math.max(0, offset - 50), offset + match.length + 50).includes('__ANCHOR_PLACEHOLDER_')) {
      return match; // Don't remove if near placeholder
    }
    return '>';
  });
  
  // CRITICAL: Remove all HTML attribute fragments that leaked into text
  // This handles cases where broken/malformed tags cause attributes to appear as text
  // Examples: "litl?ie=UTF8&camp=1789", "target="_blank"", "rel="noopener"", "data-footnote-backlink-ref="""
  // NOTE: Valid <a> tags are already protected as placeholders, so href won't be removed from them
  
  // Remove attribute patterns (target="_blank", rel="noopener", data-*="", etc.)
  // Pattern: attribute="value" or attribute='value' or attribute=value (unquoted)
  // Match standalone attributes (not inside valid tags) - look for word boundary before and space/> after
  result = result.replace(/\b([a-zA-Z-]+)\s*=\s*["'][^"']*["']/gi, (match, attrName, offset, fullString) => {
    // Check if this is inside a placeholder (shouldn't happen, but be safe)
    if (fullString.substring(Math.max(0, offset - 50), offset + match.length + 50).includes('__ANCHOR_PLACEHOLDER_')) {
      return match; // Don't remove if near placeholder
    }
    // Only remove common HTML attributes that leaked (not valid words)
    const commonAttrs = ['target', 'rel', 'href', 'class', 'id', 'data-', 'alt', 'title', 'style'];
    if (commonAttrs.some(attr => attrName.toLowerCase().startsWith(attr.toLowerCase()))) {
      return '';
    }
    return match; // Keep if it's not a known attribute
  });
  
  // Remove unquoted attribute patterns (attr=value)
  result = result.replace(/\b([a-zA-Z-]+)\s*=\s*([^\s>]+)/gi, (match, attrName, value, offset, fullString) => {
    // Check if this is inside a placeholder (shouldn't happen, but be safe)
    if (fullString.substring(Math.max(0, offset - 50), offset + match.length + 50).includes('__ANCHOR_PLACEHOLDER_')) {
      return match; // Don't remove if near placeholder
    }
    const commonAttrs = ['target', 'rel', 'href', 'class', 'id', 'data-', 'alt', 'title'];
    if (commonAttrs.some(attr => attrName.toLowerCase().startsWith(attr.toLowerCase()))) {
      // Check if value looks like an attribute value (not a URL without protocol)
      if (!value.match(/^https?:\/\//) && !value.match(/^[a-zA-Z0-9_-]+$/)) {
        return '';
      }
    }
    return match;
  });
  
  // CRITICAL: Remove all HTML attribute fragments that leaked into text
  // This handles cases where broken/malformed tags cause attributes to appear as text
  // Examples: "li;camp=1789" (part of "href=" that was cut), "litl?ie=UTF8&camp=1789", "target="_blank""
  
  // Remove fragments that look like part of href attribute (e.g., "li;camp=1789" from "href=")
  // Pattern: word;param=value&param2=value2 (starts with word followed by ; and has & or multiple =)
  result = result.replace(/\b([a-zA-Z0-9_-]+);([a-zA-Z0-9_=&-]+)/gi, (match, prefix, params) => {
    // Check if params looks like URL query parameters (has & or multiple =)
    if (params.includes('&') || (params.match(/=/g) || []).length > 1) {
      // This is likely a fragment of href attribute (e.g., "li;camp=1789" from "href=")
      return '';
    }
    return match; // Keep if it's not a URL fragment
  });
  
  // Remove URL query parameter fragments that leaked (e.g., "litl?ie=UTF8&camp=1789")
  // These can appear anywhere in text, not just before >
  // Pattern: word?param=value&param2=value2 (with & or multiple =)
  result = result.replace(/\b([a-zA-Z0-9_-]+\?[a-zA-Z0-9_=&-]+)/gi, (match, urlFragment) => {
    // Only remove if it looks like a URL query string (has & or multiple =)
    if (urlFragment.includes('&') || (urlFragment.match(/=/g) || []).length > 1) {
      return '';
    }
    return match; // Keep if it's not a URL fragment
  });
  
  // Step 2: Now safely remove href attribute fragments (they won't be inside protected tags)
  const hrefFragmentsBefore = (result.match(/href\s*=\s*["'][^"']*["']/gi) || []).length;
  result = result.replace(/href\s*=\s*["'][^"']*["']/gi, '');
  const hrefFragmentsAfter = (result.match(/href\s*=\s*["'][^"']*["']/gi) || []).length;
  const removedHrefFragments = hrefFragmentsBefore - hrefFragmentsAfter;
  
  // Step 3: Remove any remaining attribute-like patterns (target="_blank", rel="noopener", etc.)
  // These can appear anywhere in text after broken tags
  result = result.replace(/\b(target|rel|class|id|alt|title|style|data-[a-zA-Z-]+)\s*=\s*["'][^"']*["']/gi, '');
  
  // Step 4: Remove attribute patterns before closing > (for broken tags)
  result = result.replace(/([a-zA-Z-]+\s*=\s*["'][^"']*["'])\s*>/gi, '>');
  
  // Step 5: Restore protected <a> tags
  anchorPlaceholders.forEach((originalTag, placeholder) => {
    result = result.replace(placeholder, originalTag);
  });
  
  // Count anchors after restoration
  const anchorsAfterRestoration = (result.match(/<a\s+[^>]*>/gi) || []).length;
  const anchorsWithHrefAfter = (result.match(/<a\s+[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || []).length;
  const anchorsWithoutHrefAfter = anchorsAfterRestoration - anchorsWithHrefAfter;
  
  // Log protection process
  logDebug('=== SANITIZE HTML: ANCHOR PROTECTION PROCESS ===', {
    anchorsBeforeProtection,
    protectedAnchorsCount,
    hrefFragmentsBefore,
    removedHrefFragments,
    anchorsAfterRestoration,
    anchorsWithHrefAfter,
    anchorsWithoutHrefAfter,
    protectionSuccessful: anchorsWithHrefAfter >= protectedAnchorsCount,
    sampleAfterRestoration: result.substring(0, 500) // Sample to verify href preservation
  });
  
  // Remove fragments that look like HTML tag endings (e.g., "</em></a>, loc. 1500-1576.</p>" >10")
  // Pattern: </tag></tag>, text.</tag>" >number
  result = result.replace(/<\/[a-z]+><\/[a-z]+>,\s*[^<]+\.<\/[a-z]+>"\s*>\s*\d+/gi, '');
  
  // CRITICAL: Remove any remaining fragments that look like broken HTML tags
  // Pattern: ">text" or ">number" at end of text (likely from broken tags)
  // BUT: Do NOT match if it's part of a valid closing tag like </strong>
  // Only match if there's a quote before > (not part of </tag>)
  result = result.replace(/"\s*>\s*([a-zA-Z0-9\s,.-]+)\s*$/gi, '');
  
  // Remove any remaining fragments that look like attribute values followed by text
  // Pattern: "value" text (where value looks like URL or attribute value)
  result = result.replace(/"([^"]*camp=1789[^"]*)"\s*([a-zA-Z\s,.-]+)/gi, '');
  result = result.replace(/"([^"]*linkId=[^"]*)"\s*([a-zA-Z\s,.-]+)/gi, '');
  
  // Remove standalone closing > that might be left (but preserve > in valid text)
  // Only remove > if it's at start/end or surrounded by whitespace (not part of text)
  // CRITICAL: Do NOT remove > from valid closing tags like </strong> or </b>
  // These patterns are safe: /^>\s*/ and /\s*>$/ and /\s+>\s+/
  // They should NOT match </strong> because there's no space before >
  
  // CRITICAL: Log before each regex to see which one removes >
  result = result.replace(/^>\s*/g, '');
  
  const beforeRegex2 = result;
  const beforeRegex2Length = result.length;
  
  // CRITICAL: Do NOT remove > from valid closing tags like </strong>, </b>, </a>, </em>, </i>, </u>, </s>, </code>, </mark>, </small>, </span>, etc.
  // Pattern /\s*>$/ requires whitespace before >, so it should NOT match closing tags
  // But if it does, we need to prevent it
  // Check if string ends with any closing tag BEFORE removing trailing >
  // CRITICAL: Check ALL allowed closing tags, not just a few
  const allowedClosingTags = ['strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'code', 'mark', 'small', 'span', 'a'];
  const endsWithTagsBefore = {};
  allowedClosingTags.forEach(tag => {
    endsWithTagsBefore[tag] = result.endsWith(`</${tag}>`);
  });
  
  
  if (!result.match(/<\/[a-z][a-z0-9]*>$/i)) {
    result = result.replace(/\s*>$/g, '');
  }
  
  const endsWithTagsAfter = {};
  allowedClosingTags.forEach(tag => {
    endsWithTagsAfter[tag] = result.endsWith(`</${tag}>`);
  });
  
  // Keep old variables for backward compatibility with logging
  const endsWithStrongBefore = endsWithTagsBefore['strong'];
  const endsWithBBefore = endsWithTagsBefore['b'];
  const endsWithABefore = endsWithTagsBefore['a'];
  const endsWithStrongAfter = endsWithTagsAfter['strong'];
  const endsWithBAfter = endsWithTagsAfter['b'];
  const endsWithAAfter = endsWithTagsAfter['a'];
  
  // CRITICAL: If we accidentally removed > from a valid closing tag, restore it
  // Check ALL allowed closing tags, not just a few
  allowedClosingTags.forEach(tag => {
    if (endsWithTagsBefore[tag] && !endsWithTagsAfter[tag]) {
      result = result + '>';
    }
  });
  
  // CRITICAL: Do NOT remove > from valid closing tags like </strong>, </b>, </a>, etc.
  // Pattern /\s+>\s+/ requires whitespace before and after >, so it should NOT match closing tags
  // But if it does, we need to prevent it
  // Replace standalone > only if it's NOT part of a closing tag
  result = result.replace(/\s+>\s+/g, (match, offset, fullString) => {
    // Check if this > is part of a closing tag (e.g., </strong>, </a>, etc.)
    // Look backwards to see if we have </tag> pattern
    const beforeMatch = fullString.substring(Math.max(0, offset - 20), offset);
    if (beforeMatch.match(/<\/[a-z][a-z0-9]*$/i)) {
      // This > is part of a closing tag - don't remove it
      return match;
    }
    // Not part of a closing tag - remove it
    return ' ';
  });
  
  
  // CRITICAL: Check if trim removes > from closing tags and restore if needed
  const endsWithTagsBeforeTrim = {};
  allowedClosingTags.forEach(tag => {
    endsWithTagsBeforeTrim[tag] = result.endsWith(`</${tag}>`);
  });
  
  result = result.trim();
  
  // CRITICAL: If trim accidentally removed > from a valid closing tag, restore it
  allowedClosingTags.forEach(tag => {
    if (endsWithTagsBeforeTrim[tag] && !result.endsWith(`</${tag}>`)) {
      result = result + '>';
    }
  });
  
  // CRITICAL: Ensure all opening tags have matching closing tags
  // This prevents unclosed tags from affecting subsequent text (e.g., unclosed <b> makes all text bold)
  // Use a stack-based approach to track tag nesting and close tags properly
  const allowedTagsForCheck = ['b', 'strong', 'em', 'i', 'u', 's', 'del', 'ins', 'code', 'mark', 'small', 'span', 'a'];
  const tagStack = [];
  let processedResult = '';
  let i = 0;
  
  // DEBUG: Log input before stack processing (only if there are allowed tags)
  const hasAllowedTags = /<[\/]?(b|strong|em|i|u|s|del|ins|code|mark|small|span|a)\b[^>]*>/i.test(result);
  if (hasAllowedTags) {
    // Count opening and closing tags to detect potential issues
    const openingStrong = (result.match(/<strong\b[^>]*>/gi) || []).length;
    const closingStrong = (result.match(/<\/strong>/gi) || []).length;
    const openingB = (result.match(/<b\b[^>]*>/gi) || []).length;
    const closingB = (result.match(/<\/b>/gi) || []).length;
    const openingA = (result.match(/<a\b[^>]*>/gi) || []).length;
    const closingA = (result.match(/<\/a>/gi) || []).length;
    
  }
  
  while (i < result.length) {
    // Check for opening tag
    const openMatch = result.substring(i).match(/^<([a-z][a-z0-9]*)\b[^>]*>/i);
    if (openMatch) {
      const tag = openMatch[1].toLowerCase();
      if (allowedTagsForCheck.includes(tag)) {
        // Self-closing tags like <br> don't need closing
        if (tag !== 'br') {
          tagStack.push(tag);
        }
        processedResult += openMatch[0];
        i += openMatch[0].length;
        continue;
      }
    }
    
    // Check for closing tag
    const closeMatch = result.substring(i).match(/^<\/([a-z][a-z0-9]*)>/i);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      if (allowedTagsForCheck.includes(tag)) {
        // Find matching opening tag in stack
        const stackIndex = tagStack.lastIndexOf(tag);
        if (stackIndex >= 0) {
          // Close all tags between stackIndex+1 and end (these are nested tags that need to be closed first)
          for (let j = tagStack.length - 1; j > stackIndex; j--) {
            processedResult += `</${tagStack[j]}>`;
          }
          // Remove the matching tag and all tags after it from stack
          tagStack.length = stackIndex;
          processedResult += closeMatch[0];
        } else {
          // Orphaned closing tag - ignore it (don't add to result)
          // DEBUG: Log orphaned closing tags (they indicate a problem)
          logDebug('=== SANITIZE HTML: ORPHANED CLOSING TAG IGNORED ===', {
            tag,
            stack: [...tagStack],
            position: i,
            contextBefore: result.substring(Math.max(0, i - 50), i),
            contextAfter: result.substring(i, Math.min(result.length, i + 50))
          });
        }
        i += closeMatch[0].length;
        continue;
      }
    }
    
    // Regular character
    processedResult += result[i];
    i++;
  }
  
  // Close any remaining open tags
  while (tagStack.length > 0) {
    const remainingTag = tagStack.pop();
    processedResult += `</${remainingTag}>`;
  }
  
  
  result = processedResult;
  
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
  // SECURITY: Block dangerous protocols in href attributes
  result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"'); // Remove javascript: links
  result = result.replace(/href\s*=\s*["']data:[^"']*["']/gi, 'href="#"'); // Remove data: links
  result = result.replace(/href\s*=\s*["']vbscript:[^"']*["']/gi, 'href="#"'); // Remove vbscript: links
  result = result.replace(/href\s*=\s*["']file:[^"']*["']/gi, 'href="#"'); // Remove file: links
  result = result.replace(/href\s*=\s*["']about:[^"']*["']/gi, 'href="#"'); // Remove about: links
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
        // SECURITY: Handle attributes with quotes (preferred) and without quotes (fallback)
        // First try with quotes, then without quotes if not found
        let m = match.match(new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
        if (!m) {
          // Try without quotes - match until space, >, or end of tag
          m = match.match(new RegExp(`${attr}\\s*=\\s*([^\\s>]+)`, 'i'));
        }
        if (m) {
          if (attr === 'href') {
            let href = m[1];
            
            // SECURITY: Decode HTML entities BEFORE protocol check to prevent bypass
            // Example: javascript&#58;alert(1) should be decoded to javascript:alert(1) before check
            if (typeof document !== 'undefined' && document.createElement) {
              // Browser context: use DOM to decode entities by creating element with href attribute
              const tempA = document.createElement('a');
              tempA.setAttribute('href', href); // Browser will decode entities automatically
              href = tempA.getAttribute('href') || href;
            } else {
              // Service worker context: decode manually - decode common entity patterns for dangerous protocols
              // Decode numeric and hex entities for colon (most common bypass vector)
              href = href
                .replace(/&#58;/g, ':')      // &#58; -> :
                .replace(/&#x3a;/gi, ':')    // &#x3a; -> :
                .replace(/&#x3A;/g, ':')    // &#x3A; -> :
                .replace(/&colon;/gi, ':')   // &colon; -> :
                .replace(/&#59;/g, ';')     // &#59; -> ;
                .replace(/&#x3b;/gi, ';')   // &#x3b; -> ;
                .replace(/&#x3B;/g, ';')    // &#x3B; -> ;
                .replace(/&semi;/gi, ';');  // &semi; -> ;
            }
            
            // SECURITY: Block dangerous protocols AFTER decoding entities
            const hrefLower = href.toLowerCase().trim();
            const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];
            if (dangerousProtocols.some(proto => hrefLower.startsWith(proto))) {
              // Block dangerous protocol - don't add href attribute
              continue;
            }
            
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
      
      // CRITICAL: For <a> tags, if href was not added, we should either:
      // 1. Remove the tag completely (safer)
      // 2. Or add href="#" as fallback (but this might create unwanted links)
      // For markdown HTML, we'll add href="#" as fallback to prevent unclosed tags
      if (tag === 'a') {
        const hasHref = attrs.some(a => a.startsWith('href='));
        if (!hasHref) {
          // CRITICAL: Anchor tag without href - add href="#" as fallback
          attrs.push('href="#"');
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
  
  // CRITICAL: Ensure all opening tags have matching closing tags (stack-based approach)
  // This prevents unclosed tags from affecting subsequent text (e.g., unclosed <a> makes all text blue)
  const allowedTagsForCheck = ['b', 'strong', 'em', 'i', 'u', 's', 'del', 'ins', 'code', 'mark', 'small', 'span', 'a'];
  const tagStack = [];
  let processedResult = '';
  let i = 0;
  
  while (i < result.length) {
    // Check for opening tag
    const openMatch = result.substring(i).match(/^<([a-z][a-z0-9]*)\b[^>]*>/i);
    if (openMatch) {
      const tag = openMatch[1].toLowerCase();
      if (allowedTagsForCheck.includes(tag)) {
        // Self-closing tags like <br> don't need closing
        if (tag !== 'br') {
          tagStack.push(tag);
        }
        processedResult += openMatch[0];
        i += openMatch[0].length;
        continue;
      }
    }
    
    // Check for closing tag
    const closeMatch = result.substring(i).match(/^<\/([a-z][a-z0-9]*)>/i);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      if (allowedTagsForCheck.includes(tag)) {
        // Find matching opening tag in stack
        const stackIndex = tagStack.lastIndexOf(tag);
        if (stackIndex >= 0) {
          // Close all tags between stackIndex+1 and end (these are nested tags that need to be closed first)
          for (let j = tagStack.length - 1; j > stackIndex; j--) {
            processedResult += `</${tagStack[j]}>`;
          }
          // Remove the matching tag and all tags after it from stack
          tagStack.length = stackIndex;
          processedResult += closeMatch[0];
        } else {
          // Orphaned closing tag - ignore it (don't add to result)
        }
        i += closeMatch[0].length;
        continue;
      }
    }
    
    // Regular character
    processedResult += result[i];
    i++;
  }
  
  // Close any remaining open tags
  while (tagStack.length > 0) {
    const remainingTag = tagStack.pop();
    processedResult += `</${remainingTag}>`;
  }
  
  result = processedResult;
  
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
  
  // CRITICAL: First, extract link text from anchor tags to prevent HTML attributes from leaking
  // Handle links with double quotes, single quotes, and without quotes
  // Use non-greedy matching to handle nested tags inside link text
  text = text.replace(/<a\s+[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Recursively strip HTML from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText || '';
  });
  text = text.replace(/<a\s+[^>]*href\s*=\s*'([^']*)'[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Recursively strip HTML from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText || '';
  });
  text = text.replace(/<a\s+[^>]*href\s*=\s*([^\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Recursively strip HTML from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText || '';
  });
  
  // Remove any remaining HTML tags (including any malformed tags that might leak attributes)
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
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
  
  // CRITICAL: Convert links FIRST, before removing other tags
  // Handle links with double quotes, single quotes, and without quotes
  // Use non-greedy matching to handle nested tags inside link text
  text = text.replace(/<a\s+[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Strip HTML tags from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText ? `[${cleanText}](${href})` : '';
  });
  text = text.replace(/<a\s+[^>]*href\s*=\s*'([^']*)'[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Strip HTML tags from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText ? `[${cleanText}](${href})` : '';
  });
  text = text.replace(/<a\s+[^>]*href\s*=\s*([^\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, (match, href, linkText) => {
    // Strip quotes from href if present
    const cleanHref = href.replace(/^["']|["']$/g, '');
    // Strip HTML tags from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText ? `[${cleanText}](${cleanHref})` : '';
  });
  
  // CRITICAL: Handle links without href (extract text only, don't create markdown link)
  // This prevents loss of link text when href is missing
  text = text.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, (match, linkText) => {
    // Strip HTML tags from link text to get plain text
    const cleanText = linkText.replace(/<[^>]+>/g, '').trim();
    return cleanText || '';
  });
  
  // Convert bold - normalize spaces inside tags (trim content before conversion)
  // This prevents "**text **" from spaces inside <strong>text </strong>
  text = text.replace(/<(strong|b)>([^<]*)<\/\1>/gi, (match, tag, content) => {
    const trimmed = content.trim();
    return trimmed ? `**${trimmed}**` : '';
  });
  
  // Convert italic - normalize spaces inside tags (trim content before conversion)
  text = text.replace(/<(em|i)>([^<]*)<\/\1>/gi, (match, tag, content) => {
    const trimmed = content.trim();
    return trimmed ? `*${trimmed}*` : '';
  });
  
  // Convert inline code - normalize spaces inside tags (trim content before conversion)
  text = text.replace(/<code>([^<]*)<\/code>/gi, (match, content) => {
    const trimmed = content.trim();
    return trimmed ? `\`${trimmed}\`` : '';
  });
  
  // Convert strikethrough - normalize spaces inside tags (trim content before conversion)
  text = text.replace(/<(s|del|strike)>([^<]*)<\/\1>/gi, (match, tag, content) => {
    const trimmed = content.trim();
    return trimmed ? `~~${trimmed}~~` : '';
  });
  
  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Remove remaining HTML tags (CRITICAL: must come after link conversion)
  // This will catch any links that weren't converted above
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // CRITICAL: Normalize spaces INSIDE markdown formatting (not between formatting and text)
  // Remove trailing spaces before closing **: "**text **" -> "**text**"
  // Remove trailing spaces before closing *: "*text *" -> "*text*"
  // This fixes cases like <strong>Speed. </strong> -> **Speed. ** -> **Speed.**
  text = text.replace(/\*\*([^*]+?)\s+\*\*/g, '**$1**');
  text = text.replace(/\*([^*\s]+?)\s+\*/g, '*$1*');
  text = text.replace(/~~([^~]+?)\s+~~/g, '~~$1~~');
  
  // Clean up whitespace (normalize multiple spaces to single space)
  text = text.replace(/[ \t]+/g, ' ').trim();
  
  return text;
}

/**
 * Convert markdown to HTML (for PDF generation)
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown;
  
  // CRITICAL: Log ORIGINAL INPUT - FULL TEXT (NO TRUNCATION)
  logDebug('=== MARKDOWN TO HTML: ORIGINAL INPUT (FULL) ===', {
    originalInput: html, // FULL TEXT - NO TRUNCATION
    originalInputLength: html.length
  });
  
  // CRITICAL: If input already contains HTML tags (like <strong>, <em>, <a>), preserve them
  // and skip markdown processing for those sections to avoid double-processing
  // Check if input already contains HTML tags - if so, return as-is (it's already HTML)
  if (/<[a-z][a-z0-9]*[^>]*>/i.test(html)) {
    // Input already contains HTML - just clean anchor attributes and return
    const htmlBeforeAnchorClean = html;
    html = html.replace(/<a\s+([^>]*?)>/gi, (match, attrs) => {
      // Remove target and rel attributes
      attrs = attrs.replace(/\s*target\s*=\s*["'][^"']*["']/gi, '');
      attrs = attrs.replace(/\s*rel\s*=\s*["'][^"']*["']/gi, '');
      attrs = attrs.trim();
      return `<a${attrs ? ' ' + attrs : ''}>`;
    });
    
    // CRITICAL: Log when HTML detected and returned as-is
    logDebug('=== MARKDOWN TO HTML: HTML DETECTED, RETURNING AS-IS (FULL) ===', {
      originalInput: htmlBeforeAnchorClean, // FULL TEXT - NO TRUNCATION
      outputAfterAnchorClean: html, // FULL TEXT - NO TRUNCATION
      changed: html !== htmlBeforeAnchorClean
    });
    
    return html; // Return early - no markdown processing needed
  }
  
  // CRITICAL: If input already contains HTML links, clean them first to prevent attribute leakage
  // Remove target and rel attributes from existing anchor tags
  // This handles cases where HTML is passed instead of markdown
  html = html.replace(/<a\s+([^>]*?)>/gi, (match, attrs) => {
    // Remove target and rel attributes
    attrs = attrs.replace(/\s*target\s*=\s*["'][^"']*["']/gi, '');
    attrs = attrs.replace(/\s*rel\s*=\s*["'][^"']*["']/gi, '');
    attrs = attrs.trim();
    return `<a${attrs ? ' ' + attrs : ''}>`;
  });
  
  // Code blocks first (to avoid processing markdown inside code)
  const codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return id;
  });
  
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Headers (process from largest to smallest to avoid conflicts)
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Links (only process markdown links, not existing HTML links)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Horizontal rules
  html = html.replace(/^(\s*[-*]{3,}\s*)$/gm, '<hr>');
  
  // Bold (must come before italic to avoid conflicts)
  // Handle both **text** and __text__ syntax
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic (single asterisk/underscore, but not inside code or bold)
  // Use negative lookbehind/lookahead to avoid matching inside code blocks
  html = html.replace(/(?<!`)(?<!\*)\*(?!\*)([^*`]+?)(?<!\*)\*(?!\*)(?!`)/g, '<em>$1</em>');
  html = html.replace(/(?<!`)(?<!_)_(?!_)([^_`]+?)(?<!_)_(?!_)(?!`)/g, '<em>$1</em>');
  
  // Strikethrough
  html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
  
  // Restore code blocks
  codeBlocks.forEach((codeBlock, index) => {
    html = html.replace(`CODE_BLOCK_${index}`, codeBlock);
  });
  
  // CRITICAL: Log FINAL OUTPUT - FULL TEXT (NO TRUNCATION)
  logDebug('=== MARKDOWN TO HTML: FINAL OUTPUT (FULL) ===', {
    finalOutput: html, // FULL TEXT - NO TRUNCATION
    finalOutputLength: html.length,
    originalInputLength: markdown.length,
    changed: html !== markdown
  });
  
  return html;
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

