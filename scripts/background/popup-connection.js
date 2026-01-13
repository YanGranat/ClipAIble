// @ts-check
// Popup connection tracker for ClipAIble extension
// Tracks whether popup is currently open using a long-lived runtime Port.

import { log, logError, logWarn } from '../utils/logging.js';

/**
 * Port name used by popup to indicate it is open.
 * @type {string}
 */
export const POPUP_PORT_NAME = 'clipaible_popup';

/**
 * Active popup ports count.
 * Service worker can have multiple popup instances in rare cases (e.g., devtools).
 * @type {number}
 */
let activePopupPorts = 0;

/**
 * Returns true if popup is currently open (connected via Port).
 * @returns {boolean}
 */
export function isPopupOpen() {
  return activePopupPorts > 0;
}

/**
 * Initialize popup port listener.
 * Must be called during service worker initialization.
 * @returns {void}
 */
export function initPopupConnectionListener() {
  try {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== POPUP_PORT_NAME) {
        return;
      }

      activePopupPorts++;
      log('Popup port connected', {
        timestamp: Date.now(),
        activePopupPorts,
        senderUrl: port.sender?.url
      });

      port.onDisconnect.addListener(() => {
        activePopupPorts = Math.max(0, activePopupPorts - 1);
        log('Popup port disconnected', {
          timestamp: Date.now(),
          activePopupPorts
        });
      });
    });
  } catch (e) {
    logError('Failed to register popup port listener', e);
    logWarn('Popup completion notifications may be shown even when popup is open', {
      timestamp: Date.now()
    });
  }
}

