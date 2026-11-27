// @ts-check
import { setError, ERROR_CODES } from '../../state/processing.js';
import { getUILanguage, tSync } from '../../locales.js';
import { getAudioRequirementIssue, getAudioVoiceIssue, getImageRequirementIssue, getLocalModelIssue } from '../../processing/export-requirements.js';

async function reportRequirementIssue(issue, data, stopKeepAlive) {
  if (!issue) return true;
  const { key, params = {} } = issue;
  const language = await getUILanguage();
  await setError({ message: tSync(key, language, params), code: ERROR_CODES.VALIDATION_ERROR,
    translationKey: key, translationParams: params }, stopKeepAlive, data.processingRunId);
  return false;
}

export async function validateImageTranslation(data, stopKeepAlive) {
  return reportRequirementIssue(getImageRequirementIssue(data), data, stopKeepAlive);
}

export async function validateAudioApiKeys(data, stopKeepAlive) {
  if (data.outputFormat !== 'audio' || data.audioProvider === 'offline') return true;
  const localIssue = await getLocalModelIssue(data);
  if (localIssue) return reportRequirementIssue(localIssue, data, stopKeepAlive);
  const voiceIssue = getAudioVoiceIssue(data);
  if (voiceIssue) return reportRequirementIssue(voiceIssue, data, stopKeepAlive);
  let openaiKey;
  if (!data.audioProvider || data.audioProvider === 'openai') {
    try {
      openaiKey = (await chrome.storage.local.get(['openai_api_key'])).openai_api_key;
    } catch (error) {
      return reportRequirementIssue({ key: 'errorAudioKeyRead' }, data, stopKeepAlive);
    }
  }
  return reportRequirementIssue(getAudioRequirementIssue(data, openaiKey), data, stopKeepAlive);
}
