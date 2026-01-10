/**
 * CDP-based PDF Page Rendering
 * 
 * Uses Chrome DevTools Protocol to capture PDF pages via Page.captureScreenshot
 * This replaces the problematic offscreen document rendering approach
 * 
 * @date 2026-01-01
 * @version 1.1.0 - Fixed Image API issue in Service Worker (removed Image usage)
 */

import { log, logError, logWarn, criticalLog } from '../utils/logging.js';
import { CONFIG } from '../utils/config.js';
import { checkCancellation } from '../utils/processing/pipeline-helpers.js';

/**
 * Measure PDF layout structure in original user tab (before opening new tabs)
 * This measures sidebar width and PDF content coordinates in the tab where user opened PDF
 * 
 * @param {number} tabId - Original tab ID where user opened PDF
 * @returns {Promise<Object|null>} Layout structure: { sidebarWidth, pdfContentX, pdfContentY, pdfContentWidth, pdfContentHeight } or null if failed
 */
export async function measurePdfLayoutInOriginalTab(tabId) {
  if (!tabId) {
    const errorMsg = 'No tabId provided for layout measurement';
    logError('[CDP Render] ❌ ' + errorMsg, { tabId });
    throw new Error(errorMsg);
  }
  
  const debuggee = { tabId };
  let debuggerAttached = false;
  
  try {
    log('[CDP Render] Measuring PDF layout in original tab', { tabId });
    
    // CRITICAL: Check if tab exists and is accessible
    let tab = null;
    try {
      tab = await chrome.tabs.get(tabId);
      criticalLog('[CDP Render] ✅ Tab exists and is accessible', 'PDF_LAYOUT_TAB_CHECK', {
        tabId,
        tabUrl: tab.url?.substring(0, 100) || 'no url',
        tabStatus: tab.status,
        tabActive: tab.active,
        tabWindowId: tab.windowId,
        timestamp: Date.now()
      });
    } catch (tabError) {
      const errorMsg = `Tab does not exist or is not accessible: ${tabError.message}`;
      logError('[CDP Render] ❌ ' + errorMsg, {
        tabId,
        error: tabError.message,
        errorStack: tabError.stack
      });
      throw new Error(errorMsg);
    }
    
    // CRITICAL: Check if debugger can be attached (may fail if already attached or tab is in isolated context)
    try {
      criticalLog('[CDP Render] Attempting to attach debugger to original tab', 'PDF_LAYOUT_DEBUGGER_ATTACH_START', {
        tabId,
        tabUrl: tab.url?.substring(0, 100) || 'no url',
        timestamp: Date.now()
      });
      
      await chrome.debugger.attach(debuggee, '1.3');
      debuggerAttached = true;
      
      criticalLog('[CDP Render] ✅ Debugger attached successfully to original tab', 'PDF_LAYOUT_DEBUGGER_ATTACHED', {
        tabId,
        timestamp: Date.now()
      });
    } catch (attachError) {
      const errorMsg = `Failed to attach debugger to original tab: ${attachError.message}`;
      logError('[CDP Render] ❌ ' + errorMsg, {
        tabId,
        error: attachError.message,
        errorStack: attachError.stack,
        note: 'Debugger may already be attached, or tab may be in isolated context (file:// URLs)'
      });
      throw new Error(errorMsg);
    }
    
    // Enable domains
    await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
    await chrome.debugger.sendCommand(debuggee, 'DOM.enable');
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');
    
    // Get layout metrics
    /** @type {any} */
    const layoutMetrics = await chrome.debugger.sendCommand(debuggee, 'Page.getLayoutMetrics', {});
    const viewportWidth = layoutMetrics?.cssLayoutViewport?.clientWidth || 0;
    const viewportHeight = layoutMetrics?.cssLayoutViewport?.clientHeight || 0;
    
    // Get document root
    /** @type {any} */
    const documentResult = await chrome.debugger.sendCommand(debuggee, 'DOM.getDocument', { depth: 3 });
    
    let pdfContentArea = null;
    let sidebarWidth = 0;
    let sidebarNodeId = null; // Declare outside if block so it's accessible for sidebar collapse
    
    if (documentResult && documentResult.root) {
      const rootNodeId = documentResult.root.nodeId;
      
      // CRITICAL: First, try to find sidebar container to measure its width
      // This is the most accurate way to get sidebar width
      // NOTE: Element may be in Shadow DOM, so we try both CDP DOM and Runtime.evaluate
      sidebarNodeId = null; // Reset for this attempt
      sidebarWidth = 0;
      const sidebarSelectors = [
        'div#sidenav-container',
        '#sidenav-container',
        'div[id="sidenav-container"]',
        '[id="sidenav-container"]'
      ];
      
      // Method 1: Try CDP DOM.querySelector (may not work with Shadow DOM)
      for (const selector of sidebarSelectors) {
        try {
          /** @type {any} */
          const queryResult = await chrome.debugger.sendCommand(debuggee, 'DOM.querySelector', { 
            nodeId: rootNodeId, 
            selector: selector 
          });
          if (queryResult && queryResult.nodeId) {
            sidebarNodeId = queryResult.nodeId;
            /** @type {any} */
            const sidebarBoxModel = await chrome.debugger.sendCommand(debuggee, 'DOM.getBoxModel', { nodeId: sidebarNodeId });
            if (sidebarBoxModel && sidebarBoxModel.model && sidebarBoxModel.model.content) {
              const sidebarContent = sidebarBoxModel.model.content;
              sidebarWidth = Math.abs(sidebarContent[2] - sidebarContent[0]); // Width of sidebar
              criticalLog('[CDP Render] ✅ Sidebar found and measured (CDP DOM)', 'PDF_LAYOUT_SIDEBAR_FOUND', {
                tabId,
                selector: selector,
                method: 'cdp_dom_querySelector',
                sidebarWidth: sidebarWidth,
                sidebarX: sidebarContent[0],
                sidebarY: sidebarContent[1],
                note: 'Sidebar width measured via CDP DOM - will use for PDF content area calculation',
                timestamp: Date.now()
              });
              break;
            }
          }
        } catch (e) {
          logWarn('[CDP Render] CDP DOM.querySelector failed for sidebar', { selector, error: e.message, tabId });
        }
      }
      
      // Method 2: If CDP DOM failed, try Runtime.evaluate (works with Shadow DOM)
      if (sidebarWidth === 0) {
        try {
          /** @type {any} */
          const sidebarEvalResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: `
              (function() {
                try {
                  // Try multiple selectors and methods
                  const selectors = [
                    'div#sidenav-container',
                    '#sidenav-container',
                    'div[id="sidenav-container"]',
                    '[id="sidenav-container"]',
                    'div.sidenav-container',
                    '.sidenav-container',
                    'viewer-pdf-sidenav',
                    'div[class*="sidenav"]',
                    '[class*="sidenav"]'
                  ];
                  
                  let sidebar = null;
                  for (const sel of selectors) {
                    try {
                      sidebar = document.querySelector(sel);
                      if (sidebar) break;
                    } catch(e) {
                      // Expected: selector may be invalid or element may not exist, continue to next selector
                      // No logging needed - this is expected behavior during element search
                    }
                  }
                  
                  // If not found, try to find via Shadow DOM traversal
                  if (!sidebar) {
                    try {
                      const allDivs = document.querySelectorAll('div');
                      for (const div of allDivs) {
                        if (div.id === 'sidenav-container' || div.id?.includes('sidenav')) {
                          sidebar = div;
                          break;
                        }
                        // Check shadow root
                        if (div.shadowRoot) {
                          const shadowSidebar = div.shadowRoot.querySelector('#sidenav-container') ||
                                               div.shadowRoot.querySelector('[id*="sidenav"]');
                          if (shadowSidebar) {
                            sidebar = shadowSidebar;
                            break;
                          }
                        }
                      }
                    } catch(e) {
                      // Expected: Shadow DOM traversal may fail on some pages, continue without sidebar
                      // No logging needed - this is expected behavior during element search
                    }
                  }
                  
                  // Also try to find viewer-pdf-sidenav element
                  if (!sidebar) {
                    try {
                      sidebar = document.querySelector('viewer-pdf-sidenav');
                      if (sidebar && sidebar.shadowRoot) {
                        const shadowContent = sidebar.shadowRoot.querySelector('div#content');
                        if (shadowContent) {
                          // Use the shadow root container
                          sidebar = sidebar;
                        }
                      }
                    } catch(e) {
                      // Expected: viewer-pdf-sidenav element may not exist or shadow root may be inaccessible, continue without sidebar
                      // No logging needed - this is expected behavior during element search
                    }
                  }
                  
                  if (sidebar) {
                    const rect = sidebar.getBoundingClientRect();
                    return {
                      found: true,
                      x: Math.round(rect.x),
                      y: Math.round(rect.y),
                      width: Math.round(rect.width),
                      height: Math.round(rect.height),
                      tagName: sidebar.tagName,
                      id: sidebar.id,
                      className: sidebar.className,
                      hasShadowRoot: !!sidebar.shadowRoot
                    };
                  }
                  
                  // Last resort: try to find any element with "sidenav" in id or class
                  if (!sidebar) {
                    const allElements = document.querySelectorAll('*');
                    for (const el of allElements) {
                      if ((el.id && el.id.includes('sidenav')) || 
                          (el.className && String(el.className).includes('sidenav'))) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.width < 500) { // Reasonable sidebar width
                          return {
                            found: true,
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            tagName: el.tagName,
                            id: el.id,
                            className: el.className,
                            method: 'fallback_search'
                          };
                        }
                      }
                    }
                  }
                  
                  return { found: false, error: 'Element not found after exhaustive search' };
                } catch(e) {
                  return { found: false, error: e.message };
                }
              })();
            `,
            returnByValue: true
          });
          
          if (sidebarEvalResult && sidebarEvalResult.result && sidebarEvalResult.result.value) {
            const sidebarInfo = sidebarEvalResult.result.value;
            if (sidebarInfo.found) {
              sidebarWidth = sidebarInfo.width;
              criticalLog('[CDP Render] ✅ Sidebar found and measured (Runtime.evaluate)', 'PDF_LAYOUT_SIDEBAR_FOUND', {
                tabId,
                method: sidebarInfo.method || 'runtime_evaluate',
                sidebarWidth: sidebarWidth,
                sidebarX: sidebarInfo.x,
                sidebarY: sidebarInfo.y,
                sidebarHeight: sidebarInfo.height,
                tagName: sidebarInfo.tagName,
                id: sidebarInfo.id,
                className: sidebarInfo.className,
                hasShadowRoot: sidebarInfo.hasShadowRoot,
                note: 'Sidebar width measured via Runtime.evaluate (works with Shadow DOM) - will use for PDF content area calculation',
                timestamp: Date.now()
              });
            } else {
              criticalLog('[CDP Render] ⚠️ Sidebar not found via Runtime.evaluate', 'PDF_LAYOUT_SIDEBAR_NOT_FOUND', {
                tabId,
                error: sidebarInfo.error || 'Element not found',
                note: 'Will try to calculate sidebar width from PDF content area position',
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {
          logWarn('[CDP Render] Runtime.evaluate failed for sidebar', { error: e.message, tabId });
        }
      }
      
      // CRITICAL: Try multiple selectors to find PDF content area
      // Priority: div#content > embed > body (for file:// URLs, structure may differ)
      const containerSelectors = [
        'div#content',
        '#content',
        'div[id="content"]',
        '[id="content"]',
        'embed[type="application/x-google-chrome-pdf"]',
        'embed[type*="chrome-pdf"]',
        'embed[type*="pdf"]',
        'embed',
        'body'
      ];
      
      let contentNodeId = null;
      let foundSelector = null;
      
      for (const selector of containerSelectors) {
        try {
          /** @type {any} */
          const queryResult = await chrome.debugger.sendCommand(debuggee, 'DOM.querySelector', { 
            nodeId: rootNodeId, 
            selector: selector 
          });
          if (queryResult && queryResult.nodeId) {
            contentNodeId = queryResult.nodeId;
            foundSelector = selector;
            criticalLog('[CDP Render] ✅ Found element for PDF layout measurement', 'PDF_LAYOUT_ELEMENT_FOUND', {
              tabId,
              selector: selector,
              nodeId: contentNodeId,
              note: 'Will use this element to measure PDF content area',
              timestamp: Date.now()
            });
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!contentNodeId) {
        // CRITICAL: Log full DOM structure for debugging to understand what elements exist
        try {
          /** @type {any} */
          const bodyQuery = await chrome.debugger.sendCommand(debuggee, 'DOM.querySelector', { 
            nodeId: rootNodeId, 
            selector: 'body' 
          });
          if (bodyQuery && bodyQuery.nodeId) {
            // Get all child nodes of body to see what's actually in the DOM
            /** @type {any} */
            const bodyNode = await chrome.debugger.sendCommand(debuggee, 'DOM.describeNode', { 
              nodeId: bodyQuery.nodeId,
              depth: 5, // Deeper depth to see nested elements
              pierce: true // Include shadow DOM
            });
            
            // Also try to find ALL elements that might contain PDF
            /** @type {any} */
            const allElements = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
              expression: `
                (function() {
                  const elements = [];
                  // Try to find all possible PDF containers
                  const selectors = ['div#content', '#content', 'embed', 'iframe', 'object', 'div[class*="pdf"]', 'div[class*="viewer"]', 'div[id*="pdf"]', 'div[id*="viewer"]'];
                  selectors.forEach(sel => {
                    try {
                      const el = document.querySelector(sel);
                      if (el) {
                        const rect = el.getBoundingClientRect();
                        elements.push({
                          selector: sel,
                          found: true,
                          tagName: el.tagName,
                          id: el.id,
                          className: el.className,
                          x: rect.x,
                          y: rect.y,
                          width: rect.width,
                          height: rect.height
                        });
                      }
                    } catch(e) {
                      // Expected: selector may be invalid or element may not exist, continue to next selector
                      // No logging needed - this is expected behavior during element search
                    }
                  });
                  return elements;
                })();
              `,
              returnByValue: true
            });
            
            // Type assertion for Chrome DevTools Protocol response
            /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
            const typedAllElements = allElements || {};
            
            criticalLog('[CDP Render] ⚠️ DOM structure for debugging', 'PDF_LAYOUT_DOM_STRUCTURE', {
              tabId,
              bodyNode: bodyNode ? JSON.stringify(bodyNode).substring(0, 1000) : 'null',
              foundElements: typedAllElements.result?.value || [],
              note: 'Could not find PDF content element - logging DOM structure and all possible PDF containers',
              timestamp: Date.now()
            });
          }
        } catch (e) {
          logWarn('[CDP Render] Failed to log DOM structure', { error: e.message, tabId });
        }
      }
      
      if (contentNodeId) {
        // Get box model for found element
        /** @type {any} */
        const boxModelResult = await chrome.debugger.sendCommand(debuggee, 'DOM.getBoxModel', { nodeId: contentNodeId });
        if (boxModelResult && boxModelResult.model && boxModelResult.model.content) {
          const content = boxModelResult.model.content;
          const x = content[0];
          const y = content[1];
          const width = Math.abs(content[2] - content[0]);
          const height = Math.abs(content[5] - content[1]);
          
          pdfContentArea = {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height)
          };
          
          // CRITICAL: If sidebar was found separately, use its measured width
          // Otherwise, use PDF content X coordinate as sidebar width (if PDF is not at x=0)
          // For body element, sidebar might be 0, but we still use the measurement
          if (sidebarWidth === 0) {
            sidebarWidth = pdfContentArea.x > 0 ? pdfContentArea.x : 0;
          }
          
          // CRITICAL: If we found sidebar separately but PDF content X is 0, 
          // it means PDF content area might be after sidebar, so adjust pdfContentX
          if (sidebarWidth > 0 && pdfContentArea.x === 0 && foundSelector === 'body') {
            // Body starts at x=0, but PDF content is actually after sidebar
            // Use sidebar width as the X offset for PDF content
            pdfContentArea.x = sidebarWidth;
            pdfContentArea.width = Math.max(0, pdfContentArea.width - sidebarWidth);
          }
          
          // CRITICAL: Abort if sidebar width is still 0 (not found)
          // NOTE: If sidebar is collapsed in new tabs, this check is less critical
          // But we still need to know if sidebar exists in original tab for reference
          if (sidebarWidth === 0) {
            // Check if sidebar might be collapsed or hidden in original tab
            try {
              /** @type {any} */
              const sidebarCheckResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
                expression: `
                  (function() {
                    try {
                      const sidebar = document.querySelector('div#sidenav-container') || 
                                     document.querySelector('#sidenav-container') ||
                                     document.querySelector('viewer-pdf-sidenav');
                      if (sidebar) {
                        const rect = sidebar.getBoundingClientRect();
                        const style = window.getComputedStyle(sidebar);
                        return {
                          found: true,
                          width: rect.width,
                          display: style.display,
                          visibility: style.visibility,
                          isHidden: style.display === 'none' || style.visibility === 'hidden' || rect.width === 0
                        };
                      }
                      return { found: false };
                    } catch(e) {
                      return { found: false, error: e.message };
                    }
                  })();
                `,
                returnByValue: true
              });
              
              if (sidebarCheckResult && sidebarCheckResult.result && sidebarCheckResult.result.value) {
                const sidebarCheck = sidebarCheckResult.result.value;
                if (sidebarCheck.found && sidebarCheck.isHidden) {
                  // Sidebar exists but is hidden - this is OK, we'll collapse it in new tabs
                  criticalLog('[CDP Render] ✅ Sidebar found but hidden in original tab - will collapse in new tabs', 'PDF_SIDEBAR_HIDDEN_IN_ORIGINAL', {
                    tabId,
                    sidebarWidth: 0,
                    sidebarDisplay: sidebarCheck.display,
                    sidebarVisibility: sidebarCheck.visibility,
                    note: 'Sidebar is hidden - will collapse it in new tabs, no need to measure width',
                    timestamp: Date.now()
                  });
                  // Set sidebarWidth to 0 but don't throw error - we'll collapse it in new tabs
                  sidebarWidth = 0;
                } else if (sidebarCheck.found && !sidebarCheck.isHidden && sidebarCheck.width > 0) {
                  // Sidebar exists and is visible - we need its width
                  sidebarWidth = sidebarCheck.width;
                  criticalLog('[CDP Render] ✅ Sidebar width measured from visible sidebar', 'PDF_SIDEBAR_WIDTH_MEASURED_VISIBLE', {
                    tabId,
                    sidebarWidth: sidebarWidth,
                    note: 'Sidebar is visible - width measured for clipping',
                    timestamp: Date.now()
                  });
                } else {
                  // Sidebar not found or has 0 width - this is OK, we'll collapse it in new tabs
                  logWarn('[CDP Render] ⚠️ Sidebar not found or has 0 width - will collapse sidebar in new tabs', {
                    tabId,
                    sidebarWidth,
                    sidebarCheck: sidebarCheck,
                    pdfContentX: pdfContentArea.x,
                    pdfContentY: pdfContentArea.y,
                    pdfContentWidth: pdfContentArea.width,
                    pdfContentHeight: pdfContentArea.height,
                    foundSelector: foundSelector,
                    viewportWidth,
                    viewportHeight,
                    note: 'Sidebar will be collapsed automatically in new tabs - no need to measure width'
                  });
                  // Continue with sidebarWidth: 0 - sidebar will be collapsed in new tabs
                }
              } else {
                // Could not check sidebar - this is OK, we'll collapse it in new tabs
                logWarn('[CDP Render] ⚠️ Could not check sidebar - will collapse sidebar in new tabs', {
                  tabId,
                  sidebarWidth,
                  pdfContentX: pdfContentArea.x,
                  pdfContentY: pdfContentArea.y,
                  pdfContentWidth: pdfContentArea.width,
                  pdfContentHeight: pdfContentArea.height,
                  foundSelector: foundSelector,
                  viewportWidth,
                  viewportHeight,
                  note: 'Sidebar will be collapsed automatically in new tabs - no need to measure width'
                });
                // Continue with sidebarWidth: 0 - sidebar will be collapsed in new tabs
              }
            } catch (checkError) {
              // If check fails, this is OK - we'll collapse sidebar in new tabs
              logWarn('[CDP Render] ⚠️ Sidebar check failed - will collapse sidebar in new tabs', {
                tabId,
                sidebarWidth,
                checkError: checkError.message,
                pdfContentX: pdfContentArea.x,
                pdfContentY: pdfContentArea.y,
                pdfContentWidth: pdfContentArea.width,
                pdfContentHeight: pdfContentArea.height,
                foundSelector: foundSelector,
                viewportWidth,
                viewportHeight,
                note: 'Sidebar will be collapsed automatically in new tabs - no need to measure width'
              });
              // Continue with sidebarWidth: 0 - sidebar will be collapsed in new tabs
            }
          }
          
          criticalLog('[CDP Render] ✅ PDF layout measured in original tab', 'PDF_LAYOUT_MEASURED_ORIGINAL_TAB', {
            tabId,
            viewportWidth,
            viewportHeight,
            sidebarWidth,
            pdfContentX: pdfContentArea.x,
            pdfContentY: pdfContentArea.y,
            pdfContentWidth: pdfContentArea.width,
            pdfContentHeight: pdfContentArea.height,
            foundSelector: foundSelector,
            note: 'Measured in original user tab - will be used for all new tabs',
            timestamp: Date.now()
          });
        } else {
          const errorMsg = `Failed to get box model for found element (selector: ${foundSelector})`;
          logError('[CDP Render] ❌ ' + errorMsg, {
            tabId,
            contentNodeId,
            foundSelector,
            hasBoxModel: !!boxModelResult,
            hasModel: !!(boxModelResult && boxModelResult.model),
            hasContent: !!(boxModelResult && boxModelResult.model && boxModelResult.model.content)
          });
          throw new Error(errorMsg);
        }
      }
    }
    
    // Detach debugger
    if (debuggerAttached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch (e) {
        logWarn('[CDP Render] Failed to detach debugger from original tab', { error: e.message, tabId });
      }
    }
    
    if (pdfContentArea) {
      return {
        sidebarWidth,
        pdfContentX: pdfContentArea.x,
        pdfContentY: pdfContentArea.y,
        pdfContentWidth: pdfContentArea.width,
        pdfContentHeight: pdfContentArea.height,
        viewportWidth,
        viewportHeight
      };
    } else {
      const errorMsg = 'Failed to find PDF content area (div#content) in original tab';
      logError('[CDP Render] ❌ ' + errorMsg, { 
        tabId,
        hasDocumentResult: !!documentResult,
        hasRoot: !!(documentResult && documentResult.root),
        note: 'div#content element not found - cannot measure sidebar width'
      });
      
      // Detach debugger before throwing
      if (debuggerAttached) {
        try {
          await chrome.debugger.detach(debuggee);
        } catch (e) {
          // Ignore detach errors
        }
      }
      
      throw new Error(errorMsg);
    }
    
  } catch (error) {
    // If error is already our custom error, just re-throw it
    if (error.message && (error.message.includes('No tabId') || error.message.includes('Tab does not exist') || error.message.includes('Failed to attach debugger') || error.message.includes('Failed to find PDF content area'))) {
      // Detach debugger before re-throwing
      if (debuggerAttached) {
        try {
          await chrome.debugger.detach(debuggee);
        } catch (e) {
          // Ignore detach errors
        }
      }
      throw error; // Re-throw our custom errors
    }
    
    // For unexpected errors, log and throw
    logError('[CDP Render] ❌ Unexpected error measuring PDF layout in original tab', {
      tabId,
      error: error.message,
      stack: error.stack
    });
    
    // Detach debugger on error
    if (debuggerAttached) {
      try {
        await chrome.debugger.detach(debuggee);
      } catch (e) {
        // Ignore detach errors
      }
    }
    
    throw error; // Re-throw to abort processing
  }
}

/**
 * Render single PDF page as image using CDP
 * 
 * @param {string} pdfUrl - PDF file URL (file:// or http://)
 * @param {number} pageNum - Page number (1-based)
 * @param {number} [scale=2.0] - Scale factor (not used in CDP, kept for API compatibility)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data (not used in CDP, kept for API compatibility)
 * @returns {Promise<Object>} { imageData (base64 data URL), width, height }
 */
export async function renderPdfPageImageCdp(pdfUrl, pageNum, scale = 2.0, pdfData = null) {
  const startTime = Date.now();
  const stepTimes = {};
  
  // Only log start if verbose (reduces log volume for multi-page PDFs)
  if (CONFIG?.VERBOSE_LOGGING) {
    log('[CDP Render] Rendering page', { pageNum, pdfUrl: pdfUrl?.substring(0, 100) });
  }
  
  let tab = null;
  let debuggerAttached = false;
  const debuggee = { tabId: null };

  try {
    // Step 1: Open PDF in new tab (invisible)
    const step1Start = Date.now();
    
    // Create new tab for PDF
    tab = await chrome.tabs.create({
      url: pdfUrl,
      active: false  // CRITICAL: Should be invisible
    });
    debuggee.tabId = tab.id;
    stepTimes.step1_createTab = Date.now() - step1Start;
    
    // Only log if verbose or if tab is active (error case)
    if (CONFIG?.VERBOSE_LOGGING) {
      const allTabsAfter = await chrome.tabs.query({});
      const createdTab = await chrome.tabs.get(tab.id);
      if (createdTab.active) {
        logWarn('[CDP Render] ⚠️ Created tab is active (should be inactive)', { tabId: tab.id });
      }
    }

    // Step 2: Wait for tab to load
    const step2Start = Date.now();
    await waitForTabLoad(tab.id);
    stepTimes.step2_waitForLoad = Date.now() - step2Start;

    // Step 3: Attach debugger
    await chrome.debugger.attach(debuggee, '1.3');
    debuggerAttached = true;

    // Step 4: Enable Page domain
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');

    // Step 5: Navigate to specific page
    const step5Start = Date.now();
    const pageUrl = `${pdfUrl.split('#')[0]}#page=${pageNum}`;
    log('[CDP Render] [STEP 5] Navigating to specific page...', {
      pageNum,
      pageUrl,
      baseUrl: pdfUrl.split('#')[0],
      timestamp: step5Start
    });
    
    // Check and reattach debugger if needed before navigation
    log('[CDP Render] [STEP 5a] Checking debugger attachment before navigation...', {
      tabId: tab.id,
      debuggerAttached
    });
    await ensureDebuggerAttached(debuggee);
    
    log('[CDP Render] [STEP 5b] Sending Page.navigate command...', {
      tabId: tab.id,
      pageUrl,
      timestamp: Date.now()
    });
    
    const navigateResult = await chrome.debugger.sendCommand(debuggee, 'Page.navigate', { url: pageUrl });
    stepTimes.step5_navigate = Date.now() - step5Start;
    
    log('[CDP Render] [STEP 5] ✅ Navigation command sent', {
      pageNum,
      pageUrl,
      navigateResult: navigateResult || 'no result',
      duration: stepTimes.step5_navigate,
      timestamp: Date.now()
    });
    
    // Check and reattach debugger after navigation
    const step5cStart = Date.now();
    log('[CDP Render] [STEP 5c] Waiting 200ms after navigation...', {
      timestamp: step5cStart
    });
    await sleep(200); // Reduced from 500ms to 200ms - navigation initiates quickly, waitForPageLoad handles real waiting
    
    log('[CDP Render] [STEP 5d] Checking debugger attachment after navigation...', {
      tabId: tab.id
    });
    await ensureDebuggerAttached(debuggee);
    stepTimes.step5_postNavigate = Date.now() - step5cStart;
    
    log('[CDP Render] [STEP 5c-d] ✅ Post-navigation checks complete', {
      duration: stepTimes.step5_postNavigate,
      timestamp: Date.now()
    });

    // Step 6: Wait for page to load
    const step6Start = Date.now();
    await waitForPageLoad(debuggee, pageNum);
    stepTimes.step6_waitForPageLoad = Date.now() - step6Start;

    // Step 7: Capture screenshot
    const step7Start = Date.now();
    
    // Only verify tab state if verbose logging enabled
    if (CONFIG?.VERBOSE_LOGGING) {
      const tabBeforeScreenshot = await chrome.tabs.get(tab.id);
      if (tabBeforeScreenshot.active) {
        logWarn('[CDP Render] ⚠️ Tab is active before screenshot (should be inactive)', { pageNum, tabId: tab.id });
      }
    }
    
    /** @type {any} */
    const screenshotResult = await chrome.debugger.sendCommand(
      debuggee,
      'Page.captureScreenshot',
      {
        format: 'png',
        quality: 100,
        fromSurface: true  // CRITICAL for Windows
      }
    );
    stepTimes.step7_captureScreenshot = Date.now() - step7Start;

    if (!screenshotResult || !screenshotResult.data) {
      logError('[CDP Render] [STEP 7] ❌ Screenshot result is empty', {
        pageNum,
        screenshotResult: screenshotResult ? 'exists but no data' : 'null',
        timestamp: Date.now()
      });
      throw new Error('Screenshot result is empty');
    }

    // Step 8: Process screenshot data
    const step8Start = Date.now();
    
    // CDP doesn't provide exact dimensions, so we'll use reasonable defaults
    // For PDF pages, typical dimensions are around 800-1200px width
    // We'll use 1200x1600 as default (A4 ratio at ~150 DPI)
    const imageData = `data:image/png;base64,${screenshotResult.data}`;
    
    // Estimate dimensions from screenshot data size
    // PNG screenshot from CDP is typically full viewport size
    // Use default A4 dimensions at reasonable DPI
    const width = 1200;  // Default width for PDF page
    const height = 1600; // Default height for PDF page (A4 ratio)
    
    stepTimes.step8_processData = Date.now() - step8Start;
    
    const totalDuration = Date.now() - startTime;

    log('[CDP Render] ===== PAGE RENDERING COMPLETE =====', {
      pageNum,
      totalDuration,
      totalDurationSeconds: (totalDuration / 1000).toFixed(2),
      stepTimes: {
        createTab: stepTimes.step1_createTab,
        waitForLoad: stepTimes.step2_waitForLoad,
        attachDebugger: stepTimes.step3_attachDebugger,
        enablePage: stepTimes.step4_enablePage,
        navigate: stepTimes.step5_navigate,
        postNavigate: stepTimes.step5_postNavigate,
        waitForPageLoad: stepTimes.step6_waitForPageLoad,
        captureScreenshot: stepTimes.step7_captureScreenshot,
        processData: stepTimes.step8_processData
      },
      imageSize: screenshotResult.data.length,
      imageSizeKB: (screenshotResult.data.length / 1024).toFixed(2),
      width,
      height,
      timestamp: Date.now()
    });

    return {
      imageData, // base64 data URL
      width,
      height
    };

  } catch (error) {
    const errorDuration = Date.now() - startTime;
    logError('[CDP Render] ===== PAGE RENDERING FAILED =====', {
      pageNum,
      error: error.message,
      errorStack: error.stack,
      errorName: error.name,
      totalDuration: errorDuration,
      totalDurationSeconds: (errorDuration / 1000).toFixed(2),
      stepTimes,
      debuggerAttached,
      tabId: tab?.id,
      timestamp: Date.now()
    });
    throw error;

  } finally {
    // Cleanup
    const cleanupStart = Date.now();
    log('[CDP Render] [CLEANUP] Starting cleanup...', {
      pageNum,
      debuggerAttached,
      tabId: tab?.id,
      timestamp: cleanupStart
    });
    
    if (debuggerAttached && debuggee.tabId) {
      try {
        log('[CDP Render] [CLEANUP] Detaching debugger...', {
          tabId: debuggee.tabId,
          timestamp: Date.now()
        });
        await chrome.debugger.detach(debuggee);
        const detachDuration = Date.now() - cleanupStart;
        log('[CDP Render] [CLEANUP] ✅ Debugger detached', {
          tabId: debuggee.tabId,
          duration: detachDuration,
          timestamp: Date.now()
        });
      } catch (detachError) {
        logWarn('[CDP Render] [CLEANUP] ⚠️ Failed to detach debugger', {
          tabId: debuggee.tabId,
          error: detachError.message,
          timestamp: Date.now()
        });
      }
    }

    if (tab) {
      try {
        log('[CDP Render] [CLEANUP] Closing tab...', {
          tabId: tab.id,
          timestamp: Date.now()
        });
        await chrome.tabs.remove(tab.id);
        const closeDuration = Date.now() - cleanupStart;
        log('[CDP Render] [CLEANUP] ✅ Tab closed', {
          tabId: tab.id,
          duration: closeDuration,
          timestamp: Date.now()
        });
      } catch (removeError) {
        logWarn('[CDP Render] [CLEANUP] ⚠️ Failed to close tab', {
          tabId: tab.id,
          error: removeError.message,
          timestamp: Date.now()
        });
      }
    }
    
    const totalCleanupDuration = Date.now() - cleanupStart;
    log('[CDP Render] [CLEANUP] ===== CLEANUP COMPLETE =====', {
      pageNum,
      totalCleanupDuration,
      timestamp: Date.now()
    });
  }
}

/**
 * Render all PDF pages as images using CDP
 * More efficient than rendering pages one by one - opens PDF once and navigates through pages
 * 
 * @param {string} pdfUrl - PDF file URL
 * @param {number} totalPages - Total number of pages
 * @param {number} [scale=2.0] - Scale factor (not used, kept for API compatibility)
 * @param {ArrayBuffer} [pdfData] - Optional: PDF file data (not used, kept for API compatibility)
 * @param {{width: number, height: number, widthInPoints?: number, heightInPoints?: number, conversionFactor?: number, mediaBox?: any, cropBox?: any}} [pdfPageDimensions] - Optional: PDF page dimensions from PDF.js API
 * @returns {Promise<Array>} Array of { pageNum, imageData (base64), width, height } or { pageNum, error }
 */
