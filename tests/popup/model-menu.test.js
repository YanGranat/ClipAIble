import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { initModels } from '../../popup/settings/models.js';
import { setupModelHandlers } from '../../popup/handlers/model.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { formatModelLabel, getModelCatalog } from '../../scripts/utils/model-catalog.js';

let dom, elements, stored, models;
const clone = value => structuredClone(value);
const storageRead = keys => Object.fromEntries(keys.map(key => [key, clone(stored[key])]));
const key = (name, target = elements.modelSelectTrigger, options = {}) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
};
const activeId = () => document.getElementById(elements.modelSelectTrigger.getAttribute('aria-activedescendant'))?.closest('.custom-model-option').dataset.modelValue;
const expanded = () => elements.modelSelectTrigger.getAttribute('aria-expanded');
const open = async () => {
  elements.modelSelectTrigger.focus();
  elements.modelSelectTrigger.click();
  await vi.waitFor(() => expect(elements.customModelOptions.getAttribute('aria-busy')).toBe('false'));
  expect(expanded()).toBe('true');
};
const parkRender = () => {
  let release, waiting = false;
  const gate = new Promise(resolve => { release = resolve; });
  chrome.storage.local.get.mockImplementation(async keys => {
    const snapshot = storageRead(keys);
    if (!waiting && keys.includes(STORAGE_KEYS.CUSTOM_MODELS) && keys.includes(STORAGE_KEYS.MODEL_BY_PROVIDER)) {
      waiting = true;
      await gate;
    }
    return snapshot;
  });
  return { release, waiting: () => waiting };
};

