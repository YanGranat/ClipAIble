// @ts-check
// Type definitions for automatic extraction
// These types define the shape of extraction results and internal data structures

/**
 * @typedef {Object} ContentItem
 * @property {'paragraph'|'heading'|'image'|'quote'|'code'|'list'|'subtitle'} type - Content type
 * @property {string} [text] - Text content
 * @property {string} [html] - HTML content for paragraphs
 * @property {number} [level] - Heading level (1-6)
 * @property {string} [id] - Element ID
 * @property {string} [src] - Image source URL
 * @property {string} [alt] - Image alt text
 * @property {string} [caption] - Image caption
 * @property {boolean} [isFeatured] - Whether image is featured
 * @property {boolean} [isStandfirst] - Whether subtitle is standfirst
 * @property {string} [language] - Code language
 * @property {boolean} [ordered] - Whether list is ordered
 * @property {string[]} [items] - List items
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {string} title - Article title
 * @property {string} author - Article author
 * @property {string} publishDate - Publication date (ISO format)
 * @property {ContentItem[]} content - Extracted content items
 * @property {DebugInfo|null} debugInfo - Debug information (if enabled)
 * @property {string} [error] - Error message (if extraction failed)
 * @property {string} [errorStack] - Error stack trace (if extraction failed)
 */

/**
 * @typedef {Object} DebugInfo
 * @property {number} foundElements - Number of elements found
 * @property {number} filteredElements - Number of elements after filtering
 * @property {number} imageCount - Number of images found
 * @property {number} excludedImageCount - Number of excluded images
 * @property {number} processedCount - Number of processed elements
 * @property {number} skippedCount - Number of skipped elements
 * @property {Object<string, number>} contentTypes - Count of each content type
 * @property {Array<{type: string, data?: any, message?: string}>} extractionLogs - Extraction logs
 * @property {PageInfo} pageInfo - Page information
 * @property {Object<string, string>} metaTags - Meta tags
 * @property {DocumentStructure} documentStructure - Document structure info
 * @property {MainContentPreview} mainContentPreview - Main content preview
 * @property {string|null} documentHTMLFull - Full document HTML
 * @property {string|null} bodyHTMLFull - Full body HTML
 * @property {GoogleTranslateState|null} googleTranslateState - Google Translate state
 * @property {FirstParagraphCheck|null} firstParagraphCheck - First paragraph check
 */

/**
 * @typedef {Object} PageInfo
 * @property {string} url - Page URL
 * @property {string} title - Page title
 * @property {string} baseUrl - Base URL
 * @property {string} documentLang - Document language
 * @property {string|null} documentXmlLang - Document XML language
 * @property {string} bodyClasses - Body class names
 * @property {string} bodyLang - Body language
 * @property {boolean} hasGoogleTranslate - Whether page has Google Translate widget
 * @property {boolean} isTranslated - Whether page is translated
 * @property {number} timestamp - Timestamp
 */

/**
 * @typedef {Object} DocumentStructure
 * @property {boolean} hasArticle - Whether page has article element
 * @property {boolean} hasMain - Whether page has main element
 * @property {boolean} hasHeader - Whether page has header element
 * @property {boolean} hasFooter - Whether page has footer element
 * @property {boolean} hasNav - Whether page has nav element
 * @property {boolean} hasAside - Whether page has aside element
 * @property {number} allParagraphsCount - Total paragraph count
 * @property {number} allHeadingsCount - Total heading count
 * @property {number} allImagesCount - Total image count
 */

/**
 * @typedef {Object} MainContentPreview
 * @property {boolean} hasMain - Whether main content was found
 * @property {string|undefined} mainTagName - Main element tag name
 * @property {string|undefined} mainClassName - Main element class name
 * @property {string|undefined} mainId - Main element ID
 * @property {number} mainTextLength - Main content text length
 * @property {string|null} mainTextFull - Full main content text
 * @property {string|null} mainHTMLFull - Full main content HTML
 * @property {number} childCount - Main element child count
 */

/**
 * @typedef {Object} GoogleTranslateState
 * @property {boolean} hasGoogleTranslateWidget - Whether Google Translate widget exists
 * @property {boolean} isTranslated - Whether page is translated
 * @property {boolean} hasOriginalTextAttrs - Whether page has data-original-text attributes
 * @property {boolean} hasGtOrigAttrs - Whether page has data-gt-orig-display attributes
 * @property {number} originalTextAttrsCount - Count of data-original-text attributes
 * @property {number} gtOrigAttrsCount - Count of data-gt-orig-display attributes
 * @property {string} bodyClasses - Body class names
 * @property {number} timestamp - Timestamp
 * @property {string} [error] - Error message if check failed
 */

