// @ts-check
import { createGenerationTask } from './generation-task.js';
import { generateSummary } from '../translation/index.js';
import { CONFIG } from '../utils/config.js';

const task = createGenerationTask({
  prefix: 'summary', label: 'Summary', generate: generateSummary,
  timeoutMs: CONFIG.SUMMARY_TIMEOUT_MS, progressIntervalMs: 30000,
  notificationKey: 'notificationSummaryReady',
  resultUpdates: (result) => ({ summary_text: result.summary })
});

export const startSummaryGeneration = task.start;
export const isSummaryGenerationActive = task.isActive;