export async function renderAllPdfPagesCdp(pdfUrl, totalPages, scale = 2.0, pdfData = null, pdfPageDimensions = null, originalTabLayout = null) {
  const startTime = Date.now();
  log('[CDP Render] Rendering all PDF pages via CDP', { 
    pdfUrl, 
    totalPages, 
    scale,
    version: '2.0.0',
    note: 'NEW APPROACH: Opening PDF fresh for each page (navigation after load does not work)',
    hasPageDimensions: !!pdfPageDimensions,
    pageWidth: pdfPageDimensions?.width,
    pageHeight: pdfPageDimensions?.height
  });
  
  const images = [];
  const errors = [];
  const baseUrl = pdfUrl.split('#')[0];

  try {
    // CRITICAL: Process each page separately - open PDF fresh for each page
    // This is the ONLY reliable way to navigate to different pages
    // Chrome PDF viewer does NOT respond to Page.navigate with #page=N after PDF is loaded
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    // Check for cancellation before processing each page
    await checkCancellation(`CDP render page ${pageNum}`);
    
    const pageStartTime = Date.now();
    
    // NOTE: scale parameter is kept for API compatibility but not used for screenshot scaling
    // We capture screenshots without any scale factors and read actual dimensions from PNG
    const deviceScaleFactor = scale; // Kept for compatibility, not used for scaling
    let realDevicePixelRatio = deviceScaleFactor; // Kept for compatibility, not used for scaling
    
    log('[CDP Render] [BATCH] ===== PROCESSING PAGE =====', {
      pageNum,
      totalPages,
      progress: `${pageNum}/${totalPages}`,
      progressPercent: ((pageNum / totalPages) * 100).toFixed(1) + '%',
      timestamp: pageStartTime,
      NOTE: 'Opening PDF fresh for this page'
    });
    
    // Retry logic for page processing
    const MAX_PAGE_RETRIES = 4;
    const PAGE_RETRY_DELAYS = [2000, 5000, 10000, 20000]; // 2s, 5s, 10s, 20s
    let pageProcessed = false;
    let lastPageError = null;
    
    for (let retryAttempt = 0; retryAttempt <= MAX_PAGE_RETRIES && !pageProcessed; retryAttempt++) {
      let tab = null;
      let debuggerAttached = false;
      const debuggee = { tabId: null };
      
      if (retryAttempt > 0) {
        logWarn('[CDP Render] [BATCH] Retrying page processing', {
          pageNum,
          retryAttempt,
          maxRetries: MAX_PAGE_RETRIES,
          lastError: lastPageError?.message,
          delay: PAGE_RETRY_DELAYS[retryAttempt - 1],
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, PAGE_RETRY_DELAYS[retryAttempt - 1]));
      }
    
    try {
      // CRITICAL: Open PDF with page fragment in URL
      // This is the ONLY way to guarantee PDF opens on correct page
      const pageUrl = `${baseUrl}#page=${pageNum}`;
      
      log('[CDP Render] [BATCH] [STEP 1] Opening PDF for page...', {
        pageNum,
        pageUrl,
        timestamp: Date.now()
      });
      
      // Check for cancellation before opening tab
      await checkCancellation(`CDP render opening tab for page ${pageNum}`);
      
      // Open PDF with page fragment in URL
      tab = await chrome.tabs.create({
        url: pageUrl,
        active: false  // CRITICAL: Should be invisible
      });
      debuggee.tabId = tab.id;
      
      // Step 2: Wait for tab to load
      await waitForTabLoad(tab.id);
      
      // Step 3: Attach debugger
      await chrome.debugger.attach(debuggee, '1.3');
      debuggerAttached = true;

      // Step 4: Enable Page and Runtime domains
      await chrome.debugger.sendCommand(debuggee, 'Page.enable');
      await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
      
      
      // Step 4.5: Switch to tab, then reload page with correct URL
      // This ensures PDF is visible and properly navigated to correct page
      try {
        // Switch to the tab (make it active/visible)
        await chrome.tabs.update(tab.id, { active: true });
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Update URL hash first via JavaScript, then reload
        try {
          await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: `window.location.hash = '#page=${pageNum}'; window.location.hash;`,
            returnByValue: true
          });
        } catch (hashError) {
          logWarn('[CDP Render] [BATCH] Failed to update hash via JavaScript', {
            pageNum,
            error: hashError.message
          });
        }
        
        // Reload page using Page.reload via CDP
        try {
          await chrome.debugger.sendCommand(debuggee, 'Page.reload', {
            ignoreCache: false
          });
        } catch (reloadError) {
          logWarn('[CDP Render] [BATCH] Page.reload failed, trying chrome.tabs.reload...', {
            pageNum,
            error: reloadError.message
          });
          // Fallback: try chrome.tabs.reload
          try {
            await chrome.tabs.reload(tab.id);
          } catch (tabsReloadError) {
            logWarn('[CDP Render] [BATCH] chrome.tabs.reload also failed', {
              pageNum,
              error: tabsReloadError.message
            });
          }
        }
        
        // Wait for page to reload
        await waitForPageLoad(debuggee, pageNum);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reattach debugger if needed (may have been detached during reload)
        try {
          await ensureDebuggerAttached(debuggee, 5);
          await chrome.debugger.sendCommand(debuggee, 'Page.enable');
          await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
        } catch (attachError) {
          logWarn('[CDP Render] [BATCH] Failed to reattach debugger after reload', {
            pageNum,
            error: attachError.message
          });
          // Try one more time after additional delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            await ensureDebuggerAttached(debuggee, 3);
            await chrome.debugger.sendCommand(debuggee, 'Page.enable');
            await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
          } catch (retryError) {
            logError('[CDP Render] [BATCH] Failed to reattach debugger even after retry', {
              pageNum,
              error: retryError.message
            });
            throw retryError;
          }
        }
        
        // Wait 2.5 seconds after reload before screenshot
        await new Promise(resolve => setTimeout(resolve, 2500));
      } catch (reloadError) {
        logWarn('[CDP Render] [BATCH] Failed to reload page', {
          pageNum,
          error: reloadError.message
        });
        // Continue anyway - might still work
      }
      
      // Step 4.6: Collapse sidebar immediately after page loads
      // Chrome PDF viewer (PDFium) uses Shadow DOM for UI elements like sidebar
      // CDP DOM API with pierce: true can access Shadow DOM
      
      // Ensure debugger is attached before DOM operations
      try {
        await ensureDebuggerAttached(debuggee, 2);
      } catch (ensureError) {
        logWarn('[CDP Render] [BATCH] Failed to ensure debugger before DOM operations', {
          pageNum,
          error: ensureError.message
        });
        throw ensureError; // Fail if debugger can't be attached
      }
      
      // CRITICAL: After debugger reattachment, page is already loaded
      // Don't call waitForPageLoad here - it will hang because events already fired
      // Instead, just wait a short time for PDF to fully render (like old working version)
      log('[CDP Render] [BATCH] Waiting for PDF to fully render after debugger reattachment...', {
        pageNum,
        waitTime: 1000,
        note: 'Page is already loaded, just waiting for PDF rendering to complete'
      });
      
      // Check for cancellation before waiting
      await checkCancellation(`CDP render waiting for page ${pageNum} to render`);
      
      await sleep(1000);
        
      // Initialize viewport dimensions
      // CRITICAL: Use larger viewport to ensure full page capture
      // A4 page at 2x scale: width ~1200px, height ~1600px (full page)
      // But we want to capture only ONE page, so use 1000px height
      let viewportWidth = 1200;
      let viewportHeight = 1200; // Increased to ensure full page capture (will clip to 1000px for one page)
      const deviceScaleFactor = 2.0;
      
      // Initialize clip coordinates
      // Default: assume top 60px is UI (toolbar), rest is PDF
      let clipX = 0;
      let clipY = 60; // Skip toolbar
      
      // CRITICAL: Use PDF page dimensions from PDF.js API if available
      // These are exact dimensions from PDF metadata (not viewport)
      let clipWidth = viewportWidth;
      let clipHeight = 1000; // Fallback: fixed height for ONE full page
      
      if (pdfPageDimensions && pdfPageDimensions.width && pdfPageDimensions.height) {
        // CRITICAL: PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
        // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
        // Need to convert from 72 DPI (points) to 96 DPI (screen pixels)
        // Conversion factor: 96 / 72 = 1.333...
        const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333...
        // CRITICAL: Use viewportWidth (1200) instead of PDF.js width to avoid sidebar clipping
        clipWidth = viewportWidth; // Use full viewport width to avoid sidebar clipping
        // CRITICAL: Convert from PDF points (72 DPI) to screen pixels
        // Use only PDF.js dimensions, don't compare with viewport (viewport may be larger)
        // 96/72 = 1.333... (792 * 1.333 = 1053 pixels - correct height)
        const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
        clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
        
        criticalLog('[CDP Render] [BATCH] ✅ Using PDF page dimensions from PDF.js API (already in pixels)', 'PDF_CLIP_DIMENSIONS_FROM_PDFJS', {
          pageNum,
          tabId: tab.id,
          pdfjsWidth: pdfPageDimensions.width,
          pdfjsHeight: pdfPageDimensions.height,
          widthInPoints: pdfPageDimensions.widthInPoints,
          heightInPoints: pdfPageDimensions.heightInPoints,
          conversionFactor: pdfPageDimensions.conversionFactor,
          clipWidth: clipWidth,
          clipHeight: clipHeight,
          aspectRatio: (clipWidth / clipHeight).toFixed(4),
          mediaBox: pdfPageDimensions.mediaBox,
          cropBox: pdfPageDimensions.cropBox,
          note: `PDF.js dimensions converted from points (72 DPI) to pixels (96 DPI) using factor 1.333...`,
          timestamp: Date.now()
        });
      } else {
        criticalLog('[CDP Render] [BATCH] ⚠️ PDF page dimensions not available, using fallback', 'PDF_CLIP_DIMENSIONS_FALLBACK', {
          pageNum,
          tabId: tab.id,
          hasPdfPageDimensions: !!pdfPageDimensions,
          fallbackWidth: clipWidth,
          fallbackHeight: clipHeight,
          timestamp: Date.now()
        });
      }
      
      criticalLog('[CDP Render] [BATCH] 🎯 INITIAL CLIP VALUES SET', 'PDF_CLIP_INITIAL', {
        pageNum,
        tabId: tab.id,
        initialClipX: clipX,
        initialClipY: clipY,
        initialClipWidth: clipWidth,
        initialClipHeight: clipHeight,
        viewportWidth: viewportWidth,
        viewportHeight: viewportHeight,
        usingPdfjsDimensions: !!(pdfPageDimensions && pdfPageDimensions.width && pdfPageDimensions.height),
        pdfjsWidth: pdfPageDimensions?.width,
        pdfjsHeight: pdfPageDimensions?.height,
        note: pdfPageDimensions && pdfPageDimensions.width && pdfPageDimensions.height 
          ? 'Using exact dimensions from PDF.js API' 
          : 'Using fallback dimensions (hardcoded 1000px height)',
        timestamp: Date.now()
      });
      
        
        // CRITICAL: Find PDF content area coordinates to capture only PDF, not UI
        // Chrome PDF viewer has UI elements (sidebar, top bar) that we need to exclude
        // Declare pdfContentAreaFromCdp outside try block so it's accessible everywhere
        let pdfContentAreaFromCdp = null;
        let pdfArea = null; // Declared here for wider scope
        
        try {
          log('[CDP Render] [BATCH] Finding PDF content area coordinates...', {
            pageNum,
            timestamp: Date.now()
          });
          
          // Enable Runtime and DOM domains to find PDF content area
          await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
          await chrome.debugger.sendCommand(debuggee, 'DOM.enable');
          
          // Get document root
          /** @type {any} */
          const documentResult = await chrome.debugger.sendCommand(
            debuggee,
            'DOM.getDocument',
            { depth: 3 }
          );
          
          // CRITICAL: Find PDF content area using CDP DOM methods (works even if Runtime.evaluate fails)
          try {
            if (documentResult && documentResult.root) {
              const rootNodeId = documentResult.root.nodeId;
              
              // CRITICAL: Try multiple methods to find PDF content area
              // Chrome PDF viewer may use plugin/iframe, but we can find container elements
              let contentNode = null;
              
              // CRITICAL: Method 1: Try to find div#content FIRST (usually accessible, excludes sidebar)
              // div#content is the PDF content container that excludes UI elements (toolbar, sidebar)
              // embed element may be in isolated plugin context and not accessible via CDP DOM
              const containerSelectors = [
                'div#content',
                '#content',
                'div[id="content"]',
                '[id="content"]'
              ];
              
              for (const selector of containerSelectors) {
                try {
                  /** @type {any} */
                  const queryResult = await chrome.debugger.sendCommand(
                    debuggee,
                    'DOM.querySelector',
                    { nodeId: rootNodeId, selector: selector }
                  );
                  if (queryResult && queryResult.nodeId) {
                    contentNode = queryResult.nodeId;
                    criticalLog('[CDP Render] [BATCH] ✅ Found PDF container div#content (excludes sidebar)', 'PDF_CONTAINER_FOUND', {
                      pageNum,
                      tabId: tab.id,
                      selector: selector,
                      nodeId: contentNode,
                      note: 'div#content is the PDF content area that excludes UI elements (toolbar, sidebar)',
                      timestamp: Date.now()
                    });
                    break;
                  }
                } catch (e) {
                  // Continue to next selector
                }
              }
              
              // Method 2: If div#content not found, try embed element (may be in isolated plugin context)
              // NOTE: embed element may not be accessible via CDP DOM if in isolated plugin context
              if (!contentNode) {
                const embedSelectors = [
                  'embed[type="application/x-google-chrome-pdf"]',
                  'embed[type*="chrome-pdf"]',
                  'embed[type*="pdf"]',
                  'embed#plugin',
                  'embed[id="plugin"]',
                  '#plugin',
                  'embed'
                ];
              
                for (const selector of embedSelectors) {
                  try {
                    /** @type {any} */
                    const queryResult = await chrome.debugger.sendCommand(
                      debuggee,
                      'DOM.querySelector',
                      { nodeId: rootNodeId, selector: selector }
                    );
                    if (queryResult && queryResult.nodeId) {
                      contentNode = queryResult.nodeId;
                      criticalLog('[CDP Render] [BATCH] ⚠️ Found PDF container via selector (may include sidebar)', 'PDF_CONTAINER_FOUND', {
                        pageNum,
                        tabId: tab.id,
                        selector: selector,
                        nodeId: contentNode,
                        note: 'Container may include sidebar - less accurate than embed',
                        timestamp: Date.now()
                      });
                      break;
                    }
                  } catch (e) {
                    // Continue to next selector
                  }
                }
              }
              
              // Method 2: If querySelector failed, try DOM.performSearch
              if (!contentNode) {
                try {
                  /** @type {any} */
                  const searchResult = await chrome.debugger.sendCommand(
                    debuggee,
                    'DOM.performSearch',
                    { query: '#content, #plugin, embed, div[id="content"]' }
                  );
                  if (searchResult && searchResult.searchId) {
                    /** @type {any} */
                    const searchNodesResult = await chrome.debugger.sendCommand(
                      debuggee,
                      'DOM.getSearchResults',
                      { searchId: searchResult.searchId, fromIndex: 0, toIndex: 10 }
                    );
                    if (searchNodesResult && searchNodesResult.nodeIds && searchNodesResult.nodeIds.length > 0) {
                      // Try each found node to see which one is the PDF container
                      for (const nodeId of searchNodesResult.nodeIds) {
                        try {
                          /** @type {any} */
                          const nodeInfo = await chrome.debugger.sendCommand(
                            debuggee,
                            'DOM.describeNode',
                            { nodeId: nodeId }
                          );
                          if (nodeInfo && nodeInfo.node) {
                            const nodeName = nodeInfo.node.nodeName?.toLowerCase();
                            const nodeIdAttr = nodeInfo.node.attributes?.find(attr => attr.name === 'id');
                            // Prefer div#content or embed#plugin
                            if ((nodeName === 'div' && nodeIdAttr && nodeIdAttr.value === 'content') ||
                                (nodeName === 'embed' && (nodeIdAttr?.value === 'plugin' || nodeInfo.node.attributes?.some(attr => attr.name === 'type' && attr.value?.includes('pdf'))))) {
                              contentNode = nodeId;
                              criticalLog('[CDP Render] [BATCH] ✅ Found PDF container via DOM.performSearch', 'PDF_CONTAINER_FOUND_SEARCH', {
                                pageNum,
                                tabId: tab.id,
                                nodeId: contentNode,
                                nodeName: nodeName,
                                nodeIdAttr: nodeIdAttr?.value,
                                timestamp: Date.now()
                              });
                              break;
                            }
                          }
                        } catch (e) {
                          // Continue to next node
                        }
                      }
                      // Cleanup
                      try {
                        await chrome.debugger.sendCommand(debuggee, 'DOM.discardSearchResults', { searchId: searchResult.searchId });
                      } catch (e) {
                        // Non-critical: cleanup failure is acceptable, continue processing
                        // Log at debug level only to avoid noise
                        log('[CDP Render] Failed to discard search results (non-critical)', {
                          searchId: searchResult.searchId,
                          error: e.message
                        });
                      }
                    }
                  }
                } catch (e) {
                  logWarn('[CDP Render] [BATCH] DOM.performSearch failed', {
                    pageNum,
                    error: e.message,
                    timestamp: Date.now()
                  });
                }
              }
              
              // If found, get its coordinates
              if (contentNode) {
                try {
                  /** @type {any} */
                  const boxModelResult = await chrome.debugger.sendCommand(
                    debuggee,
                    'DOM.getBoxModel',
                    { nodeId: contentNode }
                  );
                  if (boxModelResult && boxModelResult.model && boxModelResult.model.content) {
                    const content = boxModelResult.model.content;
                    if (content.length >= 8) {
                      // content array: [x0, y0, x1, y1, x2, y2, x3, y3] (4 corners)
                      const x = Math.min(content[0], content[2], content[4], content[6]);
                      const y = Math.min(content[1], content[3], content[5], content[7]);
                      const width = Math.abs(content[2] - content[0]);
                      const height = Math.abs(content[5] - content[1]);
                      
                      pdfContentAreaFromCdp = {
                        found: true,
                        x: Math.round(x),
                        y: Math.round(y),
                        width: Math.round(width),
                        height: Math.round(height),
                        method: 'cdp_dom_boxModel'
                      };
                      
                      criticalLog('[CDP Render] [BATCH] ✅ PDF content area found via CDP DOM', 'PDF_CONTENT_AREA_CDP_FOUND', {
                        pageNum,
                        tabId: tab.id,
                        x: pdfContentAreaFromCdp.x,
                        y: pdfContentAreaFromCdp.y,
                        width: pdfContentAreaFromCdp.width,
                        height: pdfContentAreaFromCdp.height,
                        method: pdfContentAreaFromCdp.method,
                        timestamp: Date.now()
                      });
                    }
                  }
                } catch (e) {
                  // Try getContentQuads as fallback
                  try {
                    /** @type {any} */
                    const quadsResult = await chrome.debugger.sendCommand(
                      debuggee,
                      'DOM.getContentQuads',
                      { nodeId: contentNode }
                    );
                    if (quadsResult && quadsResult.quads && quadsResult.quads.length > 0) {
                      const quad = quadsResult.quads[0];
                      // quad: [x0, y0, x1, y1, x2, y2, x3, y3]
                      const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
                      const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
                      const width = Math.abs(quad[2] - quad[0]);
                      const height = Math.abs(quad[5] - quad[1]);
                      
                      pdfContentAreaFromCdp = {
                        found: true,
                        x: Math.round(x),
                        y: Math.round(y),
                        width: Math.round(width),
                        height: Math.round(height),
                        method: 'cdp_dom_contentQuads'
                      };
                      
                      criticalLog('[CDP Render] [BATCH] ✅ PDF content area found via CDP DOM (quads)', 'PDF_CONTENT_AREA_CDP_FOUND', {
                        pageNum,
                        tabId: tab.id,
                        x: pdfContentAreaFromCdp.x,
                        y: pdfContentAreaFromCdp.y,
                        width: pdfContentAreaFromCdp.width,
                        height: pdfContentAreaFromCdp.height,
                        method: pdfContentAreaFromCdp.method,
                        timestamp: Date.now()
                      });
                    }
                  } catch (e2) {
                    logWarn('[CDP Render] [BATCH] Failed to get PDF content area coordinates via CDP DOM', {
                      pageNum,
                      error: e2.message,
                      timestamp: Date.now()
                    });
                  }
                }
              } else {
                // CRITICAL: Log what we found in DOM for debugging
                try {
                  /** @type {any} */
                  const allNodesResult = await chrome.debugger.sendCommand(
                    debuggee,
                    'DOM.getDocument',
                    { depth: 5 }
                  );
                  if (allNodesResult && allNodesResult.root) {
                    // Try to get all element IDs and classes
                    /** @type {any} */
                    const searchAllResult = await chrome.debugger.sendCommand(
                      debuggee,
                      'DOM.performSearch',
                      { query: '*' }
                    );
                    if (searchAllResult && searchAllResult.searchId) {
                      /** @type {any} */
                      const allNodesSearchResult = await chrome.debugger.sendCommand(
                        debuggee,
                        'DOM.getSearchResults',
                        { searchId: searchAllResult.searchId, fromIndex: 0, toIndex: 50 }
                      );
                      if (allNodesSearchResult && allNodesSearchResult.nodeIds) {
                        const foundElements = [];
                        for (let i = 0; i < Math.min(allNodesSearchResult.nodeIds.length, 20); i++) {
                          try {
                            /** @type {any} */
                            const nodeInfo = await chrome.debugger.sendCommand(
                              debuggee,
                              'DOM.describeNode',
                              { nodeId: allNodesSearchResult.nodeIds[i] }
                            );
                            if (nodeInfo && nodeInfo.node) {
                              const nodeName = nodeInfo.node.nodeName?.toLowerCase();
                              const attrs = nodeInfo.node.attributes || [];
                              const idAttr = attrs.find(attr => attr.name === 'id');
                              const typeAttr = attrs.find(attr => attr.name === 'type');
                              if (nodeName && (idAttr || typeAttr || nodeName === 'embed' || nodeName === 'div')) {
                                foundElements.push({
                                  nodeName: nodeName,
                                  id: idAttr?.value,
                                  type: typeAttr?.value,
                                  attributes: attrs.map(a => `${a.name}="${a.value}"`).slice(0, 5)
                                });
                              }
                            }
                          } catch (e) {
                            // Expected: DOM.describeNode may fail for some nodeIds, continue to next node
                            // No logging needed - this is expected during DOM traversal
                          }
                        }
                        criticalLog('[CDP Render] [BATCH] 🔍 DOM structure analysis (PDF container not found)', 'PDF_DOM_STRUCTURE_ANALYSIS', {
                          pageNum,
                          tabId: tab.id,
                          foundElements: foundElements,
                          totalNodes: allNodesSearchResult.nodeIds.length,
                          note: 'PDF container (div#content or embed#plugin) not found - showing available DOM elements',
                          timestamp: Date.now()
                        });
                        // Cleanup
                        try {
                          await chrome.debugger.sendCommand(debuggee, 'DOM.discardSearchResults', { searchId: searchAllResult.searchId });
                        } catch (e) {
                          // Non-critical: cleanup failure is acceptable, continue processing
                          log('[CDP Render] Failed to discard search results (non-critical)', {
                            searchId: searchAllResult.searchId,
                            error: e.message
                          });
                        }
                      }
                    }
                  }
                } catch (e) {
                  logWarn('[CDP Render] [BATCH] Failed to analyze DOM structure', {
                    pageNum,
                    error: e.message,
                    timestamp: Date.now()
                  });
                }
                
                logWarn('[CDP Render] [BATCH] PDF content area elements not found via CDP DOM', {
                  pageNum,
                  note: 'div#content and embed#plugin not found - PDF may be in isolated plugin/iframe',
                  timestamp: Date.now()
                });
              }
            }
          } catch (e) {
            logWarn('[CDP Render] [BATCH] Failed to find PDF content area via CDP DOM', {
              pageNum,
              error: e.message,
              timestamp: Date.now()
            });
          }
          
          // CRITICAL: Get viewport dimensions via CDP (works even if DOM methods fail)
          /** @type {any} */
          let layoutMetrics = null;
          try {
            layoutMetrics = await chrome.debugger.sendCommand(
              debuggee,
              'Page.getLayoutMetrics',
              {}
            );
          } catch (e) {
            log('[CDP Render] [BATCH] Failed to get layout metrics via CDP', { error: e.message, pageNum });
          }
          
          // CRITICAL: Get additional CDP measurements via different CDP domains
          const cdpAdditionalMeasurements = {};
          
          // CDP Method: DOM.getBoxModel for body element
          try {
            if (documentResult && documentResult.root) {
              const bodyNodeId = documentResult.root.nodeId;
              /** @type {any} */
              const boxModelResult = await chrome.debugger.sendCommand(
                debuggee,
                'DOM.getBoxModel',
                { nodeId: bodyNodeId }
              );
              if (boxModelResult && boxModelResult.model && boxModelResult.model.content) {
                const content = boxModelResult.model.content;
                if (content.length >= 4) {
                  const width = Math.abs(content[2] - content[0]);
                  const height = Math.abs(content[5] - content[1]);
                  cdpAdditionalMeasurements['cdp_dom_boxModel_body'] = { width: Math.round(width), height: Math.round(height) };
                }
              }
            }
          } catch (e) {
            // Expected: DOM.getBoxModel may fail if node is not available, continue with other methods
            // No logging needed - this is expected during DOM measurement attempts
          }
          
          // CDP Method: DOM.getContentQuads for body element
          try {
            if (documentResult && documentResult.root) {
              const bodyNodeId = documentResult.root.nodeId;
              /** @type {any} */
              const quadsResult = await chrome.debugger.sendCommand(
                debuggee,
                'DOM.getContentQuads',
                { nodeId: bodyNodeId }
              );
              if (quadsResult && quadsResult.quads && quadsResult.quads.length > 0) {
                const quad = quadsResult.quads[0];
                if (quad.length >= 8) {
                  const width = Math.abs(quad[2] - quad[0]);
                  const height = Math.abs(quad[5] - quad[1]);
                  cdpAdditionalMeasurements['cdp_dom_contentQuads_body'] = { width: Math.round(width), height: Math.round(height) };
                }
              }
            }
          } catch (e) {
            // Expected: DOM.getContentQuads may fail if node is not available, continue with other methods
            // No logging needed - this is expected during DOM measurement attempts
          }
          
          // CDP Method: Runtime.evaluate for screen dimensions
          try {
            /** @type {any} */
            const screenResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `({
                  screenWidth: window.screen.width,
                  screenHeight: window.screen.height,
                  screenAvailWidth: window.screen.availWidth,
                  screenAvailHeight: window.screen.availHeight,
                  screenColorDepth: window.screen.colorDepth,
                  screenPixelDepth: window.screen.pixelDepth
                })`,
                returnByValue: true
              }
            );
            if (screenResult && screenResult.result && screenResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_screen'] = screenResult.result.value;
            }
          } catch (e) {
            // Expected: Runtime.evaluate may fail if script execution is blocked, continue with other methods
            // No logging needed - this is expected during measurement attempts
          }
          
          // CDP Method: Runtime.evaluate for visual viewport API
          try {
            /** @type {any} */
            const visualViewportResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(window.visualViewport ? {
                  width: window.visualViewport.width,
                  height: window.visualViewport.height,
                  offsetLeft: window.visualViewport.offsetLeft,
                  offsetTop: window.visualViewport.offsetTop,
                  pageLeft: window.visualViewport.pageLeft,
                  pageTop: window.visualViewport.pageTop,
                  scale: window.visualViewport.scale
                } : null)`,
                returnByValue: true
              }
            );
            if (visualViewportResult && visualViewportResult.result && visualViewportResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_visualViewport'] = visualViewportResult.result.value;
            }
          } catch (e) {
            // Expected: Runtime.evaluate may fail if visualViewport API is not available, continue with other methods
            // No logging needed - this is expected during measurement attempts
          }
          
          // CDP Method: Runtime.evaluate for device pixel ratio and related
          try {
            /** @type {any} */
            const devicePixelRatioResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `({
                  devicePixelRatio: window.devicePixelRatio,
                  innerWidth: window.innerWidth,
                  innerHeight: window.innerHeight,
                  outerWidth: window.outerWidth,
                  outerHeight: window.outerHeight,
                  screenX: window.screenX,
                  screenY: window.screenY,
                  screenLeft: window.screenLeft,
                  screenTop: window.screenTop
                })`,
                returnByValue: true
              }
            );
            if (devicePixelRatioResult && devicePixelRatioResult.result && devicePixelRatioResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_devicePixelRatio'] = devicePixelRatioResult.result.value;
            }
          } catch (e) {
            // Expected: Runtime.evaluate may fail if script execution is blocked, continue with other methods
            // No logging needed - this is expected during measurement attempts
          }
          
          // CDP Method: Runtime.evaluate for PDF.js API (if available in page context)
          try {
            /** @type {any} */
            const pdfjsResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(function() {
                  try {
                    // Try to access PDF.js from various global objects
                    const pdfjs = window.pdfjsLib || window.PDFJS || self.pdfjsLib || self.PDFJS;
                    if (pdfjs && pdfjs.getDocument) {
                      return {
                        hasPdfjs: true,
                        version: pdfjs.version || 'unknown',
                        hasGetDocument: typeof pdfjs.getDocument === 'function'
                      };
                    }
                    return { hasPdfjs: false };
                  } catch (e) {
                    return { hasPdfjs: false, error: e.message };
                  }
                })()`,
                returnByValue: true
              }
            );
            if (pdfjsResult && pdfjsResult.result && pdfjsResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_pdfjs'] = pdfjsResult.result.value;
            }
          } catch (e) {
            // Expected: PDF.js API may not be available, continue with other methods
            // No logging needed - this is expected when PDF.js is not loaded
          }
          
          // CDP Method: Runtime.evaluate to get PDF page dimensions from PDF.js (if document is loaded)
          try {
            /** @type {any} */
            const pdfjsPageDimensionsResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(function() {
                  try {
                    const pdfjs = window.pdfjsLib || window.PDFJS || self.pdfjsLib || self.PDFJS;
                    if (!pdfjs || !pdfjs.getDocument) {
                      return { hasPdfjs: false };
                    }
                    
                    // Try to get current PDF document and page
                    // Chrome PDF viewer might have PDF.js instance
                    const viewer = document.querySelector('.pdfViewer') || 
                                 document.querySelector('[class*="viewer"]') ||
                                 document.querySelector('[id*="viewer"]');
                    
                    if (viewer) {
                      // Try to get page dimensions from viewer
                      const pages = viewer.querySelectorAll('.page') || viewer.querySelectorAll('[class*="page"]');
                      if (pages && pages.length > 0) {
                        const firstPage = pages[0];
                        const rect = firstPage.getBoundingClientRect();
                        return {
                          hasPdfjs: true,
                          hasViewer: true,
                          pagesCount: pages.length,
                          firstPageWidth: Math.round(rect.width),
                          firstPageHeight: Math.round(rect.height),
                          firstPageX: Math.round(rect.x),
                          firstPageY: Math.round(rect.y)
                        };
                      }
                    }
                    
                    return { hasPdfjs: true, hasViewer: false };
                  } catch (e) {
                    return { hasPdfjs: false, error: e.message };
                  }
                })()`,
                returnByValue: true
              }
            );
            if (pdfjsPageDimensionsResult && pdfjsPageDimensionsResult.result && pdfjsPageDimensionsResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_pdfjsPageDimensions'] = pdfjsPageDimensionsResult.result.value;
            }
          } catch (e) {
            // Expected: PDF.js page dimensions may not be available, continue with other methods
            // No logging needed - this is expected when PDF.js document is not loaded
          }
          
          // CDP Method: DOM.getDocument with deeper depth to find PDF content
          try {
            /** @type {any} */
            const deepDocumentResult = await chrome.debugger.sendCommand(
              debuggee,
              'DOM.getDocument',
              { depth: 10 }
            );
            if (deepDocumentResult && deepDocumentResult.root) {
              // Search for PDF-related nodes
              /** @type {any} */
              const searchResult = await chrome.debugger.sendCommand(
                debuggee,
                'DOM.performSearch',
                { query: 'canvas,embed,object,iframe' }
              );
              if (searchResult && searchResult.searchId) {
                /** @type {any} */
                const searchNodesResult = await chrome.debugger.sendCommand(
                  debuggee,
                  'DOM.getSearchResults',
                  { searchId: searchResult.searchId, fromIndex: 0, toIndex: 100 }
                );
                if (searchNodesResult && searchNodesResult.nodeIds && searchNodesResult.nodeIds.length > 0) {
                  const nodeIds = searchNodesResult.nodeIds;
                  const nodeResults = [];
                  for (let i = 0; i < Math.min(nodeIds.length, 10); i++) {
                    try {
                      /** @type {any} */
                      const nodeResult = await chrome.debugger.sendCommand(
                        debuggee,
                        'DOM.getBoxModel',
                        { nodeId: nodeIds[i] }
                      );
                      if (nodeResult && nodeResult.model && nodeResult.model.content) {
                        const content = nodeResult.model.content;
                        if (content.length >= 8) {
                          const width = Math.abs(content[2] - content[0]);
                          const height = Math.abs(content[5] - content[1]);
                          nodeResults.push({ nodeId: nodeIds[i], width: Math.round(width), height: Math.round(height) });
                        }
                      }
                    } catch (e) {
                      // Expected: DOM.getBoxModel may fail for some nodeIds, continue to next node
                      // No logging needed - this is expected during DOM traversal
                    }
                  }
                  if (nodeResults.length > 0) {
                    cdpAdditionalMeasurements['cdp_dom_pdfElements'] = nodeResults;
                  }
                  // Cleanup
                  try {
                    await chrome.debugger.sendCommand(debuggee, 'DOM.discardSearchResults', { searchId: searchResult.searchId });
                  } catch (e) {
                    // Non-critical: cleanup failure is acceptable, continue processing
                    log('[CDP Render] Failed to discard search results (non-critical)', {
                      searchId: searchResult.searchId,
                      error: e.message
                    });
                  }
                }
              }
            }
          } catch (e) {
            // Expected: DOM.getDocument or DOM operations may fail, continue with other methods
            // No logging needed - this is expected during DOM measurement attempts
          }
          
          // CDP Method: CSS.getComputedStyle for body and html elements
          try {
            if (documentResult && documentResult.root) {
              const bodyNodeId = documentResult.root.nodeId;
              // Get body node
              /** @type {any} */
              const bodyNodesResult = await chrome.debugger.sendCommand(
                debuggee,
                'DOM.querySelector',
                { nodeId: bodyNodeId, selector: 'body' }
              );
              if (bodyNodesResult && bodyNodesResult.nodeId) {
                /** @type {any} */
                const computedStyleResult = await chrome.debugger.sendCommand(
                  debuggee,
                  'CSS.getComputedStyleForNode',
                  { nodeId: bodyNodesResult.nodeId }
                );
                if (computedStyleResult && computedStyleResult.computedStyle) {
                  const widthProp = computedStyleResult.computedStyle.find(p => p.name === 'width');
                  const heightProp = computedStyleResult.computedStyle.find(p => p.name === 'height');
                  if (widthProp || heightProp) {
                    cdpAdditionalMeasurements['cdp_css_bodyComputedStyle'] = {
                      width: widthProp ? widthProp.value : null,
                      height: heightProp ? heightProp.value : null
                    };
                  }
                }
              }
            }
          } catch (e) {
            // Expected: CSS.getComputedStyle may fail if elements are not available, continue with other methods
            // No logging needed - this is expected during DOM measurement attempts
          }
          
          // CDP Method: Overlay.getHighlightObjectForTest (if available)
          try {
            await chrome.debugger.sendCommand(debuggee, 'Overlay.enable', {});
            // This might give us information about highlighted elements
          } catch (e) {
            // Expected: Overlay API may not be available, continue without it
            // No logging needed - this is expected when Overlay domain is not supported
          }
          
          // CDP Method: Runtime.evaluate to get PDF.js document instance and page dimensions
          try {
            /** @type {any} */
            const pdfjsDocumentResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(function() {
                  try {
                    // Try to access PDF.js document from Chrome PDF viewer
                    // Chrome PDF viewer uses PDF.js internally
                    const pdfjs = window.pdfjsLib || window.PDFJS;
                    if (!pdfjs) {
                      return { hasPdfjs: false };
                    }
                    
                    // Try to find PDF document instance in global scope
                    // Chrome PDF viewer might store it
                    let pdfDoc = null;
                    let currentPage = null;
                    
                    // Try various ways to access PDF document
                    if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                      pdfDoc = window.PDFViewerApplication.pdfDocument;
                      if (window.PDFViewerApplication.page) {
                        currentPage = window.PDFViewerApplication.page;
                      }
                    } else if (window.PDFViewer && window.PDFViewer.pdfDocument) {
                      pdfDoc = window.PDFViewer.pdfDocument;
                    }
                    
                    if (pdfDoc && currentPage) {
                      try {
                        const viewport = currentPage.getViewport({ scale: 1.0 });
                        return {
                          hasPdfjs: true,
                          hasDocument: true,
                          hasPage: true,
                          pageWidth: Math.round(viewport.width),
                          pageHeight: Math.round(viewport.height),
                          scale: viewport.scale
                        };
                      } catch (e) {
                        return { hasPdfjs: true, hasDocument: true, hasPage: false, error: e.message };
                      }
                    }
                    
                    return { hasPdfjs: true, hasDocument: !!pdfDoc, hasPage: false };
                  } catch (e) {
                    return { hasPdfjs: false, error: e.message };
                  }
                })()`,
                returnByValue: true
              }
            );
            if (pdfjsDocumentResult && pdfjsDocumentResult.result && pdfjsDocumentResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_pdfjsDocument'] = pdfjsDocumentResult.result.value;
            }
          } catch (e) {
            // Expected: PDF.js document may not be available, continue with other methods
            // No logging needed - this is expected when PDF.js document is not loaded
          }
          
          // CDP Method: Runtime.evaluate to get PDF page number from URL and calculate dimensions
          try {
            /** @type {any} */
            const pdfUrlPageResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(function() {
                  try {
                    const url = window.location.href;
                    const pageMatch = url.match(/[#&]page=(\\d+)/);
                    const currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;
                    
                    // Try to get PDF dimensions from embed or object element
                    const embed = document.querySelector('embed[type*="pdf"]') || 
                                 document.querySelector('object[type*="pdf"]') ||
                                 document.querySelector('#plugin');
                    
                    if (embed) {
                      const rect = embed.getBoundingClientRect();
                      return {
                        currentPage: currentPage,
                        hasEmbed: true,
                        embedWidth: Math.round(rect.width),
                        embedHeight: Math.round(rect.height),
                        embedX: Math.round(rect.x),
                        embedY: Math.round(rect.y)
                      };
                    }
                    
                    return { currentPage: currentPage, hasEmbed: false };
                  } catch (e) {
                    return { error: e.message };
                  }
                })()`,
                returnByValue: true
              }
            );
            if (pdfUrlPageResult && pdfUrlPageResult.result && pdfUrlPageResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_pdfUrlPage'] = pdfUrlPageResult.result.value;
            }
          } catch (e) {
            // Expected: Runtime.evaluate may fail if script execution is blocked, continue with other methods
            // No logging needed - this is expected during measurement attempts
          }
          
          // CDP Method: Runtime.evaluate to get PDF page dimensions from Chrome PDF viewer internal API
          try {
            /** @type {any} */
            const chromePdfViewerResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `(function() {
                  try {
                    // Chrome PDF viewer might expose dimensions through various APIs
                    const results = {};
                    
                    // Method 1: Try PDFViewerApplication
                    if (window.PDFViewerApplication) {
                      if (window.PDFViewerApplication.page) {
                        const page = window.PDFViewerApplication.page;
                        if (page.viewport) {
                          results.pdfViewerAppViewport = {
                            width: Math.round(page.viewport.width),
                            height: Math.round(page.viewport.height),
                            scale: page.viewport.scale
                          };
                        }
                        if (page.width && page.height) {
                          results.pdfViewerAppPage = {
                            width: Math.round(page.width),
                            height: Math.round(page.height)
                          };
                        }
                      }
                      if (window.PDFViewerApplication.pdfDocument) {
                        results.hasPdfDocument = true;
                      }
                    }
                    
                    // Method 2: Try PDFViewer
                    if (window.PDFViewer) {
                      if (window.PDFViewer.pdfDocument) {
                        results.hasPdfViewer = true;
                      }
                    }
                    
                    // Method 3: Try to find page element
                    const pageElement = document.querySelector('.page') || 
                                      document.querySelector('[class*="page"]') ||
                                      document.querySelector('[id*="page"]');
                    if (pageElement) {
                      const rect = pageElement.getBoundingClientRect();
                      results.pageElement = {
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y)
                      };
                    }
                    
                    return Object.keys(results).length > 0 ? results : { found: false };
                  } catch (e) {
                    return { error: e.message };
                  }
                })()`,
                returnByValue: true
              }
            );
            if (chromePdfViewerResult && chromePdfViewerResult.result && chromePdfViewerResult.result.value) {
              cdpAdditionalMeasurements['cdp_runtime_chromePdfViewer'] = chromePdfViewerResult.result.value;
            }
          } catch (e) {
            // Expected: Chrome PDF viewer API may not be available, continue with other methods
            // No logging needed - this is expected when Chrome PDF viewer API is not accessible
          }
          
          // Find PDF viewer embed element and its content area
          // Chrome PDF viewer uses <embed> element for PDF content
          let findResult = null;
          let evaluateError = null;
          try {
            findResult = await chrome.debugger.sendCommand(
            debuggee,
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  try {
                    // Chrome PDF viewer structure:
                    // - <div id="content"> contains the PDF embed (without UI)
                    // - <embed id="plugin" type="application/x-google-chrome-pdf"> contains the actual PDF
                    // - UI elements (toolbar, sidebar) are outside div#content
                    // - original-url attribute contains the original file URL with page fragment
                    
                    // First, try to find div#content (this is the PDF content area without UI)
                    let pdfContainer = document.querySelector('div#content');
                    
                    // If not found, try alternative selectors
                    if (!pdfContainer) {
                      pdfContainer = document.querySelector('#content') ||
                                     document.querySelector('div[id="content"]') ||
                                     document.querySelector('[id="content"]');
                    }
                    
                    // If not found, try to find the embed directly
                    let embed = null;
                    if (!pdfContainer) {
                      // Try Chrome's built-in PDF viewer embed first - try multiple selectors
                      embed = document.querySelector('embed[type="application/x-google-chrome-pdf"]') ||
                              document.querySelector('embed#plugin') ||
                              document.querySelector('#plugin') ||
                              document.querySelector('embed[id="plugin"]') ||
                              document.querySelector('embed[type*="chrome-pdf"]') ||
                              document.querySelector('embed[type*="pdf"]');
                      
                      // Fallback to standard PDF embed
                      if (!embed) {
                        embed = document.querySelector('embed[type="application/pdf"]') ||
                                document.querySelector('embed');
                      }
                      
                      if (embed) {
                        // Try to find parent div#content
                        pdfContainer = embed.closest('div#content') ||
                                      embed.closest('#content') ||
                                      embed.closest('div[id="content"]') ||
                                      embed.parentElement;
                      }
                    } else {
                      // If we found div#content, get the embed inside it
                      embed = pdfContainer.querySelector('embed[type="application/x-google-chrome-pdf"]') ||
                              pdfContainer.querySelector('embed#plugin') ||
                              pdfContainer.querySelector('#plugin') ||
                              pdfContainer.querySelector('embed[id="plugin"]') ||
                              pdfContainer.querySelector('embed[type*="chrome-pdf"]') ||
                              pdfContainer.querySelector('embed[type="application/pdf"]') ||
                              pdfContainer.querySelector('embed');
                    }
                    
                    if (pdfContainer || embed) {
                      // Get bounding rect - prefer div#content as it excludes UI
                      const containerRect = pdfContainer ? pdfContainer.getBoundingClientRect() : null;
                      const embedRect = embed ? embed.getBoundingClientRect() : null;
                      
                      // Get viewport dimensions
                      const vw = window.innerWidth;
                      const vh = window.innerHeight;
                      
                      // Get original-url from embed to check current page
                      let originalUrl = null;
                      let currentPage = null;
                      if (embed && embed.hasAttribute('original-url')) {
                        originalUrl = embed.getAttribute('original-url');
                        const pageMatch = originalUrl.match(/page=(\\d+)/);
                        currentPage = pageMatch ? parseInt(pageMatch[1]) : null;
                      }
                      
                      // CRITICAL: Try multiple methods to get REAL PDF page width
                      // Method 1: From canvas element (if PDF.js is used)
                      let pdfPageWidthMethod1 = null;
                      try {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          pdfPageWidthMethod1 = Math.round(canvas.width || canvas.offsetWidth || canvas.clientWidth || 0);
                        }
                      } catch (e) {
                        // Expected: canvas element may not exist or properties may be inaccessible, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 2: From embed's naturalWidth (if available)
                      let pdfPageWidthMethod2 = null;
                      try {
                        if (embed && embed.naturalWidth) {
                          pdfPageWidthMethod2 = Math.round(embed.naturalWidth);
                        }
                      } catch (e) {
                        // Expected: embed.naturalWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 3: From embed's scrollWidth (actual content width)
                      let pdfPageWidthMethod3 = null;
                      try {
                        if (embed && embed.scrollWidth) {
                          pdfPageWidthMethod3 = Math.round(embed.scrollWidth);
                        }
                      } catch (e) {
                        // Expected: embed.scrollWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 4: From container's scrollWidth (if container exists)
                      let pdfPageWidthMethod4 = null;
                      try {
                        if (pdfContainer && pdfContainer.scrollWidth) {
                          pdfPageWidthMethod4 = Math.round(pdfContainer.scrollWidth);
                        }
                      } catch (e) {
                        // Expected: container.scrollWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 5: From computed style width of embed (actual rendered width)
                      let pdfPageWidthMethod5 = null;
                      try {
                        if (embed) {
                          const computedStyle = window.getComputedStyle(embed);
                          const widthStr = computedStyle.width;
                          if (widthStr && widthStr !== 'auto') {
                            pdfPageWidthMethod5 = Math.round(parseFloat(widthStr));
                          }
                        }
                      } catch (e) {
                        // Expected: getComputedStyle may fail or return invalid values, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 6: From first visible PDF content element (div with PDF content)
                      let pdfPageWidthMethod6 = null;
                      try {
                        const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"]');
                        for (const el of pdfContentElements) {
                          const rect = el.getBoundingClientRect();
                          if (rect.width > 100 && rect.width < 5000) {
                            pdfPageWidthMethod6 = Math.round(rect.width);
                            break;
                          }
                        }
                      } catch (e) {
                        // Expected: elements may not exist or getBoundingClientRect may fail, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 7: Calculate from aspect ratio (if we know height)
                      // A4 aspect ratio: width/height = 210/297 = 0.707
                      // If height is 2000px (from clipHeight), width should be ~1414px
                      // But we need actual PDF page aspect ratio, not A4
                      let pdfPageWidthMethod7 = null;
                      try {
                        // Try to get actual PDF page dimensions from embed attributes or metadata
                        if (embed) {
                          // Chrome PDF viewer might have page dimensions in data attributes
                          const pageWidthAttr = embed.getAttribute('data-page-width') || 
                                               embed.getAttribute('page-width') ||
                                               embed.getAttribute('width');
                          if (pageWidthAttr) {
                            pdfPageWidthMethod7 = Math.round(parseFloat(pageWidthAttr));
                          }
                        }
                      } catch (e) {
                        // Expected: data-page-width attribute may not exist, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 8: From body/document scrollWidth (if PDF takes full width)
                      let pdfPageWidthMethod8 = null;
                      try {
                        const bodyScrollWidth = document.body.scrollWidth;
                        const docScrollWidth = document.documentElement.scrollWidth;
                        // Use the smaller one (usually more accurate)
                        if (bodyScrollWidth > 0 && bodyScrollWidth < 10000) {
                          pdfPageWidthMethod8 = Math.round(bodyScrollWidth);
                        } else if (docScrollWidth > 0 && docScrollWidth < 10000) {
                          pdfPageWidthMethod8 = Math.round(docScrollWidth);
                        }
                      } catch (e) {
                        // Expected: scrollWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 9: From embed's offsetWidth (layout width)
                      let pdfPageWidthMethod9 = null;
                      try {
                        if (embed && embed.offsetWidth) {
                          pdfPageWidthMethod9 = Math.round(embed.offsetWidth);
                        }
                      } catch (e) {
                        // Expected: embed.offsetWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 10: From container's offsetWidth (if container exists)
                      let pdfPageWidthMethod10 = null;
                      try {
                        if (pdfContainer && pdfContainer.offsetWidth) {
                          pdfPageWidthMethod10 = Math.round(pdfContainer.offsetWidth);
                        }
                      } catch (e) {
                        // Expected: container.offsetWidth may not be available, continue with other methods
                        // No logging needed - this is expected during width measurement attempts
                      }
                      
                      // Method 11: From PDF.js API - PDFViewerApplication.page.viewport.width
                      let pdfPageWidthMethod11 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.viewport && page.viewport.width) {
                            pdfPageWidthMethod11 = Math.round(page.viewport.width);
                          } else if (page.width) {
                            pdfPageWidthMethod11 = Math.round(page.width);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js API may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js is not loaded
                      }
                      
                      // Method 12: From PDF.js API - PDFViewerApplication.pdfDocument.getPage().getViewport()
                      let pdfPageWidthMethod12 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page.getViewport) {
                              const viewport = page.getViewport({ scale: 1.0 });
                              if (viewport && viewport.width) {
                                pdfPageWidthMethod12 = Math.round(viewport.width);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js global API may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js is not loaded
                      }
                      
                      // Method 13: From PDF.js global - pdfjsLib.getDocument().getPage().getViewport()
                      let pdfPageWidthMethod13 = null;
                      try {
                        const pdfjs = window.pdfjsLib || window.PDFJS;
                        if (pdfjs && pdfjs.getDocument) {
                          // Try to get current document from global scope
                          if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                            const pdfDoc = window.PDFViewerApplication.pdfDocument;
                            const currentPageNum = window.PDFViewerApplication.page || 1;
                            if (pdfDoc.getPage) {
                              const page = await pdfDoc.getPage(currentPageNum);
                              if (page && page.getViewport) {
                                const viewport = page.getViewport({ scale: 1.0 });
                                if (viewport && viewport.width) {
                                  pdfPageWidthMethod13 = Math.round(viewport.width);
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: getSVGDocument may not be available or may fail, continue with other methods
                        // No logging needed - this is expected when SVG document is not accessible
                      }
                      
                      // Method 14: From Chrome PDF viewer plugin API (if accessible)
                      let pdfPageWidthMethod14 = null;
                      try {
                        if (embed && embed.getSVGDocument) {
                          const svgDoc = embed.getSVGDocument();
                          if (svgDoc) {
                            const svg = svgDoc.documentElement;
                            if (svg && svg.viewBox) {
                              pdfPageWidthMethod14 = Math.round(svg.viewBox.baseVal.width);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js mediaBox/cropBox may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 15: From PDF.js page.mediaBox or page.cropBox
                      let pdfPageWidthMethod15 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page) {
                              // Try mediaBox (full page) or cropBox (visible area)
                              const mediaBox = page.mediaBox || page.cropBox;
                              if (mediaBox && mediaBox.length >= 4) {
                                // mediaBox = [x, y, width, height]
                                pdfPageWidthMethod15 = Math.round(mediaBox[2] - mediaBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js viewport calculation may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 16: From PDF.js page.rotate and viewport calculation
                      let pdfPageWidthMethod16 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page.getViewport) {
                              const viewport = page.getViewport({ scale: 1.0, rotation: 0 });
                              if (viewport && viewport.width) {
                                pdfPageWidthMethod16 = Math.round(viewport.width);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page properties may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 17: From PDF.js page.originalWidth (if available)
                      let pdfPageWidthMethod17 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.originalWidth) {
                            pdfPageWidthMethod17 = Math.round(page.originalWidth);
                          } else if (page.width) {
                            pdfPageWidthMethod17 = Math.round(page.width);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page.view may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 18: From PDF.js PDFPageProxy.view array (if available)
                      let pdfPageWidthMethod18 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page.view) {
                              const view = page.view;
                              if (view.length >= 4) {
                                // view = [x, y, width, height]
                                pdfPageWidthMethod18 = Math.round(view[2] - view[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page.obj dictionary may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 19: From PDF.js page.obj dictionary (if accessible)
                      let pdfPageWidthMethod19 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page.obj && page.obj.dict) {
                              const dict = page.obj.dict;
                              const mediaBox = dict.get('MediaBox');
                              if (mediaBox && mediaBox.length >= 4) {
                                pdfPageWidthMethod19 = Math.round(mediaBox[2] - mediaBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js internal _pageInfo may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 20: From PDF.js page._pageInfo (internal, if accessible)
                      let pdfPageWidthMethod20 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfo) {
                              const pageInfo = page._pageInfo;
                              if (pageInfo.view) {
                                const view = pageInfo.view;
                                if (view.length >= 4) {
                                  pdfPageWidthMethod20 = Math.round(view[2] - view[0]);
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js internal _transport may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 21: From PDF.js page._transport (internal, if accessible)
                      let pdfPageWidthMethod21 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._transport && page._transport.messageHandler) {
                              // Try to get page info from transport
                              const pageInfo = page._transport.messageHandler.pageInfo;
                              if (pageInfo && pageInfo.view) {
                                const view = pageInfo.view;
                                if (view.length >= 4) {
                                  pdfPageWidthMethod21 = Math.round(view[2] - view[0]);
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js internal _pageIndex or _pdfInfo may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 22: From PDF.js page._pageIndex and document._pdfInfo
                      let pdfPageWidthMethod22 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageIndex !== undefined) {
                              const pageIndex = page._pageIndex;
                              if (pdfDoc._pdfInfo && pdfDoc._pdfInfo.pageInfo) {
                                const pageInfo = pdfDoc._pdfInfo.pageInfo[pageIndex];
                                if (pageInfo && pageInfo.view) {
                                  const view = pageInfo.view;
                                  if (view.length >= 4) {
                                    pdfPageWidthMethod22 = Math.round(view[2] - view[0]);
                                  }
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoPromise may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 23: From PDF.js page._pageInfoPromise (async, if available)
                      let pdfPageWidthMethod23 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoPromise) {
                              const pageInfo = await page._pageInfoPromise;
                              if (pageInfo && pageInfo.view) {
                                const view = pageInfo.view;
                                if (view.length >= 4) {
                                  pdfPageWidthMethod23 = Math.round(view[2] - view[0]);
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 24: From PDF.js page._pageInfoDict (if accessible)
                      let pdfPageWidthMethod24 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const mediaBox = dict.get('MediaBox');
                              if (mediaBox && mediaBox.length >= 4) {
                                pdfPageWidthMethod24 = Math.round(mediaBox[2] - mediaBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 25: From PDF.js page._pageInfoDict.get('CropBox') or get('MediaBox')
                      let pdfPageWidthMethod25 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const cropBox = dict.get('CropBox') || dict.get('MediaBox');
                              if (cropBox && cropBox.length >= 4) {
                                pdfPageWidthMethod25 = Math.round(cropBox[2] - cropBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 26: From PDF.js page._pageInfoDict.get('ArtBox') or get('BleedBox')
                      let pdfPageWidthMethod26 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const artBox = dict.get('ArtBox') || dict.get('BleedBox') || dict.get('TrimBox');
                              if (artBox && artBox.length >= 4) {
                                pdfPageWidthMethod26 = Math.round(artBox[2] - artBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 27: From PDF.js page._pageInfoDict.get('Rotate') and calculate from MediaBox
                      let pdfPageWidthMethod27 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const mediaBox = dict.get('MediaBox');
                              const rotate = dict.get('Rotate') || 0;
                              if (mediaBox && mediaBox.length >= 4) {
                                const width = mediaBox[2] - mediaBox[0];
                                const height = mediaBox[3] - mediaBox[1];
                                // If rotated 90 or 270 degrees, swap width and height
                                if (rotate === 90 || rotate === 270) {
                                  pdfPageWidthMethod27 = Math.round(height);
                                } else {
                                  pdfPageWidthMethod27 = Math.round(width);
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 28: From PDF.js page._pageInfoDict.get('UserUnit') and calculate
                      let pdfPageWidthMethod28 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const mediaBox = dict.get('MediaBox');
                              const userUnit = dict.get('UserUnit') || 1.0;
                              if (mediaBox && mediaBox.length >= 4) {
                                const width = (mediaBox[2] - mediaBox[0]) * userUnit;
                                pdfPageWidthMethod28 = Math.round(width);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 29: From PDF.js page._pageInfoDict.get('Resources') and calculate from XObject
                      let pdfPageWidthMethod29 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const mediaBox = dict.get('MediaBox');
                              if (mediaBox && mediaBox.length >= 4) {
                                pdfPageWidthMethod29 = Math.round(mediaBox[2] - mediaBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 30: From PDF.js page._pageInfoDict.get('Contents') and parse stream
                      let pdfPageWidthMethod30 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                          const pdfDoc = window.PDFViewerApplication.pdfDocument;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfDoc.getPage) {
                            const page = await pdfDoc.getPage(currentPageNum);
                            if (page && page._pageInfoDict) {
                              const dict = page._pageInfoDict;
                              const mediaBox = dict.get('MediaBox');
                              if (mediaBox && mediaBox.length >= 4) {
                                pdfPageWidthMethod30 = Math.round(mediaBox[2] - mediaBox[0]);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // ========== HEIGHT MEASUREMENT METHODS ==========
                      // Method 1: From canvas element height (if PDF.js is used)
                      let pdfPageHeightMethod1 = null;
                      try {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          pdfPageHeightMethod1 = Math.round(canvas.height || canvas.offsetHeight || canvas.clientHeight || 0);
                        }
                      } catch (e) {
                        // Expected: canvas element may not exist or properties may be inaccessible, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 2: From embed's naturalHeight (if available)
                      let pdfPageHeightMethod2 = null;
                      try {
                        if (embed && embed.naturalHeight) {
                          pdfPageHeightMethod2 = Math.round(embed.naturalHeight);
                        }
                      } catch (e) {
                        // Expected: embed.naturalHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 3: From embed's scrollHeight (actual content height)
                      let pdfPageHeightMethod3 = null;
                      try {
                        if (embed && embed.scrollHeight) {
                          pdfPageHeightMethod3 = Math.round(embed.scrollHeight);
                        }
                      } catch (e) {
                        // Expected: embed.scrollHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 4: From container's scrollHeight (if container exists)
                      let pdfPageHeightMethod4 = null;
                      try {
                        if (pdfContainer && pdfContainer.scrollHeight) {
                          pdfPageHeightMethod4 = Math.round(pdfContainer.scrollHeight);
                        }
                      } catch (e) {
                        // Expected: container.scrollHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 5: From computed style height of embed (actual rendered height)
                      let pdfPageHeightMethod5 = null;
                      try {
                        if (embed) {
                          const computedStyle = window.getComputedStyle(embed);
                          const heightStr = computedStyle.height;
                          if (heightStr && heightStr !== 'auto') {
                            pdfPageHeightMethod5 = Math.round(parseFloat(heightStr));
                          }
                        }
                      } catch (e) {
                        // Expected: getComputedStyle may fail or return invalid values, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 6: From first visible PDF content element height
                      let pdfPageHeightMethod6 = null;
                      try {
                        const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"]');
                        for (const el of pdfContentElements) {
                          const rect = el.getBoundingClientRect();
                          if (rect.height > 100 && rect.height < 10000) {
                            pdfPageHeightMethod6 = Math.round(rect.height);
                            break;
                          }
                        }
                      } catch (e) {
                        // Expected: elements may not exist or getBoundingClientRect may fail, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 7: From embed data attributes
                      let pdfPageHeightMethod7 = null;
                      try {
                        if (embed) {
                          const pageHeightAttr = embed.getAttribute('data-page-height') || 
                                               embed.getAttribute('page-height') ||
                                               embed.getAttribute('height');
                          if (pageHeightAttr) {
                            pdfPageHeightMethod7 = Math.round(parseFloat(pageHeightAttr));
                          }
                        }
                      } catch (e) {
                        // Expected: data-page-height attribute may not exist, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 8: From body/document scrollHeight
                      let pdfPageHeightMethod8 = null;
                      try {
                        const bodyScrollHeight = document.body.scrollHeight;
                        const docScrollHeight = document.documentElement.scrollHeight;
                        if (bodyScrollHeight > 0 && bodyScrollHeight < 20000) {
                          pdfPageHeightMethod8 = Math.round(bodyScrollHeight);
                        } else if (docScrollHeight > 0 && docScrollHeight < 20000) {
                          pdfPageHeightMethod8 = Math.round(docScrollHeight);
                        }
                      } catch (e) {
                        // Expected: scrollHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 9: From embed's offsetHeight (layout height)
                      let pdfPageHeightMethod9 = null;
                      try {
                        if (embed && embed.offsetHeight) {
                          pdfPageHeightMethod9 = Math.round(embed.offsetHeight);
                        }
                      } catch (e) {
                        // Expected: embed.offsetHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 10: From container's offsetHeight (if container exists)
                      let pdfPageHeightMethod10 = null;
                      try {
                        if (pdfContainer && pdfContainer.offsetHeight) {
                          pdfPageHeightMethod10 = Math.round(pdfContainer.offsetHeight);
                        }
                      } catch (e) {
                        // Expected: container.offsetHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 11: From embed's clientHeight
                      let pdfPageHeightMethod11 = null;
                      try {
                        if (embed && embed.clientHeight) {
                          pdfPageHeightMethod11 = Math.round(embed.clientHeight);
                        }
                      } catch (e) {
                        // Expected: embed.clientHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 12: From container's clientHeight
                      let pdfPageHeightMethod12 = null;
                      try {
                        if (pdfContainer && pdfContainer.clientHeight) {
                          pdfPageHeightMethod12 = Math.round(pdfContainer.clientHeight);
                        }
                      } catch (e) {
                        // Expected: container.clientHeight may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 13: From getBoundingClientRect height (embed)
                      let pdfPageHeightMethod13 = null;
                      try {
                        if (embedRect) {
                          pdfPageHeightMethod13 = Math.round(embedRect.height);
                        }
                      } catch (e) {
                        // Expected: embedRect may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 14: From getBoundingClientRect height (container)
                      let pdfPageHeightMethod14 = null;
                      try {
                        if (containerRect) {
                          pdfPageHeightMethod14 = Math.round(containerRect.height);
                        }
                      } catch (e) {
                        // Expected: containerRect may not be available, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 15: Estimate height from viewport (independent from width)
                      // Similar to method10_estimatedFromViewport for width, but for height
                      let pdfPageHeightMethod15 = null;
                      try {
                        const vh = window.innerHeight;
                        // Target heights from known ratios: 2000, 1000, 1607
                        const targetHeights = [2000, 1000, 1607, 1200, 1400, 1600];
                        for (const targetHeight of targetHeights) {
                          // Check if viewport height is close to target (within 90% of viewport)
                          if (targetHeight < vh * 0.95 && targetHeight > vh * 0.3) {
                            pdfPageHeightMethod15 = targetHeight;
                            break;
                          }
                        }
                      } catch (e) {
                        // Expected: viewport calculations may fail, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 16: Calculate height from viewport using target aspect ratios (independent)
                      let pdfPageHeightMethod16 = null;
                      try {
                        const vh = window.innerHeight;
                        const vw = window.innerWidth;
                        const viewportRatio = vw / vh;
                        // Target ratios: 1635/2000 = 0.8175, 814/1000 = 0.814, 1308/1607 = 0.8144
                        const targetRatios = [
                          { name: 'ratio_1635x2000', ratio: 1635/2000, height: 2000 },
                          { name: 'ratio_814x1000', ratio: 814/1000, height: 1000 },
                          { name: 'ratio_1308x1607', ratio: 1308/1607, height: 1607 }
                        ];
                        // Find closest matching ratio
                        let closestRatio = null;
                        let minDiff = Infinity;
                        for (const targetRatio of targetRatios) {
                          const diff = Math.abs(viewportRatio - targetRatio.ratio);
                          if (diff < minDiff) {
                            minDiff = diff;
                            closestRatio = targetRatio;
                          }
                        }
                        // If viewport ratio matches a target ratio, use corresponding height
                        if (closestRatio && minDiff < 0.1) {
                          pdfPageHeightMethod16 = closestRatio.height;
                        }
                      } catch (e) {
                        // Expected: viewport ratio calculations may fail, continue with other methods
                        // No logging needed - this is expected during height measurement attempts
                      }
                      
                      // Method 17: Calculate height independently from viewport width using target ratios
                      // This calculates height independently, not using bestWidth
                      let pdfPageHeightMethod17 = null;
                      try {
                        const vw = window.innerWidth;
                        if (vw > 100 && vw < 5000) {
                          const targetRatios = [
                            { name: 'ratio_1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                            { name: 'ratio_814x1000', ratio: 814/1000, width: 814, height: 1000 },
                            { name: 'ratio_1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
                          ];
                          // Find which target width is closest to viewport width
                          let closestRatio = null;
                          let minDiff = Infinity;
                          for (const targetRatio of targetRatios) {
                            const diff = Math.abs((vw / targetRatio.width) - 1);
                            if (diff < minDiff) {
                              minDiff = diff;
                              closestRatio = targetRatio;
                            }
                          }
                          // If viewport width matches a target width, calculate height independently
                          if (closestRatio && minDiff < 0.2) {
                            const scale = vw / closestRatio.width;
                            pdfPageHeightMethod17 = Math.round(closestRatio.height * scale);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 18: From PDF.js API - PDFViewerApplication.page.viewport.height (synchronous)
                      let pdfPageHeightMethod18 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.viewport && page.viewport.height) {
                            pdfPageHeightMethod18 = Math.round(page.viewport.height);
                          } else if (page.height) {
                            pdfPageHeightMethod18 = Math.round(page.height);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page properties may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 19: From PDF.js page.originalHeight (if available, synchronous)
                      let pdfPageHeightMethod19 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.originalHeight) {
                            pdfPageHeightMethod19 = Math.round(page.originalHeight);
                          } else if (page.height) {
                            pdfPageHeightMethod19 = Math.round(page.height);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page properties may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 20: From Chrome PDF viewer plugin API getSVGDocument (synchronous)
                      let pdfPageHeightMethod20 = null;
                      try {
                        if (embed && embed.getSVGDocument) {
                          const svgDoc = embed.getSVGDocument();
                          if (svgDoc) {
                            const svg = svgDoc.documentElement;
                            if (svg && svg.viewBox) {
                              pdfPageHeightMethod20 = Math.round(svg.viewBox.baseVal.height);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: getSVGDocument may not be available or may fail, continue with other methods
                        // No logging needed - this is expected when SVG document is not accessible
                      }
                      
                      // Method 21: From PDF.js page._pageInfo view height (if already loaded, synchronous)
                      let pdfPageHeightMethod21 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._pageInfo && page._pageInfo.view) {
                            const view = page._pageInfo.view;
                            if (view.length >= 4) {
                              pdfPageHeightMethod21 = Math.round(view[3] - view[1]);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js internal _pageInfo may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 22: From PDF.js page._transport messageHandler.pageInfo view height (if available)
                      let pdfPageHeightMethod22 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._transport && page._transport.messageHandler && page._transport.messageHandler.pageInfo) {
                            const pageInfo = page._transport.messageHandler.pageInfo;
                            if (pageInfo.view && pageInfo.view.length >= 4) {
                              pdfPageHeightMethod22 = Math.round(pageInfo.view[3] - pageInfo.view[1]);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js internal _transport may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 23: From PDF.js page._pageInfoDict MediaBox height (if accessible, synchronous)
                      let pdfPageHeightMethod23 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._pageInfoDict) {
                            const dict = page._pageInfoDict;
                            const mediaBox = dict.get('MediaBox');
                            if (mediaBox && mediaBox.length >= 4) {
                              pdfPageHeightMethod23 = Math.round(mediaBox[3] - mediaBox[1]);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 24: From PDF.js page._pageInfoDict CropBox or MediaBox height
                      let pdfPageHeightMethod24 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._pageInfoDict) {
                            const dict = page._pageInfoDict;
                            const cropBox = dict.get('CropBox') || dict.get('MediaBox');
                            if (cropBox && cropBox.length >= 4) {
                              pdfPageHeightMethod24 = Math.round(cropBox[3] - cropBox[1]);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 25: From PDF.js page._pageInfoDict Rotate and calculate from MediaBox height
                      let pdfPageHeightMethod25 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._pageInfoDict) {
                            const dict = page._pageInfoDict;
                            const mediaBox = dict.get('MediaBox');
                            const rotate = dict.get('Rotate') || 0;
                            if (mediaBox && mediaBox.length >= 4) {
                              const width = mediaBox[2] - mediaBox[0];
                              const height = mediaBox[3] - mediaBox[1];
                              // If rotated 90 or 270 degrees, swap width and height
                              if (rotate === 90 || rotate === 270) {
                                pdfPageHeightMethod25 = Math.round(width);
                              } else {
                                pdfPageHeightMethod25 = Math.round(height);
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 26: From PDF.js page._pageInfoDict UserUnit and calculate height
                      let pdfPageHeightMethod26 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page._pageInfoDict) {
                            const dict = page._pageInfoDict;
                            const mediaBox = dict.get('MediaBox');
                            const userUnit = dict.get('UserUnit') || 1.0;
                            if (mediaBox && mediaBox.length >= 4) {
                              const height = (mediaBox[3] - mediaBox[1]) * userUnit;
                              pdfPageHeightMethod26 = Math.round(height);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js _pageInfoDict.get may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 27: From PDF.js page.obj dictionary MediaBox height (if accessible)
                      let pdfPageHeightMethod27 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.obj && page.obj.dict) {
                            const dict = page.obj.dict;
                            const mediaBox = dict.get('MediaBox');
                            if (mediaBox && mediaBox.length >= 4) {
                              pdfPageHeightMethod27 = Math.round(mediaBox[3] - mediaBox[1]);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page.obj dictionary may not be accessible, continue with other methods
                        // No logging needed - this is expected when PDF.js internal structures are not available
                      }
                      
                      // Method 28: From PDF.js page.view array height (if available)
                      let pdfPageHeightMethod28 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          if (page.view && page.view.length >= 4) {
                            pdfPageHeightMethod28 = Math.round(page.view[3] - page.view[1]);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page.view may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 29: From PDF.js page.mediaBox or page.cropBox height (if available)
                      let pdfPageHeightMethod29 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.page) {
                          const page = window.PDFViewerApplication.page;
                          const mediaBox = page.mediaBox || page.cropBox;
                          if (mediaBox && mediaBox.length >= 4) {
                            pdfPageHeightMethod29 = Math.round(mediaBox[3] - mediaBox[1]);
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js page.mediaBox/cropBox may not be available, continue with other methods
                        // No logging needed - this is expected when PDF.js page is not loaded
                      }
                      
                      // Method 30: From PDF.js PDFViewerApplication.pdfViewer.getPageView() height
                      let pdfPageHeightMethod30 = null;
                      try {
                        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
                          const pdfViewer = window.PDFViewerApplication.pdfViewer;
                          const currentPageNum = window.PDFViewerApplication.page || 1;
                          if (pdfViewer.getPageView) {
                            const pageView = pdfViewer.getPageView(currentPageNum - 1);
                            if (pageView && pageView.viewport) {
                              pdfPageHeightMethod30 = Math.round(pageView.viewport.height);
                            } else if (pageView && pageView.height) {
                              pdfPageHeightMethod30 = Math.round(pageView.height);
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: PDF.js pdfViewer.getPageView may fail, continue with other methods
                        // No logging needed - this is expected when PDF.js viewer is not available
                      }
                      
                      // ========== COMBINED WIDTH x HEIGHT MEASUREMENT METHODS ==========
                      // Method 1: Canvas width x height
                      let pdfPageDimensionsMethod1 = null;
                      try {
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                          const w = Math.round(canvas.width || canvas.offsetWidth || canvas.clientWidth || 0);
                          const h = Math.round(canvas.height || canvas.offsetHeight || canvas.clientHeight || 0);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod1 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: canvas element may not exist or properties may be inaccessible, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 2: Embed naturalWidth x naturalHeight
                      let pdfPageDimensionsMethod2 = null;
                      try {
                        if (embed && embed.naturalWidth && embed.naturalHeight) {
                          const w = Math.round(embed.naturalWidth);
                          const h = Math.round(embed.naturalHeight);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod2 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: embed.naturalWidth/naturalHeight may not be available, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 3: Embed scrollWidth x scrollHeight
                      let pdfPageDimensionsMethod3 = null;
                      try {
                        if (embed && embed.scrollWidth && embed.scrollHeight) {
                          const w = Math.round(embed.scrollWidth);
                          const h = Math.round(embed.scrollHeight);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod3 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: embed.scrollWidth/scrollHeight may not be available, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 4: Container scrollWidth x scrollHeight
                      let pdfPageDimensionsMethod4 = null;
                      try {
                        if (pdfContainer && pdfContainer.scrollWidth && pdfContainer.scrollHeight) {
                          const w = Math.round(pdfContainer.scrollWidth);
                          const h = Math.round(pdfContainer.scrollHeight);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod4 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: container.scrollWidth/scrollHeight may not be available, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 5: Embed getBoundingClientRect
                      let pdfPageDimensionsMethod5 = null;
                      try {
                        if (embedRect) {
                          const w = Math.round(embedRect.width);
                          const h = Math.round(embedRect.height);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod5 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: embedRect may not be available, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 6: Container getBoundingClientRect
                      let pdfPageDimensionsMethod6 = null;
                      try {
                        if (containerRect) {
                          const w = Math.round(containerRect.width);
                          const h = Math.round(containerRect.height);
                          if (w > 0 && h > 0) {
                            pdfPageDimensionsMethod6 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          }
                        }
                      } catch (e) {
                        // Expected: containerRect may not be available, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 7: Computed style width x height (embed)
                      let pdfPageDimensionsMethod7 = null;
                      try {
                        if (embed) {
                          const computedStyle = window.getComputedStyle(embed);
                          const wStr = computedStyle.width;
                          const hStr = computedStyle.height;
                          if (wStr && hStr && wStr !== 'auto' && hStr !== 'auto') {
                            const w = Math.round(parseFloat(wStr));
                            const h = Math.round(parseFloat(hStr));
                            if (w > 0 && h > 0) {
                              pdfPageDimensionsMethod7 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                            }
                          }
                        }
                      } catch (e) {
                        // Expected: getComputedStyle may fail or return invalid values, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 8: PDF content element rect
                      let pdfPageDimensionsMethod8 = null;
                      try {
                        const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"]');
                        for (const el of pdfContentElements) {
                          const rect = el.getBoundingClientRect();
                          if (rect.width > 100 && rect.width < 5000 && rect.height > 100 && rect.height < 10000) {
                            const w = Math.round(rect.width);
                            const h = Math.round(rect.height);
                            pdfPageDimensionsMethod8 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                            break;
                          }
                        }
                      } catch (e) {
                        // Expected: elements may not exist or getBoundingClientRect may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // ========== ASPECT RATIO BASED CALCULATIONS ==========
                      // Calculate dimensions based on known aspect ratios
                      // Target ratios: 1635/2000 = 0.8175, 814/1000 = 0.814, 1308/1607 = 0.8144
                      const targetAspectRatios = [
                        { name: 'ratio_1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                        { name: 'ratio_814x1000', ratio: 814/1000, width: 814, height: 1000 },
                        { name: 'ratio_1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
                      ];
                      
                      // Method 9: Calculate height from best width using target ratios
                      let pdfPageDimensionsMethod9 = null;
                      try {
                        if (bestWidth && bestWidth > 100 && bestWidth < 5000) {
                          // Find closest matching ratio
                          let closestRatio = null;
                          let minDiff = Infinity;
                          for (const targetRatio of targetAspectRatios) {
                            const diff = Math.abs((bestWidth / targetRatio.width) - 1);
                            if (diff < minDiff) {
                              minDiff = diff;
                              closestRatio = targetRatio;
                            }
                          }
                          if (closestRatio && minDiff < 0.1) {
                            // Scale height proportionally
                            const scale = bestWidth / closestRatio.width;
                            const h = Math.round(closestRatio.height * scale);
                            pdfPageDimensionsMethod9 = { 
                              width: bestWidth, 
                              height: h, 
                              aspectRatio: (bestWidth / h).toFixed(4),
                              basedOnRatio: closestRatio.name,
                              scale: scale.toFixed(4)
                            };
                          }
                        }
                      } catch (e) {
                        // Expected: aspect ratio calculations may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 10: Calculate width from best height using target ratios
                      let pdfPageDimensionsMethod10 = null;
                      try {
                        // Try to get best height from available methods
                        const bestHeight = pdfPageHeightMethod1 || pdfPageHeightMethod2 || pdfPageHeightMethod3 || 
                                         pdfPageHeightMethod4 || pdfPageHeightMethod13 || pdfPageHeightMethod14;
                        if (bestHeight && bestHeight > 100 && bestHeight < 10000) {
                          // Find closest matching ratio
                          let closestRatio = null;
                          let minDiff = Infinity;
                          for (const targetRatio of targetAspectRatios) {
                            const diff = Math.abs((bestHeight / targetRatio.height) - 1);
                            if (diff < minDiff) {
                              minDiff = diff;
                              closestRatio = targetRatio;
                            }
                          }
                          if (closestRatio && minDiff < 0.1) {
                            // Scale width proportionally
                            const scale = bestHeight / closestRatio.height;
                            const w = Math.round(closestRatio.width * scale);
                            pdfPageDimensionsMethod10 = { 
                              width: w, 
                              height: bestHeight, 
                              aspectRatio: (w / bestHeight).toFixed(4),
                              basedOnRatio: closestRatio.name,
                              scale: scale.toFixed(4)
                            };
                          }
                        }
                      } catch (e) {
                        // Expected: aspect ratio calculations may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 11: Direct combination of best width and best height (if both available)
                      let pdfPageDimensionsMethod11 = null;
                      try {
                        if (bestWidth && bestWidth > 100 && bestWidth < 5000) {
                          const bestHeight = pdfPageHeightMethod1 || pdfPageHeightMethod2 || pdfPageHeightMethod3 || 
                                           pdfPageHeightMethod4 || pdfPageHeightMethod13 || pdfPageHeightMethod14 ||
                                           pdfPageHeightMethod8 || pdfPageHeightMethod6;
                          if (bestHeight && bestHeight > 100 && bestHeight < 10000) {
                            pdfPageDimensionsMethod11 = { 
                              width: bestWidth, 
                              height: bestHeight, 
                              aspectRatio: (bestWidth / bestHeight).toFixed(4),
                              basedOnRatio: 'direct_measurement',
                              widthSource: 'bestWidth',
                              heightSource: 'bestHeight'
                            };
                          }
                        }
                      } catch (e) {
                        // Expected: dimension combination may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 12: Calculate height from best width using target ratios (relaxed threshold)
                      let pdfPageDimensionsMethod12 = null;
                      try {
                        if (bestWidth && bestWidth > 100 && bestWidth < 5000) {
                          // Find closest matching ratio with relaxed threshold
                          let closestRatio = null;
                          let minDiff = Infinity;
                          for (const targetRatio of targetAspectRatios) {
                            const diff = Math.abs((bestWidth / targetRatio.width) - 1);
                            if (diff < minDiff) {
                              minDiff = diff;
                              closestRatio = targetRatio;
                            }
                          }
                          // Relaxed threshold: allow up to 20% difference
                          if (closestRatio && minDiff < 0.2) {
                            const scale = bestWidth / closestRatio.width;
                            const h = Math.round(closestRatio.height * scale);
                            pdfPageDimensionsMethod12 = { 
                              width: bestWidth, 
                              height: h, 
                              aspectRatio: (bestWidth / h).toFixed(4),
                              basedOnRatio: closestRatio.name,
                              scale: scale.toFixed(4),
                              widthDiff: (minDiff * 100).toFixed(2) + '%'
                            };
                          }
                        }
                      } catch (e) {
                        // Expected: aspect ratio calculations may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Method 13: Calculate dimensions from viewport using target ratios
                      let pdfPageDimensionsMethod13 = null;
                      try {
                        if (vw > 100 && vw < 5000 && vh > 100 && vh < 10000) {
                          // Find closest matching ratio for viewport
                          const viewportRatio = vw / vh;
                          let closestRatio = null;
                          let minDiff = Infinity;
                          for (const targetRatio of targetAspectRatios) {
                            const diff = Math.abs(viewportRatio - targetRatio.ratio);
                            if (diff < minDiff) {
                              minDiff = diff;
                              closestRatio = targetRatio;
                            }
                          }
                          if (closestRatio && minDiff < 0.1) {
                            pdfPageDimensionsMethod13 = { 
                              width: vw, 
                              height: vh, 
                              aspectRatio: viewportRatio.toFixed(4),
                              basedOnRatio: closestRatio.name,
                              ratioDiff: minDiff.toFixed(4)
                            };
                          }
                        }
                      } catch (e) {
                        // Expected: viewport ratio calculations may fail, continue with other methods
                        // No logging needed - this is expected during dimension measurement attempts
                      }
                      
                      // Collect all width methods results FIRST (needed for bestWidth calculation)
                      const pdfPageWidthMethods = {
                        method1_canvas: pdfPageWidthMethod1,
                        method2_naturalWidth: pdfPageWidthMethod2,
                        method3_embedScrollWidth: pdfPageWidthMethod3,
                        method4_containerScrollWidth: pdfPageWidthMethod4,
                        method5_computedStyle: pdfPageWidthMethod5,
                        method6_pdfContentElement: pdfPageWidthMethod6,
                        method7_dataAttributes: pdfPageWidthMethod7,
                        method8_bodyScrollWidth: pdfPageWidthMethod8,
                        method9_embedOffsetWidth: pdfPageWidthMethod9,
                        method10_containerOffsetWidth: pdfPageWidthMethod10,
                        method11_pdfjsViewerAppViewport: pdfPageWidthMethod11,
                        method12_pdfjsDocumentViewport: pdfPageWidthMethod12,
                        method13_pdfjsGlobalViewport: pdfPageWidthMethod13,
                        method14_chromePluginSvg: pdfPageWidthMethod14,
                        method15_pdfjsMediaBox: pdfPageWidthMethod15,
                        method16_pdfjsViewportRotate: pdfPageWidthMethod16,
                        method17_pdfjsOriginalWidth: pdfPageWidthMethod17,
                        method18_pdfjsViewArray: pdfPageWidthMethod18,
                        method19_pdfjsObjDict: pdfPageWidthMethod19,
                        method20_pdfjsPageInfo: pdfPageWidthMethod20,
                        method21_pdfjsTransport: pdfPageWidthMethod21,
                        method22_pdfjsPageIndex: pdfPageWidthMethod22,
                        method23_pdfjsPageInfoPromise: pdfPageWidthMethod23,
                        method24_pdfjsPageInfoDict: pdfPageWidthMethod24,
                        method25_pdfjsCropBox: pdfPageWidthMethod25,
                        method26_pdfjsArtBox: pdfPageWidthMethod26,
                        method27_pdfjsRotate: pdfPageWidthMethod27,
                        method28_pdfjsUserUnit: pdfPageWidthMethod28,
                        method29_pdfjsResources: pdfPageWidthMethod29,
                        method30_pdfjsContents: pdfPageWidthMethod30
                      };
                      
                      // CRITICAL: Calculate bestWidth BEFORE using it in dimension methods
                      // Find the best width value (prefer non-null, reasonable values)
                      // Priority: methods that give actual PDF content width (not viewport/container width)
                      // Prefer: scrollWidth, naturalWidth, canvas width (actual content)
                      // Avoid: viewport width, container width (may include UI)
                      let bestWidth = null;
                      let bestMethod = null;
                      let bestPriority = -1;
                      
                      // Priority order (higher = better):
                      // 1. canvas width (actual rendered PDF)
                      // 2. naturalWidth (natural size of embed)
                      // 3. scrollWidth (actual content width)
                      // 4. computed style (rendered width)
                      // 5. offsetWidth (layout width)
                      // 6. data attributes (if available)
                      const methodPriorities = {
                        method1_canvas: 10,
                        method2_naturalWidth: 9,
                        method3_embedScrollWidth: 8,
                        method4_containerScrollWidth: 7,
                        method5_computedStyle: 6,
                        method9_embedOffsetWidth: 5,
                        method10_containerOffsetWidth: 4,
                        method7_dataAttributes: 3,
                        method6_pdfContentElement: 2,
                        method8_bodyScrollWidth: 1
                      };
                      
                      for (const [method, value] of Object.entries(pdfPageWidthMethods)) {
                        if (value && value > 100 && value < 5000) {
                          const priority = methodPriorities[method] || 0;
                          // Prefer higher priority methods, or if same priority, prefer smaller values (more likely to be actual PDF width, not viewport)
                          if (priority > bestPriority || (priority === bestPriority && value < bestWidth)) {
                            bestPriority = priority;
                            bestWidth = value;
                            bestMethod = method;
                          }
                        }
                      }
                      
                      // If no method found a good value, use containerWidth or embedWidth as fallback
                      if (!bestWidth) {
                        bestWidth = containerRect ? Math.round(containerRect.width) : (embedRect ? Math.round(embedRect.width) : vw);
                        bestMethod = 'fallback_containerOrEmbed';
                      }
                      
                      const pdfPageHeightMethods = {
                        method1_canvas: pdfPageHeightMethod1,
                        method2_naturalHeight: pdfPageHeightMethod2,
                        method3_embedScrollHeight: pdfPageHeightMethod3,
                        method4_containerScrollHeight: pdfPageHeightMethod4,
                        method5_computedStyle: pdfPageHeightMethod5,
                        method6_pdfContentElement: pdfPageHeightMethod6,
                        method7_dataAttributes: pdfPageHeightMethod7,
                        method8_bodyScrollHeight: pdfPageHeightMethod8,
                        method9_embedOffsetHeight: pdfPageHeightMethod9,
                        method10_containerOffsetHeight: pdfPageHeightMethod10,
                        method11_embedClientHeight: pdfPageHeightMethod11,
                        method12_containerClientHeight: pdfPageHeightMethod12,
                        method13_embedBoundingRect: pdfPageHeightMethod13,
                        method14_containerBoundingRect: pdfPageHeightMethod14,
                        method15_estimatedFromViewport: pdfPageHeightMethod15,
                        method16_viewportRatioBased: pdfPageHeightMethod16,
                        method17_independentWidthBased: pdfPageHeightMethod17,
                        method18_pdfjsViewerAppViewport: pdfPageHeightMethod18,
                        method19_pdfjsOriginalHeight: pdfPageHeightMethod19,
                        method20_chromePluginSvg: pdfPageHeightMethod20,
                        method21_pdfjsPageInfo: pdfPageHeightMethod21,
                        method22_pdfjsTransport: pdfPageHeightMethod22,
                        method23_pdfjsPageInfoDict: pdfPageHeightMethod23,
                        method24_pdfjsCropBox: pdfPageHeightMethod24,
                        method25_pdfjsRotate: pdfPageHeightMethod25,
                        method26_pdfjsUserUnit: pdfPageHeightMethod26,
                        method27_pdfjsObjDict: pdfPageHeightMethod27,
                        method28_pdfjsViewArray: pdfPageHeightMethod28,
                        method29_pdfjsMediaBox: pdfPageHeightMethod29,
                        method30_pdfjsPageView: pdfPageHeightMethod30
                      };
                      
                      const pdfPageDimensionsMethods = {
                        method1_canvas: pdfPageDimensionsMethod1,
                        method2_natural: pdfPageDimensionsMethod2,
                        method3_embedScroll: pdfPageDimensionsMethod3,
                        method4_containerScroll: pdfPageDimensionsMethod4,
                        method5_embedBoundingRect: pdfPageDimensionsMethod5,
                        method6_containerBoundingRect: pdfPageDimensionsMethod6,
                        method7_computedStyle: pdfPageDimensionsMethod7,
                        method8_pdfContentElement: pdfPageDimensionsMethod8,
                        method9_widthBasedRatio: pdfPageDimensionsMethod9,
                        method10_heightBasedRatio: pdfPageDimensionsMethod10,
                        method11_directBestWidthHeight: pdfPageDimensionsMethod11,
                        method12_widthBasedRatioRelaxed: pdfPageDimensionsMethod12,
                        method13_viewportBasedRatio: pdfPageDimensionsMethod13
                      };
                      
                      // Find the best width value (prefer non-null, reasonable values)
                      // Priority: methods that give actual PDF content width (not viewport/container width)
                      // Prefer: scrollWidth, naturalWidth, canvas width (actual content)
                      // Avoid: viewport width, container width (may include UI)
                      let bestWidth = null;
                      let bestMethod = null;
                      let bestPriority = -1;
                      
                      // Priority order (higher = better):
                      // 1. canvas width (actual rendered PDF)
                      // 2. naturalWidth (natural size of embed)
                      // 3. scrollWidth (actual content width)
                      // 4. computed style (rendered width)
                      // 5. offsetWidth (layout width)
                      // 6. data attributes (if available)
                      const methodPriorities = {
                        method1_canvas: 10,
                        method2_naturalWidth: 9,
                        method3_embedScrollWidth: 8,
                        method4_containerScrollWidth: 7,
                        method5_computedStyle: 6,
                        method9_embedOffsetWidth: 5,
                        method10_containerOffsetWidth: 4,
                        method7_dataAttributes: 3,
                        method6_pdfContentElement: 2,
                        method8_bodyScrollWidth: 1
                      };
                      
                      for (const [method, value] of Object.entries(pdfPageWidthMethods)) {
                        if (value && value > 100 && value < 5000) {
                          const priority = methodPriorities[method] || 0;
                          // Prefer higher priority methods, or if same priority, prefer smaller values (more likely to be actual PDF width, not viewport)
                          if (priority > bestPriority || (priority === bestPriority && value < bestWidth)) {
                            bestPriority = priority;
                            bestWidth = value;
                            bestMethod = method;
                          }
                        }
                      }
                      
                      // If no method found a good value, use containerWidth or embedWidth as fallback
                      if (!bestWidth) {
                        bestWidth = containerRect ? Math.round(containerRect.width) : (embedRect ? Math.round(embedRect.width) : vw);
                        bestMethod = 'fallback_containerOrEmbed';
                      }
                      
                      // CRITICAL: Return both container and embed coordinates
                      // We'll use container (div#content) if available, as it excludes UI
                      // If only embed available, we'll need to adjust coordinates manually
                      return {
                        found: true,
                        type: pdfContainer ? 'div#content' : (embed ? 'embed' : 'unknown'),
                        // Container coordinates (div#content) - these exclude UI
                        containerX: containerRect ? Math.max(0, Math.round(containerRect.x)) : null,
                        containerY: containerRect ? Math.max(0, Math.round(containerRect.y)) : null,
                        containerWidth: containerRect ? Math.max(100, Math.round(containerRect.width)) : null,
                        containerHeight: containerRect ? Math.max(100, Math.round(containerRect.height)) : null,
                        // Embed coordinates - may include UI
                        embedX: embedRect ? Math.max(0, Math.round(embedRect.x)) : null,
                        embedY: embedRect ? Math.max(0, Math.round(embedRect.y)) : null,
                        embedWidth: embedRect ? Math.max(100, Math.round(embedRect.width)) : null,
                        embedHeight: embedRect ? Math.max(100, Math.round(embedRect.height)) : null,
                        // PDF page width methods (all attempts)
                        pdfPageWidthMethods: pdfPageWidthMethods,
                        pdfPageWidthBest: bestWidth,
                        pdfPageWidthBestMethod: bestMethod,
                        pdfPageWidthBestPriority: bestPriority,
                        // PDF page height methods (all attempts)
                        pdfPageHeightMethods: pdfPageHeightMethods,
                        // PDF page dimensions methods (width x height combined)
                        pdfPageDimensionsMethods: pdfPageDimensionsMethods,
                        // Viewport info
                        viewportWidth: vw,
                        viewportHeight: vh,
                        scrollX: window.scrollX,
                        scrollY: window.scrollY,
                        originalUrl: originalUrl,
                        currentPage: currentPage,
                        usingContainer: !!pdfContainer,
                        // Legacy fields for compatibility
                        x: containerRect ? Math.max(0, Math.round(containerRect.x)) : (embedRect ? Math.max(0, Math.round(embedRect.x)) : 0),
                        y: containerRect ? Math.max(0, Math.round(containerRect.y)) : (embedRect ? Math.max(0, Math.round(embedRect.y)) : 60),
                        width: containerRect ? Math.max(100, Math.round(containerRect.width)) : (embedRect ? Math.max(100, Math.round(embedRect.width)) : vw),
                        height: containerRect ? Math.max(100, Math.round(containerRect.height)) : (embedRect ? Math.max(100, Math.round(embedRect.height)) : vh)
                      };
                    }
                    
                    // Fallback: try to find any element that might contain PDF
                    const bodyRect = document.body.getBoundingClientRect();
                    const htmlRect = document.documentElement.getBoundingClientRect();
                    
                    // ========== MAXIMUM WIDTH MEASUREMENT METHODS ==========
                    // CRITICAL: Even if embed not found, try to get PDF page width using other methods
                    // These methods work even without embed element
                    
                    // Method 1: Canvas element (if PDF.js renders to canvas)
                    let pdfPageWidthMethod1 = null;
                    try {
                      const canvas = document.querySelector('canvas');
                      if (canvas) {
                        pdfPageWidthMethod1 = Math.round(canvas.width || canvas.offsetWidth || canvas.clientWidth || 0);
                      }
                    } catch (e) {
                      // Expected: canvas element may not exist or properties may be inaccessible, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod2 = null;
                    try {
                      const bodyScrollWidth = document.body.scrollWidth;
                      const docScrollWidth = document.documentElement.scrollWidth;
                      if (bodyScrollWidth > 0 && bodyScrollWidth < 10000) {
                        pdfPageWidthMethod2 = Math.round(bodyScrollWidth);
                      } else if (docScrollWidth > 0 && docScrollWidth < 10000) {
                        pdfPageWidthMethod2 = Math.round(docScrollWidth);
                      }
                    } catch (e) {
                      // Expected: scrollWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod3 = null;
                    try {
                      const bodyOffsetWidth = document.body.offsetWidth;
                      if (bodyOffsetWidth > 0 && bodyOffsetWidth < 10000) {
                        pdfPageWidthMethod3 = Math.round(bodyOffsetWidth);
                      }
                    } catch (e) {
                      // Expected: offsetWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod4 = null;
                    try {
                      const htmlOffsetWidth = document.documentElement.offsetWidth;
                      if (htmlOffsetWidth > 0 && htmlOffsetWidth < 10000) {
                        pdfPageWidthMethod4 = Math.round(htmlOffsetWidth);
                      }
                    } catch (e) {
                      // Expected: offsetWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod5 = null;
                    try {
                      const bodyClientWidth = document.body.clientWidth;
                      if (bodyClientWidth > 0 && bodyClientWidth < 10000) {
                        pdfPageWidthMethod5 = Math.round(bodyClientWidth);
                      }
                    } catch (e) {
                      // Expected: clientWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod6 = null;
                    try {
                      const htmlClientWidth = document.documentElement.clientWidth;
                      if (htmlClientWidth > 0 && htmlClientWidth < 10000) {
                        pdfPageWidthMethod6 = Math.round(htmlClientWidth);
                      }
                    } catch (e) {
                      // Expected: clientWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod7 = null;
                    try {
                      const computedBodyStyle = window.getComputedStyle(document.body);
                      const widthStr = computedBodyStyle.width;
                      if (widthStr && widthStr !== 'auto' && widthStr !== '100%') {
                        pdfPageWidthMethod7 = Math.round(parseFloat(widthStr));
                      }
                    } catch (e) {
                      // Expected: getComputedStyle may fail or return invalid values, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod8 = null;
                    try {
                      const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"], canvas');
                      for (const el of pdfContentElements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000) {
                          pdfPageWidthMethod8 = Math.round(rect.width);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: elements may not exist or getBoundingClientRect may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod9 = null;
                    try {
                      // Try to find iframe with PDF
                      const iframes = document.querySelectorAll('iframe');
                      for (const iframe of iframes) {
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            const iframeBody = iframeDoc.body;
                            if (iframeBody) {
                              const iframeWidth = iframeBody.scrollWidth || iframeBody.offsetWidth;
                              if (iframeWidth > 100 && iframeWidth < 5000) {
                                pdfPageWidthMethod9 = Math.round(iframeWidth);
                                break;
                              }
                            }
                          }
                        } catch (e) {
                          // Expected: iframe content may not be accessible (cross-origin), continue to next iframe
                          // No logging needed - this is expected during iframe traversal
                        }
                      }
                    } catch (e) {
                      // Expected: iframe traversal may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    let pdfPageWidthMethod10 = null;
                    try {
                      // Try to get from window.innerWidth minus estimated UI margins
                      // If viewport is wide but PDF content is narrower, estimate
                      const vw = window.innerWidth;
                      // Estimate: PDF might be centered with margins on sides
                      // Try different common PDF widths
                      const commonPdfWidths = [1308, 1635, 1200, 1400, 1500, 1600];
                      for (const commonWidth of commonPdfWidths) {
                        if (commonWidth < vw * 0.9) {
                          pdfPageWidthMethod10 = commonWidth;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: viewport calculations may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 11: All canvas elements (multiple canvases)
                    let pdfPageWidthMethod11 = null;
                    try {
                      const canvases = document.querySelectorAll('canvas');
                      for (const canvas of canvases) {
                        const w = Math.round(canvas.width || canvas.offsetWidth || canvas.clientWidth || 0);
                        if (w > 100 && w < 5000) {
                          pdfPageWidthMethod11 = w;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: canvas elements may not exist or properties may be inaccessible, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 12: Image elements (if PDF rendered as image)
                    let pdfPageWidthMethod12 = null;
                    try {
                      const images = document.querySelectorAll('img');
                      for (const img of images) {
                        const w = Math.round(img.naturalWidth || img.width || img.offsetWidth || 0);
                        if (w > 100 && w < 5000) {
                          pdfPageWidthMethod12 = w;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: image elements may not exist or properties may be inaccessible, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 13: SVG elements
                    let pdfPageWidthMethod13 = null;
                    try {
                      const svgs = document.querySelectorAll('svg');
                      for (const svg of svgs) {
                        const w = Math.round(svg.width?.baseVal?.value || svg.viewBox?.baseVal?.width || svg.offsetWidth || 0);
                        if (w > 100 && w < 5000) {
                          pdfPageWidthMethod13 = w;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: SVG elements may not exist or properties may be inaccessible, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 14: Object elements
                    let pdfPageWidthMethod14 = null;
                    try {
                      const objects = document.querySelectorAll('object');
                      for (const obj of objects) {
                        const rect = obj.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000) {
                          pdfPageWidthMethod14 = Math.round(rect.width);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: object elements may not exist or getBoundingClientRect may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 15: Embed elements (all embeds, not just PDF)
                    let pdfPageWidthMethod15 = null;
                    try {
                      const embeds = document.querySelectorAll('embed');
                      for (const embed of embeds) {
                        const rect = embed.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000) {
                          pdfPageWidthMethod15 = Math.round(rect.width);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: embed elements may not exist or getBoundingClientRect may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 16: Video elements (if PDF rendered as video)
                    let pdfPageWidthMethod16 = null;
                    try {
                      const videos = document.querySelectorAll('video');
                      for (const video of videos) {
                        const w = Math.round(video.videoWidth || video.width || video.offsetWidth || 0);
                        if (w > 100 && w < 5000) {
                          pdfPageWidthMethod16 = w;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: video elements may not exist or properties may be inaccessible, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 17: All divs with specific patterns
                    let pdfPageWidthMethod17 = null;
                    try {
                      const divs = document.querySelectorAll('div');
                      for (const div of divs) {
                        const rect = div.getBoundingClientRect();
                        const style = window.getComputedStyle(div);
                        if (rect.width > 100 && rect.width < 5000 && 
                            (style.position === 'absolute' || style.position === 'relative') &&
                            rect.width > window.innerWidth * 0.3) {
                          pdfPageWidthMethod17 = Math.round(rect.width);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: div elements may not exist or getBoundingClientRect/getComputedStyle may fail, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 18: Body bounding rect
                    let pdfPageWidthMethod18 = null;
                    try {
                      if (bodyRect && bodyRect.width > 100 && bodyRect.width < 10000) {
                        pdfPageWidthMethod18 = Math.round(bodyRect.width);
                      }
                    } catch (e) {
                      // Expected: bodyRect may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 19: HTML bounding rect
                    let pdfPageWidthMethod19 = null;
                    try {
                      if (htmlRect && htmlRect.width > 100 && htmlRect.width < 10000) {
                        pdfPageWidthMethod19 = Math.round(htmlRect.width);
                      }
                    } catch (e) {
                      // Expected: htmlRect may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 20: Computed style for html element
                    let pdfPageWidthMethod20 = null;
                    try {
                      const computedHtmlStyle = window.getComputedStyle(document.documentElement);
                      const widthStr = computedHtmlStyle.width;
                      if (widthStr && widthStr !== 'auto' && widthStr !== '100%') {
                        pdfPageWidthMethod20 = Math.round(parseFloat(widthStr));
                      }
                    } catch (e) {
                      // Expected: getComputedStyle may fail in some contexts, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 21: Screen width (scaled)
                    let pdfPageWidthMethod21 = null;
                    try {
                      const screenWidth = window.screen.width;
                      const devicePixelRatio = window.devicePixelRatio || 1;
                      const scaledWidth = Math.round(screenWidth / devicePixelRatio);
                      if (scaledWidth > 100 && scaledWidth < 10000) {
                        pdfPageWidthMethod21 = scaledWidth;
                      }
                    } catch (e) {
                      // Expected: screen properties may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 22: Visual viewport API
                    let pdfPageWidthMethod22 = null;
                    try {
                      if (window.visualViewport && window.visualViewport.width) {
                        pdfPageWidthMethod22 = Math.round(window.visualViewport.width);
                      }
                    } catch (e) {
                      // Expected: visualViewport API may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 23: Match media queries
                    let pdfPageWidthMethod23 = null;
                    try {
                      const mediaQueries = [
                        '(min-width: 1308px)',
                        '(min-width: 1635px)',
                        '(min-width: 1200px)',
                        '(min-width: 1400px)'
                      ];
                      for (const mq of mediaQueries) {
                        if (window.matchMedia(mq).matches) {
                          const match = mq.match(/(\\d+)/);
                          if (match) {
                            pdfPageWidthMethod23 = parseInt(match[1]);
                            break;
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: matchMedia may fail or queries may not match, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 24: ResizeObserver approach (if available)
                    let pdfPageWidthMethod24 = null;
                    try {
                      // Try to get from any observed element
                      const allElements = document.querySelectorAll('*');
                      for (const el of allElements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000 && rect.width < window.innerWidth * 0.95) {
                          pdfPageWidthMethod24 = Math.round(rect.width);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: getBoundingClientRect may fail in some contexts, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 25: IntersectionObserver approach
                    let pdfPageWidthMethod25 = null;
                    try {
                      const mainElement = document.querySelector('main') || document.querySelector('article') || document.body;
                      if (mainElement) {
                        const rect = mainElement.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000) {
                          pdfPageWidthMethod25 = Math.round(rect.width);
                        }
                      }
                    } catch (e) {
                      // Expected: IntersectionObserver may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 26: Window.matchMedia for specific widths
                    let pdfPageWidthMethod26 = null;
                    try {
                      const testWidths = [1308, 1635, 1200, 1400, 1500, 1600, 814];
                      for (const testWidth of testWidths) {
                        if (window.matchMedia('(min-width: ' + testWidth + 'px)').matches) {
                          pdfPageWidthMethod26 = testWidth;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: matchMedia may fail or queries may not match, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 27: Document fragments
                    let pdfPageWidthMethod27 = null;
                    try {
                      const fragments = document.querySelectorAll('*');
                      for (const frag of fragments) {
                        if (frag.shadowRoot) {
                          const shadowBody = frag.shadowRoot.querySelector('body') || frag.shadowRoot;
                          if (shadowBody) {
                            const rect = shadowBody.getBoundingClientRect();
                            if (rect.width > 100 && rect.width < 5000) {
                              pdfPageWidthMethod27 = Math.round(rect.width);
                              break;
                            }
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: document fragments may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 28: PDF.js specific (if available)
                    let pdfPageWidthMethod28 = null;
                    try {
                      if (window.pdfjsLib || window.PDFJS) {
                        const pdfjs = window.pdfjsLib || window.PDFJS;
                        // Try to get from PDF.js viewer if available
                        const viewer = document.querySelector('.pdfViewer') || document.querySelector('[class*="viewer"]');
                        if (viewer) {
                          const rect = viewer.getBoundingClientRect();
                          if (rect.width > 100 && rect.width < 5000) {
                            pdfPageWidthMethod28 = Math.round(rect.width);
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: PDF.js API may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 29: Chrome PDF viewer specific selectors
                    let pdfPageWidthMethod29 = null;
                    try {
                      const chromeViewer = document.querySelector('#plugin') || 
                                          document.querySelector('embed[type*="pdf"]') ||
                                          document.querySelector('object[type*="pdf"]');
                      if (chromeViewer) {
                        const rect = chromeViewer.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000) {
                          pdfPageWidthMethod29 = Math.round(rect.width);
                        }
                      }
                    } catch (e) {
                      // Expected: PDF viewer selectors may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // Method 30: Window.screen.availWidth
                    let pdfPageWidthMethod30 = null;
                    try {
                      const availWidth = window.screen.availWidth;
                      if (availWidth > 100 && availWidth < 10000) {
                        pdfPageWidthMethod30 = availWidth;
                      }
                    } catch (e) {
                      // Expected: screen.availWidth may not be available, continue with other methods
                      // No logging needed - this is expected during width measurement attempts
                    }
                    
                    // ========== HEIGHT MEASUREMENT METHODS (FALLBACK) ==========
                    let pdfPageHeightMethod1 = null;
                    try {
                      const canvas = document.querySelector('canvas');
                      if (canvas) {
                        pdfPageHeightMethod1 = Math.round(canvas.height || canvas.offsetHeight || canvas.clientHeight || 0);
                      }
                    } catch (e) {
                      // Expected: canvas properties may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod2 = null;
                    try {
                      const bodyScrollHeight = document.body.scrollHeight;
                      const docScrollHeight = document.documentElement.scrollHeight;
                      if (bodyScrollHeight > 0 && bodyScrollHeight < 20000) {
                        pdfPageHeightMethod2 = Math.round(bodyScrollHeight);
                      } else if (docScrollHeight > 0 && docScrollHeight < 20000) {
                        pdfPageHeightMethod2 = Math.round(docScrollHeight);
                      }
                    } catch (e) {
                      // Expected: scrollHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod3 = null;
                    try {
                      const bodyOffsetHeight = document.body.offsetHeight;
                      if (bodyOffsetHeight > 0 && bodyOffsetHeight < 20000) {
                        pdfPageHeightMethod3 = Math.round(bodyOffsetHeight);
                      }
                    } catch (e) {
                      // Expected: offsetHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod4 = null;
                    try {
                      const htmlOffsetHeight = document.documentElement.offsetHeight;
                      if (htmlOffsetHeight > 0 && htmlOffsetHeight < 20000) {
                        pdfPageHeightMethod4 = Math.round(htmlOffsetHeight);
                      }
                    } catch (e) {
                      // Expected: html offsetHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod5 = null;
                    try {
                      const bodyClientHeight = document.body.clientHeight;
                      if (bodyClientHeight > 0 && bodyClientHeight < 20000) {
                        pdfPageHeightMethod5 = Math.round(bodyClientHeight);
                      }
                    } catch (e) {
                      // Expected: clientHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod6 = null;
                    try {
                      const htmlClientHeight = document.documentElement.clientHeight;
                      if (htmlClientHeight > 0 && htmlClientHeight < 20000) {
                        pdfPageHeightMethod6 = Math.round(htmlClientHeight);
                      }
                    } catch (e) {
                      // Expected: html clientHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod7 = null;
                    try {
                      const computedBodyStyle = window.getComputedStyle(document.body);
                      const heightStr = computedBodyStyle.height;
                      if (heightStr && heightStr !== 'auto' && heightStr !== '100%') {
                        pdfPageHeightMethod7 = Math.round(parseFloat(heightStr));
                      }
                    } catch (e) {
                      // Expected: computed style height may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    let pdfPageHeightMethod8 = null;
                    try {
                      const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"], canvas');
                      for (const el of pdfContentElements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000) {
                          pdfPageHeightMethod8 = Math.round(rect.height);
                          break;
                        }
                      }
                    } catch (e) {
                      // Method 8 failed - try next method (graceful degradation)
                      // This is expected - not all PDF viewers expose elements the same way
                    }
                    
                    let pdfPageHeightMethod9 = null;
                    try {
                      const iframes = document.querySelectorAll('iframe');
                      for (const iframe of iframes) {
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            const iframeBody = iframeDoc.body;
                            if (iframeBody) {
                              const iframeHeight = iframeBody.scrollHeight || iframeBody.offsetHeight;
                              if (iframeHeight > 100 && iframeHeight < 10000) {
                                pdfPageHeightMethod9 = Math.round(iframeHeight);
                                break;
                              }
                            }
                          }
                        } catch (e) {}
                      }
                    } catch (e) {}
                    
                    // Method 10: Estimate height from viewport (independent from width)
                    // Similar to method10_estimatedFromViewport for width, but for height
                    let pdfPageHeightMethod10 = null;
                    try {
                      const vh = window.innerHeight;
                      // Target heights from known ratios: 2000, 1000, 1607
                      // Try to find which target height matches current viewport
                      const targetHeights = [2000, 1000, 1607, 1200, 1400, 1600];
                      for (const targetHeight of targetHeights) {
                        // Check if viewport height is close to target (within 90% of viewport)
                        if (targetHeight < vh * 0.95 && targetHeight > vh * 0.3) {
                          pdfPageHeightMethod10 = targetHeight;
                          break;
                        }
                      }
                    } catch (e) {}
                    
                    // Method 11: Calculate height from viewport using target aspect ratios (independent)
                    let pdfPageHeightMethod11 = null;
                    try {
                      const vh = window.innerHeight;
                      const vw = window.innerWidth;
                      const viewportRatio = vw / vh;
                      // Target ratios: 1635/2000 = 0.8175, 814/1000 = 0.814, 1308/1607 = 0.8144
                      const targetRatios = [
                        { name: 'ratio_1635x2000', ratio: 1635/2000, height: 2000 },
                        { name: 'ratio_814x1000', ratio: 814/1000, height: 1000 },
                        { name: 'ratio_1308x1607', ratio: 1308/1607, height: 1607 }
                      ];
                      // Find closest matching ratio
                      let closestRatio = null;
                      let minDiff = Infinity;
                      for (const targetRatio of targetRatios) {
                        const diff = Math.abs(viewportRatio - targetRatio.ratio);
                        if (diff < minDiff) {
                          minDiff = diff;
                          closestRatio = targetRatio;
                        }
                      }
                      // If viewport ratio matches a target ratio, use corresponding height
                      if (closestRatio && minDiff < 0.1) {
                        pdfPageHeightMethod11 = closestRatio.height;
                      }
                    } catch (e) {
                      // Expected: ratio matching may fail, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 12: Calculate height from measured width using target ratios (independent calculation)
                    // This is DIFFERENT from method4_widthBasedRatio - it calculates height independently
                    // by finding which target height would match the current viewport/measured width
                    let pdfPageHeightMethod12 = null;
                    try {
                      // Try to get width from viewport or measured values
                      const vw = window.innerWidth;
                      const measuredWidth = vw; // Use viewport width as base
                      if (measuredWidth > 100 && measuredWidth < 5000) {
                        const targetRatios = [
                          { name: 'ratio_1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                          { name: 'ratio_814x1000', ratio: 814/1000, width: 814, height: 1000 },
                          { name: 'ratio_1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
                        ];
                        // Find which target width is closest to measured width
                        let closestRatio = null;
                        let minDiff = Infinity;
                        for (const targetRatio of targetRatios) {
                          const diff = Math.abs((measuredWidth / targetRatio.width) - 1);
                          if (diff < minDiff) {
                            minDiff = diff;
                            closestRatio = targetRatio;
                          }
                        }
                        // If measured width matches a target width, calculate height independently
                        if (closestRatio && minDiff < 0.2) {
                          const scale = measuredWidth / closestRatio.width;
                          pdfPageHeightMethod12 = Math.round(closestRatio.height * scale);
                        }
                      }
                    } catch (e) {}
                    
                    // Method 13: All canvas elements (multiple canvases)
                    let pdfPageHeightMethod13 = null;
                    try {
                      const canvases = document.querySelectorAll('canvas');
                      for (const canvas of canvases) {
                        const h = Math.round(canvas.height || canvas.offsetHeight || canvas.clientHeight || 0);
                        if (h > 100 && h < 10000) {
                          pdfPageHeightMethod13 = h;
                          break;
                        }
                      }
                    } catch (e) {}
                    
                    // Method 14: Image elements (if PDF rendered as image)
                    let pdfPageHeightMethod14 = null;
                    try {
                      const images = document.querySelectorAll('img');
                      for (const img of images) {
                        const h = Math.round(img.naturalHeight || img.height || img.offsetHeight || 0);
                        if (h > 100 && h < 10000) {
                          pdfPageHeightMethod14 = h;
                          break;
                        }
                      }
                    } catch (e) {}
                    
                    // Method 15: SVG elements
                    let pdfPageHeightMethod15 = null;
                    try {
                      const svgs = document.querySelectorAll('svg');
                      for (const svg of svgs) {
                        const h = Math.round(svg.height?.baseVal?.value || svg.viewBox?.baseVal?.height || svg.offsetHeight || 0);
                        if (h > 100 && h < 10000) {
                          pdfPageHeightMethod15 = h;
                          break;
                        }
                      }
                    } catch (e) {}
                    
                    // Method 16: Object elements
                    let pdfPageHeightMethod16 = null;
                    try {
                      const objects = document.querySelectorAll('object');
                      for (const obj of objects) {
                        const rect = obj.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000) {
                          pdfPageHeightMethod16 = Math.round(rect.height);
                          break;
                        }
                      }
                    } catch (e) {}
                    
                    // Method 17: Embed elements (all embeds, not just PDF)
                    let pdfPageHeightMethod17 = null;
                    try {
                      const embeds = document.querySelectorAll('embed');
                      for (const embed of embeds) {
                        const rect = embed.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000) {
                          pdfPageHeightMethod17 = Math.round(rect.height);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: video elements may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 18: Video elements (if PDF rendered as video)
                    let pdfPageHeightMethod18 = null;
                    try {
                      const videos = document.querySelectorAll('video');
                      for (const video of videos) {
                        const h = Math.round(video.videoHeight || video.height || video.offsetHeight || 0);
                        if (h > 100 && h < 10000) {
                          pdfPageHeightMethod18 = h;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: div elements may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 19: All divs with specific patterns
                    let pdfPageHeightMethod19 = null;
                    try {
                      const divs = document.querySelectorAll('div');
                      for (const div of divs) {
                        const rect = div.getBoundingClientRect();
                        const style = window.getComputedStyle(div);
                        if (rect.height > 100 && rect.height < 10000 && 
                            (style.position === 'absolute' || style.position === 'relative') &&
                            rect.height > window.innerHeight * 0.3) {
                          pdfPageHeightMethod19 = Math.round(rect.height);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: body bounding rect may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 20: Body bounding rect
                    let pdfPageHeightMethod20 = null;
                    try {
                      if (bodyRect && bodyRect.height > 100 && bodyRect.height < 20000) {
                        pdfPageHeightMethod20 = Math.round(bodyRect.height);
                      }
                    } catch (e) {
                      // Expected: html bounding rect may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 21: HTML bounding rect
                    let pdfPageHeightMethod21 = null;
                    try {
                      if (htmlRect && htmlRect.height > 100 && htmlRect.height < 20000) {
                        pdfPageHeightMethod21 = Math.round(htmlRect.height);
                      }
                    } catch (e) {
                      // Expected: computed style may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 22: Computed style for html element
                    let pdfPageHeightMethod22 = null;
                    try {
                      const computedHtmlStyle = window.getComputedStyle(document.documentElement);
                      const heightStr = computedHtmlStyle.height;
                      if (heightStr && heightStr !== 'auto' && heightStr !== '100%') {
                        pdfPageHeightMethod22 = Math.round(parseFloat(heightStr));
                      }
                    } catch (e) {
                      // Expected: screen height may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 23: Screen height (scaled)
                    let pdfPageHeightMethod23 = null;
                    try {
                      const screenHeight = window.screen.height;
                      const devicePixelRatio = window.devicePixelRatio || 1;
                      const scaledHeight = Math.round(screenHeight / devicePixelRatio);
                      if (scaledHeight > 100 && scaledHeight < 20000) {
                        pdfPageHeightMethod23 = scaledHeight;
                      }
                    } catch (e) {
                      // Expected: visual viewport API may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 24: Visual viewport API
                    let pdfPageHeightMethod24 = null;
                    try {
                      if (window.visualViewport && window.visualViewport.height) {
                        pdfPageHeightMethod24 = Math.round(window.visualViewport.height);
                      }
                    } catch (e) {
                      // Expected: matchMedia may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 25: Match media queries for heights
                    let pdfPageHeightMethod25 = null;
                    try {
                      const mediaQueries = [
                        '(min-height: 2000px)',
                        '(min-height: 1000px)',
                        '(min-height: 1607px)',
                        '(min-height: 1200px)'
                      ];
                      for (const mq of mediaQueries) {
                        if (window.matchMedia(mq).matches) {
                          const match = mq.match(/(\\d+)/);
                          if (match) {
                            pdfPageHeightMethod25 = parseInt(match[1]);
                            break;
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: ResizeObserver may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 26: ResizeObserver approach (if available)
                    let pdfPageHeightMethod26 = null;
                    try {
                      const allElements = document.querySelectorAll('*');
                      for (const el of allElements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000 && rect.height < window.innerHeight * 0.95) {
                          pdfPageHeightMethod26 = Math.round(rect.height);
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: IntersectionObserver may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 27: IntersectionObserver approach
                    let pdfPageHeightMethod27 = null;
                    try {
                      const mainElement = document.querySelector('main') || document.querySelector('article') || document.body;
                      if (mainElement) {
                        const rect = mainElement.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000) {
                          pdfPageHeightMethod27 = Math.round(rect.height);
                        }
                      }
                    } catch (e) {
                      // Expected: matchMedia for heights may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 28: Window.matchMedia for specific heights
                    let pdfPageHeightMethod28 = null;
                    try {
                      const testHeights = [2000, 1000, 1607, 1200, 1400, 1600];
                      for (const testHeight of testHeights) {
                        if (window.matchMedia('(min-height: ' + testHeight + 'px)').matches) {
                          pdfPageHeightMethod28 = testHeight;
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: document fragments may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 29: Document fragments
                    let pdfPageHeightMethod29 = null;
                    try {
                      const fragments = document.querySelectorAll('*');
                      for (const frag of fragments) {
                        if (frag.shadowRoot) {
                          const shadowBody = frag.shadowRoot.querySelector('body') || frag.shadowRoot;
                          if (shadowBody) {
                            const rect = shadowBody.getBoundingClientRect();
                            if (rect.height > 100 && rect.height < 10000) {
                              pdfPageHeightMethod29 = Math.round(rect.height);
                              break;
                            }
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: PDF.js specific methods may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 30: PDF.js specific (if available)
                    let pdfPageHeightMethod30 = null;
                    try {
                      if (window.pdfjsLib || window.PDFJS) {
                        const pdfjs = window.pdfjsLib || window.PDFJS;
                        const viewer = document.querySelector('.pdfViewer') || document.querySelector('[class*="viewer"]');
                        if (viewer) {
                          const rect = viewer.getBoundingClientRect();
                          if (rect.height > 100 && rect.height < 10000) {
                            pdfPageHeightMethod30 = Math.round(rect.height);
                          }
                        }
                      }
                    } catch (e) {
                      // Expected: Chrome PDF viewer selectors may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 31: Chrome PDF viewer specific selectors
                    let pdfPageHeightMethod31 = null;
                    try {
                      const chromeViewer = document.querySelector('#plugin') || 
                                          document.querySelector('embed[type*="pdf"]') ||
                                          document.querySelector('object[type*="pdf"]');
                      if (chromeViewer) {
                        const rect = chromeViewer.getBoundingClientRect();
                        if (rect.height > 100 && rect.height < 10000) {
                          pdfPageHeightMethod31 = Math.round(rect.height);
                        }
                      }
                    } catch (e) {
                      // Expected: screen.availHeight may not be available, continue with other methods
                      // No logging needed - this is expected during height measurement attempts
                    }
                    
                    // Method 32: Window.screen.availHeight
                    let pdfPageHeightMethod32 = null;
                    try {
                      const availHeight = window.screen.availHeight;
                      if (availHeight > 100 && availHeight < 20000) {
                        pdfPageHeightMethod32 = availHeight;
                      }
                    } catch (e) {
                      // Expected: combined dimensions method may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    // ========== COMBINED DIMENSIONS METHODS (FALLBACK) ==========
                    let pdfPageDimensionsMethod1 = null;
                    try {
                      const canvas = document.querySelector('canvas');
                      if (canvas) {
                        const w = Math.round(canvas.width || canvas.offsetWidth || canvas.clientWidth || 0);
                        const h = Math.round(canvas.height || canvas.offsetHeight || canvas.clientHeight || 0);
                        if (w > 0 && h > 0) {
                          pdfPageDimensionsMethod1 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                        }
                      }
                    } catch (e) {
                      // Expected: dimensions method 2 may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    let pdfPageDimensionsMethod2 = null;
                    try {
                      const bodyScrollWidth = document.body.scrollWidth;
                      const bodyScrollHeight = document.body.scrollHeight;
                      if (bodyScrollWidth > 0 && bodyScrollWidth < 10000 && bodyScrollHeight > 0 && bodyScrollHeight < 20000) {
                        pdfPageDimensionsMethod2 = { 
                          width: Math.round(bodyScrollWidth), 
                          height: Math.round(bodyScrollHeight), 
                          aspectRatio: (bodyScrollWidth / bodyScrollHeight).toFixed(4) 
                        };
                      }
                    } catch (e) {
                      // Expected: dimensions method 3 may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    let pdfPageDimensionsMethod3 = null;
                    try {
                      const pdfContentElements = document.querySelectorAll('div[class*="page"], div[class*="pdf"], div[id*="page"], canvas');
                      for (const el of pdfContentElements) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 100 && rect.width < 5000 && rect.height > 100 && rect.height < 10000) {
                          const w = Math.round(rect.width);
                          const h = Math.round(rect.height);
                          pdfPageDimensionsMethod3 = { width: w, height: h, aspectRatio: (w / h).toFixed(4) };
                          break;
                        }
                      }
                    } catch (e) {
                      // Expected: dimensions method 4 may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    let pdfPageDimensionsMethod4 = null;
                    try {
                      if (bestWidth && bestWidth > 100 && bestWidth < 5000) {
                        const targetRatios = [
                          { name: 'ratio_1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                          { name: 'ratio_814x1000', ratio: 814/1000, width: 814, height: 1000 },
                          { name: 'ratio_1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
                        ];
                        let closestRatio = null;
                        let minDiff = Infinity;
                        for (const targetRatio of targetRatios) {
                          const diff = Math.abs((bestWidth / targetRatio.width) - 1);
                          if (diff < minDiff) {
                            minDiff = diff;
                            closestRatio = targetRatio;
                          }
                        }
                        // Relaxed threshold: allow up to 20% difference
                        if (closestRatio && minDiff < 0.2) {
                          const scale = bestWidth / closestRatio.width;
                          const h = Math.round(closestRatio.height * scale);
                          pdfPageDimensionsMethod4 = { 
                            width: bestWidth, 
                            height: h, 
                            aspectRatio: (bestWidth / h).toFixed(4),
                            basedOnRatio: closestRatio.name,
                            scale: scale.toFixed(4),
                            widthDiff: (minDiff * 100).toFixed(2) + '%'
                          };
                        }
                      }
                    } catch (e) {
                      // Expected: dimensions method 5 may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    // Method 5: Direct combination of best width and best height (fallback)
                    let pdfPageDimensionsMethod5 = null;
                    try {
                      if (bestWidth && bestWidth > 100 && bestWidth < 5000) {
                        const bestHeight = pdfPageHeightMethod1 || pdfPageHeightMethod2 || pdfPageHeightMethod8 || 
                                         pdfPageHeightMethod6 || pdfPageHeightMethod3;
                        if (bestHeight && bestHeight > 100 && bestHeight < 10000) {
                          pdfPageDimensionsMethod5 = { 
                            width: bestWidth, 
                            height: bestHeight, 
                            aspectRatio: (bestWidth / bestHeight).toFixed(4),
                            basedOnRatio: 'direct_measurement_fallback',
                            widthSource: 'bestWidth',
                            heightSource: 'bestHeight'
                          };
                        }
                      }
                    } catch (e) {
                      // Expected: dimensions method 6 may fail, continue with other methods
                      // No logging needed - this is expected during dimensions measurement attempts
                    }
                    
                    // Method 6: Calculate dimensions from viewport using target ratios (fallback)
                    let pdfPageDimensionsMethod6 = null;
                    try {
                      const vw = window.innerWidth;
                      const vh = window.innerHeight;
                      if (vw > 100 && vw < 5000 && vh > 100 && vh < 10000) {
                        const viewportRatio = vw / vh;
                        const targetRatios = [
                          { name: 'ratio_1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                          { name: 'ratio_814x1000', ratio: 814/1000, width: 814, height: 1000 },
                          { name: 'ratio_1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
                        ];
                        let closestRatio = null;
                        let minDiff = Infinity;
                        for (const targetRatio of targetRatios) {
                          const diff = Math.abs(viewportRatio - targetRatio.ratio);
                          if (diff < minDiff) {
                            minDiff = diff;
                            closestRatio = targetRatio;
                          }
                        }
                        if (closestRatio && minDiff < 0.1) {
                          pdfPageDimensionsMethod6 = { 
                            width: vw, 
                            height: vh, 
                            aspectRatio: viewportRatio.toFixed(4),
                            basedOnRatio: closestRatio.name,
                            ratioDiff: minDiff.toFixed(4)
                          };
                        }
                      }
                    } catch (e) {}
                    
                    // Collect all width methods results FIRST (needed for bestWidth calculation)
                    const pdfPageWidthMethods = {
                      method1_canvas: pdfPageWidthMethod1,
                      method2_bodyScrollWidth: pdfPageWidthMethod2,
                      method3_bodyOffsetWidth: pdfPageWidthMethod3,
                      method4_htmlOffsetWidth: pdfPageWidthMethod4,
                      method5_bodyClientWidth: pdfPageWidthMethod5,
                      method6_htmlClientWidth: pdfPageWidthMethod6,
                      method7_computedBodyStyle: pdfPageWidthMethod7,
                      method8_pdfContentElement: pdfPageWidthMethod8,
                      method9_iframeContent: pdfPageWidthMethod9,
                      method10_estimatedFromViewport: pdfPageWidthMethod10,
                      method11_allCanvases: pdfPageWidthMethod11,
                      method12_images: pdfPageWidthMethod12,
                      method13_svg: pdfPageWidthMethod13,
                      method14_objects: pdfPageWidthMethod14,
                      method15_allEmbeds: pdfPageWidthMethod15,
                      method16_videos: pdfPageWidthMethod16,
                      method17_divsPattern: pdfPageWidthMethod17,
                      method18_bodyBoundingRect: pdfPageWidthMethod18,
                      method19_htmlBoundingRect: pdfPageWidthMethod19,
                      method20_computedHtmlStyle: pdfPageWidthMethod20,
                      method21_screenScaled: pdfPageWidthMethod21,
                      method22_visualViewport: pdfPageWidthMethod22,
                      method23_matchMedia: pdfPageWidthMethod23,
                      method24_resizeObserver: pdfPageWidthMethod24,
                      method25_intersectionObserver: pdfPageWidthMethod25,
                      method26_matchMediaSpecific: pdfPageWidthMethod26,
                      method27_shadowDom: pdfPageWidthMethod27,
                      method28_pdfjs: pdfPageWidthMethod28,
                      method29_chromeViewer: pdfPageWidthMethod29,
                      method30_screenAvailWidth: pdfPageWidthMethod30
                    };
                    
                    // CRITICAL: Calculate bestWidth BEFORE using it in dimension methods
                    // Find the best width value (prefer non-null, reasonable values)
                    // Priority order (higher = better)
                    const methodPriorities = {
                      method1_canvas: 10,
                      method8_pdfContentElement: 9,
                      method9_iframeContent: 8,
                      method2_bodyScrollWidth: 7,
                      method3_bodyOffsetWidth: 6,
                      method5_bodyClientWidth: 5,
                      method4_htmlOffsetWidth: 4,
                      method6_htmlClientWidth: 3,
                      method7_computedBodyStyle: 2,
                      method10_estimatedFromViewport: 1
                    };
                    
                    let bestWidth = null;
                    let bestMethod = null;
                    let bestPriority = -1;
                    
                    // Prefer method10_estimatedFromViewport if it has a value (it's usually more accurate)
                    if (pdfPageWidthMethods.method10_estimatedFromViewport && 
                        pdfPageWidthMethods.method10_estimatedFromViewport > 100 && 
                        pdfPageWidthMethods.method10_estimatedFromViewport < 5000) {
                      bestWidth = pdfPageWidthMethods.method10_estimatedFromViewport;
                      bestMethod = 'method10_estimatedFromViewport';
                      bestPriority = methodPriorities.method10_estimatedFromViewport;
                    } else {
                      // Otherwise use priority-based selection
                      for (const [method, value] of Object.entries(pdfPageWidthMethods)) {
                        if (value && value > 100 && value < 5000) {
                          const priority = methodPriorities[method] || 0;
                          if (priority > bestPriority || (priority === bestPriority && value < bestWidth)) {
                            bestPriority = priority;
                            bestWidth = value;
                            bestMethod = method;
                          }
                        }
                      }
                    }
                    
                    // If no method found a good value, use viewport width as fallback
                    if (!bestWidth) {
                      bestWidth = window.innerWidth;
                      bestMethod = 'fallback_viewportWidth';
                    }
                    
                    const pdfPageHeightMethods = {
                      method1_canvas: pdfPageHeightMethod1,
                      method2_bodyScrollHeight: pdfPageHeightMethod2,
                      method3_bodyOffsetHeight: pdfPageHeightMethod3,
                      method4_htmlOffsetHeight: pdfPageHeightMethod4,
                      method5_bodyClientHeight: pdfPageHeightMethod5,
                      method6_htmlClientHeight: pdfPageHeightMethod6,
                      method7_computedBodyStyle: pdfPageHeightMethod7,
                      method8_pdfContentElement: pdfPageHeightMethod8,
                      method9_iframeContent: pdfPageHeightMethod9,
                      method10_estimatedFromViewport: pdfPageHeightMethod10,
                      method11_viewportRatioBased: pdfPageHeightMethod11,
                      method12_independentWidthBased: pdfPageHeightMethod12,
                      method13_allCanvases: pdfPageHeightMethod13,
                      method14_images: pdfPageHeightMethod14,
                      method15_svg: pdfPageHeightMethod15,
                      method16_objects: pdfPageHeightMethod16,
                      method17_allEmbeds: pdfPageHeightMethod17,
                      method18_videos: pdfPageHeightMethod18,
                      method19_divsPattern: pdfPageHeightMethod19,
                      method20_bodyBoundingRect: pdfPageHeightMethod20,
                      method21_htmlBoundingRect: pdfPageHeightMethod21,
                      method22_computedHtmlStyle: pdfPageHeightMethod22,
                      method23_screenScaled: pdfPageHeightMethod23,
                      method24_visualViewport: pdfPageHeightMethod24,
                      method25_matchMedia: pdfPageHeightMethod25,
                      method26_resizeObserver: pdfPageHeightMethod26,
                      method27_intersectionObserver: pdfPageHeightMethod27,
                      method28_matchMediaSpecific: pdfPageHeightMethod28,
                      method29_shadowDom: pdfPageHeightMethod29,
                      method30_pdfjs: pdfPageHeightMethod30,
                      method31_chromeViewer: pdfPageHeightMethod31,
                      method32_screenAvailHeight: pdfPageHeightMethod32
                    };
                    
                    const pdfPageDimensionsMethods = {
                      method1_canvas: pdfPageDimensionsMethod1,
                      method2_bodyScroll: pdfPageDimensionsMethod2,
                      method3_pdfContentElement: pdfPageDimensionsMethod3,
                      method4_widthBasedRatio: pdfPageDimensionsMethod4,
                      method5_directBestWidthHeight: pdfPageDimensionsMethod5,
                      method6_viewportBasedRatio: pdfPageDimensionsMethod6
                    };
                    
                    // Estimate PDF area (usually most of viewport, minus UI)
                    // Assume top 60px is toolbar, rest is PDF content
                    const estimatedY = 60;
                    const estimatedHeight = Math.max(600, window.innerHeight - estimatedY);
                    
                    return {
                      found: false,
                      fallback: true,
                      x: 0,
                      y: estimatedY,
                      width: window.innerWidth,
                      height: estimatedHeight,
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight,
                      // PDF page width methods (all attempts, even without embed)
                      pdfPageWidthMethods: pdfPageWidthMethods,
                      pdfPageWidthBest: bestWidth,
                      pdfPageWidthBestMethod: bestMethod,
                      pdfPageWidthBestPriority: bestPriority,
                      // PDF page height methods (all attempts)
                      pdfPageHeightMethods: pdfPageHeightMethods,
                      // PDF page dimensions methods (width x height combined)
                      pdfPageDimensionsMethods: pdfPageDimensionsMethods,
                      note: 'Embed not found, using estimated PDF area, but tried to detect PDF width/height anyway'
                    };
                  } catch (e) {
                    return { error: e.message };
                  }
                })()
              `,
              returnByValue: true
            }
          );
          } catch (e) {
            evaluateError = e;
            log('[CDP Render] [BATCH] Runtime.evaluate ERROR', {
              pageNum,
              error: e.message,
              errorStack: e.stack,
              errorName: e.name
            });
          }
          
          // Type assertion for Chrome DevTools Protocol response
          /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
          const typedFindResult = findResult || {};
          
          // CRITICAL: Log raw findResult to understand what Runtime.evaluate returned
          criticalLog('[CDP Render] [BATCH] 🔍 Runtime.evaluate RAW RESULT', 'PDF_RUNTIME_EVALUATE_RAW', {
            pageNum,
            tabId: tab.id,
            hasEvaluateError: !!evaluateError,
            evaluateError: evaluateError ? {
              message: evaluateError.message,
              name: evaluateError.name,
              stack: evaluateError.stack
            } : null,
            hasFindResult: !!findResult,
            findResultType: typeof findResult,
            hasResult: !!(typedFindResult && typedFindResult.result),
            resultType: (typedFindResult && typedFindResult.result && typedFindResult.result.type) || null,
            hasValue: !!(typedFindResult && typedFindResult.result && typedFindResult.result.value),
            valueType: (typedFindResult && typedFindResult.result && typedFindResult.result.value && typeof typedFindResult.result.value) || null,
            hasExceptionDetails: !!(typedFindResult && typedFindResult.exceptionDetails),
            exceptionDetails: (typedFindResult && typedFindResult.exceptionDetails) ? {
              text: typedFindResult.exceptionDetails.text,
              lineNumber: typedFindResult.exceptionDetails.lineNumber,
              columnNumber: typedFindResult.exceptionDetails.columnNumber,
              url: typedFindResult.exceptionDetails.url
            } : null,
            findResultKeys: findResult ? Object.keys(findResult) : [],
            resultKeys: (typedFindResult && typedFindResult.result) ? Object.keys(typedFindResult.result) : [],
            timestamp: Date.now()
          });
          
          // Assign to pdfArea (already declared in wider scope)
          pdfArea = typedFindResult.result?.value;
          
          // CRITICAL: Log CDP layout metrics (viewport dimensions via CDP)
          criticalLog('[CDP Render] [BATCH] 📐 CDP LAYOUT METRICS (VIEWPORT DIMENSIONS)', 'PDF_CDP_LAYOUT_METRICS', {
            pageNum,
            tabId: tab.id,
            hasLayoutMetrics: !!layoutMetrics,
            layoutMetrics: layoutMetrics ? {
              cssLayoutViewport: layoutMetrics.cssLayoutViewport || null,
              cssVisualViewport: layoutMetrics.cssVisualViewport || null,
              contentSize: layoutMetrics.contentSize || null,
              // Extract dimensions
              viewportWidth: (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.width) || null,
              viewportHeight: (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.height) || null,
              contentWidth: (layoutMetrics.contentSize && layoutMetrics.contentSize.width) || null,
              contentHeight: (layoutMetrics.contentSize && layoutMetrics.contentSize.height) || null,
              // Visual viewport (may differ from layout viewport)
              visualViewportWidth: (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.width) || null,
              visualViewportHeight: (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.height) || null
            } : null,
            additionalMeasurements: cdpAdditionalMeasurements,
            timestamp: Date.now()
          });
          
          // CRITICAL: Log Runtime.evaluate result immediately to see what we got
          criticalLog('[CDP Render] [BATCH] 🔍 Runtime.evaluate RESULT (RAW)', 'PDF_RUNTIME_EVALUATE_RESULT', {
            pageNum,
            tabId: tab.id,
            hasResult: !!findResult,
            hasValue: !!(typedFindResult && typedFindResult.result && typedFindResult.result.value),
            resultType: (typedFindResult && typedFindResult.result && typedFindResult.result.type) || null,
            pdfAreaType: typeof pdfArea,
            pdfAreaKeys: pdfArea ? Object.keys(pdfArea) : [],
            pdfAreaFound: (pdfArea && pdfArea.found) || false,
            pdfAreaFallback: (pdfArea && pdfArea.fallback) || false,
            hasPdfPageWidthMethods: !!(pdfArea && pdfArea.pdfPageWidthMethods),
            hasPdfPageHeightMethods: !!(pdfArea && pdfArea.pdfPageHeightMethods),
            hasPdfPageDimensionsMethods: !!(pdfArea && pdfArea.pdfPageDimensionsMethods),
            pdfPageWidthMethodsKeys: (pdfArea && pdfArea.pdfPageWidthMethods) ? Object.keys(pdfArea.pdfPageWidthMethods) : [],
            pdfPageHeightMethodsKeys: (pdfArea && pdfArea.pdfPageHeightMethods) ? Object.keys(pdfArea.pdfPageHeightMethods) : [],
            pdfPageDimensionsMethodsKeys: (pdfArea && pdfArea.pdfPageDimensionsMethods) ? Object.keys(pdfArea.pdfPageDimensionsMethods) : [],
            error: (pdfArea && pdfArea.error) || null,
            rawPdfArea: pdfArea,
            timestamp: Date.now()
          });
          
          // CRITICAL: Add CDP layout metrics as additional measurement methods
          // These work even if DOM methods fail (Chrome PDF viewer uses plugin/iframe)
          const cdpWidthMethods = {};
          const cdpHeightMethods = {};
          
          if (layoutMetrics) {
            // CDP Method 1: CSS Layout Viewport width
            if (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.clientWidth) {
              cdpWidthMethods['cdp_method1_cssLayoutViewport_clientWidth'] = Math.round(layoutMetrics.cssLayoutViewport.clientWidth);
            }
            if (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.width) {
              cdpWidthMethods['cdp_method1_cssLayoutViewport_width'] = Math.round(layoutMetrics.cssLayoutViewport.width);
            }
            // CDP Method 2: Content Size width
            if (layoutMetrics.contentSize && layoutMetrics.contentSize.width) {
              cdpWidthMethods['cdp_method2_contentSize'] = Math.round(layoutMetrics.contentSize.width);
            }
            // CDP Method 3: CSS Visual Viewport width
            if (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.clientWidth) {
              cdpWidthMethods['cdp_method3_cssVisualViewport_clientWidth'] = Math.round(layoutMetrics.cssVisualViewport.clientWidth);
            }
            if (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.width) {
              cdpWidthMethods['cdp_method3_cssVisualViewport_width'] = Math.round(layoutMetrics.cssVisualViewport.width);
            }
            
            // CDP Method 1: CSS Layout Viewport height
            if (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.clientHeight) {
              cdpHeightMethods['cdp_method1_cssLayoutViewport_clientHeight'] = Math.round(layoutMetrics.cssLayoutViewport.clientHeight);
            }
            if (layoutMetrics.cssLayoutViewport && layoutMetrics.cssLayoutViewport.height) {
              cdpHeightMethods['cdp_method1_cssLayoutViewport_height'] = Math.round(layoutMetrics.cssLayoutViewport.height);
            }
            // CDP Method 2: Content Size height
            if (layoutMetrics.contentSize && layoutMetrics.contentSize.height) {
              cdpHeightMethods['cdp_method2_contentSize'] = Math.round(layoutMetrics.contentSize.height);
            }
            // CDP Method 3: CSS Visual Viewport height
            if (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.clientHeight) {
              cdpHeightMethods['cdp_method3_cssVisualViewport_clientHeight'] = Math.round(layoutMetrics.cssVisualViewport.clientHeight);
            }
            if (layoutMetrics.cssVisualViewport && layoutMetrics.cssVisualViewport.height) {
              cdpHeightMethods['cdp_method3_cssVisualViewport_height'] = Math.round(layoutMetrics.cssVisualViewport.height);
            }
          }
          
          // Add additional CDP measurements
          if (cdpAdditionalMeasurements.cdp_dom_boxModel_body) {
            cdpWidthMethods['cdp_method4_dom_boxModel_body'] = cdpAdditionalMeasurements.cdp_dom_boxModel_body.width;
            cdpHeightMethods['cdp_method4_dom_boxModel_body'] = cdpAdditionalMeasurements.cdp_dom_boxModel_body.height;
          }
          if (cdpAdditionalMeasurements.cdp_dom_contentQuads_body) {
            cdpWidthMethods['cdp_method5_dom_contentQuads_body'] = cdpAdditionalMeasurements.cdp_dom_contentQuads_body.width;
            cdpHeightMethods['cdp_method5_dom_contentQuads_body'] = cdpAdditionalMeasurements.cdp_dom_contentQuads_body.height;
          }
          if (cdpAdditionalMeasurements.cdp_runtime_screen) {
            cdpWidthMethods['cdp_method6_runtime_screen_width'] = cdpAdditionalMeasurements.cdp_runtime_screen.screenWidth;
            cdpWidthMethods['cdp_method6_runtime_screen_availWidth'] = cdpAdditionalMeasurements.cdp_runtime_screen.screenAvailWidth;
            cdpHeightMethods['cdp_method6_runtime_screen_height'] = cdpAdditionalMeasurements.cdp_runtime_screen.screenHeight;
            cdpHeightMethods['cdp_method6_runtime_screen_availHeight'] = cdpAdditionalMeasurements.cdp_runtime_screen.screenAvailHeight;
          }
          if (cdpAdditionalMeasurements.cdp_runtime_visualViewport) {
            cdpWidthMethods['cdp_method7_runtime_visualViewport'] = Math.round(cdpAdditionalMeasurements.cdp_runtime_visualViewport.width);
            cdpHeightMethods['cdp_method7_runtime_visualViewport'] = Math.round(cdpAdditionalMeasurements.cdp_runtime_visualViewport.height);
          }
          if (cdpAdditionalMeasurements.cdp_runtime_devicePixelRatio) {
            cdpWidthMethods['cdp_method8_runtime_innerWidth'] = cdpAdditionalMeasurements.cdp_runtime_devicePixelRatio.innerWidth;
            cdpWidthMethods['cdp_method8_runtime_outerWidth'] = cdpAdditionalMeasurements.cdp_runtime_devicePixelRatio.outerWidth;
            cdpHeightMethods['cdp_method8_runtime_innerHeight'] = cdpAdditionalMeasurements.cdp_runtime_devicePixelRatio.innerHeight;
            cdpHeightMethods['cdp_method8_runtime_outerHeight'] = cdpAdditionalMeasurements.cdp_runtime_devicePixelRatio.outerHeight;
          }
          if (cdpAdditionalMeasurements.cdp_runtime_pdfjsPageDimensions) {
            if (cdpAdditionalMeasurements.cdp_runtime_pdfjsPageDimensions.firstPageWidth) {
              cdpWidthMethods['cdp_method9_pdfjsPageDimensions'] = cdpAdditionalMeasurements.cdp_runtime_pdfjsPageDimensions.firstPageWidth;
            }
            if (cdpAdditionalMeasurements.cdp_runtime_pdfjsPageDimensions.firstPageHeight) {
              cdpHeightMethods['cdp_method9_pdfjsPageDimensions'] = cdpAdditionalMeasurements.cdp_runtime_pdfjsPageDimensions.firstPageHeight;
            }
          }
          if (cdpAdditionalMeasurements.cdp_runtime_pdfjsDocument) {
            if (cdpAdditionalMeasurements.cdp_runtime_pdfjsDocument.pageWidth) {
              cdpWidthMethods['cdp_method10_pdfjsDocument'] = cdpAdditionalMeasurements.cdp_runtime_pdfjsDocument.pageWidth;
            }
            if (cdpAdditionalMeasurements.cdp_runtime_pdfjsDocument.pageHeight) {
              cdpHeightMethods['cdp_method10_pdfjsDocument'] = cdpAdditionalMeasurements.cdp_runtime_pdfjsDocument.pageHeight;
            }
          }
          if (cdpAdditionalMeasurements.cdp_runtime_pdfUrlPage) {
            if (cdpAdditionalMeasurements.cdp_runtime_pdfUrlPage.embedWidth) {
              cdpWidthMethods['cdp_method11_pdfUrlPage'] = cdpAdditionalMeasurements.cdp_runtime_pdfUrlPage.embedWidth;
            }
            if (cdpAdditionalMeasurements.cdp_runtime_pdfUrlPage.embedHeight) {
              cdpHeightMethods['cdp_method11_pdfUrlPage'] = cdpAdditionalMeasurements.cdp_runtime_pdfUrlPage.embedHeight;
            }
          }
          if (cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer) {
            if (cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppViewport) {
              cdpWidthMethods['cdp_method12_chromePdfViewer_viewport'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppViewport.width;
              cdpHeightMethods['cdp_method12_chromePdfViewer_viewport'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppViewport.height;
            }
            if (cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppPage) {
              cdpWidthMethods['cdp_method12_chromePdfViewer_page'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppPage.width;
              cdpHeightMethods['cdp_method12_chromePdfViewer_page'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pdfViewerAppPage.height;
            }
            if (cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pageElement) {
              cdpWidthMethods['cdp_method12_chromePdfViewer_element'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pageElement.width;
              cdpHeightMethods['cdp_method12_chromePdfViewer_element'] = cdpAdditionalMeasurements.cdp_runtime_chromePdfViewer.pageElement.height;
            }
          }
          if (cdpAdditionalMeasurements.cdp_dom_pdfElements && cdpAdditionalMeasurements.cdp_dom_pdfElements.length > 0) {
            // Use first PDF element found
            const firstElement = cdpAdditionalMeasurements.cdp_dom_pdfElements[0];
            cdpWidthMethods['cdp_method13_dom_pdfElements'] = firstElement.width;
            cdpHeightMethods['cdp_method13_dom_pdfElements'] = firstElement.height;
          }
          if (cdpAdditionalMeasurements.cdp_css_bodyComputedStyle) {
            if (cdpAdditionalMeasurements.cdp_css_bodyComputedStyle.width) {
              const widthValue = parseFloat(cdpAdditionalMeasurements.cdp_css_bodyComputedStyle.width);
              if (!isNaN(widthValue) && widthValue > 0) {
                cdpWidthMethods['cdp_method14_css_bodyComputedStyle'] = Math.round(widthValue);
              }
            }
            if (cdpAdditionalMeasurements.cdp_css_bodyComputedStyle.height) {
              const heightValue = parseFloat(cdpAdditionalMeasurements.cdp_css_bodyComputedStyle.height);
              if (!isNaN(heightValue) && heightValue > 0) {
                cdpHeightMethods['cdp_method14_css_bodyComputedStyle'] = Math.round(heightValue);
              }
            }
          }
          
          // CRITICAL: Log ALL measurement methods immediately after getting pdfArea
          // Log even if pdfArea is null or doesn't have methods - we need to see what we got
          // ALWAYS log methods, even if pdfArea is null or empty
          // Merge DOM methods with CDP methods
          const widthMethods = { ...(pdfArea?.pdfPageWidthMethods || {}), ...cdpWidthMethods };
          const heightMethods = { ...(pdfArea?.pdfPageHeightMethods || {}), ...cdpHeightMethods };
          
          // ========== COLUMN 1: ALL WIDTH MEASUREMENT METHODS (INDEPENDENT) ==========
          const widthMethodsList = Object.entries(widthMethods).map(([method, value]) => ({
            method: method,
            width: value,
            isValid: value && value > 100 && value < 5000,
            note: value ? `${value}px` : 'null'
          }));
          
          criticalLog('[CDP Render] [BATCH] 📐 COLUMN 1: ALL WIDTH MEASUREMENT METHODS (INDEPENDENT)', 'PDF_WIDTH_METHODS_ALL', {
            pageNum,
            tabId: tab.id,
            // Column 1: All width methods as array
            widthMethodsList: widthMethodsList,
            // Column 1: All width methods as object (for compatibility)
            allWidthMethods: widthMethods,
            // Column 1: Best width selection
            bestWidth: pdfArea?.pdfPageWidthBest || null,
            bestMethod: pdfArea?.pdfPageWidthBestMethod || null,
            bestPriority: pdfArea?.pdfPageWidthBestPriority || null,
            // Column 1: Basic width values (for reference)
            containerWidth: pdfArea?.containerWidth || null,
            embedWidth: pdfArea?.embedWidth || null,
            viewportWidth: pdfArea?.viewportWidth || null,
            width: pdfArea?.width || null,
            // Column 1: Summary
            totalWidthMethods: widthMethodsList.length,
            validWidthMethods: widthMethodsList.filter(m => m.isValid).length,
            widthMethodsWithValues: widthMethodsList.filter(m => m.width !== null).map(m => `${m.method}: ${m.width}px`),
            // Column 1: Debug info
            hasPdfArea: !!pdfArea,
            pdfAreaFound: pdfArea?.found || false,
            pdfAreaFallback: pdfArea?.fallback || false,
            timestamp: Date.now()
          });
          
          // ========== COLUMN 2: ALL HEIGHT MEASUREMENT METHODS (INDEPENDENT) ==========
          const heightMethodsList = Object.entries(heightMethods).map(([method, value]) => ({
            method: method,
            height: value,
            isValid: value && value > 100 && value < 10000,
            note: value ? `${value}px` : 'null'
          }));
          
          criticalLog('[CDP Render] [BATCH] 📏 COLUMN 2: ALL HEIGHT MEASUREMENT METHODS (INDEPENDENT)', 'PDF_HEIGHT_METHODS_ALL', {
            pageNum,
            tabId: tab.id,
            // Column 2: All height methods as array
            heightMethodsList: heightMethodsList,
            // Column 2: All height methods as object (for compatibility)
            allHeightMethods: heightMethods,
            // Column 2: Basic height values (for reference)
            height: pdfArea?.height || null,
            containerHeight: pdfArea?.containerHeight || null,
            embedHeight: pdfArea?.embedHeight || null,
            viewportHeight: pdfArea?.viewportHeight || null,
            // Column 2: Check validity
            hasHeight: (pdfArea?.height || 0) > 0,
            hasContainerHeight: (pdfArea?.containerHeight || 0) > 0,
            hasEmbedHeight: (pdfArea?.embedHeight || 0) > 0,
            hasViewportHeight: (pdfArea?.viewportHeight || 0) > 0,
            // Column 2: Summary
            totalHeightMethods: heightMethodsList.length,
            validHeightMethods: heightMethodsList.filter(m => m.isValid).length,
            heightMethodsWithValues: heightMethodsList.filter(m => m.height !== null).map(m => `${m.method}: ${m.height}px`),
            // Column 2: Debug info
            hasPdfArea: !!pdfArea,
            pdfAreaFound: pdfArea?.found || false,
            pdfAreaFallback: pdfArea?.fallback || false,
            timestamp: Date.now()
          });
          
          if (pdfArea) {
            
            // Log all combined dimensions methods (width x height)
            criticalLog('[CDP Render] [BATCH] 📊 ALL DIMENSIONS METHODS (WIDTH x HEIGHT)', 'PDF_DIMENSIONS_METHODS_ALL', {
              pageNum,
              tabId: tab.id,
              allDimensionsMethods: pdfArea.pdfPageDimensionsMethods || {},
              // Calculate aspect ratios for each method
              dimensionsWithRatios: pdfArea.pdfPageDimensionsMethods ? Object.entries(pdfArea.pdfPageDimensionsMethods).map(([key, value]) => {
                if (!value) return { method: key, value: null };
                return {
                  method: key,
                  width: value.width,
                  height: value.height,
                  aspectRatio: value.aspectRatio,
                  basedOnRatio: value.basedOnRatio || null,
                  scale: value.scale || null
                };
              }) : [],
              // Target aspect ratios for comparison
              targetRatios: [
                { name: '1635x2000', ratio: (1635/2000).toFixed(4), width: 1635, height: 2000 },
                { name: '814x1000', ratio: (814/1000).toFixed(4), width: 814, height: 1000 },
                { name: '1308x1607', ratio: (1308/1607).toFixed(4), width: 1308, height: 1607 }
              ],
              timestamp: Date.now()
            });
            
            // Log comparison with target ratios
            if (pdfArea.pdfPageDimensionsMethods) {
              const targetRatios = [
                { name: '1635x2000', ratio: 1635/2000, width: 1635, height: 2000 },
                { name: '814x1000', ratio: 814/1000, width: 814, height: 1000 },
                { name: '1308x1607', ratio: 1308/1607, width: 1308, height: 1607 }
              ];
              
              const comparisons = [];
              for (const [methodKey, methodValue] of Object.entries(pdfArea.pdfPageDimensionsMethods)) {
                if (methodValue && methodValue.width && methodValue.height) {
                  const methodRatio = methodValue.width / methodValue.height;
                  for (const targetRatio of targetRatios) {
                    const ratioDiff = Math.abs(methodRatio - targetRatio.ratio);
                    const widthDiff = Math.abs(methodValue.width - targetRatio.width);
                    const heightDiff = Math.abs(methodValue.height - targetRatio.height);
                    const widthDiffPercent = (widthDiff / targetRatio.width) * 100;
                    const heightDiffPercent = (heightDiff / targetRatio.height) * 100;
                    
                    comparisons.push({
                      method: methodKey,
                      measured: `${methodValue.width}x${methodValue.height}`,
                      measuredRatio: methodRatio.toFixed(4),
                      target: targetRatio.name,
                      targetRatio: targetRatio.ratio.toFixed(4),
                      ratioDifference: ratioDiff.toFixed(4),
                      widthDifference: widthDiff,
                      widthDifferencePercent: widthDiffPercent.toFixed(2) + '%',
                      heightDifference: heightDiff,
                      heightDifferencePercent: heightDiffPercent.toFixed(2) + '%',
                      matches: ratioDiff < 0.01 && widthDiffPercent < 5 && heightDiffPercent < 5
                    });
                  }
                }
              }
              
              criticalLog('[CDP Render] [BATCH] 🎯 DIMENSIONS COMPARISON WITH TARGET RATIOS', 'PDF_DIMENSIONS_COMPARISON', {
                pageNum,
                tabId: tab.id,
                comparisons: comparisons,
                bestMatches: comparisons.filter(c => c.matches),
                closestMatches: comparisons.sort((a, b) => parseFloat(a.ratioDifference) - parseFloat(b.ratioDifference)).slice(0, 5),
                timestamp: Date.now()
              });
            }
            
            // Legacy log for compatibility
            criticalLog('[CDP Render] [BATCH] 📏 ALL HEIGHT VALUES FROM pdfArea', 'PDF_AREA_HEIGHTS', {
              pageNum,
              tabId: tab.id,
              // All height values available
              height: pdfArea.height || null,
              containerHeight: pdfArea.containerHeight || null,
              embedHeight: pdfArea.embedHeight || null,
              viewportHeight: pdfArea.viewportHeight || null,
              // Check validity
              hasHeight: (pdfArea.height || 0) > 0,
              hasContainerHeight: (pdfArea.containerHeight || 0) > 0,
              hasEmbedHeight: (pdfArea.embedHeight || 0) > 0,
              hasViewportHeight: (pdfArea.viewportHeight || 0) > 0,
              // Which element was found
              usingContainer: pdfArea.usingContainer || false,
              usingEmbed: pdfArea.usingEmbed || false,
              found: pdfArea.found || false,
              fallback: pdfArea.fallback || false,
              // Current viewport
              currentViewportHeight: viewportHeight,
              // Analysis
              allHeights: {
                height: pdfArea.height,
                containerHeight: pdfArea.containerHeight,
                embedHeight: pdfArea.embedHeight,
                viewportHeight: pdfArea.viewportHeight
              },
              note: 'These are the REAL measured heights from DOM - but clipHeight will be set to hardcoded 1000px',
              timestamp: Date.now()
            });
          }
          
          log('[CDP Render] [BATCH] PDF content area found', {
            pageNum,
            pdfArea,
            hasPdfPageWidthMethods: !!(pdfArea && pdfArea.pdfPageWidthMethods),
            pdfPageWidthMethodsKeys: pdfArea && pdfArea.pdfPageWidthMethods ? Object.keys(pdfArea.pdfPageWidthMethods) : [],
            timestamp: Date.now()
          });
          
          // CRITICAL: Log all PDF page width detection methods (ALWAYS, even if empty)
          if (pdfArea) {
            criticalLog('[CDP Render] [BATCH] 🔍 PDF PAGE WIDTH DETECTION METHODS', 'PDF_PAGE_WIDTH_DETECTION', {
              pageNum,
              tabId: tab.id,
              hasMethods: !!(pdfArea.pdfPageWidthMethods),
              // All methods results (even if null/undefined)
              methods: pdfArea.pdfPageWidthMethods || {},
              // Best result
              bestWidth: pdfArea.pdfPageWidthBest || null,
              bestMethod: pdfArea.pdfPageWidthBestMethod || null,
              bestPriority: pdfArea.pdfPageWidthBestPriority || null,
              // Comparison with container/embed widths
              containerWidth: pdfArea.containerWidth || null,
              embedWidth: pdfArea.embedWidth || null,
              viewportWidth: pdfArea.viewportWidth || null,
              fallbackWidth: pdfArea.width || null,
              // Analysis
              bestWidthIsReasonable: pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000,
              bestWidthIsFromHighPriorityMethod: pdfArea.pdfPageWidthBestPriority && pdfArea.pdfPageWidthBestPriority >= 7,
              found: pdfArea.found || false,
              fallback: pdfArea.fallback || false,
              recommendation: pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000 && pdfArea.pdfPageWidthBestPriority >= 7
                ? '✅ Use bestWidth - from high priority method (actual PDF content width)'
                : pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000
                  ? '⚠️ Use bestWidth - reasonable but from lower priority method'
                  : '❌ Use containerWidth/embedWidth/fallbackWidth as fallback',
              timestamp: Date.now()
            });
          }
          
          // CRITICAL: Log all PDF page width detection methods (only if methods exist)
          if (pdfArea && pdfArea.pdfPageWidthMethods) {
            criticalLog('[CDP Render] [BATCH] 🔍 PDF PAGE WIDTH DETECTION METHODS', 'PDF_PAGE_WIDTH_DETECTION', {
              pageNum,
              tabId: tab.id,
              // All methods results
              methods: pdfArea.pdfPageWidthMethods,
              // Best result
              bestWidth: pdfArea.pdfPageWidthBest,
              bestMethod: pdfArea.pdfPageWidthBestMethod,
              bestPriority: pdfArea.pdfPageWidthBestPriority,
              // Comparison with container/embed widths
              containerWidth: pdfArea.containerWidth,
              embedWidth: pdfArea.embedWidth,
              viewportWidth: pdfArea.viewportWidth,
              // Analysis
              bestWidthIsReasonable: pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000,
              bestWidthIsFromHighPriorityMethod: pdfArea.pdfPageWidthBestPriority && pdfArea.pdfPageWidthBestPriority >= 7,
              recommendation: pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000 && pdfArea.pdfPageWidthBestPriority >= 7
                ? '✅ Use bestWidth - from high priority method (actual PDF content width)'
                : pdfArea.pdfPageWidthBest && pdfArea.pdfPageWidthBest > 100 && pdfArea.pdfPageWidthBest < 5000
                  ? '⚠️ Use bestWidth - reasonable but from lower priority method'
                  : '❌ Use containerWidth/embedWidth as fallback',
              timestamp: Date.now()
            });
          }
          
          // Use PDF area coordinates if found, otherwise use fallback or default viewport
          // clipX, clipY, clipWidth, clipHeight are already initialized above
          if (pdfArea && (pdfArea.found || pdfArea.fallback) && pdfArea.width > 0 && pdfArea.height > 0) {
            
            // CRITICAL: Use REAL PDF page width if detected, otherwise use container/embed width
            // Prefer method10_estimatedFromViewport if available (usually most accurate)
            let finalClipWidth = null;
            if (pdfArea.pdfPageWidthMethods && 
                pdfArea.pdfPageWidthMethods.method10_estimatedFromViewport && 
                pdfArea.pdfPageWidthMethods.method10_estimatedFromViewport > 100 && 
                pdfArea.pdfPageWidthMethods.method10_estimatedFromViewport < 5000) {
              // Use method10_estimatedFromViewport (usually most accurate)
              finalClipWidth = pdfArea.pdfPageWidthMethods.method10_estimatedFromViewport;
              criticalLog('[CDP Render] [BATCH] ✅ Using method10_estimatedFromViewport', 'PDF_PAGE_WIDTH_USED', {
                pageNum,
                detectedWidth: finalClipWidth,
                method: 'method10_estimatedFromViewport',
                timestamp: Date.now()
              });
            } else if (pdfArea.pdfPageWidthBest && 
                pdfArea.pdfPageWidthBest > 100 && 
                pdfArea.pdfPageWidthBest < 5000) {
              // Use detected width from any method
              finalClipWidth = pdfArea.pdfPageWidthBest;
              criticalLog('[CDP Render] [BATCH] ✅ Using detected PDF page width', 'PDF_PAGE_WIDTH_USED', {
                pageNum,
                detectedWidth: pdfArea.pdfPageWidthBest,
                method: pdfArea.pdfPageWidthBestMethod,
                priority: pdfArea.pdfPageWidthBestPriority,
                timestamp: Date.now()
              });
            } else {
              // Fallback to container/embed width
              if (pdfArea.usingContainer && pdfArea.containerWidth) {
                finalClipWidth = pdfArea.containerWidth;
              } else if (pdfArea.embedWidth) {
                finalClipWidth = pdfArea.embedWidth;
              } else {
                finalClipWidth = pdfArea.width;
              }
              criticalLog('[CDP Render] [BATCH] ⚠️ Using fallback width (detected width not suitable)', 'PDF_PAGE_WIDTH_FALLBACK', {
                pageNum,
                fallbackWidth: finalClipWidth,
                detectedWidth: pdfArea.pdfPageWidthBest,
                detectedMethod: pdfArea.pdfPageWidthBestMethod,
                detectedPriority: pdfArea.pdfPageWidthBestPriority,
                reason: pdfArea.pdfPageWidthBest 
                  ? `Detected width ${pdfArea.pdfPageWidthBest} is not reasonable or from low priority method`
                  : 'No width detected',
                timestamp: Date.now()
              });
            }
            
            // CRITICAL: Log ALL available height values BEFORE setting clipHeight
            criticalLog('[CDP Render] [BATCH] 🔍 ALL AVAILABLE HEIGHT VALUES BEFORE SETTING clipHeight', 'PDF_HEIGHT_ANALYSIS', {
              pageNum,
              tabId: tab.id,
              // All available height values from pdfArea
              pdfAreaHeight: pdfArea.height,
              containerHeight: pdfArea.containerHeight,
              embedHeight: pdfArea.embedHeight,
              viewportHeight: viewportHeight,
              // Check which values are valid
              hasPdfAreaHeight: pdfArea.height > 0,
              hasContainerHeight: pdfArea.containerHeight > 0,
              hasEmbedHeight: pdfArea.embedHeight > 0,
              // Current clipHeight (before setting)
              currentClipHeight: clipHeight,
              // What will be used
              willUseFixedHeight: true,
              fixedHeightValue: 1000,
              reason: 'Using hardcoded 1000px instead of measured values',
              timestamp: Date.now()
            });
            
            // CRITICAL: Use original tab layout if available (HIGHEST PRIORITY - measured in user's tab)
            if (originalTabLayout && originalTabLayout.sidebarWidth !== undefined) {
              // Use full viewport width - no clipping on sides
              clipX = 0;
              clipY = originalTabLayout.pdfContentY;
              clipWidth = viewportWidth; // Full width, no side clipping
              
              // CRITICAL: Use measured height from original tab if available, otherwise use PDF.js API
              if (originalTabLayout.pdfContentHeight && originalTabLayout.pdfContentHeight > 0) {
                clipHeight = originalTabLayout.pdfContentHeight; // Use measured height from original tab
              } else if (pdfPageDimensions && pdfPageDimensions.height) {
                const pdfScale = 1.0;
                // Use maximum height to avoid bottom clipping
                // PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
                // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
                // Convert from 72 DPI (points) to 96 DPI (screen pixels)
                const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
              } else {
                clipHeight = 1000; // Fallback: fixed height
              }
              
              criticalLog('[CDP Render] [BATCH] ✅ Using original tab layout (HIGHEST PRIORITY)', 'PDF_CLIP_ORIGINAL_TAB_LAYOUT', {
                pageNum,
                tabId: tab.id,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                sidebarWidth: originalTabLayout.sidebarWidth,
                pdfContentX: originalTabLayout.pdfContentX,
                pdfContentY: originalTabLayout.pdfContentY,
                pdfContentWidth: originalTabLayout.pdfContentWidth,
                pdfContentHeight: originalTabLayout.pdfContentHeight,
                viewportWidth: originalTabLayout.viewportWidth,
                viewportHeight: originalTabLayout.viewportHeight,
                heightSource: (originalTabLayout.pdfContentHeight && originalTabLayout.pdfContentHeight > 0) ? 'original_tab_measured' : (pdfPageDimensions && pdfPageDimensions.height) ? 'pdfjs_api_scaled' : 'fallback_1000',
                note: 'Using layout measured in original user tab - excludes sidebar automatically',
                timestamp: Date.now()
              });
            } else if (pdfContentAreaFromCdp && pdfContentAreaFromCdp.found) {
              // Use full viewport width - no clipping on sides
              clipX = 0;
              clipY = pdfContentAreaFromCdp.y;
              clipWidth = viewportWidth; // Full width, no side clipping
              // CRITICAL: Use measured height from CDP DOM if available (real display size - one page exactly)
              // Only fallback to PDF.js API if CDP DOM height is not available
              if (pdfContentAreaFromCdp.height && pdfContentAreaFromCdp.height > 0) {
                clipHeight = pdfContentAreaFromCdp.height; // Use measured height from CDP DOM (real display size - one page)
              } else if (pdfPageDimensions && pdfPageDimensions.height) {
                const pdfScale = 1.0;
                // Use maximum height to avoid bottom clipping
                // PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
                // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
                // Convert from 72 DPI (points) to 96 DPI (screen pixels)
                const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
              } else {
                clipHeight = 1000; // Fallback: fixed height
              }
              
              criticalLog('[CDP Render] [BATCH] ✅ Using CDP DOM coordinates (excludes ALL UI)', 'PDF_CLIP_CDP_DOM', {
                pageNum,
                tabId: tab.id,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                cdpMethod: pdfContentAreaFromCdp.method,
                cdpWidth: pdfContentAreaFromCdp.width,
                cdpHeight: pdfContentAreaFromCdp.height,
                pdfjsHeight: pdfPageDimensions?.height,
                heightSource: (pdfContentAreaFromCdp.height && pdfContentAreaFromCdp.height > 0) ? 'cdp_dom_measured' : (pdfPageDimensions && pdfPageDimensions.height) ? 'pdfjs_api_scaled' : 'fallback_1000',
                note: 'Using CDP DOM coordinates - most accurate, excludes all UI elements',
                timestamp: Date.now()
              });
              
              log('[CDP Render] [BATCH] ✅ Using CDP DOM coordinates (excludes ALL UI)', {
                pageNum,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                cdpMethod: pdfContentAreaFromCdp.method,
                timestamp: Date.now()
              });
            } else if (pdfArea.usingContainer && pdfArea.containerX !== null && pdfArea.containerY !== null) {
            // CRITICAL: Use div#content coordinates if available (excludes UI)
            // If div#content found, use its coordinates directly
            // If only embed found, we need to calculate proper coordinates
              // Use full viewport width - no clipping on sides
              clipX = 0;
              clipY = pdfArea.containerY;
              clipWidth = viewportWidth; // Full width, no side clipping
              
              // Use PDF.js API dimensions if available, otherwise fallback to 1000px
              // CRITICAL: PDF.js returns dimensions in points, need to scale to pixels
              const pdfScale = 1.0;
              if (pdfPageDimensions && pdfPageDimensions.height) {
                // Use maximum height to avoid bottom clipping
                // PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
                // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
                // Convert from 72 DPI (points) to 96 DPI (screen pixels)
                const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
              } else {
                clipHeight = 1000; // Fixed height for one full page (fallback)
              }
              
              criticalLog('[CDP Render] [BATCH] Using div#content coordinates (excludes UI)', 'PDF_CLIP_HEIGHT_SET', {
                pageNum,
                tabId: tab.id,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                // All available height values
                containerHeight: pdfArea.containerHeight,
                pdfAreaHeight: pdfArea.height,
                embedHeight: pdfArea.embedHeight,
                viewportHeight: viewportHeight,
                // Why this value was chosen
                heightSource: 'hardcoded_1000',
                availableHeights: {
                  containerHeight: pdfArea.containerHeight,
                  pdfAreaHeight: pdfArea.height,
                  embedHeight: pdfArea.embedHeight,
                  viewportHeight: viewportHeight
                },
                detectedPdfWidth: pdfArea.pdfPageWidthBest,
                usingDetectedWidth: clipWidth === pdfArea.pdfPageWidthBest,
                note: 'Using hardcoded 1000px instead of containerHeight or other measured values',
                timestamp: Date.now()
              });
              
              log('[CDP Render] [BATCH] Using div#content coordinates (excludes UI)', {
                pageNum,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                containerHeight: pdfArea.containerHeight,
                detectedPdfWidth: pdfArea.pdfPageWidthBest,
                usingDetectedWidth: clipWidth === pdfArea.pdfPageWidthBest,
                timestamp: Date.now()
              });
            } else {
              // Only embed found - use full viewport width, no side clipping
              clipX = 0;
              clipY = Math.max(60, pdfArea.embedY || pdfArea.y); // Skip toolbar
              clipWidth = viewportWidth; // Full width, no side clipping
              
              // Use PDF.js API dimensions if available, otherwise fallback to 1000px
              // CRITICAL: PDF.js returns dimensions in points, need to scale to pixels
              const pdfScale = 1.0;
              if (pdfPageDimensions && pdfPageDimensions.height) {
                // Use maximum height to avoid bottom clipping
                // PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
                // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
                // Convert from 72 DPI (points) to 96 DPI (screen pixels)
                const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
              } else {
                clipHeight = 1000; // Fixed height for one full page (fallback)
              }
              
              criticalLog('[CDP Render] [BATCH] Using embed coordinates with UI adjustment', 'PDF_CLIP_HEIGHT_SET_EMBED', {
                pageNum,
                tabId: tab.id,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                // All available height values
                embedHeight: pdfArea.embedHeight,
                pdfAreaHeight: pdfArea.height,
                containerHeight: pdfArea.containerHeight,
                viewportHeight: viewportHeight,
                embedY: pdfArea.embedY,
                // Why this value was chosen
                heightSource: 'hardcoded_1000',
                availableHeights: {
                  embedHeight: pdfArea.embedHeight,
                  pdfAreaHeight: pdfArea.height,
                  containerHeight: pdfArea.containerHeight,
                  viewportHeight: viewportHeight
                },
                detectedPdfWidth: pdfArea.pdfPageWidthBest,
                usingDetectedWidth: clipWidth === pdfArea.pdfPageWidthBest,
                note: 'Using hardcoded 1000px instead of embedHeight or other measured values',
                timestamp: Date.now()
              });
              
              log('[CDP Render] [BATCH] Using embed coordinates with UI adjustment', {
                pageNum,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                embedHeight: pdfArea.embedHeight,
                embedY: pdfArea.embedY,
                detectedPdfWidth: pdfArea.pdfPageWidthBest,
                usingDetectedWidth: clipWidth === pdfArea.pdfPageWidthBest,
                timestamp: Date.now()
              });
            }
            
            // Update viewport dimensions
            viewportWidth = clipWidth;
            viewportHeight = clipHeight;
            
            criticalLog('[CDP Render] [BATCH] 📊 FINAL CLIP HEIGHT DECISION', 'PDF_CLIP_HEIGHT_FINAL', {
              pageNum,
              tabId: tab.id,
              // Final clip values
              clipX,
              clipY,
              clipWidth,
              clipHeight,
              // All available height values for comparison
              allAvailableHeights: {
                pdfAreaHeight: pdfArea.height,
                containerHeight: pdfArea.containerHeight,
                embedHeight: pdfArea.embedHeight,
                viewportHeight: viewportHeight,
                currentClipHeight: clipHeight
              },
              // Comparison
              originalPdfAreaHeight: pdfArea.height,
              adjustedHeight: clipHeight > pdfArea.height ? 'increased' : 'unchanged',
              heightDifference: clipHeight - (pdfArea.height || 0),
              // Viewport
              viewportWidth,
              viewportHeight,
              // Metadata
              pdfAreaType: pdfArea.type || 'fallback',
              usingEmbed: pdfArea.usingEmbed || false,
              usingContainer: pdfArea.usingContainer || false,
              // Decision
              heightSource: 'hardcoded_1000',
              note: 'clipHeight is hardcoded to 1000px, not using measured values from DOM',
              timestamp: Date.now()
            });
            
            log('[CDP Render] [BATCH] Using PDF content area for clipping', {
              pageNum,
              clipX,
              clipY,
              clipWidth,
              clipHeight,
              originalPdfAreaHeight: pdfArea.height,
              adjustedHeight: clipHeight > pdfArea.height ? 'increased' : 'unchanged',
              viewportWidth,
              viewportHeight,
              pdfAreaType: pdfArea.type || 'fallback',
              usingEmbed: pdfArea.usingEmbed || false,
              timestamp: Date.now()
            });
          } else {
            // Fallback: PDF area not found via Runtime.evaluate, check CDP DOM result
            if (pdfContentAreaFromCdp && pdfContentAreaFromCdp.found) {
              // Use coordinates from CDP DOM (most accurate - excludes all UI)
              clipX = pdfContentAreaFromCdp.x;
              clipY = pdfContentAreaFromCdp.y;
              clipWidth = pdfContentAreaFromCdp.width;
              // CRITICAL: Use measured height from CDP DOM if available (real display size - one page exactly)
              // Only fallback to PDF.js API if CDP DOM height is not available
              if (pdfContentAreaFromCdp.height && pdfContentAreaFromCdp.height > 0) {
                clipHeight = pdfContentAreaFromCdp.height; // Use measured height from CDP DOM (real display size - one page)
              } else if (pdfPageDimensions && pdfPageDimensions.height) {
                const pdfScale = 1.0;
                // Use maximum height to avoid bottom clipping
                // PDF.js getViewport({ scale: 1.0 }) returns dimensions in points (72 DPI)
                // Chrome PDFium viewer at 100% zoom uses 96 DPI (standard Windows DPI)
                // Convert from 72 DPI (points) to 96 DPI (screen pixels)
                const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
              } else {
                clipHeight = 1000; // Fallback: fixed height
              }
              
              criticalLog('[CDP Render] [BATCH] ✅ Using CDP DOM coordinates (fallback from Runtime.evaluate)', 'PDF_CLIP_CDP_DOM_FALLBACK', {
                pageNum,
                tabId: tab.id,
                clipX,
                clipY,
                clipWidth,
                clipHeight,
                cdpMethod: pdfContentAreaFromCdp.method,
                cdpWidth: pdfContentAreaFromCdp.width,
                cdpHeight: pdfContentAreaFromCdp.height,
                pdfjsHeight: pdfPageDimensions?.height,
                heightSource: (pdfContentAreaFromCdp.height && pdfContentAreaFromCdp.height > 0) ? 'cdp_dom_measured' : (pdfPageDimensions && pdfPageDimensions.height) ? 'pdfjs_api_scaled' : 'fallback_1000',
                note: 'Runtime.evaluate failed, but CDP DOM found PDF area - using CDP DOM coordinates',
                timestamp: Date.now()
              });
            } else {
              // Final fallback: PDF area not found, use PDF.js dimensions if available
              // Chrome PDF viewer: toolbar is ~60px top
              // PDF.js returns dimensions in points (72 DPI), Chrome PDFium uses 96 DPI
              // Convert from 72 DPI (points) to 96 DPI (screen pixels)
              const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333... (792 * 1.333 = 1053 pixels)
              if (pdfPageDimensions && pdfPageDimensions.width && pdfPageDimensions.height) {
                // CRITICAL: Use viewportWidth instead of PDF.js width to avoid sidebar clipping
                clipWidth = viewportWidth; // Use full viewport width to avoid sidebar clipping
                // Use maximum height to avoid bottom clipping
                // Convert from PDF points (72 DPI) to screen pixels (96 DPI)
                const pdfjsHeightInPixels = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
                clipHeight = pdfjsHeightInPixels; // Use only PDF.js height, no viewport comparison
                clipX = 0; // No side clipping
                clipY = 60; // Skip toolbar
              } else {
                // No PDF.js dimensions - use viewport width and fixed height
            clipX = 0;
            clipY = 60; // Skip toolbar
            clipWidth = viewportWidth;
                clipHeight = 1000; // Fixed height for one full page (A4 at 2x scale, fallback)
              }
            }
            
            criticalLog('[CDP Render] [BATCH] ⚠️ PDF AREA NOT FOUND - USING FALLBACK', 'PDF_CLIP_HEIGHT_FALLBACK', {
              pageNum,
              tabId: tab.id,
              clipX,
              clipY,
              clipWidth,
              clipHeight,
              // Available viewport info
              viewportWidth: viewportWidth,
              viewportHeight: viewportHeight,
              // Why fallback
              reason: 'PDF area not found or invalid',
              pdfAreaFound: pdfArea ? (pdfArea.found || pdfArea.fallback) : false,
              pdfAreaValid: pdfArea ? (pdfArea.width > 0 && pdfArea.height > 0) : false,
              // Height source
              heightSource: (pdfPageDimensions && pdfPageDimensions.height) ? 'pdfjs_api' : 'hardcoded_1000_fallback',
              pdfjsHeight: pdfPageDimensions?.height,
              note: (pdfPageDimensions && pdfPageDimensions.height) 
                ? `Using PDF.js API height ${pdfPageDimensions.height}px` 
                : 'Using fixed height 1000px for one full page - no measured values available',
              timestamp: Date.now()
            });
            
            logWarn('[CDP Render] [BATCH] PDF content area not found, using fallback clipping', {
              pageNum,
              clipX,
              clipY,
              clipWidth,
              clipHeight,
              note: 'Using fixed height 1000px for one full page',
              defaultWidth: viewportWidth,
              defaultHeight: viewportHeight,
              timestamp: Date.now()
            });
          }
          
        } catch (checkError) {
          logWarn('[CDP Render] [BATCH] Failed to find PDF content area', {
            pageNum,
            error: checkError.message,
            timestamp: Date.now()
          });
          // Use fallback clipping values with fixed height for one full page
          // Check if CDP DOM found PDF area before using hardcoded values
          if (pdfContentAreaFromCdp && pdfContentAreaFromCdp.found) {
            // Use full viewport width - no clipping on sides
            clipX = 0;
            clipY = pdfContentAreaFromCdp.y;
            clipWidth = viewportWidth; // Full width, no side clipping
            // CRITICAL: Use measured height from CDP DOM if available (real display size - one page exactly)
            // Only fallback to PDF.js API if CDP DOM height is not available
            if (pdfContentAreaFromCdp.height && pdfContentAreaFromCdp.height > 0) {
              clipHeight = pdfContentAreaFromCdp.height; // Use measured height from CDP DOM (real display size - one page)
            } else if (pdfPageDimensions && pdfPageDimensions.height) {
              // PDF.js returns dimensions in points (72 DPI), Chrome PDFium uses 96 DPI
              const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333...
              clipHeight = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
            } else {
              clipHeight = 1000; // Fallback: fixed height
            }
            
            criticalLog('[CDP Render] [BATCH] ✅ Using CDP DOM coordinates (exception fallback)', 'PDF_CLIP_CDP_DOM_EXCEPTION', {
              pageNum,
              tabId: tab.id,
              clipX,
              clipY,
              clipWidth,
              clipHeight,
              cdpMethod: pdfContentAreaFromCdp.method,
              error: checkError.message,
              note: 'Exception occurred, but CDP DOM found PDF area - using CDP DOM coordinates',
              timestamp: Date.now()
            });
          } else {
            // Exception fallback: use full viewport width, no side clipping
            // PDF.js returns dimensions in points (72 DPI), Chrome PDFium uses 96 DPI
            const POINTS_TO_PIXELS_96_DPI = 96 / 72; // 1.333...
            if (pdfPageDimensions && pdfPageDimensions.width && pdfPageDimensions.height) {
              clipWidth = viewportWidth; // Full width, no side clipping
              clipHeight = Math.round(pdfPageDimensions.height * POINTS_TO_PIXELS_96_DPI);
              clipX = 0; // No side clipping
              clipY = 60; // Skip toolbar
            } else {
          clipX = 0;
          clipY = 60; // Skip toolbar
          clipWidth = viewportWidth;
              clipHeight = 1000; // Fixed height for one full page (A4 at 2x scale, fallback)
            }
          }
          
          criticalLog('[CDP Render] [BATCH] ❌ ERROR - USING FALLBACK AFTER EXCEPTION', 'PDF_CLIP_HEIGHT_ERROR_FALLBACK', {
            pageNum,
            tabId: tab.id,
            error: checkError.message,
            errorStack: checkError.stack,
            // Fallback values
            clipX,
            clipY,
            clipWidth,
            clipHeight,
            // Available viewport
            viewportWidth: viewportWidth,
            viewportHeight: viewportHeight,
            // Height source
            heightSource: (pdfPageDimensions && pdfPageDimensions.height) ? 'pdfjs_api' : 'hardcoded_1000_error_fallback',
            pdfjsHeight: pdfPageDimensions?.height,
            note: 'Exception occurred while finding PDF area - using hardcoded 1000px height',
            timestamp: Date.now()
          });
          
          logWarn('[CDP Render] [BATCH] Using fallback clipping after error', {
            pageNum,
            clipX,
            clipY,
            clipWidth,
            clipHeight,
            note: 'Using fixed height 1000px for one full page',
            timestamp: Date.now()
          });
        }
        
        log('[CDP Render] [BATCH] ✅ PDF render wait complete', {
          pageNum,
          timestamp: Date.now()
        });

        // CRITICAL: Make tab visible temporarily for PDF rendering
        // Chrome PDF viewer may not render in invisible tabs
        // We'll make it visible, wait a bit, then screenshot, then hide again
        log('[CDP Render] [BATCH] Making tab visible for PDF rendering...', {
          pageNum,
          tabId: tab.id,
          timestamp: Date.now()
        });
        
        const wasActive = (await chrome.tabs.get(tab.id)).active;
        await chrome.tabs.update(tab.id, { active: true });
        
        // Wait for PDF to render in visible tab - check readiness via CDP events
        log('[CDP Render] [BATCH] Waiting for PDF to render in visible tab...', {
          pageNum,
          maxWait: 3000,
          checkInterval: 200,
          note: 'Using CDP events to check PDF readiness instead of fixed delay',
          timestamp: Date.now()
        });
        
        // Check PDF readiness via CDP events instead of fixed delay
        let pdfReady = false;
        const maxWait = 3000; // Maximum 3 seconds
        const checkInterval = 200; // Check every 200ms
        const startTime = Date.now();
        
        // Listen for page load events
        const loadListener = (source, method) => {
          if (source.tabId === debuggee.tabId) {
            if (method === 'Page.loadEventFired' || 
                method === 'Page.frameNavigated' ||
                method === 'Page.domContentEventFired') {
              pdfReady = true;
              log('[CDP Render] [BATCH] PDF load event received', {
                pageNum,
                method,
                waitTime: Date.now() - startTime
              });
            }
          }
        };
        
        chrome.debugger.onEvent.addListener(loadListener);
        
        // Also check via Runtime.evaluate if PDF viewer is ready
        while (!pdfReady && (Date.now() - startTime) < maxWait) {
          try {
            /** @type {any} */
            const checkResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
              expression: `
                (function() {
                  try {
                    // Check if PDF viewer is present and rendered
                    const embed = document.querySelector('embed[type="application/pdf"]');
                    const iframe = document.querySelector('iframe[type="application/pdf"]');
                    if (embed || iframe) {
                      return { ready: true, hasEmbed: !!embed, hasIframe: !!iframe };
                    }
                    // Check if PDF.js viewer is present
                    if (window.PDFViewerApplication && window.PDFViewerApplication.initialized) {
                      return { ready: true, hasPdfjs: true };
                    }
                    return { ready: false };
                  } catch(e) {
                    return { ready: false, error: e.message };
                  }
                })()
              `
            });
            
            if (checkResult && checkResult.result && checkResult.result.value && checkResult.result.value.ready) {
              pdfReady = true;
              log('[CDP Render] [BATCH] PDF viewer confirmed ready via Runtime.evaluate', {
                pageNum,
                waitTime: Date.now() - startTime,
                details: checkResult.result.value
              });
              break;
            }
          } catch (e) {
            // Continue checking
          }
          
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        chrome.debugger.onEvent.removeListener(loadListener);
        
        const actualWait = Date.now() - startTime;
        if (pdfReady) {
          log('[CDP Render] [BATCH] ✅ PDF confirmed ready', {
            pageNum,
            waitTime: actualWait,
            method: 'cdp_events_and_runtime_check'
          });
        } else {
          logWarn('[CDP Render] [BATCH] ⚠️ PDF readiness not confirmed after 3s, proceeding anyway', {
            pageNum,
            waitTime: actualWait
          });
        }
        
        log('[CDP Render] [BATCH] ✅ Tab is now visible, PDF should be rendered', {
          pageNum,
          timestamp: Date.now()
        });
        
        // CRITICAL: Set viewport size BEFORE screenshot
        // Use larger viewport to ensure full page is visible
        // Then clip to exact PDF area
        log('[CDP Render] [BATCH] Setting viewport size for PDF page...', {
          pageNum,
          viewportWidth,
          viewportHeight,
          clipX,
          clipY,
          clipWidth,
          clipHeight,
          deviceScaleFactor,
          timestamp: Date.now(),
          NOTE: 'Viewport should be large enough to contain full page, then we clip to PDF area'
        });
        
        try {
          // CRITICAL: Get real devicePixelRatio from browser (update the value defined at loop start)
          try {
            /** @type {any} */
            const dprResult = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
              expression: 'window.devicePixelRatio',
              returnByValue: true
            });
            if (dprResult && dprResult.result && dprResult.result.value !== undefined) {
              realDevicePixelRatio = dprResult.result.value;
              criticalLog('[CDP Render] [BATCH] Real devicePixelRatio from browser', 'PDF_DEVICE_PIXEL_RATIO', {
                pageNum,
                tabId: tab.id,
                realDevicePixelRatio: realDevicePixelRatio,
                deviceScaleFactor: deviceScaleFactor,
                usingReal: realDevicePixelRatio !== deviceScaleFactor,
                timestamp: Date.now()
              });
            }
          } catch (dprError) {
            logWarn('[CDP Render] [BATCH] Failed to get real devicePixelRatio, using deviceScaleFactor', {
              pageNum,
              error: dprError.message,
              deviceScaleFactor: deviceScaleFactor,
              timestamp: Date.now()
            });
          }
          
          // CRITICAL: Set viewport to be large enough for full page
          // Use clipWidth and clipHeight + clipY to ensure full page is visible
          // Also account for clipX offset (sidebar) to ensure full width is visible
          // CRITICAL: Use only clipY + clipHeight, don't compare with viewportHeight (may be old value 1200)
          const viewportWidthForScreenshot = Math.max(viewportWidth, clipX + clipWidth);
          const viewportHeightForScreenshot = clipY + clipHeight; // Use only clip dimensions, no viewport comparison
          
          // Enable Emulation domain
          // No scale factors - use 1.0 to get natural rendering
          await chrome.debugger.sendCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
            width: viewportWidthForScreenshot,
            height: viewportHeightForScreenshot,
            deviceScaleFactor: 1.0, // No scale factors - natural rendering
            mobile: false
          });
          
          log('[CDP Render] [BATCH] ✅ Viewport set', {
            pageNum,
            viewportWidth: viewportWidthForScreenshot,
            viewportHeight: viewportHeightForScreenshot,
            clipX,
            clipY,
            clipWidth,
            clipHeight,
            timestamp: Date.now()
          });
          
          // Wait for viewport to apply - check via CDP instead of fixed delay
          let viewportApplied = false;
          for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Check every 50ms
            try {
              /** @type {any} */
              const metrics = await chrome.debugger.sendCommand(debuggee, 'Page.getLayoutMetrics', {});
              if (metrics && metrics.cssLayoutViewport && metrics.cssLayoutViewport.clientWidth > 0) {
                viewportApplied = true;
                log('[CDP Render] [BATCH] Viewport applied confirmed via CDP', {
                  pageNum,
                  viewportWidth: metrics.cssLayoutViewport.clientWidth,
                  checks: i + 1
                });
                break;
              }
            } catch (e) {
              // Continue checking
            }
          }
          if (!viewportApplied) {
            logWarn('[CDP Render] [BATCH] Viewport not confirmed after 300ms, proceeding anyway', { pageNum });
          }
        } catch (viewportError) {
          logWarn('[CDP Render] [BATCH] Failed to set viewport', {
            pageNum,
            error: viewportError.message,
            timestamp: Date.now()
          });
          // Continue anyway - may still work
        }

        // Capture screenshot
        // CRITICAL: Verify which tab will be screenshotted
        const tabBeforeScreenshot = await chrome.tabs.get(tab.id);
        const activeTabBeforeScreenshot = (await chrome.tabs.query({ active: true }))[0];
        const allTabsBeforeScreenshot = await chrome.tabs.query({});
        
        // CRITICAL: Verify PDF is on correct page BEFORE screenshot and reload if needed
        log('[CDP Render] [BATCH] Verifying PDF is on correct page before screenshot...', {
          pageNum,
          tabId: tab.id,
          timestamp: Date.now()
        });
        
        let isCorrectPage = false;
        let verifyAttempts = 0;
        const maxVerifyAttempts = 3; // Reduced since we already reloaded
        const verifyDelay = 500; // 500ms between attempts
        // Note: We already reloaded the page in Step 4.5, so we just verify here
        // pageUrl is already declared above at line 1274
        
        while (!isCorrectPage && verifyAttempts < maxVerifyAttempts) {
          verifyAttempts++;
          try {
            const verifyResult = await chrome.debugger.sendCommand(
              debuggee,
              'Runtime.evaluate',
              {
                expression: `
                  (function() {
                    try {
                      const result = {
                        methods: {},
                        currentPage: null,
                        expectedPage: ${pageNum},
                        isCorrect: false
                      };
                      
                      // Method 1: Check PDFViewerApplication (if available - PDF.js viewer)
                      try {
                        if (window.PDFViewerApplication) {
                          if (typeof window.PDFViewerApplication.page === 'number') {
                            result.methods.pdfViewerApp = window.PDFViewerApplication.page;
                            result.currentPage = window.PDFViewerApplication.page;
                          } else if (window.PDFViewerApplication.pageLabel) {
                            // Sometimes page is stored as pageLabel
                            const pageLabel = parseInt(window.PDFViewerApplication.pageLabel);
                            if (!isNaN(pageLabel)) {
                              result.methods.pdfViewerAppLabel = pageLabel;
                              if (result.currentPage === null) result.currentPage = pageLabel;
                            }
                          }
                        }
                      } catch (e) {
                        result.methods.pdfViewerAppError = e.message;
                      }
                      
                      // Method 2: Check DOM elements with page number (PDF.js viewer UI)
                      try {
                        const pageNumberElement = document.querySelector('.pageNumber') ||
                                                  document.querySelector('[class*="pageNumber"]') ||
                                                  document.querySelector('[id*="pageNumber"]');
                        if (pageNumberElement) {
                          const text = pageNumberElement.textContent || pageNumberElement.innerText;
                          const pageMatch = text.match(/(\\d+)/);
                          if (pageMatch) {
                            const domPage = parseInt(pageMatch[1]);
                            result.methods.domPageNumber = domPage;
                            if (result.currentPage === null) result.currentPage = domPage;
                          }
                        }
                      } catch (e) {
                        result.methods.domError = e.message;
                      }
                      
                      // Method 3: Check URL hash
                      try {
                        const hash = window.location.hash;
                        const hashPageMatch = hash.match(/page=(\\d+)/);
                        const hashPage = hashPageMatch ? parseInt(hashPageMatch[1]) : null;
                        result.methods.urlHash = hashPage;
                        if (result.currentPage === null && hashPage !== null) {
                          result.currentPage = hashPage;
                        }
                        result.hash = hash;
                      } catch (e) {
                        result.methods.urlHashError = e.message;
                      }
                      
                      // Method 4: Check embed original-url (Chrome PDFium viewer)
                      try {
                        const embed = document.querySelector('embed[type="application/x-google-chrome-pdf"]') ||
                                      document.querySelector('embed#plugin') ||
                                      document.querySelector('embed[type="application/pdf"]');
                        if (embed && embed.hasAttribute('original-url')) {
                          const originalUrl = embed.getAttribute('original-url');
                          const urlPageMatch = originalUrl.match(/page=(\\d+)/);
                          const embedPage = urlPageMatch ? parseInt(urlPageMatch[1]) : null;
                          result.methods.embedOriginalUrl = embedPage;
                          result.originalUrl = originalUrl;
                          if (result.currentPage === null && embedPage !== null) {
                            result.currentPage = embedPage;
                          }
                        }
                      } catch (e) {
                        result.methods.embedError = e.message;
                      }
                      
                      // Determine if page is correct
                      if (result.currentPage !== null) {
                        result.isCorrect = result.currentPage === ${pageNum};
                      } else {
                        // If we can't determine current page, assume it's wrong and reload
                        result.isCorrect = false;
                        result.cannotDetermine = true;
                      }
                      
                      return result;
                    } catch (e) {
                      return { error: e.message, expectedPage: ${pageNum}, isCorrect: false };
                    }
                  })()
                `,
                returnByValue: true
              }
            );
            
            // Type assertion for Chrome DevTools Protocol response
            /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
            const typedVerifyResult = verifyResult || {};
            const verify = typedVerifyResult.result?.value;
            if (verify && verify.isCorrect) {
              isCorrectPage = true;
              log('[CDP Render] [BATCH] ✅ PDF is on correct page', {
                pageNum,
                currentPage: verify.currentPage,
                methods: verify.methods,
                attempts: verifyAttempts,
                timestamp: Date.now()
              });
            } else {
              // Log detailed verification info
              log('[CDP Render] [BATCH] PDF page verification', {
                pageNum,
                currentPage: verify?.currentPage,
                expectedPage: verify?.expectedPage,
                isCorrect: verify?.isCorrect,
                cannotDetermine: verify?.cannotDetermine,
                methods: verify?.methods,
                attempts: verifyAttempts,
                timestamp: Date.now()
              });
              
              // Note: We already reloaded the page in Step 4.5, so we just wait and verify
              if (verifyAttempts < maxVerifyAttempts) {
                log('[CDP Render] [BATCH] PDF not on correct page yet, waiting...', {
                  pageNum,
                  currentPage: verify?.currentPage,
                  expectedPage: verify?.expectedPage,
                  attempts: verifyAttempts,
                  maxAttempts: maxVerifyAttempts,
                  timestamp: Date.now()
                });
                await new Promise(resolve => setTimeout(resolve, verifyDelay));
              } else {
                logWarn('[CDP Render] [BATCH] ⚠️ PDF still not on correct page after max attempts!', {
                  pageNum,
                  currentPage: verify?.currentPage,
                  expectedPage: verify?.expectedPage,
                  cannotDetermine: verify?.cannotDetermine,
                  methods: verify?.methods,
                  attempts: verifyAttempts,
                  timestamp: Date.now()
                });
              }
            }
          } catch (verifyError) {
            logWarn('[CDP Render] [BATCH] Failed to verify page', {
              pageNum,
              attempt: verifyAttempts,
              error: verifyError.message,
              timestamp: Date.now()
            });
            if (verifyAttempts < maxVerifyAttempts) {
              await new Promise(resolve => setTimeout(resolve, verifyDelay));
            }
          }
        }
        
        // CRITICAL: Hide UI elements before screenshot (NEW APPROACH)
        // This is more reliable than relying only on clip coordinates
        let hiddenElements = [];
        let uiHidden = false;
        
        try {
          criticalLog('[CDP Render] [BATCH] Hiding UI elements before screenshot', 'PDF_UI_HIDE_START', {
            pageNum,
            tabId: tab.id,
            timestamp: Date.now()
          });
          
          // CRITICAL: Enable DOM domain if not already enabled
          try {
            await chrome.debugger.sendCommand(debuggee, 'DOM.enable');
          } catch (e) {
            // DOM domain might already be enabled, ignore error
          }
          
          // CRITICAL: First, try to get full DOM structure using DOM API
          // This can find elements in shadow DOM or iframes
          let domDocument = null;
          try {
            /** @type {any} */
            const domResult = await chrome.debugger.sendCommand(debuggee, 'DOM.getDocument', {
              depth: -1, // Full depth
              pierce: true // Include shadow DOM
            });
            domDocument = domResult.root;
            criticalLog('[CDP Render] [BATCH] DOM.getDocument result', 'PDF_DOM_GETDOCUMENT', {
              pageNum,
              tabId: tab.id,
              hasRoot: !!domDocument,
              rootNodeId: domDocument?.nodeId,
              rootNodeName: domDocument?.nodeName,
              rootChildNodeCount: domDocument?.childNodeCount,
              timestamp: Date.now()
            });
          } catch (domError) {
            criticalLog('[CDP Render] [BATCH] DOM.getDocument failed', 'PDF_DOM_GETDOCUMENT_ERROR', {
              pageNum,
              tabId: tab.id,
              error: domError.message,
              timestamp: Date.now()
            });
          }
          
          // CRITICAL: Try to find elements using DOM.performSearch
          let sidebarNodeId = null;
          let toolbarNodeId = null;
          let contentNodeId = null;
          let embedNodeId = null;
          
          try {
            // Search for sidebar
            /** @type {any} */
            const sidebarSearch = await chrome.debugger.sendCommand(debuggee, 'DOM.performSearch', {
              query: '#sidebar, [id*="sidebar"], [class*="sidebar"], [role="navigation"]',
              includeUserAgentShadowDOM: true
            });
            if (sidebarSearch.searchId && sidebarSearch.resultCount > 0) {
              /** @type {any} */
              const sidebarResults = await chrome.debugger.sendCommand(debuggee, 'DOM.getSearchResults', {
                searchId: sidebarSearch.searchId,
                fromIndex: 0,
                toIndex: Math.min(10, sidebarSearch.resultCount)
              });
              if (sidebarResults.nodeIds && sidebarResults.nodeIds.length > 0) {
                sidebarNodeId = sidebarResults.nodeIds[0];
                criticalLog('[CDP Render] [BATCH] Found sidebar via DOM.performSearch', 'PDF_DOM_SIDEBAR_FOUND', {
                  pageNum,
                  tabId: tab.id,
                  sidebarNodeId,
                  resultCount: sidebarSearch.resultCount,
                  timestamp: Date.now()
                });
              }
            }
            
            // Search for toolbar
            /** @type {any} */
            const toolbarSearch = await chrome.debugger.sendCommand(debuggee, 'DOM.performSearch', {
              query: '#toolbar, [id*="toolbar"], [class*="toolbar"], [role="toolbar"]',
              includeUserAgentShadowDOM: true
            });
            if (toolbarSearch.searchId && toolbarSearch.resultCount > 0) {
              /** @type {any} */
              const toolbarResults = await chrome.debugger.sendCommand(debuggee, 'DOM.getSearchResults', {
                searchId: toolbarSearch.searchId,
                fromIndex: 0,
                toIndex: Math.min(10, toolbarSearch.resultCount)
              });
              if (toolbarResults.nodeIds && toolbarResults.nodeIds.length > 0) {
                toolbarNodeId = toolbarResults.nodeIds[0];
                criticalLog('[CDP Render] [BATCH] Found toolbar via DOM.performSearch', 'PDF_DOM_TOOLBAR_FOUND', {
                  pageNum,
                  tabId: tab.id,
                  toolbarNodeId,
                  resultCount: toolbarSearch.resultCount,
                  timestamp: Date.now()
                });
              }
            }
            
            // Search for div#content
            /** @type {any} */
            const contentSearch = await chrome.debugger.sendCommand(debuggee, 'DOM.performSearch', {
              query: '#content, div#content',
              includeUserAgentShadowDOM: true
            });
            if (contentSearch.searchId && contentSearch.resultCount > 0) {
              /** @type {any} */
              const contentResults = await chrome.debugger.sendCommand(debuggee, 'DOM.getSearchResults', {
                searchId: contentSearch.searchId,
                fromIndex: 0,
                toIndex: Math.min(10, contentSearch.resultCount)
              });
              if (contentResults.nodeIds && contentResults.nodeIds.length > 0) {
                contentNodeId = contentResults.nodeIds[0];
                criticalLog('[CDP Render] [BATCH] Found div#content via DOM.performSearch', 'PDF_DOM_CONTENT_FOUND', {
                  pageNum,
                  tabId: tab.id,
                  contentNodeId,
                  resultCount: contentSearch.resultCount,
                  timestamp: Date.now()
                });
              }
            }
            
            // Search for embed
            /** @type {any} */
            const embedSearch = await chrome.debugger.sendCommand(debuggee, 'DOM.performSearch', {
              query: 'embed[type*="pdf"], embed#plugin, embed',
              includeUserAgentShadowDOM: true
            });
            if (embedSearch.searchId && embedSearch.resultCount > 0) {
              /** @type {any} */
              const embedResults = await chrome.debugger.sendCommand(debuggee, 'DOM.getSearchResults', {
                searchId: embedSearch.searchId,
                fromIndex: 0,
                toIndex: Math.min(10, embedSearch.resultCount)
              });
              if (embedResults.nodeIds && embedResults.nodeIds.length > 0) {
                embedNodeId = embedResults.nodeIds[0];
                criticalLog('[CDP Render] [BATCH] Found embed via DOM.performSearch', 'PDF_DOM_EMBED_FOUND', {
                  pageNum,
                  tabId: tab.id,
                  embedNodeId,
                  resultCount: embedSearch.resultCount,
                  timestamp: Date.now()
                });
              }
            }
          } catch (searchError) {
            criticalLog('[CDP Render] [BATCH] DOM.performSearch failed', 'PDF_DOM_SEARCH_ERROR', {
              pageNum,
              tabId: tab.id,
              error: searchError.message,
              timestamp: Date.now()
            });
          }
          
          // CRITICAL: Hide elements found via DOM API using DOM.setAttributeValue or Runtime.evaluate
          // If we found elements via DOM API, hide them using Runtime.evaluate with nodeId
          if (sidebarNodeId || toolbarNodeId) {
            try {
              // Get box models for found elements to verify they exist
              if (sidebarNodeId) {
                const sidebarBoxModel = await chrome.debugger.sendCommand(debuggee, 'DOM.getBoxModel', {
                  nodeId: sidebarNodeId
                });
                criticalLog('[CDP Render] [BATCH] Sidebar box model', 'PDF_DOM_SIDEBAR_BOXMODEL', {
                  pageNum,
                  tabId: tab.id,
                  sidebarNodeId,
                  hasBoxModel: !!sidebarBoxModel,
                  timestamp: Date.now()
                });
              }
              
              if (toolbarNodeId) {
                const toolbarBoxModel = await chrome.debugger.sendCommand(debuggee, 'DOM.getBoxModel', {
                  nodeId: toolbarNodeId
                });
                criticalLog('[CDP Render] [BATCH] Toolbar box model', 'PDF_DOM_TOOLBAR_BOXMODEL', {
                  pageNum,
                  tabId: tab.id,
                  toolbarNodeId,
                  hasBoxModel: !!toolbarBoxModel,
                  timestamp: Date.now()
                });
              }
            } catch (boxModelError) {
              criticalLog('[CDP Render] [BATCH] DOM.getBoxModel failed', 'PDF_DOM_BOXMODEL_ERROR', {
                pageNum,
                tabId: tab.id,
                error: boxModelError.message,
                timestamp: Date.now()
              });
            }
          }
          
          const hideUiResult = await chrome.debugger.sendCommand(
            debuggee,
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  try {
                    const hiddenElements = [];
                    const originalStyles = {};
                    const domInfo = {
                      allElements: document.querySelectorAll('*').length,
                      bodyChildren: document.body ? document.body.children.length : 0,
                      hasEmbed: !!document.querySelector('embed'),
                      hasContentDiv: !!document.querySelector('div#content'),
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight,
                      allElementTags: [],
                      allElementIds: [],
                      allElementClasses: [],
                      shadowRoots: [],
                      iframes: []
                    };
                    
                    // Collect DOM structure info for debugging
                    try {
                      const allEls = document.querySelectorAll('*');
                      for (let i = 0; i < Math.min(50, allEls.length); i++) {
                        const el = allEls[i];
                        if (el.tagName) domInfo.allElementTags.push(el.tagName.toLowerCase());
                        if (el.id) domInfo.allElementIds.push(el.id);
                        if (el.className && typeof el.className === 'string') {
                          const classes = el.className.split(' ').filter(c => c.trim());
                          domInfo.allElementClasses.push(...classes);
                        }
                        // Check for shadow DOM
                        if (el.shadowRoot) {
                          domInfo.shadowRoots.push({
                            tag: el.tagName,
                            id: el.id || '',
                            shadowRootChildren: el.shadowRoot.children.length
                          });
                        }
                        // Check for iframes
                        if (el.tagName && el.tagName.toLowerCase() === 'iframe') {
                          domInfo.iframes.push({
                            id: el.id || '',
                            src: el.src || '',
                            srcdoc: el.srcdoc ? el.srcdoc.substring(0, 100) : ''
                          });
                        }
                      }
                    } catch (e) {
                      domInfo.collectionError = e.message;
                    }
                    
                    // CRITICAL: Try to access shadow DOM
                    // Chrome PDF viewer might use shadow DOM
                    try {
                      const allElementsWithShadow = document.querySelectorAll('*');
                      for (const el of allElementsWithShadow) {
                        if (el.shadowRoot) {
                          // Try to find UI elements in shadow DOM
                          const shadowSidebar = el.shadowRoot.querySelector('[id*="sidebar"], [class*="sidebar"], [role="navigation"]');
                          const shadowToolbar = el.shadowRoot.querySelector('[id*="toolbar"], [class*="toolbar"], [role="toolbar"]');
                          
                          if (shadowSidebar) {
                            const key = '_shadowSidebar_' + el.tagName;
                            originalStyles[key] = {
                              display: shadowSidebar.style.display || '',
                              visibility: shadowSidebar.style.visibility || '',
                              opacity: shadowSidebar.style.opacity || ''
                            };
                            shadowSidebar.style.display = 'none';
                            shadowSidebar.style.visibility = 'hidden';
                            shadowSidebar.style.opacity = '0';
                            hiddenElements.push({
                              selector: key,
                              description: 'Sidebar in shadow DOM',
                              found: true,
                              shadowHost: el.tagName
                            });
                            console.log('[CDP Render] Hidden sidebar in shadow DOM:', el.tagName);
                          }
                          
                          if (shadowToolbar) {
                            const key = '_shadowToolbar_' + el.tagName;
                            originalStyles[key] = {
                              display: shadowToolbar.style.display || '',
                              visibility: shadowToolbar.style.visibility || '',
                              opacity: shadowToolbar.style.opacity || ''
                            };
                            shadowToolbar.style.display = 'none';
                            shadowToolbar.style.visibility = 'hidden';
                            shadowToolbar.style.opacity = '0';
                            hiddenElements.push({
                              selector: key,
                              description: 'Toolbar in shadow DOM',
                              found: true,
                              shadowHost: el.tagName
                            });
                            console.log('[CDP Render] Hidden toolbar in shadow DOM:', el.tagName);
                          }
                        }
                      }
                    } catch (shadowError) {
                      domInfo.shadowError = shadowError.message;
                    }
                    
                    // Function to hide element and store original style
                    function hideElement(selector, description) {
                      try {
                        const element = document.querySelector(selector);
                        if (element) {
                          // Store original style
                          originalStyles[selector] = {
                            display: element.style.display || '',
                            visibility: element.style.visibility || '',
                            opacity: element.style.opacity || ''
                          };
                          
                          // Hide element
                          element.style.display = 'none';
                          element.style.visibility = 'hidden';
                          element.style.opacity = '0';
                          
                          hiddenElements.push({
                            selector: selector,
                            description: description,
                            found: true
                          });
                          
                          console.log('[CDP Render] Hidden element:', selector, description);
                        } else {
                          hiddenElements.push({
                            selector: selector,
                            description: description,
                            found: false
                          });
                        }
                      } catch (e) {
                        hiddenElements.push({
                          selector: selector,
                          description: description,
                          found: false,
                          error: e.message
                        });
                      }
                    }
                    
                    // Function to hide ALL matching elements (not just first)
                    function hideAllElements(selector, description) {
                      try {
                        const elements = document.querySelectorAll(selector);
                        if (elements && elements.length > 0) {
                          elements.forEach((el, index) => {
                            const key = selector + '_' + index;
                            originalStyles[key] = {
                              display: el.style.display || '',
                              visibility: el.style.visibility || '',
                              opacity: el.style.opacity || ''
                            };
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.opacity = '0';
                            hiddenElements.push({
                              selector: key,
                              description: description + ' (index ' + index + ')',
                              found: true
                            });
                          });
                          console.log('[CDP Render] Hidden', elements.length, 'elements:', selector, description);
                        } else {
                          hiddenElements.push({
                            selector: selector,
                            description: description,
                            found: false
                          });
                        }
                      } catch (e) {
                        hiddenElements.push({
                          selector: selector,
                          description: description,
                          found: false,
                          error: e.message
                        });
                      }
                    }
                    
                    // Hide sidebar (left side with thumbnails) - TRY ALL MATCHING ELEMENTS
                    hideAllElements('div[role="navigation"]', 'Sidebar navigation');
                    hideAllElements('div#sidebar', 'Sidebar');
                    hideAllElements('[id*="sidebar"]', 'Sidebar (id contains sidebar)');
                    hideAllElements('[class*="sidebar"]', 'Sidebar (class contains sidebar)');
                    hideAllElements('div[aria-label*="thumbnail"]', 'Thumbnail sidebar');
                    hideAllElements('div[aria-label*="Thumbnail"]', 'Thumbnail sidebar (capital)');
                    hideAllElements('[aria-label*="thumbnails"]', 'Thumbnails (lowercase)');
                    hideAllElements('[aria-label*="Thumbnails"]', 'Thumbnails (capital)');
                    
                    // Hide toolbar (top bar with controls) - TRY ALL MATCHING ELEMENTS
                    hideAllElements('div#toolbar', 'Toolbar');
                    hideAllElements('[id*="toolbar"]', 'Toolbar (id contains toolbar)');
                    hideAllElements('[class*="toolbar"]', 'Toolbar (class contains toolbar)');
                    hideAllElements('div[role="toolbar"]', 'Toolbar (role)');
                    hideAllElements('[role="toolbar"]', 'Toolbar (any role)');
                    
                    // Hide any elements with specific classes that might be UI
                    const uiClassSelectors = [
                      '.pdf-viewer-toolbar',
                      '.pdf-toolbar',
                      '.viewer-toolbar',
                      '.chrome-pdf-toolbar',
                      '.chrome-pdf-sidebar',
                      '[class*="viewer"]',
                      '[class*="pdf-viewer"]',
                      '[class*="chrome-pdf"]'
                    ];
                    
                    for (const selector of uiClassSelectors) {
                      hideAllElements(selector, 'UI element (class selector)');
                    }
                    
                    // AGGRESSIVE: Hide elements by common UI patterns
                    // Look for elements that are likely UI controls
                    const allElements = document.querySelectorAll('*');
                    const uiPatterns = [];
                    let leftSidebarFound = false;
                    let topToolbarFound = false;
                    
                    for (const el of allElements) {
                      try {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        const tag = el.tagName ? el.tagName.toLowerCase() : '';
                        const id = el.id || '';
                        const className = (el.className && typeof el.className === 'string') ? el.className : '';
                        const ariaLabel = el.getAttribute('aria-label') || '';
                        
                        // Pattern 1: Left sidebar (narrow vertical element on left)
                        if (rect.left <= 10 && rect.width > 30 && rect.width < 500 && rect.height > 200) {
                          if (!leftSidebarFound) {
                            uiPatterns.push({
                              type: 'leftSidebar',
                              element: {
                                tag: tag,
                                id: id,
                                className: className.substring(0, 100),
                                ariaLabel: ariaLabel.substring(0, 100)
                              },
                              rect: {
                                left: Math.round(rect.left),
                                top: Math.round(rect.top),
                                width: Math.round(rect.width),
                                height: Math.round(rect.height)
                              },
                              style: {
                                position: style.position,
                                zIndex: style.zIndex,
                                display: style.display
                              }
                            });
                          }
                        }
                        
                        // Pattern 2: Top toolbar (wide horizontal element on top)
                        if (rect.top <= 10 && rect.height > 20 && rect.height < 200 && rect.width > 200) {
                          if (!topToolbarFound) {
                            uiPatterns.push({
                              type: 'topToolbar',
                              element: {
                                tag: tag,
                                id: id,
                                className: className.substring(0, 100),
                                ariaLabel: ariaLabel.substring(0, 100)
                              },
                              rect: {
                                left: Math.round(rect.left),
                                top: Math.round(rect.top),
                                width: Math.round(rect.width),
                                height: Math.round(rect.height)
                              },
                              style: {
                                position: style.position,
                                zIndex: style.zIndex,
                                display: style.display
                              }
                            });
                          }
                        }
                      } catch (e) {
                        // Ignore errors for individual elements
                      }
                    }
                    
                    // Hide elements found by patterns
                    for (const pattern of uiPatterns) {
                      try {
                        const key = '_pattern_' + pattern.type;
                        // Find element again by its characteristics
                        const candidates = document.querySelectorAll('*');
                        for (const candidate of candidates) {
                          try {
                            const rect = candidate.getBoundingClientRect();
                            if (pattern.type === 'leftSidebar' && 
                                Math.abs(rect.left - pattern.rect.left) < 5 &&
                                Math.abs(rect.width - pattern.rect.width) < 5) {
                              originalStyles[key] = {
                                display: candidate.style.display || '',
                                visibility: candidate.style.visibility || '',
                                opacity: candidate.style.opacity || ''
                              };
                              candidate.style.display = 'none';
                              candidate.style.visibility = 'hidden';
                              candidate.style.opacity = '0';
                              hiddenElements.push({
                                selector: key,
                                description: pattern.type + ' (pattern match)',
                                found: true,
                                pattern: pattern
                              });
                              if (pattern.type === 'leftSidebar') leftSidebarFound = true;
                              if (pattern.type === 'topToolbar') topToolbarFound = true;
                              break;
                            } else if (pattern.type === 'topToolbar' &&
                                       Math.abs(rect.top - pattern.rect.top) < 5 &&
                                       Math.abs(rect.height - pattern.rect.height) < 5) {
                              originalStyles[key] = {
                                display: candidate.style.display || '',
                                visibility: candidate.style.visibility || '',
                                opacity: candidate.style.opacity || ''
                              };
                              candidate.style.display = 'none';
                              candidate.style.visibility = 'hidden';
                              candidate.style.opacity = '0';
                              hiddenElements.push({
                                selector: key,
                                description: pattern.type + ' (pattern match)',
                                found: true,
                                pattern: pattern
                              });
                              if (pattern.type === 'leftSidebar') leftSidebarFound = true;
                              if (pattern.type === 'topToolbar') topToolbarFound = true;
                              break;
                            }
                          } catch (e) {
                            // Expected: pattern matching may fail, continue with other patterns
                            // No logging needed - this is expected during UI hiding attempts
                          }
                        }
                      } catch (e) {
                        // Ignore pattern errors
                      }
                    }
                    
                    // More aggressive position-based detection (after pattern matching)
                    for (const el of allElements) {
                      try {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        
                        // Check for left sidebar (positioned at left edge, has width)
                        if (!leftSidebarFound && rect.left <= 10 && rect.width > 30 && rect.width < 500 && rect.height > 100) {
                          const zIndex = parseInt(style.zIndex) || 0;
                          // More lenient conditions
                          if (zIndex >= 0 || style.position === 'fixed' || style.position === 'absolute' || style.position === 'relative') {
                            // Likely a sidebar
                            const key = '_leftSidebar_direct';
                            originalStyles[key] = {
                              display: el.style.display || '',
                              visibility: el.style.visibility || '',
                              opacity: el.style.opacity || ''
                            };
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.opacity = '0';
                            hiddenElements.push({
                              selector: key,
                              description: 'Left sidebar (direct position match)',
                              found: true,
                              position: { 
                                left: Math.round(rect.left), 
                                width: Math.round(rect.width),
                                height: Math.round(rect.height),
                                zIndex: zIndex 
                              },
                              elementInfo: {
                                tag: el.tagName,
                                id: el.id || '',
                                className: (el.className && typeof el.className === 'string') ? el.className.substring(0, 50) : ''
                              }
                            });
                            leftSidebarFound = true;
                            console.log('[CDP Render] Hidden left sidebar by position:', rect);
                          }
                        }
                        
                        // Check for top toolbar (positioned at top, has height)
                        if (!topToolbarFound && rect.top <= 10 && rect.height > 15 && rect.height < 200 && rect.width > 100) {
                          const zIndex = parseInt(style.zIndex) || 0;
                          // More lenient conditions
                          if (zIndex >= 0 || style.position === 'fixed' || style.position === 'absolute' || style.position === 'relative') {
                            // Likely a toolbar
                            const key = '_topToolbar_direct';
                            originalStyles[key] = {
                              display: el.style.display || '',
                              visibility: el.style.visibility || '',
                              opacity: el.style.opacity || ''
                            };
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.opacity = '0';
                            hiddenElements.push({
                              selector: key,
                              description: 'Top toolbar (direct position match)',
                              found: true,
                              position: { 
                                top: Math.round(rect.top), 
                                height: Math.round(rect.height),
                                width: Math.round(rect.width),
                                zIndex: zIndex 
                              },
                              elementInfo: {
                                tag: el.tagName,
                                id: el.id || '',
                                className: (el.className && typeof el.className === 'string') ? el.className.substring(0, 50) : ''
                              }
                            });
                            topToolbarFound = true;
                            console.log('[CDP Render] Hidden top toolbar by position:', rect);
                          }
                        }
                      } catch (e) {
                        // Ignore errors for individual elements
                      }
                    }
                    
                    // Store original styles in window for restoration
                    window.__clipaible_hidden_ui_styles = originalStyles;
                    window.__clipaible_hidden_ui_elements = hiddenElements;
                    
                    return {
                      success: true,
                      hiddenElements: hiddenElements,
                      hiddenCount: hiddenElements.filter(e => e.found).length,
                      originalStyles: Object.keys(originalStyles).length,
                      domInfo: domInfo,
                      uiPatternsFound: uiPatterns.length
                    };
                  } catch (e) {
                    return {
                      success: false,
                      error: e.message,
                      stack: e.stack
                    };
                  }
                })()
              `,
              returnByValue: true
            }
          );
          
          // Type assertion for Chrome DevTools Protocol response
          /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
          const typedHideUiResult = hideUiResult || {};
          const hideUiData = typedHideUiResult.result?.value;
          if (hideUiData && hideUiData.success) {
            hiddenElements = hideUiData.hiddenElements || [];
            uiHidden = hideUiData.hiddenCount > 0;
            
            criticalLog('[CDP Render] [BATCH] ✅ UI elements hidden', 'PDF_UI_HIDE_SUCCESS', {
              pageNum,
              tabId: tab.id,
              hiddenCount: hideUiData.hiddenCount,
              hiddenElements: hiddenElements.filter(e => e.found).map(e => ({
                selector: e.selector,
                description: e.description,
                position: e.position,
                elementInfo: e.elementInfo,
                pattern: e.pattern
              })),
              domInfo: hideUiData.domInfo,
              uiPatternsFound: hideUiData.uiPatternsFound,
              timestamp: Date.now()
            });
          } else {
            criticalLog('[CDP Render] [BATCH] ⚠️ Failed to hide UI elements', 'PDF_UI_HIDE_FAILED', {
              pageNum,
              tabId: tab.id,
              error: hideUiData?.error || 'Unknown error',
              stack: hideUiData?.stack,
              domInfo: hideUiData?.domInfo,
              timestamp: Date.now()
            });
          }
        } catch (hideError) {
          criticalLog('[CDP Render] [BATCH] ❌ Error hiding UI elements', 'PDF_UI_HIDE_ERROR', {
            pageNum,
            tabId: tab.id,
            error: hideError.message,
            errorStack: hideError.stack,
            timestamp: Date.now()
          });
        }
        
        log('[CDP Render] [BATCH] Capturing screenshot - CRITICAL VERIFICATION', {
          pageNum,
          debuggeeTabId: debuggee.tabId,
          ourTabId: tab.id,
          ourTabUrl: tabBeforeScreenshot.url?.substring(0, 100) || 'no url',
          ourTabActive: tabBeforeScreenshot.active,
          ourTabWindowId: tabBeforeScreenshot.windowId,
          activeTabId: activeTabBeforeScreenshot?.id,
          activeTabUrl: activeTabBeforeScreenshot?.url?.substring(0, 100) || 'no url',
          activeTabIsOurTab: activeTabBeforeScreenshot?.id === tab.id,
          uiHidden: uiHidden,
          hiddenElementsCount: hiddenElements.filter(e => e.found).length,
          allTabs: allTabsBeforeScreenshot.map(t => ({
            id: t.id,
            url: t.url?.substring(0, 100) || 'no url',
            active: t.active,
            windowId: t.windowId,
            isOurTab: t.id === tab.id,
            isPdfTab: t.url?.includes('.pdf') || t.url?.startsWith('file://')
          })),
          screenshotOptions: {
            format: 'png',
            quality: 100,
            fromSurface: true
          },
          timestamp: Date.now(),
          CRITICAL_WARNING: tabBeforeScreenshot.active 
            ? '🚨 OUR TAB IS ACTIVE! Screenshot might be from wrong tab!' 
            : activeTabBeforeScreenshot?.id !== tab.id
              ? '✅ Our tab is inactive, active tab is different (correct)'
              : '⚠️ Check if screenshot is from correct tab',
          VERIFICATION: debuggee.tabId === tab.id 
            ? '✅ Debugger attached to our tab' 
            : '🚨 DEBUGGER ATTACHED TO WRONG TAB!'
        });
        
        // CRITICAL: Capture screenshot with proper dimensions
        // Use clip to capture ONLY PDF content area (excluding UI elements)
        // clipX, clipY, clipWidth, clipHeight were calculated above based on PDF embed element
        
        // CRITICAL: Log ALL final values before screenshot - COMPREHENSIVE
        criticalLog('[CDP Render] [BATCH] ⚡⚡⚡ FINAL VALUES BEFORE SCREENSHOT ⚡⚡⚡', 'PDF_SCREENSHOT_FINAL_ALL_VALUES', {
          pageNum,
          tabId: tab.id,
          // Final clip coordinates
          clipX,
          clipY,
          clipWidth,
          clipHeight,
          // Viewport dimensions
          viewportWidth,
          viewportHeight,
          // Sources (if available from previous calculations)
          // pdfArea values (if available)
          pdfAreaX: typeof pdfArea !== 'undefined' && pdfArea ? pdfArea.x : 'not available',
          pdfAreaY: typeof pdfArea !== 'undefined' && pdfArea ? pdfArea.y : 'not available',
          pdfAreaWidth: typeof pdfArea !== 'undefined' && pdfArea ? pdfArea.width : 'not available',
          pdfAreaHeight: typeof pdfArea !== 'undefined' && pdfArea ? pdfArea.height : 'not available',
          // Summary
          clipArea: `${clipWidth}x${clipHeight} at (${clipX}, ${clipY})`,
          viewport: `${viewportWidth}x${viewportHeight}`,
          expectedResult: 'Full PDF page without UI elements',
          warnings: [
            clipHeight < 800 ? '⚠️ clipHeight is too small for full page!' : '✅ clipHeight looks reasonable',
            clipWidth < 800 ? '⚠️ clipWidth is too small!' : '✅ clipWidth looks reasonable',
            clipX < 0 ? '⚠️ clipX is negative!' : (clipX > 500 ? '⚠️ clipX is very large (may crop too much)' : '✅ clipX looks reasonable'),
            clipY < 0 ? '⚠️ clipY is negative!' : (clipY > 200 ? '⚠️ clipY is very large (may crop too much)' : '✅ clipY looks reasonable')
          ],
          timestamp: Date.now()
        });
        
        // CRITICAL: Capture screenshot WITHOUT any scale factors
        // Get image as-is, without multiplication coefficients
        // We'll read actual dimensions from PNG header after capture
        
        criticalLog('[CDP Render] [BATCH] Capturing screenshot - FINAL CLIP COORDINATES', 'PDF_SCREENSHOT_FINAL_CLIP', {
          pageNum,
          tabId: tab.id,
          clipX,
          clipY,
          clipWidth,
          clipHeight,
          viewportWidth,
          viewportHeight,
          clipArea: `${clipWidth}x${clipHeight} at (${clipX}, ${clipY})`,
          viewport: `${viewportWidth}x${viewportHeight}`,
          expectedResult: 'Full PDF page without UI elements, no scale factors applied',
          warning: clipHeight < 800 ? '⚠️ clipHeight is too small for full page!' : '✅ clipHeight looks reasonable',
          note: 'No scale factors - capturing as-is, will read actual dimensions from PNG',
          timestamp: Date.now()
        });
        
        log('[CDP Render] [BATCH] Capturing screenshot with clip coordinates - FINAL VALUES', {
          pageNum,
          clipX,
          clipY,
          clipWidth,
          clipHeight,
          viewportWidth,
          viewportHeight,
          note: 'No scale factors - capturing as-is, will read actual dimensions from PNG',
          CRITICAL_INFO: {
            clipArea: `${clipWidth}x${clipHeight} at (${clipX}, ${clipY})`,
            viewport: `${viewportWidth}x${viewportHeight}`,
            expectedResult: 'Full PDF page without UI elements, no scale factors',
            warning: clipHeight < 800 ? '⚠️ clipHeight is too small for full page!' : '✅ clipHeight looks reasonable'
          },
          timestamp: Date.now()
        });
        
        // CRITICAL: Remove captureBeyondViewport: false - it may cause issues with clip
        // When using clip, we should allow capturing beyond viewport if needed
        // CRITICAL: Ensure debugger is attached before screenshot (may have been detached)
        
        // Check for cancellation before capturing screenshot
        await checkCancellation(`CDP render capturing screenshot for page ${pageNum}`);
        
        /** @type {any} */
        let screenshotResult;
        try {
          screenshotResult = await chrome.debugger.sendCommand(
          debuggee,
          'Page.captureScreenshot',
          {
            format: 'png',
            quality: 100,
            fromSurface: true,
            // REMOVED: captureBeyondViewport: false - may cause issues with clip parameter
            clip: {
              x: clipX,
              y: clipY,
              width: clipWidth,
              height: clipHeight,
              scale: 1.0 // No scale factors - capture as-is
            }
          }
        );
        } catch (screenshotError) {
          // Check if error is due to detached debugger
          const errorMsg = screenshotError.message || String(screenshotError);
          const isDetachedError = errorMsg.includes('not attached') || 
                                  errorMsg.includes('Detached') ||
                                  errorMsg.includes('detached');
          
          if (isDetachedError) {
            logWarn('[CDP Render] [BATCH] Debugger detached during screenshot, reattaching...', {
              pageNum,
              tabId: tab.id,
              error: errorMsg,
              timestamp: Date.now()
            });
            
            // Reattach debugger and retry
            await ensureDebuggerAttached(debuggee, 3);
            await chrome.debugger.sendCommand(debuggee, 'Page.enable');
            
            // Wait a bit for debugger to stabilize
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Retry screenshot
            log('[CDP Render] [BATCH] Retrying screenshot after debugger reattachment...', {
              pageNum,
              tabId: tab.id,
              timestamp: Date.now()
            });
            screenshotResult = await chrome.debugger.sendCommand(
              debuggee,
              'Page.captureScreenshot',
              {
                format: 'png',
                quality: 100,
                fromSurface: true,
                clip: {
                  x: clipX,
                  y: clipY,
                  width: clipWidth,
                  height: clipHeight,
                  scale: 1.0
                }
              }
            );
            log('[CDP Render] [BATCH] ✅ Screenshot captured after debugger reattachment', {
              pageNum,
              tabId: tab.id,
              timestamp: Date.now()
            });
          } else {
            // Other error, rethrow
            throw screenshotError;
          }
        }
        
        // CRITICAL: Restore UI elements after screenshot
        try {
          criticalLog('[CDP Render] [BATCH] Restoring UI elements after screenshot', 'PDF_UI_RESTORE_START', {
            pageNum,
            tabId: tab.id,
            timestamp: Date.now()
          });
          
          const restoreUiResult = await chrome.debugger.sendCommand(
            debuggee,
            'Runtime.evaluate',
            {
              expression: `
                (function() {
                  try {
                    const originalStyles = window.__clipaible_hidden_ui_styles || {};
                    const hiddenElements = window.__clipaible_hidden_ui_elements || [];
                    let restoredCount = 0;
                    
                    // Restore elements by selector
                    for (const elementInfo of hiddenElements) {
                      if (elementInfo.found && originalStyles[elementInfo.selector]) {
                        try {
                          const element = document.querySelector(elementInfo.selector);
                          if (element && originalStyles[elementInfo.selector]) {
                            const styles = originalStyles[elementInfo.selector];
                            element.style.display = styles.display;
                            element.style.visibility = styles.visibility;
                            element.style.opacity = styles.opacity;
                            restoredCount++;
                            console.log('[CDP Render] Restored element:', elementInfo.selector);
                          }
                        } catch (e) {
                          console.warn('[CDP Render] Failed to restore element:', elementInfo.selector, e.message);
                        }
                      }
                    }
                    
                    // Restore position-based elements
                    if (originalStyles['_leftSidebar']) {
                      const allElements = document.querySelectorAll('*');
                      for (const el of allElements) {
                        try {
                          const rect = el.getBoundingClientRect();
                          if (rect.left <= 10 && rect.width > 50 && rect.width < 400) {
                            const styles = originalStyles['_leftSidebar'];
                            el.style.display = styles.display;
                            el.style.visibility = styles.visibility;
                            el.style.opacity = styles.opacity;
                            restoredCount++;
                            break;
                          }
                        } catch (e) {}
                      }
                    }
                    
                    if (originalStyles['_topToolbar']) {
                      const allElements = document.querySelectorAll('*');
                      for (const el of allElements) {
                        try {
                          const rect = el.getBoundingClientRect();
                          if (rect.top <= 10 && rect.height > 20 && rect.height < 150) {
                            const styles = originalStyles['_topToolbar'];
                            el.style.display = styles.display;
                            el.style.visibility = styles.visibility;
                            el.style.opacity = styles.opacity;
                            restoredCount++;
                            break;
                          }
                        } catch (e) {}
                      }
                    }
                    
                    // Cleanup
                    delete window.__clipaible_hidden_ui_styles;
                    delete window.__clipaible_hidden_ui_elements;
                    
                    return {
                      success: true,
                      restoredCount: restoredCount,
                      hiddenCount: hiddenElements.filter(e => e.found).length
                    };
                  } catch (e) {
                    return {
                      success: false,
                      error: e.message,
                      stack: e.stack
                    };
                  }
                })()
              `,
              returnByValue: true
            }
          );
          
          // Type assertion for Chrome DevTools Protocol response
          /** @type {{result?: {type?: string, value?: any}, exceptionDetails?: any}} */
          const typedRestoreUiResult = restoreUiResult || {};
          const restoreUiData = typedRestoreUiResult.result?.value;
          if (restoreUiData && restoreUiData.success) {
            criticalLog('[CDP Render] [BATCH] ✅ UI elements restored', 'PDF_UI_RESTORE_SUCCESS', {
              pageNum,
              tabId: tab.id,
              restoredCount: restoreUiData.restoredCount,
              hiddenCount: restoreUiData.hiddenCount,
              timestamp: Date.now()
            });
          } else {
            criticalLog('[CDP Render] [BATCH] ⚠️ Failed to restore UI elements', 'PDF_UI_RESTORE_FAILED', {
              pageNum,
              tabId: tab.id,
              error: restoreUiData?.error || 'Unknown error',
              timestamp: Date.now()
            });
          }
        } catch (restoreError) {
          criticalLog('[CDP Render] [BATCH] ❌ Error restoring UI elements', 'PDF_UI_RESTORE_ERROR', {
            pageNum,
            tabId: tab.id,
            error: restoreError.message,
            errorStack: restoreError.stack,
            timestamp: Date.now()
          });
        }
        
        // CRITICAL: Verify tab state after screenshot
        const tabAfterScreenshot = await chrome.tabs.get(tab.id);
        const activeTabAfterScreenshot = (await chrome.tabs.query({ active: true }))[0];
        
        // CRITICAL: Get screenshot data first
        const screenshotData = screenshotResult?.data || '';
        
        // CRITICAL: Analyze screenshot data to check if it's valid
        const screenshotDataStart = screenshotData.substring(0, 100);
        const screenshotDataEnd = screenshotData.substring(Math.max(0, screenshotData.length - 100));
        const isPng = screenshotDataStart.includes('iVBORw0KGgo') || screenshotDataStart.startsWith('data:image/png');
        const isLikelyBlack = screenshotData.length > 0 && screenshotData.length < 5000; // Very small PNGs are often black/empty
        
        // CRITICAL: Get actual screenshot image dimensions from PNG header
        // No scale factors applied - read actual dimensions from the image
        const actualDimensions = getImageDimensionsFromPng(screenshotData);
        
        criticalLog('[CDP Render] [BATCH] 🔍 PNG DIMENSIONS READ FROM HEADER', 'PDF_PNG_DIMENSIONS_READ', {
          pageNum,
          tabId: tab.id,
          // What we tried to capture
          requestedClipWidth: clipWidth,
          requestedClipHeight: clipHeight,
          requestedAspectRatio: clipHeight > 0 ? (clipWidth / clipHeight).toFixed(4) : null,
          // What we actually got from PNG
          pngWidth: actualDimensions ? actualDimensions.width : null,
          pngHeight: actualDimensions ? actualDimensions.height : null,
          pngAspectRatio: actualDimensions && actualDimensions.height > 0 ? (actualDimensions.width / actualDimensions.height).toFixed(4) : null,
          dimensionsReadSuccessfully: !!actualDimensions,
          // Comparison
          widthMatch: actualDimensions ? (actualDimensions.width === clipWidth) : false,
          heightMatch: actualDimensions ? (actualDimensions.height === clipHeight) : false,
          widthDifference: actualDimensions ? (actualDimensions.width - clipWidth) : null,
          heightDifference: actualDimensions ? (actualDimensions.height - clipHeight) : null,
          // Fallback values
          fallbackWidth: clipWidth,
          fallbackHeight: clipHeight,
          timestamp: Date.now()
        });
        
        const screenshotWidth = actualDimensions ? actualDimensions.width : clipWidth;
        const screenshotHeight = actualDimensions ? actualDimensions.height : clipHeight;
        const screenshotAspectRatio = screenshotHeight > 0 ? (screenshotWidth / screenshotHeight).toFixed(4) : null;
        
        // CRITICAL: Compute hash of screenshot for comparison between pages
        // This helps detect if screenshots are identical (which would indicate navigation failure)
        let screenshotHash = '';
        try {
          // Use first 200 and last 200 bytes for quick hash comparison
          const hashData = screenshotData.substring(0, 200) + screenshotData.substring(Math.max(0, screenshotData.length - 200));
          // Simple hash: just use the data as-is for comparison
          screenshotHash = hashData.substring(0, 100) + '...' + hashData.substring(Math.max(0, hashData.length - 100));
        } catch (e) {
          screenshotHash = 'hash_error';
        }
        
        // CRITICAL: Log screenshot image dimensions with COMPREHENSIVE comparison
        criticalLog('[CDP Render] [BATCH] 📐 COMPREHENSIVE SCREENSHOT DIMENSIONS ANALYSIS', 'PDF_SCREENSHOT_IMAGE_DIMENSIONS', {
          pageNum,
          tabId: tab.id,
          // Clip coordinates used (CSS pixels) - what we requested
          requestedClipX: clipX,
          requestedClipY: clipY,
          requestedClipWidth: clipWidth,
          requestedClipHeight: clipHeight,
          requestedAspectRatio: clipHeight > 0 ? (clipWidth / clipHeight).toFixed(4) : null,
          // Actual dimensions from PNG header (no scale factors) - what we got
          actualWidth: screenshotWidth,
          actualHeight: screenshotHeight,
          actualAspectRatio: screenshotAspectRatio,
          dimensionsFromPng: !!actualDimensions,
          // Comparison: requested vs actual
          widthMatch: screenshotWidth === clipWidth,
          heightMatch: screenshotHeight === clipHeight,
          widthDifference: screenshotWidth - clipWidth,
          heightDifference: screenshotHeight - clipHeight,
          aspectRatioMatch: screenshotAspectRatio === (clipHeight > 0 ? (clipWidth / clipHeight).toFixed(4) : null),
          // All available height values from pdfArea (for reference)
          pdfAreaHeights: typeof pdfArea !== 'undefined' && pdfArea ? {
            pdfAreaHeight: pdfArea.height,
            containerHeight: pdfArea.containerHeight,
            embedHeight: pdfArea.embedHeight
          } : 'pdfArea not available',
          // Screenshot data size
          screenshotDataLength: screenshotData.length,
          screenshotDataLengthKB: (screenshotData.length / 1024).toFixed(2),
          screenshotDataLengthMB: (screenshotData.length / (1024 * 1024)).toFixed(3),
          // Analysis
          note: 'No scale factors applied - using actual dimensions from PNG header',
          analysis: {
            requestedSize: `${clipWidth}x${clipHeight}`,
            actualSize: `${screenshotWidth}x${screenshotHeight}`,
            matches: screenshotWidth === clipWidth && screenshotHeight === clipHeight,
            widthStatus: screenshotWidth === clipWidth ? '✅ matches' : `⚠️ differs by ${screenshotWidth - clipWidth}px`,
            heightStatus: screenshotHeight === clipHeight ? '✅ matches' : `⚠️ differs by ${screenshotHeight - clipHeight}px`
          },
          timestamp: Date.now()
        });
        
        log('[CDP Render] [BATCH] Screenshot captured - VERIFICATION', {
          pageNum,
          debuggeeTabId: debuggee.tabId,
          ourTabId: tab.id,
          ourTabUrl: tabAfterScreenshot.url?.substring(0, 100) || 'no url',
          ourTabUrlFragment: tabAfterScreenshot.url?.split('#')[1] || 'no fragment',
          expectedFragment: `page=${pageNum}`,
          fragmentMatches: tabAfterScreenshot.url?.includes(`#page=${pageNum}`) || false,
          ourTabActive: tabAfterScreenshot.active,
          activeTabId: activeTabAfterScreenshot?.id,
          activeTabUrl: activeTabAfterScreenshot?.url?.substring(0, 100) || 'no url',
          activeTabIsOurTab: activeTabAfterScreenshot?.id === tab.id,
          hasResult: !!screenshotResult,
          hasData: !!(screenshotResult && screenshotResult.data),
          dataLength: screenshotResult?.data?.length || 0,
          dataLengthKB: screenshotResult?.data ? (screenshotResult.data.length / 1024).toFixed(2) : 0,
          // CRITICAL: Screenshot image dimensions (actual from PNG)
          actualWidth: screenshotWidth,
          actualHeight: screenshotHeight,
          actualAspectRatio: screenshotAspectRatio,
          clipWidth: clipWidth,
          clipHeight: clipHeight,
          dimensionsFromPng: !!actualDimensions,
          clipX: clipX,
          clipY: clipY,
          screenshotDataStart: screenshotDataStart.substring(0, 50) + '...',
          screenshotDataEnd: '...' + screenshotDataEnd.substring(Math.max(0, screenshotDataEnd.length - 50)),
          screenshotHash: screenshotHash.substring(0, 100) + '...',
          isPng,
          isLikelyBlack,
          timestamp: Date.now(),
          VERIFICATION: debuggee.tabId === tab.id 
            ? '✅ Screenshot should be from our tab' 
            : '🚨 DEBUGGER ATTACHED TO WRONG TAB!',
          SCREENSHOT_QUALITY: isPng
            ? (isLikelyBlack 
                ? '⚠️ Screenshot is very small - may be black/empty'
                : '✅ Screenshot size looks reasonable')
            : '🚨 Screenshot does not appear to be PNG!',
          NAVIGATION_VERIFICATION: tabAfterScreenshot.url?.includes(`#page=${pageNum}`)
            ? '✅ URL fragment matches - PDF should be on correct page'
            : '🚨 URL fragment does NOT match - PDF may not have navigated to correct page!'
        });

        if (screenshotResult && screenshotResult.data) {
          const imageData = `data:image/png;base64,${screenshotResult.data}`;
          
          // Use actual dimensions from PNG header (no scale factors)
          const width = screenshotWidth;
          const height = screenshotHeight;
          
          images.push({
            pageNum,
            imageData,
            width,
            height,
            screenshotHash, // Store hash for comparison
            success: true,
            retries: retryAttempt
          });
          
          // Mark page as processed successfully
          pageProcessed = true;
          
          log(`[CDP Render] ✅ Page ${pageNum} captured`, {
            retryAttempt,
            retries: retryAttempt,
            imageSize: screenshotResult.data.length,
            imageSizeKB: (screenshotResult.data.length / 1024).toFixed(2),
            // Actual screenshot dimensions from PNG
            actualWidth: screenshotWidth,
            actualHeight: screenshotHeight,
            aspectRatio: screenshotAspectRatio,
            clipWidth: clipWidth,
            clipHeight: clipHeight,
            dimensionsFromPng: !!actualDimensions,
            note: 'Using actual dimensions from PNG header, no scale factors'
          });
          
          // CRITICAL: Hide tab again after screenshot
          // Restore original active state
          log('[CDP Render] [BATCH] Hiding tab after screenshot...', {
            pageNum,
            tabId: tab.id,
            wasActive,
            timestamp: Date.now()
          });
          
          if (!wasActive) {
            // Find the original active tab and restore it
            const originalActiveTab = (await chrome.tabs.query({ active: true }))[0];
            if (originalActiveTab && originalActiveTab.id !== tab.id) {
              await chrome.tabs.update(originalActiveTab.id, { active: true });
              log('[CDP Render] [BATCH] ✅ Restored original active tab', {
                pageNum,
                restoredTabId: originalActiveTab.id,
                timestamp: Date.now()
              });
            }
          }
        } else {
          throw new Error('Screenshot result is empty');
        }

      } catch (pageError) {
        const pageErrorDuration = Date.now() - pageStartTime;
        lastPageError = pageError;
        
        logError('[CDP Render] [BATCH] ❌ Failed to process page', {
          pageNum,
          retryAttempt,
          maxRetries: MAX_PAGE_RETRIES,
          willRetry: retryAttempt < MAX_PAGE_RETRIES,
          error: pageError.message,
          errorStack: pageError.stack,
          errorName: pageError.name,
          pageDuration: pageErrorDuration,
          pageDurationSeconds: (pageErrorDuration / 1000).toFixed(2),
          timestamp: Date.now()
        });
        
        // If this was the last retry attempt, add to errors
        if (retryAttempt >= MAX_PAGE_RETRIES) {
          errors.push({
            pageNum,
            error: pageError.message,
            retries: retryAttempt
          });
        }
        // Otherwise, continue to next retry (cleanup will happen in finally)
      } finally {
        // CRITICAL: Cleanup for this page - close tab and detach debugger
        if (debuggerAttached && debuggee.tabId) {
          try {
            await chrome.debugger.detach(debuggee);
            log('[CDP Render] [BATCH] ✅ Debugger detached for page', {
              pageNum,
              tabId: debuggee.tabId,
              timestamp: Date.now()
            });
          } catch (e) {
            logWarn('[CDP Render] [BATCH] ⚠️ Failed to detach debugger', {
              pageNum,
              error: e.message,
              timestamp: Date.now()
            });
          }
        }

        if (tab) {
          try {
            await chrome.tabs.remove(tab.id);
            log('[CDP Render] [BATCH] ✅ Tab closed for page', {
              pageNum,
              tabId: tab.id,
              timestamp: Date.now()
            });
          } catch (e) {
            logWarn('[CDP Render] [BATCH] ⚠️ Failed to close tab', {
              pageNum,
              error: e.message,
              timestamp: Date.now()
            });
          }
        }
      }
      
      // Only log completion if page was successfully processed or all retries exhausted
      if (pageProcessed || retryAttempt >= MAX_PAGE_RETRIES) {
        log('[CDP Render] [BATCH] ===== PAGE PROCESSING COMPLETE =====', {
          pageNum,
          totalPages,
          successful: pageProcessed,
          retries: retryAttempt,
          successfulSoFar: images.length,
          failedSoFar: errors.length,
          timestamp: Date.now()
        });
      }
    } // End of retry loop
    } // End of page loop

    const duration = Date.now() - startTime;
      
      // CRITICAL: Check if screenshots are identical (indicates navigation failure)
      if (images.length > 1) {
        const hashes = images.map(img => img.screenshotHash).filter(h => h);
        const uniqueHashes = new Set(hashes);
        if (uniqueHashes.size === 1 && hashes.length > 1) {
          logWarn('[CDP Render] ===== CRITICAL: ALL SCREENSHOTS ARE IDENTICAL =====', {
            totalPages: images.length,
            uniqueHashes: uniqueHashes.size,
            hash: hashes[0]?.substring(0, 100) || 'unknown',
            WARNING: '🚨 All screenshots have the same hash! PDF navigation likely failed! All pages are the same!',
            timestamp: Date.now()
          });
        } else {
          log('[CDP Render] ✅ Screenshots are different (navigation worked)', {
            totalPages: images.length,
            uniqueHashes: uniqueHashes.size,
            timestamp: Date.now()
          });
        }
      }
      
      log('[CDP Render] ===== BATCH RENDERING COMPLETE =====', {
        duration,
        durationSeconds: (duration / 1000).toFixed(2),
        durationMinutes: (duration / 60000).toFixed(2),
        totalPages,
        successfulPages: images.length,
        failedPages: errors.length,
        successRate: totalPages > 0 ? ((images.length / totalPages) * 100).toFixed(1) + '%' : '0%',
        averageTimePerPage: images.length > 0 ? (duration / images.length / 1000).toFixed(2) + 's' : 'N/A',
        timestamp: Date.now()
      });

      return images;
    } catch (error) {
    const errorDuration = Date.now() - startTime;
    logError('[CDP Render] ===== BATCH RENDERING FAILED =====', {
      error: error.message,
      errorStack: error.stack,
      errorName: error.name,
      totalDuration: errorDuration,
      totalDurationSeconds: (errorDuration / 1000).toFixed(2),
      successfulPages: images.length,
      failedPages: errors.length,
      timestamp: Date.now()
    });
    throw error;
  }
}

