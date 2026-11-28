// @ts-check
import { renderPrompt } from '../settings/prompt-catalog.js';
import { assertCompleteAIResponse } from '../api/response-validation.js';
import { fetchBufferedResponse } from '../api/fetch-buffered-response.js';
import { createApiError } from '../api/http-errors.js';
import { CONFIG, LANGUAGE_NAMES, NO_TRANSLATION_MARKER } from '../utils/config.js';
import { resolveAIProvider } from '../api/index.js';
import { getDecryptedKeyCached } from '../utils/encryption.js';
import { callWithRetry } from '../utils/retry.js';
import { cleanAuthor } from '../utils/author-validator.js';
import { stripHtml } from '../utils/html.js';
import { decodeEntities, escapeText, tokenizeHtml } from '../utils/html/tokenizer.js';
import { PROCESSING_STAGES } from '../state/processing.js';
import { getUILanguage, formatStatusUpdate } from '../locales.js';
import { getClaudeRequestConfig, getClaudeResponseText } from '../api/claude.js';
import { getGeminiModelName, getGeminiGenerationConfig, getGeminiResponseText } from '../api/gemini.js';
import { getDeepSeekRequestConfig } from '../api/deepseek.js';
import { getOpenAIRequestConfig } from '../api/openai.js';
import { getGrokRequestConfig } from '../api/grok.js';
import { getOpenRouterRequestConfig } from '../api/openrouter.js';
import { imageCaptionItem, verifiedTableLayout, synchronizeTableAliases } from '../generation/document-content.js';

async function checkActive(options) {
  if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new DOMException('Translation cancelled', 'AbortError');
  await options.checkCancelled?.();
  if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new DOMException('Translation cancelled', 'AbortError');
}

function invalidTranslation() {
  return Object.assign(new Error('The translation response is incomplete or invalid.'), {
    code: 'AI_TRANSLATION_INVALID', retryable: false,
    translationKey: 'errorTranslationFailed', translationParams: {}
  });
}

function sourceFragmentAttribute(token, attribute) {
  return attribute.name === 'id' || (token.name === 'a' && attribute.name === 'name');
}

function withSourceFragments(token, original = null) {
  if (token.type !== 'tag' || token.closing) return token.raw;
  const originals = original?.attrs || [];
  const link = original?.name === 'a' && originals.find(attribute => attribute.name === 'href');
  const fragmentLink = link && decodeEntities(link.value).includes('#') ? link : null;
  let result = token.raw;
  for (const attribute of token.attrs.slice().reverse()) {
    if (sourceFragmentAttribute(token, attribute) || (fragmentLink && attribute.name === 'href')) {
      result = result.slice(0, attribute.start) + result.slice(attribute.end);
    }
  }
  if (!original) return result;
  const attributes = new Map();
  for (const attribute of originals) {
    if ((sourceFragmentAttribute(original, attribute) || attribute === fragmentLink) && !attributes.has(attribute.name)) {
      attributes.set(attribute.name, decodeEntities(attribute.value));
    }
  }
  const end = result.endsWith('/>') ? -2 : -1;
  return result.slice(0, end) + Array.from(attributes, ([name, value]) => ` ${name}="${escapeText(value)}"`).join('') + result.slice(end);
}

function cleanTranslationHtml(text) {
  return tokenizeHtml(text).map(token => withSourceFragments(token)).join('');
}

/** Anchor identity belongs to the source. Restore it only when the markup still corresponds. */
function restoreTranslationFragments(text, original) {
  const sourceTags = tokenizeHtml(original).filter(token => token.type === 'tag');
  const tokens = tokenizeHtml(text);
  const translatedTags = tokens.filter(token => token.type === 'tag');
  const sameStructure = sourceTags.length === translatedTags.length && sourceTags.every((token, index) =>
    token.name === translatedTags[index].name && token.closing === translatedTags[index].closing);
  let index = 0;
  return tokens.map(token => withSourceFragments(token, token.type === 'tag' && sameStructure ? sourceTags[index++] : null)).join('');
}

