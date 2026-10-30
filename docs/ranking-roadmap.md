# News ranking roadmap

Prepared 29 October 2026. This is a plan for improving the personal daily digest, not a claim that the proposed features are already running. The app should surface important developments alongside relevant, less prominent essays and discoveries, without paid AI APIs or reader tracking.

## Current state

The **published** site is still on the earlier source-weight, freshness and Hacker News (HN) formula. The **local, uncommitted** implementation introduces a configurable experimental ranker in `scripts/ranking.mjs` and `scripts/ranking-config.json`:

- Category-specific freshness, a small source preference, editable English and Chinese interest phrases, and a capped HN engagement bonus.
- Up to ten selections per category. Publisher and HN-channel limits are relaxed when comparably scored alternatives are unavailable; publisher identity is approximated from URL domains.
- Timestamped full candidate snapshots, with scoring details, selection outcomes, source failures and configuration. `npm run compare-rankings` compares the old and experimental approaches on a shared deduplicated pool.
- A local experimental event matcher can group closely matching headlines from different publisher domains within 48 hours, add a capped coverage signal in Technology, Hong Kong and Society, and retain related links. It is deliberately conservative, has not been validated against a labeled corpus, and does not prove independent reporting. It can miss paraphrases and Chinese-language variants. All HN items are still assigned to Technology at collection time, and HN timestamps refer to submissions, not necessarily the article's publication date.

A 29 October local sample collected 509 candidates from 23 sources and selected 70. Three HN items and seven direct publisher items appeared in Technology. This is a useful smoke test, not evidence of ranking quality. The 23-source expansion and ranking changes are not yet published. The user can review the temporary preview at `http://127.0.0.1:4325/personal-news-digest/` while it remains running.

## Target behavior

1. Collect from curated publishers and discovery channels into one pool. Preserve original URL, publishing source, collection channel, publication/submission date, language when known, metadata availability, and provenance.
2. Merge exact duplicates conservatively, retaining both original publisher and discovery-discussion links. Classify stories by topic, not by discovery channel. Do not silently discard uncertain or mismatched items.
3. Score relevance, freshness, source preference, coverage, discovery, and novelty using transparent, bounded features. Missing signals are unknown, not evidence of poor quality. Keep individual feature values and configuration in the snapshot.
4. Select a balanced edition by category, publisher, discovery channel, and event. Avoid promoting substantially weaker or outdated stories just to satisfy a quota.
5. Compare the new edition with alternatives offline and review actual articles before changing production weights.

## Signal design

| Signal | Proposed implementation | Guardrails and open questions |
| --- | --- | --- |
| Personal relevance | Maintain editable English/Traditional Chinese/Simplified Chinese phrase groups for UX, the independent web, technology and society, Buddhism, philosophy, poetry, visual arts, music and cinema. Give a title match more weight than an excerpt match, count concepts rather than repeated synonyms, and cap the contribution. | Literal text matching misses ideas and can misfire. Short or ambiguous terms need boundaries. Test Chinese strings and word segmentation. Phrase weights are hypotheses and should be tuned with labels. |
| Freshness | Use item type when reliable: breaking news, analysis, essay or creative work. Initially use source/feed profiles with category fallback; record the assumed type and date origin. | Unknown dates get an explicit missing-date treatment, not an invented publication date. HN submission time is separate from the original publication date. Check whether source-level profiles fit individual articles. |
| Source preference | Use a small configurable prior for preferred sources and their role: reporting, specialist analysis, creative work, primary announcement or discovery. New sources default neutral. | Preference is not a credibility or article-quality rating. Do not treat a government or company statement as independent reporting. Attribute HN links to the original publisher where possible. |
| Coverage | Only after high-confidence event grouping is validated, add a small capped boost for distinct publisher organizations covering a recent event. Record cluster confidence and evidence. | Repeated wire copy or press releases do not constitute independent confirmation. Multiple URLs or domains alone do not establish independence. Unknown coverage is neutral; singleton essays must remain eligible. |
| Discovery | Keep an optional, bounded HN engagement/position hint, with collection time and channel recorded. Evaluate other channels separately before adding them. | Missing engagement is unknown, not zero quality. Points across platforms are not directly comparable. HN attention can reflect controversy or a niche audience, not importance. |
| Novelty | Compare normalized URL and high-confidence content identity with recent **published editions**, with an adjustable lookback and a modest repeat penalty or exclusion. | Do not infer a substantive update merely from a changed headline. Preserve major updates; distinguish article duplicates from distinct coverage of an ongoing event. Handle missing history and re-runs deterministically. |

