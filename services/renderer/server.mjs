import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.PORT || 8080);
const MAX_CONCURRENCY = Number(process.env.RENDERER_MAX_CONCURRENCY || 2);
const MAX_HTML_BYTES = Number(process.env.RENDERER_MAX_HTML_BYTES || 2097152);
const MAX_RESPONSE_BYTES = Number(process.env.RENDERER_MAX_RESPONSE_BYTES || 8388608);
const MAX_REQUESTS = Number(process.env.RENDERER_MAX_REQUESTS || 200);
const NAVIGATION_TIMEOUT_MS = Number(process.env.RENDERER_NAVIGATION_TIMEOUT_MS || 15000);
const TOTAL_TIMEOUT_MS = Number(process.env.RENDERER_TOTAL_TIMEOUT_MS || 25000);
const IDLE_MS = Number(process.env.RENDERER_IDLE_MS || 1200);
const DENIED_TYPES = new Set(['image', 'media', 'font']);
let active = 0;
let browserPromise;
const EGRESS_PROXY_PORT = Number(process.env.RENDERER_EGRESS_PROXY_PORT || 18081);

function publicAddress(address) {
  try { return ipaddr.parse(address).range() === 'unicast'; }
  catch { return false; }
}
export { publicAddress };

async function resolvePublicHost(host) {
  try {
    const normalized = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) return null;
    const records = net.isIP(normalized) ? [{ address: normalized, family: net.isIP(normalized) }] : await dns.lookup(normalized, { all: true, verbatim: true });
    return records.length > 0 && records.every(record => publicAddress(record.address)) ? records : null;
  } catch { return null; }
}

async function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    return Boolean(await resolvePublicHost(url.hostname));
  } catch { return false; }
}
export { safeUrl };

function pinnedAddress(records) {
  return records.find(record => record.family === 4) || records[0];
}

