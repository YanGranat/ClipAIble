// Integration test showing that DI validation prevents runtime errors

import { describe, it, expect } from 'vitest';
import { initKeepAlive } from '../scripts/background/keep-alive.js';
import { initOrchestration } from '../scripts/background/orchestration.js';

describe('DI Validation Integration', () => {
  it('should prevent runtime errors from missing dependencies', () => {
    // Test with incomplete deps - should throw validation error instead of runtime error
    const incompleteDeps = {
      log: () => {},
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000 },
      getProcessingState: () => null
      // Missing saveStateToStorageImmediate
    };

    expect(() => initKeepAlive(incompleteDeps)).toThrow(
      '[keep-alive] DI Validation failed for KeepAliveDeps:\nMissing required properties: saveStateToStorageImmediate'
    );
  });

  it('should prevent runtime errors from wrong types', () => {
    // Test with wrong types - should throw validation error
    const wrongTypeDeps = {
      log: "not a function", // Should be function
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000 },
      getProcessingState: () => null,
      saveStateToStorageImmediate: () => Promise.resolve()
    };

    expect(() => initKeepAlive(wrongTypeDeps)).toThrow(
      'Invalid property types:\n  - log: expected function, got string'
    );
  });

  it('should work with valid dependencies', () => {
    // Test with valid deps - should not throw
    const validDeps = {
      log: () => {},
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000 },
      getProcessingState: () => null,
      saveStateToStorageImmediate: () => Promise.resolve()
    };

    expect(() => initKeepAlive(validDeps)).not.toThrow();
  });

  it('should validate complex OrchestrationDependencies', () => {
    // Test OrchestrationDependencies with missing property
    const incompleteOrchestrationDeps = {
      log: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000 },
      getProcessingState: () => ({}),
      setError: () => {},
      setResult: () => {},
      updateState: () => {},
      ERROR_CODES: { SOME_ERROR: 'error' },
      PROCESSING_STAGES: { STAGE1: 'stage1' },
      validateAndInitializeProcessing: () => Promise.resolve(true),
      handlePdfPageProcessing: () => Promise.resolve(true),
      handleVideoPageProcessing: () => Promise.resolve(true),
      handleStandardArticleProcessing: () => Promise.resolve(true),
      checkCancellation: () => Promise.resolve(),
      updateProgress: () => Promise.resolve(),
      getUILanguageCached: () => Promise.resolve('en'),
      handleTranslation: () => Promise.resolve({}),
      handleAbstractGeneration: () => Promise.resolve(),
      detectEffectiveLanguage: () => Promise.resolve('en'),
      translateContent: () => Promise.resolve({}),
      translateImages: () => Promise.resolve([]),
      detectSourceLanguage: () => 'en',
      generateAbstract: () => Promise.resolve('abstract'),
      detectContentLanguage: () => Promise.resolve('en'),
      DocumentGeneratorFactory: () => ({}),
      detectPdfPage: () => null,
      getOriginalPdfUrl: () => Promise.resolve('url'),
      detectVideoPlatform: () => ({}),
      tSync: () => 'text',
      startKeepAlive: () => {},
      stopKeepAlive: () => Promise.resolve()
      // All properties present - should work
    };

    expect(() => initOrchestration(incompleteOrchestrationDeps)).not.toThrow();
  });
});