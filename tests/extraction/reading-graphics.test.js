import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';
import { captureReadingGraphics, getGraphicReadingOwner } from '../../scripts/extraction/extractor/graphics.js';
import { parseElements } from '../../scripts/extraction/extractor/parse.js';

const windows = [];
function page(markup) {
  const win = new JSDOM(`<!doctype html><article>${markup}</article>`, { url: 'https://example.test/report' }).window;
  windows.push(win);
  const doc = win.document, root = doc.querySelector('article');
  return { win, doc, root, owner: selector => getGraphicReadingOwner(doc.querySelector(selector), [root]) };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

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
});
