// @ts-check
// Image utility functions for ClipAIble extension

import { log, logWarn, logError } from '../logging.js';
import { getUILanguage, formatStatusUpdate } from '../../locales.js';
import { isValidExternalUrl } from '../security.js';
import { MAX_IMAGE_BYTES, detectImageMime, imageDataError, imageDataUrlBytes, readImageBytes } from './image-bytes.js';
import { normalizeImageBlob } from '../../api/image-rasterization.js';
import { getProcessingSignal } from '../../state/processing.js';
import { CONFIG } from '../config.js';

/**
 * Get localized loading images status
 * @param {number} processed - Number of processed images
 * @param {number} total - Total number of images
 * @returns {Promise<Object>} Localized status with its message identity
 */
async function getLocalizedLoadingStatus(processed, total) {
  try {
    const uiLang = await getUILanguage();
    return formatStatusUpdate('statusLoadingImagesProgress', uiLang, { current: processed, total });
  } catch (error) {
    // Fallback to English if localization fails
    return formatStatusUpdate('statusLoadingImagesProgress', 'en', { current: processed, total });
  }
}

/**
 * Convert image URL to base64 data URL
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} Base64 data URL or null if failed
 */
async function fetchImageResponse(url, signal) {
  let current = url;
  for (let redirects = 0; redirects <= 20; redirects++) {
    if (!isValidExternalUrl(current)) throw imageDataError('IMAGE_UNSAFE_URL');
    const response = await fetch(current, { mode: 'cors', credentials: 'omit', redirect: 'manual', signal, headers: { Accept: 'image/*' } });
    if (response.type === 'opaqueredirect') throw imageDataError('IMAGE_UNSAFE_REDIRECT');
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw imageDataError('IMAGE_UNSAFE_REDIRECT');
      current = new URL(location, current).href;
      continue;
    }
    if (response.url && !isValidExternalUrl(response.url)) throw imageDataError('IMAGE_UNSAFE_URL');
    if (!response.ok) throw imageDataError('IMAGE_FETCH_FAILED');
    return response;
  }
  throw imageDataError('IMAGE_UNSAFE_REDIRECT');
}

export async function imageToBase64(url, options = {}) {
  if (!url || typeof url !== 'string') return null;
  const controller = new AbortController();
  const signals = [options.signal, options.processingRunId ? getProcessingSignal(options.processingRunId) : null].filter(Boolean);
  const abort = () => controller.abort(signals.find(signal => signal.aborted)?.reason);
  for (const signal of signals) signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(imageDataError('IMAGE_TIMEOUT')), CONFIG.API_TIMEOUT_MS);
  try {
    if (signals.some(signal => signal.aborted)) abort();
    if (controller.signal.aborted) throw controller.signal.reason;
    const requestOptions = { ...options, signal: controller.signal };
    let bytes;
    if (/^data:/i.test(url)) bytes = imageDataUrlBytes(url);
    else {
      if (!isValidExternalUrl(url)) throw imageDataError('IMAGE_UNSAFE_URL');
      let cleanUrl = url;
      if (url.includes('substackcdn.com/image/fetch')) {
        const inner = url.match(/https%3A%2F%2F[^,\s]+/);
        if (inner) {
          try { cleanUrl = decodeURIComponent(inner[0]); } catch { cleanUrl = url; }
        }
      }
      if (!isValidExternalUrl(cleanUrl)) throw imageDataError('IMAGE_UNSAFE_URL');
      let response;
      try { response = await fetchImageResponse(cleanUrl, controller.signal); }
      catch (error) {
        if (controller.signal.aborted || cleanUrl === url || error.code === 'IMAGE_UNSAFE_URL' || error.code === 'IMAGE_UNSAFE_REDIRECT') throw error;
        response = await fetchImageResponse(url, controller.signal);
      }
      bytes = await readImageBytes(response);
    }
    if (controller.signal.aborted) throw controller.signal.reason;
    const mime = detectImageMime(bytes);
    let blob;
    try { blob = await normalizeImageBlob(new Blob([bytes], { type: mime }), requestOptions); }
    catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (typeof error?.code === 'string' && error.code.startsWith('IMAGE_')) throw error;
      throw Object.assign(imageDataError('IMAGE_RASTERIZATION_FAILED'), { cause: error });
    }
    const result = await blobToBase64(blob);
    if (controller.signal.aborted) throw controller.signal.reason;
    return result;
  } finally {
    clearTimeout(timeout);
    for (const signal of signals) signal.removeEventListener('abort', abort);
  }
}

