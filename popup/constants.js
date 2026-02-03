// @ts-check
// Element ID constants for ClipAIble popup
// This file contains all HTML element IDs to avoid magic strings

export const ELEMENT_IDS = {
  // Header
  UI_LANGUAGE_SELECT: 'uiLanguageSelect',
  THEME_SELECT: 'themeSelect',

  // API Section
  API_SECTION: 'apiSection',
  API_PROVIDER_SELECT: 'apiProviderSelect',
  MODEL_SELECT: 'modelSelect',
  ADD_MODEL_BTN: 'addModelBtn',
  CUSTOM_MODEL_DROPDOWN: 'customModelDropdown',
  CUSTOM_MODEL_OPTIONS: 'customModelOptions',
  API_KEY_INPUT_GROUP: 'apiKeyInputGroup',
  API_KEY_LABEL: 'apiKeyLabel',
  API_KEY: 'apiKey',
  TOGGLE_API_KEY: 'toggleApiKey',
  SAVE_API_KEY: 'saveApiKey',

  // Claude API
  CLAUDE_API_KEY: 'claudeApiKey',
  TOGGLE_CLAUDE_API_KEY: 'toggleClaudeApiKey',
  SAVE_CLAUDE_API_KEY: 'saveClaudeApiKey',

  // Gemini API
  GEMINI_API_KEY: 'geminiApiKey',
  TOGGLE_GEMINI_API_KEY: 'toggleGeminiApiKey',
  SAVE_GEMINI_API_KEY: 'saveGeminiApiKey',

  // Google API
  GOOGLE_API_KEY: 'googleApiKey',
  TOGGLE_GOOGLE_API_KEY: 'toggleGoogleApiKey',
  SAVE_GOOGLE_API_KEY: 'saveGoogleApiKey',
  GOOGLE_API_GROUP: 'googleApiGroup',

  // Status Section
  STATUS_SECTION: 'statusSection',
  STATUS_INDICATOR: 'statusIndicator',
  STATUS_TEXT: 'statusText',
  PROGRESS_CONTAINER: 'progressContainer',
  PROGRESS_BAR: 'progressBar',
  PROGRESS_TEXT: 'progressText',
  SAVE_PDF_BTN: 'savePdfBtn',
  SAVE_ICON: 'saveIcon',
  SAVE_TEXT: 'saveText',
  CANCEL_BTN: 'cancelBtn',
  MAIN_FORMAT_SELECT: 'mainFormatSelect',

  // Summary Section
  GENERATE_SUMMARY_BTN: 'generateSummaryBtn',
  SUMMARY_CONTAINER: 'summaryContainer',
  SUMMARY_TOGGLE: 'summaryToggle',
  SUMMARY_COPY_BTN: 'summaryCopyBtn',
  SUMMARY_DOWNLOAD_BTN: 'summaryDownloadBtn',
  SUMMARY_CLOSE_BTN: 'summaryCloseBtn',
  SUMMARY_CONTENT: 'summaryContent',
  SUMMARY_TEXT: 'summaryText',

  // Key theses
  GENERATE_KEY_THESES_BTN: 'generateKeyThesesBtn',
  KEY_THESES_CONTAINER: 'keyThesesContainer',
  KEY_THESES_TOGGLE: 'keyThesesToggle',
  KEY_THESES_COPY_BTN: 'keyThesesCopyBtn',
  KEY_THESES_DOWNLOAD_BTN: 'keyThesesDownloadBtn',
  KEY_THESES_CLOSE_BTN: 'keyThesesCloseBtn',
  KEY_THESES_CONTENT: 'keyThesesContent',
  KEY_THESES_TEXT: 'keyThesesText',

  // Settings Toggle
  TOGGLE_SETTINGS: 'toggleSettings',
  TOGGLE_STATS: 'toggleStats',

  // Stats Panel
  STATS_PANEL: 'statsPanel',
  STAT_TOTAL: 'statTotal',
  STAT_MONTH: 'statMonth',
  STATS_FORMATS: 'statsFormats',
  FORMAT_PDF: 'formatPdf',
  FORMAT_EPUB: 'formatEpub',
  FORMAT_FB2: 'formatFb2',
  FORMAT_MARKDOWN: 'formatMarkdown',
  FORMAT_AUDIO: 'formatAudio',
  STATS_HISTORY: 'statsHistory',
  ENABLE_STATS: 'enableStats',
  CLEAR_STATS_BTN: 'clearStatsBtn',
  ENABLE_CACHE: 'enableCache',
  CACHE_DOMAINS: 'cacheDomains',
  CACHE_DOMAINS_LIST: 'cacheDomainsList',
  CLEAR_CACHE_BTN: 'clearCacheBtn',

  // Settings Panel
  SETTINGS_PANEL: 'settingsPanel',
  MODE_SELECT: 'modeSelect',
  MODE_HINT: 'modeHint',
  USE_CACHE: 'useCache',
  USE_CACHE_GROUP: 'useCacheGroup',
  OUTPUT_FORMAT: 'outputFormat',
  GENERATE_TOC: 'generateToc',
  GENERATE_ABSTRACT: 'generateAbstract',
  PAGE_MODE: 'pageMode',
  PAGE_MODE_GROUP: 'pageModeGroup',
  LANGUAGE_SELECT: 'languageSelect',
  TRANSLATE_IMAGES: 'translateImages',
  TRANSLATE_IMAGES_GROUP: 'translateImagesGroup',

  // Styles
  STYLE_PRESET: 'stylePreset',
  STYLE_PRESET_CONTAINER: 'stylePresetContainer', // Note: This element may not exist in HTML
  FONT_FAMILY_CONTAINER: 'fontFamilyContainer',
  FONT_FAMILY_TRIGGER: 'fontFamilyTrigger',
  FONT_FAMILY_VALUE: 'fontFamilyValue',
  FONT_FAMILY_OPTIONS: 'fontFamilyOptions',
  FONT_FAMILY: 'fontFamily',
  FONT_SIZE: 'fontSize',
  BG_COLOR: 'bgColor',
  BG_COLOR_TEXT: 'bgColorText',
  TEXT_COLOR: 'textColor',
  TEXT_COLOR_TEXT: 'textColorText',
  HEADING_COLOR: 'headingColor',
  HEADING_COLOR_TEXT: 'headingColorText',
  LINK_COLOR: 'linkColor',
  LINK_COLOR_TEXT: 'linkColorText',

  // Buttons
  RESET_STYLES_BTN: 'resetStylesBtn',
  EXPORT_SETTINGS_BTN: 'exportSettingsBtn',
  IMPORT_SETTINGS_BTN: 'importSettingsBtn',
  IMPORT_FILE_INPUT: 'importFileInput',

  // Footer
  GITHUB_LINK: 'githubLink',
  VERSION_TEXT: 'versionText',

  // Audio settings
  AUDIO_PROVIDER: 'audioProvider',
  AUDIO_PROVIDER_GROUP: 'audioProviderGroup',

  // ElevenLabs
  ELEVENLABS_API_KEY_GROUP: 'elevenlabsApiKeyGroup',
  ELEVENLABS_API_KEY: 'elevenlabsApiKey',
  TOGGLE_ELEVENLABS_API_KEY: 'toggleElevenlabsApiKey',
  SAVE_ELEVENLABS_API_KEY: 'saveElevenlabsApiKey',
  ELEVENLABS_MODEL_GROUP: 'elevenlabsModelGroup',
  ELEVENLABS_MODEL: 'elevenlabsModel',
  ELEVENLABS_FORMAT_GROUP: 'elevenlabsFormatGroup',
  ELEVENLABS_FORMAT: 'elevenlabsFormat',
  ELEVENLABS_ADVANCED_GROUP: 'elevenlabsAdvancedGroup',
  ELEVENLABS_STABILITY: 'elevenlabsStability',
  ELEVENLABS_STABILITY_VALUE: 'elevenlabsStabilityValue',
  ELEVENLABS_SIMILARITY: 'elevenlabsSimilarity',
  ELEVENLABS_SIMILARITY_VALUE: 'elevenlabsSimilarityValue',
  ELEVENLABS_STYLE: 'elevenlabsStyle',
  ELEVENLABS_STYLE_VALUE: 'elevenlabsStyleValue',
  ELEVENLABS_SPEAKER_BOOST: 'elevenlabsSpeakerBoost',

  // Qwen
  QWEN_API_KEY_GROUP: 'qwenApiKeyGroup',
  QWEN_API_KEY: 'qwenApiKey',
  TOGGLE_QWEN_API_KEY: 'toggleQwenApiKey',
  SAVE_QWEN_API_KEY: 'saveQwenApiKey',

  // Respeecher
  RESPEECHER_API_KEY_GROUP: 'respeecherApiKeyGroup',
  RESPEECHER_API_KEY: 'respeecherApiKey',
  TOGGLE_RESPEECHER_API_KEY: 'toggleRespeecherApiKey',
  SAVE_RESPEECHER_API_KEY: 'saveRespeecherApiKey',
  RESPEECHER_ADVANCED_GROUP: 'respeecherAdvancedGroup',
  RESPEECHER_TEMPERATURE: 'respeecherTemperature',
  RESPEECHER_TEMPERATURE_VALUE: 'respeecherTemperatureValue',
  RESPEECHER_REPETITION_PENALTY: 'respeecherRepetitionPenalty',
  RESPEECHER_REPETITION_PENALTY_VALUE: 'respeecherRepetitionPenaltyValue',
  RESPEECHER_TOP_P: 'respeecherTopP',
  RESPEECHER_TOP_P_VALUE: 'respeecherTopPValue',

  // Google TTS
  GOOGLE_TTS_API_KEY_GROUP: 'googleTtsApiKeyGroup',
  GOOGLE_TTS_API_KEY: 'googleTtsApiKey',
  TOGGLE_GOOGLE_TTS_API_KEY: 'toggleGoogleTtsApiKey',
  SAVE_GOOGLE_TTS_API_KEY: 'saveGoogleTtsApiKey',
  GOOGLE_TTS_MODEL_GROUP: 'googleTtsModelGroup',
  GOOGLE_TTS_MODEL: 'googleTtsModel',
  GOOGLE_TTS_VOICE_GROUP: 'googleTtsVoiceGroup',
  GOOGLE_TTS_VOICE: 'googleTtsVoice',
  GOOGLE_TTS_PROMPT_GROUP: 'googleTtsPromptGroup',
  GOOGLE_TTS_PROMPT: 'googleTtsPrompt',

  // OpenAI Instructions
  OPENAI_INSTRUCTIONS_GROUP: 'openaiInstructionsGroup',
  OPENAI_INSTRUCTIONS: 'openaiInstructions',

  // Audio Voice & Speed
  AUDIO_VOICE_GROUP: 'audioVoiceGroup',
  AUDIO_VOICE: 'audioVoice',
  AUDIO_SPEED_GROUP: 'audioSpeedGroup',
  AUDIO_SPEED: 'audioSpeed',
  AUDIO_SPEED_VALUE: 'audioSpeedValue',
  AUDIO_SPEED_NOTE: 'audioSpeedNote',

  // Modals
  IMPORT_EXPORT_MODAL: 'importExportModal',
  IMPORT_EXPORT_MODAL_TITLE: 'importExportModalTitle',
  IMPORT_EXPORT_MODAL_CLOSE: 'importExportModalClose',
  IMPORT_EXPORT_MODAL_CONTENT: 'importExportModalContent',
  IMPORT_EXPORT_MODAL_CANCEL: 'importExportModalCancel',
  IMPORT_EXPORT_MODAL_CONFIRM: 'importExportModalConfirm',

  PDF_FILE_SELECTION_MODAL: 'pdfFileSelectionModal',
  PDF_FILE_SELECTION_MODAL_TITLE: 'pdfFileSelectionModalTitle',
  PDF_FILE_SELECTION_MODAL_CLOSE: 'pdfFileSelectionModalClose',
  PDF_FILE_SELECTION_MODAL_CONTENT: 'pdfFileSelectionModalContent',
  PDF_FILE_SELECTION_MODAL_MESSAGE: 'pdfFileSelectionModalMessage',
  PDF_FILE_SELECTION_MODAL_WARNING: 'pdfFileSelectionModalWarning',
  PDF_FILE_SELECTION_MODAL_OK: 'pdfFileSelectionModalOk',

  // Additional elements
  TIMER_DISPLAY: 'timerDisplay',
  PDF_SETTINGS_DIVIDER: 'pdfSettingsDivider'
};

