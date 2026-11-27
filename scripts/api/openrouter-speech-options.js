// @ts-check
import { OPENROUTER_TTS_MODELS } from './tts-catalog.js';
import { getMaiVoiceStyles } from './mai-voice-styles.js';

export const OPENROUTER_SPEECH_SETTINGS_KEY = 'openrouter_tts_options';
export const OPENROUTER_SPEECH_INSTRUCTIONS_LIMIT = 1000;

const geminiModels = new Set(['google/gemini-3.8-flash-tts', 'google/gemini-3.8-flash-lite-tts']);
const maiModel = 'microsoft/mai-voice-2.1';
const grokModel = 'x-ai/grok-voice-tts-1.0';
const elevenModel = 'elevenlabs/eleven-v4';

/**
 * @typedef {{instructions?: string, speed?: number, stability?: number, similarity?: number, style?: string}} OpenRouterSpeechOptions
 */

/** @param {string} model @param {string} [voice] */
export function getOpenRouterSpeechCapabilities(model, voice) {
  return {
    instructions: geminiModels.has(model),
    voiceTuning: model === elevenModel,
    speed: model === maiModel ? { min: 0.5, max: 2 } : model === grokModel ? { min: 0.7, max: 1.5 } : null,
    styles: model === maiModel && voice ? getMaiVoiceStyles(voice).filter(style => style !== 'neutral') : []
  };
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @param {number} min @param {number} max */
function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

/**
 * Validate options for storage or for a specific request and voice.
 * @param {string} model
 * @param {unknown} value
 * @param {string} [voice]
 * @returns {OpenRouterSpeechOptions}
 */
export function normalizeOpenRouterSpeechOptions(model, value, voice) {
  const raw = record(value);
  const caps = getOpenRouterSpeechCapabilities(model, voice);
  /** @type {OpenRouterSpeechOptions} */
  const options = {};
  if (caps.instructions && typeof raw.instructions === 'string') {
    const instructions = raw.instructions.trim();
    if (instructions && instructions.length <= OPENROUTER_SPEECH_INSTRUCTIONS_LIMIT) options.instructions = instructions;
  }
  if (caps.speed) {
    const speed = inRange(raw.speed, caps.speed.min, caps.speed.max);
    if (speed !== undefined && speed !== 1) options.speed = speed;
  }
  if (caps.voiceTuning) {
    const stability = inRange(raw.stability, 0, 1);
    const similarity = inRange(raw.similarity, 0, 1);
    if (stability !== undefined) options.stability = stability;
    if (similarity !== undefined) options.similarity = similarity;
  }
  if (model === maiModel && typeof raw.style === 'string') {
    const supported = voice ? caps.styles.includes(raw.style) :
      OPENROUTER_TTS_MODELS.find(entry => entry.id === maiModel)?.voices.some(
        entry => getMaiVoiceStyles(entry.id).some(style => style === raw.style && style !== 'neutral'));
    if (supported) options.style = raw.style;
  }
  return options;
}

/** @param {unknown} value @returns {Record<string, OpenRouterSpeechOptions>} */
export function readOpenRouterSpeechProfiles(value) {
  const raw = record(value);
  return Object.fromEntries(OPENROUTER_TTS_MODELS.flatMap(({ id }) => {
    if (!Object.hasOwn(raw, id)) return [];
    const options = normalizeOpenRouterSpeechOptions(id, raw[id]);
    return Object.keys(options).length ? [[id, options]] : [];
  }));
}

/** @param {string} model @param {string} voice @param {unknown} value */
export function buildOpenRouterSpeechFields(model, voice, value) {
  const { instructions, speed, stability, similarity, style } = normalizeOpenRouterSpeechOptions(model, value, voice);
  const voiceSettings = {
    ...(stability === undefined ? {} : { stability }),
    ...(similarity === undefined ? {} : { similarity_boost: similarity })
  };
  return {
    ...(instructions ? { instructions } : {}),
    ...(speed === undefined ? {} : { speed }),
    ...(style ? { provider: { options: { azure: { style } } } } : {}),
    ...(Object.keys(voiceSettings).length ? { provider: { options: { elevenlabs: { voice_settings: voiceSettings } } } } : {})
  };
}
