import { inflateRawSync } from 'node:zlib';

export function readZipEntries(input) {
  const archive = Buffer.from(input);
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('ZIP directory missing');
  let offset = archive.readUInt32LE(end + 16);
  const entries = {};
  for (let index = 0; index < archive.readUInt16LE(end + 10); index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const nameLength = archive.readUInt16LE(offset + 28), extra = archive.readUInt16LE(offset + 30), comment = archive.readUInt16LE(offset + 32);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const local = archive.readUInt32LE(offset + 42), size = archive.readUInt32LE(offset + 20), expected = archive.readUInt32LE(offset + 24);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const method = archive.readUInt16LE(offset + 10), compressed = archive.subarray(start, start + size);
    if (![0, 8].includes(method)) throw new Error('Unsupported ZIP method');
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    if (data.length !== expected) throw new Error('ZIP entry size mismatch');
    entries[name] = data;
    offset += 46 + nameLength + extra + comment;
  }
  return entries;
}
