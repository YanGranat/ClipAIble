// @ts-check
// Text helper utilities - common text operations
// Reduces code duplication

/**
 * Truncate text to maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} [ellipsis='...'] - Ellipsis string
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, ellipsis = '...') {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + ellipsis;
}

/**
 * Safely get text from element with fallback
 * @param {{text?: string, [key: string]: any}} element - Element object
 * @param {string} [property='text'] - Property name to get text from
 * @param {string} [fallback=''] - Fallback value
 * @returns {string} Text or fallback
 */
export function getElementText(element, property = 'text', fallback = '') {
  if (!element || typeof element !== 'object') return fallback;
  const text = element[property];
  return (typeof text === 'string' && text.trim()) ? text.trim() : fallback;
}

/**
 * Format element for logging (compact format)
 * @param {{type?: string, text?: string, pageNum?: number, columnIndex?: number, minY?: number, maxY?: number, level?: number, fontSize?: number, [key: string]: any}} element - Element to format
 * @param {number} index - Element index
 * @param {{textLength?: number, [key: string]: any}} [options={}] - Formatting options (textLength defaults to 50)
 * @returns {string} Formatted string
 */
export function formatElementForLog(element, index, options = {}) {
  const { textLength = 50 } = options;
  const text = truncateText(getElementText(element), textLength);
  const colIdx = element.columnIndex !== undefined ? element.columnIndex : '?';
  const minY = element.minY ? element.minY.toFixed(2) : 'N/A';
  const maxY = element.maxY ? element.maxY.toFixed(2) : 'N/A';
  const level = element.level ? `L${element.level}` : '';
  const fontSize = element.fontSize ? `F${element.fontSize}` : '';
  
  return `[${index}]${element.type || 'unknown'}P${element.pageNum || '?'}C${colIdx}Y${minY}-${maxY}:"${text}"(${getElementText(element).length})${level}${fontSize}`;
}


