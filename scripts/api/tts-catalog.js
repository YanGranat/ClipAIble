// @ts-check
import { SUPERTONIC_DEFAULT_VOICE } from './supertonic-config.js';

export const OPENAI_TTS_MODEL = 'gpt-realtime-2.1-mini';
export const DEFAULT_OPENAI_TTS_VOICE = 'marin';
export const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
export const OPENAI_TTS_MIN_SPEED = 0.25;
export const OPENAI_TTS_MAX_SPEED = 1.5;
export const OPENAI_TTS_MAX_INPUT = 4096;

export const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-3.8-flash-tts';
const GOOGLE_TTS_FLASH_LITE_MODEL = 'gemini-3.8-flash-lite-tts';
export const DEFAULT_GOOGLE_TTS_VOICE = 'Callirrhoe';
export const DEFAULT_ELEVENLABS_TTS_MODEL = 'eleven_v4';
export const DEFAULT_ELEVENLABS_TTS_VOICE = 'WQP7cQUF5aAS6Axh5yaa';
export const DEFAULT_QWEN_TTS_MODEL = 'qwen-audio-3.1-tts-flash';
export const DEFAULT_QWEN_TTS_VOICE = 'longanhuan_v3.1';

export const GOOGLE_TTS_MODELS = [
  { id: DEFAULT_GOOGLE_TTS_MODEL, name: 'Gemini 3.8 Flash TTS' },
  { id: GOOGLE_TTS_FLASH_LITE_MODEL, name: 'Gemini 3.8 Flash-Lite TTS' }
];

const retiredGoogleTtsReplacements = new Map([
  ['gemini-2.5-flash-preview-tts', GOOGLE_TTS_FLASH_LITE_MODEL],
  ['gemini-2.5-flash-lite-preview-tts', GOOGLE_TTS_FLASH_LITE_MODEL],
  ['gemini-2.5-pro-preview-tts', DEFAULT_GOOGLE_TTS_MODEL],
  ['gemini-3.1-flash-tts-preview', DEFAULT_GOOGLE_TTS_MODEL]
]);

export const GOOGLE_TTS_VOICES = [
  DEFAULT_GOOGLE_TTS_VOICE, 'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia',
  'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix',
  'Sadachbia', 'Sadaltager', 'Sulafat'
];

export const DEFAULT_OPENROUTER_TTS_MODEL = 'google/gemini-3.8-flash-tts';
export const DEFAULT_OPENROUTER_TTS_VOICE = DEFAULT_GOOGLE_TTS_VOICE;

const namedVoices = ids => ids.map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }));
const maiVoices = Object.entries({
  'en-US': 'Harper Ethan Grant Iris Jasper Olivia Sage', 'en-AU': 'Isla', 'en-GB': 'Emily Harry', 'en-IN': 'Dhruv Priya',
  'cs-CZ': 'Grant Harper', 'da-DK': 'Grant Harper', 'de-DE': 'Grant Harper Klaus Mia',
  'es-ES': 'Marta', 'es-MX': 'Alejo Grant Harper Valeria', 'fi-FI': 'Grant Harper',
  'fr-FR': 'Grant Harper Marc Soleil', 'hi-IN': 'Arjun Dhruv Grant Harper Kavya Priya',
  'hu-HU': 'Bence Grant Harper Levente Lilla Reka', 'id-ID': 'Grant Harper',
  'it-IT': 'Grant Harper Luca Rosa', 'ko-KR': 'Grant Haena Harper Junho', 'nb-NO': 'Grant Harper',
  'nl-NL': 'Grant Harper Sander', 'pl-PL': 'Grant Harper',
  'pt-BR': 'Caio Grant Harper Luana Pedro Rafael', 'pt-PT': 'Grant Harper Rui',
  'ro-RO': 'Andrei Elena Grant Harper Ioana Radu', 'ru-RU': 'Grant Harper Lev Masha',
  'sv-SE': 'Grant Harper', 'th-TH': 'Grant Harper Krit Nattapong', 'tr-TR': 'Aydin Elif Grant Harper',
  'vi-VN': 'Grant Harper', 'zh-CN': 'Bo Grant Harper Lan Mei Wei'
}).flatMap(([locale, names]) => names.split(' ').map(name => ({
  id: `${locale}-${name}:MAI-Voice-2.1`, name: `${name} (${locale})`
})));

