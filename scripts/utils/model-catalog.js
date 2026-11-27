// @ts-check

/**
 * @typedef {Object} ModelMetadata
 * @property {string} id
 * @property {string} apiModel
 * @property {string} [displayName]
 * @property {string} provider
 * @property {ReadonlyArray<string>} [inputModalities]
 * @property {ReadonlyArray<string>} [reasoningEfforts]
 * @property {string} [reasoningEffort]
 * @property {boolean} [reasoningEnabled]
 * @property {boolean} [available]
 */

const TEXT_IMAGE = Object.freeze(['text', 'image']);
const OPENAI_REASONING = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const OPENAI_OPTIONAL_REASONING = Object.freeze(['none', ...OPENAI_REASONING]);
const CLAUDE_REASONING = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const GEMINI_REASONING = Object.freeze(['low', 'medium', 'high']);
const GEMINI_EXTENDED_REASONING = Object.freeze([...GEMINI_REASONING, 'xhigh']);
const DEEPSEEK_REASONING = Object.freeze(['low', 'high', 'max']);
const DEEPSEEK_OPTIONAL_REASONING = Object.freeze([...DEEPSEEK_REASONING, 'none']);
const KIMI_REASONING = Object.freeze(['none', 'low', 'high', 'max']);
const OPENROUTER_DEEPSEEK_FLASH = 'deepseek/deepseek-v4.1-flash-1017';
const GPT51_REASONING = Object.freeze(['none', 'low', 'medium', 'high']);
const GPT52_REASONING = Object.freeze(['none', 'low', 'medium', 'high', 'xhigh']);
const ANNOTATION_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

function invalidReasoning() {
  return Object.assign(new Error('Use a supported reasoning setting in the form model-id (reasoning: effort).'), {
    code: 'AI_MODEL_INVALID_REASONING', translationKey: 'errorModelReasoningInvalid', translationParams: {}, retryable: false
  });
}

