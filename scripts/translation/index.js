// Translation module for ClipAIble extension
// Re-exports all translation functions from sub-modules for backward compatibility

// @ts-check

// @typedef {import('../types.js').ContentItem} ContentItem
// @typedef {import('../types.js').ExtractionResult} ExtractionResult

// Re-export all functions from sub-modules
export { translateText, translateBatch, translateContent, translateMetadata } from './text.js';
export { detectImageText, translateImages } from './images.js';
export { detectSourceLanguage, detectLanguageByCharacters, detectContentLanguage } from './detection.js';
export { generateAbstract, generateSummary } from './generation.js';
