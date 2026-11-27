import { expect, it, vi } from 'vitest';
import { prepareQuickSaveData, getQuickSaveSettingsKeys } from '../../scripts/processing/quicksave.js';
import { determineProviderAndModel } from '../../scripts/utils/storage/settings-helpers.js';
import { STYLE_PRESETS } from '../../scripts/utils/config.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/security/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key, clearDecryptedKeyCache: vi.fn() }));
const prepare = (settings, format = 'pdf') => prepareQuickSaveData(settings, format, 1, '<main>Article</main>', 'https://example.com/article', 'Article');

it('reads custom-model ownership before migrating a context-menu selection', () => {
  expect(getQuickSaveSettingsKeys()).toContain('custom_models');
  expect(getQuickSaveSettingsKeys()).toContain('image_translation_provider');
});

it.each([
  ['openai', 'gpt-5.2-high', 'gpt-6.2-sol-high'],
  ['claude', 'claude-sonnet-4-5', 'claude-sonnet-5-5'],
  ['gemini', 'gemini-3-pro-preview', 'gemini-4-carbon'],
  ['grok', 'grok-4', 'grok-4.7'],
  ['grok', 'grok-4.3', 'grok-4.7'],
  ['grok', 'grok-4-1-fast-reasoning', 'grok-4.7'],
  ['openrouter', 'x-ai/grok-4.3', 'x-ai/grok-4.7'],
  ['deepseek', 'deepseek-chat', 'deepseek-flash'],
  ['deepseek', 'deepseek-flash-no-thinking', 'deepseek-flash'],
  ['deepseek', 'deepseek-v4-pro', 'deepseek-flash'],
  ['openrouter', 'deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4.1-flash-1017'],
  ['openrouter', 'deepseek/deepseek-v4.1-flash-no-thinking', 'deepseek/deepseek-v4.1-flash-1017'],
  ['openrouter', 'deepseek/deepseek-v4-pro-0813', 'deepseek/deepseek-v4.1-flash-1017']
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

it('uses only the speech key for automatic narration of an article in its original language', async () => {
  const settings = { extraction_mode: 'automatic', api_provider: 'openrouter', audio_provider: 'openrouter',
    openrouter_tts_api_key: 'synthetic-speech-key' };
  await expect(prepare(settings, 'audio')).resolves.toMatchObject({ apiKey: '', audioPreparationPrompt: null,
    openrouterTtsApiKey: 'synthetic-speech-key' });
  const savedPrompt = 'Speak the name as recorded. {{languageInstruction}}';
  const custom = { ...settings, prompt_override_audioPreparation: savedPrompt };
  await expect(prepare(custom, 'audio')).rejects.toThrow('No API key');
  await expect(prepare({ ...custom, openrouter_api_key: 'synthetic-text-key' }, 'audio'))
    .resolves.toMatchObject({ apiKey: 'synthetic-text-key', audioPreparationPrompt: savedPrompt });
  await expect(prepare({ ...custom, audio_provider: 'offline' }, 'audio')).resolves.toMatchObject({ apiKey: '', audioPreparationPrompt: null });
});

it('restores Supertonic voice from its own settings with no cloud credentials or prompts', async () => {
  const settings = { extraction_mode: 'automatic', audio_provider: 'supertonic',
    audio_voice_map: { current: { supertonic: 'M2', offline: 'en_US-lessac-medium' } },
    prompt_override_audioPreparation: 'Keep every phrase. {{languageInstruction}}' };
  await expect(prepare(settings, 'audio')).resolves.toMatchObject({ audioProvider: 'supertonic', audioVoice: 'M2',
    apiKey: '', audioPreparationPrompt: null });
  await expect(prepare({ ...settings, audio_voice_map: {} }, 'audio')).resolves.toMatchObject({ audioVoice: 'F1' });
});

it.each(['https://www.youtube.com/watch?v=survey12345', 'https://vimeo.com/123456'])('retains the subtitle text key requirement for %s', async url => {
  const settings = { extraction_mode: 'automatic', audio_provider: 'offline' };
  await expect(prepareQuickSaveData(settings, 'audio', 1, '', url, 'Survey')).rejects.toThrow('No API key');
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

it('uses the saved OpenAI image key independently of the article provider', async () => {
  const settings = { api_provider: 'deepseek', deepseek_api_key: 'synthetic-article-key', openai_api_key: 'ENC:synthetic-image-key',
    google_api_key: 'synthetic-google-key', image_translation_provider: 'openai', translate_images: true, pdf_language: 'fr' };
  await expect(prepare(settings)).resolves.toMatchObject({ provider: 'deepseek', apiKey: 'synthetic-article-key',
    imageTranslationProvider: 'openai', imageApiKey: 'ENC:synthetic-image-key', googleApiKey: 'synthetic-google-key', translateImages: true });
});

it.each(['markdown', 'audio'])('does not enable image editing for hidden %s quick save', async format => {
  await expect(prepare({ extraction_mode: 'automatic', translate_images: true, pdf_language: 'fr', image_translation_provider: 'openai', openai_api_key: 'synthetic-image-key' }, format))
    .resolves.toMatchObject({ translateImages: false, imageApiKey: null });
});

it('preserves default Gemini settings and leaves automatic language images unchanged', async () => {
  await expect(prepare({ extraction_mode: 'automatic', translate_images: true, pdf_language: 'fr', google_api_key: 'synthetic-google-key', openai_api_key: 'synthetic-text-key' }))
    .resolves.toMatchObject({ imageTranslationProvider: 'gemini', geminiImageModel: 'gemini-3-pro-image', imageApiKey: 'synthetic-google-key', translateImages: true });
  await expect(prepare({ extraction_mode: 'automatic', translate_images: true, pdf_language: 'auto', openai_api_key: 'synthetic-image-key' }))
    .resolves.toMatchObject({ translateImages: false, imageApiKey: null });
});

it('restores separate text, image, and speech credentials with OpenRouter selected for all three', async () => {
  expect(getQuickSaveSettingsKeys()).toEqual(expect.arrayContaining(
    ['openrouter_image_model', 'openrouter_tts_model', 'openrouter_tts_voice', 'openrouter_tts_options',
      'openrouter_api_key', 'openrouter_image_api_key', 'openrouter_tts_api_key']));
  const settings = {
    api_provider: 'openrouter', openrouter_api_key: 'synthetic-text-key',
    openrouter_image_api_key: 'ENC:synthetic-openrouter-image-key', openrouter_tts_api_key: 'ENC:synthetic-openrouter-speech-key',
    translate_images: true, pdf_language: 'fr', image_translation_provider: 'openrouter',
    openrouter_image_model: 'openai/gpt-image-2.6-sunburst', audio_provider: 'openrouter',
    openrouter_tts_model: 'google/gemini-3.8-flash-lite-tts', openrouter_tts_voice: 'Kore', google_tts_voice: 'Zephyr',
    openrouter_tts_options: {
      'google/gemini-3.8-flash-lite-tts': { instructions: 'Read slowly.', speed: 1.7 },
      'x-ai/grok-voice-tts-1.0': { speed: 1.35 }
    }
  };
  const pdf = await prepare(settings);
  expect(pdf).toMatchObject({ provider: 'openrouter', apiKey: 'synthetic-text-key', imageTranslationProvider: 'openrouter',
    imageApiKey: 'ENC:synthetic-openrouter-image-key', openrouterImageModel: 'openai/gpt-image-2.6-sunburst' });
  expect(pdf).not.toHaveProperty('openrouterTtsApiKey');
  await expect(prepare(settings, 'audio')).resolves.toMatchObject({ provider: 'openrouter', apiKey: 'synthetic-text-key',
    audioProvider: 'openrouter', openrouterTtsApiKey: 'ENC:synthetic-openrouter-speech-key', openrouterTtsVoice: 'Kore',
    openrouterTtsModel: 'google/gemini-3.8-flash-lite-tts', googleTtsVoice: 'Zephyr', imageApiKey: null,
    openrouterTtsOptions: { instructions: 'Read slowly.' } });
  delete settings.openrouter_tts_api_key;
  await expect(prepare(settings, 'audio')).resolves.toMatchObject({ openrouterTtsApiKey: null });
  delete settings.openrouter_image_api_key;
  await expect(prepare(settings)).resolves.toMatchObject({ imageApiKey: null });
});

it('uses the same stored Google editor selection for quick save as for popup exports', async () => {
  expect(getQuickSaveSettingsKeys()).toContain('gemini_image_model');
  const settings = { extraction_mode: 'automatic', translate_images: true, pdf_language: 'fr', google_api_key: 'synthetic-google-key', openai_api_key: 'synthetic-text-key', gemini_image_model: 'gemini-3.1-flash-lite-image' };
  await expect(prepare(settings)).resolves.toMatchObject({ geminiImageModel: 'gemini-3.1-flash-lite-image' });
});

it('uses the TL;DR preference only for an AI document and checks keys for explicit translation', async () => {
  await expect(prepare({ extraction_mode: 'automatic', generate_abstract: true })).resolves.toMatchObject({ generateAbstract: false });
  await expect(prepare({ extraction_mode: 'selector', generate_abstract: true, openai_api_key: 'synthetic-text-key' }))
    .resolves.toMatchObject({ generateAbstract: true });
  await expect(prepare({ extraction_mode: 'automatic', pdf_language: 'fr' })).rejects.toThrow('No API key');
});
