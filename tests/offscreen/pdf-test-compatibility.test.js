import { describe, expect, it } from 'vitest';
import { transferToFixedLength } from '../helpers/pdf-test-compatibility.js';

describe('PDF test buffer transfer compatibility', () => {
  it.each([undefined, 2, 7, 0, '2.9', null, NaN])('transfers bytes into a fixed-length buffer: %j', length => {
    const source = Uint8Array.from([3, 6, 9, 12]).buffer;
    const result = transferToFixedLength.call(source, length);
    const expectedLength = length === undefined ? 4 : Math.trunc(Number(length)) || 0;
    expect(Array.from(new Uint8Array(result))).toEqual([3, 6, 9, 12].slice(0, expectedLength).concat(Array(Math.max(0, expectedLength - 4)).fill(0)));
    expect(result.byteLength).toBe(expectedLength);
    expect(result.resizable || false).toBe(false);
    expect(() => new Uint8Array(source)).toThrow(TypeError);
  });

  it.each([-1, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid length without detaching the source: %j', length => {
    const source = Uint8Array.from([3, 6]).buffer;
    expect(() => transferToFixedLength.call(source, length)).toThrow(RangeError);
    expect(Array.from(new Uint8Array(source))).toEqual([3, 6]);
  });

  it.each([1n, Symbol('length')])('rejects a nonnumeric primitive without detaching the source', length => {
    const source = new ArrayBuffer(2);
    expect(() => transferToFixedLength.call(source, length)).toThrow(TypeError);
    expect(source.byteLength).toBe(2);
  });

  it('rejects incompatible and detached receivers', () => {
    for (const receiver of [null, {}, new Uint8Array(4), new SharedArrayBuffer(4)]) {
      expect(() => transferToFixedLength.call(receiver)).toThrow(TypeError);
    }
    const source = new ArrayBuffer(0);
    structuredClone(source, { transfer: [source] });
    expect(() => transferToFixedLength.call(source)).toThrow(TypeError);
  });
});
