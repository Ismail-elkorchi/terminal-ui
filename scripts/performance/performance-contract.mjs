export const requiredWorkKinds = Object.freeze([
  'layout_nodes', 'unique_nodes', 'measurement_calls', 'measurement_misses', 'render_hooks',
  'focus_target_visits', 'region_target_visits', 'target_index_entries', 'frame_index_builds',
  'buffer_segmentations', 'buffer_segmented_code_units', 'region_allocations', 'interval_operations', 'cell_transfer_calls',
  'accessibility_hooks', 'region_cells', 'snapshot_rows', 'snapshot_cells',
  'hit_targets', 'diff_rows', 'cell_comparisons', 'diff_operations',
  'diff_output_cells', 'encoded_bytes'
]);

const renderStages = Object.freeze([
  'elementConstruction', 'resolve_element', 'layout', 'focus', 'regions',
  'composition', 'frame_passes', 'cursor', 'hit_targets', 'accessibility',
  'snapshot', 'diff', 'outputPlanning', 'total'
]);

export const expectedScenarios = Object.freeze({
  'unchanged-focus-tree-32': ['render', renderStages],
  'unchanged-focus-tree-128': ['render', renderStages],
  'long-single-line': ['render', renderStages],
  'fragmented-damage': ['render', renderStages],
  'same-layer-regions': ['render', renderStages],
  'scrolling-text-area': ['render', renderStages],
  'scrolling-log-viewer': ['render', renderStages],
  'scrolling-table': ['render', renderStages],
  'scrolling-tree': ['render', renderStages],
  'typing-text-area': ['render', renderStages],
  'selecting-large-text-area': ['render', renderStages],
  'retained-small-table': ['render', renderStages],
  'retained-large-table': ['render', renderStages],
  'long-log-viewer-wrap': ['render', renderStages],
  'long-log-viewer-search': ['render', renderStages],
  'large-search-picker-filter': ['render', renderStages],
  'layered-overlay': ['render', renderStages],
  'dense-canvas-composition': ['render', renderStages],
  'real-example-btop-monitor': ['runtime', ['redraw']],
  'real-example-ide-editor': ['runtime', ['redraw']],
  'real-example-interactive-workspace': ['runtime', ['redraw']],
  'memory-host-write': ['host', ['hostWrite']],
  'input-to-commit': ['runtime', ['inputToCommit']],
  'focus-navigation-32': ['runtime', ['inputToCommit']],
  'focus-navigation-128': ['runtime', ['inputToCommit']],
  'pointer-route-to-commit': ['runtime', ['inputToCommit']],
  'resize-storm': ['runtime', ['inputToCommit']]
});

const layoutNodeLimits = Object.freeze({
  'unchanged-focus-tree-32': 33,
  'unchanged-focus-tree-128': 129,
  'fragmented-damage': 17,
  'same-layer-regions': 17
});

const exercisedWork = Object.freeze({
  'unchanged-focus-tree-128': ['measurement_calls'],
  'fragmented-damage': ['interval_operations', 'frame_index_builds', 'cell_comparisons', 'diff_output_cells'],
  'same-layer-regions': ['region_allocations', 'region_target_visits', 'buffer_segmentations', 'accessibility_hooks'],
  'large-search-picker-filter': ['query_candidates'],
  'input-to-commit': ['encoded_bytes']
});

