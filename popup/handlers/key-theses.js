// @ts-check
// Key theses button and panel handlers

/**
 * Setup key theses-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Function} deps.handleGenerateKeyTheses - Handle generate key theses
 * @param {Function} deps.toggleKeyTheses - Toggle key theses panel
 * @param {Function} deps.copyKeyTheses - Copy key theses
 * @param {Function} deps.downloadKeyTheses - Download key theses
 * @param {Function} deps.closeKeyTheses - Close key theses panel
 */
export function setupKeyThesesHandlers(deps) {
  const {
    elements,
    handleGenerateKeyTheses,
    toggleKeyTheses,
    copyKeyTheses,
    downloadKeyTheses,
    closeKeyTheses
  } = deps;

  if (elements.generateKeyThesesBtn) {
    elements.generateKeyThesesBtn.addEventListener('click', handleGenerateKeyTheses);
  }
  if (elements.keyThesesToggle) {
    elements.keyThesesToggle.addEventListener('click', toggleKeyTheses);
  }
  if (elements.keyThesesCopyBtn) {
    elements.keyThesesCopyBtn.addEventListener('click', copyKeyTheses);
  }
  if (elements.keyThesesDownloadBtn) {
    elements.keyThesesDownloadBtn.addEventListener('click', downloadKeyTheses);
  }
  if (elements.keyThesesCloseBtn) {
    elements.keyThesesCloseBtn.addEventListener('click', closeKeyTheses);
  }
}
