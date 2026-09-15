import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTimeOfDay,
  validateManualOperationInput,
} from '../src/lib/manualEntry.ts';

test('valid manual operation passes validation', () => {
  const result = validateManualOperationInput({
    date: '2025-02-14',
    service_name: 'Consultation',
    quantity: 3,
    revenue: 450,
    category: 'Service',
    time_of_day: '2:30 PM',
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.normalized.date, '2025-02-14');
  assert.equal(result.normalized.service_name, 'Consultation');
  assert.equal(result.normalized.quantity, 3);
  assert.equal(result.normalized.revenue, 450);
});

test('missing date and revenue are rejected', () => {
  const result = validateManualOperationInput({
    service_name: 'Consultation',
    quantity: 2,
    revenue: '',
  });

  assert.equal(result.errors.some((message) => message.includes('Date is required')), true);
  assert.equal(result.errors.some((message) => message.includes('Revenue is required')), true);
});

test('time-of-day parsing converts am/pm values to usable hour data', () => {
  const parsed = parseTimeOfDay('2:30 PM');

  assert.equal(parsed.time_of_day, '14:30:00');
  assert.equal(parsed.hour, 14);
});
