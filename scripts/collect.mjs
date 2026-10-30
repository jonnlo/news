import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCollectionHasSuccess } from './collector-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const feedList = JSON.parse(await readFile(resolve(root, 'scripts/feeds.json'), 'utf8'));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const outputDir = outputArg ? resolve(outputArg) : resolve(root, 'src/data/editions');
const collectedAt = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(collectedAt);
const headers = { 'user-agent': 'PersonalNewsDigest/1.0 (+https://github.com; personal RSS reader)' };
const timeoutMs = 15_000;
const perSourceLimit = 10;

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
  return blocks.map(([, item], index) => {
    const title = decodeEntities(tag(item, ['title']));
    const linkElement = item.match(/<link\b([^>]*)>([\s\S]*?)<\/link\s*>/i);
    const atomHref = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    const linkText = decodeEntities(linkElement?.[2] ?? '');
    const url = atomHref ?? (linkText || item.match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim());
    const rawDate = decodeEntities(tag(item, ['pubDate', 'published', 'updated', 'dc:date']));
    const publishedAt = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
    const excerpt = decodeEntities(tag(item, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 300);
    return title && url ? {
      title, url, publishedAt, excerpt, source: source.name, category: source.category,
      ...(source.role ? { sourceRole: source.role } : {}),
      ...(source.role === 'curator' ? { discoveryChannel: `curator:${source.name}` } : {}),
      _feedIndex: index,
    } : null;
  }).filter(Boolean);
}

function sortNewestFirst(stories) {
  return [...stories].sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : Number.NEGATIVE_INFINITY;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : Number.NEGATIVE_INFINITY;
    return bTime - aTime || a._feedIndex - b._feedIndex;
  });
}

function sourceLocalDedupe(stories) {
  const seen = new Set();
  return stories.filter((story) => {
    if (seen.has(story.url)) return false;
    seen.add(story.url);
    return true;
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function collectHackerNews(feed) {
  // The official newstories endpoint is ordered by newest submission first.
  // Fetch extra IDs so deleted, text-only, and URL-less items do not starve the source.
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/newstories.json');
  if (!Array.isArray(ids)) throw new Error('HN newstories endpoint returned an invalid response');
  const results = await Promise.all(ids.slice(0, 50).map(async (id, index) => {
    try {
      const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!item?.title || item.deleted || item.dead) return { ok: true, story: null };
      const discussionUrl = `https://news.ycombinator.com/item?id=${item.id}`;
      return {
        ok: true,
        story: {
          title: item.title,
          url: item.url || discussionUrl,
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
          excerpt: '',
          source: feed.name,
          category: feed.category,
          discussionUrl,
          _feedIndex: index,
        },
      };
    } catch (error) { return { ok: false, error }; }
  }));
  const successfulRequests = results.filter((result) => result.ok).length;
  if (ids.length > 0 && successfulRequests === 0) {
    throw results.find((result) => !result.ok)?.error ?? new Error('HN item requests failed');
  }
  return results.filter((result) => result.ok && result.story).map((result) => result.story);
}

async function fetchText(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function collectSource(feed) {
  const stories = feed.kind === 'hackernews'
    ? await collectHackerNews(feed)
    : parseRss(await fetchText(feed.url), feed);
  const selected = sourceLocalDedupe(sortNewestFirst(stories)).slice(0, perSourceLimit)
    .map(({ _feedIndex, ...story }) => story);
  return {
    name: feed.name,
    category: feed.category,
    kind: feed.kind,
    count: selected.length,
    stories: selected,
  };
}

const sourceErrors = [];
const sourceResults = await Promise.all(feedList.map(async (feed) => {
  try { return await collectSource(feed); }
  catch (error) {
    sourceErrors.push({ source: feed.name, error: error?.message ?? 'feed unavailable' });
    return { name: feed.name, category: feed.category, kind: feed.kind, count: 0, stories: [] };
  }
}));
// Promise callbacks append failures as they finish; keep diagnostics aligned with feed order.
sourceErrors.sort((a, b) => feedList.findIndex((feed) => feed.name === a.source) - feedList.findIndex((feed) => feed.name === b.source));
const output = resolve(outputDir, `${today}.json`);
assertCollectionHasSuccess(feedList.length, sourceErrors, output);
const stories = sourceResults.flatMap((source) => source.stories);

const snapshot = {
  version: 2,
  collectionMode: 'source-led',
  date: today,
  generatedAt: collectedAt.toISOString(),
  collectedAt: collectedAt.toISOString(),
  timezone: 'Asia/Hong_Kong',
  sourcesChecked: feedList.length,
  sourceErrors,
  sources: sourceResults,
  stories,
};

// Dated editions intentionally replace within the same Hong Kong day, so hourly
// collection refreshes the current view while earlier dates remain untouched.
await mkdir(outputDir, { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved ${stories.length} stories from ${sourceResults.filter((source) => source.count > 0).length} sources (${today}, Asia/Hong_Kong) to ${output}`);
console.log(`Sources: ${feedList.length - sourceErrors.length}/${feedList.length} succeeded; ${sourceErrors.length} failed.`);
for (const { source, error } of sourceErrors) console.log(`- ${source}: ${error}`);
