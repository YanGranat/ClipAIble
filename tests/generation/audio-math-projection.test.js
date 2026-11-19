import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { sanitizeParagraphHtml } from '../../scripts/extraction/extractor/parse.js';
import { basicCleanup, contentToPlainText, prepareChunkForAudio, prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { callAI } from '../../scripts/api/index.js';

vi.mock('../../scripts/api/index.js', () => ({ callAI: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { GENERATING: { id: 'generating' } }, getProcessingState: () => ({}), isCancelled: () => false }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async importOriginal => ({ ...await importOriginal(), checkCancellation: vi.fn(async () => {}) }));

let dom;
beforeEach(() => vi.clearAllMocks());
afterEach(() => { dom?.window.close(); dom = null; vi.unstubAllGlobals(); });
const math = '<span class="math">a<sup>r+1</sup> + b<sub>i</sub> + c<sub>j</sub></span>';
const expected = 'a^{r+1} + b_{i} + c_{j}';

describe('Semantic math narration projection', () => {
  it('preserves verified MathML power and index semantics through actual extraction and offline preparation', async () => {
    dom = new JSDOM('<!doctype html><p>The count is <math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mn>7</mn><mrow><mi>r</mi><mo>+</mo><mn>1</mn></mrow></msup><mo>+</mo><msub><mi>z</mi><mi>i</mi></msub></math>.</p>');
    expect(dom.window.document.compatMode).toBe('CSS1Compat');
    const paragraph = dom.window.document.querySelector('p'), before = paragraph.outerHTML;
    const html = sanitizeParagraphHtml(paragraph);
    expect(html).toContain('class="math"');
    const content = [{ type: 'paragraph', html, text: html }];
    expect(contentToPlainText(content)).toBe('The count is 7^{r+1}+z_{i}.');
    const chunks = await prepareContentForAudio(content, '', '', '', 'en', undefined, 'offline');
    expect(chunks.map(chunk => chunk.text).join(' ')).toBe('The count is 7^{r+1}+z_{i}.');
    expect(paragraph.outerHTML).toBe(before);
    expect(callAI).not.toHaveBeenCalled();
  });

  it.each(['paragraph', 'heading', 'subtitle', 'quote', 'blockquote'])('preserves marked formula structure in %s content', type => {
    const text = contentToPlainText([{ type, html: `Before ${math} after.` }]);
    expect(text).toContain(`Before ${expected} after.`);
    expect(text.split(expected)).toHaveLength(2);
  });

  it('uses the same projection for nested list items and image captions', () => {
    const content = [
      { type: 'list', items: [{ html: `Outer ${math}<ul><li>Inner ${math}</li></ul>` }] },
      { type: 'image', caption: `Caption ${math}.` }
    ];
    const before = structuredClone(content), text = contentToPlainText(content);
    expect(text).toContain(`Outer ${expected}`);
    expect(text).toContain(`Inner ${expected}`);
    expect(text).toContain(`Image: Caption ${expected}.`);
    expect(text.split(expected)).toHaveLength(4);
    expect(content).toEqual(before);
  });

  it('preserves nested powers and indices without conflating script boundaries', () => {
    const html = '<span class="math">x<sup>m<sub>i</sub>+2</sup> + y<sub>j<sup>2</sup></sub></span>';
    expect(contentToPlainText([{ type: 'paragraph', html }])).toBe('x^{m_{i}+2} + y_{j^{2}}');
  });

  it('leaves ordinary ordinals, citation superscripts and unrelated class names unchanged', () => {
    const html = 'The 3<sup>rd</sup> result<sup id="reference"><a href="#note">4</a></sup> uses <span class="mathematics">x<sup>2</sup></span>.';
    expect(contentToPlainText([{ type: 'paragraph', html }])).toBe('The 3rd result4 uses x2.');
  });

  it('keeps literal inline code outside the mathematical narration projection', () => {
    const html = 'Literal <code><span class="math">x<sup>2</sup></span></code> example.';
    expect(contentToPlainText([{ type: 'paragraph', html }])).toBe('Literal x2 example.');
  });

  it('preserves explicit text and native PDF glyph content literally', () => {
    const literal = '<span class="math">x<sup>2</sup></span>';
    const native = { pageNum: 1, lines: [{ items: [{ str: literal }] }] };
    const content = [
      { type: 'paragraph', format: 'text', text: literal },
      { type: 'paragraph', text: literal, ...native },
      { type: 'image', caption: literal, ...native },
      { type: 'list', items: [{ format: 'text', text: literal }] }
    ];
    const text = contentToPlainText(content);
    expect(text.split(literal)).toHaveLength(5);
    expect(text).not.toContain('^{');
  });

  it('keeps canonical indices while removing ordinary underscore emphasis', () => {
    expect(basicCleanup(`The _measured_ values are ${expected}.`)).toBe(`The measured values are ${expected}.`);
  });

  it('does not erase two indices returned by optional AI cleanup and requests spoken math semantics', async () => {
    callAI.mockResolvedValue(`The _measured_ values are ${expected}.`);
    expect(await prepareChunkForAudio(expected, 0, 1, 'synthetic-key', 'synthetic-model', 'en')).toBe(`The measured values are ${expected}.`);
    expect(callAI.mock.calls[0][0]).toMatch(/mathematical operators[\s\S]*original language[\s\S]*meaning/i);
  });
});
