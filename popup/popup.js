// Popup script for Webpage to PDF extension

import { encryptApiKey, decryptApiKey, maskApiKey, isEncrypted } from '../scripts/utils/encryption.js';

const STORAGE_KEYS = {
  API_KEY: 'openai_api_key',
  CLAUDE_API_KEY: 'claude_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  GOOGLE_API_KEY: 'google_api_key',
  MODEL: 'openai_model',
  MODE: 'extraction_mode',
  USE_CACHE: 'use_selector_cache',
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
  THEME: 'popup_theme'
};

// Default style values
const DEFAULT_STYLES = {
  fontFamily: '',
  fontSize: '31',
  bgColor: '#303030',
  textColor: '#b9b9b9',
  headingColor: '#cfcfcf',
  linkColor: '#6cacff'
};

// Style presets - carefully designed color schemes
// Each preset tested for WCAG AA contrast (min 4.5:1 for text)
const STYLE_PRESETS = {
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

const MODE_HINTS = {
  selector: 'AI finds article blocks, script extracts content',
  extract: 'AI extracts and processes all content'
};

// DOM Elements
const elements = {
  apiKey: null,
  toggleApiKey: null,
  claudeApiKey: null,
  toggleClaudeApiKey: null,
  geminiApiKey: null,
  toggleGeminiApiKey: null,
  googleApiKey: null,
  toggleGoogleApiKey: null,
  googleApiGroup: null,
  saveApiKey: null,
  savePdfBtn: null,
  saveIcon: null,
  saveText: null,
  cancelBtn: null,
  toggleSettings: null,
  settingsPanel: null,
  toggleStats: null,
  statsPanel: null,
  modeSelect: null,
  modeHint: null,
  useCache: null,
  useCacheGroup: null,
  modelSelect: null,
  outputFormat: null,
  generateToc: null,
  generateAbstract: null,
  pageMode: null,
  pageModeGroup: null,
  languageSelect: null,
  translateImages: null,
  translateImagesGroup: null,
  stylePreset: null,
  fontFamily: null,
  fontFamilyContainer: null,
  fontFamilyTrigger: null,
  fontFamilyValue: null,
  fontFamilyOptions: null,
  fontSize: null,
  bgColor: null,
  bgColorText: null,
  textColor: null,
  textColorText: null,
  headingColor: null,
  headingColorText: null,
  linkColor: null,
  linkColorText: null,
  resetStylesBtn: null,
  clearStatsBtn: null,
  clearCacheBtn: null,
  exportSettingsBtn: null,
  importSettingsBtn: null,
  importFileInput: null,
  statusDot: null,
  statusText: null,
  progressContainer: null,
  progressBar: null,
  progressText: null
};

// State polling interval
let statePollingInterval = null;

// Timer interval for display updates
let timerInterval = null;

// Current start time from background (persists across popup reopens)
let currentStartTime = null;

// Debounce timer for settings save
let settingsSaveTimer = null;

// Format seconds to MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Debounced settings save - saves settings after 500ms of inactivity
function debouncedSaveSettings(key, value, callback = null) {
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
  }
  
  settingsSaveTimer = setTimeout(async () => {
    await chrome.storage.local.set({ [key]: value });
    if (callback) callback();
    settingsSaveTimer = null;
  }, 500);
}

// Start the timer display updates
function startTimerDisplay(startTime) {
  currentStartTime = startTime;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// Stop the timer display
function stopTimerDisplay() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  currentStartTime = null;
}

// Update timer display in status text
function updateTimerDisplay() {
  if (!currentStartTime) return;
  const elapsed = Math.floor((Date.now() - currentStartTime) / 1000);
  const timerSpan = document.getElementById('timerDisplay');
  if (timerSpan) {
    timerSpan.textContent = formatTime(elapsed);
  }
}

// Initialize popup
async function init() {
  // Get DOM elements
  elements.apiKey = document.getElementById('apiKey');
  elements.toggleApiKey = document.getElementById('toggleApiKey');
  elements.claudeApiKey = document.getElementById('claudeApiKey');
  elements.toggleClaudeApiKey = document.getElementById('toggleClaudeApiKey');
  elements.geminiApiKey = document.getElementById('geminiApiKey');
  elements.toggleGeminiApiKey = document.getElementById('toggleGeminiApiKey');
  elements.googleApiKey = document.getElementById('googleApiKey');
  elements.toggleGoogleApiKey = document.getElementById('toggleGoogleApiKey');
  elements.googleApiGroup = document.getElementById('googleApiGroup');
  elements.saveApiKey = document.getElementById('saveApiKey');
  elements.savePdfBtn = document.getElementById('savePdfBtn');
  elements.saveIcon = document.getElementById('saveIcon');
  elements.saveText = document.getElementById('saveText');
  elements.cancelBtn = document.getElementById('cancelBtn');
  elements.toggleSettings = document.getElementById('toggleSettings');
  elements.settingsPanel = document.getElementById('settingsPanel');
  elements.toggleStats = document.getElementById('toggleStats');
  elements.statsPanel = document.getElementById('statsPanel');
  elements.clearStatsBtn = document.getElementById('clearStatsBtn');
  elements.clearCacheBtn = document.getElementById('clearCacheBtn');
  elements.exportSettingsBtn = document.getElementById('exportSettingsBtn');
  elements.importSettingsBtn = document.getElementById('importSettingsBtn');
  elements.importFileInput = document.getElementById('importFileInput');
  elements.modeSelect = document.getElementById('modeSelect');
  elements.modeHint = document.getElementById('modeHint');
  elements.useCache = document.getElementById('useCache');
  elements.useCacheGroup = document.getElementById('useCacheGroup');
  elements.modelSelect = document.getElementById('modelSelect');
  elements.outputFormat = document.getElementById('outputFormat');
  elements.generateToc = document.getElementById('generateToc');
  elements.generateAbstract = document.getElementById('generateAbstract');
  elements.pageMode = document.getElementById('pageMode');
  elements.pageModeGroup = document.getElementById('pageModeGroup');
  elements.languageSelect = document.getElementById('languageSelect');
  elements.translateImages = document.getElementById('translateImages');
  elements.translateImagesGroup = document.getElementById('translateImagesGroup');
  elements.stylePreset = document.getElementById('stylePreset');
  elements.fontFamily = document.getElementById('fontFamily');
  elements.fontFamilyContainer = document.getElementById('fontFamilyContainer');
  elements.fontFamilyTrigger = document.getElementById('fontFamilyTrigger');
  elements.fontFamilyValue = document.getElementById('fontFamilyValue');
  elements.fontFamilyOptions = document.getElementById('fontFamilyOptions');
  elements.fontSize = document.getElementById('fontSize');
  elements.resetStylesBtn = document.getElementById('resetStylesBtn');
  elements.bgColor = document.getElementById('bgColor');
  elements.bgColorText = document.getElementById('bgColorText');
  elements.textColor = document.getElementById('textColor');
  elements.textColorText = document.getElementById('textColorText');
  elements.headingColor = document.getElementById('headingColor');
  elements.headingColorText = document.getElementById('headingColorText');
  elements.linkColor = document.getElementById('linkColor');
  elements.linkColorText = document.getElementById('linkColorText');
  elements.statusDot = document.querySelector('.status-dot');
  elements.statusText = document.getElementById('statusText');
  elements.progressContainer = document.getElementById('progressContainer');
  elements.progressBar = document.getElementById('progressBar');
  elements.progressText = document.getElementById('progressText');
  elements.themeSelect = document.getElementById('themeSelect');
  
  // Add themeSelect to elements object for consistency
  if (!elements.themeSelect) {
    console.warn('Theme select element not found');
  }
  
  await loadSettings();
  applyTheme();
  setupEventListeners();
  
  // Check current processing state
  await checkProcessingState();
  
  // Start polling for state updates
  startStatePolling();
}

