import { describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));

import { destroyPdfDocument } from '../../scripts/offscreen/pdf/core/pdf-loader.js';

describe('PDF document lifecycle', () => {
  it('waits for worker disposal', async () => {
    let complete;
    const destroy = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    let released = false;
    const pending = destroyPdfDocument({ destroy }).then(() => { released = true; });
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledOnce();
    expect(released).toBe(false);
    complete();
    await pending;
    expect(released).toBe(true);
  });

  it('preserves the operation result if disposal fails', async () => {
    await expect(destroyPdfDocument({ destroy: async () => { throw new Error('Disposal failed'); } })).resolves.toBeUndefined();
  });

  it('accepts an operation that failed before allocating a document', async () => {
    await expect(destroyPdfDocument(null)).resolves.toBeUndefined();
  });
});
