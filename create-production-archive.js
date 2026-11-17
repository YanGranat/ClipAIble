// @ts-check
// Build and package the extension for Chrome Web Store distribution.

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const root = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const runtimeFiles = ['manifest.json', 'offscreen.html', 'offscreen.js', 'README.md', 'PRIVACY.md', 'PERMISSIONS.md', 'LICENSE', 'docs/technical-overview.md'];
const runtimeDirectories = ['icons', 'popup', 'scripts', 'config', 'print', 'lib'];
const buildOnlyFiles = new Set(['scripts/apply-extraction-build.js', 'scripts/extraction/extractor/builder.js']);

function isRuntimeFile(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return !buildOnlyFiles.has(normalized) &&
    !normalized.startsWith('scripts/test/') &&
    !/\.(?:backup|bak)(?:\.|$)/i.test(normalized) &&
    !normalized.endsWith('.map');
}

async function copyDirectory(source, destination, relativePath) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    if (!isRuntimeFile(childRelative)) continue;
    if (entry.isSymbolicLink()) throw new Error('Symbolic links cannot be packaged: ' + childRelative);
    const childSource = path.join(source, entry.name);
    const childDestination = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(childSource, childDestination, childRelative);
    } else if (entry.isFile()) {
      await fs.copyFile(childSource, childDestination);
    }
  }
}

async function buildBundles() {
  for (const script of ['build-extraction.js', 'build-offscreen.js', 'build-tts-worker.js']) {
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
  for (const entry of await fs.readdir(onnxDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.mjs') && !entry.name.endsWith('.wasm') &&
        !['ort.all.min.js', 'ort.wasm.min.js'].includes(entry.name)) continue;
    await fs.copyFile(path.join(onnxDirectory, entry.name), path.join(destination, 'lib', entry.name));
  }
  const piperDestination = path.join(destination, 'lib', 'piper-wasm');
  await fs.mkdir(piperDestination, { recursive: true });
  for (const filename of ['piper_phonemize.data', 'piper_phonemize.wasm', 'piper_phonemize.js']) {
    await fs.copyFile(
      path.join(root, 'node_modules', '@diffusionstudio', 'piper-wasm', 'build', filename),
      path.join(piperDestination, filename)
    );
  }
}

async function createZip(sourceDirectory, outputPath) {
  try {
    await fs.unlink(outputPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.IO.Compression',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '$source = $env:CLIPAIBLE_PACKAGE_SOURCE',
    '$archive = [IO.Compression.ZipFile]::Open($env:CLIPAIBLE_PACKAGE_OUTPUT, [IO.Compression.ZipArchiveMode]::Create)',
    'try {',
    '  Get-ChildItem -LiteralPath $source -File -Recurse | Sort-Object FullName | ForEach-Object {',
    "    $name = $_.FullName.Substring($source.Length + 1).Replace('\\', '/')",
    '    $entry = $archive.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)',
    '    $entry.LastWriteTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)',
    '    $inputStream = [IO.File]::OpenRead($_.FullName)',
    '    $outputStream = $entry.Open()',
    '    try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }',
    '  }',
    '} finally { $archive.Dispose() }'
  ].join('\n');
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, CLIPAIBLE_PACKAGE_SOURCE: sourceDirectory, CLIPAIBLE_PACKAGE_OUTPUT: outputPath }
  });
}

async function createArchive() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const outputPath = path.resolve(root, process.argv[2] || 'clipaible-' + manifest.version + '-production.zip');
  if (path.extname(outputPath).toLowerCase() !== '.zip') throw new Error('Output must be a ZIP file');
  await buildBundles();
  const temporaryRoot = path.join(root, 'temporary_files');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(path.join(temporaryRoot, 'package-'));
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
    for (const group of manifest.web_accessible_resources || []) {
      group.resources = group.resources.filter(resource => !resource.includes('node_modules') && !resource.endsWith('.map'));
    }
    await fs.writeFile(path.join(stagingDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const filename of [
      'manifest.json', 'scripts/background.js', 'popup/popup.html', 'print/print.html',
      'dist/offscreen-bundle.js', 'dist/tts-worker-bundle.js', 'lib/ort.all.min.js',
      'lib/piper-wasm/piper_phonemize.data', 'lib/piper-wasm/piper_phonemize.wasm'
    ]) await fs.access(path.join(stagingDirectory, filename));
    await createZip(stagingDirectory, outputPath);
    console.log('Archive: ' + outputPath);
    console.log('Size: ' + (await fs.stat(outputPath)).size + ' bytes');
  } finally {
    if (!stagingDirectory.startsWith(temporaryRoot + path.sep)) throw new Error('Invalid staging directory');
    await fs.rm(stagingDirectory, { recursive: true });
  }
}

createArchive().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
