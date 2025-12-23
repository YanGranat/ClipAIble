// @ts-check
// Content cleaning functions for automatic extraction
// These functions will be inlined into extractAutomaticallyInlined

/**
 * Clean HTML content by removing footnotes, icons, OBJ markers, and unsafe attributes
 * Uses TreeWalker for efficient single-pass cleaning
 * @param {Element} element - Element to clean
 * @param {Function} isFootnoteLink - Function to check if link is footnote
 * @param {Function} isIcon - Function to check if element is icon
 * @returns {string} Cleaned HTML string
 */
export function cleanHtmlContentModule(element, isFootnoteLink, isIcon) {
  if (!element) return '';
  
  // Clone element to avoid modifying original
  const htmlClone = element.cloneNode(true);
  
  // Single-pass TreeWalker for efficient cleaning
  const walker = document.createTreeWalker(
    htmlClone,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          
          // Remove footnote links
          if (tagName === 'a' && isFootnoteLink(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Remove icons
          if (isIcon(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Remove sup elements with arrows
          if (tagName === 'sup') {
            const supText = node.textContent.trim();
            if ((supText.length <= 3 && /[←→↑↓↗↘↩]/.test(supText)) || supText.toLowerCase().includes('open these')) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          
          // Remove object/embed elements
          if (tagName === 'object' || tagName === 'embed') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Remove elements that contain only "OBJ" text
          const elText = node.textContent.trim();
          if (/^obj\s*$/i.test(elText) || /^\[obj\]\s*$/i.test(elText)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Clean attributes in the same pass
          node.removeAttribute('style');
          const safeAttributes = ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'];
          for (const attr of Array.from(node.attributes)) {
            if (attr.name.startsWith('on') || !safeAttributes.includes(attr.name.toLowerCase())) {
              node.removeAttribute(attr.name);
            }
          }
          
          // Remove empty spans and divs
          if ((tagName === 'span' || tagName === 'div') && !node.textContent.trim() && !node.querySelector('img')) {
            return NodeFilter.FILTER_REJECT;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          // Clean OBJ markers from text nodes
          const text = node.textContent.trim();
          if (/^obj\s*$/i.test(text) || /^\[obj\]\s*$/i.test(text)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Remove OBJ markers from text content
          if (node.textContent && /obj/i.test(node.textContent)) {
            node.textContent = node.textContent.replace(/\s*\[?obj\]?\s*/gi, '');
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
  
  // Process all nodes
  const nodesToProcess = [];
  let currentNode;
  while (currentNode = walker.nextNode()) {
    nodesToProcess.push(currentNode);
  }
  
  // Get cleaned HTML
  let cleanedHtml = htmlClone.innerHTML
    .replace(/\s*\[?obj\]?\s*/gi, '') // Remove any remaining OBJ markers
    .replace(/<[^>]*>\s*\[?obj\]?\s*<\/[^>]*>/gi, '') // Remove empty tags with OBJ
    .trim();
  
  return cleanedHtml;
}

/**
 * Clean text content by removing OBJ markers and Object Replacement Character
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanTextContentModule(text) {
  if (!text) return '';
  return text
    .replace(/\s*\[?obj\]?\s*/gi, '') // Remove [OBJ] or OBJ markers
    .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
    .replace(/\s*#\s*$/, '') // Remove trailing #
    .trim();
}

/**
 * Clean heading text by removing OBJ markers and Object Replacement Character
 * @param {string} headingText - Heading text to clean
 * @returns {string} Cleaned heading text
 */
export function cleanHeadingTextModule(headingText) {
  if (!headingText) return '';
  // First get text without HTML to properly detect OBJ
  const headingTextWithoutHtml = headingText.replace(/<[^>]+>/g, '').trim();
  return headingTextWithoutHtml
    .replace(/\s*\[?obj\]?\s*/gi, '') // Remove [OBJ] or OBJ markers
    .replace(/\uFFFC/g, '') // Remove Object Replacement Character (U+FFFC)
    .replace(/\s*#\s*$/, '') // Remove trailing #
    .trim();
}


