// @ts-check
// Text block analyzer - analyzes visual text blocks (strips) in columns
// Groups lines into visual blocks based on Y-coordinates and gaps
// Helps identify paragraph boundaries by detecting empty spaces between text blocks

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log } from '../../../../utils/logging.js';
// @ts-ignore - Module resolution issue, but file exists at runtime
import { CONFIG } from '../../../utils/config.js';
import { DEFAULT_METRICS } from '../constants.js';
import { calculateAverage } from '../utils/array-helpers.js';
import { processGapBetweenLines, finalizeBlock } from './text-block-helpers.js';

/**
 * Analyze visual text blocks (strips) in a column
 * Groups lines into blocks where text is "dense" (small gaps between lines)
 * and identifies empty spaces between blocks (large gaps)
 * 
 * This helps identify paragraph boundaries by looking at visual structure:
 * - Text block: group of lines with small gaps (text flows continuously)
 * - Empty space: large gap between text blocks (paragraph boundary)
 * 
 * CRITICAL: Distinguishes paragraph gaps (within column) from column gaps (between columns)
 * 
 * @param {Array} lines - Array of line objects with y coordinates
 * @param {{normalGapMax?: number, paragraphGapMin?: number, mean?: number, baseFontSize?: number, [key: string]: any}} gapAnalysis - Results from analyzeGaps
 * @param {{columnGaps?: Array<any>, [key: string]: any}|null} visualStructure - Results from analyzeVisualStructure (optional)
 * @param {{baseFontSize?: number, [key: string]: any}} metrics - PDF metrics (for baseFontSize)
 * @returns {Object} Text block analysis results
 */
