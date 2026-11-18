import { afterEach, describe, expect, it, vi } from 'vitest';
import { callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory } from '../../scripts/api/claude.js';
import { callGeminiAPI, callGeminiAPIWithImage, translateImageWithGemini } from '../../scripts/api/gemini.js';
import { callOpenAI, callOpenAIWithImage, callOpenAIWithImageAndHistory } from '../../scripts/api/openai.js';
import { callGrokAPI, callGrokAPIWithImage, callGrokAPIWithImageAndHistory } from '../../scripts/api/grok.js';
import { callOpenRouterAPI, callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory } from '../../scripts/api/openrouter.js';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options = {}) => operation({ signal: new AbortController().signal, deadline: Date.now() + (options.timeoutMs ?? 600000) }) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: vi.fn(async () => 'en') }));
vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: vi.fn(async value => value) }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('provider response body deadlines', () => {
  const requests = [
    ...[
      ['Claude', callClaudeAPI, callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory],
      ['OpenAI', callOpenAI, callOpenAIWithImage, callOpenAIWithImageAndHistory],
      ['Grok', callGrokAPI, callGrokAPIWithImage, callGrokAPIWithImageAndHistory],
      ['OpenRouter', callOpenRouterAPI, callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory]
    ].flatMap(([name, text, image, history]) => [
      [name + ' text', () => text('', 'Sample text', 'sample-key')],
      [name + ' image', () => image('', 'Sample text', 'data:image/png;base64,c2FtcGxl', 'sample-key')],
      [name + ' history', () => history('', 'Sample text', 'data:image/png;base64,c2FtcGxl', [], 'sample-key')]
    ]),
    ['Gemini text', () => callGeminiAPI('', 'Sample text', 'sample-key')],
    ['Gemini image', () => callGeminiAPIWithImage('', 'Sample text', 'data:image/png;base64,c2FtcGxl', 'sample-key')],
    ['Gemini image translation', () => translateImageWithGemini('data:image/png;base64,c2FtcGxl', 'French', 'sample-key')]
  ];
  it.each(requests)('%s aborts a stalled body within the configured request budget', async (_name, request) => {
    vi.useFakeTimers();
    let body, signal, settled = false;
    const stream = new ReadableStream({ start(controller) { body = controller; } });
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { signal = options.signal; return new Response(stream); }));
    const result = request().then(value => { settled = true; return value; }, error => { settled = true; return error; });
    try {
      await vi.advanceTimersByTimeAsync(CONFIG.API_TIMEOUT_MS + 1);
      expect(signal?.aborted).toBe(true);
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await result;
    } finally {
      body.error(new DOMException('Closed', 'AbortError'));
    }
  });
  it.each(requests)('%s does not accept provider-reported truncation as a complete response', async (name, request) => {
    const payload = {
      stop_reason: 'max_tokens', content: [{ type: 'text', text: '{}' }],
      choices: [{ finish_reason: 'length', message: { content: '{}' } }],
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }, { inlineData: { mimeType: 'image/png', data: 'c2FtcGxl' } }] } }]
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })));
    const result = await request().catch(error => error);
    if (name === 'Gemini image translation') expect(result).toBeNull();
    else {
      expect(result).toBeInstanceOf(Error);
      expect(result.code).toBe('AI_RESPONSE_TRUNCATED');
    }
  });
});
