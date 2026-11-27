// @ts-check
import { SUPERTONIC_DOWNLOAD_BYTES, SUPERTONIC_MODEL_STATUS_KEY, SUPERTONIC_MAX_INPUT, SUPERTONIC_MIN_SPEED, SUPERTONIC_MAX_SPEED, resolveSupertonicVoice } from '../../api/supertonic-config.js';
import { isSupertonicInstalled, installSupertonicAssets, deleteSupertonicAssets } from './assets.js';
import { putDownload, removeDownload } from '../../api/download-storage.js';

const total = SUPERTONIC_DOWNLOAD_BYTES;
let modelJob;
let synthesis;
let worker;
let releaseTimer;
let statusWrites = Promise.resolve();

function announce(state, loaded = 0) {
  const status = { state, loaded, total };
  statusWrites = statusWrites.then(() => chrome.runtime.sendMessage({ target: SUPERTONIC_MODEL_STATUS_KEY, status })).catch(() => {});
  return status;
}

function dropWorker() {
  clearTimeout(releaseTimer);
  worker?.terminate();
  worker = undefined;
}

async function runDownload(job) {
  let lastUpdate = 0;
  try {
    if (!await isSupertonicInstalled()) {
      await installSupertonicAssets(job.abort.signal, loaded => {
        if (performance.now() - lastUpdate < 250) return;
        lastUpdate = performance.now();
        job.status = announce('downloading', loaded);
      });
    }
    job.status = announce('ready', total);
  } catch (error) {
    if (job.abort.signal.aborted) {
      try { await deleteSupertonicAssets(); job.status = announce('missing'); }
      catch { job.status = announce('error'); }
    } else {
      console.warn('Supertonic model download failed', error instanceof Error ? error.name : 'UnknownError');
      job.status = announce('error');
    }
  } finally {
    modelJob = undefined;
  }
}

async function handleModelAction(action) {
  if (action === 'cancel') {
    modelJob?.abort?.abort();
    return { ok: true, status: modelJob?.status ?? { state: await isSupertonicInstalled() ? 'ready' : 'missing', total } };
  }
  if (modelJob) return { ok: true, status: modelJob.status };
  if (synthesis) return { ok: false, key: 'supertonicBusy' };
  if (action === 'download') {
    const job = { abort: new AbortController(), status: announce('downloading') };
    modelJob = job;
    void runDownload(job);
    return { ok: true, status: job.status };
  }
  if (action === 'delete') {
    modelJob = { status: announce('deleting') };
    dropWorker();
    try {
      await deleteSupertonicAssets();
      const status = announce('missing');
      await statusWrites;
      return { ok: true, status };
    } catch {
      const retained = await isSupertonicInstalled().catch(() => false);
      announce(retained ? 'ready' : 'error', retained ? total : 0);
      return { ok: false, key: 'supertonicOperationFailed' };
    } finally { modelJob = undefined; }
  }
  return { ok: false, key: 'supertonicOperationFailed' };
}

function synthesizeOnWorker(data, signal) {
  clearTimeout(releaseTimer);
  worker ??= new Worker(chrome.runtime.getURL('scripts/offscreen/supertonic/worker.js'));
  const active = worker;
  return new Promise((resolve, reject) => {
    function finish(error, audio) {
      active.removeEventListener('message', receive);
      active.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
      if (error) { dropWorker(); reject(error); }
      else {
        releaseTimer = setTimeout(dropWorker, 15_000);
        resolve(audio);
      }
    }
    const receive = ({ data: reply }) => {
      if (reply?.id !== data.id) return;
      if (reply.audio instanceof ArrayBuffer) finish(null, reply.audio);
      else failed();
    };
    const failed = () => finish(new Error('Supertonic worker failed'), undefined);
    const cancelled = () => finish(signal.reason, undefined);
    active.addEventListener('message', receive);
    active.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', cancelled, { once: true });
    const speed = Number.isFinite(data.speed) ? Math.max(SUPERTONIC_MIN_SPEED, Math.min(SUPERTONIC_MAX_SPEED, data.speed)) : 1;
    try { active.postMessage({ ...data, speed, voice: resolveSupertonicVoice(data.voice) }); }
    catch { failed(); }
  });
}

async function handleSynthesis(data) {
  if (!/^[a-f\d-]{36}$/i.test(data?.id) || typeof data?.text !== 'string' || !data.text.trim() || data.text.length > SUPERTONIC_MAX_INPUT) return { ok: false, key: 'supertonicSynthesisFailed' };
  if (modelJob || synthesis) return { ok: false, key: 'supertonicBusy' };
  const task = { id: data.id, abort: new AbortController() };
  synthesis = task;
  try {
    if (!await isSupertonicInstalled()) return { ok: false, key: 'supertonicDownloadRequired' };
    task.abort.signal.throwIfAborted();
    const audio = await synthesizeOnWorker(data, task.abort.signal);
    task.abort.signal.throwIfAborted();
    await putDownload(data.id, { processingRunId: data.processingRunId, blob: new Blob([audio], { type: 'audio/wav' }), expiresAt: Date.now() + 180_000 });
    if (task.abort.signal.aborted) {
      await removeDownload(data.id);
      return { ok: false };
    }
    return { ok: true };
  } catch { return { ok: false, key: 'supertonicSynthesisFailed' }; }
  finally { synthesis = undefined; }
}

export async function routeSupertonicMessage(type, data) {
  if (type === 'SUPERTONIC_STATUS') return { ok: true, status: modelJob?.status ?? null };
  if (type === 'SUPERTONIC_MODEL') return handleModelAction(data?.action);
  if (type === 'SUPERTONIC_SYNTHESIZE') return handleSynthesis(data);
  if (type === 'SUPERTONIC_CANCEL') {
    if (synthesis?.id === data?.id) synthesis.abort.abort();
    return { ok: true };
  }
  return { ok: false };
}