// Load saved settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.CLAUDE_API_KEY,
    STORAGE_KEYS.GEMINI_API_KEY,
    STORAGE_KEYS.GOOGLE_API_KEY,
    STORAGE_KEYS.MODEL, 
    STORAGE_KEYS.MODE,
    STORAGE_KEYS.USE_CACHE,
    STORAGE_KEYS.OUTPUT_FORMAT,
    STORAGE_KEYS.GENERATE_TOC,
    STORAGE_KEYS.GENERATE_ABSTRACT,
    STORAGE_KEYS.PAGE_MODE,
    STORAGE_KEYS.LANGUAGE,
    STORAGE_KEYS.TRANSLATE_IMAGES,
    STORAGE_KEYS.STYLE_PRESET,
    STORAGE_KEYS.FONT_FAMILY,
    STORAGE_KEYS.FONT_SIZE,
    STORAGE_KEYS.BG_COLOR,
    STORAGE_KEYS.TEXT_COLOR,
    STORAGE_KEYS.HEADING_COLOR,
    STORAGE_KEYS.LINK_COLOR,
    STORAGE_KEYS.THEME
  ]);
  
  // Load and mask API keys
  if (result[STORAGE_KEYS.API_KEY]) {
    try {
      const decrypted = await decryptApiKey(result[STORAGE_KEYS.API_KEY]);
      elements.apiKey.value = maskApiKey(decrypted);
      elements.apiKey.dataset.encrypted = result[STORAGE_KEYS.API_KEY]; // Store encrypted version
    } catch (error) {
      console.error('Failed to decrypt OpenAI API key:', error);
      elements.apiKey.value = maskApiKey(result[STORAGE_KEYS.API_KEY]);
      elements.apiKey.dataset.encrypted = result[STORAGE_KEYS.API_KEY];
    }
  }
  
  if (result[STORAGE_KEYS.CLAUDE_API_KEY]) {
    try {
      const decrypted = await decryptApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
      elements.claudeApiKey.value = maskApiKey(decrypted);
      elements.claudeApiKey.dataset.encrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
    } catch (error) {
      console.error('Failed to decrypt Claude API key:', error);
      elements.claudeApiKey.value = maskApiKey(result[STORAGE_KEYS.CLAUDE_API_KEY]);
      elements.claudeApiKey.dataset.encrypted = result[STORAGE_KEYS.CLAUDE_API_KEY];
    }
  }
  
  if (result[STORAGE_KEYS.GEMINI_API_KEY]) {
    try {
      const decrypted = await decryptApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
      elements.geminiApiKey.value = maskApiKey(decrypted);
      elements.geminiApiKey.dataset.encrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
    } catch (error) {
      console.error('Failed to decrypt Gemini API key:', error);
      elements.geminiApiKey.value = maskApiKey(result[STORAGE_KEYS.GEMINI_API_KEY]);
      elements.geminiApiKey.dataset.encrypted = result[STORAGE_KEYS.GEMINI_API_KEY];
    }
  }
  
  if (result[STORAGE_KEYS.GOOGLE_API_KEY]) {
    try {
      const decrypted = await decryptApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
      elements.googleApiKey.value = maskApiKey(decrypted);
      elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
    } catch (error) {
      console.error('Failed to decrypt Google API key:', error);
      elements.googleApiKey.value = maskApiKey(result[STORAGE_KEYS.GOOGLE_API_KEY]);
      elements.googleApiKey.dataset.encrypted = result[STORAGE_KEYS.GOOGLE_API_KEY];
    }
  }
  
  if (result[STORAGE_KEYS.MODEL]) {
    elements.modelSelect.value = result[STORAGE_KEYS.MODEL];
  }
  
  if (result[STORAGE_KEYS.MODE]) {
    elements.modeSelect.value = result[STORAGE_KEYS.MODE];
  }
  
  if (result[STORAGE_KEYS.USE_CACHE] !== undefined) {
    elements.useCache.checked = result[STORAGE_KEYS.USE_CACHE];
  } else {
    elements.useCache.checked = true; // Default: enabled
  }
  
  if (result[STORAGE_KEYS.OUTPUT_FORMAT]) {
    elements.outputFormat.value = result[STORAGE_KEYS.OUTPUT_FORMAT];
  }
  
  if (result[STORAGE_KEYS.GENERATE_TOC]) {
    elements.generateToc.checked = result[STORAGE_KEYS.GENERATE_TOC];
  }
  
  if (result[STORAGE_KEYS.GENERATE_ABSTRACT] !== undefined) {
    elements.generateAbstract.checked = result[STORAGE_KEYS.GENERATE_ABSTRACT];
  } else {
    elements.generateAbstract.checked = false; // Default: disabled
  }
  
  if (result[STORAGE_KEYS.PAGE_MODE]) {
    elements.pageMode.value = result[STORAGE_KEYS.PAGE_MODE];
  }
  
  if (result[STORAGE_KEYS.LANGUAGE]) {
    elements.languageSelect.value = result[STORAGE_KEYS.LANGUAGE];
  }
  
  if (result[STORAGE_KEYS.TRANSLATE_IMAGES]) {
    elements.translateImages.checked = result[STORAGE_KEYS.TRANSLATE_IMAGES];
  }
  
  if (result[STORAGE_KEYS.STYLE_PRESET]) {
    elements.stylePreset.value = result[STORAGE_KEYS.STYLE_PRESET];
  } else {
    elements.stylePreset.value = 'dark'; // Default preset
  }
  
  if (result[STORAGE_KEYS.FONT_FAMILY]) {
    elements.fontFamily.value = result[STORAGE_KEYS.FONT_FAMILY];
    setCustomSelectValue(result[STORAGE_KEYS.FONT_FAMILY]);
  }
  
  if (result[STORAGE_KEYS.FONT_SIZE]) {
    // Convert old preset values to numbers
    const oldToNew = { 'small': '24', 'medium': '31', 'large': '38', 'xlarge': '45' };
    const savedSize = result[STORAGE_KEYS.FONT_SIZE];
    elements.fontSize.value = oldToNew[savedSize] || savedSize;
  }
  
  if (result[STORAGE_KEYS.BG_COLOR]) {
    elements.bgColor.value = result[STORAGE_KEYS.BG_COLOR];
    elements.bgColorText.value = result[STORAGE_KEYS.BG_COLOR];
  }
  
  if (result[STORAGE_KEYS.TEXT_COLOR]) {
    elements.textColor.value = result[STORAGE_KEYS.TEXT_COLOR];
    elements.textColorText.value = result[STORAGE_KEYS.TEXT_COLOR];
  }
  
  if (result[STORAGE_KEYS.HEADING_COLOR]) {
    elements.headingColor.value = result[STORAGE_KEYS.HEADING_COLOR];
    elements.headingColorText.value = result[STORAGE_KEYS.HEADING_COLOR];
  }
  
  if (result[STORAGE_KEYS.LINK_COLOR]) {
    elements.linkColor.value = result[STORAGE_KEYS.LINK_COLOR];
    elements.linkColorText.value = result[STORAGE_KEYS.LINK_COLOR];
  }
  
  if (result[STORAGE_KEYS.THEME]) {
    elements.themeSelect.value = result[STORAGE_KEYS.THEME];
  }
  
  // Apply preset colors to ensure consistency (fixes color mismatch after preset change)
  const currentPreset = elements.stylePreset.value;
  if (currentPreset !== 'custom' && STYLE_PRESETS[currentPreset]) {
    const colors = STYLE_PRESETS[currentPreset];
    elements.bgColor.value = colors.bgColor;
    elements.bgColorText.value = colors.bgColor;
    elements.textColor.value = colors.textColor;
    elements.textColorText.value = colors.textColor;
    elements.headingColor.value = colors.headingColor;
    elements.headingColorText.value = colors.headingColor;
    elements.linkColor.value = colors.linkColor;
    elements.linkColorText.value = colors.linkColor;
  }
  
  // Update hint and visibility
  updateModeHint();
  updateTranslationVisibility();
  updateOutputFormatUI();
  updateCacheVisibility();
}

