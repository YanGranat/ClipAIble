// @ts-check

/** Adapt the supported Piper SDK source to packaged extension resources. */
export function patchPiperTtsSource(source, filename) {
  if (!filename.replace(/\\/g, '/').endsWith('/piper-tts-web.js')) {
    return source.replace(/require\(["'](?:fs|path)["']\)/g, 'undefined');
  }
  const replaceOnce = (pattern, replacement, contract) => {
    const matches = source.match(new RegExp(pattern.source, 'g')) || [];
    if (matches.length !== 1) throw new Error(`Unsupported Piper SDK: ${contract} (${matches.length} matches)`);
    source = source.replace(pattern, replacement);
  };
  if (!/const DEFAULT_WASM_PATHS = \{\s*onnxWasm: ONNX_BASE,\s*piperData: `\$\{WASM_BASE\}\.data`,\s*piperWasm: `\$\{WASM_BASE\}\.wasm`\s*\};/.test(source)) {
    throw new Error('Unsupported Piper SDK: default WASM path object');
  }
  if ((source.match(/const\s*\{\s*createPiperPhonemize\s*\}\s*=\s*await import\(["']\.\/piper-o91UDS6e\.js["']\)/g) || []).length !== 1) {
    throw new Error('Unsupported Piper SDK: phonemizer factory import');
  }
  replaceOnce(/const ONNX_BASE = "https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/onnxruntime-web\/1\.18\.0\/";/,
    'const ONNX_BASE = self.location.origin + "/lib/";', 'ONNX base');
  replaceOnce(/const WASM_BASE = "https:\/\/cdn\.jsdelivr\.net\/npm\/@diffusionstudio\/piper-wasm@1\.0\.0\/build\/piper_phonemize";/,
    'const WASM_BASE = self.location.origin + "/lib/piper-wasm/piper_phonemize";', 'phonemizer base');
  replaceOnce(/await import\("onnxruntime-web"\)/,
    '(self.onnxruntime || self.ort)', 'global ONNX runtime');
  replaceOnce(/\.env\.wasm\.numThreads = navigator\.hardwareConcurrency;/,
    '.env.wasm.numThreads = 1;', 'single-thread execution');
  replaceOnce(/\.InferenceSession\.create\(\s*await modelBlob\.arrayBuffer\(\)\s*\)/,
    '.InferenceSession.create(await modelBlob.arrayBuffer(), { executionProviders: ["wasm"] })', 'WASM execution provider');
  replaceOnce(/async predict\(text\) \{/,
    'async predict(text, speed = 1) { if (!Number.isFinite(speed) || speed <= 0) throw new Error("Invalid speech speed");', 'speed input');
  replaceOnce(/const lengthScale = __privateGet\(this, _modelConfig\)\.inference\.length_scale;/,
    'const lengthScale = __privateGet(this, _modelConfig).inference.length_scale / speed;', 'duration scale');
  replaceOnce(/return session\.predict\(config\.text\);/,
    'return session.predict(config.text, config.speed);', 'speed forwarding');
  replaceOnce(/async function fetchBlob\(url, callback\) \{[\s\S]*?\n\}(?=\nfunction pcm2wav)/,
    fetchPiperBlob.toString().replace('fetchPiperBlob', 'fetchBlob'), 'download response validation');
  replaceOnce(/    const file = await dir\.getFileHandle\(path\);\s*await file\.remove\(\);/,
    '    await dir.removeEntry(path);', 'portable cache removal');
  replaceOnce(/async function writeBlob\(url, blob\) \{[\s\S]*?\n\}(?=\nasync function removeBlob)/,
    writePiperBlob.toString().replace('writePiperBlob', 'writeBlob'), 'awaited cache persistence');
  replaceOnce(/    const modelBlob = await getBlob\([\s\S]*?__privateSet\(this, _ortSession, await __privateGet\(this, _ort\)\.InferenceSession\.create\(await modelBlob\.arrayBuffer\(\), \{ executionProviders: \["wasm"\] \}\)\);/,
    `    const modelUrl = \`\${HF_BASE}/\${path}\`;
    const cachedModel = await readBlob(modelUrl);
    const modelBlob = cachedModel || await fetchBlob(modelUrl, __privateGet(this, _progressCallback));
    let modelSession;
    try {
      modelSession = await __privateGet(this, _ort).InferenceSession.create(await modelBlob.arrayBuffer(), { executionProviders: ["wasm"] });
      if (!cachedModel) await writeBlob(modelUrl, modelBlob);
    } catch (error) {
      await modelSession?.release();
      await removeBlob(modelUrl);
      throw error;
    }
    __privateSet(this, _ortSession, modelSession);`, 'validated model cache commit');
  replaceOnce(/async function getBlob\(url, callback\) \{[\s\S]*?\n\}(?=\nasync function download)/,
    getPiperBlob.toString().replace('getPiperBlob', 'getBlob'), 'configuration cache validation');
  replaceOnce(/async function download\(voiceId, callback\) \{[\s\S]*?\n\}(?=\nasync function remove)/,
    downloadPiperVoice.toString().replace('downloadPiperVoice', 'download'), 'validated download admission');
  source += '\n' + validatePiperConfig.toString() + '\n';
  return source;
}

async function fetchPiperBlob(url, callback) {
  const response = await fetch(url);
  if (!response.ok || response.status === 206) throw new Error(`Speech model download failed (HTTP ${response.status})`);
  if (!response.body) throw new Error('Speech model download is empty');
  const reader = response.body.getReader();
  const total = Number(response.headers.get('Content-Length')) || 0;
  let loaded = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      chunks.push(value);
      callback?.({ url, total, loaded });
    }
  } finally { reader.releaseLock(); }
  if (!loaded) throw new Error('Speech model download is empty');
  const encoding = response.headers.get('Content-Encoding');
  if (total && (!encoding || encoding === 'identity') && response.type !== 'cors' && loaded !== total) {
    throw new Error('Speech model download is incomplete');
  }
  return new Blob(chunks, { type: response.headers.get('Content-Type') || 'application/octet-stream' });
}

async function writePiperBlob(url, blob) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('piper', { create: true });
  const file = await dir.getFileHandle(url.split('/').at(-1), { create: true });
  const writable = await file.createWritable();
  try { await writable.write(blob); await writable.close(); }
  catch (error) { await writable.abort?.().catch(() => {}); throw error; }
}

function validatePiperConfig(value) {
  const config = JSON.parse(value);
  if (typeof config.espeak?.voice !== 'string' || !config.espeak.voice ||
      !Number.isFinite(config.audio?.sample_rate) || config.audio.sample_rate <= 0 ||
      !['noise_scale', 'length_scale', 'noise_w'].every(name => Number.isFinite(config.inference?.[name])) ||
      !config.speaker_id_map || typeof config.speaker_id_map !== 'object') throw new Error('Invalid speech model configuration');
  return config;
}

async function getPiperBlob(url, callback) {
  const cached = await readBlob(url);
  let blob = cached;
  try {
    if (!blob) blob = await fetchBlob(url, callback);
    if (url.endsWith('.json')) validatePiperConfig(await blob.text());
    if (!cached) await writeBlob(url, blob);
    return blob;
  } catch (error) { if (cached) await removeBlob(url); throw error; }
}

async function downloadPiperVoice(voiceId, callback) {
  const path = PATH_MAP[voiceId];
  if (!path) throw new Error('Unknown speech model');
  const modelUrl = `${HF_BASE}/${path}`;
  const configUrl = `${modelUrl}.json`;
  const [model, config] = await Promise.all([fetchBlob(modelUrl, callback), fetchBlob(configUrl)]);
  validatePiperConfig(await config.text());
  const runtime = self.onnxruntime || self.ort;
  runtime.env.wasm.numThreads = 1;
  runtime.env.wasm.wasmPaths = DEFAULT_WASM_PATHS.onnxWasm;
  const session = await runtime.InferenceSession.create(await model.arrayBuffer(), { executionProviders: ['wasm'] });
  await session.release();
  const writes = await Promise.allSettled([writeBlob(modelUrl, model), writeBlob(configUrl, config)]);
  const failed = writes.find(result => result.status === 'rejected');
  if (failed) { await Promise.all([removeBlob(modelUrl), removeBlob(configUrl)]); throw failed.reason; }
}

/** Expose the packaged phonemizer factory to the browser SDK. */
export function patchPiperPhonemizerSource(source) {
  const trailer = /if \(typeof exports === 'object' && typeof module === 'object'\)\s*module\.exports = createPiperPhonemize;\s*else if \(typeof define === 'function' && define\['amd'\]\)\s*define\(\[\], \(\) => createPiperPhonemize\);\s*$/;
  if (!/var createPiperPhonemize\s*=/.test(source) || !trailer.test(source)) {
    throw new Error('Unsupported Piper phonemizer module');
  }
  return source.replace(trailer, '').replace(/require\(["'](?:fs|path)["']\)/g, 'undefined') + '\nexport { createPiperPhonemize };\n';
}
