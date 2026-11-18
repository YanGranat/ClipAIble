// @ts-check
// Video platform detection utilities

/**
 * Check if URL is a video page (YouTube/Vimeo)
 * @param {string} url - Page URL
 * @returns {Object|null} {platform: 'youtube'|'vimeo', videoId: string} or null
 */
export function detectVideoPlatform(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname;
    let videoId = null;
    if (host === 'youtu.be') {
      videoId = parsed.pathname.match(/^\/([^/]+)\/?$/)?.[1];
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      videoId = parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
    } else if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      videoId = parsed.pathname.match(/^\/(\d+)(?:\/|$)/)?.[1];
      return videoId ? { platform: 'vimeo', videoId } : null;
    }
    return videoId && /^[\w-]+$/.test(videoId) ? { platform: 'youtube', videoId } : null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a video page
 * @param {string} url - Page URL
 * @returns {boolean}
 */
export function isVideoPage(url) {
  return detectVideoPlatform(url) !== null;
}
