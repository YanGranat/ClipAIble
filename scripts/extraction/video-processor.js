// @ts-check
// AI processing of video subtitles - converts subtitles to structured article text

import { renderPrompt } from '../settings/prompt-catalog.js';
import { callAI } from '../api/index.js';
import { log, logError } from '../utils/logging.js';
import { checkCancellation } from '../utils/pipeline-helpers.js';



/**
 * Build user prompt for subtitle processing
 * @param {Array} subtitles - Array of subtitle entries
 * @returns {string} User prompt
 */
function buildSubtitleUserPrompt(subtitles) {
  const subtitlesText = JSON.stringify(subtitles);
  
  return `Convert these video subtitles into a well-structured article.

Subtitles (${subtitles.length} entries):
${subtitlesText}

Remember:
- Remove all timestamps
- Merge into natural paragraphs
- Fix capitalization and transcription errors
- Add paragraph breaks where appropriate
- Only add headings if there are clear section breaks
- Preserve ALL content - do not summarize`;
}

/**
 * Process subtitles with AI (single chunk)
 * @param {Array} subtitles - Array of subtitle entries
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} [processingRunId] - Processing run owner
 * @param {import('../types.js').AIRequestOptions} [requestOptions] - Provider and cancellation checks
 * @returns {Promise<Array>} Processed content items
 */
async function processSubtitlesSingleChunk(subtitles, apiKey, model, processingRunId, requestOptions) {
  const userPrompt = buildSubtitleUserPrompt(subtitles);
  await checkCancellation('subtitle request', processingRunId);
  
  const parsed = await callAI(
    renderPrompt('subtitles', requestOptions),
    userPrompt,
    apiKey,
    model,
    true, // jsonResponse
    requestOptions
  );
  await checkCancellation('subtitle response', processingRunId);
  
  if (!parsed) {
    throw new Error('AI returned empty response');
  }
  
  // callAI with jsonResponse=true returns parsed JSON object
  // Type guard: ensure parsed is an object (not string)
  if (typeof parsed !== 'object' || parsed === null) {
    logError('AI response is not an object', parsed);
    throw new Error('AI response is not an object');
  }
  
  if (!Array.isArray(parsed.content) || parsed.content.length === 0) {
    logError('AI response missing content array', parsed);
    throw new Error('AI response missing content array');
  }
  
  return parsed.content;
}

/**
 * Process subtitle chunk with context from previous chunks
 * @param {Array} subtitles - Current chunk of subtitles
 * @param {Array} previousContent - Previously processed content items
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} [processingRunId] - Processing run owner
 * @param {import('../types.js').AIRequestOptions} [requestOptions] - Provider and cancellation checks
 * @returns {Promise<Array>} Processed content items (only new chunk, not previous)
 */
async function processSubtitlesWithContext(subtitles, previousContent, apiKey, model, processingRunId, requestOptions) {
  // Give the model enough context to continue a sentence at the previous boundary.
  const previousText = previousContent
    .map(item => {
      if (item.type === 'heading') return `## ${item.text}`;
      if (item.type === 'paragraph') return item.text;
      return '';
    })
    .filter(text => text)
    .join('\n\n');
  
  const contextLength = 2000;
  const contextText = previousText.length > contextLength
    ? '...' + previousText.slice(-contextLength)
    : previousText;
  
  const userPrompt = `You already processed the first part of subtitles. Here's what you created so far (last part for context):

${contextText}

Now process this NEXT chunk of subtitles. Continue from where you left off. Make sure the text flows naturally from the previous part.

Next chunk of subtitles (${subtitles.length} entries):
${JSON.stringify(subtitles)}

Remember:
- Continue naturally from previous content
- Remove all timestamps
- Merge into natural paragraphs
- Fix capitalization and transcription errors
- Add paragraph breaks where appropriate
- Only add headings if there are clear section breaks
- Preserve ALL content - do not summarize
- DO NOT repeat previous content`;

  await checkCancellation('subtitle context request', processingRunId);
  const parsed = await callAI(
    renderPrompt('subtitleContinuation', requestOptions),
    userPrompt,
    apiKey,
    model,
    true, // jsonResponse
    requestOptions
  );
  await checkCancellation('subtitle context response', processingRunId);
  
  if (!parsed) {
    throw new Error('AI returned empty response');
  }
  
  // callAI with jsonResponse=true returns parsed JSON object
  // Type guard: ensure parsed is an object (not string)
  if (typeof parsed !== 'object' || parsed === null) {
    logError('AI response is not an object', parsed);
    throw new Error('AI response is not an object');
  }
  
  if (!Array.isArray(parsed.content) || parsed.content.length === 0) {
    logError('AI response missing content array', parsed);
    throw new Error('AI response missing content array');
  }
  
  return parsed.content;
}

