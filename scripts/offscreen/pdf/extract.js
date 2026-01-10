// @ts-check
// PDF extraction v3 - Main coordinator
// Modular architecture with multiple classification algorithms
// Starting with simple proven algorithms, ready for expansion

import { log, logError, criticalLog } from '../../utils/logging.js';

// Core modules
import { loadPdfDocument } from './core/pdf-loader.js';
import { collectSampleItems } from './core/metrics-collector.js';
import { collectAllLinesForGapAnalysis } from './core/gap-analysis-collector.js';
import { extractContentFromPages } from './core/content-extractor.js';
import { processContent } from './core/content-processor.js';

// Analyzers
import { analyzePdfMetrics } from './analyzers/metrics.js';
import { analyzeGaps } from './analyzers/gap-analyzer.js';

/**
 * Extract content from PDF file (v3)
 * 
 * @param {string} url - PDF file URL
 * @returns {Promise<Object>} Extracted content result
 */
export async function extractPdfContent(url) {
  // Validate input
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('Invalid PDF URL: URL must be a non-empty string');
  }
  
  const versionMarker = 'CODE VERSION 2025-12-29-v6';
  // CRITICAL: Log with ALL available methods using criticalLog
  // VERSION v6 - Using criticalLog with localStorage and sendMessage
  const startMsg = `[PDF v3] === PDF EXTRACTION START === - ${versionMarker}`;
  const marker = '=== PDF_EXTRACTION_START_MARKER_V6 ===';
  criticalLog(startMsg, marker, { url, version: 'v6' });
  
  try {
    // Step 1: Load PDF document
    const { pdf, numPages, metadata, outline } = await loadPdfDocument(url);
    
    // Step 2: Collect sample items for metrics analysis
    const sampleItems = await collectSampleItems(pdf, numPages);
    
    // Step 3: Analyze PDF metrics
    const metrics = analyzePdfMetrics(sampleItems, numPages);
    
    // Step 4: Collect all lines for global gap analysis
    const allLines = await collectAllLinesForGapAnalysis(pdf, numPages);
    
    // Step 5: Perform global gap analysis
    // COMMENTED: log('[PDF v3] === Performing global gap analysis ===', { totalLines: allLines.length });
    const globalGapAnalysis = analyzeGaps(allLines);
    metrics.gapAnalysis = globalGapAnalysis;
    
    // Step 6: Extract content from all pages
    // COMMENTED: const versionMarker = 'CODE VERSION 2025-12-29-v3';
    // COMMENTED: const beforeCallMsg = `[PDF v3] === BEFORE CALLING extractContentFromPages === - ${versionMarker}`;
    // COMMENTED: console.error('=== BEFORE_CALLING_EXTRACT_CONTENT ===', beforeCallMsg);
    // COMMENTED: console.warn('=== BEFORE_CALLING_EXTRACT_CONTENT ===', beforeCallMsg);
    // COMMENTED: console.log(beforeCallMsg);
    // COMMENTED: log('=== BEFORE_CALLING_EXTRACT_CONTENT === ' + beforeCallMsg, { numPages, hasMetrics: !!metrics, hasGapAnalysis: !!metrics.gapAnalysis });
    const { elements: allElements } = await extractContentFromPages(pdf, numPages, metrics);
    // COMMENTED: console.log(`[PDF v3] === AFTER extractContentFromPages RETURNED === - ${versionMarker}`, { elementsCount: allElements?.length || 0 });
    // COMMENTED: console.error(`[PDF v3] === AFTER extractContentFromPages RETURNED === - ${versionMarker}`, { elementsCount: allElements?.length || 0 });
    // COMMENTED: log(`[PDF v3] === AFTER extractContentFromPages RETURNED === - ${versionMarker}`, { elementsCount: allElements?.length || 0 });
    
    // Step 7: Process content (merge, determine heading levels, post-process, extract title)
    const { title, elements: finalElements } = processContent(
      allElements,
      metrics,
      metadata,
      url,
      outline
    );
    
    // COMMENTED: log(`[PDF v3] === PDF EXTRACTION END === - ${versionMarker}`, {
    //   title,
    //   contentItems: finalElements.length,
    //   pages: numPages
    // });
    // COMMENTED: console.log(`[PDF v3] === PDF EXTRACTION END === - ${versionMarker}`);
    // COMMENTED: console.error(`[PDF v3] === PDF EXTRACTION END === - ${versionMarker}`);
    
    return {
      title: title || 'Untitled PDF',
      content: finalElements,
      publishDate: metadata.publishDate || '',
      author: metadata.author || '',
      metrics
    };
  } catch (error) {
    logError('[PDF v3] PDF extraction failed', error);
    throw error;
  }
}
