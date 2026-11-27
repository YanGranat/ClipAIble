// @ts-check
import { loadPromptOverrides } from '../settings/prompt-catalog.js';
// Independent extraction, summary, and key-theses message handlers.

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { getUILanguage } from '../locales.js';
import { startSummaryGeneration } from './summary.js';
import { startKeyThesesGeneration } from './key-theses.js';
import { detectPdfPage, getOriginalPdfUrl } from '../utils/pdf.js';
import { processPdfDocument } from '../processing/pdf.js';
import { getProviderFromModel } from '../api/index.js';

function responseOnce(sendResponse) {
  let sent = false;
  return (response) => {
    if (sent) return;
    sent = true;
    try { sendResponse(response); }
    catch (error) { logWarn('Response channel closed', { error: error?.message }); }
  };
}

function runGeneration(start, data, startKeepAlive, stopKeepAlive, respond) {
  void start(data, startKeepAlive, stopKeepAlive, respond).catch((error) => {
    logError('Independent generation failed', error);
    respond({ error: error?.userMessage || error?.message || 'Generation failed', ...getErrorTranslation(error) });
  });
}

export function handleExtractContentOnly(request, sender, sendResponse, processWithSelectorMode,
  processWithExtractMode, processWithoutAI, startKeepAlive, stopKeepAlive) {
  const respond = responseOnce(sendResponse);
  const data = request.data;
  if (!data || typeof data !== 'object') {
    respond({ error: 'extractContentOnly requires data object' });
    return true;
  }
  const { html, url, title, apiKey, model, mode, useCache, tabId, autoGenerateSummary, autoGenerateKeyTheses, language } = data;
  const pdfInfo = detectPdfPage(url, url, html, data.sourceContentType);
  const isPdf = Boolean(pdfInfo?.isPdf);
  if (!url || !apiKey || !model || (!isPdf && !html)) {
    respond({ error: 'Missing required parameters' });
    return true;
  }

  const checks = [];
  const checkExtraction = () => {
    if (!checks.length) return;
    for (const check of checks) {
      try { check(); return; }
      catch (error) { if (!error?.cancelledGeneration) throw error; }
    }
    /** @type {import('../types.js').ExtendedError} */
    const error = new Error('Content extraction cancelled');
    error.cancelledGeneration = true;
    error.keyThesesCancelled = Boolean(autoGenerateKeyTheses);
    throw error;
  };
  let extraction;
  let prompts;
  const getPromptOverrides = () => prompts ??= loadPromptOverrides();
  const getContent = () => {
    if (!extraction) extraction = (async () => {
      checkExtraction();
      const promptOverrides = await getPromptOverrides();
      checkExtraction();
      /** @type {import('../types.js').ProcessingData} */
      const processingData = {
        extractionOnly: true, checkCancelled: checkExtraction, promptOverrides,
        autoGenerateKeyTheses: Boolean(autoGenerateKeyTheses),
        html: html || '', url, title, apiKey, provider: data.provider ?? getProviderFromModel(model), model,
        mode, useCache, tabId, outputFormat: 'markdown', generateAbstract: false, generateToc: false
      };
      let result;
      if (isPdf) {
        const pdfUrl = pdfInfo.originalUrl || (tabId ? await getOriginalPdfUrl(tabId) : null) || url;
        checkExtraction();
        result = await processPdfDocument(processingData, pdfUrl);
      } else {
        const process = mode === 'automatic' ? processWithoutAI : mode === 'selector' ? processWithSelectorMode : processWithExtractMode;
        result = await process(processingData);
      }
      checkExtraction();
      if (!Array.isArray(result?.content) || result.content.length === 0) throw new Error('No content extracted');
      return { contentItems: result.content, title: result.title || title, result };
    })();
    return extraction;
  };

  if (autoGenerateSummary || autoGenerateKeyTheses) {
    const generationData = {
      apiKey, model, provider: data.provider, url, language: language || 'auto', title, getContent, getPromptOverrides,
      onAdmitted: (check) => checks.push(check)
    };
    const acknowledge = (response) => respond(response.started
      ? { success: true, extracting: true, generationId: response.generationId }
      : response);
    if (autoGenerateSummary) runGeneration(startSummaryGeneration, generationData, startKeepAlive, stopKeepAlive, acknowledge);
    if (autoGenerateKeyTheses) runGeneration(startKeyThesesGeneration, generationData, startKeepAlive, stopKeepAlive, acknowledge);
  } else {
    void getContent().then(({ result }) => respond({ success: true, result })).catch(async (error) => {
      try {
        const normalized = await handleError(error, {
          source: 'messageHandler', errorType: 'contentExtractionFailed',
          logError: true, createUserMessage: true
        });
        respond({ error: normalized.userMessage || normalized.message || 'Content extraction failed', ...getErrorTranslation(normalized) });
      } catch (failure) {
        respond({ error: failure?.message || 'Content extraction failed', ...getErrorTranslation(failure) });
      }
    });
  }
  return true;
}

export function handleGenerateSummary(request, sender, sendResponse, startKeepAlive, stopKeepAlive) {
  runGeneration(startSummaryGeneration, request.data || {}, startKeepAlive, stopKeepAlive, responseOnce(sendResponse));
  return true;
}

export function handleGenerateKeyTheses(request, sender, sendResponse, startKeepAlive, stopKeepAlive) {
  runGeneration(startKeyThesesGeneration, request.data || {}, startKeepAlive, stopKeepAlive, responseOnce(sendResponse));
  return true;
}
