// Type definitions for ClipAIble extension
// This file contains JSDoc type definitions for commonly used data structures

/**
 * @typedef {Object} ContentItem
 * @property {string} type - Content type: 'text', 'heading', 'paragraph', 'image', 'code', 'list', 'quote', 'table', 'subtitle', 'infobox_start', 'infobox_end'
 * @property {string} [content] - Content text (for text, code, quote)
 * @property {string} [text] - Text content (for heading, subtitle, text, code)
 * @property {string} [code] - Code content (for code blocks) - alias for text
 * @property {string} [html] - HTML content (for text blocks)
 * @property {string} [url] - Image URL (for images) - alias for src
 * @property {string} [alt] - Image alt text (for images)
 * @property {string} [src] - Image source URL (for images) - alias for url
 * @property {string} [caption] - Image caption text (for images)
 * @property {boolean} [translated] - Whether image text was translated (for images)
 * @property {number} [level] - Heading level 1-6 (for headings)
 * @property {string} [language] - Code language (for code blocks)
 * @property {Array<string|{html?: string, text?: string, id?: string, level?: number, listLevel?: number, isOrdered?: boolean, parentIsOrdered?: boolean}>} [items] - List items (for lists) - can be strings or objects with html/text and optional properties
 * @property {boolean} [ordered] - Whether list is ordered (for lists)
 * @property {Array<string>} [headers] - Table headers (for tables)
 * @property {Array<Array<string>>} [rows] - Table rows (for tables)
 * @property {boolean} [hasHeaders] - Whether table has headers (for tables)
 * @property {string} [id] - Element ID (for headings with anchors)
 * @property {boolean} [isStandfirst] - Whether text is standfirst (for text blocks)
 * @property {string} [title] - Title text (for infobox_start)
 * @property {Array<{items?: Array<{str?: string, x?: number, width?: number, isBold?: boolean, isItalic?: boolean, isUnderlined?: boolean, underlinedRanges?: Array<{startIndex: number, endIndex: number}>, fontSize?: number, fontName?: string}>, text?: string, isBold?: boolean, isItalic?: boolean, isUnderlined?: boolean}>} [lines] - Lines with formatting fragments (for paragraphs and headings with detailed formatting)
 * @property {boolean} [isBold] - Whether text is bold (for text blocks)
 * @property {boolean} [isItalic] - Whether text is italic (for text blocks)
 * @property {boolean} [isUnderlined] - Whether text is underlined (for text blocks)
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
 * @property {string} [outputFormat] - Output format (pdf, epub, fb2, markdown, audio) - used for UI display and polling intervals
 */

/**
 * @typedef {Object} NormalizedError
 * @property {string} message - Error message
 * @property {string} code - Error code (from ERROR_CODES)
 * @property {Error|Object|null} originalError - Original error object
 * @property {Object} context - Additional context (source, errorType, etc.)
 */

/**
 * @typedef {Object} ErrorContext
 * @property {string} [errorType] - Error type identifier
 * @property {string} [source] - Source module name
 * @property {any} [context] - Additional context data
 */

/**
 * @typedef {Object} ErrorHandlingOptions
 * @property {string} [errorType] - Error type for user-friendly message (e.g., 'contentExtractionFailed')
 * @property {string} [source] - Source module (e.g., 'extraction', 'translation')
 * @property {Object} [context] - Additional context
 * @property {boolean} [logError=true] - Whether to log error
 * @property {boolean} [createUserMessage=false] - Whether to create user-friendly message
 */

/**
 * @typedef {Error & {
 *   status?: number;
 *   statusCode?: number;
 *   response?: Response;
 *   retryable?: boolean;
 *   data?: any;
 * }} ApiError
 */

/**
 * Extended Error type with custom properties
 * Used instead of @ts-ignore when adding custom properties to Error objects
 * @typedef {Error & {
 *   code?: string;
 *   status?: number;
 *   originalError?: Error|Object|null;
 *   context?: Object;
 *   userMessage?: string;
 *   userCode?: string;
 * }} ExtendedError
 */

/**
 * Base error type with code property
 * @typedef {Error & {
 *   code: string;
 *   originalError?: Error|Object|null;
 *   context?: Object;
 * }} BaseError
 */

/**
 * Authentication error (401/403)
 * @typedef {BaseError & {
 *   code: 'auth_error';
 *   status?: 401|403;
 * }} AuthError
 */

/**
 * Rate limit error (429)
 * @typedef {BaseError & {
 *   code: 'rate_limit';
 *   status?: 429;
 *   retryAfter?: number;
 * }} RateLimitError
 */

/**
 * Timeout error
 * @typedef {BaseError & {
 *   code: 'timeout';
 *   timeout?: number;
 * }} TimeoutError
 */

/**
 * Network error (connection failed, DNS, etc.)
 * @typedef {BaseError & {
 *   code: 'network_error';
 *   retryable?: boolean;
 * }} NetworkError
 */

/**
 * Parse error (JSON parsing, syntax error)
 * @typedef {BaseError & {
 *   code: 'parse_error';
 *   parseError?: Error;
 * }} ParseError
 */

/**
 * Validation error (invalid input, missing required fields)
 * @typedef {BaseError & {
 *   code: 'validation_error';
 *   field?: string;
 *   value?: any;
 * }} ValidationError
 */

/**
 * Provider error (500, 502, 503, 504)
 * @typedef {BaseError & {
 *   code: 'provider_error';
 *   status?: 500|502|503|504;
 *   retryable?: boolean;
 * }} ProviderError
 */

/**
 * Unknown error
 * @typedef {BaseError & {
 *   code: 'unknown_error';
 * }} UnknownError
 */

/**
 * IDBOpenDBRequest event target in onupgradeneeded handler
 * TypeScript doesn't always correctly type event.target in IDB event handlers
 * @typedef {IDBOpenDBRequest & {
 *   result: IDBDatabase;
 * }} IDBUpgradeEventTarget
 */

