// @ts-check
// Script to create production archive for Chrome Web Store
// This script copies all necessary files and creates a ZIP archive

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Archive configuration
const ARCHIVE_NAME = 'clipaible-3.3.0-production.zip';
const TEMP_DIR = 'temp-archive';

// Files and folders to include
const INCLUDE = [
  'manifest.json',
  'offscreen.html',
  'offscreen.js',
  'README.md',
  'icons',
  'popup',
  'scripts',
  'dist',
  'config',
  'print',
  'lib' // Include lib folder (will be populated with ONNX Runtime files)
];

// Files and folders to exclude
const EXCLUDE = [
  'node_modules',
  '.git',
  'doc',
  'temp-archive',
  'create-production-archive.js',
  'build-tts-worker.js',
  'build-offscreen.js',
  'build-extraction.js',
  'package.json',
  'package-lock.json',
  '.gitignore',
  '.vscode',
  'src',
  'tests',
  'clipaible-*.zip'
];

// ONNX Runtime files to copy to lib/
// CRITICAL: Copy ALL .mjs and .wasm files because .mjs files use relative imports
// When we load lib/ort.wasm.min.mjs, it does: await import('./ort-wasm-simd-threaded.jsep.mjs')
// These relative imports resolve relative to the module URL, so ALL files must be in lib/
const ONNX_FILES = [
  // Main ONNX Runtime files
  'node_modules/onnxruntime-web/dist/ort.all.min.js',
  'node_modules/onnxruntime-web/dist/ort.all.min.js.map',
  'node_modules/onnxruntime-web/dist/ort.wasm.min.js',
  'node_modules/onnxruntime-web/dist/ort.wasm.min.js.map',

  // CRITICAL: ALL .mjs files (for ESM relative imports to work)
  'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs',
  'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs.map',
  'node_modules/onnxruntime-web/dist/ort.wasm.mjs',
  'node_modules/onnxruntime-web/dist/ort.all.min.mjs',
  'node_modules/onnxruntime-web/dist/ort.all.min.mjs.map',
  'node_modules/onnxruntime-web/dist/ort.all.mjs',

  // CRITICAL: ALL WASM files that .mjs files import
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd.jsep.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm-simd.jsep.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm.mjs',
  'node_modules/onnxruntime-web/dist/ort-wasm.jsep.wasm',
  'node_modules/onnxruntime-web/dist/ort-wasm.jsep.mjs',
];

// Piper WASM files to copy to lib/piper-wasm/
const PIPER_FILES = [
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm',
  'node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js'
];

/**
 * Copy file with directory creation
 */
async function copyFile(src, dest) {
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    console.log(`  ✅ Copied: ${path.relative(__dirname, src)} → ${path.relative(__dirname, dest)}`);
  } catch (error) {
    console.error(`  ❌ Failed to copy ${src}:`, error.message);
    throw error;
  }
}

/**
 * Copy directory recursively
 */
async function copyDir(src, dest, level = 0) {
  const indent = '  '.repeat(level);

  try {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Skip excluded files
      if (EXCLUDE.includes(entry.name)) {
        console.log(`${indent}⏭️  Skipped: ${entry.name}`);
        continue;
      }

      if (entry.isDirectory()) {
        console.log(`${indent}📁 ${entry.name}/`);
        await copyDir(srcPath, destPath, level + 1);
      } else {
        await fs.copyFile(srcPath, destPath);
        console.log(`${indent}  ✅ ${entry.name}`);
      }
    }
  } catch (error) {
    console.error(`${indent}❌ Failed to copy directory ${src}:`, error.message);
    throw error;
  }
}

/**
 * Create ZIP archive using PowerShell
 */
async function createZip(sourceDir, outputFile) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const sourcePath = path.resolve(__dirname, sourceDir);
  const outputPath = path.resolve(__dirname, outputFile);

  // Remove old archive if exists
  try {
    await fs.unlink(outputPath);
    console.log('🗑️  Removed old archive');
  } catch (error) {
    // File doesn't exist, ignore
  }

  // Create ZIP using PowerShell with Force flag
  const command = `powershell -command "Compress-Archive -Path '${sourcePath}\\*' -DestinationPath '${outputPath}' -CompressionLevel Optimal -Force"`;

  console.log('📦 Creating ZIP archive...');
  try {
    const result = await execAsync(command);
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    console.log('✅ ZIP archive created successfully');
  } catch (error) {
    console.error('❌ Failed to create ZIP:', error.message);
    if (error.stdout) console.log('stdout:', error.stdout);
    if (error.stderr) console.error('stderr:', error.stderr);
    throw error;
  }
}

