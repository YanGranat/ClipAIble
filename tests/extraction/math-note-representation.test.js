import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { handleList } from '../../scripts/extraction/extractor/parse.js';
import { processMathElements, serializeReadingHtml } from '../../scripts/extraction/extractor/inline-content.js';
import { documentMarkdown, documentText, listHtml } from '../../scripts/generation/document-content.js';

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
  const sourceMath = (markup, attributes = '') => `<span style="display:none" ${attributes}><math xmlns="${namespace}">${markup}</math></span>`;
  const lazy = '<mjx-container><mjx-lazy data-mjx-lazy="18"></mjx-lazy></mjx-container>';

  it('reads adjacent hidden MathML only through its empty deferred renderer in every document consumer', async () => {
    const dom = page('<p>Observed value ' + sourceMath('<msub><mi>v</mi><mn>8</mn></msub>') + lazy +
      ' is compared with ' + sourceMath('<msup><mi>w</mi><mn>5</mn></msup>') + lazy + ' in the next trial.</p>');
    const before = dom.window.document.body.innerHTML;
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: 'article', title: 'h1' });
    const item = result.content.find(item => item.type === 'paragraph');
    const html = 'Observed value <span class="math">v<sub>8</sub></span> is compared with <span class="math">w<sup>5</sup></span> in the next trial.';
    expect(item.html).toBe(html);
    expect(documentText(item)).toBe(html);
    expect(documentMarkdown(item)).toBe('Observed value v<sub>8</sub> is compared with w<sup>5</sup> in the next trial.');
    expect(dom.window.document.body.innerHTML).toBe(before);
  });

  it('keeps deferred math in a split reading range despite an accessibility display override', async () => {
    const source = sourceMath('<msub><mi>v</mi><mn>8</mn></msub>', 'class="assistive"');
    const clipped = sourceMath('<msup><mi>w</mi><mn>5</mn></msup>', 'class="assistive"').replace(' style="display:none"', '');
    const dom = page('<div id="notes">First observed value ' + source + lazy + ' is recorded.' +
      '<p>Partitioned observation.</p> The second value ' + clipped + lazy + ' is also recorded.</div>');
    const getStyle = dom.window.getComputedStyle.bind(dom.window);
    vi.spyOn(dom.window, 'getComputedStyle').mockImplementation(element => {
      const style = getStyle(element);
      if (element.matches('.assistive')) Object.assign(style, { display: 'block', position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' });
      return style;
    });
    const rect = dom.window.HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.matches('.assistive') ? { width: 1, height: 1 } : rect.call(this);
    });
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: '#notes', title: 'h1' });
    expect(result.content.filter(item => item.type === 'paragraph').map(item => documentMarkdown(item))).toEqual([
      'First observed value v<sub>8</sub> is recorded.',
      'Partitioned observation.',
      'The second value w<sup>5</sup> is also recorded.'
    ]);
  });

  it('does not import unrelated, explicitly excluded, or already rendered alternatives', () => {
    const invisible = sourceMath('<msub><mi>secret</mi><mn>6</mn></msub>');
    const rendered = '<mjx-container><mjx-math aria-hidden="true">rendered copy</mjx-math>' +
      '<mjx-assistive-mml><math><msub><mi>q</mi><mn>3</mn></msub></math></mjx-assistive-mml></mjx-container>';
    const dom = page(
      '<p>Before ' + invisible + ' intervening words ' + lazy + ' after.</p>' +
      '<p>Before ' + sourceMath('<mi>excluded value</mi>', 'class="exclude"') + lazy + ' after.</p>' +
      '<p>Before ' + invisible + rendered + ' after.</p>' +
      '<p>Before ' + invisible + lazy.replace('<mjx-container>', '<mjx-container hidden>') + ' after.</p>');
    const actual = Array.from(dom.window.document.querySelectorAll('p'), item => serializeReadingHtml(item, ['.exclude']));
    expect(actual[0]).toContain('intervening words');
    expect(actual[2]).toBe('Before <span class="math">q<sub>3</sub></span> after.');
    expect(actual.join(' ')).not.toMatch(/secret|excluded value|rendered copy/);
  });
  it('keeps MathJax SVG expressions from the same source nodes in ordinary and partitioned prose', async () => {
    const rendered = '<mjx-container class="MathJax" jax="SVG"><svg role="img"><g></g></svg></mjx-container>';
    const dom = page('<div id="notes">A complete first result is ' + rendered + '.<p>The second result is ' + rendered + '.</p>End of observations.</div>');
    const { document } = dom.window;
    const [first, second] = document.querySelectorAll('mjx-container');
    const receipts = [
      { math: 'x + 42', inputJax: { name: 'TeX' }, typesetRoot: first },
      { math: 'y = 12', inputJax: { name: 'TeX' }, typesetRoot: second }
    ];
    dom.window.MathJax = { startup: { document: {
      getMathItemsWithin: ([root]) => receipts.filter(item => root.contains(item.typesetRoot))
    } } };
    const before = document.body.innerHTML;
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: '#notes', title: 'h1' });
    const output = result.content.map(item => item.html).join(' ');
    expect(output).toContain('$x + 42$');
    expect(output).toContain('$y = 12$');
    expect(document.body.innerHTML).toBe(before);
  });
  it('keeps server-rendered CommonHTML notation in its paragraph and preserves a fraction', async () => {
    const token = (kind, text) => `<span class="mjx-${kind}" style="display:block"><span class="mjx-char" style="display:block">${text}</span></span>`;
    const fraction = '<span class="mjx-mfrac"><span class="mjx-box"><span class="mjx-numerator">' +
      token('mn', '5') + '</span><span class="mjx-denominator">' + token('mn', '7') +
      '</span><span class="mjx-line"></span></span></span>';
    const renderer = '<span class="mjx-chtml"><span class="mjx-math"><span class="mjx-mrow" aria-hidden="true">' +
      token('mi', 'rate') + token('mo', '=') + fraction +
      '</span></span><style>.mjx-mn { color: red; }</style></span>';
    const dom = page('<p>The measured value is ' + renderer + ' in the second series.</p>');
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: 'article', title: 'h1' });
    const item = result.content.find(item => item.type === 'paragraph');
    expect(item.html).toBe('The measured value is <span class="math">rate=(5)/(7)</span> in the second series.');
    expect(documentMarkdown(item)).toBe('The measured value is rate=(5)/(7) in the second series.');
  });

  it('retains the CommonHTML accessibility source as one expression when layout cannot be represented', () => {
    const dom = page('<p>Measured ' +
      '<span class="mjx-chtml"><span class="mjx-math" aria-label="v_3"><span class="mjx-msub" style="display:block">v3</span></span></span>' +
      ' and <span aria-label="ordinary annotation">recorded</span>.</p>');
    const actual = serializeReadingHtml(dom.window.document.querySelector('p'));
    expect(actual).toContain('Measured  $v_3$  and');
    expect(actual).not.toMatch(/v3|<br/);
    expect(actual).toContain('>recorded</span>.');
  });

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

  it('projects one presentation expression from an enriched MathML renderer without TeX', async () => {
    const formula = '<mjx-container class="MathJax"><mjx-math aria-hidden="true">visual copy</mjx-math>' +
      '<mjx-assistive-mml><math display="inline"><semantics><mrow data-semantic-type="infixop">' +
      '<msubsup><mi>q</mi><mi>i</mi><mn>2</mn></msubsup><mo>=</mo><mfrac><mi>a</mi><msqrt><mi>b</mi></msqrt></mfrac>' +
      '</mrow><annotation-xml encoding="MathML-Content"><mtext>alternate copy</mtext></annotation-xml>' +
      '</semantics></math></mjx-assistive-mml></mjx-container>';
    const dom = page(`<p>First reading: ${formula}.</p><p>Repeated observation: ${formula}.</p>`);
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: 'article', title: 'h1' });
    const output = result.content.filter(item => item.type === 'paragraph').map(item => item.html);
    expect(output).toEqual([
      'First reading: <span class="math">q<sub>i</sub><sup>2</sup>=(a)/(√(b))</span>.',
      'Repeated observation: <span class="math">q<sub>i</sub><sup>2</sup>=(a)/(√(b))</span>.'
    ]);
  });

  it('keeps runtime notation when the canonical parser clones a list, quotation, or table', async () => {
    const rendered = '<mjx-container class="MathJax" jax="SVG"><svg role="img"><g></g></svg></mjx-container>';
    const dom = page('<ul><li>List ' + rendered + '</li></ul><blockquote>Quote ' + rendered +
      '</blockquote><table><tr><th>Value</th></tr><tr><td>Table ' + rendered + '</td></tr></table>');
    const { document } = dom.window;
    const inputs = Array.from(document.querySelectorAll('mjx-container'), (typesetRoot, index) => ({
      math: 't_' + (index + 1), inputJax: { name: 'TeX' }, typesetRoot
    }));
    dom.window.MathJax = { startup: { document: { getMathItemsWithin: ([root]) => inputs.filter(item => root.contains(item.typesetRoot)) } } };
    const run = dom.window.eval(extractor.replace('export async function', 'async function') + '\nextractAutomaticallyInlined;');
    const result = await run(dom.window.location.href, false, { content: 'article', title: 'h1' });
    expect(result.content.find(item => item.type === 'list').items[0].html).toContain('$t_1$');
    expect(result.content.find(item => item.type === 'quote').text).toContain('$t_2$');
    expect(result.content.find(item => item.type === 'table').rows[0][0]).toContain('$t_3$');
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
