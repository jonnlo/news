import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRankingConfig, normalizeTitle, orderCategoryWithDiversity, publisherKey, rankStory } from './ranking.mjs';
import { clusterStories, normalizeEventUrl } from './events.mjs';
import { fetchBestIds } from './hn-best.mjs';
import { classifyHnTitle } from './hn-classify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feedList = JSON.parse(await readFile(resolve(root, 'scripts/feeds.json'), 'utf8'));
const rankingConfig = await loadRankingConfig();
const categoryLimit = Number(rankingConfig.selection.perCategory);
if (!Number.isInteger(categoryLimit) || categoryLimit < 1 || categoryLimit > 50) {
  throw new Error('ranking-config.json selection.perCategory must be an integer from 1 to 50');
}
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const outputDir = outputArg ? resolve(outputArg) : resolve(root, 'src/data/editions');
const candidateDir = outputArg ? resolve(outputDir, 'candidates') : resolve(root, 'data/candidates');
const collectedAt = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(collectedAt);
const headers = { 'user-agent': 'PersonalNewsDigest/1.0 (+https://github.com; personal RSS reader)' };
const timeoutMs = 15_000;

function decodeEntities(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(item, names) {
  for (const name of names) {
    const match = item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return match[1];
  }
  return '';
}

function parseRss(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.map(([, item]) => {
    const title = decodeEntities(tag(item, ['title']));
    const linkElement = item.match(/<link\b([^>]*)>([\s\S]*?)<\/link\s*>/i);
    const atomHref = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    const linkText = decodeEntities(linkElement?.[2] ?? '');
    const url = atomHref ?? linkText ?? item.match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim();
    const rawDate = decodeEntities(tag(item, ['pubDate', 'published', 'updated', 'dc:date']));
    const date = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
    const excerpt = decodeEntities(tag(item, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 300);
    return title && url ? { title, url, publishedAt: date, excerpt, source: source.name, category: source.category, sourceWeight: source.weight, ...(source.role ? { sourceRole: source.role } : {}), ...(source.role === 'curator' ? { discoveryChannel: `curator:${source.name}` } : {}) } : null;
  }).filter(Boolean);
}

async function fetchText(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function collectFeed(feed) {
  if (feed.kind === 'hackernews') {
    const ids = await fetchBestIds(feed.url, fetchText, 35);
    const items = await Promise.all(ids.slice(0, 35).map(async (id) => {
      try {
        const item = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          headers, signal: AbortSignal.timeout(timeoutMs),
        }).then((r) => r.ok ? r.json() : null);
        if (!item?.title || !item.url) return null;
        return {
          title: item.title, url: item.url, publishedAt: null,
          submittedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
          excerpt: `${item.score ?? 0} points · ${item.descendants ?? 0} comments on Hacker News`,
          discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`,
          source: feed.name, category: feed.category, sourceWeight: feed.weight,
          discoveryChannel: 'hackernews', hnScore: item.score ?? 0,
        };
      } catch { return null; }
    }));
    return items.filter(Boolean);
  }
  return parseRss(await fetchText(feed.url), feed);
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch { return value.trim(); }
}

const sourceErrors = [];
const settled = await Promise.allSettled(feedList.map(async (feed) => ({ feed, stories: await collectFeed(feed) })));
const fetched = [];
for (let i = 0; i < settled.length; i++) {
  const result = settled[i];
  if (result.status === 'fulfilled') fetched.push(...result.value.stories);
  else sourceErrors.push(`${feedList[i].name}: ${result.reason?.message ?? 'feed unavailable'}`);
}

// A matching publisher feed is stronger topical evidence than title heuristics.
const feedByUrl = new Map();
for (const story of fetched.filter((item) => item.discoveryChannel !== 'hackernews')) {
  const url = normalizeEventUrl(story.url);
  if (!url) continue;
  const matches = feedByUrl.get(url) ?? [];
  matches.push(story);
  feedByUrl.set(url, matches);
}
for (const story of fetched.filter((item) => item.discoveryChannel === 'hackernews')) {
  const matches = feedByUrl.get(normalizeEventUrl(story.url)) ?? [];
  const categories = [...new Set(matches.map((item) => item.category))];
  const classification = classifyHnTitle(story);
  if (categories.length === 1) {
    story.category = categories[0];
    story.categoryBasis = 'matched-publisher-feed';
    const dates = [...new Set(matches.map((item) => item.publishedAt).filter(Boolean))];
    if (dates.length === 1) story.publishedAt = dates[0];
  } else {
    story.category = classification.category ?? 'Discover';
    story.categoryBasis = classification.category ? 'title-rules' : 'unclassified';
    story.categoryEvidence = classification.evidence;
  }
}

const seenUrls = new Set();
const seenTitles = new Set();
const seenEvents = new Set();
const decisions = new Map();
const clustered = clusterStories(fetched);
const eventsById = new Map(clustered.clusters.map((cluster) => [cluster.id, cluster]));
const candidates = clustered.stories.map((story) => ({
  ...story,
  publisherDomain: publisherKey(story),
  coveragePublisherCount: eventsById.get(story.eventClusterId)?.distinctPublisherCount ?? 1,
})).map((story) => ({
  ...story,
  ...rankStory(story, { collectedAt, config: rankingConfig }),
}));
const stories = [...candidates].sort((a, b) => b.score - a.score)
  .filter((story, index) => {
    const url = normalizeEventUrl(story.url) || normalizedUrl(story.url);
    const title = normalizeTitle(story.title);
    const eventKey = story.eventClusterId ? `${story.category}:${story.eventClusterId}` : null;
    const reason = seenUrls.has(url) ? 'duplicate-url' : !title ? 'empty-title' : seenTitles.has(title) ? 'duplicate-title' : eventKey && seenEvents.has(eventKey) ? 'same-event' : null;
    decisions.set(story, { rank: index + 1, dedupe: reason ?? 'eligible' });
    if (reason) return false;
    seenUrls.add(url);
    seenTitles.add(title);
    if (eventKey) seenEvents.add(eventKey);
    return true;
  });

// Resolve original-page Open Graph images for the leading stories only; an unavailable
// or blocked page simply leaves the image out of the edition.
async function fetchOgImage(story) {
  try {
    const response = await fetch(story.url, { headers, signal: AbortSignal.timeout(8_000), redirect: 'follow' });
    if (!response.ok) return;
    const html = await response.text();
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html.slice(0, 40_000);
    const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map(([meta]) => meta);
    const image = metas.map((meta) => {
      const property = meta.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (property !== 'og:image' && property !== 'og:image:url') return null;
      return meta.match(/content=["']([^"']+)["']/i)?.[1];
    }).find(Boolean);
    if (image) story.image = new URL(image, response.url).toString();
  } catch { /* Image omission is expected for blocked, slow, or non-HTML publishers. */ }
}

// Give each curated section room in the edition, with a per-publisher cap and a
// fallback that fills the section when it has too few distinct publishers.
const categoryOrder = ['Technology', 'Design', 'Hong Kong', 'Society', 'Philosophy', 'Literature', 'Arts', 'Discover'];
const selectedByCategory = new Map(categoryOrder.map((category) => [
  category,
  orderCategoryWithDiversity(stories.filter((story) => story.category === category), { limit: categoryLimit, config: rankingConfig }),
]));
const featured = categoryOrder.flatMap((category) => selectedByCategory.get(category)).sort((a, b) => b.score - a.score);
const selected = new Set(featured);
for (const story of featured) {
  // Retain links to other reports from a confident event group, and to HN
  // discussion when it points to the same article. Domain counts are not proof
  // of independent reporting or verification.
  const sameUrl = normalizeEventUrl(story.url);
  const group = eventsById.get(story.eventClusterId);
  const related = group ? group.storyIndices.map((index) => candidates[index]) : [];
  const duplicates = clustered.sameUrlGroups.find((item) => item.id === story.sameUrlGroupId);
  const duplicateStories = duplicates ? duplicates.storyIndices.map((index) => candidates[index]) : [];
  story.discussionUrl ??= [...related, ...duplicateStories].find((item) =>
    item.discussionUrl && normalizeEventUrl(item.url) === sameUrl
  )?.discussionUrl;
  const seenRelated = new Set([sameUrl]);
  story.relatedSources = related.filter((item) => {
    const url = normalizeEventUrl(item.url);
    if (!url || seenRelated.has(url)) return false;
    seenRelated.add(url);
    return true;
  }).map((item) => ({ source: item.source === 'Hacker News' ? item.publisherDomain : item.source, url: item.url, title: item.title }));
  const position = selectedByCategory.get(story.category).indexOf(story) + 1;
  decisions.set(story, { ...decisions.get(story), selectionRank: position, selectionReason: story.selectionReason });
}
const candidateSnapshot = {
  version: 1,
  rankingVersion: 'category-discovery-v5',
  date: today,
  collectedAt: collectedAt.toISOString(),
  timezone: 'Asia/Hong_Kong',
  sourcesChecked: feedList.length,
  sources: feedList,
  rankingConfig,
  sourceErrors,
  eventClusters: clustered.clusters,
  sameUrlGroups: clustered.sameUrlGroups,
  candidates: candidates.map((story) => ({
    ...story,
    ...decisions.get(story),
    ...(decisions.get(story)?.dedupe === 'eligible' && !selected.has(story)
      ? { selectionReason: `category-limit-${categoryLimit}` }
      : {}),
    selected: selected.has(story),
  })),
};
await mkdir(candidateDir, { recursive: true });
const candidateOutput = resolve(candidateDir, `${collectedAt.toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(candidateOutput, `${JSON.stringify(candidateSnapshot, null, 2)}\n`);
for (let i = 0; i < featured.length; i += 5) {
  await Promise.all(featured.slice(i, i + 5).map(fetchOgImage));
}

const edition = {
  date: today,
  generatedAt: new Date().toISOString(),
  timezone: 'Asia/Hong_Kong',
  stories: featured.map(({ title, url, source, category, publishedAt, excerpt, image, score, discussionUrl, relatedSources }) => ({
    title, url, source, category, publishedAt, excerpt,
    ...(image ? { image } : {}), ...(discussionUrl ? { discussionUrl } : {}),
    ...(relatedSources?.length ? { relatedSources } : {}), score,
  })),
  sourcesChecked: feedList.length,
  sourceErrors,
};
await mkdir(outputDir, { recursive: true });
const output = resolve(outputDir, `${today}.json`);
await writeFile(output, `${JSON.stringify(edition, null, 2)}\n`);
console.log(`Saved ${edition.stories.length} stories (${edition.date}, Asia/Hong_Kong) to ${output}`);
console.log(`Saved ${candidates.length} candidates to ${candidateOutput}`);
console.log(`Sources: ${feedList.length - sourceErrors.length}/${feedList.length} succeeded; ${sourceErrors.length} failed.`);
if (sourceErrors.length) for (const error of sourceErrors) console.log(`- ${error}`);
