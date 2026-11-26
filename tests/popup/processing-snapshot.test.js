// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { initProcessing } from '../../popup/core/processing.js';
import { initializeDOMElements } from '../../popup/utils/init-helpers.js';

const page = { html: '<article><p>Independent survey observations.</p></article>', url: 'https://example.test/survey', title: 'Survey' };
const runId = 'df1b9f52-8b6b-4dc0-80b4-0fefb7b69265';
let elements, processing, releasePage, decryptApiKey, showToast;
beforeEach(() => {
  vi.resetAllMocks();
  releasePage = null;
  document.documentElement.innerHTML = readFileSync('popup/popup.html', 'utf8');
  elements = {}; initializeDOMElements(elements);
  elements.modeSelect.value = 'automatic';
  elements.mainFormatSelect.value = 'audio';
  elements.languageSelect.value = 'auto';
  elements.apiProviderSelect.value = 'openai';
  elements.modelSelect.replaceChildren(new Option('Example model', 'example-model'));
  elements.modelSelect.dataset.provider = 'openai';
  elements.apiKey.value = 'synthetic-openai-key'; elements.apiKey.dataset.provider = 'openai';
  elements.audioProvider.value = 'openai';
  elements.audioVoice.replaceChildren(new Option('Example narrator', 'coral'));
  elements.audioVoice.options[0].dataset.voiceId = 'coral';
  elements.audioVoice.dataset.provider = 'openai';
  elements.audioSpeed.value = '1.25';
  elements.openaiInstructions.value = 'Read calmly.';
  elements.useCache.checked = true;
  chrome.storage.local.get.mockResolvedValue({});
  chrome.tabs.query = vi.fn(async () => [{ id: 8, url: page.url, title: page.title }]);
  chrome.tabs.sendMessage = vi.fn(() => new Promise(resolve => { releasePage = resolve; }));
  chrome.runtime.sendMessage.mockResolvedValue({ started: true, processingRunId: runId });
  const noop = vi.fn();
  decryptApiKey = vi.fn(async value => value);
  showToast = vi.fn();
  processing = initProcessing({ elements, t: async key => key, log: noop, logError: noop, logWarn: noop,
    showToast, setStatus: noop, setProgress: noop, stopTimerDisplay: noop,
    decryptApiKey, getProviderFromModel: () => 'openai',
    startStatePolling: noop, checkProcessingState: async () => {}, stateRefs: {} });
});

async function beginCapture() {
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(releasePage).toBeTypeOf('function'), { timeout: 2000 });
  return { operation, finish: () => releasePage(page) };
}
const packet = () => chrome.runtime.sendMessage.mock.calls.find(([request]) => request.action === 'processArticle')?.[0].data;

it('captures one audio configuration before page acquisition yields', async () => {
  const { operation, finish } = await beginCapture();
  elements.audioProvider.value = 'elevenlabs';
  elements.audioVoice.replaceChildren(new Option('Other narrator', 'other-narrator'));
  elements.audioVoice.dataset.provider = 'elevenlabs';
  elements.audioSpeed.value = '0.8';
  elements.openaiInstructions.value = 'A later draft.';
  elements.useCache.checked = false;
  finish(); await operation;
  expect(packet()).toMatchObject({ audioProvider: 'openai', audioVoice: 'coral', audioSpeed: 1.25,
    openaiInstructions: 'Read calmly.', useCache: true });
});

it('keeps model, workspace, region and voice from the same Qwen configuration', async () => {
  elements.audioProvider.value = 'qwen';
  elements.qwenModel.replaceChildren(new Option('First model', 'qwen-example-a'));
  elements.qwenWorkspaceId.value = 'workspace-a'; elements.qwenRegion.value = 'singapore';
  elements.audioVoice.replaceChildren(new Option('First narrator', 'narrator-a'));
  elements.audioVoice.dataset.provider = 'qwen';
  const { operation, finish } = await beginCapture();
  elements.qwenModel.replaceChildren(new Option('Second model', 'qwen-example-b'));
  elements.qwenWorkspaceId.value = 'workspace-b'; elements.qwenRegion.value = 'beijing';
  elements.audioVoice.replaceChildren(new Option('Second narrator', 'narrator-b'));
  finish(); await operation;
  expect(packet()).toMatchObject({ audioProvider: 'qwen', audioVoice: 'narrator-a', qwenModel: 'qwen-example-a',
    qwenWorkspaceId: 'workspace-a', qwenRegion: 'singapore' });
});

it.each(['disabled', 'foreign owner'])('does not admit an unavailable audio voice: %s', async kind => {
  chrome.tabs.sendMessage.mockResolvedValue(page);
  if (kind === 'disabled') elements.audioVoice.options[0].disabled = true;
  else elements.audioVoice.dataset.provider = 'elevenlabs';
  await processing.handleSavePdf();
  expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  expect(packet()).toBeUndefined();
});

it('retains the clicked image-translation credential while another provider field is being restored', async () => {
  elements.mainFormatSelect.value = 'pdf';
  elements.languageSelect.value = 'en';
  elements.translateImages.checked = true;
  elements.imageTranslationProvider.value = 'openai';
  const { operation, finish } = await beginCapture();
  elements.apiKey.value = 'synthetic-other-key';
  elements.apiKey.dataset.provider = 'openrouter';
  chrome.storage.local.get.mockResolvedValue({ openai_api_key: 'synthetic-saved-key' });
  finish(); await operation;
  expect(packet()).toMatchObject({ apiKey: 'synthetic-openai-key', imageApiKey: 'synthetic-openai-key', provider: 'openai' });
});

it('preserves the clicked document settings and keys during page acquisition', async () => {
  elements.mainFormatSelect.value = 'markdown';
  elements.fontFamily.value = 'Arial';
  elements.generateToc.checked = true;
  elements.bgColor.value = '#123456';
  elements.googleTtsApiKey.value = 'synthetic-speech-key';
  const { operation, finish } = await beginCapture();
  elements.generateToc.checked = false;
  elements.bgColor.value = '#654321';
  elements.googleTtsApiKey.value = 'synthetic-later-key';
  finish(); await operation;
  expect(packet()).toMatchObject({ generateToc: true, bgColor: '#123456', googleTtsApiKey: 'synthetic-speech-key' });
});

it('selects the source tab before asynchronous credential work', async () => {
  elements.apiKey.value = '****stored';
  elements.apiKey.dataset.encrypted = 'synthetic-ciphertext';
  let releaseKey;
  decryptApiKey.mockImplementationOnce(() => new Promise(resolve => { releaseKey = resolve; }));
  let activeTab = { id: 8, url: page.url };
  chrome.tabs.query.mockImplementation(async () => [activeTab]);
  chrome.tabs.sendMessage.mockImplementation(async id => id === 8 ? page : {
    ...page, url: 'https://example.test/other', title: 'Other survey'
  });
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(releaseKey).toBeTypeOf('function'));
  activeTab = { id: 9, url: 'https://example.test/other' };
  releaseKey('synthetic-key');
  await operation;
  expect(packet()).toMatchObject({ tabId: 8, url: page.url });
});

it('does not export a replacement document that arrives during the initial capture', async () => {
  const operation = processing.handleSavePdf();
  await vi.waitFor(() => expect(releasePage).toBeTypeOf('function'), { timeout: 2000 });
  releasePage({ ...page, url: 'https://example.test/other', title: 'Other survey' });
  await operation;
  expect(packet()).toBeUndefined();
  expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error', { key: 'errorPageNotReady', params: {} });
  expect(elements.savePdfBtn.disabled).toBe(false);
});
