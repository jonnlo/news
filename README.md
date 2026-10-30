# Personal News Digest

A small Astro + TypeScript site with Starwind UI's Astro components for a daily, no-AI-token personal reading list. RSS and the official Hacker News API are collected into a dated JSON file; that checked-in file is what the static site displays.

## Included sources

Edit `scripts/feeds.json` to curate the sources. The list covers technology, design, Hong Kong, society, philosophy, literature, and arts. See `docs/source-audit.md` for the broader candidate list and feed checks. The collector records feed failures in each edition so intermittent publisher issues are visible.

Hacker News discovery uses the actual `best?h=48` page: its top 35 ranked entries are looked up using the official item API. The page's default is 48 hours; change the `h` value in the Hacker News URL in `scripts/feeds.json` to `24` to use the 24-hour list. Entries without external article links are omitted. The app then applies its own ranking and diversity rules, so it does not simply reproduce the HN list. Page format changes or blocked requests are reported as a source error; no different HN list is substituted silently.

## Local use

Requires Node.js 22 or newer.

```sh
npm ci
npm run collect
npm run dev
```

The collector writes `src/data/editions/YYYY-MM-DD.json`, using `Asia/Hong_Kong` for the edition date. It keeps publisher URLs, removes common tracking parameters only for duplicate matching, and saves an original-page Open Graph image only when it can retrieve one. It does not fetch article text or call an AI service. A failed or inaccessible page gets no image.

Build a static site with `npm run build`. `npm run collect -- --output=/tmp/digest-sample` writes to a temporary directory for a one-off sample without replacing a checked-in edition.

Each collection also saves a timestamped snapshot of all parsed candidates in `data/candidates/`, before deduplication and selection. It includes feed excerpts, source configuration, Hacker News scores where available, the ranking version, score and position, deduplication result, selection status, and source errors. Repeated runs create separate snapshots. The scheduled workflow commits them to the repository, so they are public if the repository is public; they are not displayed by the site. When using `--output`, snapshots are written under that output directory instead. These files will support side-by-side ranking comparisons.

## Daily update and deployment

Two workflows keep collection and publishing separate:

- **Refresh daily edition** runs at 06:00 Hong Kong time (22:00 UTC), collects sources, and commits the edition and candidate snapshot. It can also be started manually from Actions.
- **Deploy site** builds and publishes the latest `main` after a push, after a successful daily refresh, or when started manually. The refresh completion trigger is needed because a commit made with GitHub Actions' default token does not start the push workflow. Deployments run one at a time and each checks out the latest `main`.

To activate it:

1. Create a **new, separate GitHub repository** for this folder and push the `main` branch. Do not place it inside an existing website repository.
2. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
3. Allow GitHub Actions to write repository contents so the refresh workflow can commit editions. Pages deployment permissions are declared in the workflow.
4. Run **Refresh daily edition** once from the Actions tab. Confirm it succeeds and then check that **Deploy site** publishes the updated edition. To publish existing content without collecting again, run **Deploy site** instead.

The Astro config reads `GITHUB_REPOSITORY` in GitHub Actions and sets the correct project-page base path automatically. For a local GitHub Actions-like build, set `GITHUB_REPOSITORY=owner/repository`.

## Curation and limitations

The **Compare** page displays phrase matching, MiniSearch, and BM25S relevance rankings for the same candidate snapshot. It compares the relevance signal only, not the complete edition ranking; scores are not directly comparable. Categories without interest phrases show an empty state. After `npm ci`, set up the separate Python environment and regenerate the page with:

```sh
python3 -m venv .venv-ranking
.venv-ranking/bin/pip install -r requirements-relevance.txt
PYTHON=.venv-ranking/bin/python npm run compare-relevance -- --current-config
```

Add `--snapshot=/absolute/path/to/snapshot.json` after `--` to select another snapshot. `--current-config` applies the latest interest terms; without it, a snapshot's saved configuration is used when available for reproducibility. The comparison remains fixed until regenerated; it does not fetch stories or collect reading feedback.

The **Review** page mixes up to ten selected and ten highly ranked eligible but unselected candidates per category from one snapshot. This targeted sample is not representative of every excluded article. Ratings remain in browser-local storage, scoped to the snapshot; the user can export them as JSON to share deliberately. They are not transmitted to the site. To prepare a new sample, run `npm run prepare-review` for the latest saved snapshot or `npm run prepare-review -- --snapshot=/absolute/path/to/snapshot.json`. The review page stays on the saved sample until regenerated; regenerating does not move ratings from the previous snapshot.

- Article ranking is deterministic and configurable in `scripts/ranking-config.json`. It combines category-sensitive freshness, a modest source preference, bounded interest-phrase matches, a small capped Hacker News signal, and a capped boost for likely matching coverage by multiple publisher domains, stronger in Technology, Hong Kong and Society than in slower-moving creative sections. Interest matches are a weak signal in Technology and Design, and weaker still in the discovery-oriented sections. Selection also considers publisher and discovery-channel diversity. Source preferences come from `scripts/feeds.json`. These starting values are hypotheses, not measures of quality or importance.
- Ranking policy v5 applies bounded, explainable deductions to likely sports results in Society, reader solicitations, publishing-business items in Literature, and technical implementation details in Design. The rules use imperfect wording signals and do not exclude items or apply to Hong Kong. Candidate snapshots include the deductions and reasons.
- The collector selects up to 10 stories per category. Set `selection.perCategory` in `scripts/ranking-config.json` to change the cap; categories with fewer eligible stories stay smaller.
- Run `npm run compare-rankings -- data/candidates/FILENAME.json` to compare the previous and new rankings offline on a saved pool. Without a filename, it uses the latest snapshot. It uses the snapshot's `selection.perCategory` when available (otherwise the current config); `--per-category=N` overrides that cap for a comparison. Comparisons describe changes in selection; they do not establish that either ranking is better without reader feedback. Snapshots produced by the new ranker include its configuration and score breakdowns.
- Conservative event grouping uses similar headlines within a 48-hour window; it suppresses repeated cards within a category while retaining links to related coverage. It can miss paraphrases and Chinese-language variants or group unrelated reports by mistake. Multiple publisher domains do not prove independent reporting, agreement or accuracy. Interest matching is literal and can miss relevant stories or match irrelevant ones. Publisher identity is inferred from the linked domain and may be imperfect. HN stories use a matching publisher feed category when available, otherwise conservative title rules; uncertain stories go to Discover. These rules can misclassify stories and do not understand their full content. When the publication date is unknown, HN submission time is used as an activity signal and is not presented as the article publication date.
- Feeds can change, rate-limit, or block automated collection. A run continues when one source fails and lists the failure in the edition JSON.
- Open Graph images are optional, hotlinked from publishers, and may disappear or block embedding later.
- This app stores no reader profiles, login data, or database records. Editions are public once the repository and Pages site are public.
- All story links lead to their original publishers; summaries come only from feed descriptions, not AI-generated text.