export async function blobToBase64(blob) {
  if (!blob || !Number.isFinite(blob.size) || blob.size > MAX_IMAGE_BYTES) throw imageDataError('IMAGE_TOO_LARGE');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = detectImageMime(bytes);
  if (mime === 'image/svg+xml') throw imageDataError('IMAGE_REQUIRES_RASTERIZATION');
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Process images in parallel batches with concurrency limit
 * Generic function for parallel image loading
 * @param {Array} images - Array of image items to process
 * @param {number} concurrency - Maximum number of concurrent downloads
 * @param {import('../../types.js').UpdateStateFunction} updateState - State update function
 * @param {import('../../types.js').ProcessImageFunction} processImage - Function to process each image (img, index) => Promise<result>
 * @returns {Promise<Array>} Array of results from processImage
 */
export async function processImagesInBatches(images, concurrency, updateState, processImage) {
  const startTime = Date.now();
  const results = [];
  const total = images.length;
  let processed = 0;
  
  log('📊 Starting parallel image processing', {
    totalImages: total,
    concurrency: concurrency,
    batches: Math.ceil(total / concurrency),
    estimatedTime: `${Math.ceil(total / concurrency * 2)}s (rough estimate)`
  });
  
  // Process images in batches
  for (let i = 0; i < images.length; i += concurrency) {
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(images.length / concurrency);
    const batch = images.slice(i, i + concurrency);
    const batchStartTime = Date.now();
    
    log(`📦 Processing image batch ${batchNum}/${totalBatches}`, {
      batchSize: batch.length,
      imagesInBatch: `${i + 1}-${Math.min(i + concurrency, total)}`,
      concurrency: concurrency
    });
    
    const batchPromises = batch.map(async (img, batchIndex) => {
      const globalIndex = i + batchIndex;
      
      try {
        const result = await processImage(img, globalIndex);
        processed++;
        
        if (updateState) {
          updateState({ 
            ...await getLocalizedLoadingStatus(processed, total),
            progress: 82 + Math.floor((processed / total) * 13) 
          });
        }
        
        return result;
      } catch (e) {
        processed++;
        logWarn(`Image ${globalIndex + 1} processing failed`, { error: e.message });
        if (updateState) {
          updateState({ 
            ...await getLocalizedLoadingStatus(processed, total),
            progress: 82 + Math.floor((processed / total) * 13) 
          });
        }
        return { img, base64: null, index: globalIndex, error: e.message, errorCode: e.code };
      }
    });
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    const batchDuration = Date.now() - batchStartTime;
    const successful = batchResults.filter(r => !r.error).length;
    const failed = batchResults.filter(r => r.error).length;
    
    log(`✅ Batch ${batchNum}/${totalBatches} complete`, {
      duration: `${batchDuration}ms`,
      successful: successful,
      failed: failed,
      avgTimePerImage: `${Math.round(batchDuration / batch.length)}ms`
    });
    
    results.push(...batchResults);
  }
  
  const totalDuration = Date.now() - startTime;
  const totalSuccessful = results.filter(r => !r.error).length;
  const totalFailed = results.filter(r => r.error).length;
  
  log('📊 Image processing complete', {
    totalDuration: `${totalDuration}ms`,
    totalSuccessful: totalSuccessful,
    totalFailed: totalFailed,
    avgTimePerImage: `${Math.round(totalDuration / total)}ms`,
    throughput: `${(total / (totalDuration / 1000)).toFixed(1)} images/sec`
  });
  
  return results;
}

/**
 * Process images in parallel batches with concurrency limit (for embedImages)
 * @param {Array} images - Array of image items to process
 * @param {number} concurrency - Maximum number of concurrent downloads
 * @param {import('../../types.js').UpdateStateFunction} updateState - State update function
 * @returns {Promise<Array>} Array of {img, base64, index} results
 */
async function processImagesInBatchesForEmbed(images, concurrency, updateState, options) {
  return processImagesInBatches(images, concurrency, updateState, async (img, globalIndex) => {
    log(`Loading image ${globalIndex + 1}`, { src: String(img.src || '').substring(0, 100) });
    const base64 = await imageToBase64(img.src, options);
    return { img, base64, index: globalIndex };
  });
}

/**
 * Embed images in HTML content by replacing URLs with base64
 * Uses parallel loading with concurrency limit for better performance
 * @param {string} html - HTML content
 * @param {Array} content - Content array with image items
 * @param {import('../../types.js').UpdateStateFunction} updateState - State update function
 * @param {import('../../types.js').EscapeAttrFunction} escapeAttr - Attribute escape function
 * @returns {Promise<string>} HTML with embedded images
 */
export async function embedImages(html, content, updateState, escapeAttr, options = {}) {
  log('embedImages called', { 
    contentLength: content?.length || 0,
    contentTypes: content ? content.map(item => item?.type).filter(Boolean) : []
  });
  
  const images = content.filter(item => item.type === 'image');
  log('embedImages', { 
    imageCount: images.length,
    imageSources: images.map(img => img.src?.substring(0, 80) || 'no src')
  });
  
  if (images.length === 0) {
    log('No images to embed', { 
      totalContentItems: content?.length || 0,
      contentTypes: content ? [...new Set(content.map(item => item?.type).filter(Boolean))] : []
    });
    return html;
  }
  
  // Use parallel loading with concurrency limit (8 images at once)
  const CONCURRENCY = 8;
  
  if (updateState) {
    updateState({ 
      ...formatStatusUpdate('statusLoadingImagesCount', await getUILanguage(), { count: images.length }),
      progress: 82 
    });
  }
  
  // Process all images in parallel batches
  const results = await processImagesInBatchesForEmbed(images, CONCURRENCY, updateState, options);
  if (options.signal?.aborted) throw options.signal.reason;
  if (options.processingRunId && getProcessingSignal(options.processingRunId).aborted) {
    throw getProcessingSignal(options.processingRunId).reason;
  }
  const rejected = results.find(result => typeof result.errorCode === 'string' && result.errorCode.startsWith('IMAGE_') && result.errorCode !== 'IMAGE_FETCH_FAILED');
  if (rejected) throw imageDataError(rejected.errorCode);
  
  // Replace URLs in HTML
  let result = html;
  let embedded = 0;
  let failed = 0;
  
  for (const { img, base64, index } of results) {
    if (!base64) {
      failed++;
      continue;
    }
    
    try {
      // CRITICAL: Use data-original-src for matching because it contains the original URL
      // The src attribute may have escaped characters (like &amp;) that don't match the original URL
      const escapedSrc = escapeAttr(img.src);
      const regexSafe = escapedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // First, try to find by data-original-src (more reliable - contains original URL)
      const dataAttrRegex = new RegExp(`data-original-src="${regexSafe}"`, 'g');
      if (dataAttrRegex.test(result)) {
        // Found by data-original-src - replace the src attribute while keeping data-original-src
        result = result.replace(
          new RegExp(`(src="[^"]*")([^>]*data-original-src="${regexSafe}")`, 'g'),
          (match, src, rest) => `src="${escapeAttr(base64)}"${rest}`
        );
        embedded++;
        log(`Image ${index + 1} embedded via data-original-src`);
      } else {
        // Fallback: try to find by src attribute (may have escaped characters)
        const regex = new RegExp(`src="${regexSafe}"`, 'g');
        const beforeLength = result.length;
        result = result.replace(regex, () => `src="${escapeAttr(base64)}"`);
        
        if (result.length !== beforeLength) {
          embedded++;
          log(`Image ${index + 1} embedded successfully`);
        } else {
          logWarn(`Image ${index + 1} src not found in HTML`, { 
            escapedSrc: escapedSrc.substring(0, 100),
            originalSrc: img.src.substring(0, 100)
          });
          failed++;
        }
      }
    } catch (e) {
      failed++;
      logWarn(`Image ${index + 1} embed failed`, { src: img.src, error: e.message });
    }
  }
  
  log('embedImages complete', { embedded, failed, total: images.length });
  return result;
}


