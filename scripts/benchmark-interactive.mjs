import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';

import {
  diffFrames,
  renderDiffAnsi,
  renderElementFrame
} from '../dist/renderer/index.js';
import {
  canvas,
  palette,
  scrollback,
  table,
  text,
  textArea,
  tree
} from '../dist/components/index.js';
import { column, overlay } from '../dist/layout/index.js';
import {
  appendScrollbackHistory,
  createScrollState,
  preparePaletteIndex,
  prepareScrollbackHistory,
  prepareTableCollection,
  prepareTreeCollection
} from '../dist/behavior/index.js';
import { createMemoryTerminalHost } from '../dist/host/index.js';
import {
  defaultTextWidthProfile,
  prepareTextDocument,
  textCaretAt,
  textDocumentLength,
  textDocumentLineCount,
  textDocumentSelectionBetween
} from '../dist/text/index.js';
import { defaultTheme } from '../dist/theme/index.js';
import { createTuiRuntime, defineTui } from '../dist/tui/index.js';
import { paletteIndexStatistics, scrollbackSearchStatistics } from '../dist/testing/index.js';
import { summarizeSamples } from './benchmark-statistics.mjs';

const quick = process.env['TERMINAL_UI_BENCHMARK_QUICK'] === '1';
const sampleCount = quick ? 4 : 40;
const warmupCount = quick ? 1 : 10;
const viewport = Object.freeze({ columns: 120, rows: 40 });
const widthProfile = defaultTextWidthProfile;
const outputPath = outputArgument(process.argv.slice(2));
const benchmarkHost = createMemoryTerminalHost({ viewport });
const benchmarkContext = Object.freeze({
  viewport,
  capabilities: await benchmarkHost.getCapabilities(),
  diagnostics: [],
  clock: benchmarkHost.clock
});
const [{ btopMonitorApp }, { ideEditorApp }, { interactiveWorkspaceApp }] = await Promise.all([
  import('../examples/tui/btop-monitor.ts'),
  import('../examples/tui/ide-editor.ts'),
  import('../examples/tui/interactive-workspace.ts')
]);
const metadata = Object.freeze({
  schemaVersion: 'terminal-ui.performance-evidence.v1',
  runtime: 'node',
  runtimeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
  runtimeKey: `node:${process.version}:${process.platform}:${process.arch}`,
  viewport,
  theme: defaultTheme.name,
  widthProfile,
  warmupCount,
  sampleCount,
  quick
});

const results = [];
for (const scenario of renderScenarios([btopMonitorApp, ideEditorApp, interactiveWorkspaceApp])) {
  results.push(runRenderScenario(scenario));
}
results.push(await runHostWriteScenario());
results.push(await runInputToCommitScenario());
results.push(await runPointerRoutingScenario());
results.push(await runResizeStormScenario());
await benchmarkHost.dispose();

const report = Object.freeze({
  metadata,
  scenarios: results,
  dominantStages: dominantStages(results)
});

if (outputPath !== undefined) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);

