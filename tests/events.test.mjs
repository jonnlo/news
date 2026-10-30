import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterStories, normalizeEventUrl } from '../scripts/events.mjs';

const item = (title, url, publishedAt = '2026-10-29T00:00:00Z', extras = {}) => ({
  title, url, publishedAt, category: 'Technology', source: new URL(url).hostname, excerpt: '', ...extras,
});

test('clusters matching event headlines from different publishers and records evidence', () => {
  const stories = [
    item('OpenAI launches new Atlas browser with AI agents', 'https://example.com/atlas'),
    item('OpenAI launches new Atlas browser for AI agents', 'https://news.example.net/atlas', '2026-10-29T12:00:00Z'),
  ];
  const result = clusterStories(stories);
  assert.equal(result.clusters.length, 1);
  assert.deepEqual(result.clusters[0].storyIndices, [0, 1]);
  assert.equal(result.clusters[0].kind, 'likely-same-event');
  assert.equal(result.clusters[0].reportingIndependence, 'not-assessed');
  assert.ok(result.clusters[0].matchEvidence[0].sharedTerms.includes('atlas'));
  assert.equal(result.stories[0].eventClusterId, result.stories[1].eventClusterId);
});

test('does not merge broad topic overlap or headlines outside the time window', () => {
  const stories = [
    item('OpenAI releases new model for developers', 'https://one.example/a'),
    item('Google releases new model for developers', 'https://two.example/b'),
    item('OpenAI releases new model for developers', 'https://three.example/c', '2026-11-02T00:01:00Z'),
  ];
  const result = clusterStories(stories);
  assert.equal(result.clusters.length, 0);
  assert.ok(result.stories.every((story) => story.eventClusterId === null));
});

test('exact normalized headlines in non-Latin scripts can match, but fuzzy CJK matching is skipped', () => {
  const same = [
    item('香港立法會通過新法案', 'https://one.example/a'),
    item('香港立法會通過新法案', 'https://two.example/b'),
  ];
  assert.equal(clusterStories(same).clusters.length, 1);
  const fuzzy = [
    item('香港立法會通過新法案', 'https://one.example/a'),
    item('立法會通過新法案香港', 'https://two.example/b'),
  ];
  assert.equal(clusterStories(fuzzy).clusters.length, 0);
});

test('same canonical URLs are recorded separately, including tracking parameters', () => {
  const stories = [
    item('Totally different title one', 'http://www.example.com/story/?utm_source=feed'),
    item('Completely different title two', 'https://example.com/story#comments'),
  ];
  const result = clusterStories(stories);
  assert.equal(normalizeEventUrl(stories[0].url), normalizeEventUrl(stories[1].url));
  assert.equal(result.clusters.length, 0);
  assert.equal(result.sameUrlGroups.length, 1);
  assert.deepEqual(result.sameUrlGroups[0].storyIndices, [0, 1]);
  assert.equal(result.sameUrlGroups[0].reportingIndependence, 'not-assessed');
  assert.equal(result.stories[0].sameUrlGroupId, result.stories[1].sameUrlGroupId);
});

test('publisher subdomains count as one publisher, and missing dates only permit exact URL grouping', () => {
  const stories = [
    item('OpenAI launches new Atlas browser with AI agents', 'https://www.publisher.co.uk/a', null),
    item('OpenAI launches new Atlas browser with AI agents', 'https://blog.publisher.co.uk/b', null),
    item('Unrelated mirror title', 'https://publisher.co.uk/a?utm_medium=rss', null),
  ];
  const result = clusterStories(stories);
  assert.equal(result.clusters.length, 0);
  assert.equal(result.sameUrlGroups.length, 1);
  assert.equal(result.sameUrlGroups[0].distinctPublisherCount, 1);
});

test('complete-link clustering prevents weak transitive chaining', () => {
  const stories = [
    item('Alpha bravo charlie delta echo foxtrot', 'https://one.example/a'),
    item('Alpha bravo charlie delta golf hotel', 'https://two.example/b', '2026-10-29T01:00:00Z'),
    item('Charlie delta golf hotel india juliet', 'https://three.example/c', '2026-10-29T02:00:00Z'),
  ];
  const result = clusterStories(stories);
  assert.equal(result.clusters.length, 1);
  assert.deepEqual(result.clusters[0].storyIndices, [0, 1]);
  assert.equal(result.stories[2].eventClusterId, null);
});

test('input stories are not mutated and results are deterministic', () => {
  const stories = [
    item('OpenAI launches new Atlas browser with AI agents', 'https://one.example/a'),
    item('OpenAI launches new Atlas browser for AI agents', 'https://two.example/b'),
  ];
  const before = structuredClone(stories);
  const first = clusterStories(stories);
  const second = clusterStories(stories);
  assert.deepEqual(stories, before);
  assert.deepEqual(first, second);
});
