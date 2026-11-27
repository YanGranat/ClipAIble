import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { initAudio } from '../../popup/settings/audio.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { changeSupertonicModel, getSupertonicModelStatus } from '../../scripts/api/supertonic-model.js';
import { SUPERTONIC_DOWNLOAD_BYTES, SUPERTONIC_MODEL_STATUS_KEY } from '../../scripts/api/supertonic-config.js';
import { UI_LOCALES } from '../../scripts/locales.js';

vi.mock('../../scripts/api/supertonic-model.js', () => ({ changeSupertonicModel: vi.fn(), getSupertonicModelStatus: vi.fn() }));

let dom, elements, audio, audioVoiceMap, save;
const popup = readFileSync(new URL('../../popup/popup.html', import.meta.url), 'utf8');

beforeEach(() => {
  getSupertonicModelStatus.mockReset();
  changeSupertonicModel.mockReset();
  dom = new JSDOM(popup);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Option', dom.window.Option);
  elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
  save = vi.fn();
  audioVoiceMap = { current: {} };
  audio = initAudio({ elements, STORAGE_KEYS, audioVoiceMap, debouncedSaveSettings: save, getElement: id => elements[id],
    setElementGroupDisplay(id, display) {
      elements[id].style.display = display;
      elements[id].classList.toggle('hidden', display === 'none');
    } });
});

afterEach(() => {
  audio.hideAllAudioFields();
  dom.window.close();
  vi.unstubAllGlobals();
});

function selectProvider(provider, format = 'audio') {
  elements.mainFormatSelect.value = format;
  elements.audioProvider.value = provider;
  audio.updateAudioProviderUI();
}

function publishStatus(status) {
  const listener = chrome.storage.onChanged.addListener.mock.lastCall[0];
  listener({ [SUPERTONIC_MODEL_STATUS_KEY]: { newValue: status } }, 'local');
}