Start with these features on interpretable scales. Initial weights and thresholds must be explicit, versioned and configurable; do not treat the table above as validated proportions. Score within categories and apply list-level rules afterward. A single score cannot reliably establish an event's importance or factual accuracy.

## HN classification and deduplication

HN supplies discovery links across many subjects, so its feed category must not dictate every article's topic.

1. Normalize URLs and match an HN link to a collected publisher item. Where they are the same article, prefer the publisher's metadata and category and retain the HN discussion URL, points and submission time. Preserve both sources' provenance and handle URL redirects cautiously; retain the original link.
2. For unmatched HN items, classify using bounded English and Chinese title/excerpt phrases, trusted publisher or feed categories when available, and confidence based on specific matching evidence. A single generic word such as “AI” should not automatically determine a category. Store the evidence and confidence.
3. Put low-confidence or genuinely cross-cutting stories in **Discover**, subject to the same relevance and age checks. Unknown is preferable to a false Technology label. Discover is a fallback, not an unrestricted feed of popular HN posts.
4. Support more than one topic tag internally if helpful, but give each displayed story one primary category initially to avoid duplicated cards. Add Discover to the shared UI schema, collector selection, archives and tests when implementing. Revisit World or Science categories only if review shows a recurring gap.
5. Inspect false positives and missed stories before extending collection beyond HN's current top 35. Any broader HN lists should be deduplicated by item and URL, with a defined request budget, failure reporting and their own trial.

Exact same-article merging should precede scoring. Story/event grouping is a separate task: reports on one event may offer valuable different perspectives. Never automatically remove them simply because they share a topic.

## Implementation milestones

### 1. Establish a reliable comparison baseline

- Preserve the published ranker and the local experimental ranker as explicitly versioned variants. Record the entire ranking config, candidate fields, collection time, source failures and selection reasoning. Avoid presenting HN submission time as the linked article's publication date.
- Use the existing offline comparison on saved raw snapshots. Be explicit that its shared legacy-deduped pool isolates ranking changes and does not evaluate a new duplicate-merging algorithm. Compare the same candidate pool and collection-time information; do not assume a historical HN score was available before it was actually observed.
- Create a blind, stratified review sample across categories, source types, English and Chinese, and items included by one ranker but not another. Mark **interested / maybe / not interested**, wrong category, duplicate, stale, and important-but-missed where applicable. Keep judgments separate from scores and source-selection logic.
- Compare useful selections near the top, missed highly rated items, publisher and category coverage, repeat rate and obvious errors. Report number reviewed and unknown labels. Fix a small set of labeled snapshots as a holdout before tuning.

**Completion:** comparison is reproducible from a saved snapshot; the review shows concrete differences rather than merely overlap. No claim of better relevance until labels support it.

### 2. Make discovery source-aware

- Implement exact publisher/HN merging, distinct publication and submission timestamps, conservative classification, and Discover fallback as described above.
- Test same URL with tracking parameters, multiple HN submissions, both languages, ambiguous terms, missing article dates, and an unrelated non-tech HN headline. Confirm publisher and discussion links still point to their correct destinations.
- Review a sample of confident classifications and uncertain items. Track false classification and the proportion of HN candidates falling into Discover; adjust rules rather than forcing a result.