/**
 * FileReader result type
 * FileReader.result can be string (for data URLs) or ArrayBuffer (for binary data)
 * @typedef {string|ArrayBuffer|null} FileReaderResult
 */

/**
 * FileReader event target in onload/onloadend handlers
 * TypeScript doesn't always correctly type event.target in FileReader event handlers
 * @typedef {FileReader & {
 *   result: FileReaderResult;
 * }} FileReaderEventTarget
 */

/**
 * Union type of all error types
 * @typedef {AuthError|RateLimitError|TimeoutError|NetworkError|ParseError|ValidationError|ProviderError|UnknownError} ClipAIbleError
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
 * @property {string} [detectedLanguage] - ISO 639-1 two-letter language code of the main article content (e.g., 'en', 'ru', 'ua', 'de', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko')
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {string} title - Extracted title
 * @property {string} [author] - Extracted author
 * @property {string} [publishDate] - Extracted publish date
 * @property {Array<ContentItem>} content - Extracted content items
 * @property {Object} [debugInfo] - Debug information (if enabled)
 * @property {string} [abstract] - Generated abstract text
 * @property {string} [detectedLanguage] - Detected source language
 * @property {string} [markdown] - Markdown content (for PDF processing)
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
 * Data types for specific message actions
 */

/**
 * @typedef {Object} ProcessArticleData
 * @property {string} url - Page URL
 * @property {string} [title] - Page title
 * @property {number} [tabId] - Tab ID
 * @property {string} [html] - Page HTML
 * @property {string} mode - Processing mode ('selector'|'extract'|'automatic')
 * @property {string} outputFormat - Output format ('pdf'|'epub'|'fb2'|'markdown'|'audio')
 * @property {boolean} [generateToc] - Generate table of contents
 * @property {boolean} [generateAbstract] - Generate abstract
 * @property {string} [model] - AI model name
 * @property {string} [apiKey] - API key
 * @property {string} [apiProvider] - API provider
 * @property {string} [targetLanguage] - Target language for translation
 * @property {boolean} [translateImages] - Translate images
 * @property {string} [pageMode] - PDF page mode ('single'|'double')
 * @property {string} [fontFamily] - PDF font family
 * @property {string} [fontSize] - PDF font size
 * @property {string} [bgColor] - PDF background color
 * @property {string} [textColor] - PDF text color
 * @property {string} [headingColor] - PDF heading color
 * @property {string} [linkColor] - PDF link color
 * @property {string} [audioProvider] - Audio provider
 * @property {string} [audioVoice] - Audio voice
 * @property {number} [audioSpeed] - Audio speed
 * @property {string} [audioFormat] - Audio format
 * @property {boolean} [useCache] - Use selector cache
 */

/**
 * @typedef {Object} ExtractContentOnlyData
 * @property {string} url - Page URL
 * @property {string} [title] - Page title
 * @property {number} [tabId] - Tab ID
 * @property {string} [html] - Page HTML
 * @property {string} mode - Processing mode ('selector'|'extract'|'automatic')
 * @property {string} [apiKey] - API key
 * @property {string} [model] - AI model name
 * @property {boolean} [useCache] - Use selector cache
 * @property {boolean} [autoGenerateSummary] - Auto-generate summary
 * @property {string} [language] - Language code
 */

/**
 * @typedef {Object} GenerateSummaryData
 * @property {Array<ContentItem>} contentItems - Content items to summarize
 * @property {string} url - Source URL
 * @property {string} title - Article title
 * @property {string} apiKey - API key
 * @property {string} model - AI model name
 * @property {string} language - Target language
 * @property {boolean} autoGenerateSummary - Auto-generate summary flag
 */

/**
 * @typedef {Object} ImportSettingsData
 * @property {string} jsonData - JSON string with settings
 * @property {{
 *   overwrite?: boolean,
 *   skipInvalid?: boolean,
 *   validateOnly?: boolean
 * }} [options] - Import options
 */

/**
 * @typedef {Object} ExportSettingsData
 * @property {boolean} [includeStats] - Include statistics
 * @property {boolean} [includeCache] - Include cache
 */

/**
 * @typedef {Object} LogData
 * @property {string} message - Log message
 * @property {*} [data] - Additional data
 */

/**
 * @typedef {Object} LogBatchData
 * @property {Array<{message: string, data?: *}>} logs - Array of log entries
 * @property {string} [level] - Log level ('critical'|'error'|'warn'|'info'|'debug')
 */

/**
 * @typedef {Object} LogErrorData
 * @property {string} message - Error message
 * @property {Error|Object} [error] - Error object
 * @property {Object} [context] - Error context
 * @property {string} [source] - Error source
 * @property {number} [timestamp] - Error timestamp
 * @property {string} [url] - URL where error occurred
 */

/**
 * @typedef {Object} LogSettingData
 * @property {string} key - Setting key
 * @property {*} value - Setting value
 * @property {string} [valueType] - Value type
 * @property {number} [timestamp] - Timestamp
 */

/**
 * @typedef {Object} DeleteHistoryItemData
 * @property {number} index - History item index
 */

/**
 * @typedef {Object} DeleteDomainFromCacheData
 * @property {string} domain - Domain to delete from cache
 */

/**
 * @typedef {Object} ExtractYouTubeSubtitlesData
 * @property {string} url - YouTube video URL
 * @property {string} [videoId] - YouTube video ID
 */

/**
 * @typedef {Object} YouTubeSubtitlesResultData
 * @property {Array<{text: string, start: number, duration: number}>} [subtitles] - Subtitles array
 * @property {Object} [metadata] - Video metadata
 * @property {Error|Object} [error] - Error if extraction failed
 */

/**
 * @typedef {Object} LogModelDropdownData
 * @property {string} model - Selected model name
 */

/**
 * @typedef {Object} CloseOffscreenForVoiceSwitchData
 * @property {string} previousVoice - Previous voice ID
 * @property {string} newVoice - New voice ID
 * @property {string} [messageId] - Message ID
 */

