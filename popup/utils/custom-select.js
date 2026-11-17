// @ts-check

export function initCustomSelect(selectId, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) return null;

  // Skip if already converted
  if (select.closest('.custom-select')) return select.closest('.custom-select');

  // Create wrapper structure
  const container = document.createElement('div');
  container.className = 'custom-select';
  container.id = `${selectId}Container`;

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.id = `${selectId}Trigger`;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select-value';
  valueSpan.id = `${selectId}Value`;

  const arrow = document.createElement('span');
  arrow.className = 'custom-select-arrow';
  arrow.textContent = '▾';

  trigger.appendChild(valueSpan);
  trigger.appendChild(arrow);

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'custom-select-options';
  optionsDiv.id = `${selectId}Options`;

  // Function to populate options
  const populateOptions = () => {
    optionsDiv.innerHTML = '';
    if (!(select instanceof HTMLSelectElement)) return;
    Array.from(select.options).forEach((option) => {
      const customOption = document.createElement('div');
      customOption.className = 'custom-select-option';
      customOption.dataset.value = option.value;

      // Preserve data-i18n attribute if present
      if (option.hasAttribute('data-i18n')) {
        customOption.setAttribute('data-i18n', option.getAttribute('data-i18n'));
      }

      customOption.textContent = option.textContent;
      if (option.selected || select.value === option.value) {
        customOption.classList.add('selected');
        valueSpan.textContent = option.textContent;
      }
      optionsDiv.appendChild(customOption);
    });
  };

  populateOptions();

  container.appendChild(trigger);
  container.appendChild(optionsDiv);

  // Replace select with container structure
  select.style.display = 'none';
  select.style.position = 'absolute';
  select.style.opacity = '0';
  select.style.pointerEvents = 'none';
  select.parentNode.insertBefore(container, select);
  container.appendChild(select);

  // Event handlers
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');

    // Close all other custom selects
    document.querySelectorAll('.custom-select.open').forEach(otherSelect => {
      if (otherSelect !== container) {
        otherSelect.classList.remove('open');
      }
    });

    options.onOpen?.();

    // Toggle current select
    if (isOpen) {
      container.classList.remove('open');
    } else {
      container.classList.add('open');
    }
  });

  optionsDiv.addEventListener('click', (e) => {
    // Defer all work to avoid blocking main thread
    setTimeout(() => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const option = target.closest('.custom-select-option');
      if (!(option instanceof HTMLElement)) return;

      const value = option.dataset.value;
      if (value === undefined) return;

      // Defer DOM updates to requestAnimationFrame
      requestAnimationFrame(() => {
        // Update native select
        if (select instanceof HTMLSelectElement) {
          select.value = value;
        }
        select.dispatchEvent(new Event('change', { bubbles: true }));

        // Update display
        valueSpan.textContent = option.textContent;

        // Update selected state
        optionsDiv.querySelectorAll('.custom-select-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');

        // Close dropdown
        container.classList.remove('open');

        // Call custom callback if provided
        if (options.onChange) {
          options.onChange(value);
        }
      });
    }, 0);
  }, { passive: true });

  // Close dropdown when clicking outside (handled globally for all selects)

  // Sync with native select value changes
  select.addEventListener('change', () => {
    if (!(select instanceof HTMLSelectElement)) return;
    const selectedOption = optionsDiv.querySelector(`[data-value="${select.value}"]`);
    if (selectedOption instanceof HTMLElement) {
      valueSpan.textContent = selectedOption.textContent;
      optionsDiv.querySelectorAll('.custom-select-option').forEach(opt => {
        if (opt instanceof HTMLElement) {
          opt.classList.remove('selected');
        }
      });
      selectedOption.classList.add('selected');
    } else {
      // If option not found, repopulate (for dynamic selects)
      populateOptions();
    }
  });

  // Watch for option changes (for dynamic selects)
  const observer = new MutationObserver(() => {
    if (!(select instanceof HTMLSelectElement)) return;
    const currentValue = select.value;
    populateOptions();
    // Restore value after repopulation
    if (currentValue && select instanceof HTMLSelectElement) {
      select.value = currentValue;
      const selectedOption = optionsDiv.querySelector(`[data-value="${currentValue}"]`);
      if (selectedOption) {
        selectedOption.classList.add('selected');
        valueSpan.textContent = selectedOption.textContent;
      }
    }
  });
  observer.observe(select, { childList: true, subtree: true });

  enhanceCustomSelect(select, container);
  return container;
}

const enhancedSelects = new WeakMap();

