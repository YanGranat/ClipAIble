import { expect, it, vi } from 'vitest';
import { loadStats, deleteHistoryItem, recordSave, clearStats } from '../../scripts/stats/index.js';
import { handleDeleteHistoryItem } from '../../scripts/message-handlers/stats.js';

vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn() }));

const item = (title, id) => ({ title, id, url: `https://example.org/${title}`, format: 'markdown', date: 100, processingTime: 0, domain: 'example.org' });

it.each([true, false])('deletes the selected entry after list insertion, with ID=%s', async withId => {
  const selected = item('selected', withId ? 'selected-id' : undefined);
  const other = item('other', withId ? 'other-id' : undefined);
  await chrome.storage.local.set({ extension_stats: { totalSaved: 5, byFormat: { markdown: 5 }, history: [selected, other] } });
  const rendered = (await loadStats()).history[0];
  await recordSave({ title: 'Newer', url: 'https://example.org/newer', format: 'markdown', processingTime: 0 });
  await deleteHistoryItem(rendered);
  const result = await loadStats();
  expect(result.history.map(entry => entry.title)).toEqual(['Newer', 'other']);
  expect(result.totalSaved).toBe(6);
  expect(result.byFormat.markdown).toBe(6);
});

it('does not delete a different entry after the selected entry has already disappeared', async () => {
  await chrome.storage.local.set({ extension_stats: { history: [item('other', 'other-id')] } });
  await deleteHistoryItem(item('selected', 'selected-id'));
  await deleteHistoryItem(0);
  expect((await loadStats()).history.map(entry => entry.title)).toEqual(['other']);
});

it('distinguishes legacy entries sharing date and format', async () => {
  const selected = item('selected');
  await chrome.storage.local.set({ extension_stats: { history: [item('other'), selected] } });
  await deleteHistoryItem(selected);
  expect((await loadStats()).history.map(entry => entry.title)).toEqual(['other']);
});

it('does not resurrect entries or counters when a reset follows a pending delete', async () => {
  const selected = item('selected', 'selected-id');
  await chrome.storage.local.set({ extension_stats: { totalSaved: 4, history: [selected, item('other', 'other-id')] } });
  const get = chrome.storage.local.get.getMockImplementation();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  chrome.storage.local.get.mockImplementationOnce(async keys => { const result = await get(keys); await blocked; return result; });
  const deleting = deleteHistoryItem(selected);
  await vi.waitFor(() => expect(chrome.storage.local.get).toHaveBeenCalled());
  const resetting = clearStats();
  release();
  await Promise.all([deleting, resetting]);
  const saved = await loadStats();
  expect(saved.history).toEqual([]);
  expect(saved.totalSaved).toBe(0);
});

it('serializes save and delete mutations without losing the new record or its counters', async () => {
  const selected = item('selected', 'selected-id');
  await chrome.storage.local.set({ extension_stats: { totalSaved: 1, history: [selected] } });
  await Promise.all([
    recordSave({ title: 'Newer', url: 'https://example.org/newer', format: 'pdf', processingTime: 0 }),
    deleteHistoryItem(selected)
  ]);
  const saved = await loadStats();
  expect(saved.history.map(entry => entry.title)).toEqual(['Newer']);
  expect(saved.totalSaved).toBe(2);
  expect(saved.history[0].id).toMatch(/^[0-9a-f-]{36}$/);
});

it('routes the captured entry through the public delete action', async () => {
  const selected = item('selected', 'selected-id');
  await chrome.storage.local.set({ extension_stats: { history: [item('newer', 'newer-id'), selected] } });
  const respond = vi.fn();
  handleDeleteHistoryItem({ item: selected }, {}, respond);
  await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ success: true }));
  expect((await loadStats()).history.map(entry => entry.title)).toEqual(['newer']);
});
