// @ts-check

/**
 * @typedef {Object} ModelMetadata
 * @property {string} id
 * @property {string} apiModel
 * @property {string} [displayName]
 * @property {string} provider
 * @property {ReadonlyArray<string>} inputModalities
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
const DEEPSEEK_REASONING = Object.freeze(['low', 'high', 'max']);
const GPT51_REASONING = Object.freeze(['none', 'low', 'medium', 'high']);
const GPT52_REASONING = Object.freeze(['none', 'low', 'medium', 'high', 'xhigh']);

export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';

/** @returns {ModelMetadata} */
function model(provider, apiModel, options = {}) {
  return Object.freeze({ id: apiModel, apiModel, provider, inputModalities: TEXT_IMAGE, ...options });
}

function openAIModel(apiModel, reasoningEfforts, reasoningEffort) {
  const base = model('openai', apiModel, { reasoningEfforts, ...(reasoningEffort ? { reasoningEffort } : {}) });
  const variants = ['high', 'low', ...(reasoningEfforts.includes('none') ? ['none'] : [])];
  return [base, ...variants.map(effort => Object.freeze({
    ...base, id: `${apiModel}-${effort}`, reasoningEffort: effort
  }))];
}

/** @type {Readonly<Record<string, ReadonlyArray<ModelMetadata>>>} */
export const MODEL_CATALOG = Object.freeze({
  openai: Object.freeze([
    ...openAIModel('gpt-6.1-sol', OPENAI_REASONING, 'medium'),
    ...openAIModel('gpt-6.1-terra', OPENAI_OPTIONAL_REASONING),
    ...openAIModel('gpt-6-luna', OPENAI_OPTIONAL_REASONING),
    ...openAIModel('gpt-6-astra', OPENAI_REASONING)
  ]),
  claude: Object.freeze([
    model('claude', 'claude-sonnet-5-5', { reasoningEfforts: CLAUDE_REASONING }),
    model('claude', 'claude-opus-5-5', { reasoningEfforts: CLAUDE_REASONING }),
    model('claude', 'claude-haiku-5-5', { reasoningEfforts: CLAUDE_REASONING })
  ]),
  gemini: Object.freeze([
    model('gemini', 'gemini-4-hydrogen', { reasoningEfforts: Object.freeze([...GEMINI_REASONING, 'xhigh']) }),
    model('gemini', 'gemini-4-carbon', { reasoningEfforts: GEMINI_REASONING }),
    model('gemini', 'gemini-4-argon', { reasoningEfforts: GEMINI_REASONING })
  ]),
  grok: Object.freeze([
    model('grok', 'grok-4.7', { reasoningEfforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
    model('grok', 'grok-4.3', { reasoningEfforts: Object.freeze(['none', 'low', 'medium', 'high']) })
  ]),
  deepseek: Object.freeze([
    model('deepseek', 'deepseek-flash', { displayName: 'DeepSeek V4.1 Flash', reasoningEnabled: true, reasoningEfforts: DEEPSEEK_REASONING }),
    model('deepseek', 'deepseek-flash', { id: 'deepseek-flash-no-thinking', displayName: 'DeepSeek V4.1 Flash', reasoningEnabled: false, reasoningEfforts: DEEPSEEK_REASONING }),
    model('deepseek', 'deepseek-v4-pro', { displayName: 'DeepSeek V4 Pro', inputModalities: Object.freeze(['text']), reasoningEnabled: true, reasoningEfforts: DEEPSEEK_REASONING })
  ]),
  openrouter: Object.freeze([
    model('openrouter', 'openai/gpt-6.1-sol', { reasoningEffort: 'medium', reasoningEfforts: OPENAI_REASONING }),
    model('openrouter', 'openai/gpt-6.1-terra', { id: 'openai/gpt-6.1-terra-none', reasoningEffort: 'none', reasoningEfforts: OPENAI_OPTIONAL_REASONING }),
    model('openrouter', 'openai/gpt-6-luna', { reasoningEfforts: OPENAI_OPTIONAL_REASONING }),
    model('openrouter', 'google/gemini-4-hydrogen', { reasoningEfforts: Object.freeze([...GEMINI_REASONING, 'xhigh']) }),
    model('openrouter', 'google/gemini-4-carbon', { reasoningEfforts: GEMINI_REASONING }),
    model('openrouter', 'anthropic/claude-sonnet-5.5', { reasoningEfforts: CLAUDE_REASONING }),
    model('openrouter', 'x-ai/grok-4.7', { reasoningEfforts: Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
    model('openrouter', 'deepseek/deepseek-v4.1-flash', { reasoningEfforts: Object.freeze([...DEEPSEEK_REASONING, 'none']) }),
    model('openrouter', 'deepseek/deepseek-v4.1-flash', { id: 'deepseek/deepseek-v4.1-flash-no-thinking', reasoningEnabled: false, reasoningEfforts: Object.freeze([...DEEPSEEK_REASONING, 'none']) }),
    model('openrouter', 'qwen/qwen3.8-flash', { id: 'qwen/qwen3.8-flash-no-thinking', reasoningEnabled: false }),
    model('openrouter', 'qwen/qwen4-max', { reasoningEfforts: Object.freeze(['none', 'low', 'high', 'xhigh']) })
  ])
});

const REPLACED_MODELS = Object.freeze({
  openai: Object.freeze({
    'gpt-5.2': 'gpt-6.1-sol', 'gpt-5.2-high': 'gpt-6.1-sol-high',
    'gpt-5.1': 'gpt-6.1-terra-none', 'gpt-5.1-high': 'gpt-6.1-sol-high'
  }),
  claude: Object.freeze({
    'claude-sonnet-4-5': 'claude-sonnet-5-5', 'claude-sonnet-4-5-20250929': 'claude-sonnet-5-5',
    'claude-opus-4-5': 'claude-opus-5-5', 'claude-opus-4-5-20251101': 'claude-opus-5-5',
    'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-haiku-4-5-20251001': 'claude-haiku-5-5'
  }),
  gemini: Object.freeze({ 'gemini-3-pro-preview': 'gemini-4-carbon', 'gemini-3-flash-preview': 'gemini-4-hydrogen' }),
  grok: Object.freeze({ 'grok-4': 'grok-4.3', 'grok-4-1-fast-reasoning': 'grok-4.3' }),
  deepseek: Object.freeze({ 'deepseek-chat': 'deepseek-flash-no-thinking', 'deepseek-reasoner': 'deepseek-flash' }),
  openrouter: Object.freeze({
    'openai/gpt-5.2': 'openai/gpt-6.1-sol',
    'openai/gpt-5.1': 'openai/gpt-6.1-terra-none',
    'google/gemini-3-pro-preview': 'google/gemini-4-carbon',
    'google/gemini-3-flash-preview': 'google/gemini-4-hydrogen',
    'anthropic/claude-sonnet-4.5': 'anthropic/claude-sonnet-5.5',
    'deepseek/deepseek-v3.2': 'deepseek/deepseek-v4.1-flash-no-thinking',
    'qwen/qwen3-235b-a22b-2507': 'qwen/qwen3.8-flash-no-thinking'
  })
});

const LEGACY_MODELS = Object.freeze({
  openai: Object.freeze([
    model('openai', 'gpt-5.2', { reasoningEffort: 'medium', reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.2', { id: 'gpt-5.2-high', reasoningEffort: 'high', reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.2-2025-12-11', { reasoningEfforts: GPT52_REASONING }),
    model('openai', 'gpt-5.1', { reasoningEfforts: GPT51_REASONING }),
    model('openai', 'gpt-5.1', { id: 'gpt-5.1-high', reasoningEffort: 'high', reasoningEfforts: GPT51_REASONING }),
    model('openai', 'gpt-5.1-2025-11-13', { reasoningEfforts: GPT51_REASONING })
  ]),
  openrouter: Object.freeze([
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

/** Preserve custom IDs while refreshing known built-in selections to the same role. */
export function resolveSavedModel(provider, id, customIds = []) {
  if (typeof id !== 'string' || !id) return getDefaultModel(provider);
  if (customIds.includes(id)) return id;
  const aliases = Object.hasOwn(REPLACED_MODELS, provider) ? REPLACED_MODELS[provider] : null;
  return aliases && Object.hasOwn(aliases, id) ? aliases[id] : id;
}

/** Look up an exact managed model or variant without rewriting custom API IDs. */
export function getModelMetadata(provider, id) {
  const entry = getModelCatalog(provider).find(item => item.id === id);
  if (entry) return entry;
  const legacy = Object.hasOwn(LEGACY_MODELS, provider) ? LEGACY_MODELS[provider] : [];
  return legacy.find(item => item.id === id) || null;
}

/** Format managed reasoning variants without interpreting arbitrary custom suffixes. */
export function formatModelLabel(provider, id, translate) {
  const metadata = getModelMetadata(provider, id);
  if (!metadata) return id || '';
  if (translate) {
    let label = metadata.displayName || metadata.apiModel;
    if (metadata.reasoningEffort && metadata.reasoningEffort !== 'none') {
      label = translate('modelReasoningEffort', { model: label, effort: translate(`reasoningEffort_${metadata.reasoningEffort}`) });
    }
    if (metadata.reasoningEffort === 'none' || metadata.reasoningEnabled === false) label = translate('modelNoReasoning', { model: label });
    if (!metadata.inputModalities.includes('image')) label = translate('modelTextOnly', { model: label });
    return label;
  }
  const effort = metadata.reasoningEffort ? ` (reasoning effort - ${metadata.reasoningEffort})` : '';
  const disabled = metadata.reasoningEnabled === false ? ' (no reasoning)' : '';
  const textOnly = !metadata.inputModalities.includes('image') ? ' (text only)' : '';
  return `${metadata.displayName || metadata.apiModel}${effort}${disabled}${textOnly}`;
}