beforeEach(async () => {
  dom = new JSDOM(readFileSync(new URL('../../popup/popup.html', import.meta.url), 'utf8'), { pretendToBeVisual: true });
  for (const name of ['document', 'window', 'Element', 'Node', 'Event', 'FocusEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'HTMLElement', 'HTMLSelectElement', 'HTMLButtonElement']) vi.stubGlobal(name, dom.window[name]);
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  stored = { ui_language: 'en', api_provider: 'deepseek', openai_model: 'deepseek-flash', model_by_provider: { deepseek: 'deepseek-flash' } };
  chrome.storage.local.get.mockImplementation(async keys => storageRead(keys));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, clone(values)));
  elements = {};
  initializeDOMElements(elements);
  elements.apiProviderSelect.value = 'deepseek';
  models = initModels({ elements, STORAGE_KEYS, formatModelLabel: id => formatModelLabel(elements.apiProviderSelect.value, id) });
  await models.updateModelList();
  setupModelHandlers({ elements, settingsModule: models });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

describe('model menu interaction owner', () => {
  it('uses one named button and keeps the native value control out of interaction', async () => {
    expect(elements.modelSelect.hidden).toBe(true);
    expect(elements.modelSelect.tabIndex).toBe(-1);
    expect(elements.modelSelect.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('label[for=modelSelect]')).toBeNull();
    expect(elements.modelSelectTrigger.type).toBe('button');
    expect(elements.modelSelectTrigger.getAttribute('aria-haspopup')).toBe('grid');
    expect(elements.modelSelectValue.textContent).toBe('DeepSeek V4.1 Flash');
    await open();
    const row = elements.customModelOptions.firstElementChild;
    expect(row.getAttribute('role')).toBe('row');
    expect(row.querySelectorAll('[role=gridcell]')).toHaveLength(2);
    expect(row.querySelector('button').tabIndex).toBe(-1);
  });

  it.each(['Enter', ' ', 'ArrowDown'])('cancels the default activation synchronously for %s', async name => {
    elements.modelSelectTrigger.focus();
    expect(key(name).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(expanded()).toBe('true'));
    expect(elements.modelSelect.value).toBe('deepseek-flash');
  });

  it('queues rapid navigation and commit while the menu data is pending', async () => {
    const gate = parkRender();
    key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); key('Enter');
    expect(gate.waiting()).toBe(true);
    expect(stored.openai_model).toBe('deepseek-flash');
    gate.release();
    await vi.waitFor(() => expect(stored.openai_model).toBe('deepseek-v4-pro'));
    expect(stored.model_by_provider.deepseek).toBe('deepseek-v4-pro');
    expect(expanded()).toBe('false');
    expect(elements.modelSelectValue.textContent).toBe('DeepSeek V4 Pro (text only)');
  });

  it('retains the full typeahead sequence while rendering is pending', async () => {
    stored.custom_models = { deepseek: ['zebra-synthetic-model', 'zen-synthetic-model'] };
    await models.updateModelList('deepseek-flash');
    const gate = parkRender();
    key('z'); key('e'); key('b'); key('Enter');
    gate.release();
    await vi.waitFor(() => expect(stored.openai_model).toBe('zebra-synthetic-model'));
  });

  it.each(['escape', 'external hide'])('does not reopen or commit after %s interrupts a pending open', async action => {
    const gate = parkRender();
    key('End'); key('Enter');
    if (action === 'escape') key('Escape');
    else {
      elements.customModelDropdown.classList.add('hidden');
      elements.customModelDropdown.style.display = 'none';
      await Promise.resolve();
    }
    gate.release();
    await vi.waitFor(() => expect(elements.customModelOptions.getAttribute('aria-busy')).toBe('false'));
    expect(expanded()).toBe('false');
    expect(elements.modelSelect.value).toBe('deepseek-flash');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('admits a new provider menu while an earlier provider render is still pending', async () => {
    const gate = parkRender();
    key('End'); key('Enter');
    elements.apiProviderSelect.value = 'claude';
    elements.apiProviderSelect.dispatchEvent(new Event('change'));
    expect(expanded()).toBe('false');
    expect(elements.customModelDropdown.classList.contains('hidden')).toBe(true);
    await models.updateModelList();
    key('End'); key('Enter');
    const last = getModelCatalog('claude').at(-1).id;
    await vi.waitFor(() => expect(stored.openai_model).toBe(last));
    gate.release();
    await Promise.resolve(); await Promise.resolve();
    expect(elements.modelSelect.value).toBe(last);
    expect(elements.modelSelectValue.textContent).toBe(elements.modelSelect.selectedOptions[0].textContent);
    expect(expanded()).toBe('false');
  });

  it('cancels queued input while action labels are still loading', async () => {
    let release, waiting = false;
    const gate = new Promise(resolve => { release = resolve; });
    chrome.storage.local.get.mockImplementation(async keys => {
      const snapshot = storageRead(keys);
      if (keys.length === 1 && keys[0] === STORAGE_KEYS.STORAGE_UI_LANGUAGE) {
        waiting = true;
        await gate;
      }
      return snapshot;
    });
    key('End'); key('Enter');
    await vi.waitFor(() => expect(waiting).toBe(true));
    key('Escape'); release();
    await vi.waitFor(() => expect(elements.customModelOptions.getAttribute('aria-busy')).toBe('false'));
    expect(expanded()).toBe('false');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('keeps the active model by ID when rows are reordered', async () => {
    await open();
    key('End');
    await vi.waitFor(() => expect(activeId()).toBe('deepseek-v4-pro'));
    elements.customModelOptions.prepend(elements.customModelOptions.lastElementChild);
    await Promise.resolve();
    expect(activeId()).toBe('deepseek-v4-pro');
    key('Enter');
    await vi.waitFor(() => expect(stored.openai_model).toBe('deepseek-v4-pro'));
  });

  it('keeps row and label IDs distinct for model IDs with a label suffix', async () => {
    stored.custom_models = { deepseek: ['synthetic-item-label', 'synthetic-item'] };
    await models.updateModelList('deepseek-flash');
    await open(); key('End');
    await vi.waitFor(() => {
      const cell = document.getElementById(elements.modelSelectTrigger.getAttribute('aria-activedescendant'));
      expect(cell?.getAttribute('role')).toBe('gridcell');
      expect(cell?.closest('.custom-model-option').dataset.modelValue).toBe('synthetic-item');
    });
    const ids = [...elements.customModelOptions.querySelectorAll('[id]')].map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps pointer focus for selection rows while allowing delete button focus', async () => {
    await open();
    const label = elements.customModelOptions.firstElementChild.querySelector('.custom-model-label');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    label.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const button = elements.customModelOptions.children[1].querySelector('button');
    const buttonDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    button.dispatchEvent(buttonDown);
    expect(buttonDown.defaultPrevented).toBe(false);
    button.focus();
    expect(expanded()).toBe('true');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it.each([false, true])('deletes an action row without committing its keyboard highlight (selected=%s)', async selected => {
    await open();
    if (!selected) key('ArrowDown');
    key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    const removed = document.activeElement.closest('.custom-model-option').dataset.modelValue;
    expect(key('Enter', document.activeElement).defaultPrevented).toBe(false);
    document.activeElement.click();
    await vi.waitFor(() => expect(stored.hidden_models?.deepseek).toContain(removed));
    await vi.waitFor(() => expect(elements.customModelOptions.querySelector(`[data-model-value="${removed}"]`)).toBeNull());
    await vi.waitFor(() => expect(document.activeElement?.id).toBe(elements.modelSelectTrigger.id));
    expect(elements.modelSelect.value).toBe(selected ? 'deepseek-flash-no-thinking' : 'deepseek-flash');
    expect(stored.openai_model).toBe(elements.modelSelect.value);
    expect(expanded()).toBe('true');
  });

  it('returns from a delete action with ArrowLeft and cancels with Escape', async () => {
    await open(); key('ArrowDown'); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    key('ArrowLeft', document.activeElement);
    expect(document.activeElement?.id).toBe(elements.modelSelectTrigger.id);
    key('Escape');
    expect(expanded()).toBe('false');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it.each([false, true])('returns to the combobox tab stop before leaving an action (shift=%s)', async shiftKey => {
    await open(); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    key('Tab', document.activeElement, { shiftKey });
    expect(document.activeElement?.id).toBe(elements.modelSelectTrigger.id);
    expect(expanded()).toBe('false');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('distinguishes a removal focusout from focus leaving the popup', async () => {
    await open(); key('ArrowDown'); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    const replace = elements.customModelOptions.replaceChildren.bind(elements.customModelOptions);
    elements.customModelOptions.replaceChildren = (...children) => {
      const focused = document.activeElement;
      if (elements.customModelOptions.contains(focused)) {
        focused.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      }
      replace(...children);
    };
    document.activeElement.click();
    await vi.waitFor(() => expect(stored.hidden_models?.deepseek).toContain('deepseek-flash-no-thinking'));
    await vi.waitFor(() => expect(document.activeElement?.id).toBe(elements.modelSelectTrigger.id));
    expect(expanded()).toBe('true');
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('preserves outside focus when an action button remains connected', async () => {
    await open(); key('ArrowDown'); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    elements.apiKey.focus();
    await vi.waitFor(() => expect(expanded()).toBe('false'));
    expect(document.activeElement?.id).toBe(elements.apiKey.id);
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('does not restore old action focus after the provider changes', async () => {
    await open(); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    document.activeElement.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    elements.apiProviderSelect.value = 'claude';
    elements.apiProviderSelect.dispatchEvent(new Event('change'));
    elements.customModelOptions.replaceChildren();
    elements.apiKey.focus();
    await Promise.resolve();
    expect(document.activeElement?.id).toBe(elements.apiKey.id);
    expect(expanded()).toBe('false');
  });

  it.each(['Tab', 'blur'])('commits a ready keyboard selection on %s', async action => {
    await open(); key('End');
    await vi.waitFor(() => expect(activeId()).toBe('deepseek-v4-pro'));
    if (action === 'Tab') key('Tab'); else elements.apiKey.focus();
    await vi.waitFor(() => expect(stored.openai_model).toBe('deepseek-v4-pro'));
    expect(expanded()).toBe('false');
    if (action === 'blur') expect(document.activeElement?.id).toBe(elements.apiKey.id);
  });

  it('focuses the named trigger from its label without toggling a second control', () => {
    const label = document.getElementById('modelSelectLabel');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    label.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe(elements.modelSelectTrigger.id);
    expect(expanded()).toBe('false');
  });

  it.each(['disabled', 'empty'])('closes the menu when its backing control becomes %s', async mode => {
    await open(); key('End');
    await vi.waitFor(() => expect(activeId()).toBe('deepseek-v4-pro'));
    if (mode === 'disabled') elements.modelSelect.disabled = true;
    else elements.modelSelect.replaceChildren();
    await vi.waitFor(() => expect(expanded()).toBe('false'));
    expect(elements.modelSelectTrigger.disabled).toBe(true);
    expect(stored.openai_model).toBe('deepseek-flash');
  });

  it('cancels pending input on disable even if reenabled before rendering returns', async () => {
    stored.custom_models = { deepseek: ['zeta-synthetic-model'] };
    await models.updateModelList('deepseek-flash');
    const gate = parkRender();
    key('z'); key('Enter');
    elements.modelSelect.disabled = true;
    await vi.waitFor(() => expect(expanded()).toBe('false'));
    elements.modelSelect.disabled = false;
    gate.release();
    await vi.waitFor(() => expect(elements.customModelOptions.getAttribute('aria-busy')).toBe('false'));
    expect(stored.openai_model).toBe('deepseek-flash');
    expect(expanded()).toBe('false');
  });

  it('does not commit when disable and external focus happen in the same task', async () => {
    await open(); key('End');
    await vi.waitFor(() => expect(activeId()).toBe('deepseek-v4-pro'));
    elements.modelSelect.disabled = true;
    elements.apiKey.focus();
    await Promise.resolve(); await Promise.resolve();
    expect(stored.openai_model).toBe('deepseek-flash');
    expect(document.activeElement?.id).toBe('apiKey');
    expect(expanded()).toBe('false');
  });

  it('returns owned action focus to Add Model when the final model is hidden', async () => {
    stored.hidden_models = { deepseek: ['deepseek-flash-no-thinking', 'deepseek-v4-pro'] };
    await models.updateModelList('deepseek-flash');
    await open(); key('ArrowRight');
    await vi.waitFor(() => expect(document.activeElement.classList.contains('custom-model-delete')).toBe(true));
    document.activeElement.click();
    await vi.waitFor(() => expect(elements.modelSelect.options.length).toBe(0));
    expect(elements.modelSelectTrigger.disabled).toBe(true);
    expect(document.activeElement?.id).toBe('addModelBtn');
    expect(expanded()).toBe('false');
  });
});
