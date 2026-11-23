import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSettings, importSettings } from '../../scripts/settings/import-export.js';
import { cacheSelectors, clearSelectorCache, getCachedSelectors, invalidateCache, markCacheSuccess } from '../../scripts/cache/selectors.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/stats/index.js', async importOriginal => ({ ...await importOriginal(), exportStats: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/locales.js', () => ({ tSync: (key) => key }));

let stored;

beforeEach(() => {
  stored = {};
  chrome.storage.local.get.mockImplementation(async (keys) => structuredClone(Object.fromEntries(
    keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]])
  )));
  chrome.storage.local.set.mockImplementation(async (values) => { Object.assign(stored, structuredClone(values)); });
  chrome.storage.local.remove.mockImplementation(async (keys) => {
    for (const key of keys) delete stored[key];
  });
});

async function holdCacheLookupWrite() {
  let release;
  const heldWrite = new Promise(resolve => { release = resolve; });
  let reportWrite;
  const writeStarted = new Promise(resolve => { reportWrite = resolve; });
  const set = chrome.storage.local.set.getMockImplementation();
  chrome.storage.local.set.mockImplementationOnce(async (values) => {
    reportWrite();
    await heldWrite;
    await set(values);
  });
  const lookup = getCachedSelectors('https://source.example/article');
  await writeStarted;
  return { lookup, release };
}

describe('selector cache storage transactions', () => {
  it('retains both domains when two extractions cache their selectors together', async () => {
    await Promise.all([
      cacheSelectors('https://source.example/article', { content: 'main' }),
      cacheSelectors('https://archive.example/article', { content: '.entry' })
    ]);
    expect(stored.selector_cache).toMatchObject({
      'source.example': { selectors: { content: 'main' } },
      'archive.example': { selectors: { content: '.entry' } }
    });
  });

  it('does not restore entries from a lookup that overlaps clearing the cache', async () => {
    await cacheSelectors('https://source.example/article', { content: 'main' });
    const { lookup, release } = await holdCacheLookupWrite();
    const clear = clearSelectorCache();
    release();
    await Promise.all([lookup, clear]);
    expect(stored).not.toHaveProperty('selector_cache');
  });

  it('keeps an imported snapshot when a previous cache lookup is still recording recency', async () => {
    stored = { use_selector_cache: true, enable_selector_caching: true };
    await cacheSelectors('https://source.example/article', { content: 'main' });
    const { lookup, release } = await holdCacheLookupWrite();
    const imported = importSettings(JSON.stringify({ settings: {}, selectorCache: {
      'archive.example': { selectors: { content: '.entry' } }
    } }), { importCache: true });
    try {
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      release();
    }
    const [, result] = await Promise.all([lookup, imported]);
    expect(result.cacheImported).toBe(true);
    expect(Object.keys(stored.selector_cache)).toEqual(['archive.example']);
  });

  it('keeps existing entries after a read failure and accepts the next write', async () => {
    await cacheSelectors('https://source.example/article', { content: 'main' });
    const get = chrome.storage.local.get.getMockImplementation();
    chrome.storage.local.get.mockImplementation(async (keys) => {
      if (keys.includes('selector_cache')) throw new Error('Storage read failed');
      return get(keys);
    });
    await cacheSelectors('https://archive.example/article', { content: '.entry' });
    expect(Object.keys(stored.selector_cache)).toEqual(['source.example']);
    chrome.storage.local.get.mockImplementation(get);
    await cacheSelectors('https://archive.example/article', { content: '.entry' });
    expect(Object.keys(stored.selector_cache)).toEqual(['source.example', 'archive.example']);
  });

  it.each(['cache write', 'cache clearing', 'settings import'])('ignores late extraction outcomes after %s replaces the observed entry', async replacement => {
    const url = 'https://source.example/article';
    const selectors = { content: 'main' };
    await cacheSelectors(url, selectors);
    const previous = await getCachedSelectors(url);
    if (replacement === 'settings import') {
      const imported = await importSettings(JSON.stringify({ settings: {}, selectorCache: {
        'source.example': { selectors, successCount: 1 }
      } }), { importCache: true });
      expect(imported.cacheImported).toBe(true);
    } else {
      if (replacement === 'cache clearing') await clearSelectorCache();
      await cacheSelectors(url, selectors);
    }
    const current = await getCachedSelectors(url);
    await markCacheSuccess(url, previous);
    await invalidateCache(url, previous);
    expect(stored.selector_cache['source.example']).toMatchObject({ successCount: current.successCount, invalidated: false });
    await markCacheSuccess(url, current);
    expect(stored.selector_cache['source.example'].successCount).toBe(current.successCount + 1);
    await invalidateCache(url, current);
    expect(await getCachedSelectors(url)).toBeNull();
  });
});

describe('settings import and export', () => {
  it('rejects non-string scalar settings and malformed nested settings', async () => {
    const result = await importSettings(JSON.stringify({ version: 3, settings: {
      openai_model: { id: 'sample' }, google_tts_voice: ['sample'], ui_language: true,
      custom_models: { openai: [17] }, hidden_models: { openai: 'sample' },
      model_by_provider: { openai: { id: 'sample' } }, audio_voice_map: { current: { offline: {} } }
    } }), { overwriteExisting: true });
    expect(result.warnings).toHaveLength(7);
    for (const name of ['openai_model', 'google_tts_voice', 'ui_language', 'custom_models', 'hidden_models', 'model_by_provider', 'audio_voice_map']) expect(stored).not.toHaveProperty(name);
  });

  it('preserves valid custom models, hidden models and current or flat voice maps', async () => {
    const settings = { custom_models: { openai: ['custom-model'] }, hidden_models: { gemini: ['sample-model'] }, model_by_provider: { openai: 'custom-model' }, audio_voice_map: { current: { offline: 'en_US-sample-medium' } } };
    await importSettings(JSON.stringify({ settings }), { overwriteExisting: true });
    expect(stored).toMatchObject(settings);
    await importSettings(JSON.stringify({ settings: { audio_voice_map: { offline: 'en_US-sample-medium' } } }), { overwriteExisting: true });
    expect(stored.audio_voice_map).toEqual({ offline: 'en_US-sample-medium' });
  });

  it('normalizes imported selector entries using the runtime selector schema', async () => {
    const entry = { selectors: { content: 'article', title: 'h1', exclude: ['.related'], author: 'A document author' }, created: 100, lastUsed: 200, successCount: 2 };
    const result = await importSettings(JSON.stringify({ settings: {}, selectorCache: { 'example.org': entry } }), { importCache: true });
    expect(result.cacheImported).toBe(true);
    expect(stored.selector_cache['example.org'].selectors).toEqual({ content: 'article', title: 'h1', exclude: ['.related'] });
    const original = structuredClone(stored.selector_cache);
    const rejected = await importSettings(JSON.stringify({ settings: {}, selectorCache: { 'example.org': { selectors: { content: {} } } } }), { importCache: true });
    expect(rejected.cacheImported).toBe(false);
    expect(stored.selector_cache).toEqual(original);
  });
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