// Setup event listeners
function setupEventListeners() {
  elements.toggleApiKey.addEventListener('click', async () => {
    const input = elements.apiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted; // Store decrypted for quick hide
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
          // If decryption fails, try to use current value if it's not masked
          if (!input.value.startsWith('••••')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('••••')) {
        // Key is already visible or not masked
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleApiKey.querySelector('.eye-icon').textContent = '👁';
    }
  });

  elements.toggleClaudeApiKey.addEventListener('click', async () => {
    const input = elements.claudeApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
          if (!input.value.startsWith('••••')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleClaudeApiKey.querySelector('.eye-icon').textContent = '👁';
    }
  });

  elements.toggleGeminiApiKey.addEventListener('click', async () => {
    const input = elements.geminiApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
          if (!input.value.startsWith('••••')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleGeminiApiKey.querySelector('.eye-icon').textContent = '👁';
    }
  });

  elements.toggleGoogleApiKey.addEventListener('click', async () => {
    const input = elements.googleApiKey;
    const isPassword = input.type === 'password';
    
    if (isPassword) {
      // Show full key
      if (input.dataset.encrypted) {
        try {
          const decrypted = await decryptApiKey(input.dataset.encrypted);
          input.value = decrypted;
          input.dataset.decrypted = decrypted;
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
          if (!input.value.startsWith('••••')) {
            input.dataset.decrypted = input.value;
          }
        }
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
      }
      input.type = 'text';
      elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '🔒';
    } else {
      // Hide key
      if (input.dataset.decrypted) {
        input.value = maskApiKey(input.dataset.decrypted);
      } else if (input.value && !input.value.startsWith('••••')) {
        input.dataset.decrypted = input.value;
        input.value = maskApiKey(input.value);
      }
      input.type = 'password';
      elements.toggleGoogleApiKey.querySelector('.eye-icon').textContent = '👁';
    }
  });

  elements.saveApiKey.addEventListener('click', saveApiKey);

  elements.toggleSettings.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('open');
    // Close stats panel when opening settings
    if (elements.settingsPanel.classList.contains('open')) {
      elements.statsPanel.classList.remove('open');
    }
  });

  elements.toggleStats.addEventListener('click', async () => {
    elements.statsPanel.classList.toggle('open');
    // Close settings panel when opening stats
    if (elements.statsPanel.classList.contains('open')) {
      elements.settingsPanel.classList.remove('open');
      await loadAndDisplayStats();
    }
  });

  elements.clearStatsBtn.addEventListener('click', async () => {
    if (confirm('Clear all statistics? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ action: 'clearStats' });
      await loadAndDisplayStats();
      showToast('Statistics cleared', 'success');
    }
  });

  elements.clearCacheBtn.addEventListener('click', async () => {
    if (confirm('Clear selector cache? Next extractions will use AI.')) {
      await chrome.runtime.sendMessage({ action: 'clearSelectorCache' });
      await loadAndDisplayStats();
      showToast('Cache cleared', 'success');
    }
  });

  elements.exportSettingsBtn.addEventListener('click', async () => {
    try {
      const includeStats = confirm('Include statistics in export?');
      const includeCache = confirm('Include selector cache in export?');
      // Note: API keys are NEVER exported for security reasons
      
      elements.exportSettingsBtn.disabled = true;
      elements.exportSettingsBtn.textContent = 'Exporting...';
      
      const response = await chrome.runtime.sendMessage({
        action: 'exportSettings',
        includeStats,
        includeCache
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Download file
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webpage-to-pdf-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Settings exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed: ' + error.message, 'error');
    } finally {
      elements.exportSettingsBtn.disabled = false;
      elements.exportSettingsBtn.textContent = 'Export Settings';
    }
  });

  elements.importSettingsBtn.addEventListener('click', () => {
    elements.importFileInput.click();
  });

  elements.importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
      
      // Parse to check if valid
      const data = JSON.parse(text);
      if (!data.settings) {
        throw new Error('Invalid export file');
      }
      
      // Ask what to import
      const importStats = data.statistics && confirm('Import statistics?');
      const importCache = data.selectorCache && confirm('Import selector cache?');
      const overwriteExisting = confirm('Overwrite existing settings?');
      
      elements.importSettingsBtn.disabled = true;
      elements.importSettingsBtn.textContent = 'Importing...';
      
      const response = await chrome.runtime.sendMessage({
        action: 'importSettings',
        jsonData: text,
        options: {
          importStats,
          importCache,
          overwriteExisting
        }
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      const result = response.result;
      let message = `Imported ${result.settingsImported} settings`;
      if (result.settingsSkipped > 0) {
        message += `, ${result.settingsSkipped} skipped`;
      }
      if (result.statsImported) message += ', statistics';
      if (result.cacheImported) message += ', cache';
      
      showToast(message, 'success');
      
      // Reload settings and stats
      await loadSettings();
      await loadAndDisplayStats();
      
      // Reload page to apply settings
      if (result.settingsImported > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
      
    } catch (error) {
      console.error('Import failed:', error);
      showToast('Import failed: ' + error.message, 'error');
    } finally {
      elements.importSettingsBtn.disabled = false;
      elements.importSettingsBtn.textContent = 'Import Settings';
      elements.importFileInput.value = ''; // Reset input
    }
  });

  elements.modelSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.MODEL, elements.modelSelect.value);
  });

  elements.modeSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.MODE, elements.modeSelect.value, () => {
      updateModeHint();
      updateCacheVisibility();
    });
  });

  elements.useCache.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.USE_CACHE, elements.useCache.checked);
  });

  elements.outputFormat.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.OUTPUT_FORMAT, elements.outputFormat.value, () => {
      updateOutputFormatUI();
    });
  });

  elements.generateToc.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.GENERATE_TOC, elements.generateToc.checked);
  });
  
  elements.generateAbstract.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.GENERATE_ABSTRACT, elements.generateAbstract.checked);
  });

  elements.pageMode.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.PAGE_MODE, elements.pageMode.value);
  });

  elements.languageSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.LANGUAGE, elements.languageSelect.value, () => {
      updateTranslationVisibility();
    });
  });

  elements.translateImages.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.TRANSLATE_IMAGES, elements.translateImages.checked, () => {
      updateTranslationVisibility();
    });
  });

  // Style preset handler
  elements.stylePreset.addEventListener('change', () => {
    const preset = elements.stylePreset.value;
    debouncedSaveSettings(STORAGE_KEYS.STYLE_PRESET, preset);
    
    if (preset !== 'custom' && STYLE_PRESETS[preset]) {
      // Apply preset colors immediately (UI update)
      const colors = STYLE_PRESETS[preset];
      
      elements.bgColor.value = colors.bgColor;
      elements.bgColorText.value = colors.bgColor;
      elements.textColor.value = colors.textColor;
      elements.textColorText.value = colors.textColor;
      elements.headingColor.value = colors.headingColor;
      elements.headingColorText.value = colors.headingColor;
      elements.linkColor.value = colors.linkColor;
      elements.linkColorText.value = colors.linkColor;
      
      // Save all colors with debounce
      debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, colors.bgColor);
      debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, colors.textColor);
      debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, colors.headingColor);
      debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, colors.linkColor);
    }
  });

  // Custom font family dropdown
  elements.fontFamilyTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.fontFamilyContainer.classList.toggle('open');
  });

  elements.fontFamilyOptions.addEventListener('click', async (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;
    
    const value = option.dataset.value;
    const text = option.textContent;
    const fontStyle = option.style.fontFamily;
    
    // Update hidden input
    elements.fontFamily.value = value;
    
    // Update display with same font style
    elements.fontFamilyValue.textContent = text;
    elements.fontFamilyValue.style.fontFamily = fontStyle;
    
    // Update selected state
    elements.fontFamilyOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    option.classList.add('selected');
    
    // Close dropdown
    elements.fontFamilyContainer.classList.remove('open');
    
    // Save setting
    debouncedSaveSettings(STORAGE_KEYS.FONT_FAMILY, value);
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.fontFamilyContainer.contains(e.target)) {
      elements.fontFamilyContainer.classList.remove('open');
    }
  });

  elements.fontSize.addEventListener('change', () => {
    const size = parseInt(elements.fontSize.value) || 31;
    elements.fontSize.value = size;
    debouncedSaveSettings(STORAGE_KEYS.FONT_SIZE, String(size));
  });

  // Color handlers - sync picker and text input
  // Helper to switch to custom preset when colors are changed manually
  function setPresetToCustom() {
    if (elements.stylePreset.value !== 'custom') {
      elements.stylePreset.value = 'custom';
      chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PRESET]: 'custom' });
    }
  }

  elements.bgColor.addEventListener('input', () => { elements.bgColorText.value = elements.bgColor.value; });
  elements.bgColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColor.value);
  });
  elements.bgColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.bgColorText.value)) {
      elements.bgColor.value = elements.bgColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.BG_COLOR, elements.bgColorText.value);
    } else { elements.bgColorText.value = elements.bgColor.value; }
  });

  elements.textColor.addEventListener('input', () => { elements.textColorText.value = elements.textColor.value; });
  elements.textColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColor.value);
  });
  elements.textColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.textColorText.value)) {
      elements.textColor.value = elements.textColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.TEXT_COLOR, elements.textColorText.value);
    } else { elements.textColorText.value = elements.textColor.value; }
  });

  elements.headingColor.addEventListener('input', () => { elements.headingColorText.value = elements.headingColor.value; });
  elements.headingColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColor.value);
  });
  elements.headingColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.headingColorText.value)) {
      elements.headingColor.value = elements.headingColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.HEADING_COLOR, elements.headingColorText.value);
    } else { elements.headingColorText.value = elements.headingColor.value; }
  });

  elements.linkColor.addEventListener('input', () => { elements.linkColorText.value = elements.linkColor.value; });
  elements.linkColor.addEventListener('change', () => {
    setPresetToCustom();
    debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColor.value);
  });
  elements.linkColorText.addEventListener('change', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(elements.linkColorText.value)) {
      elements.linkColor.value = elements.linkColorText.value;
      debouncedSaveSettings(STORAGE_KEYS.LINK_COLOR, elements.linkColorText.value);
    } else { elements.linkColorText.value = elements.linkColor.value; }
  });

  // Reset individual settings
  document.querySelectorAll('.btn-reset-inline').forEach(btn => {
    btn.addEventListener('click', async () => {
      const resetType = btn.dataset.reset;
      await resetStyleSetting(resetType);
    });
  });

  // Reset all styles
  elements.resetStylesBtn.addEventListener('click', async () => {
    await resetAllStyles();
  });

  elements.savePdfBtn.addEventListener('click', handleSavePdf);
  elements.cancelBtn.addEventListener('click', handleCancel);
  
  elements.themeSelect.addEventListener('change', () => {
    debouncedSaveSettings(STORAGE_KEYS.THEME, elements.themeSelect.value, () => {
      applyTheme();
    });
  });
}

