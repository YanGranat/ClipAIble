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

const modalStacks = new WeakMap();

function syncModalStack(doc, stack) {
  const top = stack.entries.at(-1);
  if (!top) {
    for (const [element, inert] of stack.inertStates) element.inert = inert;
    return;
  }
  for (const element of /** @type {HTMLElement[]} */ (Array.from(doc.body.children))) {
    if (!stack.inertStates.has(element)) stack.inertStates.set(element, element.inert);
    element.inert = element !== top.modal && !element.contains(top.modal);
  }
  for (const entry of stack.entries) {
    if (entry === top) entry.dialog.setAttribute('aria-modal', 'true');
    else entry.dialog.removeAttribute('aria-modal');
  }
}

/** Keep focus in the topmost popup modal and restore the view below it on close. */
export function activateModalDialog(modal, onCancel, initialFocus) {
  const doc = modal.ownerDocument;
  const dialog = modal.querySelector('.modal-dialog') || modal;
  const previousFocus = /** @type {HTMLElement | SVGElement | null} */ (doc.activeElement);
  const title = dialog.querySelector('h1[id], h2[id], h3[id]');
  dialog.setAttribute('role', 'dialog');
  if (title) dialog.setAttribute('aria-labelledby', title.id);
  dialog.tabIndex = -1;
  let stack = modalStacks.get(doc);
  if (!stack) {
    stack = { entries: [], inertStates: new Map(), returnFocus: previousFocus };
    modalStacks.set(doc, stack);
  }
  const focusable = () => Array.from(dialog.querySelectorAll('button, input:not([type="hidden"]), select, textarea, a[href], [tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[hidden], .hidden') &&
      doc.defaultView.getComputedStyle(element).display !== 'none' && doc.defaultView.getComputedStyle(element).visibility !== 'hidden');
  const focusInside = () => (initialFocus && !initialFocus.disabled ? initialFocus : focusable()[0] || dialog).focus();
  const entry = { modal, dialog, focusInside };
  const isTop = () => stack.entries.at(-1) === entry;
  const onKeyDown = event => {
    if (!isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Tab') {
      const controls = focusable();
      const first = controls[0] || dialog;
      const last = controls.at(-1) || dialog;
      if (!dialog.contains(doc.activeElement) || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
  };
  const onFocus = event => { if (isTop() && !dialog.contains(event.target)) focusInside(); };
  stack.entries.push(entry);
  syncModalStack(doc, stack);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('focusin', onFocus, true);
  focusInside();
  return () => {
    const index = stack.entries.indexOf(entry);
    if (index < 0) return;
    const wasTop = isTop();
    stack.entries.splice(index, 1);
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('focusin', onFocus, true);
    dialog.removeAttribute('aria-modal');
    syncModalStack(doc, stack);
    const current = stack.entries.at(-1);
    if (!current) {
      modalStacks.delete(doc);
      if (stack.returnFocus?.isConnected) stack.returnFocus.focus();
    } else if (wasTop) {
      if (previousFocus?.isConnected && current.dialog.contains(previousFocus)) previousFocus.focus();
      else current.focusInside();
    }
  };
}

