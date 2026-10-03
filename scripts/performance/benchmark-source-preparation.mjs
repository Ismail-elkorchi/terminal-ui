import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Run one built revision per process. Alternate revision order externally.
// Matcher timings include ranking; public query timings additionally include
// traversal, request/cache handling and result construction. Do not subtract
// their percentiles and describe the difference as an isolated phase.
const root = resolve(process.argv[2] ?? process.cwd());
const scale = Number(process.env['SOURCE_SCALE'] ?? 100_000);
const samples = Number(process.env['SOURCE_SAMPLES'] ?? 10);
assert.ok(Number.isSafeInteger(scale) && scale >= 100);
assert.ok(Number.isSafeInteger(samples) && samples >= 2);
const load = path => import(pathToFileURL(resolve(root, 'dist', path)).href);
const { prepareSearchPickerIndex, querySearchPickerIndex, prepareSearchPickerQuery,
  searchPickerIndexStatistics } = await load('behavior/search-picker-index.js');
const { compileCollectionQuery, queryIndexedCandidatesWork } = await load('text/query.js');
const { finishWork } = await load('foundation/cooperative-work.js');
const { createTuiCooperativeWorkContext } = await load('tui/cooperative-work.js');
const { abortableSleep } = await load('host/abortable-sleep.js');
const services = ['gateway', 'billing', 'search', 'identity', 'storage', 'scheduler', 'events', 'worker'];
const symptoms = ['timeout', 'retry spike', 'slow query', 'connection reset', 'queue backlog', 'memory pressure'];
function* entries() {
  for (let start = 0; start < scale; start += 256) {
    const batch = [];
    for (let i = start; i < Math.min(start + 256, scale); i++) {
      const id = `INC-${String(i).padStart(6, '0')}`;
      batch.push({ id, value: id,
        label: `${id} ${services[i % 8]} ${symptoms[i % 6]} region-${i % 31} trace-${i}`,
        keywords: [['Mina', 'Noor', 'Ilyas', 'Sara'][i % 4], i % 5 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low', ['triage', 'review', 'done'][i % 3]] });
    }
    yield batch;
  }
}
function workContext() {
  let yields = 0;
  let clockCalls = 0;
  const context = createTuiCooperativeWorkContext({ signal: new globalThis.AbortController().signal,
    clock: { monotonicNow: () => { clockCalls++; return performance.now(); },
      sleep: async (ms, signal) => { yields++; return abortableSleep(ms, signal); } } });
  return { context, counts: () => ({ yields, clockCalls }) };
}
const construction = workContext();
const begin = performance.now();
const index = await prepareSearchPickerIndex(entries(), construction.context);
const constructionMs = performance.now() - begin;
// Deliberate diagnostic materialization only. Production queries use their owned reader.
const values = querySearchPickerIndex(index, { text: '', mode: 'contains' }).window(0, scale);
const results = [];
let revision = 0;
for (const query of ['gateway', 'i', `trace-${scale - 1}`]) {
  const compiled = compileCollectionQuery({ text: query, mode: 'contains' });
  const expected = finishWork(queryIndexedCandidatesWork(values, compiled));
  for (let round = -2; round < samples; round++) {
    const modes = ['matcherAndRanking', 'publicSynchronous', 'publicCooperative'];
    for (let position = 0; position < modes.length; position++) {
      const mode = modes[(position + Math.max(round, 0)) % modes.length];
      // Original request spelling is part of the cache key. Whitespace varies
      // while compiled token meaning stays equal, avoiding a cached-result benchmark.
      const request = { text: `${query}${' '.repeat(++revision)}`, mode: 'contains' };
      const before = searchPickerIndexStatistics(index).queryEvaluations;
      const work = workContext();
      const start = performance.now();
      const value = mode === 'matcherAndRanking' ? finishWork(queryIndexedCandidatesWork(values, compiled))
        : mode === 'publicSynchronous' ? querySearchPickerIndex(index, request)
          : await prepareSearchPickerQuery(index, request, work.context);
      const elapsedMs = performance.now() - start;
      const matches = Array.isArray(value) ? value : value.matches;
      assert.deepEqual(matches, expected, 'Exact ranking, ties and ranges must agree');
      if (!Array.isArray(value)) {
        assert.equal(searchPickerIndexStatistics(index).queryEvaluations, before + 1, 'A measured query must not hit its result cache');
        assert.equal(value.count, expected.length);
        assert.deepEqual(value.window(0, Math.min(value.count, 8)).map(entry => entry.id), expected.slice(0, 8).map(match => match.id));
      }
      if (round >= 0) results.push({ query, mode, round, count: matches.length, elapsedMs, ...work.counts() });
    }
  }
}
console.log(JSON.stringify({ runtime: process.version, scale, samples, warmupRounds: 2,
  construction: { elapsedMs: constructionMs, ...construction.counts() },
  metadata: { observer: 'No historical frames or output; assertions run outside measured windows',
    timing: 'Independent process; no inspector or forced GC. Matcher includes ranking; API totals are not isolated finalization timing.',
    scheduling: 'Existing runtime abortable sleep adapter; operation/time defaults unchanged',
    queryCache: 'Unique whitespace-equivalent request keys; evaluations asserted' }, results }, null, 2));
