// @ts-check
import { OPENROUTER_IMAGE_MODELS, readOpenRouterImageModel } from '../../scripts/api/image-translation-catalog.js';
import { DEFAULT_OPENROUTER_TTS_MODEL, OPENROUTER_TTS_MODELS, getOpenRouterTtsModel, findOpenRouterTtsVoice } from '../../scripts/api/tts-catalog.js';
import { STORAGE_KEYS } from '../constants.js';
import { refreshCustomSelectSelection } from '../utils/custom-select.js';
import { OPENROUTER_SPEECH_SETTINGS_KEY } from '../../scripts/api/openrouter-speech-options.js';
import { initOpenRouterSpeechOptions } from './openrouter-speech.js';

function replaceOptions(select, options, selected) {
  if (!select) return;
  select.replaceChildren(...options.map(([id, label]) => {
    const option = select.ownerDocument.createElement('option');
    option.value = id;
    option.textContent = label;
    return option;
  }));
  select.value = selected;
  refreshCustomSelectSelection(select);
}

export function initOpenRouterMedia(elements, save) {
  const { openrouterImageModel, openrouterTtsModel, openrouterTtsVoice } = elements;
  const speech = initOpenRouterSpeechOptions(elements, value => save(OPENROUTER_SPEECH_SETTINGS_KEY, value));
  const updateVoices = (model, voice) => {
    const entry = getOpenRouterTtsModel(model);
    const selected = findOpenRouterTtsVoice(entry, voice) ?? entry.voices[0];
    replaceOptions(openrouterTtsVoice, entry.voices.map(({ id, name }) => [id, name]), selected.id);
    speech.render(model, selected.id);
    return selected.id;
  };
  openrouterTtsModel?.addEventListener('change', () => {
    const model = openrouterTtsModel.value;
    const voice = updateVoices(model, openrouterTtsVoice?.value);
    save(STORAGE_KEYS.OPENROUTER_TTS_MODEL, model);
    save(STORAGE_KEYS.OPENROUTER_TTS_VOICE, voice);
  });
  openrouterTtsVoice?.addEventListener('change', () => {
    speech.render(openrouterTtsModel?.value || DEFAULT_OPENROUTER_TTS_MODEL, openrouterTtsVoice.value);
    save(STORAGE_KEYS.OPENROUTER_TTS_VOICE, openrouterTtsVoice.value);
  });
  return {
    restore(settings) {
      speech.restore(settings[OPENROUTER_SPEECH_SETTINGS_KEY]);
      const model = OPENROUTER_TTS_MODELS.find(entry => entry.id === settings[STORAGE_KEYS.OPENROUTER_TTS_MODEL])?.id || DEFAULT_OPENROUTER_TTS_MODEL;
      replaceOptions(openrouterImageModel, Object.entries(OPENROUTER_IMAGE_MODELS), readOpenRouterImageModel(settings[STORAGE_KEYS.OPENROUTER_IMAGE_MODEL]));
      replaceOptions(openrouterTtsModel, OPENROUTER_TTS_MODELS.map(entry => [entry.id, entry.name]), model);
      updateVoices(model, settings[STORAGE_KEYS.OPENROUTER_TTS_VOICE]);
    }
  };
}