/** Preserve selected provider parameters for every translation operation. */
async function requestTranslation(systemPrompt, userPrompt, apiKey, model, options, { batch = false, metadata = false } = {}) {
  await checkActive(options);
  const provider = resolveAIProvider(model, options.provider);
  const key = await getDecryptedKeyCached(apiKey, provider);
  await checkActive(options);
  let url, parameters;
  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    Object.assign(headers, { 'X-Api-Key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    parameters = { ...getClaudeRequestConfig(model, metadata ? { maxTokens: 256, shortResponse: true } : { maxTokens: 32000 }),
      system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] };
  } else if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + getGeminiModelName(model) + ':generateContent';
    headers['x-goog-api-key'] = key;
    parameters = { contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
      generationConfig: getGeminiGenerationConfig(model, batch ? { responseMimeType: 'application/json' } : {}) };
  } else {
    headers.Authorization = 'Bearer ' + key;
    let configuration;
    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      configuration = getOpenAIRequestConfig(model);
    } else if (provider === 'grok') {
      url = 'https://api.x.ai/v1/chat/completions';
      configuration = getGrokRequestConfig(model);
    } else if (provider === 'deepseek') {
      url = 'https://api.deepseek.com/v1/chat/completions';
      configuration = getDeepSeekRequestConfig(model);
    } else {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers['HTTP-Referer'] = 'https://github.com/YanGranat/ClipAIble';
      headers['X-Title'] = 'ClipAIble';
      configuration = getOpenRouterRequestConfig(model, batch ? {} : { maxTokens: CONFIG.MAX_TOKENS_OPENROUTER });
    }
    parameters = { ...configuration, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] };
    if (batch) parameters.response_format = { type: 'json_object' };
  }
  const response = await callWithRetry(async ({ signal }) => {
    await checkActive(options);
    const result = await fetchBufferedResponse(url, {
      method: 'POST', headers, body: JSON.stringify(parameters), signal
    }, batch ? CONFIG.TRANSLATION_API_TIMEOUT_MS : CONFIG.API_TIMEOUT_MS, options);
    if (!result.ok) throw await createApiError(result, provider);
    return result;
  }, { signal: options.signal, checkCancelled: options.checkCancelled, shouldRetry: error => error.retryable === false ? false : undefined });
  await checkActive(options);
  const payload = await response.json();
  await checkActive(options);
  assertCompleteAIResponse(payload, provider);
  const content = provider === 'claude' ? getClaudeResponseText(payload)
    : provider === 'gemini' ? getGeminiResponseText(payload) : payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw invalidTranslation();
  return content;
}

function translateResult(text, original) {
  if (typeof text !== 'string' || !text.trim()) throw invalidTranslation();
  return text.trim() === NO_TRANSLATION_MARKER ? original : restoreTranslationFragments(text, original);
}

export async function translateText(text, targetLang, apiKey, model, options = {}) {
  await checkActive(options);
  if (typeof text !== 'string') throw invalidTranslation();
  if (!text) return text;
  const prompt = renderPrompt('translateText', options, { targetLanguage: targetLang, unchangedMarker: NO_TRANSLATION_MARKER });
  const translated = await requestTranslation(prompt, cleanTranslationHtml(text), apiKey, model, options);
  await checkActive(options);
  return translateResult(translated, text);
}

function parseBatch(content, texts) {
  let parsed;
  try { parsed = JSON.parse(content); }
  catch {
    const fenced = content.trim().match(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i);
    if (!fenced) throw invalidTranslation();
    try { parsed = JSON.parse(fenced[1]); } catch { throw invalidTranslation(); }
  }
  const values = parsed?.translations;
  let translations;
  if (Array.isArray(values)) {
    if (values.length !== texts.length) throw invalidTranslation();
    translations = values;
  } else if (values && typeof values === 'object') {
    const keys = Object.keys(values);
    if (keys.length !== texts.length || keys.some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= texts.length)) throw invalidTranslation();
    translations = texts.map((_, index) => values[String(index)]);
  } else throw invalidTranslation();
  return translations;
}

