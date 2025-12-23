// Context menu utilities for ClipAIble extension
// Provides functions for creating and managing context menu

// @ts-check

import { log, logWarn, logError } from './logging.js';
import { tSync } from '../locales.js';

/**
 * Menu item definitions for context menu
 * @type {Array<{id: string, translationKey: string, parentId?: string}>}
 */
const MENU_ITEMS = [
  { id: 'clipaible-save-as', translationKey: 'contextMenuSaveAs' },
  { id: 'save-as-pdf', translationKey: 'saveAsPdf', parentId: 'clipaible-save-as' },
  { id: 'save-as-epub', translationKey: 'saveAsEpub', parentId: 'clipaible-save-as' },
  { id: 'save-as-fb2', translationKey: 'saveAsFb2', parentId: 'clipaible-save-as' },
  { id: 'save-as-markdown', translationKey: 'saveAsMarkdown', parentId: 'clipaible-save-as' },
  { id: 'save-as-audio', translationKey: 'saveAsAudio', parentId: 'clipaible-save-as' }
];

/**
 * Fallback English titles for menu items
 * @type {Record<string, string>}
 */
const FALLBACK_TITLES = {
  'clipaible-save-as': 'Save as',
  'save-as-pdf': 'Save as PDF',
  'save-as-epub': 'Save as EPUB',
  'save-as-fb2': 'Save as FB2',
  'save-as-markdown': 'Save as Markdown',
  'save-as-audio': 'Save as Audio'
};

/**
 * Create a menu item with error handling
 * @param {chrome.contextMenus.CreateProperties} options - Menu item options
 */
function createMenuItem(options) {
  try {
    chrome.contextMenus.create(options);
  } catch (error) {
    // Ignore duplicate ID errors (can happen if removeAll() didn't complete yet)
    if (error.message && error.message.includes('duplicate id')) {
      logWarn(`Context menu item ${options.id} already exists, skipping`);
    } else {
      throw error;
    }
  }
}

/**
 * Create all context menu items
 * @param {string} lang - Language code for localization
 * @param {boolean} [useFallback=false] - Use fallback English titles
 */
export function createContextMenuItems(lang, useFallback = false) {
  for (const item of MENU_ITEMS) {
    const title = useFallback 
      ? FALLBACK_TITLES[item.id]
      : tSync(item.translationKey, lang);
    
    const options = {
      id: item.id,
      title: title,
      contexts: ['page']
    };
    
    if (item.parentId) {
      options.parentId = item.parentId;
    }
    
    createMenuItem(options);
  }
}

/**
 * Remove all context menu items and wait for completion
 * @returns {Promise<void>}
 */
export async function removeAllContextMenuItems() {
  await chrome.contextMenus.removeAll();
  // Small delay to ensure removeAll() completes
  await new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Update context menu with localization
 * @param {string} lang - Language code for localization
 * @returns {Promise<void>}
 */
export async function updateContextMenuWithLang(lang) {
  try {
    await removeAllContextMenuItems();
    createContextMenuItems(lang, false);
    log('Context menu created with localization', { lang });
  } catch (error) {
    logError('Failed to create context menu', error);
    // Fallback to English if localization fails
    try {
      await removeAllContextMenuItems();
      createContextMenuItems(lang, true);
      log('Context menu created with fallback English titles');
    } catch (fallbackError) {
      logError('Failed to create fallback context menu', fallbackError);
      throw fallbackError;
    }
  }
}


