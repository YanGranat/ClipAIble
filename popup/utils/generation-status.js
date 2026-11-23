// @ts-check

/** Prevent pending status reads from restoring a result dismissed in this popup. */
export function createGenerationResultGuard() {
  let dismissal = 0;
  let pendingRemovals = 0;
  return {
    capture() {
      const initialDismissal = dismissal;
      const removalPending = pendingRemovals > 0;
      return () => !removalPending && initialDismissal === dismissal;
    },
    async clear(keys) {
      dismissal++;
      pendingRemovals++;
      try {
        await chrome.storage.local.remove(keys);
      } finally {
        pendingRemovals--;
      }
    }
  };
}

/** Acknowledge an independent generation failure once across popup instances. */
export function createGenerationErrorPresenter(prefix, showToast, logWarn) {
  let presented = null;
  return async function presentGenerationError(stored) {
    if (stored[`${prefix}_generating`] || !stored[`${prefix}_error`]) return false;
    const message = stored[`${prefix}_error`];
    const token = JSON.stringify([stored[`${prefix}_generation_id`] || null, message]);
    const keys = ['generating', 'generation_id', 'error', 'error_seen'].map(key => `${prefix}_${key}`);
    const currentToken = value => value[`${prefix}_generating`] || !value[`${prefix}_error`]
      ? null : JSON.stringify([value[`${prefix}_generation_id`] || null, value[`${prefix}_error`]]);
    const present = async () => {
      const current = await chrome.storage.local.get(keys);
      if (currentToken(current) !== token) return null;
      if (current[`${prefix}_error_seen`] !== token && presented !== token) {
        presented = token;
        try { await chrome.storage.local.set({ [`${prefix}_error_seen`]: token }); }
        catch (error) { logWarn('Failed to acknowledge generation error', error); }
        if (currentToken(await chrome.storage.local.get(keys)) !== token) return null;
        const translation = stored[`${prefix}_error_translation`];
        if (translation) showToast(message, 'error', translation);
        else showToast(message, 'error');
      }
      return true;
    };
    return globalThis.navigator?.locks?.request
      ? navigator.locks.request(`clipaible-${prefix}-error-presentation`, present)
      : present();
  };
}
