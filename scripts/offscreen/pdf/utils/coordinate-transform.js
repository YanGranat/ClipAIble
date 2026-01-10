// @ts-check
// Coordinate transformation utility

/**
 * Transform PDF coordinates to viewport coordinates
 * 
 * @param {number} pdfX - PDF X coordinate
 * @param {number} pdfY - PDF Y coordinate
 * @param {{convertToViewportPoint: function(number, number): [number, number]}} viewport - PDF.js viewport object
 * @returns {[number, number]} [viewportX, viewportY]
 */
export function transformCoordinates(pdfX, pdfY, viewport) {
  return viewport.convertToViewportPoint(pdfX, pdfY);
}