/** @param {{text?: string}[]} subtitles */
function splitSubtitleRequests(subtitles) {
  // The output nearly repeats the source text. Timestamp and JSON overhead do not predict its size.
  const maxTextLength = 8000;
  const maxEntries = 500;
  const chunks = [];
  let start = 0;
  let textLength = 0;
  subtitles.forEach((subtitle, index) => {
    const length = subtitle.text?.length || 0;
    if (index > start && (textLength + length > maxTextLength || index - start >= maxEntries)) {
      chunks.push(subtitles.slice(start, index));
      start = index;
      textLength = 0;
    }
    textLength += length;
  });
  chunks.push(subtitles.slice(start));
  return chunks;
}

/** Process each part in order. A retry uses smaller input only after an explicit output limit. */
async function processSubtitleRequest(subtitles, previousContent, apiKey, model, processingRunId, requestOptions, splitsRemaining = 3) {
  try {
    const content = previousContent
      ? await processSubtitlesWithContext(subtitles, previousContent, apiKey, model, processingRunId, requestOptions)
      : await processSubtitlesSingleChunk(subtitles, apiKey, model, processingRunId, requestOptions);
    return { content, context: content };
  } catch (error) {
    if (error?.code !== 'AI_RESPONSE_TRUNCATED' || subtitles.length < 2 || splitsRemaining === 0) throw error;
    await checkCancellation('subtitle output limit', processingRunId);
    const middle = Math.floor(subtitles.length / 2);
    const first = await processSubtitleRequest(subtitles.slice(0, middle), previousContent, apiKey, model, processingRunId, requestOptions, splitsRemaining - 1);
    const second = await processSubtitleRequest(subtitles.slice(middle), first.context, apiKey, model, processingRunId, requestOptions, splitsRemaining - 1);
    return { content: [...first.content, ...second.content], context: second.context };
  }
}

/**
 * Process subtitles with AI (with smart chunking and context)
 * @param {Array} subtitles - Array of subtitle entries
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {import('../types.js').ProgressCallbackFunction} [progressCallback] - Optional callback for progress updates (current, total)
 * @param {string} [processingRunId] - Processing run owner
 * @param {import('../types.js').AIRequestOptions} [requestOptions] - Provider and cancellation checks
 * @returns {Promise<Array>} Processed content items
 */
export async function processSubtitlesWithAI(subtitles, apiKey, model, progressCallback = null, processingRunId, requestOptions) {
  if (!subtitles || subtitles.length === 0) {
    throw new Error('No subtitles provided');
  }
  await checkCancellation('subtitle processing', processingRunId);
  
  const chunks = splitSubtitleRequests(subtitles);
  log('Prepared subtitle requests', { chunkCount: chunks.length, totalEntries: subtitles.length });
  
  // Process each chunk with context from previous
  const allContent = [];
  let previousContent = null;
  
  for (let i = 0; i < chunks.length; i++) {
    // Check if processing was cancelled before processing each chunk
    await checkCancellation(`subtitle processing chunk ${i + 1}/${chunks.length}`, processingRunId);
    
    const chunk = chunks[i];
    log(`Processing subtitle chunk ${i + 1}/${chunks.length}`, { 
      entries: chunk.length,
      hasContext: previousContent !== null
    });
    
    if (progressCallback) {
      progressCallback(i, chunks.length);
    }
    
    try {
      const result = await processSubtitleRequest(chunk, previousContent, apiKey, model, processingRunId, requestOptions);
      await checkCancellation('subtitle chunk result', processingRunId);
      allContent.push(...result.content);
      previousContent = result.context;
    } catch (error) {
      logError(`Failed to process subtitle chunk ${i + 1}/${chunks.length}`, error);
      throw error;
    }
    
    // Update progress
    if (progressCallback) {
      progressCallback(i + 1, chunks.length);
    }
  }
  
  return allContent;
}

