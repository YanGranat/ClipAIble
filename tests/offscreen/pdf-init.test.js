import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('scripts/offscreen/pdf-init.js', root), 'utf8');

describe('Offscreen PDF initialization', () => {
  it('loads existing local scripts in dependency order', () => {
    const html = readFileSync(new URL('offscreen.html', root), 'utf8');
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
    expect(scripts).toEqual(['lib/pdfjs/pdf.min.js', 'scripts/offscreen/pdf-init.js', 'dist/offscreen-bundle.js']);
    for (const path of scripts) expect(existsSync(new URL(path, root))).toBe(true);
  });

  it('configures PDF.js in the document head while preserving native workers', () => {
    const Worker = function(url) { this.url = url; };
    const pdfjsLib = { getDocument: () => {}, GlobalWorkerOptions: {} };
    const context = {
      pdfjsLib, Worker, document: { body: null },
      chrome: { runtime: { getURL: path => `chrome-extension://test-extension-id/${path}` } }
    };
    vm.runInNewContext(source, context);
    expect(context.__PDF_READY__).toBe(true);
    expect(context.PDFJS).toBe(pdfjsLib);
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBe('chrome-extension://test-extension-id/lib/pdfjs/pdf.worker.min.js');
    expect(context.Worker).toBe(Worker);
    expect(new context.Worker('tts-worker.js').url).toBe('tts-worker.js');
  });

  it('does not mark an unavailable library as ready', () => {
    const context = {};
    expect(() => vm.runInNewContext(source, context)).toThrow('PDF.js is unavailable');
    expect(context.__PDF_READY__).toBe(false);
  });
});