export function analyzeTextBlocks(lines, gapAnalysis, visualStructure = null, metrics = {}) {
  // CRITICAL: Add version marker to verify new code is being used
  const versionMarker = 'CODE VERSION 2025-12-29-v3';
  // Only log to console in DEBUG mode
  if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
    console.log(`[PDF v3] analyzeTextBlocks START - ${versionMarker}`);
    console.error(`[PDF v3] analyzeTextBlocks START - ${versionMarker}`);
  }
  log(`[PDF v3] analyzeTextBlocks START - ${versionMarker}`);
  
  if (!lines || lines.length < 2) {
    return {
      blocks: [],
      blockBoundaries: [],
      averageBlockGap: 0,
      averageInBlockGap: 0
    };
  }

  const { normalGapMax, paragraphGapMin, mean } = gapAnalysis;
  const baseFontSize = metrics.baseFontSize || DEFAULT_METRICS.BASE_FONT_SIZE;
  
  // Group lines into visual blocks based on gaps
  // A block is a group of lines where gaps are small (text flows continuously)
  // A boundary is a large gap between blocks (empty space)
  const blocks = [];
  let currentBlock = {
    lines: [],
    startY: 0,
    endY: 0,
    totalGap: 0,
    gapCount: 0
  };

  // Log ALL input lines with full details
  const allLinesLog = lines.map((l, i) => {
    const y = l.y ? l.y.toFixed(2) : 'N/A';
    const text = (l.text || '').substring(0, 50);
    return `[${i}]Y${y}:"${text}"`;
  }).join(' | ');
  log(`[PDF v3] analyzeTextBlocks: ALL input lines - totalLines=${lines.length}, lines=[${allLinesLog}]`);
  log(`[PDF v3] analyzeTextBlocks: Gap thresholds - normalGapMax=${normalGapMax.toFixed(2)}, paragraphGapMin=${paragraphGapMin.toFixed(2)}, mean=${mean.toFixed(2)}`);
  
  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    const gap = next.y - current.y;
    const isLastIteration = (i === lines.length - 2); // Last iteration of loop
    
    // Process gap between lines
    const newBlock = processGapBetweenLines(current, next, gap, currentBlock, gapAnalysis, visualStructure, metrics, i);
    
    if (newBlock) {
      // Boundary detected - finish current block and start new one
      if (currentBlock.lines.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = newBlock;
      
      // CRITICAL: If this is the last iteration, add next line to the new block immediately
      // Otherwise, next line will be lost because loop ends
      if (isLastIteration) {
        const nextText = (next.text || '').substring(0, 30);
        if (!currentBlock.lines.includes(next)) {
          currentBlock.lines.push(next);
          currentBlock.endY = next.y || 0;
          log(`[PDF v3] analyzeTextBlocks: CRITICAL FIX - Added last line to new block on last iteration - lineY=${next.y?.toFixed(2) || '?'}, text="${nextText}", blockLines=${currentBlock.lines.length}`);
        } else {
          log(`[PDF v3] analyzeTextBlocks: Last line already in new block - lineY=${next.y?.toFixed(2) || '?'}, text="${nextText}"`);
        }
      }
    } else {
      // No boundary - add current line to current block
      if (!currentBlock.lines.includes(current)) {
        currentBlock.lines.push(current);
      }
      
      // CRITICAL: If this is the last iteration and no boundary, add next line to current block
      // This ensures last line is always added
      if (isLastIteration && !currentBlock.lines.includes(next)) {
        const nextText = (next.text || '').substring(0, 30);
        currentBlock.lines.push(next);
        currentBlock.endY = next.y || 0;
        log(`[PDF v3] analyzeTextBlocks: CRITICAL FIX - Added last line to current block on last iteration - lineY=${next.y?.toFixed(2) || '?'}, text="${nextText}", blockLines=${currentBlock.lines.length}`);
      }
    }
  }
  
  // Add last block (only if it's not empty and wasn't already added)
  // CRITICAL: If last iteration created a new block and added next line, currentBlock already has the last line
  // If last iteration didn't create boundary, currentBlock already has both current and next lines
  // So we only need to finalize if block has lines
  if (currentBlock.lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    
    // CRITICAL: Check if last line is already in currentBlock
    const lastLineInBlock = currentBlock.lines.includes(lastLine);
    if (!lastLineInBlock) {
      // Last line not in block - add it
      log(`[PDF v3] analyzeTextBlocks: WARNING - Last line not in currentBlock, adding it - lineY=${lastLine.y?.toFixed(2) || '?'}, text="${(lastLine.text || '').substring(0, 30)}"`);
      if (!currentBlock.lines.includes(lastLine)) {
        currentBlock.lines.push(lastLine);
        currentBlock.endY = lastLine.y || 0;
      }
    }
    
    finalizeBlock(currentBlock, lastLine, blocks.length);
    blocks.push(currentBlock);
  } else {
    // CRITICAL: If currentBlock is empty, it means last iteration created a new block but didn't add next line
    // This shouldn't happen with the fix above, but handle it anyway
    const lastLine = lines[lines.length - 1];
    log(`[PDF v3] analyzeTextBlocks: ERROR - currentBlock is empty but should contain last line - lastLineY=${lastLine.y?.toFixed(2) || '?'}, text="${(lastLine.text || '').substring(0, 30)}"`);
    // Create a new block with just the last line
    const newBlock = {
      lines: [lastLine],
      startY: lastLine.y || 0,
      endY: lastLine.y || 0,
      totalGap: 0,
      gapCount: 0,
      averageGap: 0
    };
    finalizeBlock(newBlock, lastLine, blocks.length);
    blocks.push(newBlock);
  }
  
  // Calculate statistics
  const blockBoundaries = blocks
    .filter(b => b.boundaryGap !== undefined)
    .map(b => b.boundaryGap);
  
  const inBlockGaps = blocks
    .filter(b => b.averageGap > 0)
    .map(b => b.averageGap);
  
  const averageBlockGap = calculateAverage(blockBoundaries);
  const averageInBlockGap = calculateAverage(inBlockGaps);
  
  const blocksList = blocks.map((b, idx) => {
    const firstLineText = b.lines.length > 0 ? (b.lines[0].text || '').substring(0, 30) : 'NO TEXT';
    const lastLineText = b.lines.length > 0 ? (b.lines[b.lines.length - 1].text || '').substring(0, 30) : 'NO TEXT';
    const lineTexts = b.lines.slice(0, 5).map((l, i) => `L${i}:"${(l.text || '').substring(0, 25)}"`).join(',');
    const moreLines = b.lines.length > 5 ? `...(+${b.lines.length - 5} more)` : '';
    return `[${idx}]lines=${b.lines.length},startY=${b.startY.toFixed(2)},endY=${b.endY.toFixed(2)},avgGap=${b.averageGap ? b.averageGap.toFixed(2) : '0'},boundaryGap=${b.boundaryGap ? b.boundaryGap.toFixed(2) : 'N/A'},firstLine="${firstLineText}",lastLine="${lastLineText}",lines=[${lineTexts}${moreLines}]`;
  }).join(' | ');
  log(`[PDF v3] analyzeTextBlocks: Text block analysis complete - totalBlocks=${blocks.length}, blockBoundaries=${blockBoundaries.length}, averageBlockGap=${averageBlockGap.toFixed(2)}, averageInBlockGap=${averageInBlockGap.toFixed(2)}, blocks=[${blocksList}] - ${versionMarker}`);
  // Only log to console in DEBUG mode
  if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
    console.log(`[PDF v3] analyzeTextBlocks END - ${versionMarker}`);
    console.error(`[PDF v3] analyzeTextBlocks END - ${versionMarker}`);
  }
  
  return {
    blocks,
    blockBoundaries,
    averageBlockGap,
    averageInBlockGap,
    blockCount: blocks.length
  };
}

