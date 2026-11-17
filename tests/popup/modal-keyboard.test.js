import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { showPdfFileSelectionDialog } from '../../popup/utils/pdf-dialog.js';

vi.mock('../../scripts/locales.js', () => ({ getUILanguage: async () => 'en', UI_LOCALES: { en: {} } }));
vi.mock('../../scripts/utils/logging.js', () => ({ logWarn: vi.fn(), logError: vi.fn() }));
let dom;
let opener;
let close;
let confirm;
beforeEach(() => {
  dom = new JSDOM('<main><button id="open">Open</button></main><div id="pdfFileSelectionModal" class="hidden"><div class="modal-dialog"><h3 id="pdfFileSelectionModalTitle">Select PDF</h3><button id="pdfFileSelectionModalClose">Close</button><button id="pdfFileSelectionModalOk">OK</button></div></div>');
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
  opener = document.getElementById('open'); close = document.getElementById('pdfFileSelectionModalClose'); confirm = document.getElementById('pdfFileSelectionModalOk');
  opener.focus();
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });
function key(value, shiftKey = false) { document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })); }

describe('PDF dialog keyboard lifecycle', () => {
  it('names the dialog, contains focus, and cancels with Escape', async () => {
    const response = showPdfFileSelectionDialog(); await Promise.resolve(); await Promise.resolve();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('pdfFileSelectionModalTitle');
    expect(document.activeElement).toBe(confirm);
    expect(document.querySelector('main').inert).toBe(true);
    key('Tab'); expect(document.activeElement).toBe(close);
    key('Tab', true); expect(document.activeElement).toBe(confirm);
    opener.focus(); expect(document.activeElement).toBe(confirm);
    key('Escape'); expect(await response).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(Boolean(document.querySelector('main').inert)).toBe(false);
  });

  it('preserves the existing OK and close click results across reopen', async () => {
    const first = showPdfFileSelectionDialog(); await Promise.resolve(); await Promise.resolve();
    confirm.click(); expect(await first).toBe(true);
    const second = showPdfFileSelectionDialog(); await Promise.resolve(); await Promise.resolve();
    close.click(); expect(await second).toBe(false);
    expect(document.activeElement).toBe(opener);
    key('Escape'); expect(document.activeElement).toBe(opener);
  });
});
