import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readZipEntries } from '../helpers/zip-entries.js';
const ai = vi.hoisted(() => vi.fn());
vi.mock('../../scripts/api/index.js', () => ({ callAI: ai, getProviderFromModel: () => 'openai' }));
vi.mock('../../scripts/extraction/html-utils.js', async original => ({ ...(await original()), splitHtmlIntoChunks: () => ['source'] }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/translation/index.js', () => ({ detectLanguageByCharacters: () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en', getAIRequestOptions: () => ({ provider: 'openai' }),
  getProcessingCallbacks: () => ({ updateState: vi.fn(), updateProgress: vi.fn(), checkCancellation: vi.fn() })
}));
import { processWithExtractMode } from '../../scripts/processing/modes.js';
import { generateEpub } from '../../scripts/generation/epub.js';
import { generateFb2 } from '../../scripts/generation/fb2.js';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';
import { markdownToHtml } from '../../scripts/utils/html.js';
afterEach(() => vi.restoreAllMocks());

it('preserves the real HTML extraction response through all four document serializers', async () => {
  const response = { title: 'Measured systems', author: 'Example Author', content: [
    { type: 'heading', level: 1, text: 'Measured systems' },
    { type: 'heading', level: 2, text: '<em>Measurements</em>' },
    { type: 'paragraph', text: '<strong>Measured</strong> <a href="https://example.org/ref?a=1&amp;b=2">response</a> and Array&lt;T&gt;.' },
    { type: 'list', ordered: true, items: ['Before <strong>detail</strong><ul><li>Nested <em>record</em></li></ul>After.'] },
    { type: 'code', language: 'js', text: 'if (a < b) return "<tag>";' },
    { type: 'paragraph', text: '<literal> and **stars**', format: 'text' },
    { type: 'heading', level: 1, id: 'measurements', text: 'Measured systems' },
    { type: 'heading', level: 3, id: 'measurements', text: 'Closing observation' }
  ] };
  const before = structuredClone(response);
  ai.mockResolvedValue(response);
  const result = await processWithExtractMode({ html: '<article>Source.</article>', url: 'https://example.org/article', model: 'custom-model', provider: 'openai', apiKey: 'synthetic-key' });
  expect(result.content.find(item => item.type === 'paragraph').html).toBe(response.content.find(item => item.type === 'paragraph').text);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  chrome.downloads.download.mockResolvedValue(1);
  const data = { ...result, language: 'en', sourceUrl: 'https://example.org/article', generateToc: true };
  const epub = readZipEntries(await (await generateEpub(data)).arrayBuffer());
  const outputs = {
    EPUB: new JSDOM(epub['OEBPS/content.xhtml'].toString('utf8'), { contentType: 'application/xml' }).window.document,
    FB2: new JSDOM(await (await generateFb2(data)).text(), { contentType: 'application/xml' }).window.document,
    Markdown: new JSDOM(markdownToHtml(await generateMarkdown(data))).window.document,
    PDF: new JSDOM(buildHtmlForPdf(result.content, result.title, result.author, '', data.sourceUrl)).window.document
  };
  for (const [format, document] of Object.entries(outputs)) {
    expect(document.querySelector('parsererror'), format).toBeNull();
    const text = document.documentElement.textContent;
    for (const value of ['Measured', 'Array<T>', 'Before', 'Nested', 'After.', '<literal>', '**stars**', 'if (a < b)']) expect(text, format).toContain(value);
    expect(text.indexOf('Before'), format).toBeLessThan(text.indexOf('Nested'));
    expect(text.indexOf('Nested'), format).toBeLessThan(text.indexOf('After.'));
    const link = [...document.querySelectorAll('a')].find(node => node.textContent === 'response');
    expect(link?.getAttribute(format === 'FB2' ? 'l:href' : 'href'), format).toBe('https://example.org/ref?a=1&b=2');
    expect([...document.querySelectorAll('strong,b')].some(node => node.textContent === 'Measured'), format).toBe(true);
    const bodyHeadings = [...document.querySelectorAll(format === 'FB2' ? 'section > title' : 'h1,h2,h3')];
    expect(bodyHeadings.some(node => node.textContent === 'Measured systems'), format).toBe(true);
    if (format !== 'Markdown') {
      const ids = [...document.querySelectorAll('[id]')].map(node => node.id || node.getAttribute('id'));
      expect(new Set(ids).size, format).toBe(ids.length);
      for (const node of document.querySelectorAll('a')) {
        const href = node.getAttribute(format === 'FB2' ? 'l:href' : 'href');
        if (href?.startsWith('#')) expect(ids, `${format} ${href}`).toContain(href.slice(1));
      }
    }
  }
  expect(response).toEqual(before);
  expect(ai).toHaveBeenCalledOnce();
});

it('keeps valid neighboring content when an item has a malformed text value', async () => {
  const content = [
    { type: 'paragraph', text: { unexpected: 'shape' } },
    { type: 'heading', level: 2, text: { unexpected: 'shape' } },
    { type: 'code', text: { unexpected: 'shape' } },
    { type: 'list', items: [null, { html: '<strong>Valid list item</strong>' }] },
    { type: 'paragraph', format: 'text', text: 'Valid surrounding content.' }
  ];
  const before = structuredClone(content);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  chrome.downloads.download.mockResolvedValue(1);
  const data = { content, title: 'Sample document', language: 'en' };
  const epub = readZipEntries(await (await generateEpub(data)).arrayBuffer());
  const outputs = [epub['OEBPS/content.xhtml'].toString('utf8'), await (await generateFb2(data)).text(),
    await generateMarkdown(data), buildHtmlForPdf(content, data.title, '', '')];
  for (const output of outputs) {
    expect(output).toContain('Valid surrounding content.');
    expect(output).toContain('Valid list item');
    expect(output).not.toContain('[object Object]');
  }
  expect(content).toEqual(before);
});
