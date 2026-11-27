import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { contentToPlainText, prepareContentForAudio } from '../../scripts/generation/audio-prep.js';
import { handleTable } from '../../scripts/extraction/extractor/parse.js';
import { callAI } from '../../scripts/api/index.js';

vi.mock('../../scripts/api/index.js', () => ({ callAI: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../scripts/state/processing.js', () => ({ PROCESSING_STAGES: { GENERATING: { id: 'generating' } }, getProcessingState: () => ({}), isCancelled: () => false }));
vi.mock('../../scripts/utils/pipeline-helpers.js', async original => ({ ...await original(), checkCancellation: vi.fn(async () => {}) }));
const documents = [];
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.clearAllMocks(); });

describe('Table narration', () => {
  it('keeps compound headings with each value instead of narrating a header as data', () => {
    const dom = new JSDOM('<!doctype html><table><thead><tr><th rowspan="2">Station</th><th colspan="2">Depth</th></tr><tr><th>Shallow</th><th>Deep</th></tr></thead><tbody><tr><td>North</td><td>12</td><td>18</td></tr></tbody></table>');
    documents.push(dom);
    const table = handleTable(dom.window.document.querySelector('table'));
    expect(contentToPlainText([table])).toBe('Station: North; Depth Shallow: 12; Depth Deep: 18');
  });

  it('narrates authored graphic labels before the separate caption', () => {
    expect(contentToPlainText([{ type: 'image', isGraphic: true, alt: 'Station A\nMeasured current\nStation B', caption: '<a href="https://example.test/data">Measured sequence.</a>' }]))
      .toBe('Station A\nMeasured current\nStation B\n\nMeasured sequence.');
  });
  it('keeps each value with its column header and each row in source order', () => {
    const table = { type: 'table', headers: ['Site', 'Count', 'Change'], rows: [['North', 0, '-2.5%'], ['South', 12, '0%']] };
    expect(contentToPlainText([table])).toBe('Site: North; Count: 0; Change: -2.5%\n\nSite: South; Count: 12; Change: 0%');
  });

  it('does not shift later values across empty cells or invent values for ragged rows', () => {
    const table = { type: 'table', headers: ['Group', 'Mean', 'Count'], rows: [['Upper', '', 6], ['Lower', null, '', 'Extra observation'], ['Edge']] };
    expect(contentToPlainText([table])).toBe('Group: Upper; Count: 6\n\nGroup: Lower; Extra observation\n\nGroup: Edge');
  });

  it('retains headerless values, zero and unlabeled row names without fabricated labels', () => {
    expect(contentToPlainText([{ type: 'table', rows: [['First', 0, ''], ['Second', 'Last']] }])).toBe('First; 0\n\nSecond; Last');
    expect(contentToPlainText([{ type: 'table', headers: ['', 'Rate'], rows: [['Coastal', '7%']] }])).toBe('Coastal; Rate: 7%');
  });

  it('preserves numeric zero headers and header-only tables', () => {
    expect(contentToPlainText([{ type: 'table', headers: [0], rows: [[0]] }])).toBe('0: 0');
    expect(contentToPlainText([{ type: 'table', headers: ['Site', '', 'Count'], rows: [] }])).toBe('Site; Count');
    expect(contentToPlainText([{ type: 'table', headers: [], rows: [[], ['', null]] }])).toBe('');
  });

  it('uses the actual visible logical grid after row spans and hidden layout columns are resolved', () => {
    const dom = new JSDOM('<!doctype html><table><thead><tr><th>Site</th><th>Count</th><th style="display:none">Hidden</th><th>Rate</th></tr></thead><tbody><tr><td rowspan="2">North</td><td>0</td><td style="display:none">excluded cell</td><td>5%</td></tr><tr><td>3</td><td style="display:none">excluded cell</td><td></td></tr></tbody></table>');
    documents.push(dom);
    expect(dom.window.document.compatMode).toBe('CSS1Compat');
    const element = dom.window.document.querySelector('table'), before = element.outerHTML;
    const table = handleTable(element);
    expect(table.headers).toEqual(['Site', 'Count', 'Rate']);
    expect(contentToPlainText([table])).toBe('Site: North; Count: 0; Rate: 5%\n\nSite: North; Count: 3');
    expect(element.outerHTML).toBe(before);
  });

  it('projects sanitized HTML and marked powers and indices through the existing narration path', async () => {
    const table = { type: 'table', cellFormat: 'html', headers: ['<strong>Expression</strong>', 'Reference'], rows: [
      ['<span class="math">x<sup>r+1</sup> + b<sub>i</sub> + c<sub>j</sub></span>', '<a href="https://example.org/reference">Field notes</a><script>not narrated</script>']
    ] };
    const expected = 'Expression: x^{r+1} + b_{i} + c_{j}; Reference: Field notes';
    expect(contentToPlainText([table])).toBe(expected);
    const chunks = await prepareContentForAudio([table], '', '', '', 'en', undefined, 'offline');
    expect(chunks.map(chunk => chunk.text).join('\n\n')).toBe(expected);
    expect(callAI).not.toHaveBeenCalled();
  });

  it('renders legacy Markdown table cells without speaking their formatting syntax', () => {
    expect(contentToPlainText([{ type: 'table', headers: ['**Sample**'], rows: [['A [reference](https://example.org/reference)']] }])).toBe('Sample: A reference');
  });

  it.each(['text', 'native-pdf'])('keeps literal cell glyphs literal for %s content', flavor => {
    const table = { type: 'table', headers: ['Expression'], rows: [['x<sup>2</sup> & <span class="math">y<sub>i</sub></span>']] };
    if (flavor === 'text') table.cellFormat = 'text';
    else Object.assign(table, { cellFormat: 'html', pageNum: 1, lines: [{ items: [{ str: 'Native glyph source' }] }] });
    expect(contentToPlainText([table])).toBe('Expression: x<sup>2</sup> & <span class="math">y<sub>i</sub></span>');
  });

  it('retains the table between neighboring narrative blocks without mutating its arrays', () => {
    const table = Object.freeze({ type: 'table', headers: Object.freeze(['Group', 'Count']), rows: Object.freeze([Object.freeze(['Coastal', '27'])]) });
    const content = Object.freeze([{ type: 'paragraph', text: 'Before.' }, table, { type: 'paragraph', text: 'After.' }]);
    expect(contentToPlainText(content)).toBe('Before.\n\nGroup: Coastal; Count: 27\n\nAfter.');
    expect(table.rows).toEqual([['Coastal', '27']]);
  });

  it('keeps source order and semantic boundaries across article content types', () => {
    const content = [
      { type: 'heading', format: 'text', text: 'Survey' }, { type: 'subtitle', text: 'A short deck.' },
      { type: 'paragraph', html: 'A <strong>measured</strong> result.' }, { type: 'quote', text: 'First statement.' },
      { type: 'blockquote', text: 'Second statement.' }, { type: 'list', items: ['One', 'Two'] },
      { type: 'code', text: 'x[2] = 17;' }, { type: 'image', caption: 'Plot caption.' }, { type: 'separator' },
      { type: 'infobox_start', title: 'Context' }, { type: 'paragraph', format: 'text', text: 'Literal <tag>.' }, { type: 'infobox_end' }
    ];
    expect(contentToPlainText(content)).toBe('Survey\n\nA short deck.\n\nA measured result.\n\nFirst statement.\n\nSecond statement.\n\nOne\n\nTwo\n\nx[2] = 17;\n\nPlot caption.\n\nContext:\n\nLiteral <tag>.');
  });
});
