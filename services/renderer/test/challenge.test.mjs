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

const IMUNIFY_PAGE = '<html><head><title>One moment, please...</title></head><body><script>function wsidchk(){var failedChecks=[];}</script></body></html>';

test('recognises Imunify360 WebShield challenge', () => {
  assert.ok(CHALLENGE_TITLE.test('One moment, please...'));
  assert.ok(CHALLENGE_BODY.test(IMUNIFY_PAGE));
});

test('does not flag recipe pages mentioning one moment', () => {
  assert.equal(CHALLENGE_TITLE.test('Udon soup'), false);
  assert.equal(CHALLENGE_BODY.test('<html><body><p>One moment, please wait while the broth simmers.</p></body></html>'), false);
});

test('hasBodyContent rejects documents cut off before the body', async () => {
  const { hasBodyContent } = await import('../server.mjs');
  assert.equal(hasBodyContent('<html><head><title>Chicken Udon</title></head></html>'), false);
  assert.equal(hasBodyContent('<html><head></head><body> </body></html>'), false);
  assert.equal(hasBodyContent('<html><head></head><body class="x"><div>recipe</div></body></html>'), true);
});
