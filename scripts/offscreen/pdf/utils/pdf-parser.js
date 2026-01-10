// @ts-check
// PDF parsing utility - handles PDF.js document parsing and error handling

// @ts-ignore - Module resolution issue, but file exists at runtime
import { log, logError, logWarn } from '../../../utils/logging.js';
// @ts-ignore - Module resolution issue, but file exists at runtime
import { CONFIG } from '../../../utils/config.js';
import { loadPdfJs } from './pdf-loader.js';

/**
 * Parse PDF document from ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer - PDF file as ArrayBuffer
 * @returns {Promise<Object>} PDF.js document object
 */
export async function parsePdfDocument(arrayBuffer) {
  log('[PDF v3] Starting PDF parsing', {
    arrayBufferSize: arrayBuffer.byteLength,
    firstBytes: Array.from(new Uint8Array(arrayBuffer).slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')
  });
  
  // Load PDF.js if not already loaded
  const pdfjsLoadStart = Date.now();
  const pdfjsLib = await loadPdfJs();
  log('[PDF v3] PDF.js loaded', { loadDuration: Date.now() - pdfjsLoadStart });
  
  // Verify PDF header before parsing
  const headerBytes = new Uint8Array(arrayBuffer).slice(0, 4);
  const headerText = String.fromCharCode(...headerBytes);
  if (headerText !== '%PDF') {
    logError('[PDF v3] Invalid PDF header', {
      headerText,
      expected: '%PDF',
      firstBytes: Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    throw new Error(`Invalid PDF file: header is "${headerText}", expected "%PDF"`);
  }
  
  log('[PDF v3] PDF header verified, creating loading task', {
    header: headerText,
    dataSize: arrayBuffer.byteLength
  });
  
  // CRITICAL: Create fake ownerDocument for offscreen document
  // This fixes "ReferenceError: document is not defined" when PDF.js tries to create style elements
  // Based on solution from: https://github.com/mozilla/pdf.js/issues/10319#issuecomment-1074078410
  // CRITICAL FIX (per Perplexity): Use document.createElement('canvas'), NOT OffscreenCanvas
  // OffscreenCanvas can cause issues in offscreen document context
  const fakeOwnerDocument = {
    // Safe access to fonts property - TypeScript doesn't know about fonts on Window/WorkerGlobalScope
    fonts: (typeof self !== 'undefined' && 'fonts' in self ? /** @type {any} */ (self).fonts : undefined) || document?.fonts || {},
    createElement: (name) => {
      if (name === 'canvas') {
        // CRITICAL: Use document.createElement('canvas'), NOT OffscreenCanvas
        // Perplexity analysis: OffscreenCanvas can cause rendering issues
        // Offscreen document HAS document.createElement, so use it
        if (typeof document !== 'undefined' && document.createElement) {
          return document.createElement('canvas');
        }
        // Fallback only if document is truly unavailable
        return new OffscreenCanvas(1, 1);
      }
      if (name === 'style') {
        // Return a minimal style element mock for font loading
        if (typeof document !== 'undefined' && document.createElement) {
          return document.createElement('style');
        }
        return {
          sheet: {
            insertRule: () => {},
            cssRules: []
          },
          appendChild: () => {},
          setAttribute: () => {}
        };
      }
      return null;
    }
  };
  
  log('[PDF v2.0] Fake ownerDocument created', {
    hasFonts: !!fakeOwnerDocument.fonts,
    hasCreateElement: typeof fakeOwnerDocument.createElement === 'function'
  });
  
  // Create loading task with fake ownerDocument
  // CRITICAL: Add options to prevent Worker usage and ensure fake worker works correctly
  const taskStart = Date.now();
  let loadingTask = null;
  let pdf = null;
  
  // CRITICAL: Load PDF with PDF.js 2.0.943 (disableWorker=true set in pdf-init.js)
  // PDF.js 2.0.943 does not attempt to create Worker when disableWorker=true
  const loadInfo = {
    disableWorker: pdfjsLib.disableWorker,
    hasGlobalWorkerOptions: !!pdfjsLib.GlobalWorkerOptions,
    workerSrc: pdfjsLib.GlobalWorkerOptions?.workerSrc,
    workerPort: pdfjsLib.GlobalWorkerOptions?.workerPort,
    version: pdfjsLib.version || '2.0.943',
    arrayBufferSize: arrayBuffer.byteLength,
    timestamp: Date.now()
  };
  
  log('[PDF v2.0] Loading PDF document with worker disabled...', loadInfo);
  const { criticalLog } = await import('../../../utils/logging.js');
  criticalLog('[PDF v2.0] Starting PDF document load', 'PDF_DOCUMENT_LOAD_START', loadInfo);
  
  loadingTask = pdfjsLib.getDocument({ 
    data: arrayBuffer,
    verbosity: 0,
    stopAtErrors: false,
    // CRITICAL: Provide fake ownerDocument to fix document.createElement() errors
    // @ts-ignore - ownerDocument is not in TypeScript definitions but works at runtime
    ownerDocument: fakeOwnerDocument
  });
  
  const taskCreatedDuration = Date.now() - taskStart;
  log('[PDF v2.0] Loading task created', { taskDuration: taskCreatedDuration });
  criticalLog('[PDF v2.0] PDF loading task created', 'PDF_LOADING_TASK_CREATED', {
    taskDuration: taskCreatedDuration,
    hasOnPassword: typeof loadingTask.onPassword === 'function',
    hasPromise: typeof loadingTask.promise === 'object'
  });
  
  // Handle password-protected PDFs
  loadingTask.onPassword = (callback, reason) => {
    logWarn('[PDF v3] PDF is password-protected', { reason });
    throw new Error('This PDF is password-protected. Please unlock it first.');
  };
  
  // Add timeout wrapper (5 minutes for document load - increased for very large PDFs up to 1000 pages)
  // Very large PDFs can take much longer to parse, especially with complex structures
  const PARSE_TIMEOUT_MS = CONFIG.PDF_PARSE_TIMEOUT_MS;
  const parsePromise = loadingTask.promise;
  let parseTimeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    parseTimeoutId = setTimeout(() => {
      reject(new Error(`PDF parsing timeout after ${PARSE_TIMEOUT_MS / 1000} seconds. The PDF may be too large or corrupted.`));
    }, PARSE_TIMEOUT_MS);
  });
  
  const parseStartTime = Date.now();
  criticalLog('[PDF v2.0] Waiting for PDF parse promise...', 'PDF_PARSE_PROMISE_START', {
    parseStartTime,
    timeoutMs: PARSE_TIMEOUT_MS
  });
  
  try {
    pdf = await Promise.race([parsePromise, timeoutPromise]);
  } finally {
    // Clear timeout if parse completed before timeout
    if (parseTimeoutId) {
      clearTimeout(parseTimeoutId);
    }
  }
  
  const parseDuration = Date.now() - parseStartTime;
  criticalLog('[PDF v2.0] PDF parse promise resolved', 'PDF_PARSE_PROMISE_RESOLVED', {
    parseDuration,
    numPages: pdf.numPages,
    hasTransport: !!pdf._transport
  });
  
  // CRITICAL: Check Worker status after PDF load (diagnostics)
  // PDF.js internal structure: pdf._transport.worker can be:
  // - Real Worker: has .port (MessagePort)
  // - Fake Worker: has ._messageHandler but NO .port
  // - No worker: undefined or null
  const transport = pdf._transport;
  const worker = transport?.worker;
  
  // CRITICAL: Deep inspection of PDF.js internal structure
  const transportInspection = {
    exists: transport !== undefined,
    type: transport?.constructor?.name || 'unknown',
    keys: transport ? Object.keys(transport) : [],
    hasWorker: 'worker' in (transport || {}),
    workerValue: transport?.worker,
    workerType: transport?.worker?.constructor?.name || (transport?.worker === undefined ? 'undefined' : (transport?.worker === null ? 'null' : 'unknown'))
  };
  
  const workerInspection = worker ? {
    exists: true,
    type: worker.constructor?.name || 'unknown',
    keys: Object.keys(worker),
    hasPort: 'port' in worker,
    hasMessageHandler: '_messageHandler' in worker,
    hasDestroyed: 'destroyed' in worker,
    portType: worker.port?.constructor?.name || 'none',
    messageHandlerType: worker._messageHandler?.constructor?.name || 'none'
  } : {
    exists: false,
    reason: transport === undefined ? 'transport is undefined' : 'worker property missing or null'
  };
  
  const workerStatus = {
    hasTransport: transport !== undefined,
    hasWorker: worker !== undefined && worker !== null,
    hasWorkerPort: worker?.port !== undefined,
    hasWorkerMessageHandler: worker?._messageHandler !== undefined,
    workerDestroyed: worker?.destroyed === true,
    workerType: worker?.constructor?.name || 'unknown',
    // Fake worker detection: no port but has messageHandler
    isFakeWorker: worker !== undefined && worker !== null && !worker?.port && worker?._messageHandler !== undefined,
    // Real worker detection: has port
    isRealWorker: worker?.port !== undefined,
    // Deep inspection data
    transportInspection: transportInspection,
    workerInspection: workerInspection
  };
  
  // Use criticalLog to ensure Worker status reaches background.js
  criticalLog('[PDF v2.0] PDF loaded successfully', 'PDF_LOADED_WITH_WORKER_STATUS', {
    numPages: pdf.numPages,
    loadDuration: Date.now() - taskStart,
    workerStatus: workerStatus,
    disableWorker: pdfjsLib.disableWorker,
    note: workerStatus.isFakeWorker ? 'Using fake worker (main thread) ✅' : 
          workerStatus.isRealWorker ? 'Using real Worker (may hang) ⚠️' : 
          workerStatus.hasWorker ? 'Worker exists but type unclear ⚠️' :
          'No worker found - may use direct rendering ⚠️'
  });
  
  log('[PDF v3] PDF loaded successfully', {
    numPages: pdf.numPages,
    loadDuration: Date.now() - taskStart,
    workerStatus: workerStatus,
    note: workerStatus.isFakeWorker ? 'Using fake worker (main thread) ✅' : 'Worker status unclear ⚠️'
  });
  
  // Verify PDF was loaded successfully
  if (!pdf) {
    throw new Error('PDF document failed to load');
  }
  
  const numPages = pdf.numPages || 0;
  const totalDuration = Date.now() - taskStart;
  
  log('[PDF v3] PDF parsed successfully', { 
    numPages,
    totalDuration
  });
  
  if (numPages === 0) {
    throw new Error('PDF has no pages.');
  }
  
  return pdf;
}

