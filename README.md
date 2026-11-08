# Personal News Digest

A small Astro site for browsing the latest headlines from a curated set of sources. Stories are grouped by source and ordered by date, without an application ranking or AI-generated summaries. Links open at their original publishers.

## Sources and collection

Manage categories and their source lists in Keystatic. Reorder categories and sources by dragging them; source lists are nested under each category. The settings are stored in `src/data/news-settings.json`; edit them from the local admin UI while the dev server is running. RSS, HNRSS, Now News, and the WordPress.com public API supply headlines. Each source shows up to 10 of its most recent items; items with missing dates come after dated items. Hacker News uses HNRSS's front-page feed ordered by submission time, not necessarily article publication time. Duplicate URLs are removed within a source, while separate publications' coverage is retained. Feed availability, date quality and how many items a publisher exposes vary.

Hong Kong sources include 香港01's popular stories through a third-party RSSHub instance, 有線新聞 through its publisher feed, and Now 新聞 through its local-news API. HK01's selection is made upstream; the app orders the returned stories by date. The RSSHub instance may be unavailable or change independently of the publisher.

The collector writes `src/data/editions/YYYY-MM-DD.json` using the Hong Kong date. Each refresh replaces that day's snapshot; earlier snapshots remain in the repository. A failed feed is reported in the snapshot instead of stopping the other sources. The site shows when the snapshot was collected, so a delayed refresh is visible.

Vox combines Future Perfect, Culture, Technology, and Even Better; The Atlantic combines Ideas, Books, Culture, and Technology. Their general feeds are replaced by these selections. Additional RSS/Atom feed URLs can be managed under each source in Keystatic; the collector merges the results, removes duplicate URLs, and keeps the newest 20 stories per publication. If a section feed fails, the collector logs a warning and keeps the other sections.

## Local use

Requires Node.js 22 or newer.

```sh
npm ci
npx playwright install chromium
npm run collect
npm run dev
npm run build
```

With `npm run dev` running, open `http://localhost:4321/` for the site or `http://localhost:4321/keystatic` to edit categories and sources. Keystatic uses local storage here; changes are saved to the project files.

On mobile, category chips jump to the first source in each topic and **All** returns to the start of the feed. The pinned bar follows the category as you scroll. The bottom source switcher jumps to individual publishers and steps through the full feed. On desktop, the sticky category bar filters the grid. The source picker includes all publishers, and choosing one outside the desktop filter switches to **All** before jumping to it. A category link opens at that topic on mobile and filters the grid on desktop. The `/navigation/` preview URL also opens this view.

`npm run collect -- --output=/tmp/digest-sample` writes a one-off collection to a separate directory instead of replacing a checked-in edition.

## Updates and deployment

The **Refresh headlines** GitHub Actions workflow runs hourly and can also be started manually. It commits the current day's snapshot. Scheduled Actions can run late, and the displayed collection time reflects the actual run. **Deploy site** builds and publishes `main` after a push, after a successful refresh, or when started manually. Deployments are serialized and check out the latest `main`.

For GitHub Pages, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and allow Actions to write repository contents for the refresh workflow. Run **Refresh headlines** once and verify the deploy. The deployment workflow explicitly sets `SITE_URL=https://tab.jonlo.xyz` and `SITE_BASE_PATH=/` for the configured custom domain. Without those overrides, Astro derives the project-page URL and base path from `GITHUB_REPOSITORY` in Actions. Local builds default to the production custom domain; `SITE_URL` and `SITE_BASE_PATH` can override it.

### Build-time social image

Every `npm run build` (including direct `astro build`) renders the dedicated `/og/` composition from the completed static output using Playwright Chromium. It shares the masthead's `Wordmark.astro` component, Inter font and CSS color tokens. The build waits for the bundled font, writes a 1200 × 630 PNG to `dist/og.png`, checks the image dimensions and served content, and validates Open Graph/Twitter image URLs and canonical URLs on every public route. A render or validation failure stops deployment. The composition is marked `noindex` and has no theme-switching script, so the image always uses the light palette.

Install Chromium once after `npm ci` with `npx playwright install chromium` (on Linux, use `npx playwright install --with-deps chromium`). For local builds with an existing Google Chrome installation, `OG_BROWSER_CHANNEL=chrome npm run build` also works without downloading Chromium. No dev server or external font service is needed. Preview the image after building at `/og.png` using `npm run preview`; edit its source in `src/pages/og.astro`.

The Pages workflow installs Chromium and its system dependencies, runs the complete build, then uploads **all of `dist/`**, including the generated PNG, before deploying. Only the composition and renderer source belong in Git. `dist/` and `public/og.png` are ignored; the PNG is stored in the Pages deployment artifact and hosted at `https://tab.jonlo.xyz/og.png`. Change the workflow's `SITE_URL` if the custom domain changes; metadata follows that value automatically.

## Earlier experiments

Earlier snapshots, ranking experiments and candidate data remain in the repository for reference; they are not used to select the latest headlines.
