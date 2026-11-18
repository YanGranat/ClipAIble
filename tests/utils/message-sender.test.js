import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrustedExtensionSender, isYouTubeContentSender } from '../../scripts/utils/security/message-sender.js';

afterEach(() => vi.unstubAllGlobals());

describe('extension sender boundaries', () => {
  const id = 'test-extension-id';
  it.each([undefined, {}, { id: 'other', url: `chrome-extension://${id}/popup.html` }, { id, url: `chrome-extension://${id}.example/popup.html` }, { id, tab: { id: 1 } }, { id, tab: { id: 1 }, url: 'file:///sample.html' }, { id, url: 'https://example.org/' }, { id, origin: 'https://example.org/' }])('rejects an untrusted sender %#', sender => {
    expect(isTrustedExtensionSender(sender, id)).toBe(false);
  });
  it.each([{ id }, { id, url: `chrome-extension://${id}/offscreen.html` }, { id, url: `chrome-extension://${id}/print/print.html`, tab: { id: 2 } }])('accepts an extension context %#', sender => {
    expect(isTrustedExtensionSender(sender, id)).toBe(true);
  });
  it('requires a real YouTube tab, extension identity and secure scheme', () => {
    const sender = { id, tab: { id: 3 }, url: 'https://www.youtube.com/watch?v=sample' };
    expect(isYouTubeContentSender(sender, id)).toBe(true);
    for (const patch of [{ url: 'https://youtube.com.example/watch' }, { url: 'http://youtube.com/watch' }, { id: 'other' }, { tab: undefined }]) expect(isYouTubeContentSender({ ...sender, ...patch }, id)).toBe(false);
  });
});
