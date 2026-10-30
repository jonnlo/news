#!/usr/bin/env node

// Offline comparison of the current phrase matcher, MiniSearch, and BM25S.
// Reads a saved candidate snapshot and never contacts a feed or network service.

import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import MiniSearch from 'minisearch';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const positional = args.find((arg) => !arg.startsWith('--'));
const snapshotPath = resolveInput(valueArg('--snapshot') ?? positional ?? await latestSnapshot(resolve(projectDir, 'data/candidates')));
const outputPath = resolveInput(valueArg('--output') ?? resolve(projectDir, 'src/data/relevance-comparison.json'));
const topN = Number(valueArg('--top') ?? 10);
if (!Number.isInteger(topN) || topN < 1 || topN > 100) throw new Error('--top must be an integer from 1 to 100');

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
if (!Array.isArray(snapshot.candidates) || !snapshot.collectedAt) {
  throw new Error(`${snapshotPath} is not a candidate snapshot (expected candidates and collectedAt)`);
}
const rankingConfig = await loadRankingConfig(snapshot, args.includes('--current-config'));
const terms = normalizeQueries(rankingConfig.topicMatch?.terms ?? []);
const categoryNames = [...new Set([
  ...(snapshot.sources ?? []).map((source) => source.category),
  ...snapshot.candidates.map((story) => story.category),
  ...terms.flatMap((entry) => entry.categories ?? []),
].filter(Boolean))].sort((a, b) => a.localeCompare(b));
const candidates = snapshot.candidates.map((story, index) => ({
  ...story,
  _index: index,
  title: String(story.title ?? ''),
  excerpt: String(story.excerpt ?? ''),
  url: String(story.url ?? ''),
  source: String(story.source ?? ''),
}));
const excerptWeight = Math.max(0, number(rankingConfig.topicMatch?.excerptWeight, 0.35));
const maxBonus = Math.max(0, number(rankingConfig.topicMatch?.maxBonus, 6));

const phrase = scorePhraseMatcher(candidates, categoryNames, terms, excerptWeight, maxBonus, topN);
const miniSearch = scoreMiniSearch(candidates, categoryNames, terms, excerptWeight, topN);
const bm25 = runBm25(candidates, categoryNames, terms, excerptWeight, topN);

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  snapshot: {
    file: basename(snapshotPath),
    collectedAt: snapshot.collectedAt,
    candidateCount: candidates.length,
  },
  settings: {
    configuration: args.includes('--current-config') ? 'current' : (snapshot.rankingConfig ? 'snapshot' : 'current'),
    titleWeight: 1,
    excerptWeight,
    topN,
    corpus: 'same saved candidate snapshot, partitioned by category for each method',
    tokenization: 'NFKD lowercase; Unicode word tokens; CJK runs plus overlapping character bigrams',
    zeroScoreCandidates: 'omitted',
  },
  categories: categoryNames,
  queries: terms,
  methods: {
    phraseMatcher: {
      label: 'Current phrase matcher',
      description: `Current ranking topic-match semantics: exact word/phrase boundaries outside CJK, CJK substring matching, title weight 1, excerpt weight ${excerptWeight}, cap ${maxBonus}.`,
      matching: 'Each configured concept is counted at most once per story; title takes precedence over excerpt.',
      categories: phrase,
    },
    miniSearch: {
      label: 'MiniSearch',
      description: 'BM25-style MiniSearch relevance score using title boost 1 and excerpt boost from the current config.',
      matching: 'OR across tokenized configured terms; phrase order and adjacency are not required. CJK runs and bigrams are indexed.',
      categories: miniSearch,
    },
    bm25s: {
      label: 'BM25S (Python)',
      description: 'BM25S score from independent title and excerpt indexes, combined as title + configured excerpt weight.',
      matching: 'OR-like summed query-token evidence; phrase order and adjacency are not required. Uses the same pre-tokenized CJK runs and bigrams.',
      categories: bm25,
    },
  },
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(`Snapshot: ${basename(snapshotPath)} (${candidates.length} candidates); categories: ${categoryNames.length}; query concepts: ${terms.length}`);
console.log('Methods: phrase matcher, MiniSearch, BM25S. All scoring is local and offline.');

