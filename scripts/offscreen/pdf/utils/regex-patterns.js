// @ts-check
// Shared regex patterns for PDF extraction v3
// Centralized to avoid duplication and ensure consistency

// Text pattern detection
export const SENTENCE_END_PATTERN = /[.!?]\s*$/;
export const CAPITAL_START_PATTERN = /^\p{Lu}/u;
export const LOWERCASE_START_PATTERN = /^\p{Ll}/u;
export const PUNCTUATION_END_PATTERN = /[,;:—–-]\s*$/;
export const HYPHEN_END_PATTERN = /[-—–]\s*$/;

// List item patterns (for detecting list boundaries and items)
export const LIST_ITEM_PATTERNS = /^[\s]*[•\-\*\+▪▫◦‣⁃]\s+|\d+[\.\)]\s+|\d+[\.\)]\s*[\p{L}]|^[\s]*[\p{L}][\.\)]\s+/u;
export const LIST_ITEM_START_PATTERN = /^[\s]*([•\-\*\+▪▫◦‣⁃]|\d+[\.\)])\s+/u;

// Sentence boundary pattern (for splitting merged paragraphs)
export const SENTENCE_BOUNDARY_PATTERN = /([.!?])\s+(\p{Lu})/gu;








