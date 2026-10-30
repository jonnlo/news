import { createHash } from 'node:crypto';
import { publisherKey } from './ranking.mjs';

// This module only groups obvious coverage of the same event. It does not assess
// whether outlets reported independently, and its metadata says so explicitly.
const DEFAULT_WINDOW_HOURS = 48;
const STOP_WORDS = new Set(`a an and are as at be by for from has have in into is it its of on or that the their this to was were will with after against amid around before between during over under`.split(' '));

export function normalizeEventUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.protocol = 'https:';
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|ref|source|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return '';
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function canonicalText(value = '') {
  return String(value).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function titleTerms(title = '') {
  const normalized = canonicalText(title);
  // Exact normalized titles are allowed for any script. Fuzzy matching CJK or
  // mixed-script headlines is intentionally disabled: short n-grams create noise.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)) {
    return { normalized, terms: null };
  }
  const terms = normalized.split(' ').filter((term) => term.length >= 4 && !STOP_WORDS.has(term));
  return { normalized, terms };
}

function publishedTime(story) {
  const time = Date.parse(story.publishedAt ?? '');
  return Number.isFinite(time) ? time : null;
}

function compatible(a, b, windowMs) {
  const ta = publishedTime(a.story);
  const tb = publishedTime(b.story);
  if (ta === null || tb === null || Math.abs(ta - tb) > windowMs) return null;
  const aTitle = a.title;
  const bTitle = b.title;
  if (!aTitle.normalized || !bTitle.normalized) return null;
  if (aTitle.normalized === bTitle.normalized) return { type: 'normalized-title', sharedTerms: [] };
  if (!aTitle.terms?.length || !bTitle.terms?.length) return null;

  const shared = [...new Set(aTitle.terms.filter((term) => bTitle.terms.includes(term)))].sort();
  const smallerSize = Math.min(new Set(aTitle.terms).size, new Set(bTitle.terms).size);
  const largerSize = Math.max(new Set(aTitle.terms).size, new Set(bTitle.terms).size);
  // Require several distinctive headline terms and substantial overlap. This
  // favors precision over catching paraphrases, especially on broad hot topics.
  if (shared.length < 4 || shared.length / smallerSize < 0.6 || shared.length / largerSize < 0.45) return null;
  return { type: 'shared-distinctive-title-terms', sharedTerms: shared };
}

/**
 * Return copied stories with conservative event metadata and the groups that
 * justify it. Same canonical URLs are recorded separately from event matches.
 * Event groups use complete-link admission, so an A~B and B~C chain cannot pull
 * a weakly related C into A's cluster.
 */
export function clusterStories(stories, { windowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const windowMs = Math.max(0, Number(windowHours) || 0) * 3_600_000;
  const prepared = stories.map((story, index) => ({
    story,
    index,
    url: normalizeEventUrl(story.url),
    title: titleTerms(story.title),
    publisher: publisherKey(story),
  }));
  const metadata = stories.map(() => ({ eventClusterId: null, sameUrlGroupId: null }));

  const byUrl = new Map();
  for (const item of prepared) {
    if (!item.url) continue;
    if (!byUrl.has(item.url)) byUrl.set(item.url, []);
    byUrl.get(item.url).push(item);
  }
  const sameUrlGroups = [...byUrl.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, members]) => {
      const id = `url-${digest(url)}`;
      for (const item of members) metadata[item.index].sameUrlGroupId = id;
      return {
        id,
        kind: 'same-url',
        storyIndices: members.map(({ index }) => index).sort((a, b) => a - b),
        canonicalUrl: url,
        publisherKeys: [...new Set(members.map(({ publisher }) => publisher))].sort(),
      distinctPublisherCount: new Set(members.map(({ publisher }) => publisher)).size,
        basis: 'canonical-url-match',
        reportingIndependence: 'not-assessed',
      };
    });

  // Stable greedy complete-link clustering. Sort by time, normalized title, then
  // input index. A candidate must match every member, not just the first match.
  const ordered = [...prepared].sort((a, b) =>
    (publishedTime(a.story) ?? Number.MAX_SAFE_INTEGER) - (publishedTime(b.story) ?? Number.MAX_SAFE_INTEGER)
    || a.title.normalized.localeCompare(b.title.normalized)
    || a.index - b.index,
  );
  const groups = [];
  for (const item of ordered) {
    let selected = null;
    for (const group of groups) {
      const matches = group.members.map((member) => compatible(item, member, windowMs));
      if (matches.every(Boolean)) {
        selected = { group, matches };
        break;
      }
    }
    if (selected) {
      selected.group.members.push(item);
      selected.group.matches.push(...selected.matches.map((match, i) => ({
        storyIndices: [item.index, selected.group.members[i].index].sort((a, b) => a - b),
        ...match,
      })));
    } else {
      groups.push({ members: [item], matches: [] });
    }
  }

  const eventGroups = groups.filter(({ members }) => members.length > 1).map(({ members, matches }) => {
    const storyIndices = members.map(({ index }) => index).sort((a, b) => a - b);
    const descriptor = members.map(({ url, title }) => url || title.normalized).sort().join('\n');
    const id = `event-${digest(descriptor)}`;
    for (const item of members) metadata[item.index].eventClusterId = id;
    const publisherKeys = [...new Set(members.map(({ publisher }) => publisher))].sort();
    return {
      id,
      kind: 'likely-same-event',
      storyIndices,
      publisherKeys,
      distinctPublisherCount: publisherKeys.length,
      matchEvidence: matches,
      basis: 'published-time-window-and-headline-similarity',
      reportingIndependence: 'not-assessed',
    };
  }).sort((a, b) => a.storyIndices[0] - b.storyIndices[0]);

  return {
    stories: stories.map((story, index) => ({ ...story, ...metadata[index] })),
    clusters: eventGroups,
    sameUrlGroups,
  };
}
