// @ts-check
// DI (Dependency Injection) validation utilities
// Critical for preventing runtime errors from missing or invalid dependencies

import { logError } from './logging.js';

/**
 * Validate DI dependencies object against type definition
 * @param {any} deps - Dependencies object to validate
 * @param {string} depsTypeName - Name of the deps type (e.g., 'KeepAliveDeps')
 * @param {string} moduleName - Name of the module for error reporting
 * @throws {Error} If validation fails
 */
export function validateDeps(deps, depsTypeName, moduleName) {
  // CRITICAL: First check if deps exists and is an object
  if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
    const error = new Error(`[${moduleName}] Invalid deps: expected object, got ${typeof deps}`);
    logError(`DI Validation failed for ${moduleName}`, {
      depsType: depsTypeName,
      receivedType: typeof deps,
      isArray: Array.isArray(deps),
      isNull: deps === null,
      module: moduleName
    });
    throw error;
  }

  // Get the type definition from types.js
  // This is a runtime mapping of type names to their property definitions
  const typeDefinitions = getDepsTypeDefinitions();
  const typeDef = typeDefinitions[depsTypeName];

  if (!typeDef) {
    const error = new Error(`[${moduleName}] Unknown deps type: ${depsTypeName}`);
    logError(`DI Validation failed: unknown type ${depsTypeName}`, {
      depsTypeName,
      module: moduleName,
      availableTypes: Object.keys(typeDefinitions)
    });
    throw error;
  }

  // Validate each required property
  const missingProps = [];
  const invalidTypeProps = [];

  for (const [propName, propDef] of Object.entries(typeDef)) {
    // Check if property exists
    if (!(propName in deps)) {
      missingProps.push(propName);
      continue;
    }

    const propValue = deps[propName];

    // Validate type if specified
    if (propDef.expectedType) {
      const isValidType = validatePropertyType(propValue, propDef.expectedType);
      if (!isValidType) {
        invalidTypeProps.push({
          prop: propName,
          expected: propDef.expectedType,
          received: typeof propValue
        });
      }
    }

    // Additional validations based on property name
    validateSpecialCases(propName, propValue, invalidTypeProps, moduleName);
  }

  // Report all errors at once for better debugging
  if (missingProps.length > 0 || invalidTypeProps.length > 0) {
    const errorMsg = buildValidationErrorMessage(moduleName, depsTypeName, missingProps, invalidTypeProps);
    const error = new Error(errorMsg);

    logError(`DI Validation failed for ${moduleName}`, {
      depsType: depsTypeName,
      missingProps,
      invalidTypeProps: invalidTypeProps.map(p => `${p.prop}: expected ${p.expected}, got ${p.received}`),
      module: moduleName
    });

    throw error;
  }
}

/**
 * Get type definitions for all deps types
 * This maps JSDoc typedef names to their property definitions
 * @returns {Object<string, Object<string, {expectedType?: string, description?: string}>>}
 */
