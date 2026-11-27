// @ts-check
// Audio preparation module for ClipAIble extension
// Handles text chunking and cleanup for TTS conversion

import { renderPrompt } from '../settings/prompt-catalog.js';
import { log, logWarn } from '../utils/logging.js';
import { splitNarrationText } from '../utils/narration-chunks.js';
import { isLocalSpeechProvider } from '../api/supertonic-config.js';
import { documentText, listHtml, tableCellHtml, flatTableProjection } from './document-content.js';
import { isNativePdfContent } from './xml.js';
import { sanitizeMarkdownHtml } from '../utils/html.js';
import { tokenizeHtml, decodeEntities, plainText as plainHtmlText } from '../utils/html/tokenizer.js';
import { isTerminalAIResponseError } from '../api/response-validation.js';
import { callAI } from '../api/index.js';
import { getUILanguage, tSync } from '../locales.js';
import { PROCESSING_STAGES, getProcessingState } from '../state/processing.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';
import { OPENAI_TTS_VOICES, DEFAULT_OPENAI_TTS_VOICE, OPENAI_TTS_MIN_SPEED, OPENAI_TTS_MAX_SPEED, OPENAI_TTS_MAX_INPUT } from '../api/tts-catalog.js';

/**
 * Configuration for audio preparation
 * @readonly
 * @const {{
 *   MIN_CHUNK_SIZE: number,
 *   MAX_CHUNK_SIZE: number,
 *   IDEAL_CHUNK_SIZE: number,
 *   TTS_MAX_INPUT: number,
 *   VOICES: Array<string>,
 *   DEFAULT_VOICE: string,
 *   MIN_SPEED: number,
 *   MAX_SPEED: number,
 *   DEFAULT_SPEED: number
 * }}
 */
export const AUDIO_CONFIG = {
  // Target chunk size in characters (4-6k for efficiency, will be within TTS limit after cleanup)
  MIN_CHUNK_SIZE: 4000,
  MAX_CHUNK_SIZE: 6000,
  IDEAL_CHUNK_SIZE: 5000,
  
  // Bound each narration response independently.
  TTS_MAX_INPUT: OPENAI_TTS_MAX_INPUT,
  
  VOICES: OPENAI_TTS_VOICES,
  DEFAULT_VOICE: DEFAULT_OPENAI_TTS_VOICE,
  
  // Speed range
  MIN_SPEED: OPENAI_TTS_MIN_SPEED,
  MAX_SPEED: OPENAI_TTS_MAX_SPEED,
  DEFAULT_SPEED: 1.0
};

/** Project reading text and semantic math without marked backlink controls. */
function narrationPlainText(html, preserveTextNewlines = false) {
  /** @type {Array<{name: string, math: boolean, literal: boolean, script: boolean, backlink: boolean}>} */
  const stack = [];
  let output = '';
  for (const token of tokenizeHtml(html)) {
    if (token.type !== 'tag') { if (!stack.at(-1)?.backlink) output += token.raw; continue; }
    if (token.closing) {
      const backlink = Boolean(stack.at(-1)?.backlink);
      const index = stack.map(frame => frame.name).lastIndexOf(token.name);
      const frame = index >= 0 ? stack[index] : null;
      if (index >= 0) stack.length = index;
      if (!backlink) output += frame?.script ? '}' : token.raw;
      continue;
    }
    // A new anchor ends an earlier anchor in HTML, including a backlink.
    if (token.name === 'a' && !stack.at(-1)?.literal) {
      const index = stack.map(frame => frame.name).lastIndexOf('a');
      if (index >= 0 && stack[index].backlink) stack.length = index;
    }
    const parent = stack.at(-1);
    const classes = decodeEntities(token.attrs.find(attr => attr.name === 'class')?.value || '').split(/\s+/);
    const math = Boolean(parent?.math || (token.name === 'span' && classes.includes('math')));
    const literal = Boolean(parent?.literal || ['code', 'pre'].includes(token.name));
    const role = decodeEntities(token.attrs.find(attr => attr.name === 'role')?.value || '').trim();
    const backlink = Boolean(parent?.backlink || (!literal && token.name === 'a' && role === 'doc-backlink'));
    const script = math && !literal && ['sup', 'sub'].includes(token.name);
    if (!['br', 'hr'].includes(token.name)) stack.push({ name: token.name, math, literal, script, backlink });
    if (backlink && !parent?.backlink) output += ' ';
    if (!backlink) output += script ? (token.name === 'sup' ? '^{' : '_{') : token.raw;
  }
  return plainHtmlText(output, { preserveBreaks: true, preserveTextNewlines });
}

function narrationItemText(item) {
  const literal = item.format === 'text' || isNativePdfContent(item);
  const html = !literal && typeof item.html === 'string' ? sanitizeMarkdownHtml(item.html) : documentText(item);
  return narrationPlainText(html, literal);
}

