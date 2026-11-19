import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ai: vi.fn(), split: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: mocks.ai, getProviderFromModel: () => 'deepseek' }));
vi.mock('../../scripts/extraction/html-utils.js', async original => ({ ...(await original()), splitHtmlIntoChunks: mocks.split }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/translation/index.js', () => ({ detectLanguageByCharacters: () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en', getAIRequestOptions: data => ({ provider: data.provider }),
  getProcessingCallbacks: () => ({ updateState: vi.fn(), updateProgress: vi.fn(), checkCancellation: vi.fn() })
}));
import { processWithExtractMode } from '../../scripts/processing/modes.js';
import { CONFIG } from '../../scripts/utils/config.js';

const link = '<strong>Measured</strong> <a href="https://example.org/reference?a=1&amp;b=2">response</a>, <code>x &lt; y</code> and Array&lt;T&gt;.';
const nested = 'Before <em>detail</em><ul><li>Nested <strong>observation</strong></li></ul> after.';
function response() {
  return { title: 'Independent observations', author: 'Example Author', publishDate: '2031-04-12', detectedLanguage: 'en', content: [
    { type: 'heading', level: 2, text: '<em>Measurements</em>' },
    { type: 'paragraph', text: link },
    { type: 'quote', text: '<u>A recorded observation.</u>' },
    { type: 'subtitle', text: 'A <strong>short</strong> introduction.' },
    { type: 'list', ordered: true, items: [nested, { text: '<strong>Second item</strong>' }, { html: '<em>Explicit item</em>' }, { text: '<literal> and **stars**', format: 'text' }] },
    { type: 'code', language: 'js', text: 'if (a < b) print("<tag>");' },
    { type: 'paragraph', text: '<literal> and **stars**', format: 'text', pageNum: 1, lines: [{ text: '<literal> and **stars**', items: [{ str: '<literal> and **stars**' }] }] },
    { type: 'paragraph', text: '**Explicit Markdown**', format: 'markdown' },
    { type: 'paragraph', text: 'Explicit HTML', html: '<u>Explicit HTML</u>' },
    { type: 'paragraph', html: '<strong>HTML-only response</strong>' },
    { type: 'image', src: 'https://example.org/figure.png', alt: '<literal> label' },
    { type: 'table', headers: ['**Type**'], rows: [['Array<T>']] },
    { type: 'table', cellFormat: 'html', headers: ['<strong>Type</strong>'], rows: [['Array&lt;T&gt;']] }
  ] };
}
beforeEach(() => { vi.clearAllMocks(); mocks.split.mockReturnValue(['first']); });

describe('HTML extraction response boundary', () => {
  it.each([false, true])('serializes full diagnostics only when explicitly enabled: %s', async verbose => {
    const previous = { level: CONFIG.LOG_LEVEL, verbose: CONFIG.VERBOSE_LOGGING };
    CONFIG.LOG_LEVEL = verbose ? 0 : 2;
    CONFIG.VERBOSE_LOGGING = verbose;
    const stringify = vi.spyOn(JSON, 'stringify');
    mocks.split.mockReturnValue(['first', 'last']);
    mocks.ai.mockResolvedValueOnce({ content: [{ type: 'paragraph', text: '<strong>First</strong> observation.' }] });
    mocks.ai.mockResolvedValueOnce({ content: [{ type: 'paragraph', text: 'Last observation.' }] });
    try {
      await processWithExtractMode({ html: '<article>Source content.</article>', url: 'https://example.org/article', apiKey: 'synthetic-key', model: 'custom/text-engine', provider: 'deepseek' });
      const snapshots = stringify.mock.calls.filter(([value]) => Array.isArray(value) && value.some(item => item?.type === 'paragraph'));
      expect(snapshots.length).toBe(verbose ? 2 : 0);
    } finally {
      stringify.mockRestore();
      CONFIG.LOG_LEVEL = previous.level;
      CONFIG.VERBOSE_LOGGING = previous.verbose;
    }
  });
  it.each([1, 2])('normalizes rich roles before publishing %s chunks without changing source responses', async count => {
    const first = response(), before = structuredClone(first);
    mocks.split.mockReturnValue(count === 1 ? ['first'] : ['first', 'last']);
    mocks.ai.mockResolvedValueOnce(first);
    if (count === 2) mocks.ai.mockResolvedValueOnce({ content: [{ type: 'paragraph', text: link }, { type: 'paragraph', text: 'A final <em>observation</em>.' }] });
    const data = { html: '<article>Source content.</article>', url: 'https://example.org/article', apiKey: 'synthetic-key', model: 'custom/text-engine', provider: 'deepseek' };
    const result = await processWithExtractMode(data);
    expect(result).toMatchObject({ title: first.title, author: first.author, publishDate: first.publishDate, detectedLanguage: 'en' });
    expect(result.content[0]).toMatchObject({ text: 'Measurements', html: '<em>Measurements</em>', level: 2 });
    expect(result.content[1]).toMatchObject({ text: 'Measured response, x < y and Array<T>.', html: link });
    expect(result.content[2]).toMatchObject({ html: '<u>A recorded observation.</u>' });
    expect(result.content[3]).toMatchObject({ html: 'A <strong>short</strong> introduction.' });
    expect(result.content[4].items).toEqual([{ html: nested }, { text: 'Second item', html: '<strong>Second item</strong>' }, { html: '<em>Explicit item</em>' }, { text: '<literal> and **stars**', format: 'text' }]);
    expect(result.content[5]).toEqual({ ...first.content[5], format: 'text' });
    for (const index of [6, 7, 8, 10, 11, 12]) expect(result.content[index]).toEqual(first.content[index]);
    expect(result.content[9]).toMatchObject({ html: '<strong>HTML-only response</strong>', text: 'HTML-only response' });
    expect(result.content).toHaveLength(first.content.length + (count === 2 ? 2 : 0));
    if (count === 2) expect(result.content.at(-1)).toMatchObject({ text: 'A final observation.', html: 'A final <em>observation</em>.' });
    expect(result.content.filter(item => item.html === link)).toHaveLength(count);
    expect(first).toEqual(before);
    expect(mocks.ai).toHaveBeenCalledTimes(count);
    for (const args of mocks.ai.mock.calls) {
      expect(args[3]).toBe(data.model);
      expect(args[5]).toEqual({ provider: 'deepseek' });
    }
  });
});
