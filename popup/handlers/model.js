// @ts-check
import { logError } from '../../scripts/utils/logging.js';

/** Bind model selection and the custom model grid to one interactive trigger. */
export function setupModelHandlers({ elements, settingsModule }) {
  const select = elements.modelSelect;
  const trigger = elements.modelSelectTrigger;
  const value = elements.modelSelectValue;
  const popup = elements.customModelDropdown;
  const grid = elements.customModelOptions;

  select?.addEventListener('change', async () => {
    sync();
    await settingsModule?.selectModel(select.value);
  });
  elements.addModelBtn?.addEventListener('click', async event => {
    event.stopPropagation();
    await settingsModule?.showAddModelDialog();
  });
  if (!select || !trigger || !popup || !grid) return;

  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  let epoch = 0;
  let requested = false;
  let activeId = null;
  let openPromise = null;
  let navigation = Promise.resolve();
  let openedAt = 0;
  let query = '';
  let lastTyped = 0;
  let actionFocus = false;
  const rows = () => Array.from(grid.querySelectorAll('.custom-model-option'));
  const isOpen = () => !popup.classList.contains('hidden') && popup.style.display !== 'none';
  const isBusy = () => grid.getAttribute('aria-busy') === 'true';
  const provider = () => elements.apiProviderSelect?.value;
  const backingAvailable = () => !select.disabled && select.options.length > 0 &&
    (!select.dataset.provider || select.dataset.provider === provider());
  const currentRows = () => rows().filter(row => {
    const option = Array.from(select.options).find(option => option.value === row.dataset.modelValue);
    return option && !option.disabled && !option.hidden;
  });

  function sync() {
    if (!trigger || !popup || !grid) return;
    const selected = select?.selectedOptions?.[0];
    if (value) value.textContent = selected?.textContent || '';
    const disabled = !backingAvailable();
    if (disabled && requested) {
      const returnToAdd = !select.options.length && (document.activeElement === trigger || popup.contains(document.activeElement));
      close();
      if (returnToAdd) elements.addModelBtn?.focus();
      return;
    }
    trigger.disabled = disabled;
    const expanded = requested && isOpen();
    trigger.setAttribute('aria-expanded', String(expanded));
    if (expanded && !isBusy()) {
      const available = currentRows();
      if (!available.some(row => row.dataset.modelValue === activeId)) {
        activeId = available.find(row => row.dataset.modelValue === select.value)?.dataset.modelValue || available[0]?.dataset.modelValue || null;
      }
    }
    for (const row of rows()) {
      const active = expanded && row.dataset.modelValue === activeId;
      row.classList.toggle('keyboard-active', active);
      row.setAttribute('aria-selected', String(expanded ? active : row.dataset.modelValue === select.value));
    }
    const active = currentRows().find(row => row.dataset.modelValue === activeId);
    if (expanded && active && document.activeElement === trigger) {
      trigger.setAttribute('aria-activedescendant', active.querySelector('.custom-model-label').id);
    } else trigger.removeAttribute('aria-activedescendant');
  }

  function close(commit = false, restoreFocus = false) {
    const row = commit && backingAvailable() && !isBusy() ? currentRows().find(row => row.dataset.modelValue === activeId) : null;
    ++epoch;
    requested = false;
    openPromise = null;
    navigation = Promise.resolve();
    query = '';
    activeId = null;
    actionFocus = false;
    if (row) row.click();
    popup.classList.add('hidden');
    popup.style.display = 'none';
    sync();
    if (restoreFocus) trigger.focus();
  }

  function ensureOpen() {
    if (!backingAvailable() || trigger.disabled) return Promise.resolve(false);
    if (requested && isOpen()) return openPromise || Promise.resolve(true);
    if (requested) close();
    const owner = ++epoch;
    const openedProvider = provider();
    requested = true;
    openedAt = Date.now();
    activeId = select.value;
    navigation = Promise.resolve();
    let render;
    try {
      render = settingsModule?.showCustomModelDropdown();
    } catch (error) {
      close();
      return Promise.reject(error);
    }
    sync();
    const pending = Promise.resolve(render).then(() => {
      if (epoch !== owner || !requested || !isOpen() || provider() !== openedProvider) return false;
      sync();
      return true;
    }).catch(error => {
      if (epoch === owner) close();
      throw error;
    }).finally(() => {
      if (openPromise === pending) openPromise = null;
    });
    openPromise = pending;
    return pending;
  }

  function enqueue(ready, operation) {
    const owner = epoch;
    navigation = navigation.then(async () => {
      if (!await ready || epoch !== owner || !requested || !isOpen() || !backingAvailable()) return;
      operation();
    }).catch(error => logError('Failed to update model menu', error));
  }

  function activate(row) {
    activeId = row?.dataset.modelValue || null;
    sync();
    row?.scrollIntoView?.({ block: 'nearest' });
  }

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    if (requested && isOpen()) close();
    else ensureOpen().catch(error => logError('Failed to open model menu', error));
  });
  const label = document.querySelector(`label[for="${trigger.id}"]`);
  label?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    trigger.focus();
  });
  trigger.addEventListener('keydown', event => {
    if (!backingAvailable() || trigger.disabled || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === 'Escape') {
      if (requested) { event.preventDefault(); event.stopPropagation(); close(false, true); }
      return;
    }
    if (key === 'Tab') { if (requested) close(!isBusy()); return; }
    if (event.altKey && key !== 'ArrowDown' && key !== 'ArrowUp') return;
    if (event.altKey && key === 'ArrowUp') {
      if (requested) { event.preventDefault(); close(true, true); }
      return;
    }
    if (key === 'ArrowRight' && requested) {
      event.preventDefault();
      enqueue(ensureOpen(), () => currentRows().find(row => row.dataset.modelValue === activeId)?.querySelector('button')?.focus());
      return;
    }
    const navigationKey = ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key);
    const printable = key.length === 1 && !event.altKey;
    if (!navigationKey && !printable) return;
    event.preventDefault();
    const wasOpen = requested && isOpen();
    const typedAt = Date.now();
    const ready = ensureOpen();
    enqueue(ready, () => {
      if ((key === 'Enter' || key === ' ') && wasOpen) { close(true, true); return; }
      const available = currentRows();
      if (!available.length) return;
      const position = available.findIndex(row => row.dataset.modelValue === activeId);
      if (key === 'Home' || (!wasOpen && key === 'ArrowUp')) activate(available[0]);
      else if (key === 'End') activate(available.at(-1));
      else if (wasOpen && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(key)) {
        const step = key === 'PageDown' ? 10 : key === 'PageUp' ? -10 : key === 'ArrowDown' ? 1 : -1;
        activate(available[Math.max(0, Math.min(available.length - 1, position + step))]);
      } else if (printable && key !== ' ') {
        query = typedAt - lastTyped > 1000 ? key : query + key;
        lastTyped = typedAt;
        const repeated = [...query].every(character => character.toLocaleLowerCase() === key.toLocaleLowerCase());
        const prefix = (repeated ? key : query).toLocaleLowerCase();
        const search = repeated ? [...available.slice(position + 1), ...available.slice(0, position + 1)] : available;
        const match = search.find(row => row.querySelector('.custom-model-label').textContent.trim().toLocaleLowerCase().startsWith(prefix));
        if (match) activate(match);
      }
    });
  });
  trigger.addEventListener('focus', sync);
  trigger.addEventListener('blur', event => {
    if (!popup.contains(event.relatedTarget) && requested) close(!isBusy());
  });
  popup.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('.custom-model-option') && !event.target.closest('button')) event.preventDefault();
  });
  popup.addEventListener('focusin', event => {
    actionFocus = Boolean(event.target.closest('.custom-model-delete'));
    if (actionFocus) activeId = event.target.closest('.custom-model-option').dataset.modelValue;
    sync();
  });
  popup.addEventListener('focusout', event => {
    if (event.relatedTarget === trigger || popup.contains(event.relatedTarget) || !requested) return;
    const owner = epoch;
    queueMicrotask(() => {
      if (epoch !== owner || !requested) return;
      if (!isOpen() || !backingAvailable()) { close(); return; }
      if (document.activeElement === trigger || popup.contains(document.activeElement)) return;
      if (!event.target.isConnected && actionFocus) {
        actionFocus = false;
        trigger.focus();
        sync();
      } else close();
    });
  });
  popup.addEventListener('keydown', event => {
    const button = event.target.closest('.custom-model-delete');
    if (!button) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false, true); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); actionFocus = false; trigger.focus(); sync(); }
    else if (event.key === 'Tab') close(false, true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const available = currentRows();
      const position = available.findIndex(row => row.contains(button));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 :
        Math.max(0, Math.min(available.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
      activate(available[next]);
      available[next]?.querySelector('button')?.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!requested || !isOpen() || Date.now() - openedAt < 150) return;
    if (popup.contains(event.target) || trigger.contains(event.target) || elements.addModelBtn?.contains(event.target)) return;
    const owner = epoch;
    requestAnimationFrame(() => { if (epoch === owner && requested) close(); });
  });
  elements.apiProviderSelect?.addEventListener('change', () => { close(); sync(); });
  const menuObserver = new MutationObserver(() => {
    if (requested && !isOpen()) close();
    else {
      sync();
      if (requested && actionFocus && !popup.contains(document.activeElement)) {
        actionFocus = false;
        trigger.focus();
        sync();
      }
    }
  });
  menuObserver.observe(popup, { attributes: true, attributeFilter: ['class', 'style'] });
  menuObserver.observe(grid, { childList: true, subtree: true, characterData: true });
  const selectObserver = new MutationObserver(sync);
  selectObserver.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'data-provider'] });
  sync();
}

