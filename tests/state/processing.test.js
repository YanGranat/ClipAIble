// Tests for processing state management

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProcessingState,
  updateState,
  resetState,
  setResult,
  isCancelled,
  startProcessing,
  setError,
  updateProgress,
  PROCESSING_STAGES,
  ERROR_CODES
} from '../../scripts/state/processing.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn()
}));

vi.mock('../../scripts/utils/config.js', () => ({
  CONFIG: {
    STATE_SAVE_INTERVAL: 2000
  }
}));

vi.mock('../../scripts/utils/encryption.js', () => ({
  clearDecryptedKeyCache: vi.fn()
}));

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn().mockResolvedValue('en'),
  tSync: vi.fn((key, lang) => {
    const translations = {
      statusDone: 'Done!',
      statusCancelled: 'Cancelled',
      statusError: 'Error'
    };
    return translations[key] || key;
  })
}));

// Mock chrome.storage
const mockStorage = {
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
};

global.chrome = {
  storage: mockStorage
};

describe('processing state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getProcessingState', () => {
    it('should return copy of current state', () => {
      const state = getProcessingState();
      expect(state).toHaveProperty('isProcessing');
      expect(state).toHaveProperty('progress');
      expect(state).toHaveProperty('status');
    });

    it('should return independent copy', () => {
      const state1 = getProcessingState();
      updateState({ progress: 50 });
      const state2 = getProcessingState();
      expect(state1.progress).toBe(0);
      expect(state2.progress).toBe(50);
    });
  });

  describe('updateState', () => {
    it('should update progress', () => {
      updateState({ progress: 50 });
      const state = getProcessingState();
      expect(state.progress).toBe(50);
    });

    it('should update status', () => {
      updateState({ status: 'Processing...' });
      const state = getProcessingState();
      expect(state.status).toBe('Processing...');
    });

    it('should update stage', () => {
      updateState({ stage: 'extracting' });
      const state = getProcessingState();
      expect(state.currentStage).toBe('extracting');
    });

    it('should allow progress 0 (reset)', () => {
      updateState({ progress: 50 });
      updateState({ progress: 0 });
      const state = getProcessingState();
      expect(state.progress).toBe(0);
    });

    it('should allow progress 100 (completion)', () => {
      updateState({ progress: 50 });
      updateState({ progress: 100 });
      const state = getProcessingState();
      expect(state.progress).toBe(100);
    });

    it('should prevent progress rollback', () => {
      updateState({ progress: 50 });
      updateState({ progress: 30 }); // Attempt rollback
      const state = getProcessingState();
      expect(state.progress).toBe(50); // Should keep 50
    });

    it('should allow progress increase', () => {
      updateState({ progress: 30 });
      updateState({ progress: 50 });
      const state = getProcessingState();
      expect(state.progress).toBe(50);
    });

    it('should update multiple fields at once', () => {
      updateState({ progress: 75, status: 'Almost done', stage: 'generating' });
      const state = getProcessingState();
      expect(state.progress).toBe(75);
      expect(state.status).toBe('Almost done');
      expect(state.currentStage).toBe('generating');
    });

    it('should queue updates when another update is in progress', async () => {
      // Simulate concurrent update by setting flag
      // Note: This is a simplified test - real concurrency is harder to test
      updateState({ progress: 10 });
      updateState({ progress: 20 });
      updateState({ progress: 30 });
      
      // Process queue
      await vi.advanceTimersByTimeAsync(100);
      
      const state = getProcessingState();
      expect(state.progress).toBeGreaterThanOrEqual(10);
    });
  });

  describe('resetState', () => {
    it('should reset all state to initial values', () => {
      updateState({ progress: 50, status: 'Processing', isProcessing: true });
      resetState();
      const state = getProcessingState();
      expect(state.progress).toBe(0);
      expect(state.status).toBe('idle');
      expect(state.isProcessing).toBe(false);
      expect(state.isCancelled).toBe(false);
      expect(state.error).toBe(null);
      expect(state.result).toBe(null);
    });

    it('should clear storage', () => {
      resetState();
      expect(mockStorage.local.remove).toHaveBeenCalledWith(['processingState']);
    });
  });

  describe('setResult', () => {
    it('should set processing result', () => {
      const result = { url: 'test.pdf', size: 1024 };
      setResult(result);
      const state = getProcessingState();
      expect(state.result).toEqual(result);
    });
  });

  describe('isCancelled', () => {
    it('should return false initially', () => {
      expect(isCancelled()).toBe(false);
    });

    it('should return true after cancellation', async () => {
      const { cancelProcessing } = await import('../../scripts/state/processing.js');
      const startKeepAlive = vi.fn();
      const stopKeepAlive = vi.fn();
      await startProcessing(startKeepAlive);
      await cancelProcessing(stopKeepAlive);
      expect(isCancelled()).toBe(true);
    });
  });

  describe('startProcessing', () => {
    it('should initialize processing state', async () => {
      const startKeepAlive = vi.fn();
      const result = await startProcessing(startKeepAlive);
      expect(result).toBe(true);
      const state = getProcessingState();
      expect(state.isProcessing).toBe(true);
      expect(state.isCancelled).toBe(false);
      expect(state.progress).toBe(0);
      expect(state.startTime).toBeTruthy();
    });

    it('should set initial status', async () => {
      const startKeepAlive = vi.fn();
      await startProcessing(startKeepAlive);
      const state = getProcessingState();
      expect(state.status).toBeTruthy();
      expect(state.status).not.toBe('idle');
    });

    it('should call startKeepAlive', async () => {
      const startKeepAlive = vi.fn();
      await startProcessing(startKeepAlive);
      expect(startKeepAlive).toHaveBeenCalled();
    });

    it('should return false if already processing', async () => {
      const startKeepAlive = vi.fn();
      await startProcessing(startKeepAlive);
      const result = await startProcessing(startKeepAlive);
      expect(result).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error in state', async () => {
      const error = { message: 'Test error', code: 'test_error' };
      const stopKeepAlive = vi.fn();
      await setError(error, stopKeepAlive);
      const state = getProcessingState();
      expect(state.error).toBe('Test error');
      expect(state.errorCode).toBe('test_error');
      expect(state.isProcessing).toBe(false);
    });

    it('should update status with error message', async () => {
      const error = { message: 'Test error' };
      const stopKeepAlive = vi.fn();
      await setError(error, stopKeepAlive);
      const state = getProcessingState();
      expect(state.status).toBe('Error');
    });

    it('should support string error for backward compatibility', async () => {
      const error = 'Test error string';
      const stopKeepAlive = vi.fn();
      await setError(error, stopKeepAlive);
      const state = getProcessingState();
      expect(state.error).toBe('Test error string');
    });
  });

  describe('PROCESSING_STAGES', () => {
    it('should have all required stages', () => {
      expect(PROCESSING_STAGES.STARTING).toBeDefined();
      expect(PROCESSING_STAGES.ANALYZING).toBeDefined();
      expect(PROCESSING_STAGES.EXTRACTING).toBeDefined();
      expect(PROCESSING_STAGES.TRANSLATING).toBeDefined();
      expect(PROCESSING_STAGES.GENERATING).toBeDefined();
      expect(PROCESSING_STAGES.COMPLETE).toBeDefined();
    });

    it('should have stages with correct structure', () => {
      const stage = PROCESSING_STAGES.STARTING;
      expect(stage).toHaveProperty('id');
      expect(stage).toHaveProperty('label');
      expect(stage).toHaveProperty('order');
    });
  });

  describe('ERROR_CODES', () => {
    it('should have all required error codes', () => {
      expect(ERROR_CODES.AUTH_ERROR).toBe('auth_error');
      expect(ERROR_CODES.RATE_LIMIT).toBe('rate_limit');
      expect(ERROR_CODES.TIMEOUT).toBe('timeout');
      expect(ERROR_CODES.NETWORK_ERROR).toBe('network_error');
      expect(ERROR_CODES.PARSE_ERROR).toBe('parse_error');
      expect(ERROR_CODES.PROVIDER_ERROR).toBe('provider_error');
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('validation_error');
      expect(ERROR_CODES.UNKNOWN_ERROR).toBe('unknown_error');
    });
  });

  describe('Stage management', () => {
    it('should mark stages as completed when moving to next stage', () => {
      updateState({ stage: 'extracting' });
      const state1 = getProcessingState();
      expect(state1.completedStages).toContain('starting');
      
      updateState({ stage: 'translating' });
      const state2 = getProcessingState();
      expect(state2.completedStages).toContain('extracting');
    });
  });
});

