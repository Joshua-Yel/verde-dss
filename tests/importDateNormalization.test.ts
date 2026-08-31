import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDate } from '../src/lib/dateUtils.ts';

test('normalizeDate preserves Excel serial dates without timezone drift', () => {
  assert.equal(normalizeDate(46023), '2026-01-01');
  assert.equal(normalizeDate(46024), '2026-01-02');
  assert.equal(normalizeDate('2026-01-01'), '2026-01-01');
});

test('normalizeDate keeps local date values from xlsx Date objects stable', () => {
  const date = new Date(2026, 0, 1);
  assert.equal(normalizeDate(date), '2026-01-01');
});
