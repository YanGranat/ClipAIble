// @ts-check
// UI management module for popup
// Handles localization, themes, visibility, status, progress, toast notifications

import { getUILanguage, UI_LOCALES, formatMessage, getLocaleTag } from '../scripts/locales.js';
import { logWarn } from '../scripts/utils/logging.js';
import { escapeHtml } from '../scripts/utils/html.js';

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

  let themeMediaQuery = null;
  let themeChangeListener = null;
  let localizationRevision = 0;
  let currentLanguage = null;
  let statusPresentation = null;

  const elementParams = element => {
    try { return JSON.parse(element.getAttribute('data-i18n-params') || '{}'); }
    catch { return {}; }
  };
  const renderParts = (parts, language) => parts.map(part => part.key
    ? formatMessage(part.key, language, part.params)
    : String(part.text || '')).join('');

  // Apply UI localization with batched DOM updates for better performance
  async function applyLocalization() {
    const revision = ++localizationRevision;
    const langCode = await getUILanguage();
    if (revision !== localizationRevision) return;
    const locale = UI_LOCALES[langCode] || UI_LOCALES.en;
    
    // Batch DOM updates using requestAnimationFrame for better performance
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (revision !== localizationRevision) { resolve(); return; }
        // Collect all updates first, then apply in batches
        const updates = [];
        document.querySelectorAll('[data-i18n-parts]').forEach(element => {
          updates.push(() => {
            try { element.textContent = renderParts(JSON.parse(element.dataset.i18nParts), langCode); }
            catch { /* Keep the existing message if its binding is malformed. */ }
          });
        });
        
        // Collect data-i18n updates
        document.querySelectorAll('[data-i18n]').forEach(element => {
          const key = element.getAttribute('data-i18n');
          const translation = locale[key] || UI_LOCALES.en[key] || key;
          
          if (element.tagName === 'INPUT') {
            const inputElement = /** @type {HTMLInputElement} */ (element);
            if (inputElement.type === 'text' || inputElement.type === 'password') {
              if (inputElement.hasAttribute('data-i18n-placeholder')) {
                const placeholderKey = inputElement.getAttribute('data-i18n-placeholder');
                updates.push(() => {
                  const currentKey = inputElement.getAttribute('data-i18n-placeholder');
                  if (currentKey) inputElement.placeholder = formatMessage(currentKey, langCode, elementParams(inputElement));
                });
              } else {
                updates.push(() => {
                  const currentKey = inputElement.getAttribute('data-i18n');
                  if (currentKey) inputElement.placeholder = formatMessage(currentKey, langCode, elementParams(inputElement));
                });
              }
            }
          } else if (element.tagName !== 'OPTION') {
            updates.push(() => {
              const currentKey = element.getAttribute('data-i18n');
              if (currentKey) element.textContent = formatMessage(currentKey, langCode, elementParams(element));
            });
          }
        });
        
        // Collect data-i18n-placeholder updates
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
          if (!element.hasAttribute('data-i18n')) {
            const placeholderKey = element.getAttribute('data-i18n-placeholder');
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
              updates.push(() => {
                const currentKey = element.getAttribute('data-i18n-placeholder');
                if (currentKey) element.placeholder = formatMessage(currentKey, langCode, elementParams(element));
              });
            }
          }
        });
        
        // Collect select option updates
        document.querySelectorAll('select option[data-i18n]').forEach(option => {
          const key = option.getAttribute('data-i18n');
          const translation = locale[key] || UI_LOCALES.en[key] || key;
          updates.push(() => {
            const currentKey = option.getAttribute('data-i18n');
            if (currentKey) option.textContent = formatMessage(currentKey, langCode, elementParams(option));
          });
        });
        
        // Collect custom select updates
        document.querySelectorAll('.custom-select').forEach(container => {
          const select = container.querySelector('select');
          if (!select) return;
          
          const optionsDiv = container.querySelector('.custom-select-options');
          const valueSpan = container.querySelector('.custom-select-value');
          if (!optionsDiv || !valueSpan) return;
          
          const customOptions = optionsDiv.querySelectorAll('.custom-select-option');
          Array.from(select.options).forEach((nativeOption, index) => {
            const customOption = customOptions[index];
            if (customOption) {
              updates.push(() => {
                customOption.textContent = nativeOption.textContent;
                if (nativeOption.selected || select.value === nativeOption.value) {
                  customOption.classList.add('selected');
                  valueSpan.textContent = nativeOption.textContent;
                } else {
                  customOption.classList.remove('selected');
                }
              });
            }
          });
        });
        
        // Special handling for fontFamily (uses hidden input, not select)
        if (elements.fontFamily && elements.fontFamilyOptions && elements.fontFamilyValue) {
          const fontFamilyInput = elements.fontFamily;
          const currentValue = (fontFamilyInput instanceof HTMLInputElement ? fontFamilyInput.value : '') || '';
          const options = elements.fontFamilyOptions.querySelectorAll('.custom-select-option');
          
          options.forEach(opt => {
            // Update text from data-i18n if present
            if (opt.hasAttribute('data-i18n')) {
              const key = opt.getAttribute('data-i18n');
              const translation = locale[key] || UI_LOCALES.en[key] || key;
              updates.push(() => {
                const currentKey = opt.getAttribute('data-i18n');
                if (currentKey) opt.textContent = formatMessage(currentKey, langCode, elementParams(opt));
              });
            }
            
            // Update selected state and displayed value based on current input value
            const optValue = (opt.dataset.value || '').trim();
            const compareValue = currentValue.trim();
            if (optValue === compareValue) {
              updates.push(() => {
                // Remove selected from all options first
                options.forEach(o => o.classList.remove('selected'));
                // Add selected to matching option
                opt.classList.add('selected');
                elements.fontFamilyValue.textContent = opt.textContent;
                // Apply font family style
                if (opt.classList.contains('font-segoe-ui')) {
                  elements.fontFamilyValue.style.fontFamily = 'Segoe UI, sans-serif';
                } else if (opt.classList.contains('font-arial')) {
                  elements.fontFamilyValue.style.fontFamily = 'Arial, sans-serif';
                } else if (opt.classList.contains('font-georgia')) {
                  elements.fontFamilyValue.style.fontFamily = 'Georgia, serif';
                } else if (opt.classList.contains('font-times-new-roman')) {
                  elements.fontFamilyValue.style.fontFamily = 'Times New Roman, serif';
                } else if (opt.classList.contains('font-verdana')) {
                  elements.fontFamilyValue.style.fontFamily = 'Verdana, sans-serif';
                } else if (opt.classList.contains('font-tahoma')) {
                  elements.fontFamilyValue.style.fontFamily = 'Tahoma, sans-serif';
                } else if (opt.classList.contains('font-trebuchet-ms')) {
                  elements.fontFamilyValue.style.fontFamily = 'Trebuchet MS, sans-serif';
                } else {
                  elements.fontFamilyValue.style.fontFamily = opt.style.fontFamily || '';
                }
              });
            }
          });
        }
        
        // Collect title updates
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
          const key = element.getAttribute('data-i18n-title');
          if (element instanceof HTMLElement) {
            updates.push(() => {
              const currentKey = element.getAttribute('data-i18n-title');
              if (currentKey) element.title = formatMessage(currentKey, langCode, elementParams(element));
            });
          }
        });
        
        // Collect aria-label updates
        document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
          const key = element.getAttribute('data-i18n-aria-label');
          updates.push(() => {
            const currentKey = element.getAttribute('data-i18n-aria-label');
            if (currentKey) element.setAttribute('aria-label', formatMessage(currentKey, langCode, elementParams(element)));
          });
        });
        
        // Apply updates in batches to avoid blocking main thread
        const BATCH_SIZE = 50;
        let index = 0;
        
        function processBatch() {
          if (revision !== localizationRevision) { resolve(); return; }
          const end = Math.min(index + BATCH_SIZE, updates.length);
          for (let i = index; i < end; i++) {
            updates[i]();
          }
          index = end;
          
          if (index < updates.length) {
            // Use setTimeout to yield to main thread between batches
            setTimeout(processBatch, 0);
          } else {
            // Final updates
            if (elements.uiLanguageSelect) {
              const currentValue = elements.uiLanguageSelect.value;
              if (currentValue !== langCode) {
                elements.uiLanguageSelect.value = langCode;
              }
            }
            
            if (elements.modeHint) {
              const mode = elements.modeSelect?.value || 'selector';
              if (mode === 'automatic') {
                elements.modeHint.textContent = locale.extractionModeHintAutomatic || UI_LOCALES.en.extractionModeHintAutomatic;
              } else if (mode === 'selector') {
                elements.modeHint.textContent = locale.extractionModeHint || UI_LOCALES.en.extractionModeHint;
              } else {
                elements.modeHint.textContent = locale.extractionModeHintExtract || UI_LOCALES.en.extractionModeHintExtract;
              }
            }
            
            if (elements.saveText) {
              elements.saveText.textContent = locale.save || UI_LOCALES.en.save || 'Save';
            }
            
            document.documentElement.lang = getLocaleTag(langCode);
            currentLanguage = langCode;
            if (statusPresentation) {
              const { type, text, startTime, translation } = statusPresentation;
              setStatus(type, text, startTime, translation);
            }
            
            resolve();
          }
        }
        
        processBatch();
      });
    });
  }

  // Apply theme based on user preference or system preference
  function applyTheme() {
    if (!elements.themeSelect) {
      return; // Theme select not available, skip
    }
    const theme = elements.themeSelect.value;
    let actualTheme = theme;

    if (themeMediaQuery && themeChangeListener) {
      themeMediaQuery.removeListener(themeChangeListener);
      themeMediaQuery = null;
      themeChangeListener = null;
    }
    
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
      
      themeMediaQuery = mediaQuery;
      themeChangeListener = handleThemeChange;
      mediaQuery.addListener(handleThemeChange);
    }
  }

  // Set status indicator
  function setStatus(type, text, startTime = null, translation = null) {
    statusPresentation = { type, text, startTime, translation };
    elements.statusText.removeAttribute('data-i18n');
    elements.statusText.removeAttribute('data-i18n-params');
    if (translation?.key && currentLanguage) text = formatMessage(translation.key, currentLanguage, translation.params);
    elements.statusDot.className = 'status-dot';
    if (type === 'processing') {
      elements.statusDot.classList.add('processing');
      // Add timer display for processing status (use startTime from background or currentStartTime)
      const effectiveStartTime = startTime || currentStartTime.current;
      const elapsed = effectiveStartTime ? Math.floor((Date.now() - effectiveStartTime) / 1000) : 0;
      // SECURITY: Escape status text to prevent XSS attacks
      const escapedText = escapeHtml(text);
      elements.statusText.innerHTML = `${escapedText} <span id="timerDisplay" class="timer">${formatTime(elapsed)}</span>`;
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
    if (show) {
      elements.progressContainer.classList.remove('hidden');
      elements.progressContainer.style.display = 'block';
    } else {
      elements.progressContainer.classList.add('hidden');
      elements.progressContainer.style.display = 'none';
    }
    elements.progressBar.style.width = `${percent}%`;
    elements.progressText.textContent = `${Math.round(percent)}%`;
  }

  // Show toast notification
  function showToast(message, type = 'success', translation = null) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    if (translation?.parts) {
      toast.dataset.i18nParts = JSON.stringify(translation.parts);
      if (currentLanguage) message = renderParts(translation.parts, currentLanguage);
    }
    if (translation?.key) {
      toast.setAttribute('data-i18n', translation.key);
      toast.setAttribute('data-i18n-params', JSON.stringify(translation.params || {}));
      if (currentLanguage) message = formatMessage(translation.key, currentLanguage, translation.params);
    }
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

