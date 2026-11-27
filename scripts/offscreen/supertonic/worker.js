// @ts-check

const workerScope = /** @type {typeof globalThis & {importScripts: (...urls: string[]) => void, ort: typeof import('onnxruntime-web')}} */ (globalThis);
let engine;

workerScope.addEventListener('message', async ({ data }) => {
  try {
    if (!engine) {
      const library = new URL('../../../lib/', location.href);
      workerScope.importScripts(new URL('ort.wasm.min.js', library).href);
      const ort = workerScope.ort;
      ort.env.wasm.wasmPaths = library.href;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const { createSupertonicEngine } = await import('./engine.js');
      const { readSupertonicAsset } = await import('./assets.js');
      engine = await createSupertonicEngine(ort, { get: readSupertonicAsset });
    }
    const audio = await engine.synthesize(data.text, { lang: data.language, voice: data.voice, speed: data.speed });
    workerScope.postMessage({ id: data.id, audio }, { transfer: [audio] });
  } catch {
    workerScope.postMessage({ id: data.id, failed: true });
  }
});
