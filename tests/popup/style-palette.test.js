// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_STYLES, STORAGE_KEYS, STYLE_PRESETS } from '../../popup/constants.js';
import { setupStyleHandlers } from '../../popup/handlers/style.js';
import { initStyles } from '../../popup/settings/styles.js';
import { initCustomSelect } from '../../popup/utils/custom-select.js';
import { prepareQuickSaveData } from '../../scripts/processing/quicksave.js';

const channels = ['bgColor', 'textColor', 'headingColor', 'linkColor'];
const paletteKeys = ['CUSTOM_BG_COLOR', 'CUSTOM_TEXT_COLOR', 'CUSTOM_HEADING_COLOR', 'CUSTOM_LINK_COLOR'];
let elements, persisted, write, styles;

beforeEach(() => {
  const preset = STYLE_PRESETS.sepia;
  document.body.innerHTML = `<label for="stylePreset">Style Preset</label><select id="stylePreset">
      <option value="custom">Custom</option><option value="sepia" selected>Sepia</option><option value="light">Light</option>
    </select>${channels.map(key => `<input type="color" id="${key}" value="${preset[key]}">
    <input type="text" id="${key}Text" value="${preset[key]}">`).join('')}`;
  elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
  initCustomSelect('stylePreset');
  persisted = { [STORAGE_KEYS.STYLE_PRESET]: 'sepia', [STORAGE_KEYS.CUSTOM_TEXT_COLOR]: '#121212' };
  write = vi.fn(async batch => Object.assign(persisted, batch));
  vi.stubGlobal('chrome', { storage: { local: { set: write, get: async () => persisted } } });
  const common = { elements, STORAGE_KEYS, STYLE_PRESETS, DEFAULT_STYLES, showToast: vi.fn(), setCustomSelectValue: vi.fn() };
  styles = initStyles(common);
  setupStyleHandlers({ ...common, settingsModule: styles, logError: vi.fn(),
    debouncedSaveSettings: (key, value) => void write({ [key]: value }) });
});

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function expectCustomPalette(changes) {
  expect(elements.stylePreset.value).toBe('custom');
  expect(document.getElementById('stylePresetValue').textContent).toBe('Custom');
  expect(document.querySelector('#stylePresetOptions [data-value="custom"]').getAttribute('aria-selected')).toBe('true');
  const palette = { ...STYLE_PRESETS.sepia, ...changes };
  const record = Object.fromEntries(channels.map((key, index) => [STORAGE_KEYS[paletteKeys[index]], palette[key]]));
  expect(write).toHaveBeenCalledExactlyOnceWith({ [STORAGE_KEYS.STYLE_PRESET]: 'custom', ...record });
}

it.each(['bgColor', 'bgColorText'])('keeps the displayed palette when %s is edited and Quick Save runs', async field => {
  elements[field].value = '#335577';
  elements[field].dispatchEvent(new Event('change', { bubbles: true }));
  expectCustomPalette({ bgColor: '#335577' });
  const data = await prepareQuickSaveData(persisted, 'pdf', 1, '<main>Sample</main>', 'https://example.test/', 'Sample');
  expect(data).toMatchObject({ ...STYLE_PRESETS.sepia, bgColor: '#335577', stylePreset: 'custom' });
});

it('keeps the other displayed colors when resetting one color', async () => {
  await styles.resetStyleSetting('headingColor');
  expectCustomPalette({ headingColor: DEFAULT_STYLES.headingColor });
});

it('applies a newly selected named palette before its storage write settles', () => {
  write.mockImplementation(() => new Promise(() => {}));
  elements.stylePreset.value = 'light';
  elements.stylePreset.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.getElementById('stylePresetValue').textContent).toBe('Light');
  for (const field of channels) expect(elements[field].value).toBe(STYLE_PRESETS.light[field]);
  expect(write).toHaveBeenCalledExactlyOnceWith({ [STORAGE_KEYS.STYLE_PRESET]: 'light' });
});
