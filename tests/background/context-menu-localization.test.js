import { expect, it, vi } from 'vitest';
import { initContextMenu } from '../../scripts/background/context-menu.js';

it('applies the latest requested language after an earlier update finishes', async () => {
  let release;
  let language = 'en';
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockImplementation(async () => language);
  const paint = vi.fn(async () => {});
  const menu = initContextMenu({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), CONFIG: {}, handleError: vi.fn(), getUILanguage: read, updateContextMenuWithLang: paint, handleQuickSave: vi.fn() });
  const first = menu.updateContextMenu();
  language = 'ru';
  await menu.updateContextMenu();
  language = 'de';
  await menu.updateContextMenu();
  release('en');
  await first;
  expect(paint.mock.calls).toEqual([['en'], ['de']]);
  expect(read).toHaveBeenCalledTimes(2);
});

it('still applies a pending language when the preceding menu update fails', async () => {
  let fail;
  let language = 'en';
  const paint = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue(undefined);
  const menu = initContextMenu({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn(), CONFIG: {}, handleError: vi.fn(), getUILanguage: async () => language, updateContextMenuWithLang: paint, handleQuickSave: vi.fn() });
  const first = menu.updateContextMenu();
  await vi.waitFor(() => expect(fail).toEqual(expect.any(Function)));
  language = 'fr';
  await menu.updateContextMenu();
  fail(new Error('Menu update failed'));
  await first;
  expect(paint.mock.calls).toEqual([['en'], ['fr']]);
});
