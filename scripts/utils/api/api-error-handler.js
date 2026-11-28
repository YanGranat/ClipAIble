// @ts-check

import { logError } from '../logging.js';
import { getUILanguage, tSync } from '../../locales.js';

/** @param {string} providerName */
export async function handleTimeoutError(providerName) {
  const uiLang = await getUILanguage();
  return new Error(tSync('errorProviderTimeout', uiLang).replace('{provider}', providerName));
}

/** @param {Error} networkError @param {string} providerName */
export async function handleNetworkError(networkError, providerName) {
  const type = networkError instanceof TypeError ? 'TypeError' : 'NetworkError';
  logError(`${providerName} network error`, { type });
  const uiLang = await getUILanguage();
  return new Error(`${providerName}: ${tSync('errorNetwork', uiLang)}`);
}
