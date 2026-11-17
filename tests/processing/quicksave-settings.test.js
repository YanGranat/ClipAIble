import { expect, it, vi } from 'vitest';
import { prepareQuickSaveData, getQuickSaveSettingsKeys } from '../../scripts/processing/quicksave.js';
import { determineProviderAndModel } from '../../scripts/utils/storage/settings-helpers.js';
import { STYLE_PRESETS } from '../../scripts/utils/config.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/security/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key, clearDecryptedKeyCache: vi.fn() }));
const prepare = (settings, format = 'pdf') => prepareQuickSaveData(settings, format, 1, '<main>Article</main>', 'https://example.com/article', 'Article');

it('reads custom-model ownership before migrating a context-menu selection', () => {
  expect(getQuickSaveSettingsKeys()).toContain('custom_models');
});

it.each([
  ['openai', 'gpt-5.2-high', 'gpt-6.1-sol-high'],
  ['claude', 'claude-sonnet-4-5', 'claude-sonnet-5-5'],
  ['gemini', 'gemini-3-pro-preview', 'gemini-4-carbon'],
  ['deepseek', 'deepseek-chat', 'deepseek-flash-no-thinking']
])('refreshes the saved %s built-in even before the popup opens', async (provider, previous, current) => {
  const settings = { api_provider: provider, model_by_provider: { [provider]: previous }, extraction_mode: 'automatic' };
  expect(determineProviderAndModel(settings)).toEqual({ provider, model: current });
  await expect(prepare(settings)).resolves.toMatchObject({ provider, model: current });
  expect(settings.model_by_provider[provider]).toBe(previous);
});

it('retains a custom ID that happens to equal a replaced built-in', async () => {
  const settings = { api_provider: 'openai', model_by_provider: { openai: 'gpt-5.2' }, custom_models: { openai: ['gpt-5.2'] }, extraction_mode: 'automatic' };
  await expect(prepare(settings)).resolves.toMatchObject({ provider: 'openai', model: 'gpt-5.2' });
});

it('restores the provider of a historical global selection and uses its matching key', async () => {
  const settings = { openai_model: 'claude-sonnet-4-5', claude_api_key: 'synthetic-claude-key', openai_api_key: 'synthetic-other-key', extraction_mode: 'automatic' };
  await expect(prepare(settings)).resolves.toMatchObject({ provider: 'claude', model: 'claude-sonnet-5-5', apiKey: 'synthetic-claude-key' });
});

it('uses the selected provider default when it has no saved model', () => {
  expect(determineProviderAndModel({ api_provider: 'gemini' })).toEqual({ provider: 'gemini', model: 'gemini-4-hydrogen' });
});

it.each(['pdf', 'epub', 'fb2', 'markdown', 'audio'])('allows automatic %s quick save without an AI key', async format => {
  await expect(prepare({ extraction_mode: 'automatic', audio_provider: 'offline' }, format)).resolves.toMatchObject({ mode: 'automatic', apiKey: '', outputFormat: format });
});

it('retains the key requirement for selector extraction', async () => {
  await expect(prepare({ extraction_mode: 'selector' })).rejects.toThrow('No API key');
});

it('keeps explicit provider selection when its custom model resembles another provider', async () => {
  const settings = { api_provider: 'openrouter', openai_model: 'claude-custom', openrouter_api_key: 'synthetic-router-key', claude_api_key: 'synthetic-other-key', extraction_mode: 'automatic' };
  expect(determineProviderAndModel(settings)).toEqual({ provider: 'openrouter', model: 'claude-custom' });
  await expect(prepare(settings)).resolves.toMatchObject({ provider: 'openrouter', model: 'claude-custom', apiKey: 'synthetic-router-key' });
});

it.each(Object.keys(STYLE_PRESETS))('uses the current %s palette for quick save', async preset => {
  const result = await prepare({ pdf_style_preset: preset, openai_api_key: 'synthetic-key' });
  expect(result).toMatchObject({ stylePreset: preset, ...STYLE_PRESETS[preset] });
});

it('uses all four current custom color settings', async () => {
  const result = await prepare({ openai_api_key: 'synthetic-key', pdf_style_preset: 'custom', pdf_custom_bg_color: '#112233', pdf_custom_text_color: '#445566', pdf_custom_heading_color: '#778899', pdf_custom_link_color: '#aabbcc' });
  expect(result).toMatchObject({ bgColor: '#112233', textColor: '#445566', headingColor: '#778899', linkColor: '#aabbcc' });
});
