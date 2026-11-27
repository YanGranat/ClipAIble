// Quick save processing module for ClipAIble extension
// Handles quick save from context menu

// @ts-check

import { log, logError } from '../utils/logging.js';
import { getProcessingState } from '../state/processing.js';
import { tSync } from '../locales.js';
import { 
  determineProviderAndModel, 
  getProviderApiKey,
  getDecryptedProviderApiKey,
  getVoiceFromSettings,
  getAudioSpeedFromSettings
} from '../utils/settings-helpers.js';
import { CONFIG, STYLE_PRESETS } from '../utils/config.js';
import { DEFAULT_QWEN_TTS_MODEL, resolveGoogleTtsModel, resolveOpenRouterTtsSelection } from '../api/tts-catalog.js';
import { DEFAULT_IMAGE_TRANSLATION_PROVIDER, isImageTranslationEnabled, readGeminiImageModel, readOpenRouterImageModel } from '../api/image-translation-catalog.js';
import { requiresTextModel, supportsCustomNarration, supportsDocumentAbstract } from './export-requirements.js';
import { AUDIO_PREPARATION_PROMPT_KEY, readPromptOverrides } from '../settings/prompt-catalog.js';
import { OPENROUTER_KEY_SLOTS } from '../utils/storage/openrouter-key-slots.js';
import { OPENROUTER_SPEECH_SETTINGS_KEY, readOpenRouterSpeechProfiles, normalizeOpenRouterSpeechOptions } from '../api/openrouter-speech-options.js';

/**
 * Get all settings keys needed for quick save
 * @returns {Array<string>} Array of setting keys
 */
export function getQuickSaveSettingsKeys() {
  return [
    'openai_api_key', 'claude_api_key', 'gemini_api_key', 'grok_api_key', 'openrouter_api_key', 'deepseek_api_key',
    OPENROUTER_KEY_SLOTS.image, OPENROUTER_KEY_SLOTS.speech,
    'openai_model', 'api_provider', 'model_by_provider', 'custom_models',
    'extraction_mode', 'use_selector_cache', 'output_format', 'generate_toc', 'generate_abstract', 'page_mode', 'pdf_language',
    'pdf_style_preset', 'pdf_font_family', 'pdf_font_size', 'pdf_bg_color', 'pdf_text_color',
    'pdf_heading_color', 'pdf_link_color',
    'pdf_custom_bg_color', 'pdf_custom_text_color', 'pdf_custom_heading_color', 'pdf_custom_link_color',
    'audio_provider', 'elevenlabs_api_key', 'qwen_api_key', 'respeecher_api_key',
    'audio_voice', 'audio_voice_map', 'audio_speed', 'elevenlabs_model', 'elevenlabs_format',
    'qwen_model', 'qwen_workspace_id', 'qwen_region',
    'elevenlabs_stability', 'elevenlabs_similarity', 'elevenlabs_style', 'elevenlabs_speaker_boost',
    'openai_instructions', 'google_tts_api_key', 'google_tts_model', 'google_tts_voice', 'google_tts_prompt',
    'respeecher_temperature', 'respeecher_repetition_penalty', 'respeecher_top_p',
    'translate_images', 'google_api_key', 'image_translation_provider', 'gemini_image_model',
    'openrouter_image_model', 'openrouter_tts_model', 'openrouter_tts_voice', OPENROUTER_SPEECH_SETTINGS_KEY, AUDIO_PREPARATION_PROMPT_KEY
  ];
}

/**
 * Prepare processing data from settings for quick save
 * @param {Record<string, any>} settings - Settings from storage
 * @param {import('../types.js').ExportFormat} outputFormat - Output format
 * @param {number} tabId - Tab ID
 * @param {string} html - HTML content
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {Promise<import('../types.js').ProcessingData>} Processing data object
 * @throws {Error} If API key is missing or invalid
 */
