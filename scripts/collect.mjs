import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCollectionHasSuccess, fetchWithRetry, loadPreviousSources, retainPreviousSource } from './collector-utils.mjs';

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

const previousSources = await loadPreviousSources([outputDir, resolve(root, 'src/data/editions')], today);
const savedVergeStories = previousSources.get('The Verge')?.stories ?? [];
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

function htmlAttribute(tagText, name) {
  return tagText.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
}

function htmlMeta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = tags.find((entry) =>
    htmlAttribute(entry, 'property').toLowerCase() === key.toLowerCase()
    || htmlAttribute(entry, 'name').toLowerCase() === key.toLowerCase());
  return meta ? decodeEntities(htmlAttribute(meta, 'content')) : '';
}

async function collectSitemap(feed) {
  const xml = await fetchText(feed.url);
  const entries = [...xml.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/gi)].map(([, entry]) => ({
    url: decodeEntities(tag(entry, ['loc'])),
    lastmod: decodeEntities(tag(entry, ['lastmod'])),
  })).filter((entry) => entry.url && new URL(entry.url).hostname === 'humanistreview.ai');
  const fetched = await Promise.allSettled(entries.map(async (entry, index) => {
    const html = await fetchText(entry.url);
    const title = htmlMeta(html, 'og:title') || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    if (!title) return null;
    const date = htmlMeta(html, 'article:published_time') || entry.lastmod;
    return {
      title: decodeEntities(title).replace(/\s*\|\s*The Humanist Review(?: of AI)?\s*$/i, ''),
      url: entry.url,
      publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
      excerpt: (htmlMeta(html, 'og:description') || htmlMeta(html, 'description')).slice(0, 300),
      source: feed.name,
      category: feed.category,
      sourceRole: feed.role,
      _feedIndex: index,
    };
  }));
  const stories = fetched.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
  if (!stories.length) throw new Error('Article sitemap returned no recognizable stories');
  return stories;
}

function parseRss(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)];
  return blocks.map(([, item], index) => {
    const title = decodeEntities(tag(item, ['title']));
    const linkElement = item.match(/<link\b([^>]*)>([\s\S]*?)<\/link\s*>/i);
    const atomHref = item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    const linkText = decodeEntities(linkElement?.[2] ?? '');
    let url = atomHref ?? (linkText || item.match(/<guid\b[^>]*>([\s\S]*?)<\/guid>/i)?.[1]?.trim());
    const rawDate = decodeEntities(tag(item, ['pubDate', 'published', 'updated', 'dc:date']));
    const publishedAt = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : null;
    const excerpt = decodeEntities(tag(item, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 300);
    let sourceUrl;
    let discussionUrl;
    if (source.name === 'Techmeme') {
      // The bold headline anchor identifies the original article, whereas other
      // description links can point to publisher homepages or related coverage.
      const description = tag(item, ['description']).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      const headlineHref = description.match(/<b\b[^>]*>\s*<a\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];
      try {
        const original = new URL(decodeEntities(headlineHref));
        if (['https:', 'http:'].includes(original.protocol) && !/(^|\.)techmeme\.com$/i.test(original.hostname)) {
          sourceUrl = url;
          url = original.toString();
        }
      } catch { /* Keep the Techmeme permalink when no usable original link exists. */ }
    }
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

function isWiredCouponCodePage(story) {
  if (String(story.source ?? '').toLocaleLowerCase() !== 'wired') return false;

  const codePhrase = /\b(?:promo(?:tional)?|coupon|discount)[\s-]*codes?\b/i;
  let urlText = '';
  try {
    urlText = new URL(story.url).pathname.replace(/[-_]+/g, ' ');
  } catch { /* Title and excerpt still provide usable signals for malformed URLs. */ }

  // WIRED's coupon landing pages use stable, explicit URL slugs. Also catch
  // equivalent pages when the URL is less descriptive but text says so.
  return codePhrase.test(urlText)
    || codePhrase.test(String(story.title ?? ''))
    || codePhrase.test(String(story.excerpt ?? ''));
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchText(url) {
  return fetchWithRetry(url, {
    headers, timeoutMs,
    onRetry: ({ url, attempt, error }) => console.warn(`Retrying ${url} after attempt ${attempt}/3 (${error.message}).`),
  });
}

async function collectSource(feed) {
  let stories;
  if (feed.kind === 'sitemap') {
    stories = await collectSitemap(feed);
  } else if (feed.name === '香港01') {
    const urls = [feed.url, 'https://rsshub.runnable.run/hk01/latest', 'https://rsshub.runnable.run/hk01/zone/1'];
    const responses = await Promise.allSettled(urls.map(async (url) => parseRss(await fetchText(url), feed)));
    stories = responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []);
    if (!stories.length) throw new Error('香港01 feeds returned no recognizable stories');
    stories = stories.map((story, index) => ({ ...story, _feedIndex: index }));
  } else if (feed.name === 'The Verge') {
    const responses = await Promise.allSettled([feed.url, ...vergeFeeds].map(async (url) => parseRss(await fetchText(url), feed)));
    const fetched = responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []);
    if (!fetched.length) throw new Error('The Verge feeds returned no recognizable stories');
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
  } else if (feed.kind === 'rss' && feed.additionalFeedUrls?.length) {
    const urls = [...new Set([feed.url, ...feed.additionalFeedUrls])];
    const responses = await Promise.allSettled(urls.map(async (url) => {
      const parsed = parseRss(await fetchText(url), feed);
      if (!parsed.length) throw new Error('Feed returned no recognizable stories');
      return parsed;
    }));
    stories = responses.flatMap((response) => response.status === 'fulfilled' ? response.value : []);
    if (!stories.length) throw new Error(`${feed.name} feeds returned no recognizable stories`);
    responses.forEach((response, index) => {
      if (response.status === 'rejected') console.warn(`${feed.name}: ${urls[index]} unavailable (${response.reason?.message ?? 'feed unavailable'}); keeping other section feeds.`);
    });
    stories = stories.map((story, index) => ({ ...story, _feedIndex: index }));
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
  const selected = sourceLocalDedupe(orderedStories)
    .filter((story) => !isWiredCouponCodePage(story))
    .slice(0, perSourceLimit)
    .map(({ _feedIndex, ...story }) => story);
  if (!selected.length) throw new Error('Source returned no recognizable stories');
  return {
    name: feed.name,
    category: feed.category,
    kind: feed.kind,
    count: selected.length,
    stories: selected,
    lastSuccessfulAt: collectedAt.toISOString(),
  };
}

const sourceErrors = [];
const sourceResults = await Promise.all(feedList.map(async (feed) => {
  try { return await collectSource(feed); }
  catch (error) {
    sourceErrors.push({ source: feed.name, error: error?.message ?? 'feed unavailable' });
    const retained = retainPreviousSource(feed, previousSources.get(feed.name));
    if (retained.retained) console.warn(`${feed.name}: refresh failed; retaining ${retained.count} saved stories (${retained.lastSuccessfulAt}).`);
    return retained;
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
  sourcesUpdated: feedList.length - sourceErrors.length,
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
console.log(`Retained saved stories for ${sourceResults.filter((source) => source.retained).length} sources.`);
for (const { source, error } of sourceErrors) console.log(`- ${source}: ${error}`);
