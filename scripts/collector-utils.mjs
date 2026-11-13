import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function fetchWithRetry(url, {
  fetchImpl = fetch, sleep = delay, timeoutMs = 15_000, headers,
  onRetry = () => {},
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = [408, 429].includes(response.status) || response.status >= 500;
        await response.body?.cancel();
        throw error;
      }
      // Read the body within the retry boundary, including stalled/interrupted downloads.
      return await response.text();
    } catch (error) {
      const retryable = error.retryable ?? (
        error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name)
        || Boolean(error.cause?.code) || Boolean(error.code)
      );
      if (!retryable || attempt === 3) throw error;
      const waitMs = attempt * 1_000;
      onRetry({ url, attempt, error, waitMs });
      await sleep(waitMs);
    }
  }
}

export async function loadPreviousSources(directories, today) {
  const editions = [];
  for (const directory of new Set(directories)) {
    let names;
    try { names = await readdir(directory); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const name of names.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name <= `${today}.json`)) {
      try {
        editions.push(JSON.parse(await readFile(resolve(directory, name), 'utf8')));
      } catch { /* A corrupt edition must not prevent trying other saved editions. */ }
    }
  }
  const previous = new Map();
  for (const edition of editions) {
    for (const source of edition.sources ?? []) {
      if (!source.stories?.length) continue;
      const failed = edition.sourceErrors?.some((error) =>
        (typeof error === 'string' ? error : error.source) === source.name);
      // Legacy failed/retained groups without provenance cannot establish a success date.
      if (failed && !source.lastSuccessfulAt) continue;
      const lastSuccessfulAt = source.lastSuccessfulAt ?? edition.collectedAt ?? edition.generatedAt;
      if (!lastSuccessfulAt || Number.isNaN(Date.parse(lastSuccessfulAt))) continue;
      const existing = previous.get(source.name);
      if (!existing || Date.parse(lastSuccessfulAt) > Date.parse(existing.lastSuccessfulAt)) {
        previous.set(source.name, { ...source, lastSuccessfulAt });
      }
    }
  }
  return previous;
}

export function retainPreviousSource(feed, previous) {
  return {
    name: feed.name,
    category: feed.category,
    kind: feed.kind,
    count: previous?.stories.length ?? 0,
    stories: previous?.stories.map((story) => ({ ...story, category: feed.category })) ?? [],
    ...(previous ? { retained: true, lastSuccessfulAt: previous.lastSuccessfulAt } : {}),
  };
}

export function assertCollectionHasSuccess(sourceCount, sourceErrors, outputPath) {
  if (sourceCount > 0 && sourceErrors.length < sourceCount) return;

  const details = sourceErrors.map(({ source, error }) => `${source}: ${error}`).join('; ');
  throw new Error(`All ${sourceCount} sources failed; refusing to overwrite ${outputPath}${details ? `. ${details}` : ''}`);
}