/**
 * @typedef {Object} TTSProgressData
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} [status] - Status message
 * @property {number} [current] - Current chunk number
 * @property {number} [total] - Total chunks
 */

/**
 * Discriminated union for MessageRequest based on action
 * @typedef {(
 *   | { action: 'processArticle', data: ProcessArticleData, target?: string, type?: string }
 *   | { action: 'extractContentOnly', data: ExtractContentOnlyData, target?: string, type?: string }
 *   | { action: 'generateSummary', data: GenerateSummaryData, target?: string, type?: string }
 *   | { action: 'generatePdfDebugger', data: ProcessArticleData, target?: string, type?: string }
 *   | { action: 'importSettings', data: ImportSettingsData, target?: string, type?: string }
 *   | { action: 'exportSettings', data?: ExportSettingsData, target?: string, type?: string }
 *   | { action: 'log', data: LogData, target?: string, type?: string }
 *   | { action: 'logBatch', data: LogBatchData, target?: string, type?: string }
 *   | { action: 'logError', data: LogErrorData, target?: string, type?: string }
 *   | { action: 'logFromPrintPage', data: LogData, target?: string, type?: string }
 *   | { action: 'logSetting', data: LogSettingData, target?: string, type?: string }
 *   | { action: 'deleteHistoryItem', data: DeleteHistoryItemData, target?: string, type?: string }
 *   | { action: 'deleteDomainFromCache', data: DeleteDomainFromCacheData, target?: string, type?: string }
 *   | { action: 'extractYouTubeSubtitlesForSummary', data: ExtractYouTubeSubtitlesData, target?: string, type?: string }
 *   | { action: 'youtubeSubtitlesResult', data: YouTubeSubtitlesResultData, target?: string, type?: string }
 *   | { action: 'logModelDropdown', data: LogModelDropdownData, target?: string, type?: string }
 *   | { action: 'closeOffscreenForVoiceSwitch', data: CloseOffscreenForVoiceSwitchData, target?: string, type?: string }
 *   | { action: 'TTS_PROGRESS', data: TTSProgressData, target?: string, type?: string }
 *   | { action: 'ping', data?: undefined, target?: string, type?: string }
 *   | { action: 'getState', data?: undefined, target?: string, type?: string }
 *   | { action: 'cancelProcessing', data?: undefined, target?: string, type?: string }
 *   | { action: 'getStats', data?: undefined, target?: string, type?: string }
 *   | { action: 'clearStats', data?: undefined, target?: string, type?: string }
 *   | { action: 'getCacheStats', data?: undefined, target?: string, type?: string }
 *   | { action: 'clearSelectorCache', data?: undefined, target?: string, type?: string }
 *   | { action: 'exportLogs', data?: undefined, target?: string, type?: string }
 *   | { action: string, data?: Object, target?: string, type?: string } // Fallback for unknown actions
 * )} MessageRequest
 */

/**
 * @typedef {Object<string, any>} MessageResponse
 * @property {boolean} [success] - Whether request succeeded
 * @property {Object|string} [data] - Response data
 * @property {string} [error] - Error message if failed
 * @property {*} [result] - Result data (for test handlers and other responses)
 * @property {boolean} [pong] - Ping response flag
 * @property {boolean} [acknowledged] - Acknowledgment flag
 * @property {string} [message] - Response message
 * @property {boolean} [started] - Processing started flag
 * @property {boolean} [extracting] - Extraction in progress flag
 * @property {boolean} [logged] - Log operation completed flag
 * @property {boolean} [closed] - Close operation result
 */

/**
 * @typedef {('openai'|'claude'|'gemini'|'grok'|'openrouter'|'deepseek')} AIProvider
 */

/**
 * @typedef {('pdf'|'epub'|'fb2'|'markdown'|'audio')} ExportFormat
 */

/**
 * @typedef {Blob|{success: boolean}} PdfGenerationResult
 * PDF generation can return either a Blob (when using debugger API) or success object (when using print page)
 */

/**
 * @typedef {Blob} EpubGenerationResult
 * EPUB generation always returns a Blob
 */

/**
 * @typedef {Blob} Fb2GenerationResult
 * FB2 generation always returns a Blob
 */

/**
 * @typedef {string} MarkdownGenerationResult
 * Markdown generation returns the markdown content as a string
 */

/**
 * @typedef {void} AudioGenerationResult
 * Audio generation triggers download automatically and returns void
 */

/**
 * @typedef {PdfGenerationResult|EpubGenerationResult|Fb2GenerationResult|MarkdownGenerationResult|AudioGenerationResult} DocumentGenerationResult
 * Union type for all possible document generation results
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
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {Array<number>} [delays] - Retry delays in milliseconds
 * @property {Array<number>} [retryableStatusCodes] - HTTP status codes that trigger retry
 * @property {Function} [onRetry] - Callback on retry
 * @property {Function} [shouldRetry] - Function to determine if should retry
 */

