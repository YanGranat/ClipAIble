// @ts-check
import { createGenerationTask } from './generation-task.js';
import { generateKeyTheses } from '../translation/index.js';
import { CONFIG } from '../utils/config.js';

const task = createGenerationTask({
  prefix: 'key_theses', label: 'Key theses', generate: generateKeyTheses,
  timeoutMs: CONFIG.KEY_THESES_TIMEOUT_MS,
  notificationKey: 'notificationKeyThesesReady',
  resultUpdates: (result, data) => ({ key_theses_text: result.keyTheses, key_theses_article_title: data.title ?? null })
});

export const startKeyThesesGeneration = task.start;
export const requestCancelKeyThesesGeneration = task.cancel;
export const isKeyThesesGenerationActive = task.isActive;
