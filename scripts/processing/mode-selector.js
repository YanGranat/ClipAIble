// Processing mode selector utility
// Selects appropriate processing function based on mode

// @ts-check

/**
 * Select processing function based on mode
 * @param {string} mode - Processing mode ('automatic', 'selector', 'extract')
 * @param {Object} functions - Object with processing functions
 * @param {Function} functions.processWithoutAI - Automatic mode function
 * @param {Function} functions.processWithSelectorMode - Selector mode function
 * @param {Function} functions.processWithExtractMode - Extract mode function
 * @returns {Function} Selected processing function
 */
export function selectProcessingFunction(mode, functions) {
  const { processWithoutAI, processWithSelectorMode, processWithExtractMode } = functions;
  
  switch (mode) {
    case 'automatic':
      return processWithoutAI;
    case 'selector':
      return processWithSelectorMode;
    case 'extract':
      return processWithExtractMode;
    default:
      // Default to extract mode for unknown modes
      return processWithExtractMode;
  }
}

