#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRankingConfig, publisherKey, rankStory, orderCategoryWithDiversity } from './ranking.mjs';
import { clusterStories } from './events.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const candidateDir = resolve(projectDir, 'data/candidates');
const args = process.argv.slice(2);
const snapshotArg = args.find((arg) => !arg.startsWith('--'));
const topArg = args.find((arg) => arg.startsWith('--top='));
const categoryLimitArg = args.find((arg) => arg.startsWith('--per-category='));
const topN = topArg ? Number(topArg.slice('--top='.length)) : 10;

if (!Number.isInteger(topN) || topN < 1 || topN > 50) {
  throw new Error('--top must be an integer from 1 to 50');
}

const snapshotPath = snapshotArg
  ? (isAbsolute(snapshotArg) ? snapshotArg : resolve(process.cwd(), snapshotArg))
  : await latestSnapshot(candidateDir);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!Array.isArray(snapshot.candidates) || !snapshot.collectedAt) {
  throw new Error(`${snapshotPath} is not a candidate snapshot (expected candidates and collectedAt)`);
}

const config = await loadRankingConfig(args.includes('--current-config') ? undefined : snapshot.rankingConfig);
const categoryLimit = categoryLimitArg
  ? Number(categoryLimitArg.slice('--per-category='.length))
  : Number(config.selection.perCategory);
if (!Number.isInteger(categoryLimit) || categoryLimit < 1 || categoryLimit > 50) {
  throw new Error('--per-category and ranking-config.json selection.perCategory must be an integer from 1 to 50');
}
const hackerNewsFeedNames = new Set((snapshot.sources ?? [])
  .filter((source) => source.kind === 'hackernews')
  .map((source) => source.name));
const candidates = snapshot.candidates.map((story) => (
  !story.discoveryChannel && hackerNewsFeedNames.has(story.source)
    ? { ...story, discoveryChannel: 'hackernews' }
    : story
));
if (!candidates.length) throw new Error('Snapshot has no candidates');
const categoryOrder = [...new Set([
  ...(snapshot.sources ?? []).map((source) => source.category),
  ...candidates.map((story) => story.category),
])];

// Rebuild the old score, global order, and duplicate winners from raw candidates.
// This keeps the legacy baseline valid even when the snapshot was collected by the
// new ranker, whose saved `score`, `rank`, `dedupe`, and `selected` fields differ.
const legacyScored = candidates.map((story) => ({ ...story, legacyScore: legacyScore(story, snapshot.collectedAt) }));
const legacyOrdered = stableSort(legacyScored, (a, b) => b.legacyScore - a.legacyScore);
const legacyEligible = dedupeInRankOrder(legacyOrdered);
if (!legacyEligible.length) throw new Error('No candidates remain after recomputing legacy deduplication');
const legacySelected = selectByCategory(legacyEligible, categoryOrder, categoryLimit);
const legacySelectedKeys = new Set(legacySelected.map(keyOf));

// Both rankers use the same pool: all candidates after legacy URL/title dedupe.
const grouped = clusterStories(legacyEligible);
const clustersById = new Map(grouped.clusters.map((cluster) => [cluster.id, cluster]));
const rescored = grouped.stories.map((story, index) => {
  const enriched = { ...story, coveragePublisherCount: clustersById.get(story.eventClusterId)?.distinctPublisherCount ?? 1 };
  const result = rankStory(enriched, { collectedAt: snapshot.collectedAt, config });
  return { ...enriched, score: result.score, scoreBreakdown: result.scoreBreakdown, rankingReasons: result.rankingReasons, _inputIndex: index };
});
const newGlobalRanking = stableSort(rescored, (a, b) => numeric(b.score) - numeric(a.score));
const seenEvents = new Set();
const newEligible = newGlobalRanking.filter((story) => {
  if (!story.eventClusterId) return true;
  const key = `${story.category}:${story.eventClusterId}`;
  if (seenEvents.has(key)) return false;
  seenEvents.add(key);
  return true;
});
const newSelected = categoryOrder.flatMap((category) => {
  const categoryStories = newEligible.filter((story) => story.category === category);
  return orderCategoryWithDiversity(categoryStories, { limit: categoryLimit, config });
});
const newSelectedKeys = new Set(newSelected.map(keyOf));

const legacyByCategory = countsBy(legacySelected, (story) => story.category);
const newByCategory = countsBy(newSelected, (story) => story.category);
const categories = [...new Set([...categoryOrder, ...legacyByCategory.keys(), ...newByCategory.keys()])];
const overlap = [...legacySelectedKeys].filter((key) => newSelectedKeys.has(key)).length;

console.log(`Ranking comparison: ${basename(snapshotPath)}`);
console.log(`Collected: ${snapshot.collectedAt} | raw pool: ${candidates.length} | shared post-dedupe pool: ${legacyEligible.length}`);
console.log(`Selection: recomputed legacy ${legacySelected.length}, new ${newSelected.length}; overlap ${overlap}/${legacySelected.length} (${percent(overlap, legacySelected.length)}%)`);

console.log('\nBy category (selected count; legacy -> new; overlap):');
for (const category of categories) {
  const before = legacySelected.filter((story) => story.category === category);
  const after = newSelected.filter((story) => story.category === category);
  const shared = before.filter((story) => newSelectedKeys.has(keyOf(story))).length;
  console.log(`  ${category}: ${before.length} -> ${after.length}; shared ${shared}; +${after.length - shared}/-${before.length - shared}`);
}

