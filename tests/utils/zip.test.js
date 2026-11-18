import { expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import JSZip from '../../lib/jszip-wrapper.js';

function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    const packed = bytes.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(packed) : packed;
    found.push({ name, method, data: new Uint8Array(data), crc: view.getUint32(offset + 14, true), size: view.getUint32(offset + 22, true), packedSize: size, localOffset: offset, flags: view.getUint16(offset + 6, true), date: view.getUint16(offset + 12, true), time: view.getUint16(offset + 10, true) });
    offset = start + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  for (const file of found) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    expect(view.getUint16(offset + 8, true)).toBe(file.flags);
    expect(view.getUint16(offset + 10, true)).toBe(file.method);
    expect(view.getUint16(offset + 12, true)).toBe(0);
    expect(view.getUint16(offset + 14, true)).toBe(0x21);
    expect(view.getUint32(offset + 16, true)).toBe(file.crc);
    expect(view.getUint32(offset + 20, true)).toBe(file.packedSize);
    expect(view.getUint32(offset + 24, true)).toBe(file.size);
    expect(view.getUint32(offset + 42, true)).toBe(file.localOffset);
    expect(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + view.getUint16(offset + 28, true)))).toBe(file.name);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  expect(view.getUint32(offset, true)).toBe(0x06054b50);
  expect(view.getUint16(offset + 10, true)).toBe(found.length);
  return found;
}

it('writes real raw DEFLATE entries while keeping the EPUB mimetype first and stored', async () => {
  const zip = new JSZip();
  const text = 'Independent text with repeated measurements. '.repeat(300);
  zip.file('OEBPS/chapter.xhtml', text);
  zip.file('mimetype', 'application/epub+zip');
  zip.file('OEBPS/изображение.bin', new Uint8Array([0, 17, 255]), { compression: 'STORE' });
  const bytes = await zip.generateAsync({ compression: 'DEFLATE' });
  expect(bytes.length).toBeLessThan(text.length / 4);
  const files = entries(bytes);
  expect(files.map(file => [file.name, file.method])).toEqual([['mimetype', 0], ['OEBPS/chapter.xhtml', 8], ['OEBPS/изображение.bin', 0]]);
  expect(new TextDecoder().decode(files[0].data)).toBe('application/epub+zip');
  expect(new TextDecoder().decode(files[1].data)).toBe(text);
  expect(files[2].data).toEqual(new Uint8Array([0, 17, 255]));
  for (const file of files) { expect(file.flags).toBe(0x800); expect(file.date).toBe(0x21); expect(file.time).toBe(0); expect(file.size).toBe(file.data.length); }
});

it('writes the standard CRC vector and empty files without losing binary view offsets', async () => {
  const zip = new JSZip();
  zip.file('crc.txt', '123456789');
  zip.file('empty.txt', '');
  zip.file('view.bin', new Uint8Array([99, 1, 2, 3, 99]).subarray(1, 4));
  zip.file('data-view.bin', new DataView(new Uint8Array([99, 1, 2, 3, 99]).buffer, 1, 3));
  const files = entries(await zip.generateAsync({ compression: 'DEFLATE' }));
  expect(files[0].crc).toBe(0xcbf43926);
  expect(files[1].crc).toBe(0);
  expect(files[1].data).toHaveLength(0);
  expect(files[2].data).toEqual(new Uint8Array([1, 2, 3]));
  expect(files[3].data).toEqual(new Uint8Array([1, 2, 3]));
});

it('supports per-file compression without retaining a previous generation setting', async () => {
  const zip = new JSZip();
  zip.file('compressed.txt', 'Repeated text. '.repeat(20), { compression: 'DEFLATE' });
  zip.file('default.txt', 'Ordinary text');
  expect(entries(await zip.generateAsync()).map(file => file.method)).toEqual([8, 0]);
  expect(entries(await zip.generateAsync({ compression: 'DEFLATE' })).map(file => file.method)).toEqual([8, 8]);
  expect(entries(await zip.generateAsync()).map(file => file.method)).toEqual([8, 0]);
});

it('rejects unsupported content and compression instead of writing an empty or mislabeled entry', async () => {
  expect(() => new JSZip().file('entry', {})).toThrow(TypeError);
  const zip = new JSZip().file('entry', 'content', { compression: 'UNKNOWN' });
  await expect(zip.generateAsync()).rejects.toThrow('Unsupported ZIP compression');
});
