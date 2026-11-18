// @ts-check
// Build script for TTS Worker bundle using esbuild
// This creates a self-contained worker bundle that includes all dependencies
// without requiring import maps

import * as esbuild from 'esbuild';
import { patchPiperTtsSource, patchPiperPhonemizerSource } from './build-piper.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    console.log('🔨 Building TTS Worker bundle...');
    
    // Ensure dist directory exists
    const distDir = path.join(__dirname, 'dist');
    await fs.mkdir(distDir, { recursive: true });
    
    // Bundle TTS worker
    const result = await esbuild.build({
      entryPoints: ['src/tts-worker-entry.js'],
      bundle: true,
      format: 'iife', // Self-contained worker (Immediately Invoked Function Expression)
      platform: 'browser',
      target: 'es2020',
      outfile: 'dist/tts-worker-bundle.js',
      
      // CRITICAL: Exclude onnxruntime-web - it will be loaded via importScripts() as UMD bundle
      // This avoids blob URL issues with ES module bundles
      external: ['onnxruntime-web'],
      
      // CRITICAL: Use browser-friendly resolution
      mainFields: ['browser', 'module', 'main'],
      conditions: ['browser', 'import', 'module', 'default'],
      
      // Resolve extensions
      resolveExtensions: ['.mjs', '.js', '.ts', '.json'],
      
      // Handle WASM and binary files
      loader: {
        '.wasm': 'file',
        '.onnx': 'file',
        '.bin': 'file',
        '.data': 'file'
      },
      
      // Minify for production (set to false for debugging)
      minify: false, // Set true for production
      
      // Source maps for debugging
      sourcemap: true,
      
      // Define environment
      define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'self' // In Worker context
      },
      
      // Log level
      logLevel: 'info',
      
      // Banner to add at top of bundle
      banner: {
        js: '// TTS Worker Bundle\n// This bundle includes piper-tts-web\n// ONNX Runtime WASM (ort.wasm.min.js) is loaded separately via importScripts()\n'
      },
      
      // CRITICAL: Custom patching plugins
      plugins: [{
        name: 'patch-dynamic-imports',
        setup(build) {
          build.onLoad({ filter: /[/\\]piper-o91UDS6e\.js$/ }, async () => ({
            contents: patchPiperPhonemizerSource(await fs.readFile(path.join(__dirname, 'lib/piper-wasm/piper_phonemize.js'), 'utf8')),
            loader: 'js'
          }));
          // CRITICAL: Patch piper-tts-web to use global onnxruntime
          build.onLoad({ filter: /piper-tts-web.*\.js$/ }, async (args) => {
            const source = await fs.readFile(args.path, 'utf8');
            const contents = patchPiperTtsSource(source, args.path);
            return { contents, loader: 'js' };
          });
        }
      }, {
        name: 'node-stub',
        setup(build) {
          // Replace fs and path with empty objects (not used in browser)
          build.onResolve({ filter: /^(fs|path)$/ }, () => {
            return { path: 'node-stub', namespace: 'node-stub' };
          });
          
          build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => {
            return { contents: 'export default {};', loader: 'js' };
          });
        }
      }]
    });
    
    console.log('✅ TTS Worker bundle created!', {
      outputFile: result.outputFiles?.[0]?.path || 'dist/tts-worker-bundle.js',
      errors: result.errors?.length || 0,
      warnings: result.warnings?.length || 0
    });
    
    if (result.errors && result.errors.length > 0) {
      console.error('❌ Build errors:', result.errors);
      process.exit(1);
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.warn('⚠️ Build warnings:', result.warnings);
    }
    
    // Check bundle size
    const bundlePath = path.join(distDir, 'tts-worker-bundle.js');
    const stats = await fs.stat(bundlePath);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📊 Bundle size: ${sizeInMB} MB`);
    
    if (stats.size > 15 * 1024 * 1024) {
      console.warn('⚠️  Bundle is larger than 15MB - consider code splitting');
    }
    
    // Verify bundle does NOT contain onnxruntime (it's external)
    const bundleContent = await fs.readFile(bundlePath, 'utf8');
    
    // Check for unpatched dynamic imports
    const unpatchedImports = bundleContent.match(/import\(['"]onnxruntime-web['"]\)/g);
    if (unpatchedImports && unpatchedImports.length > 0) {
      console.warn(`⚠️  Found ${unpatchedImports.length} unpatched import('onnxruntime-web') calls in bundle`);
    } else {
      console.log('✅ No unpatched import(\'onnxruntime-web\') calls found');
    }
    
    // Verify piper-tts-web is included
    if (bundleContent.includes('piper-tts-web') || bundleContent.includes('predict')) {
      console.log('✅ Bundle contains piper-tts-web');
    } else {
      console.warn('⚠️  Bundle may not contain piper-tts-web');
    }
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run build
build();
