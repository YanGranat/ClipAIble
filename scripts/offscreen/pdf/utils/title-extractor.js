// @ts-check
// Title extraction utility - extracts title from various sources
// Multiple fallback strategies

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../../utils/logging.js';
import { ELEMENT_DECISION } from '../constants.js';

/**
 * Extract title from text element (paragraph, heading, or any element)
 * Truncates to maxLength characters, not breaking words
 * 
 * @param {string} text - Text to extract title from
 * @param {number} maxLength - Maximum length (default: from constants)
 * @returns {string} Extracted title or empty string
 */
export function extractTitleFromText(text, maxLength = ELEMENT_DECISION.TITLE_MAX_LENGTH) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  
  // Find first sentence (ends with . ! ? or newline)
  const sentenceMatch = trimmed.match(/^[^.!?\n]+[.!?\n]?/);
  if (!sentenceMatch) {
    return '';
  }
  
  let sentence = sentenceMatch[0].trim();
  
  // Remove trailing punctuation if it's just punctuation
  sentence = sentence.replace(/[.!?]+$/, '');
  
  // If sentence is shorter than maxLength, return it
  if (sentence.length <= maxLength) {
    return sentence;
  }
  
  // Truncate to maxLength, but not on word boundary
  // Find last space before maxLength
  const truncated = sentence.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0 && lastSpace > maxLength * 0.5) {
    // Use last space if it's not too early (at least 50% of maxLength)
    return sentence.substring(0, lastSpace).trim();
  }
  
  // If no good space found, find first space after maxLength
  const tolerance = ELEMENT_DECISION.TITLE_TRUNCATE_TOLERANCE;
  const firstSpaceAfter = sentence.indexOf(' ', maxLength);
  if (firstSpaceAfter > 0 && firstSpaceAfter < maxLength + tolerance) {
    // If space is close, include the word
    return sentence.substring(0, firstSpaceAfter).trim();
  }
  
  // Fallback: just truncate at maxLength
  return sentence.substring(0, maxLength).trim();
}

/**
 * Extract title from first sentence of first paragraph
 * 
 * @param {Array} elements - Array of content elements
 * @param {number} maxLength - Maximum length (default: from constants)
 * @returns {string} Extracted title or empty string
 */
export function extractTitleFromFirstSentence(elements, maxLength = ELEMENT_DECISION.TITLE_MAX_LENGTH) {
  if (!elements || !Array.isArray(elements)) {
    return '';
  }
  
  // Find first paragraph
  const firstParagraph = elements.find(el => el.type === 'paragraph' && el.text && el.text.trim());
  
  if (!firstParagraph || !firstParagraph.text) {
    log('[PDF v3] extractTitleFromFirstSentence: No paragraph found', {
      elementsCount: elements.length,
      elementTypes: elements.map(el => el.type),
      firstElement: elements[0] ? {
        type: elements[0].type,
        hasText: !!(elements[0].text && elements[0].text.trim())
      } : null
    });
    return '';
  }
  
  return extractTitleFromText(firstParagraph.text, maxLength);
}

/**
 * Extract title from first element (regardless of type)
 * 
 * @param {Array} elements - Array of content elements
 * @param {number} maxLength - Maximum length (default: from constants)
 * @returns {Object} { title: string, element: Object|null, shouldConvertToParagraph: boolean }
 */
export function extractTitleFromFirstElement(elements, maxLength = ELEMENT_DECISION.TITLE_MAX_LENGTH) {
  if (!elements || !Array.isArray(elements) || elements.length === 0) {
    return { title: '', element: null, shouldConvertToParagraph: false };
  }
  
  const firstElement = elements[0];
  if (!firstElement || !firstElement.text) {
    return { title: '', element: null, shouldConvertToParagraph: false };
  }
  
  const title = extractTitleFromText(firstElement.text, maxLength);
  const shouldConvertToParagraph = firstElement.type === 'heading';
  
  return { title, element: firstElement, shouldConvertToParagraph };
}

/**
 * Check if metadata title should be ignored (generic/empty)
 * 
 * @param {string} title - Metadata title
 * @returns {boolean} Should ignore
 */
export function shouldIgnoreMetadataTitle(title) {
  if (!title || typeof title !== 'string') {
    return true;
  }
  
  const trimmed = title.trim();
  
  if (trimmed.length < 3) {
    return true;
  }
  
  const lower = trimmed.toLowerCase();
  const ignoredTitles = ['anonymous', '(anonymous)', 'untitled', 'untitled pdf'];
  
  return ignoredTitles.includes(lower);
}

/**
 * Extract title from multiple sources with fallback strategy
 * Priority:
 * 1. Metadata title (if not ignored)
 * 2. First short heading (<=100 chars)
 * 3. First sentence of first paragraph
 * 4. First sentence of first element (convert heading to paragraph if needed)
 * 5. Filename
 * 
 * @param {{metadataTitle?: string, elements?: Array<any>, url?: string}} options - Extraction options
 * @returns {Object} { title: string, elements: Array } - Title and potentially modified elements
 */
