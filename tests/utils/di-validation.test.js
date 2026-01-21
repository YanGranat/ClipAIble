// Unit tests for scripts/utils/di-validation.js

import { describe, it, expect } from 'vitest';
import { validateDeps } from '../../scripts/utils/di-validation.js';

describe('validateDeps', () => {
  it('should pass validation for valid KeepAliveDeps', () => {
    const validDeps = {
      log: () => {},
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000, API_TIMEOUT_MS: 120000 },
      getProcessingState: () => null,
      saveStateToStorageImmediate: () => Promise.resolve()
    };

    expect(() => validateDeps(validDeps, 'KeepAliveDeps', 'test-module')).not.toThrow();
  });

  it('should throw error for missing required property', () => {
    const invalidDeps = {
      log: () => {},
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000, API_TIMEOUT_MS: 120000 },
      getProcessingState: () => null
      // Missing saveStateToStorageImmediate
    };

    expect(() => validateDeps(invalidDeps, 'KeepAliveDeps', 'test-module')).toThrow(
      '[test-module] DI Validation failed for KeepAliveDeps:\nMissing required properties: saveStateToStorageImmediate'
    );
  });

  it('should throw error for invalid deps object', () => {
    expect(() => validateDeps(null, 'KeepAliveDeps', 'test-module')).toThrow(
      '[test-module] Invalid deps: expected object, got object'
    );

    expect(() => validateDeps(undefined, 'KeepAliveDeps', 'test-module')).toThrow(
      '[test-module] Invalid deps: expected object, got undefined'
    );

    expect(() => validateDeps("string", 'KeepAliveDeps', 'test-module')).toThrow(
      '[test-module] Invalid deps: expected object, got string'
    );
  });

  it('should throw error for unknown deps type', () => {
    const validDeps = { log: () => {} };

    expect(() => validateDeps(validDeps, 'UnknownDeps', 'test-module')).toThrow(
      '[test-module] Unknown deps type: UnknownDeps'
    );
  });

  it('should validate function types', () => {
    const invalidDeps = {
      log: "not a function", // Should be function
      logError: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000, API_TIMEOUT_MS: 120000 },
      getProcessingState: () => null,
      saveStateToStorageImmediate: () => Promise.resolve()
    };

    expect(() => validateDeps(invalidDeps, 'KeepAliveDeps', 'test-module')).toThrow(
      'Invalid property types:\n  - log: expected function, got string'
    );
  });

  it('should validate object types', () => {
    const invalidDeps = {
      log: () => {},
      logError: () => {},
      logWarn: () => {},
      CONFIG: "not an object", // Should be object
      getProcessingState: () => null,
      saveStateToStorageImmediate: () => Promise.resolve()
    };

    expect(() => validateDeps(invalidDeps, 'KeepAliveDeps', 'test-module')).toThrow(
      'Invalid property types:\n  - CONFIG: expected object, got string'
    );
  });

  it('should validate OrchestrationDependencies (complex case)', () => {
    const validDeps = {
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
    };

    expect(() => validateDeps(validDeps, 'OrchestrationDependencies', 'test-module')).not.toThrow();
  });

  it('should validate special ERROR_CODES properties', () => {
    const invalidDeps = {
      log: () => {},
      logWarn: () => {},
      CONFIG: { CHUNK_SIZE: 50000 },
      getProcessingState: () => ({}),
      setError: () => {},
      setResult: () => {},
      updateState: () => {},
      ERROR_CODES: {}, // Empty ERROR_CODES
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
    };

    expect(() => validateDeps(invalidDeps, 'OrchestrationDependencies', 'test-module')).toThrow(
      'Invalid property types:\n  - ERROR_CODES: expected non-empty object, got empty object'
    );
  });
});