/**
 * @typedef {Object} TTSOptions
 * @property {string} [provider='openai'] - Provider: 'openai', 'elevenlabs', 'qwen', 'respeecher', 'google', or 'offline'
 * @property {string} [voice] - Voice to use
 * @property {number} [speed] - Speech speed 0.25-4.0 (default: 1.0, offline: 0.1-10.0)
 * @property {string} [format] - Output format (default: 'mp3', offline: always 'wav')
 * @property {string} [instructions] - Voice style instructions (OpenAI only)
 * @property {string} [openaiInstructions] - Alternative instructions property name (OpenAI only)
 * @property {string} [language] - Language code for Qwen/Offline (auto-detected if not provided)
 * @property {number} [pitch] - Pitch -20.0 to 20.0 (Google Cloud TTS only, default: 0.0) or 0-2.0 (Offline)
 * @property {number} [volume] - Volume 0-1.0 (default: 1.0, may not be supported)
 * @property {number} [tabId] - Tab ID for offline TTS (required when using offline TTS from service worker)
 * @property {string} [elevenlabsModel] - ElevenLabs model
 * @property {string} [elevenlabsFormat] - ElevenLabs format
 * @property {number} [elevenlabsStability] - ElevenLabs stability
 * @property {number} [elevenlabsSimilarity] - ElevenLabs similarity
 * @property {number} [elevenlabsStyle] - ElevenLabs style
 * @property {boolean} [elevenlabsSpeakerBoost] - ElevenLabs speaker boost
 * @property {string} [googleTtsModel] - Google TTS model
 * @property {string} [googleTtsVoice] - Google TTS voice
 * @property {string} [googleTtsPrompt] - Google TTS prompt
 * @property {string} [prompt] - Alternative prompt property name (Google TTS)
 * @property {string} [model] - Alternative model property name (Google TTS)
 * @property {number} [respeecherTemperature] - Respeecher temperature
 * @property {number} [respeecherRepetitionPenalty] - Respeecher repetition penalty
 * @property {number} [respeecherTopP] - Respeecher top_p
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
 * @typedef {ProcessingState & {outputFormat?: string}} ExtendedProcessingState
 */

/**
 * @typedef {CacheEntry} ExtendedCacheEntry
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
 * @typedef {Object} ProcessingData
 * @property {string} html - HTML content
 * @property {string} url - Page URL
 * @property {string} title - Page title
 * @property {number} tabId - Tab ID
 * @property {string} apiKey - API key for AI processing
 * @property {string} provider - AI provider name
 * @property {string} model - Model name
 * @property {string} mode - Extraction mode ('automatic'|'selector'|'extract')
 * @property {boolean} [useCache] - Whether to use selector cache
 * @property {ExportFormat} outputFormat - Output format
 * @property {boolean} [generateToc] - Whether to generate table of contents
 * @property {boolean} [generateAbstract] - Whether to generate abstract
 * @property {string} [pageMode] - PDF page mode
 * @property {string} [language] - Document language
 * @property {boolean} [translateImages] - Whether to translate images
 * @property {string|null} [googleApiKey] - Google API key for image translation
 * @property {string} [stylePreset] - PDF style preset
 * @property {string} [fontFamily] - PDF font family
 * @property {string} [fontSize] - PDF font size
 * @property {string} [bgColor] - PDF background color
 * @property {string} [textColor] - PDF text color
 * @property {string} [headingColor] - PDF heading color
 * @property {string} [linkColor] - PDF link color
 * @property {string} [audioProvider] - Audio TTS provider
 * @property {string|null} [elevenlabsApiKey] - ElevenLabs API key
 * @property {string|null} [qwenApiKey] - Qwen API key
 * @property {string|null} [respeecherApiKey] - Respeecher API key
 * @property {string} [audioVoice] - Audio voice name
 * @property {number} [audioSpeed] - Audio playback speed
 * @property {string} [audioFormat] - Audio format
 * @property {string} [elevenlabsModel] - ElevenLabs model
 * @property {string} [elevenlabsFormat] - ElevenLabs format
 * @property {number} [elevenlabsStability] - ElevenLabs stability
 * @property {number} [elevenlabsSimilarity] - ElevenLabs similarity
 * @property {number} [elevenlabsStyle] - ElevenLabs style
 * @property {boolean} [elevenlabsSpeakerBoost] - ElevenLabs speaker boost
 * @property {string|null} [openaiInstructions] - OpenAI instructions
 * @property {string|null} [googleTtsApiKey] - Google TTS API key
 * @property {string} [googleTtsModel] - Google TTS model
 * @property {string} [googleTtsVoice] - Google TTS voice
 * @property {string|null} [googleTtsPrompt] - Google TTS prompt
 * @property {number} [respeecherTemperature] - Respeecher temperature
 * @property {number} [respeecherRepetitionPenalty] - Respeecher repetition penalty
 * @property {number} [respeecherTopP] - Respeecher top_p
 * @property {string} [targetLanguage] - Target language for translation
 * @property {string} [apiProvider] - API provider (alias for provider)
 * @property {string|null} [geminiApiKey] - Gemini API key
 * @property {string} [effectiveLanguage] - Effective language after detection (computed property)
 */

/**
 * @typedef {Window & {
 *   themeChangeListener?: (e: MediaQueryListEvent) => void;
 *   saveVoiceBeforeClose?: () => Promise<void>;
 * }} WindowWithModules
 */

/**
 * @typedef {WorkerGlobalScope & {
 *   addLogToCollection?: (message: string, data?: any, level?: string) => void;
 *   exportAllLogsToFile?: Function;
 * }} ServiceWorkerWithLogging
 */

/**
 * @typedef {Object} UIModule
 * @property {function(): Promise<void>} applyLocalization - Apply UI localization
 * @property {function(): void} applyTheme - Apply theme
 * @property {function(string, string?, number?): void} setStatus - Set status indicator
 * @property {function(number, boolean?): void} setProgress - Set progress bar
 * @property {function(string, string?): void} showToast - Show toast notification
 */

/**
 * @typedef {Object} StatsModule
 * @property {function(): Promise<void>} loadAndDisplayStats - Load and display statistics
 * @property {function(import('./types.js').StatsData): Promise<void>} displayStats - Display statistics
 * @property {function(Object): Promise<void>} displayCacheStats - Display cache statistics
 * @property {function(string): string} escapeHtml - Escape HTML special characters
 * @property {function(Date): string} formatRelativeDate - Format date as relative time
 */

/**
 * @typedef {function(import('./types.js').SelectorResult, string): Promise<import('./types.js').InjectionResult>} ExtractFromPageFunction
 * Function to extract content from a page using selectors
 */

/**
 * @typedef {function(): void} StartKeepAliveFunction
 * Function to start keep-alive mechanism
 */

/**
 * @typedef {function(): Promise<void>} StopKeepAliveFunction
 * Function to stop keep-alive mechanism
 */

