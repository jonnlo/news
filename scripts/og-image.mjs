import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const width = 1200;
const height = 630;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Serve only the completed build, on a loopback-only ephemeral port. A base-path
// mount also exercises project Pages builds without a running Astro dev server.
async function serveBuild(dir, base) {
  const root = resolve(fileURLToPath(dir));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base)) throw new Error('Outside base path');
      let target = resolve(root, pathname.slice(base.length));
      if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('Outside build');
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      const extension = target.slice(target.lastIndexOf('.'));
      response.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream' });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function renderAndValidate({ dir, base, site, pages, logger }) {
  const { server, origin } = await serveBuild(dir, base);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      // Optional local use with an existing Chrome installation; CI uses the
      // Playwright-pinned Chromium installed by the deployment workflow.
      channel: process.env.OG_BROWSER_CHANNEL || undefined,
    });
    const page = await browser.newPage({
      viewport: { width, height }, deviceScaleFactor: 1,
      colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US',
    });
    page.setDefaultTimeout(15_000);
    const failures = [];
    page.on('requestfailed', (request) => failures.push(request.url()));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
    });
    // Fonts and all other inputs must come from dist, never a network dependency.
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const response = await page.goto(`${origin}${base}og/`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, 'OG composition must be statically built');
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    assert(await page.evaluate(() => document.fonts.check('700 88px "Inter Variable"')),
      'The bundled Inter font must load before rendering');
    assert.equal(await page.locator('.wordmark').textContent(), 'one more tab.');
    const bounds = await page.locator('h1').boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height,
    'Wordmark must fit inside the canvas');
    const output = new URL('og.png', dir);
    await page.screenshot({ path: fileURLToPath(output), animations: 'disabled' });
    const png = await readFile(output);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Valid PNG signature');
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);

    // Verify the actual emitted HTML, including nested routes and Pages base paths.
    const expectedImage = new URL(`${base}og.png`, site).href;
    for (const { pathname } of pages) {
      const route = pathname.replace(/^\/+/, '');
      if (route.replace(/\/$/, '') === 'og') continue;
      const url = `${origin}${base}${route}`;
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, `Static page: ${pathname}`);
      const metadata = await page.evaluate(() => ({
        og: document.querySelector('meta[property="og:image"]')?.content,
        twitter: document.querySelector('meta[name="twitter:image"]')?.content,
        card: document.querySelector('meta[name="twitter:card"]')?.content,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        url: document.querySelector('meta[property="og:url"]')?.content,
      }));
      assert.equal(metadata.og, expectedImage, `og:image on ${pathname}`);
      assert.equal(metadata.twitter, expectedImage, `twitter:image on ${pathname}`);
      assert.equal(metadata.card, 'summary_large_image');
      assert.equal(metadata.url, new URL(`${base}${route}`, site).href);
      assert.equal(metadata.canonical, metadata.url);
    }
    const imageResponse = await page.request.get(`${origin}${base}og.png`);
    assert.equal(imageResponse.status(), 200);
    assert.equal(imageResponse.headers()['content-type'], 'image/png');
    assert.deepEqual(await imageResponse.body(), png, 'The served artifact must contain the generated PNG');
    assert.deepEqual(failures, [], 'Built pages must load all assets locally');
    logger.info(`Generated and verified ${fileURLToPath(output)} (${width}×${height}); social URL: ${expectedImage}`);
  } finally {
    await browser?.close();
    await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  }
}

export default function ogImage() {
  let config;
  return {
    name: 'one-more-tab-og-image',
    hooks: {
      'astro:config:done': ({ config: resolved }) => { config = resolved; },
      'astro:build:done': async ({ dir, pages, logger }) => {
        assert.equal(config.output, 'static', 'OG generation requires a static Pages build');
        assert(config.site, 'Set the production SITE_URL before building');
        const base = `${config.base.replace(/\/$/, '')}/`;
        await renderAndValidate({ dir, pages, logger, base, site: config.site });
      },
    },
  };
}
