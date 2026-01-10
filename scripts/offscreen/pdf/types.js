// @ts-check
// Types and interfaces for PDF extraction v3

/**
 * @typedef {Object} TextItem
 * @property {string} str - Text content
 * @property {number} x - X coordinate (viewport)
 * @property {number} y - Y coordinate (viewport)
 * @property {number} fontSize - Font size
 * @property {string} fontName - Font name
 * @property {number} width - Item width
 * @property {number} height - Item height
 * @property {boolean} [isBold] - Is bold
 * @property {boolean} [isItalic] - Is italic
 * @property {boolean} [isUnderlined] - Is underlined
 * @property {number} [pageNum] - Page number
 */

/**
 * @typedef {Object} Line
 * @property {string} text - Line text
 * @property {number} y - Y coordinate
 * @property {number} x - X coordinate
 * @property {number} fontSize - Font size
 * @property {boolean} [isBold] - Is bold
 * @property {boolean} [isItalic] - Is italic
 * @property {boolean} [isUnderlined] - Is underlined
 * @property {TextItem[]} items - Source items
 * @property {number} [pageNum] - Page number
 */

/**
 * @typedef {Object} PdfElement
 * @property {string} type - Element type: 'paragraph' | 'heading' | 'list' | 'table' | 'image' | 'formula'
 * @property {string} text - Element text
 * @property {number} [level] - Heading level (1-6) for headings
 * @property {number} [pageNum] - Page number
 * @property {Line[]} [lines] - Source lines
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} TableElement
 * @property {string} type - 'table'
 * @property {string} text - Combined text from all cells (for compatibility)
 * @property {Array<Array<string>>} rows - Table rows (each row is array of cell strings)
 * @property {boolean} [hasHeaders] - Has header row (first row is header)
 * @property {number} [columnCount] - Number of columns
 * @property {number} [rowCount] - Number of rows
 * @property {Array<number>} [columnPositions] - X-coordinates of column boundaries
 * @property {number} [pageNum] - Page number
 * @property {Line[]} [lines] - Source lines
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} type - Classified type
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} algorithm - Algorithm name that made the decision
 * @property {Object} [details] - Algorithm-specific details
 */

/**
 * @typedef {Object} PdfMetrics
 * @property {number} baseFontSize - Base font size (mode)
 * @property {number} medianFontSize - Median font size
 * @property {number} modeSpacing - Most common line spacing
 * @property {number} paragraphGapThreshold - Threshold for paragraph gaps
 * @property {Object} [fontSizeDistribution] - Font size distribution
 * @property {Object} [spacingDistribution] - Spacing distribution
 */

/**
 * @typedef {Object} ElementContext
 * @property {PdfElement[]} [previousElements] - Previous elements on page
 * @property {PdfElement[]} [nextElements] - Next elements on page
 * @property {PdfElement} [previousElement] - Previous element
 * @property {PdfElement} [nextElement] - Next element
 * @property {number} [pageNum] - Page number
 * @property {Object} [pageMetrics] - Page-specific metrics
 */


