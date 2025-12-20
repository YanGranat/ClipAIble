// Test setup and mocks for Chrome Extension APIs

import { vi } from 'vitest';

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
  storage: {
    local: {
      get: vi.fn((keys, callback) => {
        if (callback) callback({});
        return Promise.resolve({});
      }),
      set: vi.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      remove: vi.fn((keys, callback) => {
        if (callback) callback();
        return Promise.resolve();
      })
    }
  },
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

// Mock Web Crypto API
// Use vi.stubGlobal to properly mock crypto
const mockCryptoSubtle = {
  importKey: vi.fn(() => Promise.resolve({})),
  deriveKey: vi.fn(() => Promise.resolve({})),
  encrypt: vi.fn(() => Promise.resolve(new ArrayBuffer(16))),
  decrypt: vi.fn(() => Promise.resolve(new TextEncoder().encode('decrypted')))
};

const mockGetRandomValues = vi.fn((arr) => {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
});

vi.stubGlobal('crypto', {
  subtle: mockCryptoSubtle,
  getRandomValues: mockGetRandomValues
});

// Mock TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock btoa/atob
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// Mock URL
global.URL = URL;

// Suppress console logs in tests (optional)
// global.console = {
//   ...console,
//   log: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn()
// };