/**
 * Wait for tab to load
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    log('[CDP Render] [waitForTabLoad] Starting wait for tab load...', {
      tabId,
      timeout: CONFIG.PDF_TAB_LOAD_TIMEOUT_MS,
      timestamp: startTime
    });
    
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      const duration = Date.now() - startTime;
      logError('[CDP Render] [waitForTabLoad] ❌ Tab load timeout', {
        tabId,
        duration,
        durationSeconds: (duration / 1000).toFixed(2),
        timestamp: Date.now()
      });
      reject(new Error(`Tab load timeout after ${CONFIG.PDF_TAB_LOAD_TIMEOUT_MS / 1000 / 60} minutes`));
    }, CONFIG.PDF_TAB_LOAD_TIMEOUT_MS);

    const listener = (id, changeInfo) => {
      if (id === tabId) {
        log('[CDP Render] [waitForTabLoad] Tab status update', {
          tabId: id,
          status: changeInfo.status,
          url: changeInfo.url,
          timestamp: Date.now()
        });
        
        if (changeInfo.status === 'complete') {
          const duration = Date.now() - startTime;
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          log('[CDP Render] [waitForTabLoad] ✅ Tab loaded successfully', {
            tabId,
            duration,
            durationSeconds: (duration / 1000).toFixed(2),
            timestamp: Date.now()
          });
          resolve();
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      log('[CDP Render] [waitForTabLoad] Checking current tab status...', {
        tabId,
        currentStatus: tab.status,
        currentUrl: tab.url,
        timestamp: Date.now()
      });
      
      if (tab.status === 'complete') {
        const duration = Date.now() - startTime;
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        log('[CDP Render] [waitForTabLoad] ✅ Tab already loaded', {
          tabId,
          duration,
          durationSeconds: (duration / 1000).toFixed(2),
          timestamp: Date.now()
        });
        resolve();
      }
    }).catch((error) => {
      logWarn('[CDP Render] [waitForTabLoad] Failed to get tab status', {
        tabId,
        error: error.message,
        timestamp: Date.now()
      });
    });
  });
}

/**
 * Wait for page to load after navigation
 */
