// @ts-check
// Configuration constants for ClipAIble extension

/**
 * @readonly
 * @const {import('../types.js').Config}
 */
export const CONFIG = {
  // Content processing
  CHUNK_SIZE: 50000,              // Characters per chunk for AI extraction
  CHUNK_OVERLAP: 3000,            // Overlap between chunks to avoid cut-off content
  MAX_HTML_FOR_ANALYSIS: 450000,  // Max chars to send to AI for selector analysis (reduced to account for system prompt ~17k + user prompt prefix ~5k + API overhead ~3k, total ~475k max)
  TRANSLATION_CHUNK_SIZE: 20000,  // Characters per translation batch
  
  // Timeouts
  API_TIMEOUT_MS: 120 * 60 * 1000, // 120 minutes (2 hours) timeout for API requests (increased for very long articles, large PDFs, and slow networks)
  STATE_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days - stale state threshold (increased for very long operations like 1000-page PDFs)
  // NOTE: STATE_SAVE_INTERVAL removed - keep-alive now uses only alarms (every 1 minute)
  // Alarms can wake up terminated service workers, intervals cannot
  // This reduces storage load by 90% while maintaining reliability
  
  // Long-running operations timeouts (for very large articles/audio files and large PDFs up to 1000 pages)
  MAX_OPERATION_TIMEOUT_MS: 7 * 24 * 60 * 60 * 1000, // 7 days (168 hours) - initial maximum timeout estimate (supports PDFs up to 1000 pages)
  ABSOLUTE_MAX_OPERATION_TIMEOUT_MS: 10 * 24 * 60 * 60 * 1000, // 10 days (240 hours) - absolute maximum (safety limit for stuck operations, supports even larger PDFs)
  OFFScreen_TTS_TIMEOUT_BASE: 60 * 1000, // 60 seconds base timeout
  OFFScreen_TTS_TIMEOUT_PER_CHAR: 100, // 100ms per character
  OFFScreen_TTS_TIMEOUT_MAX: 7 * 24 * 60 * 60 * 1000, // 7 days (168 hours) - initial estimate maximum (supports very long audio generation)
  OFFScreen_TTS_HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds - heartbeat interval for timeout extension
  OFFScreen_TTS_HEARTBEAT_EXTENSION: 30 * 60 * 1000, // 30 minutes - how much to extend timeout on each heartbeat
  
  // PDF processing timeouts (for very large PDFs up to 1000 pages)
  PDF_TAB_LOAD_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for tab load (increased from 30 seconds for very large PDFs)
  PDF_PAGE_LOAD_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for page load (increased from 5 seconds for very large PDFs)
  PDF_PAGE_LOAD_FALLBACK_TIMEOUT_MS: 2 * 60 * 1000, // 2 minutes - fallback timeout for page load (increased from 2 seconds for very large PDFs)
  PDF_FIRST_PAGE_RENDER_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes - timeout for first page render (longer for initialization)
  PDF_RENDER_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for PDF page rendering (increased from 60 seconds for 1000-page PDFs)
  PDF_PARSE_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for PDF parsing (increased from 30 seconds for 1000-page PDFs)
  
  // Audio cleanup
  AUDIO_CLEANUP_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes - threshold for stale audio cleanup
  
  // Worker inactivity timeout
  WORKER_INACTIVITY_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for worker inactivity
  
  // Offscreen TTS cleanup timeout
  OFFScreen_TTS_CLEANUP_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes - timeout for offscreen TTS cleanup (enough time for audio to be used)
  
  // Keep-alive
  KEEP_ALIVE_INTERVAL: 1,         // Minutes (>=1 min per MV3 requirement)
  // OPTIMIZED: Removed intervals - alarms alone are sufficient and can wake terminated service workers
  // This reduces storage operations by 90% (from 30+ per minute to 1 per minute)
  
  // State thresholds
  RESET_THRESHOLD_MS: 60 * 1000,        // 1 minute - threshold for resetting state on extension reload
  SUMMARY_STALE_THRESHOLD_MS: 15 * 60 * 1000, // 15 minutes - threshold for stale summary generation flag
  SUMMARY_TIMEOUT_MS: 10 * 60 * 1000,   // 10 minutes - timeout for summary generation (will abort and show error)
  MAX_UPDATE_QUEUE_SIZE: 100,           // Maximum number of queued state updates (prevents memory leaks)
  
  // Polling
  POLL_INTERVAL_IDLE: 1000,       // ms - polling interval when idle
  POLL_INTERVAL_PROCESSING: 300,  // ms - polling interval when processing
  
  // Retry configuration
  RETRY_MAX_ATTEMPTS: 8,          // Maximum number of retry attempts (increased for maximum reliability)
  RETRY_DELAYS: [2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000], // Exponential backoff delays in ms (longer delays for network issues, up to 5 minutes)
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504], // HTTP status codes that trigger retry
  RETRY_NETWORK_ERRORS: true,     // Retry on network errors (timeout, connection failed, etc.)
  
  // UI and Event Handling
  UI_DEBOUNCE_DELAY: 500,         // ms - debounce delay for UI settings saves (popup)
  UI_ASYNC_DEFER_DELAY: 0,        // ms - delay for deferring async work (0 = next tick)
  UI_RETRY_DELAY: 100,            // ms - retry delay for failed saves
  UI_CONTEXT_MENU_DELAY: 50,      // ms - delay for context menu operations
  
  // Storage
  STORAGE_SAVE_DEBOUNCE: 5000,    // ms - debounce for storage saves (background) - OPTIMIZED: increased from 500ms to 5s to reduce load
  STORAGE_SAVE_DEBOUNCE_AUDIO: 3000, // ms - debounce for audio storage saves (longer to avoid blocking WASM operations)
  
  // TTS and Audio
  TTS_DELAY: 200,                 // ms - delay for TTS operations
  TTS_VOICES_LOAD_DELAY: 1000,   // ms - delay for loading TTS voices
  OFFLINE_TTS_SETUP_DELAY: 300,   // ms - delay for offline TTS setup
  OFFLINE_TTS_RETRY_DELAY: 100,   // ms - retry delay for offline TTS verification
  OFFLINE_TTS_NEXT_TICK_DELAY: 0, // ms - delay for next tick operations
  
  // Video Processing
  VIDEO_SUBTITLES_CHECK_INTERVAL: 200,  // ms - interval for checking subtitle storage
  VIDEO_SUBTITLES_TIMEOUT: 60000,       // ms - timeout for subtitle extraction (60 seconds)
  VIDEO_SUBTITLES_RETRY_DELAY_1: 2000,  // ms - first retry delay for video subtitles
  VIDEO_SUBTITLES_RETRY_DELAY_2: 1000,  // ms - second retry delay for video subtitles
  VIDEO_SUBTITLES_WAIT_INTERVAL: 500,   // ms - wait interval for video subtitles
  
  // Extraction
  EXTRACTION_AUTOMATIC_TIMEOUT: 30000,  // ms - timeout for automatic extraction (30 seconds)
  
  // Translation
  TRANSLATION_RETRY_DELAYS: [2000, 5000, 10000, 20000, 30000], // ms - retry delays for translation
  
  // Default values
  DEFAULT_AUDIO_VOICE: 'nova',    // Default OpenAI TTS voice
  DEFAULT_AUDIO_SPEED: 1.0,       // Default audio playback speed
  DEFAULT_AUDIO_FORMAT: 'mp3',    // Default audio format
  DEFAULT_ELEVENLABS_MODEL: 'eleven_v3', // Default ElevenLabs model
  DEFAULT_RESPEECHER_VOICE: 'samantha',  // Default Respeecher English voice
  
  // Logging
  LOG_LEVEL: 0,                   // Log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR (default: DEBUG for active development)
  VERBOSE_LOGGING: false,          // Enable verbose logging for detailed debugging (increases log volume significantly)
  MAX_LOG_DATA_SIZE: 100000,       // Maximum size of data object to log (in characters after JSON.stringify), larger objects will be truncated
  LOG_COLLECTION_MAX_SIZE: 10000, // OPTIMIZED: Maximum number of logs in memory collection (reduced from 50k to 10k to save memory)
  
  // Extension version (synchronized with manifest.json)
  // This is used as fallback if chrome.runtime.getManifest() fails (extremely rare)
  // CRITICAL: Must be updated when version changes in manifest.json
  EXTENSION_VERSION: '3.3.0'
};

