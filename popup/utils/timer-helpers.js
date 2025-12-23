// @ts-check
// Timer helper functions for popup

import { log, logWarn } from '../../scripts/utils/logging.js';
import { formatTime } from './format-helpers.js';
import { escapeHtml as escapeHtmlUtil } from '../../scripts/utils/html.js';

/**
 * Start the timer display updates
 * @param {number} startTime - Start time timestamp
 * @param {Object} currentStartTimeRef - Reference object for current start time
 * @param {Object} timerIntervalRef - Reference object for timer interval
 * @param {Object} elements - DOM elements object
 */
export function startTimerDisplay(startTime, currentStartTimeRef, timerIntervalRef, elements) {
  if (!startTime) {
    logWarn('startTimerDisplay called without startTime');
    return;
  }
  
  // CRITICAL: Always clear existing interval before creating new one to prevent memory leaks
  if (timerIntervalRef.current) {
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }
  
  currentStartTimeRef.current = startTime;
  // Update immediately, then set interval
  updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements);
  
  timerIntervalRef.current = setInterval(() => {
    // Safety check: clear interval if elements are no longer available
    if (!elements || !elements.statusText) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }
    updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements);
  }, 1000);
  
  log('Timer started', { startTime, currentStartTime: currentStartTimeRef.current });
}

/**
 * Stop the timer display
 * @param {Object} currentStartTimeRef - Reference object for current start time
 * @param {Object} timerIntervalRef - Reference object for timer interval
 */
export function stopTimerDisplay(currentStartTimeRef, timerIntervalRef) {
  if (timerIntervalRef.current) {
    clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
  }
  currentStartTimeRef.current = null;
}

/**
 * Update timer display in status text
 * @param {Object} currentStartTimeRef - Reference object for current start time
 * @param {Object} timerIntervalRef - Reference object for timer interval
 * @param {Object} elements - DOM elements object
 */
export function updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements) {
  if (!currentStartTimeRef.current) {
    // CRITICAL: Defer getState call to avoid blocking user interactions
    // Use setTimeout to yield to event loop before making the call
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'getState' }).then(state => {
        if (state && state.isProcessing && state.startTime) {
          currentStartTimeRef.current = state.startTime;
          updateTimerDisplay(currentStartTimeRef, timerIntervalRef, elements); // Retry after setting startTime
        }
      }).catch(() => {});
    }, 0);
    return;
  }
  const elapsed = Math.floor((Date.now() - currentStartTimeRef.current) / 1000);
  const timerSpan = document.getElementById('timerDisplay');
  if (timerSpan) {
    timerSpan.textContent = formatTime(elapsed);
  } else {
    // Timer element not found - try to recreate it if status is processing
    if (elements.statusText) {
      // Extract text without timer if it exists
      const textContent = elements.statusText.textContent || elements.statusText.innerText || '';
      const statusText = textContent.replace(/\s*\(\d{2}:\d{2}\)\s*$/, '').trim();
      const elapsed = Math.floor((Date.now() - currentStartTimeRef.current) / 1000);
      // SECURITY: Escape status text to prevent XSS attacks
      const escapedStatusText = escapeHtmlUtil(statusText);
      elements.statusText.innerHTML = `${escapedStatusText} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
    }
  }
}

