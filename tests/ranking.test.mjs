import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRankingConfig, rankStory, orderCategoryWithDiversity, publisherKey } from '../scripts/ranking.mjs';

const config = await loadRankingConfig();
const now = '2026-10-29T00:00:00Z';
const base = { title: 'A story', excerpt: '', category: 'Design', sourceWeight: 3, publishedAt: '2026-10-28T00:00:00Z' };

test('freshness respects category and missing dates', () => {
  const design = rankStory(base, { collectedAt: now, config });
  const technology = rankStory({ ...base, category: 'Technology' }, { collectedAt: now, config });
  assert.ok(design.scoreBreakdown.recency > technology.scoreBreakdown.recency);
  assert.equal(rankStory({ ...base, publishedAt: null }, { collectedAt: now, config }).scoreBreakdown.recency, 0);
});

test('interest matching gives titles more weight and recognizes Chinese phrases', () => {
  const title = rankStory({ ...base, title: '無障礙設計實踐' }, { collectedAt: now, config });
  const excerpt = rankStory({ ...base, excerpt: '無障礙設計實踐' }, { collectedAt: now, config });
  assert.ok(title.scoreBreakdown.topicMatch > excerpt.scoreBreakdown.topicMatch);
  assert.ok(excerpt.scoreBreakdown.topicMatch > 0);
});

test('HN engagement is bounded and missing engagement remains neutral', () => {
  assert.equal(rankStory(base, { collectedAt: now, config }).scoreBreakdown.hnEngagement, 0);
  assert.equal(rankStory({ ...base, hnScore: 100000 }, { collectedAt: now, config }).scoreBreakdown.hnEngagement, config.score.hnEngagementCap);
});

test('cross-publisher coverage boosts current-affairs categories and is capped', () => {
  const story = { ...base, category: 'Technology' };
  const one = rankStory({ ...story, coveragePublisherCount: 1 }, { collectedAt: now, config });
  const two = rankStory({ ...story, coveragePublisherCount: 2 }, { collectedAt: now, config });
  const many = rankStory({ ...story, coveragePublisherCount: 100 }, { collectedAt: now, config });
  const essay = rankStory({ ...base, category: 'Literature', coveragePublisherCount: 10 }, { collectedAt: now, config });
  assert.equal(one.scoreBreakdown.coverage, 0);
  assert.equal(two.scoreBreakdown.coverage, config.coverage.firstAdditionalPublisher);
  assert.equal(many.scoreBreakdown.coverage, config.coverage.maxBonus);
  assert.ok(essay.scoreBreakdown.coverage > 0 && essay.scoreBreakdown.coverage < many.scoreBreakdown.coverage);
});

test('diversifies discovery channels within the score window without forcing stale stories', () => {
  const hn = Array.from({ length: 5 }, (_, i) => ({ title: `HN ${i}`, url: `https://hn-source-${i}.com/article`, discoveryChannel: 'hackernews', score: 40 - i / 10 }));
  const feeds = Array.from({ length: 4 }, (_, i) => ({ title: `RSS ${i}`, url: `https://publisher-${i}.com/article`, score: 38 - i / 10 }));
  const selected = orderCategoryWithDiversity([...hn, ...feeds], { limit: 6, config });
  assert.equal(selected.length, 6);
  assert.ok(selected.filter((s) => s.discoveryChannel === 'hackernews').length <= 3);
  const samePublisher = [{ title:'A',url:'https://x.com/a',score:40 },{ title:'B',url:'https://x.com/b',score:39 },{ title:'C',url:'https://x.com/c',score:38 },{ title:'Old',url:'https://y.com/old',score:1 }];
  const result = orderCategoryWithDiversity(samePublisher, { limit: 3, config });
  assert.ok(result.some((s) => s.title === 'C'));
  assert.ok(!result.some((s) => s.title === 'Old'));
});

test('publisher grouping uses linked domain rather than discovery channel', () => {
  assert.equal(publisherKey({ url: 'https://www.example.com/article', source: 'Hacker News' }), publisherKey({ url: 'https://blog.example.com/story', source: 'Example' }));
});


test('HN submission freshness is labeled separately from publication', () => {
  const result = rankStory({ ...base, publishedAt: null, submittedAt: '2026-10-28T00:00:00Z', discoveryChannel: 'hackernews' }, { collectedAt: now, config });
  assert.ok(result.scoreBreakdown.recency > 0);
  assert.ok(result.rankingReasons.includes('hn-submission-freshness'));
  assert.equal(rankStory({ ...base, publishedAt: null, submittedAt: '2026-10-28T00:00:00Z' }, { collectedAt: now, config }).scoreBreakdown.recency, 0);
});

test('curator diversity applies even when linked stories have different publishers', () => {
  const curated = Array.from({ length: 5 }, (_, i) => ({ title: `Link ${i}`, url: `https://publisher-${i}.com/article`, discoveryChannel: 'curator:Example', score: 40 - i / 10 }));
  const other = Array.from({ length: 4 }, (_, i) => ({ title: `Other ${i}`, url: `https://other-${i}.com/article`, score: 39 - i / 10 }));
  const selected = orderCategoryWithDiversity([...curated, ...other], { limit: 6, config });
  assert.equal(selected.filter((story) => story.discoveryChannel === 'curator:Example').length, 2);
});
