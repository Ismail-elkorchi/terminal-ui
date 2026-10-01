import assert from 'node:assert/strict';
import test from 'node:test';
import { textArea, text } from '../components/index.ts';
import type { TextAreaLayoutSnapshot } from '../components/text-area/contracts.ts';
import { createTextAreaRowOffsetMap } from '../components/text-area/row-offset-map.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { failedTerminalWrite } from '../host/write-receipt.ts';
import { row } from '../layout/index.ts';
import { renderElementFrame } from '../renderer/index.ts';
import { createTextDocument } from '../text/document.ts';
import { defineTui } from './definition.ts';
import type { TuiRuntime } from './types.ts';
import { createTuiRuntime } from './runtime.ts';

void test('textArea publishes actual committed geometry once, without dispatching during layout', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 30, rows: 6 } });
  const document = createTextDocument('one two three four five six seven eight\n界界界\nlast');
  const seen: TextAreaLayoutSnapshot[] = [];
  const view = () => row([
    text({ content: 'sidebar' }),
    textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state: { document, caret: { position: { offset: 0, affinity: 'downstream' } }, scroll: { offsetRow: 0, offsetColumn: 0, followTail: false } }, lineNumbers: true, wrap: true,
      onTransition: () => { throw new Error('unused'); },
      onLayout(snapshot) {
        assert.ok(runtime.frame(), 'frame is already committed');
        assert.equal(runtime.frame()?.width, snapshot.allocatedBounds.column + snapshot.allocatedBounds.width - 1);
        seen.push(snapshot);
        return snapshot;
      },
    }),
  ], { sizes: [{ kind: 'fixed', cells: 7 }, { kind: 'fill', weight: 1 }] });
  renderElementFrame(view(), { columns: 30, rows: 6 });
  assert.equal(seen.length, 0, 'standalone rendering never runs post-commit callbacks');
  const runtime: TuiRuntime<number, TextAreaLayoutSnapshot> = createTuiRuntime({ host, app: defineTui({ init: () => ({ state: 0 }), update: (state: number, _message: TextAreaLayoutSnapshot) => ({ state: state + Number(_message.document === document) }), view }) });
  await runtime.start();
  assert.equal(seen.length, 1, 'layout message state update does not cause a notification loop');
  const first = seen[0];
  assert.ok(first);
  assert.equal(first.document, document);
  assert.deepEqual(first.allocatedBounds, { row: 1, column: 8, width: 23, height: 6 });
  assert.ok(first.contentBounds.column > first.allocatedBounds.column);
  assert.deepEqual(offsets(first.rowOffsetMap), offsets(createTextAreaRowOffsetMap({ document, terminalWidth: 23, terminalRows: 6, lineNumbers: true, wrap: true })));
  await runtime.redraw();
  assert.equal(seen.length, 1);
  await runtime.resize({ columns: 20, rows: 4 });
  assert.equal(seen.length, 2);
  const resized = seen[1];
  assert.ok(resized);
  assert.notEqual(resized.layoutRevision, first.layoutRevision);
  assert.equal(resized.allocatedBounds.width, 13);
  assert.deepEqual(offsets(resized.rowOffsetMap), offsets(createTextAreaRowOffsetMap({ document, terminalWidth: 13, terminalRows: 4, lineNumbers: true, wrap: true })));
  await runtime.dispose();
});

void test('failed output publication never delivers textArea geometry', async () => {
  let notifications = 0;
  const host = createMemoryTerminalHost();
  host.write = async () => failedTerminalWrite('test', new Error('not committed'));
  const runtime = createTuiRuntime({ host, app: defineTui({
    init: () => ({ state: 0 }), update: (state: number, _message: number) => ({ state: state + _message }),
    view: () => textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, state: { document: createTextDocument('text'), caret: { position: { offset: 0, affinity: 'downstream' } } }, onTransition: () => 0, onLayout: () => { notifications += 1; return 0; } }),
  }) });
  await assert.rejects(runtime.start());
  assert.equal(notifications, 0);
  await runtime.dispose();
});

function offsets(map: TextAreaLayoutSnapshot['rowOffsetMap']): readonly number[] {
  return Array.from({ length: map.rowCount }, (_, row) => map.sourceOffsetAtRow(row));
}

void test('post-commit removal can cancel work started by the frame that reported layout', async () => {
  const release = Promise.withResolvers<undefined>();
  let signal: AbortSignal | undefined;
  const document = createTextDocument('text');
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: () => ({ state: 0, effects: [{ id: 'owned', concurrency: 'replace' as const, async run(context) {
      signal = context.signal;
      await release.promise;
      return { kind: 'message' as const, message: 100 };
    } }] }),
    update: (state: number, message: number) => message === 1 ? { state: 1, cancelEffects: ['owned'] } : { state: state + message },
    view: (state: number) => state === 0 ? textArea({ id: 'editor', meta: { accessibleName: 'Editor' }, disabled: true,
      state: { document, caret: { position: { offset: 0, affinity: 'downstream' } } }, onLayout: () => 1,
    }) : text({ content: 'removed' }),
  }) });
  await runtime.start();
  assert.equal(runtime.state(), 1);
  if (signal !== undefined) assert.equal(signal.aborted, true);
  release.resolve(undefined);
  await runtime.dispatch(0);
  assert.equal(runtime.state(), 1);
  await runtime.dispose();
});

void test('initial exit publishes its final frame without starting layout, focus or source work', async () => {
  let notifications = 0;
  let effects = 0;
  let sources = 0;
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: () => ({ state: 0, exit: { reason: 'done' } }),
    update: (state: number, message: number) => ({ state: state + message, effects: [{ id: 'unexpected', concurrency: 'replace' as const, run: async () => { effects += 1; return { kind: 'none' as const }; } }] }),
    view: () => textArea({ id: 'editor', meta: { accessibleName: 'Editor' },
      state: { document: createTextDocument('final'), caret: { position: { offset: 0, affinity: 'downstream' } } },
      onTransition: () => 1, onLayout: () => { notifications += 1; return 1; },
    }),
    subscriptions: () => [{ id: 'unused', generation: 1, run() { sources += 1; } }],
  }) });
  await runtime.start();
  assert.equal(notifications, 0);
  assert.equal(effects, 0);
  assert.equal(sources, 0);
  assert.equal(runtime.state(), 0);
  assert.equal(runtime.exit()?.state, 0);
  await runtime.dispose();
});
