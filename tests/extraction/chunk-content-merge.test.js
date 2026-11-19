import { describe, expect, it } from 'vitest';
import { mergeChunkContent } from '../../scripts/extraction/html-utils.js';

const p = text => ({ type: 'paragraph', text });
const h = text => ({ type: 'heading', level: 2, text });
function merge(before, after, shared, { prefix = '<p>Earlier.</p>', suffix = '<p>Later.</p>', sourceUrl = 'https://example.org/article' } = {}) {
  return mergeChunkContent([before, after], [prefix + shared, shared + suffix], { overlap: shared.length, sourceUrl });
}

describe('Source-witnessed chunk merge', () => {
  it('keeps the longest identical suffix/prefix once, including rich list values', () => {
    const block = [h('Measurements'), p('<strong>First</strong> observation.'), { type: 'list', ordered: true, start: 3, items: [{ html: '<em>One</em>', id: 'one' }, { html: 'Two' }] }];
    const source = '<h2>Measurements</h2><p><strong>First</strong> observation.</p><ol start="3"><li id="one"><em>One</em></li><li>Two</li></ol>';
    const before = [p('Earlier.'), ...block], after = [...structuredClone(block), p('Later.')];
    const untouched = structuredClone([before, after]);
    expect(merge(before, after, source)).toEqual([...before, p('Later.')]);
    expect([before, after]).toEqual(untouched);
  });

  it('uses the longest complete suffix instead of a shorter coincidental match', () => {
    const block = [p('Alpha.'), p('Beta.'), p('Alpha.')];
    expect(merge(block, [...block, p('Later.')], '<p>Alpha.</p><p>Beta.</p><p>Alpha.</p>')).toEqual([...block, p('Later.')]);
  });

  it('preserves all response occurrences when the previous source contains two real copies', () => {
    const block = [h('Repeated heading'), p('An independently repeated observation.')];
    const shared = '<h2>Repeated heading</h2><p>An independently repeated observation.</p>';
    const before = [...block, p('A different section.'), ...structuredClone(block)];
    expect(merge(before, [...block, p('Later.')], shared, { prefix: shared + '<p>A different section.</p>' })).toEqual([...before, ...block, p('Later.')]);
  });

  it('cannot erase a second source occurrence when the preceding response omitted it', () => {
    const block = [h('Results'), p('The same independently authored wording.')];
    const shared = '<h2>Results</h2><p>The same independently authored wording.</p>';
    expect(merge(block, block, shared, { prefix: shared + '<p>A different section.</p>' })).toEqual([...block, ...block]);
  });

  it('preserves an ambiguous equal source block repeated outside the shared input', () => {
    const block = [h('Results'), p('The same independently authored wording.')];
    const shared = '<h2>Results</h2><p>The same independently authored wording.</p>';
    expect(merge(block, block, shared, { suffix: shared })).toEqual([...block, ...block]);
  });

  it('preserves an ambiguous block occurring twice inside the shared input', () => {
    const block = [h('Results')];
    expect(merge(block, block, '<h2>Results</h2><h2>Results</h2>')).toEqual([...block, ...block]);
  });

  it('requires the actual shared HTML bytes, not matching response text alone', () => {
    const block = [h('Results')];
    const source = '<h2>Results</h2>';
    expect(mergeChunkContent([block, block], [source + '<p>Control.</p>', source + '<p>Different source.</p>'], { overlap: source.length })).toEqual([...block, ...block]);
  });

  it('requires the repeated response to occur in the shared source', () => {
    expect(merge([h('Results')], [h('Results')], '<p>Unrelated source.</p>', { prefix: '<h2>Results</h2>', suffix: '<h2>Results</h2>' })).toEqual([h('Results'), h('Results')]);
  });

  it('does not remove a repeated item from the middle of the incoming response', () => {
    expect(merge([h('Results')], [p('New content.'), h('Results')], '<h2>Results</h2>')).toEqual([h('Results'), p('New content.'), h('Results')]);
  });

  it.each([
    [h('Results'), { ...h('Results'), level: 3 }],
    [{ ...h('Results'), id: 'first' }, { ...h('Results'), id: 'second' }],
    [p('<a href="https://example.org/one">Reference</a>'), p('<a href="https://example.org/two">Reference</a>')],
    [{ type: 'list', ordered: true, start: 1, items: [{ html: 'Item' }] }, { type: 'list', ordered: true, start: 2, items: [{ html: 'Item' }] }],
    [{ type: 'list', items: [{ html: 'Item', id: 'first' }] }, { type: 'list', items: [{ html: 'Item', id: 'second' }] }],
    [{ type: 'code', format: 'text', text: 'a < b' }, { type: 'paragraph', format: 'text', text: 'a < b' }],
    [{ type: 'image', src: 'https://example.org/one.png' }, { type: 'image', src: 'https://example.org/two.png' }]
  ])('preserves differing type/level/ID/URL/list semantics: %#', (first, second) => {
    expect(merge([first], [second], '<p>Results Reference Item a &lt; b</p>')).toEqual([first, second]);
  });

  it('treats property ordering as immaterial without dropping nested attributes', () => {
    const first = { type: 'list', ordered: true, items: [{ html: 'Item', id: 'target' }] };
    const second = { items: [{ id: 'target', html: 'Item' }], ordered: true, type: 'list' };
    expect(merge([first], [second], '<ol><li id="target">Item</li></ol>')).toEqual([first]);
  });

  it('supports source-owned image URLs, including relative and deferred attributes', () => {
    const image = { type: 'image', src: 'https://example.org/figure.png?a=1&b=2', alt: 'Recorded diagram' };
    const source = '<img src="/placeholder.png" data-src="/figure.png?a=1&amp;b=2">';
    expect(merge([image], [{ ...image }], source)).toEqual([image]);
    expect(merge([image], [{ ...image }], '<p>https://example.org/figure.png?a=1&amp;b=2</p>')).toEqual([image, image]);
  });

  it('preserves two actual uses of an identical image in the incoming source', () => {
    const image = { type: 'image', src: 'https://example.org/figure.png' };
    expect(merge([image], [image], '<img src="/figure.png">', { suffix: '<img src="/figure.png">' })).toEqual([image, image]);
  });

  it('retains literal code and code whitespace while merging its exact source occurrence', () => {
    const code = { type: 'code', format: 'text', language: 'js', text: 'if (a < b) {\n  print("<tag>");\n}' };
    expect(merge([code], [structuredClone(code)], '<pre><code>if (a &lt; b) {\n  print("&lt;tag&gt;");\n}</code></pre>')).toEqual([code]);
    expect(merge([code], [{ ...code, text: 'if (a < b) { print("<tag>"); }' }], '<p>Other content.</p>')).toHaveLength(2);
  });

  it('preserves unsupported structural items rather than treating empty text as evidence', () => {
    const block = [{ type: 'separator' }, { type: 'table', headers: ['Value'], rows: [['1']] }];
    expect(merge(block, block, '<hr><table><tr><th>Value</th></tr><tr><td>1</td></tr></table>')).toEqual([...block, ...block]);
  });

  it('does not cross an intervening empty response or alter independently owned input chunks', () => {
    const block = [h('Results')];
    expect(mergeChunkContent([block, [], block], ['<h2>Results</h2>', '', '<h2>Results</h2>'])).toEqual([...block, ...block]);
    expect(mergeChunkContent([[...block, ...block]], ['<h2>Results</h2><h2>Results</h2>'])).toEqual([...block, ...block]);
  });
});
