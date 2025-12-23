// @ts-check
// Constants for offline TTS (Piper TTS)

/**
 * Default voices for each language
 * Medium quality voices verified to exist in piper-tts-web library
 */
export const DEFAULT_VOICES = {
  'en': 'en_US-lessac-medium',      // Medium quality for English (verified: exists in library)
  'ru': 'ru_RU-dmitri-medium',      // Medium quality for Russian (verified: exists in library)
  'uk': null,                        // Ukrainian not available - quality too poor, use Respeecher instead
  'de': 'de_DE-thorsten-medium',     // Medium quality for German (verified: exists in library)
  'fr': 'fr_FR-siwis-medium',        // Medium quality for French (verified: exists in library)
  'es': 'es_ES-sharvard-medium',     // Medium quality for Spanish (verified: exists in library)
  'it': 'it_IT-paola-medium',        // Medium quality for Italian (verified: exists in library) - NOTE: riccardo only has x_low which is filtered
  'pt': 'pt_BR-faber-medium',        // Medium quality for Portuguese (verified: exists in library)
  'zh': 'zh_CN-huayan-medium',       // Medium quality for Chinese (verified: exists in library)
  'ja': null,                         // Japanese not available in library
  'ko': null                          // Korean not available in library
};

/**
 * Fallback voices for when primary voice fails with phoneme errors
 * Based on actual available voices from piper-tts-web library
 * CRITICAL: All fallback voices must be medium or high quality (x_low and low are filtered out)
 */
export const FALLBACK_VOICES = {
  'en': 'en_US-hfc_female-medium',   // Alternative English voice (verified: exists in library)
  'ru': 'ru_RU-denis-medium',         // Alternative Russian voice (verified: exists in library)
  'uk': null,                         // Ukrainian not available - quality too poor, use Respeecher instead
  'de': 'de_DE-mls-medium',           // Alternative German voice (verified: exists in library)
  'fr': 'fr_FR-mls-medium',           // Alternative French voice (verified: exists in library)
  'es': 'es_MX-claude-high',           // Alternative Spanish voice (high quality, verified: exists in library)
  'it': 'it_IT-paola-medium',         // Alternative Italian voice (medium quality, verified: exists in library) - NOTE: riccardo only has x_low which is filtered
  'pt': 'pt_PT-tugão-medium',          // Alternative Portuguese voice (verified: exists in library)
  'zh': 'zh_CN-huayan-medium',        // Only one Chinese voice available (verified: exists in library)
  'ja': null,                          // Japanese not available in library
  'ko': null                           // Korean not available in library
};

/**
 * Worker inactivity timeout (5 minutes)
 * Automatically terminates Worker after inactivity to free memory
 */
export const WORKER_INACTIVITY_TIMEOUT = 5 * 60 * 1000;

