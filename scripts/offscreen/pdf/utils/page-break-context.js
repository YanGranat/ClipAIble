// @ts-check
// Page break context analyzer - analyzes what ends previous page and what starts next page
// Centralized to avoid duplication

import { PAGE_BREAK_CONTEXT } from '../constants.js';
import {
  SENTENCE_END_PATTERN,
  CAPITAL_START_PATTERN,
  LOWERCASE_START_PATTERN,
  PUNCTUATION_END_PATTERN
} from './regex-patterns.js';

/**
 * Analyze page break context: what ends previous page and what starts next page
 * This is a critical visual/structural indicator for continuation detection
 * 
 * @param {string} prevText - Text from previous page
 * @param {string} currentText - Text from current page
 * @returns {Object} Page break context object
 */
export function analyzePageBreakContext(prevText, currentText) {
  const prevTextTrimmed = (prevText || '').trim();
  const currentTextTrimmed = (currentText || '').trim();
  
  // Get last characters of previous page for context
  const prevPageEnd = prevTextTrimmed.substring(Math.max(0, prevTextTrimmed.length - PAGE_BREAK_CONTEXT.PREV_PAGE_END_LENGTH));
  const nextPageStart = currentTextTrimmed.substring(0, Math.min(PAGE_BREAK_CONTEXT.NEXT_PAGE_START_LENGTH, currentTextTrimmed.length));
  
  // Analyze how previous page ends
  const prevEndsWithComma = /,\s*$/.test(prevTextTrimmed);
  const prevEndsWithSemicolon = /;\s*$/.test(prevTextTrimmed);
  const prevEndsWithColon = /:\s*$/.test(prevTextTrimmed);
  const prevEndsWithDash = /[-—–]\s*$/.test(prevTextTrimmed);
  const prevEndsWithPunctuation = prevEndsWithComma || prevEndsWithSemicolon || prevEndsWithColon || prevEndsWithDash;
  const prevEndsWithSentenceEnd = SENTENCE_END_PATTERN.test(prevTextTrimmed);
  const prevEndsWithIncomplete = prevEndsWithPunctuation && !prevEndsWithSentenceEnd; // Ends with comma/semicolon/colon/dash = incomplete sentence
  
  // Analyze how next page starts
  const nextStartsWithLowercase = LOWERCASE_START_PATTERN.test(currentTextTrimmed);
  const nextStartsWithCapital = CAPITAL_START_PATTERN.test(currentTextTrimmed);
  const nextStartsWithPunctuation = /^[.,;:—–-]/.test(currentTextTrimmed);
  
  return {
    prevEndsWithIncomplete,      // Previous page ends with comma/semicolon/colon/dash = continuation
    prevEndsWithSentenceEnd,     // Previous page ends with sentence end
    prevEndsWithComma,           // Previous page ends with comma (strong continuation)
    prevEndsWithDash,            // Previous page ends with dash (strong continuation)
    nextStartsWithLowercase,     // Next page starts with lowercase (continuation)
    nextStartsWithCapital,       // Next page starts with capital (might be new paragraph)
    nextStartsWithPunctuation,   // Next page starts with punctuation (unusual, but continuation)
    prevPageEnd,                 // Last N chars of previous page
    nextPageStart                // First N chars of next page
  };
}








