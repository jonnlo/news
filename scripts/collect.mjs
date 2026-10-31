import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCollectionHasSuccess } from './collector-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const newsSettings = JSON.parse(await readFile(resolve(root, 'src/data/news-settings.json'), 'utf8'));
const feedList = newsSettings.categories
  .filter((category) => category.enabled)
  .flatMap((category) => category.sources
    .filter((source) => source.enabled)
    .map((source) => ({ ...source, category: category.name })));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const outputDir = outputArg ? resolve(outputArg) : resolve(root, 'src/data/editions');
const collectedAt = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(collectedAt);
const headers = { 'user-agent': 'PersonalNewsDigest/1.0 (+https://github.com; personal RSS reader)' };
const timeoutMs = 15_000;
const perSourceLimit = 20;
const vergeFeeds = ['tech', 'ai-artificial-intelligence', 'policy', 'science', 'reviews', 'games']
  .map((section) => `https://www.theverge.com/rss/${section}/index.xml`);

async function previousVergeStories() {
  try {
    const editions = (await readdir(outputDir)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name <= `${today}.json`).sort().reverse();
    for (const name of editions) {
      try {
        const edition = JSON.parse(await readFile(resolve(outputDir, name), 'utf8'));
        const stories = edition.sources?.find((source) => source.name === 'The Verge')?.stories;
        if (Array.isArray(stories) && stories.length) return stories;
      } catch { /* Try an earlier edition if this file cannot be read. */ }
    }
  } catch { /* There may not be an edition yet. */ }
  return [];
}
const savedVergeStories = await previousVergeStories();
// These publishers expose older, distinct RSS entries using WordPress pagination.
const extraFeedPages = new Map([
  ...['MIT Technology Review', 'Tricycle', 'Five Books', 'Daily Nous', 'The Millions',
    'Literary Hub', 'The Offing', 'Words Without Borders', 'Colossal', 'Noema',
    'JSTOR Daily', 'Lion’s Roar', 'Book Marks', 'Electric Literature'].map((name) => [name, 2]),
  ['Quanta Magazine', 4],
]);

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
    let sourceUrl;
    let discussionUrl;
    if (source.kind === 'hackernews') {
      try {
        const comments = new URL(decodeEntities(tag(item, ['comments'])));
        if (comments.origin === 'https://news.ycombinator.com' && comments.pathname === '/item') discussionUrl = comments.toString();
      } catch { /* HNRSS may omit a discussion link. */ }
    }
    if (source.name === 'Waxy') {
      try {
        const waxyUrl = new URL(decodeEntities(tag(item, ['comments'])));
        if (waxyUrl.protocol === 'https:' && waxyUrl.hostname === 'waxy.org') {
          waxyUrl.hash = '';
          sourceUrl = waxyUrl.toString();
        }
      } catch { /* The feed may omit its Waxy post permalink. */ }
    }
    return title && url ? {
      title, url, publishedAt, excerpt: source.kind === 'hackernews' ? '' : excerpt, source: source.name, category: source.category,
      ...(discussionUrl ? { discussionUrl } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
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

async function fetchText(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function collectSource(feed) {
  let stories;
  if (feed.name === '香港01') {
    const urls = [feed.url, 'https://rsshub.runnable.run/hk01/latest', 'https://rsshub.runnable.run/hk01/zone/1'];
    const responses = await Promise.allSettled(urls.map(async (url) => parseRss(await fetchText(url), feed)));
    stories = responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []);
    if (!stories.length) throw new Error('香港01 feeds returned no recognizable stories');
    stories = stories.map((story, index) => ({ ...story, _feedIndex: index }));
  } else if (feed.name === 'The Verge') {
    const responses = await Promise.allSettled([feed.url, ...vergeFeeds].map(async (url) => parseRss(await fetchText(url), feed)));
    const fetched = responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []);
    if (!fetched.length && !savedVergeStories.length) throw new Error('The Verge feeds returned no recognizable stories');
    if (!fetched.length) console.warn('The Verge feeds are unavailable; keeping stories from the previous edition.');
    const seen = new Set();
    stories = [...fetched, ...savedVergeStories].filter((story) => {
      try {
        const url = new URL(story.url);
        url.hash = '';
        url.search = '';
        const key = `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      } catch { return false; }
    }).map((story, index) => ({ ...story, _feedIndex: index }));
  } else if (feed.kind === 'nownews') {
    const response = await fetchJson(feed.url);
    const items = Array.isArray(response) ? response : response?.newsList;
    if (!Array.isArray(items)) throw new Error('Now News API returned an invalid response');
    stories = items.flatMap((item, index) => {
      if (!item?.newsId || !item?.title) return [];
      const date = new Date(item.publishDate);
      return [{
        title: decodeEntities(item.title),
        url: `https://news.now.com/home/local/player?newsId=${encodeURIComponent(item.newsId)}`,
        publishedAt: item.publishDate && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        excerpt: '', source: feed.name, category: feed.category, _feedIndex: index,
      }];
    });
  } else if (feed.kind === 'wordpress') {
    const response = await fetchJson(feed.url);
    if (!Array.isArray(response?.posts)) throw new Error('WordPress.com API returned an invalid response');
    stories = response.posts.flatMap((item, index) => {
      if (!item?.title || !item?.URL) return [];
      const date = item.date ? new Date(item.date) : null;
      return [{
        title: decodeEntities(item.title),
        url: item.URL,
        publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        excerpt: decodeEntities(item.excerpt ?? '').slice(0, 300),
        source: feed.name,
        category: feed.category,
        ...(feed.role ? { sourceRole: feed.role } : {}),
        _feedIndex: index,
      }];
    });
  } else {
    stories = parseRss(await fetchText(feed.url), feed);
    const pageCount = extraFeedPages.get(feed.name) ?? 1;
    if (stories.length < perSourceLimit && pageCount > 1) {
      const extraPages = await Promise.all(Array.from({ length: pageCount - 1 }, async (_, index) => {
        const url = new URL(feed.url);
        url.searchParams.set('paged', String(index + 2));
        try { return parseRss(await fetchText(url.toString()), feed); }
        catch { return []; } // Keep the primary feed if an older page is unavailable.
      }));
      stories.push(...extraPages.flat());
    }
    if (feed.kind === 'hackernews' && !stories.length) throw new Error('HNRSS returned no recognizable stories');
  }
  const orderedStories = sortNewestFirst(stories);
  const selected = sourceLocalDedupe(orderedStories).slice(0, perSourceLimit)
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
