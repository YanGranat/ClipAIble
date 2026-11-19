import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ai: vi.fn(), cancel: vi.fn(), progress: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: mocks.ai, getProviderFromModel: () => 'openai' }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/translation/index.js', () => ({ detectLanguageByCharacters: () => 'en' }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  getUILanguageCached: async () => 'en', getAIRequestOptions: data => ({ provider: data.provider, processingRunId: data.processingRunId }),
  getProcessingCallbacks: () => ({ updateState: vi.fn(), updateProgress: mocks.progress, checkCancellation: mocks.cancel })
}));
import { processWithExtractMode } from '../../scripts/processing/modes.js';
import { splitHtmlIntoChunks } from '../../scripts/extraction/html-utils.js';
import { CONFIG } from '../../scripts/utils/config.js';

const data = { url: 'https://example.org/measurements', title: 'Independent measurements', apiKey: 'synthetic-key', model: 'custom/text-engine', provider: 'openai', processingRunId: 'synthetic-run' };
const shared = [
  { type: 'heading', level: 2, text: 'Measurements' },
  { type: 'paragraph', text: 'The first observation describes the measured response.' },
  { type: 'paragraph', text: 'The second observation records <strong>independent</strong> controls.' },
  { type: 'paragraph', text: 'The method includes the following steps.' },
  { type: 'list', ordered: false, items: ['Record the sample.', 'Compare the control.'] }
];
function sharedHtml() {
  return '<h2>Measurements</h2><p>' + shared[1].text + '</p><p>' + shared[2].text + '</p><p>' + shared[3].text + '</p><ul><li>Record the sample.</li><li>Compare the control.</li></ul>';
}
function input() {
  const tail = 'The final observation includes all recorded values. '.repeat(90).trim();
  const html = '<div>' + ' '.repeat(CONFIG.CHUNK_SIZE - CONFIG.CHUNK_OVERLAP) + '</div><article>' + sharedHtml() + '<p>' + tail + '</p></article>';
  expect(splitHtmlIntoChunks(html)).toHaveLength(2);
  return { html, tail };
}
beforeEach(() => { vi.clearAllMocks(); mocks.ai.mockReset(); mocks.cancel.mockReset(); });

describe('AI extraction chunk boundaries', () => {
  it('keeps title metadata once when a single-chunk response includes its source H1 after publisher metadata', async () => {
    const publication = { type: 'paragraph', text: 'Published on: April 12, 2031' };
    mocks.ai.mockResolvedValueOnce({ title: data.title, content: [publication, { type: 'heading', level: 1, text: data.title }, { type: 'paragraph', text: 'An authored observation.' }] });
    const result = await processWithExtractMode({ ...data, html: '<article><time>April 12, 2031</time><h1>Independent measurements</h1><p>An authored observation.</p></article>' });
    expect(result.title).toBe(data.title);
    expect(result.content.map(item => item.text)).toEqual([publication.text, 'An authored observation.']);
    expect(mocks.ai).toHaveBeenCalledTimes(1);
  });

  it('uses the whole original source for title ownership after merging multiple chunk responses', async () => {
    const { html, tail } = input();
    const source = html.replace('<article>', '<article><h1>Independent measurements</h1>');
    mocks.ai.mockResolvedValueOnce({ title: data.title, content: [{ type: 'paragraph', text: '7 min read' }, { type: 'heading', level: 1, text: data.title }, ...shared] });
    mocks.ai.mockResolvedValueOnce({ content: [...structuredClone(shared), { type: 'paragraph', text: tail }] });
    const result = await processWithExtractMode({ ...data, html: source });
    expect(result.title).toBe(data.title);
    expect(result.content.some(item => item.type === 'heading' && item.level === 1)).toBe(false);
    expect(result.content.filter(item => item.type === 'heading' && item.text === 'Measurements')).toHaveLength(1);
    expect(result.content[0].text).toBe('7 min read');
    expect(mocks.ai).toHaveBeenCalledTimes(2);
  });

  it('merges the complete shared suffix/prefix once, including its heading and rich list', async () => {
    const { html, tail } = input();
    const first = { title: data.title, author: 'Example Author', publishDate: '2031-04-12', content: structuredClone(shared) };
    const last = { content: [...structuredClone(shared), { type: 'paragraph', text: tail }] };
    const untouched = structuredClone([first, last]);
    mocks.ai.mockResolvedValueOnce(first).mockResolvedValueOnce(last);
    const result = await processWithExtractMode({ ...data, html });
    expect(result.content.filter(item => item.type === 'heading' && item.text === 'Measurements')).toHaveLength(1);
    expect(result.content).toHaveLength(6);
    expect(result.content[2]).toMatchObject({ html: shared[2].text, text: 'The second observation records independent controls.' });
    expect(result.content[4].items).toEqual([{ html: 'Record the sample.' }, { html: 'Compare the control.' }]);
    expect(result.content.at(-1).text).toBe(tail);
    expect([first, last]).toEqual(untouched);
    expect(result).toMatchObject({ title: data.title, author: first.author, publishDate: first.publishDate });
    expect(mocks.ai).toHaveBeenCalledTimes(2);
    for (const call of mocks.ai.mock.calls) expect(call[5]).toEqual({ provider: 'openai', processingRunId: data.processingRunId });
  });

  it('preserves real repeated prose away from the chunk boundary', async () => {
    const { html, tail } = input();
    const repeated = { type: 'paragraph', text: 'A repeated observation can belong to a different section.' };
    mocks.ai.mockResolvedValueOnce({ content: [repeated, ...structuredClone(shared)] });
    mocks.ai.mockResolvedValueOnce({ content: [...structuredClone(shared), { type: 'paragraph', text: tail }, { ...repeated }] });
    const result = await processWithExtractMode({ ...data, html });
    expect(result.content.filter(item => item.text === repeated.text)).toHaveLength(2);
    expect(result.content.at(0).text).toBe(repeated.text);
    expect(result.content.at(-1).text).toBe(repeated.text);
  });

  it('does not publish a partial result or dispatch another chunk after cancellation', async () => {
    const { html } = input();
    const reason = new Error('Synthetic owner cancelled');
    mocks.ai.mockImplementationOnce(async () => { mocks.cancel.mockRejectedValue(reason); return { content: shared }; });
    await expect(processWithExtractMode({ ...data, html })).rejects.toBe(reason);
    expect(mocks.ai).toHaveBeenCalledTimes(1);
  });

  it('rejects cancellation after the final provider response before publishing content', async () => {
    const { html, tail } = input();
    const reason = new Error('Synthetic owner cancelled after response');
    mocks.ai.mockResolvedValueOnce({ content: shared }).mockImplementationOnce(async () => {
      mocks.cancel.mockRejectedValue(reason);
      return { content: [...structuredClone(shared), { type: 'paragraph', text: tail }] };
    });
    await expect(processWithExtractMode({ ...data, html })).rejects.toBe(reason);
    expect(mocks.ai).toHaveBeenCalledTimes(2);
  });
});
