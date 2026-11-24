import { afterEach, expect, it, vi } from 'vitest';
import { callClaudeAPI } from '../../scripts/api/claude.js';
import { callDeepSeekAPI } from '../../scripts/api/deepseek.js';
import { callGeminiAPI, translateImageWithGemini } from '../../scripts/api/gemini.js';
import { callGrokAPI } from '../../scripts/api/grok.js';
import { callOpenAI } from '../../scripts/api/openai.js';
import { callOpenRouterAPI, callOpenRouterAPIWithImageAndHistory } from '../../scripts/api/openrouter.js';

const image = 'data:image/jpeg;base64,/9j/2Q==';
const text = fn => options => fn('System', 'Article', 'synthetic-key', undefined, true, options);
const routes = [
  ['Claude', text(callClaudeAPI)], ['DeepSeek', text(callDeepSeekAPI)], ['Gemini', text(callGeminiAPI)],
  ['Grok', text(callGrokAPI)], ['OpenAI', text(callOpenAI)], ['OpenRouter', text(callOpenRouterAPI)],
  ['Gemini image translation', options => translateImageWithGemini(image, 'French', 'synthetic-key', options)],
  ['OpenRouter image fallback', options => callOpenRouterAPIWithImageAndHistory('System', 'Page', image, [], 'synthetic-key', undefined, true, options), true]
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(routes)('%s cancels a pending HTTP retry without waiting for Retry-After', async (_, invoke, fallback) => {
  vi.useFakeTimers();
  const schedule = vi.spyOn(globalThis, 'setTimeout');
  const response = new Response(JSON.stringify({ error: { message: 'Request rate exceeded' } }), {
    status: 429, headers: { 'Retry-After': '20' }
  });
  const network = vi.fn().mockResolvedValueOnce(response);
  if (fallback) network.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), { status: 400 }))
    .mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', network);
  const owner = new AbortController();
  const reason = new DOMException('Operation cancelled', 'AbortError');
  let outcome;
  const pending = invoke(fallback ? { checkCancelled: () => owner.signal.throwIfAborted() } : { signal: owner.signal })
    .then(value => { outcome = { value }; }, error => { outcome = { error }; });
  try {
    await vi.waitFor(() => expect(schedule.mock.calls.some(([, delay]) => delay >= 20000 && delay <= 24000)).toBe(true));
    const before = network.mock.calls.length;
    owner.abort(reason);
    await vi.advanceTimersByTimeAsync(150);
    expect(outcome).toEqual({ error: reason });
    expect(network).toHaveBeenCalledTimes(before);
  } finally {
    owner.abort(reason);
    await vi.runAllTimersAsync();
    await pending;
  }
});
