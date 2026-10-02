import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import process from 'node:process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryTerminalHost, createNodeTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { keyInput } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
const moduleBegin = performance.now();
const { incidentWorkbenchApp, incidentCount } = await import('../../examples/tui/incident-workbench.ts');
const moduleImportMs = performance.now() - moduleBegin;

const sampleCount = Number(process.env['WORKBENCH_SAMPLES'] ?? 24);
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 20);
const writeDelayMs = Number(process.env['WORKBENCH_WRITE_DELAY_MS'] ?? 0);
assert.ok(Number.isFinite(writeDelayMs) && writeDelayMs >= 0);
const memoryAfterDataset = process.memoryUsage();
const memoryHost = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 40 } });
// Memory time is manually controlled and sleep(0) resolves immediately. Use the
// native clock so effect-owned preparation really yields to incoming input.
const clockHost = createNodeTerminalHost();
let writes = 0;
// Do not retain every historical frame/output in the benchmark observer: a real
// terminal consumes writes rather than keeping hundreds of complete frame graphs.
const host = { ...memoryHost, observer: {}, clock: clockHost.clock, async write(chunk, context) {
  writes++;
  if (writeDelayMs > 0) await delay(writeDelayMs);
  const receipt = await memoryHost.write(chunk, context);
  memoryHost.stdout.clear();
  return receipt;
} };
const runtime = createTuiRuntime({ app: incidentWorkbenchApp, host });
const feedback = [], final = [], superseding = [], timerLag = [];
const textInput = text => ({ kind: 'text', text, paste: false });
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples, p50: sorted[Math.ceil(sorted.length * .5) - 1], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1) };
}
async function settled() {
  const deadline = performance.now() + 60_000;
  while (runtime.state().searchPicker.state.pending === true || runtime.state().searchPicker.state.construction.pending === true) {
    assert.ok(performance.now() < deadline, 'Query did not settle');
    await delay(1);
  }
  assert.equal(runtime.state().searchPicker.state.construction.error, null);
  assert.equal(runtime.diagnostics().filter(item => item.diagnostic?.severity === 'error').length, 0);
}
async function selectAll() {
  await runtime.handleInput(keyInput('a', { modifiers: { ctrl: true } }));
}
const initialBegin = performance.now();
await runtime.start();
const initialFrameMs = performance.now() - initialBegin;
const firstOpenBegin = performance.now();
await runtime.dispatch({ kind: 'openSearchPicker' });
const firstOpenFeedbackMs = performance.now() - firstOpenBegin;
await settled();
const firstOpenReadyMs = performance.now() - firstOpenBegin;
for (let i = -2; i < sampleCount; i++) {
  await selectAll();
  const query = `trace-${String(10100 + i)}`;
  const begin = performance.now();
  await runtime.handleInput(textInput(query));
  const feedbackMs = performance.now() - begin;
  assert.equal(runtime.state().searchPicker.state.control.editor.input.text, query);
  await settled();
  const finalMs = performance.now() - begin;
  assert.equal(runtime.state().searchPicker.state.control.editor.activeId, `INC-${String(10100 + i).padStart(6, '0')}`, 'Exact incident should be the active result');
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
    assert.equal(runtime.state().searchPicker.state.control.editor.input.text, `trace-${String(20200 + i)}`);
    assert.equal(runtime.state().searchPicker.state.control.editor.activeId, `INC-${String(20200 + i).padStart(6, '0')}`);
    assert.ok(renderFramePlain(runtime.frame()).includes(`trace-${String(20200 + i)}`));
    superseding.push(performance.now() - due);
  })();
  const broad = runtime.handleInput(textInput(`gateway ${String(i)}`));
  await Promise.all([broad, latest]);
  timerLag.push(Math.max(0, observedArrival - due));
}
// Exercise real character-by-character admission while each prefix replaces work.
// This intentionally differs from one text event containing a complete query.
const typingFeedback = [], typingFinal = [], typingEventLoopDelay = [], cancellation = [];
for (let i = 0; i < sampleCount; i++) {
  await selectAll();
  const query = `trace-${String(30300 + i)}`;
  const begin = performance.now();
  let prefix = '';
  for (const character of query) {
    const due = performance.now();
    const timer = delay(0).then(() => { typingEventLoopDelay.push(Math.max(0, performance.now() - due)); });
    const characterBegin = performance.now();
    await runtime.handleInput(textInput(character));
    typingFeedback.push(performance.now() - characterBegin);
    prefix += character;
    assert.equal(runtime.state().searchPicker.state.control.editor.input.text, prefix, 'Reliable character events retain order');
    await timer;
  }
  await settled();
  typingFinal.push(performance.now() - begin);
  assert.equal(runtime.state().searchPicker.state.control.editor.activeId, `INC-${String(30300 + i).padStart(6, '0')}`);
  await selectAll();
  await runtime.handleInput(textInput('gateway'));
  const cancelBegin = performance.now();
  await runtime.handleInput(keyInput('escape'));
  cancellation.push(performance.now() - cancelBegin);
  assert.equal(runtime.state().searchPicker.state.open, false);
  await runtime.dispatch({ kind: 'openSearchPicker' });
  await settled();
}
assert.ok(writes > sampleCount, 'Host write instrumentation must observe actual commits');
const report = {
  metadata: { measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), dataset: { incidents: incidentCount, commands: 4, deterministic: true }, terminalSize: { columns: 120, rows: 40 }, writeDelayMs, observedHostWrites: writes, sampleCount, warmupCount: 2, host: 'memory terminal output with native Node clock; no PTY/terminal-emulator presentation latency', workload: 'full incident workbench, unique literal trace queries plus character-by-character input and Escape, input through handleInput and committed frame; setup/index construction measured separately', limitations: 'Shared cloud CPU; polling adds up to ~1ms plus scheduling to final results. Two warmups precede unique, uncached measured queries. Module setup and initial/palette frames are measured separately; process launch and terminal-emulator presentation are excluded.' },
  characterToCommittedFeedbackMs: summary(typingFeedback),
  characterStreamToFinalResultMs: summary(typingFinal),
  characterEventLoopDelayMs: summary(typingEventLoopDelay),
  escapeToCommittedFeedbackMs: summary(cancellation),
  setup: { moduleImportMs, initialFrameMs, firstOpenFeedbackMs, firstOpenReadyMs },
  inputToFirstCommittedFeedbackMs: summary(feedback),
  inputToFinalResultFrameMs: summary(final),
  scheduledSupersedingInputToFinalFrameMs: summary(superseding),
  supersedingInputEventLoopDelayMs: summary(timerLag),
  memory: { afterDataset: memoryAfterDataset, afterSamples: process.memoryUsage(), processMaxRssBytes: process.resourceUsage().maxRSS * 1024, note: 'Whole process including dataset/index, runtime; benchmark observer discards historical frames and written bytes; not library-only allocations' },
  diagnostics: runtime.diagnostics(),
};
await runtime.dispose();
await clockHost.dispose();
const out = process.argv[2];
if (out) await writeFile(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