function renderScenarios(realApps) {
  const tableRows = Array.from({ length: quick ? 5_000 : 100_000 }, (_value, index) => ({
    id: String(index),
    name: `Process ${String(index)}`,
    value: index
  }));
  const tableCollection = prepareTableCollection(tableRows, (row) => row.id);
  const smallTableCollection = prepareTableCollection(tableRows.slice(0, Math.min(1_000, tableRows.length)), (row) => row.id);
  const tableColumns = [
    { id: 'name', header: 'Name', value: (row) => row.name, width: { kind: 'fill' } },
    { id: 'value', header: 'Value', value: (row) => row.value, width: { kind: 'fixed', cells: 12 }, align: 'end' }
  ];
  const historyCount = quick ? 2_000 : 100_000;
  const historyItems = Array.from({ length: historyCount }, (_value, index) => ({
    id: String(index),
    text: `Log line ${String(index)} contains deterministic searchable text ${String(index % 17)}`
  }));
  const history = prepareScrollbackHistory(historyItems);
  const entries = Array.from({ length: quick ? 1_000 : 20_000 }, (_value, index) => ({
    id: `entry-${String(index)}`,
    label: `Command ${String(index)}`,
    value: index,
    keywords: [`group-${String(index % 25)}`]
  }));
  const paletteIndex = preparePaletteIndex(entries);
  const treeNodes = Array.from({ length: quick ? 2_000 : 50_000 }, (_value, index) => ({
    id: `node-${String(index)}`,
    kind: 'leaf',
    label: `Node ${String(index)}`
  }));
  const treeCollection = prepareTreeCollection(treeNodes);
  const selectionDocument = prepareTextDocument(Array.from(
    { length: quick ? 2_000 : 20_000 },
    (_value, index) => `line ${String(index)} contains selectable text`
  ).join('\n'));
  return [
    {
      name: 'scrolling-text-area',
      scale: textDocumentLineCount(selectionDocument),
      author(index) {
        return textArea({
          id: 'scrolling-editor',
          presentation: {
            document: selectionDocument,
            caret: textCaretAt(0),
            scroll: createScrollState({
              offsetRow: index + 100,
              contentRows: textDocumentLineCount(selectionDocument),
              viewportRows: viewport.rows
            })
          },
          lineNumbers: true,
          onAction: () => undefined
        });
      }
    },
    {
      name: 'scrolling-scrollback',
      scale: history.itemCount,
      setupWork: { normalized_records: history.itemCount },
      author(index) {
        return scrollback({
          id: 'scrolling-log',
          history,
          scroll: createScrollState({
            offsetRow: index + 100,
            contentRows: history.itemCount,
            viewportRows: viewport.rows
          }),
          onAction: () => undefined
        });
      }
    },
    {
      name: 'scrolling-table',
      scale: tableCollection.records.length,
      setupWork: { normalized_records: tableCollection.records.length },
      author(index) {
        return table({
          id: 'scrolling-processes',
          collection: tableCollection,
          columns: tableColumns,
          presentation: {
            scroll: createScrollState({
              offsetRow: index + 100,
              contentRows: tableCollection.records.length,
              viewportRows: viewport.rows - 1
            })
          },
          onAction: () => undefined
        });
      }
    },
    {
      name: 'scrolling-tree',
      scale: treeCollection.records.length,
      setupWork: { normalized_records: treeCollection.records.length },
      author(index) {
        return tree({
          id: 'scrolling-tree',
          collection: treeCollection,
          scroll: createScrollState({
            offsetRow: index + 100,
            contentRows: treeCollection.records.length,
            viewportRows: viewport.rows
          }),
          onAction: () => undefined
        });
      }
    },
    {
      name: 'typing-text-area',
      scale: 200,
      author(index) {
        return textArea({
          id: 'editor',
          presentation: {
            document: prepareTextDocument(`${'line\n'.repeat(200)}edit-${String(index)}`),
            caret: textCaretAt(index)
          }
        });
      }
    },
    {
      name: 'selecting-large-text-area',
      scale: textDocumentLineCount(selectionDocument),
      author(index) {
        const end = Math.min(textDocumentLength(selectionDocument), 1_000 + index);
        return textArea({
          id: 'large-editor',
          presentation: {
            document: selectionDocument,
            caret: textCaretAt(end),
            selection: textDocumentSelectionBetween(1_000, end)
          },
          lineNumbers: true,
          activeLine: true
        });
      }
    },
    {
      name: 'prepared-small-table',
      scale: smallTableCollection.records.length,
      setupWork: { normalized_records: smallTableCollection.records.length },
      author(index) {
        return table({
          id: 'small-processes',
          collection: smallTableCollection,
          columns: tableColumns,
          presentation: { selectedRowId: String(index % smallTableCollection.records.length) }
        });
      }
    },
    {
      name: 'prepared-large-table',
      scale: tableRows.length,
      setupWork: { normalized_records: tableCollection.records.length },
      author(index) {
        const selected = Math.min(tableRows.length - 1, Math.floor(tableRows.length / 2) + index);
        return table({
          id: 'processes',
          collection: tableCollection,
          columns: tableColumns,
          presentation: { selectedRowId: String(selected) }
        });
      }
    },
    {
      name: 'long-scrollback-wrap',
      scale: history.itemCount,
      setupWork: { normalized_records: history.itemCount },
      author(index) {
        return scrollback({
          id: 'wrapped-log',
          history: appendScrollbackHistory(history, [{
            id: `new-${String(index)}`,
            text: `Newest wrapped line ${String(index)}`
          }]),
          wrap: true
        });
      }
    },
    {
      name: 'long-scrollback-search',
      scale: history.itemCount,
      setupWork: { normalized_records: history.itemCount },
      workSnapshot() {
        const statistics = scrollbackSearchStatistics(history);
        return { query_candidates: statistics.recordEvaluations };
      },
      author(index) {
        return scrollback({
          id: 'searched-log',
          history,
          searchQuery: `searchable text ${String(index % 17)}`
        });
      }
    },
    {
      name: 'large-palette-filter',
      scale: entries.length,
      setupWork: { normalized_records: entries.length },
      workSnapshot() {
        const statistics = paletteIndexStatistics(paletteIndex);
        return { query_candidates: statistics.candidateEvaluations };
      },
      author(index) {
        return palette({
          id: 'commands',
          index: paletteIndex,
          query: String(entries.length - 1 - index),
          maxVisible: 8
        });
      }
    },
    {
      name: 'layered-overlay',
      scale: 3,
      author(index) {
        return overlay([
          text(`base ${String(index)}`, { id: 'base' }),
          text(`overlay ${String(index)}`, { id: 'overlay', meta: { layer: { zIndex: 2 } } }),
          text(`top ${String(index)}`, { id: 'top', meta: { layer: { zIndex: 3 } } })
        ]);
      }
    },
    {
      name: 'dense-canvas-composition',
      scale: viewport.columns * viewport.rows,
      author(index) {
        return column([
          canvas({
            id: 'dense-canvas',
            painter({ canvas: target, bounds }) {
              for (let row = 0; row < bounds.height; row += 1) {
                target.line(0, row, bounds.width - 1, row, { text: String(index % 10) });
              }
            }
          }),
          text(`frame ${String(index)}`)
        ]);
      }
    },
    ...realApps.map((app) => {
      const state = app.definition.init(benchmarkContext);
      return {
        name: `real-example-${app.id}`,
        scale: 1,
        author() {
          return app.definition.view(state, benchmarkContext);
        }
      };
    })
  ];
}

