var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _createPiperPhonemize, _modelConfig, _ort, _ortSession, _progressCallback, _wasmPaths, _logger;
// Patched for Chrome Extension - use local resources instead of CDN
const HF_BASE = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";
const ONNX_BASE = (typeof chrome !== 'undefined' && chrome.runtime) ?
  chrome.runtime.getURL('lib/').slice(0, -1) : // Remove trailing slash
  "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/";
const WASM_BASE = (typeof chrome !== 'undefined' && chrome.runtime) ?
  chrome.runtime.getURL('lib/piper-wasm/').slice(0, -1) : // Remove trailing slash
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";

// CRITICAL DEBUG LOGGING - Added for production archive debugging
console.log('[piper-tts-web.js] Constants initialized:', {
  ONNX_BASE,
  WASM_BASE,
  isChrome: typeof chrome !== 'undefined' && !!chrome.runtime,
  timestamp: new Date().toISOString()
});
const PATH_MAP = {
  "ar_JO-kareem-low": "ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx",
  "ar_JO-kareem-medium": "ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx",
  "ca_ES-upc_ona-medium": "ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx",
  "ca_ES-upc_ona-x_low": "ca/ca_ES/upc_ona/x_low/ca_ES-upc_ona-x_low.onnx",
  "ca_ES-upc_pau-x_low": "ca/ca_ES/upc_pau/x_low/ca_ES-upc_pau-x_low.onnx",
  "cs_CZ-jirka-low": "cs/cs_CZ/jirka/low/cs_CZ-jirka-low.onnx",
  "cs_CZ-jirka-medium": "cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx",
  "da_DK-talesyntese-medium": "da/da_DK/talesyntese/medium/da_DK-talesyntese-medium.onnx",
  "de_DE-eva_k-x_low": "de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx",
  "de_DE-karlsson-low": "de/de_DE/karlsson/low/de_DE-karlsson-low.onnx",
  "de_DE-kerstin-low": "de/de_DE/kerstin/low/de_DE-kerstin-low.onnx",
  "de_DE-mls-medium": "de/de_DE/mls/medium/de_DE-mls-medium.onnx",
  "de_DE-pavoque-low": "de/de_DE/pavoque/low/de_DE-pavoque-low.onnx",
  "de_DE-ramona-low": "de/de_DE/ramona/low/de_DE-ramona-low.onnx",
  "de_DE-thorsten-high": "de/de_DE/thorsten/high/de_DE-thorsten-high.onnx",
  "de_DE-thorsten-low": "de/de_DE/thorsten/low/de_DE-thorsten-low.onnx",
  "de_DE-thorsten-medium": "de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
  "de_DE-thorsten_emotional-medium": "de/de_DE/thorsten_emotional/medium/de_DE-thorsten_emotional-medium.onnx",
  "el_GR-rapunzelina-low": "el/el_GR/rapunzelina/low/el_GR-rapunzelina-low.onnx",
  "en_GB-alan-low": "en/en_GB/alan/low/en_GB-alan-low.onnx",
  "en_GB-alan-medium": "en/en_GB/alan/medium/en_GB-alan-medium.onnx",
  "en_GB-alba-medium": "en/en_GB/alba/medium/en_GB-alba-medium.onnx",
  "en_GB-aru-medium": "en/en_GB/aru/medium/en_GB-aru-medium.onnx",
  "en_GB-cori-high": "en/en_GB/cori/high/en_GB-cori-high.onnx",
  "en_GB-cori-medium": "en/en_GB/cori/medium/en_GB-cori-medium.onnx",
  "en_GB-jenny_dioco-medium": "en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium.onnx",
  "en_GB-northern_english_male-medium": "en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx",
  "en_GB-semaine-medium": "en/en_GB/semaine/medium/en_GB-semaine-medium.onnx",
  "en_GB-southern_english_female-low": "en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx",
  "en_GB-vctk-medium": "en/en_GB/vctk/medium/en_GB-vctk-medium.onnx",
  "en_US-amy-low": "en/en_US/amy/low/en_US-amy-low.onnx",
  "en_US-amy-medium": "en/en_US/amy/medium/en_US-amy-medium.onnx",
  "en_US-arctic-medium": "en/en_US/arctic/medium/en_US-arctic-medium.onnx",
  "en_US-danny-low": "en/en_US/danny/low/en_US-danny-low.onnx",
  "en_US-hfc_female-medium": "en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx",
  "en_US-hfc_male-medium": "en/en_US/hfc_male/medium/en_US-hfc_male-medium.onnx",
  "en_US-joe-medium": "en/en_US/joe/medium/en_US-joe-medium.onnx",
  "en_US-kathleen-low": "en/en_US/kathleen/low/en_US-kathleen-low.onnx",
  "en_US-kristin-medium": "en/en_US/kristin/medium/en_US-kristin-medium.onnx",
  "en_US-kusal-medium": "en/en_US/kusal/medium/en_US-kusal-medium.onnx",
  "en_US-l2arctic-medium": "en/en_US/l2arctic/medium/en_US-l2arctic-medium.onnx",
  "en_US-lessac-high": "en/en_US/lessac/high/en_US-lessac-high.onnx",
  "en_US-lessac-low": "en/en_US/lessac/low/en_US-lessac-low.onnx",
  "en_US-lessac-medium": "en/en_US/lessac/medium/en_US-lessac-medium.onnx",
  "en_US-libritts-high": "en/en_US/libritts/high/en_US-libritts-high.onnx",
  "en_US-libritts_r-medium": "en/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx",
  "en_US-ljspeech-high": "en/en_US/ljspeech/high/en_US-ljspeech-high.onnx",
  "en_US-ljspeech-medium": "en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx",
  "en_US-ryan-high": "en/en_US/ryan/high/en_US-ryan-high.onnx",
  "en_US-ryan-low": "en/en_US/ryan/low/en_US-ryan-low.onnx",
  "en_US-ryan-medium": "en/en_US/ryan/medium/en_US-ryan-medium.onnx",
  "es_ES-carlfm-x_low": "es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx",
  "es_ES-davefx-medium": "es/es_ES/davefx/medium/es_ES-davefx-medium.onnx",
  "es_ES-mls_10246-low": "es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx",
  "es_ES-mls_9972-low": "es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx",
  "es_ES-sharvard-medium": "es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx",
  "es_MX-ald-medium": "es/es_MX/ald/medium/es_MX-ald-medium.onnx",
  "es_MX-claude-high": "es/es_MX/claude/high/es_MX-claude-high.onnx",
  "fa_IR-amir-medium": "fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx",
  "fa_IR-gyro-medium": "fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx",
  "fi_FI-harri-low": "fi/fi_FI/harri/low/fi_FI-harri-low.onnx",
  "fi_FI-harri-medium": "fi/fi_FI/harri/medium/fi_FI-harri-medium.onnx",
  "fr_FR-gilles-low": "fr/fr_FR/gilles/low/fr_FR-gilles-low.onnx",
  "fr_FR-mls-medium": "fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx",
  "fr_FR-mls_1840-low": "fr/fr_FR/mls_1840/low/fr_FR-mls_1840-low.onnx",
  "fr_FR-siwis-low": "fr/fr_FR/siwis/low/fr_FR-siwis-low.onnx",
  "fr_FR-siwis-medium": "fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx",
  "fr_FR-tom-medium": "fr/fr_FR/tom/medium/fr_FR-tom-medium.onnx",
  "fr_FR-upmc-medium": "fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx",
  "hu_HU-anna-medium": "hu/hu_HU/anna/medium/hu_HU-anna-medium.onnx",
  "hu_HU-berta-medium": "hu/hu_HU/berta/medium/hu_HU-berta-medium.onnx",
  "hu_HU-imre-medium": "hu/hu_HU/imre/medium/hu_HU-imre-medium.onnx",
  "is_IS-bui-medium": "is/is_IS/bui/medium/is_IS-bui-medium.onnx",
  "is_IS-salka-medium": "is/is_IS/salka/medium/is_IS-salka-medium.onnx",
  "is_IS-steinn-medium": "is/is_IS/steinn/medium/is_IS-steinn-medium.onnx",
  "is_IS-ugla-medium": "is/is_IS/ugla/medium/is_IS-ugla-medium.onnx",
  "it_IT-riccardo-x_low": "it/it_IT/riccardo/x_low/it_IT-riccardo-x_low.onnx",
  "ka_GE-natia-medium": "ka/ka_GE/natia/medium/ka_GE-natia-medium.onnx",
  "kk_KZ-iseke-x_low": "kk/kk_KZ/iseke/x_low/kk_KZ-iseke-x_low.onnx",
  "kk_KZ-issai-high": "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx",
  "kk_KZ-raya-x_low": "kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low.onnx",
  "lb_LU-marylux-medium": "lb/lb_LU/marylux/medium/lb_LU-marylux-medium.onnx",
  "ne_NP-google-medium": "ne/ne_NP/google/medium/ne_NP-google-medium.onnx",
  "ne_NP-google-x_low": "ne/ne_NP/google/x_low/ne_NP-google-x_low.onnx",
  "nl_BE-nathalie-medium": "nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium.onnx",
  "nl_BE-nathalie-x_low": "nl/nl_BE/nathalie/x_low/nl_BE-nathalie-x_low.onnx",
  "nl_BE-rdh-medium": "nl/nl_BE/rdh/medium/nl_BE-rdh-medium.onnx",
  "nl_BE-rdh-x_low": "nl/nl_BE/rdh/x_low/nl_BE-rdh-x_low.onnx",
  "nl_NL-mls-medium": "nl/nl_NL/mls/medium/nl_NL-mls-medium.onnx",
  "nl_NL-mls_5809-low": "nl/nl_NL/mls_5809/low/nl_NL-mls_5809-low.onnx",
  "nl_NL-mls_7432-low": "nl/nl_NL/mls_7432/low/nl_NL-mls_7432-low.onnx",
  "no_NO-talesyntese-medium": "no/no_NO/talesyntese/medium/no_NO-talesyntese-medium.onnx",
  "pl_PL-darkman-medium": "pl/pl_PL/darkman/medium/pl_PL-darkman-medium.onnx",
  "pl_PL-gosia-medium": "pl/pl_PL/gosia/medium/pl_PL-gosia-medium.onnx",
  "pl_PL-mc_speech-medium": "pl/pl_PL/mc_speech/medium/pl_PL-mc_speech-medium.onnx",
  "pl_PL-mls_6892-low": "pl/pl_PL/mls_6892/low/pl_PL-mls_6892-low.onnx",
  "pt_BR-edresson-low": "pt/pt_BR/edresson/low/pt_BR-edresson-low.onnx",
  "pt_BR-faber-medium": "pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx",
  "pt_PT-tugão-medium": "pt/pt_PT/tugão/medium/pt_PT-tugão-medium.onnx",
  "ro_RO-mihai-medium": "ro/ro_RO/mihai/medium/ro_RO-mihai-medium.onnx",
  "ru_RU-denis-medium": "ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx",
  "ru_RU-dmitri-medium": "ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx",
  "ru_RU-irina-medium": "ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx",
  "ru_RU-ruslan-medium": "ru/ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx",
  "sk_SK-lili-medium": "sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx",
  "sl_SI-artur-medium": "sl/sl_SI/artur/medium/sl_SI-artur-medium.onnx",
  "sr_RS-serbski_institut-medium": "sr/sr_RS/serbski_institut/medium/sr_RS-serbski_institut-medium.onnx",
  "sv_SE-nst-medium": "sv/sv_SE/nst/medium/sv_SE-nst-medium.onnx",
  "sw_CD-lanfrica-medium": "sw/sw_CD/lanfrica/medium/sw_CD-lanfrica-medium.onnx",
  "tr_TR-dfki-medium": "tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx",
  "tr_TR-fahrettin-medium": "tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx",
  "tr_TR-fettah-medium": "tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx",
  "uk_UA-lada-x_low": "uk/uk_UA/lada/x_low/uk_UA-lada-x_low.onnx",
  "uk_UA-ukrainian_tts-medium": "uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx",
  "vi_VN-25hours_single-low": "vi/vi_VN/25hours_single/low/vi_VN-25hours_single-low.onnx",
  "vi_VN-vais1000-medium": "vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx",
  "vi_VN-vivos-x_low": "vi/vi_VN/vivos/x_low/vi_VN-vivos-x_low.onnx",
  "zh_CN-huayan-medium": "zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx",
  "zh_CN-huayan-x_low": "zh/zh_CN/huayan/x_low/zh_CN-huayan-x_low.onnx",
  // Added by Mintplex Labs - missing or new.
  "cy_GB-gwryw_gogleddol-medium": "cy/cy_GB/gwryw_gogleddol/medium/cy_GB-gwryw_gogleddol-medium.onnx",
  "en_US-bryce-medium": "en/en_US/bryce/medium/en_US-bryce-medium.onnx",
  "en_US-john-medium": "en/en_US/john/medium/en_US-john-medium.onnx",
  "en_US-norman-medium": "en/en_US/norman/medium/en_US-norman-medium.onnx",
  "it_IT-paola-medium": "it/it_IT/paola/medium/it_IT-paola-medium.onnx"
};
async function writeBlob(url, blob) {
  if (!url.match("https://huggingface.co")) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("piper", {
      create: true
    });
    const path = url.split("/").at(-1);
    const file = await dir.getFileHandle(path, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (e) {
    console.error(e);
  }
}
async function removeBlob(url) {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("piper");
    const path = url.split("/").at(-1);
    const file = await dir.getFileHandle(path);
    await file.remove();
  } catch (e) {
    console.error(e);
  }
}
async function readBlob(url) {
  if (!url.match("https://huggingface.co")) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("piper", {
      create: true
    });
    const path = url.split("/").at(-1);
    const file = await dir.getFileHandle(path);
    return await file.getFile();
  } catch (e) {
    return void 0;
  }
}
async function fetchBlob(url, callback) {
  var _a;
  const res = await fetch(url);
  const reader = (_a = res.body) == null ? void 0 : _a.getReader();
  const contentLength = +(res.headers.get("Content-Length") ?? 0);
  let receivedLength = 0;
  let chunks = [];
  while (reader) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    receivedLength += value.length;
    callback == null ? void 0 : callback({
      url,
      total: contentLength,
      loaded: receivedLength
    });
  }
  return new Blob(chunks, { type: res.headers.get("Content-Type") ?? void 0 });
}
function pcm2wav(buffer, numChannels, sampleRate) {
  const bufferLength = buffer.length;
  const headerLength = 44;
  const view = new DataView(new ArrayBuffer(bufferLength * numChannels * 2 + headerLength));
  view.setUint32(0, 1179011410, true);
  view.setUint32(4, view.buffer.byteLength - 8, true);
  view.setUint32(8, 1163280727, true);
  view.setUint32(12, 544501094, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, numChannels * 2 * sampleRate, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 1635017060, true);
  view.setUint32(40, 2 * bufferLength, true);
  let p = headerLength;
  for (let i = 0; i < bufferLength; i++) {
    const v = buffer[i];
    if (v >= 1)
      view.setInt16(p, 32767, true);
    else if (v <= -1)
      view.setInt16(p, -32768, true);
    else
      view.setInt16(p, v * 32768 | 0, true);
    p += 2;
  }
  return view.buffer;
}
// CRITICAL FIX: Use extension URLs for WASM files in Chrome Extensions
// CDN URLs may not work due to CORS/CSP restrictions
const getDefaultWasmPaths = () => {
  console.log('[piper-tts-web.js] getDefaultWasmPaths() called', {
    hasChrome: typeof chrome !== 'undefined',
    hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
    ONNX_BASE,
    WASM_BASE,
    timestamp: new Date().toISOString()
  });

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const extensionBase = chrome.runtime.getURL('lib/');
    const paths = {
      onnxWasm: extensionBase,
      piperData: `${WASM_BASE}.data`,
      piperWasm: `${WASM_BASE}.wasm`
    };
    console.log('[piper-tts-web.js] getDefaultWasmPaths() Chrome Extension:', {
      extensionBase,
      paths,
      piperDataFull: paths.piperData,
      piperWasmFull: paths.piperWasm
    });
    return paths;
  }
  const paths = {
    onnxWasm: ONNX_BASE,
    piperData: `${WASM_BASE}.data`,
    piperWasm: `${WASM_BASE}.wasm`
  };
  console.log('[piper-tts-web.js] getDefaultWasmPaths() Standard:', paths);
  return paths;
};
const DEFAULT_WASM_PATHS = getDefaultWasmPaths();
const _TtsSession = class _TtsSession {
  constructor({
    voiceId,
    progress,
    logger,
    wasmPaths
  }) {
    __publicField(this, "ready", false);
    __publicField(this, "voiceId", "en_US-hfc_female-medium");
    __publicField(this, "waitReady", false);
    __privateAdd(this, _createPiperPhonemize);
    __privateAdd(this, _modelConfig);
    __privateAdd(this, _ort);
    __privateAdd(this, _ortSession);
    __privateAdd(this, _progressCallback);
    __privateAdd(this, _wasmPaths, DEFAULT_WASM_PATHS);
    // @ts-ignore-next-line
    __privateAdd(this, _logger);
    var _a;
    if (_TtsSession._instance) {
      logger == null ? void 0 : logger("Reusing session for TTS!");
      _TtsSession._instance.voiceId = voiceId ?? _TtsSession._instance.voiceId;
      __privateSet(_TtsSession._instance, _progressCallback, progress ?? __privateGet(_TtsSession._instance, _progressCallback));
      return _TtsSession._instance;
    }
    logger == null ? void 0 : logger("New session");
    __privateSet(this, _logger, logger);
    this.voiceId = voiceId;
    __privateSet(this, _progressCallback, progress);
    this.waitReady = this.init();
    __privateSet(this, _wasmPaths, wasmPaths ?? DEFAULT_WASM_PATHS);
    (_a = __privateGet(this, _logger)) == null ? void 0 : _a.call(this, `Loaded WASMPaths at: ${JSON.stringify(__privateGet(this, _wasmPaths))}`);
    _TtsSession._instance = this;
    return this;
  }
  static async create(options) {
    const session = new _TtsSession(options);
    await session.waitReady;
    return session;
  }
  async init() {
    console.log('[piper-tts-web.js] ========== TtsSession.init() START ==========', {
      timestamp: new Date().toISOString(),
      hasChrome: typeof chrome !== 'undefined',
      hasChromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
      location: typeof location !== 'undefined' ? location.href : 'N/A'
    });

    console.log('[piper-tts-web.js] STEP 1: About to import ./piper-o91UDS6e.js...');
    try {
      const { createPiperPhonemize } = await import("./piper-o91UDS6e.js");
      console.log('[piper-tts-web.js] ✅ STEP 1 SUCCESS: piper-o91UDS6e.js imported', {
        hasCreatePiperPhonemize: typeof createPiperPhonemize === 'function'
      });
      __privateSet(this, _createPiperPhonemize, createPiperPhonemize);
    } catch (piperImportError) {
      console.error('[piper-tts-web.js] ❌ STEP 1 FAILED: piper-o91UDS6e.js import error', {
        error: piperImportError.message,
        stack: piperImportError.stack,
        name: piperImportError.name
      });
      throw piperImportError;
    }

    // CRITICAL FIX: Use full extension URL instead of bare module specifier
    // This fixes "Failed to resolve module specifier 'onnxruntime-web'" in Chrome Extensions
    // CRITICAL: Use ort.wasm.min.mjs (WASM backend)
    // Note: ort.wasm.bundle.min.mjs doesn't exist - use ort.wasm.min.mjs instead
    const onnxUrl = typeof chrome !== 'undefined' && chrome.runtime
      ? chrome.runtime.getURL('lib/ort.wasm.min.mjs')
      : 'onnxruntime-web';
    console.log('[piper-tts-web.js] STEP 2: About to import ONNX Runtime...', {
      onnxUrl,
      fullUrl: onnxUrl,
      isExtensionUrl: onnxUrl.startsWith('chrome-extension://'),
      isAbsoluteUrl: onnxUrl.startsWith('http') || onnxUrl.startsWith('chrome-extension://'),
      urlLength: onnxUrl.length,
      timestamp: new Date().toISOString()
    });

    try {
      __privateSet(this, _ort, await import(onnxUrl));
      console.log('[piper-tts-web.js] ✅ STEP 2 SUCCESS: ONNX Runtime loaded', {
        version: __privateGet(this, _ort).version,
        hasEnv: !!__privateGet(this, _ort).env,
        hasWasm: !!__privateGet(this, _ort).env?.wasm,
        hasInferenceSession: typeof __privateGet(this, _ort).InferenceSession !== 'undefined',
        ortKeys: Object.keys(__privateGet(this, _ort)).slice(0, 10),
        timestamp: new Date().toISOString()
      });
    } catch (onnxImportError) {
      console.error('[piper-tts-web.js] ❌ STEP 2 FAILED: ONNX Runtime import error', {
        error: onnxImportError.message,
        stack: onnxImportError.stack,
        name: onnxImportError.name,
        onnxUrl,
        attemptedUrl: onnxUrl,
        timestamp: new Date().toISOString(),
        '== THIS IS THE CRITICAL ERROR ==': 'If you see this, ONNX Runtime failed to load'
      });
      throw onnxImportError;
    }
    
    __privateGet(this, _ort).env.allowLocalModels = false;
    
    // CRITICAL FIX: Configure ONNX Runtime for Chrome Extension Offscreen Documents
    // Based on Perplexity's research: DO NOT pre-load WASM binary in 1.19.0+
    // Pre-loading causes Emscripten module loader incompatibility
    // Instead, use wasmPaths and let ONNX Runtime load WASM itself
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      console.log('[piper-tts-web.js] STEP 3: Configuring ONNX Runtime for Chrome Extension...');

      // Set WASM paths FIRST - ONNX Runtime will load WASM automatically
      // CRITICAL: Use non-threaded WASM files (ort-wasm-simd.wasm, not ort-wasm-simd-threaded.wasm)
      const extensionBase = chrome.runtime.getURL('lib/');
      console.log('[piper-tts-web.js] STEP 3a: Extension base path:', {
        extensionBase,
        currentWasmPaths: __privateGet(this, _ort).env.wasm.wasmPaths,
        currentNumThreads: __privateGet(this, _ort).env.wasm.numThreads,
        currentProxy: __privateGet(this, _ort).env.wasm.proxy,
        currentSimd: __privateGet(this, _ort).env.wasm.simd
      });

      __privateGet(this, _ort).env.wasm.wasmPaths = extensionBase;
      console.log('[piper-tts-web.js] STEP 3b: wasmPaths set to:', {
        newWasmPaths: __privateGet(this, _ort).env.wasm.wasmPaths,
        isString: typeof __privateGet(this, _ort).env.wasm.wasmPaths === 'string'
      });
      
      // Single-threaded mode (Workers unavailable in offscreen documents)
      // CRITICAL: Use numThreads=1 - this is required for offscreen documents
      // Even with ort.bundle.min.mjs, we must use single-threaded mode
      __privateGet(this, _ort).env.wasm.numThreads = 1;
      // Disable proxy (requires Workers)
      __privateGet(this, _ort).env.wasm.proxy = false;
      // CRITICAL: Try with simd=false first - bundle may include non-threaded WASM
      // If this fails, we'll need to investigate further
      __privateGet(this, _ort).env.wasm.simd = false;
      
      // CRITICAL: DO NOT set wasmBinary - let ONNX Runtime load it via wasmPaths
      // Pre-loading causes "TypeError: d is not a function" in 1.19.0+ due to
      // Emscripten module loader incompatibility
      console.log('[ClipAIble Piper TTS] ONNX Runtime configured (no pre-loading)', {
        wasmPaths: extensionBase,
        numThreads: __privateGet(this, _ort).env.wasm.numThreads,
        simd: __privateGet(this, _ort).env.wasm.simd,
        proxy: __privateGet(this, _ort).env.wasm.proxy,
        version: __privateGet(this, _ort).version || 'unknown'
      });
    } else {
      // Regular web context - use default settings
      __privateGet(this, _ort).env.wasm.numThreads = navigator.hardwareConcurrency;
      __privateGet(this, _ort).env.wasm.wasmPaths = __privateGet(this, _wasmPaths).onnxWasm;
    }
    const path = PATH_MAP[this.voiceId];
    const modelConfigBlob = await getBlob(`${HF_BASE}/${path}.json`);
    __privateSet(this, _modelConfig, JSON.parse(await modelConfigBlob.text()));
    const modelBlob = await getBlob(
      `${HF_BASE}/${path}`,
      __privateGet(this, _progressCallback)
    );
    
    // CRITICAL: Log ONNX Runtime state before creating InferenceSession
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      console.log('[ClipAIble Piper TTS] ONNX Runtime state before InferenceSession.create', {
        hasOrt: !!__privateGet(this, _ort),
        hasInferenceSession: typeof __privateGet(this, _ort).InferenceSession !== 'undefined',
        numThreads: __privateGet(this, _ort).env?.wasm?.numThreads,
        wasmPaths: __privateGet(this, _ort).env?.wasm?.wasmPaths,
        simd: __privateGet(this, _ort).env?.wasm?.simd,
        proxy: __privateGet(this, _ort).env?.wasm?.proxy,
        version: __privateGet(this, _ort).version || 'unknown',
        note: 'WASM will be loaded automatically via wasmPaths (no pre-loading)'
      });
    }
    
    // CRITICAL: Initialize WASM before creating InferenceSession
    // ONNX Runtime needs WASM to be initialized before it can process models
    try {
      const modelArrayBuffer = await modelBlob.arrayBuffer();
      console.log('[ClipAIble Piper TTS] Model loaded, size:', {
        sizeBytes: modelArrayBuffer.byteLength,
        sizeMB: (modelArrayBuffer.byteLength / 1024 / 1024).toFixed(2),
        hasData: modelArrayBuffer.byteLength > 0
      });
      
      // CRITICAL: Ensure WASM is initialized before creating session
      // This is required for ONNX Runtime to process models correctly
      if (__privateGet(this, _ort).env?.wasm && !__privateGet(this, _ort).env.wasm.initialized) {
        console.log('[ClipAIble Piper TTS] Initializing ONNX Runtime WASM...');
        // ONNX Runtime will initialize WASM automatically on first InferenceSession.create
        // But we can explicitly check if it's ready
      }
      
      console.log('[ClipAIble Piper TTS] Creating InferenceSession...');
      __privateSet(this, _ortSession, await __privateGet(this, _ort).InferenceSession.create(
        modelArrayBuffer
      ));
      console.log('[ClipAIble Piper TTS] InferenceSession created successfully');
    } catch (sessionError) {
      console.error('[ClipAIble Piper TTS] Failed to create InferenceSession', {
        error: sessionError.message,
        stack: sessionError.stack,
        modelSize: modelBlob.size,
        hasOrt: !!__privateGet(this, _ort),
        ortVersion: __privateGet(this, _ort)?.version,
        wasmConfig: {
          numThreads: __privateGet(this, _ort)?.env?.wasm?.numThreads,
          simd: __privateGet(this, _ort)?.env?.wasm?.simd,
          proxy: __privateGet(this, _ort)?.env?.wasm?.proxy,
          wasmPaths: __privateGet(this, _ort)?.env?.wasm?.wasmPaths
        }
      });
      throw sessionError;
    }
  }
  async predict(text) {
    await this.waitReady;
    const input = JSON.stringify([{ text: text.trim() }]);
    const phonemeIds = await new Promise(async (resolve) => {
      const module = await __privateGet(this, _createPiperPhonemize).call(this, {
        print: (data) => {
          resolve(JSON.parse(data).phoneme_ids);
        },
        printErr: (message) => {
          throw new Error(message);
        },
        locateFile: (url) => {
          if (url.endsWith(".wasm")) return __privateGet(this, _wasmPaths).piperWasm;
          if (url.endsWith(".data")) return __privateGet(this, _wasmPaths).piperData;
          return url;
        }
      });
      module.callMain([
        "-l",
        __privateGet(this, _modelConfig).espeak.voice,
        "--input",
        input,
        "--espeak_data",
        "/espeak-ng-data"
      ]);
    });
    const speakerId = 0;
    const sampleRate = __privateGet(this, _modelConfig).audio.sample_rate;
    const noiseScale = __privateGet(this, _modelConfig).inference.noise_scale;
    const lengthScale = __privateGet(this, _modelConfig).inference.length_scale;
    const noiseW = __privateGet(this, _modelConfig).inference.noise_w;
    const session = __privateGet(this, _ortSession);
    const feeds = {
      input: new (__privateGet(this, _ort)).Tensor("int64", phonemeIds, [1, phonemeIds.length]),
      input_lengths: new (__privateGet(this, _ort)).Tensor("int64", [phonemeIds.length]),
      scales: new (__privateGet(this, _ort)).Tensor("float32", [
        noiseScale,
        lengthScale,
        noiseW
      ])
    };
    if (Object.keys(__privateGet(this, _modelConfig).speaker_id_map).length) {
      Object.assign(feeds, {
        sid: new (__privateGet(this, _ort)).Tensor("int64", [speakerId])
      });
    }
    const {
      output: { data: pcm }
    } = await session.run(feeds);
    return new Blob([pcm2wav(pcm, 1, sampleRate)], {
      type: "audio/x-wav"
    });
  }
};
_createPiperPhonemize = new WeakMap();
_modelConfig = new WeakMap();
_ort = new WeakMap();
_ortSession = new WeakMap();
_progressCallback = new WeakMap();
_wasmPaths = new WeakMap();
_logger = new WeakMap();
__publicField(_TtsSession, "WASM_LOCATIONS", DEFAULT_WASM_PATHS);
__publicField(_TtsSession, "_instance", null);
let TtsSession = _TtsSession;
async function predict(config, callback) {
  const session = new TtsSession({
    voiceId: config.voiceId,
    progress: callback
  });
  return session.predict(config.text);
}
async function getBlob(url, callback) {
  let blob = await readBlob(url);
  if (!blob) {
    blob = await fetchBlob(url, callback);
    await writeBlob(url, blob);
  }
  return blob;
}
async function download(voiceId, callback) {
  const path = PATH_MAP[voiceId];
  const urls = [`${HF_BASE}/${path}`, `${HF_BASE}/${path}.json`];
  await Promise.all(urls.map(async (url) => {
    writeBlob(url, await fetchBlob(url, url.endsWith(".onnx") ? callback : void 0));
  }));
}
async function remove(voiceId) {
  const path = PATH_MAP[voiceId];
  const urls = [`${HF_BASE}/${path}`, `${HF_BASE}/${path}.json`];
  await Promise.all(urls.map((url) => removeBlob(url)));
}
async function stored() {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("piper", {
    create: true
  });
  const result = [];
  for await (const name of dir.keys()) {
    const key = name.split(".")[0];
    if (name.endsWith(".onnx") && key in PATH_MAP) {
      result.push(key);
    }
  }
  return result;
}
async function flush() {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("piper");
    await dir.remove({ recursive: true });
  } catch (e) {
    console.error(e);
  }
}
async function voices() {
  try {
    const res = await fetch(`${HF_BASE}/voices.json`);
    if (!res.ok) throw new Error("Could not retrieve voices file from huggingface");
    return Object.values(await res.json());
  } catch {
    const LOCAL_VOICES_JSON = await import("./voices_static-D_OtJDHM.js");
    console.log(`Could not fetch voices.json remote ${HF_BASE}. Fetching local`);
    return Object.values(LOCAL_VOICES_JSON.default);
  }
}
export {
  HF_BASE,
  ONNX_BASE,
  PATH_MAP,
  TtsSession,
  WASM_BASE,
  download,
  flush,
  predict,
  remove,
  stored,
  voices
};