**Completion:** HN stories can appear outside Technology, uncertain items are visibly attributable, and a duplicate can keep both links. No loss of candidates or regressions in historical editions.

### 3. Make relevance and freshness more faithful

- Refine interest concepts with user feedback; test false positives and CJK coverage. Avoid double-counting related terms and give title matches more weight than excerpts.
- Add source/feed content-type profiles and preserve date provenance; compare them against category-based half-lives on the same snapshot. Choose missing-date behavior through review rather than fabricated timestamps.
- Keep source priors and HN signals small; evaluate ablations that remove each component. Adjust diversity and the score-gap rule using examples of overly old or repetitive articles.

**Completion:** replayable feature breakdowns, tested multilingual matching, and a reviewed comparison showing fewer obvious mismatches or stale items without crowding out niche work.

### 4. Repeat prevention and history

- Build a versioned history index from previous published editions, using stable normalized URLs and high-confidence exact identity. Store the lookback and decisions in the snapshot. Same-day manual refreshes should not accidentally suppress all current stories.
- Trial a small repeat penalty and a strict exact-repeat option. Protect new URLs and genuine updates from automatic suppression; label uncertain cases for review.

**Completion:** replay tests cover multiple days, reruns, missing history, changed tracking parameters and new articles on ongoing events. Review examples of suppressed items and missed updates.

### 5. Event coverage, only if reliable enough

- Create candidate event clusters using conservative shared entities/terms, publication windows and cross-outlet evidence. Keep grouping and duplicate merging distinct; retain all member links and do not infer independent confirmation.
- The first local experiment uses strict headline overlap, a 48-hour window and a capped coverage boost. A sample found four multi-publisher groups among 509 candidates. Treat its current thresholds as provisional and compare the groups against manually labeled pairs before deployment.
- Hand-label a balanced set of matching and non-matching pairs, including superficially similar but unrelated headlines, syndicated copies and English/Chinese variants. Measure precision and recall; favor precision because a false merge hides coverage. Only award a bounded coverage signal to clusters that pass the chosen confidence threshold.
- Start in shadow mode: show the clusters and coverage score in diagnostics without influencing the edition. If review shows too many false links or insufficient evidence, leave the signal disabled and continue collecting labeled examples.

**Completion:** a documented threshold and labeled evaluation, bounded impact, no automatic claim of corroboration, and a way to inspect cluster members. Multilingual semantic models or external services are optional later experiments, not dependencies of the first implementation.

### 6. Reader review and rollout

- Compare baseline and proposed lists from the same snapshot and several later collections. Use blind review and a held-out sample; inspect category balance, source concentration and weak-confidence classifications as well as interested-item rate. Compare like-for-like snapshots when feed lists change.
- Start with a local sample or shadow report. Then use the normal repository and Pages workflows when ready to publish. Keep the previous ranker and configuration available for rollback. Do not overwrite historical editions simply to apply a new algorithm.
- Recheck feed health and source access, especially candidates not yet validated. New publications should enter the candidate pool with neutral settings before gaining preference.

**Completion:** the chosen version has a clear configuration, a reproducible comparison and a recorded decision based on reader feedback. Continue reviewing periodically because feeds and reading interests change.

## Known constraints

- The site and snapshots are public when the GitHub repository is public. Interest terms and manual review labels must not be committed if the user wants them private.
- A single snapshot is enough for a first side-by-side comparison but not for reliable claims across time. Feed failures, source volume and HN visibility may change the pool.
- GitHub Actions schedules can be delayed. Use the collection timestamp and recorded errors, not the nominal schedule, in evaluation.
- Current candidate snapshots retain excerpts from feeds, not full article text. Do not require paid APIs, reader tracking, scraping paywalled material or AI-generated summaries.
- The collector's temporary sample output and its candidate snapshots are separate from the published edition. Keep them separate until a rollout is deliberately chosen.
