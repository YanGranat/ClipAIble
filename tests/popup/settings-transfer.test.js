// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupPanelHandlers } from '../../popup/handlers/panels.js';
import { tSync, UI_LOCALES } from '../../scripts/locales.js';

let elements, send, review, confirm, cancel, nativeConfirm, showToast;
const jsonData = JSON.stringify({ settings: { output_format: 'markdown' }, statistics: {}, selectorCache: {} });

beforeEach(() => {
  const html = readFileSync('popup/popup.html', 'utf8');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
  elements.settingsPanel.classList.add('open');
  review = elements.settingsTransferModal;
  confirm = elements.settingsTransferConfirm;
  cancel = elements.settingsTransferCancel;
  nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  send = vi.fn(async ({ action }) => action === 'exportSettings' ? { data: jsonData } : {
    result: { settingsImported: 0, settingsSkipped: 1, warnings: [], errors: [] }
  });
  showToast = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  setupPanelHandlers({ elements, t: async key => tSync(key, 'de'), getUILanguage: async () => 'de', UI_LOCALES,
    log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), showToast, loadAndDisplayStats: vi.fn(), deferAsyncWork: vi.fn() });
});

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function selectImportFile(data) {
  const file = new File([data], 'settings.json', { type: 'application/json' });
  Object.defineProperty(elements.importFileInput, 'files', { configurable: true, value: [file] });
  elements.importFileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

async function openImport(data = jsonData) {
  selectImportFile(data);
  await vi.waitFor(() => {
    expect(send).not.toHaveBeenCalled();
    expect(review.classList.contains('hidden')).toBe(false);
  });
}

it.each(['button', 'keyboard'])('cancels a selected import file with no worker request via %s', async exit => {
  await openImport();
  expect(review.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
  expect(review.querySelector('h3').textContent).toBe(tSync('importSettings', 'de'));
  expect(document.activeElement).toBe(cancel);
  elements.settingsTransferOverwrite.checked = true;
  if (exit === 'button') cancel.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(true));
  expect(send).not.toHaveBeenCalled();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(elements.importSettingsBtn);
});

it('imports optional categories only after approval and preserves unchecked choices', async () => {
  await openImport();
  elements.settingsTransferStatistics.checked = true;
  confirm.click();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
    action: 'importSettings', jsonData, options: { importStats: true, importCache: false, overwriteExisting: false }
  }));
  expect(nativeConfirm).not.toHaveBeenCalled();
});

it('omits unavailable import data instead of showing an empty choice', async () => {
  await openImport(JSON.stringify({ settings: {} }));
  expect(elements.settingsTransferStatistics.disabled).toBe(true);
  expect(elements.settingsTransferCache.disabled).toBe(true);
  expect(elements.settingsTransferOverwrite.disabled).toBe(false);
  cancel.click();
  expect(send).not.toHaveBeenCalled();
});

it('shows localized recovery guidance for an unreadable file and accepts the next selection', async () => {
  const key = 'errorImportJsonParseFailed';
  selectImportFile('not JSON');
  await vi.waitFor(() => {
    expect(showToast).toHaveBeenCalledExactlyOnceWith(tSync(key, 'de'), 'error', { key, params: {} });
    expect(review.classList.contains('hidden')).toBe(true);
  });
  await openImport();
  expect(elements.settingsTransferStatistics.checked).toBe(false);
  expect(elements.settingsTransferCache.checked).toBe(false);
  cancel.click();
  expect(send).not.toHaveBeenCalled();
});

it('cancels export and allows a fresh review with explicit optional choices', async () => {
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  cancel.click();
  expect(send).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(elements.exportSettingsBtn);
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:settings'; }
    static revokeObjectURL() {}
  });
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  expect(elements.settingsTransferOverwrite.disabled).toBe(true);
  elements.settingsTransferCache.checked = true;
  confirm.click();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
    action: 'exportSettings', includeStats: false, includeCache: true
  }));
  expect(download).toHaveBeenCalledOnce();
});