/** Add select-only combobox navigation to existing dropdown click handlers. */
export function enhanceCustomSelect(select, container = select?.closest('.custom-select')) {
  if (!select || !container) return null;
  if (enhancedSelects.has(container)) return enhancedSelects.get(container);
  const trigger = container.querySelector('.custom-select-trigger');
  const listbox = container.querySelector('.custom-select-options');
  if (!trigger || !listbox) return null;
  let active = -1;
  let activeValue;
  let query = '';
  let lastTyped = 0;
  const items = () => Array.from(listbox.querySelectorAll('.custom-select-option'));
  const isOpen = () => container.classList.contains('open');
  const enabled = () => items().filter(item => item.getAttribute('aria-disabled') !== 'true');
  const label = Array.from(document.querySelectorAll('label')).find(item => item.htmlFor === select.id);
  if (label) {
    label.id ||= `${select.id}Label`;
    trigger.setAttribute('aria-labelledby', label.id);
    label.addEventListener('click', event => { event.preventDefault(); trigger.focus(); });
  } else {
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.title || select.id);
  }
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', listbox.id);
  listbox.setAttribute('role', 'listbox');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;

  function sync() {
    const all = items();
    const isDisabled = index => {
      const native = select.options?.[index];
      return Boolean(native?.disabled || native?.parentElement?.disabled || native?.hidden);
    };
    if (isOpen()) {
      active = all.findIndex((item, index) => item.dataset.value === activeValue && !isDisabled(index));
      if (active < 0) active = all.findIndex((item, index) => item.dataset.value === select.value && !isDisabled(index));
      if (active < 0) active = all.findIndex((_item, index) => !isDisabled(index));
      activeValue = all[active]?.dataset.value;
    } else {
      active = -1;
      activeValue = undefined;
    }
    trigger.tabIndex = select.disabled ? -1 : 0;
    trigger.setAttribute('aria-disabled', String(Boolean(select.disabled)));
    trigger.setAttribute('aria-expanded', String(isOpen()));
    if (!label) trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.title || select.id);
    all.forEach((item, index) => {
      item.id ||= `${select.id}Option${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-disabled', String(isDisabled(index)));
      item.setAttribute('aria-selected', String(isOpen() && active >= 0 ? index === active : item.dataset.value === select.value));
      item.classList.toggle('keyboard-active', isOpen() && index === active);
    });
    if (isOpen() && all[active]) trigger.setAttribute('aria-activedescendant', all[active].id);
    else trigger.removeAttribute('aria-activedescendant');
  }

  function focusOption(item) {
    active = items().indexOf(item);
    activeValue = item?.dataset.value;
    sync();
    item?.scrollIntoView?.({ block: 'nearest' });
  }

  function open() {
    if (select.disabled) return;
    if (!isOpen()) {
      active = items().findIndex(item => item.dataset.value === select.value);
      trigger.click();
      if (active < 0 || !enabled().includes(items()[active])) active = items().indexOf(enabled()[0]);
    }
    sync();
  }

  function close(commit = false) {
    if (commit && isOpen() && enabled().includes(items()[active])) items()[active].click();
    container.classList.remove('open');
    query = '';
    active = -1;
    sync();
  }

  trigger.addEventListener('click', event => {
    if (select.disabled) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  trigger.addEventListener('click', () => {
    active = isOpen() ? items().findIndex(item => item.dataset.value === select.value) : -1;
    activeValue = items()[active]?.dataset.value;
    if (!isOpen()) query = '';
    sync();
    if (isOpen()) items()[active]?.scrollIntoView?.({ block: 'nearest' });
  });
  // Keep focus on the combobox until the clicked option commits.
  listbox.addEventListener('mousedown', event => {
    if (event.button === 0 && event.target.closest('.custom-select-option')) event.preventDefault();
  });
  listbox.addEventListener('click', event => {
    const item = event.target.closest('.custom-select-option');
    if (item?.getAttribute('aria-disabled') === 'true') { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  trigger.addEventListener('keydown', event => {
    if (select.disabled || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    if (key === 'Tab') { if (isOpen()) close(true); return; }
    if (key === 'Escape') {
      if (isOpen()) { event.preventDefault(); event.stopPropagation(); close(); }
      return;
    }
    if (event.altKey && key !== 'ArrowDown' && key !== 'ArrowUp') return;
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
      event.preventDefault();
      if ((key === 'Enter' || key === ' ') && isOpen()) { close(true); return; }
      if (event.altKey && key === 'ArrowUp' && isOpen()) { close(true); return; }
      const wasOpen = isOpen();
      open();
      const available = enabled();
      if (!available.length) return;
      const position = available.indexOf(items()[active]);
      if (key === 'Home' || (!wasOpen && key === 'ArrowUp')) focusOption(available[0]);
      else if (key === 'End') focusOption(available.at(-1));
      else if (wasOpen && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(key)) {
        const step = key === 'PageDown' ? 10 : key === 'PageUp' ? -10 : key === 'ArrowDown' ? 1 : -1;
        focusOption(available[Math.max(0, Math.min(available.length - 1, position + step))]);
      }
      return;
    }
    if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      open();
      const now = Date.now();
      query = now - lastTyped > 1000 ? key : query + key;
      lastTyped = now;
      const repeated = [...query].every(character => character.toLocaleLowerCase() === key.toLocaleLowerCase());
      const prefix = (repeated ? key : query).toLocaleLowerCase();
      const available = enabled();
      const position = available.indexOf(items()[active]);
      const search = repeated ? [...available.slice(position + 1), ...available.slice(0, position + 1)] : available;
      const match = search.find(item => item.textContent.trim().toLocaleLowerCase().startsWith(prefix));
      if (match) focusOption(match);
    }
  });
  trigger.addEventListener('blur', event => {
    if (!container.contains(event.relatedTarget) && isOpen()) close(true);
  });
  select.addEventListener('change', sync);
  const observer = new MutationObserver(sync);
  observer.observe(container, { attributes: true, attributeFilter: ['class'] });
  observer.observe(listbox, { childList: true, subtree: true, characterData: true });
  observer.observe(select, { attributes: true, attributeFilter: ['disabled', 'title', 'aria-label'], childList: true, subtree: true });
  sync();
  const controller = { sync, close };
  enhancedSelects.set(container, controller);
  return controller;
}
