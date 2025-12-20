// Content size thresholds and constants
// Centralized constants to avoid magic numbers

/**
 * Minimum content length thresholds
 */
export const CONTENT_THRESHOLDS = {
  // Minimum length for valid content
  MIN_CONTENT_LENGTH: 100,
  
  // Length for "substantial" content (main article)
  SUBSTANTIAL_CONTENT_LENGTH: 500,
  
  // Minimum paragraph length
  MIN_PARAGRAPH_LENGTH: 10,
  
  // Minimum heading length
  MIN_HEADING_LENGTH: 3,
  
  // Standfirst/subtitle length range
  MIN_STANDFIRST_LENGTH: 50,
  MAX_STANDFIRST_LENGTH: 500,
  
  // Short paragraph threshold (for navigation detection)
  SHORT_PARAGRAPH_THRESHOLD: 200,
  
  // Very short paragraph (likely metadata)
  VERY_SHORT_PARAGRAPH: 100,
  
  // Author metadata max length
  MAX_AUTHOR_METADATA_LENGTH: 100,
  
  // Word count metadata max length
  MAX_WORD_COUNT_METADATA_LENGTH: 150
};

/**
 * Image size thresholds
 */
export const IMAGE_THRESHOLDS = {
  // Minimum dimensions for featured image
  FEATURED_IMAGE_MIN_WIDTH: 400,
  FEATURED_IMAGE_MIN_HEIGHT: 300,
  
  // Author photo dimensions (typically small)
  AUTHOR_PHOTO_MAX_SIZE: 250,
  AUTHOR_PHOTO_SMALL_SIZE: 150,
  
  // Tracking pixel max size
  TRACKING_PIXEL_MAX_SIZE: 3,
  
  // Small icon max size
  SMALL_ICON_MAX_SIZE: 50,
  
  // Very small image (likely decorative)
  VERY_SMALL_IMAGE_SIZE: 100
};

/**
 * Content scoring thresholds
 */
export const SCORING_THRESHOLDS = {
  // Minimum score for content candidate
  MIN_CONTENT_SCORE: 10,
  
  // Good enough score (early exit)
  GOOD_ENOUGH_SCORE: 100,
  
  // Link density thresholds
  HIGH_LINK_DENSITY: 1.0,
  MEDIUM_LINK_DENSITY: 0.7,
  LOW_LINK_DENSITY: 0.5,
  
  // Comma count bonuses
  HIGH_COMMA_COUNT: 10,
  MEDIUM_COMMA_COUNT: 5,
  
  // Sentence count bonus threshold
  MIN_SENTENCE_COUNT: 5
};

/**
 * Content container selectors
 */
export const CONTENT_SELECTORS = [
  '[role="main"]',
  '.article-content', '.post-content', '.entry-content', '.content',
  '.post-body', '.article-body', '.entry-body',
  '#content', '#main-content', '#article-content',
  '.wp-block-post-content', '.entry', '.post',
  // Additional common patterns
  '.prose', '.article-text', '.story-body', '.article-body-content',
  '.wysiwyg', '.wysiwyg--all-content', // Al Jazeera uses this
  '[class*="article"]', '[class*="content"]', '[id*="article"]', '[id*="content"]'
];

/**
 * Standfirst/subtitle selectors
 */
export const STANDFIRST_SELECTORS = [
  '.standfirst', '.subtitle', '.deck', '.lede', '.intro', '.article__subhead',
  '[class*="standfirst"]', '[class*="subtitle"]', '[class*="deck"]',
  '[class*="intro"]', '[class*="summary"]', '[class*="subhead"]'
];

/**
 * Author selectors
 */
export const AUTHOR_SELECTORS = [
  'meta[name="author"]',
  'meta[name="citation_author"]', // Noema uses this
  'meta[property="article:author"]',
  '[rel="author"]',
  '.author', '.byline', '.meta-author', '.meta-text.meta-author',
  '[itemprop="author"]',
  'a[rel="author"]',
  'a[href*="/author/"]', // Link to author page
  'a[href*="/profile/"]' // Link to profile page (The Guardian uses this)
];

/**
 * Date selectors
 */
export const DATE_SELECTORS = [
  'meta[property="article:published_time"]',
  'meta[name="datePublished"]',
  'meta[name="date"]',
  'meta[name="citation_date"]', // Noema uses this
  'time[datetime]',
  'time[pubdate]',
  '[itemprop="datePublished"]',
  '.published', '.date', '.meta-date', '.meta-text.meta-date', 'span.meta-date'
];

/**
 * Featured image selectors
 */
export const FEATURED_IMAGE_SELECTORS = [
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  'meta[property="article:image"]',
  'meta[name="image"]',
  '[itemprop="image"]'
];

