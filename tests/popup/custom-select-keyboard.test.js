import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initCustomSelect, enhanceCustomSelect } from '../../popup/utils/custom-select.js';
import { setupStyleHandlers } from '../../popup/handlers/style.js';
import { STORAGE_KEYS } from '../../popup/constants.js';

let dom;
let select;
let trigger;
let change;
beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM('<label for="choice">Output</label><select id="choice"><option value="">Default</option><option value="a">Apple</option><option value="b" disabled>Banana</option><option value="g">Grape</option><option value="p">Pear</option></select><button id="next">Next</button>');
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLSelectElement', 'MutationObserver', 'Node', 'Event']) vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name]);
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
  select = document.getElementById('choice');
  change = vi.fn();
  select.addEventListener('change', change);
  initCustomSelect('choice');
  trigger = document.getElementById('choiceTrigger');
});
afterEach(() => { dom.window.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const key = value => trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
async function flush() { await vi.runAllTimersAsync(); }

describe('custom select keyboard behavior', () => {
  it('keeps a pressed option open until mouse release commits it once', async () => {
    trigger.focus();
    trigger.click();
    const option = document.querySelector('#choiceOptions [data-value="p"]');
    const down = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    if (option.dispatchEvent(down)) trigger.blur();
    await flush();
    expect(trigger.closest('.custom-select').classList.contains('open')).toBe(true);
    expect(change).not.toHaveBeenCalled();
    option.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    option.click();
    await flush();
    expect(select.value).toBe('p');
    expect(change).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('retains focus and selection when a disabled option is pressed', async () => {
    trigger.focus();
    trigger.click();
    const option = document.querySelector('#choiceOptions [data-value="b"]');
    const down = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    if (option.dispatchEvent(down)) trigger.blur();
    await flush();
    option.click();
    await flush();
    expect(trigger.closest('.custom-select').classList.contains('open')).toBe(true);
    expect(select.value).toBe('');
    expect(change).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps native secondary-button behavior in the option list', () => {
    trigger.click();
    const option = document.querySelector('#choiceOptions [data-value="p"]');
    const down = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 });
    option.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
  });

  it('still commits keyboard navigation when focus leaves the widget', async () => {
    trigger.focus();
    key('g');
    document.getElementById('next').focus();
    await flush();
    expect(select.value).toBe('g');
    expect(change).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.getElementById('next'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes a labeled focusable combobox and options', () => {
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.getAttribute('aria-labelledby')).toBe(document.querySelector('label').id);
    expect(document.getElementById(trigger.getAttribute('aria-controls')).getAttribute('role')).toBe('listbox');
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(5);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens, navigates past disabled options, and commits through the existing change event', async () => {
    trigger.focus();
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    key('ArrowDown'); key('ArrowDown');
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')).textContent).toBe('Grape');
    expect(select.value).toBe('');
    key('Enter'); await flush();
    expect(select.value).toBe('g');
    expect(change).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('uses Home/End and Space while Escape keeps the previous value', async () => {
    key('End'); key(' '); await flush();
    expect(select.value).toBe('p');
    key('Home'); key('Escape'); await flush();
    expect(select.value).toBe('p');
    expect(change).toHaveBeenCalledOnce();
    expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);
    key('Home'); key('Enter'); await flush();
    expect(select.value).toBe('');
  });

  it('supports typeahead and commits on Tab without preventing focus traversal', async () => {
    key('g');
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')).textContent).toBe('Grape');
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    trigger.dispatchEvent(event); await flush();
    expect(event.defaultPrevented).toBe(false);
    expect(select.value).toBe('g');
  });

  it('synchronizes dynamic options and external dismissal', async () => {
    select.insertAdjacentHTML('beforeend', '<option value="z">Zebra</option>');
    await Promise.resolve(); await Promise.resolve();
    key('End');
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')).textContent).toBe('Zebra');
    trigger.closest('.custom-select').classList.remove('open');
    await Promise.resolve();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    select.disabled = true;
    await Promise.resolve();
    expect(trigger.tabIndex).toBe(-1);
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the active value when dynamic options are inserted before it', async () => {
    key('g');
    select.insertAdjacentHTML('afterbegin', '<option value="new">New option</option>');
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')).textContent).toBe('Grape');
    key('Enter'); await flush();
    expect(select.value).toBe('g');
  });

  it('falls back to a current enabled selection when the active option is removed', async () => {
    select.value = 'a';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    key('g');
    select.querySelector('[value="g"]').remove();
    await Promise.resolve(); await Promise.resolve();
    expect(document.getElementById(trigger.getAttribute('aria-activedescendant')).textContent).toBe('Apple');
    key('Enter'); await flush();
    expect(select.value).toBe('a');
  });

  it('routes font selection through its existing save handler, including the empty default', async () => {
    document.body.innerHTML = '<label for="fontFamily">Font</label><div id="fontFamilyContainer" class="custom-select"><div id="fontFamilyTrigger" class="custom-select-trigger"><span id="fontFamilyValue"></span></div><div id="fontFamilyOptions" class="custom-select-options"><div class="custom-select-option" data-value="">Default</div><div class="custom-select-option" data-value="Arial">Arial</div></div><input id="fontFamily" type="hidden" value="Arial"></div>';
    const elements = Object.fromEntries(['fontFamily', 'fontFamilyContainer', 'fontFamilyTrigger', 'fontFamilyOptions', 'fontFamilyValue'].map(id => [id, document.getElementById(id)]));
    const save = vi.fn();
    setupStyleHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: save });
    trigger = elements.fontFamilyTrigger;
    expect(enhanceCustomSelect(elements.fontFamily)).not.toBeNull();
    key('Home'); key('Enter'); await flush();
    expect(elements.fontFamily.value).toBe('');
    expect(save).toHaveBeenCalledWith(STORAGE_KEYS.FONT_FAMILY, '');
    expect(elements.fontFamilyValue.textContent).toBe('Default');
  });
});
