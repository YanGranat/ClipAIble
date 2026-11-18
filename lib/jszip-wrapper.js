// @ts-check
// JSZip ES Module Wrapper
// This wrapper allows JSZip to be imported as an ES module in Service Workers

// Minimal ZIP implementation for EPUB generation
// Based on the ZIP file format specification

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR = 0x06054b50;

class SimpleZip {
  /** @type {Uint32Array|undefined} */
  static _crcTable;
  
  constructor() {
    this.files = [];
  }

  file(path, content, options = {}) {
    let data;
    
    // Handle base64 encoded content (images)
    if (options.base64 && typeof content === 'string') {
      data = this._base64ToBytes(content);
    } else if (typeof content === 'string') {
      data = new TextEncoder().encode(content);
    } else if (content instanceof Uint8Array) {
      data = content;
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content);
    } else if (ArrayBuffer.isView(content)) {
      data = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    } else {
      throw new TypeError('ZIP content must be text or bytes');
    }
    
    this.files.push({
      path,
      data,
      compression: options.compression,
      isDirectory: path.endsWith('/')
    });
    
    return this;
  }

  _base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async generateAsync(options = {}) {
    if (this.files.length > 0xffff) throw new RangeError('ZIP32 entry count exceeded');
    const centralDirectory = [];
    const fileData = [];
    let offset = 0;

    // Sort files to ensure mimetype is first (required for EPUB)
    const files = [...this.files].sort((a, b) => {
      if (a.path === 'mimetype') return -1;
      if (b.path === 'mimetype') return 1;
      return 0;
    });

    // Build local file headers and data
    for (const source of files) {
      const compression = source.isDirectory || source.path === 'mimetype' ? 'STORE' : (source.compression || options.compression || 'STORE');
      if (!['STORE', 'DEFLATE'].includes(compression)) throw new TypeError('Unsupported ZIP compression');
      const file = {
        ...source,
        compression: compression === 'DEFLATE' ? 8 : 0,
        packed: compression === 'DEFLATE' ? await this._deflate(source.data) : source.data,
        crc32: this._crc32(source.data)
      };
      if (file.data.length > 0xffffffff || file.packed.length > 0xffffffff) throw new RangeError('ZIP32 entry size exceeded');
      const localHeader = this._buildLocalFileHeader(file, offset);
      fileData.push(localHeader);
      fileData.push(file.packed);
      
      centralDirectory.push({
        file,
        localHeaderOffset: offset
      });
      
      offset += localHeader.length + file.packed.length;
      if (offset > 0xffffffff) throw new RangeError('ZIP32 archive size exceeded');
    }

    // Build central directory
    const centralDirStart = offset;
    const centralDirEntries = [];
    
    for (const entry of centralDirectory) {
      const cdEntry = this._buildCentralDirectoryEntry(entry.file, entry.localHeaderOffset);
      centralDirEntries.push(cdEntry);
      offset += cdEntry.length;
    }

    const centralDirSize = offset - centralDirStart;

    // Build end of central directory
    const eocd = this._buildEndOfCentralDirectory(
      files.length,
      centralDirSize,
      centralDirStart
    );

    // Combine all parts
    const totalSize = offset + eocd.length;
    if (totalSize > 0xffffffff) throw new RangeError('ZIP32 archive size exceeded');
    const result = new Uint8Array(totalSize);
    let pos = 0;

    for (const chunk of fileData) {
      result.set(chunk, pos);
      pos += chunk.length;
    }

    for (const entry of centralDirEntries) {
      result.set(entry, pos);
      pos += entry.length;
    }

    result.set(eocd, pos);

    // Return based on options
    if (options.type === 'base64') {
      return this._bytesToBase64(result);
    } else if (options.type === 'blob') {
      return new Blob([result], { type: options.mimeType || 'application/zip' });
    } else {
      return result;
    }
  }

  async _deflate(data) {
    const source = new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } });
    const stream = source.pipeThrough(new CompressionStream('deflate'));
    const zlib = new Uint8Array(await new Response(stream).arrayBuffer());
    if (zlib.length < 6 || (zlib[0] & 15) !== 8 || ((zlib[0] << 8) + zlib[1]) % 31 || (zlib[1] & 32)) {
      throw new Error('Invalid compressed ZIP data');
    }
    return zlib.subarray(2, zlib.length - 4);
  }

  _bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  _buildLocalFileHeader(file, offset) {
    const pathBytes = new TextEncoder().encode(file.path);
    if (pathBytes.length > 0xffff) throw new RangeError('ZIP filename is too long');
    const header = new Uint8Array(30 + pathBytes.length);
    const view = new DataView(header.buffer);

    // Local file header signature
    view.setUint32(0, ZIP_LOCAL_FILE_HEADER, true);
    // Version needed to extract
    view.setUint16(4, 20, true);
    // General purpose bit flag (UTF-8 filenames)
    view.setUint16(6, 0x0800, true);
    // ZIP uses raw DEFLATE for method 8.
    view.setUint16(8, file.compression, true);
    // File last modification time
    view.setUint16(10, 0, true);
    // File last modification date
    view.setUint16(12, 0x21, true);
    // CRC-32
    view.setUint32(14, file.crc32, true);
    // Compressed size
    view.setUint32(18, file.packed.length, true);
    // Uncompressed size
    view.setUint32(22, file.data.length, true);
    // File name length
    view.setUint16(26, pathBytes.length, true);
    // Extra field length
    view.setUint16(28, 0, true);
    // File name
    header.set(pathBytes, 30);

    return header;
  }

  _buildCentralDirectoryEntry(file, localHeaderOffset) {
    const pathBytes = new TextEncoder().encode(file.path);
    const entry = new Uint8Array(46 + pathBytes.length);
    const view = new DataView(entry.buffer);

    // Central directory file header signature
    view.setUint32(0, ZIP_CENTRAL_DIR_HEADER, true);
    // Version made by
    view.setUint16(4, 20, true);
    // Version needed to extract
    view.setUint16(6, 20, true);
    // General purpose bit flag (UTF-8 filenames)
    view.setUint16(8, 0x0800, true);
    // Compression method
    view.setUint16(10, file.compression, true);
    // File last modification time
    view.setUint16(12, 0, true);
    // File last modification date
    view.setUint16(14, 0x21, true);
    // CRC-32
    view.setUint32(16, file.crc32, true);
    // Compressed size
    view.setUint32(20, file.packed.length, true);
    // Uncompressed size
    view.setUint32(24, file.data.length, true);
    // File name length
    view.setUint16(28, pathBytes.length, true);
    // Extra field length
    view.setUint16(30, 0, true);
    // File comment length
    view.setUint16(32, 0, true);
    // Disk number start
    view.setUint16(34, 0, true);
    // Internal file attributes
    view.setUint16(36, 0, true);
    // External file attributes
    view.setUint32(38, 0, true);
    // Relative offset of local header
    view.setUint32(42, localHeaderOffset, true);
    // File name
    entry.set(pathBytes, 46);

    return entry;
  }

  _buildEndOfCentralDirectory(numFiles, centralDirSize, centralDirOffset) {
    const eocd = new Uint8Array(22);
    const view = new DataView(eocd.buffer);

    // End of central directory signature
    view.setUint32(0, ZIP_END_OF_CENTRAL_DIR, true);
    // Number of this disk
    view.setUint16(4, 0, true);
    // Disk where central directory starts
    view.setUint16(6, 0, true);
    // Number of central directory records on this disk
    view.setUint16(8, numFiles, true);
    // Total number of central directory records
    view.setUint16(10, numFiles, true);
    // Size of central directory
    view.setUint32(12, centralDirSize, true);
    // Offset of start of central directory
    view.setUint32(16, centralDirOffset, true);
    // Comment length
    view.setUint16(20, 0, true);

    return eocd;
  }

  _crc32(data) {
    // CRC-32 lookup table
    if (!SimpleZip._crcTable) {
      SimpleZip._crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        SimpleZip._crcTable[i] = c;
      }
    }

    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = SimpleZip._crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}

// Interface used by the document generators and package builder.
export default class JSZip {
  constructor() {
    this._zip = new SimpleZip();
  }

  file(path, content, options = {}) {
    this._zip.file(path, content, options);
    return this;
  }

  async generateAsync(options = {}) {
    return this._zip.generateAsync(options);
  }
}

