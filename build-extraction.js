// @ts-check
// build-extraction.js
// Build script to inline extraction modules into extractAutomaticallyInlined function
// This generates a single inlined function that can be used with chrome.scripting.executeScript

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} BuildConfig
 * @property {string} builderPath - Path to the builder module
 * @property {string} outputPath - Path for generated output
 */

/** @type {BuildConfig} */
const CONFIG = {
  builderPath: 'scripts/extraction/extractor/builder.js',
  outputPath: 'dist/extraction-automatic-generated.js'
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
    const builderModule = await import(`${pathToFileURL(builderBundlePath).href}${cacheBuster}`);
    
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
      throw new Error('Extractor builder does not export generateExtractAutomaticallyInlined');
    }
    
    console.log('');
    console.log('Generated extraction module is ready to apply.');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}


build();
