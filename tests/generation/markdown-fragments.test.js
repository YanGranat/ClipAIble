import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { generateMarkdown } from '../../scripts/generation/markdown.js';
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('chrome', { ...chrome, downloads: { download: vi.fn(async () => 1) } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const line = (str, style = {}) => ({ text: str, items: [{ str, x: 10, width: 180, ...style }] });
const generate = lines => generateMarkdown({ title: 'Sample', language: 'en', content: [{ type: 'paragraph', text: lines.map(l => l.text).join(' '), lines }] });

it.each([
  [{ isBold: true }, '**'], [{ isItalic: true }, '*'], [{ isUnderlined: true }, '__']
])('emits each of four consecutive formatted lines once: %s', async (style, marker) => {
  const texts = ['First measured record.', 'Second measured record.', 'Third measured record.', 'Fourth measured record.'];
  const output = await generate(texts.map(text => line(text, style)));
  expect(output).toContain(texts.map(text => marker + text + marker).join(' '));
  for (const text of texts) expect(output.split(text)).toHaveLength(2);
});

it('preserves alternating styles, literal punctuation and intentionally repeated lines', async () => {
  const output = await generate([line('Rate [1] + index_a', { isBold: true }), line('Second record', { isItalic: true }),
    line('Third record', { isUnderlined: true }), line('Repeated record', { isBold: true }), line('Repeated record', { isBold: true })]);
  expect(output).toContain('**Rate \\[1\\] + index\\_a** *Second record* __Third record__ **Repeated record** **Repeated record**');
  expect(output.split('Repeated record')).toHaveLength(3);
});

it.each(['paragraph', 'heading'])('exports current %s text when retained geometry describes earlier text', async type => {
  const content = [{ type, level: 2, text: 'Translated reading', html: '<b>Translated reading</b>',
    lines: [line('Original reading', { isBold: true })] }];
  const before = structuredClone(content);
  const output = await generateMarkdown({ title: 'Sample', content, language: 'en' });
  expect(output).toContain('Translated reading');
  expect(output).not.toContain('Original reading');
  expect(content).toEqual(before);
});

it('does not restore old fragments after the current paragraph text is cleared', async () => {
  const output = await generateMarkdown({ title: 'Sample', language: 'en', content: [
    { type: 'paragraph', text: '', lines: [line('Original reading', { isBold: true })] }
  ] });
  expect(output).not.toContain('Original reading');
});

it('emits the title once when an initial body H1 matches after a hero image', async () => {
  const content = [
    { type: 'image', src: 'https://example.com/figure.png', alt: 'Diagram' },
    { type: 'heading', level: 1, html: '<em>Measured&nbsp; RECORDS</em>' },
    { type: 'paragraph', text: 'The first complete paragraph.' },
    { type: 'heading', level: 1, text: 'Measured records' },
    { type: 'heading', level: 2, text: 'Measured records' }
  ];
  const before = structuredClone(content);
  const output = await generateMarkdown({ title: 'Measured records', content, language: 'en', generateToc: true });
  expect(output.match(/^# /gm)).toHaveLength(2);
  expect(output).toContain('## Measured records');
  expect(output).toContain('The first complete paragraph.');
  expect(output.match(/^\s*- Measured records$/gm)).toHaveLength(2);
  expect(content).toEqual(before);
});

it.each([
  [{ type: 'paragraph', text: 'Measured records' }, { type: 'heading', level: 1, text: 'Measured records' }],
  [{ type: 'heading', level: 2, text: 'Measured records' }],
  [{ type: 'heading', level: 1, text: 'Other records' }]
])('preserves body headings that are not an initial matching H1', async (...content) => {
  const output = await generateMarkdown({ title: 'Measured records', content, language: 'en' });
  const expectedLevel = content.at(-1).level;
  expect(output).toContain(`${'#'.repeat(expectedLevel)} ${content.at(-1).text}`);
  expect(output.match(/^# /gm)).toHaveLength(expectedLevel === 1 ? 2 : 1);
});

it('preserves rich inline spaces through paragraph, list, quote and table export', async () => {
  const content = [
    { type: 'paragraph', html: 'Before <em>highlight! </em>After <a href="https://example.org/reference">reference </a>tail.' },
    { type: 'list', ordered: false, items: [{ html: 'prefix<strong>unit. </strong>end' }] },
    { type: 'quote', html: 'Start<strong> punctuation.</strong>next' },
    { type: 'table', cellFormat: 'html', hasHeaders: false, rows: [['Cell <em>value </em>continues']] }
  ];
  const before = structuredClone(content);
  const output = await generateMarkdown({ title: 'Measurements', language: 'en', content });
  expect(output).toContain('Before *highlight!* After [reference ](https://example.org/reference)tail.');
  expect(output).toContain('- prefix**unit.** end');
  expect(output).toContain('> Start <strong>punctuation.</strong>next');
  expect(output).toContain('Cell *value* continues');
  expect(content).toEqual(before);
});

it('exports existing paragraph, inline-reference and list-note identities', async () => {
  const content = [
    { type: 'paragraph', id: 'memo-intro', html: 'Text<sup id="memo-ref"><a href="#memo-note">1</a></sup> after.' },
    { type: 'list', ordered: true, items: [{ id: 'memo-note', html: 'Note <a href="#memo-ref">Back</a>' }] },
    { type: 'paragraph', id: 'plain-target', format: 'text', text: 'A literal <tag>.' }
  ];
  const before = structuredClone(content);
  const output = await generateMarkdown({ title: 'References', language: 'en', content });
  for (const id of ['memo-intro', 'memo-ref', 'memo-note', 'plain-target']) {
    expect(output.split(`id="${id}"`)).toHaveLength(2);
  }
  expect(output).toContain('[1](#memo-note)');
  expect(output).toContain('[Back](#memo-ref)');
  expect(output).toContain('A literal \\<tag\\>.');
  expect(content).toEqual(before);
});

it('preserves rich script positions while keeping plain and code markup literal', async () => {
  const content = [
    { type: 'paragraph', html: '2<sup>N</sup> and H<sub>2</sub>O.' },
    { type: 'list', items: [{ html: 'x<sub>i</sub><sup>2</sup>' }] },
    { type: 'table', cellFormat: 'html', hasHeaders: false, rows: [['a<sup>b</sup>']] },
    { type: 'paragraph', format: 'text', text: 'Literal <sup>N</sup>.' },
    { type: 'code', text: '<sub>i</sub>', language: 'html' }
  ];
  const original = structuredClone(content);
  const output = await generateMarkdown({ title: 'Script positions', language: 'en', content });
  expect(output).toContain('2<sup>N</sup> and H<sub>2</sub>O.');
  expect(output).toContain('- x<sub>i</sub><sup>2</sup>');
  expect(output).toContain('a<sup>b</sup>');
  expect(output).toContain('Literal \\<sup\\>N\\</sup\\>.');
  expect(output).toContain('```html\n<sub>i</sub>\n```');
  expect(content).toEqual(original);
});

it.each([
  [false, [['A', 'B'], ['C', 'D']], '|  |  |\n|---|---|\n| A | B |\n| C | D |'],
  [false, [['A'], ['B', 'C', 'D'], []], '|  |  |  |\n|---|---|---|\n| A |  |  |\n| B | C | D |\n|  |  |  |'],
  [true, [['Header'], ['A', 'B']], '| Header |  |\n|------|---|\n| A | B |']
])('preserves all table cells with hasHeaders=%s', async (hasHeaders, rows, expected) => {
  const content = [{ type: 'table', cellFormat: 'text', hasHeaders, rows }];
  const original = structuredClone(content);
  const output = await generateMarkdown({ title: 'Table data', language: 'en', content });
  expect(output).toContain(expected);
  expect(content).toEqual(original);
});
