import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_TITLE, CHALLENGE_BODY } from '../server.mjs';

const SGCAPTCHA_PAGE = '<html><head><title>Robot Challenge Screen</title></head><body><script>const sgchallenge="abc"; const sgsubmit_url="/.well-known/sgcaptcha/?r=%2Fbolzano-apple-cake%2F";</script></body></html>';

test('recognises SGCaptcha challenge by title and body', () => {
  assert.ok(CHALLENGE_TITLE.test('Robot Challenge Screen'));
  assert.ok(CHALLENGE_BODY.test(SGCAPTCHA_PAGE));
});

test('still recognises Cloudflare challenges and ignores normal pages', () => {
  assert.ok(CHALLENGE_TITLE.test('Just a moment...'));
  assert.ok(CHALLENGE_BODY.test('<script>window._cf_chl_opt={}</script>'));
  assert.equal(CHALLENGE_TITLE.test('Bolzano apple cake'), false);
  assert.equal(CHALLENGE_BODY.test('<html><body><h1>Apple cake</h1></body></html>'), false);
});
