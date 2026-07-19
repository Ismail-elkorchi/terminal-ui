import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('interactive benchmark emits reproducible structural evidence', async () => {
  const result = await runBenchmark();
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout.trim());

  assert.equal(report.metadata.schemaVersion, 'terminal-ui.performance-evidence.v1');
  assert.equal(report.metadata.quick, true);
  assert.equal(report.metadata.warmupCount, 1);
  assert.ok(report.scenarios.length >= 10);
  assert.ok(report.scenarios.some((scenario) => scenario.name === 'input-to-commit'));
  assert.ok(report.scenarios.some((scenario) => scenario.name === 'resize-storm'));
  assert.ok(report.scenarios.some((scenario) => scenario.name === 'memory-host-write'));
  assert.ok(report.scenarios.every((scenario) => scenario.scale > 0));
  assert.ok(report.scenarios.every((scenario) => Object.values(scenario.stages).every((stage) => (
    stage.count === report.metadata.sampleCount
    && stage.p50Ms >= 0
    && stage.p95Ms >= 0
    && stage.coefficientOfVariation >= 0
  ))));
  assert.ok(report.dominantStages.length > 0);
});

function runBenchmark() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/benchmark-interactive.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, TERMINAL_UI_BENCHMARK_QUICK: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => { resolve({ code, stdout, stderr }); });
  });
}
