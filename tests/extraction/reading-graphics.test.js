import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { toSvg } from 'html-to-image';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { captureReadingGraphics, getGraphicReadingOwner } from '../../scripts/extraction/extractor/graphics.js';
import { parseElements } from '../../scripts/extraction/extractor/parse.js';
import { buildHtmlForPdf } from '../../scripts/generation/html-builder.js';

vi.mock('html-to-image', { spy: true });

const windows = [];
function page(markup) {
  const win = new JSDOM(`<!doctype html><article>${markup}</article>`, { url: 'https://example.test/report' }).window;
  windows.push(win);
  const doc = win.document, root = doc.querySelector('article');
  return { win, doc, root, owner: selector => getGraphicReadingOwner(doc.querySelector(selector), [root]) };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

function fakeRasterWindow(win) {
  const computedStyle = win.getComputedStyle.bind(win);
  win.getComputedStyle = element => computedStyle(element);
  win.DOMMatrix = class { a = 1; b = 0; c = 0; d = 1; is2D = true; };
  win.Image = class {
    naturalWidth = 100;
    naturalHeight = 80;
    set src(_) { queueMicrotask(() => this.onload()); }
  };
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
}

function position(node, left, top, right, bottom) {
  node.getBoundingClientRect = () => ({ left, top, right, bottom, width: right-left, height: bottom-top });
}

function layeredFigure(extra = '') {
  const { win, doc, root } = page(`<p>Read the observations below for an independent comparison.</p>
    <figure id="layers"><img src="https://assets.example.test/base.jpg"><img src="https://assets.example.test/overlay.png">${extra}
    <figcaption>Credit and <a href="/method">diagram method</a>.</figcaption></figure>
    <table><tr><th>Trial</th><th>Result</th></tr><tr><td>First</td><td>17</td></tr></table>
    <p>The measurements were repeated carefully in a second trial.</p>`);
  const figure = doc.querySelector('figure');
  for (const image of doc.querySelectorAll('img')) {
    Object.defineProperties(image, { complete: { value: true, configurable: true }, naturalWidth: { value: 100 }, naturalHeight: { value: 80 } });
    image.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80 });
  }
  win.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {} });
  const computedStyle = win.getComputedStyle.bind(win);
  win.getComputedStyle = element => computedStyle(element);
  const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(), content: [], debugInfo: null };
  const elements = [...root.querySelectorAll('p,figure,img,svg,figcaption,table,td,th')];
  return { win, doc, root, figure, state, elements };
}

