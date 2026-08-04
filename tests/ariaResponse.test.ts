import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDataDrivenAriaReply } from '../src/lib/ariaResponse.ts';

test('buildDataDrivenAriaReply uses inventory context for reorder questions', () => {
  const reply = buildDataDrivenAriaReply('What should we reorder this month?', {
    criticalRestock: [{ item: 'Shampoo', stock: 2, reorderPoint: 6 }],
    analyticsContext: {
      inventorySummary: {
        criticalRestockCount: 1,
      },
      forecastSummary: {
        totalServicesTracked: 3,
      },
    },
  });

  assert.match(reply, /Direct answer/i);
  assert.match(reply, /Shampoo/i);
  assert.match(reply, /Recommendation/i);
});

test('buildDataDrivenAriaReply uses service forecast context for demand questions', () => {
  const reply = buildDataDrivenAriaReply('Which services will have the highest demand next month?', {
    topServices: [{ name: 'Haircut', bookings: 18 }],
    analyticsContext: {
      forecastSummary: {
        topServices: [{ service: 'Haircut', bookings: 18, forecastError: '8.4%' }],
      },
      revenueSummary: {
        projectedRevenueNextMonth: 12000,
      },
    },
  });

  assert.match(reply, /Haircut/i);
  assert.match(reply, /Forecast result/i);
  assert.match(reply, /Recommendation/i);
});

test('buildDataDrivenAriaReply supports explicit future periods with recursive forecasts', () => {
  const reply = buildDataDrivenAriaReply('What should we order for September 2026?', {
    fullInventory: [
      {
        name: 'Cellophane Treatment',
        history: [
          { month: '2025-01', used: 20 },
          { month: '2025-02', used: 24 },
          { month: '2025-03', used: 26 },
          { month: '2025-04', used: 30 },
          { month: '2025-05', used: 34 },
          { month: '2025-06', used: 38 },
          { month: '2025-07', used: 41 },
          { month: '2025-08', used: 45 },
          { month: '2025-09', used: 48 },
          { month: '2025-10', used: 52 },
          { month: '2025-11', used: 56 },
          { month: '2025-12', used: 60 },
        ],
      },
    ],
    analyticsContext: {
      inventorySummary: {
        criticalRestockCount: 1,
      },
    },
  });

  assert.match(reply, /Latest available historical data/i);
  assert.match(reply, /September 2026/i);
  assert.match(reply, /recursive/i);
  assert.match(reply, /Forecast result/i);
});

test('buildDataDrivenAriaReply states the forecast horizon for explicit future inventory periods', () => {
  const reply = buildDataDrivenAriaReply('What should we order for August 2026?', {
    fullInventory: [
      {
        name: 'Cellophane Treatment',
        history: [
          { month: '2025-01', used: 20 },
          { month: '2025-02', used: 24 },
          { month: '2025-03', used: 26 },
          { month: '2025-04', used: 30 },
          { month: '2025-05', used: 34 },
          { month: '2025-06', used: 38 },
          { month: '2025-07', used: 41 },
          { month: '2025-08', used: 45 },
          { month: '2025-09', used: 48 },
          { month: '2025-10', used: 52 },
          { month: '2025-11', used: 56 },
          { month: '2025-12', used: 60 },
        ],
      },
    ],
  });

  assert.match(reply, /Latest historical inventory/i);
  assert.match(reply, /Requested forecast/i);
  assert.match(reply, /Forecast horizon/i);
  assert.match(reply, /August 2026/i);
});

test('buildDataDrivenAriaReply refuses to forecast when inventory history is too short', () => {
  const reply = buildDataDrivenAriaReply('What should we order for August 2026?', {
    fullInventory: [
      {
        name: 'Cellophane Treatment',
        history: [{ month: '2025-01', used: 20 }],
      },
    ],
  });

  assert.match(reply, /insufficient/i);
});

test('buildDataDrivenAriaReply says when the data is insufficient', () => {
  const reply = buildDataDrivenAriaReply('What should we stock before peak season?', {
    analyticsContext: {
      inventorySummary: {
        criticalRestockCount: 0,
      },
    },
  });

  assert.match(reply, /insufficient data/i);
});
