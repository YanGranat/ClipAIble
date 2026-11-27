// @ts-check
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, readGeminiImageModel, readOpenRouterImageModel, isImageTranslationEnabled } from '../../scripts/api/image-translation-catalog.js';
import { DEFAULT_GOOGLE_TTS_MODEL, DEFAULT_OPENROUTER_TTS_MODEL, DEFAULT_QWEN_TTS_MODEL, getDefaultTtsVoice } from '../../scripts/api/tts-catalog.js';
import { getImageRequirementIssue, getAudioRequirementIssue, getLocalModelIssue, requiresTextModel, supportsCustomNarration, supportsDocumentAbstract } from '../../scripts/processing/export-requirements.js';
import { AUDIO_PREPARATION_PROMPT_KEY, readPromptOverrides } from '../../scripts/settings/prompt-catalog.js';
import { isProviderModelReady, resolveProviderApiKey, readApiKeyDraft } from '../utils/settings-helpers.js';
import { isMaskedKey } from '../../scripts/utils/security/encryption.js';
import { getOpenAiKeyValidationError } from '../utils/api-key-validation.js';
import { OPENROUTER_KEY_SLOTS } from '../../scripts/utils/storage/openrouter-key-slots.js';

/** Read only configuration used by the export admission check. */
export function readExportOptions(elements, getProviderFromModel, getVoiceIdByIndex) {
  const model = elements.modelSelect?.value || '';
  const provider = elements.apiProviderSelect?.value || getProviderFromModel(model);
  const mode = elements.modeSelect?.value || 'automatic';
  const language = elements.languageSelect?.value || 'auto';
  const outputFormat = elements.mainFormatSelect?.value || elements.outputFormat?.value || 'pdf';
  const audioProvider = elements.audioProvider?.value || 'openai';
  const imageTranslationProvider = elements.imageTranslationProvider?.value || DEFAULT_IMAGE_TRANSLATION_PROVIDER;
  const geminiImageModel = readGeminiImageModel(elements.geminiImageModel?.value);
  const translateImages = isImageTranslationEnabled({ translateImages: elements.translateImages?.checked, language, outputFormat });
  const generateAbstract = supportsDocumentAbstract(mode, outputFormat) && !!elements.generateAbstract?.checked;
  const voice = elements.audioVoice;
  const option = voice?.options[voice.selectedIndex];
  const validVoiceList = !voice?.dataset.provider || voice.dataset.provider === audioProvider;
  const qwenModel = elements.qwenModel?.value || DEFAULT_QWEN_TTS_MODEL;
  const selectedVoice = option?.dataset.voiceId || option?.value || voice?.value || '';
  const voiceId = /^\d+$/.test(selectedVoice) ? getVoiceIdByIndex?.(audioProvider, voice.selectedIndex) : selectedVoice;
  const usableVoice = audioProvider !== 'offline' || !/^\d+$/.test(selectedVoice) || /[_-]/.test(voiceId || '');
  const audioVoice = (usableVoice && voiceId) || getDefaultTtsVoice(audioProvider, qwenModel);
  const openrouterTtsModel = elements.openrouterTtsModel?.value || DEFAULT_OPENROUTER_TTS_MODEL;
  const openrouterTtsVoice = elements.openrouterTtsVoice?.value || undefined;
  return {
    model: isProviderModelReady(elements.modelSelect, provider) ? model : '',
    validModelList: isProviderModelReady(elements.modelSelect, provider),
    needsTextModel: requiresTextModel(mode, language, outputFormat, audioProvider),
    provider, mode, language, outputFormat, audioProvider, translateImages, imageTranslationProvider, geminiImageModel, generateAbstract,
    validVoice: ['google', 'openrouter'].includes(audioProvider) || (validVoiceList && !option?.disabled), audioVoice,
    openrouterImageModel: readOpenRouterImageModel(elements.openrouterImageModel?.value),
    openrouterTtsModel, openrouterTtsVoice,
    elevenlabsApiKey: readApiKeyDraft(elements.elevenlabsApiKey),
    googleTtsApiKey: readApiKeyDraft(elements.googleTtsApiKey),
    qwenApiKey: readApiKeyDraft(elements.qwenApiKey),
    respeecherApiKey: readApiKeyDraft(elements.respeecherApiKey),
    googleTtsModel: elements.googleTtsModel?.value || DEFAULT_GOOGLE_TTS_MODEL,
    googleTtsVoice: elements.googleTtsVoice?.value || 'Callirrhoe',
    qwenModel, qwenWorkspaceId: elements.qwenWorkspaceId?.value.trim() || '', qwenRegion: elements.qwenRegion?.value || 'singapore'
  };
}

/** @returns {import('../../scripts/types.js').LocalizedMessage|null} */
export function getExportPageIssue(tab) {
  if (!tab?.id) return { key: 'errorTabNotFound' };
  if (!tab.url || /^(?:chrome|chrome-extension|edge|about):/.test(tab.url)) return { key: 'pageNotAccessible' };
  return null;
}

/** @returns {import('../../scripts/types.js').LocalizedMessage|null} */
export function getExportSelectionIssue(options) {
  if (options.outputFormat === 'audio' && !options.validVoice) return { key: 'selectNarratorVoice' };
  if (options.needsTextModel && !options.validModelList) return { key: 'errorProviderModelsLoading' };
  if (options.needsTextModel && !options.model) return { key: 'errorExportModelRequired' };
  return null;
}

