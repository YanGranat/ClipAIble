// @ts-check
// PDF data extractor - gets PDF file data directly from tab using executeScript
// CRITICAL: fetch() and XHR do NOT work for file:// URLs even in tab context.
// This is a fundamental Chrome security restriction.
// This method works ONLY if PDF.js extension is installed (PDFViewerApplication.getData()).
// For Chrome built-in PDFium viewer, this method will FAIL.

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';

/**
 * Extract PDF file data from tab using executeScript
 * CRITICAL: This method works ONLY if PDF.js extension is installed (uses PDFViewerApplication.getData()).
 * For Chrome built-in PDFium viewer, this method will FAIL because:
 * 1. PDFViewerApplication is not available (PDFium doesn't expose JavaScript API)
 * 2. fetch() and XHR do NOT work for file:// URLs even in tab context
 * @param {string} pdfUrl - PDF file URL (file:// or http://)
 * @param {number} tabId - Tab ID where PDF is open
 * @returns {Promise<ArrayBuffer>} PDF file as ArrayBuffer
 * @throws {Error} Will throw error for Chrome built-in PDFium viewer (PDFViewerApplication not available)
 */
export async function extractPdfDataFromTab(pdfUrl, tabId) {
  const startTime = Date.now();
  // CRITICAL: Only critical logging in service worker
  criticalLog('[ClipAIble PDF Data Extractor] Starting extraction', 'PDF_EXTRACTION_START', { pdfUrl, tabId });
  
  try {
    // Execute script in MAIN world to access PDF.js API
    // CRITICAL: Use world: 'MAIN' to access PDF.js API in main world (not isolated)
    // This allows us to access window.PDFViewerApplication and window.pdfjsLib
    criticalLog('[ClipAIble PDF Data Extractor] Executing script in tab', 'PDF_EXTRACTION_EXECUTE', { tabId, pdfUrl });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN', // Execute in main world to access PDF.js API
      func: async (url) => {
        // Type declarations for PDF.js extension properties
        /** @type {any} */
        const win = window;
        
        // ===== MAXIMUM LOGGING AND DIAGNOSTICS =====
        // All console.log here will NOT appear in service worker logs
        // But we'll return diagnostic info in the result
        const diagnostics = {
          scriptStartTime: Date.now(),
          url: url,
          windowLocation: {
            href: window.location?.href || 'N/A',
            protocol: window.location?.protocol || 'N/A',
            hostname: window.location?.hostname || 'N/A'
          },
          pdfViewerCheck: {
            hasPdfViewer: !!win.PDFViewerApplication,
            hasPdfjsLib: !!win.pdfjsLib,
            viewerType: win.PDFViewerApplication ? 'PDF.js extension' : 'Chrome built-in (PDFium)'
          },
          documentCheck: {
            hasDocument: !!document,
            documentReadyState: document?.readyState || 'N/A',
            hasEmbed: !!document.querySelector('embed[type="application/pdf"]'),
            embedCount: document.querySelectorAll('embed').length
          },
          steps: []
        };
        
        console.log('[PDF Extractor] ===== SCRIPT EXECUTION STARTED =====', diagnostics);
        
        // Step 1: Check PDFViewerApplication availability
        diagnostics.steps.push({
          step: '1_check_pdfviewer',
          timestamp: Date.now(),
          hasPdfViewer: !!win.PDFViewerApplication,
          hasPdfjsLib: !!win.pdfjsLib
        });
        
        // CRITICAL: If PDFViewerApplication is not available, we're using Chrome built-in viewer (PDFium)
        // PDFium does NOT expose JavaScript API - we need to inform the caller
        if (!win.PDFViewerApplication) {
          console.log('[PDF Extractor] ❌ PDFViewerApplication NOT available - Chrome built-in viewer (PDFium)');
          console.log('[PDF Extractor] PDFium does not expose JavaScript API - getData()/saveDocument() will not work');
          
          diagnostics.steps.push({
            step: '1_check_pdfviewer_result',
            timestamp: Date.now(),
            result: 'PDFViewerApplication not available',
            viewerType: 'Chrome built-in (PDFium)'
          });
          
          return {
            success: false,
            error: 'PDFViewerApplication not available - Chrome built-in viewer (PDFium) does not expose JavaScript API',
            diagnostics: diagnostics,
            debugInfo: {
              hasPdfViewer: false,
              hasPdfjsLib: !!win.pdfjsLib,
              viewerType: 'Chrome built-in (PDFium)',
              locationHref: window.location.href
            }
          };
        }
        
        console.log('[PDF Extractor] ✅ PDFViewerApplication available - PDF.js extension detected');
        diagnostics.steps.push({
          step: '1_check_pdfviewer_result',
          timestamp: Date.now(),
          result: 'PDFViewerApplication available',
          viewerType: 'PDF.js extension'
        });
        
        try {
          // CRITICAL: Get actual PDF URL from window.location (tab context)
          // This is the key - in tab context, we can access file:// URLs
          let fetchUrl = url;
          
          // Get actual PDF URL from current location (tab context allows file:// access)
          if (window.location && window.location.href) {
            const currentUrl = window.location.href;
            const cleanUrl = currentUrl.split('#')[0];
            if (cleanUrl && (cleanUrl.startsWith('file://') || cleanUrl.includes('.pdf'))) {
              fetchUrl = cleanUrl;
            }
          }
          
          let pdfBlob = null;
          
          // Step 2: Check PDFViewerApplication.pdfDocument
          const pdfViewer = win.PDFViewerApplication;
          diagnostics.steps.push({
            step: '2_check_pdfviewer_structure',
            timestamp: Date.now(),
            hasPdfViewer: !!pdfViewer,
            hasPdfDoc: !!(pdfViewer && pdfViewer.pdfDocument),
            pdfViewerKeys: pdfViewer ? Object.keys(pdfViewer).slice(0, 10) : []
          });
          
          console.log('[PDF Extractor] Step 2: Checking PDFViewerApplication structure', {
            hasPdfViewer: !!pdfViewer,
            hasPdfDoc: !!(pdfViewer && pdfViewer.pdfDocument),
            pdfViewerType: typeof pdfViewer
          });
          
          if (!pdfViewer || !pdfViewer.pdfDocument) {
            const errorMsg = !pdfViewer 
              ? 'PDFViewerApplication is null/undefined'
              : 'PDFViewerApplication.pdfDocument is null/undefined';
            console.log(`[PDF Extractor] ❌ ${errorMsg}`);
            diagnostics.steps.push({
              step: '2_check_pdfviewer_structure_result',
              timestamp: Date.now(),
              result: 'failed',
              error: errorMsg
            });
            // Continue with other methods (XHR cache, embed element, etc.)
          } else {
            const pdfDoc = pdfViewer.pdfDocument;
            console.log('[PDF Extractor] ✅ PDFViewerApplication.pdfDocument available');
            
            // Step 3: Check available methods
            const hasGetData = typeof pdfDoc.getData === 'function';
            const hasSaveDocument = typeof pdfDoc.saveDocument === 'function';
            
            diagnostics.steps.push({
              step: '3_check_methods',
              timestamp: Date.now(),
              hasGetData: hasGetData,
              hasSaveDocument: hasSaveDocument,
              pdfDocType: typeof pdfDoc,
              pdfDocKeys: Object.keys(pdfDoc).slice(0, 15)
            });
            
            console.log('[PDF Extractor] Step 3: Checking available methods', {
              hasGetData,
              hasSaveDocument,
              pdfDocType: typeof pdfDoc
            });
            
            // Method 0: CRITICAL - Use PUBLIC API getData() FIRST (fastest, original data)
            // This is the PUBLIC API method - DO NOT use private fields!
            if (hasGetData) {
              try {
                console.log('[PDF Extractor] Step 4: Trying getData() method (PRIORITY 1 - PUBLIC API)...');
                diagnostics.steps.push({
                  step: '4_try_getdata',
                  timestamp: Date.now(),
                  method: 'getData',
                  status: 'attempting'
                });
                
                const getDataStartTime = Date.now();
                const uint8Array = await pdfDoc.getData();
                const getDataDuration = Date.now() - getDataStartTime;
                
                console.log('[PDF Extractor] getData() completed', {
                  duration: getDataDuration,
                  resultType: typeof uint8Array,
                  isUint8Array: uint8Array instanceof Uint8Array,
                  length: uint8Array?.length,
                  hasLength: !!uint8Array?.length
                });
                
                if (uint8Array && uint8Array instanceof Uint8Array && uint8Array.length > 0) {
                  // Convert Uint8Array to ArrayBuffer for transmission
                  pdfBlob = uint8Array.buffer;
                  // Store method name for later return
                  win._clipaible_pdf_extraction_method = 'getData';
                  console.log('[PDF Extractor] ✅ SUCCESS! Found PDF data via getData() (PUBLIC API)', {
                    size: uint8Array.length,
                    method: 'getData',
                    duration: getDataDuration
                  });
                  
                  diagnostics.steps.push({
                    step: '4_try_getdata_result',
                    timestamp: Date.now(),
                    result: 'success',
                    size: uint8Array.length,
                    duration: getDataDuration
                  });
                } else {
                  console.log('[PDF Extractor] ❌ getData() returned empty or invalid data', {
                    type: typeof uint8Array,
                    length: uint8Array?.length,
                    isUint8Array: uint8Array instanceof Uint8Array,
                    value: uint8Array
                  });
                  
                  diagnostics.steps.push({
                    step: '4_try_getdata_result',
                    timestamp: Date.now(),
                    result: 'failed',
                    reason: 'empty_or_invalid',
                    type: typeof uint8Array,
                    length: uint8Array?.length,
                    isUint8Array: uint8Array instanceof Uint8Array
                  });
                }
              } catch (getDataError) {
                console.log('[PDF Extractor] ❌ getData() failed with error:', {
                  message: getDataError.message,
                  stack: getDataError.stack,
                  name: getDataError.name
                });
                
                diagnostics.steps.push({
                  step: '4_try_getdata_result',
                  timestamp: Date.now(),
                  result: 'error',
                  error: getDataError.message,
                  errorName: getDataError.name
                });
                // Continue with saveDocument() fallback
              }
            } else {
              console.log('[PDF Extractor] ❌ getData() method not available on pdfDocument');
              diagnostics.steps.push({
                step: '4_try_getdata',
                timestamp: Date.now(),
                result: 'method_not_available'
              });
            }
            
            // Method 0.5: Try saveDocument() as fallback (includes annotations/changes)
            // Only try if getData() didn't work
            if (!pdfBlob && hasSaveDocument) {
              try {
                console.log('[PDF Extractor] Step 5: Trying saveDocument() method (PRIORITY 2 - PUBLIC API fallback)...');
                diagnostics.steps.push({
                  step: '5_try_savedocument',
                  timestamp: Date.now(),
                  method: 'saveDocument',
                  status: 'attempting'
                });
                
                const saveDocStartTime = Date.now();
                const uint8Array = await pdfDoc.saveDocument();
                const saveDocDuration = Date.now() - saveDocStartTime;
                
                console.log('[PDF Extractor] saveDocument() completed', {
                  duration: saveDocDuration,
                  resultType: typeof uint8Array,
                  isUint8Array: uint8Array instanceof Uint8Array,
                  length: uint8Array?.length
                });
                
                if (uint8Array && uint8Array instanceof Uint8Array && uint8Array.length > 0) {
                  // Convert Uint8Array to ArrayBuffer for transmission
                  pdfBlob = uint8Array.buffer;
                  // Store method name for later return
                  win._clipaible_pdf_extraction_method = 'saveDocument';
                  console.log('[PDF Extractor] ✅ SUCCESS! Found PDF data via saveDocument() (PUBLIC API)', {
                    size: uint8Array.length,
                    method: 'saveDocument',
                    duration: saveDocDuration
                  });
                  
                  diagnostics.steps.push({
                    step: '5_try_savedocument_result',
                    timestamp: Date.now(),
                    result: 'success',
                    size: uint8Array.length,
                    duration: saveDocDuration
                  });
                } else {
                  console.log('[PDF Extractor] ❌ saveDocument() returned empty or invalid data', {
                    type: typeof uint8Array,
                    length: uint8Array?.length,
                    isUint8Array: uint8Array instanceof Uint8Array
                  });
                  
                  diagnostics.steps.push({
                    step: '5_try_savedocument_result',
                    timestamp: Date.now(),
                    result: 'failed',
                    reason: 'empty_or_invalid',
                    type: typeof uint8Array,
                    length: uint8Array?.length
                  });
                }
              } catch (saveDocError) {
                console.log('[PDF Extractor] ❌ saveDocument() failed with error:', {
                  message: saveDocError.message,
                  stack: saveDocError.stack,
                  name: saveDocError.name
                });
                
                diagnostics.steps.push({
                  step: '5_try_savedocument_result',
                  timestamp: Date.now(),
                  result: 'error',
                  error: saveDocError.message,
                  errorName: saveDocError.name
                });
                // Continue with other methods
              }
            } else if (!pdfBlob) {
              if (!hasSaveDocument) {
                console.log('[PDF Extractor] ❌ saveDocument() method not available on pdfDocument');
                diagnostics.steps.push({
                  step: '5_try_savedocument',
                  timestamp: Date.now(),
                  result: 'method_not_available'
                });
              } else {
                console.log('[PDF Extractor] Skipping saveDocument() - getData() already succeeded');
              }
            }
          }
          
          // Method 1: Try fetch() in tab context
          // CRITICAL: fetch() does NOT work for file:// URLs even in tab context.
          // This is a fundamental Chrome security restriction.
          // This method will likely FAIL for file:// URLs.
          // This may work for http/https URLs, but NOT for file:// URLs.
          if (!pdfBlob && fetchUrl) {
            try {
              console.log('[PDF Extractor] Step 6: Trying fetch() in tab context (NOTE: Will FAIL for file:// URLs due to Chrome security restrictions)...');
              diagnostics.steps.push({
                step: '6_try_fetch',
                timestamp: Date.now(),
                method: 'fetch',
                fetchUrl: fetchUrl,
                status: 'attempting'
              });
              
              const fetchStartTime = Date.now();
              const response = await fetch(fetchUrl);
              const fetchDuration = Date.now() - fetchStartTime;
              
              // Convert Headers to object for logging
              const headersObj = {};
              /** @type {any} */
              const headers = response.headers;
              if (headers && typeof headers.forEach === 'function') {
                headers.forEach((value, key) => {
                  headersObj[key] = value;
                });
              }
              
              console.log('[PDF Extractor] fetch() response received', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: headersObj
              });
              
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                
                if (arrayBuffer && arrayBuffer.byteLength > 0) {
                  pdfBlob = arrayBuffer;
                  // Store method name for later return
                  win._clipaible_pdf_extraction_method = 'fetch';
                  console.log('[PDF Extractor] ✅ SUCCESS! Found PDF data via fetch() in tab context', {
                    size: arrayBuffer.byteLength,
                    method: 'fetch',
                    duration: fetchDuration,
                    url: fetchUrl
                  });
                  
                  diagnostics.steps.push({
                    step: '6_try_fetch_result',
                    timestamp: Date.now(),
                    result: 'success',
                    size: arrayBuffer.byteLength,
                    duration: fetchDuration
                  });
                } else {
                  console.log('[PDF Extractor] ❌ fetch() returned empty result', {
                    hasArrayBuffer: !!arrayBuffer,
                    byteLength: arrayBuffer?.byteLength
                  });
                  
                  diagnostics.steps.push({
                    step: '6_try_fetch_result',
                    timestamp: Date.now(),
                    result: 'failed',
                    reason: 'empty_result',
                    byteLength: arrayBuffer?.byteLength
                  });
                }
              } else {
                console.log('[PDF Extractor] ❌ fetch() failed with status', {
                  status: response.status,
                  statusText: response.statusText
                });
                
                diagnostics.steps.push({
                  step: '6_try_fetch_result',
                  timestamp: Date.now(),
                  result: 'failed',
                  reason: 'bad_status',
                  status: response.status,
                  statusText: response.statusText
                });
              }
            } catch (fetchError) {
              console.log('[PDF Extractor] ❌ fetch() failed with error:', {
                message: fetchError.message,
                stack: fetchError.stack,
                name: fetchError.name
              });
              
              diagnostics.steps.push({
                step: '6_try_fetch_result',
                timestamp: Date.now(),
                result: 'error',
                error: fetchError.message,
                errorName: fetchError.name
              });
              // Continue with other methods
            }
          }
          
          // Method 2: Try XHR with empty URL (loads current document from cache)
          // This hack might work for file:// URLs by loading from browser cache
          if (!pdfBlob) {
            try {
              console.log('[PDF Extractor] Step 7: Trying XHR with empty URL (cache method)...');
              diagnostics.steps.push({
                step: '7_try_xhr_cache',
                timestamp: Date.now(),
                method: 'xhr_cache',
                status: 'attempting'
              });
              
              const xhrStartTime = Date.now();
              const xhrResult = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', '', true); // Empty URL = current document from cache
                xhr.responseType = 'arraybuffer';
                
                xhr.onload = function() {
                  console.log('[PDF Extractor] XHR onload fired', {
                    status: this.status,
                    statusText: this.statusText,
                    responseType: this.responseType,
                    hasResponse: !!this.response,
                    responseSize: this.response?.byteLength
                  });
                  if (this.status === 200 || this.status === 0) { // status 0 for file://
                    console.log('[PDF Extractor] XHR cache success, size:', this.response.byteLength);
                    resolve(this.response);
                  } else {
                    reject(new Error('XHR status: ' + this.status + ' ' + this.statusText));
                  }
                };
                
                xhr.onerror = function() {
                  console.log('[PDF Extractor] XHR onerror fired', {
                    status: this.status,
                    statusText: this.statusText
                  });
                  reject(new Error('XHR error'));
                };
                
                xhr.ontimeout = function() {
                  console.log('[PDF Extractor] XHR ontimeout fired');
                  reject(new Error('XHR timeout'));
                };
                
                xhr.timeout = 5000; // 5 second timeout
                console.log('[PDF Extractor] XHR sending request...');
                xhr.send();
              });
              
              const xhrDuration = Date.now() - xhrStartTime;
              
              if (xhrResult && xhrResult.byteLength > 0) {
                pdfBlob = xhrResult;
                // Store method name for later return
                win._clipaible_pdf_extraction_method = 'xhr_cache';
                console.log('[PDF Extractor] ✅ SUCCESS! Found PDF data via XHR cache', {
                  size: xhrResult.byteLength,
                  method: 'xhr_cache',
                  duration: xhrDuration
                });
                
                diagnostics.steps.push({
                  step: '7_try_xhr_cache_result',
                  timestamp: Date.now(),
                  result: 'success',
                  size: xhrResult.byteLength,
                  duration: xhrDuration
                });
              } else {
                console.log('[PDF Extractor] ❌ XHR cache returned empty result', {
                  hasResult: !!xhrResult,
                  byteLength: xhrResult?.byteLength
                });
                
                diagnostics.steps.push({
                  step: '7_try_xhr_cache_result',
                  timestamp: Date.now(),
                  result: 'failed',
                  reason: 'empty_result',
                  byteLength: xhrResult?.byteLength
                });
              }
            } catch (xhrError) {
              console.log('[PDF Extractor] ❌ XHR cache failed with error:', {
                message: xhrError.message,
                stack: xhrError.stack,
                name: xhrError.name
              });
              
              diagnostics.steps.push({
                step: '7_try_xhr_cache_result',
                timestamp: Date.now(),
                result: 'error',
                error: xhrError.message,
                errorName: xhrError.name
              });
              // Continue with other methods
            }
          }
          
          if (!pdfBlob) {
            // Add final failure step to diagnostics
            diagnostics.steps.push({
              step: 'final_failure',
              timestamp: Date.now(),
              totalDuration: Date.now() - diagnostics.scriptStartTime,
              allMethodsFailed: true
            });
            
            // Collect all debug info for troubleshooting
            const debugInfo = {
              hasPdfViewer: !!win.PDFViewerApplication,
              hasPdfjsLib: !!win.pdfjsLib,
              hasPdfDoc: !!(win.PDFViewerApplication && win.PDFViewerApplication.pdfDocument),
              hasGetData: !!(win.PDFViewerApplication?.pdfDocument?.getData),
              hasSaveDocument: !!(win.PDFViewerApplication?.pdfDocument?.saveDocument),
              hasEmbed: !!document.querySelector('embed[type="application/pdf"]'),
              fetchUrl: fetchUrl,
              isFileUrl: fetchUrl.startsWith('file://'),
              locationHref: window.location.href,
              viewerType: win.PDFViewerApplication ? 'PDF.js extension' : 'Chrome built-in (PDFium)'
            };
            
            console.log('[PDF Extractor] ===== EXTRACTION FAILED =====', {
              debugInfo,
              diagnostics,
              stepsCount: diagnostics.steps.length
            });
            
            // Provide helpful error message based on viewer type
            let errorMessage = 'All PDF data extraction methods failed.';
            if (!win.PDFViewerApplication) {
              errorMessage += ' Chrome built-in PDF viewer (PDFium) does not expose JavaScript API.';
              errorMessage += ' Please ensure PDF is open in a browser tab.';
            } else if (!win.PDFViewerApplication.pdfDocument) {
              errorMessage += ' PDF.js extension is installed but PDF document is not loaded yet.';
            } else if (fetchUrl.startsWith('file://')) {
              errorMessage += ' For file:// URLs, PDF.js extension needs "Allow access to file URLs" permission.';
            }
            
            return {
              success: false,
              error: errorMessage,
              diagnostics: diagnostics,
              debugInfo: debugInfo
            };
          }
          
          // Convert ArrayBuffer to base64 for message passing
          // Use chunked conversion for large files to avoid memory issues
          const bytes = new Uint8Array(pdfBlob);
          const chunkSize = 8192; // Process in 8KB chunks
          let binary = '';
          
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            for (let j = 0; j < chunk.length; j++) {
              binary += String.fromCharCode(chunk[j]);
            }
          }
          
          const base64 = btoa(binary);
          
          // Determine which method was used (from earlier in the code)
          // We store the method name in window._clipaible_pdf_extraction_method
          let method = win._clipaible_pdf_extraction_method || 'unknown';
          
          // Clean up the temporary method marker
          if (win._clipaible_pdf_extraction_method) {
            delete win._clipaible_pdf_extraction_method;
          }
          
          // Add final step to diagnostics
          diagnostics.steps.push({
            step: 'final_success',
            timestamp: Date.now(),
            method: method,
            size: pdfBlob.byteLength,
            totalDuration: Date.now() - diagnostics.scriptStartTime
          });
          
          console.log('[PDF Extractor] ===== EXTRACTION SUCCESS =====', {
            method,
            size: pdfBlob.byteLength,
            totalDuration: Date.now() - diagnostics.scriptStartTime,
            stepsCount: diagnostics.steps.length
          });
          
          return {
            success: true,
            base64,
            size: pdfBlob.byteLength,
            method: method, // 'getData', 'saveDocument', 'xhr_cache', 'embed', 'fetch', or 'unknown'
            diagnostics: diagnostics // Return full diagnostic info
          };
        } catch (error) {
          // Add error step to diagnostics
          diagnostics.steps.push({
            step: 'exception_caught',
            timestamp: Date.now(),
            error: error.message,
            errorName: error.name,
            errorStack: error.stack,
            totalDuration: Date.now() - diagnostics.scriptStartTime
          });
          
          // Collect debug info even on error
          const debugInfo = {
            hasPdfViewer: !!win.PDFViewerApplication,
            hasPdfjsLib: !!win.pdfjsLib,
            hasPdfDoc: !!(win.PDFViewerApplication && win.PDFViewerApplication.pdfDocument),
            hasEmbed: !!document.querySelector('embed[type="application/pdf"]'),
            fetchUrl: url,
            isFileUrl: url.startsWith('file://'),
            locationHref: window.location.href,
            error: error.message
          };
          
          console.log('[PDF Extractor] ===== EXCEPTION CAUGHT =====', {
            error: error.message,
            stack: error.stack,
            diagnostics,
            debugInfo
          });
          
          return {
            success: false,
            error: error.message,
            stack: error.stack,
            diagnostics: diagnostics,
            debugInfo: debugInfo
          };
        }
      },
      args: [pdfUrl]
    });
    
    // CRITICAL: Check chrome.runtime.lastError FIRST (before accessing results)
    if (chrome.runtime.lastError) {
      criticalLog('[ClipAIble PDF Data Extractor] Script execution error (chrome.runtime.lastError)', 'PDF_EXTRACTION_ERROR', {
        error: chrome.runtime.lastError.message,
        tabId,
        pdfUrl
      });
      throw new Error(`Failed to execute script in tab: ${chrome.runtime.lastError.message}`);
    }
    
    if (!results || results.length === 0) {
      criticalLog('[ClipAIble PDF Data Extractor] No results from script execution', 'PDF_EXTRACTION_ERROR', { 
        tabId, 
        pdfUrl,
        hasResults: !!results,
        resultsType: typeof results
      });
      throw new Error('Script execution returned no results');
    }
    
    if (!results[0] || !results[0].result) {
      criticalLog('[ClipAIble PDF Data Extractor] Invalid result structure', 'PDF_EXTRACTION_ERROR', {
        tabId,
        pdfUrl,
        resultsLength: results.length,
        firstResult: results[0],
        hasResult: !!results[0]?.result
      });
      throw new Error('Script execution returned invalid result structure');
    }
    
    const result = results[0].result;
    
    if (!result.success) {
      // CRITICAL: Log full diagnostics from injected script
      if (result.diagnostics) {
        criticalLog('[ClipAIble PDF Data Extractor] FULL DIAGNOSTICS FROM INJECTED SCRIPT', 'PDF_EXTRACTION_DIAGNOSTICS', {
          tabId,
          pdfUrl,
          diagnostics: result.diagnostics,
          debugInfo: result.debugInfo,
          error: result.error,
          stack: result.stack
        });
      }
      
      // Include debug info in error message if available
      const errorMsg = result.error || 'Failed to extract PDF data from tab';
      const debugInfo = result.debugInfo ? ` Debug info: ${JSON.stringify(result.debugInfo)}` : '';
      const method = result.method ? ` Method attempted: ${result.method}` : '';
      const stepsCount = result.diagnostics?.steps?.length || 0;
      
      criticalLog('[ClipAIble PDF Data Extractor] Extraction failed', 'PDF_EXTRACTION_FAILED', {
        error: errorMsg,
        method,
        stepsCount,
        debugInfo,
        tabId,
        pdfUrl,
        hasDiagnostics: !!result.diagnostics
      });
      
      throw new Error(errorMsg + method + debugInfo);
    }
    
    // CRITICAL: Log full diagnostics from injected script (even on success)
    if (result.diagnostics) {
      criticalLog('[ClipAIble PDF Data Extractor] SUCCESS - FULL DIAGNOSTICS', 'PDF_EXTRACTION_SUCCESS_DIAGNOSTICS', {
        tabId,
        pdfUrl,
        method: result.method,
        size: result.size,
        diagnostics: result.diagnostics
      });
    }
    
    // Log which method succeeded
    if (result.method) {
      criticalLog('[ClipAIble PDF Data Extractor] Extraction method used', 'PDF_EXTRACTION_SUCCESS', {
        method: result.method,
        size: result.size || result.base64?.length || 0,
        stepsCount: result.diagnostics?.steps?.length || 0
      });
    }
    
    // Convert base64 back to ArrayBuffer
    const binaryString = atob(result.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const arrayBuffer = bytes.buffer;
    
    const duration = Date.now() - startTime;
    criticalLog('[ClipAIble PDF Data Extractor] PDF data extracted successfully', 'PDF_EXTRACTION_SUCCESS', {
      pdfUrl,
      tabId,
      size: arrayBuffer.byteLength,
      method: result.method || 'unknown',
      duration
    });
    
    return arrayBuffer;
  } catch (error) {
    criticalLog('[ClipAIble PDF Data Extractor] Failed to extract PDF data from tab', 'PDF_EXTRACTION_ERROR', {
      error: error.message,
      pdfUrl,
      tabId,
      duration: Date.now() - startTime,
      stack: error.stack
    });
    throw error;
  }
}