describe('Reading graphic ownership', () => {
  it('preserves the source spelling and authored emphasis of a captured figure caption in PDF', () => {
    const { win, doc, root } = page('<figure><svg><path/></svg><figcaption>' +
      'The *marker* is &lt;name&gt; &amp; <em>case sensitive</em>.</figcaption></figure>');
    const figure = doc.querySelector('figure');
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(),
      readingGraphics: new Map([[figure, {
        type: 'image', isGraphic: true, src: 'data:image/png;base64,AA==', alt: '', captionFormat: 'text',
        caption: 'The *marker* is <name> & case sensitive.'
      }]]) };
    const items = parseElements(win, [figure, ...figure.children], state, CONSTANTS, doc.URL);
    expect(items[0]).toMatchObject({ type: 'image', captionFormat: 'html' });
    const caption = JSDOM.fragment(buildHtmlForPdf(items, 'Report', '', {}, doc.URL)).querySelector('figcaption');
    expect(caption.textContent).toBe('The *marker* is <name> & case sensitive.');
    expect([...caption.querySelectorAll('em')].map(element => element.textContent)).toEqual(['case sensitive']);
  });
  it('keeps a decorative arrow with its labelled link, including inside a prose figure', () => {
    const { doc, root, owner } = page('<figure><p>Review <a href="/entry">this entry<svg aria-hidden="true"><path d="M0 0L3 2"/></svg></a>.</p></figure>');
    expect(owner('svg')).toBeNull();
    expect(getGraphicReadingOwner(doc.querySelector('svg'), [root, doc.querySelector('svg')])).toBeNull();
  });
  it('retains an authored diagram when the link wraps the whole figure', () => {
    const { doc, owner } = page('<a href="/diagram">Open larger version<figure aria-label="Field observations"><svg aria-hidden="true"><path d="M0 0L50 70"/></svg><figcaption>Relation diagram.</figcaption></figure></a>');
    expect(owner('svg')).toBe(doc.querySelector('figure'));
  });
  it('leaves semantic math and literal code with their existing readers', () => {
    const { owner } = page('<span class="MathJax"><svg role="img"><title>x squared</title></svg></span><code><svg role="img"><title>Literal example</title></svg></code>');
    expect(owner('.MathJax svg')).toBeNull();
    expect(owner('code svg')).toBeNull();
  });
  it('renders an illustrated code block as a graphic and retains literal markup in nearby examples', () => {
    const { win, doc, root, owner } = page('<pre> <svg viewBox="0 0 100 40"><style>.path{fill:black}</style>' +
      '<text x="12" y="28">Observation</text></svg> </pre>' +
      '<pre><code>&lt;svg&gt;<br>&lt;style&gt;literal declaration&lt;/style&gt;</code></pre>');
    const graphic = doc.querySelector('svg');
    expect(owner('svg')).toBe(graphic);
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(),
      readingGraphics: new Map([[graphic, { type: 'image', src: 'data:image/png;base64,AA==', alt: 'Observation' }]]) };
    const elements = [...root.querySelectorAll('pre,svg,code')];
    const items = parseElements(win, elements, state, CONSTANTS, doc.URL);
    expect(items.map(item => item.type)).toEqual(['image', 'code']);
    expect(items[1].text).toBe('<svg>\n<style>literal declaration</style>');
  });
  it('owns the complete compound figure including visible aria-hidden edges', () => {
    const { doc, owner } = page('<figure aria-label="Observation flow"><svg aria-hidden="true"><path/></svg><div>Stage one</div><figcaption>Observed sequence.</figcaption></figure>');
    expect(owner('path')).toBe(doc.querySelector('figure'));
    expect(owner('div')).toBe(doc.querySelector('figure'));
  });

  it('leaves mixed prose, tables, and existing images with their own readers', () => {
    for (const content of ['<p>Independent prose.</p>', '<table><tr><td>Value</td></tr></table>', '<img src="data:image/png;base64,AA==" alt="Photograph">']) {
      const { doc, owner } = page(`<figure><svg role="img"><path/></svg>${content}</figure>`);
      expect(owner('path')).toBe(doc.querySelector('svg'));
      expect(owner('figure')).toBeNull();
    }
  });

  it('rasterizes nested SVG viewports as part of their chart within a mixed figure', async () => {
    const { win, doc, root, owner } = page('<figure><p>Independent reading note.</p>' +
      '<svg role="img" aria-label="Station readings" style="width:100px;height:80px"><g>' +
      '<svg id="axis-label" x="5" y="8"><text>Station A</text></svg>' +
      '</g></svg><figcaption>Chart for the surrounding observations.</figcaption></figure>');
    const chart = doc.querySelector('svg');
    const label = doc.querySelector('#axis-label');
    expect(owner('figure')).toBeNull();
    expect(owner('#axis-label')).toBe(chart);
    expect(owner('#axis-label text')).toBe(chart);
    expect(getGraphicReadingOwner(label, [label])).toBeNull();
    position(chart, 0, 0, 100, 80);
    position(label, 5, 8, 25, 20);
    fakeRasterWindow(win);
    vi.mocked(toSvg).mockResolvedValueOnce('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Station A</text></svg>'));
    const elements = Array.from(root.querySelectorAll('p,figure,svg,figcaption'));
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(), content: [], debugInfo: null };
    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    expect(Array.from(state.readingGraphics.keys())).toEqual([chart]);
    const items = parseElements(win, elements, state, CONSTANTS, doc.URL);
    expect(items.filter(item => item.type === 'image')).toEqual([
      expect.objectContaining({ alt: expect.stringContaining('Station A') })
    ]);
    expect(items.find(item => item.type === 'paragraph')?.text).toContain('Independent reading note');
  });

  it('keeps the video and caption when a caption glyph is the only vector', async () => {
    const { win, doc, root, owner } = page('<p>The observers measured the channel before publishing their findings.</p>' +
      '<figure><video poster="/preview.jpg"><source src="/recording.mp4"></video>' +
      '<figcaption><svg><path d="M1 1h14v12H1z"/></svg>Recording of the observed current.</figcaption></figure>' +
      '<p>The last observation was recorded after sunset.</p>');
    const glyph = doc.querySelector('svg');
    glyph.getBoundingClientRect = () => ({ width: 31, height: 21 });
    const before = root.outerHTML;
    expect(owner('figure')).toBeNull();
    expect(owner('svg')).toBeNull();
    expect(getGraphicReadingOwner(glyph, [root, glyph])).toBe(glyph);

    const elements = [...root.querySelectorAll('p,figure,video,figcaption,svg')];
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(), content: [], debugInfo: null };
    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    expect(state.readingGraphics.size).toBe(0);
    const items = parseElements(win, elements, state, CONSTANTS, doc.URL);
    expect(items.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph', 'paragraph', 'paragraph']);
    expect(items[1].src).toBe('https://example.test/preview.jpg');
    expect(items[2].html).toContain('href="https://example.test/recording.mp4"');
    expect(items[3].html).toContain('Recording of the observed current.');
    expect(items[4].html).toContain('last observation');
    expect(root.outerHTML).toBe(before);
  });

  it.each([
    ['small figure graphic', '<svg><path/></svg><figcaption>Diagram.</figcaption>', 30, 20],
    ['named caption graphic', '<figcaption><svg role="img" aria-label="Water profile"><path/></svg>Measured section.</figcaption>', 30, 20],
    ['caption graphic containing text', '<figcaption><svg><text>Observations</text></svg>Measured section.</figcaption>', 30, 20],
    ['larger caption graphic', '<figcaption><svg><path/></svg>Measured section.</figcaption>', 156, 92],
  ])('retains ownership for a %s', (_name, markup, width, height) => {
    const { doc, owner } = page('<figure>' + markup + '</figure>');
    doc.querySelector('svg').getBoundingClientRect = () => ({ width, height });
    expect(owner('svg')).toBe(doc.querySelector('figure'));
  });

  it('admits a reading canvas and requires standalone SVG to be labelled or explicitly selected', () => {
    const { doc, root, owner } = page('<svg><path/></svg><canvas></canvas><svg class="toolbar-icon" role="img" aria-label="Open"><path/></svg>');
    expect(owner('svg')).toBeNull();
    expect(owner('canvas')).toBe(doc.querySelector('canvas'));
    expect(owner('.toolbar-icon')).toBeNull();
    const svg = doc.querySelector('svg');
    expect(getGraphicReadingOwner(svg, [svg])).toBe(svg);
    expect(getGraphicReadingOwner(svg, [doc.createElement('div')])).toBeNull();
    expect(root.contains(svg)).toBe(true);
  });

  it('rejects controls and actual hidden ancestors without dropping visible aria-hidden content', () => {
    const { doc, owner } = page('<button><svg role="img" aria-label="Open"/></button><div style="display:none"><svg role="img" aria-label="Draft"/></div><svg role="img" aria-hidden="true" aria-label="Visible series"/>');
    expect(owner('button svg')).toBeNull();
    expect(owner('div svg')).toBeNull();
    expect(owner('article > svg')).toBe(doc.querySelector('article > svg'));
  });

  it('uses the shared absolute extraction deadline even for a canvas', async () => {
    const { win, doc, root } = page('<canvas role="img"></canvas>');
    await expect(captureReadingGraphics(win, [doc.querySelector('canvas')], { referenceRoots: [root], extractionDeadline: Date.now() - 1 }, {})).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' });
  });

  it.each([0, 255])('uses the source link only for an empty canvas (alpha %d)', async alpha => {
    const { win, doc, root } = page(`<div id="measurements"><canvas aria-label="Interactive chart"></canvas>
      <p>The observed measurements are described in this caption from the original article.</p></div>`);
    const canvas = doc.querySelector('canvas');
    canvas.getBoundingClientRect = () => ({ top: 0, left: 0, right: 8, bottom: 8, width: 8, height: 8 });
    const context = { drawImage: vi.fn(), fillRect: vi.fn(), getImageData: () => ({ data: new Uint8Array([255, 255, 255, alpha]) }) };
    win.HTMLCanvasElement.prototype.getContext = () => context;
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(), content: [], debugInfo: null };
    const elements = [canvas, doc.querySelector('p')];
    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    const items = parseElements(win, elements, state, CONSTANTS, doc.URL);
    expect(items.some(item => item.text?.includes('The observed measurements'))).toBe(true);
    if (alpha > 0) {
      expect(items[0]).toMatchObject({ type: 'image', isGraphic: true, alt: 'Interactive chart' });
      expect(context.globalCompositeOperation).toBe('destination-over');
    } else {
      expect(context.fillRect).not.toHaveBeenCalled();
      expect(items[0]).toEqual({ type: 'paragraph', html: '<a href="https://example.test/report#measurements">Interactive chart</a>',
        text: '<a href="https://example.test/report#measurements">Interactive chart</a>' });
    }
  });

  it.each([
    ['automatic containment on an ancestor', '<div style="content-visibility:auto"><svg><path/></svg></div>', 'svg', 'figure id="measurements"', '#measurements'],
    ['automatic containment on the graphic itself', '<svg style="content-visibility:auto"><path/></svg>', 'path', 'figure', ''],
  ])('preserves the caption and complete reading flow for %s', async (_name, markup, skipped, figureMarkup, fragment) => {
    const { win, doc, root } = page(`<p>The first observation describes the independent measurement conditions.</p>
      <${figureMarkup}>${markup}<figcaption>Observed sample distribution.</figcaption></figure>
      <p>The final observation describes the conclusions supported by that measurement.</p>`);
    const figure = doc.querySelector('figure');
    const svg = doc.querySelector('svg');
    doc.querySelector(skipped).checkVisibility = options => !options?.contentVisibilityAuto;
    if (skipped === 'path') position(svg, 10, 30, 140, 90);
    const before = root.outerHTML;
    const elements = [...root.querySelectorAll('p,figure,svg,figcaption')];
    const state = { referenceRoots: [root], processedImages: new Set(), addedHeadings: new Set(), content: [], debugInfo: null };
    const callsBefore = vi.mocked(toSvg).mock.calls.length;

    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    const items = parseElements(win, elements, state, CONSTANTS, doc.URL);

    expect(vi.mocked(toSvg).mock.calls).toHaveLength(callsBefore);
    expect(state.readingGraphics.get(figure)).toMatchObject({ type: 'paragraph' });
    expect(items).toEqual([
      expect.objectContaining({ type: 'paragraph', text: expect.stringContaining('The first observation') }),
      expect.objectContaining({ type: 'paragraph', html: `<a href="https://example.test/report${fragment}">Observed sample distribution.</a>` }),
      expect.objectContaining({ type: 'paragraph', text: expect.stringContaining('The final observation') }),
    ]);
    expect(root.outerHTML).toBe(before);
  });

  it('retains a capture failure for a visible zero-size graphic', async () => {
    const { win, doc, root } = page('<figure><svg style="content-visibility:auto"><path/></svg><figcaption>Observed data.</figcaption></figure>');
    const svg = doc.querySelector('svg');
    svg.checkVisibility = () => true;
    doc.querySelector('path').checkVisibility = () => true;
    await expect(captureReadingGraphics(win, [svg], { referenceRoots: [root] }, CONSTANTS)).rejects.toMatchObject({ code: 'GRAPHIC_CAPTURE_FAILED' });
  });

  it.each(['auto', '0px'])('distinguishes deferred and explicitly zero-sized offscreen SVGs on older browsers (width %s)', async width => {
    const { win, doc, root } = page(`<div style="content-visibility:auto">
      <figure id="profile"><svg viewBox="0 0 160 90"><path/></svg><figcaption>Profile of the field.</figcaption></figure></div>`);
    const svg = doc.querySelector('svg');
    svg.checkVisibility = () => true;
    Object.defineProperty(svg, 'viewBox', { value: { baseVal: { width: 160, height: 90 } } });
    svg.computedStyleMap = () => new Map([['width', width]]);
    position(svg, 0, 2500, 0, 2500);
    const capture = captureReadingGraphics(win, [svg], { referenceRoots: [root] }, CONSTANTS);

    if (width === 'auto') {
      expect((await capture).get(doc.querySelector('figure'))).toMatchObject({
        type: 'paragraph', html: '<a href="https://example.test/report#profile">Profile of the field.</a>',
      });
    } else {
      await expect(capture).rejects.toMatchObject({ code: 'GRAPHIC_CAPTURE_FAILED' });
    }
  });

  it('retains a visibility override while rejecting a display-none ancestor', () => {
    const { doc, owner } = page('<figure style="visibility:hidden"><svg role="img"><path style="visibility:visible"/></svg></figure><div style="display:none"><svg role="img" style="visibility:visible"/></div><aside style="visibility:hidden"><svg role="img"/></aside>');
    expect(owner('figure svg')).toBe(doc.querySelector('figure'));
    expect(owner('figure path')).toBe(doc.querySelector('figure'));
    expect(owner('div svg')).toBeNull();
    expect(owner('aside svg')).toBeNull();
  });

  it('skips an explicitly excluded graphic without reading or modifying its pixels', async () => {
    const { win, doc, root } = page('<figure class="excluded"><canvas role="img"></canvas><figcaption>Draft.</figcaption></figure>');
    const before = root.outerHTML;
    const result = await captureReadingGraphics(win, [doc.querySelector('canvas')], { referenceRoots: [root], selectionExclusions: ['.excluded'] }, {});
    expect(result.size).toBe(0);
    expect(root.outerHTML).toBe(before);
  });

  it('captures overlapping image layers while leaving independent gallery images separate', () => {
    const { doc, owner } = page('<figure><img alt="First layer"><img alt="Second layer"><figcaption>Observed field.</figcaption></figure>');
    const images = [...doc.querySelectorAll('img')];
    for (const image of images) {
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 200 }, naturalHeight: { value: 100 } });
    }
    images[0].getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 });
    images[1].getBoundingClientRect = () => ({ left: 100, top: 0, right: 300, bottom: 100, width: 200, height: 100 });
    expect(owner('figure')).toBe(doc.querySelector('figure'));
    expect(owner('img')).toBe(doc.querySelector('figure'));
    images[1].getBoundingClientRect = () => ({ left: 220, top: 0, right: 420, bottom: 100, width: 200, height: 100 });
    expect(owner('figure')).toBeNull();
    expect(owner('img')).toBeNull();
  });

  it('leaves a photograph in normal reading flow when an unavailable-image fallback overlaps it', () => {
    const { doc, owner } = page(`<figure>
      <img src="/media/neutral-placeholder.png" aria-label="Image unavailable" style="position:absolute">
      <img src="/media/observation.jpg" alt="Observation site">
      <figcaption>Field photograph.</figcaption>
    </figure>`);
    const [overlay, photograph] = doc.querySelectorAll('img');
    for (const image of [overlay, photograph]) {
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 200 }, naturalHeight: { value: 100 } });
      image.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 });
    }
    expect(owner('figure')).toBeNull();
    expect(owner('img:last-of-type')).toBeNull();
    overlay.setAttribute('aria-label', 'Neutral reference pattern');
    expect(owner('figure')).toBe(doc.querySelector('figure'));
  });

  it('does not infer a composite from overlapping empty object-fit letterboxes', () => {
    const { doc, owner } = page('<figure><img style="object-fit:contain;object-position:50% 0%"><img style="object-fit:contain;object-position:50% 100%"></figure>');
    for (const image of doc.querySelectorAll('img')) {
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 600 }, naturalHeight: { value: 40 } });
      image.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 180, width: 600, height: 180 });
    }
    expect(owner('figure')).toBeNull();
  });

  it('preserves original layer links, figure credit, and surrounding content when page-context fetch cannot read rendered pixels', async () => {
    const { win, doc, root, state, elements } = layeredFigure();
    const before = root.outerHTML;
    win.fetch = vi.fn().mockRejectedValue(new win.TypeError('Failed to fetch'));
    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    const content = parseElements(win, elements, state, CONSTANTS, doc.URL);
    const block = content.find(item => item.id === 'layers');
    const links = JSDOM.fragment(block.html).querySelectorAll('a');
    expect([...links].map(link => link.getAttribute('href'))).toEqual([
      'https://example.test/report#layers', 'https://assets.example.test/base.jpg', 'https://assets.example.test/overlay.png', 'https://example.test/method'
    ]);
    expect(block.html).toMatch(/could not be reproduced.*Credit and/s);
    expect(content.map(item => item.type)).toEqual(['paragraph', 'paragraph', 'table', 'paragraph']);
    expect(content[2].rows).toEqual([['First', '17']]);
    expect(content.at(-1).html).toContain('second trial');
    expect(root.outerHTML).toBe(before);
  });

  it('omits only the initial title after a leading figure fallback', async () => {
    const { win, doc, root, figure, state, elements } = layeredFigure();
    root.prepend(figure);
    const title = doc.createElement('h1');
    title.textContent = 'Field report';
    figure.after(title);
    root.append(title.cloneNode(true));
    const source = [...root.querySelectorAll('h1,p,figure,img,figcaption,table,td,th')];
    state.mainTitleText = 'field report';
    win.fetch = vi.fn().mockRejectedValue(new win.TypeError('Failed to fetch'));
    state.readingGraphics = await captureReadingGraphics(win, elements, state, CONSTANTS);
    const content = parseElements(win, source, state, CONSTANTS, doc.URL);
    expect(content[0]).toMatchObject({ id: 'layers', isFeatured: true });
    expect(content.filter(item => item.type === 'heading')).toEqual([content.at(-1)]);
    expect(content.at(-1)).toMatchObject({ type: 'heading', text: 'Field report' });
  });

  it.each(['HTTP error', 'unrendered layer', 'vector composition'])('requires a rendered raster-only composition and a fetch rejection (%s)', async scenario => {
    const { win, figure, state, elements } = layeredFigure(scenario === 'vector composition' ? '<svg role="img" aria-label="Shape"/>' : '');
    win.fetch = scenario === 'HTTP error'
      ? vi.fn().mockResolvedValue({ ok: false })
      : vi.fn(async () => {
        if (scenario === 'unrendered layer') Object.defineProperty(figure.querySelector('img:last-of-type'), 'complete', { value: false });
        throw new win.TypeError('Failed to fetch');
      });
    await expect(captureReadingGraphics(win, elements, state, CONSTANTS)).rejects.toMatchObject({ code: 'GRAPHIC_CAPTURE_FAILED' });
    expect(state.originalImageLayers).toBeUndefined();
  });

  it.each([
    ['data-chart-src', true], ['src', false], ['href', false], ['xlink:href', false],
  ])('distinguishes resource references from inert %s metadata in serialized graphics', async (attribute, allowed) => {
    const { win, doc, root } = page('<svg role="img" aria-label="Sample chart" style="display:block;width:100px;height:80px"><path d="M0 0L50 70"/></svg>');
    const svg = doc.querySelector('svg');
    position(svg,0,0,100,80);
    fakeRasterWindow(win);
    const serialized = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attribute}="https://assets.example.test/reference"><path d="M0 0L50 70"/></svg>`;
    vi.mocked(toSvg).mockResolvedValueOnce('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized));
    const capture = captureReadingGraphics(win, [svg], { referenceRoots: [root] }, CONSTANTS);
    if (allowed) expect((await capture).get(svg)).toMatchObject({ type: 'image', alt: 'Sample chart' });
    else await expect(capture).rejects.toMatchObject({ code: 'GRAPHIC_CAPTURE_FAILED' });
  });

  it('copies computed paint while omitting CSS custom properties from the static graphic', async () => {
    const { win, doc, root } = page('<svg role="img" aria-label="Sample chart" style="width:100px;height:80px;fill:rgb(35, 95, 120);--shared-art:url(/brand.svg)"><path d="M0 0L50 70"/></svg>');
    const graphic = doc.querySelector('svg');
    position(graphic, 0, 0, 100, 80);
    fakeRasterWindow(win);
    const serialized = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L50 70"/></svg>';
    let frozenGraphic;
    vi.mocked(toSvg).mockImplementationOnce(wrapper => {
      frozenGraphic = wrapper.querySelector('svg[role="img"]');
      return Promise.resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized));
    });
    const captured = await captureReadingGraphics(win, [graphic], { referenceRoots: [root] }, CONSTANTS);
    expect(captured.get(graphic)).toMatchObject({ type: 'image', alt: 'Sample chart' });
    expect(frozenGraphic.style.getPropertyValue('fill')).toBe('rgb(35, 95, 120)');
    expect(frozenGraphic.style.getPropertyValue('--shared-art')).toBe('');
    expect(graphic.style.getPropertyValue('--shared-art')).toContain('brand.svg');
  });

  it('uses painted bounds through nested clip axes and still includes visible overflow', async () => {
    const { win, doc, root } = page('<figure style="width:200px;height:100px">' +
      '<svg><path d="M0 0L50 70"/></svg>' +
      '<div id="viewport" style="overflow-y:auto"><div id="column" style="overflow-x:hidden"><span id="tall">Scrollable labels</span></div></div>' +
      '<div id="proxy" style="position:fixed;clip:rect(0px, 0px, 0px, 0px);clip-path:inset(50%)">Invisible selector proxy</div>' +
      '<div id="annotation" style="overflow:visible">Measure</div></figure>');
    const figure = doc.querySelector('figure');
    position(figure,0,0,200,100);
    position(doc.querySelector('svg'),0,0,200,100);
    position(doc.querySelector('#viewport'),0,0,72,100);
    position(doc.querySelector('#column'),0,0,70,9700);
    position(doc.querySelector('#tall'),0,10,5000,9500);
    position(doc.querySelector('#proxy'),-1,-3400,0,-3399);
    position(doc.querySelector('#annotation'),-30,104,230,120);
    fakeRasterWindow(win);
    const serialized = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L50 70"/></svg>';
    vi.mocked(toSvg).mockResolvedValueOnce('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized));
    const content = await captureReadingGraphics(win, [figure], { referenceRoots: [root] }, CONSTANTS);
    expect(content.get(figure)).toMatchObject({ type: 'image' });
    expect(content.get(figure).alt).not.toContain('Invisible selector proxy');
    expect(toSvg).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({ width:260, height:120 }));
  });
});