describe('Supertonic settings', () => {
  it('shows the model controls only for Supertonic audio, with the Piper selection available', () => {
    getSupertonicModelStatus.mockResolvedValue({ state: 'missing' });
    expect(elements.audioProvider.options[0].value).toBe('offline');
    selectProvider('supertonic', 'pdf');
    expect(elements.supertonicModelGroup.classList.contains('hidden')).toBe(true);
    expect(getSupertonicModelStatus).not.toHaveBeenCalled();
    selectProvider('supertonic');
    expect(elements.supertonicModelGroup.classList.contains('hidden')).toBe(false);
    expect(getSupertonicModelStatus).toHaveBeenCalledOnce();
    selectProvider('offline');
    expect(elements.supertonicModelGroup.classList.contains('hidden')).toBe(true);
    expect(elements.audioVoice.value).toBe('en_US-lessac-medium');
  });

  it('uses only its own ten voices, preserves the saved voice, and applies the supported speed range', () => {
    getSupertonicModelStatus.mockResolvedValue({ state: 'missing' });
    audioVoiceMap.current = { offline: 'en_US-amy-medium', supertonic: 'M2' };
    elements.audioSpeed.value = '1.8';
    selectProvider('supertonic');
    expect([...elements.audioVoice.options].map(option => option.value)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']);
    expect(elements.audioVoice.value).toBe('M2');
    expect([elements.audioSpeed.min, elements.audioSpeed.max, elements.audioSpeed.value]).toEqual(['0.7', '1.3', '1.3']);
    expect(save).not.toHaveBeenCalled();
    selectProvider('offline');
    expect(elements.audioVoice.value).toBe('en_US-amy-medium');
    expect(elements.audioSpeed.value).toBe('1.8');
    audioVoiceMap.current.supertonic = 'unknown-voice';
    selectProvider('supertonic');
    expect(elements.audioVoice.value).toBe('F1');
    expect(audioVoiceMap.current).toEqual({ offline: 'en_US-amy-medium', supertonic: 'F1' });
  });

  it('renders a restored speed in the open popup and keeps it across provider bounds', () => {
    selectProvider('offline');
    elements.audioSpeed.value = '1.1';
    elements.audioSpeed.dispatchEvent(new dom.window.Event('input'));
    audio.restoreAudioSpeed('1.8');
    audio.updateAudioProviderUI();
    expect(elements.audioSpeed.value).toBe('1.8');
    expect(elements.audioSpeedValue.textContent).toBe('1.8x');
    selectProvider('supertonic');
    expect(elements.audioSpeed.value).toBe('1.3');
    selectProvider('offline');
    expect(elements.audioSpeed.value).toBe('1.8');
  });

  it('displays an explicit download, accessible progress, and deletion when installed', async () => {
    document.documentElement.lang = 'ru';
    getSupertonicModelStatus.mockResolvedValue({ state: 'missing' });
    changeSupertonicModel.mockResolvedValueOnce({ state: 'downloading', loaded: 0, total: SUPERTONIC_DOWNLOAD_BYTES });
    selectProvider('supertonic');
    await vi.waitFor(() => expect(elements.supertonicModelAction.textContent).toBe('Скачать модель (401 МБ)'));
    expect(elements.supertonicModelProgressRow.hidden).toBe(true);
    expect(elements.supertonicModelStatus.getAttribute('role')).toBe('status');
    elements.supertonicModelAction.click();
    await vi.waitFor(() => expect(elements.supertonicModelAction.dataset.i18n).toBe('cancel'));
    expect(changeSupertonicModel).toHaveBeenCalledExactlyOnceWith('download');
    publishStatus({ state: 'downloading', loaded: SUPERTONIC_DOWNLOAD_BYTES / 2, total: SUPERTONIC_DOWNLOAD_BYTES });
    expect(elements.supertonicModelProgressRow.hidden).toBe(false);
    expect(elements.supertonicModelProgress.position).toBeCloseTo(0.5);
    expect(elements.supertonicModelProgressText.textContent).toMatch(/50\s*%/);
    publishStatus({ state: 'ready' });
    expect(elements.supertonicModelStatus.dataset.i18n).toBe('supertonicModelReady');
    expect(elements.supertonicModelProgressRow.hidden).toBe(true);
    expect(elements.supertonicModelAction.textContent).toBe('Удалить модель');
    changeSupertonicModel.mockResolvedValueOnce({ state: 'missing' });
    elements.supertonicModelAction.click();
    expect(changeSupertonicModel).toHaveBeenLastCalledWith('delete');
    await vi.waitFor(() => expect(elements.supertonicModelAction.textContent).toBe('Скачать модель (401 МБ)'));
  });

  it('reformats an unchanged download snapshot when the interface language changes', async () => {
    document.documentElement.lang = 'fr';
    getSupertonicModelStatus.mockResolvedValue({ state: 'downloading', loaded: 48, total: 100 });
    selectProvider('supertonic');
    await vi.waitFor(() => expect(elements.supertonicModelProgressText.textContent)
      .toBe(new Intl.NumberFormat('fr', { style: 'percent' }).format(0.48)));

    document.documentElement.lang = 'en';
    audio.refreshLocalization();
    expect(elements.supertonicModelProgressText.textContent).toBe('48%');
    expect(elements.supertonicModelProgress.value).toBe(48);
    expect(getSupertonicModelStatus).toHaveBeenCalledOnce();
  });

  it('cancels one download, waits for admission, and exposes retry after a failure', async () => {
    getSupertonicModelStatus.mockResolvedValue({ state: 'downloading' });
    let complete;
    changeSupertonicModel.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    selectProvider('supertonic');
    await vi.waitFor(() => expect(elements.supertonicModelAction.dataset.i18n).toBe('cancel'));
    expect(elements.supertonicModelProgress.hasAttribute('value')).toBe(false);
    elements.supertonicModelAction.click();
    expect(elements.supertonicModelAction.disabled).toBe(true);
    elements.supertonicModelAction.click();
    expect(changeSupertonicModel).toHaveBeenCalledExactlyOnceWith('cancel');
    publishStatus({ state: 'error' });
    complete({ state: 'downloading' });
    await vi.waitFor(() => expect(elements.supertonicModelAction.disabled).toBe(false));
    expect(elements.supertonicModelAction.dataset.i18n).toBe('supertonicRetryDownload');
    expect(elements.supertonicModelProgressRow.hidden).toBe(true);
  });

  it('keeps a newer storage event when a status check returns late', async () => {
    let complete;
    getSupertonicModelStatus.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    selectProvider('supertonic');
    expect(elements.supertonicModelAction.hidden).toBe(true);
    publishStatus({ state: 'ready' });
    complete({ state: 'missing' });
    await Promise.resolve();
    expect(elements.supertonicModelStatus.dataset.i18n).toBe('supertonicModelReady');
  });

  it('keeps the model installed and explains why it cannot be deleted during synthesis', async () => {
    getSupertonicModelStatus.mockResolvedValue({ state: 'ready' });
    changeSupertonicModel.mockRejectedValueOnce(Object.assign(new Error('Busy'), { translationKey: 'supertonicBusy' }));
    selectProvider('supertonic');
    await vi.waitFor(() => expect(elements.supertonicModelAction.dataset.i18n).toBe('supertonicRemoveModel'));
    elements.supertonicModelAction.click();
    await vi.waitFor(() => expect(elements.supertonicModelStatus.dataset.i18n).toBe('supertonicBusy'));
    expect(elements.supertonicModelAction.dataset.i18n).toBe('supertonicRemoveModel');
    expect(elements.supertonicModelAction.disabled).toBe(false);
  });

  it('checks again after a failed status request without starting a download', async () => {
    getSupertonicModelStatus.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ state: 'ready' });
    selectProvider('supertonic');
    await vi.waitFor(() => expect(elements.supertonicModelAction.dataset.i18n).toBe('supertonicCheckAgain'));
    elements.supertonicModelAction.click();
    await vi.waitFor(() => expect(elements.supertonicModelStatus.dataset.i18n).toBe('supertonicModelReady'));
    expect(changeSupertonicModel).not.toHaveBeenCalled();
  });

  it('provides every model label and error in each of the supported locales', () => {
    const expected = Object.keys(UI_LOCALES.en).filter(key => key.startsWith('supertonic'));
    expect(expected.length).toBeGreaterThan(10);
    for (const locale of Object.values(UI_LOCALES)) {
      expect(Object.keys(locale).filter(key => key.startsWith('supertonic'))).toEqual(expected);
      expect(locale.supertonicDownloadModel).toContain('{size}');
    }
  });
});
