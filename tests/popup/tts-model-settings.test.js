import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { initAudio, restoreTtsSelect } from '../../popup/settings/audio.js';
import { STORAGE_KEYS } from '../../popup/constants.js';
import { setupAudioHandlers } from '../../popup/handlers/audio.js';

vi.mock('../../scripts/utils/logging.js', () => ({ logWarn: vi.fn() }));
let dom, elements, audio, saves, voices;
beforeEach(() => {
  dom = new JSDOM(readFileSync(new URL('../../popup/popup.html', import.meta.url), 'utf8'));
  vi.stubGlobal('document', dom.window.document); vi.stubGlobal('Option', dom.window.Option);
  elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
  elements.mainFormatSelect.value = 'audio'; elements.outputFormat.value = 'audio';
  saves = vi.fn(); voices = { current: {} };
  audio = initAudio({ elements, STORAGE_KEYS, debouncedSaveSettings: saves, audioVoiceMap: voices,
    getElement: id => elements[id], setElementGroupDisplay: (id, display) => { elements[id].style.display = display; } });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

it('uses current defaults and keeps a saved older model and custom voice visible', () => {
  expect(elements.googleTtsModel.value).toBe('gemini-3.8-flash-tts');
  expect(elements.elevenlabsModel.value).toBe('eleven_v4');
  expect([...elements.qwenModel.options].map(option => option.value)).not.toContain('qwen3-tts-flash-2025-11-27');
  restoreTtsSelect(elements.qwenModel, 'qwen3-tts-flash-2025-11-27');
  expect(elements.qwenModel.value).toBe('qwen3-tts-flash-2025-11-27');
  restoreTtsSelect(elements.elevenlabsModel, 'eleven_multilingual_v2');
  voices.current.elevenlabs = 'saved-custom-voice';
  elements.audioProvider.value = 'elevenlabs'; audio.updateAudioProviderUI();
  expect(elements.elevenlabsModel.value).toBe('eleven_multilingual_v2');
  expect(elements.audioVoice.value).toBe('saved-custom-voice');
  expect(saves).not.toHaveBeenCalled();
  restoreTtsSelect(elements.googleTtsModel, 'saved-unknown-model');
  expect(elements.googleTtsModel.value).toBe('saved-unknown-model');
});

it('keeps deprecated speech models out of new choices and restores saved selections', () => {
  const deprecatedModels = [
    [elements.googleTtsModel, 'gemini-3.1-flash-tts-preview'],
    [elements.googleTtsModel, 'gemini-2.5-pro-preview-tts'],
    [elements.googleTtsModel, 'gemini-2.5-flash-preview-tts'],
    [elements.elevenlabsModel, 'eleven_turbo_v2_5']
  ];
  for (const [select, model] of deprecatedModels) {
    expect([...select.options].some(option => option.value === model)).toBe(false);
    restoreTtsSelect(select, model);
    expect(select.value).toBe(model);
  }
  expect(saves).not.toHaveBeenCalled();
});

it('shows only the selected ElevenLabs model capabilities and preserves inactive values', () => {
  elements.audioProvider.value = 'elevenlabs'; elements.audioSpeed.value = '1.7'; elements.elevenlabsStyle.value = '0.4';
  audio.updateAudioProviderUI();
  expect(elements.audioSpeedGroup.style.display).toBe('none');
  expect(elements.elevenlabsStyle.closest('.setting-item').style.display).toBe('none');
  expect(elements.elevenlabsSimilarity.closest('.setting-item').style.display).toBe('');
  elements.elevenlabsModel.value = 'eleven_v3'; audio.updateAudioProviderUI();
  expect(elements.elevenlabsSimilarity.closest('.setting-item').style.display).toBe('none');
  elements.elevenlabsModel.value = 'eleven_flash_v2_5'; audio.updateAudioProviderUI();
  expect(elements.audioSpeedGroup.style.display).toBe('flex');
  expect(elements.elevenlabsStyle.closest('.setting-item').style.display).toBe('');
  expect(elements.audioSpeed.min).toBe('0.7'); expect(elements.audioSpeed.max).toBe('1.2');
  expect(elements.audioSpeed.value).toBe('1.2'); expect(elements.elevenlabsStyle.value).toBe('0.4');
  elements.audioProvider.value = 'openai'; audio.updateAudioProviderUI();
  expect(elements.audioSpeed.value).toBe('1.5');
  elements.audioProvider.value = 'offline'; audio.updateAudioProviderUI();
  expect(elements.audioSpeed.value).toBe('1.7');
});

it('shows workspace configuration for Qwen 3.1 and retains a saved legacy voice without inventing an alias', () => {
  elements.audioProvider.value = 'qwen'; audio.updateAudioProviderUI();
  expect(elements.qwenModel.value).toBe('qwen-audio-3.1-tts-flash');
  expect(elements.audioVoice.value).toBe('longanhuan_v3.1');
  expect(elements.qwenWorkspaceGroup.style.display).toBe('flex');
  voices.current.qwen = 'Elias'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('Elias');
  elements.qwenModel.value = 'qwen3-tts-flash'; audio.updateAudioProviderUI();
  expect(elements.qwenWorkspaceGroup.style.display).toBe('none');
  expect(elements.audioVoice.value).toBe('Elias');
});

it('restores provider-specific choices across switches and migrates only the invalid French alias', () => {
  voices.current.offline = 'fr_FR-mls_fr-medium'; elements.audioProvider.value = 'offline'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('fr_FR-mls-medium'); expect(voices.current.offline).toBe('fr_FR-mls-medium');
  elements.audioProvider.value = 'openai'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('marin');
  expect([...elements.audioVoice.options].map(option => option.value)).toEqual(expect.arrayContaining(['marin', 'cedar']));
  elements.audioProvider.value = 'offline'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('fr_FR-mls-medium');
});

it('keeps unavailable saved OpenAI voices visible without replacing preferences', () => {
  voices.current.openai = 'nova';
  elements.audioProvider.value = 'openai'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('nova');
  expect(voices.current.openai).toBe('nova');
  expect(saves).not.toHaveBeenCalled();
  expect(elements.audioVoice.selectedOptions[0].dataset.i18n).toBe('voiceUnavailable');
  expect(JSON.parse(elements.audioVoice.selectedOptions[0].dataset.i18nParams)).toEqual({ voice: 'nova' });
  for (const voice of ['fable', 'onyx']) expect([...elements.audioVoice.options].some(option => option.value === voice)).toBe(false);
  elements.audioProvider.value = 'offline'; audio.updateAudioProviderUI();
  elements.audioProvider.value = 'openai'; audio.updateAudioProviderUI();
  expect(elements.audioVoice.value).toBe('nova');
});

it('persists Qwen setup fields and updates model capabilities through the registered handlers', () => {
  setupAudioHandlers({ elements, STORAGE_KEYS, debouncedSaveSettings: saves, settingsModule: audio, log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() });
  elements.audioProvider.value = 'qwen';
  elements.qwenModel.value = 'qwen-audio-3.1-tts-plus'; elements.qwenModel.dispatchEvent(new dom.window.Event('change'));
  elements.qwenRegion.value = 'beijing'; elements.qwenRegion.dispatchEvent(new dom.window.Event('change'));
  elements.qwenWorkspaceId.value = ' sample-workspace '; elements.qwenWorkspaceId.dispatchEvent(new dom.window.Event('change'));
  expect(saves).toHaveBeenCalledWith('qwen_model', 'qwen-audio-3.1-tts-plus');
  expect(saves).toHaveBeenCalledWith('qwen_region', 'beijing');
  expect(saves).toHaveBeenCalledWith('qwen_workspace_id', 'sample-workspace');
  elements.audioProvider.value = 'elevenlabs';
  elements.elevenlabsModel.value = 'eleven_flash_v2_5'; elements.elevenlabsModel.dispatchEvent(new dom.window.Event('change'));
  expect(elements.audioSpeedGroup.style.display).toBe('flex');
  elements.elevenlabsModel.value = 'eleven_v4'; elements.elevenlabsModel.dispatchEvent(new dom.window.Event('change'));
  expect(elements.audioSpeedGroup.style.display).toBe('none');
});
