/**
 * PDF.js 2.0.943 initialization script
 * Must be loaded AFTER pdf.min.js but BEFORE module scripts
 * CSP-safe: No inline scripts, all code in external file
 * @version 2.0-csp-safe
 * @date 2026-01-01
 */

(function() {
  'use strict';
  
  // CRITICAL: Mark that script executed
  if (typeof window !== 'undefined') {
    /** @type {any} */
    const windowAny = window;
    windowAny._pdfInitExecuted = true;
  }
  
  // CRITICAL: Immediate console.error to verify script execution
  // This MUST appear in offscreen.html console if script loads
  // Use multiple logging methods to ensure visibility
  try {
    console.error('[PDF_INIT] ===== SCRIPT STARTING =====', {
      timestamp: Date.now(),
      location: typeof window !== 'undefined' ? window.location.href : 'no window',
      readyState: typeof document !== 'undefined' ? document.readyState : 'no document',
      hasChrome: typeof chrome !== 'undefined',
      scriptSrc: typeof document !== 'undefined' ? (() => {
        /** @type {any} */
        const currentScript = document.currentScript;
        return currentScript?.src || 'no currentScript';
      })() : 'no document'
    });
    // Also try console.warn and console.log
    console.warn('[PDF_INIT] ===== SCRIPT STARTING (warn) =====');
    console.log('[PDF_INIT] ===== SCRIPT STARTING (log) =====');
    // Last resort: try to write to document
    if (typeof document !== 'undefined' && document.body) {
      const div = document.createElement('div');
      div.textContent = '[PDF_INIT] SCRIPT STARTED';
      div.style.color = 'red';
      div.style.fontSize = '20px';
      div.style.position = 'fixed';
      div.style.top = '0';
      div.style.zIndex = '99999';
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 5000);
    }
  } catch (e) {
    // Even if console fails, try alert (last resort)
    try {
      alert('[PDF_INIT] Script started but console.error failed: ' + e.message);
    } catch (e2) {
      // Ignore
    }
  }
  
  // CRITICAL: Function to send logs to service worker (ALWAYS VISIBLE)
  function sendLogToServiceWorker(message, marker, data) {
    const timestamp = Date.now();
    const logEntry = {
      message: message,
      marker: marker,
      data: data,
      timestamp: timestamp
    };
    
    // Method 1: localStorage (ALWAYS WORKS, PERSISTS)
    try {
      const storageKey = 'clipaible_offscreen_logs';
      const existingLogs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existingLogs.push(logEntry);
      if (existingLogs.length > 100) {
        existingLogs.shift();
      }
      localStorage.setItem(storageKey, JSON.stringify(existingLogs));
    } catch (e) {
      // Ignore localStorage errors
    }
    
    // Method 2: console.error (for local visibility) - CRITICAL for debugging
    try {
      const fullMessage = '[CRITICAL_LOG' + (marker ? ' ' + marker : '') + '] ' + message;
      // Use console.error for maximum visibility
      console.error(fullMessage, data || '');
      // Also log to console.warn and console.log for redundancy
      console.warn(fullMessage, data || '');
      console.log(fullMessage, data || '');
    } catch (e) {
      // Even if console fails, try to log via alert (last resort)
      try {
        console.error('[PDF_INIT] Console logging failed:', e);
      } catch (e2) {
        // Ignore
      }
    }
    
    // Method 3: chrome.runtime.sendMessage (for service worker visibility)
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'log',
          data: {
            level: 'critical',
            message: message,
            marker: marker,
            data: data,
            timestamp: timestamp,
            source: 'offscreen-pdf-init'
          }
        }, () => {
          // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
          if (chrome.runtime.lastError) {
            // Silently ignore - "Could not establish connection" is expected when receiver is closed
          }
        });
      }
    } catch (e) {
      // Ignore sendMessage errors
    }
  }
  
  // CRITICAL: Check if pdf.min.js script tag exists and is loaded
  const pdfScriptTag = document.querySelector('script[src*="pdf.min.js"]');
  /** @type {any} */
  const pdfScriptTagAny = pdfScriptTag;
  const pdfScriptLoaded = pdfScriptTagAny && (pdfScriptTagAny.readyState === 'complete' || pdfScriptTagAny.readyState === 'loaded' || !pdfScriptTagAny.readyState);
  
  console.error('[PDF_INIT] Script tag check:', {
    pdfScriptTagExists: !!pdfScriptTagAny,
    pdfScriptSrc: pdfScriptTagAny?.src || 'NOT_FOUND',
    pdfScriptReadyState: pdfScriptTagAny?.readyState || 'unknown',
    pdfScriptLoaded: pdfScriptLoaded,
    allScripts: Array.from(document.scripts).map(s => {
      /** @type {any} */
      const scriptAny = s;
      return {
        src: scriptAny.src || 'inline',
        readyState: scriptAny.readyState || 'unknown',
        async: scriptAny.async,
        defer: scriptAny.defer
      };
    })
  });
  
  sendLogToServiceWorker('PDF init script executing...', 'PDF_INIT_SCRIPT_START', {
    timestamp: Date.now(),
    readyState: document.readyState,
    hasChrome: typeof chrome !== 'undefined',
    hasChromeRuntime: typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined',
    location: window.location.href,
    pdfScriptTagExists: !!pdfScriptTagAny,
    pdfScriptSrc: pdfScriptTagAny?.src || 'NOT_FOUND',
    pdfScriptLoaded: pdfScriptLoaded,
    scriptsInHead: Array.from(document.head.querySelectorAll('script')).map(s => {
      /** @type {HTMLScriptElement} */
      const script = s;
      return script.src || 'inline';
    }),
    scriptsInBody: Array.from(document.body.querySelectorAll('script')).map(s => {
      /** @type {HTMLScriptElement} */
      const script = s;
      return script.src || 'inline';
    })
  });
  
  // CRITICAL: Try to extract PDF.js from UMD module if it's loaded but not exported globally
  // PDF.js 2.0.943 from CDN uses UMD pattern and may not export window.PDFJS automatically
  function tryExtractPdfFromUMD() {
    // Check if require/define is available (UMD pattern)
    /** @type {any} */
    const globalAny = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
    
    if (globalAny && typeof globalAny.define === 'function' && globalAny.define.amd) {
      try {
        // Try to get PDF.js from AMD define
        if (typeof globalAny.require === 'function') {
          // @ts-ignore - pdfjs-dist module may not be available at compile time
          const pdfModule = globalAny.require('pdfjs-dist/build/pdf');
          if (pdfModule) {
            sendLogToServiceWorker('PDF.js extracted from AMD module', 'PDF_EXTRACTED_FROM_AMD', {
              hasGetDocument: typeof pdfModule.getDocument === 'function'
            });
            return pdfModule;
          }
        }
      } catch (e) {
        // AMD not available or module not loaded
      }
    }
    
    // Check if module.exports is available (CommonJS pattern)
    if (globalAny && typeof globalAny.module !== 'undefined' && globalAny.module.exports) {
      try {
        if (typeof globalAny.require === 'function') {
          // @ts-ignore - pdfjs-dist module may not be available at compile time
          const pdfModule = globalAny.require('pdfjs-dist/build/pdf');
          if (pdfModule && pdfModule.getDocument) {
            sendLogToServiceWorker('PDF.js extracted from CommonJS module', 'PDF_EXTRACTED_FROM_COMMONJS', {
              hasGetDocument: typeof pdfModule.getDocument === 'function'
            });
            return pdfModule;
          }
        }
      } catch (e) {
        // CommonJS not available
      }
    }
    
    return null;
  }
  
  // CRITICAL: Wait for pdf.min.js to load if it's still loading
  // Scripts in <head> load synchronously, but large files may still be loading
  function waitForPdfJsScript(callback) {
    const pdfScript = document.querySelector('script[src*="pdf.min.js"]');
    /** @type {any} */
    const pdfScriptAny = pdfScript;
    
    if (!pdfScriptAny) {
      console.error('[PDF_INIT] ERROR: pdf.min.js script tag not found!');
      sendLogToServiceWorker('ERROR: pdf.min.js script tag not found', 'PDF_INIT_SCRIPT_TAG_NOT_FOUND', {
        allScripts: Array.from(document.scripts).map(s => {
          /** @type {any} */
          const scriptAny = s;
          return scriptAny.src || 'inline';
        })
      });
      // Continue anyway - maybe PDF.js is already loaded
      callback();
      return;
    }
    
    // If script is already loaded, execute immediately
    if (pdfScriptAny.readyState === 'complete' || pdfScriptAny.readyState === 'loaded' || !pdfScriptAny.readyState) {
      console.error('[PDF_INIT] pdf.min.js script already loaded, proceeding...');
      callback();
      return;
    }
    
    // Wait for script to load
    console.error('[PDF_INIT] Waiting for pdf.min.js to load...', {
      readyState: pdfScriptAny.readyState
    });
    
    pdfScriptAny.onload = function() {
      console.error('[PDF_INIT] pdf.min.js script loaded, proceeding...');
      callback();
    };
    
    pdfScriptAny.onerror = function() {
      console.error('[PDF_INIT] ERROR: pdf.min.js script failed to load!');
      sendLogToServiceWorker('ERROR: pdf.min.js script failed to load', 'PDF_INIT_SCRIPT_LOAD_ERROR', {
        scriptSrc: pdfScriptAny.src
      });
      // Continue anyway - maybe we can use dynamic import
      callback();
    };
    
    // Timeout after 5 seconds
    setTimeout(function() {
      if (pdfScriptAny.readyState !== 'complete' && pdfScriptAny.readyState !== 'loaded') {
        console.error('[PDF_INIT] WARNING: pdf.min.js script load timeout, proceeding anyway...');
        sendLogToServiceWorker('WARNING: pdf.min.js script load timeout', 'PDF_INIT_SCRIPT_LOAD_TIMEOUT', {
          readyState: pdfScriptAny.readyState,
          scriptSrc: pdfScriptAny.src
        });
        callback();
      }
    }, 5000);
  }
  
  // CRITICAL: Worker Patch FIRST (before PDF.js loads)
  const OriginalWorker = (typeof self !== 'undefined' ? self.Worker : null) || 
                         (typeof window !== 'undefined' ? window.Worker : null) ||
                         (typeof globalThis !== 'undefined' ? globalThis.Worker : null);
  
  if (OriginalWorker) {
    const PatchedWorker = function(...args) {
      sendLogToServiceWorker('Worker constructor called - BLOCKING', 'WORKER_PATCH_BLOCKED', {
        url: args[0],
        origin: typeof self !== 'undefined' ? self.origin : 'unknown'
      });
      throw new Error('Worker is disabled in offscreen document (origin null).');
    };
    
    Object.setPrototypeOf(PatchedWorker, OriginalWorker);
    /** @type {any} */
    const PatchedWorkerAny = PatchedWorker;
    PatchedWorkerAny._patched = true;
    
    if (typeof self !== 'undefined') {
      /** @type {any} */
      const selfAny = self;
      selfAny.Worker = PatchedWorker;
      try {
        Object.defineProperty(self, 'Worker', {
          value: PatchedWorker,
          writable: false,
          configurable: false
        });
      } catch (e) {
        // Ignore
      }
    }
    if (typeof window !== 'undefined' && window !== self) {
      /** @type {any} */
      const windowAny = window;
      windowAny.Worker = PatchedWorker;
      try {
        Object.defineProperty(window, 'Worker', {
          value: PatchedWorker,
          writable: false,
          configurable: false
        });
      } catch (e) {
        // Ignore
      }
    }
    sendLogToServiceWorker('Worker constructor patched', 'WORKER_PATCH_SUCCESS');
  }
  
  // Function to check and configure PDF.js
  function checkAndConfigurePdfJs() {
    // EXTENDED DIAGNOSTICS: Log ALL window keys and PDF-related checks
    /** @type {any} */
    const windowAny = typeof window !== 'undefined' ? window : null;
    /** @type {any} */
    const selfAny = typeof self !== 'undefined' ? self : null;
    const allWindowKeys = windowAny ? Object.keys(windowAny) : [];
    const pdfRelatedKeys = allWindowKeys.filter(k => k.toLowerCase().includes('pdf'));
    
    // Check all possible PDF.js export names
    const pdfChecks = {
      'PDFJS': typeof windowAny?.PDFJS,
      'pdfjsLib': typeof windowAny?.pdfjsLib,
      'PDFJSLib': typeof windowAny?.PDFJSLib,
      'pdfjs': typeof windowAny?.pdfjs,
      'pdfjs-dist': typeof windowAny?.['pdfjs-dist'],
      'PDF': typeof windowAny?.PDF
    };
    
    sendLogToServiceWorker('Checking PDF.js after <script> tag...', 'PDF_INIT_CHECK', {
      timestamp: Date.now(),
      hasPDFJS: typeof windowAny?.PDFJS !== 'undefined',
      hasPdfjsLib: typeof windowAny?.pdfjsLib !== 'undefined',
      hasWindow: typeof window !== 'undefined',
      windowKeysCount: allWindowKeys.length,
      windowKeys: allWindowKeys.slice(0, 50), // First 50 keys
      pdfRelatedKeys: pdfRelatedKeys,
      pdfChecks: pdfChecks
    });
    
    // Try to find PDF.js object under all possible names
    let PDF = null;
    let foundAs = null;
    
    if (typeof windowAny?.PDFJS !== 'undefined' && windowAny.PDFJS) {
      PDF = windowAny.PDFJS;
      foundAs = 'window.PDFJS';
    } else if (typeof windowAny?.pdfjsLib !== 'undefined' && windowAny.pdfjsLib) {
      PDF = windowAny.pdfjsLib;
      foundAs = 'window.pdfjsLib';
    } else if (typeof windowAny?.PDFJSLib !== 'undefined' && windowAny.PDFJSLib) {
      PDF = windowAny.PDFJSLib;
      foundAs = 'window.PDFJSLib';
    } else if (typeof windowAny?.pdfjs !== 'undefined' && windowAny.pdfjs) {
      PDF = windowAny.pdfjs;
      foundAs = 'window.pdfjs';
    } else if (typeof windowAny?.['pdfjs-dist'] !== 'undefined' && windowAny['pdfjs-dist']) {
      PDF = windowAny['pdfjs-dist'];
      foundAs = 'window["pdfjs-dist"]';
    } else if (typeof selfAny?.PDFJS !== 'undefined' && selfAny.PDFJS) {
      PDF = selfAny.PDFJS;
      foundAs = 'self.PDFJS';
    } else if (typeof selfAny?.pdfjsLib !== 'undefined' && selfAny.pdfjsLib) {
      PDF = selfAny.pdfjsLib;
      foundAs = 'self.pdfjsLib';
    } else {
      // CRITICAL: Try to extract from UMD module (PDF.js 2.0.943 from CDN uses UMD)
      const umdPdf = tryExtractPdfFromUMD();
      if (umdPdf) {
        PDF = umdPdf;
        foundAs = 'UMD module (extracted)';
      }
    }
    
    if (!PDF) {
      // CRITICAL: PDF.js 2.0.943 from CDN uses UMD and may not export globally
      // Try to load via dynamic import as fallback
      sendLogToServiceWorker('PDF.js not found in global object, trying dynamic import...', 'PDF_INIT_TRYING_IMPORT', {
        windowKeysCount: allWindowKeys.length,
        windowKeys: allWindowKeys.slice(0, 50),
        pdfRelatedKeys: pdfRelatedKeys,
        pdfChecks: pdfChecks,
        scriptTag: 'lib/pdfjs/pdf.min.js',
        scriptSrc: (() => {
          const script = document.querySelector('script[src*="pdf.min.js"]');
          /** @type {any} */
          const scriptAny = script;
          return scriptAny?.src || 'NOT_FOUND';
        })()
      });
      
      // Return false to trigger polling, but also try async import
      // Note: This will be handled in the polling loop
      return false;
    }
    
    sendLogToServiceWorker('PDF.js found!', 'PDF_FOUND', {
      foundAs: foundAs,
      version: PDF.version || 'unknown',
      hasGetDocument: typeof PDF.getDocument === 'function',
      pdfKeys: Object.keys(PDF).slice(0, 30)
    });
    
    if (!PDF.getDocument) {
      sendLogToServiceWorker('ERROR: PDF.getDocument is missing', 'PDF_INIT_GETDOCUMENT_MISSING', {
        pdfKeys: Object.keys(PDF).slice(0, 50),
        pdfType: typeof PDF,
        pdfConstructor: PDF.constructor?.name
      });
      return false;
    }
    
    sendLogToServiceWorker('PDF.js loaded via <script> tag', 'PDF_LOADED_FROM_SCRIPT', {
      foundAs: foundAs,
      version: PDF.version || '2.0.943',
      hasPDFJS: typeof windowAny?.PDFJS !== 'undefined',
      hasPdfjsLib: typeof windowAny?.pdfjsLib !== 'undefined',
      hasGetDocument: typeof PDF.getDocument === 'function',
      pdfProperties: Object.keys(PDF).slice(0, 20),
      timestamp: Date.now()
    });
    
    // === CRITICAL: Disable worker ===
    if (PDF.disableWorker !== undefined) {
      PDF.disableWorker = true;
      sendLogToServiceWorker('disableWorker set to true', 'PDF_DISABLE_WORKER_SET', {
        disableWorker: PDF.disableWorker,
        method: 'PDFJS.disableWorker'
      });
    } else {
      sendLogToServiceWorker('WARNING: disableWorker not found', 'PDF_DISABLE_WORKER_NOT_FOUND', {
        available: Object.keys(PDF).slice(0, 50),
        pdfType: typeof PDF
      });
    }
    
    // Set GlobalWorkerOptions if exists
    // NOTE: For PDF.js 2.0.943, workerSrc is optional when disableWorker=true,
    // but setting it doesn't hurt and may help with compatibility
    if (PDF.GlobalWorkerOptions) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        PDF.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.js');
      } else {
        // Fallback: use relative path (may not work in offscreen, but disableWorker=true should prevent usage)
        PDF.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
      }
      PDF.GlobalWorkerOptions.workerPort = null;
      
      sendLogToServiceWorker('GlobalWorkerOptions configured', 'PDF_GLOBAL_WORKER_OPTIONS', {
        workerSrc: PDF.GlobalWorkerOptions.workerSrc,
        workerPort: PDF.GlobalWorkerOptions.workerPort,
        disableWorker: PDF.disableWorker,
        hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime
      });
    }
    
    // Store in multiple locations for compatibility
    if (windowAny) {
      windowAny.pdfjsLib = PDF;
      windowAny.PDFJS = PDF;
    }
    if (selfAny) {
      selfAny.pdfjsLib = PDF;
      selfAny.PDFJS = PDF;
    }
    
    sendLogToServiceWorker('PDF.js initialization complete', 'PDF_INIT_COMPLETE', {
      version: PDF.version || '2.0.943',
      disableWorker: PDF.disableWorker,
      storedInWindow: true,
      storedInSelf: true,
      hasGetDocument: typeof PDF.getDocument === 'function',
      timestamp: Date.now()
    });
    
    return true;
  }
  
  // CRITICAL: Wait for pdf.min.js to load, then start configuration
  waitForPdfJsScript(function() {
    // Wait for PDF.js to load (static script may not be ready immediately)
    sendLogToServiceWorker('Starting PDF.js configuration check...', 'PDF_INIT_CONFIG_START', {
      timestamp: Date.now()
    });
  
  // CRITICAL: Try dynamic import if PDF.js not found in global object
  // PDF.js 2.0.943 from CDN uses UMD and may not export window.PDFJS
  async function tryDynamicImport() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const pdfUrl = chrome.runtime.getURL('lib/pdfjs/pdf.min.js');
        sendLogToServiceWorker('Attempting dynamic import of PDF.js...', 'PDF_INIT_DYNAMIC_IMPORT_START', {
          pdfUrl: pdfUrl
        });
        
        // Try to import PDF.js as ES module
        const pdfModule = await import(pdfUrl);
        
        if (pdfModule && (pdfModule.default || pdfModule.getDocument)) {
          const PDF = pdfModule.default || pdfModule;
          
          // Export to global object
          /** @type {any} */
          const windowAny2 = typeof window !== 'undefined' ? window : null;
          /** @type {any} */
          const selfAny2 = typeof self !== 'undefined' ? self : null;
          if (windowAny2) {
            windowAny2.PDFJS = PDF;
            windowAny2.pdfjsLib = PDF;
          }
          if (selfAny2) {
            selfAny2.PDFJS = PDF;
            selfAny2.pdfjsLib = PDF;
          }
          
          sendLogToServiceWorker('PDF.js loaded via dynamic import', 'PDF_INIT_DYNAMIC_IMPORT_SUCCESS', {
            hasGetDocument: typeof PDF.getDocument === 'function',
            version: PDF.version || '2.0.943'
          });
          
          // Configure PDF.js
          return checkAndConfigurePdfJs();
        }
      }
    } catch (importError) {
      sendLogToServiceWorker('Dynamic import failed', 'PDF_INIT_DYNAMIC_IMPORT_FAILED', {
        error: importError.message,
        errorStack: importError.stack
      });
    }
    return false;
  }
  
  // Try immediately
  if (checkAndConfigurePdfJs()) {
    sendLogToServiceWorker('PDF.js configured immediately', 'PDF_INIT_CONFIG_IMMEDIATE', {
      timestamp: Date.now()
    });
  } else {
    sendLogToServiceWorker('PDF.js not found immediately, trying dynamic import then polling...', 'PDF_INIT_CONFIG_POLLING_START', {
      timestamp: Date.now()
    });
    
    // Try dynamic import first
    tryDynamicImport().then(function(success) {
      if (success) {
        sendLogToServiceWorker('PDF.js configured via dynamic import', 'PDF_INIT_DYNAMIC_IMPORT_CONFIG_SUCCESS', {
          timestamp: Date.now()
        });
      } else {
        // If dynamic import fails, start polling
        let attempts = 0;
        const maxAttempts = 200; // 20 seconds
        const checkInterval = setInterval(function() {
          attempts++;
          if (checkAndConfigurePdfJs()) {
            clearInterval(checkInterval);
            sendLogToServiceWorker('PDF.js configured via polling', 'PDF_INIT_CONFIG_POLLING_SUCCESS', {
              attempts: attempts,
              timestamp: Date.now()
            });
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            sendLogToServiceWorker('ERROR: PDF.js not found after polling and dynamic import', 'PDF_INIT_CONFIG_POLLING_FAILED', {
              attempts: attempts,
              timestamp: Date.now(),
              windowKeys: typeof window !== 'undefined' ? Object.keys(window).slice(0, 50) : [],
              note: 'PDF.js 2.0.943 from CDN may not export global object. Consider using legacy build.'
            });
          }
        }, 100);
      }
    });
  } // End of waitForPdfJsScript callback
  });
})();

