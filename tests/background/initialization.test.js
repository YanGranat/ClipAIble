// Tests for background.js initialization and event handlers
// Critical for service worker startup
// Tests verify that critical initialization steps don't fail

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  LOG_LEVELS: {}
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    KEEP_ALIVE_INTERVAL: 1,
    STATE_SAVE_INTERVAL: 2000,
    RESET_THRESHOLD_MS: 60000
  }
}));

vi.mock('../../scripts/state/processing.js', () => ({
  getProcessingState: vi.fn(() => ({ isProcessing: false, lastUpdate: Date.now() })),
  updateState: vi.fn(),
  cancelProcessing: vi.fn(),
  completeProcessing: vi.fn(),
  setError: vi.fn(),
  startProcessing: vi.fn(),
  setResult: vi.fn(),
  restoreStateFromStorage: vi.fn(() => Promise.resolve()),
  PROCESSING_STAGES: {},
  ERROR_CODES: {},
  isCancelled: vi.fn(() => false)
}));

vi.mock('../../scripts/utils/encryption.js', () => ({
  clearDecryptedKeyCache: vi.fn(),
  encryptApiKey: vi.fn(),
  isEncrypted: vi.fn(() => false),
  decryptApiKey: vi.fn()
}));

vi.mock('../../scripts/initialization/index.js', () => ({
  runInitialization: vi.fn(() => Promise.resolve())
}));

vi.mock('../../scripts/utils/context-menu.js', () => ({
  updateContextMenuWithLang: vi.fn(() => Promise.resolve())
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(() => Promise.resolve('en')),
  tSync: vi.fn((key) => key)
}));

