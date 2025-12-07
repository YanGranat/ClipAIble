// Content script for ClipAIble extension
// This script is injected into web pages to extract content

(function() {
  'use strict';

  // Extract page content and metadata
  function extractPageContent() {
    // Get the full HTML
    const html = document.documentElement.outerHTML;
    
    // Get page metadata
    const metadata = {
      title: document.title,
      url: window.location.href,
      description: getMetaContent('description'),
      author: getMetaContent('author'),
      publishDate: getMetaContent('article:published_time') || 
                   getMetaContent('datePublished') ||
                   getMetaContent('date')
    };

    // Get all images with absolute URLs
    const images = Array.from(document.querySelectorAll('img'))
      .filter(img => img.src && !isTrackingPixel(img))
      .map(img => ({
        src: img.src,
        alt: img.alt || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      }));

    return {
      html: html,
      metadata: metadata,
      images: images
    };
  }

  // Get meta tag content by name or property
  function getMetaContent(name) {
    const meta = document.querySelector(
      `meta[name="${name}"], meta[property="${name}"], meta[itemprop="${name}"]`
    );
    return meta ? meta.content : null;
  }

  // Check if image is likely a tracking pixel
  function isTrackingPixel(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    // Tracking pixels are usually 1x1 or very small
    if (width <= 3 && height <= 3) return true;
    
    // Check for common tracking pixel patterns in src
    const src = img.src.toLowerCase();
    const trackingPatterns = [
      'pixel', 'tracking', 'beacon', 'analytics',
      'facebook.com/tr', 'doubleclick', 'googleads'
    ];
    
    return trackingPatterns.some(pattern => src.includes(pattern));
  }

  // Listen for extraction requests
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      const content = extractPageContent();
      sendResponse(content);
    }
    return true;
  });

  // Make function available for direct injection
  window.__webpageToPdf_extractContent = extractPageContent;
})();