function runRenderScenario(scenario) {
  let previous;
  const stageSamples = new Map();
  const diffSamples = [];
  const outputSamples = [];
  const authoringSamples = [];
  const totalSamples = [];
  const workSamples = new Map();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let index = -warmupCount; index < sampleCount; index += 1) {
    const measured = index >= 0;
    const value = Math.max(0, index + 1);
    const totalStarted = performance.now();
    const authoringStarted = performance.now();
    const element = scenario.author(value);
    const authoringDuration = performance.now() - authoringStarted;
    const currentStages = new Map();
    const currentWork = new Map();
    const projectionWorkBefore = scenario.workSnapshot?.() ?? {};
    const instrumentation = {
      recordWork(sample) {
        currentWork.set(sample.kind, (currentWork.get(sample.kind) ?? 0) + sample.count);
      }
    };
    const frame = renderElementFrame(element, viewport, {
      theme: defaultTheme,
      widthProfile,
      instrumentation: {
        now: () => performance.now(),
        record(sample) {
          currentStages.set(sample.stage, (currentStages.get(sample.stage) ?? 0) + sample.durationMs);
        },
        recordWork: instrumentation.recordWork
      }
    });
    const diffStarted = performance.now();
    const diff = diffFrames(previous, frame, { instrumentation });
    const diffDuration = performance.now() - diffStarted;
    const outputStarted = performance.now();
    renderDiffAnsi(diff, { capabilities: benchmarkContext.capabilities, instrumentation });
    const outputDuration = performance.now() - outputStarted;
    const totalDuration = performance.now() - totalStarted;
    const projectionWorkAfter = scenario.workSnapshot?.() ?? {};
    for (const [kind, count] of Object.entries(projectionWorkAfter)) {
      currentWork.set(kind, count - (projectionWorkBefore[kind] ?? 0));
    }
    previous = frame;
    if (!measured) continue;
    authoringSamples.push(authoringDuration);
    diffSamples.push(diffDuration);
    outputSamples.push(outputDuration);
    totalSamples.push(totalDuration);
    for (const [stage, duration] of currentStages) append(stageSamples, stage, duration);
    for (const [kind, count] of currentWork) append(workSamples, kind, count);
  }

  return Object.freeze({
    kind: 'render',
    name: scenario.name,
    scale: scenario.scale,
    setupWork: scenario.setupWork ?? {},
    stages: {
      authoring: summarizeSamples(authoringSamples),
      ...Object.fromEntries([...stageSamples].map(([stage, samples]) => [stage, summarizeSamples(samples)])),
      diff: summarizeSamples(diffSamples),
      outputPlanning: summarizeSamples(outputSamples),
      total: summarizeSamples(totalSamples)
    },
    work: Object.fromEntries([...workSamples].map(([kind, samples]) => [kind, summarizeWork(samples)])),
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore
  });
}

async function runHostWriteScenario() {
  const host = createMemoryTerminalHost({ viewport });
  const textChunk = 'x'.repeat(viewport.columns * viewport.rows);
  const samples = [];
  for (let index = -warmupCount; index < sampleCount; index += 1) {
    const started = performance.now();
    await host.write({ text: textChunk });
    if (index >= 0) samples.push(performance.now() - started);
  }
  await host.dispose();
  return Object.freeze({
    kind: 'host',
    name: 'memory-host-write',
    scale: textChunk.length,
    stages: { hostWrite: summarizeSamples(samples) }
  });
}

