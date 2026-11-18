import { vi } from 'vitest';

function storageValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) return null;
  const branch = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.map(item => storageValue(item, branch) ?? null);
  return Object.fromEntries(Object.keys(value).flatMap(key => {
    const result = storageValue(value[key], branch);
    return result === undefined ? [] : [[key, result]];
  }));
}

function keyList(keys) {
  const list = typeof keys === 'string' ? [keys] : keys;
  if (!Array.isArray(list) || list.some(key => typeof key !== 'string')) throw new TypeError('Expected storage key strings');
  return list.slice();
}

/** A stateful storage area with Chrome value serialization and both call styles. */
export function createChromeStorage(runtime) {
  let values = {};
  const failures = new Map();
  const listeners = new Set();
  const originals = {};
  const onChanged = {
    addListener: vi.fn(listener => listeners.add(listener)),
    removeListener: vi.fn(listener => listeners.delete(listener)),
    hasListener: vi.fn(listener => listeners.has(listener))
  };

  function changed(before) {
    const changes = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(values)])) {
      if (JSON.stringify(before[key]) === JSON.stringify(values[key])) continue;
      const change = {};
      if (Object.hasOwn(before, key)) change.oldValue = storageValue(before[key]);
      if (Object.hasOwn(values, key)) change.newValue = storageValue(values[key]);
      Object.defineProperty(changes, key, { value: change, enumerable: true });
    }
    if (Object.keys(changes).length) queueMicrotask(() => {
      for (const listener of [...listeners]) listener(storageValue(changes), 'local');
    });
  }

  function invoke(name, operation, callback) {
    const failure = failures.get(name)?.shift();
    if (callback !== undefined && typeof callback !== 'function') throw new TypeError('Expected callback');
    if (callback) {
      queueMicrotask(() => {
        const previous = runtime.lastError;
        if (failure) runtime.lastError = { message: failure };
        else delete runtime.lastError;
        try { callback(failure ? undefined : operation()); }
        finally {
          if (previous === undefined) delete runtime.lastError;
          else runtime.lastError = previous;
        }
      });
      return undefined;
    }
    return Promise.resolve().then(() => {
      if (failure) throw new Error(failure);
      return operation();
    });
  }

  const local = {};
  const install = (name, implementation) => {
    originals[name] = implementation;
    local[name] = vi.fn(implementation);
  };
  install('get', (keys = null, callback) => {
    if (typeof keys === 'function') { callback = keys; keys = null; }
    const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? storageValue(keys) : null;
    const selected = keys === null ? null : defaults ? Object.keys(defaults) : keyList(keys);
    return invoke('get', () => {
      if (selected === null) return storageValue(values);
      return Object.fromEntries(selected.flatMap(key => Object.hasOwn(values, key) ? [[key, storageValue(values[key])]] : defaults && Object.hasOwn(defaults, key) ? [[key, storageValue(defaults[key])]] : []));
    }, callback);
  });
  install('set', (updates, callback) => {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new TypeError('Expected storage object');
    const copy = storageValue(updates);
    return invoke('set', () => {
      const before = values;
      values = { ...values, ...copy };
      changed(before);
    }, callback);
  });
  install('remove', (keys, callback) => {
    const removed = keyList(keys);
    return invoke('remove', () => {
      const before = values;
      values = Object.fromEntries(Object.entries(values).filter(([key]) => !removed.includes(key)));
      changed(before);
    }, callback);
  });
  install('clear', callback => invoke('clear', () => {
    const before = values;
    values = {};
    changed(before);
  }, callback));
  install('setAccessLevel', (options, callback) => {
    if (!['TRUSTED_CONTEXTS', 'TRUSTED_AND_UNTRUSTED_CONTEXTS'].includes(options?.accessLevel)) throw new TypeError('Invalid storage access level');
    return invoke('setAccessLevel', () => {}, callback);
  });
  local.onChanged = onChanged;
  return {
    local, onChanged,
    failNext(name, message = 'Synthetic storage failure') {
      const queue = failures.get(name) || [];
      queue.push(message); failures.set(name, queue);
    },
    reset() {
      values = {};
      failures.clear();
      delete runtime.lastError;
      for (const [name, implementation] of Object.entries(originals)) local[name].mockReset().mockImplementation(implementation);
    }
  };
}
