// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROMPTS } from '../../scripts/settings/prompt-catalog.js';

let stored, notifications, textarea, save, restore, discard, status;
const click = id => document.getElementById(id).click();
const pick = id => document.querySelector('button[data-prompt-id="' + id + '"]').click();
const type = value => { textarea.value = value; textarea.dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  document.open();
  document.write(readFileSync('popup/advanced.html', 'utf8'));
  document.close();
  notifications = [];
  stored = { ui_language: 'en', popup_theme: 'light' };
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(keys.filter(key => key in stored).map(key => [key, stored[key]])));
  chrome.storage.local.set.mockImplementation(async values => Object.assign(stored, values));
  chrome.storage.local.remove.mockImplementation(async key => { delete stored[key]; });
  chrome.storage.onChanged.addListener.mockImplementation(listener => notifications.push(listener));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn() })));
  await import('../../popup/advanced.js');
  textarea = document.getElementById('prompt-input');
  save = document.getElementById('save-prompt');
  restore = document.getElementById('restore-prompt');
  discard = document.getElementById('discard-prompt');
  status = document.getElementById('prompt-status');
  await vi.waitFor(() => expect(textarea.disabled).toBe(false));
});

afterEach(() => vi.unstubAllGlobals());

it('keeps per-prompt drafts while browsing and saves or resets only the selected prompt', async () => {
  expect(document.compatMode).toBe('CSS1Compat');
  expect(textarea.value).toBe(PROMPTS.selector.template);
  expect(save.disabled).toBe(true);
  type('Select the smallest publication root.');
  pick('summary');
  expect(textarea.value).toBe(PROMPTS.summary.template);
  type('Keep {{targetLanguage}} and summarize in one paragraph.');
  pick('selector');
  expect(textarea.value).toBe('Select the smallest publication root.');
  save.click();
  await vi.waitFor(() => expect(stored.prompt_override_selector).toBe('Select the smallest publication root.'));
  expect(stored).not.toHaveProperty('prompt_override_summary');
  expect(document.getElementById('default-text').textContent).toBe(PROMPTS.selector.template);
  restore.click();
  expect(textarea.value).toBe(PROMPTS.selector.template);
  expect(stored).toHaveProperty('prompt_override_selector');
  save.click();
  await vi.waitFor(() => expect(stored).not.toHaveProperty('prompt_override_selector'));
  pick('summary');
  expect(textarea.value).toBe('Keep {{targetLanguage}} and summarize in one paragraph.');
});

it('rejects missing variables and renders pasted markup as editable text only', () => {
  pick('summary');
  type('<mark>Write a summary.</mark>');
  expect(document.querySelector('mark')).toBeNull();
  expect(save.disabled).toBe(true);
  expect(textarea.getAttribute('aria-invalid')).toBe('true');
  expect(status.textContent).toContain('{{targetLanguage}}');
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  discard.click();
  expect(textarea.value).toBe(PROMPTS.summary.template);
  expect(textarea.getAttribute('aria-invalid')).toBe('false');
});

it('does not replace or silently overwrite a draft after the saved prompt changes elsewhere', () => {
  type('Draft selector instruction.');
  stored.prompt_override_selector = 'Another saved instruction.';
  notifications[0]({ prompt_override_selector: { newValue: stored.prompt_override_selector } }, 'local');
  expect(textarea.value).toBe('Draft selector instruction.');
  expect(status.textContent).toContain('another tab');
  expect(save.disabled).toBe(true);
  discard.click();
  expect(textarea.value).toBe('Another saved instruction.');
  expect(document.getElementById('prompt-badge').textContent).toBe('Custom');
});
