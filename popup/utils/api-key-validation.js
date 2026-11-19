// @ts-check

/** Check token syntax locally; the service determines credential validity. */
export function isApiKeyToken(value) {
  return typeof value === 'string' && /^[\x21-\x7E]+$/.test(value) && !value.startsWith('****');
}