function waitForPageLoad(debuggee, pageNum) {
  return new Promise(async (resolve) => {
    const startTime = Date.now();
    const PAGE_LOAD_TIMEOUT_MS = CONFIG.PDF_PAGE_LOAD_TIMEOUT_MS;
    const PAGE_LOAD_FALLBACK_TIMEOUT_MS = CONFIG.PDF_PAGE_LOAD_FALLBACK_TIMEOUT_MS;
    log('[CDP Render] [waitForPageLoad] Starting wait for page load...', {
      tabId: debuggee.tabId,
      pageNum,
      timeout: PAGE_LOAD_TIMEOUT_MS,
      fallbackTimeout: PAGE_LOAD_FALLBACK_TIMEOUT_MS,
      timestamp: startTime
    });
    
    let resolved = false;
    
    // CRITICAL: Check if page is already loaded before waiting for events
    // This prevents hanging when debugger is reattached after page load
    try {
      log('[CDP Render] [waitForPageLoad] Checking if page is already loaded...', {
        tabId: debuggee.tabId,
        pageNum,
        timestamp: Date.now()
      });
      
      const tab = await chrome.tabs.get(debuggee.tabId);
      log('[CDP Render] [waitForPageLoad] Tab status check', {
        tabId: debuggee.tabId,
        pageNum,
        hasTab: !!tab,
        tabStatus: tab?.status,
        timestamp: Date.now()
      });
      
      if (tab && tab.status === 'complete') {
        // Page is already loaded, check via CDP if possible
        log('[CDP Render] [waitForPageLoad] Tab is complete, checking via CDP...', {
          tabId: debuggee.tabId,
          pageNum,
          timestamp: Date.now()
        });
        
        try {
          /** @type {any} */
          const frameTree = await chrome.debugger.sendCommand(debuggee, 'Page.getFrameTree');
          if (frameTree && frameTree.frame) {
            const duration = Date.now() - startTime;
            log('[CDP Render] [waitForPageLoad] ✅ Page already loaded (checked via CDP)', {
              tabId: debuggee.tabId,
              pageNum,
              tabStatus: tab.status,
              hasFrameTree: !!frameTree,
              duration,
              durationSeconds: (duration / 1000).toFixed(2),
              timestamp: Date.now()
            });
            resolved = true;
            resolve();
            return;
          } else {
            log('[CDP Render] [waitForPageLoad] FrameTree check returned empty, proceeding anyway', {
              tabId: debuggee.tabId,
              pageNum,
              hasFrameTree: !!frameTree,
              timestamp: Date.now()
            });
            // Tab is complete but frameTree is empty - proceed anyway
            const duration = Date.now() - startTime;
            resolved = true;
            resolve();
            return;
          }
        } catch (cdpError) {
          // CDP check failed, but tab is complete - proceed anyway
          const duration = Date.now() - startTime;
          log('[CDP Render] [waitForPageLoad] ✅ Page already loaded (tab status complete, CDP check failed)', {
            tabId: debuggee.tabId,
            pageNum,
            tabStatus: tab.status,
            cdpError: cdpError.message,
            duration,
            durationSeconds: (duration / 1000).toFixed(2),
            timestamp: Date.now()
          });
          resolved = true;
          resolve();
          return;
        }
      } else {
        log('[CDP Render] [waitForPageLoad] Tab not complete yet, will wait for events', {
          tabId: debuggee.tabId,
          pageNum,
          tabStatus: tab?.status,
          timestamp: Date.now()
        });
      }
    } catch (checkError) {
      // Tab check failed, continue with event-based waiting
      log('[CDP Render] [waitForPageLoad] Could not check tab status, will wait for events', {
        tabId: debuggee.tabId,
        pageNum,
        error: checkError.message,
        errorStack: checkError.stack,
        timestamp: Date.now()
      });
    }
    
    const listener = (source, method) => {
      if (source.tabId === debuggee.tabId) {
        log('[CDP Render] [waitForPageLoad] CDP event received', {
          tabId: source.tabId,
          pageNum,
          method,
          timestamp: Date.now()
        });
        
        if (method === 'Page.loadEventFired' || 
            method === 'Page.frameNavigated' ||
            method === 'Page.domContentEventFired') {
          if (resolved) return; // Already resolved, ignore
          resolved = true;
          const duration = Date.now() - startTime;
          clearTimeout(timeout);
          clearTimeout(fallbackTimeout);
          chrome.debugger.onEvent.removeListener(listener);
          log('[CDP Render] [waitForPageLoad] ✅ Page load event received', {
            tabId: debuggee.tabId,
            pageNum,
            method,
            duration,
            durationSeconds: (duration / 1000).toFixed(2),
            timestamp: Date.now()
          });
          resolve();
        }
      }
    };

    const timeout = setTimeout(() => {
      if (resolved) return; // Already resolved, ignore
      resolved = true;
      const duration = Date.now() - startTime;
      clearTimeout(fallbackTimeout);
      chrome.debugger.onEvent.removeListener(listener);
      logWarn('[CDP Render] [waitForPageLoad] ⚠️ Page load timeout (5min), proceeding anyway', {
        tabId: debuggee.tabId,
        pageNum,
        duration,
        durationSeconds: (duration / 1000).toFixed(2),
        timestamp: Date.now()
      });
      resolve(); // Don't reject, just proceed
    }, PAGE_LOAD_TIMEOUT_MS);

    // Fallback timeout - save to variable for cleanup
    // Use shorter timeout if page might already be loaded (after debugger reattach)
    const fallbackTimeout = setTimeout(() => {
      if (resolved) return; // Already resolved, ignore
      resolved = true;
      const duration = Date.now() - startTime;
      clearTimeout(timeout);
      chrome.debugger.onEvent.removeListener(listener);
      log('[CDP Render] [waitForPageLoad] ✅ Fallback timeout reached, proceeding', {
        tabId: debuggee.tabId,
        pageNum,
        duration,
        durationSeconds: (duration / 1000).toFixed(2),
        timestamp: Date.now()
      });
      resolve();
    }, PAGE_LOAD_FALLBACK_TIMEOUT_MS);
    
    chrome.debugger.onEvent.addListener(listener);
  });
}

