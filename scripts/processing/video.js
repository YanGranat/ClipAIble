// Video page processing module for ClipAIble extension
// Handles processing of video pages (YouTube/Vimeo) - extracts subtitles and processes with AI

// @ts-check

import { log, logError, logWarn } from '../utils/logging.js';
import { tSync } from '../locales.js';
import { checkCancellation, updateProgress, getUILanguageCached } from '../utils/pipeline-helpers.js';
import { PROCESSING_STAGES, updateState } from '../state/processing.js';
import { extractYouTubeSubtitles, extractVimeoSubtitles } from '../extraction/video-subtitles.js';
import { processSubtitlesWithAI } from '../extraction/video-processor.js';
import { detectSourceLanguage, detectContentLanguage } from '../translation/detection.js';

/**
 * Process video page (YouTube/Vimeo) - extract subtitles, process with AI
 * @param {import('../types.js').ProcessingData} data - Processing data
 * @param {{platform: 'youtube'|'vimeo', videoId: string}} videoInfo - Video information
 * @returns {Promise<{title: string, author: string, content: import('../types.js').ContentItem[], publishDate: string, detectedLanguage: string}>} Processed video data
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
  let detectedVideoLanguage = 'en'; // Default to English

  // CRITICAL: AI-based language detection from video metadata (title, description)
  // This ensures we get subtitles in the correct language (same as article language detection)
  try {
    log('🌍 Detecting video language via AI analysis of metadata');

    const metadataResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        // CRITICAL: Wait for page to be ready before extracting metadata
        return new Promise((resolve) => {
          const extractMetadata = () => {
            // Check if essential YouTube elements are loaded
            const titleSelectors = [
              'h1.ytd-watch-metadata yt-formatted-string',
              'h1.ytd-video-primary-info-renderer yt-formatted-string',
              'h1 yt-formatted-string.ytd-watch-metadata',
              'ytd-watch-metadata h1',
              'h1.title'
            ];

            const descriptionSelectors = [
              '#description yt-formatted-string',
              'ytd-text-inline-expander#description yt-formatted-string',
              '#description-inline-expander yt-formatted-string',
              'yt-formatted-string.content'
            ];

            let title = document.title || '';
            let description = '';

            // Try to get title from various selectors
            for (const selector of titleSelectors) {
              const el = document.querySelector(selector);
              if (el?.textContent?.trim()) {
                title = el.textContent.trim();
                break;
              }
            }

            // Try to get description from various selectors
            for (const selector of descriptionSelectors) {
              const el = document.querySelector(selector);
              if (el?.textContent?.trim()) {
                description = el.textContent.trim();
                break;
              }
            }

            // Return immediately if we have at least title
            if (title && title !== 'YouTube') {
              resolve({ title, description });
            } else if (document.readyState === 'complete') {
              // Page is fully loaded but no title found - use document.title as fallback
              resolve({ title: document.title || 'Untitled', description });
            } else {
              // Not ready yet, wait a bit
              setTimeout(extractMetadata, 300);
            }
          };

          // Start extraction
          if (document.readyState === 'complete') {
            extractMetadata();
          } else {
            window.addEventListener('load', extractMetadata);
          }
        });
      }
    });

    const videoMetadata = metadataResults?.[0]?.result;
    if (videoMetadata?.title && videoMetadata.title !== 'YouTube') {
      // Use AI to detect video language from title and description
      const textForDetection = `${videoMetadata.title}\n${videoMetadata.description || ''}`;
      const contentForAI = [{ type: 'text', text: textForDetection }];

      detectedVideoLanguage = await detectContentLanguage(contentForAI, apiKey, model);
      log('🌍 Video language detected via AI', {
        detectedVideoLanguage,
        title: videoMetadata.title,
        descriptionLength: videoMetadata.description?.length || 0,
        method: 'AI analysis of video metadata'
      });
    } else {
      logWarn('Could not extract video metadata, using default language', {
        metadata: videoMetadata
      });
    }
  } catch (error) {
    logWarn('Failed to detect video language via AI, using default', error);
  }

  // Try to extract subtitles
  // CRITICAL: Pass both target language and AI-detected video language to subtitle extraction
  try {
    const subtitlesData = platform === 'youtube'
      ? await extractYouTubeSubtitles(tabId, data.targetLanguage, detectedVideoLanguage)
      : await extractVimeoSubtitles(tabId, data.targetLanguage, detectedVideoLanguage);

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
  
  // Detect language from subtitles content
  let detectedLanguage = 'en'; // Default to English for YouTube
  try {
    // Extract text from first few subtitles for language detection
    const textSample = subtitles.slice(0, 10).map(s => s.text).join(' ');
    if (textSample.length > 50) {
      detectedLanguage = detectSourceLanguage([{ type: 'text', text: textSample }]);
      log('🌍 Video language detected', { 
        detectedLanguage,
        method: 'subtitle analysis',
        sampleLength: textSample.length
      });
    }
  } catch (error) {
    logWarn('Failed to detect video language, using default', error);
  }

  // Return result in standard format for continueProcessingPipeline
  return {
    title: metadata.title || data.title || 'Untitled',
    author: metadata.author || '',
    content: content,
    publishDate: metadata.publishDate || '',
    detectedLanguage: detectedLanguage
  };
}

