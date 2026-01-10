// @ts-check
// Export all processors

export { shouldMergeParagraphs, mergeCrossPageParagraphs } from './cross-page.js';
export { postProcessElements } from './post-processing.js';
export { shouldContinueBlock } from './continuation.js';
export { decideElementType } from './element-decider.js';
export { groupLinesIntoElements } from './element-grouper.js';
export { processPage } from './page-processor.js';
export { groupConsecutiveListItems } from './list-grouper.js';

// TODO: mergeElements is not yet implemented - placeholder for future features
// export { mergeElements } from './merging.js';

