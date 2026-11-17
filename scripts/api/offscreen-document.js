// Serialize offscreen document transitions and message admission.
let pending = Promise.resolve();

export function withOffscreenDocumentLock(operation) {
  const result = pending.then(operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
