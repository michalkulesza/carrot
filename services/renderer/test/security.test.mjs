import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress, safeUrl } from '../server.mjs';

test('accepts globally routable addresses', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(publicAddress(address), true, address);
});

test('rejects private, shared, loopback, link-local, documentation, and reserved ranges', () => {
  for (const address of [
    '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.31.0.1',
    '192.0.0.1', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.88.99.1', '192.168.1.1', '192.175.48.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '::', '::1',
    'fc00::1', 'fe80::1', 'ff02::1', '64:ff9b::1', '2001::1', '2001:db8::1', '2002::1', '::ffff:127.0.0.1',
  ]) assert.equal(publicAddress(address), false, address);
});

test('navigation policy rejects unsafe initial and redirect destinations', async () => {
  for (const destination of [
    'file:///etc/passwd', 'http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data',
    'https://user:password@example.com/', 'http://[::1]/',
  ]) assert.equal(await safeUrl(destination), false, destination);
  assert.equal(await safeUrl('https://[2606:4700:4700::1111]/'), true);
});
