import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { launchBrowser, browserIdentity, USER_AGENT, STEALTH_INIT_SCRIPT } from '../server.mjs';

test('pinned Chromium serializes JavaScript-created recipe DOM', async t => {
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) {
    if (error?.message?.includes('Executable doesn\'t exist')) return t.skip('Chromium is installed in the renderer image, not on this host');
    throw error;
  }
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body><main id="app"></main><script>document.querySelector("#app").innerHTML = "<h1>Dynamic recipe</h1><ul><li>2 cups flour</li></ul>"</script></body></html>');
    const html = await page.locator('html').evaluate(node => node.outerHTML);
    assert.match(html, /Dynamic recipe/);
    assert.match(html, /2 cups flour/);
  } finally { await browser.close(); }
});

test('browserIdentity derives UA and userAgentData from the browser version', () => {
  const { userAgent, stealthScript } = browserIdentity('150.0.7390.37');
  assert.equal(userAgent, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');
  assert.match(stealthScript, /version: '150'/);
  assert.match(stealthScript, /uaFullVersion: '150\.0\.7390\.37'/);
  assert.doesNotMatch(stealthScript, /136/);
});

test('browserIdentity falls back to the pinned major when the version is unusable', () => {
  assert.deepEqual(browserIdentity(undefined), { userAgent: USER_AGENT, stealthScript: STEALTH_INIT_SCRIPT });
  assert.match(USER_AGENT, /Chrome\/141\.0\.0\.0/);
});

test('launched browser presents as desktop Chrome', async t => {
  let browser;
  try { browser = await launchBrowser(); }
  catch (error) {
    if (error?.message?.includes('Executable doesn\'t exist')) return t.skip('Chromium is installed in the renderer image, not on this host');
    throw error;
  }
  let seenUserAgent;
  const server = http.createServer((req, res) => { seenUserAgent = req.headers['user-agent']; res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>ok</body></html>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const identity = browserIdentity(browser.version());
    const context = await browser.newContext({ userAgent: identity.userAgent, locale: 'en-US', proxy: { server: 'http://per-context', bypass: '127.0.0.1' } });
    await context.addInitScript(identity.stealthScript);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const probe = await page.evaluate(() => ({
      webdriver: navigator.webdriver, languages: navigator.languages, plugins: navigator.plugins.length,
      chrome: typeof window.chrome?.runtime, cores: navigator.hardwareConcurrency, ua: navigator.userAgent,
    }));
    assert.doesNotMatch(seenUserAgent, /HeadlessChrome/);
    assert.doesNotMatch(probe.ua, /HeadlessChrome/);
    assert.notEqual(probe.webdriver, true);
    assert.deepEqual(probe.languages, ['en-US', 'en']);
    assert.ok(probe.plugins > 0);
    assert.equal(probe.chrome, 'object');
    assert.equal(probe.cores, 8);
  } finally { server.close(); await browser.close(); }
});
