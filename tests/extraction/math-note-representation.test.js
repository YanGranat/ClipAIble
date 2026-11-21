import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { handleList } from '../../scripts/extraction/extractor/parse.js';
import { processMathElements, serializeReadingHtml } from '../../scripts/extraction/extractor/inline-content.js';
import { listHtml } from '../../scripts/generation/document-content.js';

const documents = [];
const namespace = 'http://www.w3.org/1998/Math/MathML';
let extractor;
beforeAll(() => {
  const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
  extractor = execFileSync(process.execPath, ['--input-type=module', '-e', `import {generateExtractAutomaticallyInlined} from ${JSON.stringify(builder)};process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
});
function page(body) {
  const dom = new JSDOM(`<!doctype html><article><h1>Field measurements</h1>${body}</article>`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('Node', dom.window.Node); return dom;
}
function formula(markup, tex = 'x^2') {
  return `<span class="MathJax" id="math-source-Frame"><span aria-hidden="true">duplicate visual glyphs</span><span class="MJX_Assistive_MathML"><math xmlns="${namespace}">${markup}</math></span></span><script id="math-source" type="math/tex">${tex}</script>`;
}
afterEach(() => { documents.splice(0).forEach(dom => dom.window.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Portable semantic math representation', () => {
  it('keeps powers, grouped bases, variables and indices with semantic inline markup', () => {
    const dom = page(`<p>${formula('<msup><mn>3</mn><mi>k</mi></msup><mo>+</mo><mo>(</mo><mn>1</mn><mo>/</mo><mn>3</mn><msup><mo>)</mo><mi>k</mi></msup><mo>+</mo><msub><mi>x</mi><mi>i</mi></msub>')}</p>`);
    const p = dom.window.document.querySelector('p');
    const before = p.outerHTML;
    const html = serializeReadingHtml(p);
    const output = dom.window.document.createElement('div'); output.innerHTML = html;
    expect(output.querySelector('span.math')).not.toBeNull();
    expect([...output.querySelectorAll('sup')].map(node => node.textContent)).toEqual(['k', 'k']);
    expect(output.querySelector('sub').textContent).toBe('i');
    expect(output.textContent).toBe('3k+(1/3)k+xi');
    expect(output.textContent).not.toContain('$');
    expect(output.textContent).not.toContain('duplicate');
    expect(p.outerHTML).toBe(before);
  });

  it('recovers authoritative data-mathml when the assistive subtree is absent', () => {
    const dom = page('<p><span class="MathJax" id="formula-Frame"></span><script id="formula" type="math/tex">q_2</script></p>');
    const p = dom.window.document.querySelector('p');
    p.querySelector('.MathJax').setAttribute('data-mathml', `<math xmlns="${namespace}"><msub><mi>q</mi><mn>2</mn></msub></math>`);
    processMathElements(p);
    expect(p.querySelector('sub')).not.toBeNull();
    expect(p.querySelector('sub').textContent).toBe('2');
    expect(p.textContent).not.toContain('$');
  });

  it.each([
    '<msqrt><mi>x</mi></msqrt>',
    '<msup><mi>x</mi></msup>',
    '<msup><mi>x</mi><mn>2</mn><mn>3</mn></msup>',
    '<mrow><msup><mi>x</mi><mn>2</mn></msup><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow>',
    '<mi mathvariant="double-struck">R</mi>',
    '<mi><mrow><mi>x</mi></mrow></mi>',
    '<mrow>unexpected text<mi>x</mi></mrow>'
  ])('falls back for the entire unsupported or malformed semantic tree: %s', markup => {
    const dom = page(`<p>${formula(markup, 'z^4')}</p>`);
    const p = dom.window.document.querySelector('p'); processMathElements(p);
    expect(p.textContent).toContain('$z^4$');
    expect(p.querySelector('sup,sub')).toBeNull();
    expect(p.querySelector('span.math')).toBeNull();
  });

  it('escapes token text and preserves the original TeX when semantic XML cannot be parsed', () => {
    const dom = page(`<p>${formula('<mi>a</mi><mo>&lt;</mo><mi>b</mi>', 'a&lt;b')}</p><p><span class="MathJax" id="broken-Frame" data-mathml="&lt;math&gt;"></span><script id="broken" type="math/tex">r^5</script></p>`);
    const [safe, broken] = dom.window.document.querySelectorAll('p');
    expect(serializeReadingHtml(safe)).toBe('<span class="math">a&lt;b</span>');
    expect(serializeReadingHtml(broken)).toContain('$r^5$');
  });

  it('keeps an operand containing angle brackets as text rather than interpreting HTML', () => {
    const dom = page(`<p>${formula('<mi>&lt;b&gt;value&lt;/b&gt;</mi>', 'value')}</p>`);
    expect(serializeReadingHtml(dom.window.document.querySelector('p'))).toBe('<span class="math">&lt;b&gt;value&lt;/b&gt;</span>');
  });

  it('executes the real serialized extractor without borrowing a module closure', async () => {
    const dom = page(`<p>The measurement grows as ${formula('<msup><mn>3</mn><mi>k</mi></msup>', '3^k')} over the sequence.</p>`);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    dom.window.eval(extractor.replace('export async function', 'async function') + '\nwindow.extract=extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article', title: 'h1' });
    const paragraph = result.content.find(item => item.type === 'paragraph');
    expect(paragraph.html).toContain('3<sup>k</sup>');
    expect(paragraph.html).not.toContain('$');
  });

  it('does not treat an unrelated XML vocabulary as semantic MathML', () => {
    const dom = page('<p><span class="MathJax" id="foreign-Frame"></span><script id="foreign" type="math/tex">u^2</script></p>');
    const p = dom.window.document.querySelector('p');
    p.querySelector('.MathJax').setAttribute('data-mathml', '<math xmlns="https://example.test/vocabulary"><msup><mi>u</mi><mn>2</mn></msup></math>');
    expect(serializeReadingHtml(p)).toContain('$u^2$');
  });
});

describe('Reciprocal source-note ordinal ownership', () => {
  const reference = '<p>Source observation<sup id="reference-a"><a role="doc-noteref" href="#note-a">1</a></sup>.</p>';
  const note = '<li id="note-a"><sup>1</sup>Calibration happened before the measurement.<a role="doc-backlink" href="#reference-a">Back</a></li>';
  it('emits one generated ordinal while preserving note identity, prose and reciprocal links', () => {
    const dom = page(reference + `<ol>${note}</ol>`), ol = dom.window.document.querySelector('ol');
    const before = dom.window.document.body.outerHTML;
    const item = handleList(ol), html = listHtml(item);
    expect(item.items[0].id).toBe('note-a');
    expect(item.items[0].html).not.toContain('<sup>1</sup>');
    expect(html).toContain('<ol><li id="note-a">');
    expect(html).toContain('Calibration happened before the measurement.');
    expect(html).toContain('href="#reference-a"');
    expect(dom.window.document.body.outerHTML).toBe(before);
  });

  it.each([
    ['ordinary list', '', note.replace(' role="doc-backlink"', '')],
    ['missing reference', '', note],
    ['foreign note target', reference.replace('href="#note-a"', 'href="#other-note"'), note],
    ['existing foreign note target', reference.replace('href="#note-a"', 'href="#other-note"'), note + '<li id="other-note">A separate source note.</li>'],
    ['nonmatching reference number', reference.replace('>1</a>', '>2</a>'), note],
    ['nonmatching leading number', reference, note.replace('<sup>1</sup>', '<sup>2</sup>')],
    ['reciprocal number differs from the counter', reference.replace('>1</a>', '>2</a>'), note.replace('<sup>1</sup>', '<sup>2</sup>')],
    ['nonleading exponent', reference, note.replace('<sup>1</sup>', 'Value x<sup>1</sup>')],
    ['self-contained backlink', '', note.replace('href="#reference-a"', 'href="#note-a"')],
    ['nested reciprocal link', '', '<li id="note-a"><sup>1</sup>Value<span id="inside"><a href="#note-a">1</a></span><a role="doc-backlink" href="#inside">Back</a></li>']
  ])('preserves authored numeric superscripts when source note evidence is absent: %s', (_name, forward, sourceNote) => {
    const dom = page(forward + `<ol>${sourceNote}</ol>`);
    expect(handleList(dom.window.document.querySelector('ol')).items[0].html).toMatch(/<sup>[12]<\/sup>/);
  });

  it.each(['start="3"', 'reversed', ''])('does not delete a source label for an unmodelled ordered-list counter: %s', attribute => {
    const sourceNote = attribute ? note.replace('<sup>1</sup>', '<sup>3</sup>') : note.replace('<li id=', '<li value="1" id=');
    const dom = page(reference + `<ol ${attribute}>${sourceNote}</ol>`);
    expect(handleList(dom.window.document.querySelector('ol')).items[0].html).toMatch(/<sup>[13]<\/sup>/);
  });
});