/**
 * Language names for translation
 * @readonly
 * @const {Record<string, string>}
 */
export const LANGUAGE_NAMES = {
  'en': 'English',
  'ru': 'Russian',
  'ua': 'Ukrainian',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean'
};

/**
 * "Hello world" examples in different languages for translation prompts
 * @readonly
 * @const {Record<string, string>}
 */
export const HELLO_WORLD_EXAMPLES = {
  'en': 'Hello world',
  'ru': 'Привет мир',
  'ua': 'Привіт світ',
  'de': 'Hallo Welt',
  'fr': 'Bonjour le monde',
  'es': 'Hola mundo',
  'it': 'Ciao mondo',
  'pt': 'Olá mundo',
  'zh': '你好世界',
  'ja': 'こんにちは世界',
  'ko': '안녕하세요 세계'
};

/**
 * Localization strings for PDF metadata
 * @readonly
 * @const {Record<string, Record<string, string>>}
 */
export const PDF_LOCALIZATION = {
  'en': {
    originalArticle: 'Original article',
    words: 'words',
    contents: 'Contents',
    date: 'Date',
    source: 'Source',
    author: 'Author',
    abstract: 'TL;DR',
    footnotes: 'Footnotes'
  },
  'ru': {
    originalArticle: 'Оригинал статьи',
    words: 'слов',
    contents: 'Содержание',
    date: 'Дата',
    source: 'Источник',
    author: 'Автор',
    abstract: 'TL;DR',
    footnotes: 'Сноски'
  },
  'ua': {
    originalArticle: 'Оригінал статті',
    words: 'слів',
    contents: 'Зміст',
    date: 'Дата',
    source: 'Джерело',
    author: 'Автор',
    abstract: 'TL;DR',
    footnotes: 'Виноски'
  },
  'de': {
    originalArticle: 'Originalartikel',
    words: 'Wörter',
    contents: 'Inhalt',
    date: 'Datum',
    source: 'Quelle',
    author: 'Autor',
    abstract: 'Zusammenfassung',
    footnotes: 'Fußnoten'
  },
  'fr': {
    originalArticle: 'Article original',
    words: 'mots',
    contents: 'Sommaire',
    date: 'Date',
    source: 'Source',
    author: 'Auteur',
    abstract: 'Résumé',
    footnotes: 'Notes'
  },
  'es': {
    originalArticle: 'Artículo original',
    words: 'palabras',
    contents: 'Contenido',
    date: 'Fecha',
    source: 'Fuente',
    author: 'Autor',
    abstract: 'Resumen',
    footnotes: 'Notas'
  },
  'it': {
    originalArticle: 'Articolo originale',
    words: 'parole',
    contents: 'Indice',
    date: 'Data',
    source: 'Fonte',
    author: 'Autore',
    abstract: 'Riassunto',
    footnotes: 'Note'
  },
  'pt': {
    originalArticle: 'Artigo original',
    words: 'palavras',
    contents: 'Sumário',
    date: 'Data',
    source: 'Fonte',
    author: 'Autor',
    abstract: 'Resumo',
    footnotes: 'Notas de rodapé'
  },
  'zh': {
    originalArticle: '原文',
    words: '字',
    contents: '目录',
    date: '日期',
    source: '来源',
    author: '作者',
    abstract: '摘要',
    footnotes: '脚注'
  },
  'ja': {
    originalArticle: '元の記事',
    words: '語',
    contents: '目次',
    date: '日付',
    source: '出典',
    author: '著者',
    abstract: '要約',
    footnotes: '脚注'
  },
  'ko': {
    originalArticle: '원본 기사',
    words: '단어',
    contents: '목차',
    date: '날짜',
    source: '출처',
    author: '저자',
    abstract: '요약',
    footnotes: '각주'
  },
  'auto': {
    originalArticle: 'Original article',
    words: 'words',
    contents: 'Contents',
    date: 'Date',
    source: 'Source',
    author: 'Author',
    abstract: 'TL;DR',
    footnotes: 'Footnotes'
  }
};

