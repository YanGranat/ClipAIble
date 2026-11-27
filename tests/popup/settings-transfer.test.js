// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupPanelHandlers } from '../../popup/handlers/panels.js';
import { showPdfFileSelectionDialog } from '../../popup/utils/pdf-dialog.js';
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
  vi.stubGlobal('chrome', { runtime: { sendMessage: send }, storage: { local: { get: async () => ({ ui_language: 'de' }) } } });
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

it.each(['Escape', 'confirm'])('returns from a PDF prompt to the pending settings review via %s', async dismissal => {
  const pressEscape = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await openImport();
  elements.settingsTransferOverwrite.checked = true;
  const pending = showPdfFileSelectionDialog();
  await vi.waitFor(() => expect(elements.pdfFileSelectionModal.classList.contains('hidden')).toBe(false));
  try {
    expect(Boolean(elements.pdfFileSelectionModal.inert)).toBe(false);
    expect(review.inert).toBe(true);
    expect(document.activeElement).toBe(elements.pdfFileSelectionModalOk);
    if (dismissal === 'Escape') pressEscape();
    else elements.pdfFileSelectionModalOk.click();
    expect(await pending).toBe(dismissal === 'confirm');
    expect(review.classList.contains('hidden')).toBe(false);
    expect(Boolean(review.inert)).toBe(false);
    expect(document.activeElement).toBe(cancel);
    expect(elements.settingsTransferOverwrite.checked).toBe(true);
    pressEscape();
    expect(Boolean(document.querySelector('.container').inert)).toBe(false);
    expect(document.activeElement).toBe(elements.importSettingsBtn);
    expect(send).not.toHaveBeenCalled();
  } finally {
    elements.pdfFileSelectionModalClose.click();
    cancel.click();
  }
});

it('imports optional categories only after approval and preserves unchecked choices', async () => {
  await openImport();
  expect(elements.settingsTransferDataMode.hidden || elements.settingsTransferDataMode.classList.contains('hidden')).toBe(true);
  elements.settingsTransferStatistics.click();
  expect(elements.settingsTransferDataMode.disabled).toBe(false);
  expect(elements.settingsTransferAdd.checked).toBe(true);
  expect(elements.settingsTransferDataHint.textContent).toBe(tSync('backupDataAddStatsHint', 'de'));
  confirm.click();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
    action: 'importSettings', jsonData, options: { importStats: true, importCache: false, overwriteExisting: false, dataMode: 'add' }
  }));
  expect(nativeConfirm).not.toHaveBeenCalled();
});

it('warns before a replacement and never selects settings overwrite implicitly', async () => {
  await openImport();
  elements.settingsTransferCache.click();
  elements.settingsTransferReplace.click();
  expect(elements.settingsTransferDataHint.textContent).toBe(tSync('backupDataReplaceHint', 'de'));
  expect(confirm.textContent).toBe(tSync('backupReplaceConfirm', 'de'));
  expect(elements.settingsTransferOverwrite.checked).toBe(false);
  expect(send).not.toHaveBeenCalled();
  confirm.click();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
    action: 'importSettings', jsonData,
    options: { importStats: false, importCache: true, overwriteExisting: false, dataMode: 'replace' }
  }));
});

it('clears a destructive choice when the last selected section is unchecked', async () => {
  await openImport();
  elements.settingsTransferStatistics.click();
  elements.settingsTransferReplace.click();
  elements.settingsTransferStatistics.click();
  expect(elements.settingsTransferDataMode.disabled).toBe(true);
  elements.settingsTransferCache.click();
  expect(elements.settingsTransferAdd.checked).toBe(true);
  expect(elements.settingsTransferDataHint.textContent).toBe(tSync('backupDataAddCacheHint', 'de'));
  expect(confirm.textContent).toBe(tSync('backupImportConfirm', 'de'));
  cancel.click();
  expect(send).not.toHaveBeenCalled();
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

it.each(['import', 'export'])('localizes the %s failure without displaying Chrome transport details', async mode => {
  send.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
  if (mode === 'import') await openImport();
  else {
    elements.exportSettingsBtn.click();
    await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  }
  confirm.click();
  const key = mode === 'import' ? 'errorSettingsImportFailed' : 'errorSettingsExportFailed';
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(tSync(key, 'de'), 'error', { key, params: {} }));
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
  expect(elements.settingsTransferDataMode.disabled).toBe(true);
  elements.settingsTransferCache.checked = true;
  confirm.click();
  await vi.waitFor(() => expect(send).toHaveBeenCalledExactlyOnceWith({
    action: 'exportSettings', includeStats: false, includeCache: true
  }));
  expect(download).toHaveBeenCalledOnce();
});

it('downloads a partial backup and keeps its readable sections and warning visible', async () => {
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:settings'; }
    static revokeObjectURL() {}
  });
  send.mockResolvedValueOnce({
    success: true, data: JSON.stringify({ settings: {}, statistics: { totalSaved: 2 } }),
    includesStatistics: true, includesCache: false, warnings: [{ key: 'backupExportCacheUnreadable' }]
  });
  const feedback = elements.settingsExportFeedback;
  feedback.scrollIntoView = vi.fn();
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  elements.settingsTransferStatistics.click();
  elements.settingsTransferCache.click();
  confirm.click();
  await vi.waitFor(() => expect(feedback.hidden).toBe(false));
  expect(download).toHaveBeenCalledOnce();
  expect(showToast).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(feedback.scrollIntoView).toHaveBeenCalledWith({ block: 'end' }));
  expect(feedback.textContent).toBe(['backupExportPartial', 'backupExportStatisticsIncluded', 'backupExportCacheUnreadable']
    .map(key => tSync(key, 'de')).join(' '));
  expect(JSON.parse(feedback.dataset.i18nParts).filter(part => part.key).map(part => part.key))
    .toEqual(['backupExportPartial', 'backupExportStatisticsIncluded', 'backupExportCacheUnreadable']);

  await vi.waitFor(() => expect(elements.exportSettingsBtn.disabled).toBe(false));
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  cancel.click();
  expect(feedback.hidden).toBe(false);
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  confirm.click();
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(tSync('settingsExportedSuccessfully', 'de'), 'success',
    { key: 'settingsExportedSuccessfully' }));
  expect(download).toHaveBeenCalledTimes(2);
  expect(feedback.hidden).toBe(true);
});

it('does not offer a download or claim success when the worker returns no backup data', async () => {
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:settings'; }
    static revokeObjectURL() {}
  });
  send.mockResolvedValueOnce({ success: true });
  elements.exportSettingsBtn.click();
  await vi.waitFor(() => expect(review.classList.contains('hidden')).toBe(false));
  confirm.click();
  await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith(tSync('errorSettingsExportFailed', 'de'), 'error',
    { key: 'errorSettingsExportFailed', params: {} }));
  expect(download).not.toHaveBeenCalled();
  expect(elements.settingsExportFeedback.hidden).toBe(true);
});
