// Type definitions for ClipAIble extension
// This file contains JSDoc type definitions for commonly used data structures

/**
 * @typedef {Object} ContentItem
 * @property {string} type - Content type: 'text', 'heading', 'image', 'code', 'list', 'quote', 'table'
 * @property {string} content - Content text (for text, heading, code, quote)
 * @property {string} [url] - Image URL (for images)
 * @property {string} [alt] - Image alt text (for images)
 * @property {number} [level] - Heading level 1-6 (for headings)
 * @property {string} [language] - Code language (for code blocks)
 * @property {Array<string>} [items] - List items (for lists)
 * @property {boolean} [ordered] - Whether list is ordered (for lists)
 * @property {Array<Array<string>>} [rows] - Table rows (for tables)
 * @property {string} [id] - Element ID (for headings with anchors)
 */

/**
 * @typedef {Object} ProcessingState
 * @property {boolean} isProcessing - Whether processing is active
 * @property {boolean} isCancelled - Whether processing was cancelled
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} status - Status message
 * @property {Error|Object|null} error - Error object if processing failed
 * @property {Object|null} result - Processing result
 * @property {number|null} startTime - Processing start timestamp
 * @property {string|null} currentStage - Current processing stage ID
 * @property {Array<string>} completedStages - List of completed stage IDs
 */

/**
 * @typedef {Object} NormalizedError
 * @property {string} message - Error message
 * @property {string} code - Error code (from ERROR_CODES)
 * @property {Error|Object|null} originalError - Original error object
 * @property {Object} context - Additional context (source, errorType, etc.)
 */

/**
 * @typedef {Object} AIResponse
 * @property {string|Object} content - Response content (text or parsed JSON)
 * @property {boolean} isJson - Whether response is JSON
 * @property {Object} [metadata] - Response metadata (usage, model, etc.)
 */

/**
 * @typedef {Object} SelectorResult
 * @property {string} articleContainer - Selector for article container
 * @property {string} content - Selector for main content
 * @property {string} title - Selector for title
 * @property {string} subtitle - Selector for subtitle (or empty string)
 * @property {string} heroImage - Selector for hero image (or empty string)
 * @property {string} author - Author name text (or empty string)
 * @property {string} publishDate - Publish date in ISO format (or empty string)
 * @property {string} toc - Selector for table of contents (or empty string)
 * @property {Array<string>} exclude - Array of selectors to exclude
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {string} title - Extracted title
 * @property {string} [author] - Extracted author
 * @property {string} [publishDate] - Extracted publish date
 * @property {Array<ContentItem>} content - Extracted content items
 * @property {Object} [debugInfo] - Debug information (if enabled)
 */

/**
 * @typedef {Object} GenerationData
 * @property {Array<ContentItem>} content - Content items to generate
 * @property {string} title - Document title
 * @property {string} [author] - Document author
 * @property {string} [sourceUrl] - Source URL
 * @property {string} [publishDate] - Publish date
 * @property {boolean} [generateToc] - Whether to generate table of contents
 * @property {boolean} [generateAbstract] - Whether to generate abstract
 * @property {string} [abstract] - Abstract text
 * @property {string} [language] - Document language
 * @property {string} [apiKey] - API key for translation
 * @property {string} [model] - Model name for translation
 */

/**
 * @typedef {Object} CacheEntry
 * @property {SelectorResult} selectors - Cached selectors
 * @property {number} timestamp - Cache timestamp
 * @property {number} [successCount] - Number of successful uses
 * @property {number} [failureCount] - Number of failures
 */

/**
 * @typedef {Object} StatsData
 * @property {number} totalSaved - Total number of saved items
 * @property {Object} byFormat - Count by format {pdf: 0, epub: 0, ...}
 * @property {Object} byMonth - Count by month {"2025-12": 5, ...}
 * @property {Object} topSites - Count by site {"medium.com": 12, ...}
 * @property {number} totalProcessingTime - Total processing time in milliseconds
 * @property {number|null} lastSaved - Last save timestamp
 * @property {Array<Object>} history - Save history (last 50 items)
 */

/**
 * @typedef {Object} HistoryItem
 * @property {string} title - Item title
 * @property {string} url - Item URL
 * @property {string} format - Export format
 * @property {number} date - Save timestamp
 * @property {number} processingTime - Processing time in milliseconds
 */

/**
 * @typedef {Object} MessageRequest
 * @property {string} action - Action name
 * @property {Object} [data] - Request data
 */

/**
 * @typedef {Object} MessageResponse
 * @property {boolean} [success] - Whether request succeeded
 * @property {Object|string} [data] - Response data
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} ChromeTab
 * @property {number} id - Tab ID
 * @property {string} url - Tab URL
 * @property {string} [title] - Tab title
 */

/**
 * @typedef {('openai'|'claude'|'gemini'|'grok'|'openrouter')} AIProvider
 */

/**
 * @typedef {('pdf'|'epub'|'fb2'|'markdown'|'audio')} ExportFormat
 */

/**
 * @typedef {('automatic'|'selector'|'extract')} ExtractionMode
 */