export function extractTitle({ metadataTitle, elements, url }) {
  // Validate inputs
  if (!elements || !Array.isArray(elements)) {
    log('[PDF v3] extractTitle: Invalid elements', { elements });
    elements = [];
  }
  
  if (!url || typeof url !== 'string') {
    log('[PDF v3] extractTitle: Invalid url', { url });
    url = '';
  }
  
  let title = '';
  let finalElements = [...elements]; // Copy to avoid mutation
  
  // Priority 1: Metadata title (if not ignored)
  if (metadataTitle && !shouldIgnoreMetadataTitle(metadataTitle)) {
    title = metadataTitle.trim();
    log('[PDF v3] Title extracted from metadata', { title });
    return { title, elements: finalElements };
  }
  
  log('[PDF v3] Metadata title ignored (empty or generic)', { metadataTitle });
  
  // Priority 2: First short heading
  if (finalElements.length > 0) {
    log('[PDF v3] extractTitle: Looking for heading in elements', {
      elementsCount: finalElements.length,
      elementTypes: finalElements.map(el => ({ 
        type: el.type, 
        text: (el.text || '').substring(0, 30),
        hasText: !!(el.text && el.text.trim())
      })),
      fullElements: finalElements.map((el, idx) => ({
        index: idx,
        type: el.type,
        text: el.text ? el.text.substring(0, 100) : 'NO TEXT',
        textLength: el.text ? el.text.length : 0,
        level: el.level,
        fontSize: el.fontSize
      }))
    });
    
    const firstHeading = finalElements.find(el => el.type === 'heading');
    log(`[PDF v3] extractTitle: Searching for heading - found=${!!firstHeading}, elementsCount=${finalElements.length}, types=${finalElements.map(el => el.type).join(',')}`);
    
    if (firstHeading && firstHeading.text) {
      const headingText = firstHeading.text.trim();
      log(`[PDF v3] Found heading candidate for title - text="${headingText.substring(0, 50)}", length=${headingText.length}, maxLength=${ELEMENT_DECISION.HEADING_MAX_LENGTH}, level=${firstHeading.level}`);
      
      if (headingText.length <= ELEMENT_DECISION.HEADING_MAX_LENGTH) {
        title = headingText;
        log(`[PDF v3] Title extracted from first heading - title="${title}", level=${firstHeading.level}`);
        // Remove heading from content if used as title
        const headingIndex = finalElements.indexOf(firstHeading);
        log(`[PDF v3] Removing heading - headingIndex=${headingIndex}, elementsBefore=${finalElements.length}`);
        if (headingIndex !== -1) {
          finalElements.splice(headingIndex, 1);
          log(`[PDF v3] Heading removed - elementsAfter=${finalElements.length}, remainingTypes=${finalElements.map(el => el.type).join(',')}`);
        } else {
          logWarn(`[PDF v3] Heading not found in array for removal - headingIndex=${headingIndex}`);
        }
        return { title, elements: finalElements };
      } else {
        log('[PDF v3] Heading too long for title, skipping', {
          headingText: headingText.substring(0, 50),
          length: headingText.length
        });
      }
    } else {
      log('[PDF v3] No heading found in elements', {
        elementsCount: finalElements.length,
        elementTypes: finalElements.map(el => ({ 
          type: el.type, 
          text: (el.text || '').substring(0, 30)
        }))
      });
    }
  }
  
  // Priority 3: First sentence of first paragraph
  if (finalElements.length > 0) {
    const titleFromSentence = extractTitleFromFirstSentence(finalElements);
    if (titleFromSentence) {
      title = titleFromSentence;
      log('[PDF v3] Title extracted from first sentence', { title });
      
      // Find and remove any heading that matches the extracted title
      // This handles cases where heading text matches the title extracted from paragraph
      const titleNormalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
      
      for (let i = 0; i < finalElements.length; i++) {
        const element = finalElements[i];
        if (element.type === 'heading' && element.text) {
          const headingText = (element.text || '').trim();
          const headingNormalized = headingText.toLowerCase().replace(/\s+/g, ' ');
          
          // Check if heading text matches title (exact match or significant overlap)
          // Use more lenient matching: if title is contained in heading or vice versa
          // But require at least 70% similarity to avoid false positives
          const exactMatch = headingNormalized === titleNormalized;
          const titleInHeading = headingNormalized.includes(titleNormalized);
          const headingInTitle = titleNormalized.includes(headingNormalized);
          
          // Calculate similarity for longer texts
          const similarity = exactMatch ? 1.0 : 
            (titleInHeading ? titleNormalized.length / headingNormalized.length :
             headingInTitle ? headingNormalized.length / titleNormalized.length : 0);
          
          if (exactMatch || similarity >= 0.7) {
            log('[PDF v3] Removing heading that matches extracted title', {
              headingText,
              title,
              similarity: similarity.toFixed(2),
              index: i
            });
            finalElements.splice(i, 1); // Remove heading
            break; // Only remove first matching heading
          }
        }
      }
      
      return { title, elements: finalElements };
    }
  }
  
  // Priority 4: First sentence of first element (regardless of type)
  if (finalElements.length > 0) {
    const { title: titleFromElement, element: firstElement, shouldConvertToParagraph } = 
      extractTitleFromFirstElement(finalElements);
    
    if (titleFromElement) {
      title = titleFromElement;
      log('[PDF v3] Title extracted from first element', { title, elementType: firstElement.type });
      
      // If it was a heading, remove it since it's used as title
      if (shouldConvertToParagraph && firstElement.type === 'heading') {
        const index = finalElements.indexOf(firstElement);
        if (index !== -1) {
          log('[PDF v3] Removing heading used as title', {
            headingText: firstElement.text,
            title
          });
          finalElements.splice(index, 1);
        }
      }
      
      return { title, elements: finalElements };
    }
  }
  
  // Priority 5: Filename fallback
  if (!title) {
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1].split('?')[0];
    title = filename.replace('.pdf', '').replace(/%20/g, ' ') || 'Untitled PDF';
    log('[PDF v3] Using filename as title fallback', { title, filename });
  }
  
  return { title, elements: finalElements };
}

