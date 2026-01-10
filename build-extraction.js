// build-extraction.js
// Build script to inline extraction modules into extractAutomaticallyInlined function
// This generates a single inlined function that can be used with chrome.scripting.executeScript

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    console.log('🔨 Building extraction inlined function...');
    
    // First, we need to bundle the builder module to get access to its functions
    // Then we'll use it to generate the inlined code
    
    const builderBundlePath = path.join(__dirname, 'dist', 'extraction-builder-bundle.js');
    const outdir = 'dist';
    
    // Ensure the output directory exists
    await fs.mkdir(outdir, { recursive: true });
    
    // Step 1: Bundle the builder module and its dependencies
    console.log('📦 Bundling builder module...');
    await esbuild.build({
      entryPoints: ['scripts/extraction/modules/builder.js'],
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
    console.log('🔧 Generating inlined function code...');
    const builderModule = await import(`file://${builderBundlePath}`);
    
    // Get the inlined code from builder
    const inlinedModulesCode = builderModule.buildInlinedModules();
    const inlinedConstantsCode = builderModule.buildCompleteInlinedFunction();
    const helperObjectsCode = builderModule.buildHelperObjects();
    
    // Step 3: Read the current automatic.js to get the main function body
    const automaticJsPath = path.join(__dirname, 'scripts', 'extraction', 'automatic.js');
    const automaticJsContent = await fs.readFile(automaticJsPath, 'utf-8');
    
    // Extract the main function signature and body
    // The function starts with: export async function extractAutomaticallyInlined
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
    
    // CRITICAL: Remove old constants section to prevent duplication
    // Find and remove the old constants section (from "INLINED CONSTANTS AND PATTERNS" to "END OF INLINED CONSTANTS")
    const oldConstantsStartMarker = '// INLINED CONSTANTS AND PATTERNS';
    const oldConstantsEndMarker = '// END OF INLINED CONSTANTS';
    
    const oldConstantsStart = functionBody.indexOf(oldConstantsStartMarker);
    const oldConstantsEnd = functionBody.indexOf(oldConstantsEndMarker);
    
    if (oldConstantsStart !== -1 && oldConstantsEnd !== -1) {
      // Find the start of the section (including the separator line before it)
      let sectionStart = oldConstantsStart;
      // Look backwards for the separator line
      const separatorBefore = functionBody.lastIndexOf('// ============================================', oldConstantsStart);
      if (separatorBefore !== -1 && separatorBefore < oldConstantsStart) {
        sectionStart = separatorBefore;
      }
      
      // Find the end of the section (including the separator line after it)
      let sectionEnd = oldConstantsEnd;
      // Look forwards for the separator line after "END OF INLINED CONSTANTS"
      const separatorAfter = functionBody.indexOf('// ============================================', oldConstantsEnd);
      if (separatorAfter !== -1 && separatorAfter > oldConstantsEnd) {
        // Find the end of that separator line
        const lineEnd = functionBody.indexOf('\n', separatorAfter);
        if (lineEnd !== -1) {
          sectionEnd = lineEnd + 1;
        }
      } else {
        // If no separator after, find the end of the "END OF INLINED CONSTANTS" line
        const lineEnd = functionBody.indexOf('\n', oldConstantsEnd);
        if (lineEnd !== -1) {
          sectionEnd = lineEnd + 1;
        }
      }
      
      // Remove the old constants section
      const beforeConstants = functionBody.substring(0, sectionStart);
      const afterConstants = functionBody.substring(sectionEnd);
      functionBody = beforeConstants + afterConstants;
      
      console.log('🗑️  Removed old constants section');
    }
    
    // Find where to insert inlined code
    // Look for existing marker or insert after helper functions (isFootnoteLink, isIcon, etc.)
    const insertMarker = '// ============================================\n// INLINED HELPER FUNCTIONS FROM MODULES\n// ============================================\n';
    
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
            // Found end of normalizeImageUrl, insert after it
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
        // Find the start of the first inlined module function
        insertIndex = existingMarker;
      }
    }
    
    // If still not found, try to find where the old constants section was (after try block start)
    if (insertIndex === -1) {
      const tryBlockStart = functionBody.indexOf('try {');
      if (tryBlockStart !== -1) {
        // Find the end of the try { line
        const tryBlockLineEnd = functionBody.indexOf('\n', tryBlockStart);
        if (tryBlockLineEnd !== -1) {
          insertIndex = tryBlockLineEnd + 1;
        }
      }
    }
    
    // Generate the new function with inlined code
    let newFunctionBody = functionBody;
    
    if (insertIndex !== -1) {
      // Remove existing inlined code (from insertIndex to start of main logic)
      // Look for the start of main logic (usually "// Extract metadata" or similar)
      const mainLogicStart = functionBody.indexOf('// Extract metadata', insertIndex);
      if (mainLogicStart !== -1) {
        const beforeInlined = functionBody.substring(0, insertIndex);
        const afterInlined = functionBody.substring(mainLogicStart);
        newFunctionBody = beforeInlined + '\n\n' +
          insertMarker +
          inlinedConstantsCode + '\n\n' +
          inlinedModulesCode + '\n\n' +
          helperObjectsCode + '\n\n' +
          afterInlined;
      } else {
        // Just insert at the found position
        newFunctionBody = functionBody.substring(0, insertIndex) + '\n\n' +
          insertMarker +
          inlinedConstantsCode + '\n\n' +
          inlinedModulesCode + '\n\n' +
          helperObjectsCode + '\n\n' +
          functionBody.substring(insertIndex);
      }
    } else {
      // Fallback: insert after debugInfo initialization
      const debugInfoEnd = functionBody.indexOf('};', 0) + 2;
      if (debugInfoEnd > 2) {
        newFunctionBody = functionBody.substring(0, debugInfoEnd) + '\n\n' +
          insertMarker +
          inlinedConstantsCode + '\n\n' +
          inlinedModulesCode + '\n\n' +
          helperObjectsCode + '\n\n' +
          functionBody.substring(debugInfoEnd);
      } else {
        // Last resort: insert at the beginning
        newFunctionBody = insertMarker +
          inlinedConstantsCode + '\n\n' +
          inlinedModulesCode + '\n\n' +
          helperObjectsCode + '\n\n' +
          functionBody;
      }
    }
    
    // Generate the complete new function
    const newFunction = `export async function extractAutomaticallyInlined(baseUrl, enableDebugInfo = false) {${newFunctionBody}}`;
    
    // Write to a temporary file first for review
    const tempPath = path.join(outdir, 'extraction-automatic-generated.js');
    await fs.writeFile(tempPath, newFunction, 'utf-8');
    
    console.log('✅ Generated inlined function');
    console.log(`📦 Output: ${tempPath}`);
    console.log(`📊 Size: ${(newFunction.length / 1024).toFixed(2)} KB`);
    console.log('');
    console.log('⚠️  NOTE: This is a generated file. Review it before replacing automatic.js');
    console.log('   The generated function should be manually integrated into automatic.js');
    console.log('   or the build process should be updated to automatically replace it.');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

build();

