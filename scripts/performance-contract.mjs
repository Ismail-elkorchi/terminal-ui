const authoredNodeLimits = Object.freeze({
  'real-example-btop-monitor': 160,
  'real-example-ide-editor': 40,
  'real-example-interactive-workspace': 56
});

export function structuralBudgetViolations(report) {
  const violations = [];
  const terminalSizeCells = report.metadata.terminalSize.columns * report.metadata.terminalSize.rows;
  const rowLimit = report.metadata.terminalSize.rows;
  for (const scenario of report.scenarios.filter((candidate) => candidate.kind === 'render')) {
    const setupRecords = scenario.setupWork?.normalized_records ?? 0;
    if (setupRecords > scenario.scale) {
      violations.push(violation(scenario.name, 'normalized_records', setupRecords, scenario.scale));
    }
    const work = scenario.work ?? {};
    const authored = maximum(work.authored_nodes);
    const measured = maximum(work.measured_nodes);
    const rendered = maximum(work.rendered_nodes);
    const authoredLimit = authoredNodeLimits[scenario.name] ?? 16;
    check(violations, scenario.name, 'authored_nodes', authored, authoredLimit);
    check(violations, scenario.name, 'measured_nodes', measured, authored);
    check(violations, scenario.name, 'rendered_nodes', rendered, measured);
    check(violations, scenario.name, 'query_candidates', maximum(work.query_candidates), scenario.scale);
    check(violations, scenario.name, 'composed_cells', maximum(work.composed_cells), terminalSizeCells * 2);
    check(violations, scenario.name, 'snapshot_rows', maximum(work.snapshot_rows), rowLimit);
    check(violations, scenario.name, 'snapshot_cells', maximum(work.snapshot_cells), terminalSizeCells);
    check(violations, scenario.name, 'emitted_cells', maximum(work.emitted_cells), terminalSizeCells);
    check(violations, scenario.name, 'hit_target_candidates', maximum(work.hit_target_candidates), rowLimit * 8);
    check(violations, scenario.name, 'diff_rows', maximum(work.diff_rows), rowLimit);
    check(violations, scenario.name, 'diff_cells', maximum(work.diff_cells), terminalSizeCells);
    check(violations, scenario.name, 'diff_operations', maximum(work.diff_operations), rowLimit * 4);
    check(violations, scenario.name, 'encoded_bytes', maximum(work.encoded_bytes), terminalSizeCells * 4);
  }
  return Object.freeze(violations);
}

export function timingRegressionViolations(baseline, current) {
  if (baseline.metadata.runtimeKey !== current.metadata.runtimeKey) {
    return Object.freeze([`runtime key mismatch: ${baseline.metadata.runtimeKey} != ${current.metadata.runtimeKey}`]);
  }
  if (JSON.stringify(baseline.metadata.terminalSize) !== JSON.stringify(current.metadata.terminalSize)) {
    return Object.freeze(['terminal size mismatch between timing reports']);
  }
  const currentScenarios = new Map(current.scenarios.map((scenario) => [scenario.name, scenario]));
  const violations = [];
  for (const baselineScenario of baseline.scenarios) {
    const currentScenario = currentScenarios.get(baselineScenario.name);
    if (currentScenario === undefined || currentScenario.scale !== baselineScenario.scale) continue;
    for (const [stage, baselineSummary] of Object.entries(baselineScenario.stages)) {
      const currentSummary = currentScenario.stages[stage];
      if (currentSummary === undefined || !varianceIsControlled(baselineSummary, currentSummary)) continue;
      const tolerance = Math.max(
        0.25,
        baselineSummary.p95Ms * 0.25,
        baselineSummary.medianAbsoluteDeviationMs * 6
      );
      if (currentSummary.p95Ms > baselineSummary.p95Ms + tolerance) {
        violations.push(
          `${baselineScenario.name}/${stage}: ${String(currentSummary.p95Ms)}ms > `
          + `${String(baselineSummary.p95Ms)}ms + ${String(Number(tolerance.toFixed(4)))}ms`
        );
      }
    }
  }
  return Object.freeze(violations);
}

function varianceIsControlled(baseline, current) {
  return baseline.count >= 20
    && current.count >= 20
    && baseline.coefficientOfVariation <= 0.2
    && current.coefficientOfVariation <= 0.2;
}

function maximum(summary) {
  return summary?.max ?? 0;
}

function check(violations, scenario, kind, actual, limit) {
  if (actual > limit) violations.push(violation(scenario, kind, actual, limit));
}

function violation(scenario, kind, actual, limit) {
  return `${scenario}/${kind}: ${String(actual)} > ${String(limit)}`;
}
