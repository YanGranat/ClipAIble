import { describe, expect, it } from 'vitest';
import { recoverProseColumnRegions } from '../../scripts/offscreen/pdf/analyzers/column-detection-helpers.js';
import { findNumberedListRegions } from '../../scripts/offscreen/pdf/processors/numbered-list-regions.js';
import { processContent } from '../../scripts/offscreen/pdf/core/content-processor.js';
import { listHtml } from '../../scripts/generation/document-content.js';
import { fb2ListParagraphs } from '../../scripts/generation/fb2-list.js';
import { htmlToMarkdown } from '../../scripts/utils/html.js';

const em = 11;
const line = (text, x, y, width) => ({ text, x, y, pageNum: 1, items: [{ x, width }] });

function readingLanes(aligned = false) {
  const lane = (name, x, y, leading) => Array.from({ length: 12 }, (_, index) =>
    line(`${name} record ${index + 1} describes every measured sample today.`,
      x + (index % 2 ? 15 : 0), y + index * leading, 195));
  return [lane('Western', 52, 102, 11), lane('Eastern', 362, aligned ? 103 : 108, aligned ? 11 : 13)];
}

describe('PDF reading lanes with indents', () => {
  it('reads each complete indented lane before the next, between spanning text', () => {
    const [left, right] = readingLanes();
    const heading = line('Opening notes applying to both observation groups', 52, 64, 480);
    const after = line('Closing record applying to both observation groups', 52, 310, 490);
    const lines = [heading, ...right, ...left, after].sort((a, b) => a.y - b.y);
    const regions = recoverProseColumnRegions(lines, { width: 640 }, em);
    expect(regions.map(({ role, lines }) => [role, lines.map(row => row.text)])).toEqual([
      ['spanning', [heading.text]], ['lane', left.map(row => row.text)],
      ['lane', right.map(row => row.text)], ['spanning', [after.text]]
    ]);
    expect(new Set(regions.flatMap(region => region.lines))).toEqual(new Set(lines));
  });

  it('does not override the table path for paired cells on one repeating baseline grid', () => {
    const lines = readingLanes(true).flat().sort((a, b) => a.y - b.y);
    expect(recoverProseColumnRegions(lines, { width: 640 }, em)).toEqual([]);
  });
});

function detachedRows({ count = 15, wraps = true, markerGap = 5 } = {}) {
  const text = Array.from({ length: count }, (_, index) =>
    `Reference ${index + 23} records a measurement. The result stays <5 units.`);
  const rows = text.flatMap((value, index) => {
    const marker = line(`${index + 23}.`, 46, 80 + index * 21, 12);
    const [first, last] = value.split('. ');
    if (!wraps) return [marker, line(value, 58 + markerGap, marker.y + 0.5, 240)];
    return [
      marker, line(first + '.', 58 + markerGap, marker.y + 0.5, 188),
      line(last, 58 + markerGap, marker.y + 10, 129)
    ];
  });
  return { text, rows };
}

describe('PDF detached hanging numbers', () => {
  it('preserves a long sequence, wraps, literal text and its non-one start through export projection', () => {
    const { text, rows } = detachedRows();
    const following = line('A separate note remains outside the list.', 46, 420, 220);
    const regions = findNumberedListRegions([...rows, following], em);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ start: 0, end: rows.length });
    const list = regions[0].element;
    expect(list).toMatchObject({
      start: 23, ordered: true, items: text.map(value => ({ text: value, format: 'text' })), lines: rows
    });
    const separate = { type: 'paragraph', text: following.text, pageNum: 1, lines: [following] };
    const processed = processContent([list, separate], { baseFontSize: em }, { title: 'Survey archive' }, 'https://example.test/survey.pdf');
    expect(processed.elements).toEqual([list, separate]);
    const rendered = listHtml(processed.elements[0]);
    expect(rendered).toContain('<ol start="23">');
    expect(rendered).toContain('&lt;5 units.');
    expect(htmlToMarkdown(rendered).split('\n').map(item => Number(item.match(/^\d+/)?.[0]))).toEqual(
      Array.from({ length: text.length }, (_, index) => index + 23));
  });

  it('never turns a paired numeric column into a list merely because its values ascend', () => {
    expect(findNumberedListRegions(detachedRows({ wraps: false }).rows, em)).toEqual([]);
    expect(findNumberedListRegions(detachedRows({ markerGap: 47 }).rows, em)).toEqual([]);
  });
});

it.each([[undefined, 1], [0, 0], [-2, -2], [2.5, 1]])('projects ordered list start %s without changing its visible numbering', (start, expected) => {
  const attribute = start === undefined ? '' : ` start="${start}"`;
  const html = `<ol${attribute}><li>Observation</li><li>Conclusion</li></ol>`;
  expect(htmlToMarkdown(html)).toBe(`${expected}. Observation\n${expected + 1}. Conclusion`);
  expect(fb2ListParagraphs(html).map(item => item.prefix)).toEqual([`${expected}. `, `${expected + 1}. `]);
});
