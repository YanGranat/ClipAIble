import { describe, expect, it, vi } from 'vitest';
import { removeAllContextMenuItems } from '../../scripts/utils/context-menu.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logDebug: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));

it('allows an already absent context menu to be recreated', async () => {
  chrome.contextMenus.removeAll = vi.fn().mockRejectedValue(new Error('No matching item'));
  await expect(removeAllContextMenuItems()).resolves.toBeUndefined();
});
