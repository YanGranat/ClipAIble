// Processing mode selector utility
// Selects appropriate processing function based on mode

// @ts-check

/**
 * Select processing function based on mode
 * @param {import('../types.js').ExtractionMode} mode - Processing mode ('automatic', 'selector', 'extract')
 * @param {{processWithoutAI: function(import('../types.js').ProcessingData): Promise<import('../types.js').ExtractionResult>, processWithSelectorMode: function(import('../types.js').ProcessingData): Promise<import('../types.js').ExtractionResult>, processWithExtractMode: function(import('../types.js').ProcessingData): Promise<import('../types.js').ExtractionResult>}} functions - Object with processing functions
 * @returns {function(import('../types.js').ProcessingData): Promise<import('../types.js').ExtractionResult>} Selected processing function
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