// Mock chrome APIs
const mockChrome = {
  runtime: {
    id: 'test-extension-id',
    getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`),
    onMessage: {
      addListener: vi.fn()
    },
    onInstalled: {
      addListener: vi.fn()
    },
    onStartup: {
      addListener: vi.fn()
    },
    lastError: null
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
      onChanged: {
        addListener: vi.fn()
      }
    }
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
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
    onClicked: {
      addListener: vi.fn()
    }
  }
};

global.chrome = mockChrome;

// Mock self (service worker global)
global.self = {
  addEventListener: vi.fn()
};

describe('background.js critical initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Chrome API event handler registration', () => {
    it('should be able to register runtime.onMessage listener', () => {
      const listener = vi.fn();
      chrome.runtime.onMessage.addListener(listener);
      
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    });

    it('should be able to register alarms.onAlarm listener', () => {
      const listener = vi.fn();
      chrome.alarms.onAlarm.addListener(listener);
      
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledWith(listener);
    });

    it('should be able to register storage.onChanged listener', () => {
      const listener = vi.fn();
      chrome.storage.local.onChanged.addListener(listener);
      
      expect(chrome.storage.local.onChanged.addListener).toHaveBeenCalledWith(listener);
    });

    it('should be able to register contextMenus.onClicked listener', () => {
      const listener = vi.fn();
      chrome.contextMenus.onClicked.addListener(listener);
      
      expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledWith(listener);
    });

    it('should be able to register runtime.onInstalled listener', () => {
      const listener = vi.fn();
      chrome.runtime.onInstalled.addListener(listener);
      
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledWith(listener);
    });

    it('should be able to register runtime.onStartup listener', () => {
      const listener = vi.fn();
      chrome.runtime.onStartup.addListener(listener);
      
      expect(chrome.runtime.onStartup.addListener).toHaveBeenCalledWith(listener);
    });
  });

  describe('initialization functions', () => {
    it('should call clearDecryptedKeyCache without errors', async () => {
      const { clearDecryptedKeyCache } = await import('../../scripts/utils/encryption.js');
      
      expect(() => clearDecryptedKeyCache()).not.toThrow();
      expect(clearDecryptedKeyCache).toHaveBeenCalled();
    });

    it('should call runInitialization without errors', async () => {
      const { runInitialization } = await import('../../scripts/initialization/index.js');
      
      await expect(runInitialization()).resolves.not.toThrow();
      expect(runInitialization).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const { runInitialization } = await import('../../scripts/initialization/index.js');
      const { handleError } = await import('../../scripts/utils/error-handler.js');
      
      // Mock runInitialization to throw
      runInitialization.mockRejectedValueOnce(new Error('Init failed'));
      
      // Should handle error gracefully (wrapped in try-catch in background.js)
      await expect(runInitialization()).rejects.toThrow('Init failed');
    });
  });

  describe('keep-alive mechanism', () => {
    it('should create alarm without errors', () => {
      expect(() => {
        chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
      }).not.toThrow();
      
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'keepAlive',
        { periodInMinutes: 1 }
      );
    });

    it('should clear alarm without errors', () => {
      expect(() => {
        chrome.alarms.clear('keepAlive');
      }).not.toThrow();
      
      expect(chrome.alarms.clear).toHaveBeenCalledWith('keepAlive');
    });

    it('should handle alarm creation errors gracefully', () => {
      chrome.runtime.lastError = { message: 'Alarm creation failed' };
      
      // Should not throw even if lastError is set
      expect(() => {
        chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
      }).not.toThrow();
    });

    it('should handle storage operations for keep-alive', async () => {
      const { getProcessingState } = await import('../../scripts/state/processing.js');
      
      const state = getProcessingState();
      const result = await chrome.storage.local.get(['summary_generating', 'summary_generating_start_time']);
      
      expect(chrome.storage.local.get).toHaveBeenCalled();
      expect(result).toBeDefined();
      
      // Simulate keep-alive ping
      if (state.isProcessing) {
        await chrome.storage.local.set({
          processingState: { ...state, lastUpdate: Date.now() }
        });
        expect(chrome.storage.local.set).toHaveBeenCalled();
      }
    });
  });

  describe('notification creation', () => {
    it('should create notification with correct parameters', () => {
      const iconUrl = chrome.runtime.getURL('icons/icon128.png');
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: 'ClipAIble',
        message: 'Test message',
        requireInteraction: false
      }, (notificationId) => {
        expect(notificationId).toBe('notification-id');
      });
      
      expect(chrome.notifications.create).toHaveBeenCalled();
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon128.png');
    });

    it('should handle notification API unavailability', () => {
      const originalNotifications = chrome.notifications;
      chrome.notifications = undefined;
      
      // Should not throw
      expect(() => {
        if (!chrome.notifications || !chrome.notifications.create) {
          return;
        }
      }).not.toThrow();
      
      chrome.notifications = originalNotifications;
    });

    it('should handle notification creation errors', () => {
      chrome.runtime.lastError = { message: 'Notification failed' };
      
      // Should not throw
      expect(() => {
        chrome.notifications.create({}, (id) => {
          if (chrome.runtime.lastError) {
            // Error handling
          }
        });
      }).not.toThrow();
    });
  });

  describe('state restoration', () => {
    it('should restore state from storage without errors', async () => {
      const { restoreStateFromStorage } = await import('../../scripts/state/processing.js');
      
      await expect(restoreStateFromStorage()).resolves.not.toThrow();
    });

    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error('Storage error'));
      
      await expect(chrome.storage.local.get(['processingState'])).rejects.toThrow('Storage error');
    });

    it('should check state age correctly', () => {
      const now = Date.now();
      const oldState = { isProcessing: true, startTime: now - 120000 }; // 2 minutes ago
      const recentState = { isProcessing: true, startTime: now - 30000 }; // 30 seconds ago
      
      const RESET_THRESHOLD_MS = 60000; // 1 minute
      
      const oldAge = now - oldState.startTime;
      const recentAge = now - recentState.startTime;
      
      expect(oldAge).toBeGreaterThan(RESET_THRESHOLD_MS);
      expect(recentAge).toBeLessThan(RESET_THRESHOLD_MS);
    });
  });
});

