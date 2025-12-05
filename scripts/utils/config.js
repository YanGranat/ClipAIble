// Configuration constants for Webpage to PDF extension

export const CONFIG = {
  // Content processing
  CHUNK_SIZE: 50000,              // Characters per chunk for AI extraction
  CHUNK_OVERLAP: 3000,            // Overlap between chunks to avoid cut-off content
  MAX_HTML_FOR_ANALYSIS: 500000,  // Max chars to send to AI for selector analysis
  TRANSLATION_CHUNK_SIZE: 20000,  // Characters per translation batch
  
  // Timeouts
  API_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes timeout for API requests (translation can take 8+ min)
  STATE_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes - stale state threshold
  
  // Keep-alive
  KEEP_ALIVE_INTERVAL: 0.33,      // Minutes (20 seconds) - must be < 0.5 for MV3
  
  // Polling
  POLL_INTERVAL_IDLE: 1000,       // ms - polling interval when idle
  POLL_INTERVAL_PROCESSING: 300   // ms - polling interval when processing
};

// Language names for translation
export const LANGUAGE_NAMES = {
  'en': 'English',
  'ru': 'Russian',
  'uk': 'Ukrainian',
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
  'uk': 'Привіт світ',
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
    abstract: 'Abstract'
  },
  'ru': {
    originalArticle: 'Оригинал статьи',
    words: 'слов',
    contents: 'Содержание',
    date: 'Дата',
    source: 'Источник',
    author: 'Автор',
    abstract: 'Резюме'
  },
  'uk': {
    originalArticle: 'Оригінал статті',
    words: 'слів',
    contents: 'Зміст',
    date: 'Дата',
    source: 'Джерело',
    author: 'Автор',
    abstract: 'Резюме'
  },
  'de': {
    originalArticle: 'Originalartikel',
    words: 'Wörter',
    contents: 'Inhalt',
    date: 'Datum',
    source: 'Quelle',
    author: 'Autor',
    abstract: 'Zusammenfassung'
  },
  'fr': {
    originalArticle: 'Article original',
    words: 'mots',
    contents: 'Sommaire',
    date: 'Date',
    source: 'Source',
    author: 'Auteur',
    abstract: 'Résumé'
  },
  'es': {
    originalArticle: 'Artículo original',
    words: 'palabras',
    contents: 'Contenido',
    date: 'Fecha',
    source: 'Fuente',
    author: 'Autor',
    abstract: 'Resumen'
  },
  'it': {
    originalArticle: 'Articolo originale',
    words: 'parole',
    contents: 'Indice',
    date: 'Data',
    source: 'Fonte',
    author: 'Autore',
    abstract: 'Riassunto'
  },
  'pt': {
    originalArticle: 'Artigo original',
    words: 'palavras',
    contents: 'Sumário',
    date: 'Data',
    source: 'Fonte',
    author: 'Autor',
    abstract: 'Resumo'
  },
  'zh': {
    originalArticle: '原文',
    words: '字',
    contents: '目录',
    date: '日期',
    source: '来源',
    author: '作者',
    abstract: '摘要'
  },
  'ja': {
    originalArticle: '元の記事',
    words: '語',
    contents: '目次',
    date: '日付',
    source: '出典',
    author: '著者',
    abstract: '要約'
  },
  'ko': {
    originalArticle: '원본 기사',
    words: '단어',
    contents: '목차',
    date: '날짜',
    source: '출처',
    author: '저자',
    abstract: '요약'
  },
  'auto': {
    originalArticle: 'Original article',
    words: 'words',
    contents: 'Contents',
    date: 'Date',
    source: 'Source',
    author: 'Author',
    abstract: 'Abstract'
  }
};

// Special marker that AI returns when text is already in target language
export const NO_TRANSLATION_MARKER = '[NO_TRANSLATION_NEEDED]';

// Style presets for PDF
export const STYLE_PRESETS = {
  dark: {
    bgColor: '#303030',
    textColor: '#b9b9b9',
    headingColor: '#cfcfcf',
    linkColor: '#6cacff'
  },
  light: {
    bgColor: '#f8f9fa',
    textColor: '#212529',
    headingColor: '#1a1a2e',
    linkColor: '#0066cc'
  },
  sepia: {
    bgColor: '#faf4e8',
    textColor: '#5b4636',
    headingColor: '#3d2914',
    linkColor: '#8b4513'
  },
  contrast: {
    bgColor: '#000000',
    textColor: '#ffffff',
    headingColor: '#ffd700',
    linkColor: '#00ffff'
  }
};

/**
 * Get locale string from language code
 * @param {string} langCode - Language code (e.g., 'ru', 'en', 'uk')
 * @returns {string} Locale string (e.g., 'ru-RU', 'en-US')
 */
export function getLocaleFromLanguage(langCode) {
  const localeMap = {
    'ru': 'ru-RU',
    'uk': 'uk-UA',
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
export function formatDateForDisplay(dateStr, localeOrLang = 'en-US') {
  if (!dateStr) return '';
  
  // Convert language code to locale if needed
  const locale = localeOrLang.includes('-') ? localeOrLang : getLocaleFromLanguage(localeOrLang);
  
  // Check if it's an ISO format date
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(T|$)/);
  if (!isoMatch) {
    // Not ISO format, return as-is
    return dateStr;
  }
  
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString(locale, options);
    }
  } catch (e) {
    // Fallback to simple format
  }
  
  // Fallback: extract date parts
  return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
}

