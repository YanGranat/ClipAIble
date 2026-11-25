import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handleProcessingError } from '../../scripts/utils/processing/pipeline-helpers.js';
import { getProcessingState, resetState, startProcessing } from '../../scripts/state/processing.js';
import { createPdfSelectionCancelledError, localizePdfError } from '../../scripts/utils/pdf-errors.js';
import { handleError } from '../../scripts/utils/error-handler.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('../../scripts/utils/error-handler.js', async original => ({ ...await original(),
  handleError: vi.fn(async error => ({ message: error.message, userMessage: error.message, code: 'validation_error' })) }));
vi.mock('../../scripts/background/popup-connection.js', () => ({ isPopupOpen: () => true }));
beforeEach(async () => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  await resetState();
});
afterEach(async () => { await resetState(); });
async function start() {
  expect(await startProcessing(vi.fn())).toBe(true);
  return getProcessingState().processingRunId;
}

it('shows cancellation without an error after the owned PDF chooser is dismissed', async () => {
  const runId = await start();
  await handleProcessingError(await localizePdfError(createPdfSelectionCancelledError()),
    { processingRunId: runId }, vi.fn());
  expect(getProcessingState()).toMatchObject({ isProcessing: false, isCancelled: true, error: null });
  expect(handleError).not.toHaveBeenCalled();
});

it('keeps genuine PDF acquisition failures visible', async () => {
  const runId = await start();
  await handleProcessingError(new Error('PDF file selection unavailable'), { processingRunId: runId }, vi.fn());
  expect(getProcessingState()).toMatchObject({ isProcessing: false, isCancelled: false, error: 'PDF file selection unavailable' });
  expect(handleError).toHaveBeenCalledOnce();
});

it('does not infer cancellation from a diagnostic message alone', async () => {
  const runId = await start();
  await handleProcessingError(new Error('PDF file selection cancelled'), { processingRunId: runId }, vi.fn());
  expect(getProcessingState().error).toBe('PDF file selection cancelled');
  expect(handleError).toHaveBeenCalledOnce();
});

it('does not cancel a replacement operation for an obsolete chooser', async () => {
  const oldRunId = await start();
  await resetState();
  const currentRunId = await start();
  await handleProcessingError(createPdfSelectionCancelledError(), { processingRunId: oldRunId }, vi.fn());
  expect(getProcessingState()).toMatchObject({ isProcessing: true, processingRunId: currentRunId, error: null });
});

it('does not apply an unowned chooser cancellation to another operation', async () => {
  const currentRunId = await start();
  await handleProcessingError(createPdfSelectionCancelledError(), {}, vi.fn());
  expect(getProcessingState()).toMatchObject({ isProcessing: true, processingRunId: currentRunId, error: null });
});