// Apply theme based on user preference or system preference
function applyTheme() {
  const theme = elements.themeSelect.value;
  let actualTheme = theme;
  
  if (theme === 'auto') {
    // Detect system theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    actualTheme = prefersDark ? 'dark' : 'light';
  }
  
  document.body.setAttribute('data-theme', actualTheme);
  
  // Listen for system theme changes if auto is selected
  if (theme === 'auto') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e) => {
      document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    
    // Remove old listener if exists
    if (window.themeChangeListener) {
      mediaQuery.removeListener(window.themeChangeListener);
    }
    
    window.themeChangeListener = handleThemeChange;
    mediaQuery.addListener(handleThemeChange);
  }
}

// Reset a single style setting to default
async function resetStyleSetting(type) {
  switch (type) {
    case 'fontFamily':
      elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
      setCustomSelectValue(DEFAULT_STYLES.fontFamily);
      await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
      break;
    case 'fontSize':
      elements.fontSize.value = DEFAULT_STYLES.fontSize;
      await chrome.storage.local.set({ [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize });
      break;
    case 'bgColor':
      elements.bgColor.value = DEFAULT_STYLES.bgColor;
      elements.bgColorText.value = DEFAULT_STYLES.bgColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor });
      break;
    case 'textColor':
      elements.textColor.value = DEFAULT_STYLES.textColor;
      elements.textColorText.value = DEFAULT_STYLES.textColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor });
      break;
    case 'headingColor':
      elements.headingColor.value = DEFAULT_STYLES.headingColor;
      elements.headingColorText.value = DEFAULT_STYLES.headingColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor });
      break;
    case 'linkColor':
      elements.linkColor.value = DEFAULT_STYLES.linkColor;
      elements.linkColorText.value = DEFAULT_STYLES.linkColor;
      await chrome.storage.local.set({ [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor });
      break;
  }
  showToast('Reset to default', 'success');
}