/**
 * @typedef {function(import('./types.js').MessageResponse): void} SendResponseFunction
 * Function to send a response to a message
 */

/**
 * @typedef {function(): Promise<Worker>} InitTTSWorkerFunction
 * Function to initialize TTS worker
 */

/**
 * @typedef {function(Worker): Promise<Array<any>>} GetVoicesWithWorkerFunction
 * Function to get voices from TTS worker
 */

/**
 * @typedef {function(Worker): Promise<Array<any>>} GetStoredWithWorkerFunction
 * Function to get stored voices from TTS worker
 */

/**
 * @typedef {function(string): boolean} IsPlaceholderUrlFunction
 * Function to check if URL is a placeholder
 */

/**
 * @typedef {function(string, import('./types.js').IsPlaceholderUrlFunction): string|null} GetBestSrcsetUrlFunction
 * Function to extract best URL from srcset attribute
 */

/**
 * @typedef {function(Element): boolean} IsExcludedFunction
 * Function to check if element is excluded
 */

/**
 * @typedef {function(Element): boolean} IsLikelyContentContainerFunction
 * Function to check if element is likely content container
 */

/**
 * @typedef {function(Element, import('./types.js').IsLikelyContentContainerFunction): number} CalculateContentScoreFunction
 * Function to calculate content score for element
 */

/**
 * @typedef {function(): void|Promise<void>} CompleteProcessingFunction
 * Function to complete processing
 */

/**
 * @typedef {function(Error|Object): void|Promise<void>} SetErrorFunction
 * Function to set error
 */

/**
 * @typedef {function((Partial<import('./types.js').ProcessingState> & {stage?: string})|string): void} UpdateStateFunction
 * Function to update processing state
 * @param {(Partial<ProcessingState> & {stage?: string})|string} updates - State updates or status string
 */

/**
 * @typedef {function(any, number): Promise<any>} ProcessImageFunction
 * Function to process each image (img, index) => Promise<result>
 */

/**
 * @typedef {function(string): string} EscapeAttrFunction
 * Function to escape HTML attribute value
 */

/**
 * @typedef {function(Element): boolean} IsFootnoteLinkFunction
 * Function to check if link is footnote
 */

/**
 * @typedef {function(Element): boolean} IsIconFunction
 * Function to check if element is icon
 */

/**
 * @typedef {function(Array<any>, {baseFontSize?: number, [key: string]: any}): Array<any>} ProcessLinesFunction
 * Function to process lines and return elements
 */

/**
 * @typedef {function(): string} FunctionToStringFunction
 * Function to convert function to string (generic function type)
 */

/**
 * @typedef {function(any): number} KeyExtractorFunction
 * Function to extract key value from object (e.g., item => item.y)
 */

/**
 * @typedef {function(any): any} KeyFunction
 * Function to extract key from item for counting/grouping
 */

/**
 * @typedef {function(): Promise<any>} AsyncFunction
 * Generic async function that returns a Promise
 */

/**
 * @typedef {function(number, number?): void} ProgressCallbackFunction
 * Function to report progress (current, total?)
 */

/**
 * @typedef {function(string): number} GetMonthNumberFunction
 * Function to get month number from month name
 */

/**
 * @typedef {function(string): Promise<void>} CreateNotificationFunction
 * Function to create/show notification
 */

/**
 * @typedef {Object} ChromeRuntimeMessageSender
 * Chrome Extension runtime message sender object
 * @property {number} [tab] - Tab ID if message is from a tab
 * @property {number} [frameId] - Frame ID
 * @property {string} [id] - Extension ID
 * @property {string} [url] - URL of the page that sent the message
 * @property {string} [tlsChannelId] - TLS channel ID
 */

/**
 * @typedef {Object} ChromeTab
 * Chrome Extension tab object
 * @property {number} id - Tab ID
 * @property {number} [index] - Tab index
 * @property {number} [windowId] - Window ID
 * @property {number} [openerTabId] - Opener tab ID
 * @property {boolean} [highlighted] - Whether tab is highlighted
 * @property {boolean} [active] - Whether tab is active
 * @property {boolean} [pinned] - Whether tab is pinned
 * @property {boolean} [audible] - Whether tab is audible
 * @property {boolean} [discarded] - Whether tab is discarded
 * @property {boolean} [autoDiscardable] - Whether tab can be auto-discarded
 * @property {string} [mutedInfo] - Muted info
 * @property {string} [url] - Tab URL
 * @property {string} [pendingUrl] - Pending URL
 * @property {string} [title] - Tab title
 * @property {string} [favIconUrl] - Favicon URL
 * @property {string} [status] - Tab status ('loading'|'complete')
 * @property {boolean} [incognito] - Whether tab is incognito
 * @property {number} [width] - Tab width
 * @property {number} [height] - Tab height
 * @property {string} [sessionId] - Session ID
 */

/**
 * @typedef {Object} ChromeDebuggerTarget
 * Chrome Extension debugger target
 * @property {number} tabId - Tab ID
 */

/**
 * @typedef {Object} ChromeDebuggerCommandResult
 * Chrome Extension debugger command result
 * @property {string} [data] - Base64-encoded PDF data (for Page.printToPDF)
 * @property {*} [result] - Command result
 */

/**
 * @typedef {Object} ChromeScriptingExecuteScriptResult
 * Chrome Extension scripting.executeScript result
 * @property {*} [result] - Script execution result
 * @property {Error} [error] - Error if script execution failed
 */

/**
 * @typedef {Object} ChromeAlarmInfo
 * Chrome Extension alarm info
 * @property {number} [delayInMinutes] - Delay in minutes
 * @property {number} [periodInMinutes] - Period in minutes
 * @property {number} [when] - When to fire (timestamp)
 */

