// UI management module for popup
// Handles localization, themes, visibility, status, progress, toast notifications

import { getUILanguage, UI_LOCALES } from '../scripts/locales.js';
import { logWarn } from '../scripts/utils/logging.js';

/**
 * Initialize UI module with dependencies
 * @param {Object} deps - Dependencies object
 * @param {Object} deps.elements - DOM elements object
 * @param {Function} deps.formatTime - Format time function
 * @param {Function} deps.startTimerDisplay - Start timer display function
 * @param {Function} deps.getElement - Get element helper
 * @param {Function} deps.setElementDisplay - Set element display helper
 * @param {Function} deps.setElementGroupDisplay - Set element group display helper
 * @param {Function} deps.setDisplayForIds - Set display for IDs helper
 * @param {Object} deps.currentStartTime - Current start time reference
 * @param {Object} deps.timerInterval - Timer interval reference
 * @returns {Object} UI functions
 */
export function initUI(deps) {
  const {
    elements,
    formatTime,
    startTimerDisplay,
    getElement,
    setElementDisplay,
    setElementGroupDisplay,
    setDisplayForIds,
    currentStartTime,
    timerInterval
  } = deps;

  // Apply UI localization
  async function applyLocalization() {
    const langCode = await getUILanguage();
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    
    // Apply translations to elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = locale[key] || UI_LOCALES.en[key] || key;
      
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'password')) {
        // For inputs, check if they have a separate placeholder key
        if (element.hasAttribute('data-i18n-placeholder')) {
          const placeholderKey = element.getAttribute('data-i18n-placeholder');
          element.placeholder = locale[placeholderKey] || UI_LOCALES.en[placeholderKey] || '';
        } else {
          element.placeholder = translation;
        }
      } else if (element.tagName === 'OPTION') {
        // Options are handled separately
      } else {
        element.textContent = translation;
      }
    });
    
    // Handle elements with only data-i18n-placeholder (no data-i18n)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      if (!element.hasAttribute('data-i18n')) {
        const placeholderKey = element.getAttribute('data-i18n-placeholder');
        element.placeholder = locale[placeholderKey] || UI_LOCALES.en[placeholderKey] || '';
      }
    });
    
    // Handle select options with data-i18n
    document.querySelectorAll('select option[data-i18n]').forEach(option => {
      const key = option.getAttribute('data-i18n');
      const translation = locale[key] || UI_LOCALES.en[key] || key;
      option.textContent = translation;
    });
    
    // Update custom select options after localization
    document.querySelectorAll('.custom-select').forEach(container => {
      const select = container.querySelector('select');
      if (!select) return;
      
      const optionsDiv = container.querySelector('.custom-select-options');
      const valueSpan = container.querySelector('.custom-select-value');
      if (!optionsDiv || !valueSpan) return;
      
      // Update custom options from native select
      const customOptions = optionsDiv.querySelectorAll('.custom-select-option');
      Array.from(select.options).forEach((nativeOption, index) => {
        const customOption = customOptions[index];
        if (customOption) {
          customOption.textContent = nativeOption.textContent;
          if (nativeOption.selected || select.value === nativeOption.value) {
            customOption.classList.add('selected');
            valueSpan.textContent = nativeOption.textContent;
          } else {
            customOption.classList.remove('selected');
          }
        }
      });
    });
    
    // Update select options for language selector (header version - short codes)
    if (elements.uiLanguageSelect) {
      // Keep short codes (EN, RU, etc.) for header selector
      // Only update selected value if needed
      const currentValue = elements.uiLanguageSelect.value;
      if (currentValue !== langCode) {
        elements.uiLanguageSelect.value = langCode;
      }
    }
    
    // Update title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      element.title = locale[key] || UI_LOCALES.en[key] || key;
    });
    
    // Update aria-label attributes
    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      const key = element.getAttribute('data-i18n-aria-label');
      element.setAttribute('aria-label', locale[key] || UI_LOCALES.en[key] || key);
    });
    
    // Update specific dynamic elements
    if (elements.modeHint) {
      const mode = elements.modeSelect?.value || 'selector';
      elements.modeHint.textContent = mode === 'selector' 
        ? (locale.extractionModeHint || UI_LOCALES.en.extractionModeHint)
        : (locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract);
    }
    
    // Update output format button text
    if (elements.saveText) {
      // Button text is always "Save" now, format is selected in dropdown
      elements.saveText.textContent = locale.save || UI_LOCALES.en.save || 'Save';
    }
    
    // Update document language
    document.documentElement.lang = langCode;
  }

  // Apply theme based on user preference or system preference
  function applyTheme() {
    if (!elements.themeSelect) {
      return; // Theme select not available, skip
    }
    const theme = elements.themeSelect.value;
    let actualTheme = theme;
    
    if (theme === 'auto') {
      // Detect system theme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      actualTheme = prefersDark ? 'dark' : 'light';
    }
    
    document.body.setAttribute('data-theme', actualTheme);
    document.documentElement.setAttribute('data-theme', actualTheme);
    
    // Listen for system theme changes if auto is selected
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleThemeChange = (e) => {
        const newTheme = e.matches ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
      };
      
      // Remove old listener if exists
      if (window.themeChangeListener) {
        mediaQuery.removeListener(window.themeChangeListener);
      }
      
      window.themeChangeListener = handleThemeChange;
      mediaQuery.addListener(handleThemeChange);
    }
  }

  // Set status indicator
  function setStatus(type, text, startTime = null) {
    elements.statusDot.className = 'status-dot';
    if (type === 'processing') {
      elements.statusDot.classList.add('processing');
      // Add timer display for processing status (use startTime from background or currentStartTime)
      const effectiveStartTime = startTime || currentStartTime.current;
      const elapsed = effectiveStartTime ? Math.floor((Date.now() - effectiveStartTime) / 1000) : 0;
      elements.statusText.innerHTML = `${text} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
      // Ensure timer is running if we have a startTime
      if (effectiveStartTime && !timerInterval.current) {
        startTimerDisplay(effectiveStartTime);
      }
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

  return {
    applyLocalization,
    applyTheme,
    setStatus,
    setProgress,
    showToast
  };
}

