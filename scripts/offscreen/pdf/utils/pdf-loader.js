/**
 * PDF.js 2.6.347 loader (loaded via <script> tag in offscreen.html)
 * PDF.js 2.6.347 does NOT support ES6 import() - must use <script> tag
 * PDF.js 2.6.347 exports as window.pdfjsLib (primary) or window.PDFJS (legacy)
 * Waits for __PDF_READY__ flag to ensure PDF.js is initialized before bundle uses it
 * @version 2.6-script-tag-with-wait
 * @date 2026-01-01
 */

// @ts-check
// PDF.js library loader utility

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logError, logWarn } from '../../../utils/logging.js';

// Import criticalLog dynamically to avoid circular dependencies
let criticalLog = null;
async function getCriticalLog() {
  if (!criticalLog) {
    const logging = await import('../../../utils/logging.js');
    criticalLog = logging.criticalLog;
  }
  return criticalLog;
}

let pdfJsLoaded = false;

/**
 * Check if PDF.js 2.6.347 is loaded (via <script> tag in offscreen.html)
 * Waits for __PDF_READY__ flag to ensure PDF.js is initialized
 * NO dynamic import - PDF.js should already be in window.pdfjsLib or window.PDFJS
 * @returns {Promise<Object>} PDF.js library instance
 */
