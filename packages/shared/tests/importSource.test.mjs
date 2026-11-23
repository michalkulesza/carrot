import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSingleUrl, isUnsupportedImportUrl } from '../src/utils/importSource.ts'

test('extractSingleUrl accepts a lone http(s) URL', () => {
  assert.equal(extractSingleUrl('  https://youtu.be/abc?si=1\n'), 'https://youtu.be/abc?si=1')
  assert.equal(extractSingleUrl('http://example.com/x'), 'http://example.com/x')
})

test('extractSingleUrl rejects text with extra content or non-http input', () => {
  assert.equal(extractSingleUrl('Watch https://youtu.be/abc'), null)
  assert.equal(extractSingleUrl('https://a.com https://b.com'), null)
  assert.equal(extractSingleUrl('ftp://a.com'), null)
  assert.equal(extractSingleUrl('pasta recipe'), null)
  assert.equal(extractSingleUrl(''), null)
})

test('isUnsupportedImportUrl matches blocked hosts and subdomains', () => {
  assert.equal(isUnsupportedImportUrl('https://www.youtube.com/watch?v=1'), true)
  assert.equal(isUnsupportedImportUrl('https://YOUTU.BE/abc'), true)
  assert.equal(isUnsupportedImportUrl('https://m.facebook.com/x'), true)
  assert.equal(isUnsupportedImportUrl('https://x.com/a'), true)
  assert.equal(isUnsupportedImportUrl('https://youtube.com./a'), true)
})

test('isUnsupportedImportUrl allows supported and invalid input', () => {
  assert.equal(isUnsupportedImportUrl('https://www.instagram.com/reel/1'), false)
  assert.equal(isUnsupportedImportUrl('https://www.tiktok.com/@a/video/1'), false)
  assert.equal(isUnsupportedImportUrl('https://notx.com/a'), false)
  assert.equal(isUnsupportedImportUrl('https://example.com/youtube.com'), false)
  assert.equal(isUnsupportedImportUrl('not a url'), false)
})
