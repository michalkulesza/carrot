import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

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
