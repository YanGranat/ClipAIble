import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekAPI } from '../../scripts/api/deepseek.js';
import { log } from '../../scripts/utils/logging.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options = {}) => operation({ signal: new AbortController().signal, deadline: Date.now() + (options.timeoutMs ?? 600000) }) }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({ getUILanguageCached: async () => 'en' }));
vi.mock('../../scripts/locales.js', () => ({ tSync: (key) => key }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async (error) => ({ message: error.message }) }));

afterEach(() => vi.unstubAllGlobals());

describe('DeepSeek response format fallback', () => {
  it('parses a second response after invalid streamed JSON', async () => {
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      const content = bodies.length === 1 ? 'invalid-json' : '{"title":"Example"}';
      if (body.stream) {
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    await expect(callDeepSeekAPI('Return JSON.', 'Example text.', 'synthetic-key', 'deepseek-chat')).resolves.toEqual({ title: 'Example' });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ stream: true, response_format: { type: 'json_object' } });
    expect(bodies[1].stream).toBe(false);
    expect(bodies[1]).not.toHaveProperty('response_format');
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-');
  });
});