// Storage keys for chrome.storage.local
export const STORAGE_KEYS = {
  // API Keys
  API_PROVIDER: 'api_provider',
  API_KEY: 'openai_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  GROK_API_KEY: 'grok_api_key',
  OPENROUTER_API_KEY: 'openrouter_api_key',
  DEEPSEEK_API_KEY: 'deepseek_api_key',
  GOOGLE_API_KEY: 'google_api_key',

  // Models
  MODEL: 'openai_model',
  MODEL_BY_PROVIDER: 'model_by_provider',
  CUSTOM_MODELS: 'custom_models',
  HIDDEN_MODELS: 'hidden_models',

  // Settings
  MODE: 'extraction_mode',
  USE_CACHE: 'use_selector_cache',
  ENABLE_CACHE: 'enable_selector_caching',
  ENABLE_STATS: 'enable_statistics',
  OUTPUT_FORMAT: 'output_format',
  GENERATE_TOC: 'generate_toc',
  GENERATE_ABSTRACT: 'generate_abstract',
  PAGE_MODE: 'page_mode',
  LANGUAGE: 'pdf_language',
  STORAGE_TRANSLATE_IMAGES: 'translate_images',

  // Styles
  STYLE_PRESET: 'pdf_style_preset',
  FONT_FAMILY: 'pdf_font_family',
  FONT_SIZE: 'pdf_font_size',
  BG_COLOR: 'pdf_bg_color',
  TEXT_COLOR: 'pdf_text_color',
  HEADING_COLOR: 'pdf_heading_color',
  LINK_COLOR: 'pdf_link_color',
  CUSTOM_BG_COLOR: 'pdf_custom_bg_color',
  CUSTOM_TEXT_COLOR: 'pdf_custom_text_color',
  CUSTOM_HEADING_COLOR: 'pdf_custom_heading_color',
  CUSTOM_LINK_COLOR: 'pdf_custom_link_color',
  STORAGE_THEME: 'popup_theme',
  STORAGE_UI_LANGUAGE: 'ui_language',

  // Audio settings
  AUDIO_PROVIDER: 'audio_provider',
  STORAGE_ELEVENLABS_API_KEY: 'elevenlabs_api_key',
  ELEVENLABS_MODEL: 'elevenlabs_model',
  ELEVENLABS_STABILITY: 'elevenlabs_stability',
  ELEVENLABS_SIMILARITY: 'elevenlabs_similarity',
  ELEVENLABS_STYLE: 'elevenlabs_style',
  ELEVENLABS_SPEAKER_BOOST: 'elevenlabs_speaker_boost',
  ELEVENLABS_FORMAT: 'elevenlabs_format',
  STORAGE_QWEN_API_KEY: 'qwen_api_key',
  STORAGE_RESPEECHER_API_KEY: 'respeecher_api_key',
  RESPEECHER_TEMPERATURE: 'respeecher_temperature',
  RESPEECHER_REPETITION_PENALTY: 'respeecher_repetition_penalty',
  RESPEECHER_TOP_P: 'respeecher_top_p',
  STORAGE_GOOGLE_TTS_API_KEY: 'google_tts_api_key',
  GOOGLE_TTS_MODEL: 'google_tts_model',
  GOOGLE_TTS_VOICE: 'google_tts_voice',
  GOOGLE_TTS_PROMPT: 'google_tts_prompt',
  OPENAI_INSTRUCTIONS: 'openai_instructions',
  AUDIO_VOICE: 'audio_voice',
  STORAGE_AUDIO_VOICE_MAP: 'audio_voice_map',
  AUDIO_SPEED: 'audio_speed',

  // Summary
  SUMMARY_TEXT: 'summary_text',
  SUMMARY_GENERATING: 'summary_generating',

  // Key theses
  KEY_THESES_TEXT: 'key_theses_text',
  KEY_THESES_GENERATING: 'key_theses_generating'
};

