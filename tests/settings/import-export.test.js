import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSettings, importSettings } from '../../scripts/settings/import-export.js';
import { withPromptStorageLock } from '../../scripts/settings/prompt-catalog.js';
import { addToSelectorCache, cacheSelectors, clearSelectorCache, getCachedSelectors, invalidateCache, markCacheSuccess } from '../../scripts/cache/selectors.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
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

it('round-trips OpenRouter preferences while excluding all three credentials', async () => {
  const media = {
    image_translation_provider: 'openrouter', openrouter_image_model: 'openai/gpt-image-2.6-sunburst',
    audio_provider: 'openrouter', openrouter_tts_model: 'google/gemini-3.8-flash-lite-tts', openrouter_tts_voice: 'Kore'
  };
  const existing = { openrouter_api_key: 'ENC:synthetic-text-key', openrouter_image_api_key: 'ENC:synthetic-image-key',
    openrouter_tts_api_key: 'ENC:synthetic-speech-key' };
  stored = { ...media, ...existing };
  const payload = JSON.parse((await exportSettings()).data);
  expect(payload.settings).toMatchObject(media);
  for (const key of Object.keys(existing)) expect(payload.settings).not.toHaveProperty(key);
  stored = { ...existing };
  const incoming = Object.fromEntries(Object.keys(existing).map(key => [key, 'ENC:synthetic-untrusted-key']));
  await importSettings(JSON.stringify({ ...payload, settings: { ...payload.settings, ...incoming } }), { overwriteExisting: true });
  expect(stored).toMatchObject({ ...media, ...existing });
});

it('round trips a localized OpenRouter voice without borrowing a different model voice', async () => {
  stored = { openrouter_tts_model: 'microsoft/mai-voice-2.1', openrouter_tts_voice: 'ru-RU-Masha:MAI-Voice-2.1' };
  const backup = await exportSettings();
  stored = {};
  await importSettings(backup.data, { overwriteExisting: true });
  expect(stored).toMatchObject({ openrouter_tts_model: 'microsoft/mai-voice-2.1', openrouter_tts_voice: 'ru-RU-Masha:MAI-Voice-2.1' });
});

it('round trips per-model speech options and discards unrelated or invalid values from the backup', async () => {
  stored = { openrouter_tts_options: {
    'google/gemini-3.8-flash-tts': { instructions: 'Read with clear pauses.', speed: 1.2 },
    'x-ai/grok-voice-tts-1.0': { speed: 1.4 },
    'microsoft/mai-voice-2.1': { speed: 3, style: 'narrator' }
  } };
  const backup = await exportSettings();
  const expected = { 'google/gemini-3.8-flash-tts': { instructions: 'Read with clear pauses.' },
    'x-ai/grok-voice-tts-1.0': { speed: 1.4 }, 'microsoft/mai-voice-2.1': { style: 'narrator' } };
  expect(JSON.parse(backup.data).settings.openrouter_tts_options).toEqual(expected);
  stored = {};
  await importSettings(backup.data, { overwriteExisting: true });
  expect(stored.openrouter_tts_options).toEqual(expected);
});

it('rejects a conflicting imported voice without keeping it for the newly imported model', async () => {
  stored = { openrouter_tts_model: 'x-ai/grok-voice-tts-1.0', openrouter_tts_voice: 'ara' };
  const result = await importSettings(JSON.stringify({ settings: {
    openrouter_tts_model: 'mistralai/voxtral-mini-tts-3-0', openrouter_tts_voice: 'Kore'
  } }), { overwriteExisting: true });
  expect(result.warningTranslations).toContainEqual({ key: 'warningImportValue', params: { setting: 'openrouter_tts_voice' } });
  expect(result.settingsImported).toBe(1);
  expect(stored.openrouter_tts_model).toBe('mistralai/voxtral-mini-tts-3-0');
  expect(stored).not.toHaveProperty('openrouter_tts_voice');
});

it('round trips custom prompts and rejects an import that would drop required variables', async () => {
  stored = { prompt_override_summary: 'Write clearly in {{targetLanguage}}.' };
  const backup = (await exportSettings()).data;
  stored = {};
  await importSettings(backup);
  expect(stored.prompt_override_summary).toBe('Write clearly in {{targetLanguage}}.');
  const result = await importSettings(JSON.stringify({ settings: {
    prompt_override_summary: 'Write clearly.'
  } }), { overwriteExisting: true });
  expect(stored.prompt_override_summary).toBe('Write clearly in {{targetLanguage}}.');
  expect(result.warningTranslations).toContainEqual({
    key: 'warningImportValue', params: { setting: 'prompt_override_summary' }
  });
});

