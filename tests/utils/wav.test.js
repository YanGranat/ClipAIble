import { expect, it } from 'vitest';
import { concatenateWav, readWav } from '../../scripts/utils/wav.js';
import { pcmToWav } from '../../scripts/api/audio-format.js';
it('preserves PCM bytes and validates chunk format before assembly', async () => {
  const first = pcmToWav(new Int16Array([1, -2]).buffer, 16000, 16, 1);
  const last = pcmToWav(new Int16Array([3, -4]).buffer, 16000, 16, 1);
  const output = concatenateWav([first, last]);
  expect([...new Int16Array(readWav(output).data.slice().buffer)]).toEqual([1, -2, 3, -4]);
  const blob = concatenateWav([first, last], true);
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(output));
  expect(() => concatenateWav([first, pcmToWav(new Int16Array([1]).buffer, 22050, 16, 1)])).toThrow();
});
it('rejects unsigned oversized, truncated, and missing data chunks', () => {
  const valid = pcmToWav(new Int16Array([1]).buffer, 16000, 16, 1);
  const invalidSize = valid.slice(0); new DataView(invalidSize).setUint32(40, 0xffffffff, true);
  expect(() => readWav(invalidSize)).toThrow();
  expect(() => readWav(valid.slice(0, -1))).toThrow();
  const missing = valid.slice(0); new Uint8Array(missing).set(new TextEncoder().encode('JUNK'), 36);
  expect(() => readWav(missing)).toThrow();
  expect(() => readWav(pcmToWav(new ArrayBuffer(0), 16000, 16, 1))).toThrow();
});
