import { expect, it } from 'vitest';

it('rejects invalid browser base64 inputs without truncating Unicode', () => {
  expect(() => btoa('λ')).toThrow();
  expect(() => atob('%%%')).toThrow();
  expect(atob(btoa('Byte\u00ff'))).toBe('Byte\u00ff');
});

it('uses authenticated encryption and secure random generation', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('synthetic plaintext')));
  bytes[0] ^= 1;
  await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes)).rejects.toThrow();
});
