// @ts-check
// Paragraph classifier - multiple algorithms to determine if element is a paragraph

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
import { PARAGRAPH_LENGTH } from '../constants.js';

/**
 * Algorithm 1: Length-based classification
 * Paragraphs are typically longer than headings
 * 
 * @param {{text?: string, fontSize?: number, [key: string]: any}} element - Element to classify
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Object} Classification result
 */
function classifyByLength(element, metrics) {
  const text = element.text || '';
  const length = text.length;
  
  // Paragraphs are typically longer than headings
  const isParagraph = length > PARAGRAPH_LENGTH.SHORT;
  const confidence = isParagraph ? 
    Math.min(0.9, 0.5 + (length / PARAGRAPH_LENGTH.MEDIUM) * 0.4) : 
    Math.max(0.1, 0.5 - (PARAGRAPH_LENGTH.SHORT / length) * 0.4);
  
  return {
    type: isParagraph ? 'paragraph' : 'not-paragraph',
    confidence: Math.max(0, Math.min(1, confidence)),
    algorithm: 'length-based',
    details: { length, threshold: PARAGRAPH_LENGTH.SHORT }
  };
}

/**
 * Algorithm 2: Sentence structure
 * Paragraphs contain multiple sentences
 * 
 * @param {{text?: string, [key: string]: any}} element - Element to classify
 * @returns {Object} Classification result
 */
function classifyBySentenceStructure(element) {
  const text = element.text || '';
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Paragraphs typically have multiple sentences
  const isParagraph = sentences.length >= 2;
  const confidence = isParagraph ? 
    Math.min(0.8, 0.4 + sentences.length * 0.1) : 
    Math.max(0.2, 0.6 - sentences.length * 0.2);
  
  return {
    type: isParagraph ? 'paragraph' : 'not-paragraph',
    confidence: Math.max(0, Math.min(1, confidence)),
    algorithm: 'sentence-structure',
    details: { sentenceCount: sentences.length }
  };
}

/**
 * Algorithm 3: Punctuation patterns
 * Paragraphs end with sentence-ending punctuation
 * 
 * @param {{text?: string, [key: string]: any}} element - Element to classify
 * @returns {Object} Classification result
 */
function classifyByPunctuation(element) {
  const text = element.text || '';
  const endsWithSentenceEnd = /[.!?]\s*$/.test(text);
  const hasMultiplePunctuation = (text.match(/[.,;:!?]/g) || []).length >= 2;
  
  const isParagraph = endsWithSentenceEnd && hasMultiplePunctuation;
  const confidence = isParagraph ? 0.7 : 0.3;
  
  return {
    type: isParagraph ? 'paragraph' : 'not-paragraph',
    confidence,
    algorithm: 'punctuation-patterns',
    details: { endsWithSentenceEnd, hasMultiplePunctuation }
  };
}

/**
 * Classify element as paragraph using multiple algorithms
 * Returns weighted consensus
 * 
 * @param {{text?: string, fontSize?: number, [key: string]: any}} element - Element to classify
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics
 * @returns {Object} Classification result with consensus
 */
export function classifyParagraph(element, metrics) {
  // Validate inputs
  if (!element || typeof element !== 'object') {
    log('[PDF v3] classifyParagraph: Invalid element', { element });
    return {
      type: 'not-paragraph',
      confidence: 0,
      algorithm: 'error',
      details: { error: 'Invalid element' }
    };
  }
  
  if (!metrics || typeof metrics !== 'object') {
    log('[PDF v3] classifyParagraph: Invalid metrics, using defaults', { metrics });
    metrics = {};
  }
  
  const results = [
    classifyByLength(element, metrics),
    classifyBySentenceStructure(element),
    classifyByPunctuation(element)
  ];
  
  // Weighted average of confidences
  const weights = [0.4, 0.3, 0.3]; // Length is most important
  const weightedConfidence = results.reduce((sum, r, i) => {
    const confidence = r.type === 'paragraph' ? r.confidence : (1 - r.confidence);
    return sum + confidence * weights[i];
  }, 0);
  
  const isParagraph = weightedConfidence > 0.5;
  
  log(`[PDF v3] classifyParagraph: ${isParagraph ? 'PARAGRAPH' : 'NOT PARAGRAPH'}`, {
    text: (element.text || '').substring(0, 50),
    weightedConfidence: weightedConfidence.toFixed(2),
    results: results.map(r => ({
      algorithm: r.algorithm,
      confidence: r.confidence.toFixed(2),
      type: r.type
    }))
  });
  
  return {
    type: isParagraph ? 'paragraph' : 'not-paragraph',
    confidence: weightedConfidence,
    algorithm: 'consensus',
    details: { results, weightedConfidence }
  };
}

