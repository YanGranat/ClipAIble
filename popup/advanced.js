// @ts-check
import { PROMPTS, PROMPT_IDS, PROMPT_STORAGE_KEYS, PROMPT_STORAGE_PREFIX, readPromptOverrides, validatePrompt, withPromptStorageLock } from '../scripts/settings/prompt-catalog.js';
import { getUILanguage, getLocaleTag, tSync } from '../scripts/locales.js';
import { getPromptDisplayName } from '../scripts/settings/advanced-locales.js';

/** @typedef {import('../scripts/settings/prompt-catalog.js').PromptId} PromptId */
const node = (id) => document.getElementById(id);
const menu = node('prompt-menu');
const select = /** @type {HTMLSelectElement} */ (node('prompt-select'));
const form = /** @type {HTMLFormElement} */ (node('prompt-form'));
const input = /** @type {HTMLTextAreaElement} */ (node('prompt-input'));
const save = /** @type {HTMLButtonElement} */ (node('save-prompt'));
const discard = /** @type {HTMLButtonElement} */ (node('discard-prompt'));
const restore = /** @type {HTMLButtonElement} */ (node('restore-prompt'));
const status = node('prompt-status');
const badge = node('prompt-badge');
const viewDefault = /** @type {HTMLDetailsElement} */ (node('default-prompt'));
const defaultText = node('default-text');
const themeQuery = matchMedia('(prefers-color-scheme: dark)');
const groupNames = {
  extract: 'promptGroupExtract', pdf: 'promptGroupPdf', write: 'promptGroupWrite',
  translate: 'promptGroupTranslate', speech: 'promptGroupSpeech'
};
/** @type {Map<PromptId, {value: string, base: string}>} */
const drafts = new Map();
/** @type {Map<PromptId, HTMLButtonElement>} */
const rows = new Map();
/** @type {import('../scripts/settings/prompt-catalog.js').PromptOverrides} */
let saved = {};
/** @type {PromptId} */
let selected = 'selector';
let language = 'en';
/** @type {unknown} */
let theme = 'auto';
let ready = false;
/** @type {PromptId|null} */
let savingPromptId = null;
let initialized = false;
const label = (key, args) => tSync(key, language, args);
const promptName = (id) => getPromptDisplayName(id, language, PROMPTS[id].label);
const current = (id) => saved[id] ?? PROMPTS[id].template;
const keyFor = (id) => PROMPT_STORAGE_PREFIX + id;

function feedback(key, state = '', params = {}) {
  status.textContent = key ? label(key, params) : '';
  status.dataset.state = state;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : (themeQuery.matches ? 'dark' : 'light');
}

function updateActions(clearFeedback = true) {
  const draft = drafts.get(selected);
  const invalid = draft && validatePrompt(selected, draft.value);
  const conflict = draft && draft.base !== current(selected);
  const saving = savingPromptId !== null;
  input.setAttribute('aria-invalid', String(Boolean(invalid || conflict)));
  save.disabled = !ready || saving || !draft || Boolean(invalid || conflict);
  discard.disabled = !draft || saving;
  restore.disabled = !ready || saving || input.value === PROMPTS[selected].template;
  input.readOnly = saving;
  for (const [id, row] of rows) {
    const name = promptName(id);
    const hasDraft = drafts.has(id);
    row.setAttribute('aria-current', String(id === selected));
    row.toggleAttribute('data-draft', hasDraft);
    if (hasDraft) row.setAttribute('aria-label', name + '. ' + label('promptUnsaved'));
    else row.removeAttribute('aria-label');
  }
  if (conflict) {
    feedback('promptChangedElsewhere', 'error');
  } else if (invalid) {
    feedback(invalid.key, 'error', invalid.params);
  } else if (clearFeedback) {
    feedback(draft ? 'promptUnsaved' : '');
  }
}

function render(id, clearFeedback = true) {
  if (id !== selected) node('prompt-content').scrollTop = 0;
  selected = id;
  const prompt = PROMPTS[id];
  select.value = id;
  const value = drafts.get(id)?.value ?? current(id);
  if (input.value !== value) {
    input.value = value;
    input.scrollTop = 0;
  }
  // Give browsers without CSS field-sizing a size based on the template.
  input.rows = Math.max(5, Math.min(16, Math.ceil(prompt.template.length / 100)));
  node('prompt-name').textContent = promptName(id);
  node('prompt-category').textContent = label(groupNames[prompt.group]);
  const note = node('prompt-specific-note');
  const noteKey = { selector: 'promptSelectorCacheHint', audioPreparation: 'promptNarrationPreparationHint' }[id];
  note.textContent = noteKey ? label(noteKey) : '';
  note.hidden = !noteKey;
  const custom = saved[id] !== undefined;
  badge.textContent = label(custom ? 'promptCustom' : 'promptDefault');
  badge.toggleAttribute('data-custom', custom);
  viewDefault.hidden = !custom;
  viewDefault.open = false;
  defaultText.textContent = custom ? prompt.template : '';

  const tokens = prompt.variables.map(variable => {
    const token = document.createElement('code');
    token.textContent = '{{' + variable + '}}';
    return token;
  });
  node('variable-list').replaceChildren(...tokens);
  node('prompt-variables').hidden = tokens.length === 0;
  input.setAttribute('aria-describedby', [
    noteKey ? 'prompt-specific-note' : '',
    tokens.length ? 'prompt-variables' : '',
    'prompt-status'
  ].filter(Boolean).join(' '));
  updateActions(clearFeedback);
}

