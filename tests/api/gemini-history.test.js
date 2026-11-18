import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAIWithImageAndHistory } from '../../scripts/api/index.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: (operation, options = {}) => operation({ signal: new AbortController().signal, deadline: Date.now() + (options.timeoutMs ?? 600000) }) }));
vi.mock('../../scripts/utils/encryption.js', () => ({ getDecryptedKeyCached: vi.fn(async key => key), decryptApiKey: vi.fn(async key => key) }));
afterEach(() => vi.unstubAllGlobals());

describe('Gemini image conversation history', () => {
  it.each(['native', 'chat'])('sends preceding image and assistant turns with the next page: %s', async representation => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"text":"Second page","metadata":{}}' }] } }] }), { headers: { 'Content-Type': 'application/json' } })));
    const parts = representation === 'native'
      ? [{ text: 'First page' }, { inline_data: { mime_type: 'image/jpeg', data: 'Zmlyc3Q=' } }]
      : [{ type: 'text', text: 'First page' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,Zmlyc3Q=' } }];
    const history = [{ role: 'user', content: parts }, { role: 'assistant', content: 'Earlier extracted paragraph.' }];
    const before = structuredClone(history);
    const result = await callAIWithImageAndHistory('Preserve document structure.', 'Second page', 'data:image/webp;base64,c2Vjb25k', history, 'synthetic-key', 'custom-model', true, { provider: 'gemini' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents).toHaveLength(3);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'First page' }, { inline_data: { mime_type: 'image/jpeg', data: 'Zmlyc3Q=' } }] });
    expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: 'Earlier extracted paragraph.' }] });
    expect(body.contents[2].parts[1].inline_data).toEqual({ mime_type: 'image/webp', data: 'c2Vjb25k' });
    expect(result.result.text).toBe('Second page');
    expect(result.userMessage.role).toBe('user');
    expect(history).toEqual(before);
  });
});
