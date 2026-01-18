// @ts-check
// Export all processors

export { shouldMergeParagraphs, mergeCrossPageParagraphs } from './cross-page.js';
export { postProcessElements } from './post-processing.js';
export { shouldContinueBlock } from './continuation.js';
export { decideElementType } from './element-decider.js';
export { groupLinesIntoElements } from './element-grouper.js';
export { processPage } from './page-processor.js';
export { groupConsecutiveListItems } from './list-grouper.js';

// Note: mergeElements is a placeholder for future enhancement
// export { mergeElements } from './merging.js';

