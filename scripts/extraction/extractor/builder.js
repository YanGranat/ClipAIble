// @ts-check
// Builder for extractor modules
// Generates inlined code for chrome.scripting.executeScript

import * as domUtils from './dom-utils.js';
import * as textUtils from './text-utils.js';
import * as debug from './debug.js';
import * as spa from './spa.js';
import * as translate from './translate.js';
import * as filters from './filters.js';
import * as discover from './discover.js';
import * as metadata from './metadata.js';
import * as images from './images.js';
import * as standfirst from './standfirst.js';
import * as parse from './parse.js';
import * as fallbacks from './fallbacks.js';
import { getInlinedConstantsCode, CONSTANTS } from './constants.js';

/**
 * Convert function to string and remove export keyword
 * @param {Function} fn - Function to convert
 * @returns {string} - Function code string
 */
function functionToString(fn) {
  const fnStr = fn.toString();
  // Remove export keyword and keep function name
  return fnStr.replace(/^export\s+(async\s+)?function\s+/, '$1function ');
}

/**
 * Extract all functions from a module
 * @param {Object} module - Module object
 * @returns {string} - Concatenated function strings
 */
function extractModuleFunctions(module) {
  return Object.entries(module)
    .filter(([name, value]) => typeof value === 'function')
    .map(([name, fn]) => functionToString(fn))
    .join('\n\n');
}

/**
 * Build inlined modules code
 * This generates all helper functions as a single code string
 * @returns {string} - JavaScript code string with all functions
 */
export function buildInlinedModules() {
  // Order matters: dependencies first
  const modules = [
    { name: 'DOM Utils', code: extractModuleFunctions(domUtils) },
    { name: 'Text Utils', code: extractModuleFunctions(textUtils) },
    { name: 'Debug', code: extractModuleFunctions(debug) },
    { name: 'SPA', code: extractModuleFunctions(spa) },
    { name: 'Translate', code: extractModuleFunctions(translate) },
    { name: 'Filters', code: extractModuleFunctions(filters) },
    { name: 'Discover', code: extractModuleFunctions(discover) },
    { name: 'Metadata', code: extractModuleFunctions(metadata) },
    { name: 'Images', code: extractModuleFunctions(images) },
    { name: 'Standfirst', code: extractModuleFunctions(standfirst) },
    { name: 'Parse', code: extractModuleFunctions(parse) },
    { name: 'Fallbacks', code: extractModuleFunctions(fallbacks) }
  ];
  
  let code = '// ============================================\n';
  code += '// INLINED EXTRACTOR MODULES\n';
  code += '// Generated from scripts/extraction/extractor/\n';
  code += '// ============================================\n\n';
  
  for (const module of modules) {
    code += `// --- ${module.name} ---\n`;
    code += module.code;
    code += '\n\n';
  }
  
  return code;
}

/**
 * Build complete inlined function code
 * Includes constants and all helper functions
 * @returns {string} - Complete function code
 */
export function buildCompleteInlinedFunction() {
  const constantsCode = getInlinedConstantsCode();
  const modulesCode = buildInlinedModules();
  
  return `
${constantsCode}

${modulesCode}
`;
}

/**
 * Generate the complete extractAutomaticallyInlined function
 * This can be used to rebuild automatic.js
 * Uses dynamic import for index.js to avoid circular dependency
 * @returns {Promise<string>} - Complete function as string
 */
export async function generateExtractAutomaticallyInlined() {
  const inlinedCode = buildCompleteInlinedFunction();
  
  // Dynamically import index.js to get runExtraction
  // This avoids circular dependency since builder.js is only used at build time
  const indexModule = await import('./index.js');
  const runExtractionCode = functionToString(indexModule.runExtraction);
  
  // Extract the body of runExtraction (remove function signature and closing brace)
  const runExtractionBody = runExtractionCode
    .replace(/^async function runExtraction\([^)]*\)\s*\{/, '')
    .replace(/\}$/, '')
    .trim();
  
  return `// @ts-check
// Automatic content extraction without AI
// Uses heuristics and DOM analysis to extract article content

// Note: This function uses modular helper functions that are inlined at build time
// All modules are in scripts/extraction/extractor/ and are assembled by builder.js
// The function runs in page context via executeScript where imports are not available

/**
 * Inlined automatic extraction function for chrome.scripting.executeScript
 * This runs in the page's main world context
 * 
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @param {boolean} enableDebugInfo - Whether to collect debug information (default: false)
 * @returns {Promise<Object>} Extraction result with content, title, author, publishDate, debugInfo
 */
export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false) {
  // Log extraction start
  try {
    console.log('[ClipAIble] extractAutomaticallyInlined: START', { baseUrl, enableDebugInfo, timestamp: Date.now() });
  } catch (e) {
    // Console might not be available
  }
  
${inlinedCode}

  // Main extraction logic (inlined from runExtraction)
  ${runExtractionBody}
}
`;
}

/**
 * Get version information for the extractor
 * @returns {{version: string, modules: string[]}} - Version info
 */
export function getExtractorVersion() {
  return {
    version: '3.3.1',
    modules: [
      'dom-utils',
      'text-utils',
      'debug',
      'spa',
      'translate',
      'filters',
      'discover',
      'metadata',
      'images',
      'standfirst',
      'parse',
      'fallbacks',
      'index'
    ]
  };
}
