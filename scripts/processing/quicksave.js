// Quick save processing module for ClipAIble extension
// Handles quick save from context menu

// @ts-check

// @typedef {import('../types.js').ProcessingData} ProcessingData

import { log, logError } from '../utils/logging.js';
import { getProcessingState } from '../state/processing.js';
import { tSync } from '../locales.js';
import { 
  determineProviderAndModel, 
  getDecryptedProviderApiKey,
  getVoiceFromSettings,
  getAudioSpeedFromSettings
} from '../utils/settings-helpers.js';
import { CONFIG } from '../utils/config.js';

/**
 * Get all settings keys needed for quick save
 * @returns {Array<string>} Array of setting keys
 */
export function getQuickSaveSettingsKeys() {
  return [
    'openai_api_key', 'claude_api_key', 'gemini_api_key', 'grok_api_key', 'openrouter_api_key',
    'openai_model', 'api_provider', 'model_by_provider',
    'extraction_mode', 'use_selector_cache', 'output_format', 'generate_toc', 'generate_abstract', 'page_mode', 'pdf_language',
    'pdf_style_preset', 'pdf_font_family', 'pdf_font_size', 'pdf_bg_color', 'pdf_text_color',
    'pdf_heading_color', 'pdf_link_color',
    'audio_provider', 'elevenlabs_api_key', 'qwen_api_key', 'respeecher_api_key',
    'audio_voice', 'audio_voice_map', 'audio_speed', 'elevenlabs_model', 'elevenlabs_format',
    'elevenlabs_stability', 'elevenlabs_similarity', 'elevenlabs_style', 'elevenlabs_speaker_boost',
    'openai_instructions', 'google_tts_api_key', 'google_tts_model', 'google_tts_voice', 'google_tts_prompt',
    'respeecher_temperature', 'respeecher_repetition_penalty', 'respeecher_top_p',
    'translate_images', 'google_api_key'
  ];
}

/**
 * Prepare processing data from settings for quick save
 * @param {Record<string, any>} settings - Settings from storage
 * @param {string} outputFormat - Output format
 * @param {number} tabId - Tab ID
 * @param {string} html - HTML content
 * @param {string} url - Page URL
 * @param {string} title - Page title
 * @returns {Promise<ProcessingData>} Processing data object
 * @throws {Error} If API key is missing or invalid
 */
export async function prepareQuickSaveData(settings, outputFormat, tabId, html, url, title) {
  /** @type {Record<string, any>} */
  const settingsObj = settings;
  
  // Determine provider and model
  const { provider, model } = determineProviderAndModel(settingsObj);
  
  // Get and decrypt API key
  let apiKey;
  try {
    apiKey = await getDecryptedProviderApiKey(provider, settingsObj);
  } catch (error) {
    logError(`Failed to get API key for quick save`, error);
    throw error;
  }
  
  // Prepare translation settings
  const translateImages = Boolean(settings.translate_images) && (settings.pdf_language || 'auto') !== 'auto';
  const googleApiKey = settings.google_api_key || null;
  
  // Prepare audio settings
  const audioProvider = String(settingsObj.audio_provider || 'openai');
  const audioVoice = getVoiceFromSettings(audioProvider, settingsObj);
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
  
  return {
    html,
    url,
    title,
    apiKey,
    provider,
    model,
    mode: settings.extraction_mode || 'selector',
    useCache: settings.use_selector_cache !== false, // Default: true
    outputFormat,
    generateToc: settings.generate_toc || false,
    generateAbstract: settings.generate_abstract || false,
    pageMode: settings.page_mode || 'single',
    language: settings.pdf_language || 'auto',
    translateImages,
    googleApiKey,
    stylePreset: settings.pdf_style_preset || 'dark',
    fontFamily: settings.pdf_font_family || '',
    fontSize: settings.pdf_font_size || '31',
    bgColor: settings.pdf_bg_color || '#303030',
    textColor: settings.pdf_text_color || '#b9b9b9',
    headingColor: settings.pdf_heading_color || '#cfcfcf',
    linkColor: settings.pdf_link_color || '#6cacff',
    tabId,
    // Audio settings
    audioProvider,
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
    googleTtsModel: settings.google_tts_model || 'gemini-2.5-pro-preview-tts',
    googleTtsVoice: settings.google_tts_voice || 'Callirrhoe',
    googleTtsPrompt: settings.google_tts_prompt || null,
    respeecherTemperature: settings.respeecher_temperature !== undefined ? settings.respeecher_temperature : 1.0,
    respeecherRepetitionPenalty: settings.respeecher_repetition_penalty !== undefined ? settings.respeecher_repetition_penalty : 1.0,
    respeecherTopP: settings.respeecher_top_p !== undefined ? settings.respeecher_top_p : 1.0
  };
}