const voxtralVoices = [
  [3150, 'James', 'en-US'], [478, 'Sheila', 'en-US'], [447, 'Margaret', 'en-US'], [485, 'Rob', 'en-US'],
  [1787, 'Mary', 'en-GB'], [1786, 'Sky', 'en-GB'], [1788, 'David', 'en-GB'], [590, 'Harriet', 'en-GB'],
  [591, 'Fred', 'en-GB'], [3149, 'Hugo', 'en-GB'], [3147, 'Howard', 'en-GB'],
  [479, 'Maryam', 'ar'], [3143, 'Jordi', 'ca'], [481, 'Heidi', 'de'], [483, 'Elena', 'es'],
  [592, 'Marie', 'fr'], [3137, 'Manon', 'fr'], [589, 'Lea', 'fr'], [3141, 'Camille', 'fr'],
  [3139, 'Ananya', 'hi'], [3153, 'Himanshu', 'hi'], [3146, 'Olivia', 'hu'], [482, 'Lorenzo', 'it'],
  [3133, 'Haruto', 'ja'], [3136, 'Sung', 'ko'], [3135, 'Jin', 'ko'], [3145, 'Lotte', 'nl'],
  [3134, 'Lars', 'no'], [3154, 'Leon', 'pl'], [480, 'Gabriela', 'pt'], [3155, 'Irina', 'ro'],
  [3132, 'Tatiana', 'ru'], [3138, 'Oran', 'tr'], [3140, 'Taras', 'uk'], [3144, 'Huong', 'vi'], [3142, 'Mei', 'zh']
].map(([id, name, locale]) => ({ id: `voice_${id}`, name: `${name} (${locale})` }));

const voxtralStylePresets = [
  ['en_paul', 'Paul', 'en-US', 'neutral sad happy frustrated excited confident cheerful angry'],
  ['gb_oliver', 'Oliver', 'en-GB', 'neutral sad excited curious confident cheerful angry'],
  ['gb_jane', 'Jane', 'en-GB', 'neutral sarcasm confused shameful sad jealousy frustrated curious confident'],
  ['fr_marie', 'Marie', 'fr-FR', 'neutral sad happy excited curious angry']
].flatMap(([prefix, name, locale, styles]) => styles.split(' ').map(style => ({
  id: `${prefix}_${style}`, name: `${name} — ${style.charAt(0).toUpperCase() + style.slice(1)} (${locale})`
})));

/** @type {{id: string, name: string, responseFormat: 'wav' | 'pcm', maxInput: number, voices: {id: string, name: string}[]}[]} */
export const OPENROUTER_TTS_MODELS = [
  ...[
    { id: DEFAULT_OPENROUTER_TTS_MODEL, name: 'Google: Gemini 3.8 Flash TTS' },
    { id: 'google/gemini-3.8-flash-lite-tts', name: 'Google: Gemini 3.8 Flash-Lite TTS' }
  ].map(entry => ({
    ...entry,
    responseFormat: /** @type {const} */ ('wav'), maxInput: 24000, voices: namedVoices(GOOGLE_TTS_VOICES)
  })),
  { id: 'elevenlabs/eleven-v4', name: 'ElevenLabs: Eleven v4', responseFormat: 'pcm', maxInput: 10000,
    voices: namedVoices('george sarah adam alice bella bill brian callum charlie chris daniel eric harry jessica laura liam lily matilda river roger will'.split(' ')) },
  { id: 'microsoft/mai-voice-2.1', name: 'Microsoft AI: MAI-Voice-2.1', responseFormat: 'pcm', maxInput: 6000, voices: maiVoices },
  { id: 'x-ai/grok-voice-tts-1.0', name: 'Grok Voice TTS 1.0', responseFormat: 'pcm', maxInput: 15000,
    voices: namedVoices(['eve', 'ara', 'rex', 'sal', 'leo']) },
  { id: 'mistralai/voxtral-mini-tts-3-0', name: 'Mistral: Voxtral TTS 3', responseFormat: 'pcm', maxInput: 4000,
    voices: [...voxtralVoices, ...voxtralStylePresets] }
];

/** @param {string | null | undefined} [model] */
export function getOpenRouterTtsModel(model) {
  const resolvedModel = model || DEFAULT_OPENROUTER_TTS_MODEL;
  const entry = OPENROUTER_TTS_MODELS.find(entry => entry.id === resolvedModel);
  if (!entry) {
    throw Object.assign(new Error('Select a supported model in OpenRouter speech settings.'), {
      translationKey: 'errorModelNotFound', translationParams: { model: String(resolvedModel) }
    });
  }
  return entry;
}

/**
 * @param {{ voices: { id: string, name: string }[] }} entry
 * @param {unknown} voice
 */
export function findOpenRouterTtsVoice(entry, voice) {
  const normalized = typeof voice === 'string' ? voice.trim().toLowerCase() : undefined;
  return entry.voices.find(({ id }) => id.toLowerCase() === normalized);
}

/**
 * @param {string | null | undefined} model
 * @param {string | null | undefined} voice
 */
