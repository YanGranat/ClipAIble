import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateContent } from '../../scripts/translation/text.js';
import { verifiedTableLayout, renderTableHtml } from '../../scripts/generation/document-content.js';
import { CONFIG } from '../../scripts/utils/config.js';

vi.mock('../../scripts/utils/encryption.js', () => ({ decryptApiKey: async key => key, getDecryptedKeyCached: async key => key }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', () => ({ handleError: async error => error }));
vi.mock('../../scripts/state/processing.js', () => ({ isCancelled: () => false }));
afterEach(() => vi.unstubAllGlobals());

function table() {
  return { type: 'table', cellFormat: 'html', hasHeaders: true, headers: ['<span id="group-label">Group</span>', 'Reading', 'Reading'],
    rows: [['<span>Group</span>', 'Dawn', 'Dusk'], ['North', '11', '19'], ['North', '23', '29']],
    layoutRows: [
      { group: 'head', cells: [{ column: 0, rowSpan: 2, colSpan: 1, header: true }, { column: 1, rowSpan: 1, colSpan: 2, header: true }] },
      { group: 'head', cells: [{ column: 1, rowSpan: 1, colSpan: 1, header: true }, { column: 2, rowSpan: 1, colSpan: 1, header: true }] },
      { group: 'body', cells: [{ column: 0, rowSpan: 2, colSpan: 1, header: true }, { column: 1, rowSpan: 1, colSpan: 1, header: false }, { column: 2, rowSpan: 1, colSpan: 1, header: false }] },
      { group: 'body', cells: [{ column: 1, rowSpan: 1, colSpan: 1, header: false }, { column: 2, rowSpan: 1, colSpan: 1, header: false }] }
    ] };
}

function translator(transform = value => `Translated ${value}`) {
  const seen = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    let values;
    try { values = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1)); } catch { values = null; }
    if (Array.isArray(values)) {
      seen.push(...values);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations: values.map(transform) }) }, finish_reason: 'stop' }] }));
    }
    seen.push(prompt);
    return new Response(JSON.stringify({ choices: [{ message: { content: transform(prompt) }, finish_reason: 'stop' }] }));
  }));
  return seen;
}

describe('Table translation ownership', () => {
  it('translates each physical origin once and derives all repeated grid aliases', async () => {
    const original = { content: [table()] }, before = structuredClone(original);
    const seen = translator();
    const result = await translateContent(original, 'fr', 'synthetic-key', 'gpt-example', undefined, { provider: 'openai' });
    expect(seen).toEqual(['<span>Group</span>', 'Reading', 'Dawn', 'Dusk', 'North', '11', '19', '23', '29']);
    const translated = result.content[0];
    expect(translated.headers).toEqual(['Translated <span id="group-label">Group</span>', 'Translated Reading', 'Translated Reading']);
    expect(translated.rows[0][0]).toBe('Translated <span>Group</span>');
    expect(renderTableHtml(translated).match(/id="group-label"/g)).toHaveLength(1);
    expect(translated.rows[2][0]).toBe(translated.rows[1][0]);
    expect(verifiedTableLayout(translated)).not.toBeNull();
    expect(translated.layoutRows).not.toBe(original.content[0].layoutRows);
    expect(original).toEqual(before);
  });

  it('keeps every input value visible when an unverified layout becomes coincidentally equal after translation', async () => {
    const source = table(); source.rows[0][0] = 'Different field';
    const original = { content: [source] }, before = structuredClone(original);
    const seen = translator(() => 'Same translation');
    const result = await translateContent(original, 'fr', 'synthetic-key', 'gpt-example', undefined, { provider: 'openai' });
    expect(seen).toHaveLength(12);
    expect(result.content[0]).not.toHaveProperty('layoutRows');
    expect(renderTableHtml(result.content[0]).match(/Same translation/g)).toHaveLength(12);
    expect(original).toEqual(before);
  });

  it('synchronizes aliases after all translation chunks have succeeded', async () => {
    const long = 'Extended observation. '.repeat(Math.ceil(CONFIG.TRANSLATION_CHUNK_SIZE / 22) + 1);
    const source = { type: 'table', hasHeaders: true, headers: [long, long], rows: [['First', long]], layoutRows: [
      { group: 'head', cells: [{ column: 0, rowSpan: 1, colSpan: 2, header: true }] },
      { group: 'body', cells: [{ column: 0, rowSpan: 1, colSpan: 1, header: false }, { column: 1, rowSpan: 1, colSpan: 1, header: false }] }
    ] };
    const original = { content: [source] }, before = structuredClone(original);
    translator();
    const result = await translateContent(original, 'fr', 'synthetic-key', 'gpt-example', undefined, { provider: 'openai' });
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expect(result.content[0].headers[0]).toBe(result.content[0].headers[1]);
    expect(verifiedTableLayout(result.content[0])).not.toBeNull();
    expect(original).toEqual(before);
  });
});