/**
 * @typedef {Object} FirstParagraphCheck
 * @property {boolean} hasOriginalTextAttr - Whether first paragraph has data-original-text
 * @property {boolean} hasGtOrigAttr - Whether first paragraph has data-gt-orig-display
 * @property {string|null} originalTextFull - Original text (full)
 * @property {string|null} currentTextFull - Current text (full)
 * @property {string|null} elementHTMLFull - Element HTML (full)
 * @property {boolean} textsMatch - Whether original and current text match
 * @property {number} timestamp - Timestamp
 */

/**
 * @typedef {Object} ExtractionContext
 * @property {Window} window - Window object
 * @property {Document} document - Document object
 * @property {string} baseUrl - Base URL for resolving relative URLs
 * @property {boolean} enableDebugInfo - Whether to collect debug information
 * @property {ExtractionConstants} constants - Constants for extraction
 * @property {ExtractionHelpers} helpers - Helper functions
 */

/**
 * @typedef {Object} ExtractionState
 * @property {Set<string>} processedImages - Set of processed image URLs (normalized)
 * @property {Set<string>} addedHeadings - Set of added heading texts (normalized)
 * @property {Set<string>} addedParagraphs - Set of added paragraph texts (normalized)
 * @property {string} mainTitleText - Main title text (normalized)
 * @property {Element|null} standfirstElement - Standfirst element to exclude from parsing
 * @property {string|null} standfirstText - Standfirst text to exclude from parsing
 * @property {ContentItem[]} content - Content items array being built
 * @property {DebugInfo|null} debugInfo - Debug info object
 */

/**
 * @typedef {Object} ExtractionConstants
 * @property {number} MIN_CONTENT_LENGTH - Minimum content length
 * @property {number} SUBSTANTIAL_CONTENT_LENGTH - Substantial content length
 * @property {number} MIN_PARAGRAPH_LENGTH - Minimum paragraph length
 * @property {number} MIN_HEADING_LENGTH - Minimum heading length
 * @property {number} MIN_STANDFIRST_LENGTH - Minimum standfirst length
 * @property {number} MAX_STANDFIRST_LENGTH - Maximum standfirst length
 * @property {number} SHORT_PARAGRAPH_THRESHOLD - Short paragraph threshold
 * @property {number} VERY_SHORT_PARAGRAPH - Very short paragraph threshold
 * @property {number} MAX_AUTHOR_METADATA_LENGTH - Maximum author metadata length
 * @property {number} MAX_WORD_COUNT_METADATA_LENGTH - Maximum word count metadata length
 * @property {number} FEATURED_IMAGE_MIN_WIDTH - Featured image minimum width
 * @property {number} FEATURED_IMAGE_MIN_HEIGHT - Featured image minimum height
 * @property {number} AUTHOR_PHOTO_MAX_SIZE - Author photo maximum size
 * @property {number} AUTHOR_PHOTO_SMALL_SIZE - Author photo small size
 * @property {number} TRACKING_PIXEL_MAX_SIZE - Tracking pixel maximum size
 * @property {number} MIN_CONTENT_SCORE - Minimum content score
 * @property {number} GOOD_ENOUGH_SCORE - Good enough content score
 * @property {RegExp[]} NAV_PATTERNS_CONTAINS - Navigation patterns (contains)
 * @property {RegExp[]} NAV_PATTERNS_STARTS_WITH - Navigation patterns (starts with)
 * @property {string[]} PAYWALL_PATTERNS - Paywall patterns
 * @property {string[]} RELATED_PATTERNS - Related articles patterns
 * @property {string[]} COURSE_AD_PATTERNS - Course ad patterns
 * @property {string[]} EXCLUDED_CLASSES - Excluded class names
 * @property {string[]} PAYWALL_CLASSES - Paywall class names
 * @property {string[]} LOGO_PATTERNS - Logo URL patterns
 */

/**
 * @typedef {Object} ExtractionHelpers
 * @property {function(string, string): string} toAbsoluteUrl - Convert URL to absolute
 * @property {function(string): string} normalizeImageUrl - Normalize image URL for deduplication
 * @property {function(Element): boolean} isFootnoteLink - Check if element is footnote link
 * @property {function(Element): boolean} isIcon - Check if element is icon
 * @property {function(Element): boolean} isWidget - Check if element is widget
 * @property {function(Element): boolean} isExcluded - Check if element should be excluded
 * @property {function(string): boolean} isNavigationParagraph - Check if text is navigation
 * @property {function(Element): string|null} getOriginalTextIfTranslated - Get original text from Google Translate
 */

/**
 * @typedef {Object} Metadata
 * @property {string} title - Article title
 * @property {string} author - Article author
 * @property {string} publishDate - Publication date (ISO format)
 */

// Export empty object to make this a module
export {};