/**
 * Ensure debugger is attached, reattach if needed with retries
 */
async function ensureDebuggerAttached(debuggee, maxRetries = 3) {
  const startTime = Date.now();
  log('[CDP Render] [ensureDebuggerAttached] Checking debugger attachment...', {
    tabId: debuggee.tabId,
    maxRetries,
    timestamp: startTime
  });
  
  // First, try to check if debugger is attached
  try {
    await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
    const duration = Date.now() - startTime;
    log('[CDP Render] [ensureDebuggerAttached] ✅ Debugger is attached', {
      tabId: debuggee.tabId,
      duration,
      timestamp: Date.now()
    });
    return; // Debugger is attached, exit early
  } catch (error) {
    log('[CDP Render] [ensureDebuggerAttached] Debugger check failed, will reattach', {
      tabId: debuggee.tabId,
      error: error.message,
      timestamp: Date.now()
    });
  }
    
  // Debugger not attached, reattach with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWarn('[CDP Render] [ensureDebuggerAttached] ⚠️ Reattaching debugger (attempt ' + attempt + '/' + maxRetries + ')...', {
        tabId: debuggee.tabId,
        attempt,
        maxRetries,
        timestamp: Date.now()
      });
      
      // Wait a bit before reattaching (especially after page reload)
      if (attempt > 1) {
        const waitTime = attempt * 500; // 500ms, 1000ms, 1500ms
        log('[CDP Render] [ensureDebuggerAttached] Waiting ' + waitTime + 'ms before retry...', {
          tabId: debuggee.tabId,
          attempt,
          waitTime,
          timestamp: Date.now()
        });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Check if tab still exists
      try {
        const tab = await chrome.tabs.get(debuggee.tabId);
        if (!tab) {
          throw new Error('Tab does not exist');
        }
        log('[CDP Render] [ensureDebuggerAttached] Tab exists and is accessible', {
          tabId: debuggee.tabId,
          tabStatus: tab.status,
          attempt,
          timestamp: Date.now()
        });
      } catch (tabError) {
        logError('[CDP Render] [ensureDebuggerAttached] Tab check failed', {
          tabId: debuggee.tabId,
          error: tabError.message,
          attempt,
          timestamp: Date.now()
        });
        throw new Error(`Tab ${debuggee.tabId} does not exist or is not accessible: ${tabError.message}`);
      }
      
      // Detach old debugger if attached
      try {
      await chrome.debugger.detach(debuggee);
      log('[CDP Render] [ensureDebuggerAttached] Old debugger detached', {
        tabId: debuggee.tabId,
          attempt,
        timestamp: Date.now()
      });
    } catch (e) {
        // Ignore if already detached - this is expected
        log('[CDP Render] [ensureDebuggerAttached] No old debugger to detach (expected)', {
        tabId: debuggee.tabId,
        error: e.message,
          attempt,
        timestamp: Date.now()
      });
    }
    
      // Wait a bit more before attaching (give Chrome time to clean up)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Attach new debugger
    log('[CDP Render] [ensureDebuggerAttached] Attaching new debugger...', {
      tabId: debuggee.tabId,
      protocolVersion: '1.3',
        attempt,
      timestamp: Date.now()
    });
    await chrome.debugger.attach(debuggee, '1.3');
    
      // Wait a bit for debugger to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Enable domains
      log('[CDP Render] [ensureDebuggerAttached] Enabling Page and Runtime domains...', {
      tabId: debuggee.tabId,
        attempt,
      timestamp: Date.now()
    });
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');
      await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
      
      // Verify debugger is working by sending a test command
      await chrome.debugger.sendCommand(debuggee, 'Runtime.enable');
    
    const duration = Date.now() - startTime;
    log('[CDP Render] [ensureDebuggerAttached] ✅ Debugger reattached successfully', {
      tabId: debuggee.tabId,
      duration,
        attempt,
      timestamp: Date.now()
    });
      return; // Success, exit
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      logWarn('[CDP Render] [ensureDebuggerAttached] ⚠️ Reattach attempt ' + attempt + ' failed', {
        tabId: debuggee.tabId,
        error: error.message,
        errorStack: error.stack,
        attempt,
        maxRetries,
        isLastAttempt,
        timestamp: Date.now()
      });
      
      if (isLastAttempt) {
        // Last attempt failed, throw error
        throw new Error(`Failed to reattach debugger after ${maxRetries} attempts: ${error.message}`);
      }
      // Continue to next attempt
    }
  }
}

