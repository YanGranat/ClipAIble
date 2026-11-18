import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { isDecorativeImage, isTrackingPixel, extractFeaturedImage } from '../../scripts/extraction/extractor/images.js';
import { parseElements, handleImg } from '../../scripts/extraction/extractor/parse.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';

const documents = [];
afterEach(() => { for (const dom of documents.splice(0)) dom.window.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function scene(markup) {
  const dom = new JSDOM(`<title>Sensor Field Report</title><main>${markup}</main>`, { url: 'https://example.test/report' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('HTMLImageElement', dom.window.HTMLImageElement);
  return dom;
}
const state = () => ({ processedImages: new Set() });
const diagrams = ['workflow-pipeline.svg', 'outline-process.png', 'line-chart-series.png', 'gradient-response.png', 'research-gradient-photo.jpg'];

describe('Article image classification', () => {
  it.each(diagrams)('keeps the content diagram %s in body images and figures', filename => {
    const dom = scene(`<img src="/assets/${filename}" width="640" height="240" alt="Measurements across the sensor network"><figure><img src="/figures/${filename}" width="640" height="240"><figcaption>The measured response.</figcaption></figure>`);
    const image = dom.window.document.querySelector('img');
    expect(isDecorativeImage(dom.window, image, CONSTANTS.LOGO_PATTERNS)).toBe(false);
    expect(handleImg(dom.window, image, state(), CONSTANTS, dom.window.location.href)?.src).toBe(`https://example.test/assets/${filename}`);
    expect(parseElements(dom.window, [dom.window.document.querySelector('figure')], state(), CONSTANTS, dom.window.location.href)).toMatchObject([{ type: 'image', src: `https://example.test/figures/${filename}`, caption: 'The measured response.' }]);
  });

  it.each(diagrams)('keeps %s when declared as the featured image', filename => {
    const dom = scene('<p>The report explains the measurements.</p>');
    const meta = dom.window.document.createElement('meta');
    meta.setAttribute('property', 'og:image'); meta.content = `/assets/${filename}`;
    dom.window.document.head.append(meta);
    expect(extractFeaturedImage(dom.window.document, dom.window.location.href, dom.window.document.querySelector('main'), CONSTANTS.LOGO_PATTERNS)?.src).toBe(`https://example.test/assets/${filename}`);
  });

  it('keeps a large leading diagram as the featured fallback', () => {
    const dom = scene('<img src="/assets/line-chart-series.png" width="640" height="240"><p>The report explains the measurements.</p>');
    expect(extractFeaturedImage(dom.window.document, dom.window.location.href, dom.window.document.querySelector('main'), CONSTANTS.LOGO_PATTERNS)?.src).toBe('https://example.test/assets/line-chart-series.png');
  });

  it.each([
    ['<img src="/assets/site-logo.svg" width="640" height="200">'],
    ['<img src="/assets/logo-gradient.png" width="640" height="200">'],
    ['<img src="/assets/profile-avatar.png" width="48" height="48" alt="Avatar">'],
    ['<img src="/assets/portrait.png" width="80" height="80" class="headshot">'],
    ['<a href="/reference"><img src="/assets/link-icon.svg" width="16" height="16"></a>']
  ])('still excludes a branding, profile or link-control image: %s', markup => {
    const dom = scene(markup);
    expect(isDecorativeImage(dom.window, dom.window.document.querySelector('img'), CONSTANTS.LOGO_PATTERNS)).toBe(true);
  });

  it.each([[640, 2], [2, 640]])('excludes a known %i by %i pixel separator without guessing its filename', (width, height) => {
    const dom = scene(`<img src="/assets/stroke.png" width="${width}" height="${height}"><p>The report explains the measurements.</p>`);
    expect(isDecorativeImage(dom.window, dom.window.document.querySelector('img'), CONSTANTS.LOGO_PATTERNS)).toBe(true);
    expect(extractFeaturedImage(dom.window.document, dom.window.location.href, dom.window.document.querySelector('main'), CONSTANTS.LOGO_PATTERNS)).toBeNull();
  });

  it('recognizes an explicit separator role while retaining an article image of unknown size', () => {
    const dom = scene('<img src="/assets/stroke.png" width="640" height="80" role="separator"><img src="/assets/line-chart-series.png">');
    const [separator, diagram] = dom.window.document.querySelectorAll('img');
    expect(isDecorativeImage(dom.window, separator, CONSTANTS.LOGO_PATTERNS)).toBe(true);
    expect(isDecorativeImage(dom.window, diagram, CONSTANTS.LOGO_PATTERNS)).toBe(false);
  });

  it('retains content portraits and keeps the separate tracking-pixel guard', () => {
    const dom = scene('<img src="/assets/research-portrait.jpg" width="640" height="480"><img src="/assets/observation.gif">');
    const [portrait, tracker] = dom.window.document.querySelectorAll('img');
    expect(isDecorativeImage(dom.window, portrait, CONSTANTS.LOGO_PATTERNS)).toBe(false);
    Object.defineProperties(tracker, { naturalWidth: { value: 1 }, naturalHeight: { value: 1 } });
    expect(isTrackingPixel(dom.window, tracker)).toBe(true);
  });

  it.each(['workflow-pipeline.svg', 'gradient-response.png'])('preserves %s in the serialized page extractor', async filename => {
    const dom = new JSDOM(`<title>Sensor Field Report</title><article><h1>Sensor Field Report</h1><p>${'The sensors measure changes in the harbor throughout the observation period. '.repeat(12)}</p><figure><img src="/assets/${filename}" width="640" height="240"><figcaption>The measured response.</figcaption></figure></article>`, { url: 'https://example.test/report', runScripts: 'outside-only' });
    documents.push(dom);
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract('https://example.test/report');
    expect(result.content.filter(item => item.type === 'image').map(item => item.src)).toEqual([`https://example.test/assets/${filename}`]);
  });
});
