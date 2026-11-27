import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { runExtraction } from '../../scripts/extraction/extractor/index.js';
import { contentToPlainText, prepareChunkForAudio, prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { callAI } from '../../scripts/api/index.js';

vi.mock('../../scripts/api/index.js', () => ({ callAI: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/state/processing.js', () => ({
  PROCESSING_STAGES: { GENERATING: { id: 'generating' } }, getProcessingState: () => ({}), isCancelled: () => false
}));
vi.mock('../../scripts/utils/pipeline-helpers.js', async importOriginal => ({
  ...await importOriginal(), checkCancellation: vi.fn(async () => {})
}));

let dom;
beforeEach(() => vi.clearAllMocks());
afterEach(() => { dom?.window.close(); dom = null; vi.unstubAllGlobals(); });
const normalized = text => text.replace(/\s+/g, ' ').trim();

describe('Narration text conservation', () => {
  it('keeps the subtitle produced by selector extraction before the article body', async () => {
    dom = new JSDOM('<title>Coastal Survey</title><article><h1>Coastal Survey</h1><p class="deck">The survey follows changes across three observation sites.</p><p>The first measurement establishes the baseline.</p><p>The final measurement completes the report.</p></article>', { url: 'https://example.test/survey' });
    for (const name of ['window', 'document', 'Node', 'HTMLImageElement']) vi.stubGlobal(name, name === 'window' ? dom.window : dom.window[name]);
    const extracted = await runExtraction(dom.window.location.href, false, { content: 'article', subtitle: '.deck' });
    expect(extracted.content[0]).toMatchObject({ type: 'subtitle', text: 'The survey follows changes across three observation sites.' });
    expect(normalized(contentToPlainText(extracted.content))).toBe('The survey follows changes across three observation sites. The first measurement establishes the baseline. The final measurement completes the report.');
    expect(callAI).not.toHaveBeenCalled();
  });

  it.each([
    '2037',
    '42',
    'The sample contains 10^6 particles, and the response scales with x^2.',
    'The expression (x + y)^2 describes the combined response.',
    'The response scales with x ^2.',
    'The sample contains 10 ^6 particles.',
    'The result is independently supported (see the detailed measurements; several trials agree).',
    'The second result uses the same method (see the earlier calibration).',
    'Multiply a * b * c, then use arr[3] in version 2.3.4.',
    'See page 18, not page 23.',
    'Contact editor@example.test or open https://example.test/data.'
  ])('preserves meaningful literal narration: %s', text => {
    expect(contentToPlainText([{ type: 'paragraph', format: 'text', text }])).toBe(text);
  });

  it('keeps standalone years and counts through the complete offline preparation path', async () => {
    const content = [
      { type: 'subtitle', format: 'text', text: 'Changes across the observation period.' },
      { type: 'paragraph', format: 'text', text: 'The observation year follows.' },
      { type: 'paragraph', format: 'text', text: '2037' },
      { type: 'paragraph', format: 'text', text: 'The measured count follows.' },
      { type: 'paragraph', format: 'text', text: '42' },
      { type: 'paragraph', format: 'text', text: 'The final sample contains 10^6 particles.' }
    ];
    const chunks = await prepareContentForAudio(content, '', '', '', 'en', undefined, 'offline');
    expect(normalized(chunks.map(chunk => chunk.text).join('\n\n'))).toBe(content.map(item => item.text).join(' '));
    expect(callAI).not.toHaveBeenCalled();
  });

  it('does not delete a meaningful number returned by optional AI cleanup', async () => {
    const text = 'The observation year follows.\n\n2037\n\nThe sample contains 10^6 particles.';
    callAI.mockResolvedValue(text);
    const requestOptions = { provider: 'openai', checkCancelled: vi.fn() };
    const prepared = await prepareChunkForAudio(text, 0, 1, 'synthetic-key', 'synthetic-model', 'en', requestOptions);
    expect(normalized(prepared)).toBe(normalized(text));
    expect(callAI).toHaveBeenCalledOnce();
    expect(callAI.mock.calls[0][5]).toBe(requestOptions);
    expect(callAI.mock.calls[0][0]).toMatch(/preserve negation, uncertainty, numbers/i);
    expect(callAI.mock.calls[0][0]).not.toContain('numbers that appear alone on a line');
    expect(callAI.mock.calls[0][0]).not.toContain('Reference markers like ^1');
  });

  it('keeps explicit source breaks and strips only rendered markup and marked return controls', () => {
    const content = [{ type: 'paragraph', html: '<p>See the <a href="https://example.test/survey">second report</a> on page 8.<br>Repeat the test.</p>\n<p>Use <code>a[2] * b</code>. <a role="doc-backlink" href="#note">Return</a></p>' }];
    expect(contentToPlainText(content)).toBe('See the second report on page 8.\nRepeat the test.\n\nUse a[2] * b.');
  });
});
