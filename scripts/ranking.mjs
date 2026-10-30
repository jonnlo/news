import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryFitAdjustment } from './editorial-fit.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

// Starting values are ranking hypotheses, not calibrated probabilities. The faster
// half-lives suit breaking-news sections; slower ones give essays, arts, and design
// pieces a fairer window. Tune against saved snapshots before treating differences as
// meaningful.
const defaults = {
  // Bump policyVersion whenever these category-level ranking choices change; the
  // effective config is stored with each candidate snapshot for later comparison.
  policyVersion: 5,
  score: { maxRecency: 40, sourceWeightStep: 0.8, hnEngagementCap: 4 },
  coverage: { categories: ['Technology', 'Design', 'Hong Kong', 'Society', 'Philosophy', 'Literature', 'Arts'], firstAdditionalPublisher: 8, additionalPublisher: 3, maxBonus: 14 },
  freshnessHalfLifeHours: {
    Technology: 24, Design: 240, 'Hong Kong': 36, Society: 96,
    Philosophy: 336, Literature: 336, Arts: 240,
  },
  topicMatch: { terms: [], maxBonus: 3, excerptWeight: 0.35 },
  categoryPolicies: {
    Technology: { mode: 'weak-interest-signal', topicMatchWeight: 1, coverageWeight: 1 },
    Design: { mode: 'weak-interest-signal', topicMatchWeight: 1, coverageWeight: 0.35 },
    'Hong Kong': { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 1 },
    Society: { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 1 },
    Philosophy: { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 0.35 },
    Literature: { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 0.35 },
    Arts: { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 0.35 },
    Discover: { mode: 'broad-exploration', topicMatchWeight: 0.2, coverageWeight: 0 },
  },
  diversity: { maxPerPublisher: 2, repeatPenalty: 3, maxScoreGap: 10, discoveryChannelCaps: { hackernews: 3 } },
  selection: { perCategory: 10 },
};

function mergeConfig(base, override = {}) {
  return {
    ...base,
    ...override,
    score: { ...base.score, ...override.score },
    coverage: { ...base.coverage, ...override.coverage },
    freshnessHalfLifeHours: { ...base.freshnessHalfLifeHours, ...override.freshnessHalfLifeHours },
    topicMatch: { ...base.topicMatch, ...override.topicMatch },
    categoryPolicies: {
      ...base.categoryPolicies,
      ...Object.fromEntries(Object.entries(override.categoryPolicies ?? {}).map(([category, policy]) => [
        category, { ...base.categoryPolicies?.[category], ...policy },
      ])),
    },
    diversity: { ...base.diversity, ...override.diversity },
    selection: { ...base.selection, ...override.selection },
  };
}

export async function loadRankingConfig(override) {
  const fileConfig = JSON.parse(await readFile(resolve(scriptDir, 'ranking-config.json'), 'utf8'));
  return mergeConfig(mergeConfig(defaults, fileConfig), override);
}

export function normalizeTitle(value = '') {
  return value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Unicode properties preserve titles in any script. CJK runs have no spaces, so add
// overlapping bigrams as usable topic/dedupe units alongside normal word tokens.
export function titleTokens(value = '') {
  const normalized = normalizeTitle(value);
  const tokens = new Set(normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu) ?? []) {
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
  }
  return tokens;
}

function topicBonus(story, config) {
  const terms = Array.isArray(config.topicMatch.terms) ? config.topicMatch.terms : [];
  const eligibleTerms = terms.filter((entry) => typeof entry === 'string' || entry?.term)
    .map((entry) => typeof entry === 'string' ? { term: entry, categories: null } : entry)
    .filter(({ categories }) => !categories?.length || categories.includes(story.category));
  if (!eligibleTerms.length) return { value: 0, matches: [] };

  const title = normalizeTitle(story.title);
  const excerpt = normalizeTitle(story.excerpt ?? '');
  const titleTokensSet = titleTokens(story.title);
  const excerptTokensSet = titleTokens(story.excerpt ?? '');
  const matches = eligibleTerms.map(({ term, weight = 1 }) => {
    const normalizedTerm = normalizeTitle(term);
    if (!normalizedTerm) return null;
    const cjkTerm = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalizedTerm);
    const matchesText = (text, tokens) => cjkTerm
      ? text.includes(normalizedTerm)
      : normalizedTerm.includes(' ')
        ? ` ${text} `.includes(` ${normalizedTerm} `)
        : tokens.has(normalizedTerm);
    if (matchesText(title, titleTokensSet)) return { term, weight: Number(weight) || 1, field: 'title' };
    if (matchesText(excerpt, excerptTokensSet)) return { term, weight: Number(weight) || 1, field: 'excerpt' };
    return null;
  }).filter(Boolean);
  const excerptWeight = Math.max(0, Number(config.topicMatch.excerptWeight) || 0);
  const rawBonus = matches.reduce((sum, match) => sum + match.weight * (match.field === 'title' ? 1 : excerptWeight), 0);
  const policy = config.categoryPolicies?.[story.category] ?? {};
  const categoryWeight = Math.max(0, Number(policy.topicMatchWeight ?? 1) || 0);
  const maxBonus = Math.max(0, Number(config.topicMatch.maxBonus) || 0);
  // Title terms count fully; excerpt terms are a smaller hint. Both saturate at the
  // configured cap, so keyword density cannot overwhelm freshness.
  return { value: Math.min(maxBonus, rawBonus) * categoryWeight, matches };
}