export async function prepareQuickSaveData(settings, outputFormat, tabId, html, url, title) {
  /** @type {Record<string, any>} */
  const settingsObj = settings;
  
  // Determine provider and model
  const { provider, model } = determineProviderAndModel(settingsObj);
  const mode = settings.extraction_mode || 'automatic';
  const language = settings.pdf_language || 'auto';
  const audioProvider = String(settingsObj.audio_provider || 'openai');
  const audioPreparationPrompt = supportsCustomNarration(outputFormat, audioProvider) ? readPromptOverrides(settings).audioPreparation ?? null : null;
  
  // Get and decrypt API key
  let apiKey = '';
  const needsKey = requiresTextModel(mode, language, outputFormat, audioProvider, url, audioPreparationPrompt);
  try {
    if (needsKey || (outputFormat !== 'audio' && getProviderApiKey(provider, settingsObj))) {
      apiKey = await getDecryptedProviderApiKey(provider, settingsObj);
    }
  } catch (error) {
    logError(`Failed to get API key for quick save`, error);
    if (needsKey) throw error;
  }
  
  // Prepare translation settings
  const translateImages = isImageTranslationEnabled({ translateImages: settings.translate_images,
    language: settings.pdf_language, outputFormat });
  const googleApiKey = settings.google_api_key || null;
  const imageTranslationProvider = settings.image_translation_provider ?? DEFAULT_IMAGE_TRANSLATION_PROVIDER;
  const imageKeys = {
    openai: settings.openai_api_key, gemini: googleApiKey, openrouter: settings[OPENROUTER_KEY_SLOTS.image]
  };
  const imageApiKey = translateImages && Object.hasOwn(imageKeys, imageTranslationProvider) ? imageKeys[imageTranslationProvider] || null : null;
  
  // Prepare audio settings
  const useOpenRouterSpeech = outputFormat === 'audio' && audioProvider === 'openrouter';
  const openRouterSpeech = useOpenRouterSpeech ? resolveOpenRouterTtsSelection(settings.openrouter_tts_model, settings.openrouter_tts_voice) : null;
  const audioVoice = openRouterSpeech?.voice || getVoiceFromSettings(audioProvider, settingsObj);
  const audioSpeed = getAudioSpeedFromSettings(settingsObj);
  
  // CRITICAL: Log voice settings immediately after preparation
  log('[ClipAIble Background] ===== SETTINGS PREPARED FOR QUICK SAVE =====', {
    timestamp: Date.now(),
    audio_provider: audioProvider,
    audio_voice: audioVoice,
    audio_voice_type: typeof audioVoice,
    audio_voice_string: String(audioVoice || ''),
    isNumeric: /^\d+$/.test(String(audioVoice || '')),
    hasUnderscore: audioVoice && String(audioVoice).includes('_'),
    hasDash: audioVoice && String(audioVoice).includes('-'),
    isValidFormat: audioVoice && (String(audioVoice).includes('_') || String(audioVoice).includes('-')),
    google_tts_voice: settingsObj.google_tts_voice,
    DEFAULT_AUDIO_VOICE: CONFIG.DEFAULT_AUDIO_VOICE,
    VOICE_STRING: `VOICE="${String(audioVoice || '')}"`,
    source: 'prepareQuickSaveData',
    willBePassedToStartArticleProcessing: true
  });
  
  const stylePreset = settings.pdf_style_preset || 'dark';
  const presetColors = STYLE_PRESETS[stylePreset];
  const colors = presetColors || {
    bgColor: settings.pdf_custom_bg_color || settings.pdf_bg_color || STYLE_PRESETS.dark.bgColor,
    textColor: settings.pdf_custom_text_color || settings.pdf_text_color || STYLE_PRESETS.dark.textColor,
    headingColor: settings.pdf_custom_heading_color || settings.pdf_heading_color || STYLE_PRESETS.dark.headingColor,
    linkColor: settings.pdf_custom_link_color || settings.pdf_link_color || STYLE_PRESETS.dark.linkColor
  };

  return {
    html,
    url,
    title,
    apiKey,
    provider,
    model,
    mode,
    useCache: settings.use_selector_cache !== false, // Default: true
    outputFormat,
    generateToc: settings.generate_toc || false,
    generateAbstract: supportsDocumentAbstract(mode, outputFormat) && Boolean(settings.generate_abstract),
    pageMode: settings.page_mode || 'single',
    language,
    translateImages,
    googleApiKey,
    imageTranslationProvider,
    ...(translateImages && imageTranslationProvider === 'gemini' ? { geminiImageModel: readGeminiImageModel(settings.gemini_image_model) } : {}),
    ...(translateImages && imageTranslationProvider === 'openrouter' ? { openrouterImageModel: readOpenRouterImageModel(settings.openrouter_image_model) } : {}),
    imageApiKey,
    stylePreset,
    fontFamily: settings.pdf_font_family || '',
    fontSize: settings.pdf_font_size || '31',
    ...colors,
    tabId,
    // Audio settings
    audioProvider,
    ...(outputFormat === 'audio' ? { audioPreparationPrompt } : {}),
    elevenlabsApiKey: settingsObj.elevenlabs_api_key || null,
    qwenApiKey: settingsObj.qwen_api_key || null,
    respeecherApiKey: settingsObj.respeecher_api_key || null,
    audioVoice,
    audioSpeed,
    audioFormat: CONFIG.DEFAULT_AUDIO_FORMAT,
    elevenlabsModel: settings.elevenlabs_model || CONFIG.DEFAULT_ELEVENLABS_MODEL,
    elevenlabsFormat: settings.elevenlabs_format || 'mp3_44100_192',
    elevenlabsStability: settings.elevenlabs_stability !== undefined ? settings.elevenlabs_stability : 0.5,
    elevenlabsSimilarity: settings.elevenlabs_similarity !== undefined ? settings.elevenlabs_similarity : 0.75,
    elevenlabsStyle: settings.elevenlabs_style !== undefined ? settings.elevenlabs_style : 0.0,
    elevenlabsSpeakerBoost: settings.elevenlabs_speaker_boost !== undefined ? settings.elevenlabs_speaker_boost : true,
    openaiInstructions: settings.openai_instructions || null,
    googleTtsApiKey: settings.google_tts_api_key || null,
    geminiApiKey: settings.gemini_api_key || null,
    googleTtsModel: resolveGoogleTtsModel(settings.google_tts_model),
    ...(openRouterSpeech ? {
      openrouterTtsApiKey: settings[OPENROUTER_KEY_SLOTS.speech] || null,
      openrouterTtsModel: openRouterSpeech.model,
      openrouterTtsVoice: openRouterSpeech.voice,
      openrouterTtsOptions: normalizeOpenRouterSpeechOptions(openRouterSpeech.model,
        readOpenRouterSpeechProfiles(settings[OPENROUTER_SPEECH_SETTINGS_KEY])[openRouterSpeech.model], openRouterSpeech.voice)
    } : {}),
    qwenModel: settings.qwen_model || DEFAULT_QWEN_TTS_MODEL,
    qwenWorkspaceId: settings.qwen_workspace_id || '',
    qwenRegion: settings.qwen_region || 'singapore',
    googleTtsVoice: settings.google_tts_voice || 'Callirrhoe',
    googleTtsPrompt: settings.google_tts_prompt || null,
    respeecherTemperature: settings.respeecher_temperature !== undefined ? settings.respeecher_temperature : 1.0,
    respeecherRepetitionPenalty: settings.respeecher_repetition_penalty !== undefined ? settings.respeecher_repetition_penalty : 1.0,
    respeecherTopP: settings.respeecher_top_p !== undefined ? settings.respeecher_top_p : 1.0
  };
}

