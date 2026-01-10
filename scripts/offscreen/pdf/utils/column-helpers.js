// @ts-check
// Column helper utilities - common column detection operations
// Reduces code duplication

/**
 * Find column for an item using center point (more reliable than overlap)
 * @param {{x?: number, width?: number, [key: string]: any}} item - Item with x, width properties
 * @param {Array} columns - Array of column objects with x, maxX properties
 * @returns {Object|null} Column object or null if not found
 */
export function findColumnByCenter(item, columns) {
  if (!item || !columns || columns.length === 0) return null;
  
  const itemX = item.x || 0;
  const itemWidth = item.width || 0;
  const itemCenter = itemX + itemWidth / 2;
  
  return columns.find(col => {
    return itemCenter >= col.x && itemCenter <= col.maxX;
  }) || null;
}

/**
 * Find column for an item using overlap (fallback method)
 * @param {{x?: number, width?: number, [key: string]: any}} item - Item with x, width properties
 * @param {Array} columns - Array of column objects with x, maxX properties
 * @param {number} minOverlapRatio - Minimum overlap ratio (0-1), default 0.3
 * @returns {Object|null} Column object or null if not found
 */
export function findColumnByOverlap(item, columns, minOverlapRatio = 0.3) {
  if (!item || !columns || columns.length === 0) return null;
  
  const itemX = item.x || 0;
  const itemRight = itemX + (item.width || 0);
  const itemWidth = itemRight - itemX;
  
  if (itemWidth <= 0) return null;
  
  return columns.find(col => {
    const overlapStart = Math.max(itemX, col.x);
    const overlapEnd = Math.min(itemRight, col.maxX);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    return (overlap / itemWidth) >= minOverlapRatio;
  }) || null;
}

/**
 * Find column for an item (tries center first, then overlap)
 * @param {{x?: number, width?: number, [key: string]: any}} item - Item with x, width properties
 * @param {Array} columns - Array of column objects with x, maxX properties
 * @param {number} minOverlapRatio - Minimum overlap ratio for fallback, default 0.3
 * @returns {Object|null} Column object or null if not found
 */
export function findColumnForItem(item, columns, minOverlapRatio = 0.3) {
  return findColumnByCenter(item, columns) || findColumnByOverlap(item, columns, minOverlapRatio);
}

/**
 * Check if two items belong to different columns
 * @param {{x?: number, width?: number, [key: string]: any}} item1 - First item
 * @param {{x?: number, width?: number, [key: string]: any}} item2 - Second item
 * @param {Array} columns - Array of column objects
 * @param {number} minOverlapRatio - Minimum overlap ratio, default 0.3
 * @returns {boolean} True if items belong to different columns
 */
export function areItemsInDifferentColumns(item1, item2, columns, minOverlapRatio = 0.3) {
  if (!columns || columns.length === 0) return false;
  
  const col1 = findColumnForItem(item1, columns, minOverlapRatio);
  const col2 = findColumnForItem(item2, columns, minOverlapRatio);
  
  return col1 !== null && col2 !== null && col1 !== col2;
}







