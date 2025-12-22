// Build script for TTS Worker bundle using esbuild
// This creates a self-contained worker bundle that includes all dependencies
// without requiring import maps

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

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
        js: '// TTS Worker Bundle - Built with esbuild\n// This bundle includes piper-tts-web\n// ONNX Runtime (ort.all.min.js) is loaded separately via importScripts() to avoid blob URL issues\n'
      },
      
      // CRITICAL: Custom patching plugins
      plugins: [{
        name: 'patch-dynamic-imports',
        setup(build) {
          // CRITICAL: Patch piper-tts-web to use global onnxruntime
          build.onLoad({ filter: /piper-tts-web.*\.js$/ }, async (args) => {
            let contents = await fs.readFile(args.path, 'utf8');
            const original = contents;
            
            // Replace dynamic import with global reference
            // Pattern: import('onnxruntime-web') or import("onnxruntime-web")
            contents = contents.replace(
              /import\(['"`]onnxruntime-web['"`]\)/g,
              'Promise.resolve(self.onnxruntime || self.ort)'
            );
            
            // Also handle await import()
            contents = contents.replace(
              /await\s+import\(['"`]onnxruntime-web['"`]\)/g,
              '(self.onnxruntime || self.ort)'
            );
            
            // CRITICAL: Patch import(onnxUrl) where onnxUrl is a variable
            // This catches cases like: await import(onnxUrl) where onnxUrl = 'onnxruntime-web'
            contents = contents.replace(
              /await\s+import\s*\(\s*onnxUrl\s*\)/g,
              '(self.onnxruntime || self.ort)'
            );
            
            // Also handle __privateSet(this, _ort, await import(onnxUrl))
            contents = contents.replace(
              /__privateSet\(this,\s*_ort,\s*await\s+import\s*\(\s*onnxUrl\s*\)\)/g,
              '__privateSet(this, _ort, Promise.resolve(self.onnxruntime || self.ort))'
            );
            
            // Handle require('onnxruntime-web') if any
            contents = contents.replace(
              /require\(['"]onnxruntime-web['"]\)/g,
              '(self.onnxruntime || self.ort)'
            );
            
            // CRITICAL: Patch numThreads assignment to hardwareConcurrency
            // piper-tts-web sets numThreads = navigator.hardwareConcurrency in else branch
            // This causes blob URL issues in Chrome Extension - must be 1
            contents = contents.replace(
              /__privateGet\(this,\s*_ort\)\.env\.wasm\.numThreads\s*=\s*navigator\.hardwareConcurrency/g,
              '__privateGet(this, _ort).env.wasm.numThreads = 1 // CRITICAL: Fixed to 1 to avoid blob URL in Chrome Extension'
            );
            
            // Also patch any other patterns that might set numThreads > 1
            contents = contents.replace(
              /\.env\.wasm\.numThreads\s*=\s*navigator\.hardwareConcurrency/g,
              '.env.wasm.numThreads = 1 // CRITICAL: Fixed to 1 to avoid blob URL'
            );
            
            // CRITICAL: Patch hardcoded CDN URLs in piper-tts-web
            // piper-tts-web 1.0.4 has hardcoded CDN URLs for ONNX Runtime 1.18.0
            // We must replace them with local extension URLs
            // Note: In Worker, we use self.location.href to get origin (chrome.runtime is not available)
            
            // Replace ONNX_BASE CDN URL - use self.location.href for Worker context
            contents = contents.replace(
              /ONNX_BASE\s*=\s*["']https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/onnxruntime-web\/[^"']+["']/g,
              'ONNX_BASE = (function() { try { const url = new URL(self.location.href); return url.origin + "/node_modules/onnxruntime-web/dist/"; } catch(e) { return ""; } })() // CRITICAL: Patched to use local extension files'
            );
            
            // CRITICAL: DO NOT patch WASM_BASE - it breaks string concatenation
            // Instead, completely rewrite getDefaultWasmPaths() function
            // This is the correct approach per Perplexity analysis
            
            // Function is arrow function: const getDefaultWasmPaths = () => { ... }
            // Pattern must match the entire arrow function including the if/else structure
            const getDefaultWasmPathsPattern = /const\s+getDefaultWasmPaths\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?if\s*\(typeof\s+chrome[^}]+return\s*\{[\s\S]*?\};[\s\S]*?return\s*\{[\s\S]*?\};[\s\S]*?\};/m;
            
            if (getDefaultWasmPathsPattern.test(contents)) {
              contents = contents.replace(
                getDefaultWasmPathsPattern,
                `const getDefaultWasmPaths = () => {
  try {
    const url = new URL(self.location.href);
    const origin = url.origin;
    const onnxBase = origin + "/node_modules/onnxruntime-web/dist/";
    const piperBase = origin + "/node_modules/@diffusionstudio/piper-wasm/build/";
    return {
      onnxWasm: onnxBase,
      piperData: piperBase + "piper_phonemize.data",
      piperWasm: piperBase + "piper_phonemize.wasm"
    };
  } catch (e) {
    // Fallback: use original WASM_BASE if available (should not happen in Worker)
    const onnxBase = typeof ONNX_BASE !== 'undefined' ? ONNX_BASE : "";
    const wasmBase = typeof WASM_BASE !== 'undefined' ? WASM_BASE : "";
    return {
      onnxWasm: onnxBase,
      piperData: wasmBase + "piper_phonemize.data",
      piperWasm: wasmBase + "piper_phonemize.wasm"
    };
  }
};`
              );
              console.log('✅ Patched getDefaultWasmPaths() arrow function');
            } else {
              // Fallback: patch just the return statements inside the function
              // Replace the if branch return
              contents = contents.replace(
                /if\s*\(typeof\s+chrome[^}]+const\s+extensionBase\s*=\s*chrome\.runtime\.getURL\(['"]node_modules\/onnxruntime-web\/dist\/['"]\);\s*return\s*\{[\s\S]*?onnxWasm:\s*extensionBase,[\s\S]*?piperData:\s*`\$\{WASM_BASE\}\.data`,[\s\S]*?piperWasm:\s*`\$\{WASM_BASE\}\.wasm`[\s\S]*?\};/g,
                `if (true) {
    try {
      const url = new URL(self.location.href);
      const extensionBase = url.origin + "/node_modules/onnxruntime-web/dist/";
      const piperBase = url.origin + "/node_modules/@diffusionstudio/piper-wasm/build/";
      return {
        onnxWasm: extensionBase,
        piperData: piperBase + "piper_phonemize.data",
        piperWasm: piperBase + "piper_phonemize.wasm"
      };
    } catch (e) {
      return {
        onnxWasm: "",
        piperData: "",
        piperWasm: ""
      };
    }
  }`
              );
              
              // Replace the else branch return
              contents = contents.replace(
                /return\s*\{[\s\S]*?onnxWasm:\s*ONNX_BASE,[\s\S]*?piperData:\s*`\$\{WASM_BASE\}\.data`,[\s\S]*?piperWasm:\s*`\$\{WASM_BASE\}\.wasm`[\s\S]*?\};/g,
                `return {
    onnxWasm: (typeof ONNX_BASE !== 'undefined' ? ONNX_BASE : ""),
    piperData: (typeof WASM_BASE !== 'undefined' ? WASM_BASE + "piper_phonemize.data" : ""),
    piperWasm: (typeof WASM_BASE !== 'undefined' ? WASM_BASE + "piper_phonemize.wasm" : "")
  };`
              );
              
              console.warn('⚠️  Used fallback pattern for getDefaultWasmPaths');
            }
            
            // Also patch any other CDN URLs that might be used for ONNX Runtime
            contents = contents.replace(
              /["']https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/onnxruntime-web\/[^"']+["']/g,
              '(function() { try { const url = new URL(self.location.href); return url.origin + "/node_modules/onnxruntime-web/dist/"; } catch(e) { return ""; } })()'
            );
            
            // CRITICAL: Patch chrome.runtime checks in init() method to always use Worker-compatible code
            // Replace chrome.runtime.getURL with self.location.href-based URL
            contents = contents.replace(
              /const\s+extensionBase\s*=\s*chrome\.runtime\.getURL\(['"]node_modules\/onnxruntime-web\/dist\/['"]\);/g,
              'const url = new URL(self.location.href); const extensionBase = url.origin + "/node_modules/onnxruntime-web/dist/";'
            );
            
            // CRITICAL: Patch simd=false to simd=true (we want SIMD enabled)
            contents = contents.replace(
              /__privateGet\(this,\s*_ort\)\.env\.wasm\.simd\s*=\s*false;/g,
              '__privateGet(this, _ort).env.wasm.simd = true; // CRITICAL: Enable SIMD for Worker'
            );
            
            // CRITICAL: Patch chrome.runtime check to always execute Worker path
            contents = contents.replace(
              /if\s*\(typeof\s+chrome\s*!==\s*['"]undefined['"]\s*&&\s*chrome\.runtime\)\s*\{/g,
              'if (true) { // CRITICAL: Always use Worker path (chrome.runtime not available in Worker)'
            );
            
            // CRITICAL: Patch onnxUrl assignment - remove import, use global self.ort instead
            // piper-tts-web tries to import onnxruntime-web, but we already loaded it via importScripts
            // First patch the onnxUrl line
            contents = contents.replace(
              /const\s+onnxUrl\s*=\s*typeof\s+chrome\s*!==\s*['"]undefined['"]\s*&&\s*chrome\.runtime\s*\?\s*chrome\.runtime\.getURL\(['"]node_modules\/onnxruntime-web\/dist\/ort\.wasm\.bundle\.min\.mjs['"]\)\s*:\s*['"]onnxruntime-web['"];/g,
              'const onnxUrl = "onnxruntime-web"; // CRITICAL: Not used, we use global self.ort'
            );
            
            // Then patch the import line separately
            contents = contents.replace(
              /__privateSet\(this,\s*_ort,\s*await\s+import\(onnxUrl\)\);/g,
              '__privateSet(this, _ort, self.onnxruntime || self.ort); // CRITICAL: Use global ONNX Runtime loaded via importScripts'
            );
            
            // CRITICAL: Patch chrome.runtime check before InferenceSession.create to use Worker-compatible logging
            contents = contents.replace(
              /if\s*\(typeof\s+chrome\s*!==\s*["']undefined["']\s*&&\s*chrome\.runtime\)\s*\{[^}]*console\.log\(["']\[ClipAIble Piper TTS\] ONNX Runtime state before InferenceSession\.create["'][^}]*\}/g,
              'if (true) { console.log("[ClipAIble Piper TTS] ONNX Runtime state before InferenceSession.create", { hasOrt: !!__privateGet(this, _ort), hasInferenceSession: typeof __privateGet(this, _ort).InferenceSession !== "undefined", numThreads: __privateGet(this, _ort).env?.wasm?.numThreads, wasmPaths: __privateGet(this, _ort).env?.wasm?.wasmPaths, simd: __privateGet(this, _ort).env?.wasm?.simd, proxy: __privateGet(this, _ort).env?.wasm?.proxy, version: __privateGet(this, _ort).version || "unknown", note: "WASM will be loaded automatically via wasmPaths (Worker context)" }); } // CRITICAL: Always log in Worker'
            );
            
            // CRITICAL: Patch InferenceSession.create to explicitly use only 'wasm' execution provider
            // This prevents ONNX Runtime from trying to use WebGPU/WebNN/JSEP
            // Pattern: InferenceSession.create(modelArrayBuffer) -> InferenceSession.create(modelArrayBuffer, { executionProviders: ['wasm'] })
            // Note: Must patch the full line including await and assignment
            contents = contents.replace(
              /__privateSet\(this,\s*_ortSession,\s*await\s+__privateGet\(this,\s*_ort\)\.InferenceSession\.create\s*\(\s*modelArrayBuffer\s*\)\s*\)/g,
              '__privateSet(this, _ortSession, await __privateGet(this, _ort).InferenceSession.create(modelArrayBuffer, { executionProviders: ["wasm"] }))'
            );
            
            // Also handle case without await (if any)
            contents = contents.replace(
              /__privateGet\(this,\s*_ort\)\.InferenceSession\.create\s*\(\s*modelArrayBuffer\s*\)/g,
              '__privateGet(this, _ort).InferenceSession.create(modelArrayBuffer, { executionProviders: ["wasm"] })'
            );
            
            // Exclude Node.js specific requires
            contents = contents.replace(/require\("fs"\)/g, 'undefined');
            contents = contents.replace(/require\("path"\)/g, 'undefined');
            contents = contents.replace(/require\('fs'\)/g, 'undefined');
            contents = contents.replace(/require\('path'\)/g, 'undefined');
            
            // Verify critical patches were applied
            const patchesApplied = {
              getDefaultWasmPaths: /@diffusionstudio\/piper-wasm.*piper_phonemize\.(data|wasm)/.test(contents),
              inferenceSessionCreate: /executionProviders:\s*\["wasm"\]/.test(contents),
              dynamicImports: !/import\(['"]onnxruntime-web['"]\)/.test(contents),
              chromeRuntime: !/chrome\.runtime\.getURL\(['"]node_modules\/onnxruntime-web/.test(contents)
            };
            
            if (contents !== original) {
              console.log(`✅ Patched dynamic imports in: ${path.relative(process.cwd(), args.path)}`);
              console.log(`   Patches applied:`, patchesApplied);
              
              // Warn if critical patches failed
              if (!patchesApplied.getDefaultWasmPaths) {
                console.warn(`⚠️  WARNING: getDefaultWasmPaths patch may not have been applied correctly!`);
              }
              if (!patchesApplied.inferenceSessionCreate) {
                console.warn(`⚠️  WARNING: InferenceSession.create executionProviders patch may not have been applied!`);
              }
            } else {
              console.warn(`⚠️  No patches applied to: ${path.relative(process.cwd(), args.path)}`);
            }
            
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
    
    // Copy bundle to root for easier access (optional)
    const rootBundlePath = path.join(__dirname, 'tts-worker-bundle.js');
    await fs.copyFile(bundlePath, rootBundlePath);
    console.log('✅ Bundle copied to root:', rootBundlePath);
    
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