/**
 * Check if a gap is a text block boundary based on visual structure
 * Uses text block analysis to identify empty spaces between text blocks
 * 
 * @param {number} gap - Gap size
 * @param {number} gap - Gap size
 * @param {{normalGapMax?: number, paragraphGapMin?: number, mean?: number, [key: string]: any}} gapAnalysis - Results from analyzeGaps
 * @param {{blocks?: Array<any>, blockBoundaries?: Array<any>, blockCount?: number, [key: string]: any}} textBlockAnalysis - Results from analyzeTextBlocks
 * @param {{prevGap?: number, nextGap?: number, [key: string]: any}} [context={}] - Context
 * @returns {boolean} True if gap is a block boundary (empty space)
 */
export function isTextBlockBoundary(gap, gapAnalysis, textBlockAnalysis, context = {}) {
  if (!textBlockAnalysis || textBlockAnalysis.blockCount === 0) {
    return false; // No block analysis available
  }
  
  const { averageBlockGap, averageInBlockGap, blockBoundaries } = textBlockAnalysis;
  const { normalGapMax, mean } = gapAnalysis;
  const { prevGap = null, nextGap = null } = context;
  
  // If gap is significantly larger than average gap within blocks, it's likely a boundary
  if (averageInBlockGap > 0 && gap >= averageInBlockGap * 3.0) {
    return true; // Gap is 3x larger than gaps within blocks
  }
  
  // If gap is similar to other block boundaries, it's likely a boundary
  if (blockBoundaries.length > 0) {
    const similarBoundaries = blockBoundaries.filter(b => Math.abs(b - gap) <= gap * 0.3);
    if (similarBoundaries.length >= blockBoundaries.length * 0.3) {
      // At least 30% of boundaries are similar to this gap
      return true;
    }
  }
  
  // If gap is much larger than previous and next gaps, it's likely a boundary
  // This detects "empty space" between text blocks
  if (prevGap !== null && nextGap !== null) {
    const avgNeighborGap = (prevGap + nextGap) / 2;
    if (avgNeighborGap > 0 && gap >= avgNeighborGap * 2.5) {
      // Gap is 2.5x larger than surrounding gaps - likely empty space
      return true;
    }
  }
  
  // If gap is significantly larger than normal gap max, it's likely a boundary
  if (gap >= normalGapMax * 2.5) {
    return true;
  }
  
  return false;
}

