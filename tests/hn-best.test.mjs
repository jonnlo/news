import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBestPage, fetchBestIds } from '../scripts/hn-best.mjs';

const page = (ids, next = '') => ids.map((id) => `<tr class="athing submission" id="${id}"><td>story</td></tr>`).join('')
  + (next ? `<a href='${next.replaceAll('&', '&amp;')}' class='morelink' rel='next'>More</a>` : '');

test('extracts ranked story IDs and preserves the requested hour window', () => {
  const result = parseBestPage(page([12, 34], 'best?h=24&p=2'), 'https://news.ycombinator.com/best?h=24');
  assert.deepEqual(result.ids, [12, 34]);
  assert.equal(result.next, 'https://news.ycombinator.com/best?h=24&p=2');
});

test('follows the best-list pagination in order and deduplicates IDs', async () => {
  const urls = [];
  const items = await fetchBestIds('https://news.ycombinator.com/best?h=24', async (url) => {
    urls.push(url);
    return urls.length === 1 ? page([10, 20], 'best?h=24&p=2') : page([20, 30, 40]);
  }, 3);
  assert.deepEqual(items, [10, 20, 30]);
  assert.equal(urls.length, 2);
});

test('does not follow unrelated or mismatched pagination and fails on changed markup', () => {
  assert.equal(parseBestPage(page([1], 'https://example.com/best?h=24&p=2'), 'https://news.ycombinator.com/best?h=24').next, null);
  assert.equal(parseBestPage(page([1], 'best?h=48&p=2'), 'https://news.ycombinator.com/best?h=24').next, null);
  assert.throws(() => parseBestPage('<html>Unavailable</html>', 'https://news.ycombinator.com/best?h=24'), /no recognizable story IDs/);
});

test('rejects a non-Hacker News URL', async () => {
  await assert.rejects(() => fetchBestIds('https://example.com/best?h=24', async () => page([1])), /source URL/);
});
