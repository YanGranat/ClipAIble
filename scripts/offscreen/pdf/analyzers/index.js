// @ts-check
// Export all analyzers

export { analyzePdfMetrics } from './metrics.js';
export { analyzeStructure } from './structure.js';
export { analyzeGaps, isParagraphBoundary } from './gap-analyzer.js';
export { analyzeTextBlocks, isTextBlockBoundary } from './text-block-analyzer.js';
export { detectColumns, processLinesByColumns } from './column-detector.js';
export {
  analyzeFontSizeHierarchy,
  matchHeadingToOutline,
  extractNumberingLevel,
  validateHeadingHierarchy,
  determineHeadingLevel
} from './heading-hierarchy.js';

// Note: Placeholder modules for future enhancement
export { analyzeContext } from './context.js';
export { analyzePageContext } from './page-context.js';
export { analyzeCrossPageContext } from './cross-page-context.js';

