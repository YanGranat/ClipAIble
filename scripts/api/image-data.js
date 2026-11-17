// Preserve the encoded image format when preparing provider requests.
export function parseBase64Image(imageData) {
  const separator = imageData.indexOf(',');
  if (separator === -1) return { base64Image: imageData, mimeType: 'image/png' };
  const declaredType = imageData.slice(0, separator).match(/^data:([^;,]+)/i)?.[1]?.toLowerCase();
  return {
    base64Image: imageData.slice(separator + 1),
    mimeType: declaredType === 'image/jpg' ? 'image/jpeg' : declaredType || 'image/png'
  };
}