async function runInputToCommitScenario() {
  const rows = Array.from({ length: 2_000 }, (_value, index) => ({ id: String(index), name: `Row ${String(index)}` }));
  const app = defineTui({
    id: 'benchmark-input-commit',
    init: () => ({ selected: 0 }),
    update: (state, message) => ({ state: { selected: Math.max(0, Math.min(rows.length - 1, state.selected + message.delta)) } }),
    view: (state) => table({
      id: 'rows',
      rows,
      getRowId: (row) => row.id,
      columns: [{ id: 'name', value: (row) => row.name, width: { kind: 'fill' } }],
      presentation: { selectedRowId: String(state.selected) },
      onAction: (action) => ({ delta: action.kind === 'moveRow' ? action.delta : 0 })
    })
  });
  const host = createMemoryTerminalHost({ viewport });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  const samples = [];
  for (let index = -warmupCount; index < sampleCount; index += 1) {
    const started = performance.now();
    await runtime.handleInput(keyEvent(index % 2 === 0 ? 'arrowDown' : 'arrowUp'));
    if (index >= 0) samples.push(performance.now() - started);
  }
  await runtime.dispose();
  return Object.freeze({
    kind: 'runtime',
    name: 'input-to-commit',
    scale: rows.length,
    stages: { inputToCommit: summarizeSamples(samples) }
  });
}

async function runPointerRoutingScenario() {
  const rows = Array.from({ length: 2_000 }, (_value, index) => ({ id: String(index), name: `Row ${String(index)}` }));
  const app = defineTui({
    id: 'benchmark-pointer-routing',
    init: () => ({ selected: '0' }),
    update: (state, message) => ({ state: { selected: message.rowId } }),
    view: (state) => table({
      id: 'pointer-rows',
      rows,
      getRowId: (row) => row.id,
      columns: [{ id: 'name', value: (row) => row.name, width: { kind: 'fill' } }],
      presentation: { selectedRowId: state.selected },
      onAction: (action) => ({ rowId: action.kind === 'selectRow' ? action.rowId : state.selected })
    })
  });
  const host = createMemoryTerminalHost({ viewport });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  const samples = [];
  for (let index = -warmupCount; index < sampleCount; index += 1) {
    const row = 2 + (Math.max(0, index) % 10);
    const started = performance.now();
    await runtime.handleInput(mouseEvent('press', row));
    await runtime.handleInput(mouseEvent('release', row));
    if (index >= 0) samples.push(performance.now() - started);
  }
  await runtime.dispose();
  return Object.freeze({
    kind: 'runtime',
    name: 'pointer-route-to-commit',
    scale: rows.length,
    stages: { inputToCommit: summarizeSamples(samples) }
  });
}

async function runResizeStormScenario() {
  const app = defineTui({
    id: 'benchmark-resize-storm',
    init: () => ({ label: 'resize' }),
    update: (state) => ({ state }),
    view: (state) => text(state.label)
  });
  const host = createMemoryTerminalHost({ viewport });
  const runtime = createTuiRuntime({ app, host });
  await runtime.start();
  const stormSize = quick ? 8 : 40;
  const samples = [];
  for (let index = -warmupCount; index < sampleCount; index += 1) {
    const started = performance.now();
    await Promise.all(Array.from({ length: stormSize }, (_value, offset) => runtime.resize({
      columns: 100 + (offset % 20),
      rows: 30 + (offset % 10)
    })));
    if (index >= 0) samples.push(performance.now() - started);
  }
  await runtime.dispose();
  return Object.freeze({
    kind: 'runtime',
    name: 'resize-storm',
    scale: stormSize,
    stages: { inputToCommit: summarizeSamples(samples) }
  });
}

function keyEvent(key) {
  return {
    kind: 'key',
    key,
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  };
}

function mouseEvent(action, row) {
  return {
    kind: 'mouse',
    sequence: action === 'press' ? `\u001B[<0;2;${String(row)}M` : `\u001B[<0;2;${String(row)}m`,
    encoding: 'sgr',
    action,
    button: action === 'press' ? 'left' : 'none',
    row,
    column: 2,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  };
}

function append(map, key, value) {
  const values = map.get(key);
  if (values === undefined) map.set(key, [value]);
  else values.push(value);
}

function summarizeWork(samples) {
  const sorted = [...samples].toSorted((left, right) => left - right);
  return {
    count: samples.length,
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0
  };
}

function dominantStages(scenarios) {
  return scenarios
    .flatMap((scenario) => Object.entries(scenario.stages).map(([stage, summary]) => ({
      scenario: scenario.name,
      stage,
      p95Ms: summary.p95Ms
    })))
    .toSorted((left, right) => right.p95Ms - left.p95Ms)
    .slice(0, 10);
}

function outputArgument(args) {
  const index = args.indexOf('--output');
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.length === 0) throw new TypeError('--output requires a path.');
  return value;
}
