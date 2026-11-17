import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPdfFileSelection } from '../../scripts/api/pdf-file-picker.js';
import { tSync } from '../../scripts/locales.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', { documentElement: { lang: 'ru' } });
  chrome.storage.local.get.mockResolvedValue({ ui_language: 'ru' });
});
afterEach(() => vi.unstubAllGlobals());

describe('PDF file picker feedback', () => {
  it('opens with the current document language before any asynchronous language read', async () => {
    chrome.storage.local.get.mockImplementation(() => new Promise(() => {}));
    const picker = vi.fn(async () => []);
    vi.stubGlobal('window', { showOpenFilePicker: picker });
    const pending = requestPdfFileSelection();
    expect(picker).toHaveBeenCalledOnce();
    expect(picker.mock.calls[0][0].types[0].description).toBe(tSync('pdfFilesFilter', 'ru'));
    expect(picker.mock.calls[0][0].types[0].description).not.toBe('PDF files');
    expect(picker.mock.calls[0][0].types[0].description).not.toBe('pdfFilesFilter');
    await expect(pending).resolves.toBeNull();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('keeps native cancellation separate from file access failures', async () => {
    const picker = vi.fn(async () => { throw Object.assign(new Error('Selection dismissed'), { name: 'AbortError' }); });
    vi.stubGlobal('window', { showOpenFilePicker: picker });
    await expect(requestPdfFileSelection()).resolves.toBeNull();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('returns a localized file access descriptor for other native failures', async () => {
    vi.stubGlobal('window', { showOpenFilePicker: async () => { throw new Error('Native technical detail'); } });
    await expect(requestPdfFileSelection()).rejects.toMatchObject({ translationKey: 'errorPdfDataUnavailable',
      translationParams: {}, message: tSync('errorPdfDataUnavailable', 'ru') });
  });
});
