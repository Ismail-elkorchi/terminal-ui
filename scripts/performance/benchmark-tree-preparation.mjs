import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import process from 'node:process';
import { setImmediate as scheduleTurn } from 'node:timers';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const baselineFlag = process.argv.indexOf('--baseline-root');
const baselineRoot = baselineFlag < 0 ? undefined : process.argv[baselineFlag + 1];
if (baselineFlag >= 0 && baselineRoot === undefined) throw new Error('--baseline-root needs a source checkout path.');
const current = await measure(root);
const baseline = baselineRoot === undefined ? undefined : await measure(resolve(baselineRoot));
process.stdout.write(`${JSON.stringify({ node: process.version, rows: 50_001, trials: 24,
  current, ...(baseline === undefined ? {} : { baseline }),
}, null, 2)}\n`);

async function measure(directory) {
  const library = await import(pathToFileURL(resolve(directory, 'src/behavior/tree-operations.ts')).href);
  const trials = [];
  for (let trial = 0; trial < 24; trial += 1) {
    const source = library.createTreeSource([{ id: 'root', label: 'Root', kind: 'branch', children:
      Array.from({ length: 50_000 }, (_, index) => ({ id: String(index), label: `needle document ${String(index)}`, kind: 'leaf' })),
    }]);
    const state = { expandedIds: [], selection: { mode: 'single' }, query: { text: 'needle' } };
    const chunks = [];
    const started = performance.now();
    let sliceStarted = started;
    const scheduledTurn = new Promise(resolveTurn => scheduleTurn(() => resolveTurn(performance.now() - started)));
    const view = library.prepareTreeView === undefined
      ? library.createTreeView(source, state)
      : await library.prepareTreeView(source, state, {
        signal: new globalThis.AbortController().signal,
        yield: async () => {
          chunks.push(performance.now() - sliceStarted);
          await yieldTurn();
          sliceStarted = performance.now();
        },
      });
    const totalMs = performance.now() - started;
    const firstScheduledTurnMs = await scheduledTurn;
    let navigated = { ...state, activeId: '25000' };
    const navigationStarted = performance.now();
    for (let index = 0; index < 1000; index += 1) {
      navigated = library.treeReducer(navigated, { kind: 'moveActive', delta: index % 2 === 0 ? 1 : -1 }, { source, view });
    }
    const navigation1000Ms = performance.now() - navigationStarted;
    const cancellation = library.prepareTreeView === undefined ? undefined : await measureCancellation(library, source, state);
    trials.push({ totalMs, firstScheduledTurnMs, navigation1000Ms, batches: chunks.length,
      ...(chunks.length === 0 ? {} : { chunkP95Ms: percentile(chunks, 0.95), maxChunkMs: Math.max(...chunks) }),
      ...(cancellation === undefined ? {} : cancellation),
      returnedRows: view.collection.totalCount,
    });
  }
  return { medianTotalMs: percentile(trials.map(trial => trial.totalMs), 0.5),
    medianFirstScheduledTurnMs: percentile(trials.map(trial => trial.firstScheduledTurnMs), 0.5),
    p95FirstScheduledTurnMs: percentile(trials.map(trial => trial.firstScheduledTurnMs), 0.95),
    medianNavigation1000Ms: percentile(trials.map(trial => trial.navigation1000Ms), 0.5), trials };
}

async function measureCancellation(library, source, state) {
  const controller = new globalThis.AbortController();
  const started = performance.now();
  let abortedAt;
  const reason = new Error('cancel cold tree query');
  scheduleTurn(() => { abortedAt = performance.now(); controller.abort(reason); });
  try {
    await library.prepareTreeView(source, { ...state, query: { text: 'document' } }, {
      signal: controller.signal, yield: () => yieldTurn(),
    });
    throw new Error('Expected interrupted preparation.');
  } catch (error) {
    if (error !== reason) throw error;
  }
  return { cancelEventToReturnMs: performance.now() - abortedAt, cancelStartToReturnMs: performance.now() - started };
}

function percentile(values, fraction) {
  return values.toSorted((left, right) => left - right)[Math.floor((values.length - 1) * fraction)];
}