async function requestTranslationBatch(texts, targetLang, apiKey, model, options) {
  const prompt = renderPrompt('translateBatch', options, { targetLanguage: targetLang, endIndex: texts.length - 1, unchangedMarker: NO_TRANSLATION_MARKER });
  const content = await requestTranslation(prompt, 'Translate to ' + targetLang + ':\n' + JSON.stringify(texts.map(cleanTranslationHtml)), apiKey, model, options, { batch: true });
  await checkActive(options);
  return parseBatch(content, texts);
}

export async function translateBatch(texts, targetLang, apiKey, model, options = {}) {
  await checkActive(options);
  if (!Array.isArray(texts) || texts.some(text => typeof text !== 'string')) throw invalidTranslation();
  if (!texts.length) return [];
  if (texts.length === 1) return [await translateText(texts[0], targetLang, apiKey, model, options)];
  const slots = await requestTranslationBatch(texts, targetLang, apiKey, model, options);
  return texts.map((original, index) => translateResult(slots[index], original));
}

function copyContentItem(item) {
  const copy = { ...item };
  if (Array.isArray(item.items)) copy.items = item.items.map(value => value && typeof value === 'object' ? { ...value } : value);
  if (Array.isArray(item.headers)) copy.headers = [...item.headers];
  if (Array.isArray(item.rows)) copy.rows = item.rows.map(row => [...row]);
  if (Array.isArray(item.layoutRows)) copy.layoutRows = item.layoutRows.map(row => ({ ...row,
    cells: Array.isArray(row?.cells) ? row.cells.map(cell => ({ ...cell })) : row?.cells }));
  return copy;
}

/** Recover malformed batches while preserving the indexed mapping and source order. */
async function translateWithSubdivision(texts, language, apiKey, model, options, remainingSplits = 2) {
  if (texts.length === 1) return [await translateText(texts[0], language, apiKey, model, options)];
  let slots;
  let missing;
  try {
    slots = await requestTranslationBatch(texts, language, apiKey, model, options);
    missing = texts.map((_, index) => index).filter(index => typeof slots[index] !== 'string' || !slots[index].trim());
    if (missing.length > 1) throw invalidTranslation();
  } catch (error) {
    if (error.code !== 'AI_TRANSLATION_INVALID') throw error;
    if (remainingSplits === 0) {
      if (texts.length > 4) throw error;
      const translated = [];
      for (const text of texts) translated.push(await translateText(text, language, apiKey, model, options));
      return translated;
    }
    const midpoint = Math.ceil(texts.length / 2);
    const first = await translateWithSubdivision(texts.slice(0, midpoint), language, apiKey, model, options, remainingSplits - 1);
    const second = await translateWithSubdivision(texts.slice(midpoint), language, apiKey, model, options, remainingSplits - 1);
    return [...first, ...second];
  }
  const [index] = missing;
  const recovered = index === undefined ? null : await translateText(texts[index], language, apiKey, model, options);
  return texts.map((original, slot) => slot === index ? recovered : translateResult(slots[slot], original));
}

