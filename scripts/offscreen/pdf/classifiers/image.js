// @ts-check
// Image classifier - determines if element is an image
// Note: Images are typically extracted separately, this is for classification

/**
 * Classify element as image
 * 
 * @param {{type?: string, text?: string, [key: string]: any}} element - Element to classify
 * @returns {Object} Classification result
 */
export function classifyImage(element) {
  // Images are typically identified by type, not text content
  if (element.type === 'image') {
    return {
      type: 'image',
      confidence: 1.0,
      algorithm: 'type-check',
      details: {}
    };
  }
  
  return {
    type: 'not-image',
    confidence: 1.0,
    algorithm: 'type-check',
    details: {}
  };
}

