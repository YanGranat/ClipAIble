// @ts-check

/** Accept extension documents and the extension service worker. */
export function isTrustedExtensionSender(sender, extensionId = globalThis.chrome?.runtime?.id) {
  if (!extensionId || !sender || sender.id !== extensionId) return false;
  if (!sender.url) {
    if (sender.tab) return false;
    if (!sender.origin) return true;
    try {
      const origin = new URL(sender.origin);
      return origin.protocol === 'chrome-extension:' && origin.hostname === extensionId;
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.hostname === extensionId;
  } catch {
    return false;
  }
}

/** Content scripts have access only to their subtitle bridge actions. */
export function isYouTubeContentSender(sender, extensionId = globalThis.chrome?.runtime?.id) {
  if (!extensionId || sender?.id !== extensionId || !sender.tab || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com'));
  } catch {
    return false;
  }
}
