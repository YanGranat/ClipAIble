// @ts-check
// Build and package the extension for Chrome Web Store distribution.

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'node:crypto';
import JSZip from './lib/jszip-wrapper.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const runtimeFiles = ['manifest.json', 'offscreen.html', 'offscreen.js', 'README.md', 'PRIVACY.md', 'PERMISSIONS.md', 'LICENSE', 'docs/technical-overview.md'];
const runtimeDirectories = ['icons', 'popup', 'scripts', 'config', 'print', 'lib'];
const sourceFiles = [
  ...runtimeFiles, '.gitattributes', '.gitignore', 'package.json', 'package-lock.json',
  'build-extraction.js', 'build-offscreen.js', 'build-piper.js', 'build-tts-worker.js',
  'create-production-archive.js', 'jsconfig.json', 'vitest.config.js', 'THIRD_PARTY_NOTICES.txt'
];
const sourceDirectories = [...runtimeDirectories, 'src', 'tests', 'docs', 'third_party/sources'];
const buildOnlyFiles = new Set(['scripts/apply-extraction-build.js', 'scripts/extraction/extractor/builder.js']);
const buildOnlyDirectories = ['scripts/extraction/extractor/', 'scripts/extraction/patterns/', 'scripts/extraction/constants/'];
export const ORT_RUNTIME_FILES = Object.freeze(['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']);

export function isSourceFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return !['workspace', 'temporary_files', 'node_modules', '.git'].some(directory => normalized === directory || normalized.startsWith(directory + '/')) &&
    !normalized.startsWith('scripts/test/') &&
    !/\.(?:backup|bak)(?:\.|$)/i.test(normalized) &&
    !normalized.endsWith('.map');
}

export function isRuntimeFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!isSourceFile(normalized) || buildOnlyFiles.has(normalized)) return false;
  if (buildOnlyDirectories.some(directory => normalized === directory.slice(0, -1) || normalized.startsWith(directory))) return false;
  if (/^lib\/ort[.-]/.test(normalized)) return ORT_RUNTIME_FILES.includes(normalized.slice(4));
  return true;
}

async function copyDirectory(source, destination, relativePath, include = isRuntimeFile) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    if (!include(childRelative)) continue;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be packaged: ' + childRelative);
    const childSource = path.join(source, entry.name);
    const childDestination = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(childSource, childDestination, childRelative, include);
    } else if (entry.isFile()) {
      await fs.copyFile(childSource, childDestination);
    }
  }
}

async function buildBundles() {
  for (const script of ['build-extraction.js', 'scripts/apply-extraction-build.js', 'build-offscreen.js', 'build-tts-worker.js']) {
    console.log('Building ' + script);
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(root, script)], {
      cwd: root, maxBuffer: 10 * 1024 * 1024
    });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  }
}

async function copyRuntimeLibraries(destination) {
  const onnxDirectory = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
  for (const filename of ORT_RUNTIME_FILES) {
    await fs.copyFile(path.join(onnxDirectory, filename), path.join(destination, 'lib', filename));
  }
  const artifacts = JSON.parse(await fs.readFile(path.join(root, 'third_party/sources/piper-phonemize/artifacts.json'), 'utf8'));
  for (const artifact of artifacts) {
    const bytes = await fs.readFile(path.join(destination, 'lib/piper-wasm', artifact.file));
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
      throw new Error('Packaged phonemizer does not match its corresponding source: ' + artifact.file);
    }
  }
}

export async function createZip(sourceDirectory, outputPath) {
  const zip = new JSZip();
  async function addFiles(directory, prefix = '') {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const name = prefix + entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be packaged: ' + name);
      if (entry.isDirectory()) await addFiles(filename, name + '/');
      else if (entry.isFile()) zip.file(name, await fs.readFile(filename));
    }
  }
  await addFiles(sourceDirectory);
  const bytes = await zip.generateAsync({ compression: 'DEFLATE' });
  const parent = path.dirname(outputPath);
  await fs.mkdir(parent, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(parent, '.clipaible-zip-'));
  const candidate = path.join(temporary, 'archive.zip');
  try {
    await fs.writeFile(candidate, bytes);
    await fs.rename(candidate, outputPath);
  } finally {
    try { await fs.unlink(candidate); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rmdir(temporary);
  }
}

async function createArchive() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const outputPath = path.resolve(root, process.argv[2] || 'workspace/releases/clipaible-' + manifest.version + '-production.zip');
  if (path.extname(outputPath).toLowerCase() !== '.zip') throw new Error('Output must be a ZIP file');
  await buildBundles();
  const temporaryRoot = path.join(root, 'temporary_files');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'package-'));
  let sourceStagingDirectory;
  try {
    for (const filename of runtimeFiles) {
      await fs.mkdir(path.dirname(path.join(stagingDirectory, filename)), { recursive: true });
      await fs.copyFile(path.join(root, filename), path.join(stagingDirectory, filename));
    }
    for (const directory of runtimeDirectories) {
      await copyDirectory(path.join(root, directory), path.join(stagingDirectory, directory), directory);
    }
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && /(?:^|[-_.])(?:licenses?|notices?)(?:[-_.]|$)/i.test(entry.name) &&
          !runtimeFiles.includes(entry.name)) {
        await fs.copyFile(path.join(root, entry.name), path.join(stagingDirectory, entry.name));
      }
    }
    await fs.mkdir(path.join(stagingDirectory, 'dist'), { recursive: true });
    for (const filename of ['offscreen-bundle.js', 'tts-worker-bundle.js']) {
      await fs.copyFile(path.join(root, 'dist', filename), path.join(stagingDirectory, 'dist', filename));
    }
    await fs.copyFile(
      path.join(root, 'dist', 'extraction-automatic-generated.js'),
      path.join(stagingDirectory, 'scripts', 'extraction', 'automatic.js')
    );
    await copyRuntimeLibraries(stagingDirectory);
    for (const filename of [
      'manifest.json', 'scripts/background.js', 'popup/popup.html', 'print/print.html',
      'dist/offscreen-bundle.js', 'dist/tts-worker-bundle.js', ...ORT_RUNTIME_FILES.map(filename => 'lib/' + filename),
      'lib/piper-wasm/piper_phonemize.data', 'lib/piper-wasm/piper_phonemize.wasm'
    ]) await fs.access(path.join(stagingDirectory, filename));
    await createZip(stagingDirectory, outputPath);
    sourceStagingDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'sources-'));
    for (const filename of sourceFiles) {
      await fs.mkdir(path.dirname(path.join(sourceStagingDirectory, filename)), { recursive: true });
      await fs.copyFile(path.join(root, filename), path.join(sourceStagingDirectory, filename));
    }
    for (const directory of sourceDirectories) {
      await copyDirectory(path.join(root, directory), path.join(sourceStagingDirectory, directory), directory, isSourceFile);
    }
    const sourceOutputPath = outputPath.replace(/\.zip$/i, '-sources.zip');
    await createZip(sourceStagingDirectory, sourceOutputPath);
    console.log('Archive: ' + outputPath);
    console.log('Sources: ' + sourceOutputPath);
    console.log('Size: ' + (await fs.stat(outputPath)).size + ' bytes');
  } finally {
    if (!stagingDirectory.startsWith(temporaryRoot + path.sep)) throw new Error('Invalid staging directory');
    await fs.rm(stagingDirectory, { recursive: true });
    if (sourceStagingDirectory) {
      if (!sourceStagingDirectory.startsWith(temporaryRoot + path.sep)) throw new Error('Invalid source staging directory');
      await fs.rm(sourceStagingDirectory, { recursive: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createArchive().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
