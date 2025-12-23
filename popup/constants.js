// @ts-check
// Constants for popup module

/**
 * Storage keys for chrome.storage.local
 */
export const STORAGE_KEYS = {
  API_KEY: 'openai_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  GROK_API_KEY: 'grok_api_key',
  OPENROUTER_API_KEY: 'openrouter_api_key',
  GOOGLE_API_KEY: 'google_api_key',
  API_PROVIDER: 'api_provider',
  MODEL: 'openai_model',
  MODEL_BY_PROVIDER: 'model_by_provider', // Store selected model for each provider
  CUSTOM_MODELS: 'custom_models',
  HIDDEN_MODELS: 'hidden_models',
  MODE: 'extraction_mode',
  USE_CACHE: 'use_selector_cache',
  ENABLE_CACHE: 'enable_selector_caching',
  ENABLE_STATS: 'enable_statistics',
  OUTPUT_FORMAT: 'output_format',
  GENERATE_TOC: 'generate_toc',
  GENERATE_ABSTRACT: 'generate_abstract',
  PAGE_MODE: 'page_mode',
  LANGUAGE: 'pdf_language',
  TRANSLATE_IMAGES: 'translate_images',
  STYLE_PRESET: 'pdf_style_preset',
  FONT_FAMILY: 'pdf_font_family',
  FONT_SIZE: 'pdf_font_size',
  BG_COLOR: 'pdf_bg_color',
  TEXT_COLOR: 'pdf_text_color',
  HEADING_COLOR: 'pdf_heading_color',
  LINK_COLOR: 'pdf_link_color',
  THEME: 'popup_theme',
  UI_LANGUAGE: 'ui_language',
  AUDIO_PROVIDER: 'audio_provider',
  ELEVENLABS_API_KEY: 'elevenlabs_api_key',
  ELEVENLABS_MODEL: 'elevenlabs_model',
  ELEVENLABS_STABILITY: 'elevenlabs_stability',
  ELEVENLABS_SIMILARITY: 'elevenlabs_similarity',
  ELEVENLABS_STYLE: 'elevenlabs_style',
  ELEVENLABS_SPEAKER_BOOST: 'elevenlabs_speaker_boost',
  ELEVENLABS_FORMAT: 'elevenlabs_format',
  QWEN_API_KEY: 'qwen_api_key',
  RESPEECHER_API_KEY: 'respeecher_api_key',
  RESPEECHER_TEMPERATURE: 'respeecher_temperature',
  RESPEECHER_REPETITION_PENALTY: 'respeecher_repetition_penalty',
  RESPEECHER_TOP_P: 'respeecher_top_p',
  GOOGLE_TTS_API_KEY: 'google_tts_api_key',
  GOOGLE_TTS_MODEL: 'google_tts_model',
  AUDIO_VOICE: 'audio_voice',
  AUDIO_VOICE_MAP: 'audio_voice_map',
  AUDIO_SPEED: 'audio_speed',
  OPENAI_INSTRUCTIONS: 'openai_instructions',
  GOOGLE_TTS_VOICE: 'google_tts_voice',
  GOOGLE_TTS_PROMPT: 'google_tts_prompt',
  SUMMARY_TEXT: 'summary_text',
  SUMMARY_GENERATING: 'summary_generating'
};

/**
 * Default style values for PDF generation
 */
export const DEFAULT_STYLES = {
  fontFamily: '',
  fontSize: '31',
  bgColor: '#303030',
  textColor: '#b9b9b9',
  headingColor: '#cfcfcf',
  linkColor: '#6cacff'
};

/**
 * Style presets - carefully designed color schemes
 * Each preset tested for WCAG AA contrast (min 4.5:1 for text)
 */
export const STYLE_PRESETS = {
  // Dark theme - user's custom default
  dark: {
    bgColor: '#303030',
    textColor: '#b9b9b9',
    headingColor: '#cfcfcf',
    linkColor: '#6cacff'
  },
  // Light theme - Modern clean design
  // Slightly off-white to reduce eye strain
  light: {
    bgColor: '#f8f9fa',      // Soft white (not pure white)
    textColor: '#343a40',    // Dark gray text (contrast ~10:1)
    headingColor: '#212529', // Near-black headings
    linkColor: '#0d6efd'     // Bootstrap blue links
  },
  // Sepia theme - E-reader style (Kindle-inspired)
  // Warm tones for comfortable extended reading
  sepia: {
    bgColor: '#faf4e8',      // Warm cream background
    textColor: '#5d4e37',    // Warm brown text (contrast ~7:1)
    headingColor: '#3d2e1f', // Dark chocolate headings
    linkColor: '#8b6914'     // Muted gold links
  },
  // High Contrast - Accessibility focused
  // Maximum contrast for visual impairment (WCAG AAA: 21:1)
  contrast: {
    bgColor: '#000000',      // Pure black
    textColor: '#ffffff',    // Pure white (contrast 21:1)
    headingColor: '#ffd700', // Gold headings (softer than yellow)
    linkColor: '#00bfff'     // DeepSkyBlue (softer than cyan)
  }
};

/**
 * Mode hints for extraction modes
 */
export const MODE_HINTS = {
  selector: 'AI finds article blocks, script extracts content',
  extract: 'AI extracts and processes all content'
};

