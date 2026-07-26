import assert from 'node:assert/strict';
import test from 'node:test';

import {
  structuralBudgetViolations,
  timingRegressionViolations
} from '../../scripts/performance-contract.mjs';

test('structural budgets report the scenario and exceeded work kind', () => {
  const report = performanceReport({
    work: { render_nodes: workSummary(17) }
  });

  assert.deepEqual(structuralBudgetViolations(report), [
    'sample/render_nodes: 17 > 16'
  ]);
});

test('timing comparisons reject controlled regressions', () => {
  const baseline = performanceReport({ stages: { total: timingSummary(2) } });
  const current = performanceReport({ stages: { total: timingSummary(4) } });

  assert.deepEqual(timingRegressionViolations(baseline, current), [
    'sample/total: 4ms > 2ms + 0.5ms'
  ]);
});

test('timing comparisons ignore high-variance evidence', () => {
  const baseline = performanceReport({ stages: { total: timingSummary(2) } });
  const current = performanceReport({
    stages: { total: timingSummary(4, { coefficientOfVariation: 0.5 }) }
  });

  assert.deepEqual(timingRegressionViolations(baseline, current), []);
});

function performanceReport(overrides = {}) {
  return {
    metadata: {
      runtimeKey: 'node:v24:test:x64',
      terminalSize: { columns: 80, rows: 24 }
    },
    scenarios: [{
      name: 'sample',
      kind: 'render',
      scale: 100,
      setupWork: { normalized_records: 0 },
      work: {},
      stages: {},
      ...overrides
    }]
  };
}

function workSummary(max) {
  return { count: 40, min: max, max, mean: max };
}

function timingSummary(p95Ms, overrides = {}) {
  return {
    count: 40,
    p50Ms: p95Ms,
    p95Ms,
    standardDeviationMs: 0.1,
    medianAbsoluteDeviationMs: 0,
    coefficientOfVariation: 0.05,
    ...overrides
  };
}
