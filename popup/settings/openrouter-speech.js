// @ts-check
import { getOpenRouterSpeechCapabilities, normalizeOpenRouterSpeechOptions, readOpenRouterSpeechProfiles } from '../../scripts/api/openrouter-speech-options.js';

const defaultValues = { speed: '1', stability: '0.5', similarity: '0.75', style: '', instructions: '' };
const styleLabels = {
  caringempathy: 'Caring / Empathetic', friendlycheerful: 'Friendly / Cheerful',
  saddisappointed: 'Sad / Disappointed', softvoice: 'Soft voice'
};
const controlsFor = elements => elements.openrouterTtsVoice?.ownerDocument?.getElementById('openrouterTtsOptions');

/** Snapshot the controls before any asynchronous export admission checks. */
export function readOpenRouterSpeechControls(elements, model, voice) {
  const group = controlsFor(elements);
  if (!group) return {};
  const entries = Array.from(group.querySelectorAll('[data-speech-option]'), node => {
    const control = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (node);
    const value = control.matches('input[type="range"]') ? /** @type {HTMLInputElement} */ (control).valueAsNumber : control.value;
    return [control.dataset.speechOption, value];
  });
  return normalizeOpenRouterSpeechOptions(model, Object.fromEntries(entries), voice);
}

/** @param {Object} elements @param {Function} save */
export function initOpenRouterSpeechOptions(elements, save) {
  const group = controlsFor(elements);
  const fields = group?.querySelectorAll('[data-speech-option]') ?? [];
  /** @type {Record<string, import('../../scripts/api/openrouter-speech-options.js').OpenRouterSpeechOptions>} */
  let profiles = {};
  const updateOutput = control => {
    const output = group?.querySelector('output[for="' + control.id + '"]');
    if (output) output.textContent = control.value;
  };

  for (const node of fields) {
    const control = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (node);
    control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', () => {
      const model = elements.openrouterTtsModel?.value;
      const voice = elements.openrouterTtsVoice?.value;
      if (!model || !voice) return;
      updateOutput(control);
      const next = readOpenRouterSpeechProfiles({ ...profiles, [model]: readOpenRouterSpeechControls(elements, model, voice) });
      profiles = next;
      save(next);
    });
  }

  return {
    restore(settings) {
      profiles = readOpenRouterSpeechProfiles(settings);
    },
    render(model, voice) {
      const caps = getOpenRouterSpeechCapabilities(model, voice);
      const values = normalizeOpenRouterSpeechOptions(model, profiles[model], voice);
      const enabled = { speed: Boolean(caps.speed), stability: caps.voiceTuning,
        similarity: caps.voiceTuning, style: caps.styles.length > 0, instructions: caps.instructions };
      group?.classList.toggle('hidden', !Object.values(enabled).some(Boolean));
      for (const node of fields) {
        const control = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (node);
        const name = control.dataset.speechOption;
        control.closest('.setting-item')?.classList.toggle('hidden', !enabled[name]);
        control.disabled = !enabled[name];
        if (name === 'speed' && caps.speed && control.tagName === 'INPUT') {
          const range = /** @type {HTMLInputElement} */ (control);
          range.min = String(caps.speed.min);
          range.max = String(caps.speed.max);
        }
        if (name === 'style' && control.tagName === 'SELECT') {
          const select = /** @type {HTMLSelectElement} */ (control);
          const defaultOption = select.options[0];
          const styleOptions = caps.styles.map(style => {
            const option = control.ownerDocument.createElement('option');
            option.value = style;
            option.textContent = styleLabels[style] || (style.charAt(0).toUpperCase() + style.slice(1)).replaceAll('_', ' ');
            return option;
          });
          select.replaceChildren(defaultOption, ...styleOptions);
        }
        control.value = String(values[name] ?? defaultValues[name]);
        updateOutput(control);
      }
    }
  };
}
