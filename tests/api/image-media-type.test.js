import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callClaudeAPIWithImage, callClaudeAPIWithImageAndHistory } from '../../scripts/api/claude.js';
import { callGeminiAPIWithImage } from '../../scripts/api/gemini.js';
import { callOpenAIWithImage, callOpenAIWithImageAndHistory } from '../../scripts/api/openai.js';
import { callGrokAPIWithImage, callGrokAPIWithImageAndHistory } from '../../scripts/api/grok.js';
import { callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory } from '../../scripts/api/openrouter.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options = {}) => operation({ signal: new AbortController().signal, deadline: Date.now() + (options.timeoutMs ?? 600000) }) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: vi.fn(async () => 'en') }));

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], choices: [{ message: { content: '{}' } }], candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { headers: { 'Content-Type': 'application/json' } }));
});

describe('image request media types', () => {
  const callers = [
    ['Claude', image => callClaudeAPIWithImage('', 'Read the image', image, 'sample-key'), body => body.messages[0].content[0].source],
    ['Claude with history', image => callClaudeAPIWithImageAndHistory('', 'Read the image', image, [], 'sample-key'), body => body.messages[0].content[0].source],
    ['Gemini', image => callGeminiAPIWithImage('', 'Read the image', image, 'sample-key'), body => body.contents[0].parts[1].inline_data],
    ...[
      ['OpenAI', callOpenAIWithImage, callOpenAIWithImageAndHistory],
      ['Grok', callGrokAPIWithImage, callGrokAPIWithImageAndHistory],
      ['OpenRouter', callOpenRouterAPIWithImage, callOpenRouterAPIWithImageAndHistory]
    ].flatMap(([name, single, history]) => [
      [name, image => single('', 'Read the image', image, 'sample-key'), body => ({ mime_type: body.messages[1].content[1].image_url.url.split(';')[0].slice(5), data: body.messages[1].content[1].image_url.url.split(',')[1] })],
      [name + ' with history', image => history('', 'Read the image', image, [], 'sample-key'), body => ({ mime_type: body.messages[1].content[1].image_url.url.split(';')[0].slice(5), data: body.messages[1].content[1].image_url.url.split(',')[1] })]
    ])
  ];
  for (const [name, call, imageSource] of callers) {
    it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])(`${name} preserves %s and its encoded bytes`, async mediaType => {
      const data = btoa('sample image payload');
      await call(`data:${mediaType};base64,${data}`);
      const source = imageSource(JSON.parse(fetch.mock.calls[0][1].body));
      expect(source.media_type ?? source.mime_type).toBe(mediaType);
      expect(source.data).toBe(data);
    });
    it(`${name} preserves the existing raw PNG input contract`, async () => {
      await call(btoa('sample image payload'));
      const source = imageSource(JSON.parse(fetch.mock.calls[0][1].body));
      expect(source.media_type ?? source.mime_type).toBe('image/png');
    });
  }
});
