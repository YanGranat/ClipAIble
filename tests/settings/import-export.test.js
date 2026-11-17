import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSettings, importSettings } from '../../scripts/settings/import-export.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/stats/index.js', async importOriginal => ({ ...await importOriginal(), exportStats: vi.fn() }));
vi.mock('../../scripts/cache/selectors.js', () => ({ getCacheStats: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/locales.js', () => ({ tSync: (key) => key }));

let stored;

beforeEach(() => {
  stored = {};
  chrome.storage.local.get.mockImplementation(async (keys) => Object.fromEntries(
    keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])
  ));
  chrome.storage.local.set.mockImplementation(async (values) => { Object.assign(stored, values); });
  chrome.storage.local.remove.mockImplementation(async (keys) => {
    for (const key of keys) delete stored[key];
  });
});

describe('settings import and export', () => {
  it.each(['automatic', 'selector', 'extract'])('restores the %s extraction mode', async (mode) => {
    stored = { extraction_mode: mode, audio_provider: 'offline', pdf_style_preset: 'contrast', audio_speed: '1.5', pdf_font_size: '31', pdf_custom_bg_color: '#18202a', pdf_custom_text_color: '#e8e4dd', pdf_custom_heading_color: '#a9cad3', pdf_custom_link_color: '#b6d4ac' };
    const exported = await exportSettings();
    stored = {};
    const result = await importSettings(exported, { overwriteExisting: true });
    expect(result.warnings).toEqual([]);
    expect(stored).toMatchObject(JSON.parse(exported).settings);
  });

  it('preserves existing false and zero values without overwrite', async () => {
    stored = { generate_toc: false, elevenlabs_stability: 0 };
    await importSettings(JSON.stringify({ settings: { generate_toc: true, elevenlabs_stability: 0.5 } }));
    expect(stored.generate_toc).toBe(false);
    expect(stored.elevenlabs_stability).toBe(0);
  });

  it('rejects unsupported enum values and malformed numeric strings', async () => {
    const result = await importSettings(JSON.stringify({ settings: {
      extraction_mode: 'unsupported', audio_speed: '1.5invalid', pdf_font_size: '72.5'
    } }), { overwriteExisting: true });
    expect(result.warnings).toHaveLength(3);
    expect(stored).not.toHaveProperty('extraction_mode');
    expect(stored).not.toHaveProperty('audio_speed');
    expect(stored).not.toHaveProperty('pdf_font_size');
  });

  it('excludes API keys from exports and imports', async () => {
    stored = { openai_api_key: 'synthetic-key', generate_toc: false };
    const exported = JSON.parse(await exportSettings());
    expect(exported.settings).toEqual({ generate_toc: false });
    await importSettings(JSON.stringify({ settings: { openai_api_key: 'synthetic-replacement' } }), { overwriteExisting: true });
    expect(stored.openai_api_key).toBe('synthetic-key');
  });

  it('rejects CSS and HTML in both current and legacy color settings', async () => {
    const result = await importSettings(JSON.stringify({ settings: {
      pdf_custom_bg_color: '</style><div>Unexpected content</div>',
      pdf_text_color: '#ffffff; color: transparent',
      pdf_custom_link_color: '#A1b2C3'
    } }), { overwriteExisting: true });
    expect(result.warnings).toHaveLength(2);
    expect(stored).not.toHaveProperty('pdf_custom_bg_color');
    expect(stored).not.toHaveProperty('pdf_text_color');
    expect(stored.pdf_custom_link_color).toBe('#A1b2C3');
  });

  it('imports the available font choices and rejects CSS in a font setting', async () => {
    await importSettings(JSON.stringify({ settings: { pdf_font_family: 'Times New Roman' } }), { overwriteExisting: true });
    expect(stored.pdf_font_family).toBe('Times New Roman');
    const result = await importSettings(JSON.stringify({ settings: { pdf_font_family: '</style><div>Unexpected content</div>' } }), { overwriteExisting: true });
    expect(result.warnings).toHaveLength(1);
    expect(stored.pdf_font_family).toBe('Times New Roman');
  });
});