// Reset all style settings to defaults
async function resetAllStyles() {
  elements.fontFamily.value = DEFAULT_STYLES.fontFamily;
  setCustomSelectValue(DEFAULT_STYLES.fontFamily);
  elements.fontSize.value = DEFAULT_STYLES.fontSize;
  elements.bgColor.value = DEFAULT_STYLES.bgColor;
  elements.bgColorText.value = DEFAULT_STYLES.bgColor;
  elements.textColor.value = DEFAULT_STYLES.textColor;
  elements.textColorText.value = DEFAULT_STYLES.textColor;
  elements.headingColor.value = DEFAULT_STYLES.headingColor;
  elements.headingColorText.value = DEFAULT_STYLES.headingColor;
  elements.linkColor.value = DEFAULT_STYLES.linkColor;
  elements.linkColorText.value = DEFAULT_STYLES.linkColor;
  
  await chrome.storage.local.remove([STORAGE_KEYS.FONT_FAMILY]);
  await chrome.storage.local.set({
    [STORAGE_KEYS.FONT_SIZE]: DEFAULT_STYLES.fontSize,
    [STORAGE_KEYS.BG_COLOR]: DEFAULT_STYLES.bgColor,
    [STORAGE_KEYS.TEXT_COLOR]: DEFAULT_STYLES.textColor,
    [STORAGE_KEYS.HEADING_COLOR]: DEFAULT_STYLES.headingColor,
    [STORAGE_KEYS.LINK_COLOR]: DEFAULT_STYLES.linkColor
  });
  
  showToast('All styles reset to default', 'success');
}

// Handle Cancel button click
async function handleCancel() {
  try {
    await chrome.runtime.sendMessage({ action: 'cancelProcessing' });
    showToast('Processing cancelled', 'success');
    setStatus('ready', 'Cancelled');
    setProgress(0, false);
    elements.savePdfBtn.disabled = false;
    elements.cancelBtn.style.display = 'none';
  } catch (error) {
    console.error('Error cancelling:', error);
  }
}

// Set custom font select value programmatically
function setCustomSelectValue(value) {
  const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
  options.forEach(opt => {
    opt.classList.remove('selected');
    if (opt.dataset.value === value) {
      opt.classList.add('selected');
      elements.fontFamilyValue.textContent = opt.textContent;
      elements.fontFamilyValue.style.fontFamily = opt.style.fontFamily;
    }
  });
}

// Update mode hint text
function updateModeHint() {
  const mode = elements.modeSelect.value;
  elements.modeHint.textContent = MODE_HINTS[mode] || '';
}

// Show/hide cache option based on mode
function updateCacheVisibility() {
  const mode = elements.modeSelect.value;
  // Only show cache option for selector mode
  elements.useCacheGroup.style.display = mode === 'selector' ? 'flex' : 'none';
}