/**
 * @typedef {Object} ChromeNotificationOptions
 * Chrome Extension notification options
 * @property {string} type - Notification type ('basic'|'image'|'list'|'progress')
 * @property {string} [iconUrl] - Icon URL
 * @property {string} [title] - Notification title
 * @property {string} [message] - Notification message
 * @property {Array<{title: string, message: string}>} [items] - List items (for 'list' type)
 * @property {number} [priority] - Priority (0-2)
 * @property {boolean} [isClickable] - Whether notification is clickable
 * @property {boolean} [requireInteraction] - Whether interaction is required
 * @property {number} [progress] - Progress (0-100, for 'progress' type)
 */

/**
 * @typedef {Object} ChromeDownloadsDownloadOptions
 * Chrome Extension downloads.download options
 * @property {string} url - Download URL (data URL or blob URL)
 * @property {string} [filename] - Filename
 * @property {string} [saveAs] - Whether to show save dialog
 * @property {string} [conflictAction] - Conflict action ('uniquify'|'overwrite'|'prompt')
 */

/**
 * @typedef {Object} Config
 * Configuration constants for ClipAIble extension
 * @property {number} CHUNK_SIZE - Characters per chunk for AI extraction
 * @property {number} CHUNK_OVERLAP - Overlap between chunks to avoid cut-off content
 * @property {number} MAX_HTML_FOR_ANALYSIS - Max chars to send to AI for selector analysis
 * @property {number} TRANSLATION_CHUNK_SIZE - Characters per translation batch
 * @property {number} API_TIMEOUT_MS - Timeout for API requests (milliseconds)
 * @property {number} STATE_EXPIRY_MS - Stale state threshold (milliseconds)
 * @property {number} MAX_OPERATION_TIMEOUT_MS - Initial maximum timeout estimate (milliseconds)
 * @property {number} ABSOLUTE_MAX_OPERATION_TIMEOUT_MS - Absolute maximum timeout (milliseconds)
 * @property {number} OFFScreen_TTS_TIMEOUT_BASE - Base timeout for offscreen TTS (milliseconds)
 * @property {number} OFFScreen_TTS_TIMEOUT_PER_CHAR - Timeout per character for offscreen TTS (milliseconds)
 * @property {number} OFFScreen_TTS_TIMEOUT_MAX - Maximum timeout for offscreen TTS (milliseconds)
 * @property {number} OFFScreen_TTS_HEARTBEAT_INTERVAL - Heartbeat interval for timeout extension (milliseconds)
 * @property {number} OFFScreen_TTS_HEARTBEAT_EXTENSION - Timeout extension on each heartbeat (milliseconds)
 * @property {number} PDF_TAB_LOAD_TIMEOUT_MS - Timeout for PDF tab load (milliseconds)
 * @property {number} PDF_PAGE_LOAD_TIMEOUT_MS - Timeout for PDF page load (milliseconds)
 * @property {number} PDF_PAGE_LOAD_FALLBACK_TIMEOUT_MS - Fallback timeout for PDF page load (milliseconds)
 * @property {number} PDF_FIRST_PAGE_RENDER_TIMEOUT_MS - Timeout for first page render (milliseconds)
 * @property {number} PDF_RENDER_TIMEOUT_MS - Timeout for PDF page rendering (milliseconds)
 * @property {number} PDF_PARSE_TIMEOUT_MS - Timeout for PDF parsing (milliseconds)
 * @property {number} AUDIO_CLEANUP_THRESHOLD_MS - Threshold for stale audio cleanup (milliseconds)
 * @property {number} WORKER_INACTIVITY_TIMEOUT_MS - Timeout for worker inactivity (milliseconds)
 * @property {number} OFFScreen_TTS_CLEANUP_TIMEOUT_MS - Timeout for offscreen TTS cleanup (milliseconds)
 * @property {number} KEEP_ALIVE_INTERVAL - Keep-alive interval (minutes)
 * @property {number} RESET_THRESHOLD_MS - Threshold for resetting state on extension reload (milliseconds)
 * @property {number} SUMMARY_STALE_THRESHOLD_MS - Threshold for stale summary generation flag (milliseconds)
 * @property {number} SUMMARY_TIMEOUT_MS - Timeout for summary generation (milliseconds)
 * @property {number} MAX_UPDATE_QUEUE_SIZE - Maximum number of queued state updates
 * @property {number} POLL_INTERVAL_IDLE - Polling interval when idle (milliseconds)
 * @property {number} POLL_INTERVAL_PROCESSING - Polling interval when processing (milliseconds)
 * @property {number} RETRY_MAX_ATTEMPTS - Maximum number of retry attempts
 * @property {Array<number>} RETRY_DELAYS - Exponential backoff delays in milliseconds
 * @property {Array<number>} RETRYABLE_STATUS_CODES - HTTP status codes that trigger retry
 * @property {boolean} RETRY_NETWORK_ERRORS - Retry on network errors
 * @property {number} UI_DEBOUNCE_DELAY - Debounce delay for UI settings saves (milliseconds)
 * @property {number} UI_ASYNC_DEFER_DELAY - Delay for deferring async work (milliseconds)
 * @property {number} UI_RETRY_DELAY - Retry delay for failed saves (milliseconds)
 * @property {number} UI_CONTEXT_MENU_DELAY - Delay for context menu operations (milliseconds)
 * @property {number} STORAGE_SAVE_DEBOUNCE - Debounce for storage saves (milliseconds)
 * @property {number} STORAGE_SAVE_DEBOUNCE_AUDIO - Debounce for audio storage saves (milliseconds)
 * @property {number} TTS_DELAY - Delay for TTS operations (milliseconds)
 * @property {number} TTS_VOICES_LOAD_DELAY - Delay for loading TTS voices (milliseconds)
 * @property {number} OFFLINE_TTS_SETUP_DELAY - Delay for offline TTS setup (milliseconds)
 * @property {number} OFFLINE_TTS_RETRY_DELAY - Retry delay for offline TTS verification (milliseconds)
 * @property {number} OFFLINE_TTS_NEXT_TICK_DELAY - Delay for next tick operations (milliseconds)
 * @property {number} VIDEO_SUBTITLES_CHECK_INTERVAL - Interval for checking subtitle storage (milliseconds)
 * @property {number} VIDEO_SUBTITLES_TIMEOUT - Timeout for subtitle extraction (milliseconds)
 * @property {number} VIDEO_SUBTITLES_RETRY_DELAY_1 - First retry delay for video subtitles (milliseconds)
 * @property {number} VIDEO_SUBTITLES_RETRY_DELAY_2 - Second retry delay for video subtitles (milliseconds)
 * @property {number} VIDEO_SUBTITLES_WAIT_INTERVAL - Wait interval for video subtitles (milliseconds)
 * @property {number} EXTRACTION_AUTOMATIC_TIMEOUT - Timeout for automatic extraction (milliseconds)
 * @property {Array<number>} TRANSLATION_RETRY_DELAYS - Retry delays for translation (milliseconds)
 * @property {string} DEFAULT_AUDIO_VOICE - Default OpenAI TTS voice
 * @property {number} DEFAULT_AUDIO_SPEED - Default audio playback speed
 * @property {string} DEFAULT_AUDIO_FORMAT - Default audio format
 * @property {string} DEFAULT_ELEVENLABS_MODEL - Default ElevenLabs model
 * @property {string} DEFAULT_RESPEECHER_VOICE - Default Respeecher English voice
 * @property {number} LOG_LEVEL - Log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
 * @property {boolean} VERBOSE_LOGGING - Enable verbose logging for detailed debugging
 * @property {number} MAX_LOG_DATA_SIZE - Maximum size of data object to log (in characters after JSON.stringify)
 * @property {number} LOG_COLLECTION_MAX_SIZE - Maximum number of logs in memory collection
 */