function buildMenu() {
  menu.replaceChildren();
  select.replaceChildren();
  rows.clear();
  for (const [group, localeKey] of Object.entries(groupNames)) {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = label(localeKey);
    section.append(heading);
    const optionGroup = document.createElement('optgroup');
    optionGroup.label = heading.textContent;
    for (const id of PROMPT_IDS.filter(id => PROMPTS[id].group === group)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.promptId = id;
      row.textContent = promptName(id);
      row.addEventListener('click', () => render(id));
      rows.set(id, row);
      section.append(row);
      optionGroup.append(new Option(promptName(id), id));
    }
    menu.append(section);
    select.append(optionGroup);
  }
}

function edit(value) {
  if (!ready || savingPromptId !== null) return;
  const base = drafts.get(selected)?.base ?? current(selected);
  if (value === current(selected)) drafts.delete(selected);
  else drafts.set(selected, { value, base });
  updateActions();
}

input.addEventListener('input', () => edit(input.value));
restore.addEventListener('click', () => {
  input.value = PROMPTS[selected].template;
  edit(input.value);
  input.focus();
});
discard.addEventListener('click', () => {
  drafts.delete(selected);
  render(selected);
  input.focus();
});
select.addEventListener('change', () => {
  if (Object.hasOwn(PROMPTS, select.value)) render(/** @type {PromptId} */ (select.value));
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (save.disabled || savingPromptId !== null) return;
  const id = selected;
  const draft = drafts.get(id);
  const key = keyFor(id);
  savingPromptId = id;
  updateActions();
  try {
    await withPromptStorageLock(async () => {
      const latest = readPromptOverrides(await chrome.storage.local.get([key]))[id];
      if ((latest ?? PROMPTS[id].template) !== draft.base) {
        if (latest === undefined) delete saved[id];
        else saved[id] = latest;
        if (selected === id) render(id);
        return;
      }
      if (draft.value === PROMPTS[id].template) {
        await chrome.storage.local.remove(key);
        delete saved[id];
      } else {
        await chrome.storage.local.set({ [key]: draft.value });
        saved[id] = draft.value;
      }
      drafts.delete(id);
      if (selected === id) {
        render(id, false);
        feedback('promptSaved', 'saved');
      }
    });
  } catch {
    if (selected === id) feedback('promptSaveFailed', 'error');
  } finally {
    savingPromptId = null;
    updateActions(false);
  }
});
window.addEventListener('beforeunload', event => {
  if (drafts.size) {
    event.preventDefault();
    event.returnValue = true;
  }
});
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!save.disabled) form.requestSubmit();
  }
});

async function localize() {
  language = await getUILanguage();
  document.documentElement.lang = getLocaleTag(language);
  document.title = 'ClipAIble — ' + label('advancedSettings');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = label(el.getAttribute('data-i18n'));
  }
  buildMenu();
  render(selected);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.popup_theme) {
    theme = changes.popup_theme.newValue;
    applyTheme();
  }
  if (!initialized) return;
  let affected = false;
  for (const id of PROMPT_IDS) {
    const key = keyFor(id);
    if (!Object.hasOwn(changes, key)) continue;
    const override = readPromptOverrides({ [key]: changes[key].newValue })[id];
    const previous = saved[id];
    if (override === undefined) delete saved[id];
    else saved[id] = override;
    affected ||= id === selected && previous !== override;
  }
  if (changes.ui_language) void localize();
  else if (affected && selected !== savingPromptId) render(selected);
});
themeQuery.addEventListener('change', applyTheme);
applyTheme();

async function init() {
  await localize();
  try {
    const snapshot = await chrome.storage.local.get([...PROMPT_STORAGE_KEYS, 'popup_theme']);
    theme = snapshot.popup_theme ?? 'auto';
    applyTheme();
    saved = readPromptOverrides(snapshot);
    initialized = ready = true;
    select.disabled = input.disabled = false;
    render(selected);
  } catch {
    feedback('promptLoadFailed', 'error');
  }
}

void init();