export function resolveOpenRouterTtsSelection(model, voice) {
  const entry = getOpenRouterTtsModel(model);
  const resolvedVoice = voice == null || voice === '' ? entry.voices[0] : findOpenRouterTtsVoice(entry, voice);
  if (!resolvedVoice) {
    throw Object.assign(new Error('Select a supported voice in OpenRouter speech settings.'), {
      translationKey: 'selectNarratorVoice', translationParams: {}
    });
  }
  return { model: entry.id, voice: resolvedVoice.id };
}

/** @param {string | null | undefined} model */
export function resolveGoogleTtsModel(model) {
  return model == null || model === '' ? DEFAULT_GOOGLE_TTS_MODEL : (retiredGoogleTtsReplacements.get(model) ?? model);
}

/** @param {string | null | undefined} voice */
export function resolveGoogleTtsVoice(voice) {
  if (voice == null || voice === '') return DEFAULT_GOOGLE_TTS_VOICE;
  const normalized = String(voice).trim().toLowerCase();
  return GOOGLE_TTS_VOICES.find(id => id.toLowerCase() === normalized) || null;
}

/** @param {string} model */
export function isSupportedGoogleTtsModel(model) {
  return GOOGLE_TTS_MODELS.some(entry => entry.id === model);
}

/**
 * Resolve saved aliases before contacting Google.
 * @param {string | null | undefined} model
 * @param {string | null | undefined} voice
 */
export function resolveGoogleTtsSelection(model, voice) {
  const resolvedModel = resolveGoogleTtsModel(model);
  if (!isSupportedGoogleTtsModel(resolvedModel)) {
    throw Object.assign(new Error('Select a supported model in Google TTS settings.'), {
      translationKey: 'errorModelNotFound', translationParams: { model: String(resolvedModel) }
    });
  }
  const resolvedVoice = resolveGoogleTtsVoice(voice);
  if (!resolvedVoice) {
    throw Object.assign(new Error('Select a supported voice in Google TTS settings.'), {
      translationKey: 'selectNarratorVoice', translationParams: {}
    });
  }
  return { model: resolvedModel, voice: resolvedVoice };
}

