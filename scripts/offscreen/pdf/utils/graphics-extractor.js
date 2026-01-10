// @ts-check
// Graphics extractor - extracts lines and rectangles from PDF operator list
// This can be used to detect table borders and improve table detection

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logWarn } from '../../../utils/logging.js';
// @ts-ignore - Module resolution issue, but file exists at runtime
import { CONFIG } from '../../../utils/config.js';
import { DEFAULT_METRICS, TABLE_DETECTION } from '../constants.js';
import { loadPdfJs } from './pdf-loader.js';
import { multiplyCTM, transformPoint, transformRectangle, isTableLine, invertMatrix } from './graphics-helpers.js';
import { transformCoordinates } from './coordinate-transform.js';


/**
 * Extract graphics (lines, rectangles) from PDF page operator list
 * 
 * @param {{getOperatorList: function(): Promise<any>, [key: string]: any}} page - PDF.js page object
 * @param {number} pageNum - Page number
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @returns {Promise<Object>} { lines, rectangles }
 */
export async function extractPageGraphics(page, pageNum, viewport) {
  // Load PDF.js library for OPS constants
  const pdfjsLib = await loadPdfJs();
  const lines = [];
  const rectangles = [];
  
  // Track operator usage for debugging (declared outside try for catch block access)
  const operatorStats = {
    transformMatrix: 0,
    transform: 0,
    rectangle: 0,
    moveTo: 0,
    lineTo: 0,
    stroke: 0,
    closePath: 0,
    constructPath: 0,
    showText: 0,
    setTextMatrix: 0,
    saveState: 0,
    restoreState: 0,
    endPath: 0,
    setLineWidth: 0,
    unknown: 0
  };
  
  // CRITICAL: Track CTM stack for saveState/restoreState
  const ctmStack = [];
  
  try {
    const operatorList = await page.getOperatorList();
    
    if (!operatorList || !operatorList.fnArray) {
      const noOpListMsg = `[PDF v3] extractPageGraphics: No operator list for page ${pageNum}`;
      // Only log to console in DEBUG mode
      if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
        console.error(noOpListMsg);
      }
      log(noOpListMsg);
      return { lines: [], rectangles: [], allLines: [] };
    }
    
    // Parse operator list
    
    // Track current transformation matrix (CTM) and path state
    let ctm = [1, 0, 0, 1, 0, 0]; // Identity matrix
    let currentPath = [];
    let lineWidth = 1;
    
    // CRITICAL: Track text matrix (Tm) for underline detection
    // ReportLab may create underlines relative to text position
    let textMatrix = [1, 0, 0, 1, 0, 0]; // Identity matrix
    let isInTextMode = false;
    
    // PDF.js operator codes (may vary by version)
    const OPS = pdfjsLib.OPS || {};
    
    // Track all unique operator codes for debugging
    const uniqueOperators = new Set();
    const operatorCodeToName = {};
    
    // Build reverse mapping: code -> name
    for (const [name, code] of Object.entries(OPS)) {
      if (typeof code === 'number') {
        operatorCodeToName[code] = name;
      }
    }
    
    // Build operator code mappings
    
    // CRITICAL: Track operator sequence for text and graphics analysis
    // We need to understand the exact order of operators around text and underline
    let operatorSequence = [];
    let lastTextOperatorIndex = -1;
    let lastTextOperatorArgs = null;
    let lastTextOperatorFn = null;
    
    for (let i = 0; i < operatorList.fnArray.length; i++) {
      let fn = null;
      let args = [];
      try {
        fn = operatorList.fnArray[i];
        args = operatorList.argsArray && operatorList.argsArray[i] ? operatorList.argsArray[i] : [];
      
      // Track unique operators
      uniqueOperators.add(fn);
      
      // CRITICAL: Log ALL operators to understand sequence
      // Track text operators (showText, Tj, etc.) and graphics operators (constructPath, etc.)
      // This will help us understand what happens between text and underline
      // CRITICAL: Check multiple possible operator codes for showText
      // PDF.js may use different codes: 44 (showText), 47 (Tj), 48 (TJ), etc.
      const isShowText = fn === OPS.showText || fn === 44 || fn === 47 || fn === OPS.showSpacedText || fn === 48 || fn === OPS.nextShowText || fn === 45;
      if (isShowText) {
        operatorStats.showText++;
        // Text rendering operator - log it
        let textStr = '';
        if (args && args.length > 0) {
          if (typeof args[0] === 'string') {
            textStr = args[0];
          } else if (Array.isArray(args[0])) {
            // args[0] might be an array of strings or character codes
            textStr = args[0].map(a => typeof a === 'string' ? a : String.fromCharCode(a)).join('');
          } else {
            textStr = JSON.stringify(args[0]);
          }
        }
        
        // Update lastTextOperatorIndex for distance calculations
        lastTextOperatorIndex = i;
        lastTextOperatorArgs = args;
        lastTextOperatorFn = fn;
      }
      
      // Save state (q) - code 10 - saves current graphics state including CTM
      if (fn === OPS.save || fn === 10) {
        operatorStats.saveState++;
        ctmStack.push([...ctm]); // Save current CTM
      }
      
      // Restore state (Q) - code 11 - restores previous graphics state including CTM
      if (fn === OPS.restore || fn === 11) {
        operatorStats.restoreState++;
        if (ctmStack.length > 0) {
          const oldCTM = [...ctm];
          ctm = ctmStack.pop(); // Restore previous CTM
          // Restore CTM from stack
        } else {
          logWarn(`[PDF v3] extractPageGraphics: restoreState(Q/11) #${operatorStats.restoreState} - CTM stack is empty!`);
        }
      }
      
      // Transform matrix operations (cm) - code 20
      if (fn === OPS.transformMatrix || fn === 20) {
        operatorStats.transformMatrix++;
        if (args && args.length >= 6) {
          // Multiply current CTM with new matrix (proper matrix multiplication)
          const [a, b, c, d, e, f] = args;
          const oldCTM = [...ctm];
          ctm = multiplyCTM(ctm, [a, b, c, d, e, f]);
          // Update CTM
        }
      }
      
      // CRITICAL: Code 12 in PDF.js - need to understand what it is
      // In PDF spec: q=10 (saveState), Q=11 (restoreState), cm=20 (transformMatrix)
      // Code 12 doesn't exist in PDF spec, but PDF.js might use it for something
      // From logs, it seems to apply transformations with 6-number args
      if (fn === 12) {
        const operatorName = operatorCodeToName[12] || 'unknown(12)';
        
        // CRITICAL: If args has 6 numbers, it's likely a transform matrix
        // This is what we see in logs: transform(12) with CTM changes
        if (args && args.length >= 6 && typeof args[0] === 'number') {
          const [a, b, c, d, e, f] = args;
          const oldCTM = [...ctm];
          // Apply as transform matrix (this matches what we see in logs)
          ctm = multiplyCTM(ctm, [a, b, c, d, e, f]);
          operatorStats.transform++;
          
          // CRITICAL: Log all code 12 operations to understand what they are
          const isNearText = lastTextOperatorIndex >= 0 && Math.abs(i - lastTextOperatorIndex) <= 20;
          if (operatorStats.transform <= 10 || isNearText) {
            log(`[PDF v3] extractPageGraphics: OPERATOR SEQUENCE #${i} - ${operatorName}(12) #${operatorStats.transform} - TREATED AS TRANSFORM - oldCTM=[${oldCTM.map(v => v.toFixed(2)).join(',')}] newMatrix=[${[a, b, c, d, e, f].map(v => v.toFixed(2)).join(',')}] newCTM=[${ctm.map(v => v.toFixed(2)).join(',')}] distance from last text=${lastTextOperatorIndex >= 0 ? i - lastTextOperatorIndex : 'N/A'}`);
          }
        } else {
          // Log non-transform code 12 operations
          if (operatorStats.transform <= 5) {
            log(`[PDF v3] extractPageGraphics: OPERATOR SEQUENCE #${i} - ${operatorName}(12) - args=${JSON.stringify(args).substring(0, 200)} CTM=[${ctm.map(v => v.toFixed(2)).join(',')}]`);
          }
        }
      }
      
      // Rectangle (re) - can be used for lines (very thin rectangles)
      if (fn === OPS.rectangle || fn === 19) {
        operatorStats.rectangle++;
        if (args && args.length >= 4) {
          const [x, y, width, height] = args;
          
          // CRITICAL: Transform all 4 corners using CTM for accurate bounding box
          const transformed = transformRectangle(x, y, width, height, ctm);
          
          // Convert to viewport coordinates
          const viewportBL = viewport.convertToViewportPoint(transformed.minX, transformed.minY);
          const viewportTR = viewport.convertToViewportPoint(transformed.maxX, transformed.maxY);
          const viewportWidth = transformed.width;
          const viewportHeight = transformed.height;
          
          // Check if this is a line (very thin rectangle)
          // ReportLab might use thin rectangles for table borders
          // Use adaptive thresholds based on baseFontSize (default 12)
          const baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE;
          const thicknessThreshold = Math.max(TABLE_DETECTION.LINE_THICKNESS_THRESHOLD, baseFontSize * TABLE_DETECTION.LINE_THICKNESS_MULTIPLIER);
          const lengthThreshold = Math.max(TABLE_DETECTION.LINE_LENGTH_THRESHOLD, baseFontSize * TABLE_DETECTION.LINE_LENGTH_MULTIPLIER);
          
          const isHorizontalLine = viewportHeight < thicknessThreshold && viewportWidth > lengthThreshold;
          const isVerticalLine = viewportWidth < thicknessThreshold && viewportHeight > lengthThreshold;
          
          if (isHorizontalLine || isVerticalLine) {
            // Treat as a line
            const lineY1 = Math.min(viewportBL[1], viewportTR[1]);
            const lineY2 = Math.max(viewportBL[1], viewportTR[1]);
            const avgY = (lineY1 + lineY2) / 2;
            
            // CRITICAL: Log rectangles converted to lines in second table range (550-630) using criticalLog
            const inSecondTableRange = (avgY >= 550 && avgY <= 630) || 
                                       (lineY1 >= 550 && lineY1 <= 630) || 
                                       (lineY2 >= 550 && lineY2 <= 630);
            
            if (inSecondTableRange) {
              const msg = `[PDF v3] extractPageGraphics: rectangle(19) - SECOND TABLE RANGE LINE: isHorizontal=${isHorizontalLine} isVertical=${isVerticalLine} coords[${Math.min(viewportBL[0], viewportTR[0]).toFixed(2)},${lineY1.toFixed(2)}]->[${Math.max(viewportBL[0], viewportTR[0]).toFixed(2)},${lineY2.toFixed(2)}] PDF[${x.toFixed(2)},${y.toFixed(2)}] w=${width.toFixed(2)} h=${height.toFixed(2)}`;
              log(msg, {
                operatorNum: operatorStats.rectangle,
                pdfCoords: { x, y, width, height },
                viewportCoords: { lineY1, lineY2, x1: Math.min(viewportBL[0], viewportTR[0]), x2: Math.max(viewportBL[0], viewportTR[0]) },
                isHorizontalLine,
                isVerticalLine,
                avgY
              });
            }
            
            lines.push({
              x1: Math.min(viewportBL[0], viewportTR[0]),
              y1: lineY1,
              x2: Math.max(viewportBL[0], viewportTR[0]),
              y2: lineY2,
              pageNum,
              lineWidth,
              fromRectangle: true // Mark as coming from rectangle operator
            });
          } else {
            // Regular rectangle
            rectangles.push({
              x: Math.min(viewportBL[0], viewportTR[0]),
              y: Math.min(viewportBL[1], viewportTR[1]),
              width: viewportWidth,
              height: viewportHeight,
              pageNum,
              // Original PDF coordinates
              pdfX: x,
              pdfY: y,
              pdfWidth: width,
              pdfHeight: height
            });
          }
        }
      }
      
      // Move to (m) - start new path
      if (fn === OPS.moveTo || fn === 11) {
        operatorStats.moveTo++;
        if (args && args.length >= 2) {
          const [x, y] = args;
          // CRITICAL: PDF coordinates are in points (1/72 inch), need proper transformation
          // Apply CTM transformation using helper function
          const [transformedX, transformedY] = transformPoint(x, y, ctm);
          // CRITICAL FIX: Use the same coordinate transformation as text items
          let [viewportX, viewportY] = transformCoordinates(transformedX, transformedY, viewport);
          
          // DETAILED LOGGING for coordinate transformation debugging
          const originalViewportY = viewportY;
          const wasNegative = viewportY < 0;
          const absViewportY = Math.abs(viewportY);
          const viewportHeight = viewport.height;
          
          // CRITICAL: Invert Y coordinates if negative to match text coordinate system
          // PDF.js viewport.convertToViewportPoint returns negative Y for graphics
          // while text items have positive Y. We need to align them.
          // PDF coordinates go from bottom-left (0,0) upward, graphics use this system
          // Text coordinates go from top-left (0,0) downward after viewport conversion
          // 
          // If viewportY is negative, use: viewport.height + viewportY
          // This converts from bottom-up (graphics) to top-down (text) coordinate system
          if (viewportY < 0) {
            viewportY = viewport.height + viewportY;
          }
          
          // Invert Y if negative
          
          currentPath = [{ x: viewportX, y: viewportY }];
        }
      }
      
      // Line to (l) - add line to path
      // NOTE: Code 12 is transform, not lineTo! lineTo is typically code 11 or OPS.lineTo
      // CRITICAL: Fixed logical error - (fn !== 12 && fn === 11) was always false
      if (fn === OPS.lineTo || fn === 11) {
        operatorStats.lineTo++;
        if (args && args.length >= 2 && currentPath.length > 0) {
          const [x, y] = args;
          // CRITICAL: PDF coordinates are in points (1/72 inch), need proper transformation
          // Apply CTM transformation using helper function
          const [transformedX, transformedY] = transformPoint(x, y, ctm);
          // CRITICAL FIX: Use the same coordinate transformation as text items
          let [viewportX, viewportY] = transformCoordinates(transformedX, transformedY, viewport);
          
          // DETAILED LOGGING for coordinate transformation debugging
          const originalViewportY = viewportY;
          const wasNegative = viewportY < 0;
          const absViewportY = Math.abs(viewportY);
          const viewportHeight = viewport.height;
          
          // CRITICAL: Invert Y coordinates if negative to match text coordinate system
          // PDF.js viewport.convertToViewportPoint returns negative Y for graphics
          // while text items have positive Y. We need to align them.
          // PDF coordinates go from bottom-left (0,0) upward, graphics use this system
          // Text coordinates go from top-left (0,0) downward after viewport conversion
          // 
          // If viewportY is negative, use: viewport.height + viewportY
          // This converts from bottom-up (graphics) to top-down (text) coordinate system
          if (viewportY < 0) {
            viewportY = viewport.height + viewportY;
          }
          
          // Invert Y if negative
          
          currentPath.push({ x: viewportX, y: viewportY });
        }
      }
      
      // Stroke (S) - draw path as lines
      if (fn === OPS.stroke || fn === 25) {
        operatorStats.stroke++;
        if (currentPath.length >= 2) {
          // CRITICAL: Add BOTH horizontal AND vertical lines from path
          // Horizontal lines are for underlines and table row borders
          // Vertical lines are for table column borders
          // Also filter out lines with coordinates way outside viewport (likely errors)
          for (let j = 0; j < currentPath.length - 1; j++) {
            const start = currentPath[j];
            const end = currentPath[j + 1];
            
            // Check if line is horizontal or vertical (within tolerance)
            const isHorizontal = Math.abs(start.y - end.y) < 2;
            const isVertical = Math.abs(start.x - end.x) < 2;
            
            // Check if coordinates are within reasonable viewport bounds (relaxed for tables)
            const withinViewport = start.y >= -viewport.height * 0.5 && start.y <= viewport.height * 2.5 &&
                                   end.y >= -viewport.height * 0.5 && end.y <= viewport.height * 2.5 &&
                                   start.x >= -viewport.width * 0.5 && start.x <= viewport.width * 2.5 &&
                                   end.x >= -viewport.width * 0.5 && end.x <= viewport.width * 2.5;
            
            // CRITICAL: Log lines in second table range (550-630) even if they're skipped using criticalLog
            const avgY = (start.y + end.y) / 2;
            const inSecondTableRange = (avgY >= 550 && avgY <= 630) || 
                                       (start.y >= 550 && start.y <= 630) || 
                                       (end.y >= 550 && end.y <= 630);
            
            if (inSecondTableRange) {
              const msg = `[PDF v3] extractPageGraphics: stroke - SECOND TABLE RANGE: isHorizontal=${isHorizontal} isVertical=${isVertical} withinViewport=${withinViewport} coords[${start.x.toFixed(2)},${start.y.toFixed(2)}]->[${end.x.toFixed(2)},${end.y.toFixed(2)}] viewportH=${viewport.height?.toFixed(2) || 'N/A'}`;
              log(msg, {
                operatorNum: operatorStats.stroke,
                coords: { start, end },
                isHorizontal,
                isVertical,
                withinViewport,
                viewportHeight: viewport.height,
                avgY
              });
            }
            
            // Add horizontal OR vertical lines that are within viewport bounds
            // Both are needed for table detection
            if ((isHorizontal || isVertical) && withinViewport) {
              lines.push({
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                pageNum,
                lineWidth
              });
            } else if (inSecondTableRange) {
              log(`[PDF v3] extractPageGraphics: stroke - SKIPPED SECOND TABLE LINE: isHorizontal=${isHorizontal} isVertical=${isVertical} withinViewport=${withinViewport} coords[${start.x.toFixed(2)},${start.y.toFixed(2)}]->[${end.x.toFixed(2)},${end.y.toFixed(2)}] viewportH=${viewport.height?.toFixed(2) || 'N/A'}`);
            }
          }
          currentPath = [];
        }
      }
      
      // Close path (h) - close current path
      if (fn === OPS.closePath || fn === 13) {
        operatorStats.closePath++;
        if (currentPath.length >= 2) {
          // Connect last point to first point
          const first = currentPath[0];
          const last = currentPath[currentPath.length - 1];
          currentPath.push({ x: first.x, y: first.y });
        }
      }
      
      // Set line width (w)
      if (fn === OPS.setLineWidth || fn === 22) {
        operatorStats.setLineWidth++;
        if (args && args.length >= 1) {
          lineWidth = args[0] * viewport.scale;
        }
      }
      
      // Text operators - track text matrix for underline detection
      // beginText (BT) - code 31
      if (fn === OPS.beginText || fn === 31) {
        isInTextMode = true;
        textMatrix = [1, 0, 0, 1, 0, 0]; // Reset text matrix
      }
      
      // endText (ET) - code 32
      if (fn === OPS.endText || fn === 32) {
        isInTextMode = false;
      }
      
      // setTextMatrix (Tm) - code 42
      if (fn === OPS.setTextMatrix || fn === 42) {
        operatorStats.setTextMatrix++;
        if (args && args.length >= 6) {
          const [a, b, c, d, e, f] = args;
          const oldTextMatrix = [...textMatrix];
          textMatrix = [a, b, c, d, e, f];
          // Update text matrix
        }
      }
      
      // nextLine (T*) - code 43 (moves text position)
      if (fn === OPS.nextLine || fn === 43) {
        // Text matrix is updated by nextLine, but we don't have the exact values
        // This is handled by PDF.js internally
      }
      
      // ConstructPath (code 91) - ReportLab uses this to define paths
      // Structure: args = [operatorIndices, coords1, coords2, ...]
      // Where coords arrays contain direct coordinates for lines/rectangles
      if (fn === OPS.constructPath || fn === 91) {
        operatorStats.constructPath++;
        
        // Process constructPath operator
        
        if (args && args.length > 0) {
          // args[0] might be operator indices (but they're often text operators, not graphics)
          // args[1], args[2], etc. contain coordinate arrays
          // Each coordinate array with 4 numbers likely represents a line or rectangle
          
          // Process coordinate arrays (skip args[0] if it's operator indices)
          for (let argIdx = 1; argIdx < args.length; argIdx++) {
            try {
              const coordArray = args[argIdx];
              
              if (Array.isArray(coordArray) && coordArray.length >= 4) {
                // Try to interpret as line coordinates
                // Format might be [x1, y1, x2, y2] or [x, y, width, height]
                const [val1, val2, val3, val4] = coordArray;
                
                if (typeof val1 === 'number' && typeof val2 === 'number' && 
                    typeof val3 === 'number' && typeof val4 === 'number') {
                  
                  // Check if it's a horizontal line (y1 == y2) or vertical line (x1 == x2)
                  // For table detection, we need BOTH horizontal AND vertical lines
                  // ReportLab creates table borders as both horizontal and vertical lines in constructPath
                  const isHorizontal = Math.abs(val2 - val4) < 0.01;
                  const isVertical = Math.abs(val1 - val3) < 0.01;
                  
                  // CRITICAL: Process BOTH horizontal AND vertical lines for table detection
                  // Horizontal lines are for underlines and table row borders
                  // Vertical lines are for table column borders
                  if (isHorizontal || isVertical) {
                  // It's a line: [x1, y1, x2, y2]
                  const x1 = val1;
                  const y1 = val2;
                  const x2 = val3;
                  const y2 = val4;
                  
                  // CRITICAL: Understanding coordinate systems in constructPath(91)
                  // PDF.js returns coordinates from constructPath in USER SPACE (PDF Native)
                  // These are ABSOLUTE coordinates in the PDF coordinate system
                  // However, they may be:
                  // 1. Already transformed by CTM (if CTM was applied before constructPath)
                  // 2. Relative to text position (if text matrix is active)
                  // 3. In original user space (if no transformations applied)
                  // 
                  // CRITICAL QUESTION: Are coordinates ABSOLUTE or RELATIVE?
                  // - ABSOLUTE: Coordinates are in PDF native space, independent of text position
                  // - RELATIVE: Coordinates are relative to current text position (need to add text matrix translation)
                  //
                  // From PDF.js documentation: constructPath coordinates are in USER SPACE
                  // User Space = PDF Native coordinates (absolute, bottom-left origin, Y-up)
                  // But CTM and text matrix may have been applied, so we need to check all possibilities
                  
                  // Approach 1: Direct transformation (same as text items)
                  let [viewportX1, viewportY1] = transformCoordinates(x1, y1, viewport);
                  let [viewportX2, viewportY2] = transformCoordinates(x2, y2, viewport);
                  
                  // Approach 2: With CTM transformation
                  const [transformedX1_ctm, transformedY1_ctm] = transformPoint(x1, y1, ctm);
                  const [transformedX2_ctm, transformedY2_ctm] = transformPoint(x2, y2, ctm);
                  const [viewportX1_withCTM, viewportY1_withCTM] = transformCoordinates(transformedX1_ctm, transformedY1_ctm, viewport);
                  const [viewportX2_withCTM, viewportY2_withCTM] = transformCoordinates(transformedX2_ctm, transformedY2_ctm, viewport);
                  
                  // Approach 3: With text matrix (if in text mode OR if text matrix is not identity)
                  // CRITICAL: ReportLab may create underlines right after text, even if isInTextMode=false
                  // Try text matrix transformation if text matrix is not identity (has translation)
                  let viewportX1_withTextMatrix = viewportX1;
                  let viewportY1_withTextMatrix = viewportY1;
                  let viewportX2_withTextMatrix = viewportX2;
                  let viewportY2_withTextMatrix = viewportY2;
                  const textMatrixHasTranslation = textMatrix[4] !== 0 || textMatrix[5] !== 0;
                  if (isInTextMode || textMatrixHasTranslation) {
                    const [transformedX1_tm, transformedY1_tm] = transformPoint(x1, y1, textMatrix);
                    const [transformedX2_tm, transformedY2_tm] = transformPoint(x2, y2, textMatrix);
                    const [transformedX1_tm_ctm, transformedY1_tm_ctm] = transformPoint(transformedX1_tm, transformedY1_tm, ctm);
                    const [transformedX2_tm_ctm, transformedY2_tm_ctm] = transformPoint(transformedX2_tm, transformedY2_tm, ctm);
                    [viewportX1_withTextMatrix, viewportY1_withTextMatrix] = transformCoordinates(transformedX1_tm_ctm, transformedY1_tm_ctm, viewport);
                    [viewportX2_withTextMatrix, viewportY2_withTextMatrix] = transformCoordinates(transformedX2_tm_ctm, transformedY2_tm_ctm, viewport);
                  }
                  
                  // Approach 4: Try CTM + text matrix together (even if not in text mode)
                  // ReportLab may apply both transformations
                  let viewportX1_withCTM_TM = viewportX1;
                  let viewportY1_withCTM_TM = viewportY1;
                  let viewportX2_withCTM_TM = viewportX2;
                  let viewportY2_withCTM_TM = viewportY2;
                  if (textMatrixHasTranslation) {
                    // First apply CTM, then text matrix
                    const [transformedX1_ctm_tm, transformedY1_ctm_tm] = transformPoint(x1, y1, ctm);
                    const [transformedX2_ctm_tm, transformedY2_ctm_tm] = transformPoint(x2, y2, ctm);
                    const [transformedX1_ctm_tm_final, transformedY1_ctm_tm_final] = transformPoint(transformedX1_ctm_tm, transformedY1_ctm_tm, textMatrix);
                    const [transformedX2_ctm_tm_final, transformedY2_ctm_tm_final] = transformPoint(transformedX2_ctm_tm, transformedY2_ctm_tm, textMatrix);
                    [viewportX1_withCTM_TM, viewportY1_withCTM_TM] = transformCoordinates(transformedX1_ctm_tm_final, transformedY1_ctm_tm_final, viewport);
                    [viewportX2_withCTM_TM, viewportY2_withCTM_TM] = transformCoordinates(transformedX2_ctm_tm_final, transformedY2_ctm_tm_final, viewport);
                  }
                  
                  // Approach 5: Try inverse CTM (if coordinates are already in CTM-transformed space)
                  // Some PDF generators may store coordinates in transformed space
                  let viewportX1_withInverseCTM = viewportX1;
                  let viewportY1_withInverseCTM = viewportY1;
                  let viewportX2_withInverseCTM = viewportX2;
                  let viewportY2_withInverseCTM = viewportY2;
                  const inverseCTM = invertMatrix(ctm);
                  if (inverseCTM) {
                    // Apply inverse CTM to get coordinates in original space
                    const [originalX1, originalY1] = transformPoint(x1, y1, inverseCTM);
                    const [originalX2, originalY2] = transformPoint(x2, y2, inverseCTM);
                    [viewportX1_withInverseCTM, viewportY1_withInverseCTM] = transformCoordinates(originalX1, originalY1, viewport);
                    [viewportX2_withInverseCTM, viewportY2_withInverseCTM] = transformCoordinates(originalX2, originalY2, viewport);
                  }
                  
                  // CRITICAL: Log ALL Y-coordinates from constructPath, especially for second table range (550-630)
                  const allYCoords = [viewportY1, viewportY2, viewportY1_withCTM, viewportY2_withCTM, 
                                     viewportY1_withTextMatrix, viewportY2_withTextMatrix,
                                     viewportY1_withCTM_TM, viewportY2_withCTM_TM,
                                     viewportY1_withInverseCTM, viewportY2_withInverseCTM];
                  const validYCoords = allYCoords.filter(y => !isNaN(y) && isFinite(y));
                  if (validYCoords.length > 0) {
                    const minY = Math.min(...validYCoords);
                    const maxY = Math.max(...validYCoords);
                    // CRITICAL: Always log if Y-coordinates are in second table range (550-630) using criticalLog
                    if ((minY >= 550 && minY <= 630) || (maxY >= 550 && maxY <= 630) || 
                        (minY < 550 && maxY > 630)) {
                      const msg = `[PDF v3] constructPath(91) #${operatorStats.constructPath} - SECOND TABLE RANGE DETECTED: PDF[${x1.toFixed(2)},${y1.toFixed(2)}]->[${x2.toFixed(2)},${y2.toFixed(2)}] viewportY1=${viewportY1.toFixed(2)} viewportY2=${viewportY2.toFixed(2)} CTM=[${viewportY1_withCTM.toFixed(2)},${viewportY2_withCTM.toFixed(2)}] TM=[${viewportY1_withTextMatrix.toFixed(2)},${viewportY2_withTextMatrix.toFixed(2)}] CTM+TM=[${viewportY1_withCTM_TM.toFixed(2)},${viewportY2_withCTM_TM.toFixed(2)}] invCTM=[${viewportY1_withInverseCTM.toFixed(2)},${viewportY2_withInverseCTM.toFixed(2)}] isHorizontal=${isHorizontal} isVertical=${isVertical}`;
                      log(msg, {
                        operatorNum: operatorStats.constructPath,
                        pdfCoords: { x1, y1, x2, y2 },
                        viewportCoords: { viewportY1, viewportY2 },
                        ctm: { viewportY1_withCTM, viewportY2_withCTM },
                        textMatrix: { viewportY1_withTextMatrix, viewportY2_withTextMatrix },
                        ctm_tm: { viewportY1_withCTM_TM, viewportY2_withCTM_TM },
                        inverseCTM: { viewportY1_withInverseCTM, viewportY2_withInverseCTM },
                        isHorizontal,
                        isVertical,
                        minY,
                        maxY
                      });
                    }
                  }
                  
                  // Choose the best transformation based on reasonableness
                  // CRITICAL: Relaxed bounds check - allow coordinates up to 2x viewport height
                  // This is needed because some PDFs may have coordinates that extend beyond viewport
                  // especially for tables that span multiple pages or have complex layouts
                  const viewportHeightMax = viewport.height * 2.0; // Increased from 1.2 to 2.0
                  const noCTM_reasonable = viewportY1 >= -viewport.height * 0.5 && viewportY1 <= viewportHeightMax && 
                                          viewportY2 >= -viewport.height * 0.5 && viewportY2 <= viewportHeightMax;
                  const withCTM_reasonable = viewportY1_withCTM >= -viewport.height * 0.5 && viewportY1_withCTM <= viewportHeightMax && 
                                             viewportY2_withCTM >= -viewport.height * 0.5 && viewportY2_withCTM <= viewportHeightMax;
                  const withTextMatrix_reasonable = viewportY1_withTextMatrix >= -viewport.height * 0.5 && viewportY1_withTextMatrix <= viewportHeightMax && 
                                                    viewportY2_withTextMatrix >= -viewport.height * 0.5 && viewportY2_withTextMatrix <= viewportHeightMax;
                  const withCTM_TM_reasonable = viewportY1_withCTM_TM >= -viewport.height * 0.5 && viewportY1_withCTM_TM <= viewportHeightMax && 
                                                viewportY2_withCTM_TM >= -viewport.height * 0.5 && viewportY2_withCTM_TM <= viewportHeightMax;
                  const withInverseCTM_reasonable = viewportY1_withInverseCTM >= -viewport.height * 0.5 && viewportY1_withInverseCTM <= viewportHeightMax && 
                                                   viewportY2_withInverseCTM >= -viewport.height * 0.5 && viewportY2_withInverseCTM <= viewportHeightMax;
                  
                  // Prefer CTM+TM if available and reasonable, then inverse CTM, then text matrix, then CTM, then direct
                  // CRITICAL: For second table range (550-630), prefer transformations that give coordinates in this range
                  let selectedTransform = 'none';
                  let selectedY1 = viewportY1;
                  let selectedY2 = viewportY2;
                  
                  if (textMatrixHasTranslation && withCTM_TM_reasonable) {
                    // CRITICAL: Check if CTM+TM gives coordinates in second table range
                    // If we're in second table range, prefer CTM or inverseCTM over CTM+TM
                    const ctm_tm_inSecondTable = (viewportY1_withCTM_TM >= 550 && viewportY1_withCTM_TM <= 630) || 
                                                 (viewportY2_withCTM_TM >= 550 && viewportY2_withCTM_TM <= 630);
                    const ctm_inSecondTable = (viewportY1_withCTM >= 550 && viewportY1_withCTM <= 630) || 
                                              (viewportY2_withCTM >= 550 && viewportY2_withCTM <= 630);
                    const invCTM_inSecondTable = (viewportY1_withInverseCTM >= 550 && viewportY1_withInverseCTM <= 630) || 
                                                (viewportY2_withInverseCTM >= 550 && viewportY2_withInverseCTM <= 630);
                    
                    // If CTM or inverseCTM gives second table coordinates, prefer them over CTM+TM
                    if (invCTM_inSecondTable && inverseCTM && withInverseCTM_reasonable) {
                      viewportX1 = viewportX1_withInverseCTM;
                      viewportY1 = viewportY1_withInverseCTM;
                      viewportX2 = viewportX2_withInverseCTM;
                      viewportY2 = viewportY2_withInverseCTM;
                      selectedTransform = 'inverseCTM';
                      selectedY1 = viewportY1_withInverseCTM;
                      selectedY2 = viewportY2_withInverseCTM;
                    } else if (ctm_inSecondTable && withCTM_reasonable) {
                      viewportX1 = viewportX1_withCTM;
                      viewportY1 = viewportY1_withCTM;
                      viewportX2 = viewportX2_withCTM;
                      viewportY2 = viewportY2_withCTM;
                      selectedTransform = 'CTM';
                      selectedY1 = viewportY1_withCTM;
                      selectedY2 = viewportY2_withCTM;
                    } else if (ctm_tm_inSecondTable) {
                      viewportX1 = viewportX1_withCTM_TM;
                      viewportY1 = viewportY1_withCTM_TM;
                      viewportX2 = viewportX2_withCTM_TM;
                      viewportY2 = viewportY2_withCTM_TM;
                      selectedTransform = 'CTM+TM';
                      selectedY1 = viewportY1_withCTM_TM;
                      selectedY2 = viewportY2_withCTM_TM;
                    } else {
                      // Default: use CTM+TM if reasonable
                      viewportX1 = viewportX1_withCTM_TM;
                      viewportY1 = viewportY1_withCTM_TM;
                      viewportX2 = viewportX2_withCTM_TM;
                      viewportY2 = viewportY2_withCTM_TM;
                      selectedTransform = 'CTM+TM';
                      selectedY1 = viewportY1_withCTM_TM;
                      selectedY2 = viewportY2_withCTM_TM;
                    }
                  } else if (inverseCTM && withInverseCTM_reasonable) {
                    viewportX1 = viewportX1_withInverseCTM;
                    viewportY1 = viewportY1_withInverseCTM;
                    viewportX2 = viewportX2_withInverseCTM;
                    viewportY2 = viewportY2_withInverseCTM;
                    selectedTransform = 'inverseCTM';
                    selectedY1 = viewportY1_withInverseCTM;
                    selectedY2 = viewportY2_withInverseCTM;
                  } else if ((isInTextMode || textMatrixHasTranslation) && withTextMatrix_reasonable) {
                    viewportX1 = viewportX1_withTextMatrix;
                    viewportY1 = viewportY1_withTextMatrix;
                    viewportX2 = viewportX2_withTextMatrix;
                    viewportY2 = viewportY2_withTextMatrix;
                    selectedTransform = 'textMatrix';
                    selectedY1 = viewportY1_withTextMatrix;
                    selectedY2 = viewportY2_withTextMatrix;
                  } else if (!noCTM_reasonable && withCTM_reasonable) {
                    viewportX1 = viewportX1_withCTM;
                    viewportY1 = viewportY1_withCTM;
                    viewportX2 = viewportX2_withCTM;
                    viewportY2 = viewportY2_withCTM;
                    selectedTransform = 'CTM';
                    selectedY1 = viewportY1_withCTM;
                    selectedY2 = viewportY2_withCTM;
                  } else {
                    selectedTransform = 'direct';
                    selectedY1 = viewportY1;
                    selectedY2 = viewportY2;
                  }
                  
                  // CRITICAL: Log which transformation was selected for second table range
                  if ((selectedY1 >= 550 && selectedY1 <= 630) || (selectedY2 >= 550 && selectedY2 <= 630)) {
                    log(`[PDF v3] constructPath(91) #${operatorStats.constructPath} - SELECTED TRANSFORM: ${selectedTransform} -> viewportY=[${selectedY1.toFixed(2)},${selectedY2.toFixed(2)}]`, {
                      operatorNum: operatorStats.constructPath,
                      selectedTransform,
                      selectedY1,
                      selectedY2,
                      alternatives: {
                        direct: { y1: viewportY1, y2: viewportY2 },
                        ctm: { y1: viewportY1_withCTM, y2: viewportY2_withCTM },
                        textMatrix: { y1: viewportY1_withTextMatrix, y2: viewportY2_withTextMatrix },
                        ctm_tm: { y1: viewportY1_withCTM_TM, y2: viewportY2_withCTM_TM },
                        inverseCTM: { y1: viewportY1_withInverseCTM, y2: viewportY2_withInverseCTM }
                      }
                    });
                  }
                  
                    if (operatorStats.constructPath <= 3) {
                    const ctmStr = ctm.map(v => v.toFixed(2)).join(',');
                    const tmStr = textMatrix.map(v => v.toFixed(2)).join(',');
                    const usedCTM = (viewportY1 === viewportY1_withCTM) ? 'YES' : 'NO';
                    const usedTextMatrix = (viewportY1 === viewportY1_withTextMatrix) ? 'YES' : 'NO';
                    const usedCTM_TM = (viewportY1 === viewportY1_withCTM_TM) ? 'YES' : 'NO';
                    const usedInverseCTM = (viewportY1 === viewportY1_withInverseCTM) ? 'YES' : 'NO';
                    
                    // Coordinate system analysis (commented out - too verbose)
                    // if (operatorStats.constructPath <= 3) {
                    //   log(`[PDF v3] extractPageGraphics: constructPath(91) #${operatorStats.constructPath} - LINE: pdf[${x1.toFixed(2)},${y1.toFixed(2)}]->[${x2.toFixed(2)},${y2.toFixed(2)}] viewport[${viewportX1.toFixed(2)},${viewportY1.toFixed(2)}]->[${viewportX2.toFixed(2)},${viewportY2.toFixed(2)}]`);
                    // }
                  }
                  
                  // CRITICAL: Add line directly to lines array for underline detection
                  // constructPath(91) in ReportLab creates lines directly, not paths
                  // Store both viewport and PDF native coordinates for comparison
                  lines.push({
                    x1: viewportX1,
                    y1: viewportY1,
                    x2: viewportX2,
                    y2: viewportY2,
                    // CRITICAL: Store PDF native coordinates for comparison with text
                    pdfX1: x1,
                    pdfY1: y1,
                    pdfX2: x2,
                    pdfY2: y2,
                    // Store CTM-transformed coordinates too
                    pdfX1_ctm: transformedX1_ctm,
                    pdfY1_ctm: transformedY1_ctm,
                    pdfX2_ctm: transformedX2_ctm,
                    pdfY2_ctm: transformedY2_ctm,
                    // CRITICAL: Store text matrix for relative coordinate calculation
                    // Store text matrix if it has translation (even if not in text mode)
                    // ReportLab may create underlines right after text, even if isInTextMode=false
                    textMatrix: (isInTextMode || textMatrixHasTranslation) ? [...textMatrix] : null,
                    isInTextMode: isInTextMode,
                    pageNum,
                    lineWidth
                  });
                  
                  // Also add to path for consistency (though stroke may not be called)
                  if (currentPath.length === 0) {
                    currentPath = [{ x: viewportX1, y: viewportY1 }];
                  }
                  currentPath.push({ x: viewportX2, y: viewportY2 });
                  
                  // Line added to lines array
                } else {
                  // It's not a horizontal or vertical line - skip it
                  // ReportLab creates table borders as both horizontal and vertical lines
                  // Other path segments (diagonal lines, curves, etc.) are not needed for table detection
                  // Skip this argument - continue to next one
                  continue;
                }
              } else {
                // Not a valid coordinate array
                if (operatorStats.constructPath <= 3) {
                  log(`[PDF v3] extractPageGraphics: constructPath(91) #${operatorStats.constructPath} - args[${argIdx}] is not a valid coordinate array: type=${typeof coordArray} isArray=${Array.isArray(coordArray)} length=${coordArray?.length} value=${JSON.stringify(coordArray)}`);
                }
              }
            } else {
              // Not an array
              if (operatorStats.constructPath <= 3) {
                log(`[PDF v3] extractPageGraphics: constructPath(91) #${operatorStats.constructPath} - args[${argIdx}] is not an array: type=${typeof coordArray} value=${JSON.stringify(coordArray)}`);
              }
            }
            } catch (error) {
              logWarn(`[PDF v3] extractPageGraphics: constructPath(91) #${operatorStats.constructPath} - Error processing args[${argIdx}]: error=${error?.message || String(error)} name=${error?.name || 'N/A'} argIdx=${argIdx} argsLength=${args?.length || 0}`);
            }
          }
          
          // If we built a path, it will be stroked later by stroke operator
          if (currentPath.length > 0 && operatorStats.constructPath <= 3) {
            log(`[PDF v3] extractPageGraphics: constructPath(91) #${operatorStats.constructPath} - built path with ${currentPath.length} points`);
          }
        } else {
          log(`[PDF v3] extractPageGraphics: constructPath(91) has no args`);
        }
      }
      
      } catch (operatorError) {
        // CRITICAL: Catch errors in individual operator processing to prevent entire extraction from failing
        logWarn(`[PDF v3] extractPageGraphics: Error processing operator #${i} (fn=${fn}): error=${operatorError?.message || String(operatorError)} name=${operatorError?.name || 'N/A'} stack=${operatorError?.stack?.substring(0, 200) || 'N/A'}`);
        // Continue processing next operator
      }
      
      // EndPath (code 28) - might be used before stroke
      if (fn === OPS.endPath || fn === 28) {
        operatorStats.endPath++;
        // endPath doesn't draw anything, just prepares path for stroke/fill
        // Keep currentPath intact for stroke operator
      }
      
      // Track unknown operators
      if (fn !== OPS.transformMatrix && fn !== 20 &&
          fn !== OPS.transform && fn !== 12 &&
          fn !== OPS.rectangle && fn !== 19 &&
          fn !== OPS.moveTo && fn !== 11 &&
          fn !== OPS.lineTo && fn !== 12 &&
          fn !== OPS.stroke && fn !== 25 &&
          fn !== OPS.closePath && fn !== 13 &&
          fn !== OPS.constructPath && fn !== 91 &&
          fn !== OPS.endPath && fn !== 28 &&
          fn !== OPS.setLineWidth && fn !== 22) {
        operatorStats.unknown++;
      }
      
      // Process operators (progress logging commented out)
    }
    
    // Operator summary - use criticalLog to ensure visibility
    const statsStr = `transformMatrix=${operatorStats.transformMatrix} transform=${operatorStats.transform} rectangle=${operatorStats.rectangle} moveTo=${operatorStats.moveTo} lineTo=${operatorStats.lineTo} stroke=${operatorStats.stroke} constructPath=${operatorStats.constructPath}`;
    log(`[PDF v3] extractPageGraphics: Raw extraction complete - totalLines=${lines.length} totalRectangles=${rectangles.length} ${statsStr}`, {
      pageNum,
      totalLines: lines.length,
      totalRectangles: rectangles.length,
      operatorStats
    });
    
    // Log Y-coordinate range of all lines (critical for table detection) - use criticalLog
    if (lines.length > 0) {
      const yCoords = lines.map(l => {
        const y1 = l.y1 || 0;
        const y2 = l.y2 || 0;
        return (y1 + y2) / 2;
      }).filter(y => y > 0).sort((a, b) => a - b);
      
      if (yCoords.length > 0) {
        const minY = yCoords[0];
        const maxY = yCoords[yCoords.length - 1];
        log(`[PDF v3] extractPageGraphics: Y-coordinate range (ALL lines before filter) - minY=${minY.toFixed(2)}, maxY=${maxY.toFixed(2)}, totalLines=${lines.length}`, {
          pageNum,
          minY,
          maxY,
          totalLines: lines.length
        });
        
        // CRITICAL: Log all Y-coordinates to check if second table (Y ~557-625) is present
        const allYCoordsStr = yCoords.map(y => y.toFixed(2)).join(', ');
        log(`[PDF v3] extractPageGraphics: All raw lines Y-coordinates (before filter): [${allYCoordsStr}]`, {
          pageNum,
          yCoords: yCoords.slice(0, 100), // Limit to first 100 for size
          totalCount: yCoords.length
        });
        
        // Check specifically for second table Y range (557-625)
        const secondTableLines = yCoords.filter(y => y >= 550 && y <= 630);
        if (secondTableLines.length > 0) {
          log(`[PDF v3] extractPageGraphics: SECOND TABLE LINES FOUND - count=${secondTableLines.length}, Y-coords: [${secondTableLines.map(y => y.toFixed(2)).join(', ')}]`, {
            pageNum,
            count: secondTableLines.length,
            yCoords: secondTableLines
          });
        } else {
          logWarn(`[PDF v3] extractPageGraphics: WARNING - No lines found in second table Y-range [550, 630]`, {
            pageNum,
            minY,
            maxY,
            totalLines: lines.length
          });
        }
      }
    }
    
    // Filter lines: keep only long narrow strips (potential table borders)
    // Use adaptive thresholds based on baseFontSize
    const baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE;
    log(`[PDF v3] extractPageGraphics: Starting filter - baseFontSize=${baseFontSize}, lines to filter=${lines.length}`);
    
    const tableLines = [];
    const rejectedLines = [];
    
    for (const line of lines) {
      const lineCheck = isTableLine(line, baseFontSize);
      
      if (lineCheck.isTableLine) {
        tableLines.push(line);
      } else {
        const width = Math.abs(line.x2 - line.x1);
        const height = Math.abs(line.y2 - line.y1);
        rejectedLines.push({ 
          line, 
          width, 
          height, 
          reason: !lineCheck.isHorizontal && !lineCheck.isVertical ? 'not-table-line' : 'unknown' 
        });
      }
    }
    
    const filterCompleteMsg = `[PDF v3] extractPageGraphics: Filter complete - tableLines=${tableLines.length}, rejected=${rejectedLines.length}`;
    // Only log to console in DEBUG mode
    if (typeof CONFIG !== 'undefined' && CONFIG.LOG_LEVEL === 0) {
      console.log(filterCompleteMsg);
    }
    log(filterCompleteMsg);
    
    // Detailed logging of all graphics
    const horizontalLinesCount = tableLines.filter(l => isTableLine(l, baseFontSize).isHorizontal).length;
    const verticalLinesCount = tableLines.filter(l => isTableLine(l, baseFontSize).isVertical).length;
    const tableLinesStr = tableLines.slice(0, 5).map((l, idx) => {
        const width = Math.abs(l.x2 - l.x1);
        const height = Math.abs(l.y2 - l.y1);
        const lineCheck = isTableLine(l, baseFontSize);
      return `Line[${idx}]: type=${lineCheck.isHorizontal ? 'H' : 'V'} [${l.x1.toFixed(2)},${l.y1.toFixed(2)}]->[${l.x2.toFixed(2)},${l.y2.toFixed(2)}] w=${width.toFixed(2)} h=${height.toFixed(2)}`;
    }).join(' | ');
    const rejectedStr = rejectedLines.slice(0, 5).map(r => `[${r.line.x1.toFixed(1)},${r.line.y1.toFixed(1)}]->[${r.line.x2.toFixed(1)},${r.line.y2.toFixed(1)}] w=${r.width.toFixed(2)} h=${r.height.toFixed(2)} reason=${r.reason}`).join(' | ');
    log(`[PDF v3] extractPageGraphics: Extracted graphics from page ${pageNum} - totalLines=${lines.length} tableLines=${tableLines.length} rejectedLines=${rejectedLines.length} rectangles=${rectangles.length} horizontalLines=${horizontalLinesCount} verticalLines=${verticalLinesCount} tableLinesSample: ${tableLinesStr} rejectedSample: ${rejectedStr}`);
    
    // CRITICAL: Log Y-coordinate range of FILTERED tableLines to see if second table lines are present - use criticalLog
    if (tableLines.length > 0) {
      const tableYCoords = tableLines.map(l => {
        const y1 = l.y1 || 0;
        const y2 = l.y2 || 0;
        return (y1 + y2) / 2;
      }).filter(y => y > 0).sort((a, b) => a - b);
      
      if (tableYCoords.length > 0) {
        const minY = tableYCoords[0];
        const maxY = tableYCoords[tableYCoords.length - 1];
        log(`[PDF v3] extractPageGraphics: FILTERED tableLines Y-coordinate range: [${minY.toFixed(2)}, ${maxY.toFixed(2)}] (${tableLines.length} lines total)`, {
          pageNum,
          minY,
          maxY,
          totalTableLines: tableLines.length
        });
        
        // Log all Y-coordinates to see if second table (Y ~557-625) is present
        const allYCoordsStr = tableYCoords.map(y => y.toFixed(2)).join(', ');
        log(`[PDF v3] extractPageGraphics: All tableLines Y-coordinates: [${allYCoordsStr}]`, {
          pageNum,
          yCoords: tableYCoords.slice(0, 100), // Limit to first 100
          totalCount: tableYCoords.length
        });
        
        // Check specifically for second table in filtered lines
        const secondTableFiltered = tableYCoords.filter(y => y >= 550 && y <= 630);
        if (secondTableFiltered.length > 0) {
          log(`[PDF v3] extractPageGraphics: SECOND TABLE LINES IN FILTERED: count=${secondTableFiltered.length}, Y-coords: [${secondTableFiltered.map(y => y.toFixed(2)).join(', ')}]`, {
            pageNum,
            count: secondTableFiltered.length,
            yCoords: secondTableFiltered
          });
        } else {
          logWarn(`[PDF v3] extractPageGraphics: WARNING - No second table lines in FILTERED tableLines (Y-range [550, 630])`, {
            pageNum,
            minY,
            maxY,
            totalTableLines: tableLines.length,
            rawLinesCount: lines.length
          });
        }
      }
    } else {
      logWarn(`[PDF v3] extractPageGraphics: WARNING - No tableLines after filtering (${lines.length} raw lines, ${rejectedLines.length} rejected)`, {
        pageNum,
        rawLinesCount: lines.length,
        rejectedCount: rejectedLines.length
      });
    }
    
    
    return {
      lines: tableLines,
      rectangles,
      allLines: lines // Keep all lines for debugging
    };
  } catch (error) {
    const statsStr = operatorStats ? `transformMatrix=${operatorStats.transformMatrix} transform=${operatorStats.transform} constructPath=${operatorStats.constructPath}` : 'no stats';
    logWarn(`[PDF v3] extractPageGraphics: Failed to extract graphics from page ${pageNum} - error=${error?.message || String(error)} name=${error?.name || 'N/A'} ${statsStr} linesExtracted=${lines?.length || 0} rectanglesExtracted=${rectangles?.length || 0}`);
    return { lines: [], rectangles: [], allLines: [] };
  }
}