async function readOpenRouterMediaKey(input, slot) {
  const draft = input?.value.trim() || '';
  if (draft && !isMaskedKey(draft)) return draft;
  const saved = (await chrome.storage.local.get([slot]))[slot];
  return typeof saved === 'string' ? saved : '';
}

/** @returns {Promise<{issue: import('../../scripts/types.js').LocalizedMessage|null, apiKey: string, imageApiKey: string, openrouterTtsApiKey: string, audioPreparationPrompt: string|null}>} */
export async function inspectExportRequirements(options, inputs, decrypt, translate, sourceUrl = '') {
  let apiKey = '';
  let imageApiKey = '';
  let openrouterTtsApiKey = '';
  let audioPreparationPrompt = null;
  const result = (issue = null) => ({ issue, apiKey, imageApiKey, openrouterTtsApiKey, audioPreparationPrompt });
  const { provider, mode, language, outputFormat, audioProvider } = options;
  if (supportsCustomNarration(outputFormat, audioProvider)) {
    try {
      audioPreparationPrompt = readPromptOverrides(await chrome.storage.local.get([AUDIO_PREPARATION_PROMPT_KEY])).audioPreparation ?? null;
    } catch {
      return result({ key: 'promptLoadFailed' });
    }
  }
  const needsTextModel = options.needsTextModel || requiresTextModel(mode, language, outputFormat, audioProvider, sourceUrl, audioPreparationPrompt);

  const selectionIssue = getExportSelectionIssue({ ...options, needsTextModel });
  if (selectionIssue) return result(selectionIssue);
  if (needsTextModel) {
    try {
      apiKey = await resolveProviderApiKey(inputs.apiKey, provider, decrypt, translate);
    } catch (error) {
      return result({ key: error.translationKey || 'errorApiKeyRead', params: error.translationParams });
    }
    const labels = { openai: 'OpenAi', gemini: 'Gemini', grok: 'Grok', openrouter: 'OpenRouter', claude: 'Claude', deepseek: 'DeepSeek' };
    if (!apiKey?.trim()) return result({ key: Object.hasOwn(labels, provider) ? `pleaseEnter${labels[provider]}ApiKey` : 'errorNoApiKey' });
  }

  const usesOpenAiImage = options.translateImages && options.imageTranslationProvider === 'openai';
  const imageInput = usesOpenAiImage ? inputs.openaiImageKey?.value.trim() || '' : '';
  const useSavedImageKey = isMaskedKey(imageInput);
  const openAiImageDraft = useSavedImageKey ? '' : imageInput;
  if (openAiImageDraft) {
    const invalidKey = getOpenAiKeyValidationError(openAiImageDraft);
    if (invalidKey) return result({ key: invalidKey });
  }
  const articleOpenAiKey = provider === 'openai' && !useSavedImageKey ? apiKey : '';
  const usesStoredOpenAi = (options.outputFormat === 'audio' && options.audioProvider === 'openai') ||
    (usesOpenAiImage && !openAiImageDraft && !articleOpenAiKey);
  let openaiKey = '';
  if (usesStoredOpenAi) {
    try {
      const saved = (await chrome.storage.local.get(['openai_api_key'])).openai_api_key;
      openaiKey = typeof saved === 'string' ? saved : '';
    } catch {
      return result({ key: options.outputFormat === 'audio' ? 'errorAudioKeyRead' : 'errorApiKeyRead' });
    }
  }
  const usesOpenRouterImage = options.translateImages && options.imageTranslationProvider === 'openrouter';
  const usesOpenRouterSpeech = options.outputFormat === 'audio' && options.audioProvider === 'openrouter';
  if (usesOpenRouterSpeech) {
    try {
      openrouterTtsApiKey = await readOpenRouterMediaKey(inputs.openrouterTtsKey, OPENROUTER_KEY_SLOTS.speech);
    } catch {
      return result({ key: 'errorAudioKeyRead' });
    }
  }
  if (options.translateImages) {
    if (usesOpenRouterImage) {
      try {
        imageApiKey = await readOpenRouterMediaKey(inputs.openrouterImageKey, OPENROUTER_KEY_SLOTS.image);
      } catch {
        return result({ key: 'errorApiKeyRead' });
      }
    } else if (usesOpenAiImage) {
      imageApiKey = openAiImageDraft || articleOpenAiKey || openaiKey;
    } else {
      try {
        imageApiKey = await resolveProviderApiKey(
          inputs.googleApiKey && { value: inputs.googleApiKey.value, dataset: { ...inputs.googleApiKey.dataset, provider: 'google' } },
          'google', decrypt, translate
        );
      } catch (error) {
        return result({ key: error.translationKey || 'errorApiKeyRead', params: error.translationParams });
      }
    }
    const imageIssue = getImageRequirementIssue({ ...options, imageApiKey });
    if (imageIssue) return result(imageIssue);
  }
  return result(await getLocalModelIssue(options) || getAudioRequirementIssue({ ...options, openrouterTtsApiKey }, openaiKey));
}