export function evidenceViolations(report) {
  const violations = [];
  if (!isObject(report) || !isObject(report.metadata)) return ['missing report metadata'];
  const metadata = report.metadata;
  if (metadata.formatVersion !== 1) violations.push('benchmark format version must be 1');
  if (typeof metadata.runtime !== 'string' || metadata.runtime.length === 0) violations.push('missing runtime');
  if (typeof metadata.runtimeKey !== 'string' || metadata.runtimeKey.length === 0) violations.push('missing runtime key');
  if (typeof metadata.theme !== 'string' || metadata.theme.length === 0) violations.push('missing theme');
  if (!isObject(metadata.widthProfile)
    || !['narrow', 'wide'].includes(metadata.widthProfile.emoji)
    || !['narrow', 'wide'].includes(metadata.widthProfile.ambiguous)) violations.push('invalid width profile');
  if (!isObject(metadata.terminalSize)
    || !positiveInteger(metadata.terminalSize.columns)
    || !positiveInteger(metadata.terminalSize.rows)) violations.push('invalid terminal geometry');
  if (!positiveInteger(metadata.sampleCount)) violations.push('invalid sample count');
  if (!Number.isSafeInteger(metadata.warmupCount) || metadata.warmupCount < 0) violations.push('invalid warmup count');
  if (typeof metadata.quick !== 'boolean') violations.push('missing benchmark mode');
  if (!Array.isArray(report.scenarios)) return [...violations, 'missing scenarios'];
  const names = new Set();
  for (const scenario of report.scenarios) {
    if (!isObject(scenario) || typeof scenario.name !== 'string') {
      violations.push('invalid scenario');
      continue;
    }
    const name = scenario.name;
    if (names.has(name)) violations.push(`duplicate scenario: ${name}`);
    names.add(name);
    const expected = expectedScenarios[name];
    if (expected === undefined) violations.push(`unexpected scenario: ${name}`);
    else if (scenario.kind !== expected[0]) violations.push(`${name}: kind mismatch`);
    if (!positiveInteger(scenario.scale)) violations.push(`${name}: invalid scale`);
    if (!isObject(scenario.stages)) violations.push(`${name}: missing stages`);
    const requiredStages = expected?.[1] ?? [];
    for (const stage of requiredStages) {
      if (!validTiming(scenario.stages?.[stage], metadata.sampleCount)) violations.push(`${name}/${stage}: missing or invalid timing evidence`);
    }
    for (const [stage, summary] of Object.entries(scenario.stages ?? {})) {
      if (!validTiming(summary, metadata.sampleCount) && !requiredStages.includes(stage)) {
        violations.push(`${name}/${stage}: invalid timing evidence`);
      }
    }
    if (scenario.kind === 'render' || scenario.kind === 'runtime') {
      if (!isObject(scenario.work)) violations.push(`${name}: missing work counters`);
      for (const kind of requiredWorkKinds) {
        if (!validWork(scenario.work?.[kind], metadata.sampleCount)) violations.push(`${name}/${kind}: missing or invalid work evidence`);
      }
      for (const [kind, summary] of Object.entries(scenario.work ?? {})) {
        if (!validWork(summary, metadata.sampleCount) && !requiredWorkKinds.includes(kind)) {
          violations.push(`${name}/${kind}: invalid work evidence`);
        }
      }
      if (scenario.kind === 'runtime' && validWork(scenario.work?.render_hooks, metadata.sampleCount)
        && scenario.work.render_hooks.max === 0) violations.push(`${name}: no render work observed`);
    }
    if (scenario.kind === 'render') {
      if (!isObject(scenario.setupWork)) violations.push(`${name}: missing setup work`);
      for (const [kind, count] of Object.entries(scenario.setupWork ?? {})) {
        if (!nonnegative(count)) violations.push(`${name}/${kind}: invalid setup work`);
      }
      for (const kind of ['layout_nodes', 'unique_nodes', 'render_hooks', 'snapshot_rows']) {
        if (validWork(scenario.work?.[kind], metadata.sampleCount) && scenario.work[kind].max === 0) {
          violations.push(`${name}/${kind}: no work observed`);
        }
      }
    }
    for (const kind of exercisedWork[name] ?? []) {
      if (!validWork(scenario.work?.[kind], metadata.sampleCount)) {
        violations.push(`${name}/${kind}: missing or invalid exercised work evidence`);
      } else if (scenario.work[kind].max === 0) {
        violations.push(`${name}/${kind}: no exercised work observed`);
      }
    }
  }
  for (const name of Object.keys(expectedScenarios)) {
    if (!names.has(name)) violations.push(`missing scenario: ${name}`);
  }
  return Object.freeze(violations);
}

export function structuralBudgetViolations(report) {
  const violations = [...evidenceViolations(report)];
  if (violations.length > 0) return Object.freeze(violations);
  const cells = report.metadata.terminalSize.columns * report.metadata.terminalSize.rows;
  const rows = report.metadata.terminalSize.rows;
  for (const scenario of report.scenarios.filter((item) => item.kind === 'render')) {
    const work = scenario.work;
    const setup = scenario.setupWork.normalized_records ?? 0;
    check(violations, scenario.name, 'normalized_records', setup, scenario.scale);
    check(violations, scenario.name, 'layout_nodes', work.layout_nodes.max, layoutNodeLimits[scenario.name] ?? 16);
    if (work.unique_nodes.max > work.layout_nodes.max) violations.push(`${scenario.name}: unique nodes exceed layout visits`);
    check(violations, scenario.name, 'query_candidates', work.query_candidates?.max ?? 0, scenario.scale);
    check(violations, scenario.name, 'region_cells', work.region_cells.max, cells * 2);
    check(violations, scenario.name, 'snapshot_rows', work.snapshot_rows.max, rows);
    check(violations, scenario.name, 'snapshot_cells', work.snapshot_cells.max, cells);
    check(violations, scenario.name, 'hit_targets', work.hit_targets.max, rows * 8);
    check(violations, scenario.name, 'diff_rows', work.diff_rows.max, rows);
    check(violations, scenario.name, 'cell_comparisons', work.cell_comparisons.max, cells * 2);
    check(violations, scenario.name, 'diff_operations', work.diff_operations.max, rows * 4);
    check(violations, scenario.name, 'encoded_bytes', work.encoded_bytes.max, cells * 4);
    if (work.measurement_misses.max > work.measurement_calls.max) {
      violations.push(`${scenario.name}: measurement misses exceed calls`);
    }
  }
  for (const scenario of report.scenarios.filter((item) => item.name === 'focus-navigation-128')) {
    check(violations, scenario.name, 'focus_target_visits', scenario.work.focus_target_visits.max, 4);
  }
  return Object.freeze(violations);
}

