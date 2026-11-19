import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { handleTable } from '../../scripts/extraction/extractor/parse.js';

const documents = [];
function page(body) {
  const dom = new JSDOM(`<!doctype html><title>Measurements</title>${body}`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  return dom;
}
function table(body) { return page(body).window.document.querySelector('table'); }
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Visible logical table grid', () => {
  it.each(['wide', 'compact'])('uses only computed-layout cells for the %s presentation', layout => {
    const node = table(`<style>.wide .compact,.compact .wide{display:none}</style><table class="${layout}"><tr><th class="wide" colspan="2">Reading</th><th class="compact">Reading</th><th>Unit</th></tr><tr><td>7</td><td class="wide">8</td><td>m</td></tr><tr style="display:none"><td>Hidden</td></tr></table>`);
    const result = handleTable(node);
    expect(result.headers).toEqual(layout === 'wide' ? ['Reading', 'Reading', 'Unit'] : ['Reading', 'Unit']);
    expect(result.rows).toEqual(layout === 'wide' ? [['7', '8', 'm']] : [['7', 'm']]);
  });

  it('preserves a hidden-content slot without moving the following visible value', () => {
    const result = handleTable(table('<table><tr><th>First</th><th>Second</th><th>Third</th></tr><tr><td>A</td><td style="visibility:hidden">Private draft</td><td>C</td></tr></table>'));
    expect(result.rows).toEqual([['A', '', 'C']]);
  });

  it('expands row spans over layout rows without counting display-none rows', () => {
    const result = handleTable(table('<table><tr><td rowspan="2">Group</td><td>A</td></tr><tr style="display:none"><td>Hidden</td></tr><tr><td>B</td><td>C</td></tr></table>'));
    expect(result.hasHeaders).toBe(false);
    expect(result.rows).toEqual([['Group', 'A', ''], ['Group', 'B', 'C']]);
  });

  it.each([
    ['collapse', [['Group', 'A'], ['B', 'C']]],
    ['hidden', [['Group', 'A'], ['Group', ''], ['B', 'C']]]
  ])('keeps visibility:%s rows in span arithmetic without exposing their content', (visibility, expected) => {
    const result = handleTable(table(`<table><tr><td rowspan="2">Group</td><td>A</td></tr><tr style="visibility:${visibility}"><td>Hidden</td></tr><tr><td>B</td><td>C</td></tr></table>`));
    expect(result.rows).toEqual(expected);
  });

  it('keeps rowSpan zero within its row group', () => {
    const result = handleTable(table('<table><thead><tr><th rowspan="0">Group</th><th>Value</th></tr></thead><tbody><tr><td rowspan="0">A</td><td>1</td></tr><tr><td>2</td></tr></tbody><tbody><tr><td>B</td><td>3</td></tr></tbody></table>'));
    expect(result.headers).toEqual(['Group', 'Value']);
    expect(result.rows).toEqual([['A', '1'], ['A', '2'], ['B', '3']]);
  });

  it('repeats spanning labels but preserves each source identity only once', () => {
    const node = table('<table><tr><td colspan="2" rowspan="2"><a id="group-key" name="legacy-key">Group</a></td><td>A</td></tr><tr><td><a href="#group-key">B</a></td></tr></table>');
    const before = node.outerHTML;
    const result = handleTable(node);
    expect(result.rows.map(row => row.map(cell => new JSDOM(cell).window.document.body.textContent))).toEqual([['Group', 'Group', 'A'], ['Group', 'Group', 'B']]);
    const output = new JSDOM(result.rows.flat().join(' ')).window.document;
    expect(output.querySelectorAll('#group-key')).toHaveLength(1);
    expect(output.querySelectorAll('[name="legacy-key"]')).toHaveLength(1);
    expect(output.querySelector('a[href]').getAttribute('href')).toBe('#group-key');
    expect(node.outerHTML).toBe(before);
  });

  it('uses validated DOM span values and clips vertical spans to real rows', () => {
    const node = table('<table><tr><td colspan="999999" rowspan="999999">A</td><td colspan="-2">B</td></tr><tr><td>C</td></tr></table>');
    const result = handleTable(node);
    const width = node.rows[0].cells[0].colSpan;
    expect(width).toBe(1000);
    expect(result.rows[0]).toHaveLength(width + 1);
    expect(result.rows[1]).toHaveLength(width + 1);
    expect(result.rows[0].slice(0, width).every(value => value === 'A')).toBe(true);
    expect(result.rows[1].slice(0, width).every(value => value === 'A')).toBe(true);
    expect(result.rows.map(row => row.at(-1))).toEqual(['B', 'C']);
  });

  it('preserves literal values, inline markup, row labels and empty cells', () => {
    const result = handleTable(table('<table><tr><th>Label</th><td>Array&lt;T&gt;</td><td><strong>x &amp; y</strong></td></tr><tr><th>Other</th><td></td></tr></table>'));
    expect(result.hasHeaders).toBe(false);
    expect(result.rows).toEqual([['Label', 'Array&lt;T&gt;', '<strong>x &amp; y</strong>'], ['Other', '', '']]);
  });

  it('excludes hidden table groups and keeps footer ordering from the DOM table model', () => {
    const result = handleTable(table('<table><tfoot><tr><td>Last</td></tr></tfoot><tbody style="display:none"><tr><td>Hidden</td></tr></tbody><tbody><tr><td>First</td></tr></tbody></table>'));
    expect(result.rows).toEqual([['First'], ['Last']]);
    expect(handleTable(table('<div style="display:none"><table><tr><td>Hidden</td></tr></table></div>'))).toBeNull();
  });

  it('does not count nested table rows as outer rows', () => {
    const result = handleTable(table('<table><tr><td>Outer<table><tr><td>Nested</td></tr></table></td><td>A</td></tr><tr><td>B</td><td>C</td></tr></table>'));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][0]).toContain('Nested');
  });

  it('runs the same grid behavior through the actual serialized extractor', async () => {
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const code = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    const dom = page('<article><h1>Measurements</h1><p>A complete measurement record follows.</p><table><tr><th colspan="2">Reading</th></tr><tr><td>7</td><td>8</td></tr></table></article>');
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    dom.window.eval(code.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article' });
    expect(result.content.find(item => item.type === 'table')).toMatchObject({ headers: ['Reading', 'Reading'], rows: [['7', '8']], hasHeaders: true, cellFormat: 'html' });
  });
});
