import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCollectionHasSuccess } from '../scripts/collector-utils.mjs';

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
