import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderAllPdfPagesCdp, renderPdfPageImageCdp, measurePdfLayoutInOriginalTab } from '../../scripts/api/pdf-cdp-render.js';

const mocks = vi.hoisted(() => ({ cancelled: false, check: vi.fn() }));
vi.mock('../../scripts/utils/logging.js', () => ({ log: vi.fn(), logWarn: vi.fn(), logError: vi.fn(), criticalLog: vi.fn() }));
vi.mock('../../scripts/utils/processing/pipeline-helpers.js', () => ({
  checkCancellation: async (...args) => {
    mocks.check(...args);
    if (mocks.cancelled) throw new Error('Processing cancelled');
  }
}));

let dom;
let chromeApi;
let expressionErrors;
let measuredArea;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.cancelled = false;
  mocks.check.mockClear();
  dom = new JSDOM('<div id="content"><embed type="application/pdf"></div>', { url: 'https://example.com/document.pdf#page=1', runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document.querySelector('#content'), 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 60, left: 0, top: 60, width: 580, height: 720 })
  });
  expressionErrors = [];
  measuredArea = null;
  const listeners = { addListener: vi.fn(), removeListener: vi.fn() };
  const debuggerListeners = { addListener: vi.fn(), removeListener: vi.fn() };
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(580, 16);
  image.writeUInt32BE(720, 20);
  chromeApi = {
    tabs: {
      create: vi.fn(async () => ({ id: 12 })),
      get: vi.fn(async () => ({ id: 12, active: true, status: 'complete', url: dom.window.location.href })),
      update: vi.fn(async () => ({})), reload: vi.fn(async () => {}),
      query: vi.fn(async () => [{ id: 12, active: true, url: dom.window.location.href }]),
      remove: vi.fn(async () => {}), onUpdated: listeners
    },
    debugger: {
      attach: vi.fn(async () => {}), detach: vi.fn(async () => {}), onEvent: debuggerListeners,
      sendCommand: vi.fn(async (_target, method, params = {}) => {
        if (method === 'Runtime.evaluate') {
          try {
            const evaluated = dom.window.eval(params.expression);
            const value = params.awaitPromise ? await evaluated : evaluated;
            if (params.expression.includes('pdfPageWidthBest: bestWidth')) measuredArea = value;
            return { result: { type: 'object', value: params.returnByValue ? value : undefined } };
          } catch (error) {
            expressionErrors.push(error.message);
            return { exceptionDetails: { text: error.message }, result: { type: 'undefined' } };
          }
        }
        if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (method === 'DOM.querySelector') return { nodeId: params.selector === '#content' ? 2 : 0 };
        if (method === 'DOM.getBoxModel') return { model: { content: [0, 60, 580, 60, 580, 780, 0, 780] } };
        if (method === 'DOM.performSearch') return { searchId: 'search', resultCount: 0 };
        if (method === 'Page.getLayoutMetrics') return { cssLayoutViewport: { clientWidth: 1200, clientHeight: 1200 } };
        if (method === 'Page.getFrameTree') return { frame: {} };
        if (method === 'Page.captureScreenshot') return { data: image.toString('base64') };
        return {};
      })
    }
  };
  vi.stubGlobal('chrome', chromeApi);
  vi.spyOn(dom.window.console, 'log').mockImplementation(() => {});
});

