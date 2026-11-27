// @ts-check

export const OPENROUTER_KEY_SLOTS = Object.freeze({
  text: 'openrouter_api_key',
  image: 'openrouter_image_api_key',
  speech: 'openrouter_tts_api_key'
});

export const OPENROUTER_KEYS_SEPARATED = 'openrouter_keys_separated';
export const OPENROUTER_KEY_STORAGE_FIELDS = [...Object.values(OPENROUTER_KEY_SLOTS), OPENROUTER_KEYS_SEPARATED];

/**
 * Seed missing media slots once, from the value that existed before separation.
 * A later missing or empty slot must never borrow the text key.
 * @param {Record<string, unknown>} stored
 * @param {(value: string) => Promise<string>} encrypt
 */
export async function planOpenRouterKeySeparation(stored, encrypt) {
  if (stored[OPENROUTER_KEYS_SEPARATED] === true) return {};
  /** @type {Record<string, string|boolean>} */
  const patch = { [OPENROUTER_KEYS_SEPARATED]: true };
  const missing = [OPENROUTER_KEY_SLOTS.image, OPENROUTER_KEY_SLOTS.speech].filter(key => !Object.hasOwn(stored, key));
  const previous = stored[OPENROUTER_KEY_SLOTS.text];
  if (missing.length && typeof previous === 'string' && previous.trim() && !/^(?:\*{4}|\u2022{4})/.test(previous.trim())) {
    const encrypted = previous.startsWith('ENC:') ? previous : await encrypt(previous);
    if (typeof encrypted !== 'string' || !encrypted.startsWith('ENC:')) {
      throw new Error('Unable to preserve saved OpenRouter credentials');
    }
    for (const key of missing) patch[key] = encrypted;
  }
  return patch;
}
