// @ts-check
// Notification helper for background service worker
// Uses dependency injection pattern for better testability and modularity

/**
 * Initialize notifications module with dependencies
 * @param {import('../types.js').NotificationsDeps} deps - Dependencies object
 * @returns {Object} Notification functions
 */
export function initNotifications(deps) {
  const {
    log,
    logError,
    logWarn,
    getUILanguage,
    tSync
  } = deps;

  /**
   * Create a notification with consistent styling
   * @param {string} message - Notification message
   * @param {string|null} [title] - Notification title (default: 'ClipAIble')
   * @returns {Promise<void>}
   */
  async function createNotification(message, title = null) {
    // Get localized extension name if title not provided
    if (!title) {
      const uiLang = await getUILanguage();
      title = tSync('extensionName', uiLang);
    }
    if (!chrome.notifications || !chrome.notifications.create) {
      logWarn('chrome.notifications API not available');
      return;
    }
    
    const iconUrl = chrome.runtime.getURL('icons/icon128.png');
    
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: title,
        message: message,
        requireInteraction: false
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          logError('Failed to create notification', chrome.runtime.lastError);
        } else {
          log('Notification created successfully', { notificationId, message });
        }
      });
    } catch (createError) {
      logError('Exception while creating notification', createError);
    }
  }

  return {
    /** @type {function(string, string?): Promise<void>} */
    createNotification
  };
}

// Backward compatibility: export createNotification directly for modules that haven't been refactored yet
// TODO: Remove this after all modules use DI
import { log, logError, logWarn } from '../utils/logging.js';
import { getUILanguage, tSync } from '../locales.js';

const notificationsModule = initNotifications({
  log,
  logError,
  logWarn,
  getUILanguage,
  tSync
});

export const createNotification = notificationsModule.createNotification;