// Update UI based on output format selection
function updateOutputFormatUI() {
  const format = elements.outputFormat.value;
  const isPdf = format === 'pdf';
  const isEpub = format === 'epub';
  const showStyleSettings = isPdf; // Only PDF has style settings
  
  // Update button text and icon based on format
  const formatConfig = {
    pdf: { icon: '📄', text: 'Save as PDF' },
    epub: { icon: '📚', text: 'Save as EPUB' },
    fb2: { icon: '📖', text: 'Save as FB2' },
    markdown: { icon: '📝', text: 'Save as Markdown' }
  };
  const config = formatConfig[format] || formatConfig.pdf;
  elements.saveIcon.textContent = config.icon;
  elements.saveText.textContent = config.text;
  
  // Show/hide PDF-specific settings (page mode only for PDF)
  elements.pageModeGroup.style.display = isPdf ? 'flex' : 'none';
  
  // Hide style settings for non-PDF formats (find all color/font settings)
  const styleSettings = document.querySelectorAll('[id$="Color"], [id="fontFamily"], [id="fontSize"]');
  styleSettings.forEach(el => {
    const settingItem = el.closest('.setting-item');
    if (settingItem) {
      settingItem.style.display = showStyleSettings ? 'flex' : 'none';
    }
  });
  
  // Hide reset styles button for non-PDF
  if (elements.resetStylesBtn) {
    elements.resetStylesBtn.style.display = showStyleSettings ? 'block' : 'none';
  }
  
  // Hide style preset for non-PDF
  const presetItem = elements.stylePreset?.closest('.setting-item');
  if (presetItem) {
    presetItem.style.display = showStyleSettings ? 'flex' : 'none';
  }
  
  // Hide divider before style settings for non-PDF
  const dividers = document.querySelectorAll('.settings-divider');
  if (dividers.length >= 2) {
    dividers[1].style.display = showStyleSettings ? 'block' : 'none';
  }
}

// Show/hide translation-related UI based on language selection
function updateTranslationVisibility() {
  const isTranslating = elements.languageSelect.value !== 'auto';
  const translateImagesEnabled = elements.translateImages.checked;
  
  // Show image translation option only when translating
  elements.translateImagesGroup.style.display = isTranslating ? 'block' : 'none';
  
  // Show Google API key input when image translation is enabled
  elements.googleApiGroup.style.display = (isTranslating && translateImagesEnabled) ? 'block' : 'none';
}

// Save API keys to storage
async function saveApiKey() {
  const apiKey = elements.apiKey.value.trim();
  const claudeApiKey = elements.claudeApiKey.value.trim();
  const geminiApiKey = elements.geminiApiKey.value.trim();
  const googleApiKey = elements.googleApiKey.value.trim();
  
  // Check if at least one main API key is provided (not masked)
  const hasOpenAI = apiKey && !apiKey.startsWith('••••');
  const hasClaude = claudeApiKey && !claudeApiKey.startsWith('••••');
  const hasGemini = geminiApiKey && !geminiApiKey.startsWith('••••');
  
  if (!hasOpenAI && !hasClaude && !hasGemini) {
    showToast('Please enter at least one API key', 'error');
    return;
  }

  const keysToSave = {};
  
  // Validate and save OpenAI key
  if (apiKey) {
    // If masked (user didn't change it), keep existing encrypted value
    if (apiKey.startsWith('••••') && elements.apiKey.dataset.encrypted) {
      keysToSave[STORAGE_KEYS.API_KEY] = elements.apiKey.dataset.encrypted;
    } else if (!apiKey.startsWith('••••')) {
      // New key provided, validate and encrypt
      if (!apiKey.startsWith('sk-')) {
        showToast('Invalid OpenAI API key format (should start with sk-)', 'error');
        return;
      }
      try {
        keysToSave[STORAGE_KEYS.API_KEY] = await encryptApiKey(apiKey);
      } catch (error) {
        showToast('Failed to encrypt API key', 'error');
        console.error('Encryption error:', error);
        return;
      }
    }
  }
  
  // Validate and save Claude key
  if (claudeApiKey) {
    if (claudeApiKey.startsWith('••••') && elements.claudeApiKey.dataset.encrypted) {
      keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = elements.claudeApiKey.dataset.encrypted;
    } else if (!claudeApiKey.startsWith('••••')) {
      if (!claudeApiKey.startsWith('sk-ant-')) {
        showToast('Invalid Claude API key format (should start with sk-ant-)', 'error');
        return;
      }
      try {
        keysToSave[STORAGE_KEYS.CLAUDE_API_KEY] = await encryptApiKey(claudeApiKey);
      } catch (error) {
        showToast('Failed to encrypt API key', 'error');
        console.error('Encryption error:', error);
        return;
      }
    }
  }
  
  // Validate and save Gemini key
  if (geminiApiKey) {
    if (geminiApiKey.startsWith('••••') && elements.geminiApiKey.dataset.encrypted) {
      keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = elements.geminiApiKey.dataset.encrypted;
    } else if (!geminiApiKey.startsWith('••••')) {
      if (!geminiApiKey.startsWith('AIza')) {
        showToast('Invalid Gemini API key format (should start with AIza)', 'error');
        return;
      }
      try {
        keysToSave[STORAGE_KEYS.GEMINI_API_KEY] = await encryptApiKey(geminiApiKey);
      } catch (error) {
        showToast('Failed to encrypt API key', 'error');
        console.error('Encryption error:', error);
        return;
      }
    }
  }
  
  // Save Google API key for image translation if provided
  if (googleApiKey) {
    if (googleApiKey.startsWith('••••') && elements.googleApiKey.dataset.encrypted) {
      keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = elements.googleApiKey.dataset.encrypted;
    } else if (!googleApiKey.startsWith('••••')) {
      if (!googleApiKey.startsWith('AIza')) {
        showToast('Invalid Google API key format (should start with AIza)', 'error');
        return;
      }
      try {
        keysToSave[STORAGE_KEYS.GOOGLE_API_KEY] = await encryptApiKey(googleApiKey);
      } catch (error) {
        showToast('Failed to encrypt API key', 'error');
        console.error('Encryption error:', error);
        return;
      }
    }
  }

  await chrome.storage.local.set(keysToSave);
  showToast('API keys saved', 'success');
}

// Check current processing state from background or storage
async function checkProcessingState() {
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getState' });
    updateUIFromState(state);
  } catch (error) {
    console.error('Error getting state from background:', error);
    // Fallback: try to load from storage
    try {
      const stored = await chrome.storage.local.get(['processingState']);
      if (stored.processingState) {
        const savedState = stored.processingState;
        const timeSinceUpdate = Date.now() - (savedState.lastUpdate || 0);
        
        // If state is recent (< 2 minutes), show it
        if (timeSinceUpdate < 2 * 60 * 1000 && savedState.isProcessing) {
          console.log('Loaded state from storage', savedState);
          updateUIFromState(savedState);
        }
      }
    } catch (storageError) {
      console.error('Error loading from storage:', storageError);
    }
  }
}