/**
 * Special marker that AI returns when text is already in target language
 * @readonly
 * @const {string}
 */
export const NO_TRANSLATION_MARKER = '[NO_TRANSLATION_NEEDED]';

// Note: STYLE_PRESETS are defined in popup/popup.js (UI layer)
// They are not needed in config.js as PDF generation uses colors passed from popup

/**
 * Get locale string from language code
 * @param {string} langCode - Language code (e.g., 'ru', 'en', 'ua')
 * @returns {string} Locale string (e.g., 'ru-RU', 'en-US')
 */
export function getLocaleFromLanguage(langCode) {
  const localeMap = {
    'ru': 'ru-RU',
    'ua': 'uk-UA',
    'en': 'en-US',
    'de': 'de-DE',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'it': 'it-IT',
    'pt': 'pt-PT',
    'zh': 'zh-CN',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'ar': 'ar-SA',
    'hi': 'hi-IN',
    'pl': 'pl-PL',
    'nl': 'nl-NL',
    'tr': 'tr-TR',
    'auto': 'en-US'
  };
  return localeMap[langCode] || 'en-US';
}

/**
 * Format ISO date string to readable format
 * @param {string} dateStr - Date string (ISO or other format)
 * @param {string} localeOrLang - Locale (e.g., 'ru-RU') or language code (e.g., 'ru')
 * @returns {string} Formatted date string
 */
