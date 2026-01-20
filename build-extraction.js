// @ts-check
// build-extraction.js
// Build script to inline extraction modules into extractAutomaticallyInlined function
// This generates a single inlined function that can be used with chrome.scripting.executeScript

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} BuildConfig
 * @property {string} builderPath - Path to the builder module
 * @property {string} outputPath - Path for generated output
 * @property {string} automaticJsPath - Path to automatic.js to update
 */

/** @type {BuildConfig} */
const CONFIG = {
  builderPath: 'scripts/extraction/extractor/builder.js',
  outputPath: 'dist/extraction-automatic-generated.js',
  automaticJsPath: 'scripts/extraction/automatic.js'
};

/**
 * Main build function
 */
async function build() {
  try {
    console.log('🔨 Building extraction inlined function...');
    console.log('   Using new modular extractor structure');
    
    const outdir = 'dist';
    const builderBundlePath = path.join(__dirname, outdir, 'extractor-builder-bundle.js');
    
    // Ensure the output directory exists
    await fs.mkdir(outdir, { recursive: true });
    
    // CRITICAL: Delete old builder bundle to prevent caching issues
    try {
      await fs.unlink(builderBundlePath);
      console.log('🗑️  Cleared old builder bundle cache');
    } catch (e) {
      // File doesn't exist, that's fine
    }
    
    // Step 1: Bundle the new extractor builder module and its dependencies
    console.log('📦 Bundling extractor builder module...');
    await esbuild.build({
      entryPoints: [CONFIG.builderPath],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node18',
      outfile: builderBundlePath,
      external: [],
      resolveExtensions: ['.js', '.mjs', '.ts', '.json'],
      mainFields: ['module', 'main'],
    });
    
    // Step 2: Import the bundled builder and generate inlined code
    // CRITICAL: Add timestamp to bust Node.js module cache
    console.log('🔧 Generating inlined function code...');
    const cacheBuster = `?t=${Date.now()}`;
    const builderModule = await import(`file://${builderBundlePath}${cacheBuster}`);
    
    // Check if we have the new generateExtractAutomaticallyInlined function
    if (typeof builderModule.generateExtractAutomaticallyInlined === 'function') {
      // Use the new full generation approach
      console.log('   Using full function generation (new approach)');
      
      // Note: generateExtractAutomaticallyInlined is async due to dynamic import of index.js
      const fullFunctionCode = await builderModule.generateExtractAutomaticallyInlined();
      
      // Write the generated function
      const tempPath = path.join(__dirname, CONFIG.outputPath);
      await fs.writeFile(tempPath, fullFunctionCode, 'utf-8');
      
      console.log('✅ Generated complete inlined function');
      console.log(`📦 Output: ${tempPath}`);
      console.log(`📊 Size: ${(fullFunctionCode.length / 1024).toFixed(2)} KB`);
      
      // Get version info if available
      if (typeof builderModule.getExtractorVersion === 'function') {
        const version = builderModule.getExtractorVersion();
        console.log(`📋 Extractor version: ${version.version}`);
        console.log(`   Modules: ${version.modules.join(', ')}`);
      }
      
    } else {
      // Fallback to old approach for backward compatibility
      console.log('   Using incremental update approach (legacy)');
      await buildIncrementalUpdate(builderModule);
    }
    
    console.log('');
    console.log('⚠️  NOTE: This is a generated file. Review it before replacing automatic.js');
    console.log('   To apply changes, copy the generated file content to automatic.js');
    console.log('   or run: node scripts/apply-extraction-build.js');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Fallback: Build using incremental update approach (legacy builder)
 * @param {Object} builderModule - Imported builder module
 */
async function buildIncrementalUpdate(builderModule) {
  // Get the inlined code from builder
  const inlinedModulesCode = builderModule.buildInlinedModules?.() ?? '';
  const inlinedConstantsCode = builderModule.buildCompleteInlinedFunction?.() ?? '';
  const helperObjectsCode = builderModule.buildHelperObjects?.() ?? '';
  
  // Read the current automatic.js to get the main function body
  const automaticJsPath = path.join(__dirname, CONFIG.automaticJsPath);
  const automaticJsContent = await fs.readFile(automaticJsPath, 'utf-8');
  
  // Extract the main function signature and body
  const functionStartMatch = automaticJsContent.match(/export async function extractAutomaticallyInlined\([^)]*\)\s*\{/);
  if (!functionStartMatch) {
    throw new Error('Could not find extractAutomaticallyInlined function signature');
  }
  
  const functionStartIndex = functionStartMatch.index + functionStartMatch[0].length;
  
  // Find the end of the function (last closing brace before next export or end of file)
  let braceCount = 1;
  let functionEndIndex = functionStartIndex;
  for (let i = functionStartIndex; i < automaticJsContent.length && braceCount > 0; i++) {
    if (automaticJsContent[i] === '{') braceCount++;
    if (automaticJsContent[i] === '}') braceCount--;
    if (braceCount === 0) {
      functionEndIndex = i;
      break;
    }
  }
  
  // Extract function body (without the outer braces)
  let functionBody = automaticJsContent.substring(functionStartIndex, functionEndIndex);
  
  // Remove old constants section to prevent duplication
  functionBody = removeOldConstantsSection(functionBody);
  
  // Find where to insert inlined code
  const insertIndex = findInsertionPoint(functionBody);
  
  // Generate the new function with inlined code
  const insertMarker = '// ============================================\n// INLINED HELPER FUNCTIONS FROM MODULES\n// ============================================\n';
  let newFunctionBody = generateNewFunctionBody(functionBody, insertIndex, insertMarker, inlinedConstantsCode, inlinedModulesCode, helperObjectsCode);
  
  // Generate the complete new function
  const newFunction = `export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false) {${newFunctionBody}}`;
  
  // Write to a temporary file first for review
  const tempPath = path.join(__dirname, CONFIG.outputPath);
  await fs.writeFile(tempPath, newFunction, 'utf-8');
  
  console.log('✅ Generated inlined function');
  console.log(`📦 Output: ${tempPath}`);
  console.log(`📊 Size: ${(newFunction.length / 1024).toFixed(2)} KB`);
}

/**
 * Remove old constants section from function body
 * @param {string} functionBody - Function body string
 * @returns {string} - Function body without old constants
 */
function removeOldConstantsSection(functionBody) {
  const oldConstantsStartMarker = '// INLINED CONSTANTS AND PATTERNS';
  const oldConstantsEndMarker = '// END OF INLINED CONSTANTS';
  
  const oldConstantsStart = functionBody.indexOf(oldConstantsStartMarker);
  const oldConstantsEnd = functionBody.indexOf(oldConstantsEndMarker);
  
  if (oldConstantsStart !== -1 && oldConstantsEnd !== -1) {
    // Find the start of the section (including the separator line before it)
    let sectionStart = oldConstantsStart;
    const separatorBefore = functionBody.lastIndexOf('// ============================================', oldConstantsStart);
    if (separatorBefore !== -1 && separatorBefore < oldConstantsStart) {
      sectionStart = separatorBefore;
    }
    
    // Find the end of the section (including the separator line after it)
    let sectionEnd = oldConstantsEnd;
    const separatorAfter = functionBody.indexOf('// ============================================', oldConstantsEnd);
    if (separatorAfter !== -1 && separatorAfter > oldConstantsEnd) {
      const lineEnd = functionBody.indexOf('\n', separatorAfter);
      if (lineEnd !== -1) {
        sectionEnd = lineEnd + 1;
      }
    } else {
      const lineEnd = functionBody.indexOf('\n', oldConstantsEnd);
      if (lineEnd !== -1) {
        sectionEnd = lineEnd + 1;
      }
    }
    
    // Remove the old constants section
    const beforeConstants = functionBody.substring(0, sectionStart);
    const afterConstants = functionBody.substring(sectionEnd);
    console.log('🗑️  Removed old constants section');
    return beforeConstants + afterConstants;
  }
  
  return functionBody;
}

/**
 * Find where to insert inlined code in the function body
 * @param {string} functionBody - Function body string
 * @returns {number} - Index where to insert
 */
function findInsertionPoint(functionBody) {
  // Try to find where helper functions start (after normalizeImageUrl)
  const normalizeImageUrlEnd = functionBody.indexOf('function normalizeImageUrl');
  let insertIndex = -1;
  
  if (normalizeImageUrlEnd !== -1) {
    // Find the end of normalizeImageUrl function
    let braceCount = 0;
    let foundOpen = false;
    for (let i = normalizeImageUrlEnd; i < functionBody.length; i++) {
      if (functionBody[i] === '{') {
        braceCount++;
        foundOpen = true;
      }
      if (functionBody[i] === '}') {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          insertIndex = i + 1;
          break;
        }
      }
    }
  }
  
  // If not found, try to find existing inlined code marker
  if (insertIndex === -1) {
    const existingMarker = functionBody.indexOf('// Image processor module functions (inlined)');
    if (existingMarker !== -1) {
      insertIndex = existingMarker;
    }
  }
  
  // If still not found, try to find where the old constants section was (after try block start)
  if (insertIndex === -1) {
    const tryBlockStart = functionBody.indexOf('try {');
    if (tryBlockStart !== -1) {
      const tryBlockLineEnd = functionBody.indexOf('\n', tryBlockStart);
      if (tryBlockLineEnd !== -1) {
        insertIndex = tryBlockLineEnd + 1;
      }
    }
  }
  
  return insertIndex;
}

/**
 * Generate new function body with inlined code
 * @param {string} functionBody - Original function body
 * @param {number} insertIndex - Where to insert
 * @param {string} insertMarker - Marker comment
 * @param {string} constantsCode - Constants code
 * @param {string} modulesCode - Modules code
 * @param {string} helperObjectsCode - Helper objects code
 * @returns {string} - New function body
 */
function generateNewFunctionBody(functionBody, insertIndex, insertMarker, constantsCode, modulesCode, helperObjectsCode) {
  if (insertIndex !== -1) {
    // Remove existing inlined code (from insertIndex to start of main logic)
    const mainLogicStart = functionBody.indexOf('// Extract metadata', insertIndex);
    if (mainLogicStart !== -1) {
      const beforeInlined = functionBody.substring(0, insertIndex);
      const afterInlined = functionBody.substring(mainLogicStart);
      return beforeInlined + '\n\n' +
        insertMarker +
        constantsCode + '\n\n' +
        modulesCode + '\n\n' +
        helperObjectsCode + '\n\n' +
        afterInlined;
    } else {
      return functionBody.substring(0, insertIndex) + '\n\n' +
        insertMarker +
        constantsCode + '\n\n' +
        modulesCode + '\n\n' +
        helperObjectsCode + '\n\n' +
        functionBody.substring(insertIndex);
    }
  } else {
    // Fallback: insert after debugInfo initialization
    const debugInfoEnd = functionBody.indexOf('};', 0) + 2;
    if (debugInfoEnd > 2) {
      return functionBody.substring(0, debugInfoEnd) + '\n\n' +
        insertMarker +
        constantsCode + '\n\n' +
        modulesCode + '\n\n' +
        helperObjectsCode + '\n\n' +
        functionBody.substring(debugInfoEnd);
    } else {
      // Last resort: insert at the beginning
      return insertMarker +
        constantsCode + '\n\n' +
        modulesCode + '\n\n' +
        helperObjectsCode + '\n\n' +
        functionBody;
    }
  }
}

build();
