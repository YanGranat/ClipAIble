// @ts-check
// Error handling utilities for popup
// Provides centralized error logging and global error handlers

import { logError as originalLogError } from '../../scripts/utils/logging.js';

/**
 * Send error to service worker for centralized logging
 * @param {string} message - Error message
 * @param {Error|null} error - Error object
 * @param {Record<string, any>} [context={}] - Additional context
 * @returns {Promise<void>}
 */
export async function sendErrorToServiceWorker(message, error, context = {}) {
  try {
    // Import sanitizeErrorForLogging for stack trace sanitization
    const { sanitizeErrorForLogging } = await import('../../scripts/utils/security.js');
    
    // Sanitize error before sending (removes sensitive information from stack traces)
    const sanitizedError = error ? sanitizeErrorForLogging(error) : null;
    
    const errorData = {
      message: message,
      error: sanitizedError ? {
        name: sanitizedError.name,
        message: sanitizedError.message,
        stack: sanitizedError.stack,
        ...(sanitizedError.code && { code: sanitizedError.code })
      } : null,
      context: context,
      source: 'popup',
      timestamp: Date.now(),
      url: window.location.href
    };
    
    // Send to service worker (fire and forget - don't wait for response)
    // CRITICAL: Use callback-based API to properly handle lastError
    chrome.runtime.sendMessage({
      action: 'logError',
      data: errorData
    }, () => {
      // CRITICAL: Check chrome.runtime.lastError to prevent "Unchecked runtime.lastError" spam
      if (chrome.runtime.lastError) {
        // Silently ignore - "Could not establish connection" is expected when receiver is closed
      }
    });
  } catch (sendError) {
    // CRITICAL: Fallback to console.error if sending to service worker fails
    // This is the only place where console.error is acceptable in sendErrorToServiceWorker
    // It's a fallback when the service worker is unavailable
    try {
      if (typeof originalLogError === 'function') {
        originalLogError('Failed to send error to service worker', sendError);
      } else {
        console.error('[ClipAIble] Failed to send error to service worker', sendError);
      }
    } catch (loggingError) {
      // Ultimate fallback if even error logging fails
      console.error('[ClipAIble] Failed to send error to service worker', sendError);
      console.error('[ClipAIble] Failed to log sendError failure:', loggingError);
    }
  }
}

/**
 * Enhanced logError that also sends to service worker
 * @param {string} message - Error message
 * @param {Error|null} error - Error object
 */
export function enhancedLogError(message, error = null) {
  // Call original logError
  originalLogError(message, error);
  
  // Also send to service worker
  sendErrorToServiceWorker(message, error, {
    source: 'popup.logError'
  });
}

/**
 * Initialize global error handlers
 * Should be called early in popup initialization
 */
export function initGlobalErrorHandlers() {
  // Global error handler for uncaught errors
  // Uses enhancedLogError with fallback to console.error if logging system is not yet initialized
  window.addEventListener('error', (event) => {
    const errorMessage = `Global error handler caught error: ${event.message || 'Unknown error'}`;
    
    try {
      // Use enhancedLogError (defined in this module)
      enhancedLogError(errorMessage, event.error);
      if (event.filename || event.lineno) {
        enhancedLogError('Error location', new Error(`File: ${event.filename || 'unknown'}, Line: ${event.lineno || 'unknown'}, Col: ${event.colno || 'unknown'}`));
      }
    } catch (loggingError) {
      // Ultimate fallback if even error logging fails
      console.error('[ClipAIble] popup.js:', errorMessage, event.error, event.filename, event.lineno);
      console.error('[ClipAIble] Failed to log error:', loggingError);
    }
    
    // Always try to send to service worker for centralized logging
    sendErrorToServiceWorker(errorMessage, event.error, {
      source: 'popup.globalError',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // Global error handler for unhandled promise rejections
  // Uses enhancedLogError with fallback to console.error if logging system is not yet initialized
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = `Unhandled promise rejection: ${event.reason?.message || String(event.reason)}`;
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    try {
      // Use enhancedLogError (defined in this module)
      enhancedLogError(errorMessage, error);
    } catch (loggingError) {
      // Ultimate fallback if even error logging fails
      console.error('[ClipAIble] popup.js:', errorMessage, event.reason);
      console.error('[ClipAIble] Failed to log rejection:', loggingError);
    }
    
    // Always try to send to service worker for centralized logging
    sendErrorToServiceWorker(errorMessage, error, {
      source: 'popup.unhandledRejection'
    });
  });
}