/** Parse only an explicit trailing annotation; API model names remain opaque. */
export function parseModelSelection(value) {
  if (typeof value !== 'string' || !value.trim()) throw invalidReasoning();
  const annotation = value.match(/^([\s\S]*?\S)\s*\(\s*reasoning\s*:\s*([a-z]+)\s*\)\s*$/i);
  if (!annotation) {
    if (/\(\s*reasoning\s*(?::|\))/i.test(value)) throw invalidReasoning();
    return { apiModel: value, reasoningEffort: null };
  }
  const apiModel = annotation[1].trimEnd();
  const reasoningEffort = annotation[2].toLowerCase();
  if (!apiModel.trim() || /\(\s*reasoning\s*:/i.test(apiModel) || !ANNOTATION_EFFORTS.includes(reasoningEffort)) throw invalidReasoning();
  return { apiModel, reasoningEffort };
}

export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';

/** @returns {ModelMetadata} */
function model(provider, apiModel, options = {}) {
  return Object.freeze({ id: apiModel, apiModel, provider, inputModalities: TEXT_IMAGE, ...options });
}

function openAIModel(apiModel, reasoningEfforts, reasoningEffort) {
  const base = model('openai', apiModel, { reasoningEfforts, ...(reasoningEffort ? { reasoningEffort } : {}) });
  const variants = ['high', 'xhigh', 'low', 'none']
    .filter(effort => reasoningEfforts.includes(effort) && effort !== reasoningEffort);
  return [base, ...variants.map(effort => Object.freeze({
    ...base, id: `${apiModel}-${effort}`, reasoningEffort: effort
  }))];
}

/** @type {Readonly<Record<string, ReadonlyArray<ModelMetadata>>>} */
export const MODEL_CATALOG = Object.freeze({
  openai: Object.freeze([
    ...openAIModel('gpt-6.2-sol', OPENAI_REASONING, 'medium'),
    ...openAIModel('gpt-6.2-astra', OPENAI_REASONING),
    ...openAIModel('gpt-6.1-sol', OPENAI_REASONING, 'medium'),
    ...openAIModel('gpt-6.1-terra', OPENAI_OPTIONAL_REASONING),
    ...openAIModel('gpt-6-luna', OPENAI_OPTIONAL_REASONING),
    ...openAIModel('gpt-6-astra', OPENAI_REASONING)
  ]),
  claude: Object.freeze([
    model('claude', 'claude-sonnet-5-5', { reasoningEfforts: CLAUDE_REASONING }),
    model('claude', 'claude-opus-5-5', { reasoningEfforts: CLAUDE_REASONING }),
    model('claude', 'claude-fable-5-2', { reasoningEffort: 'high', reasoningEfforts: CLAUDE_REASONING }),
    model('claude', 'claude-haiku-5-5', { reasoningEfforts: Object.freeze(['none', ...CLAUDE_REASONING]) })
  ]),
  gemini: Object.freeze([
    model('gemini', 'gemini-4-hydrogen', { reasoningEfforts: GEMINI_EXTENDED_REASONING }),
    model('gemini', 'gemini-4-neon', { reasoningEfforts: GEMINI_EXTENDED_REASONING }),
    model('gemini', 'gemini-4-carbon', { reasoningEfforts: GEMINI_REASONING }),
    model('gemini', 'gemini-4-argon', { reasoningEfforts: GEMINI_REASONING })
  ]),
  grok: Object.freeze([
    model('grok', 'grok-4.7', { reasoningEfforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) })
  ]),
  deepseek: Object.freeze([
    model('deepseek', 'deepseek-flash', { displayName: 'DeepSeek V4.1 Flash', reasoningEnabled: true, reasoningEfforts: DEEPSEEK_OPTIONAL_REASONING })
  ]),
  openrouter: Object.freeze([
    model('openrouter', 'openai/gpt-6.2-sol', { reasoningEffort: 'medium', reasoningEfforts: OPENAI_REASONING }),
    model('openrouter', 'openai/gpt-6.2-astra', { reasoningEfforts: OPENAI_REASONING }),
    model('openrouter', 'openai/gpt-6.1-sol', { reasoningEffort: 'medium', reasoningEfforts: OPENAI_REASONING }),
    model('openrouter', 'openai/gpt-6.1-terra', { id: 'openai/gpt-6.1-terra-none', reasoningEffort: 'none', reasoningEfforts: OPENAI_OPTIONAL_REASONING }),
    model('openrouter', 'openai/gpt-6-luna', { reasoningEfforts: OPENAI_OPTIONAL_REASONING }),
    model('openrouter', 'google/gemini-4-hydrogen', { reasoningEfforts: GEMINI_EXTENDED_REASONING }),
    model('openrouter', 'google/gemini-4-neon', { reasoningEfforts: GEMINI_EXTENDED_REASONING }),
    model('openrouter', 'google/gemini-4-carbon', { reasoningEfforts: GEMINI_REASONING }),
    model('openrouter', 'anthropic/claude-sonnet-5.5', { reasoningEfforts: CLAUDE_REASONING }),
    model('openrouter', 'anthropic/claude-fable-5.2', { reasoningEffort: 'high', reasoningEfforts: CLAUDE_REASONING }),
    model('openrouter', 'x-ai/grok-4.7', { reasoningEfforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
    model('openrouter', OPENROUTER_DEEPSEEK_FLASH, { reasoningEfforts: DEEPSEEK_OPTIONAL_REASONING }),
    model('openrouter', 'moonshotai/kimi-k3.1-pro', {
      inputModalities: Object.freeze(['text', 'image', 'video']), reasoningEfforts: KIMI_REASONING
    }),
    model('openrouter', 'qwen/qwen3.8-flash', { id: 'qwen/qwen3.8-flash-no-thinking', reasoningEnabled: false }),
    model('openrouter', 'qwen/qwen4-max', { reasoningEfforts: Object.freeze(['none', 'low', 'high', 'xhigh']) })
  ])
});

const REPLACED_MODELS = Object.freeze({
  openai: Object.freeze({
    'gpt-5.2': 'gpt-6.2-sol', 'gpt-5.2-high': 'gpt-6.2-sol-high',
    'gpt-5.1': 'gpt-6.1-terra-none', 'gpt-5.1-high': 'gpt-6.2-sol-high'
  }),
  claude: Object.freeze({
    'claude-sonnet-4-5': 'claude-sonnet-5-5', 'claude-sonnet-4-5-20250929': 'claude-sonnet-5-5',
    'claude-opus-4-5': 'claude-opus-5-5', 'claude-opus-4-5-20251101': 'claude-opus-5-5',
    'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-haiku-4-5-20251001': 'claude-haiku-5-5'
  }),
  gemini: Object.freeze({ 'gemini-3-pro-preview': 'gemini-4-carbon', 'gemini-3-flash-preview': 'gemini-4-hydrogen' }),
  deepseek: Object.freeze({ 'deepseek-reasoner': 'deepseek-flash' }),
  openrouter: Object.freeze({
    'openai/gpt-5.2': 'openai/gpt-6.1-sol',
    'openai/gpt-5.1': 'openai/gpt-6.1-terra-none',
    'google/gemini-3-pro-preview': 'google/gemini-4-carbon',
    'google/gemini-3-flash-preview': 'google/gemini-4-hydrogen',
    'anthropic/claude-sonnet-4.5': 'anthropic/claude-sonnet-5.5',
    'deepseek/deepseek-v4.1-flash': OPENROUTER_DEEPSEEK_FLASH,
    'qwen/qwen3-235b-a22b-2507': 'qwen/qwen3.8-flash-no-thinking'
  })
});

// Old selections can fall back to a different preset without hiding that preset.
const REMOVED_PRESETS = Object.freeze({
  grok: Object.freeze({
    'grok-4': 'grok-4.7',
    'grok-4-1-fast-reasoning': 'grok-4.7',
    'grok-4.3': 'grok-4.7'
  }),
  deepseek: Object.freeze({
    'deepseek-chat': 'deepseek-flash',
    'deepseek-flash-no-thinking': 'deepseek-flash',
    'deepseek-v4-pro': 'deepseek-flash'
  }),
  openrouter: Object.freeze({
    'x-ai/grok-4.3': 'x-ai/grok-4.7',
    'deepseek/deepseek-v3.2': OPENROUTER_DEEPSEEK_FLASH,
    'deepseek/deepseek-v4.1-flash-no-thinking': OPENROUTER_DEEPSEEK_FLASH,
    'deepseek/deepseek-v4-pro': OPENROUTER_DEEPSEEK_FLASH,
    'deepseek/deepseek-v4-pro-0813': OPENROUTER_DEEPSEEK_FLASH
  })
});

const LEGACY_MODELS = Object.freeze({
  grok: Object.freeze([
    model('grok', 'grok-4.3', { reasoningEfforts: Object.freeze(['none', 'low', 'medium', 'high']) })
  ]),
  deepseek: Object.freeze([
    model('deepseek', 'deepseek-flash', { id: 'deepseek-flash-no-thinking', displayName: 'DeepSeek V4.1 Flash', reasoningEnabled: false, reasoningEfforts: DEEPSEEK_OPTIONAL_REASONING }),
    model('deepseek', 'deepseek-v4-pro', { displayName: 'DeepSeek V4 Pro', inputModalities: Object.freeze(['text']), reasoningEnabled: true, reasoningEfforts: DEEPSEEK_REASONING })
  ]),
  openai: Object.freeze([
    model('openai', 'gpt-5.2', { reasoningEffort: 'medium', reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.2', { id: 'gpt-5.2-high', reasoningEffort: 'high', reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.2-2025-12-11', { reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.1', { reasoningEfforts: GPT51_REASONING }),
    model('openai', 'gpt-5.1', { id: 'gpt-5.1-high', reasoningEffort: 'high', reasoningEfforts: GPT51_REASONING }),
    model('openai', 'gpt-5.1-2025-11-13', { reasoningEfforts: GPT51_REASONING })
  ]),
  openrouter: Object.freeze([
    model('openrouter', 'deepseek/deepseek-v4.1-flash', { reasoningEfforts: DEEPSEEK_OPTIONAL_REASONING }),
    model('openrouter', 'deepseek/deepseek-v4.1-flash', { id: 'deepseek/deepseek-v4.1-flash-no-thinking', reasoningEnabled: false, reasoningEfforts: DEEPSEEK_OPTIONAL_REASONING }),
    model('openrouter', 'deepseek/deepseek-v4-pro', { inputModalities: Object.freeze(['text']) }),
    model('openrouter', 'deepseek/deepseek-v4-pro-0813', { inputModalities: Object.freeze(['text']) }),
    model('openrouter', 'qwen/qwen3-235b-a22b-2507', { inputModalities: Object.freeze(['text']) }),
    model('openrouter', 'deepseek/deepseek-v3.2', { inputModalities: Object.freeze(['text']) }),
    model('openrouter', 'mistralai/devstral-2512:free', { available: false, inputModalities: Object.freeze(['text']) })
  ])
});

/** @returns {ReadonlyArray<ModelMetadata>} */
export function getModelCatalog(provider) {
  return Object.hasOwn(MODEL_CATALOG, provider) ? MODEL_CATALOG[provider] : [];
}

/** @returns {string} */
export function getDefaultModel(provider = 'openai') {
  return getModelCatalog(provider)[0]?.id || MODEL_CATALOG.openai[0].id;
}

/** Infer a provider only when no explicit provider was saved. */
export function getModelProvider(id) {
  if (typeof id !== 'string' || !id) return 'openai';
  if (id.includes('/')) return 'openrouter';
  if (id.startsWith('gpt-')) return 'openai';
  if (id.startsWith('claude-')) return 'claude';
  if (id.startsWith('gemini-')) return 'gemini';
  if (id.startsWith('grok-')) return 'grok';
  if (id.startsWith('deepseek-')) return 'deepseek';
  return 'openai';
}

/** Resolve both popup and background settings without changing custom IDs. */
export function resolveStoredModelSelection(settings) {
  const globalModel = typeof settings.openai_model === 'string' ? settings.openai_model : '';
  const savedProvider = settings.api_provider;
  const provider = savedProvider === undefined || savedProvider === null || savedProvider === ''
    ? getModelProvider(globalModel) : savedProvider;
  if (typeof provider !== 'string' || !Object.hasOwn(MODEL_CATALOG, provider)) throw new Error('Unsupported AI provider');
  const byProvider = settings.model_by_provider;
  const providerModel = byProvider && typeof byProvider === 'object' && !Array.isArray(byProvider)
    ? byProvider[provider] : null;
  const id = typeof providerModel === 'string' && providerModel ? providerModel : globalModel || getDefaultModel(provider);
  const custom = settings.custom_models;
  const customIds = custom && typeof custom === 'object' && Array.isArray(custom[provider]) ? custom[provider] : [];
  return { provider, model: resolveSavedModel(provider, id, customIds) };
}

function modelAlias(table, provider, id) {
  const aliases = Object.hasOwn(table, provider) ? table[provider] : null;
  return aliases && Object.hasOwn(aliases, id) ? aliases[id] : null;
}

/** Preserve explicit custom IDs and migrate saved presets before displaying or using them. */
export function resolveSavedModel(provider, id, customIds = []) {
  if (typeof id !== 'string' || !id) return getDefaultModel(provider);
  if (customIds.includes(id)) return id;
  return modelAlias(REPLACED_MODELS, provider, id) || modelAlias(REMOVED_PRESETS, provider, id) || id;
}

/** Carry a hide preference to a refreshed preset, not an unrelated fallback. */
export function resolveHiddenModel(provider, id, customIds = []) {
  return customIds.includes(id) ? id : modelAlias(REPLACED_MODELS, provider, id) || id;
}

function getLegacyModels(provider) {
  return Object.hasOwn(LEGACY_MODELS, provider) ? LEGACY_MODELS[provider] : [];
}

function getExactModelMetadata(provider, id) {
  return getModelCatalog(provider).find(item => item.id === id) ||
    getLegacyModels(provider).find(item => item.id === id) || null;
}

function effortOf(metadata) {
  return metadata.reasoningEnabled === false ? 'none' : metadata.reasoningEffort || null;
}

function baseLabel(metadata, translate) {
  const label = metadata.displayName || metadata.apiModel;
  return metadata.inputModalities && !metadata.inputModalities.includes('image')
    ? translate ? translate('modelTextOnly', { model: label }) : `${label} (text only)` : label;
}

function metadataLabel(metadata, translate) {
  const effort = effortOf(metadata);
  return `${baseLabel(metadata, translate)}${effort ? ` (reasoning: ${effort})` : ''}`;
}

function annotationMetadata(provider, id) {
  const exact = getExactModelMetadata(provider, id);
  if (exact) return exact;
  const entries = getModelCatalog(provider);
  const displayed = entries.find(entry => metadataLabel(entry) === id);
  if (displayed) return displayed;
  const { apiModel, reasoningEffort } = parseModelSelection(id);
  if (!reasoningEffort) return null;
  const known = getExactModelMetadata(provider, apiModel) || entries.find(entry =>
    baseLabel(entry) === apiModel || entry.displayName === apiModel);
  const providerEfforts = provider === 'deepseek' ? ['none', ...DEEPSEEK_REASONING]
    : provider === 'claude' ? ['none', ...CLAUDE_REASONING]
      : provider === 'gemini' ? ['none', 'minimal', ...GEMINI_REASONING, 'xhigh']
        : provider === 'grok' ? ['none', 'low', 'medium', 'high', 'xhigh'] : ANNOTATION_EFFORTS;
  if (!providerEfforts.includes(reasoningEffort)) throw invalidReasoning();
  if (known?.reasoningEfforts && !known.reasoningEfforts.includes(reasoningEffort)) {
    const disabledVariant = reasoningEffort === 'none' && entries.some(entry =>
      entry.apiModel === known.apiModel && entry.reasoningEnabled === false);
    if (!disabledVariant) throw invalidReasoning();
  }
  return Object.freeze({ ...(known || { provider }), id, apiModel: known?.apiModel || apiModel, reasoningEffort,
    ...((provider === 'deepseek' || known?.reasoningEnabled !== undefined) ? { reasoningEnabled: reasoningEffort !== 'none' } : {}) });
}

/** Display lookups tolerate saved invalid entries; request boundaries opt into validation. */
export function getModelMetadata(provider, id, { strict = false } = {}) {
  try { return annotationMetadata(provider, id); }
  catch (error) { if (strict) throw error; return null; }
}

/** Resolve equivalent preset labels without changing an opaque custom API ID. */
export function normalizeModelSelection(provider, value, translate) {
  const selected = typeof value === 'string' ? value.trim() : value;
  const displayed = getModelCatalog(provider).find(entry => metadataLabel(entry, translate) === selected);
  if (displayed) return displayed.id;
  const parsed = parseModelSelection(selected);
  const displayedBase = parsed.reasoningEffort && [...getModelCatalog(provider), ...getLegacyModels(provider)]
    .find(entry => baseLabel(entry, translate) === parsed.apiModel);
  const lookup = displayedBase ? `${displayedBase.apiModel} (reasoning: ${parsed.reasoningEffort})` : selected;
  const metadata = getModelMetadata(provider, lookup, { strict: true });
  if (!metadata) return selected;
  const equivalent = getModelCatalog(provider).find(entry => entry.apiModel === metadata.apiModel &&
    effortOf(entry) === effortOf(metadata) &&
    (entry.reasoningEnabled ?? (effortOf(entry) ? effortOf(entry) !== 'none' : undefined)) ===
    (metadata.reasoningEnabled ?? (effortOf(metadata) ? effortOf(metadata) !== 'none' : undefined)));
  if (equivalent) return equivalent.id;
  return parsed.reasoningEffort ? `${metadata.apiModel} (reasoning: ${parsed.reasoningEffort})` : selected;
}

/** Reasoning annotations always use provider syntax, independently of UI language. */
export function formatModelLabel(provider, id, translate) {
  const metadata = getModelMetadata(provider, id);
  return metadata ? metadataLabel(metadata, translate) : id || '';
}
