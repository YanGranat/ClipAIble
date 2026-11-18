import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createZip, isRuntimeFile, isSourceFile, ORT_RUNTIME_FILES } from '../../create-production-archive.js';

const temporaryRoot = path.resolve('temporary_files');
const owned = [];
afterEach(async () => {
  for (const directory of owned.splice(0)) {
    const resolved = await fs.realpath(directory);
    if (!resolved.startsWith(await fs.realpath(temporaryRoot) + path.sep)) throw new Error('Invalid test directory');
    await fs.rm(resolved, { recursive: true });
  }
});

it('excludes local root workspaces while preserving legitimate nested source directories', () => {
  for (const filename of ['workspace/artwork.svg', 'workspace', 'temporary_files/report.json', 'node_modules/library/index.js', '.git/config']) {
    expect(isRuntimeFile(filename)).toBe(false);
    expect(isSourceFile(filename)).toBe(false);
  }
  for (const filename of ['scripts/workspace/module.js', 'src/temporary_files/fixture.js', 'tests/workspace/example.test.js', 'scripts/workspace-helper.js']) {
    expect(isRuntimeFile(filename)).toBe(true);
    expect(isSourceFile(filename)).toBe(true);
  }
  expect(isSourceFile('workspace\\artwork.svg')).toBe(false);
});

it('retains the generated extractor at runtime and its complete preferred source in the source package', () => {
  expect(isRuntimeFile('scripts/extraction/automatic.js')).toBe(true);
  for (const filename of ['scripts/extraction/extractor/parse.js', 'scripts/extraction/extractor/selectors.js', 'scripts/extraction/patterns/exclusion-patterns.js', 'scripts/extraction/constants/content-thresholds.js', 'scripts/apply-extraction-build.js']) {
    expect(isRuntimeFile(filename)).toBe(false);
    expect(isSourceFile(filename)).toBe(true);
  }
  for (const filename of ['THIRD_PARTY_NOTICES.txt', 'lib/pdfjs/LICENSE', 'lib/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap', 'third_party/sources/piper-phonemize/phonemize.tar.gz']) expect(isSourceFile(filename)).toBe(true);
});

it('packages only the supported ONNX WASM runtime while preserving vendored source inputs', () => {
  for (const filename of ORT_RUNTIME_FILES) expect(isRuntimeFile('lib/' + filename)).toBe(true);
  for (const filename of ['ort.all.min.js', 'ort.webgpu.min.js', 'ort.training.wasm.min.js', 'ort-wasm-simd-threaded.jsep.wasm', 'ort.node.min.js', 'ort.d.ts']) {
    expect(isRuntimeFile('lib/' + filename)).toBe(false);
    expect(isSourceFile('lib/' + filename)).toBe(true);
  }
  expect(isRuntimeFile('lib/jszip-wrapper.js')).toBe(true);
  expect(isRuntimeFile('lib/piper-wasm/piper_phonemize.wasm')).toBe(true);
});

it('creates deterministic compressed ZIP bytes through the portable Node entry point', async () => {
  await fs.mkdir(temporaryRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'zip-test-'));
  owned.push(directory);
  const source = path.join(directory, 'source');
  await fs.mkdir(path.join(source, 'nested'), { recursive: true });
  const content = 'Independent source content. '.repeat(100);
  const file = path.join(source, 'nested', 'example.txt');
  await fs.writeFile(file, content);
  await fs.writeFile(path.join(source, 'first.txt'), 'First entry');
  const first = path.join(directory, 'first.zip');
  const second = path.join(directory, 'second.zip');
  await createZip(source, first);
  await fs.utimes(file, new Date('2031-01-01'), new Date('2031-01-01'));
  await createZip(source, second);
  await createZip(source, first);
  const bytes = await fs.readFile(first);
  expect(bytes).toEqual(await fs.readFile(second));
  expect(bytes.length).toBeLessThan(content.length / 2);
  let offset = 0;
  const decoded = {};
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(8);
    const size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString('utf8');
    decoded[name] = inflateRawSync(bytes.subarray(start, start + size)).toString('utf8');
    offset = start + size;
  }
  expect(decoded).toEqual({ 'first.txt': 'First entry', 'nested/example.txt': content });
});
