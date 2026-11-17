import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({ activeRun: 'current', callAI: vi.fn(), callWithRetry: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: dependencies.callAI }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: async (_context, runId) => {
    if (runId && runId !== dependencies.activeRun) throw new Error('Cancelled');
  }
}));
vi.mock('../../scripts/utils/retry.js', () => ({ callWithRetry: dependencies.callWithRetry }));
vi.mock('../../scripts/utils/config.js', () => ({ CONFIG: { RETRY_MAX_ATTEMPTS: 2 } }));

import { processSubtitlesWithAI } from '../../scripts/extraction/video-processor.js';

describe('Subtitle processing run ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.activeRun = 'current';
    dependencies.callAI.mockResolvedValue({ content: [{ type: 'paragraph', text: 'Sample text' }] });
    dependencies.callWithRetry.mockImplementation(async fn => await fn());
  });

  it('does not begin an obsolete single-chunk request', async () => {
    dependencies.activeRun = 'replacement';
    const progress = vi.fn();
    await expect(processSubtitlesWithAI([{ text: 'Sample text' }], 'placeholder', 'model', progress, 'current')).rejects.toThrow('Cancelled');
    expect(dependencies.callAI).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });

  it.each([1, 501])('ignores an obsolete response and prevents later chunks', async count => {
    let finish;
    dependencies.callAI.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const progress = vi.fn();
    const pending = processSubtitlesWithAI(Array.from({ length: count }, () => ({ text: 'Sample text' })), 'placeholder', 'model', progress, 'current');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    dependencies.activeRun = 'replacement';
    finish({ content: [{ type: 'paragraph', text: 'Late response' }] });
    await expect(pending).rejects.toThrow('Cancelled');
    expect(dependencies.callAI).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith(0, count === 1 ? 1 : 2);
  });

  it('does not retry an obsolete paid request', async () => {
    dependencies.callAI.mockRejectedValueOnce(new Error('Network failure'));
    dependencies.callWithRetry.mockImplementationOnce(async fn => {
      try { return await fn(); } catch {
        dependencies.activeRun = 'replacement';
        return await fn();
      }
    });
    await expect(processSubtitlesWithAI(Array.from({ length: 501 }, () => ({ text: 'Sample text' })), 'placeholder', 'model', null, 'current'))
      .rejects.toThrow('Cancelled');
    expect(dependencies.callAI).toHaveBeenCalledOnce();
  });

  it('continues processing all chunks for the active run', async () => {
    const progress = vi.fn();
    const result = await processSubtitlesWithAI(Array.from({ length: 501 }, () => ({ text: 'Sample text' })), 'placeholder', 'model', progress, 'current');
    expect(result).toHaveLength(2);
    expect(dependencies.callAI).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it.each([1, 501])('preserves explicit provider and cancellation options for every chunk (%s)', async count => {
    const options = { provider: 'openai', checkCancelled: vi.fn() };
    await processSubtitlesWithAI(Array.from({ length: count }, () => ({ text: 'Sample text' })), 'placeholder', 'custom-model', null, 'current', options);
    expect(dependencies.callAI).toHaveBeenCalledTimes(count === 1 ? 1 : 2);
    for (const args of dependencies.callAI.mock.calls) expect(args[5]).toBe(options);
  });
});
