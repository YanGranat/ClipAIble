// @ts-check

import { SUPERTONIC_DOWNLOAD_BYTES, SUPERTONIC_MODEL_STATUS_KEY } from '../../scripts/api/supertonic-config.js';
import { changeSupertonicModel, getSupertonicModelStatus } from '../../scripts/api/supertonic-model.js';
import { getLocaleTag, tSync } from '../../scripts/locales.js';

const modelViews = {
  checking: { status: 'supertonicModelChecking' },
  missing: { status: 'supertonicModelMissing', action: 'download', label: 'supertonicDownloadModel' },
  downloading: { status: 'supertonicModelDownloading', action: 'cancel', label: 'cancel' },
  ready: { status: 'supertonicModelReady', action: 'delete', label: 'supertonicRemoveModel' },
  deleting: { status: 'supertonicModelDeleting' },
  error: { status: 'supertonicOperationFailed', action: 'download', label: 'supertonicRetryDownload' },
  unavailable: { status: 'supertonicModelStatusUnavailable', action: 'refresh', label: 'supertonicCheckAgain' }
};

/** @param {HTMLElement|null|undefined} group */
export function initSupertonicControls(group) {
  if (!group) return { setActive() {}, refreshLocalization() {} };
  const statusText = group.querySelector('#supertonicModelStatus');
  const progressRow = /** @type {HTMLElement} */ (group.querySelector('#supertonicModelProgressRow'));
  const progress = /** @type {HTMLProgressElement} */ (group.querySelector('#supertonicModelProgress'));
  const progressText = group.querySelector('#supertonicModelProgressText');
  const button = /** @type {HTMLButtonElement} */ (group.querySelector('#supertonicModelAction'));

  let active = false;
  let version = 0;
  let pending = false;
  let deleteError = null;
  let snapshot = { state: 'checking', loaded: 0, total: 0 };

  function setText(element, key, params = {}) {
    if (element.dataset.i18n !== key) element.dataset.i18n = key;
    const serialized = JSON.stringify(params);
    if (element.dataset.i18nParams !== serialized) element.dataset.i18nParams = serialized;
    const value = tSync(key, group.ownerDocument.documentElement.lang, params);
    if (element.textContent !== value) element.textContent = value;
  }

  function render() {
    const view = modelViews[snapshot.state];
    setText(statusText, deleteError ?? view.status);
    button.hidden = !view.action;
    button.disabled = pending;
    if (view.label) setText(button, view.label, view.label === 'supertonicDownloadModel'
      ? { size: Math.round(SUPERTONIC_DOWNLOAD_BYTES / 1_000_000) } : {});

    progressRow.hidden = snapshot.state !== 'downloading';
    if (progressRow.hidden) return;
    if (snapshot.total <= 0) {
      progress.removeAttribute('value');
      progressText.textContent = '';
      return;
    }
    progress.max = snapshot.total;
    progress.value = Math.min(snapshot.loaded, snapshot.total);
    const language = getLocaleTag(group.ownerDocument.documentElement.lang);
    const percent = new Intl.NumberFormat(language, { style: 'percent' });
    const ratio = Math.floor(100 * (progress.value / progress.max)) / 100;
    progressText.textContent = percent.format(ratio);
  }

  function update(value) {
    deleteError = null;
    const state = value?.state;
    snapshot = {
      state: Object.hasOwn(modelViews, state) ? state : 'unavailable',
      loaded: Number.isFinite(value?.loaded) && value.loaded >= 0 ? value.loaded : 0,
      total: Number.isFinite(value?.total) && value.total > 0 ? value.total : 0
    };
    render();
  }

  async function refresh() {
    const request = ++version;
    let status;
    try {
      status = await getSupertonicModelStatus();
    } catch {
      status = { state: 'unavailable' };
    }
    if (!active || request !== version) return;
    update(status);
    return snapshot.state;
  }

  button.addEventListener('click', async () => {
    if (!active || pending) return;
    const action = modelViews[snapshot.state].action;
    if (!action) return;
    if (action === 'refresh') {
      update({ state: 'checking' });
      await refresh();
      return;
    }

    const request = ++version;
    pending = true;
    deleteError = null;
    render();
    try {
      const status = await changeSupertonicModel(action);
      if (active && request === version) update(status);
    } catch (error) {
      if (active && action === 'delete') {
        if (await refresh() === 'ready') {
          deleteError = error?.translationKey === 'supertonicBusy' ? 'supertonicBusy' : 'supertonicOperationFailed';
        }
      } else if (active && request === version) update({ state: 'error' });
    } finally {
      pending = false;
      if (active) render();
    }
  });

  function onModelChange(changes, area) {
    if (!active || area !== 'local' || !Object.hasOwn(changes, SUPERTONIC_MODEL_STATUS_KEY)) return;
    const value = changes[SUPERTONIC_MODEL_STATUS_KEY].newValue;
    if (value === undefined) {
      void refresh();
    } else {
      ++version;
      update(value);
    }
  }

  function setActive(next) {
    if (active === next) return;
    active = next;
    ++version;
    if (active) {
      chrome.storage?.onChanged?.addListener(onModelChange);
      update({ state: 'checking' });
      void refresh();
    } else {
      chrome.storage?.onChanged?.removeListener(onModelChange);
    }
  }

  function refreshLocalization() {
    if (active) render();
  }

  group.ownerDocument.defaultView?.addEventListener('pagehide', () => setActive(false), { once: true });
  return { setActive, refreshLocalization };
}
