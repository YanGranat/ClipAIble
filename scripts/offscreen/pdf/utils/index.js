// @ts-check
// Export all utilities

export { buildFontFormatMap } from './font-detection.js';
export { extractPageImages } from './image-extraction.js';
export { transformCoordinates } from './coordinate-transform.js';
export { processPageItemsToLines, transformTextItems, applyFontFormatting, calculateTolerances } from './item-transformer.js';
export { extractTitle, extractTitleFromText, extractTitleFromFirstSentence, extractTitleFromFirstElement, shouldIgnoreMetadataTitle } from './title-extractor.js';
export { loadPdfJs } from './pdf-loader.js';
export { parsePdfDate } from './date-parser.js';
export { toFileUrl, fetchPdfFile } from './pdf-fetcher.js';
export { parsePdfDocument } from './pdf-parser.js';
export { extractPdfMetadata } from './metadata-extractor.js';
export { calculateStatistics, calculateGapStatistics, isOutlier } from './statistics.js';
export { isNotEmpty, isEmpty, safeLength, calculateAverage, calculatePercentile, countBy, validateArrayInput } from './array-helpers.js';
export { truncateText, getElementText, formatElementForLog } from './text-helpers.js';
export { findColumnForItem, areItemsInDifferentColumns, findColumnByCenter, findColumnByOverlap } from './column-helpers.js';
export { normalizeYCoordinate, getColumnIndexForElement, detectTableColumns, detectTableHeaders } from './table-helpers.js';

