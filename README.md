# Personal News Digest

A small Astro + TypeScript site with Starwind UI's Astro components for a daily, no-AI-token personal reading list. RSS and the official Hacker News API are collected into a dated JSON file; that checked-in file is what the static site displays.

## Included sources

Edit `scripts/feeds.json` to curate the sources. The starter list covers technology (Ars Technica and Hacker News), design (Smashing Magazine and A List Apart), Hong Kong (Hong Kong Free Press and RTHK), philosophy (Daily Nous and Aeon), and literature (Literary Hub and The Paris Review). The collector records feed failures in each edition so intermittent publisher issues are visible.

## Local use

Requires Node.js 22 or newer.

```sh
npm ci
npm run collect
npm run dev
```

The collector writes `src/data/editions/YYYY-MM-DD.json`, using `Asia/Hong_Kong` for the edition date. It keeps publisher URLs, removes common tracking parameters only for duplicate matching, ranks articles using recency, your source weights, and Hacker News points, and saves an original-page Open Graph image only when it can retrieve one. It does not fetch article text or call an AI service. A failed or inaccessible page gets no image.

Build a static site with `npm run build`. `npm run collect -- --output=/tmp/digest-sample` writes to a temporary directory for a one-off sample without replacing a checked-in edition.

## Daily update and deployment

`.github/workflows/refresh-edition.yml` runs at 06:00 Hong Kong time (22:00 UTC), checks the sources, commits the JSON edition, builds the static site, and publishes it to GitHub Pages in the same workflow run. A workflow dispatch is available for a manual refresh and deployment.

To activate it:

1. Create a **new, separate GitHub repository** for this folder and push the `main` branch. Do not place it inside an existing website repository.
2. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
3. Allow GitHub Actions to write repository contents so the refresh workflow can commit editions. Pages deployment permissions are declared in the workflow.
4. Run **Refresh daily edition** once from the Actions tab and confirm the run finishes with a Pages deployment.

The Astro config reads `GITHUB_REPOSITORY` in GitHub Actions and sets the correct project-page base path automatically. For a local GitHub Actions-like build, set `GITHUB_REPOSITORY=owner/repository`.

## Curation and limitations

- Article ranking is deterministic and visible in `scripts/collect.mjs`; change the `weight` values in `scripts/feeds.json` to favor a source.
- Feeds can change, rate-limit, or block automated collection. A run continues when one source fails and lists the failure in the edition JSON.
- Open Graph images are optional, hotlinked from publishers, and may disappear or block embedding later.
- This app stores no reader profiles, login data, or database records. Editions are public once the repository and Pages site are public.
- All story links lead to their original publishers; summaries come only from feed descriptions, not AI-generated text.