/**
 * @typedef {Object} SettingsModule
 * @property {function(): Promise<void>} loadSettings - Load settings
 * @property {function(string, number?): string|null} getVoiceIdByIndex - Get voice ID by index
 * @property {function(string, string): Promise<void>} saveAudioVoice - Save audio voice
 * @property {function(): Promise<void>} updateApiProviderUI - Update API provider UI
 * @property {function(): Promise<void>} saveApiKey - Save API key
 * @property {function(): Promise<void>} updateModeHint - Update mode hint
 * @property {function(): void} updateCacheVisibility - Update cache visibility
 * @property {function(string): Promise<void>} updateOutputFormatUI - Update output format UI
 * @property {function(): Promise<void>} updateTranslationVisibility - Update translation visibility
 * @property {function(string): Promise<void>} updateVoiceList - Update voice list
 * @property {function(): Promise<void>} updateAudioProviderUI - Update audio provider UI
 * @property {function(string): Promise<void>} resetStyleSetting - Reset style setting
 * @property {function(): Promise<void>} resetAllStyles - Reset all styles
 * @property {function(): Promise<void>} updateModelList - Update model list
 * @property {function(): Promise<void>} showAddModelDialog - Show add model dialog
 * @property {function(): Promise<void>} showCustomModelDropdown - Show custom model dropdown
 */

/**
 * @typedef {Object} CoreModule
 * @property {function(): Promise<void>} handleSavePdf - Handle PDF save
 * @property {function(): Promise<void>} handleCancel - Handle cancel
 * @property {function(): Promise<void>} handleGenerateSummary - Handle summary generation
 * @property {function(): void} toggleSummary - Toggle summary
 * @property {function(): void} copySummary - Copy summary
 * @property {function(): void} downloadSummary - Download summary
 * @property {function(): void} closeSummary - Close summary
 * @property {function(): Promise<void>} checkSummaryStatus - Check summary status
 * @property {function(): Promise<void>} checkProcessingState - Check processing state
 * @property {function(): void} startStatePolling - Start state polling
 */

/**
 * @typedef {Object} HandlersModule
 * @property {function(): void} initHandlers - Initialize event handlers
 */

/**
 * @typedef {Object} PopupModules
 * @property {UIModule} uiModule - UI module
 * @property {StatsModule} statsModule - Stats module
 * @property {SettingsModule} settingsModule - Settings module
 * @property {CoreModule} coreModule - Core module
 * @property {HandlersModule} handlersModule - Handlers module
 */

