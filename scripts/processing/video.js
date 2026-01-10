// Video page processing module for ClipAIble extension
// Handles processing of video pages (YouTube/Vimeo) - extracts subtitles and processes with AI

// @ts-check

import { log, logError } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { checkCancellation, updateProgress, getUILanguageCached } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractYouTubeSubtitles, extractVimeoSubtitles } from '../extraction/video-subtitles.js';
import { processSubtitlesWithAI } from '../extraction/video-processor.js';

/**
 * Process video page (YouTube/Vimeo) - extract subtitles, process with AI
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {{platform: 'youtube'|'vimeo', videoId: string}} videoInfo - Video information
 * @returns {Promise<{title: string, author: string, content: import('../types.js').ContentItem[], publishDate: string}>} Processed video data
 * @throws {Error} If video processing fails
 * @throws {Error} If subtitle extraction fails
 * @throws {Error} If AI processing fails
 */
export async function processVideoPage(data, videoInfo) {
  const { platform, videoId } = videoInfo;
  const { url, tabId, apiKey, model } = data;
  
  log(`🎥 Processing ${platform} video: ${videoId}`, { url });
  
  // Check if processing was cancelled before video processing
  await checkCancellation('video processing');
  
  log('📝 Extracting subtitles from video');
  // Stage 1: Extract subtitles (5-15%)
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusExtractingSubtitles', 5);
  
  let subtitles, metadata;
  
  // Try to extract subtitles
  try {
    const subtitlesData = platform === 'youtube' 
      ? await extractYouTubeSubtitles(tabId)
      : await extractVimeoSubtitles(tabId);
    
    subtitles = subtitlesData.subtitles;
    metadata = subtitlesData.metadata;
    
    log(`✅ Subtitles extracted: ${subtitles.length} entries`, { title: metadata.title });
  } catch (error) {
    logError('Failed to extract subtitles', error);
    const uiLang = await getUILanguageCached();
    const errorMsg = tSync('errorNoSubtitles', uiLang);
    throw new Error(errorMsg);
  }
  
  if (!subtitles || subtitles.length === 0) {
    const uiLang = await getUILanguageCached();
    const errorMsg = tSync('errorNoSubtitles', uiLang);
    throw new Error(errorMsg);
  }
  
  await updateProgress(PROCESSING_STAGES.EXTRACTING, 'statusProcessingSubtitles', 15);
  
  // Check if processing was cancelled before subtitle processing
  await checkCancellation('subtitle processing');
  
  // Stage 2: Process subtitles with AI (15-40%)
  let content;
  try {
    // Progress callback for chunking progress
    const progressCallback = (current, total) => {
      if (total > 1) {
        const chunkProgress = (current / total) * 25; // 25% range (15-40%)
        updateState({ progress: 15 + chunkProgress });
      }
    };
    
    log('🤖 Processing subtitles with AI');
    content = await processSubtitlesWithAI(subtitles, apiKey, model, progressCallback);
    log(`✅ Subtitles processed: ${content.length} content items created`);
  } catch (error) {
    logError('Failed to process subtitles', error);
    const uiLang = await getUILanguageCached();
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(tSync('errorSubtitleProcessingFailed', uiLang).replace('{error}', errorMsg));
  }
  
  updateState({ progress: 40 });
  
  // Return result in standard format for continueProcessingPipeline
  return {
    title: metadata.title || data.title || 'Untitled',
    author: metadata.author || '',
    content: content,
    publishDate: metadata.publishDate || ''
  };
}

