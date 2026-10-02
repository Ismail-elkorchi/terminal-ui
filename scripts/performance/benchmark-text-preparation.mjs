import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { abortableSleep } from '../../src/host/abortable-sleep.ts';
import { createTextDocument } from '../../src/text/document.ts';
import { prepareTextBuffer, prepareTextDocument } from '../../src/text/preparation.ts';
import { createTerminalTextIndex } from '../../src/text/terminal-text-index.ts';

const trials = Number(process.argv[2] ?? 3);
if (!Number.isSafeInteger(trials) || trials < 1 || trials > 100) throw new RangeError('Trials must be between 1 and 100.');
const size = 1_100_000;
const scenarios = [
  { name: 'document-construction', text: '·界a '.repeat(size / 4), document: true, request: {} },
  { name: 'ascii-geometry', text: 'a'.repeat(size), request: { geometry: true } },
  { name: 'unicode-geometry', text: '·界a '.repeat(size / 4), request: { geometry: true } },
  { name: 'locale-words', text: 'alpha beta '.repeat(Math.ceil(size / 11)), request: { words: true, locale: 'en' } },
  { name: 'giant-cluster', text: `e${'\u0301'.repeat(size)}!`, request: { geometry: true } },
];
const results = [];
for (const scenario of scenarios) {
  for (let trial = 0; trial < trials; trial++) {
    const text = `${String(trial)}:${scenario.text}`;
    const signal = new globalThis.AbortController().signal;
    const native = nativeProbe();
    let previous = performance.now();
    const start = previous;
    let maxWorkSliceMs = 0;
    let schedulerMs = 0;
    let yields = 0;
    try {
      const context = { signal,
        yield: async () => {
          const before = performance.now();
          maxWorkSliceMs = Math.max(maxWorkSliceMs, before - previous);
          yields++;
          await abortableSleep(0, signal);
          previous = performance.now();
          schedulerMs += previous - before;
        },
      };
      if (scenario.document === true) await prepareTextDocument(text, context);
      else await prepareTextBuffer({ text, cursor: 0 }, scenario.request, context);
      const finished = performance.now();
      maxWorkSliceMs = Math.max(maxWorkSliceMs, finished - previous);
      results.push({ scenario: scenario.name, trial, codeUnits: text.length,
        readinessMs: finished - start, schedulerMs, maxWorkSliceMs, yields, ...native.metrics });
    } finally { native.restore(); }
    const synchronousNative = nativeProbe();
    const synchronous = performance.now();
    if (scenario.document === true) createTextDocument(text);
    else {
      const index = createTerminalTextIndex(text);
      if (scenario.request.words) index.nextWordBoundary(text.length);
      else void index.cells;
    }
    results.at(-1).synchronousMs = performance.now() - synchronous;
    synchronousNative.restore();
  }
}
console.log(JSON.stringify({ node: process.version, icu: process.versions.icu, trials,
  note: 'Native setup/callback and giant-cluster measurement are indivisible. Timings include instrumentation and are observations, not latency guarantees.',
  results }, null, 2));

function nativeProbe() {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
  const original = descriptor.value;
  const metrics = { graphemeCalls: 0, wordCalls: 0, nativeInputUnits: 0, maxGraphemeInputUnits: 0,
    maxWordInputUnits: 0, maxNativeSetupMs: 0, maxNativeCallbackMs: 0 };
  Object.defineProperty(Intl.Segmenter.prototype, 'segment', { configurable: true,
    value(text) {
      const granularity = this.resolvedOptions().granularity;
      if (granularity === 'word') {
        metrics.wordCalls++;
        metrics.maxWordInputUnits = Math.max(metrics.maxWordInputUnits, text.length);
      } else {
        metrics.graphemeCalls++;
        metrics.maxGraphemeInputUnits = Math.max(metrics.maxGraphemeInputUnits, text.length);
      }
      metrics.nativeInputUnits += text.length;
      const before = performance.now();
      const segments = original.call(this, text);
      metrics.maxNativeSetupMs = Math.max(metrics.maxNativeSetupMs, performance.now() - before);
      return { [Symbol.iterator]() {
        const iterator = segments[Symbol.iterator]();
        return { next() {
          const started = performance.now();
          const result = iterator.next();
          metrics.maxNativeCallbackMs = Math.max(metrics.maxNativeCallbackMs, performance.now() - started);
          return result;
        } };
      } };
    },
  });
  return { metrics, restore: () => Object.defineProperty(Intl.Segmenter.prototype, 'segment', descriptor) };
}
