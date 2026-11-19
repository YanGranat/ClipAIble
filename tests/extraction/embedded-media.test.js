import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { getEmbeddedMediaItems } from '../../scripts/extraction/extractor/images.js';

function media(markup) {
  const document = new JSDOM('<!doctype html>' + markup, { url: 'https://example.test/articles/entry' }).window.document;
  return document.querySelector('iframe,video,audio');
}

describe('article embedded media', () => {
  it('keeps a published chart image and its original versioned reference', () => {
    const items = getEmbeddedMediaItems(media('<iframe title="Sample measurements" src="https://datawrapper.dwcdn.net/aBc12/4/"></iframe>'));
    expect(items.map(item => item.type)).toEqual(['image', 'paragraph']);
    expect(items[0]).toMatchObject({ src: 'https://datawrapper.dwcdn.net/aBc12/full.png', alt: 'Sample measurements' });
    expect(items[1].html).toContain('href="https://datawrapper.dwcdn.net/aBc12/4/"');
    expect(items[1].text).toBe('Sample measurements');
  });

  it('uses the documented public image when an embed has no version segment', () => {
    expect(getEmbeddedMediaItems(media('<iframe src="//datawrapper.dwcdn.net/Zyx98/"></iframe>'))[0].src)
      .toBe('https://datawrapper.dwcdn.net/Zyx98/full.png');
  });

  it.each(['https://datawrapper.dwcdn.net.example.test/aBc12/4/', 'https://datawrapper.dwcdn.net/invalid-chart/4/'])('keeps an ordinary embed reference without guessing a chart preview: %s', src => {
    const items = getEmbeddedMediaItems(media(`<iframe title="Source media" src="${src}"></iframe>`));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'paragraph', text: 'Source media' });
  });

  it('preserves a video source and poster in document order without changing the source DOM', () => {
    const element = media('<video aria-label="Recorded observation" poster="/media/still.png"><source src="/media/recording.mp4"></video>');
    const before = element.outerHTML;
    const items = getEmbeddedMediaItems(element);
    expect(items[0]).toMatchObject({ type: 'image', src: 'https://example.test/media/still.png' });
    expect(items[1].html).toContain('https://example.test/media/recording.mp4');
    expect(element.outerHTML).toBe(before);
  });

  it('retains an audio-only reference', () => {
    expect(getEmbeddedMediaItems(media('<audio src="/media/recording.ogg" title="Field recording"></audio>')))
      .toEqual([{ type: 'paragraph', text: 'Field recording', html: '<a href="https://example.test/media/recording.ogg">Field recording</a>' }]);
  });

  it('escapes media labels before placing them in link markup', () => {
    const element = media('<iframe src="https://example.test/player"></iframe>');
    element.setAttribute('title', '<img src=x onerror=alert(1)> & "sample"');
    const item = getEmbeddedMediaItems(element)[0];
    const rendered = new JSDOM('<!doctype html>' + item.html, { url: 'https://reader.example.test/' }).window.document;
    expect(Boolean(rendered.querySelector('img'))).toBe(false);
    expect(rendered.querySelector('a').textContent).toBe(element.getAttribute('title'));
  });

  it.each(['javascript:alert(1)', 'data:text/html,example', 'file:///private/media', 'https://name:secret@example.test/player'])('ignores non-exportable media URLs: %s', src => {
    expect(getEmbeddedMediaItems(media(`<iframe src="${src}"></iframe>`))).toEqual([]);
  });

  it('does not turn an empty source into a link to the current article', () => {
    expect(getEmbeddedMediaItems(media('<video poster="/poster.png"></video>'))).toEqual([]);
  });
});