console.log('\nSelected publisher exposure (publisher domain; legacy -> new):');
for (const publisher of unionSortedCounts(legacySelected, newSelected, (story) => publisherKey(story))) {
  console.log(`  ${publisher.name}: ${publisher.before} -> ${publisher.after}`);
}

console.log('\nSelected discovery-channel exposure (legacy -> new):');
for (const channel of unionSortedCounts(legacySelected, newSelected, (story) => story.discoveryChannel ?? story.source ?? 'unknown')) {
  console.log(`  ${channel.name}: ${channel.before} -> ${channel.after}`);
}

console.log(`\nTop ${topN} overall base ranking:`);
console.log('  Legacy:');
  printStories(legacyOrdered.slice(0, topN), (story) => story.legacyScore);
console.log('  New:');
printStories(newGlobalRanking.slice(0, topN), (story) => numeric(story.score));

console.log('\nSelection changes (category / title / source / score old -> new):');
for (const story of legacySelected.filter((item) => !newSelectedKeys.has(keyOf(item)))) {
  const updated = rescored.find((item) => keyOf(item) === keyOf(story));
  console.log(`  OUT ${story.category} | ${clip(story.title)} | ${story.source} | ${story.legacyScore} -> ${updated?.score ?? '—'}`);
}
for (const story of newSelected.filter((item) => !legacySelectedKeys.has(keyOf(item)))) {
  console.log(`  IN  ${story.category} | ${clip(story.title)} | ${story.source} | ${story.legacyScore} -> ${story.score}`);
}

console.log('\nTop category selections (new order):');
for (const category of categories) {
  const items = newSelected.filter((story) => story.category === category);
  if (!items.length) continue;
  console.log(`  ${category}:`);
  printStories(items, (story) => numeric(story.score));
}

console.log('\nMethod: offline only; scores recomputed from snapshot fields at its collectedAt timestamp.');
console.log('Legacy scores and duplicate winners are recomputed from every raw candidate; both rankers use that shared deduplicated pool.');
console.log(`New ranking groups likely events within the shared pool (${grouped.clusters.filter((c) => c.distinctPublisherCount > 1).length} multi-publisher groups); its coverage is not proof of independent reporting.`);
console.log('Publisher exposure is derived from linked URL domains. Discovery-channel exposure uses saved attribution; legacy Hacker News candidates are mapped from sources.kind=hackernews.');
console.log(snapshot.rankingConfig && !args.includes('--current-config')
  ? 'New ranking uses the config saved in the snapshot.'
  : 'New ranking uses the current configuration.');
console.log('No relevance labels exist; overlap and exposure describe ranking changes, not quality improvement.');

async function latestSnapshot(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No candidate snapshots found in ${directory}`);
  return resolve(directory, files.at(-1));
}

function selectByCategory(ordered, categoryNames, limit) {
  return categoryNames.flatMap((category) => {
    const stories = ordered.filter((story) => story.category === category);
    return stories.slice(0, limit);
  });
}

function legacyScore(story, collectedAt) {
  const now = Date.parse(collectedAt);
  const ageHours = story.publishedAt
    ? Math.max(0, (now - Date.parse(story.publishedAt)) / 3_600_000)
    : 168;
  const recency = Math.max(0, 60 - ageHours / 2);
  const hnScore = Number(story.hnScore);
  const engagement = hnScore ? Math.min(25, Math.log2(hnScore + 1) * 3) : 0;
  return Math.round(numeric(story.sourceWeight) * 8 + recency + engagement);
}

function dedupeInRankOrder(ordered) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  return ordered.filter((story) => {
    const url = normalizedUrl(story.url);
    const title = normalizeTitle(story.title);
    if (!title || seenUrls.has(url) || seenTitles.has(title)) return false;
    seenUrls.add(url);
    seenTitles.add(title);
    return true;
  });
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value ?? '').trim();
  }
}

function normalizeTitle(value = '') {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function stableSort(items, compare) {
  return items.map((value, index) => ({ value, index }))
    .sort((a, b) => compare(a.value, b.value) || a.index - b.index)
    .map(({ value }) => value);
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function keyOf(story) {
  return story.url;
}

function countsBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) counts.set(keyFn(item), (counts.get(keyFn(item)) ?? 0) + 1);
  return counts;
}

function unionSortedCounts(beforeItems, afterItems, keyFn) {
  const before = countsBy(beforeItems, keyFn);
  const after = countsBy(afterItems, keyFn);
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((name) => ({ name, before: before.get(name) ?? 0, after: after.get(name) ?? 0 }))
    .sort((a, b) => b.after - a.after || b.before - a.before || a.name.localeCompare(b.name));
}

function printStories(items, getScore) {
  for (const [index, story] of items.entries()) {
    console.log(`    ${String(index + 1).padStart(2)}. ${Number(getScore(story)).toFixed(2).replace(/\.00$/, '')} | ${story.category} | ${story.source} | ${clip(story.title)}`);
  }
}

function clip(value, length = 110) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function percent(value, total) {
  return total ? (100 * value / total).toFixed(1) : '0.0';
}
