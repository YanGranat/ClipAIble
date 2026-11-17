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
  return source;
}