export async function loadPdfJs() {
  if (pdfJsLoaded) {
    log('[PDF v2.6] PDF.js already loaded');
    /** @type {any} */
    const selfAny = typeof self !== 'undefined' ? self : null;
    return selfAny?.pdfjsLib || selfAny?.PDFJS;
  }

  try {
    log('[PDF v2.6] Checking for PDF.js in global object...');
    let criticalLogFn = await getCriticalLog();
    
    // CRITICAL: Wait for PDF.js to be ready (bundle may execute before PDF.js loads)
    /** @type {any} */
    const windowAny = typeof window !== 'undefined' ? window : null;
    /** @type {any} */
    const selfAny = typeof self !== 'undefined' ? self : null;
    let pdfReady = (windowAny?.__PDF_READY__) || (selfAny?.__PDF_READY__);
    
    if (!pdfReady) {
      log('[PDF v2.6] PDF.js not ready yet, waiting for __PDF_READY__ flag...');
      criticalLogFn('[PDF v2.6] Waiting for PDF.js initialization', 'PDF_WAITING_FOR_READY', {
        timestamp: Date.now(),
        hasWindow: typeof window !== 'undefined',
        hasSelf: typeof self !== 'undefined',
        windowPDFReady: windowAny?.__PDF_READY__ || false,
        selfPDFReady: selfAny?.__PDF_READY__ || false
      });
      
      // Wait for __PDF_READY__ flag (max 10 seconds)
      const maxWait = 10000; // 10 seconds
      const checkInterval = 100; // Check every 100ms
      const startTime = Date.now();
      
      while (!pdfReady && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
        // Update pdfReady on each iteration
        pdfReady = (windowAny?.__PDF_READY__) || (selfAny?.__PDF_READY__);
        if (pdfReady) {
          log('[PDF v2.6] PDF.js ready flag detected!');
          break;
        }
      }
      
      if (!pdfReady && (Date.now() - startTime) >= maxWait) {
        logWarn('[PDF v2.6] Timeout waiting for __PDF_READY__ flag, proceeding anyway...');
      }
    }
    
    criticalLogFn('[PDF v2.6] Checking for PDF.js in window object', 'PDF_CHECK_GLOBAL', {
      timestamp: Date.now(),
      hasPDFJS: typeof windowAny?.PDFJS !== 'undefined',
      hasWindowPdfjsLib: typeof windowAny?.pdfjsLib !== 'undefined',
      hasSelfPDFJS: typeof selfAny?.PDFJS !== 'undefined',
      hasSelfPdfjsLib: typeof selfAny?.pdfjsLib !== 'undefined',
      pdfReady: pdfReady || windowAny?.__PDF_READY__ || selfAny?.__PDF_READY__ || false
    });

    // Check if PDF.js was loaded via <script> tag in offscreen.html
    // PDF.js 2.6.347 exports as window.pdfjsLib (not window.PDFJS)
    const PDFJS = windowAny?.pdfjsLib || 
                  windowAny?.PDFJS ||
                  selfAny?.pdfjsLib ||
                  selfAny?.PDFJS;

    if (!PDFJS) {
      const error = new Error('PDF.js not found in window object. Make sure PDF.js is loaded via <script> tag in offscreen.html BEFORE module scripts.');
      criticalLogFn('[PDF v2.6] ERROR: PDF.js not found', 'PDF_NOT_FOUND', {
        error: error.message,
        hasWindow: typeof window !== 'undefined',
        hasSelf: typeof self !== 'undefined',
        windowKeys: typeof window !== 'undefined' ? Object.keys(window).filter(k => k.includes('pdf') || k.includes('PDF')).slice(0, 10) : [],
        selfKeys: typeof self !== 'undefined' ? Object.keys(self).filter(k => k.includes('pdf') || k.includes('PDF')).slice(0, 10) : [],
        pdfReady: pdfReady || windowAny?.__PDF_READY__ || selfAny?.__PDF_READY__ || false
      });
      throw error;
    }

    if (!PDFJS.getDocument) {
      const error = new Error('PDFJS.getDocument is missing. PDF.js may not have loaded correctly.');
      criticalLogFn('[PDF v2.6] ERROR: PDFJS.getDocument is missing', 'PDF_GETDOCUMENT_MISSING', {
        error: error.message,
        pdfjsKeys: Object.keys(PDFJS).slice(0, 20)
      });
      throw error;
    }

    criticalLogFn('[PDF v2.6] PDF.js found in global object', 'PDF_FOUND_IN_GLOBAL', {
      version: PDFJS.version || '2.6.347',
      hasGetDocument: typeof PDFJS.getDocument === 'function',
      hasPDFJS: true,
      disableWorker: PDFJS.disableWorker,
      source: (windowAny?.PDFJS === PDFJS) ? 'window.PDFJS' :
             (selfAny?.PDFJS === PDFJS) ? 'self.PDFJS' :
             (windowAny?.pdfjsLib === PDFJS) ? 'window.pdfjsLib' :
             'self.pdfjsLib'
    });

    // Verify worker is disabled (should be set in offscreen.html)
    // CRITICAL: Check if disableWorker is set correctly
    // PDF.js 2.6.347 has disableWorker in GlobalWorkerOptions, not directly on PDFJS
    const globalDisableWorker = PDFJS.GlobalWorkerOptions?.disableWorker;
    const directDisableWorker = PDFJS.disableWorker;
    
    if (!globalDisableWorker && !directDisableWorker) {
      logWarn('[PDF v2.6] WARNING: disableWorker is false, setting to true now');
      criticalLogFn('[PDF v2.6] WARNING: disableWorker is false, setting to true', 'PDF_WORKER_NOT_DISABLED', {
        disableWorkerBefore: globalDisableWorker || directDisableWorker,
        hasGlobalWorkerOptions: !!PDFJS.GlobalWorkerOptions,
        globalDisableWorker: globalDisableWorker,
        directDisableWorker: directDisableWorker
      });
      
      // Set in both places for compatibility
      if (PDFJS.GlobalWorkerOptions) {
        PDFJS.GlobalWorkerOptions.disableWorker = true;
      }
      if (PDFJS.disableWorker !== undefined) {
        PDFJS.disableWorker = true;
      }
    }

    // Double check worker status
    const finalDisableWorker = PDFJS.GlobalWorkerOptions?.disableWorker || PDFJS.disableWorker;
    criticalLogFn('[PDF v2.6] Worker status check', 'PDF_WORKER_STATUS', {
      disableWorker: finalDisableWorker,
      globalDisableWorker: PDFJS.GlobalWorkerOptions?.disableWorker,
      directDisableWorker: PDFJS.disableWorker,
      hasGlobalWorkerOptions: !!PDFJS.GlobalWorkerOptions,
      workerSrc: PDFJS.GlobalWorkerOptions?.workerSrc || 'not set',
      workerPort: PDFJS.GlobalWorkerOptions?.workerPort,
      version: PDFJS.version || '2.6.347',
      note: finalDisableWorker ? 'Worker should be disabled ✅' : 'Worker may still be enabled ⚠️'
    });

    // Store globally for easy access
    if (selfAny) {
      selfAny.pdfjsLib = PDFJS;
      selfAny.PDFJS = PDFJS;
    }
    pdfJsLoaded = true;

    criticalLogFn('[PDF v2.6] ✅ PDF.js 2.6.347 ready', 'PDF_LOADER_SUCCESS', {
      version: PDFJS.version || '2.6.347',
      disableWorker: PDFJS.GlobalWorkerOptions?.disableWorker || PDFJS.disableWorker,
      loadMethod: 'script-tag',
      hasGetDocument: true,
      hasPDFJS: true,
      pdfReady: windowAny?.__PDF_READY__ || selfAny?.__PDF_READY__ || false
    });

    return PDFJS;

  } catch (error) {
    logError('[PDF v2.6] ❌ Failed to access PDF.js:', error);
    pdfJsLoaded = false;
    throw error;
  }
}

/**
 * Check if PDF.js is loaded
 */
export function isPdfJsLoaded() {
  /** @type {any} */
  const selfAny = typeof self !== 'undefined' ? self : null;
  return pdfJsLoaded && (!!selfAny?.pdfjsLib || !!selfAny?.PDFJS);
}
