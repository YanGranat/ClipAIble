import { describe, expect, it, vi } from 'vitest';
import { detectImageMime, imageDataUrlBytes, readImageBytes } from '../../scripts/utils/html/image-bytes.js';

describe('image byte admission', () => {
  it.each([
    [[137,80,78,71,13,10,26,10], 'image/png'],
    [[255,216,255,224], 'image/jpeg'],
    [[...Buffer.from('GIF89a')], 'image/gif'],
    [[...Buffer.from('RIFF0000WEBP')], 'image/webp'],
    [[0,0,0,24,...Buffer.from('ftypavif')], 'image/avif'],
    [[66,77,0,0], 'image/bmp'],
    [[...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')], 'image/svg+xml']
  ])('identifies content bytes independently of headers %#', (bytes, mime) => {
    expect(detectImageMime(new Uint8Array(bytes))).toBe(mime);
  });

  it('rejects empty, HTML and unsupported arbitrary bytes', () => {
    for (const bytes of [[], [...Buffer.from('<html>Not an image</html>')], [1,2,3]]) expect(() => detectImageMime(new Uint8Array(bytes))).toThrow();
  });

  it('rejects an excessive declared length before consuming bytes', async () => {
    const cancel = vi.fn(async () => {});
    const arrayBuffer = vi.fn();
    await expect(readImageBytes({ headers: new Headers({ 'content-length': String(50*1024*1024+1) }), body: { cancel }, arrayBuffer })).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([undefined, '1'])('bounds actual stream bytes with content length %s', async contentLength => {
    const chunk = new Uint8Array(1024*1024);
    let count = 0;
    const cancel = vi.fn(async () => {});
    const releaseLock = vi.fn();
    const reader = { read: async () => ({ done: false, value: chunk }), cancel, releaseLock };
    reader.read = vi.fn(async () => { count++; return { done: count > 60, value: chunk }; });
    const headers = new Headers(contentLength ? { 'content-length': contentLength } : {});
    const outcome = await readImageBytes({ headers, body: { getReader: () => reader } })
      .then(() => ({ ok: true }), error => ({ ok: false, code: error.code }));
    expect(outcome).toEqual({ ok: false, code: 'IMAGE_TOO_LARGE' });
    expect(count).toBe(51);
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('preserves small streamed bytes and releases the reader', async () => {
    let index = 0;
    const releaseLock = vi.fn();
    const reader = { read: async () => index++ ? { done: true } : { done: false, value: new Uint8Array([1,2,3]) }, releaseLock };
    expect(await readImageBytes({ headers: new Headers(), body: { getReader: () => reader } })).toEqual(new Uint8Array([1,2,3]));
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('validates data URL syntax and actual content independently', () => {
    const bytes = imageDataUrlBytes('data:image/png;base64,iVBORw0KGgo=');
    expect(detectImageMime(bytes)).toBe('image/png');
    expect(detectImageMime(imageDataUrlBytes('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E'))).toBe('image/svg+xml');
    expect(() => imageDataUrlBytes('data:text/html;base64,AAAA')).toThrow(expect.objectContaining({ code: 'IMAGE_UNSUPPORTED_TYPE' }));
    expect(() => imageDataUrlBytes('data:image/png;base64,!!!')).toThrow(expect.objectContaining({ code: 'IMAGE_INVALID_DATA' }));
    expect(() => detectImageMime(imageDataUrlBytes('data:image/png;base64,PGh0bWw+'))).toThrow(expect.objectContaining({ code: 'IMAGE_UNSUPPORTED_TYPE' }));
  });
});
