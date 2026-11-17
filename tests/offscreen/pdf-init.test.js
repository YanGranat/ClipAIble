import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('scripts/offscreen/pdf-init.js', root), 'utf8');

function initialize(importModule) {
  const Worker = function(url) { this.url = url; };
  const context = { Worker, importModule,
    chrome: { runtime: { getURL: path => `chrome-extension://test-extension-id/${path}` } }
  };
  vm.runInNewContext(source.replace(/\bimport\(/g, 'importModule('), context);
  return context;
}

describe('Offscreen PDF initialization', () => {
  it('loads local initialization before the consuming bundle', () => {
    const html = readFileSync(new URL('offscreen.html', root), 'utf8');
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
    expect(scripts).toEqual(['scripts/offscreen/pdf-init.js', 'dist/offscreen-bundle.js']);
    for (const path of scripts) expect(existsSync(new URL(path, root))).toBe(true);
    for (const path of ['lib/pdfjs/compatibility.mjs', 'lib/pdfjs/pdf.min.mjs', 'lib/pdfjs/worker.mjs', 'lib/pdfjs/pdf.worker.min.mjs']) {
      expect(existsSync(new URL(path, root))).toBe(true);
    }
  });

  it('loads compatibility before the API and preserves unrelated native workers', async () => {
    const pdfjsLib = { getDocument() {}, GlobalWorkerOptions: {} };
    const imports = [];
    const context = initialize(async url => {
      imports.push(url);
      return url.endsWith('pdf.min.mjs') ? pdfjsLib : {};
    });
    expect(context.__PDF_READY__).toBe(false);
    await context.__PDF_READY_PROMISE__;
    expect(imports).toEqual(['chrome-extension://test-extension-id/lib/pdfjs/compatibility.mjs', 'chrome-extension://test-extension-id/lib/pdfjs/pdf.min.mjs']);
    expect(context.__PDF_READY__).toBe(true);
    expect(context.pdfjsLib).toBe(pdfjsLib);
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBe('chrome-extension://test-extension-id/lib/pdfjs/worker.mjs');
    expect(new context.Worker('tts-worker.js').url).toBe('tts-worker.js');
  });

  it('retains the initialization error and never marks a failed module as ready', async () => {
    const error = new Error('Module unavailable');
    const context = initialize(async () => { throw error; });
    await expect(context.__PDF_READY_PROMISE__).resolves.toBeNull();
    expect(context.__PDF_READY__).toBe(false);
    expect(context.__PDF_INIT_ERROR__).toBe(error);
  });

  it('provides generic Promise capability records without replacing a native method', async () => {
    const compatibility = readFileSync(new URL('lib/pdfjs/compatibility.mjs', root), 'utf8');
    const context = vm.createContext({});
    vm.runInContext('Promise.withResolvers = undefined', context);
    vm.runInContext(compatibility, context);
    const record = vm.runInContext('class Derived extends Promise {}; Derived.withResolvers()', context);
    record.resolve(42);
    await expect(record.promise).resolves.toBe(42);
    expect(record.promise.constructor.name).toBe('Derived');
    const rejected = vm.runInContext('Promise.withResolvers()', context);
    const reason = new Error('Rejected capability');
    const assertion = expect(rejected.promise).rejects.toBe(reason);
    rejected.reject(reason);
    await assertion;
    expect(() => vm.runInContext('Promise.withResolvers.call(class {})', context)).toThrow('Invalid Promise constructor');
    expect(() => vm.runInContext('Promise.withResolvers.call(class { constructor(executor) { executor(() => {}, () => {}); executor(() => {}, () => {}); } })', context)).toThrow('already initialized');
    const native = vi.fn();
    vm.runInNewContext(compatibility, { Promise: { withResolvers: native } });
    expect(native).not.toHaveBeenCalled();
  });
});