/** Publish a translated result only after every requested field has succeeded. */
export async function translateContent(original, targetLang, apiKey, model, updateState, options = {}) {
  await checkActive(options);
  if (!Array.isArray(original.content) || !original.content.length) return original;
  const result = { ...original, content: original.content.map(copyContentItem) };
  const language = LANGUAGE_NAMES[targetLang] || targetLang;
  const progress = async (key, value) => {
    if (!updateState) return;
    const uiLanguage = await getUILanguage();
    await checkActive(options);
    updateState({ stage: PROCESSING_STAGES.TRANSLATING.id, ...formatStatusUpdate(key, uiLanguage), progress: value });
  };
  if (result.title?.trim() || result.author?.trim()) await progress('statusTranslatingMetadata', 18);
  if (result.title?.trim()) result.title = await translateText(result.title, language, apiKey, model, options);
  if (result.author?.trim()) {
    const author = cleanAuthor(result.author);
    result.author = author ? cleanAuthor(await translateText(author, language, apiKey, model, options)) : '';
  }
  const fields = [];
  const tableLayouts = [];
  const collect = (owner, field, htmlOwner = null, literal = false) => {
    const value = owner[field];
    if (typeof value === 'string' && value.trim()) {
      fields.push({ owner, field, text: literal ? escapeText(value) : value, htmlOwner, literal });
    }
  };
  for (const item of result.content) {
    if (item.type === 'code') continue;
    if (typeof item.html === 'string' && item.html.trim()) collect(item, 'html', item);
    else collect(item, 'text');
    if (item.type === 'image') {
      collect(item, 'alt', null, true);
      collect(item, 'caption', null, imageCaptionItem(item).format === 'text');
    }
    if (item.type === 'infobox_start') collect(item, 'title');
    for (let index = 0; index < (item.items?.length || 0); index++) {
      const child = item.items[index];
      if (typeof child === 'string') collect(item.items, index);
      else if (child && typeof child === 'object') {
        if (typeof child.html === 'string' && child.html.trim()) collect(child, 'html', child);
        else collect(child, 'text');
      }
    }
    if (item.type === 'table') {
      const layout = verifiedTableLayout(item);
      if (layout) {
        tableLayouts.push({ item, layout });
        for (const origin of layout.origins) collect(layout.values[origin.row], origin.column);
      } else {
        delete item.layoutRows;
        for (let column = 0; column < (item.headers?.length || 0); column++) collect(item.headers, column);
        for (const row of item.rows || []) for (let column = 0; column < row.length; column++) collect(row, column);
      }
    }
  }
  const chunks = [];
  let chunk = [], length = 0;
  for (const field of fields) {
    if (chunk.length && (length + field.text.length > CONFIG.TRANSLATION_CHUNK_SIZE || chunk.length >= CONFIG.TRANSLATION_BATCH_MAX_FIELDS)) {
      chunks.push(chunk);
      chunk = [];
      length = 0;
    }
    chunk.push(field); length += field.text.length;
  }
  if (chunk.length) chunks.push(chunk);
  const total = fields.reduce((sum, field) => sum + field.text.length, 0) || 1;
  let completed = 0;
  for (const current of chunks) {
    await checkActive(options);
    await progress('statusTranslatingText', 20 + Math.floor(completed / total * 40));
    const translated = await translateWithSubdivision(current.map(field => field.text), language, apiKey, model, options);
    await checkActive(options);
    for (let index = 0; index < current.length; index++) {
      const field = current[index];
      field.owner[field.field] = field.literal ? decodeEntities(translated[index]) : translated[index];
      if (field.htmlOwner && typeof field.htmlOwner.text === 'string') field.htmlOwner.text = stripHtml(translated[index]);
      completed += field.text.length;
    }
  }
  await checkActive(options);
  for (const { item, layout } of tableLayouts) synchronizeTableAliases(item, layout);
  await progress('statusTranslationComplete', 60);
  return result;
}

export async function translateMetadata(text, targetLang, apiKey, model, type = 'author', options = {}) {
  await checkActive(options);
  if (!text || !apiKey || targetLang === 'auto') return text;
  const language = LANGUAGE_NAMES[targetLang] || targetLang;
  const prompt = type === 'date'
    ? 'Translate this date to ' + language + '. Return only the date, preserving its meaning.'
    : 'Transliterate these names to ' + language + ' script when needed, preserving every name and translating connector words. Return only the result.';
  const translated = await requestTranslation(prompt, text, apiKey, model, options, { metadata: true });
  await checkActive(options);
  return translateResult(translated.trim(), text);
}
