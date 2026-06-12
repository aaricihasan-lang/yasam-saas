import { chromium } from 'file:///C:/Users/Mustafa/AppData/Roaming/npm/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:3099';

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  // Get combination list page first to find a real slug
  await page.goto(`${BASE}/dogaltas/kombinasyonlar`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  // Screenshot list page (regression check)
  await page.screenshot({ path: '_d01_list.png', fullPage: false });

  // Try to navigate to a detail page — pick first "Detay" link
  const detayLinks = page.locator('a', { hasText: 'Detay' });
  const count = await detayLinks.count();
  console.log(`Found ${count} Detay links`);

  if (count > 0) {
    const href = await detayLinks.first().getAttribute('href');
    console.log('Navigating to:', href);
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '_d02_detay_top.png', fullPage: false });
    // Scroll to see more
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
    await page.screenshot({ path: '_d03_detay_mid.png', fullPage: false });
  } else {
    // No auth — screenshot whatever is there
    await page.goto(`${BASE}/dogaltas/kombinasyonlar/test`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '_d02_detay_top.png', fullPage: false });
  }

  await ctx.close();

  // Mobile
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mPage = await mCtx.newPage();
  mPage.on('pageerror', e => errors.push('[mob] ' + e.message));
  await mPage.goto(`${BASE}/dogaltas/kombinasyonlar`, { waitUntil: 'networkidle', timeout: 20000 });
  await mPage.waitForTimeout(1500);
  await mPage.screenshot({ path: '_d04_mob_list.png', fullPage: false });
  await mCtx.close();

  await browser.close();

  console.log('\nConsole errors:', errors.length);
  errors.forEach(e => console.log(' ', e));
  console.log('\nScreenshots: _d01_list.png, _d02_detay_top.png, _d03_detay_mid.png, _d04_mob_list.png');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