it('waits for an active prompt writer before deciding which prompt to keep', async () => {
  let started;
  const editingStarted = new Promise(resolve => { started = resolve; });
  let release;
  const editingContinues = new Promise(resolve => { release = resolve; });
  const editorPrompt = 'Keep details in {{targetLanguage}}.';
  const editing = withPromptStorageLock(async () => {
    started();
    await editingContinues;
    await chrome.storage.local.set({ prompt_override_summary: editorPrompt });
  });
  await editingStarted;
  const importing = importSettings(JSON.stringify({ settings: { prompt_override_summary: 'Summarize in {{targetLanguage}}.' } }));
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(stored).not.toHaveProperty('prompt_override_summary');
  } finally {
    release();
    await Promise.all([editing, importing]);
  }
  expect(stored.prompt_override_summary).toBe(editorPrompt);
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
  it('adds missing sites and keeps the current rules even when their domain is in the backup', async () => {
    const url = 'https://source.example/article';
    await cacheSelectors(url, { content: 'main' });
    const current = await getCachedSelectors(url);
    const imported = JSON.stringify({ settings: { output_format: 'markdown' }, selectorCache: {
      'source.example': { selectors: { content: '.previous' }, invalidated: true },
      'archive.example': { selectors: { content: '.entry' } }
    } });
    stored.output_format = 'pdf';
    const options = { importCache: true };
    await importSettings(imported, options);
    await markCacheSuccess(url, current);
    expect(stored).toMatchObject({ output_format: 'pdf', selector_cache: {
      'source.example': { selectors: { content: 'main' }, invalidated: false, successCount: current.successCount + 1 },
      'archive.example': { selectors: { content: '.entry' } }
    } });
    const snapshot = structuredClone(stored.selector_cache);
    await importSettings(imported, options);
    expect(stored.selector_cache).toEqual(snapshot);
  });

  it('rejects an oversized combined cache without pruning or replacing current sites', async () => {
    stored.selector_cache = { 'current.example': { selectors: { content: 'main' } } };
    const incoming = { 'archive.example': { selectors: { content: 'article' } } };
    const maxLength = JSON.stringify(stored.selector_cache).length;
    await expect(addToSelectorCache(incoming, maxLength)).resolves.toBeGreaterThan(maxLength);
    expect(stored.selector_cache).toEqual({ 'current.example': { selectors: { content: 'main' } } });
  });

  it('provides the actual combined size and limit to the localized cache import error', async () => {
    const entry = { selectors: { content: 'main', exclude: Array(64).fill(`.${'x'.repeat(4095)}`) } };
    stored.selector_cache = Object.fromEntries(Array.from({ length: 39 }, (_, index) => [`site-${index}.example`, entry]));
    const result = await importSettings(JSON.stringify({
      settings: {}, selectorCache: { 'archive.example': entry }
    }), { importCache: true });
    expect(result.cacheImported).toBe(false);
    expect(result.errorTranslations).toContainEqual({ key: 'errorImportCacheTooLarge', params: { size: 11, max: 10 } });
    expect(stored.selector_cache).not.toHaveProperty('archive.example');
  });

  it('replaces only selected sections after explicit replacement confirmation', async () => {
    stored.selector_cache = { 'current.example': { selectors: { content: 'main' } } };
    stored.extension_stats = { totalSaved: 4 };
    const result = await importSettings(JSON.stringify({ settings: {}, statistics: { totalSaved: 2 }, selectorCache: {
      'archive.example': { selectors: { content: 'article' } }
    } }), { importCache: true, importStats: false, dataMode: 'replace' });
    expect(result).toMatchObject({ statsImported: false, cacheImported: true });
    expect(stored.extension_stats).toEqual({ totalSaved: 4 });
    expect(Object.keys(stored.selector_cache)).toEqual(['archive.example']);
  });

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
    } }), { importCache: true, dataMode: 'replace' });
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
      } }), { importCache: true, dataMode: 'replace' });
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
  it.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-flash-lite-preview-tts'
  ])('exports and imports the current Google TTS model for saved %s', async model => {
    const oldSettings = { google_tts_model: model, google_tts_voice: 'Charon',
      google_tts_prompt: 'Read calmly.' };
    const currentSettings = { ...oldSettings, google_tts_model: 'gemini-3.8-flash-lite-tts' };
    stored = { ...oldSettings };
    expect(JSON.parse((await exportSettings()).data).settings).toMatchObject(currentSettings);
    expect(stored).toEqual(oldSettings);
    stored = {};
    await importSettings(JSON.stringify({ settings: oldSettings }));
    expect(stored).toEqual({ ...currentSettings, use_selector_cache: true, enable_selector_caching: true });
  });

  it('keeps an explicitly saved current voice model when overwrite is off', async () => {
    stored = { google_tts_model: 'gemini-3.8-flash-tts' };
    await importSettings(JSON.stringify({ settings: { google_tts_model: 'gemini-2.5-flash-preview-tts' } }));
    expect(stored.google_tts_model).toBe('gemini-3.8-flash-tts');
  });

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
    const { data: exported } = await exportSettings();
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
    const exported = JSON.parse((await exportSettings()).data);
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

  it.each(['pdf', 'markdown', 'audio'])('does not export the current %s format but keeps format-specific settings', async output_format => {
    stored = { output_format, audio_provider: 'offline', pdf_style_preset: 'sepia' };
    const exported = JSON.parse((await exportSettings()).data);
    expect(exported.settings).toEqual({ audio_provider: 'offline', pdf_style_preset: 'sepia' });
    expect(stored.output_format).toBe(output_format);
  });

  it.each([[true, 'audio'], [true, null], [false, 'markdown']])('ignores a legacy format with overwrite=%s and value=%s', async (overwriteExisting, output_format) => {
    stored = { output_format: 'pdf' };
    const result = await importSettings(JSON.stringify({ settings: { output_format, pdf_style_preset: 'sepia' } }), { overwriteExisting });
    expect(stored).toMatchObject({ output_format: 'pdf', pdf_style_preset: 'sepia' });
    expect(result.warnings).toEqual([]);
  });

  it('does not create a local format when importing an older backup into a new profile', async () => {
    await importSettings(JSON.stringify({ settings: { output_format: 'audio' } }));
    expect(stored).not.toHaveProperty('output_format');
  });

  it.each([
    ['selector_cache', 'selectorCache', 'backupExportCacheUnreadable', true, false],
    ['extension_stats', 'statistics', 'backupExportStatisticsUnreadable', false, true]
  ])('continues to export the readable sections when %s cannot be read', async (key, omitted, warning, includesStatistics, includesCache) => {
    stored = { generate_toc: true, extension_stats: { totalSaved: 2 },
      selector_cache: { 'example.net': { selectors: { content: 'main' } } } };
    const get = chrome.storage.local.get.getMockImplementation();
    chrome.storage.local.get.mockImplementation(async keys => {
      if (keys.includes(key)) throw new Error('Synthetic storage failure');
      return get(keys);
    });
    const backup = await exportSettings(true, true);
    const json = JSON.parse(backup.data);
    expect(json.settings).toEqual({ generate_toc: true });
    expect(json).not.toHaveProperty(omitted);
    if (includesStatistics) expect(json.statistics.totalSaved).toBe(2);
    if (includesCache) expect(json.selectorCache).toEqual(stored.selector_cache);
    expect(backup).toMatchObject({ includesStatistics, includesCache, warnings: [{ key: warning }] });
  });

  it('includes legitimately empty requested sections without a warning', async () => {
    const backup = await exportSettings(true, true);
    expect(backup).toMatchObject({ includesStatistics: true, includesCache: true, warnings: [] });
    expect(JSON.parse(backup.data)).toMatchObject({ statistics: { totalSaved: 0, history: [] }, selectorCache: {} });
  });

  it('warns about the backup limit instead of pretending an oversized cache was included', async () => {
    stored.selector_cache = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`site-${i}.example`, { selectors: { content: 'main' } }]));
    const backup = await exportSettings(false, true);
    expect(JSON.parse(backup.data)).not.toHaveProperty('selectorCache');
    expect(backup).toMatchObject({ includesCache: false, warnings: [{ key: 'backupExportCacheLimit' }] });
  });
});
