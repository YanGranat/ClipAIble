// AI processing of video subtitles - converts subtitles to structured article text

import { callAI } from '../api/index.js';
import { log, logError } from '../utils/logging.js';

/**
 * System prompt for subtitle processing
 */
const SUBTITLE_PROCESSOR_SYSTEM_PROMPT = `You are a text processing expert. Your task: convert video subtitles into a well-structured article.

INPUT: Array of subtitle entries with timestamps:
[
  {"start": 0.0, "duration": 3.5, "text": "Hello and welcome"},
  {"start": 3.5, "duration": 2.0, "text": "to this video"},
  ...
]

YOUR TASK:
1. Remove ALL timestamps - do NOT include start/duration in output
2. Merge consecutive subtitles into natural paragraphs
3. Add proper paragraph breaks where speaker pauses or topic changes
4. Fix capitalization (first word of sentences, proper nouns)
5. Remove filler words if they don't add meaning (um, uh, like, you know)
6. Fix common transcription errors if obvious
7. Structure content logically - if there are clear sections, you can add headings (h2 level)
8. Preserve the original meaning and tone
9. Make text flow naturally as if it was written, not spoken

CRITICAL RULES:
- DO NOT summarize or paraphrase - keep ALL content
- DO NOT add information not in subtitles
- DO NOT remove important content
- Only remove timestamps and merge text naturally
- If subtitles are very short fragments, merge them into longer paragraphs
- If speaker changes topic, start a new paragraph
- If there's a clear section break (long pause, topic change), you can add a heading

OUTPUT FORMAT (JSON):
{
  "content": [
    {"type": "heading", "level": 2, "text": "Section title (only if clear section break)"},
    {"type": "paragraph", "text": "Merged paragraph text..."},
    {"type": "paragraph", "text": "Next paragraph..."}
  ]
}

Return ONLY valid JSON.`;

/**
 * System prompt for subtitle processing (with context)
 * Used for subsequent chunks when processing large subtitles
 */
const SUBTITLE_PROCESSOR_CONTEXT_SYSTEM_PROMPT = `You are a text processing expert. Your task: continue processing video subtitles, building on previous work.

CONTEXT: You already processed the first part of subtitles. The user will provide:
1. What you created so far (previous content items)
2. Next chunk of subtitles to process

YOUR TASK:
1. Review the previous content to understand the flow and style
2. Process the new chunk of subtitles
3. Continue naturally from where you left off
4. Ensure smooth transition between previous and new content
5. Follow the same rules as before:
   - Remove timestamps
   - Merge into natural paragraphs
   - Fix capitalization
   - Add paragraph breaks where appropriate
   - Only add headings if clear section breaks

CRITICAL:
- The new content should flow naturally from previous content
- If previous content ended mid-sentence or mid-thought, continue it
- Maintain consistent style and formatting
- DO NOT repeat or summarize previous content
- DO NOT add headings unless there's a clear new section

OUTPUT FORMAT (JSON):
{
  "content": [
    {"type": "paragraph", "text": "Continuing text from previous part..."},
    {"type": "heading", "level": 2, "text": "New section (only if clear break)"},
    {"type": "paragraph", "text": "New paragraph..."}
  ]
}

Return ONLY valid JSON.`;

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
 * @returns {Promise<Array>} Processed content items
 */
async function processSubtitlesSingleChunk(subtitles, apiKey, model) {
  const userPrompt = buildSubtitleUserPrompt(subtitles);
  
  const parsed = await callAI(
    SUBTITLE_PROCESSOR_SYSTEM_PROMPT,
    userPrompt,
    apiKey,
    model,
    true // jsonResponse
  );
  
  if (!parsed) {
    throw new Error('AI returned empty response');
  }
  
  // callAI already returns parsed JSON
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
 * @returns {Promise<Array>} Processed content items (only new chunk, not previous)
 */
async function processSubtitlesWithContext(subtitles, previousContent, apiKey, model) {
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

  const parsed = await callAI(
    SUBTITLE_PROCESSOR_CONTEXT_SYSTEM_PROMPT,
    userPrompt,
    apiKey,
    model,
    true // jsonResponse
  );
  
  if (!parsed) {
    throw new Error('AI returned empty response');
  }
  
  // callAI already returns parsed JSON
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
 * @param {Function} progressCallback - Optional callback for progress updates (current, total)
 * @returns {Promise<Array>} Processed content items
 */
export async function processSubtitlesWithAI(subtitles, apiKey, model, progressCallback = null) {
  if (!subtitles || subtitles.length === 0) {
    throw new Error('No subtitles provided');
  }
  
  // Estimate output size (rough: 1 subtitle entry ≈ 50-100 chars output)
  // AI can output ~30k chars max, so we need to chunk if input is large
  // But we can give MORE input (context) - the limit is on OUTPUT
  const ESTIMATED_OUTPUT_PER_ENTRY = 80; // chars
  const MAX_OUTPUT_CHARS = 25000; // Leave margin
  const MAX_INPUT_CHARS = 50000; // Can give more input for context
  
  const estimatedOutput = subtitles.length * ESTIMATED_OUTPUT_PER_ENTRY;
  const needsChunking = estimatedOutput > MAX_OUTPUT_CHARS;
  
  if (!needsChunking) {
    // Single chunk processing
    if (progressCallback) progressCallback(0, 1);
    const result = await processSubtitlesSingleChunk(subtitles, apiKey, model);
    if (progressCallback) progressCallback(1, 1);
    return result;
  }
  
  // Multi-chunk processing with context
  log('Subtitle processing requires chunking', {
    totalEntries: subtitles.length,
    estimatedOutput
  });
  
  // Split subtitles into chunks
  // Each chunk should produce ~20k chars output (safe margin)
  const ENTRIES_PER_CHUNK = Math.floor(MAX_OUTPUT_CHARS / ESTIMATED_OUTPUT_PER_ENTRY);
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
    const chunk = chunks[i];
    log(`Processing subtitle chunk ${i + 1}/${chunks.length}`, { 
      entries: chunk.length,
      hasContext: previousContent !== null
    });
    
    if (progressCallback) {
      progressCallback(i, chunks.length);
    }
    
    let chunkContent;
    if (i === 0) {
      // First chunk: normal processing
      chunkContent = await processSubtitlesSingleChunk(chunk, apiKey, model);
    } else {
      // Subsequent chunks: process with context
      chunkContent = await processSubtitlesWithContext(
        chunk, 
        previousContent, 
        apiKey, 
        model
      );
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

