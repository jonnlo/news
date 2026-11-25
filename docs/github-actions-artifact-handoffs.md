# Artifact handoffs in GitHub Actions

## What happened in One More Tab

On 25 November 2026, deploys #730, #732, and #733 built the site, validated `og.png`, and uploaded the `github-pages` artifact. The uploader returned an artifact ID. Less than a second later, `actions/deploy-pages@v4` listed the artifacts for the same run and found zero matches. It exited before creating a Pages deployment. Deploy #731 succeeded between those failures.

The workflow ordered the upload before the publish step. We assumed upload success also meant the publisher could immediately find the artifact. The logs establish that those two results disagreed. A delay in artifact visibility fits the evidence, but GitHub's internal cause was unconfirmed.

[Failed deploy log](https://github.com/jonnlo/news/actions/runs/45566991408/job/139044097501) · [Deploy action source](https://github.com/actions/deploy-pages/blob/v4/src/internal/api-client.js)

## What to do in future workflows

- Identify what the next step actually needs. For an artifact, confirm how the consumer resolves it and scope the check to the correct workflow run. Use the exact artifact name or ID expected by that consumer.
- For a handoff with observed intermittent misses, check readiness from the consumer's side. Prefer the same lookup mechanism the consumer uses. An upload receipt alone cannot verify that lookup, and a fixed sleep can be too short or delay healthy runs.
- Retry the read-only lookup with a deadline. For this Pages workflow, a starting point is an immediate check followed by checks every five seconds for up to 60 seconds. Retry an empty result. Surface permission errors and unexpected duplicate artifacts directly. On timeout, log the run ID, expected artifact, and elapsed time.
- Keep retries before side effects such as creating a deployment. If a write can fail after taking effect, check its status or use an idempotency key where supported before retrying it.
- Verify both paths. A successful run confirms normal publishing. An empty lookup followed by a successful lookup and publish verifies recovery. Also check that a persistent miss ends with a clear timeout and skips publishing.

One More Tab checks readiness between `upload-pages-artifact` and `deploy-pages` in `.github/workflows/deploy-site.yml`. The check uses the same Actions artifact client as the publisher. After rolling out the workflow, verify that a manual deploy and a refresh-triggered deploy serve the expected headlines and `/og.png`. A run that finds the artifact immediately verifies the normal path. Look for a run that finds zero matches, then finds the artifact and publishes, to confirm recovery in GitHub Actions.
