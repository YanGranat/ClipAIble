// Configuration constants for ClipAIble extension

export const CONFIG = {
  // Content processing
  CHUNK_SIZE: 50000,              // Characters per chunk for AI extraction
  CHUNK_OVERLAP: 3000,            // Overlap between chunks to avoid cut-off content
  MAX_HTML_FOR_ANALYSIS: 480000,  // Max chars to send to AI for selector analysis (reduced to account for system prompt ~15k + user prompt prefix ~5k)
  TRANSLATION_CHUNK_SIZE: 20000,  // Characters per translation batch
  
  // Timeouts
  API_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes timeout for API requests (increased for very long articles and slow networks)
  STATE_EXPIRY_MS: 2 * 60 * 60 * 1000, // 2 hours - stale state threshold (increased for very long operations)
  STATE_SAVE_INTERVAL: 2000,      // Save state every 2 seconds during processing (ULTRA FREQUENT to keep SW alive)
  
  // Keep-alive
  KEEP_ALIVE_INTERVAL: 1,         // Minutes (>=1 min per MV3 requirement)
  KEEP_ALIVE_PING_INTERVAL: 10,  // Seconds - ULTRA AGGRESSIVE ping every 10 seconds to prevent SW death
  
  // Polling
  POLL_INTERVAL_IDLE: 1000,       // ms - polling interval when idle
  POLL_INTERVAL_PROCESSING: 300,  // ms - polling interval when processing
  
  // Retry configuration
  RETRY_MAX_ATTEMPTS: 8,          // Maximum number of retry attempts (increased for maximum reliability)
  RETRY_DELAYS: [2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000], // Exponential backoff delays in ms (longer delays for network issues, up to 5 minutes)
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504], // HTTP status codes that trigger retry
  RETRY_NETWORK_ERRORS: true,     // Retry on network errors (timeout, connection failed, etc.)
  
  // Default values
  DEFAULT_AUDIO_VOICE: 'nova',    // Default OpenAI TTS voice
  DEFAULT_AUDIO_SPEED: 1.0,       // Default audio playback speed
  DEFAULT_AUDIO_FORMAT: 'mp3',    // Default audio format
  DEFAULT_ELEVENLABS_MODEL: 'eleven_v3', // Default ElevenLabs model
  DEFAULT_RESPEECHER_VOICE: 'samantha',  // Default Respeecher English voice
  
  // Logging
  LOG_LEVEL: 1,                   // Log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR (default: INFO)
};

// Language names for translation
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

// "Hello world" examples in different languages for translation prompts
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

// Localization strings for PDF metadata
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

// Special marker that AI returns when text is already in target language
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

