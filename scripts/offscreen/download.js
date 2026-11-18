// @ts-check
import { getDownload, removeDownload } from '../api/download-storage.js';
const urls = new Map();
export async function handleDownloadMessage(type, data) {
  const { operationId, processingRunId = null } = data || {};
  if (!/^[a-f\d-]{36}$/i.test(operationId)) throw new Error('Invalid download operation');
  const current = urls.get(operationId);
  if (type === 'RELEASE_DOWNLOAD_URL') {
    if (current && current.processingRunId === processingRunId) {
      clearTimeout(current.timer); if (current.url) URL.revokeObjectURL(current.url); urls.delete(operationId);
    }
    return { success: true };
  }
  if (current?.url) return { success: true, url: current.url };
  const pending = { processingRunId, url: null, timer: null };
  urls.set(operationId, pending);
  const job = await getDownload(operationId);
  if (urls.get(operationId) !== pending || !job || job.processingRunId !== processingRunId || !(job.blob instanceof Blob) || !(job.expiresAt > Date.now())) {
    if (urls.get(operationId) === pending) urls.delete(operationId);
    throw new Error('Download bytes unavailable');
  }
  const url = URL.createObjectURL(job.blob);
  const timer = setTimeout(() => {
    URL.revokeObjectURL(url); urls.delete(operationId); void removeDownload(operationId).catch(() => {});
  }, job.expiresAt - Date.now());
  urls.set(operationId, { url, timer, processingRunId });
  return { success: true, url };
}
