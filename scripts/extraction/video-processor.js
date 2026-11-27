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
  
  if (!parsed.content || !Array.isArray(parsed.content)) {
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
  // Build context from previous content (can be large, that's OK)
  const previousText = previousContent
    .map(item => {
      if (item.type === 'heading') return `## ${item.text}`;
      if (item.type === 'paragraph') return item.text;
      return '';
    })
    .filter(text => text)
    .join('\n\n');
  
  // Take last ~10k chars of previous content for context (enough to understand flow)
  const contextText = previousText.length > 10000 
    ? '...' + previousText.slice(-10000)
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
  
  if (!parsed.content || !Array.isArray(parsed.content)) {
    logError('AI response missing content array', parsed);
    throw new Error('AI response missing content array');
  }
  
  return parsed.content;
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
  
  // Split subtitles into chunks based on input size only
  // No output size restrictions - let AI generate as much as needed
  const MAX_INPUT_CHARS = 50000; // Maximum input size per chunk
  const ESTIMATED_INPUT_PER_ENTRY = 100; // Rough estimate: each subtitle entry is ~100 chars in JSON format
  
  // Calculate if chunking is needed based on input size
  const estimatedInput = subtitles.length * ESTIMATED_INPUT_PER_ENTRY;
  const needsChunking = estimatedInput > MAX_INPUT_CHARS;
  
  if (!needsChunking) {
    // Single chunk processing
    if (progressCallback) progressCallback(0, 1);
    const result = await processSubtitlesSingleChunk(subtitles, apiKey, model, processingRunId, requestOptions);
    if (progressCallback) progressCallback(1, 1);
    return result;
  }
  
  // Multi-chunk processing with context
  log('Subtitle processing requires chunking', {
    totalEntries: subtitles.length,
    estimatedInput
  });
  
  // Split subtitles into chunks based on input size
  // Each chunk should have ~500 entries (MAX_INPUT_CHARS / ESTIMATED_INPUT_PER_ENTRY)
  const ENTRIES_PER_CHUNK = Math.floor(MAX_INPUT_CHARS / ESTIMATED_INPUT_PER_ENTRY);
  const chunks = [];
  
  for (let i = 0; i < subtitles.length; i += ENTRIES_PER_CHUNK) {
    chunks.push(subtitles.slice(i, i + ENTRIES_PER_CHUNK));
  }
  
  log('Split subtitles into chunks', { 
    chunkCount: chunks.length,
    entriesPerChunk: ENTRIES_PER_CHUNK
  });
  
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
    
    let chunkContent;
    try {
      // The provider owns the retry deadline for each request.
      chunkContent = i === 0
        ? await processSubtitlesSingleChunk(chunk, apiKey, model, processingRunId, requestOptions)
        : await processSubtitlesWithContext(chunk, previousContent, apiKey, model, processingRunId, requestOptions);
      await checkCancellation('subtitle chunk result', processingRunId);
    } catch (error) {
      logError(`Failed to process subtitle chunk ${i + 1}/${chunks.length}`, error);
      throw error;
    }
    
    allContent.push(...chunkContent);
    previousContent = chunkContent; // Save for next iteration
    
    // Update progress
    if (progressCallback) {
      progressCallback(i + 1, chunks.length);
    }
  }
  
  return allContent;
}