// Start polling for state updates
function startStatePolling() {
  // Clear existing interval
  if (statePollingInterval) {
    clearInterval(statePollingInterval);
  }
  
  let pollInterval = 1000; // Default 1s for idle
  let failedAttempts = 0;
  let lastState = null; // Track last state for adaptive polling
  let noChangeCount = 0; // Count consecutive polls with no changes
  
  async function poll() {
    try {
      const state = await chrome.runtime.sendMessage({ action: 'getState' });
      
      // Check if state changed
      const stateChanged = JSON.stringify(state) !== JSON.stringify(lastState);
      
      if (stateChanged) {
        // State changed - reset adaptive polling
        noChangeCount = 0;
        updateUIFromState(state);
        lastState = state;
        
        // Use faster polling when processing
        pollInterval = state.isProcessing ? 300 : 1000;
      } else {
        // State didn't change - increase interval (adaptive polling)
        noChangeCount++;
        
        // Exponential backoff: 300ms → 450ms → 675ms → 1000ms → 1500ms → 2000ms
        if (state.isProcessing) {
          pollInterval = Math.min(300 * Math.pow(1.5, noChangeCount), 2000);
        } else {
          pollInterval = 1000; // Keep 1s for idle state
        }
      }
      
      failedAttempts = 0;
    } catch (error) {
      failedAttempts++;
      console.warn('Failed to get state from background, attempt:', failedAttempts);
      
      // After 3 failed attempts, try storage
      if (failedAttempts >= 3) {
        try {
          const stored = await chrome.storage.local.get(['processingState']);
          if (stored.processingState && stored.processingState.isProcessing) {
            const timeSinceUpdate = Date.now() - (stored.processingState.lastUpdate || 0);
            if (timeSinceUpdate < 2 * 60 * 1000) {
              console.log('Using state from storage');
              updateUIFromState(stored.processingState);
            }
          }
        } catch (e) {
          // Ignore storage errors
        }
      }
      
      // Increase interval on errors
      pollInterval = Math.min(pollInterval * 2, 5000);
    }
    
    // Schedule next poll
    statePollingInterval = setTimeout(poll, pollInterval);
  }
  
  poll();
}

// Update UI based on processing state
function updateUIFromState(state) {
  if (!state) return;
  
  if (state.isProcessing) {
    // Use startTime from background (persists across popup reopens)
    if (state.startTime && currentStartTime !== state.startTime) {
      startTimerDisplay(state.startTime);
    }
    elements.savePdfBtn.disabled = true;
    elements.savePdfBtn.style.display = 'none';
    elements.cancelBtn.style.display = 'block';
    setStatus('processing', state.status, state.startTime);
    setProgress(state.progress);
  } else if (state.error) {
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    elements.cancelBtn.style.display = 'none';
    setStatus('error', state.error);
    setProgress(0, false);
  } else if (state.status === 'Done!') {
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    elements.cancelBtn.style.display = 'none';
    setStatus('ready', 'PDF saved successfully!');
    setProgress(0, false); // Hide progress bar immediately
  } else {
    stopTimerDisplay();
    elements.savePdfBtn.disabled = false;
    elements.savePdfBtn.style.display = 'block';
    elements.cancelBtn.style.display = 'none';
    setStatus('ready', 'Ready');
    setProgress(0, false);
  }
}

// Get provider from model name
function getProviderFromModel(model) {
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'claude';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'openai';
}

// Handle Save PDF button click
async function handleSavePdf() {
  const model = elements.modelSelect.value;
  const provider = getProviderFromModel(model);
  
  // Get the appropriate API key based on selected model
  let apiKey = '';
  if (provider === 'openai') {
    apiKey = elements.apiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (apiKey.startsWith('••••') && elements.apiKey.dataset.encrypted) {
      try {
        apiKey = await decryptApiKey(elements.apiKey.dataset.encrypted);
      } catch (error) {
        console.error('Failed to decrypt OpenAI API key:', error);
        showToast('Failed to decrypt API key. Please re-enter it.', 'error');
        return;
      }
    }
    if (!apiKey) {
      showToast('Please enter OpenAI API key for GPT models', 'error');
      return;
    }
  } else if (provider === 'claude') {
    apiKey = elements.claudeApiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (apiKey.startsWith('••••') && elements.claudeApiKey.dataset.encrypted) {
      try {
        apiKey = await decryptApiKey(elements.claudeApiKey.dataset.encrypted);
      } catch (error) {
        console.error('Failed to decrypt Claude API key:', error);
        showToast('Failed to decrypt API key. Please re-enter it.', 'error');
        return;
      }
    }
    if (!apiKey) {
      showToast('Please enter Claude API key for Claude models', 'error');
      return;
    }
  } else if (provider === 'gemini') {
    apiKey = elements.geminiApiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (apiKey.startsWith('••••') && elements.geminiApiKey.dataset.encrypted) {
      try {
        apiKey = await decryptApiKey(elements.geminiApiKey.dataset.encrypted);
      } catch (error) {
        console.error('Failed to decrypt Gemini API key:', error);
        showToast('Failed to decrypt API key. Please re-enter it.', 'error');
        return;
      }
    }
    if (!apiKey) {
      showToast('Please enter Gemini API key for Gemini models', 'error');
      return;
    }
  }

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }

    setStatus('processing', 'Extracting page content...');
    setProgress(0);
    elements.savePdfBtn.disabled = true;

    // Wait a bit for dynamic content to load (Notion, React apps, etc.)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Inject content script and get page HTML
    const htmlResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent
    });

    if (!htmlResult || !htmlResult[0]?.result) {
      throw new Error('Failed to extract page content');
    }

    const pageData = htmlResult[0].result;

    // Get Google API key if needed
    let googleApiKey = elements.googleApiKey.value.trim();
    // If masked, decrypt the encrypted version from dataset
    if (googleApiKey.startsWith('••••') && elements.googleApiKey.dataset.encrypted) {
      try {
        googleApiKey = await decryptApiKey(elements.googleApiKey.dataset.encrypted);
      } catch (error) {
        console.error('Failed to decrypt Google API key:', error);
        // Continue without Google API key if decryption fails
        googleApiKey = '';
      }
    }
    const translateImages = elements.translateImages.checked && elements.languageSelect.value !== 'auto';

    // Send to background script for processing
    const response = await chrome.runtime.sendMessage({
      action: 'processArticle',
      data: {
        html: pageData.html,
        url: pageData.url,  // Use actual page URL (with current anchor), not tab.url
        title: pageData.title || tab.title,
        apiKey: apiKey,
        provider: provider,
        googleApiKey: googleApiKey,
        model: model,
        mode: elements.modeSelect.value,
        useCache: elements.useCache.checked,
        outputFormat: elements.outputFormat.value,
        generateToc: elements.generateToc.checked,
        generateAbstract: elements.generateAbstract.checked,
        pageMode: elements.pageMode.value,
        language: elements.languageSelect.value,
        translateImages: translateImages,
        fontFamily: elements.fontFamily.value,
        fontSize: elements.fontSize.value,
        bgColor: elements.bgColor.value,
        textColor: elements.textColor.value,
        headingColor: elements.headingColor.value,
        linkColor: elements.linkColor.value,
        tabId: tab.id
      }
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // Processing started in background
    // UI will be updated via state polling

  } catch (error) {
    console.error('Error:', error);
    setStatus('error', error.message);
    showToast(error.message, 'error');
    elements.savePdfBtn.disabled = false;
  }
}

