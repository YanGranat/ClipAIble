// Test setup and mocks for Chrome Extension APIs

import { beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createChromeStorage } from './helpers/chrome-storage.js';

// Mock chrome.runtime
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: vi.fn((message, callback) => {
      if (callback) callback({ success: true });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  storage: {},
  downloads: {
    download: vi.fn((options, callback) => {
      if (callback) callback(1);
      return Promise.resolve(1);
    })
  },
  debugger: {
    attach: vi.fn((target, version, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    detach: vi.fn((target, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    sendCommand: vi.fn((target, method, params, callback) => {
      if (callback) callback({ data: 'base64data' });
      return Promise.resolve({ data: 'base64data' });
    })
  },
  scripting: {
    executeScript: vi.fn((options) => {
      return Promise.resolve([{ result: {} }]);
    })
  },
  tabs: {
    get: vi.fn((tabId, callback) => {
      if (callback) callback({ id: tabId, url: 'https://example.com' });
      return Promise.resolve({ id: tabId, url: 'https://example.com' });
    })
  },
  alarms: {
    create: vi.fn((name, alarmInfo, callback) => {
      if (callback) callback();
    }),
    clear: vi.fn((name, callback) => {
      if (callback) callback(true);
      return Promise.resolve(true);
    }),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  notifications: {
    create: vi.fn((options, callback) => {
      if (callback) callback('notification-id');
    })
  },
  contextMenus: {
    create: vi.fn((options, callback) => {
      if (callback) callback();
    }),
    remove: vi.fn((id, callback) => {
      if (callback) callback();
    })
  }
};

const storage = createChromeStorage(global.chrome.runtime);
global.chrome.storage = { local: storage.local, onChanged: storage.onChanged };
beforeEach(() => storage.reset());
vi.stubGlobal('crypto', webcrypto);

// Node versions without Web Locks still need to serialize extension storage writes.
if (!globalThis.navigator?.locks) {
  const pending = new Map();
  globalThis.navigator ??= {};
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {
    request(name, callback) {
      const result = (pending.get(name) ?? Promise.resolve()).then(callback);
      const queued = result.catch(() => {});
      pending.set(name, queued);
      queued.then(() => { if (pending.get(name) === queued) pending.delete(name); });
      return result;
    }
  } });
}