function createEgressProxy({ resolveHost = resolvePublicHost, requestHttp = http.request, connectTcp = net.connect } = {}) {
  const proxy = http.createServer(async (request, response) => {
    let target;
    try { target = new URL(request.url); } catch { response.writeHead(400).end(); return; }
    if (target.protocol !== 'http:' || target.username || target.password) { response.writeHead(403).end(); return; }
    const records = await resolveHost(target.hostname);
    if (!records) { response.writeHead(403).end(); return; }
    const address = pinnedAddress(records);
    const headers = { ...request.headers, host: target.host };
    delete headers['proxy-connection'];
    const upstream = requestHttp({
      hostname: address.address, family: address.family, port: Number(target.port || 80),
      method: request.method, path: `${target.pathname}${target.search}`, headers, agent: false,
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });

  proxy.on('connect', async (request, client, head) => {
    let target;
    try { target = new URL(`https://${request.url}`); } catch { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const records = await resolveHost(target.hostname);
    if (!records) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const address = pinnedAddress(records);
    const upstream = connectTcp({ host: address.address, family: address.family, port: Number(target.port || 443) });
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    client.on('error', () => upstream.destroy());
  });
  return proxy;
}
export { createEgressProxy };

const egressProxy = createEgressProxy();

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const BROWSER_CHANNEL = process.env.RENDERER_BROWSER_CHANNEL ?? 'chromium';
const TIMEZONE_ID = process.env.RENDERER_TIMEZONE_ID || 'Europe/Berlin';
const CHALLENGE_WAIT_MS = 8000;
const CHALLENGE_TITLE = /just a moment|temporary error/i;
const CHALLENGE_BODY = /cf-chl-|_cf_chl_opt/;
const STEALTH_INIT_SCRIPT = `(() => {
  const define = (target, name, getter) => Object.defineProperty(target, name, { get: getter, configurable: true });
  define(Navigator.prototype, 'webdriver', () => undefined);
  define(Navigator.prototype, 'platform', () => 'MacIntel');
  define(Navigator.prototype, 'languages', () => ['en-US', 'en']);
  define(Navigator.prototype, 'hardwareConcurrency', () => 8);
  if (!navigator.plugins.length) {
    const names = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'];
    const plugins = names.map(name => ({ name, filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 }));
    const mimeTypes = [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }, { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }];
    define(Navigator.prototype, 'plugins', () => plugins);
    define(Navigator.prototype, 'mimeTypes', () => mimeTypes);
  }
  window.chrome ||= {};
  window.chrome.runtime ||= {};
  const query = navigator.permissions?.query?.bind(navigator.permissions);
  if (query) navigator.permissions.query = p => p?.name === 'notifications' ? Promise.resolve({ state: Notification.permission === 'default' ? 'prompt' : Notification.permission, onchange: null }) : query(p);
  const patchWebGl = proto => {
    const getParameter = proto.getParameter;
    proto.getParameter = function (p) { return p === 37445 ? 'Apple Inc.' : p === 37446 ? 'Apple M1' : getParameter.call(this, p); };
  };
  patchWebGl(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patchWebGl(WebGL2RenderingContext.prototype);
  if (navigator.userAgentData) {
    const brands = [{ brand: 'Chromium', version: '136' }, { brand: 'Google Chrome', version: '136' }, { brand: 'Not.A/Brand', version: '99' }];
    const values = { brands, mobile: false, platform: 'macOS' };
    define(Navigator.prototype, 'userAgentData', () => ({ ...values, getHighEntropyValues: async () => ({ ...values, architecture: 'arm', bitness: '64', platformVersion: '14.5.0', uaFullVersion: '136.0.0.0' }) }));
  }
})();`;
export { USER_AGENT, STEALTH_INIT_SCRIPT };

const launchOptions = {
  headless: true,
  args: ['--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', `--proxy-server=http://127.0.0.1:${EGRESS_PROXY_PORT}`, '--proxy-bypass-list=<-loopback>'],
};

async function launchBrowser() {
  if (!BROWSER_CHANNEL) return chromium.launch(launchOptions);
  try { return await chromium.launch({ ...launchOptions, channel: BROWSER_CHANNEL }); }
  catch { return chromium.launch(launchOptions); }
}
export { launchBrowser };

function getBrowser() {
  browserPromise ||= launchBrowser().catch(error => { browserPromise = undefined; throw error; });
  return browserPromise;
}

async function looksLikeChallenge(page) {
  try { return CHALLENGE_TITLE.test(await page.title()) || CHALLENGE_BODY.test(await page.content()); }
  catch { return false; }
}

async function waitOutChallenge(page, started) {
  const deadline = Math.min(Date.now() + CHALLENGE_WAIT_MS, started + TOTAL_TIMEOUT_MS - 1000);
  if (!await looksLikeChallenge(page)) return;
  while (Date.now() < deadline && await looksLikeChallenge(page)) await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
}
function failure(reason, status = 422) {
  return { status, body: JSON.stringify({ ok: false, failure: reason }) };
}

async function render(requestedUrl) {
  if (!await safeUrl(requestedUrl)) return failure('unsafe_url');
  if (active >= MAX_CONCURRENCY) return failure('busy', 503);
  active++;
  const started = Date.now();
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      javaScriptEnabled: true, serviceWorkers: 'block', userAgent: USER_AGENT, locale: 'en-US', timezoneId: TIMEZONE_ID,
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await context.addInitScript(STEALTH_INIT_SCRIPT);
    const page = await context.newPage();
    let requests = 0;
    let transferred = 0;
    let oversizedResponse = false;
    let requestLimitHit = false;
    let unsafeRedirect = false;
    await page.route('**/*', async route => {
      const req = route.request();
      requests++;
      if (requests > MAX_REQUESTS) { requestLimitHit = true; await route.abort(); return; }
      if (DENIED_TYPES.has(req.resourceType()) || ['data:', 'blob:'].some(s => req.url().startsWith(s))) { await route.abort(); return; }
      if (!await safeUrl(req.url())) {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame()) unsafeRedirect = true;
        await route.abort();
        return;
      }
      await route.continue();
    });
    page.on('requestfinished', async req => {
      try {
        const sizes = await req.sizes();
        transferred += Math.max(0, sizes.responseBodySize || 0);
        if (transferred > MAX_RESPONSE_BYTES) { oversizedResponse = true; await page.close().catch(() => {}); }
      } catch {}
    });
    let documentStatus = null;
    page.on('response', response => {
      const request = response.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentStatus = response.status();
      const declaredBytes = Number(response.headers()['content-length']);
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
        oversizedResponse = true;
        page.close().catch(() => {});
      }
    });
    const timeout = setTimeout(() => page.close().catch(() => {}), TOTAL_TIMEOUT_MS);
    try {
      const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      await page.waitForLoadState('networkidle', { timeout: IDLE_MS }).catch(() => {});
      await waitOutChallenge(page, started);
      if (Date.now() - started >= TOTAL_TIMEOUT_MS) return failure('timeout', 504);
      if (oversizedResponse || transferred > MAX_RESPONSE_BYTES) return failure('response_too_large', 413);
      const finalUrl = page.url();
      if (!await safeUrl(finalUrl)) return failure('unsafe_redirect');
      if (requestLimitHit) return failure('request_limit');
      const html = await page.locator('html').evaluate(node => node.outerHTML);
      const bytes = Buffer.byteLength(html, 'utf8');
      if (!html.trim()) return failure('empty_html');
      if (bytes > MAX_HTML_BYTES) return failure('html_too_large', 413);
      return { status: 200, body: JSON.stringify({ ok: true, requested_url: requestedUrl, final_url: finalUrl, html, duration_ms: Date.now() - started, response_status: documentStatus ?? response?.status() ?? null }) };
    } catch (error) {
      if (unsafeRedirect) return failure('unsafe_redirect');
      if (oversizedResponse) return failure('response_too_large', 413);
      return failure(error?.name === 'TimeoutError' ? 'timeout' : 'navigation_failed', error?.name === 'TimeoutError' ? 504 : 502);
    } finally { clearTimeout(timeout); }
  } catch { return failure('renderer_failed', 503); }
  finally { await context?.close().catch(() => {}); active--; }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    try { await getBrowser(); res.writeHead(200).end('ok'); }
    catch { res.writeHead(503).end('unavailable'); }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/render') { res.writeHead(404).end(); return; }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { res.writeHead(413).end(); return; } }
  let url;
  try { url = JSON.parse(raw).url; } catch {}
  if (typeof url !== 'string') { res.writeHead(400).end(); return; }
  const result = await render(url);
  res.writeHead(result.status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(result.body) }).end(result.body);
});
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  egressProxy.listen(EGRESS_PROXY_PORT, '127.0.0.1');
  server.listen(PORT, '0.0.0.0');
}