/**
 * Get file size in MB
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return (stats.size / 1024 / 1024).toFixed(2);
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Main function
 */
async function createArchive() {
  console.log('🚀 Creating production archive for ClipAIble 3.3.0\n');

  const tempPath = path.join(__dirname, TEMP_DIR);

  try {
    // 1. Clean up temp directory
    console.log('🧹 Cleaning up temp directory...');
    try {
      await fs.rm(tempPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore if doesn't exist
    }
    await fs.mkdir(tempPath, { recursive: true });
    console.log('✅ Temp directory created\n');

    // 2. Copy main files and folders
    console.log('📋 Copying main files and folders...');
    for (const item of INCLUDE) {
      const srcPath = path.join(__dirname, item);
      const destPath = path.join(tempPath, item);

      try {
        const stats = await fs.stat(srcPath);

        if (stats.isDirectory()) {
          console.log(`📁 Copying directory: ${item}/`);
          await copyDir(srcPath, destPath, 1);
        } else {
          console.log(`📄 Copying file: ${item}`);
          await copyFile(srcPath, destPath);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`⚠️  Skipped (not found): ${item}`);
        } else {
          throw error;
        }
      }
    }
    console.log('✅ Main files copied\n');

    // 3. Copy ONNX Runtime files to lib/
    console.log('📦 Copying ONNX Runtime files to lib/...');
    for (const file of ONNX_FILES) {
      const srcPath = path.join(__dirname, file);
      const fileName = path.basename(file);
      const destPath = path.join(tempPath, 'lib', fileName);

      try {
        await copyFile(srcPath, destPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`  ⚠️  Skipped (not found): ${fileName}`);
        } else {
          throw error;
        }
      }
    }
    console.log('✅ ONNX Runtime files copied\n');

    // 4. Copy Piper WASM files to lib/piper-wasm/
    console.log('📦 Copying Piper WASM files to lib/piper-wasm/...');
    for (const file of PIPER_FILES) {
      const srcPath = path.join(__dirname, file);
      const fileName = path.basename(file);
      const destPath = path.join(tempPath, 'lib', 'piper-wasm', fileName);

      try {
        await copyFile(srcPath, destPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`  ⚠️  Skipped (not found): ${fileName}`);
        } else {
          throw error;
        }
      }
    }
    console.log('✅ Piper WASM files copied\n');

    // 5. Verify critical files
    console.log('🔍 Verifying critical files...');
    const criticalFiles = [
      'manifest.json',
      'dist/tts-worker-bundle.js',
      'lib/ort.all.min.js',
      'lib/piper-wasm/piper_phonemize.data',
      'lib/piper-wasm/piper_phonemize.wasm'
    ];

    let allCriticalFilesExist = true;
    for (const file of criticalFiles) {
      const filePath = path.join(tempPath, file);
      try {
        await fs.access(filePath);
        const size = await getFileSize(filePath);
        console.log(`  ✅ ${file} (${size} MB)`);
      } catch (error) {
        console.log(`  ❌ MISSING: ${file}`);
        allCriticalFilesExist = false;
      }
    }

    if (!allCriticalFilesExist) {
      throw new Error('Some critical files are missing!');
    }
    console.log('✅ All critical files verified\n');

    // 6. Create ZIP archive
    await createZip(TEMP_DIR, ARCHIVE_NAME);

    // 7. Get archive size
    const archiveSize = await getFileSize(path.join(__dirname, ARCHIVE_NAME));
    console.log(`\n📊 Archive size: ${archiveSize} MB`);

    // 8. Clean up temp directory
    console.log('\n🧹 Cleaning up temp directory...');
    await fs.rm(tempPath, { recursive: true, force: true });
    console.log('✅ Temp directory removed\n');

    // 9. Success
    console.log('✅ ✅ ✅ Production archive created successfully! ✅ ✅ ✅\n');
    console.log(`📦 Archive: ${ARCHIVE_NAME}`);
    console.log(`📊 Size: ${archiveSize} MB`);
    console.log(`\n🎉 Ready to upload to Chrome Web Store!`);

  } catch (error) {
    console.error('\n❌ Failed to create archive:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
createArchive();
