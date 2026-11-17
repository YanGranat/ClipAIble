import { beforeEach, describe, expect, it, vi } from 'vitest';
const providers = vi.hoisted(() => Object.fromEntries(['openai', 'claude', 'gemini', 'grok', 'openrouter', 'deepseek'].map(name => [name, { text: vi.fn(), image: vi.fn(), history: vi.fn() }])));
vi.mock('../../scripts/api/openai.js', () => ({ callOpenAI: providers.openai.text, callOpenAIWithImage: providers.openai.image, callOpenAIWithImageAndHistory: providers.openai.history, parseModelConfig: model => ({ modelName: model }) }));
vi.mock('../../scripts/api/claude.js', () => ({ callClaudeAPI: providers.claude.text, callClaudeAPIWithImage: providers.claude.image, callClaudeAPIWithImageAndHistory: providers.claude.history }));
vi.mock('../../scripts/api/gemini.js', () => ({ callGeminiAPI: providers.gemini.text, callGeminiAPIWithImage: providers.gemini.image, translateImageWithGemini: vi.fn() }));
vi.mock('../../scripts/api/grok.js', () => ({ callGrokAPI: providers.grok.text, callGrokAPIWithImage: providers.grok.image, callGrokAPIWithImageAndHistory: providers.grok.history }));
vi.mock('../../scripts/api/openrouter.js', () => ({ callOpenRouterAPI: providers.openrouter.text, callOpenRouterAPIWithImage: providers.openrouter.image, callOpenRouterAPIWithImageAndHistory: providers.openrouter.history }));
vi.mock('../../scripts/api/deepseek.js', () => ({ callDeepSeekAPI: providers.deepseek.text, callDeepSeekAPIWithImage: providers.deepseek.image, callDeepSeekAPIWithImageAndHistory: providers.deepseek.history }));
vi.mock('../../scripts/utils/encryption.js', () => ({ getDecryptedKeyCached: vi.fn(async key => key) }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));
import { callAI, callAIWithImage, callAIWithImageAndHistory } from '../../scripts/api/index.js';
import { getDecryptedKeyCached } from '../../scripts/utils/encryption.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const provider of Object.values(providers)) for (const fn of Object.values(provider)) fn.mockResolvedValue('Result');
});

describe('explicit AI provider routing', () => {
  it('sends a custom text model and its key only to the selected provider', async () => {
    await callAI('System', 'Article', 'synthetic-key', 'custom-model', false, { provider: 'openrouter' });
    expect(providers.openrouter.text).toHaveBeenCalledTimes(1);
    expect(providers.openai.text).not.toHaveBeenCalled();
    expect(getDecryptedKeyCached).toHaveBeenCalledWith('synthetic-key', 'openrouter');
  });

  it('preserves the selected provider for image and history calls', async () => {
    await callAIWithImage('System', 'Article', 'data:image/jpeg;base64,YQ==', 'synthetic-key', 'tunedModels/example', false, { provider: 'gemini' });
    await callAIWithImageAndHistory('System', 'Article', 'data:image/jpeg;base64,YQ==', [], 'synthetic-key', 'custom-model', false, { provider: 'claude' });
    expect(providers.gemini.image).toHaveBeenCalledTimes(1);
    expect(providers.claude.history).toHaveBeenCalledTimes(1);
    expect(providers.openrouter.image).not.toHaveBeenCalled();
    expect(providers.openai.history).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'constructor', null])('rejects an invalid explicit provider before using credentials: %s', async provider => {
    await expect(callAI('System', 'Article', 'synthetic-key', 'custom-model', false, { provider })).rejects.toThrow('Unsupported AI provider');
    expect(getDecryptedKeyCached).not.toHaveBeenCalled();
    for (const candidate of Object.values(providers)) expect(candidate.text).not.toHaveBeenCalled();
  });

  it('checks cancellation before decrypting or dispatching a request', async () => {
    await expect(callAI('System', 'Article', 'synthetic-key', 'custom-model', false, {
      provider: 'openrouter', checkCancelled: () => { throw new Error('Cancelled'); }
    })).rejects.toThrow('Cancelled');
    expect(getDecryptedKeyCached).not.toHaveBeenCalled();
    expect(providers.openrouter.text).not.toHaveBeenCalled();
  });

  it('infers a provider when callers omit the explicit selection', async () => {
    await callAI('System', 'Article', 'synthetic-key', 'deepseek-chat', false);
    expect(providers.deepseek.text).toHaveBeenCalledTimes(1);
  });
});
