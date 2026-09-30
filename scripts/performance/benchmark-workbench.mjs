import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { keyInput } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { incidentWorkbenchApp, incidentCount } from '../../examples/tui/incident-workbench.ts';

const sampleCount = Number(process.env['WORKBENCH_SAMPLES'] ?? 24);
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 20);
const writeDelayMs = Number(process.env['WORKBENCH_WRITE_DELAY_MS'] ?? 0);
assert.ok(Number.isFinite(writeDelayMs) && writeDelayMs >= 0);
const memoryAfterDataset = process.memoryUsage();
const memoryHost = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 40 } });
let writes = 0;
const host = { ...memoryHost, async write(chunk, context) { writes++; if (writeDelayMs > 0) await delay(writeDelayMs); return memoryHost.write(chunk, context); } };
const runtime = createTuiRuntime({ app: incidentWorkbenchApp, host });
const feedback = [], final = [], superseding = [], timerLag = [];
const textInput = text => ({ kind: 'text', text, paste: false });
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
}
async function settled() {
  const deadline = performance.now() + 60_000;
  while (runtime.state().searchPicker.pending === true) {
    assert.ok(performance.now() < deadline, 'Query did not settle');
    await delay(1);
  }
  assert.equal(runtime.diagnostics().filter(item => item.diagnostic?.severity === 'error').length, 0);
}
async function selectAll() {
  await runtime.handleInput(keyInput('a', { modifiers: { ctrl: true } }));
}
await runtime.start();
await runtime.dispatch({ kind: 'openSearchPicker' });
await settled();
for (let i = -2; i < sampleCount; i++) {
  await selectAll();
  const query = `trace-${String(10100 + i)}`;
  const begin = performance.now();
  await runtime.handleInput(textInput(query));
  const feedbackMs = performance.now() - begin;
  assert.equal(runtime.state().searchPicker.state.editor.input.text, query);
  await settled();
  const finalMs = performance.now() - begin;
  assert.equal(runtime.state().searchPicker.state.editor.activeId, `INC-${String(10100 + i).padStart(6, '0')}`, 'Exact incident should be the active result');
  assert.ok(renderFramePlain(runtime.frame()).includes(query), 'Final frame must show queried incident');
  if (i >= 0) { feedback.push(feedbackMs); final.push(finalMs); }
}
// Arrival is scheduled independently on the event loop. Baseline blocking work delays
// this callback; reporting only the second handleInput duration would hide that lag.
for (let i = 0; i < sampleCount; i++) {
  await selectAll();
  const begin = performance.now();
  const due = begin + 1;
  let observedArrival;
  const latest = (async () => {
    await delay(1);
    observedArrival = performance.now();
    await selectAll();
    await runtime.handleInput(textInput(`trace-${String(20200 + i)}`));
    await settled();
    assert.equal(runtime.state().searchPicker.state.editor.input.text, `trace-${String(20200 + i)}`);
    assert.equal(runtime.state().searchPicker.state.editor.activeId, `INC-${String(20200 + i).padStart(6, '0')}`);
    assert.ok(renderFramePlain(runtime.frame()).includes(`trace-${String(20200 + i)}`));
    superseding.push(performance.now() - due);
  })();
  const broad = runtime.handleInput(textInput(`gateway ${String(i)}`));
  await Promise.all([broad, latest]);
  timerLag.push(Math.max(0, observedArrival - due));
}
assert.ok(writes > sampleCount, 'Host write instrumentation must observe actual commits');
const report = {
  metadata: { measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), dataset: { incidents: incidentCount, commands: 4, deterministic: true }, terminalSize: { columns: 120, rows: 40 }, writeDelayMs, observedHostWrites: writes, sampleCount, warmupCount: 2, host: 'memory terminal host; no PTY/terminal-emulator presentation latency', workload: 'full incident workbench, unique literal trace queries, input through handleInput and committed frame; setup/index construction excluded', limitations: 'Shared cloud CPU; polling adds up to ~1ms plus scheduling to final results. Two warmups precede unique, uncached measured queries. Cold process/startup is not included.' },
  inputToFirstCommittedFeedbackMs: summary(feedback),
  inputToFinalResultFrameMs: summary(final),
  scheduledSupersedingInputToFinalFrameMs: summary(superseding),
  supersedingInputEventLoopDelayMs: summary(timerLag),
  memory: { afterDataset: memoryAfterDataset, afterSamples: process.memoryUsage(), processMaxRssBytes: process.resourceUsage().maxRSS * 1024, note: 'Whole process including dataset/index, runtime and retained memory-host frames; not library-only allocations' },
  diagnostics: runtime.diagnostics(),
};
await runtime.dispose();
const out = process.argv[2];
if (out) await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
