# News sources and settings: implementation quick reference

Use this guide when adding or changing a category or feed. The active configuration is `src/data/news-settings.json`; `docs/source-audit.md` is the editorial candidate registry, not the live configuration.

## Where each setting is used

| File | Responsibility |
| --- | --- |
| `keystatic.config.ts` | Defines the local `/keystatic` editor fields and saves the News settings singleton as JSON. |
| `src/data/news-settings.json` | Active category and source configuration used by the collector and site. |
| `scripts/collect.mjs` | Fetches enabled sources, normalizes stories, records errors, and writes the day's edition. |
| `src/content.ts` | Derives the site's category list from enabled categories. |
| `src/pages/index.astro` | Uses enabled source settings for displayed source/category order, labels, and homepage links. |
| `scripts/ranking-config.json` | Category-level ranking policy and selection settings. A category added to news settings may also need ranking defaults here. |
| `docs/source-audit.md` | Candidate/active source notes and prior feed checks. Update it when useful, but it does not activate a source. |

The source `name` is a stable identifier: collected editions store it as `source`, and the page uses it to match settings back to saved stories. Keep it unchanged when editing only the visible label. Use `displayName` for an optional short site label. The homepage normally derives from the feed URL's origin; add a matching entry to `homepageOverrides` in `src/pages/index.astro` when the desired homepage differs.

## Add or update a source

1. **Choose its category and editorial role.** Prefer an existing category when it fits. Categories determine the primary category on collected stories, the site's grouping/order, and the ranking policy lookup. A feed is assigned one primary category; multi-category tagging is not currently supported.
2. **Find the feed/API endpoint and inspect it.** Prefer a publisher-provided RSS or Atom feed. Check that the endpoint returns usable recent entries with titles, links, and publication dates when available. A candidate URL in `docs/source-audit.md` is not validated merely by being listed there.
3. **Edit the settings.** With `npm run dev` running, open `http://localhost:4321/keystatic`, open **News settings**, then add the source under its category. The editor supports drag reordering. Or edit `src/data/news-settings.json` directly.
4. **Fill the fields.** Set `enabled`, stable `name`, optional `displayName`, primary `url`, `kind`, and optional `role`. `additionalFeedUrls` combines multiple RSS/Atom sections into one source. Leave it empty for a single feed. Set `enabled: false` to pause a source without deleting its record.
5. **Collect to a temporary directory.** Run `npm run collect -- --output=/tmp/news-source-check`. This exercises the real parser and avoids replacing a checked-in edition. Read the console summary and inspect the generated date-named JSON: confirm the source succeeded, stories have the intended category/source, links and dates look right, and the list is not empty or unexpectedly repetitive.
6. **Review the result and site mapping.** If the source is absent or mislabeled, check category/source `enabled`, exact stable `name`, feed `kind`, endpoint shape, and any source-specific logic in `scripts/collect.mjs`. Add a homepage override if needed. Then run `npm run build` to catch configuration/import and static-site issues.
7. **Update the registry/documentation.** Record useful endpoint validation or removal reasoning in `docs/source-audit.md`; update `README.md` if user-facing behavior or settings workflow changed.

When you intend to refresh the actual current edition, run `npm run collect` without `--output`. Collection uses the Hong Kong calendar day and replaces that day's edition; it leaves earlier dated editions in place. Requests retry transient network errors, timeouts, HTTP 408/429, and 5xx responses up to three total attempts, with one- and two-second delays. Permanent HTTP errors are not retried.

If a source still fails or returns no usable stories, the collector retains its most recent successful stories from the output directory or saved editions, matching the stable source name. Local collection therefore checks both local and saved editions. Retained groups carry `retained: true` and the original `lastSuccessfulAt`; errors remain in `sourceErrors`. `sourcesUpdated` counts only successful live source refreshes, and the footer displays “75/77 sources updated” without per-source warnings. If every enabled source fails live collection, the collector refuses to overwrite the edition even when saved stories exist.

## Current settings fields

- **Category `name`**: visible category and story category key. Keep it consistent with keys in `scripts/ranking-config.json` when category-specific ranking behavior is expected.
- **Category `enabled`**: disabled categories are omitted from collection and the site's category list.
- **Source `enabled`**: disabled sources are omitted from collection and the active source mapping.
- **Source `name`**: stable collection identifier and join key across editions/settings. Avoid renaming casually; old editions retain the old name and will no longer match the renamed settings entry.
- **Source `displayName`**: optional site label; defaults to `name`.
- **Source `url`**: primary endpoint. Must be a valid URL.
- **Source `additionalFeedUrls`**: optional extra RSS/Atom endpoints, deduplicated by URL and merged under the same source. The collector currently merges these only when `kind` is `rss`; it tolerates an individual section failure if another section succeeds.
- **Source `kind`**: `rss` for RSS/Atom, `hackernews` for HNRSS handling, `nownews` for the Now News JSON API, or `wordpress` for the WordPress.com public API. Non-RSS endpoints require the matching response shape and parsing branch in `scripts/collect.mjs`.
- **Source `role`**: optional `curator`, `community`, or `publisher` metadata. For RSS stories it is included in normalized story metadata; curate-role RSS sources also get a discovery channel. WordPress stories retain the role. Do not assume every custom collector branch emits this metadata without checking it.

The collector currently selects up to 20 newest dated/undated entries per source after URL deduplication. It strips HTML/entities from feed text and keeps missing/invalid publication dates as `null`. Hacker News uses submission-oriented feed behavior and no excerpt. There are also source-specific collection branches and exceptions (currently including The Verge, 香港01, Now News, WordPress, Techmeme, Waxy, and a few extra paginated feeds); inspect `scripts/collect.mjs` before changing those sources or generalizing their behavior.

## Adding a category or changing ranking behavior

1. Add the category in `src/data/news-settings.json` (or Keystatic) and confirm it is enabled. Its exact spelling is the category key stored on every collected story.
2. Add/update category defaults in `scripts/ranking-config.json` when the category needs explicit freshness, topic, coverage, or category policy behavior. `scripts/ranking.mjs` also has built-in defaults and merge behavior; inspect both before assuming a missing setting means zero.
3. Check any category lists used for selection or coverage in `scripts/ranking-config.json`, and any UI-specific labels/behavior in `src/pages/index.astro` and `src/components/SourceNavigator.astro`.
4. Run a temporary collection and build. Ranker experiments operate on saved candidate snapshots; changing the source/category configuration alone does not retroactively rewrite existing editions or snapshots.

## Feed type changes

Adding another ordinary RSS/Atom source generally needs only configuration. A JSON API or other nonstandard feed needs a collector branch that converts entries to the normalized story shape (`title`, `url`, `publishedAt`, `excerpt`, `source`, and `category`) and returns the source collection shape (`name`, `category`, `kind`, `count`, `stories`). Validate partial and total failures and add/update collector tests for parser behavior when implementing a new branch. Preserve useful metadata such as `sourceRole`, discussion links, and canonical/source URLs where the feed provides them.

## Related references

- Editorial candidates and feed history: `docs/source-audit.md`
- Category navigation behavior: `docs/category-navigation.md`
- Ranking design and current experiments: `docs/ranking-roadmap.md`
- Local setup and Keystatic entry point: `README.md`
