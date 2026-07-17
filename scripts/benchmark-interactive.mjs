import process from 'node:process';
import { performance } from 'node:perf_hooks';

import {
  createFrameBuffer,
  diffFrames,
  renderElementFrame
} from '../dist/renderer/index.js';
import {
  scrollback,
  table,
  text,
  textArea
} from '../dist/components/index.js';
import { overlay } from '../dist/layout/index.js';
import { prepareTableCollection } from '../dist/behavior/index.js';

const defaultIterations = 80;
const viewport = { columns: 120, rows: 40 };
const rows = Array.from({ length: 100_000 }, (_value, index) => ({
  id: String(index),
  name: `Process ${String(index)}`,
  value: index
}));
const tableCollection = prepareTableCollection(rows, (row) => row.id);
const tableColumns = [
  { id: 'name', header: 'Name', value: (row) => row.name, width: { kind: 'fill' } },
  { id: 'value', header: 'Value', value: (row) => row.value, width: { kind: 'fixed', cells: 12 }, align: 'end' }
];
const scrollbackItems = Array.from({ length: 10_000 }, (_value, index) => ({
  id: String(index),
  text: `Log line ${String(index)}`
}));

const scenarios = [
  {
    name: 'typing-text-area',
    run(index) {
      return renderElementFrame(textArea({
        id: 'editor',
        presentation: { value: `${'line\n'.repeat(200)}edit-${String(index)}`, cursor: index }
      }), viewport);
    }
  },
  {
    name: 'prepared-100k-table',
    run(index) {
      return renderElementFrame(table({
        id: 'processes',
        collection: tableCollection,
        columns: tableColumns,
        presentation: { selectedRowId: String(50_000 + index) }
      }), viewport);
    }
  },
  {
    name: 'append-10k-scrollback',
    iterations: 24,
    run(index) {
      return renderElementFrame(scrollback({
        id: 'log',
        items: [...scrollbackItems, { id: `new-${String(index)}`, text: `Newest ${String(index)}` }]
      }), viewport);
    }
  },
  {
    name: 'layered-overlay',
    run(index) {
      return renderElementFrame(overlay([
        text(`base ${String(index)}`, { id: 'base' }),
        text(`overlay ${String(index)}`, { id: 'overlay', meta: { layer: { zIndex: 2 } } })
      ]), viewport);
    }
  },
  {
    name: 'dense-frame-snapshot',
    run(index) {
      const buffer = createFrameBuffer(viewport.columns, viewport.rows);
      for (let row = 1; row <= viewport.rows; row += 1) {
        buffer.write(row, 1, [{ text: String(index % 10).repeat(viewport.columns) }]);
      }
      return buffer.snapshot();
    }
  }
];

for (const scenario of scenarios) {
  const iterations = scenario.iterations ?? defaultIterations;
  const samples = [];
  const beforeHeap = process.memoryUsage().heapUsed;
  let previous;
  let diffOperations = 0;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const frame = scenario.run(index);
    if (previous !== undefined) diffOperations += diffFrames(previous, frame).operations.length;
    previous = frame;
    samples.push(performance.now() - started);
  }
  const afterHeap = process.memoryUsage().heapUsed;
  const sorted = samples.toSorted((left, right) => left - right);
  process.stdout.write(`${JSON.stringify({
    scenario: scenario.name,
    iterations,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    heapDeltaBytes: afterHeap - beforeHeap,
    averageDiffOperations: diffOperations / Math.max(1, iterations - 1)
  })}\n`);
}

function percentile(sorted, fraction) {
  return Number((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0).toFixed(3));
}
