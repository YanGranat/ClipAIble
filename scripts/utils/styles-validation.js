export const DOCUMENT_FONT_FAMILIES = Object.freeze([
  '', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma',
  'Trebuchet MS', 'Palatino Linotype', 'Garamond', 'Courier New', 'Comic Sans MS'
]);

export function isDocumentColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function isDocumentFontFamily(value) {
  return DOCUMENT_FONT_FAMILIES.includes(value);
}