// Function to inject into page to extract content
function extractPageContent() {
  // Always use full HTML - let AI figure out what's important
  // This ensures we don't accidentally miss content
  const html = document.documentElement.outerHTML;
  
  console.log('[WebpageToPDF] Extracted full HTML, length:', html.length);
  
  // Get title from various sources
  let pageTitle = document.title;
  const h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim()) {
    pageTitle = h1.textContent.trim();
  }
  
  const images = Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    alt: img.alt || '',
    width: img.naturalWidth,
    height: img.naturalHeight
  }));

  return {
    html: html,
    images: images,
    url: window.location.href,
    title: pageTitle
  };
}

// Set status indicator
function setStatus(type, text, startTime = null) {
  elements.statusDot.className = 'status-dot';
  if (type === 'processing') {
    elements.statusDot.classList.add('processing');
    // Add timer display for processing status (use startTime from background)
    const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    elements.statusText.innerHTML = `${text} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
  } else if (type === 'error') {
    elements.statusDot.classList.add('error');
    elements.statusText.textContent = text;
  } else {
    elements.statusText.textContent = text;
  }
}

// Set progress bar
function setProgress(percent, show = true) {
  elements.progressContainer.style.display = show ? 'block' : 'none';
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${percent}%`;
}

// Show toast notification
function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Cleanup on popup close
window.addEventListener('unload', () => {
  if (statePollingInterval) {
    clearTimeout(statePollingInterval);
  }
});

// ========================================
// STATISTICS
// ========================================

async function loadAndDisplayStats() {
  try {
    const [statsResponse, cacheResponse] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getStats' }),
      chrome.runtime.sendMessage({ action: 'getCacheStats' })
    ]);
    
    if (statsResponse && statsResponse.stats) {
      displayStats(statsResponse.stats);
    }
    
    if (cacheResponse && cacheResponse.stats) {
      displayCacheStats(cacheResponse.stats);
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function displayStats(stats) {
  // Update main counters
  document.getElementById('statTotal').textContent = stats.totalSaved || 0;
  document.getElementById('statMonth').textContent = stats.thisMonth || 0;
  
  // Update format counts
  document.getElementById('formatPdf').textContent = stats.byFormat?.pdf || 0;
  document.getElementById('formatEpub').textContent = stats.byFormat?.epub || 0;
  document.getElementById('formatFb2').textContent = stats.byFormat?.fb2 || 0;
  document.getElementById('formatMarkdown').textContent = stats.byFormat?.markdown || 0;
  
  // Update history
  const historyContainer = document.getElementById('statsHistory');
  if (stats.history && stats.history.length > 0) {
    historyContainer.innerHTML = stats.history.map((item, index) => {
      const date = new Date(item.date);
      const dateStr = formatRelativeDate(date);
      const timeStr = item.processingTime > 0 ? `${Math.round(item.processingTime / 1000)}s` : '';
      return `
        <div class="history-item" data-index="${index}" data-url="${escapeHtml(item.url || '')}">
          <a href="${escapeHtml(item.url || '#')}" class="history-link" target="_blank" title="Open original article">
            <div class="history-title">${escapeHtml(item.title)}</div>
            <div class="history-meta">
              <span class="history-format">${item.format}</span>
              <span class="history-domain">${escapeHtml(item.domain)}</span>
              ${timeStr ? `<span class="history-time">${timeStr}</span>` : ''}
              <span class="history-date">${dateStr}</span>
            </div>
          </a>
          <button class="history-delete" data-index="${index}" title="Delete from history">✕</button>
        </div>
      `;
    }).join('');
    
    // Add delete handlers
    historyContainer.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        await chrome.runtime.sendMessage({ action: 'deleteHistoryItem', index });
        await loadAndDisplayStats();
      });
    });
  } else {
    historyContainer.innerHTML = '<div class="stats-empty">No data yet</div>';
  }
  
  // Update footer
  document.getElementById('statsLastSaved').textContent = `Last: ${stats.lastSavedText || 'Never'}`;
  document.getElementById('statsAvgTime').textContent = `Avg: ${stats.avgProcessingTime || 0}s`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeDate(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
}

function displayCacheStats(stats) {
  const domainsEl = document.getElementById('cacheDomains');
  if (domainsEl) {
    domainsEl.textContent = stats.validDomains || 0;
  }
  
  // Display cached domains list
  const domainsListEl = document.getElementById('cacheDomainsList');
  if (domainsListEl && stats.domains) {
    if (stats.domains.length === 0) {
      domainsListEl.innerHTML = '<div class="stats-empty">No cached domains</div>';
    } else {
      domainsListEl.innerHTML = stats.domains.map(item => {
        if (item.invalidated) return ''; // Skip invalidated domains
        
        return `
          <div class="cache-domain-item">
            <span class="cache-domain-name" title="${escapeHtml(item.domain)}">${escapeHtml(item.domain)}</span>
            <div class="cache-domain-meta">
              <span>${item.age}</span>
            </div>
            <button class="cache-domain-delete" data-domain="${escapeHtml(item.domain)}" title="Delete from cache">✕</button>
          </div>
        `;
      }).filter(html => html).join('');
      
      // Add delete handlers
      domainsListEl.querySelectorAll('.cache-domain-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const domain = btn.dataset.domain;
          if (confirm(`Delete "${domain}" from cache?`)) {
            await chrome.runtime.sendMessage({ action: 'deleteDomainFromCache', domain });
            await loadAndDisplayStats();
            showToast('Domain removed from cache', 'success');
          }
        });
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

