// @ts-check
// Array helper utilities - common array operations
// Reduces code duplication

/**
 * Check if array is not empty
 * @param {Array} arr - Array to check
 * @returns {boolean} True if array has elements
 */
export function isNotEmpty(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Check if array is empty
 * @param {Array} arr - Array to check
 * @returns {boolean} True if array is empty or not an array
 */
export function isEmpty(arr) {
  return !Array.isArray(arr) || arr.length === 0;
}

/**
 * Safely get array length
 * @param {Array} arr - Array to get length from
 * @returns {number} Array length or 0
 */
export function safeLength(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

/**
 * Calculate average of numeric array
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Average or 0 if empty
 */
export function calculateAverage(values) {
  if (!isNotEmpty(values)) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate percentile of sorted array
 * @param {Array<number>} sortedValues - Sorted array of numbers
 * @param {number} percentile - Percentile (0-100)
 * @returns {number} Percentile value or 0 if empty
 */
export function calculatePercentile(sortedValues, percentile) {
  if (!isNotEmpty(sortedValues)) return 0;
  const index = Math.floor(sortedValues.length * (percentile / 100));
  return sortedValues[Math.min(index, sortedValues.length - 1)];
}

/**
 * Count items in array by key function
 * @param {Array} array - Array to count
 * @param {import('../../../types.js').KeyFunction} keyFn - Function to extract key from item
 * @returns {Object} Object with counts: { key1: count1, key2: count2, ... }
 */
export function countBy(array, keyFn) {
  if (!Array.isArray(array)) return {};
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Validate array input and return error message if invalid
 * @param {*} input - Input to validate
 * @param {string} name - Name of input for error message
 * @returns {string|null} Error message or null if valid
 */
export function validateArrayInput(input, name = 'input') {
  if (!input) {
    return `${name} is null or undefined`;
  }
  if (!Array.isArray(input)) {
    return `${name} is not an array (type: ${typeof input})`;
  }
  return null;
}

