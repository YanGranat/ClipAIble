import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { captureReadingGraphics, getGraphicReadingOwner } from '../../scripts/extraction/extractor/graphics.js';

const windows = [];
function page(markup) {
  const win = new JSDOM(`<!doctype html><article>${markup}</article>`, { url: 'https://example.test/report' }).window;
  windows.push(win);
  const doc = win.document, root = doc.querySelector('article');
  return { win, doc, root, owner: selector => getGraphicReadingOwner(doc.querySelector(selector), [root]) };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

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

  it('does not infer a composite from overlapping empty object-fit letterboxes', () => {
    const { doc, owner } = page('<figure><img style="object-fit:contain;object-position:50% 0%"><img style="object-fit:contain;object-position:50% 100%"></figure>');
    for (const image of doc.querySelectorAll('img')) {
      Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 600 }, naturalHeight: { value: 40 } });
      image.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 180, width: 600, height: 180 });
    }
    expect(owner('figure')).toBeNull();
  });
});
