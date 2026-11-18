// @ts-check
/** Preserve printed hyphens without inserting a space inside a wrapped word. */
export function joinPdfText(previous, next) {
  const left = String(previous || '').trimEnd();
  const right = String(next || '').trimStart();
  if (!left) return right;
  if (!right) return left;
  if (/\p{L}[-\u2010\u00ad]$/u.test(left) && /^\p{Ll}/u.test(right)) return left.replace(/\u00ad$/, '') + right;
  return left + ' ' + right;
}
