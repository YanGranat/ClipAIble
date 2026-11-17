import { describe, expect, it, vi } from 'vitest';
import { isValidExternalUrl } from '../../scripts/utils/security.js';

vi.mock('../../scripts/utils/logging.js', () => ({
  logError: vi.fn(),
  logWarn: vi.fn()
}));

describe('external URL address validation', () => {
  it.each([
    'https://fc.example/image.png',
    'https://fd.example/image.png',
    'https://[2001:4860:4860::8888]/',
    'https://[::ffff:8.8.8.8]/'
  ])('allows public host %s', (url) => {
    expect(isValidExternalUrl(url)).toBe(true);
  });

  it.each([
    'http://[::]/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fdff::1]/',
    'http://[fe80::1]/',
    'http://[fe81::1]/',
    'http://[febf:ffff::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.1.2.3]/',
    'http://[::ffff:172.16.1.1]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[::ffff:169.254.1.1]/'
  ])('blocks internal address %s', (url) => {
    expect(isValidExternalUrl(url)).toBe(false);
  });
});