afterEach(() => { dom.window.close(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CDP PDF rendering', () => {
  it('returns the actual image dimensions when rendering a single page', async () => {
    const result = renderPdfPageImageCdp(dom.window.location.href, 1);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ width: 580, height: 720 });
  });

  it('executes measurement expressions and captures a page with its actual image dimensions', async () => {
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, { width: 580, height: 720 }, null, { processingRunId: 'run-a' });
    await vi.runAllTimersAsync();
    expect(await result).toEqual([expect.objectContaining({ pageNum: 1, width: 580, height: 720, success: true })]);
    expect(expressionErrors).toEqual([]);
    expect(measuredArea).toMatchObject({ found: true, containerWidth: 580, containerHeight: 720 });
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(12);
    expect(chromeApi.debugger.detach).toHaveBeenCalledWith({ tabId: 12 });
  });

  it('does not attach to an original tab after cancellation', async () => {
    mocks.cancelled = true;
    await expect(measurePdfLayoutInOriginalTab(7, { processingRunId: 'run-a' })).rejects.toThrow('Processing cancelled');
    expect(chromeApi.debugger.attach).not.toHaveBeenCalled();
    expect(chromeApi.tabs.remove).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledWith(expect.any(String), 'run-a');
  });

  it('bounds DOM search requests and reads flat CDP attribute arrays', async () => {
    const fallback = chromeApi.debugger.sendCommand.getMockImplementation();
    chromeApi.debugger.sendCommand.mockImplementation(async (target, method, params = {}) => {
      if (method === 'DOM.querySelector') return { nodeId: 0 };
      if (method === 'DOM.performSearch') return { searchId: 'one-result', resultCount: 1 };
      if (method === 'DOM.getSearchResults') {
        if (params.toIndex > 1) throw new Error('Search range exceeds result count');
        return { nodeIds: [3] };
      }
      if (method === 'DOM.describeNode') return { node: { nodeName: 'DIV', attributes: ['id', 'content'] } };
      return fallback(target, method, params);
    });
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { processingRunId: 'run-a' });
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(1);
    expect(chromeApi.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 12 }, 'DOM.getBoxModel', { nodeId: 3 });
    const ranges = chromeApi.debugger.sendCommand.mock.calls.filter(call => call[1] === 'DOM.getSearchResults');
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every(call => call[2].toIndex === 1)).toBe(true);
    const capture = chromeApi.debugger.sendCommand.mock.calls.find(call => call[1] === 'Page.captureScreenshot');
    expect(capture[2].clip.height).toBe(720);
  });

  it('releases a pending tab-load listener when its processing run is cancelled', async () => {
    chromeApi.tabs.get.mockResolvedValue({ id: 12, status: 'loading' });
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { processingRunId: 'run-a' }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(chromeApi.tabs.onUpdated.addListener).toHaveBeenCalledTimes(1);
    mocks.cancelled = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toMatchObject({ message: 'Processing cancelled' });
    expect(chromeApi.tabs.onUpdated.removeListener).toHaveBeenCalledWith(chromeApi.tabs.onUpdated.addListener.mock.calls[0][0]);
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a tab created while cancellation was requested and never attaches a debugger', async () => {
    chromeApi.tabs.create.mockImplementation(async () => { mocks.cancelled = true; return { id: 12 }; });
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { processingRunId: 'run-a' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: 'Processing cancelled' });
    expect(chromeApi.tabs.create).toHaveBeenCalledTimes(1);
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(12);
    expect(chromeApi.debugger.attach).not.toHaveBeenCalled();
  });

  it('keeps an independent job separate from document cancellation', async () => {
    mocks.cancelled = true;
    const checkCancelled = vi.fn();
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { checkCancelled });
    await vi.runAllTimersAsync();
    expect(await result).toHaveLength(1);
    expect(checkCancelled).toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('stops browser commands after cancellation during an in-flight command', async () => {
    const fallback = chromeApi.debugger.sendCommand.getMockImplementation();
    chromeApi.debugger.sendCommand.mockImplementation(async (target, method, params) => {
      if (method === 'Page.enable') mocks.cancelled = true;
      return fallback(target, method, params);
    });
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { processingRunId: 'run-a' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: 'Processing cancelled' });
    expect(chromeApi.debugger.sendCommand.mock.calls.map(call => call[1])).toEqual(['Page.enable']);
    expect(chromeApi.debugger.detach).toHaveBeenCalledTimes(1);
    expect(chromeApi.tabs.remove).toHaveBeenCalledWith(12);
  });

  it('honors an independent job cancellation before creating a tab', async () => {
    const checkCancelled = () => { throw new Error('Independent job cancelled'); };
    await expect(renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { checkCancelled }))
      .rejects.toThrow('Independent job cancelled');
    expect(chromeApi.tabs.create).not.toHaveBeenCalled();
  });

  it('releases the readiness listener when cancellation interrupts its polling delay', async () => {
    const fallback = chromeApi.debugger.sendCommand.getMockImplementation();
    chromeApi.debugger.sendCommand.mockImplementation(async (target, method, params = {}) => {
      if (method === 'Runtime.evaluate' && params.expression.includes('Check if PDF viewer is present')) mocks.cancelled = true;
      return fallback(target, method, params);
    });
    const result = renderAllPdfPagesCdp(dom.window.location.href, 1, 2, null, null, null, { processingRunId: 'run-a' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: 'Processing cancelled' });
    for (const [listener] of chromeApi.debugger.onEvent.addListener.mock.calls) {
      expect(chromeApi.debugger.onEvent.removeListener).toHaveBeenCalledWith(listener);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases original-tab debugger ownership once across a delayed detach', async () => {
    const fallback = chromeApi.debugger.sendCommand.getMockImplementation();
    chromeApi.debugger.sendCommand.mockImplementation((target, method, params) => method === 'DOM.querySelector'
      ? Promise.resolve({ nodeId: 0 }) : fallback(target, method, params));
    let owner;
    let finishDetach;
    chromeApi.debugger.attach.mockImplementation(async () => { owner = chromeApi.debugger.attach.mock.calls.length === 1 ? 'run-a' : 'run-b'; });
    chromeApi.debugger.detach.mockImplementation(() => {
      owner = null;
      return chromeApi.debugger.detach.mock.calls.length === 1
        ? new Promise(resolve => { finishDetach = resolve; }) : Promise.resolve();
    });
    const result = measurePdfLayoutInOriginalTab(7).catch(error => error);
    await vi.waitFor(() => expect(chromeApi.debugger.detach).toHaveBeenCalledTimes(1));
    await chromeApi.debugger.attach({ tabId: 7 }, '1.3');
    finishDetach();
    expect(await result).toMatchObject({ message: expect.stringContaining('Failed to find PDF content area') });
    expect(chromeApi.debugger.detach).toHaveBeenCalledTimes(1);
    expect(owner).toBe('run-b');
  });

  it('does not enter debugger reattachment after an ownership check is cancelled', async () => {
    const fallback = chromeApi.debugger.sendCommand.getMockImplementation();
    chromeApi.debugger.sendCommand.mockImplementation(async (target, method, params) => {
      if (method === 'Runtime.enable') mocks.cancelled = true;
      return fallback(target, method, params);
    });
    const result = renderPdfPageImageCdp(dom.window.location.href, 1, 2, null, { processingRunId: 'run-a' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ message: 'Processing cancelled' });
    expect(chromeApi.debugger.attach).toHaveBeenCalledTimes(1);
    expect(chromeApi.debugger.detach).toHaveBeenCalledTimes(1);
    expect(chromeApi.debugger.sendCommand.mock.calls.map(call => call[1])).toEqual(['Page.enable', 'Runtime.enable']);
  });
});
