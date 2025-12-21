// Type definitions for ClipAIble extension
// This file contains JSDoc type definitions for commonly used data structures

/**
 * @typedef {Object} ContentItem
 * @property {string} type - Content type: 'text', 'heading', 'image', 'code', 'list', 'quote', 'table', 'subtitle'
 * @property {string} [content] - Content text (for text, code, quote)
 * @property {string} [text] - Text content (for heading, subtitle, text)
 * @property {string} [html] - HTML content (for text blocks)
 * @property {string} [url] - Image URL (for images) - alias for src
 * @property {string} [alt] - Image alt text (for images)
 * @property {string} [src] - Image source URL (for images) - alias for url
 * @property {number} [level] - Heading level 1-6 (for headings)
 * @property {string} [language] - Code language (for code blocks)
 * @property {Array<string>} [items] - List items (for lists)
 * @property {boolean} [ordered] - Whether list is ordered (for lists)
 * @property {Array<Array<string>>} [rows] - Table rows (for tables)
 * @property {string} [id] - Element ID (for headings with anchors)
 * @property {boolean} [isStandfirst] - Whether text is standfirst (for text blocks)
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
 * @property {number} [lastUpdate] - Last update timestamp (for state management)
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

/**
 * @typedef {Object} ChromeStorageResult
 * @property {ProcessingState} [processingState] - Processing state
 * @property {boolean} [summary_generating] - Summary generation flag
 * @property {number} [summary_generating_start_time] - Summary generation start time
 * @property {Object} [lastSummaryGenerationData] - Last summary generation data
 * @property {Object} [lastSubtitles] - Last extracted subtitles
 * @property {string} [api_provider] - Selected API provider
 * @property {string} [openai_api_key] - OpenAI API key (encrypted)
 * @property {string} [claude_api_key] - Claude API key (encrypted)
 * @property {string} [gemini_api_key] - Gemini API key (encrypted)
 * @property {string} [grok_api_key] - Grok API key (encrypted)
 * @property {string} [openrouter_api_key] - OpenRouter API key (encrypted)
 * @property {string} [elevenlabs_api_key] - ElevenLabs API key (encrypted)
 * @property {string} [qwen_api_key] - Qwen API key (encrypted)
 * @property {string} [respeecher_api_key] - Respeecher API key (encrypted)
 * @property {string} [google_tts_api_key] - Google TTS API key (encrypted)
 * @property {SelectorResult} [selector_cache] - Cached selectors by domain
 * @property {StatsData} [stats] - Statistics data
 * @property {Object} [settings] - User settings
 */

/**
 * @typedef {Object} SubtitleData
 * @property {Array<{text: string, timestamp?: number}>|Array<string>} [subtitles] - Subtitle entries
 * @property {Object} [metadata] - Subtitle metadata
 * @property {number} [timestamp] - Extraction timestamp
 */

/**
 * @typedef {Object} InjectionResult
 * @property {string} title - Extracted title
 * @property {string} [author] - Extracted author
 * @property {Array<ContentItem>} content - Extracted content
 * @property {string} [publishDate] - Publish date
 * @property {Object} [debug] - Debug information
 * @property {Object} [debugInfo] - Debug information (for automatic mode)
 * @property {string} [error] - Error message
 * @property {string} [errorStack] - Error stack trace
 */

/**
 * @typedef {Object} RetryOptions
 * @property {number} maxRetries - Maximum retry attempts
 * @property {Array<number>} delays - Retry delays in milliseconds
 * @property {Array<number>} retryableStatusCodes - HTTP status codes that trigger retry
 * @property {Function} [onRetry] - Callback on retry
 * @property {Function} [shouldRetry] - Function to determine if should retry
 */

/**
 * @typedef {Object} ExtendedGenerationData
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
 * @property {string} [pageMode] - PDF page mode
 * @property {string} [fontFamily] - PDF font family
 * @property {string} [fontSize] - PDF font size
 * @property {string} [bgColor] - PDF background color
 * @property {string} [textColor] - PDF text color
 * @property {string} [headingColor] - PDF heading color
 * @property {string} [linkColor] - PDF link color
 * @property {string} [stylePreset] - PDF style preset
 */

/**
 * @typedef {Object} ExtendedProcessingState
 * @extends {ProcessingState}
 * @property {string} [outputFormat] - Output format
 */

/**
 * @typedef {Object} ExtendedCacheEntry
 * @extends {CacheEntry}
 * @property {SelectorResult} selectors - Cached selectors (same as CacheEntry.selectors)
 */

/**
 * @typedef {Object} AudioGenerationData
 * @property {Array<ContentItem>} content - Content items
 * @property {string} title - Document title
 * @property {string} apiKey - API key for text preparation
 * @property {string} ttsApiKey - TTS provider API key
 * @property {string} model - Model name for text preparation
 * @property {string} provider - TTS provider name
 * @property {string} voice - Voice name
 * @property {number} speed - Playback speed
 * @property {string} format - Audio format
 * @property {string} language - Language code
 * @property {string} [elevenlabsModel] - ElevenLabs model
 * @property {string} [elevenlabsFormat] - ElevenLabs format
 * @property {number} [elevenlabsStability] - ElevenLabs stability
 * @property {number} [elevenlabsSimilarity] - ElevenLabs similarity
 * @property {number} [elevenlabsStyle] - ElevenLabs style
 * @property {boolean} [elevenlabsSpeakerBoost] - ElevenLabs speaker boost
 * @property {string|null} [openaiInstructions] - OpenAI instructions
 * @property {string} [googleTtsModel] - Google TTS model
 * @property {string} [googleTtsVoice] - Google TTS voice
 * @property {string|null} [googleTtsPrompt] - Google TTS prompt
 * @property {number} [respeecherTemperature] - Respeecher temperature
 * @property {number} [respeecherRepetitionPenalty] - Respeecher repetition penalty
 * @property {number} [respeecherTopP] - Respeecher top_p
 * @property {number|null} [tabId] - Tab ID for offline TTS (required when using offline TTS from service worker)
 */

/**
 * @typedef {Window & {
 *   uiModule?: Object;
 *   statsModule?: Object;
 *   settingsModule?: Object;
 *   coreModule?: Object;
 *   handlersModule?: Object;
 *   themeChangeListener?: (e: MediaQueryListEvent) => void;
 * }} WindowWithModules
 */

