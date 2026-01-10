// @ts-check
// Image utility functions for ClipAIble extension

import { log, logWarn, logError } from '../logging.js';
import { getUILanguage, tSync } from '../../locales.js';
import { isValidExternalUrl } from '../security.js';

/**
 * Get localized loading images status
 * @param {number} processed - Number of processed images
 * @param {number} total - Total number of images
 * @returns {Promise<string>} Localized status string
 */
async function getLocalizedLoadingStatus(processed, total) {
  try {
    const uiLang = await getUILanguage();
    const baseStatus = tSync('stageLoadingImages', uiLang);
    return `${baseStatus} ${processed}/${total}...`;
  } catch (error) {
    // Fallback to English if localization fails
    return `Loading images ${processed}/${total}...`;
  }
}

/**
 * Convert image URL to base64 data URL
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} Base64 data URL or null if failed
 */
export async function imageToBase64(url) {
  log('imageToBase64', { url: url.substring(0, 100) });
  
  // SECURITY: Validate URL to prevent SSRF attacks
  if (!url || typeof url !== 'string') {
    logError('Invalid image URL', { url: url?.substring(0, 100) });
    return null;
  }
  
  // Skip validation for data URLs (already base64 encoded images)
  if (url.startsWith('data:')) {
    log('Image is already base64 data URL, skipping fetch');
    return url;
  }
  
  // Clean up URL - some sites use special characters that need encoding
  let cleanUrl = url;
  try {
    // For Substack CDN URLs, extract the actual S3 image URL for best quality
    if (url.includes('substackcdn.com/image/fetch')) {
      const s3Match = url.match(/https%3A%2F%2Fsubstack-post-media\.s3\.amazonaws\.com[^,\s]+/);
      if (s3Match) {
        cleanUrl = decodeURIComponent(s3Match[0]);
        log('Extracted S3 URL from Substack CDN', { cleanUrl: cleanUrl.substring(0, 100) });
      } else {
        const match = url.match(/https%3A%2F%2F[^,\s]+/);
        if (match) {
          cleanUrl = decodeURIComponent(match[0]);
          log('Extracted inner URL from Substack CDN', { cleanUrl: cleanUrl.substring(0, 100) });
        }
      }
    } else if (url.includes('substack-post-media.s3.amazonaws.com')) {
      cleanUrl = url;
      log('Using direct S3 URL', { cleanUrl: cleanUrl.substring(0, 100) });
    }
  } catch (e) {
    log('URL cleanup failed, using original', { error: e.message });
  }
  
  // SECURITY: Validate cleaned URL is safe
  if (!isValidExternalUrl(cleanUrl)) {
    logError('Blocked unsafe image URL', { url: cleanUrl.substring(0, 100) });
    return null;
  }
  
  try {
    const response = await fetch(cleanUrl, { 
      mode: 'cors', 
      credentials: 'omit',
      headers: {
        'Accept': 'image/*'
      }
    });
    
    if (!response.ok) {
      logWarn('Image fetch failed', { url: cleanUrl, status: response.status });
      
      // Try original URL if cleaned URL failed
      if (cleanUrl !== url) {
        log('Retrying with original URL');
        const retryResponse = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (retryResponse.ok) {
          const blob = await retryResponse.blob();
          return blobToBase64(blob);
        }
      }
      return null;
    }
    
    const blob = await response.blob();
    log('Image blob received', { size: blob.size, type: blob.type });
    
    return blobToBase64(blob);
  } catch (e) {
    logWarn('imageToBase64 failed', { url: cleanUrl, error: e.message });
    
    // Try original URL if cleaned URL failed
    if (cleanUrl !== url) {
      try {
        log('Retrying with original URL after error');
        const retryResponse = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (retryResponse.ok) {
          const blob = await retryResponse.blob();
          return blobToBase64(blob);
        }
      } catch (e2) {
        logWarn('Retry also failed', { error: e2.message });
      }
    }
    return null;
  }
}

/**
 * Convert blob to base64 data URL
 * @param {Blob} blob - Image blob
 * @returns {Promise<string>} Base64 data URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      /** @type {import('../../types.js').FileReaderResult} */
      const result = reader.result;
      if (result && typeof result === 'string') {
        log('Image converted to base64', { length: result.length });
        resolve(result);
      } else {
        reject(new Error('Failed to convert image to base64'));
      }
    };
    reader.onerror = (e) => {
      logError('FileReader error', e);
      reject(e);
    };
    reader.readAsDataURL(blob);
  });
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
            status: await getLocalizedLoadingStatus(processed, total), 
            progress: 82 + Math.floor((processed / total) * 13) 
          });
        }
        
        return result;
      } catch (e) {
        processed++;
        logWarn(`Image ${globalIndex + 1} processing failed`, { error: e.message });
        if (updateState) {
          updateState({ 
            status: await getLocalizedLoadingStatus(processed, total), 
            progress: 82 + Math.floor((processed / total) * 13) 
          });
        }
        return { img, base64: null, index: globalIndex, error: e.message };
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
async function processImagesInBatchesForEmbed(images, concurrency, updateState) {
  return processImagesInBatches(images, concurrency, updateState, async (img, globalIndex) => {
    // Skip if already base64
    if (img.src.startsWith('data:')) {
      log(`Image ${globalIndex + 1} already base64, skipping fetch`);
      return { img, base64: img.src, index: globalIndex };
    }
    
    log(`Fetching image ${globalIndex + 1}`, { src: img.src.substring(0, 100) });
    const base64 = await imageToBase64(img.src);
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
export async function embedImages(html, content, updateState, escapeAttr) {
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
      status: `Loading ${images.length} images...`, 
      progress: 82 
    });
  }
  
  // Process all images in parallel batches
  const results = await processImagesInBatchesForEmbed(images, CONCURRENCY, updateState);
  
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
      const escapedSrc = escapeAttr(img.src);
      const regexSafe = escapedSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`src="${regexSafe}"`, 'g');
      const beforeLength = result.length;
      result = result.replace(regex, `src="${base64}"`);
      
      if (result.length !== beforeLength) {
        embedded++;
        log(`Image ${index + 1} embedded successfully`);
      } else {
        // Try alternative: search by data-original-src
        const dataAttrRegex = new RegExp(`data-original-src="${regexSafe}"`, 'g');
        if (dataAttrRegex.test(result)) {
          result = result.replace(
            new RegExp(`src="[^"]*"([^>]*data-original-src="${regexSafe}")`, 'g'),
            `src="${base64}"$1`
          );
          embedded++;
          log(`Image ${index + 1} embedded via data-original-src`);
        } else {
          logWarn(`Image ${index + 1} src not found in HTML`, { escapedSrc: escapedSrc.substring(0, 100) });
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


