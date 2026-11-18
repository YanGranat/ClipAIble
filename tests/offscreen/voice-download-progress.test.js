import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { log } from '../../scripts/utils/logging.js';
import { ensureVoiceDownloaded } from '../../scripts/offscreen/tts/voice-download.js';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('uses loaded and total bytes from the worker progress callback', async () => {
  vi.useFakeTimers();
  const voiceId = 'en_US-example-medium';
  const download = vi.fn(async (_voice, progress) => {
    progress(0, 0);
    progress(25, 100);
    progress(29, 100);
    progress(95, 100);
    progress(100, 100);
  });
  const pending = ensureVoiceDownloaded({
    voiceId, langCode: 'en', messageId: 'download-request',
    getStoredWithWorker: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([voiceId]),
    downloadWithWorker: download,
    removeWithWorker: vi.fn(),
    predictWithWorker: vi.fn(async () => new Blob(['audio'])),
    initTTSWorker: vi.fn(),
    state: { getTTSWorker: () => ({}), shouldUseWorker: () => true }
  });
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toBe(voiceId);
  expect(download).toHaveBeenCalledOnce();
  const progress = log.mock.calls.filter(([message]) => message.endsWith('Download progress')).map(([, data]) => data.percent);
  expect(progress).toEqual([25, 95, 100]);
});
