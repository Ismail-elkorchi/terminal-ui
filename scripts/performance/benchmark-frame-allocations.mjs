import { Session } from 'node:inspector';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Run separately from latency measurements: inspector sampling changes cost.
// Usage: node --expose-gc scripts/performance/benchmark-frame-allocations.mjs [built-checkout]
const root = resolve(process.argv[2] ?? process.cwd());
if (typeof globalThis.gc !== 'function') throw new Error('Run this probe with --expose-gc.');
const { createFrameBuffer, createCompositingFrameBuffer, transferFrameBufferSpans } = await import(pathToFileURL(`${root}/dist/renderer/frame-buffer.js`));
const { diffFrames } = await import(pathToFileURL(`${root}/dist/renderer/frame.js`));
const { measureTerminalCellText } = await import(pathToFileURL(`${root}/dist/text/measure.js`));
const style = Object.freeze({ bold: true, bg: Object.freeze({ kind: 'ansi', value: 2 }) });
const source = Object.freeze({ elementId: 'profile', cellRole: 'text' });
const link = Object.freeze({ href: 'https://example.test/profile' });
const text = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(2).slice(0, 96);
const spans = [{ text, style, source, link }];
const admitted = [{ graphemes: measureTerminalCellText(text).graphemes, style, source, link }];
const edited = [{ graphemes: measureTerminalCellText(text.toUpperCase()).graphemes, style, source, link }];
const prepare = () => { const buffer = createFrameBuffer(96, 12); for (let row = 1; row <= 12; row++) buffer.write(row, 1, spans); return buffer; };
const stable = prepare().snapshot();
let consumed = 0;
const cases = {
  publicPaint() { const buffer = prepare(); consumed += buffer.snapshot().cells.length; },
  admittedOverwrite() { const buffer = createCompositingFrameBuffer(96, 12); for (let row = 1; row <= 12; row++) { transferFrameBufferSpans(buffer, row, 1, admitted); transferFrameBufferSpans(buffer, row, 1, edited); } consumed += buffer.snapshot().cells.length; },
  outputRuns() { const diff = diffFrames(undefined, stable); consumed += diff.operations.length; },
};
const report = { runtime: process.version, iterations: 600, samplingIntervalBytes: 8192, cases: {} };
for (const [name, run] of Object.entries(cases)) {
  for (let i = 0; i < 30; i++) run();
  globalThis.gc();
  const session = new Session(); session.connect();
  const inspect = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  await inspect('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  for (let i = 0; i < report.iterations; i++) run();
  const { profile } = await inspect('HeapProfiler.stopSampling');
  session.disconnect();
  let sampledBytes = 0; const sites = new Map();
  const visit = node => { sampledBytes += node.selfSize; const name = `${node.callFrame.url.replace(pathToFileURL(`${root}/`).href, '')}:${node.callFrame.lineNumber}:${node.callFrame.functionName}`; sites.set(name, (sites.get(name) ?? 0) + node.selfSize); for (const child of node.children) visit(child); };
  visit(profile.head);
  report.cases[name] = { sampledBytes, sampleCount: profile.samples.length, largestSites: [...sites].sort((a, b) => b[1] - a[1]).slice(0, 12) };
}
report.consumed = consumed;
console.log(JSON.stringify(report, null, 2));
