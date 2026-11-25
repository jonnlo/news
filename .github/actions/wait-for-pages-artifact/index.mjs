import { writeSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const ARTIFACT_NAME = 'github-pages';

export async function waitForPagesArtifact(listArtifacts, {
  runId,
  intervalMs = 5_000,
  timeoutMs = 60_000,
  log = console.log,
}) {
  const started = performance.now();
  const context = `Artifact "${ARTIFACT_NAME}" in run ${runId}`;
  const elapsed = () => `${Math.round(performance.now() - started)} ms`;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${context} was not confirmed ready after ${elapsed()}.`));
    }, timeoutMs);
  });

  async function poll() {
    for (let attempt = 1; ; attempt++) {
      log(`${context}: starting lookup ${attempt} at ${elapsed()}.`);
      const { artifacts } = await listArtifacts();
      controller.signal.throwIfAborted();
      const matches = artifacts.filter(({ name }) => name === ARTIFACT_NAME);
      log(`${context}: lookup ${attempt} found ${matches.length} match(es) at ${elapsed()}.`);

      if (matches.length === 1) {
        log(`${context} is ready (artifact ID ${matches[0].id}).`);
        return;
      }
      if (matches.length > 1) {
        throw new Error(`${context} has ${matches.length} matches. Expected exactly one.`);
      }
      await sleep(intervalMs, undefined, { signal: controller.signal });
    }
  }

  try {
    await Promise.race([poll(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

if (import.meta.main) {
  try {
    const { DefaultArtifactClient } = await import('@actions/artifact');
    const client = new DefaultArtifactClient();
    await waitForPagesArtifact(() => client.listArtifacts(), { runId: process.env.GITHUB_RUN_ID });
  } catch (error) {
    writeSync(2, `Pages artifact readiness check failed: ${error.message}\n`);
    // The client cannot abort an in-flight lookup when the readiness deadline expires.
    process.exit(1);
  }
}
