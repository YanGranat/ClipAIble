import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../scripts/utils/config.js';
import { criticalLog, log, logDebug, logError, logLargeString, logWarn, sanitizeLogData } from '../../scripts/utils/logging.js';
import { logViaPort } from '../../scripts/utils/logging/logging-port.js';
import { sanitizeErrorForLogging } from '../../scripts/utils/security.js';
import { initLogging } from '../../scripts/background/logging.js';

const originalVerbose = CONFIG.VERBOSE_LOGGING;
const originalLogLevel = CONFIG.LOG_LEVEL;
const diagnosticsJson = value => JSON.stringify(value, (_key, item) => item instanceof Error
  ? { ...item, name: item.name, message: item.message, stack: item.stack, cause: item.cause }
  : item);
vi.mock('../../scripts/utils/logging/logging-port.js', () => ({ logViaPort: vi.fn(), initLogPort: vi.fn() }));
beforeEach(() => {
  CONFIG.VERBOSE_LOGGING = false;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  CONFIG.VERBOSE_LOGGING = originalVerbose;
  CONFIG.LOG_LEVEL = originalLogLevel;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('diagnostic data privacy', () => {
  it('suppresses routine diagnostics while retaining actionable warnings in release configuration', () => {
    logDebug('Routine debug diagnostics');
    log('Routine information diagnostics');
    expect(console.log).not.toHaveBeenCalled();
    logWarn('Actionable conversion warning', { pageNum: 2 });
    expect(console.warn).toHaveBeenCalled();
  });
  it('retains error metadata while omitting content in production diagnostics', () => {
    const data = { pageNum: 7, error: 'Example error', text: 'synthetic-private-article', html: '<p>synthetic-private-article</p>', apiKey: 'synthetic-private-key' };
    const forwarded = vi.fn();
    vi.stubGlobal('self', { addLogToCollection: forwarded });
    logWarn('Conversion failed', data);
    criticalLog('Conversion failed', 'PDF_ERROR', data, 'error');
    const serialized = JSON.stringify([console.log.mock.calls, console.warn.mock.calls, console.error.mock.calls, forwarded.mock.calls]);
    expect(serialized).not.toContain('synthetic-private-article');
    expect(serialized).not.toContain('synthetic-private-key');
    expect(serialized).toContain('Example error');
    expect(serialized).toContain('pageNum');
  });

  it('suppresses routine critical diagnostics before console output or forwarding', () => {
    logViaPort.mockClear();
    criticalLog('PDF loaded successfully', 'PDF_LOADER_SUCCESS', { pageNum: 7 });
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(logViaPort).not.toHaveBeenCalled();
    criticalLog('PDF parser failed', 'PDF_PARSE_ERROR', { error: 'Invalid file', pageNum: 7 }, 'error');
    expect(console.error).toHaveBeenCalled();
  });

  it('redacts nested credentials and setting values with verbose diagnostics enabled', () => {
    CONFIG.VERBOSE_LOGGING = true;
    const data = { text: 'synthetic-article-content', headers: { Authorization: 'synthetic-authorization' }, settings: { key: 'openai_api_key', value: 'synthetic-key' }, nested: { google_api_key: 'synthetic-google-key' } };
    const safe = sanitizeLogData(data);
    expect(safe.text).toBe(data.text);
    expect(safe.headers.Authorization).toBe('***');
    expect(safe.settings.value).toBe('***');
    expect(safe.nested.google_api_key).toBe('***');
    expect(data.headers.Authorization).toBe('synthetic-authorization');
  });

  it('preserves Error messages and handles circular error context', () => {
    const error = new Error('Example failure');
    error.context = { token: 'synthetic-token' };
    error.context.parent = error;
    const safe = sanitizeErrorForLogging(error);
    expect(safe.message).toBe('Example failure');
    expect(safe.context.token).toBe('***');
    expect(safe.context.parent).toBe('[Circular]');
  });

  it('exports reviewed diagnostics through the real collection boundary', async () => {
    const collector = initLogging({ log: vi.fn(), logError: vi.fn(), CONFIG });
    const download = vi.fn().mockResolvedValue(1);
    vi.stubGlobal('chrome', { downloads: { download } });
    collector.addLogToCollection('PDF conversion failed', { pageNum: 3, error: 'Example failure', text: 'synthetic-private-article', apiKey: 'synthetic-private-key' }, 'error');
    await collector.exportAllLogsToFile();
    expect(download).toHaveBeenCalledTimes(1);
    const text = decodeURIComponent(download.mock.calls[0][0].url.split(',').slice(1).join(','));
    expect(text).toContain('Example failure');
    expect(text).toContain('pageNum');
    expect(text).not.toContain('synthetic-private-article');
    expect(text).not.toContain('synthetic-private-key');
  });

  it.each([
    ['legacy key', 'sk-' + 'samplekey1234567890'.repeat(2), value => value],
    ['project key', 'sk-proj-' + 'sample-key_1234567890'.repeat(2), value => value],
    ['Google key', 'AIza' + 'sample-key_1234567890'.repeat(2), value => value],
    ['bearer token', 'sample-bearer-token-1234567890', value => `Bearer ${value}`],
    ['named token', 'sample-access-token-1234567890', value => `access_token="${value}"`],
    ['JSON API key', 'sample-json-key-1234567890', value => JSON.stringify({ api_key: value })],
    ['JSON token', 'sample-json-token-1234567890', value => JSON.stringify({ access_token: value })]
  ])('redacts a %s echoed in diagnostic messages before forwarding or export', async (_label, secret, embed) => {
    const collector = initLogging({ log: vi.fn(), logError: vi.fn(), CONFIG });
    vi.stubGlobal('self', { addLogToCollection: collector.addLogToCollection });
    const download = vi.fn().mockResolvedValue(1);
    vi.stubGlobal('chrome', { downloads: { download } });
    logViaPort.mockClear();
    const message = `Request rejected: ${embed(secret)}; status=403`;
    logError(message, new Error(message));
    criticalLog(message, embed(secret), { message }, 'error');
    collector.addLogToCollection(message, { error: message }, 'error');
    await collector.exportAllLogsToFile();
    const exported = decodeURIComponent(download.mock.calls[0][0].url.split(',').slice(1).join(','));
    const visible = diagnosticsJson([console.log.mock.calls, console.warn.mock.calls, console.error.mock.calls, logViaPort.mock.calls, exported]);
    expect(visible).not.toContain(secret);
    expect(exported).toContain('Request rejected');
    expect(exported).toContain('status=403');
  });

  it('redacts verbose text before chunking and sanitizes its metadata', () => {
    CONFIG.VERBOSE_LOGGING = true;
    CONFIG.LOG_LEVEL = 1;
    const secret = 'sk-proj-' + 'sample-key_1234567890'.repeat(2);
    logLargeString('Request details', 'A'.repeat(250) + secret + ' complete', {
      chunkSize: 256,
      meta: { apiKey: secret }
    });
    const visible = JSON.stringify(console.log.mock.calls);
    expect(visible).not.toContain(secret);
    expect(visible).not.toContain('sample-key_1234567890');
    const chunks = console.log.mock.calls
      .filter(args => args.length === 1 && typeof args[0] === 'string' && !args[0].startsWith('[ClipAIble]'))
      .map(args => args[0]).join('');
    expect(chunks).toContain(' complete');
  });

  it('redacts direct warning, information and debug messages before console output or collection', () => {
    CONFIG.LOG_LEVEL = 0;
    const forwarded = vi.fn();
    vi.stubGlobal('self', { addLogToCollection: forwarded });
    const secret = 'sample-direct-bearer-token-1234567890';
    for (const write of [logWarn, log, logDebug]) {
      write(`Request warning: Bearer ${secret}; status=429`);
    }
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledTimes(2);
    expect(forwarded).toHaveBeenCalledTimes(3);
    const visible = diagnosticsJson([console.warn.mock.calls, console.log.mock.calls, forwarded.mock.calls]);
    expect(visible).not.toContain(secret);
    expect(visible).toContain('status=429');
  });

  it('preserves ordinary diagnostics and public voice identifiers', () => {
    const message = 'Voice sk-SK-Chirp3-HD-Achernar returned status=503';
    expect(sanitizeErrorForLogging({ message, code: 'VOICE_UNAVAILABLE' })).toMatchObject({
      message,
      code: 'VOICE_UNAVAILABLE'
    });
  });
});
