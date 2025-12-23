// Tests for pipeline helper utilities

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkCancellation,
  updateProgress,
  finalizeProcessing,
  handleProcessingResult,
  handleProcessingError,
  handleTranslation,
  handleAbstractGeneration,
  detectEffectiveLanguage
} from '../../scripts/utils/pipeline-helpers.js';

// Mock dependencies
vi.mock('../../scripts/utils/logging.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock('../../scripts/state/processing.js', () => {
  const mockUpdateState = vi.fn();
  const mockGetProcessingState = vi.fn(() => ({
    result: { title: 'Test' },
    progress: 50
  }));
  const mockIsCancelled = vi.fn(() => false);
  const mockCompleteProcessing = vi.fn();
  const mockSetError = vi.fn();
  
  return {
    isCancelled: () => mockIsCancelled(),
    updateState: mockUpdateState,
    getProcessingState: mockGetProcessingState,
    completeProcessing: mockCompleteProcessing,
    setError: mockSetError,
    PROCESSING_STAGES: {
      STARTING: { id: 'starting' },
      ANALYZING: { id: 'analyzing' },
      EXTRACTING: { id: 'extracting' },
      TRANSLATING: { id: 'translating' },
      GENERATING: { id: 'generating' },
      COMPLETE: { id: 'complete' }
    },
    // Export mocks for use in tests
    __mocks: {
      mockUpdateState,
      mockGetProcessingState,
      mockIsCancelled,
      mockCompleteProcessing,
      mockSetError
    }
  };
});

vi.mock('../../scripts/locales.js', () => ({
  getUILanguage: vi.fn(() => Promise.resolve('en')),
  tSync: vi.fn((key) => {
    const translations = {
      statusCancelled: 'Cancelled',
      statusTranslatingContent: 'Translating content...',
      statusAnalyzingImages: 'Analyzing images...',
      statusTranslatingText: 'Translating text...',
      stageGeneratingAbstract: 'Generating abstract...',
      errorTranslationFailed: 'Translation failed',
      errorAuthFailed: 'Authentication failed'
    };
    return translations[key] || key;
  })
}));

vi.mock('../../scripts/stats/index.js', () => ({
  recordSave: vi.fn(() => Promise.resolve())
}));

vi.mock('../../scripts/utils/error-handler.js', () => ({
  handleError: vi.fn(async (error, options) => ({
    message: error.message,
    userMessage: error.message,
    code: 'test_error',
    userCode: 'test_error'
  }))
}));

vi.mock('../../scripts/translation/index.js', () => ({
  detectContentLanguage: vi.fn(async (content, apiKey, model) => 'ru')
}));

