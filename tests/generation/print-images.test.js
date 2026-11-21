import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { waitForPrintImages } from '../../scripts/generation/print-images.js';

const pages = [];
function page(src = '/field.png') {
  const dom = new JSDOM(`<!doctype html><figure id="plot"><img src="${src}" alt="Measured field"><figcaption>Independent measurements.</figcaption></figure>`, { url: 'https://example.test/report' });
  pages.push(dom);
  return dom.window.document;
}
afterEach(() => { pages.splice(0).forEach(dom => dom.window.close()); vi.useRealTimers(); });

it('keeps decoded images and their captions intact', async () => {
  const doc = page(), image = doc.querySelector('img'), before = doc.body.innerHTML;
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 640 } });
  await waitForPrintImages(doc);
  expect(doc.body.innerHTML).toBe(before);
});

it('retains an unavailable remote image as a working reference without hiding its caption', async () => {
  const doc = page(), image = doc.querySelector('img');
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });
  await waitForPrintImages(doc);
  expect(doc.querySelector('figure').style.display).not.toBe('none');
  expect(doc.querySelector('a').href).toBe('https://example.test/field.png');
  expect(doc.querySelector('a').textContent).toBe('Measured field');
  expect(doc.querySelector('figcaption').textContent).toBe('Independent measurements.');
});

it('rejects an unreadable embedded image instead of hiding lost content', async () => {
  const doc = page('data:image/png;base64,AA==');
  Object.defineProperty(doc.querySelector('img'), 'complete', { value: true });
  await expect(waitForPrintImages(doc)).rejects.toMatchObject({ code: 'IMAGE_DECODE_FAILED' });
  expect(doc.querySelector('figcaption').textContent).toBe('Independent measurements.');
});

it('bounds an unfinished load and removes its pending timer', async () => {
  vi.useFakeTimers();
  const doc = page();
  Object.defineProperty(doc.querySelector('img'), 'complete', { value: false });
  const pending = expect(waitForPrintImages(doc, 100)).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