/**
 * Get image dimensions from PNG base64 data
 * Reads PNG header to get actual width and height
 * PNG format: signature (8 bytes) + IHDR chunk (width at offset 16-19, height at offset 20-23, big-endian)
 */
function getImageDimensionsFromPng(base64Data) {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Check PNG signature (first 8 bytes: 89 50 4E 47 0D 0A 1A 0A)
    if (bytes.length < 24) {
      logWarn('[CDP Render] PNG data too short to read dimensions', { 
        length: bytes.length,
        required: 24,
        dataLength: base64Data.length
      });
      return null;
    }
    
    // Verify PNG signature
    const signature = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const isValidPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    
    // Read width and height from IHDR chunk (big-endian, 4 bytes each)
    // Width is at offset 16-19, height is at offset 20-23
    const widthBytes = [bytes[16], bytes[17], bytes[18], bytes[19]];
    const heightBytes = [bytes[20], bytes[21], bytes[22], bytes[23]];
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    
    // Detailed logging of PNG header reading
    criticalLog('[CDP Render] 🔍 PNG HEADER READING DETAILS', 'PDF_PNG_HEADER_READ', {
      base64DataLength: base64Data.length,
      binaryDataLength: bytes.length,
      pngSignature: signature,
      isValidPng: isValidPng,
      // IHDR chunk bytes
      widthBytes: widthBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      heightBytes: heightBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '),
      // Calculated dimensions
      calculatedWidth: width,
      calculatedHeight: height,
      // Validation
      widthValid: width > 0 && width < 100000,
      heightValid: height > 0 && height < 100000,
      bothValid: width > 0 && height > 0 && width < 100000 && height < 100000,
      // Raw byte values for debugging
      rawWidthBytes: Array.from(widthBytes),
      rawHeightBytes: Array.from(heightBytes),
      timestamp: Date.now()
    });
    
    if (width > 0 && height > 0 && width < 100000 && height < 100000) {
      return { width, height };
    } else {
      logWarn('[CDP Render] Invalid PNG dimensions read', { 
        width, 
        height,
        widthValid: width > 0 && width < 100000,
        heightValid: height > 0 && height < 100000,
        widthBytes: Array.from(widthBytes),
        heightBytes: Array.from(heightBytes)
      });
      return null;
    }
  } catch (error) {
    logWarn('[CDP Render] Failed to read PNG dimensions', { 
      error: error.message,
      errorStack: error.stack,
      base64DataLength: base64Data ? base64Data.length : 0
    });
    return null;
  }
}

/**
 * Get image dimensions from data URL
 * NOTE: Image API is not available in Service Worker, so we parse PNG header
 * For PDF pages, typical dimensions are A4 ratio at reasonable DPI
 */
function getImageDimensions(dataUrl) {
  // Try to extract base64 data and read PNG dimensions
  if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
    const base64Data = dataUrl.split(',')[1];
    const dimensions = getImageDimensionsFromPng(base64Data);
    if (dimensions) {
      return dimensions;
    }
  }
  
  // Fallback: Return default A4 dimensions at ~150 DPI
  return {
    width: 1200,
    height: 1600
  };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

