// @ts-check
// DOM helper functions for popup

import { logWarn } from '../../scripts/utils/logging.js';

/**
 * Safely get element from elements object
 * @param {string} key - Key in elements object
 * @param {Object} elements - Elements object
 * @returns {HTMLElement|null} Element or null if not found
 */
export function getElement(key, elements) {
  const el = elements[key];
  if (!el) {
    logWarn(`Element not found: ${key}`);
    return null;
  }
  return el;
}

/**
 * Safely set display style for element
 * @param {string} key - Key in elements object
 * @param {string} displayValue - CSS display value ('flex', 'none', 'block', etc.)
 * @param {Object} elements - Elements object
 */
export function setElementDisplay(key, displayValue, elements) {
  const el = getElement(key, elements);
  if (el) {
    el.style.display = displayValue;
  }
}

/**
 * Safely set display style for element group (finds .setting-item parent)
 * @param {string} key - Key in elements object
 * @param {string} displayValue - CSS display value
 * @param {Object} elements - Elements object
 */
export function setElementGroupDisplay(key, displayValue, elements) {
  const el = getElement(key, elements);
  if (el) {
    const group = el.closest('.setting-item') || el;
    if (group instanceof HTMLElement) {
      group.style.display = displayValue;
    }
  }
}

/**
 * Set display style for multiple elements by ID
 * @param {string[]} ids - Array of element IDs
 * @param {string} displayValue - CSS display value
 */
export function setDisplayForIds(ids, displayValue) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) {
      logWarn(`Element not found by ID: ${id}`);
      return;
    }
    const group = el.closest('.setting-item') || el;
    if (group instanceof HTMLElement) {
      group.style.display = displayValue;
    }
  });
}