function sourceDomain(url) {
  try {
    const labels = new URL(url).hostname.toLowerCase().replace(/^www\./, '').split('.');
    // Approximate the registrable domain for common multi-label public suffixes so
    // feeds on `feeds.publisher.com` and HN links to `publisher.com` share a bucket.
    const suffix2 = labels.slice(-2).join('.');
    const multiLabelSuffixes = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'com.hk', 'org.hk', 'gov.hk', 'com.sg', 'com.tw', 'co.nz']);
    const count = multiLabelSuffixes.has(suffix2) ? 3 : 2;
    return labels.slice(-count).join('.');
  } catch {
    return '';
  }
}

export function publisherKey(story) {
  // HN is a discovery channel; its linked publisher, not Hacker News itself, defines
  // diversity. Other feeds also share a publisher bucket when they share a hostname.
  return sourceDomain(story.url) || story.source || 'unknown-publisher';
}

function discoveryChannel(story) {
  // The fallback also lets the ranker apply its HN cap to older snapshots created
  // before discovery-channel metadata was added to candidate records.
  return story.discoveryChannel ?? (story.source === 'Hacker News' ? 'hackernews' : undefined);
}

export function rankStory(story, { collectedAt = new Date(), config = defaults } = {}) {
  const merged = mergeConfig(defaults, config);
  const now = collectedAt instanceof Date ? collectedAt.getTime() : Date.parse(collectedAt);
  const publication = story.publishedAt ? Date.parse(story.publishedAt) : NaN;
  const submission = discoveryChannel(story) === 'hackernews' && story.submittedAt ? Date.parse(story.submittedAt) : NaN;
  const published = Number.isFinite(publication) ? publication : submission;
  const ageHours = Number.isFinite(published) && Number.isFinite(now)
    ? Math.max(0, (now - published) / 3_600_000)
    : null;
  const halfLife = Math.max(1, Number(merged.freshnessHalfLifeHours[story.category]) || 168);
  const recency = ageHours === null ? 0 : merged.score.maxRecency * (0.5 ** (ageHours / halfLife));
  const weight = Number(story.sourceWeight);
  // Center the tiny source prior on the configured feed's typical 3/5 weight.
  const sourcePreference = Number.isFinite(weight) ? (weight - 3) * merged.score.sourceWeightStep : 0;
  const hnScore = Number(story.hnScore);
  // Missing HN engagement is neutral (zero bonus); popularity can add only a small,
  // bounded signal. Non-HN stories carry no engagement adjustment.
  const engagement = Number.isFinite(hnScore) && hnScore > 0
    ? Math.min(merged.score.hnEngagementCap, Math.log2(hnScore + 1))
    : 0;
  const topic = topicBonus(story, merged);
  const coverageCount = Number(story.coveragePublisherCount) || 0;
  const categoryPolicy = merged.categoryPolicies?.[story.category] ?? {};
  const coverage = merged.coverage.categories.includes(story.category) && coverageCount >= 2
    ? Math.min(merged.coverage.maxBonus, merged.coverage.firstAdditionalPublisher + (coverageCount - 2) * merged.coverage.additionalPublisher)
      * Math.max(0, Number(categoryPolicy.coverageWeight ?? 1) || 0)
    : 0;
  const editorialFit = Number(merged.policyVersion) >= 5 ? categoryFitAdjustment(story) : { penalty: 0, reasons: [] };
  const scoreBreakdown = {
    recency: Number(recency.toFixed(2)), sourcePreference: Number(sourcePreference.toFixed(2)),
    topicMatch: Number(topic.value.toFixed(2)), hnEngagement: Number(engagement.toFixed(2)),
    coverage: Number(coverage.toFixed(2)), editorialFit: -editorialFit.penalty,
  };
  const score = Number(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0).toFixed(2));
  const rankingReasons = [];
  if (ageHours !== null) rankingReasons.push(Number.isFinite(publication)
    ? `freshness-${story.category ?? 'default'}-half-life` : 'hn-submission-freshness');
  if (sourcePreference) rankingReasons.push('modest-source-preference');
  if (topic.matches.length) {
    const titleTerms = topic.matches.filter((match) => match.field === 'title').map((match) => match.term);
    const excerptTerms = topic.matches.filter((match) => match.field === 'excerpt').map((match) => match.term);
    if (titleTerms.length) rankingReasons.push(`topic-title-match:${titleTerms.join(',')}`);
    if (excerptTerms.length) rankingReasons.push(`topic-excerpt-match:${excerptTerms.join(',')}`);
  }
  if (engagement) rankingReasons.push('capped-hn-engagement');
  if (coverage) rankingReasons.push(`coverage:${coverageCount}-publisher-domains`);
  rankingReasons.push(...editorialFit.reasons.map((reason) => `editorial-fit:${reason}`));
  if (categoryPolicy.mode === 'broad-exploration') rankingReasons.push('category-broad-exploration');
  if (categoryPolicy.mode === 'weak-interest-signal') rankingReasons.push('category-weak-interest-evidence');
  if (!rankingReasons.length) rankingReasons.push('neutral-ranking-signals');
  return { score, scoreBreakdown, rankingReasons };
}

