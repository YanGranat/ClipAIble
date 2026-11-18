import { expect, it, vi } from 'vitest';

it('loads foundational processing state without initializing notification dependencies', async () => {
  vi.resetModules();
  const state = await import('../../scripts/state/processing.js');
  expect(state.getProcessingState().isProcessing).toBe(false);
  expect(state.getProcessingSignal(state.getProcessingRunId()).aborted).toBe(false);
});
