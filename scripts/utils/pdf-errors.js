import { getUILanguage, tSync } from '../locales.js';

const PDF_SELECTION_CANCELLED = 'PDF_SELECTION_CANCELLED';

export function createPdfSelectionCancelledError() {
  return Object.assign(createPdfError('PDF file selection cancelled', 'statusCancelled'), {
    name: 'AbortError', code: PDF_SELECTION_CANCELLED
  });
}

export function isPdfSelectionCancelled(error) {
  return error?.code === PDF_SELECTION_CANCELLED;
}

/**
 * Keep diagnostics and a translatable description across PDF execution contexts.
 * @returns {import('../types.js').ExtendedError}
 */
export function createPdfError(message, translationKey, translationParams = {}) {
  return Object.assign(new Error(message), { translationKey, translationParams });
}

function describePdfError(error, fallbackKey = 'errorPdfExtractionFailed') {
  const upstreamKey = error?.name === 'PasswordException' ? 'errorPdfPasswordProtected' :
    error?.name === 'InvalidPDFException' ? 'errorPdfInvalid' : null;
  const translationKey = error?.translationKey || upstreamKey || fallbackKey;
  const translationParams = error?.translationParams ||
    (translationKey === 'errorPdfExtractionFailed' ? { error: error?.message || '' } : {});
  return { translationKey, translationParams };
}

export async function localizePdfError(error, fallbackKey) {
  const language = await getUILanguage();
  const { translationKey, translationParams } = describePdfError(error, fallbackKey);
  const localized = createPdfError(tSync(translationKey, language, translationParams), translationKey, translationParams);
  if (error?.name) localized.name = error.name;
  if (error?.status !== undefined) localized.status = error.status;
  if (isPdfSelectionCancelled(error)) localized.code = PDF_SELECTION_CANCELLED;
  return localized;
}

export function pdfFailurePayload(error, fallbackKey) {
  return { success: false, error: error?.message || '', ...describePdfError(error, fallbackKey) };
}
