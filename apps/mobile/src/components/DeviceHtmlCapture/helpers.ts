import type { CapturedHtmlPayload } from '@carrot/shared/types'
import { CHALLENGE_MARKER_PATTERN, CHALLENGE_TITLE_PATTERN } from '@carrot/shared/utils/challengeDetection'

export const CAPTURE_TIMEOUT_MS = 20_000
const CAPTURE_POLL_MS = 1_000

export const HIDDEN_CAPTURE_SCRIPT = `
(function () {
  if (window.__carrotCaptureStarted) return;
  window.__carrotCaptureStarted = true;
  var timer = setInterval(function () {
    if (document.readyState !== 'complete') return;
    var html = document.documentElement.outerHTML;
    if (${CHALLENGE_TITLE_PATTERN}.test(document.title) || ${CHALLENGE_MARKER_PATTERN}.test(html)) return;
    clearInterval(timer);
    window.ReactNativeWebView.postMessage(JSON.stringify({ html: html, final_url: location.href }));
  }, ${CAPTURE_POLL_MS});
})();
true;
`

export const VISIBLE_CAPTURE_SCRIPT = `
(function () {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    html: document.documentElement.outerHTML,
    final_url: location.href
  }));
})();
true;
`

export const parseCapturedMessage = (data: string): CapturedHtmlPayload | null => {
  try {
    const parsed = JSON.parse(data) as Partial<CapturedHtmlPayload>
    if (typeof parsed.html !== 'string' || typeof parsed.final_url !== 'string') return null
    if (!parsed.html.trim()) return null
    return { html: parsed.html, final_url: parsed.final_url }
  } catch {
    return null
  }
}