describe('utils/pipeline-helpers', () => {
  let mocks;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    const processingModule = await import('../../scripts/state/processing.js');
    mocks = processingModule.__mocks;
    // Reset mocks to default values
    mocks.mockIsCancelled.mockReturnValue(false);
  });

  describe('checkCancellation', () => {
    it('should not throw if not cancelled', async () => {
      mocks.mockIsCancelled.mockReturnValue(false);
      
      await expect(checkCancellation()).resolves.not.toThrow();
    });

    it('should throw if cancelled', async () => {
      mocks.mockIsCancelled.mockReturnValue(true);
      
      await expect(checkCancellation()).rejects.toThrow('Cancelled');
    });
  });

  describe('updateProgress', () => {
    it('should update progress with localized status', async () => {
      const { PROCESSING_STAGES } = await import('../../scripts/state/processing.js');
      
      await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingMarkdown', 65);
      
      expect(mocks.mockUpdateState).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'generating',
          progress: 65
        })
      );
    });

    it('should support replacements in status', async () => {
      const { PROCESSING_STAGES } = await import('../../scripts/state/processing.js');
      
      await updateProgress(PROCESSING_STAGES.GENERATING, 'statusGeneratingMarkdown', 65, {
        replacements: ['Markdown']
      });
      
      expect(mocks.mockUpdateState).toHaveBeenCalled();
    });
  });

  describe('finalizeProcessing', () => {
    it('should record stats and complete processing', async () => {
      const { recordSave } = await import('../../scripts/stats/index.js');
      
      const stopKeepAlive = vi.fn();
      const processingStartTimeRef = { processingStartTime: Date.now() - 1000 };
      
      await finalizeProcessing(
        { title: 'Test', url: 'https://example.com', outputFormat: 'pdf' },
        stopKeepAlive,
        processingStartTimeRef
      );
      
      expect(recordSave).toHaveBeenCalled();
      expect(mocks.mockCompleteProcessing).toHaveBeenCalledWith(stopKeepAlive);
      expect(processingStartTimeRef.processingStartTime).toBeNull();
    });

    it('should handle missing processingStartTime', async () => {
      const { recordSave } = await import('../../scripts/stats/index.js');
      
      const stopKeepAlive = vi.fn();
      const processingStartTimeRef = { processingStartTime: null };
      
      await finalizeProcessing(
        { title: 'Test', url: 'https://example.com', outputFormat: 'pdf' },
        stopKeepAlive,
        processingStartTimeRef
      );
      
      expect(recordSave).toHaveBeenCalled();
    });
  });

  describe('handleProcessingResult', () => {
    it('should call continuePipeline and finalize', async () => {
      const continuePipeline = vi.fn().mockResolvedValue(undefined);
      const stopKeepAlive = vi.fn();
      const processingStartTimeRef = { processingStartTime: Date.now() };
      
      await handleProcessingResult(
        { outputFormat: 'pdf', url: 'https://example.com' },
        { title: 'Test', content: [] },
        stopKeepAlive,
        processingStartTimeRef,
        continuePipeline
      );
      
      expect(continuePipeline).toHaveBeenCalled();
      // finalizeProcessing is called internally
      const { recordSave } = await import('../../scripts/stats/index.js');
      expect(recordSave).toHaveBeenCalled();
    });
  });

  describe('handleProcessingError', () => {
    it('should normalize error and set error state', async () => {
      mocks.mockIsCancelled.mockReturnValue(false);
      
      const error = new Error('Test error');
      const stopKeepAlive = vi.fn();
      
      await handleProcessingError(
        error,
        { url: 'https://example.com', outputFormat: 'pdf' },
        stopKeepAlive,
        { source: 'test', errorType: 'test_error' }
      );
      
      expect(mocks.mockSetError).toHaveBeenCalled();
    });

    it('should not set error if cancelled', async () => {
      mocks.mockIsCancelled.mockReturnValue(true);
      
      const error = new Error('Test error');
      const stopKeepAlive = vi.fn();
      
      await handleProcessingError(
        error,
        { url: 'https://example.com' },
        stopKeepAlive
      );
      
      expect(mocks.mockSetError).not.toHaveBeenCalled();
    });
  });

  describe('handleTranslation', () => {
    it('should skip translation if language is auto', async () => {
      const { PROCESSING_STAGES } = await import('../../scripts/state/processing.js');
      
      const translateContent = vi.fn();
      const translateImages = vi.fn();
      const detectSourceLanguage = vi.fn(() => 'en');
      
      const result = await handleTranslation(
        { language: 'auto' },
        { content: [] },
        translateContent,
        translateImages,
        detectSourceLanguage,
        mocks.mockUpdateState
      );
      
      expect(translateContent).not.toHaveBeenCalled();
      expect(mocks.mockUpdateState).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'generating', progress: 60 })
      );
    });

    it('should translate content when language is specified', async () => {
      const translateContent = vi.fn().mockResolvedValue({ content: [], title: 'Test' });
      const translateImages = vi.fn();
      const detectSourceLanguage = vi.fn(() => 'en');
      
      const result = await handleTranslation(
        { language: 'ru', apiKey: 'key', model: 'gpt-4' },
        { content: [{ type: 'paragraph', text: 'Text' }] },
        translateContent,
        translateImages,
        detectSourceLanguage,
        mocks.mockUpdateState
      );
      
      expect(translateContent).toHaveBeenCalled();
    });

    it('should translate images if enabled', async () => {
      const translateContent = vi.fn().mockResolvedValue({ content: [], title: 'Test' });
      const translateImages = vi.fn().mockResolvedValue([{ type: 'paragraph', text: 'Text' }]);
      const detectSourceLanguage = vi.fn(() => 'en');
      
      const result = await handleTranslation(
        { 
          language: 'ru', 
          apiKey: 'key', 
          model: 'gpt-4',
          translateImages: true,
          googleApiKey: 'google-key'
        },
        { content: [{ type: 'paragraph', text: 'Text' }] },
        translateContent,
        translateImages,
        detectSourceLanguage,
        mocks.mockUpdateState
      );
      
      expect(translateImages).toHaveBeenCalled();
    });

    it('should handle translation errors gracefully', async () => {
      const translateContent = vi.fn().mockRejectedValue(new Error('Network error'));
      const translateImages = vi.fn();
      const detectSourceLanguage = vi.fn(() => 'en');
      
      const result = await handleTranslation(
        { language: 'ru', apiKey: 'key', model: 'gpt-4' },
        { content: [{ type: 'paragraph', text: 'Text' }] },
        translateContent,
        translateImages,
        detectSourceLanguage,
        mocks.mockUpdateState
      );
      
      // Should continue without translation on error
      expect(result).toBeDefined();
    });
  });

  describe('handleAbstractGeneration', () => {
    it('should skip abstract if not enabled', async () => {
      const generateAbstract = vi.fn();
      
      const result = await handleAbstractGeneration(
        { generateAbstract: false },
        { content: [] },
        generateAbstract,
        mocks.mockUpdateState
      );
      
      expect(generateAbstract).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should skip abstract for audio format', async () => {
      const generateAbstract = vi.fn();
      
      const result = await handleAbstractGeneration(
        { generateAbstract: true, outputFormat: 'audio' },
        { content: [] },
        generateAbstract,
        mocks.mockUpdateState
      );
      
      expect(generateAbstract).not.toHaveBeenCalled();
    });

    it('should generate abstract when enabled', async () => {
      const generateAbstract = vi.fn().mockResolvedValue('Test abstract');
      
      const result = await handleAbstractGeneration(
        { generateAbstract: true, apiKey: 'key', model: 'gpt-4', outputFormat: 'pdf' },
        { content: [{ type: 'paragraph', text: 'Text' }], title: 'Test' },
        generateAbstract,
        mocks.mockUpdateState
      );
      
      expect(generateAbstract).toHaveBeenCalled();
      expect(result).toBe('Test abstract');
    });

    it('should handle abstract generation errors', async () => {
      const generateAbstract = vi.fn().mockRejectedValue(new Error('API error'));
      
      const result = await handleAbstractGeneration(
        { generateAbstract: true, apiKey: 'key', model: 'gpt-4', outputFormat: 'pdf' },
        { content: [{ type: 'paragraph', text: 'Text' }], title: 'Test' },
        generateAbstract,
        mocks.mockUpdateState
      );
      
      // Should return empty string on error
      expect(result).toBe('');
    });
  });

  describe('detectEffectiveLanguage', () => {
    it('should use user-selected language if not auto', async () => {
      const { detectContentLanguage } = await import('../../scripts/translation/index.js');
      
      const result = await detectEffectiveLanguage(
        { language: 'ru' },
        { content: [] },
        detectContentLanguage
      );
      
      expect(result).toBe('ru');
      expect(detectContentLanguage).not.toHaveBeenCalled();
    });

    it('should use detected language from extraction if available', async () => {
      const { detectContentLanguage } = await import('../../scripts/translation/index.js');
      
      const result = await detectEffectiveLanguage(
        { language: 'auto' },
        { content: [], detectedLanguage: 'ru' },
        detectContentLanguage
      );
      
      expect(result).toBe('ru');
      expect(detectContentLanguage).not.toHaveBeenCalled();
    });

    it('should call AI detection if no detected language and API key available', async () => {
      const { detectContentLanguage } = await import('../../scripts/translation/index.js');
      detectContentLanguage.mockResolvedValue('ru');
      
      const result = await detectEffectiveLanguage(
        { language: 'auto', apiKey: 'key', model: 'gpt-4' },
        { content: [{ type: 'paragraph', text: 'Text' }] },
        detectContentLanguage
      );
      
      expect(detectContentLanguage).toHaveBeenCalled();
      expect(result).toBe('ru');
    });

    it('should keep auto if AI detection fails', async () => {
      const { detectContentLanguage } = await import('../../scripts/translation/index.js');
      detectContentLanguage.mockRejectedValue(new Error('API error'));
      
      const result = await detectEffectiveLanguage(
        { language: 'auto', apiKey: 'key', model: 'gpt-4' },
        { content: [{ type: 'paragraph', text: 'Text' }] },
        detectContentLanguage
      );
      
      // Should fallback to 'auto' on error
      expect(result).toBe('auto');
    });

    it('should keep auto if no content or API key', async () => {
      const { detectContentLanguage } = await import('../../scripts/translation/index.js');
      
      const result = await detectEffectiveLanguage(
        { language: 'auto' },
        { content: [] },
        detectContentLanguage
      );
      
      expect(detectContentLanguage).not.toHaveBeenCalled();
      expect(result).toBe('auto');
    });
  });
});

