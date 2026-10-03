import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('source preparation probe checks broad and selective uncached results with bounded evidence', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/performance/benchmark-source-preparation.mjs'], {
      cwd: process.cwd(), env: { ...process.env, SOURCE_SCALE: '100', SOURCE_SAMPLES: '2' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scale, 100);
  assert.equal(report.samples, 2);
  assert.equal(report.results.length, 18);
  assert.ok(report.construction.elapsedMs >= 0);
  for (const item of report.results) {
    assert.ok(item.elapsedMs >= 0);
    assert.ok(Number.isInteger(item.yields) && item.yields >= 0);
    assert.ok(Number.isInteger(item.clockCalls) && item.clockCalls >= 0);
    assert.equal(item.count, item.query === 'i' ? 100 : item.query === 'gateway' ? 13 : 1);
  }
  assert.deepEqual([...new Set(report.results.map(item => item.mode))].sort(),
    ['matcherAndRanking', 'publicCooperative', 'publicSynchronous']);
});
