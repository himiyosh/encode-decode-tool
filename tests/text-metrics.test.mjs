import test from 'node:test';
import assert from 'node:assert/strict';

import { countCodePoints } from '../src/text-metrics.mjs';

test('character counts follow Unicode code points without allocating arrays', () => {
  assert.equal(countCodePoints(''), 0);
  assert.equal(countCodePoints('A👋世界'), 4);
  assert.equal(countCodePoints('\ud800'), 1);
});

test('character counting handles documented long input', () => {
  const value = 'A👋'.repeat(50_000);
  assert.equal(countCodePoints(value), 100_000);
});
