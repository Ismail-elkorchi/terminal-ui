import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evidenceViolations,
  expectedScenarios,
  requiredWorkKinds,
  structuralBudgetViolations,
  timingRegressionViolations
} from '../../scripts/performance/performance-contract.mjs';

test('structural budgets report the scenario and exceeded work kind', () => {
  const report = performanceReport();
  report.scenarios.find((scenario) => scenario.name === 'scrolling-text-area').work.layout_nodes = workSummary(17);
  assert.deepEqual(structuralBudgetViolations(report), ['scrolling-text-area/layout_nodes: 17 > 16']);
});

test('committed focus navigation does not rescan the full target list', () => {
  const report = performanceReport();
  report.scenarios.find((scenario) => scenario.name === 'focus-navigation-128').work.focus_target_visits = workSummary(128);
  assert.deepEqual(structuralBudgetViolations(report), ['focus-navigation-128/focus_target_visits: 128 > 4']);
});

test('timing comparisons reject controlled regressions', () => {
  const baseline = performanceReport();
  const current = performanceReport();
  current.scenarios[0].stages.total = timingSummary(4);
  assert.deepEqual(timingRegressionViolations(baseline, current), [
    'unchanged-focus-tree-32/total: 4ms > 2ms + 0.5ms'
  ]);
});

test('missing and incompatible evidence cannot pass', () => {
  const baseline = performanceReport();
  const current = performanceReport();
  current.scenarios.pop();
  assert.ok(evidenceViolations(current).includes('missing scenario: resize-storm'));
  assert.ok(timingRegressionViolations(baseline, current).includes('current: missing scenario: resize-storm'));

  const malformed = performanceReport();
  malformed.scenarios[0].work.render_hooks = undefined;
  malformed.scenarios[1].stages.layout = undefined;
  malformed.scenarios[2].work.snapshot_cells = workSummary(Number.NaN);
  malformed.scenarios[3].stages.total = timingSummary(Number.POSITIVE_INFINITY);
  malformed.scenarios[4].work.layout_nodes.count = 39;
  malformed.scenarios[5].work.render_hooks = workSummary(0);
  assert.ok(evidenceViolations(malformed).includes('unchanged-focus-tree-32/render_hooks: missing or invalid work evidence'));
  assert.ok(evidenceViolations(malformed).includes('unchanged-focus-tree-128/layout: missing or invalid timing evidence'));
  assert.ok(evidenceViolations(malformed).includes('long-single-line/snapshot_cells: missing or invalid work evidence'));
  assert.ok(evidenceViolations(malformed).includes('fragmented-damage/total: missing or invalid timing evidence'));
  assert.ok(evidenceViolations(malformed).includes('same-layer-regions/layout_nodes: missing or invalid work evidence'));
  assert.ok(evidenceViolations(malformed).includes('scrolling-text-area/render_hooks: no work observed'));

  const mismatched = performanceReport();
  mismatched.scenarios[0].scale += 1;
  assert.ok(timingRegressionViolations(baseline, mismatched).includes('unchanged-focus-tree-32: scale mismatch'));
  mismatched.scenarios[0].scale -= 1;
  mismatched.metadata.runtimeKey = 'other';
  assert.ok(timingRegressionViolations(baseline, mismatched).includes('runtime key mismatch'));
  mismatched.metadata.runtimeKey = baseline.metadata.runtimeKey;
  mismatched.metadata.terminalSize.columns += 1;
  assert.ok(timingRegressionViolations(baseline, mismatched).includes('terminal size mismatch between timing reports'));
});

test('high variance and too few timing samples are inconclusive', () => {
  const baseline = performanceReport();
  const current = performanceReport();
  current.scenarios[0].stages.total = timingSummary(4, { coefficientOfVariation: 0.5 });
  assert.ok(timingRegressionViolations(baseline, current).includes('unchanged-focus-tree-32/total: inconclusive timing evidence'));
  baseline.metadata.sampleCount = 4;
  current.metadata.sampleCount = 4;
  for (const report of [baseline, current]) {
    for (const scenario of report.scenarios) {
      for (const summary of Object.values(scenario.stages)) summary.count = 4;
      for (const summary of Object.values(scenario.work ?? {})) summary.count = 4;
    }
  }
  assert.ok(timingRegressionViolations(baseline, current).includes('unchanged-focus-tree-32/total: inconclusive timing evidence'));
});

test('picker filtering cannot pass with absent or zero candidate evidence', () => {
  const report = performanceReport();
  const scenario = report.scenarios.find(item => item.name === 'large-search-picker-filter');
  scenario.work.query_candidates = workSummary(0);
  assert.ok(evidenceViolations(report).includes('large-search-picker-filter/query_candidates: no exercised work observed'));
  delete scenario.work.query_candidates;
  assert.ok(evidenceViolations(report).includes('large-search-picker-filter/query_candidates: missing or invalid exercised work evidence'));
});

function performanceReport() {
  return {
    metadata: {
      formatVersion: 1,
      runtime: 'node',
      runtimeKey: 'node:v24:test:x64',
      terminalSize: { columns: 80, rows: 24 },
      widthProfile: { emoji: 'wide', ambiguous: 'narrow' },
      theme: 'test',
      sampleCount: 40,
      warmupCount: 10,
      quick: false
    },
    scenarios: Object.entries(expectedScenarios).map(([name, [kind, stages]]) => ({
      name, kind, scale: 100,
      ...(kind === 'render' ? { setupWork: { normalized_records: 0 } } : {}),
      ...(kind === 'host' ? {} : { work: Object.fromEntries(requiredWorkKinds.map((workKind) => [
        workKind, workSummary((kind === 'runtime' && workKind === 'render_hooks')
          || (kind === 'render' && ['layout_nodes', 'unique_nodes', 'render_hooks', 'snapshot_rows'].includes(workKind))
          || (name === 'unchanged-focus-tree-128' && workKind === 'measurement_calls')
          || (name === 'fragmented-damage' && ['interval_operations', 'frame_index_builds', 'cell_comparisons', 'diff_output_cells'].includes(workKind))
          || (name === 'same-layer-regions' && ['region_allocations', 'region_target_visits', 'buffer_segmentations', 'accessibility_hooks'].includes(workKind))
          || (name === 'input-to-commit' && workKind === 'encoded_bytes')
          ? 1 : 0)
      ]).concat(name === 'large-search-picker-filter' ? [['query_candidates', workSummary(100)]] : [])) }),
      stages: Object.fromEntries(stages.map((stage) => [stage, timingSummary(2)]))
    }))
  };
}

function workSummary(max) {
  return { count: 40, min: max, max, median: max };
}

function timingSummary(p95Ms, overrides = {}) {
  return {
    count: 40,
    p50Ms: p95Ms,
    p95Ms,
    meanMs: p95Ms,
    standardDeviationMs: 0.1,
    medianAbsoluteDeviationMs: 0,
    coefficientOfVariation: 0.05,
    ...overrides
  };
}
