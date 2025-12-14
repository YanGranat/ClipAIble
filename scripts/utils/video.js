// Video platform detection utilities

/**
 * Check if URL is a video page (YouTube/Vimeo)
 * @param {string} url - Page URL
 * @returns {Object|null} {platform: 'youtube'|'vimeo', videoId: string} or null
 */
export function detectVideoPlatform(url) {
  if (!url) return null;
  
  // YouTube patterns
  const youtubePatterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/
  ];

  // Vimeo patterns
  const vimeoPatterns = [
    /^https?:\/\/(www\.)?vimeo\.com\/\d+/
  ];

  // Check YouTube
  for (const pattern of youtubePatterns) {
    const match = url.match(pattern);
    if (match) {
      let videoId;
      if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0]?.split('/')[0];
      } else if (url.includes('watch?v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
      } else {
        videoId = url.split('/').pop()?.split('?')[0];
      }
      if (videoId) {
        return { platform: 'youtube', videoId };
      }
    }
  }

  // Check Vimeo
  for (const pattern of vimeoPatterns) {
    const match = url.match(pattern);
    if (match) {
      const videoIdMatch = url.match(/\/(\d+)/);
      if (videoIdMatch && videoIdMatch[1]) {
        return { platform: 'vimeo', videoId: videoIdMatch[1] };
      }
    }
  }

  return null;
}

/**
 * Check if URL is a video page
 * @param {string} url - Page URL
 * @returns {boolean}
 */
export function isVideoPage(url) {
  return detectVideoPlatform(url) !== null;
}
