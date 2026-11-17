// @ts-check

export const DEFAULT_GOOGLE_TTS_MODEL = 'gemini-3.8-flash-tts';
export const DEFAULT_ELEVENLABS_TTS_MODEL = 'eleven_v4';
export const DEFAULT_ELEVENLABS_TTS_VOICE = 'WQP7cQUF5aAS6Axh5yaa';
export const DEFAULT_QWEN_TTS_MODEL = 'qwen-audio-3.1-tts-flash';
export const DEFAULT_QWEN_TTS_VOICE = 'longanhuan_v3.1';

export const GOOGLE_TTS_MODELS = [
  { id: DEFAULT_GOOGLE_TTS_MODEL, name: 'Gemini 3.8 Flash TTS' },
  { id: 'gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Flash-Lite TTS' },
  { id: 'gemini-3.1-flash-tts-preview', name: 'Gemini 3.1 Flash TTS Preview' },
  { id: 'gemini-2.5-pro-preview-tts', name: 'Gemini 2.5 Pro TTS Preview' },
  { id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 Flash TTS Preview' }
];

export const ELEVENLABS_TTS_MODELS = [
  { id: DEFAULT_ELEVENLABS_TTS_MODEL, name: 'Eleven v4' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5' },
  { id: 'eleven_v3', name: 'Eleven v3' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5' }
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
  if (provider === 'qwen') return isQwenAudioModel(qwenModel) ? DEFAULT_QWEN_TTS_VOICE : 'Elias';
  if (provider === 'elevenlabs') return DEFAULT_ELEVENLABS_TTS_VOICE;
  if (provider === 'google') return 'Callirrhoe';
  if (provider === 'respeecher') return 'samantha';
  if (provider === 'offline') return 'en_US-lessac-medium';
  return 'nova';
}

export function getQwenTtsEndpoint(model = DEFAULT_QWEN_TTS_MODEL, workspaceId = '', region = 'singapore') {
  if (model === 'qwen3-tts-flash-2025-11-27') {
    throw new Error('This Qwen TTS model has been retired. Select a current model in audio settings.');
  }
  if (model === 'qwen3-tts-flash') {
    return 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  }
  if (!isQwenAudioModel(model)) throw new Error('Unsupported Qwen TTS model.');
  const workspace = String(workspaceId || '').trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(workspace)) {
    throw new Error('Enter a valid Qwen workspace ID in audio settings.');
  }
  const regions = { singapore: 'ap-southeast-1', beijing: 'cn-beijing' };
  if (!Object.hasOwn(regions, region)) throw new Error('Select a supported Qwen region.');
  return `https://${workspace}.${regions[region]}.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`;
}

export function isModernGoogleTtsModel(model) {
  return model === 'gemini-3.8-flash-tts' || model === 'gemini-3.8-flash-lite-tts';
}

export function isQwenAudioModel(model) {
  return model === 'qwen-audio-3.1-tts-flash' || model === 'qwen-audio-3.1-tts-plus';
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
