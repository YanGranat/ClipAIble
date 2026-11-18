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
