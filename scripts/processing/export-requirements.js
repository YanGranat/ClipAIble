// @ts-check
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, IMAGE_TRANSLATION_PROVIDERS, getImageTranslationApiKey, isGeminiImageModel, isOpenRouterImageModel, isImageTranslationEnabled } from '../api/image-translation-catalog.js';
import { DEFAULT_OPENAI_TTS_VOICE, DEFAULT_QWEN_TTS_MODEL, getQwenTtsEndpoint, OPENAI_TTS_VOICES, resolveGoogleTtsSelection, resolveOpenRouterTtsSelection } from '../api/tts-catalog.js';
import { isMaskedKey } from '../utils/security/encryption.js';
import { detectVideoPlatform } from '../utils/video.js';
import { isLocalSpeechProvider } from '../api/supertonic-config.js';
import { getSupertonicModelStatus } from '../api/supertonic-model.js';

export function supportsDocumentAbstract(mode, format) {
  return (mode === 'selector' || mode === 'extract') && format !== 'audio';
}

export function supportsCustomNarration(format, audioProvider) {
  return format === 'audio' && !isLocalSpeechProvider(audioProvider);
}

/** @returns {Promise<import('../types.js').LocalizedMessage|null>} */
export async function getLocalModelIssue(data) {
  if (data.outputFormat !== 'audio' || data.audioProvider !== 'supertonic') return null;
  try {
    return (await getSupertonicModelStatus()).state === 'ready' ? null : { key: 'supertonicDownloadRequired' };
  } catch { return { key: 'supertonicOperationFailed' }; }
}

export function requiresTextModel(mode, language, format, audioProvider, sourceUrl = '', audioPreparationPrompt = null) {
  return (mode === 'selector' || mode === 'extract') || (language && language !== 'auto') ||
    Boolean(detectVideoPlatform(sourceUrl) || (supportsCustomNarration(format, audioProvider) && audioPreparationPrompt));
}

/** @returns {import('../types.js').LocalizedMessage|null} */
export function getImageRequirementIssue(data) {
  if (!isImageTranslationEnabled(data)) return null;
  const provider = data.imageTranslationProvider ?? DEFAULT_IMAGE_TRANSLATION_PROVIDER;
  if (!IMAGE_TRANSLATION_PROVIDERS.includes(provider)) {
    return { key: 'errorImageProviderUnsupported', params: { provider: String(provider) } };
  }
  if (provider === 'gemini' && data.geminiImageModel !== undefined && !isGeminiImageModel(data.geminiImageModel)) {
    return { key: 'errorImageModelUnsupported' };
  }
  if (provider === 'openrouter' && data.openrouterImageModel !== undefined && !isOpenRouterImageModel(data.openrouterImageModel)) {
    return { key: 'errorImageModelUnsupported' };
  }
  const key = getImageTranslationApiKey(data);
  if (typeof key === 'string' && key.trim() && !isMaskedKey(key.trim())) return null;
  return { key: 'errorImageKeyRequired', params: { provider: { openai: 'OpenAI', gemini: 'Google', openrouter: 'OpenRouter' }[provider] } };
}

/** @returns {import('../types.js').LocalizedMessage|null} */
export function getAudioVoiceIssue(data) {
  if (data.outputFormat === 'audio' && (!data.audioProvider || data.audioProvider === 'openai')) {
    const voice = data.audioVoice === undefined ? DEFAULT_OPENAI_TTS_VOICE : data.audioVoice;
    if (!OPENAI_TTS_VOICES.includes(voice)) return { key: 'errorOpenaiVoiceUnavailable', params: { voice: String(voice) } };
  }
  return null;
}

/** @returns {import('../types.js').LocalizedMessage|null} */
export function getAudioRequirementIssue(data, openaiKey) {
  if (data.outputFormat !== 'audio' || isLocalSpeechProvider(data.audioProvider)) return null;
  const provider = data.audioProvider || 'openai';
  const voiceIssue = getAudioVoiceIssue(data);
  if (voiceIssue) return voiceIssue;
  const providers = {
    openai: [openaiKey, 'OpenAI'],
    elevenlabs: [data.elevenlabsApiKey, 'ElevenLabs'],
    qwen: [data.qwenApiKey, 'Qwen'],
    respeecher: [data.respeecherApiKey, 'Respeecher'],
    google: [data.googleTtsApiKey, 'Google TTS'],
    openrouter: [data.openrouterTtsApiKey, 'OpenRouter']
  };
  if (!Object.hasOwn(providers, provider)) return { key: 'errorUnknownAudioProvider', params: { provider } };
  const [key, name] = providers[provider];
  if (!key || (provider === 'openrouter' && (typeof key !== 'string' || !key.trim() || isMaskedKey(key.trim())))) {
    return { key: 'errorAudioApiKeyRequired', params: { provider: name } };
  }
  try {
    if (provider === 'qwen') getQwenTtsEndpoint(data.qwenModel || DEFAULT_QWEN_TTS_MODEL, data.qwenWorkspaceId, data.qwenRegion);
    if (provider === 'google') resolveGoogleTtsSelection(data.googleTtsModel, data.googleTtsVoice);
    if (provider === 'openrouter') resolveOpenRouterTtsSelection(data.openrouterTtsModel, data.openrouterTtsVoice);
  } catch (error) {
    return { key: error.translationKey, params: error.translationParams };
  }
  return null;
}
