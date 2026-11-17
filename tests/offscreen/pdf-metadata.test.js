import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn() }));

import { extractPdfMetadata } from '../../scripts/offscreen/pdf/utils/metadata-extractor.js';

describe('PDF metadata deadlines', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('clears the deadline after reading metadata', async () => {
    await expect(extractPdfMetadata({ getMetadata: async () => ({ info: { Title: 'Sample document' } }) }))
      .resolves.toEqual({ title: 'Sample document', author: '', publishDate: '' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a metadata failure', async () => {
    await expect(extractPdfMetadata({ getMetadata: async () => { throw new Error('Unavailable'); } }))
      .resolves.toEqual({ title: '', author: '', publishDate: '' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
