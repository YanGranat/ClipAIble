// @ts-check
import { isMaskedKey } from '../../scripts/utils/security/encryption.js';
import { STORAGE_KEYS } from '../constants.js';
import { setApiKeyVisibility } from '../handlers/api-keys.js';

function isReplaceable(input) {
  return !input.value || isMaskedKey(input.value);
}

/** Update saved-key masks without overwriting drafts or touching unrelated slots. */
export function initSharedApiKeys(elements) {
  const bindings = [
    { provider: 'openai', storageKey: STORAGE_KEYS.API_KEY, mediaInput: elements.openaiImageKey },
    { provider: 'openrouter', storageKey: STORAGE_KEYS.OPENROUTER_API_KEY },
    { storageKey: STORAGE_KEYS.OPENROUTER_IMAGE_API_KEY, mediaInput: elements.openrouterImageKey },
    { storageKey: STORAGE_KEYS.OPENROUTER_TTS_API_KEY, mediaInput: elements.openrouterTtsKey }
  ];
  const showMask = (input, value) => {
    input.value = value ? '********' : '';
    delete input.dataset.decrypted;
    delete input.dataset.encrypted;
  };
  const showMediaMask = (input, value) => {
    if (input && isReplaceable(input)) showMask(input, value);
  };
  for (const { mediaInput } of bindings) {
    const selectMask = () => {
      if (isMaskedKey(mediaInput.value)) mediaInput.select();
    };
    mediaInput?.addEventListener('focus', selectMask);
    mediaInput?.addEventListener('paste', selectMask);
    mediaInput?.addEventListener('beforeinput', event => {
      if (event.inputType?.startsWith('insert')) selectMask();
    });
  }
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const { provider, storageKey, mediaInput } of bindings) {
      const change = changes[storageKey];
      if (!change) continue;
      const saved = change.newValue;
      showMediaMask(mediaInput, saved);
      const input = elements.apiKey;
      if (provider && elements.apiProviderSelect?.value === provider && input?.dataset.provider === provider &&
        (isReplaceable(input) || input.value === input.dataset.decrypted)) {
        showMask(input, saved);
        if (saved) input.dataset.encrypted = saved;
        setApiKeyVisibility(input, elements.toggleApiKey, false);
      }
    }
  });
  return {
    restore(settings) {
      for (const { storageKey, mediaInput } of bindings) showMediaMask(mediaInput, settings[storageKey]);
    }
  };
}