/**
 * Format date for display in target locale
 * @param {string} dateStr - Date string (preferably ISO format YYYY-MM-DD, YYYY-MM, or YYYY, but supports legacy formats)
 * @param {string} localeOrLang - Locale code (e.g., 'ru-RU') or language code (e.g., 'ru')
 * @returns {string} Formatted date string
 */
export function formatDateForDisplay(dateStr, localeOrLang = 'en-US') {
  if (!dateStr) return '';
  
  // Convert language code to locale if needed
  const locale = localeOrLang.includes('-') ? localeOrLang : getLocaleFromLanguage(localeOrLang);
  
  // Primary path: ISO format (YYYY-MM-DD, YYYY-MM, or YYYY) - this is what AI should return now
  // Full date: YYYY-MM-DD
  const fullDateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(T|$)/);
  if (fullDateMatch) {
    try {
      const year = parseInt(fullDateMatch[1], 10);
      const month = parseInt(fullDateMatch[2], 10) - 1; // JS months are 0-indexed
      const day = parseInt(fullDateMatch[3], 10);
      const date = new Date(Date.UTC(year, month, day));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch (e) {
      // Fallback below
    }
  }
  
  // Year and month: YYYY-MM
  const yearMonthMatch = dateStr.match(/^(\d{4})-(\d{2})$/);
  if (yearMonthMatch) {
    try {
      const year = parseInt(yearMonthMatch[1], 10);
      const month = parseInt(yearMonthMatch[2], 10) - 1;
      const date = new Date(Date.UTC(year, month, 1));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'long' });
      }
    } catch (e) {
      // Fallback below
    }
  }
  
  // Year only: YYYY
  const yearOnlyMatch = dateStr.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    return yearOnlyMatch[1];
  }
  
  // Legacy support: Try to parse various date formats (for backward compatibility)
  // Try common English formats with ordinals (e.g., "31st Jul 2007")
  const ordinalMatch = dateStr.match(/^(\d{1,2})(st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/);
  if (ordinalMatch) {
    const day = parseInt(ordinalMatch[1], 10);
    const monthName = ordinalMatch[3].toLowerCase();
    const year = parseInt(ordinalMatch[4], 10);
    const monthMap = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };
    const month = monthMap[monthName];
    if (month !== undefined) {
      const date = new Date(Date.UTC(year, month, day));
      return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }
  
  // Legacy support: Try format without ordinals (e.g., "Dec 8, 2025")
  const shortMatch = dateStr.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (shortMatch) {
    const monthName = shortMatch[1].toLowerCase();
    const day = parseInt(shortMatch[2], 10);
    const year = parseInt(shortMatch[3], 10);
    const monthMap = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };
    const month = monthMap[monthName];
    if (month !== undefined) {
      const date = new Date(Date.UTC(year, month, day));
      return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }
  
  // Fallback: Try native Date parsing
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
  } catch (e) {
    // Fallback to returning as-is
  }
  
  // Last resort: return as-is (shouldn't happen with proper ISO format from AI)
  return dateStr;
}

/**
 * Get extension version from manifest
 * Falls back to CONFIG.EXTENSION_VERSION if manifest is unavailable (extremely rare)
 * @returns {string} Extension version (e.g., '3.3.0')
 */
export function getExtensionVersion() {
  try {
    // chrome.runtime.getManifest() is always available in service worker and popup contexts
    // It always returns an object (never null/undefined) according to Chrome Extension API
    // manifest.version may be undefined only if manifest.json is corrupted (extremely rare)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version) {
        return manifest.version;
      }
    }
  } catch (error) {
    // Fallback to config constant if getManifest fails (extremely rare edge case)
    // This can happen if manifest.json is corrupted or extension context is invalid
  }
  
  // Fallback to config constant (synchronized with manifest.json)
  // CRITICAL: CONFIG.EXTENSION_VERSION must be updated when version changes in manifest.json
  return CONFIG.EXTENSION_VERSION;
}

