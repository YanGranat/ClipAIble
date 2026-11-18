import { describe, expect, it, vi } from 'vitest';
import { createInitializationGate } from '../../scripts/background/initialization.js';

describe('startup admission gate', () => {
  it('retains a startup failure for polling but retries an explicit operation', async () => {
    const error = new Error('Storage unavailable'), initialize = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const ready = createInitializationGate(initialize);
    await expect(ready()).rejects.toBe(error);
    for (let index = 0; index < 4; index++) await expect(ready()).rejects.toBe(error);
    expect(initialize).toHaveBeenCalledOnce();
    await ready(true);
    await ready();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('shares the current retry with concurrent commands and passive observers', async () => {
    const error = new Error('Storage unavailable');
    let release;
    const initialize = vi.fn().mockRejectedValueOnce(error).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const ready = createInitializationGate(initialize);
    await expect(ready()).rejects.toBe(error);
    let firstFinished = false, secondFinished = false, pollFinished = false;
    const first = ready(true).then(() => { firstFinished = true; });
    const second = ready(true).then(() => { secondFinished = true; });
    const poll = ready().then(() => { pollFinished = true; });
    await Promise.resolve();
    expect(initialize).toHaveBeenCalledTimes(2);
    expect([firstFinished, secondFinished, pollFinished]).toEqual([false, false, false]);
    release();
    await Promise.all([first, second, poll]);
    expect([firstFinished, secondFinished, pollFinished]).toEqual([true, true, true]);
    await ready();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('does not retry a persistent startup failure on its own', async () => {
    const error = new Error('Unavailable'), initialize = vi.fn().mockRejectedValue(error);
    const ready = createInitializationGate(initialize);
    await expect(ready()).rejects.toBe(error);
    await Promise.all(Array.from({ length: 10 }, () => ready().catch(reason => expect(reason).toBe(error))));
    expect(initialize).toHaveBeenCalledOnce();
    await expect(ready(true)).rejects.toBe(error);
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});