export function orderCategoryWithDiversity(stories, { limit = 6, config = defaults } = {}) {
  const merged = mergeConfig(defaults, config);
  const remaining = [...stories];
  const ordered = [];
  const counts = new Map();
  const channelCounts = new Map();
  const maxPerPublisher = Math.max(1, Number(merged.diversity.maxPerPublisher) || 2);
  const penalty = Math.max(0, Number(merged.diversity.repeatPenalty) || 0);
  const maxScoreGap = Math.max(0, Number(merged.diversity.maxScoreGap) || 0);
  const channelCaps = merged.diversity.discoveryChannelCaps ?? {};

  while (remaining.length && ordered.length < limit) {
    const bestScore = Math.max(...remaining.map((story) => Number(story.score) || 0));
    // Apply a quality window before diversity. A cap cannot force selection of a
    // materially weaker story; values are provisional and should be checked in snapshots.
    const qualityPool = remaining.filter((story) => (Number(story.score) || 0) >= bestScore - maxScoreGap);
    const eligible = qualityPool.filter((story) => {
      const publisherAvailable = (counts.get(publisherKey(story)) ?? 0) < maxPerPublisher;
      const channel = discoveryChannel(story);
      const channelCap = channel?.startsWith('curator:') ? Number(merged.diversity.maxPerCurator ?? 2) : channel ? Number(channelCaps[channel]) : NaN;
      const channelAvailable = !Number.isFinite(channelCap) || (channelCounts.get(channel) ?? 0) < channelCap;
      return publisherAvailable && channelAvailable;
    });
    // If diversity caps leave no candidate inside the quality window, relax the caps
    // and choose the strongest candidate there instead of leaving a vacancy.
    const pool = eligible.length ? eligible : qualityPool;
    pool.sort((a, b) => {
      const scoreA = Number(a.score) || 0;
      const scoreB = Number(b.score) || 0;
      const adjustedA = scoreA - (counts.get(publisherKey(a)) ?? 0) * penalty;
      const adjustedB = scoreB - (counts.get(publisherKey(b)) ?? 0) * penalty;
      const lexicalA = String(a.title);
      const lexicalB = String(b.title);
      return adjustedB - adjustedA || scoreB - scoreA || (lexicalA < lexicalB ? -1 : lexicalA > lexicalB ? 1 : 0);
    });
    const chosen = pool[0];
    const relaxedCaps = !eligible.length;
    const publisherBlockedAlternative = qualityPool.some((story) =>
      (counts.get(publisherKey(story)) ?? 0) >= maxPerPublisher,
    );
    const channelBlockedAlternative = qualityPool.some((story) => {
      const channel = discoveryChannel(story);
      const channelCap = channel?.startsWith('curator:') ? Number(merged.diversity.maxPerCurator ?? 2) : channel ? Number(channelCaps[channel]) : NaN;
      return Number.isFinite(channelCap)
        && (channelCounts.get(channel) ?? 0) >= channelCap;
    });
    const channel = discoveryChannel(chosen);
    chosen.selectionReason = relaxedCaps
      ? 'diversity-cap-relaxed-within-score-window'
      : channelBlockedAlternative
        ? 'discovery-channel-cap'
        : publisherBlockedAlternative
          ? 'publisher-diversity-cap'
          : 'score-order-within-window';
    remaining.splice(remaining.indexOf(chosen), 1);
    ordered.push(chosen);
    const key = publisherKey(chosen);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (channel) channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }
  return ordered;
}
