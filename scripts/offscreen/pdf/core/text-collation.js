// @ts-check
// Text collation - ported from pdfplumber
// Combines text items into lines with smart spacing

/**
 * Collate items into a line text with smart spacing
 * EXACT PORT from pdfplumber/utils/text.py:collate_line()
 * 
 * Original Python code:
 * ```python
 * def collate_line(line_chars, tolerance=DEFAULT_X_TOLERANCE):
 *     coll = ""
 *     last_x1 = None
 *     for char in sorted(line_chars, key=itemgetter("x0")):
 *         if (last_x1 is not None) and (char["x0"] > (last_x1 + tolerance)):
 *             coll += " "
 *         last_x1 = char["x1"]
 *         coll += char["text"]
 *     return coll
 * ```
 * 
 * Key points:
 * - Sort by x0 (left edge)
 * - Check: char["x0"] > (last_x1 + tolerance) - if current char starts AFTER previous end + tolerance, add space
 * - NO punctuation check - only gap-based spacing
 * - NO soft hyphen removal in original (we keep it for compatibility)
 * 
 * @param {Array} items - Array of text items, sorted by X coordinate
 * @param {number} xTolerance - Maximum gap between items to not add space (default: 3, matches pdfplumber)
 * @returns {string} Collated line text
 */
export function collateLine(items, xTolerance = 3) {
  if (items.length === 0) {
    return '';
  }
  
  // EXACT pdfplumber: Sort items by X coordinate (x0 in Python, x in our case)
  const sortedItems = [...items].sort((a, b) => a.x - b.x);
  
  let coll = '';  // Use same variable name as pdfplumber
  let last_x1 = null;  // Use same variable name as pdfplumber
  
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    
    // EXACT pdfplumber logic: if (last_x1 is not None) and (char["x0"] > (last_x1 + tolerance))
    // In our case: item.x is x0, item.x + item.width is x1
    if (last_x1 !== null) {
      const item_x0 = item.x || 0;  // char["x0"] in Python
      const threshold = last_x1 + xTolerance;  // last_x1 + tolerance
      
      // EXACT pdfplumber condition: char["x0"] > (last_x1 + tolerance)
      if (item_x0 > threshold) {
        coll += ' ';
      }
    }
    
    // EXACT pdfplumber: last_x1 = char["x1"]
    // In our case: x1 = x0 + width
    last_x1 = (item.x || 0) + (item.width || 0);
    
    // EXACT pdfplumber: coll += char["text"]
    // We keep soft hyphen removal for compatibility (not in original but doesn't hurt)
    let itemText = item.str || '';
    itemText = itemText.replace(/\u00AD/g, '');  // Remove soft hyphens (our addition)
    coll += itemText;
  }
  
  // Post-process: pdfplumber doesn't do this, but we keep for compatibility
  coll = coll.replace(/\u00AD/g, ''); // Remove any remaining soft hyphens
  coll = coll.replace(/[ \t]+/g, ' '); // Normalize spaces
  coll = coll.replace(/\s+$/g, ''); // Remove trailing whitespace
  
  return coll;
}

