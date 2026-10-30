import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.find((item) => item.startsWith('--snapshot='))?.slice('--snapshot='.length);
const directory = resolve(root, 'data/candidates');
const latest = arg ?? resolve(directory, (await readdir(directory)).filter((item) => item.endsWith('.json')).sort().at(-1) ?? '');
const snapshot = JSON.parse(await readFile(resolve(latest), 'utf8'));
if (!snapshot.collectedAt || !Array.isArray(snapshot.candidates)) throw new Error('Invalid candidate snapshot');
const categories = [...new Set(snapshot.candidates.map((s) => s.category).filter(Boolean))];
const articles = [];
for (const category of categories) {
  const pool = snapshot.candidates.filter((s) => s.category === category);
  const selected = pool.filter((s) => s.selected).sort((a, b) => (a.selectionRank ?? Infinity) - (b.selectionRank ?? Infinity)).slice(0, 10);
  const excluded = pool.filter((s) => !s.selected && s.dedupe === 'eligible').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);
  // Keep display order stable but mix selected and excluded, without exposing rank.
  const chosen = [...selected, ...excluded].map((s) => ({
    title: s.title, url: s.url, source: s.source, category: s.category,
    excerpt: s.source === 'Hacker News' ? '' : (s.excerpt ?? ''),
    publishedAt: s.publishedAt ?? null, selected: Boolean(s.selected),
    ...(s.discussionUrl ? { discussionUrl: s.discussionUrl } : {}),
  }));
  chosen.sort((a, b) => hash(snapshot.collectedAt + a.source + a.url).localeCompare(hash(snapshot.collectedAt + b.source + b.url)));
  articles.push(...chosen);
}
const output = { version: 1, snapshot: basename(latest), collectedAt: snapshot.collectedAt, rankingVersion: snapshot.rankingVersion ?? null, categories, articles };
await writeFile(resolve(root, 'src/data/review-sample.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Prepared ${articles.length} review articles from ${output.snapshot}.`);
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