// Default styles
export const DEFAULT_STYLES = {
  fontSize: '31',
  bgColor: '#303030',
  textColor: '#b9b9b9',
  headingColor: '#cfcfcf',
  linkColor: '#6cacff'
};

// Style presets
export const STYLE_PRESETS = {
  dark: {
    bgColor: '#303030',
    textColor: '#b9b9b9',
    headingColor: '#cfcfcf',
    linkColor: '#6cacff'
  },
  light: {
    bgColor: '#ffffff',
    textColor: '#1f2937',
    headingColor: '#111827',
    linkColor: '#2563eb'
  },
  sepia: {
    bgColor: '#f4ecd8',
    textColor: '#5c4b37',
    headingColor: '#8b4513',
    linkColor: '#a0522d'
  },
  contrast: {
    bgColor: '#000000',
    textColor: '#ffffff',
    headingColor: '#ffff00',
    linkColor: '#00ffff'
  }
};

// Mode hints
export const MODE_HINTS = {
  automatic: 'AI finds article blocks, script extracts content',
  selector: 'User selects content areas, script extracts from selections',
  extract: 'Script attempts to extract readable content from any webpage'
};

// JSDoc для лучшей документации
/**
 * @typedef {keyof typeof ELEMENT_IDS} ElementIdKey
 * @typedef {typeof ELEMENT_IDS[ElementIdKey]} ElementIdValue
 */