// Tests for background.js message handlers
// Critical for service worker communication

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  LOG_LEVELS: {}
}));

vi.mock('../../scripts/state/processing.js', () => ({
  updateState: vi.fn(),
  getProcessingState: vi.fn(() => ({ isProcessing: false })),
  cancelProcessing: vi.fn(),
  isCancelled: vi.fn(() => false),
  isValidProcessingRunId: (value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
}));

// Mock all handler modules
vi.mock('../../scripts/message-handlers/simple.js', () => ({
  handleLog: vi.fn(() => true),
  handleLogError: vi.fn(() => true),
  handlePing: vi.fn(() => true),
  handleGetState: vi.fn(() => true),
  handleCancelProcessing: vi.fn(() => true)
}));

vi.mock('../../scripts/message-handlers/stats.js', () => ({
  handleGetStats: vi.fn(() => true),
  handleClearStats: vi.fn(() => true),
  handleDeleteHistoryItem: vi.fn(() => true)
}));

vi.mock('../../scripts/message-handlers/cache.js', () => ({
  handleGetCacheStats: vi.fn(() => true),
  handleClearSelectorCache: vi.fn(() => true),
  handleDeleteDomainFromCache: vi.fn(() => true)
}));

vi.mock('../../scripts/message-handlers/settings.js', () => ({
  handleExportSettings: vi.fn(() => Promise.resolve(true)),
  handleImportSettings: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../scripts/message-handlers/processing.js', () => ({
  handleProcessArticle: vi.fn(() => Promise.resolve(true)),
  handleGeneratePdfDebugger: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../scripts/message-handlers/video.js', () => ({
  handleExtractYouTubeSubtitlesForSummary: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../scripts/message-handlers/complex.js', () => ({
  handleExtractContentOnly: vi.fn(() => Promise.resolve(true)),
  handleGenerateSummary: vi.fn(() => Promise.resolve(true))
}));

import { routeMessage } from '../../scripts/message-handlers/index.js';
import * as simpleHandlers from '../../scripts/message-handlers/simple.js';
import * as statsHandlers from '../../scripts/message-handlers/stats.js';
import * as cacheHandlers from '../../scripts/message-handlers/cache.js';
import * as settingsHandlers from '../../scripts/message-handlers/settings.js';
import * as processingHandlers from '../../scripts/message-handlers/processing.js';
import * as complexHandlers from '../../scripts/message-handlers/complex.js';

describe('background.js message handlers', () => {
  const mockSender = {
    tab: { id: 1, url: 'https://example.com' },
    url: 'chrome-extension://test-extension-id/popup.html',
    id: 'test-extension-id'
  };

  const mockDeps = {
    startArticleProcessing: vi.fn(),
    processWithSelectorMode: vi.fn(),
    processWithExtractMode: vi.fn(),
    processWithoutAI: vi.fn(),
    stopKeepAlive: vi.fn(),
    startKeepAlive: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('routeMessage', () => {
    it.each(['clearStats', 'clearSelectorCache', 'cancelProcessing', 'getState', 'exportLogs'])('rejects %s from a content-script sender', action => {
      const respond = vi.fn();
      routeMessage({ action }, { id: 'test-extension-id', tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=sample' }, respond, mockDeps);
      expect(respond).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
      expect(simpleHandlers.handleCancelProcessing).not.toHaveBeenCalled();
      expect(simpleHandlers.handleGetState).not.toHaveBeenCalled();
    });

    it('keeps the response channel open until startup recovery finishes', async () => {
      let releaseStartup;
      const initializationReady = new Promise((resolve) => { releaseStartup = resolve; });
      const respond = vi.fn();
      simpleHandlers.handlePing.mockImplementationOnce((_request, _sender, sendResponse) => {
        sendResponse({ pong: true });
        return true;
      });
      expect(routeMessage({ action: 'ping' }, mockSender, respond, { ...mockDeps, ensureInitialization: () => initializationReady })).toBe(true);
      expect(simpleHandlers.handlePing).not.toHaveBeenCalled();
      expect(respond).not.toHaveBeenCalled();
      releaseStartup();
      await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
      expect(respond).toHaveBeenCalledWith({ pong: true });
      expect(simpleHandlers.handlePing).toHaveBeenCalledTimes(1);
    });

    it('rejects commands when startup recovery fails', async () => {
      const respond = vi.fn();
      expect(routeMessage({ action: 'ping' }, mockSender, respond, {
        ...mockDeps, ensureInitialization: () => Promise.reject(new Error('Storage unavailable'))
      })).toBe(true);
      await vi.waitFor(() => expect(respond).toHaveBeenCalledOnce());
      expect(simpleHandlers.handlePing).not.toHaveBeenCalled();
      expect(respond).toHaveBeenCalledWith(expect.objectContaining({ success: false, translationKey: 'errorBackgroundInitializationFailed', translationParams: {} }));
    });

    it('passes offscreen transport through while startup recovery is pending', () => {
      const respond = vi.fn();
      expect(routeMessage({ target: 'offscreen', type: 'PING' }, mockSender, respond, {
        ...mockDeps, ensureInitialization: () => new Promise(() => {})
      })).toBe(false);
      expect(respond).not.toHaveBeenCalled();
    });

    it.each([
      { target: 'pdf-progress', type: 'PDF_PROGRESS' },
      { action: 'youtubeSubtitlesResult', requestId: 'sample-request', result: {} }
    ])('leaves operation replies to their scoped listeners', request => {
      const respond = vi.fn(), ensureInitialization = vi.fn();
      expect(routeMessage(request, mockSender, respond, { ...mockDeps, ensureInitialization })).toBe(false);
      expect(respond).not.toHaveBeenCalled();
      expect(ensureInitialization).not.toHaveBeenCalled();
    });

    it.each(['logModelDropdown', 'exportLogs', 'closeOffscreenForVoiceSwitch'])('rejects retired action %s', action => {
      const respond = vi.fn(), ensureInitialization = vi.fn();
      routeMessage({ action }, mockSender, respond, { ...mockDeps, ensureInitialization });
      expect(respond).toHaveBeenCalledWith({ success: false, error: 'Invalid message structure' });
      expect(ensureInitialization).not.toHaveBeenCalled();
    });

    it.each([['getState', false], ['processArticle', true]])('uses the current startup gate for %s', async (action, retry) => {
      const ensureInitialization = vi.fn(async () => {});
      routeMessage({ action, data: {} }, mockSender, vi.fn(), { ...mockDeps, ensureInitialization });
      await vi.waitFor(() => expect(ensureInitialization).toHaveBeenCalledWith(retry));
    });

    it('does not retry startup for an untrusted command', () => {
      const ensureInitialization = vi.fn();
      routeMessage({ action: 'processArticle', data: {} }, { id: 'other-extension', url: 'chrome-extension://other-extension/page.html' }, vi.fn(), { ...mockDeps, ensureInitialization });
      expect(ensureInitialization).not.toHaveBeenCalled();
    });

    it('should pass through offscreen messages', () => {
      const request = { action: 'test', target: 'offscreen' };
      const sendResponse = vi.fn();
      
      const result = routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should handle ping message', () => {
      const request = { action: 'ping' };
      const sendResponse = vi.fn();
      
      routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(simpleHandlers.handlePing).toHaveBeenCalled();
    });

    it('should handle getState message', () => {
      const request = { action: 'getState' };
      const sendResponse = vi.fn();
      
      routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(simpleHandlers.handleGetState).toHaveBeenCalled();
    });

    it('should handle cancelProcessing message', () => {
      const request = { action: 'cancelProcessing' };
      const sendResponse = vi.fn();
      
      routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(simpleHandlers.handleCancelProcessing).toHaveBeenCalled();
    });

    it('should handle getStats message', () => {
      const request = { action: 'getStats' };
      const sendResponse = vi.fn();
      
      routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(statsHandlers.handleGetStats).toHaveBeenCalled();
    });

    it('should handle getCacheStats message', () => {
      const request = { action: 'getCacheStats' };
      const sendResponse = vi.fn();
      
      routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(cacheHandlers.handleGetCacheStats).toHaveBeenCalled();
    });

    it.each([
      ['exportSettings', settingsHandlers.handleExportSettings, []],
      ['processArticle', processingHandlers.handleProcessArticle, ['startArticleProcessing', 'stopKeepAlive']],
      ['extractContentOnly', complexHandlers.handleExtractContentOnly, ['processWithSelectorMode', 'processWithExtractMode', 'processWithoutAI', 'startKeepAlive', 'stopKeepAlive']],
      ['generateSummary', complexHandlers.handleGenerateSummary, ['startKeepAlive', 'stopKeepAlive']]
    ])('dispatches %s with the captured request, dependencies and one response', (action, handler, dependencyNames) => {
      const request = { action, data: {} };
      const response = { success: true, result: action };
      const sendResponse = vi.fn();
      handler.mockImplementationOnce((_request, _sender, respond) => { respond(response); return true; });
      expect(routeMessage(request, mockSender, sendResponse, mockDeps)).toBe(true);
      expect(handler).toHaveBeenCalledExactlyOnceWith(request, mockSender, expect.any(Function), ...dependencyNames.map(name => mockDeps[name]));
      expect(sendResponse).toHaveBeenCalledExactlyOnceWith(response);
    });

    it.each([
      {},
      { id: 'test-extension-id', tab: { id: 1 } },
      { id: 'other-extension', url: 'chrome-extension://test-extension-id/popup.html' },
      { id: 'test-extension-id', url: 'chrome-extension://test-extension-id.example/popup.html' },
      { id: 'test-extension-id', url: 'file:///example.html', tab: { id: 1 } }
    ])('rejects privileged dispatch from untrusted sender %#', sender => {
      const respond = vi.fn();
      routeMessage({ action: 'exportSettings' }, sender, respond, mockDeps);
      expect(settingsHandlers.handleExportSettings).not.toHaveBeenCalled();
      expect(respond).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error: expect.any(String) }));
    });

    it('should handle unknown action gracefully', () => {
      const request = { action: 'unknownAction' };
      const sendResponse = vi.fn();
      
      // Should not throw
      expect(() => {
        routeMessage(request, mockSender, sendResponse, mockDeps);
      }).not.toThrow();
    });

    it('should handle missing sender tab gracefully', () => {
      const request = { action: 'ping' };
      const sendResponse = vi.fn();
      const sender = { url: 'https://example.com' }; // No tab property
      
      // Should not throw
      expect(() => {
        routeMessage(request, sender, sendResponse, mockDeps);
      }).not.toThrow();
    });

    it('should handle missing sendResponse gracefully', () => {
      const request = { action: 'ping' };
      const sendResponse = null;
      
      // Should not throw
      expect(() => {
        routeMessage(request, mockSender, sendResponse, mockDeps);
      }).not.toThrow();
    });
  });

  describe('message handler error handling', () => {
    it('should handle handler errors gracefully', () => {
      vi.mocked(simpleHandlers.handlePing).mockImplementationOnce(() => {
        throw new Error('Handler error');
      });
      
      const request = { action: 'ping' };
      const sendResponse = vi.fn();
      
      // Should not throw (errors are caught in routeMessage)
      expect(() => {
        routeMessage(request, mockSender, sendResponse, mockDeps);
      }).not.toThrow();
    });

    it('should handle async handler errors gracefully', async () => {
      vi.mocked(processingHandlers.handleProcessArticle).mockRejectedValueOnce(new Error('Async handler error'));
      
      const request = { action: 'processArticle', data: {} };
      const sendResponse = vi.fn();
      
      // Should handle error gracefully - routeMessage catches errors and returns true
      expect(() => {
        routeMessage(request, mockSender, sendResponse, mockDeps);
      }).not.toThrow();
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ error: 'Async handler error' }));
    });
  });
});

