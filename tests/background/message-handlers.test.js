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
  isCancelled: vi.fn(() => false)
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
  handleYoutubeSubtitlesResult: vi.fn(() => true),
  handleExtractYouTubeSubtitlesForSummary: vi.fn(() => Promise.resolve(true))
}));

vi.mock('../../scripts/message-handlers/complex.js', () => ({
  handleExtractContentOnly: vi.fn(() => Promise.resolve(true)),
  handleGenerateSummary: vi.fn(() => Promise.resolve(true)),
  handleLogModelDropdown: vi.fn(() => true)
}));

vi.mock('../../scripts/api/offline-tts-offscreen.js', () => ({
  closeOffscreenForVoiceSwitch: vi.fn(() => Promise.resolve())
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
    url: 'https://example.com'
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

    it('should handle exportSettings message', async () => {
      const request = { action: 'exportSettings' };
      const sendResponse = vi.fn();
      
      const result = await routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(settingsHandlers.handleExportSettings).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle processArticle message', async () => {
      const request = { action: 'processArticle', data: {} };
      const sendResponse = vi.fn();
      
      const result = await routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(processingHandlers.handleProcessArticle).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle extractContentOnly message', async () => {
      const request = { action: 'extractContentOnly', data: {} };
      const sendResponse = vi.fn();
      
      const result = await routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(complexHandlers.handleExtractContentOnly).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle generateSummary message', async () => {
      const request = { action: 'generateSummary', data: {} };
      const sendResponse = vi.fn();
      
      const result = await routeMessage(request, mockSender, sendResponse, mockDeps);
      
      expect(complexHandlers.handleGenerateSummary).toHaveBeenCalled();
      expect(result).toBe(true);
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
      
      // Should handle rejection
      await expect(routeMessage(request, mockSender, sendResponse, mockDeps)).rejects.toThrow('Async handler error');
    });
  });
});

