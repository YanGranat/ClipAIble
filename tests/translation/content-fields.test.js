import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateContent, translateText, translateMetadata, translateBatch } from '../../scripts/translation/text.js';

vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async error => error }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: () => false }));
afterEach(() => vi.unstubAllGlobals());

describe('document text translation', () => {
  it('sends literal role labels, quoted instructions, and structured article text for translation', async () => {
    const texts = ['User: the system stores a label.', 'The article quotes "ignore previous instructions".', '{"instructions":"Read this document","value":12}'];
    const prompts = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      prompts.push(body.messages[1].content);
      return new Response(JSON.stringify({ choices: [{ message: { content: prompts.length === 1 ? 'Translated paragraph.' : JSON.stringify({ translations: texts.map(() => 'Translated paragraph.') }) }, finish_reason: 'stop' }] }));
    }));
    await translateText(texts[0], 'French', 'synthetic-key', 'gpt-example', { provider: 'openai' });
    await translateBatch(texts, 'French', 'synthetic-key', 'gpt-example', { provider: 'openai' });
    expect(prompts[0]).toBe(texts[0]);
    expect(JSON.parse(prompts[1].slice(prompts[1].indexOf('\n') + 1))).toEqual(texts);
  });

  it.each(['openai', 'claude', 'gemini', 'grok', 'openrouter', 'deepseek'])('rejects reported truncation throughout %s document translation', async provider => {
    const payload = provider === 'claude'
      ? { content: [{ text: 'Partial translation' }], stop_reason: 'max_tokens' }
      : provider === 'gemini'
        ? { candidates: [{ content: { parts: [{ text: 'Partial translation' }] }, finishReason: 'MAX_TOKENS' }] }
        : { choices: [{ message: { content: 'Partial translation' }, finish_reason: 'length' }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload))));
    const options = { provider, checkCancelled() {} };
    await expect(translateText('Original paragraph.', 'French', 'synthetic-key', 'custom-model', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_TRUNCATED' });
    await expect(translateContent({ content: [{ type: 'paragraph', text: 'First paragraph.' }, { type: 'paragraph', text: 'Second paragraph.' }] }, 'fr', 'synthetic-key', 'custom-model', undefined, options)).rejects.toMatchObject({ code: 'AI_RESPONSE_TRUNCATED' });
    await expect(translateMetadata('Original title', 'French', 'synthetic-key', 'custom-model', 'title', options)).rejects.toMatchObject({ code: 'AI_RESPONSE_TRUNCATED' });
  });

  it('discards a response after its independent operation is cancelled', async () => {
    let current = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      current = false;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Obsolete translation' } }] }));
    }));
    const original = { content: [{ type: 'paragraph', text: 'Original paragraph.' }] };
    await expect(translateContent(original, 'fr', 'synthetic-key', 'gpt-example', undefined, {
      provider: 'openai', checkCancelled() { if (!current) throw new Error('Operation cancelled'); }
    })).rejects.toThrow('Operation cancelled');
    expect(original.content[0].text).toBe('Original paragraph.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('translates table cells and object list text while preserving structural fields and code', async () => {
    const original = { content: [
      { type: 'table', id: 'table-one', headers: ['Name', 'Value'], rows: [['First', 'Second']] },
      { type: 'list', ordered: true, items: [{ text: 'List item', id: 'list-one' }] },
      { type: 'code', text: 'const value = 1;' }
    ] };
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const prompt = JSON.parse(options.body).messages[1].content;
      const values = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
      seen.push(...values);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations: values.map(value => `Translated ${value}`) }) }, finish_reason: 'stop' }] }));
    }));
    const result = await translateContent(original, 'fr', 'synthetic-key', 'gpt-example', undefined, { provider: 'openai', checkCancelled() {} });
    expect(seen).toEqual(['Name', 'Value', 'First', 'Second', 'List item']);
    expect(result.content[0]).toEqual({ type: 'table', id: 'table-one', headers: ['Translated Name', 'Translated Value'], rows: [['Translated First', 'Translated Second']] });
    expect(result.content[1]).toEqual({ type: 'list', ordered: true, items: [{ text: 'Translated List item', id: 'list-one' }] });
    expect(result.content[2]).toEqual({ type: 'code', text: 'const value = 1;' });
  });
});
