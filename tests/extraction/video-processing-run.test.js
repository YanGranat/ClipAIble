import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({ activeRun: 'current', callAI: vi.fn() }));
vi.mock('../../scripts/api/index.js', () => ({ callAI: dependencies.callAI }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/utils/pipeline-helpers.js', () => ({
  checkCancellation: async (_context, runId) => {
    if (runId && runId !== dependencies.activeRun) throw new Error('Cancelled');
  }
}));

import { processSubtitlesWithAI } from '../../scripts/extraction/video-processor.js';

describe('Subtitle processing run ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencies.activeRun = 'current';
    dependencies.callAI.mockResolvedValue({ content: [{ type: 'paragraph', text: 'Sample text' }] });
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
    const cause = Object.assign(new DOMException('Cancelled', 'AbortError'), { retryable: false });
    dependencies.callAI.mockImplementationOnce(async () => {
      dependencies.activeRun = 'replacement';
      throw cause;
    });
    await expect(processSubtitlesWithAI(Array.from({ length: 501 }, () => ({ text: 'Sample text' })), 'placeholder', 'model', null, 'current'))
      .rejects.toBe(cause);
    expect(dependencies.callAI).toHaveBeenCalledOnce();
  });

  it('continues processing all chunks for the active run', async () => {
    const progress = vi.fn();
    const result = await processSubtitlesWithAI(Array.from({ length: 501 }, () => ({ text: 'Sample text' })), 'placeholder', 'model', progress, 'current');
    expect(result).toHaveLength(2);
    expect(dependencies.callAI).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it('limits the amount of speech per request even when there are few subtitles', async () => {
    const subtitles = ['Beginning', 'Middle', 'End'].map(label => ({ text: `${label} ${'text '.repeat(850)}` }));
    await processSubtitlesWithAI(subtitles, 'placeholder', 'model', null, 'current');
    const prompts = dependencies.callAI.mock.calls.map(args => args[1]);
    expect(prompts).toHaveLength(3);
    expect(prompts[0]).toContain('Beginning');
    expect(prompts[0]).not.toContain('Middle');
    expect(prompts[1]).toContain('Middle');
    expect(prompts[2]).toContain('End');
  });

  it('retries truncated output with smaller parts and carries the successful first half forward', async () => {
    const truncated = Object.assign(new Error('Output limit'), { code: 'AI_RESPONSE_TRUNCATED', retryable: false });
    dependencies.callAI.mockRejectedValueOnce(truncated)
      .mockResolvedValueOnce({ content: [{ type: 'paragraph', text: 'First half restored' }] })
      .mockResolvedValueOnce({ content: [{ type: 'paragraph', text: 'Second half restored' }] });
    const progress = vi.fn();
    const result = await processSubtitlesWithAI([{ text: 'First source' }, { text: 'Last source' }], 'placeholder', 'model', progress, 'current');
    expect(result.map(item => item.text)).toEqual(['First half restored', 'Second half restored']);
    expect(dependencies.callAI.mock.calls[1][1]).not.toContain('Last source');
    expect(dependencies.callAI.mock.calls[2][1]).toContain('First half restored');
    expect(dependencies.callAI.mock.calls[2][1]).toContain('Last source');
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });

  it('rejects empty content and does not present it as a complete transcript', async () => {
    dependencies.callAI.mockResolvedValueOnce({ content: [] });
    await expect(processSubtitlesWithAI([{ text: 'First source' }], 'placeholder', 'model', null, 'current'))
      .rejects.toThrow('AI response missing content array');
    expect(dependencies.callAI).toHaveBeenCalledOnce();
  });

  it.each([['null item', [null]], ['blank paragraph', [{ type: 'paragraph', text: ' ' }]]])(
    'rejects a %s in a later chunk before returning a partial transcript', async (_label, invalidContent) => {
      dependencies.callAI.mockResolvedValueOnce({ content: [{ type: 'paragraph', text: 'Earlier part.' }] })
        .mockResolvedValueOnce({ content: invalidContent });
      const subtitles = Array.from({ length: 1001 }, () => ({ text: 'Sample text' }));
      const progress = vi.fn();
      await expect(processSubtitlesWithAI(subtitles, 'placeholder', 'model', progress, 'current')).rejects.toThrow(SyntaxError);
      expect(progress).toHaveBeenLastCalledWith(1, 3);
      expect(dependencies.callAI).toHaveBeenCalledTimes(2);
    }
  );

  it('preserves the original provider error after exhausting a chunk', async () => {
    const cause = Object.assign(new Error('Provider declined the request.'), { status: 429, code: 'rate_limit' });
    dependencies.callAI.mockRejectedValueOnce(cause);
    const subtitles = Array.from({ length: 501 }, () => ({ text: 'Sample text' }));
    await expect(processSubtitlesWithAI(subtitles, 'placeholder', 'model', null, 'current')).rejects.toBe(cause);
    expect(dependencies.callAI).toHaveBeenCalledOnce();
  });

  it.each([1, 501])('preserves explicit provider and cancellation options for every chunk (%s)', async count => {
    const options = { provider: 'openai', checkCancelled: vi.fn() };
    await processSubtitlesWithAI(Array.from({ length: count }, () => ({ text: 'Sample text' })), 'placeholder', 'custom-model', null, 'current', options);
    expect(dependencies.callAI).toHaveBeenCalledTimes(count === 1 ? 1 : 2);
    for (const args of dependencies.callAI.mock.calls) expect(args[5]).toBe(options);
  });
});
