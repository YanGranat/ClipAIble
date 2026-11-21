import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { projectAtomicMedia } from '../../scripts/extraction/extractor/atomic-media.js';
import { serializeReadingHtml } from '../../scripts/extraction/extractor/inline-content.js';
import { tableCellHtml } from '../../scripts/generation/document-content.js';

const windows = [];
const imagesOf = result => result.media.map(entry => entry.item);
function page(markup, tag = 'table') {
  const win = new JSDOM(`<!doctype html><article>${markup}</article>`, { url: 'https://example.test/report' }).window;
  windows.push(win);
  const doc = win.document, unit = doc.querySelector(tag);
  const state = { readingGraphics: new Map(), readingMediaIds: new Map(), readingMediaCounter: 0 };
  const create = vi.fn(source => ({ type: 'image', src: source.getAttribute('src'), alt: source.getAttribute('alt') || '', caption: '' }));
  return { doc, unit, state, create, project: (admitted = [...unit.querySelectorAll('img,svg,canvas,figure')]) => projectAtomicMedia(unit, admitted, state, create) };
}
afterEach(() => windows.splice(0).forEach(win => win.close()));

describe('Atomic media projection', () => {
  it('retains each table-cell occurrence and reserves document fragment targets', () => {
    const { doc, unit, state, project } = page('<div id="reading-media-1"></div><a name="reading-media-2"></a><table><tr><td>Before <img id="authored-image" src="/same.png" alt="First observation"> after.</td><td><img src="/same.png" alt="Second observation"></td></tr></table>');
    const before = doc.documentElement.outerHTML, result = project();
    expect(doc.documentElement.outerHTML).toBe(before);
    expect(imagesOf(result).map(image => image.id)).toEqual(['reading-media-3', 'reading-media-4']);
    expect(imagesOf(result).map(image => image.src)).toEqual(['/same.png', '/same.png']);
    expect(result.media.map(entry => entry.source)).toEqual([...unit.querySelectorAll('img')]);
    expect([...result.clone.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['Before First observation after.', 'Second observation']);
    expect(result.clone.querySelector('#authored-image').getAttribute('href')).toBe('#reading-media-3');
    expect(result.clone.querySelectorAll('img')).toHaveLength(0);
    expect(imagesOf(project()).map(image => image.id)).toEqual(imagesOf(result).map(image => image.id));
    expect(state.readingMediaIds.size).toBe(2);
    expect(unit.querySelectorAll('img')).toHaveLength(2);
  });

  it('uses source admission and identity after hidden siblings are removed', () => {
    const { doc, unit, create, project } = page('<table><tr><td><img style="display:none" src="/hidden.png"><img src="/same.png" alt="Admitted"><img src="/same.png" alt="Excluded"></td></tr></table>');
    const admitted = unit.querySelector('img[alt="Admitted"]');
    const result = project([admitted]);
    expect(imagesOf(result).map(image => image.alt)).toEqual(['Admitted']);
    expect(create.mock.calls).toHaveLength(1);
    expect(create.mock.calls[0][0] === admitted).toBe(true);
    expect(result.clone.querySelector('a').textContent).toBe('Admitted');
    expect(doc.querySelectorAll('img')).toHaveLength(3);
  });

  it('keeps list and quotation ownership without changing the source', () => {
    for (const [tag, markup] of [['ol', '<ol><li>North <img src="/north.png" alt="North field"></li><li>South <img src="/south.png" alt="South field"></li></ol>'], ['blockquote', '<blockquote>Quoted observation <img src="/field.png" alt="Quoted field"> ends here.</blockquote>']]) {
      const { unit, project } = page(markup, tag), before = unit.outerHTML, result = project();
      expect(unit.outerHTML).toBe(before);
      expect(result.clone.querySelectorAll('a[href^="#reading-media-"]')).toHaveLength(result.media.length);
      expect(serializeReadingHtml(result.clone)).toContain('href="#reading-media-1"');
    }
  });

  it('projects one captured owner rather than duplicating its nested media', () => {
    const { unit, state, create, project } = page('<table><tr><td><figure id="source-figure"><svg><text>Chart labels</text></svg><canvas></canvas><figcaption>Observed curve.</figcaption></figure></td></tr></table>');
    const owner = unit.querySelector('figure');
    const item = { type: 'image', isGraphic: true, src: 'data:image/png;base64,AA==', alt: 'Chart labels', caption: 'Observed curve.' };
    state.readingGraphics.set(owner, item);
    const result = project();
    expect(result.media).toEqual([{ source: owner, item: { ...item, id: 'reading-media-1' } }]);
    expect(item.id).toBeUndefined();
    expect(result.clone.querySelectorAll('a')).toHaveLength(1);
    expect(result.clone.querySelector('a').id).toBe('source-figure');
    expect(result.clone.textContent).not.toContain('Observed curve.');
    expect(create).not.toHaveBeenCalled();
  });

  it('leaves a retained caption in the unit exactly once', () => {
    const { create, project } = page('<table><tr><td><figure><img src="/field.png" alt="Field"><figcaption>Measured caption.</figcaption></figure></td></tr></table>');
    create.mockImplementation(source => ({ type: 'image', src: source.getAttribute('src'), alt: 'Field', caption: 'Measured caption.' }));
    const result = project();
    expect(result.clone.querySelector('figcaption').textContent).toBe('Measured caption.');
    expect(imagesOf(result)[0].caption).toBe('');
  });

  it('preserves image-only authored hyperlinks even when alternative text is absent', () => {
    const { project } = page('<table><tr><td><a id="source-link" href="/detail"><img src="/field.png"></a></td></tr></table>');
    const result = project(), { clone } = result, images = imagesOf(result);
    expect(clone.querySelectorAll('a a')).toHaveLength(0);
    expect(clone.querySelector('a[href="/detail"]').textContent).toBe('Source');
    expect(clone.querySelector('a[href^="#reading-media-"]').textContent).toBe('Image');
    expect(clone.querySelectorAll('#source-link')).toHaveLength(1);
    const html = tableCellHtml({ cellFormat: 'html' }, serializeReadingHtml(clone.querySelector('td')), 'https://example.test/report');
    expect(html).toContain('href="https://example.test/detail"');
    expect(html).toContain(`href="#${images[0].id}"`);
  });

  it('splits linked text around multiple media without losing identities or emphasis', () => {
    const { project } = page('<table><tr><td><a id="source-link" href="/comparison">Before <strong id="emphasis"><img src="/first.png" alt="First"> between <img src="/second.png" alt="Second"> after</strong></a></td></tr></table>');
    const result = project(), cell = result.clone.querySelector('td');
    expect(imagesOf(result).map(image => image.alt)).toEqual(['First', 'Second']);
    expect(cell.querySelectorAll('a a')).toHaveLength(0);
    expect(cell.textContent).toBe('Before First between Second after');
    expect(cell.querySelectorAll('a[href="/comparison"]')).toHaveLength(3);
    expect([...cell.querySelectorAll('[id]')].map(node => node.id)).toEqual(['source-link', 'emphasis']);
    expect(cell.querySelector('strong').textContent).toBe('');
    expect([...cell.querySelectorAll('strong')].some(node => node.textContent.includes(' after'))).toBe(true);
  });

  it('recovers admitted media at the surviving translated cell owner without inventing an inline position', () => {
    const { unit, project } = page('<table><tr><td data-original-text="Original cell"><span>Translated <img src="/field.png" alt="Retained field"></span></td></tr></table>');
    const result = project();
    expect(result.clone.querySelector('td').textContent).toBe('Original cell Retained field');
    expect(result.media).toHaveLength(1);
    expect(unit.querySelector('img')).not.toBeNull();
  });

  it('does not recover hidden or excluded media through original-text metadata', () => {
    const { unit, state, project } = page('<table><tr><td data-original-text="Original cell"><img style="display:none" src="/hidden.png"><span class="excluded"><img src="/excluded.png"></span></td></tr></table>');
    state.selectionExclusions = ['.excluded'];
    const result = project([...unit.querySelectorAll('img')]);
    expect(result.media).toEqual([]);
    expect(result.clone.querySelectorAll('a')).toHaveLength(0);
  });

  it('keeps an authored destination when an unadmitted visual sibling will be removed', () => {
    const { unit, project } = page('<table><tr><td><a href="/detail"><img src="/field.png"><svg><path/></svg></a></td></tr></table>');
    const result = project([unit.querySelector('img')]);
    expect(result.clone.querySelector('a[href="/detail"]').textContent).toBe('Source');
  });

  it('retains the authored source link during original-text association recovery', () => {
    const { project } = page('<table><tr><td data-original-text="Original cell"><a id="original-link" href="/detail"><img src="/field.png"></a></td></tr></table>');
    const result = project();
    expect(result.clone.querySelector('a[href="/detail"]').textContent).toBe('Source');
    expect(result.clone.querySelector('#original-link').getAttribute('href')).toBe('/detail');
    expect(result.clone.querySelector('a[href^="#reading-media-"]')).not.toBeNull();
  });

  it('recovers only the outer captured owner when translated metadata removed nested graphic copies', () => {
    const { unit, state, project } = page('<table><tr><td data-original-text="Original cell"><figure><svg role="img"><text>Inner labels</text></svg><img src="/layer.png" alt="Layer"></figure></td></tr></table>');
    state.readingGraphics.set(unit.querySelector('figure'), { type: 'image', src: 'data:image/png;base64,AA==', alt: 'Complete figure', caption: '' });
    state.readingGraphics.set(unit.querySelector('svg'), { type: 'image', src: 'data:image/png;base64,AA==', alt: 'Inner labels', caption: '' });
    const result = project();
    expect(imagesOf(result).map(item => item.alt)).toEqual(['Complete figure']);
    expect(result.clone.querySelectorAll('a[href^="#reading-media-"]')).toHaveLength(1);
  });
});