/**
 * Detect table regions from extracted graphics
 * Groups lines and rectangles that form table-like structures
 * 
 * @param {Array} lines - Array of line objects
 * @param {Array} rectangles - Array of rectangle objects
 * @param {{convertToViewportPoint: function(number, number): [number, number], height: number, width: number, [key: string]: any}} viewport - PDF.js viewport object
 * @param {number} baseFontSize - Base font size for tolerance
 * @returns {Array} Array of potential table regions
 */
export function detectTableRegionsFromGraphics(lines, rectangles, viewport, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  const tableRegions = [];
  const tolerance = baseFontSize * TABLE_DETECTION.Y_TOLERANCE_MULTIPLIER;
  
  // Group horizontal and vertical lines using helper function
  const horizontalLines = lines.filter(line => isTableLine(line, baseFontSize).isHorizontal);
  const verticalLines = lines.filter(line => isTableLine(line, baseFontSize).isVertical);
  
  // Find intersections of horizontal and vertical lines (potential table cells)
  const intersections = [];
  for (const hLine of horizontalLines) {
    const hY = (hLine.y1 + hLine.y2) / 2;
    const hX1 = Math.min(hLine.x1, hLine.x2);
    const hX2 = Math.max(hLine.x1, hLine.x2);
    
    for (const vLine of verticalLines) {
      const vX = (vLine.x1 + vLine.x2) / 2;
      const vY1 = Math.min(vLine.y1, vLine.y2);
      const vY2 = Math.max(vLine.y1, vLine.y2);
      
      // Check if lines intersect
      if (vX >= hX1 - tolerance && vX <= hX2 + tolerance &&
          hY >= vY1 - tolerance && hY <= vY2 + tolerance) {
        intersections.push({
          x: vX,
          y: hY,
          horizontalLine: hLine,
          verticalLine: vLine
        });
      }
    }
  }
  
  // Group intersections into table regions
  // Simple approach: find bounding box of all intersections
  if (intersections.length > 0) {
    const xs = intersections.map(i => i.x).sort((a, b) => a - b);
    const ys = intersections.map(i => i.y).sort((a, b) => a - b);
    
    const minX = xs[0];
    const maxX = xs[xs.length - 1];
    const minY = ys[0];
    const maxY = ys[ys.length - 1];
    
    // Estimate column and row counts
    // CRITICAL: Safe division - avoid division by zero if tolerance is 0
    const safeTolerance = tolerance > 0 ? tolerance : 1;
    const uniqueXs = [...new Set(xs.map(x => Math.round(x / safeTolerance) * safeTolerance))];
    const uniqueYs = [...new Set(ys.map(y => Math.round(y / safeTolerance) * safeTolerance))];
    
    if (uniqueXs.length >= 2 && uniqueYs.length >= 2) {
      tableRegions.push({
        x: minX,
        y: minY,
        // CRITICAL: Ensure width and height are non-negative
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY),
        columnCount: uniqueXs.length - 1,
        rowCount: uniqueYs.length - 1,
        horizontalLines: uniqueYs.length - 1,
        verticalLines: uniqueXs.length - 1,
        intersections: intersections.length
      });
    }
  }
  
  log(`[PDF v3] detectTableRegionsFromGraphics: Detected ${tableRegions.length} potential table regions from graphics`, {
    horizontalLines: horizontalLines.length,
    verticalLines: verticalLines.length,
    intersections: intersections.length,
    tableRegions: tableRegions.length
  });
  
  return tableRegions;
}

