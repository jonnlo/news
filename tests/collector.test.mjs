import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertCollectionHasSuccess, fetchWithRetry, loadPreviousSources, retainPreviousSource } from '../scripts/collector-utils.mjs';

test('retries transient HTTP errors and succeeds on the third attempt', async () => {
  const waits = [];
  let calls = 0;
  const result = await fetchWithRetry('https://example.com/feed', {
    fetchImpl: async () => new Response(++calls < 3 ? 'unavailable' : 'stories', { status: calls < 3 ? 503 : 200 }),
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(result, 'stories');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('retries timeouts and network failures, stopping after three attempts', async () => {
  for (const error of [new TypeError('fetch failed'), new DOMException('timeout', 'TimeoutError')]) {
    let calls = 0;
    await assert.rejects(fetchWithRetry('https://example.com/feed', {
      fetchImpl: async () => { calls++; throw error; },
      sleep: async () => {},
    }), (caught) => caught === error);
    assert.equal(calls, 3);
  }
});

test('retries HTTP 408 and 429 but not permanent HTTP errors', async () => {
  for (const status of [408, 429, 404, 403]) {
    let calls = 0;
    await assert.rejects(fetchWithRetry('https://example.com/feed', {
      fetchImpl: async () => { calls++; return new Response('', { status }); },
      sleep: async () => {},
    }), new RegExp(`HTTP ${status}`));
    assert.equal(calls, [408, 429].includes(status) ? 3 : 1);
  }
});

test('retries interrupted response bodies and creates a fresh timeout signal', async () => {
  const signals = [];
  const result = await fetchWithRetry('https://example.com/feed', {
    fetchImpl: async (_, { signal }) => {
      signals.push(signal);
      return { ok: true, text: async () => {
        if (signals.length === 1) throw new TypeError('terminated');
        return 'stories';
      } };
    },
    sleep: async () => {},
  });
  assert.equal(result, 'stories');
  assert.notEqual(signals[0], signals[1]);
});

test('finds the latest actual source success across saved and local editions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'collector-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const saved = join(directory, 'saved');
  const local = join(directory, 'local');
  await mkdir(saved);
  await mkdir(local);
  const source = (title, extra = {}) => ({ name: 'Source A', stories: [{ title, category: 'Old' }], ...extra });
  const edition = async (dir, date, sources, sourceErrors = []) => writeFile(join(dir, `${date}.json`), JSON.stringify({
    generatedAt: `${date}T12:00:00Z`, sources, sourceErrors,
  }));
  await edition(saved, '2026-11-10', [source('older')]);
  await edition(local, '2026-11-11', [source('newer')]);
  await edition(local, '2026-11-12', [source('retained older', { retained: true, lastSuccessfulAt: '2026-11-10T12:00:00Z' })], [{ source: 'Source A' }]);
  await edition(saved, '2026-11-13', [source('failed without provenance')], [{ source: 'Source A' }]);
  await edition(saved, '2026-11-14', [source('future')]);
  await writeFile(join(local, '2026-11-09.json'), 'invalid json');
  const previous = await loadPreviousSources([local, saved, join(directory, 'missing')], '2026-11-13');
  assert.equal(previous.get('Source A').stories[0].title, 'newer');
  assert.equal(previous.get('Source A').lastSuccessfulAt, '2026-11-11T12:00:00Z');
  const retained = retainPreviousSource({ name: 'Source A', category: 'Current', kind: 'rss' }, previous.get('Source A'));
  assert.equal(retained.retained, true);
  assert.equal(retained.lastSuccessfulAt, '2026-11-11T12:00:00Z');
  assert.equal(retained.count, 1);
  assert.equal(retained.stories[0].category, 'Current');
  assert.equal(previous.get('Source A').stories[0].category, 'Old');
});

test('keeps retained provenance across repeated failed refreshes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'collector-retained-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, '2026-11-13.json'), JSON.stringify({
    generatedAt: '2026-11-13T12:00:00Z',
    sourceErrors: [{ source: 'Source A', error: 'HTTP 503' }],
    sources: [{ name: 'Source A', retained: true, lastSuccessfulAt: '2026-11-01T12:00:00Z', stories: [{ title: 'saved' }] }],
  }));
  const previous = await loadPreviousSources([directory], '2026-11-13');
  assert.equal(previous.get('Source A').lastSuccessfulAt, '2026-11-01T12:00:00Z');
});

test('without source history returns an empty group, not a retained success', () => {
  assert.deepEqual(retainPreviousSource({ name: 'New source', category: 'News', kind: 'rss' }), {
    name: 'New source', category: 'News', kind: 'rss', count: 0, stories: [],
  });
});

test('collector retains failed sources, reports live updates, and protects against total failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'collector-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const lastSuccessfulAt = new Date(Date.now() - 60_000).toISOString();
  const output = join(directory, `${today}.json`);
  const story = { title: 'Saved story', url: 'https://example.com/saved', source: 'The Marginalian', category: 'Society', publishedAt: null, excerpt: '' };
  await writeFile(output, JSON.stringify({
    generatedAt: lastSuccessfulAt, sourceErrors: [],
    sources: [{ name: 'The Marginalian', stories: [story], lastSuccessfulAt }],
  }));
  const preload = `globalThis.fetch = async (url) => {
    if (process.env.COLLECTOR_TEST_ALL_FAIL || String(url).includes('themarginalian.org')) {
      return new Response('', { status: 404 });
    }
    return new Response('<rss><channel><item><title>Live story</title><link>https://example.com/live</link></item></channel></rss>');
  };`;
  const args = ['--import', `data:text/javascript;base64,${Buffer.from(preload).toString('base64')}`,
    new URL('../scripts/collect.mjs', import.meta.url).pathname, `--output=${directory}`];
  const run = promisify(execFile);
  await run(process.execPath, args);
  const snapshotText = await readFile(output, 'utf8');
  const snapshot = JSON.parse(snapshotText);
  const retained = snapshot.sources.find((source) => source.name === 'The Marginalian');
  assert.equal(retained.retained, true);
  assert.equal(retained.lastSuccessfulAt, lastSuccessfulAt);
  assert.equal(retained.stories[0].title, 'Saved story');
  assert.ok(snapshot.stories.some((story) => story.title === 'Saved story'));
  assert.ok(snapshot.sourcesUpdated > 0);
  assert.equal(snapshot.sourcesUpdated, snapshot.sourcesChecked - snapshot.sourceErrors.length);
  assert.ok(snapshot.sourceErrors.some((error) => error.source === 'The Marginalian'));
  await assert.rejects(run(process.execPath, args, {
    env: { ...process.env, COLLECTOR_TEST_ALL_FAIL: '1' },
  }), /refusing to overwrite/);
  assert.equal(await readFile(output, 'utf8'), snapshotText);
});

test('refuses to overwrite the edition when every source fails', () => {
  const errors = [
    { source: 'Source A', error: 'HTTP 502' },
    { source: 'Source B', error: 'timeout' },
  ];

  assert.throws(
    () => assertCollectionHasSuccess(2, errors, '/editions/2026-10-30.json'),
    /All 2 sources failed; refusing to overwrite \/editions\/2026-10-30\.json\. Source A: HTTP 502; Source B: timeout/,
  );
});

test('allows the edition update when at least one source succeeds', () => {
  assert.doesNotThrow(() => assertCollectionHasSuccess(2, [
    { source: 'Source B', error: 'timeout' },
  ], '/editions/2026-10-30.json'));
});
