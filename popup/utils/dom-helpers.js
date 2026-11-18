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
      // CRITICAL: Remove 'hidden' class when showing, add when hiding
      // The 'hidden' class has 'display: none !important' which overrides inline styles
      if (displayValue === 'none' || displayValue === '') {
        group.classList.add('hidden');
        // Still set display for consistency, even though hidden class will override
        group.style.display = 'none';
      } else {
        // Remove hidden class first, then set display
        group.classList.remove('hidden');
        group.style.display = displayValue;
      }
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
      // CRITICAL: Remove 'hidden' class when showing, add when hiding
      // The 'hidden' class has 'display: none !important' which overrides inline styles
      if (displayValue === 'none' || displayValue === '') {
        group.classList.add('hidden');
        // Still set display for consistency, even though hidden class will override
        group.style.display = 'none';
      } else {
        // Remove hidden class first, then set display
        group.classList.remove('hidden');
        group.style.display = displayValue;
      }
    }
  });
}

/** Keep keyboard focus inside a visible modal until its existing close action runs. */
export function activateModalDialog(modal, onCancel, initialFocus) {
  const dialog = modal.querySelector('.modal-dialog') || modal;
  const previousFocus = /** @type {HTMLElement | SVGElement | null} */ (document.activeElement);
  const title = dialog.querySelector('h1[id], h2[id], h3[id]');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (title) dialog.setAttribute('aria-labelledby', title.id);
  dialog.tabIndex = -1;
  const siblings = (/** @type {Array<Element & {inert: boolean}>} */ (Array.from(document.body.children)))
    .filter(element => element !== modal && !element.contains(modal));
  /** @type {Array<[Element & {inert: boolean}, boolean]>} */
  const inertStates = siblings.map(element => [element, element.inert]);
  siblings.forEach(element => { element.inert = true; });
  const focusable = () => Array.from(dialog.querySelectorAll('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[hidden], .hidden') &&
      window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).visibility !== 'hidden');
  const focusInside = () => (initialFocus && !initialFocus.disabled ? initialFocus : focusable()[0] || dialog).focus();
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Tab') {
      const controls = focusable();
      const first = controls[0] || dialog;
      const last = controls.at(-1) || dialog;
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };
  const onFocus = event => { if (!dialog.contains(event.target)) focusInside(); };
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocus, true);
  focusInside();
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocus, true);
    inertStates.forEach(([element, inert]) => { element.inert = inert; });
    if (previousFocus?.isConnected) previousFocus.focus();
  };
}

