// @ts-check
// Summary handlers (generate, toggle, copy, download, close)

/**
 * Setup summary-related handlers
 * @param {Object} deps - Dependencies
 * @param {Object} deps.elements - DOM elements
 * @param {Function} deps.handleGenerateSummary - Handle generate summary function
 * @param {Function} deps.toggleSummary - Toggle summary function
 * @param {Function} deps.copySummary - Copy summary function
 * @param {Function} deps.downloadSummary - Download summary function
 * @param {Function} deps.closeSummary - Close summary function
 */
export function setupSummaryHandlers(deps) {
  const {
    elements,
    handleGenerateSummary,
    toggleSummary,
    copySummary,
    downloadSummary,
    closeSummary
  } = deps;

  if (elements.generateSummaryBtn) {
    elements.generateSummaryBtn.addEventListener('click', handleGenerateSummary);
  }
  if (elements.summaryToggle) {
    elements.summaryToggle.addEventListener('click', toggleSummary);
  }
  if (elements.summaryCopyBtn) {
    elements.summaryCopyBtn.addEventListener('click', copySummary);
  }
  if (elements.summaryDownloadBtn) {
    elements.summaryDownloadBtn.addEventListener('click', downloadSummary);
  }
  if (elements.summaryCloseBtn) {
    elements.summaryCloseBtn.addEventListener('click', closeSummary);
  }
}