function getDepsTypeDefinitions() {
  return {
    LoggingDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logError: { expectedType: 'function', description: 'Error logging function' },
      CONFIG: { expectedType: 'object', description: 'Configuration object' }
    },

    KeepAliveDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logError: { expectedType: 'function', description: 'Error logging function' },
      logWarn: { expectedType: 'function', description: 'Warning logging function' },
      CONFIG: { expectedType: 'object', description: 'Configuration object' },
      getProcessingState: { expectedType: 'function', description: 'Get processing state function' },
      saveStateToStorageImmediate: { expectedType: 'function', description: 'Save state to storage function' }
    },

    ContextMenuDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logError: { expectedType: 'function', description: 'Error logging function' },
      logWarn: { expectedType: 'function', description: 'Warning logging function' },
      logDebug: { expectedType: 'function', description: 'Debug logging function' },
      CONFIG: { expectedType: 'object', description: 'Configuration object' },
      handleError: { expectedType: 'function', description: 'Error handler function' },
      getUILanguage: { expectedType: 'function', description: 'Get UI language function' },
      updateContextMenuWithLang: { expectedType: 'function', description: 'Update context menu with language function' },
      handleQuickSave: { expectedType: 'function', description: 'Handle quick save function' }
    },

    PortListenerDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logError: { expectedType: 'function', description: 'Error logging function' },
      addLogToCollection: { expectedType: 'function', description: 'Add log to collection function' }
    },

    MessageHandlerDeps: {
      startArticleProcessing: { expectedType: 'function', description: 'Start article processing function' },
      processWithSelectorMode: { expectedType: 'function', description: 'Process with selector mode function' },
      processWithExtractMode: { expectedType: 'function', description: 'Process with extract mode function' },
      processWithoutAI: { expectedType: 'function', description: 'Process without AI function' },
      stopKeepAlive: { expectedType: 'function', description: 'Stop keep-alive function' },
      startKeepAlive: { expectedType: 'function', description: 'Start keep-alive function' },
      addLogToCollection: { expectedType: 'function', description: 'Add log to collection function' },
      exportAllLogsToFile: { expectedType: 'function', description: 'Export all logs to file function' }
    },

    NotificationsDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logError: { expectedType: 'function', description: 'Error logging function' },
      logWarn: { expectedType: 'function', description: 'Warning logging function' },
      getUILanguage: { expectedType: 'function', description: 'Get UI language function' },
      tSync: { expectedType: 'function', description: 'Synchronous translation function' }
    },

    InitializationDeps: {
      log: { expectedType: 'function', description: 'Log function' },
      logWarn: { expectedType: 'function', description: 'Warning logging function' },
      CONFIG: { expectedType: 'object', description: 'Configuration object' },
      handleError: { expectedType: 'function', description: 'Error handler function' },
      clearDecryptedKeyCache: { expectedType: 'function', description: 'Clear decrypted key cache function' },
      getProcessingState: { expectedType: 'function', description: 'Get processing state function' },
      restoreStateFromStorage: { expectedType: 'function', description: 'Restore state from storage function' },
      runInitialization: { expectedType: 'function', description: 'Run initialization tasks function' },
      startKeepAlive: { expectedType: 'function', description: 'Start keep-alive function' }
    },

    OrchestrationDependencies: {
      log: { expectedType: 'function', description: 'Log function' },
      logWarn: { expectedType: 'function', description: 'Warning logging function' },
      CONFIG: { expectedType: 'object', description: 'Configuration object' },
      getProcessingState: { expectedType: 'function', description: 'Get processing state function' },
      setError: { expectedType: 'function', description: 'Set error function' },
      setResult: { expectedType: 'function', description: 'Set result function' },
      updateState: { expectedType: 'function', description: 'Update state function' },
      ERROR_CODES: { expectedType: 'object', description: 'Error codes object' },
      PROCESSING_STAGES: { expectedType: 'object', description: 'Processing stages object' },
      validateAndInitializeProcessing: { expectedType: 'function', description: 'Validate and initialize processing function' },
      handlePdfPageProcessing: { expectedType: 'function', description: 'Handle PDF page processing function' },
      handleVideoPageProcessing: { expectedType: 'function', description: 'Handle video page processing function' },
      handleStandardArticleProcessing: { expectedType: 'function', description: 'Handle standard article processing function' },
      checkCancellation: { expectedType: 'function', description: 'Check cancellation function' },
      updateProgress: { expectedType: 'function', description: 'Update progress function' },
      getUILanguageCached: { expectedType: 'function', description: 'Get UI language cached function' },
      handleTranslation: { expectedType: 'function', description: 'Handle translation function' },
      handleAbstractGeneration: { expectedType: 'function', description: 'Handle abstract generation function' },
      detectEffectiveLanguage: { expectedType: 'function', description: 'Detect effective language function' },
      translateContent: { expectedType: 'function', description: 'Translate content function' },
      translateImages: { expectedType: 'function', description: 'Translate images function' },
      detectSourceLanguage: { expectedType: 'function', description: 'Detect source language function' },
      generateAbstract: { expectedType: 'function', description: 'Generate abstract function' },
      detectContentLanguage: { expectedType: 'function', description: 'Detect content language function' },
      DocumentGeneratorFactory: { expectedType: 'function', description: 'Document generator factory class' },
      detectPdfPage: { expectedType: 'function', description: 'Detect PDF page function' },
      getOriginalPdfUrl: { expectedType: 'function', description: 'Get original PDF URL function' },
      detectVideoPlatform: { expectedType: 'function', description: 'Detect video platform function' },
      tSync: { expectedType: 'function', description: 'Synchronous translation function' },
      startKeepAlive: { expectedType: 'function', description: 'Start keep-alive function' },
      stopKeepAlive: { expectedType: 'function', description: 'Stop keep-alive function' }
    }
  };
}

/**
 * Validate property type
 * @param {any} value - Value to check
 * @param {string} expectedType - Expected type
 * @returns {boolean} True if type is valid
 */
function validatePropertyType(value, expectedType) {
  switch (expectedType) {
    case 'function':
      return typeof value === 'function';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      // For complex types like arrays, just check if not undefined/null
      return value != null;
  }
}

/**
 * Validate special cases for certain properties
 * @param {string} propName - Property name
 * @param {any} propValue - Property value
 * @param {Array} invalidTypeProps - Array to add invalid properties to
 * @param {string} moduleName - Module name for error reporting
 */
function validateSpecialCases(propName, propValue, invalidTypeProps, moduleName) {
  // Special validation for ERROR_CODES - should be object with error definitions
  if (propName === 'ERROR_CODES' && typeof propValue === 'object') {
    if (Object.keys(propValue).length === 0) {
      invalidTypeProps.push({
        prop: 'ERROR_CODES',
        expected: 'non-empty object',
        received: 'empty object'
      });
    }
  }

  // Special validation for PROCESSING_STAGES - should be object with stage definitions
  if (propName === 'PROCESSING_STAGES' && typeof propValue === 'object') {
    if (Object.keys(propValue).length === 0) {
      invalidTypeProps.push({
        prop: 'PROCESSING_STAGES',
        expected: 'non-empty object',
        received: 'empty object'
      });
    }
  }
}

/**
 * Build comprehensive validation error message
 * @param {string} moduleName - Module name
 * @param {string} depsTypeName - Type name
 * @param {Array<string>} missingProps - Missing properties
 * @param {Array<Object>} invalidTypeProps - Invalid type properties
 * @returns {string} Error message
 */
function buildValidationErrorMessage(moduleName, depsTypeName, missingProps, invalidTypeProps) {
  let message = `[${moduleName}] DI Validation failed for ${depsTypeName}:\n`;

  if (missingProps.length > 0) {
    message += `Missing required properties: ${missingProps.join(', ')}\n`;
  }

  if (invalidTypeProps.length > 0) {
    message += 'Invalid property types:\n';
    for (const prop of invalidTypeProps) {
      message += `  - ${prop.prop}: expected ${prop.expected}, got ${prop.received}\n`;
    }
  }

  message += '\nThis indicates a dependency injection configuration error.';
  message += '\nCheck that all required dependencies are properly passed to the init function.';

  return message;
}