/**
 * @typedef {Object} OrchestrationDependencies
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logWarn - Warning logging function
 * @property {import('./types.js').Config} CONFIG - Configuration object
 * @property {function(): import('./types.js').ProcessingState} getProcessingState - Get processing state function
 * @property {function(Error|Object, function(): Promise<void>): Promise<void>} setError - Set error function
 * @property {function(import('./types.js').ExtractionResult): void} setResult - Set result function
 * @property {import('./types.js').UpdateStateFunction} updateState - Update state function
 * @property {any} ERROR_CODES - Error codes object
 * @property {any} PROCESSING_STAGES - Processing stages object
 * @property {function(import('./types.js').ProcessingData, function(): Promise<void>, function(): void): Promise<boolean>} validateAndInitializeProcessing - Validate and initialize processing function
 * @property {function(import('./types.js').ProcessingData, string, function(): Promise<void>, function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, import('./types.js').StopKeepAliveFunction?): Promise<void>, {current: number}): Promise<boolean>} handlePdfPageProcessing - Handle PDF page processing function
 * @property {function(import('./types.js').ProcessingData, any, function(): Promise<void>, function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, import('./types.js').StopKeepAliveFunction?): Promise<void>, {current: number}): Promise<boolean>} handleVideoPageProcessing - Handle video page processing function
 * @property {function(import('./types.js').ProcessingData, function(): Promise<void>, function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, import('./types.js').StopKeepAliveFunction?): Promise<void>, function(import('./types.js').SelectorResult, string): Promise<import('./types.js').InjectionResult>, {current: number}): Promise<boolean>} handleStandardArticleProcessing - Handle standard article processing function
 * @property {function(string): Promise<void>} checkCancellation - Check cancellation function
 * @property {function({id: string, label?: string, name?: string, order?: number}, string, number, {replacements?: Array<string>, extra?: Record<string, any>}?): Promise<void>} updateProgress - Update progress function
 * @property {function(): Promise<string>} getUILanguageCached - Get UI language cached function
 * @property {function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, Function, Function, Function, function(Partial<import('./types.js').ProcessingState>): void): Promise<import('./types.js').ExtractionResult>} handleTranslation - Handle translation function
 * @property {function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, Function, function(Partial<import('./types.js').ProcessingState>): void): Promise<void>} handleAbstractGeneration - Handle abstract generation function
 * @property {function(import('./types.js').ProcessingData, import('./types.js').ExtractionResult, Function): Promise<string>} detectEffectiveLanguage - Detect effective language function
 * @property {function(import('./types.js').ExtractionResult, string, string, string, function(Partial<import('./types.js').ProcessingState> & {stage?: string}): void?): Promise<import('./types.js').ExtractionResult>} translateContent - Translate content function
 * @property {function(Array<import('./types.js').ContentItem>, string, string, string, string, string, function(Partial<import('./types.js').ProcessingState>): void): Promise<Array<import('./types.js').ContentItem>>} translateImages - Translate images function
 * @property {function(Array<import('./types.js').ContentItem>): string} detectSourceLanguage - Detect source language function (supports: en, ru, ua, de, fr, es, it, pt, zh, ja, ko, ar)
 * @property {function(Array<import('./types.js').ContentItem>, string, string, string, string?, function(Partial<import('./types.js').ProcessingState>): void?): Promise<string>} generateAbstract - Generate abstract function
 * @property {function(Array<import('./types.js').ContentItem>, string, string): Promise<string>} detectContentLanguage - Detect content language function
 * @property {any} DocumentGeneratorFactory - Document generator factory class
 * @property {function(string, string?): {isPdf: boolean, originalUrl: string|null}|null} detectPdfPage - Detect PDF page function
 * @property {function(number): Promise<string>} getOriginalPdfUrl - Get original PDF URL function
 * @property {function(string): any} detectVideoPlatform - Detect video platform function
 * @property {function(string, string): string} tSync - Synchronous translation function
 * @property {function(): void} startKeepAlive - Start keep-alive function
 * @property {function(): Promise<void>} stopKeepAlive - Stop keep-alive function
 */

/**
 * @typedef {Object} LoggingDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logError - Error logging function
 * @property {import('./types.js').Config} CONFIG - Configuration object
 */

/**
 * @typedef {Object} KeepAliveDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logError - Error logging function
 * @property {function(string, any?): void} logWarn - Warning logging function
 * @property {import('./types.js').Config} CONFIG - Configuration object
 * @property {function(): import('./types.js').ProcessingState|null} getProcessingState - Get processing state function
 * @property {function(): Promise<void>} saveStateToStorageImmediate - Save state to storage function
 */

/**
 * @typedef {Object} ContextMenuDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logError - Error logging function
 * @property {function(string, any?): void} logWarn - Warning logging function
 * @property {function(string, any?): void} logDebug - Debug logging function
 * @property {import('./types.js').Config} CONFIG - Configuration object
 * @property {function(Error|Object, import('./types.js').ErrorHandlingOptions?): Promise<import('./types.js').NormalizedError>} handleError - Error handler function
 * @property {function(): Promise<string>} getUILanguage - Get UI language function
 * @property {function(string): Promise<void>} updateContextMenuWithLang - Update context menu with language function
 * @property {function(import('./types.js').ExportFormat, function(import('./types.js').ProcessingData): Promise<boolean>, number?): Promise<void>} handleQuickSave - Handle quick save function (startArticleProcessing is wrapped and takes only ProcessingData)
 */

/**
 * @typedef {Object} PortListenerDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logError - Error logging function
 * @property {function(string, any?, string?): void} addLogToCollection - Add log to collection function
 */

/**
 * @typedef {Object} MessageHandlerDeps
 * @property {function(import('./types.js').ProcessingData): Promise<import('./types.js').ExtractionResult>} startArticleProcessing - Start article processing function
 * @property {function(import('./types.js').ProcessingData): Promise<import('./types.js').ExtractionResult>} processWithSelectorMode - Process with selector mode function
 * @property {function(import('./types.js').ProcessingData): Promise<import('./types.js').ExtractionResult>} processWithExtractMode - Process with extract mode function
 * @property {function(import('./types.js').ProcessingData): Promise<import('./types.js').ExtractionResult>} processWithoutAI - Process without AI function
 * @property {function(): Promise<void>} stopKeepAlive - Stop keep-alive function
 * @property {function(): void} startKeepAlive - Start keep-alive function
 * @property {function(string, any?): void} addLogToCollection - Add log to collection function
 * @property {function(): Promise<void>} exportAllLogsToFile - Export all logs to file function
 */

/**
 * @typedef {Object} NotificationsDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logError - Error logging function
 * @property {function(string, any?): void} logWarn - Warning logging function
 * @property {function(): Promise<string>} getUILanguage - Get UI language function
 * @property {function(string, string?): string} tSync - Synchronous translation function
 */

/**
 * @typedef {Object} InitializationDeps
 * @property {function(string, any?): void} log - Log function
 * @property {function(string, any?): void} logWarn - Warning logging function
 * @property {import('./types.js').Config} CONFIG - Configuration object
 * @property {function(Error|Object, import('./types.js').ErrorHandlingOptions?): Promise<import('./types.js').NormalizedError>} handleError - Error handler function
 * @property {function(): void} clearDecryptedKeyCache - Clear decrypted key cache function
 * @property {function(): import('./types.js').ProcessingState|null} getProcessingState - Get processing state function
 * @property {function(): Promise<void>} restoreStateFromStorage - Restore state from storage function
 * @property {function(): Promise<void>} runInitialization - Run initialization tasks function
 * @property {function(): void} startKeepAlive - Start keep-alive function
 */

// Export empty object to make this file a valid ES module
// This allows JSDoc import() syntax to work correctly
export {};

