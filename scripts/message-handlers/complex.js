// @ts-check
// Independent extraction, summary, and key-theses message handlers.

import { log, logError, logWarn } from '../utils/logging.js';
import { handleError, getErrorTranslation } from '../utils/error-handler.js';
import { getUILanguage } from '../locales.js';
import { startSummaryGeneration } from './summary.js';
import { startKeyThesesGeneration } from './key-theses.js';
import { detectPdfPage, getOriginalPdfUrl } from '../utils/pdf.js';
import { processPdfPageWithAI, processPdfPage } from '../processing/pdf.js';
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
  const pdfInfo = detectPdfPage(url, url);
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
    const error = new Error('Content extraction cancelled');
    error.cancelledGeneration = true;
    error.keyThesesCancelled = Boolean(autoGenerateKeyTheses);
    throw error;
  };
  let extraction;
  const getContent = () => {
    if (!extraction) extraction = (async () => {
      checkExtraction();
      const processingData = {
        extractionOnly: true, checkCancelled: checkExtraction,
        autoGenerateKeyTheses: Boolean(autoGenerateKeyTheses),
        html: html || '', url, title, apiKey, provider: data.provider ?? getProviderFromModel(model), model,
        mode, useCache, tabId, outputFormat: 'markdown', generateAbstract: false, generateToc: false
      };
      let result;
      if (isPdf) {
        const pdfUrl = pdfInfo.originalUrl || (tabId ? await getOriginalPdfUrl(tabId) : null) || url;
        checkExtraction();
        result = mode === 'selector'
          ? await processPdfPageWithAI(processingData, pdfUrl)
          : await processPdfPage(processingData, pdfUrl);
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
      apiKey, model, provider: data.provider, url, language: language || 'auto', title, getContent,
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

/**
 * Handle logModelDropdown request
 */
export function handleLogModelDropdown(request, sender, sendResponse) {
  // Log model dropdown events to service worker console
  const { level, message, data } = request;
  const logMessage = `[ModelDropdown] ${message}`;
  if (data) {
    log(logMessage, data);
  } else {
    log(logMessage);
  }
  try {
    sendResponse({ logged: true });
  } catch (sendError) {
    logWarn('Failed to send response (channel may be closed)', { error: sendError?.message });
  }
  return true;
}




