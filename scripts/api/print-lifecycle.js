// @ts-check

/** Close a captured print tab only while it still belongs to the captured job. */
export async function closeOwnedPrintTab(tabId, jobId) {
  if (!Number.isInteger(tabId) || typeof jobId !== 'string' || !jobId) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;
  try {
    const expected = new URL(chrome.runtime.getURL('print/print.html'));
    const actual = new URL(tab.url);
    if (actual.protocol === expected.protocol && actual.host === expected.host && actual.pathname === expected.pathname && actual.searchParams.get('job') === jobId) {
      await chrome.tabs.remove(tabId);
    }
  } catch { /* The tab was closed or navigated away. */ }
}
