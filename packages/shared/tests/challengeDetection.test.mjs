import assert from 'node:assert/strict'
import test from 'node:test'
import { isChallengePage } from '../src/utils/challengeDetection.ts'

test('detects Cloudflare challenge titles', () => {
  assert.equal(isChallengePage('Just a moment...', '<html></html>'), true)
  assert.equal(isChallengePage('Attention Required! | Cloudflare', ''), true)
  assert.equal(isChallengePage('Temporary Error', ''), true)
})

test('detects challenge markers in the HTML', () => {
  assert.equal(isChallengePage('Pasta', '<script src="/cdn-cgi/challenge-platform/h/b"></script>'), true)
  assert.equal(isChallengePage('Pasta', '<div id="cf-chl-widget"></div>'), true)
  assert.equal(isChallengePage('Pasta', 'window._cf_chl_opt = {}'), true)
})

test('lets real recipe pages through', () => {
  assert.equal(isChallengePage('Creamy Pasta Recipe', '<html><body><h1>Creamy Pasta</h1></body></html>'), false)
})