export function timingRegressionViolations(baseline, current) {
  const violations = [
    ...evidenceViolations(baseline).map((item) => `baseline: ${item}`),
    ...evidenceViolations(current).map((item) => `current: ${item}`)
  ];
  if (violations.length > 0) return Object.freeze(violations);
  if (baseline.metadata.runtimeKey !== current.metadata.runtimeKey) violations.push('runtime key mismatch');
  if (baseline.metadata.runtime !== current.metadata.runtime) violations.push('runtime mismatch');
  if (baseline.metadata.quick !== current.metadata.quick) violations.push('benchmark mode mismatch');
  if (baseline.metadata.sampleCount !== current.metadata.sampleCount) violations.push('sample count mismatch');
  if (baseline.metadata.warmupCount !== current.metadata.warmupCount) violations.push('warmup count mismatch');
  if (JSON.stringify(baseline.metadata.terminalSize) !== JSON.stringify(current.metadata.terminalSize)) {
    violations.push('terminal size mismatch between timing reports');
  }
  if (JSON.stringify(baseline.metadata.widthProfile) !== JSON.stringify(current.metadata.widthProfile)) {
    violations.push('width profile mismatch between timing reports');
  }
  if (baseline.metadata.theme !== current.metadata.theme) violations.push('theme mismatch between timing reports');
  const currentScenarios = new Map(current.scenarios.map((scenario) => [scenario.name, scenario]));
  for (const base of baseline.scenarios) {
    const next = currentScenarios.get(base.name);
    if (next.scale !== base.scale) violations.push(`${base.name}: scale mismatch`);
  }
  if (violations.length > 0) return Object.freeze(violations);
  for (const base of baseline.scenarios) {
    const next = currentScenarios.get(base.name);
    for (const [stage, summary] of Object.entries(base.stages)) {
      const currentSummary = next.stages[stage];
      if (currentSummary === undefined) {
        violations.push(`${base.name}/${stage}: missing current stage`);
        continue;
      }
      if (!varianceIsControlled(summary, currentSummary)) {
        violations.push(`${base.name}/${stage}: inconclusive timing evidence`);
        continue;
      }
      const tolerance = Math.max(0.25, summary.p95Ms * 0.25, summary.medianAbsoluteDeviationMs * 6);
      if (currentSummary.p95Ms > summary.p95Ms + tolerance) {
        violations.push(`${base.name}/${stage}: ${String(currentSummary.p95Ms)}ms > `
          + `${String(summary.p95Ms)}ms + ${String(Number(tolerance.toFixed(4)))}ms`);
      }
    }
  }
  return Object.freeze(violations);
}

function varianceIsControlled(baseline, current) {
  return baseline.count >= 20 && current.count >= 20
    && baseline.coefficientOfVariation <= 0.2 && current.coefficientOfVariation <= 0.2;
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonnegative(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function validWork(value, count) {
  return isObject(value) && value.count === count && nonnegative(value.min)
    && nonnegative(value.median) && nonnegative(value.max)
    && value.min <= value.median && value.median <= value.max;
}
function validTiming(value, count) {
  return isObject(value) && value.count === count && nonnegative(value.p50Ms)
    && nonnegative(value.p95Ms) && nonnegative(value.meanMs) && nonnegative(value.standardDeviationMs)
    && nonnegative(value.medianAbsoluteDeviationMs) && nonnegative(value.coefficientOfVariation)
    && value.p50Ms <= value.p95Ms;
}
function check(violations, scenario, kind, actual, limit) {
  if (actual > limit) violations.push(`${scenario}/${kind}: ${String(actual)} > ${String(limit)}`);
}