/** Project article content without rewriting the resulting narration. */
export function contentToPlainText(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const item of content) {
    if (!item) continue;
    switch (item.type) {
      case 'heading':
      case 'subtitle':
      case 'paragraph':
      case 'quote':
      case 'blockquote':
        parts.push(narrationItemText(item));
        break;
      case 'code':
        parts.push(narrationItemText({ ...item, format: 'text' }));
        break;
      case 'list':
        if (Array.isArray(item.items)) parts.push(narrationPlainText(listHtml(item)));
        break;
      case 'image': {
        if (item.isGraphic && item.alt?.trim()) parts.push(item.alt.trim());
        if (item.caption) {
          const literal = item.format === 'text' || isNativePdfContent(item);
          parts.push(narrationItemText(literal ? { format: 'text', text: item.caption } : { html: item.caption }));
        }
        break;
      }
      case 'table': {
        const table = flatTableProjection(item);
        const value = cell => narrationPlainText(tableCellHtml(item, cell), item.cellFormat === 'text' || isNativePdfContent(item));
        const headers = Array.isArray(table.headers) ? table.headers.map(cell => value(cell).replace(/\s+/g, ' ')) : [];
        const rows = Array.isArray(table.rows) ? table.rows.filter(Array.isArray).map(row => row.map((cell, column) => {
          const text = value(cell);
          return !text ? '' : headers[column] ? `${headers[column]}: ${text}` : text;
        }).filter(Boolean).join('; ')).filter(Boolean) : [];
        parts.push(rows.length ? rows.join('\n\n') : headers.filter(Boolean).join('; '));
        break;
      }
      case 'infobox_start':
        if (item.title?.trim()) parts.push(item.title.trim() + ':');
        break;
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

export function splitTextIntoChunks(text, maxLength = AUDIO_CONFIG.MAX_CHUNK_SIZE) {
  return splitNarrationText(text, maxLength).map((text, index) => ({ text, index }));
}

// Language names for prompts
const LANGUAGE_NAMES_FOR_PROMPT = {
  'en': 'English',
  'ru': 'Russian',
  'ua': 'Ukrainian',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean',
  'auto': null
};

/** Rewrite a segment only when the user explicitly chose a custom preparation prompt. */
export async function prepareChunkForAudio(chunkText, chunkIndex, totalChunks, apiKey, model, language = 'auto', requestOptions = {}) {
  const langName = LANGUAGE_NAMES_FOR_PROMPT[language];
  const languageInstruction = langName ? `Keep the original ${langName} text.` : 'Keep the original language of the text.';
  const systemPrompt = renderPrompt('audioPreparation', requestOptions, { languageInstruction });
  const userPrompt = `Clean this text chunk (${chunkIndex + 1} of ${totalChunks}) for audio narration:\n\n${chunkText}`;
  try {
    const result = await callAI(systemPrompt, userPrompt, apiKey, model, false, requestOptions);
    await requestOptions.checkCancelled?.();
    requestOptions.signal?.throwIfAborted();
    return typeof result === 'string' && result.trim() ? result.trim() : chunkText;
  } catch (error) {
    await requestOptions.checkCancelled?.();
    requestOptions.signal?.throwIfAborted();
    if (error.name === 'AbortError' || error.retryable === false ||
        [400, 401, 403, 429].includes(error.status) || isTerminalAIResponseError(error)) throw error;
    logWarn('Custom narration preparation unavailable', { chunkIndex });
    return chunkText;
  }
}

function preparationError(key, uiLanguage) {
  return Object.assign(new Error(tSync(key, uiLanguage)), { translationKey: key, translationParams: {} });
}

/** Build narration segments, keeping the source unchanged unless custom preparation was enabled. */
export async function prepareContentForAudio(content, title, apiKey, model, language = 'auto', updateState, provider = null, processingRunId, requestOptions = {}, maxLength = AUDIO_CONFIG.MAX_CHUNK_SIZE) {
  const useCustomPrompt = !isLocalSpeechProvider(provider) && Boolean(requestOptions.promptOverrides?.audioPreparation);
  const uiLang = await getUILanguage();
  await checkCancellation('audio text preparation', processingRunId);
  if (useCustomPrompt && !model) throw preparationError('errorExportModelRequired', uiLang);
  if (useCustomPrompt && !apiKey) throw preparationError('errorNoApiKey', uiLang);

  const base = getProcessingState()?.progress >= 60 ? 60 : 10;
  const update = (key, progress, params = {}) => updateState?.({ stage: PROCESSING_STAGES.GENERATING.id,
    status: tSync(key, uiLang, params), statusTranslationKey: key, statusTranslationParams: params, progress });
  update('stageConvertingToText', base);
  const body = contentToPlainText(content);
  if (!body) throw preparationError('errorNoContentToConvert', uiLang);
  const heading = String(title || '').trim();
  const comparable = value => value.replace(/\s+/g, ' ').toLowerCase();
  const firstBlock = body.split(/\n\n/, 1)[0];
  const text = heading && comparable(heading) !== comparable(firstBlock) ? `${heading}\n\n${body}` : body;

  const splitProgress = Math.max(15, base);
  update('stageSplittingIntoChunks', splitProgress);
  const chunks = splitTextIntoChunks(text, maxLength);
  log('Narration prepared', { provider, chunks: chunks.length, characters: text.length, useCustomPrompt });
  if (!useCustomPrompt) return chunks;
  for (const chunk of chunks) {
    await checkCancellation('custom audio preparation', processingRunId);
    update('stagePreparingSegment', splitProgress + Math.floor((60 - splitProgress) * chunk.index / chunks.length),
      { current: chunk.index + 1, total: chunks.length });
    chunk.text = await prepareChunkForAudio(chunk.text, chunk.index, chunks.length, apiKey, model, language, requestOptions);
  }
  return chunks;
}
