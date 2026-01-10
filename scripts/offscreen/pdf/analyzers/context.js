// @ts-check
// Context analyzer - analyzes element in context of neighbors and page

/**
 * Analyze element context
 * 
 * @param {{[key: string]: any}} element - Element to analyze
 * @param {Array} allElements - All elements on page
 * @param {number} elementIndex - Index of element in allElements
 * @returns {Object} Context information
 */
export function analyzeContext(element, allElements, elementIndex) {
  const previousElement = elementIndex > 0 ? allElements[elementIndex - 1] : null;
  const nextElement = elementIndex < allElements.length - 1 ? allElements[elementIndex + 1] : null;
  
  // Get nearby elements (within 5 positions)
  const nearbyElements = allElements.slice(
    Math.max(0, elementIndex - 2),
    Math.min(allElements.length, elementIndex + 3)
  );
  
  return {
    previousElement,
    nextElement,
    nearbyElements,
    position: {
      index: elementIndex,
      total: allElements.length,
      isFirst: elementIndex === 0,
      isLast: elementIndex === allElements.length - 1
    }
  };
}

