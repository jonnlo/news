import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

// Run against `npm run dev` or a production preview using BROWSER_TEST_URL.
const origin = process.env.BROWSER_TEST_URL ?? 'http://localhost:4321';
const screenshots = process.env.BROWSER_TEST_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const watch = (page) => page.on('pageerror', (error) => errors.push(error.message));
const settle = (page) => page.waitForTimeout(400);
const theme = (page) => page.locator('[data-theme-toggle]').getAttribute('aria-pressed');
const noOverflow = async (page) => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must reflow without horizontal overflow');
const openPicker = async (page, width) => {
  await page.locator(width <= 640 ? '.navigator-current' : '.desktop-source-search').click();
  await settle(page);
  assert(await page.locator('#source-picker').evaluate((dialog) => dialog.open));
};

try {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  watch(page);
  await page.goto(origin);
  assert.equal(await theme(page), 'true', 'Unspecified theme follows system');
  await page.emulateMedia({ colorScheme: 'light' });
  await settle(page);
  assert.equal(await theme(page), 'false');
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('daily-brief-theme')), 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await settle(page);
  assert.equal(await theme(page), 'true', 'An explicit preference survives system changes');
  const other = await context.newPage();
  watch(other);
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto(origin);
  assert.equal(await theme(other), 'true', 'Stored preference survives navigation');
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('daily-brief-theme')), null, 'Returning to system clears override');
  await settle(other);
  assert.equal(await theme(other), 'false', 'Theme changes propagate to other tabs');
  await context.close();
  console.log('PASS system theme, explicit override, persistence, return to system, cross-tab sync');

  for (const colorScheme of ['light', 'dark']) {
    const noJS = await browser.newPage({ javaScriptEnabled: false, colorScheme });
    await noJS.goto(`${origin}/about/`);
    assert.equal(await noJS.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light dark');
    const background = await noJS.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);
    assert(colorScheme === 'dark' ? background.includes('0.16 ') : background.includes('0.95 '), `No-JS ${colorScheme} palette: ${background}`);
    await noJS.close();
  }
  const blocked = await browser.newPage({ colorScheme: 'dark' });
  watch(blocked);
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await blocked.goto(origin);
  assert.equal(await theme(blocked), 'true');
  await blocked.locator('[data-theme-toggle]').click();
  assert.equal(await theme(blocked), 'false');
  await blocked.close();
  console.log('PASS no-JS system palette and blocked storage');

  const fallback = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(fallback);
  await fallback.addInitScript(() => { delete HTMLDialogElement.prototype.closedBy; });
  await fallback.goto(origin);
  await fallback.locator('#source-picker').evaluate((dialog) => dialog.removeAttribute('closedby'));
  await openPicker(fallback, 1440);
  const fallbackBounds = await fallback.locator('#source-picker').boundingBox();
  await fallback.mouse.click(fallbackBounds.x + 1, fallbackBounds.y + 1);
  assert.equal(await fallback.locator('#source-picker').evaluate((dialog) => dialog.open), true);
  await fallback.mouse.click(1, 1);
  await settle(fallback);
  assert.equal(await fallback.locator('#source-picker').evaluate((dialog) => dialog.open), false);
  await fallback.close();
  console.log('PASS dialog light-dismiss fallback');

  for (const width of [390, 1440]) for (const colorScheme of ['light', 'dark']) for (const reducedMotion of ['reduce', 'no-preference']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme, reducedMotion });
    watch(page);
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    await noOverflow(page);
    if (screenshots && reducedMotion === 'no-preference') await page.screenshot({ path: `${screenshots}/${width}-${colorScheme}.png` });

    await page.evaluate(() => window.scrollTo(0, 400));
    await settle(page);
    await page.evaluate(() => {
      window.navigatorAttributeChanges = 0;
      window.navigatorAudit = new MutationObserver((records) => { window.navigatorAttributeChanges += records.length; });
      window.navigatorAudit.observe(document.querySelector('[data-source-navigator]'), {
        subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-label', 'disabled'],
      });
    });
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), 400 + i * 2);
      await page.waitForTimeout(25);
    }
    assert.equal(await page.evaluate(() => { window.navigatorAudit.disconnect(); return window.navigatorAttributeChanges; }), 0, 'Scrolling within a source must not rewrite navigator controls');

    const group = page.locator('.source-group').filter({ has: page.locator('.source-page-button') }).first();
    await group.locator('.source-page-button').first().click();
    await settle(page);
    assert.equal(await group.getAttribute('data-page'), '2');
    assert.equal(await group.locator('[data-story-page="1"]').evaluate((panel) => panel.inert), true);
    assert.equal(await group.locator('[data-story-page="2"]').evaluate((panel) => panel.inert), false);
    await group.locator('.source-page-button').first().click();
    await settle(page);
    assert.equal(await group.getAttribute('data-page'), '1');

    await openPicker(page, width);
    if (screenshots && reducedMotion === 'no-preference') await page.screenshot({ path: `${screenshots}/${width}-${colorScheme}-picker.png` });
    await page.keyboard.press('Tab');
    assert(await page.locator('#source-picker').evaluate((dialog) => dialog.contains(document.activeElement)), 'Focus stays inside modal');
    await page.keyboard.press('Escape');
    await settle(page);
    assert.equal(await page.locator('#source-picker').evaluate((dialog) => dialog.open), false);
    assert(await page.locator('[data-open-sources]:focus').count(), 'Closing restores focus to opener');

    await openPicker(page, width);
    const bounds = await page.locator('#source-picker').boundingBox();
    await page.mouse.click(bounds.x + 1, bounds.y + 1);
    assert.equal(await page.locator('#source-picker').evaluate((dialog) => dialog.open), true, 'Dialog background is not backdrop');
    await page.mouse.click(1, 1);
    await settle(page);
    assert.equal(await page.locator('#source-picker').evaluate((dialog) => dialog.open), false, 'Backdrop dismisses');

    if (width <= 640) {
      const dragSheet = async (cancel) => page.evaluate((cancel) => {
        const target = document.querySelector('.picker-header');
        const touch = (y) => new Touch({ identifier: 1, target, clientX: 100, clientY: y });
        target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(200)], changedTouches: [touch(200)] }));
        target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(320)], changedTouches: [touch(320)] }));
        target.dispatchEvent(new TouchEvent(cancel ? 'touchcancel' : 'touchend', { bubbles: true, touches: [], changedTouches: [touch(320)] }));
      }, cancel);
      await openPicker(page, width);
      await dragSheet(true);
      await settle(page);
      assert.equal(await page.locator('#source-picker').evaluate((dialog) => dialog.open), true, 'Cancelled sheet swipe stays open');
      await dragSheet(false);
      await settle(page);
      assert.equal(await page.locator('#source-picker').evaluate((dialog) => dialog.open), false, 'Sheet swipe dismisses');
      await openPicker(page, width);
      assert.equal(await page.locator('#source-picker').evaluate((dialog) => Math.round(dialog.getBoundingClientRect().bottom)), 900, 'Picker reopens at its resting position');
      await page.keyboard.press('Escape');
      await settle(page);
    }

    if (width > 640) {
      await page.locator('[data-filter="Technology"]').click();
      assert(await page.locator('.source-group:not([hidden])').count());
      assert.equal(await page.locator('.source-group:not([hidden]):not([data-category="Technology"])').count(), 0);
      await page.goBack();
      await settle(page);
      assert.equal(await page.locator('.source-group[hidden]').count(), 0, 'History restores all sources');
    }
    // Compare the optimized search with the original full scan at several depths.
    for (const fraction of [0, 0.15, 0.55, 0.9]) {
      await page.evaluate((fraction) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), fraction);
      await settle(page);
      const expected = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.source-group')].filter((group) => !group.hidden);
        const bar = document.querySelector('.topic-bar');
        const height = Math.max(bar.offsetHeight, (bar.querySelector('.filter')?.offsetHeight || 32) + 21);
        const threshold = innerWidth <= 640 ? height + 36 : bar.getBoundingClientRect().height + 36;
        let anchor = groups[0];
        for (const group of groups) { if (group.getBoundingClientRect().top > threshold) break; anchor = group; }
        return groups.find((group) => Math.abs(group.getBoundingClientRect().top - anchor.getBoundingClientRect().top) < 28).dataset.sourceName;
      });
      assert.equal(await page.locator('[data-current-name]').textContent(), expected, 'Source tracking matches the full scan');
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    const lastGroup = page.locator('.source-group').last();
    await lastGroup.evaluate((group) => {
      const previous = group.previousElementSibling;
      const links = [...previous.querySelectorAll('a, button')].filter((element) => !element.closest('[inert]') && !element.disabled);
      links.at(-1).focus();
    });
    await page.keyboard.press('Tab');
    assert(await lastGroup.evaluate((group) => group.contains(document.activeElement)), 'Sequential keyboard navigation crosses source groups');
    await page.evaluate(() => window.scrollTo(0, 0));
    // Simulate a doubled default font size without changing production root CSS.
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await settle(page);
    await noOverflow(page);
    const firstViewport = page.locator('[data-story-viewport]').first();
    assert(await firstViewport.evaluate((viewport) => Math.abs(viewport.getBoundingClientRect().height - viewport.querySelector('[data-story-page="1"]').getBoundingClientRect().height - 1) < 2), 'Text scaling remeasures story panels without a window resize');
    if (screenshots && reducedMotion === 'no-preference') await page.screenshot({ path: `${screenshots}/${width}-${colorScheme}-text200.png` });
    await openPicker(page, width);
    await noOverflow(page);
    if (screenshots && reducedMotion === 'no-preference') await page.screenshot({ path: `${screenshots}/${width}-${colorScheme}-text200-picker.png` });
    await page.keyboard.press('Escape');
    await settle(page);
    await page.goto(`${origin}/about/`);
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await noOverflow(page);
    await page.close();
    console.log(`PASS ${width}px ${colorScheme} ${reducedMotion}: scroll updates, pagination, modal, filtering, source tracking, doubled text`);
  }
  for (const route of ['', '/about/']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.goto(`${origin}${route}`);
    await noOverflow(page);
    await page.close();
  }
  assert.deepEqual(errors, [], 'No browser script errors');
  console.log('PASS 320px reflow and no browser errors');
} finally { await browser.close(); }
