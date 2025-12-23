// Video page processing module for ClipAIble extension
// Handles processing of video pages (YouTube/Vimeo) - extracts subtitles and processes with AI

// @ts-check

// @typedef {import('../types.js').ProcessingData} ProcessingData

import { log, logError } from '../utils/logging.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractYouTubeSubtitles, extractVimeoSubtitles } from '../extraction/video-subtitles.js';
import { processSubtitlesWithAI } from '../extraction/video-processor.js';
import { checkCancellation, updateProgress, getUILanguageCached } from '../utils/pipeline-helpers.js';
import { tSync } from '../locales.js';

/**
 * Process video page (YouTube/Vimeo) - extract subtitles, process with AI
 * @param {ProcessingData} data - Processing data
 * @param {Object} videoInfo - {platform: 'youtube'|'vimeo', videoId: string}
 * @returns {Promise<Object>} {title, author, content, publishDate}
 */
export async function processVideoPage(data, videoInfo) {
  const { platform, videoId } = videoInfo;
  const { url, tabId, apiKey, model } = data;
  
  log('Processing video page', { platform, videoId, url });
  
  // Check if processing was cancelled before video processing
  await checkCancellation('video processing');
  
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
    
    log('Subtitles extracted', { count: subtitles.length, title: metadata.title });
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
    
    content = await processSubtitlesWithAI(subtitles, apiKey, model, progressCallback);
    log('Subtitles processed', { contentItems: content.length });
  } catch (error) {
    logError('Failed to process subtitles', error);
    throw new Error(`Failed to process subtitles: ${error.message}`);
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

