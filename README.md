# Personal News Digest

A small Astro site for browsing the latest headlines from a curated set of sources. Stories are grouped by source and ordered by date, without an application ranking or AI-generated summaries. Links open at their original publishers.

## Sources and collection

Edit `scripts/feeds.json` to curate the sources and their topics. RSS and the official Hacker News API supply headlines. Each source shows up to 10 of its most recent items; items with missing dates come after dated items. Duplicate URLs are removed within a source, while separate publications' coverage is retained. Feed availability, date quality and how many items a publisher exposes vary. Hacker News times are submission times, not necessarily article publication times.

The collector writes `src/data/editions/YYYY-MM-DD.json` using the Hong Kong date. Each refresh replaces that day's snapshot; earlier dates remain available in the archive. A failed feed is reported in the snapshot instead of stopping the other sources. The site shows when the snapshot was collected, so a delayed refresh is visible.

## Local use

Requires Node.js 22 or newer.

```sh
npm ci
npm run collect
npm run dev
npm run build
```

`npm run collect -- --output=/tmp/digest-sample` writes a one-off collection to a separate directory instead of replacing a checked-in edition.

## Updates and deployment

The **Refresh headlines** GitHub Actions workflow runs hourly and can also be started manually. It commits the current day's snapshot. Scheduled Actions can run late, and the displayed collection time reflects the actual run. **Deploy site** builds and publishes `main` after a push, after a successful refresh, or when started manually. Deployments are serialized and check out the latest `main`.

For GitHub Pages, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, and allow Actions to write repository contents for the refresh workflow. Run **Refresh headlines** once and verify the deploy. The Astro config derives the project-page base path from `GITHUB_REPOSITORY` in Actions.

## Archive and earlier experiments

The archive retains the last collected snapshot for each Hong Kong date. Editions collected before the source-led version retain their original curated selections. Earlier ranking experiments and candidate snapshots remain in the repository for reference; they are not used to select the latest headlines.