export const ELEVENLABS_TTS_MODELS = [
  { id: DEFAULT_ELEVENLABS_TTS_MODEL, name: 'Eleven v4' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5' },
  { id: 'eleven_v3', name: 'Eleven v3' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', deprecated: true }
];

export const QWEN_TTS_MODELS = [
  { id: DEFAULT_QWEN_TTS_MODEL, name: 'Qwen Audio 3.1 TTS Flash' },
  { id: 'qwen-audio-3.1-tts-plus', name: 'Qwen Audio 3.1 TTS Plus' },
  { id: 'qwen3-tts-flash', name: 'Qwen3 TTS Flash' }
];

export const QWEN_AUDIO_VOICES = [
  { id: 'longanhuan_v3.1', name: 'Long An Huan' },
  { id: 'longanlingxin_v3.1', name: 'Long An Lingxin' },
  { id: 'longanfengyue_v3.1', name: 'Long An Fengyue' },
  { id: 'xunanchuan_v3.1', name: 'Xu Nanchuan' }
];

export const ELEVENLABS_TTS_VOICES = [
  { id: DEFAULT_ELEVENLABS_TTS_VOICE, name: 'Elara - Crisp Pro Narrator' },
  { id: 'OZ0L6eISlOejga3XjDFt', name: 'Talia - Warm Soft Guide' },
  { id: 'gOupLcAkjEnguROwi4oS', name: 'Darian - Warm Grounded Storyteller' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Janet (Rachel)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Elara (Domi)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Adam (Antoni)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Peter (Elli)' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Craig (Josh)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Adam (Arnold)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Riley (Sam)' }
];

export function getDefaultTtsVoice(provider, qwenModel = DEFAULT_QWEN_TTS_MODEL) {
  if (provider === 'supertonic') return SUPERTONIC_DEFAULT_VOICE;
  if (provider === 'qwen') return isQwenAudioModel(qwenModel) ? DEFAULT_QWEN_TTS_VOICE : 'Elias';
  if (provider === 'elevenlabs') return DEFAULT_ELEVENLABS_TTS_VOICE;
  if (provider === 'google') return DEFAULT_GOOGLE_TTS_VOICE;
  if (provider === 'openrouter') return DEFAULT_OPENROUTER_TTS_VOICE;
  if (provider === 'respeecher') return 'samantha';
  if (provider === 'offline') return 'en_US-lessac-medium';
  return DEFAULT_OPENAI_TTS_VOICE;
}

export function getQwenTtsEndpoint(model = DEFAULT_QWEN_TTS_MODEL, workspaceId = '', region = 'singapore') {
  const configurationError = (key, message) => Object.assign(new Error(message), { translationKey: key, translationParams: {} });
  if (model === 'qwen3-tts-flash-2025-11-27') {
    throw configurationError('errorQwenModelRetired', 'This Qwen TTS model has been retired. Select a current model in audio settings.');
  }
  if (model === 'qwen3-tts-flash') {
    return 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }
  if (!isQwenAudioModel(model)) throw configurationError('errorQwenModelUnsupported', 'Unsupported Qwen TTS model.');
  const workspace = String(workspaceId || '').trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(workspace)) {
    throw configurationError('errorQwenWorkspaceRequired', 'Enter a valid Qwen workspace ID in audio settings.');
  }
  const regions = { singapore: 'ap-southeast-1', beijing: 'cn-beijing' };
  if (!Object.hasOwn(regions, region)) throw configurationError('errorQwenRegionUnsupported', 'Select a supported Qwen region.');
  return `https://${workspace}.${regions[region]}.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;
}

export function isQwenAudioModel(model) {
  return model === 'qwen-audio-3.1-tts-flash' || model === 'qwen-audio-3.1-tts-plus';
}

/** Reject only catalog voices known to belong to the other model family. */
export function isQwenVoiceCompatible(model, voice) {
  const incompatibleVoices = isQwenAudioModel(model) ? QWEN_LEGACY_VOICES : QWEN_AUDIO_VOICES;
  return !incompatibleVoices.some(entry => entry.id === voice);
}

export function getElevenLabsCapabilities(model) {
  if (model === 'eleven_v4' || model === 'eleven_v4_turbo') {
    return { similarity: true, style: false, speakerBoost: false, speed: false };
  }
  if (model === 'eleven_v3' || model === 'eleven_v3_conversational') {
    return { similarity: false, style: false, speakerBoost: false, speed: false };
  }
  const v2 = ['eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_flash_v2', 'eleven_turbo_v2'].includes(model);
  return { similarity: v2, style: v2, speakerBoost: v2, speed: v2 };
}

export const QWEN_LEGACY_VOICES = [
    // Best for articles/education
    { id: 'Elias', name: 'Elias (academic, storytelling)' },
    { id: 'Neil', name: 'Neil (news anchor, professional)' },
    { id: 'Katerina', name: 'Katerina (female, mature, rhythmic)' },
    { id: 'Ryan', name: 'Ryan (male, dramatic, realistic)' },

    // Language-specific voices
    { id: 'Alek', name: 'Alek (Russian voice)' },
    { id: 'Jennifer', name: 'Jennifer (American English female)' },
    { id: 'Emilien', name: 'Emilien (French gentleman)' },
    { id: 'Lenn', name: 'Lenn (German, rational)' },
    { id: 'Dolce', name: 'Dolce (Italian)' },
    { id: 'Bodega', name: 'Bodega (Spanish)' },
    { id: 'Sonrisa', name: 'Sonrisa (Latin American Spanish)' },
    { id: 'Andre', name: 'Andre (Portuguese European)' },
    { id: 'Radio Gol', name: 'Radio Gol (Portuguese Brazilian)' },
    { id: 'Sohee', name: 'Sohee (Korean)' },
    { id: 'Ono Anna', name: 'Ono Anna (Japanese)' },

    // General purpose
    { id: 'Cherry', name: 'Cherry (female, sunny, friendly)' },
    { id: 'Ethan', name: 'Ethan (male, warm, energetic)' },
    { id: 'Serena', name: 'Serena (female, gentle)' },
    { id: 'Chelsie', name: 'Chelsie (female, anime style)' },
    { id: 'Aiden', name: 'Aiden (American young man)' },
    { id: 'Maia', name: 'Maia (female, intelligent, gentle)' },
    { id: 'Kai', name: 'Kai (male, relaxing)' },
    { id: 'Nofish', name: 'Nofish (designer, no retroflex)' },

    // Character voices
    { id: 'Eldric Sage', name: 'Eldric Sage (old wise man)' },
    { id: 'Arthur', name: 'Arthur (old storyteller)' },
    { id: 'Bellona', name: 'Bellona (powerful, epic)' },
    { id: 'Vincent', name: 'Vincent (raspy, heroic)' },
    { id: 'Mia', name: 'Mia (female, gentle as snow)' },
    { id: 'Seren', name: 'Seren (female, soothing, ASMR)' },

    // Playful/Cute
    { id: 'Momo', name: 'Momo (playful, cute)' },
    { id: 'Vivian', name: 'Vivian (cool, slightly grumpy)' },
    { id: 'Moon', name: 'Moon (carefree)' },
    { id: 'Bella', name: 'Bella (loli voice)' },
    { id: 'Mochi', name: 'Mochi (child voice)' },
    { id: 'Bunny', name: 'Bunny (cute loli)' },
    { id: 'Pip', name: 'Pip (mischievous child)' },
    { id: 'Stella', name: 'Stella (magical girl)' },
    { id: 'Nini', name: 'Nini (sweet neighbor girl)' },
    { id: 'Ebona', name: 'Ebona (whispering, scary)' }
  ];
