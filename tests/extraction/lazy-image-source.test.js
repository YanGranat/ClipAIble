import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { handleImg } from '../../scripts/extraction/extractor/parse.js';
import { extractBestImageUrl } from '../../scripts/extraction/extractor/images.js';
import { CONSTANTS } from '../../scripts/extraction/extractor/constants.js';

const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const stripes = [
  { width: 1, height: 10, source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAKCAYAAAB10jRKAAAADElEQVR4nGNgIBUAAAAyAAFBPJwWAAAAAElFTkSuQmCC' },
  { width: 10, height: 1, source: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAABCAYAAADn9T9+AAAADElEQVR4nGNgIBIAAAApAAGU6O4JAAAAAElFTkSuQmCC' }
];
const documents = [];
function page(attributes, decoded = { source: placeholder, width: 1, height: 1 }) {
  const dom = new JSDOM(`<title>Coastal Observations</title><article><p>The survey records a change across the observation sites.</p><figure><img src="${decoded.source}" ${attributes} width="640" height="480"><figcaption>Measurements from the field survey.</figcaption></figure><p>The final observation completes the report.</p></article>`, { url: 'https://example.test/report', runScripts: 'outside-only' });
  documents.push(dom);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Node', dom.window.Node);
  const image = dom.window.document.querySelector('img');
  Object.defineProperties(image, { naturalWidth: { value: decoded.width }, naturalHeight: { value: decoded.height } });
  return { dom, image };
}
afterEach(() => {
  for (const dom of documents.splice(0)) dom.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const extractImage = (dom, image) => handleImg(dom.window, image, { processedImages: new Set() }, CONSTANTS, dom.window.location.href);

describe('Loaded placeholders and deferred article images', () => {
  it('does not emit a labelled fallback asset and still chooses a real deferred source', () => {
    const { image } = page('aria-label="Image unavailable"', {
      source: 'https://example.test/media/neutral-placeholder.png', width: 160, height: 90
    });
    expect(extractBestImageUrl(image)).toBeNull();
    image.setAttribute('srcset', '/small-photo.webp 400w, /neutral-fallback.webp 800w');
    expect(extractBestImageUrl(image)).toBe('/small-photo.webp');
    image.removeAttribute('srcset');
    image.setAttribute('aria-label', 'Neutral reference pattern');
    expect(extractBestImageUrl(image)).toBe('https://example.test/media/neutral-placeholder.png');
    image.setAttribute('aria-label', 'Image unavailable');
    image.setAttribute('src', '/observations/observation.jpg');
    expect(extractBestImageUrl(image)).toBe('https://example.test/observations/observation.jpg');
  });

  it.each([
    ['data-src="/survey.png"', '/survey.png'],
    ['data-full-src="/survey-full.png"', '/survey-full.png'],
    ['data-srcset="/survey-small.png 320w, /survey-large.png 1280w"', '/survey-large.png']
  ])('retains the selected resource after a loading pixel has decoded: %s', (attributes, source) => {
    const { dom, image } = page(attributes);
    expect(extractImage(dom, image)?.src).toBe(`https://example.test${source}`);
  });

  it.each(stripes)('does not classify an article image as the decoded $width by $height placeholder separator', decoded => {
    const bytes = Buffer.from(decoded.source.split(',')[1], 'base64');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([decoded.width, decoded.height]);
    const { dom, image } = page('data-src="/survey.png"', decoded);
    expect(extractImage(dom, image)?.src).toBe('https://example.test/survey.png');
  });

  it.each(stripes)('keeps the genuine decoded $width by $height separator excluded', decoded => {
    const { dom, image } = page('', decoded);
    expect(extractImage(dom, image)).toBeNull();
  });

  it.each(stripes)('does not reuse intrinsic width/height getters from a $width by $height placeholder', decoded => {
    const { dom, image } = page('data-src="/survey.png"', decoded);
    image.removeAttribute('width'); image.removeAttribute('height');
    Object.defineProperties(image, { width: { value: decoded.width }, height: { value: decoded.height } });
    expect(extractImage(dom, image)?.src).toBe('https://example.test/survey.png');
  });

  it('classifies the deferred image filename instead of the loading icon filename', () => {
    const { dom, image } = page('data-src="/survey.png"', { source: '/loading-icon.png', width: 1, height: 1 });
    expect(extractImage(dom, image)?.src).toBe('https://example.test/survey.png');
  });

  it('keeps a deferred logo excluded after its loading pixel is ignored', () => {
    const { dom, image } = page('data-src="/assets/company-logo.png"');
    expect(extractImage(dom, image)).toBeNull();
  });

  it('uses the deferred resource for a leading source figure in the shared parser', () => {
    const { dom, image } = page('data-src="/survey.png"');
    const article = dom.window.document.querySelector('article');
    article.prepend(image.closest('figure'));
    expect(extractImage(dom, image)?.src).toBe('https://example.test/survey.png');
  });

  it('uses currentSrc dimensions only for the decoded resource while a new src is pending', () => {
    const { dom, image } = page('');
    image.src = '/survey.png';
    Object.defineProperty(image, 'currentSrc', { value: placeholder });
    expect(extractImage(dom, image)?.src).toBe('https://example.test/survey.png');
  });

  it('keeps a genuine decoded tracking pixel excluded even when displayed at article size', () => {
    const { dom, image } = page('');
    image.src = '/observation.gif';
    expect(extractImage(dom, image)).toBeNull();
  });

  it('does not bypass the decoded pixel check when the deferred URL is the same resource', () => {
    const { dom, image } = page('data-src="/observation.gif"');
    image.src = '/observation.gif';
    expect(extractImage(dom, image)).toBeNull();
  });

  it('rejects a deferred beacon URL without borrowing the placeholder dimensions', () => {
    const { dom, image } = page('data-src="https://www.googleadservices.com/observation.gif"');
    expect(extractImage(dom, image)).toBeNull();
  });

  it('retains the image and its caption in the serialized selector extractor', async () => {
    const { dom } = page('data-src="/survey.png"');
    vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
    const builder = new URL('../../scripts/extraction/extractor/builder.js', import.meta.url).href;
    const source = execFileSync(process.execPath, ['--input-type=module', '-e', `import { generateExtractAutomaticallyInlined } from ${JSON.stringify(builder)}; process.stdout.write(await generateExtractAutomaticallyInlined());`], { encoding: 'utf8' });
    dom.window.eval(source.replace('export async function', 'async function') + '\nwindow.extract = extractAutomaticallyInlined;');
    const result = await dom.window.extract(dom.window.location.href, false, { content: 'article' });
    expect(result.content.map(item => item.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(result.content[1]).toMatchObject({ src: 'https://example.test/survey.png', caption: 'Measurements from the field survey.' });
  });
});
