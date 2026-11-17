import { getUILanguage, tSync } from '../locales.js';

/** Keep diagnostics and a translatable description across PDF execution contexts. */
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
  return localized;
}

export function pdfFailurePayload(error, fallbackKey) {
  return { success: false, error: error?.message || '', ...describePdfError(error, fallbackKey) };
}
