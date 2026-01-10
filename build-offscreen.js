// build-offscreen.js
// Build script for offscreen.js bundle using esbuild
// This resolves all module imports at build time, eliminating need for import maps

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    console.log('🔨 Building offscreen bundle...');
    
    const outfile = 'dist/offscreen-bundle.js';
    const outdir = 'dist';
    
    // Ensure the output directory exists
    await fs.mkdir(outdir, { recursive: true });
    
    await esbuild.build({
      entryPoints: ['offscreen.js'],
      bundle: true,
      format: 'iife', // Self-contained, not a module
      platform: 'browser',
      target: 'es2020',
      outfile: outfile,
      
      // CRITICAL: Bundle EVERYTHING (no externals)
      external: [],
      
      // Handle special file types
      loader: {
        '.wasm': 'file',
        '.onnx': 'file',
        '.data': 'file'
      },
      
      // CRITICAL: Use browser-friendly resolution
      mainFields: ['browser', 'module', 'main'],
      conditions: ['browser', 'import', 'module', 'default'],
      
      // Resolve all extensions
      resolveExtensions: ['.js', '.mjs', '.ts', '.json'],
      
      // Minification (disable for debugging)
      minify: false,
      sourcemap: true,
      
      // CRITICAL: Plugin to handle bare module specifiers
      plugins: [{
        name: 'resolve-onnxruntime',
        setup(build) {
          // Intercept onnxruntime-web imports
          build.onResolve({ filter: /^onnxruntime-web$/ }, async (args) => {
            // Resolve to the WASM bundle (browser-friendly)
            try {
              const onnxPath = require.resolve(
                'onnxruntime-web/dist/ort.wasm.bundle.min.mjs'
              );
              console.log(`✅ Resolving onnxruntime-web → ${path.relative(process.cwd(), onnxPath)}`);
              return { path: onnxPath };
            } catch (error) {
              // Fallback to package root
              try {
                const onnxPath = require.resolve('onnxruntime-web');
                console.log(`✅ Resolving onnxruntime-web (fallback) → ${path.relative(process.cwd(), onnxPath)}`);
                return { path: onnxPath };
              } catch (fallbackError) {
                console.error(`❌ Failed to resolve onnxruntime-web: ${fallbackError.message}`);
                throw fallbackError;
              }
            }
          });
          
          // Intercept piper-tts-web imports
          build.onResolve({ filter: /^@mintplex-labs\/piper-tts-web$/ }, async (args) => {
            try {
              const piperPath = require.resolve('@mintplex-labs/piper-tts-web');
              console.log(`✅ Resolving piper-tts-web → ${path.relative(process.cwd(), piperPath)}`);
              return { path: piperPath };
            } catch (error) {
              console.error(`❌ Failed to resolve piper-tts-web: ${error.message}`);
              throw error;
            }
          });
          
          // Handle utils/*.js imports from PDF module
          // PDF module files use relative paths like '../../../../utils/logging.js'
          // which need to be resolved to the actual location
          build.onResolve({ filter: /.*\/utils\/(logging|author-validator|html|config|security|images|storage|pipeline-helpers)\.js$/ }, async (args) => {
            // If it's a relative path, resolve it from the importer's directory
            if (args.path.startsWith('.')) {
              try {
                const resolvedPath = path.resolve(path.dirname(args.importer), args.path);
                // Check if file exists
                try {
                  await fs.access(resolvedPath);
                  return { path: resolvedPath };
                } catch (e) {
                  // Extract filename from path
                  const filename = path.basename(args.path);
                  // Try to find file in scripts/utils/
                  const utilsPath = path.resolve(__dirname, 'scripts/utils', filename);
                  try {
                    await fs.access(utilsPath);
                    return { path: utilsPath };
                  } catch (e2) {
                    // If still not found, try relative to project root
                    const rootPath = path.resolve(__dirname, 'scripts/utils', filename);
                    return { path: rootPath };
                  }
                }
              } catch (error) {
                // Fallback to scripts/utils/
                const filename = path.basename(args.path);
                const fallbackPath = path.resolve(__dirname, 'scripts/utils', filename);
                return { path: fallbackPath };
              }
            }
            // Let esbuild handle non-relative paths
            return undefined;
          });
          
          // Handle dynamic imports of onnxruntime-web within piper-tts-web
          build.onLoad({ filter: /piper-tts-web/ }, async (args) => {
            let contents = await fs.readFile(args.path, 'utf8');
            
            // Replace dynamic import('onnxruntime-web') with reference to global
            // This assumes onnxruntime is made available globally
            contents = contents.replace(
              /import\(['"]onnxruntime-web['"]\)/g,
              'Promise.resolve(self.onnxruntime || globalThis.onnxruntime || window?.onnxruntime)'
            );
            
            // Exclude Node.js specific requires
            contents = contents.replace(/require\("fs"\)/g, 'undefined');
            contents = contents.replace(/require\("path"\)/g, 'undefined');
            
            return { contents, loader: 'js' };
          });
        }
      }, {
        name: 'chrome-runtime-url',
        setup(build) {
          // Handle chrome.runtime.getURL() calls - keep them for runtime resolution
          build.onLoad({ filter: /\.js$/ }, async (args) => {
            let contents = await fs.readFile(args.path, 'utf8');
            
            // Log chrome.runtime.getURL usage for debugging
            const matches = contents.match(/chrome\.runtime\.getURL\(['"`]([^'"`]+)['"`]\)/g);
            if (matches) {
              console.log(`📦 Found chrome.runtime.getURL calls: ${matches.length}`);
            }
            
            return { contents, loader: 'js' };
          });
        }
      }],
      
      // Define globals for browser environment
      define: {
        'process.env.NODE_ENV': '"production"',
        'global': 'window'
      }
    });
    
    console.log('✅ Offscreen bundle created successfully!');
    console.log(`📦 Output: ${outfile}`);
    
    // Check bundle size
    const stats = await fs.stat(outfile);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📊 Bundle size: ${sizeInMB} MB`);
    
    if (stats.size > 10 * 1024 * 1024) {
      console.warn('⚠️  Bundle is larger than 10MB - consider code splitting');
    }
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();