function resolveInput(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function latestSnapshot(directory) {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No candidate snapshots found in ${directory}`);
  return resolve(directory, files.at(-1));
}

async function loadRankingConfig(source, useCurrent = false) {
  const local = JSON.parse(await readFile(resolve(scriptDir, 'ranking-config.json'), 'utf8'));
  const override = useCurrent ? {} : (source.rankingConfig ?? {});
  return {
    ...local,
    ...override,
    topicMatch: { ...local.topicMatch, ...override.topicMatch },
  };
}

function normalizeQueries(entries) {
  return entries.filter((entry) => typeof entry === 'string' || entry?.term)
    .map((entry) => typeof entry === 'string'
      ? { term: entry, categories: null, weight: 1 }
      : { term: String(entry.term), categories: entry.categories?.length ? entry.categories : null, weight: number(entry.weight, 1) });
}

function scorePhraseMatcher(docs, categories, queries, excerptBoost, cap, limit) {
  const output = {};
  for (const category of categories) {
    const categoryQueries = queries.filter((q) => !q.categories || q.categories.includes(category));
    if (!categoryQueries.length) {
      output[category] = { status: 'no_queries', results: [] };
      continue;
    }
    const scores = docs.filter((doc) => doc.category === category).map((doc) => {
      const matches = [];
      for (const query of categoryQueries) {
        const field = phraseMatchField(doc, query.term);
        if (field) matches.push({ term: query.term, weight: query.weight, field });
      }
      const title = matches.filter((match) => match.field === 'title').reduce((sum, match) => sum + match.weight, 0);
      const excerpt = matches.filter((match) => match.field === 'excerpt').reduce((sum, match) => sum + match.weight, 0) * excerptBoost;
      return { doc, score: Math.min(cap, title + excerpt), matchedQueries: matches.map(({ term }) => term), scoreBreakdown: { title: round(title), excerpt: round(excerpt) } };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.doc._index - b.doc._index).slice(0, limit);
    output[category] = { status: scores.length ? 'ok' : 'no_matches', results: scores.map((item, index) => serializeResult(item, index + 1)) };
  }
  return output;
}

function phraseMatchField(doc, query) {
  const normalized = normalizeText(query);
  if (!normalized) return null;
  const cjk = hasCjk(normalized);
  if (matchesPhrase(doc.title, normalized, cjk)) return 'title';
  if (matchesPhrase(doc.excerpt, normalized, cjk)) return 'excerpt';
  return null;
}

function matchesPhrase(text, phrase, cjk) {
  const normalized = normalizeText(text);
  return cjk ? normalized.includes(phrase) : ` ${normalized} `.includes(` ${phrase} `);
}

function scoreMiniSearch(docs, categories, queries, excerptBoost, limit) {
  const output = {};
  for (const category of categories) {
    const categoryQueries = queries.filter((q) => !q.categories || q.categories.includes(category));
    if (!categoryQueries.length) {
      output[category] = { status: 'no_queries', results: [] };
      continue;
    }
    const corpus = docs.filter((doc) => doc.category === category);
    const index = new MiniSearch({
      idField: '_index',
      fields: ['title', 'excerpt'],
      storeFields: ['title', 'excerpt', 'url', 'source', 'category', '_index'],
      tokenize: (text) => [...tokenize(text)],
      processTerm: (term) => term,
      searchOptions: { combineWith: 'OR', boost: { title: 1, excerpt: excerptBoost }, prefix: false, fuzzy: false },
    });
    index.addAll(corpus);
    const queryTokens = [...new Set(categoryQueries.flatMap((q) => [...tokenize(q.term)]))];
    if (!queryTokens.length) {
      output[category] = { status: 'no_matches', results: [] };
      continue;
    }
    const results = index.search(queryTokens.join(' '), { combineWith: 'OR', boost: { title: 1, excerpt: excerptBoost }, prefix: false, fuzzy: false })
      .filter((item) => number(item.score, 0) > 0)
      .sort((a, b) => b.score - a.score || a._index - b._index)
      .slice(0, limit)
      .map((item, index) => ({
        rank: index + 1,
        url: item.url,
        title: item.title,
        source: item.source,
        score: round(item.score),
        matchedQueries: [],
        scoreBreakdown: null,
      }));
    output[category] = { status: results.length ? 'ok' : 'no_matches', results };
  }
  return output;
}

function runBm25(docs, categories, queries, excerptBoost, limit) {
  const payload = {
    excerptWeight: excerptBoost,
    topN: limit,
    categories: categories.map((category) => ({
      name: category,
      queries: queries.filter((q) => !q.categories || q.categories.includes(category)).map((q) => q.term),
      queryTokens: [...new Set(queries.filter((q) => !q.categories || q.categories.includes(category)).flatMap((q) => [...tokenize(q.term)]))],
      docs: docs.filter((doc) => doc.category === category).map((doc) => ({
        _index: doc._index, title: doc.title, excerpt: doc.excerpt, url: doc.url, source: doc.source,
        titleTokens: [...tokenize(doc.title)], excerptTokens: [...tokenize(doc.excerpt)],
      })),
    })),
  };
  const python = process.env.PYTHON ?? 'python3';
  const proc = spawnSync(python, [resolve(scriptDir, 'relevance-bm25.py')], {
    input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) throw new Error(`Could not start BM25S runner (${python}): ${proc.error.message}`);
  if (proc.status !== 0) throw new Error(`BM25S runner failed. Install requirements-relevance.txt and retry.\n${proc.stderr || proc.stdout}`);
  try { return JSON.parse(proc.stdout); }
  catch (error) { throw new Error(`BM25S runner returned invalid JSON: ${error.message}\n${proc.stdout.slice(0, 1000)}`); }
}

function serializeResult(item, rank) {
  return {
    rank,
    url: item.doc.url,
    title: item.doc.title,
    source: item.doc.source,
    score: round(item.score),
    matchedQueries: item.matchedQueries,
    scoreBreakdown: item.scoreBreakdown,
  };
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);
  const tokens = new Set(normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu) ?? []) {
    for (let index = 0; index < run.length - 1; index++) tokens.add(run.slice(index, index + 2));
  }
  return tokens;
}

function hasCjk(value) { return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value); }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function round(value) { return Number(Number(value).toFixed(6)); }
