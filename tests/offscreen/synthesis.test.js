import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('../../scripts/offscreen/audio/wav-utils.js', () => ({
  concatenateWavBuffers: buffers => new TextEncoder().encode(buffers.length.toString()).buffer
}));

import { synthesizeText } from '../../scripts/offscreen/tts/synthesis.js';

describe('Piper synthesis', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function params(text, predictWithWorker) {
    return {
      text, predictWithWorker, voiceId: 'en_US-lessac-medium', langCode: 'en', messageId: 'request',
      state: { getTTSWorker: () => ({}), getLastUsedVoiceId: () => null, getProcessingRunId: () => 'current' }
    };
  }

  it.each(['x'.repeat(2200), '\u6F22'.repeat(2200), 'A full sentence. '.repeat(140) + 'Last words']) (
    'synthesizes every chunk of long text', async text => {
      const predict = vi.fn(async () => new Blob([new Uint8Array([1])]));
      vi.stubGlobal('performance', {});
      await expect(synthesizeText(params(text, predict))).resolves.toBeInstanceOf(Blob);
      expect(predict).toHaveBeenCalled();
      expect(predict.mock.calls.map(([chunk]) => chunk).join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
      expect(predict.mock.calls.every(([chunk]) => chunk.length <= 200)).toBe(true);
    }
  );

  it('keeps short text in a single request', async () => {
    const predict = vi.fn(async () => new Blob([new Uint8Array([1])]));
    vi.stubGlobal('performance', {});
    await synthesizeText(params('A short sentence. Last words', predict));
    expect(predict).toHaveBeenCalledOnce();
    expect(predict).toHaveBeenCalledWith('A short sentence. Last words', 'en_US-lessac-medium', 1);
  });

  it('rejects memory exhaustion instead of returning incomplete audio', async () => {
    let exhausted = false;
    vi.stubGlobal('performance', {
      get memory() { return { usedJSHeapSize: exhausted ? 95 : 10, jsHeapSizeLimit: 100 }; }
    });
    const predict = vi.fn(async () => { exhausted = true; return new Blob([new Uint8Array([1])]); });
    await expect(synthesizeText(params('A sentence. '.repeat(190), predict)))
      .rejects.toThrow('Insufficient memory to finish audio synthesis');
    expect(predict).toHaveBeenCalledOnce();
  });

  it('tags streaming progress with the processing owner', async () => {
    const sendMessage = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    vi.stubGlobal('performance', {});
    await synthesizeText({
      ...params('A sentence. '.repeat(190), async () => new Blob(['audio'])),
      processingRunId: 'current'
    });
    expect(sendMessage).toHaveBeenCalled();
    expect(sendMessage.mock.calls.every(([message]) => message.action === 'TTS_PROGRESS' && message.data.processingRunId === 'current')).toBe(true);
  });

  it('stops streaming before another sentence when its owner changes', async () => {
    let owner = 'current';
    const predict = vi.fn(async () => { owner = 'replacement'; return new Blob(['audio']); });
    vi.stubGlobal('performance', {});
    const options = params('A sentence. '.repeat(190), predict);
    options.processingRunId = 'current';
    options.state.getProcessingRunId = () => owner;
    await expect(synthesizeText(options)).rejects.toThrow('TTS processing cancelled');
    expect(predict).toHaveBeenCalledOnce();
  });

  it('uses the actual fallback voice instead of the previous tracked voice', async () => {
    vi.stubGlobal('performance', {});
    const predict = vi.fn().mockRejectedValueOnce(new Error('indices element out of data bounds')).mockResolvedValue(new Blob(['audio']));
    const options = params('Sample sentence.', predict);
    options.state.getLastUsedVoiceId = () => 'en_US-lessac-medium';
    options.state.setLastUsedVoiceId = vi.fn();
    options.getStoredWithWorker = vi.fn(async () => ['en_US-hfc_female-medium']);
    await synthesizeText({ ...options, speed: 1.4 });
    expect(predict.mock.calls.map(([, voice]) => voice)).toEqual(['en_US-lessac-medium', 'en_US-hfc_female-medium']);
    expect(predict.mock.calls.every(([, , speed]) => speed === 1.4)).toBe(true);
    expect(options.state.setLastUsedVoiceId).toHaveBeenCalledWith('en_US-hfc_female-medium');
  });
});