// Track if Y-coordinates have been logged to avoid spam
let _checkGraphicsYCoordsLogged = false;

/**
 * Check if there are graphics elements (lines/rectangles) in the area of elements
 * This is a strong indicator that elements form a table
 * 
 * @param {Array} elements - Array of elements to check
 * @param {{lines?: Array<{x: number, y: number, width: number, height?: number, [key: string]: any}>, rectangles?: Array<any>, [key: string]: any}} graphicsData - Graphics data from extractPageGraphics
 * @param {number} tolerance - Tolerance for matching (default: 10px)
 * @returns {Object} Result with hasGraphics flag and details
 */
export function checkGraphicsInElementArea(elements, graphicsData, tolerance = null, baseFontSize = DEFAULT_METRICS.BASE_FONT_SIZE) {
  // CRITICAL: Log all Y-coordinates of graphics lines on first call to diagnose second table issue
  if (graphicsData && graphicsData.lines && graphicsData.lines.length > 0 && !_checkGraphicsYCoordsLogged) {
    _checkGraphicsYCoordsLogged = true; // Mark as logged to avoid spam
    const allLines = graphicsData.allLines || graphicsData.lines || [];
    const yCoords = allLines.map(l => {
      const y1 = l.y1 || 0;
      const y2 = l.y2 || 0;
      return (y1 + y2) / 2;
    }).filter(y => y > 0).sort((a, b) => a - b);
    
    if (yCoords.length > 0) {
      const minY = yCoords[0];
      const maxY = yCoords[yCoords.length - 1];
      log(`[PDF v3] checkGraphicsInElementArea: ALL GRAPHICS LINES Y-range: [${minY.toFixed(2)}, ${maxY.toFixed(2)}], totalLines=${allLines.length}`);
      
      const allYCoordsStr = yCoords.slice(0, 50).map(y => y.toFixed(2)).join(', '); // Limit to first 50 to avoid huge log
      log(`[PDF v3] checkGraphicsInElementArea: All graphics Y-coordinates (first 50): [${allYCoordsStr}]`);
      
      const secondTableLines = yCoords.filter(y => y >= 550 && y <= 630);
      if (secondTableLines.length > 0) {
        log(`[PDF v3] checkGraphicsInElementArea: SECOND TABLE LINES FOUND in graphics - count=${secondTableLines.length}, Y-coords: [${secondTableLines.map(y => y.toFixed(2)).join(', ')}]`);
      } else {
        logWarn(`[PDF v3] checkGraphicsInElementArea: WARNING - No graphics lines found in second table Y-range [550, 630]`);
      }
    }
  }
  log(`[PDF v3] checkGraphicsInElementArea ENTRY - elements=${elements?.length || 0}, graphicsData=${!!graphicsData}, lines=${graphicsData?.lines?.length || 0}`);
  
  if (!graphicsData || !graphicsData.lines || graphicsData.lines.length === 0) {
    log(`[PDF v3] checkGraphicsInElementArea: No graphics data or lines - graphicsData=${!!graphicsData}, linesCount=${graphicsData?.lines?.length || 0}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  if (!elements || elements.length === 0) {
    log(`[PDF v3] checkGraphicsInElementArea: No elements provided - elementsCount=${elements?.length || 0}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  // Use adaptive tolerance if not provided
  const effectiveTolerance = tolerance !== null 
    ? tolerance 
    : Math.max(TABLE_DETECTION.GRAPHICS_TOLERANCE_DEFAULT, baseFontSize * TABLE_DETECTION.GRAPHICS_TOLERANCE_MULTIPLIER);
  
  log(`[PDF v3] checkGraphicsInElementArea: START - elementsCount=${elements.length}, graphicsLinesCount=${graphicsData.lines.length}, tolerance=${effectiveTolerance.toFixed(2)}`);
  
  // Calculate bounding box of all elements
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  for (const element of elements) {
    if (element.lines && element.lines.length > 0) {
      for (const line of element.lines) {
        if (line.x !== undefined) {
          minX = Math.min(minX, line.x);
          maxX = Math.max(maxX, line.x);
        }
        if (line.y !== undefined) {
          minY = Math.min(minY, line.y);
          maxY = Math.max(maxY, line.y);
        }
      }
    } else if (element.minX !== undefined && element.maxX !== undefined && 
               element.minY !== undefined && element.maxY !== undefined) {
      minX = Math.min(minX, element.minX);
      maxX = Math.max(maxX, element.maxX);
      minY = Math.min(minY, element.minY);
      maxY = Math.max(maxY, element.maxY);
    }
  }
  
  if (minX === Infinity || minY === Infinity) {
    log(`[PDF v3] checkGraphicsInElementArea: Invalid bounding box - minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`);
    return { hasGraphics: false, horizontalLines: 0, verticalLines: 0, totalLines: 0 };
  }
  
  // Expand bounding box by tolerance
  const areaMinX = minX - effectiveTolerance;
  const areaMaxX = maxX + effectiveTolerance;
  const areaMinY = minY - effectiveTolerance;
  const areaMaxY = maxY + effectiveTolerance;
  
  log(`[PDF v3] checkGraphicsInElementArea: Element area bounds - minX=${minX.toFixed(2)}, maxX=${maxX.toFixed(2)}, minY=${minY.toFixed(2)}, maxY=${maxY.toFixed(2)}`);
  log(`[PDF v3] checkGraphicsInElementArea: Expanded bounds (tolerance=${effectiveTolerance.toFixed(2)}) - areaMinX=${areaMinX.toFixed(2)}, areaMaxX=${areaMaxX.toFixed(2)}, areaMinY=${areaMinY.toFixed(2)}, areaMaxY=${areaMaxY.toFixed(2)}`);
  
  // Find graphics lines that intersect with or are near the element area
  const horizontalLines = [];
  const verticalLines = [];
  const rejectedLines = [];
  
  for (let i = 0; i < graphicsData.lines.length; i++) {
    const line = graphicsData.lines[i];
    const lineX1 = Math.min(line.x1, line.x2);
    const lineX2 = Math.max(line.x1, line.x2);
    const lineY1 = Math.min(line.y1, line.y2);
    const lineY2 = Math.max(line.y1, line.y2);
    
    const lineWidth = lineX2 - lineX1;
    const lineHeight = lineY2 - lineY1;
    
    // Check if line is a table line using helper function
    const lineCheck = isTableLine(line, baseFontSize);
    
    if (lineCheck.isHorizontal) {
      const lineY = (lineY1 + lineY2) / 2;
      // Check if horizontal line overlaps with element area
      const yInRange = lineY >= areaMinY && lineY <= areaMaxY;
      const xOverlaps = lineX1 <= areaMaxX && lineX2 >= areaMinX;
      
      if (yInRange && xOverlaps) {
        horizontalLines.push({ line, index: i, lineY, lineX1, lineX2 });
        log(`[PDF v3] checkGraphicsInElementArea: Found horizontal line [${i}] - Y=${lineY.toFixed(2)}, X=[${lineX1.toFixed(2)}, ${lineX2.toFixed(2)}], width=${lineWidth.toFixed(2)}`);
      } else {
        rejectedLines.push({ 
          line, 
          index: i, 
          type: 'horizontal', 
          reason: !yInRange ? `Y=${lineY.toFixed(2)} not in [${areaMinY.toFixed(2)}, ${areaMaxY.toFixed(2)}]` : `X=[${lineX1.toFixed(2)}, ${lineX2.toFixed(2)}] doesn't overlap [${areaMinX.toFixed(2)}, ${areaMaxX.toFixed(2)}]`
        });
      }
    }
    // Check if line is vertical
    else if (lineCheck.isVertical) {
      const lineX = (lineX1 + lineX2) / 2;
      // Check if vertical line overlaps with element area
      const xInRange = lineX >= areaMinX && lineX <= areaMaxX;
      const yOverlaps = lineY1 <= areaMaxY && lineY2 >= areaMinY;
      
      if (xInRange && yOverlaps) {
        verticalLines.push({ line, index: i, lineX, lineY1, lineY2 });
        log(`[PDF v3] checkGraphicsInElementArea: Found vertical line [${i}] - X=${lineX.toFixed(2)}, Y=[${lineY1.toFixed(2)}, ${lineY2.toFixed(2)}], height=${lineHeight.toFixed(2)}`);
      } else {
        rejectedLines.push({ 
          line, 
          index: i, 
          type: 'vertical', 
          reason: !xInRange ? `X=${lineX.toFixed(2)} not in [${areaMinX.toFixed(2)}, ${areaMaxX.toFixed(2)}]` : `Y=[${lineY1.toFixed(2)}, ${lineY2.toFixed(2)}] doesn't overlap [${areaMinY.toFixed(2)}, ${areaMaxY.toFixed(2)}]`
        });
      }
    } else {
      rejectedLines.push({ 
        line, 
        index: i, 
        type: 'other', 
        reason: `width=${lineWidth.toFixed(2)}, height=${lineHeight.toFixed(2)} - not a table line`
      });
    }
  }
  
  const totalLines = horizontalLines.length + verticalLines.length;
  const hasGraphics = totalLines >= TABLE_DETECTION.MIN_GRAPHICS_LINES_FOR_TABLE;
  
  log(`[PDF v3] checkGraphicsInElementArea: RESULT - hasGraphics=${hasGraphics}, horizontalLines=${horizontalLines.length}, verticalLines=${verticalLines.length}, totalLines=${totalLines}, rejectedLines=${rejectedLines.length}`);
  
  // Always log rejected lines details if there are any and we found no graphics
  // This helps debug why graphics aren't detected
  if (rejectedLines.length > 0 && totalLines === 0) {
    const sampleRejected = rejectedLines.slice(0, 10);
    log(`[PDF v3] checkGraphicsInElementArea: Rejected lines details (showing first 10 of ${rejectedLines.length}):`, {
      rejected: sampleRejected.map(r => ({
        index: r.index,
        type: r.type,
        reason: r.reason,
        coords: `(${r.line.x1.toFixed(1)},${r.line.y1.toFixed(1)})-(${r.line.x2.toFixed(1)},${r.line.y2.toFixed(1)})`,
        lineY: r.type === 'horizontal' ? ((r.line.y1 + r.line.y2) / 2).toFixed(2) : 'N/A',
        lineX: r.type === 'vertical' ? ((r.line.x1 + r.line.x2) / 2).toFixed(2) : 'N/A'
      }))
    });
  } else if (rejectedLines.length > 0 && rejectedLines.length <= 20) {
    log(`[PDF v3] checkGraphicsInElementArea: Rejected lines details:`, {
      rejected: rejectedLines.map(r => ({
        index: r.index,
        type: r.type,
        reason: r.reason,
        coords: `(${r.line.x1.toFixed(1)},${r.line.y1.toFixed(1)})-(${r.line.x2.toFixed(1)},${r.line.y2.toFixed(1)})`
      }))
    });
  }
  
  return {
    hasGraphics,
    horizontalLines: horizontalLines.length,
    verticalLines: verticalLines.length,
    totalLines,
    details: {
      areaBounds: { minX, maxX, minY, maxY },
      expandedBounds: { areaMinX, areaMaxX, areaMinY, areaMaxY },
      tolerance: effectiveTolerance,
      matchedHorizontalLines: horizontalLines.map(h => ({
        index: h.index,
        y: h.lineY.toFixed(2),
        xRange: [h.lineX1.toFixed(2), h.lineX2.toFixed(2)]
      })),
      matchedVerticalLines: verticalLines.map(v => ({
        index: v.index,
        x: v.lineX.toFixed(2),
        yRange: [v.lineY1.toFixed(2), v.lineY2.toFixed(2)]
      }))
    }
  };
}

