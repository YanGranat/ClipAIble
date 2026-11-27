// @ts-check

export const SUPERTONIC_MODEL_STATUS_KEY = 'supertonic_model_status';
export const SUPERTONIC_REVISION = 'aafc6e32416a594460b32413efc49d7fe4ce6d46';
export const SUPERTONIC_MODEL_URL = `https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/${SUPERTONIC_REVISION}/`;
export const SUPERTONIC_FALLBACK_URL = 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/';
export const SUPERTONIC_CACHE = `clipaible-supertonic-3-${SUPERTONIC_REVISION}`;
export const SUPERTONIC_DEFAULT_VOICE = 'F1';
export const SUPER_OUTPUT_VOICES = Object.freeze(['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].map(id => ({ id, name: id })));
export const SUPERTONIC_MAX_INPUT = 240;
export const SUPERTONIC_MIN_SPEED = 0.7;
export const SUPERTONIC_MAX_SPEED = 1.3;

export const SUPERTONIC_DOWNLOAD_BYTES = 401_276_744;

export function isLocalSpeechProvider(provider) {
  return provider === 'offline' || provider === 'supertonic';
}

export function resolveSupertonicVoice(voice) {
  return SUPER_OUTPUT_VOICES.find(entry => entry.id === voice)?.id ?? SUPERTONIC_DEFAULT_VOICE;
}
