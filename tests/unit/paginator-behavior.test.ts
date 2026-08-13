import assert from 'node:assert/strict';
import test from 'node:test';

import {
  paginationPresentation,
  paginationReducer
} from '../../dist/behavior/index.js';
import type { PaginationState } from '../../dist/behavior/index.js';
import { pagination } from '../../dist/components/index.js';
import type { PaginationAction } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

void test('pagination reducer bounds semantic navigation actions', () => {
  const options = { pageCount: 4 };
  const previous = paginationReducer({ pageNumber: 1 }, { kind: 'previous' }, options);
  const next = paginationReducer(previous, { kind: 'next' }, options);
  const selected = paginationReducer(next, { kind: 'select', pageNumber: 99 }, options);
  const first = paginationReducer(selected, { kind: 'first' }, options);
  const last = paginationReducer(first, { kind: 'last' }, options);

  assert.strictEqual(previous.pageNumber, 1);
  assert.deepEqual(next, { pageNumber: 2 });
  assert.deepEqual(selected, { pageNumber: 4 });
  assert.deepEqual(first, { pageNumber: 1 });
  assert.deepEqual(last, { pageNumber: 4 });
  assert.deepEqual(paginationPresentation({ pageNumber: 10 }, options), { pageNumber: 4, pageCount: 4 });
});

void test('pagination routes keyboard and pointer controls through the same action stream', async () => {
  const app = defineTui<PaginationState, PaginationAction>({
    id: 'pagination-actions',
    init: () => ({ pageNumber: 2 }),
    update: (state, action) => ({ state: paginationReducer(state, action, { pageCount: 4 }) }),
    view: (state) => pagination({
      id: 'pages',
      ...paginationPresentation(state, { pageCount: 4 }),
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 40, rows: 2 } })
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowRight',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.equal(runtime.state().pageNumber, 3);

  const interactiveFrame = runtime.frame();
  assert.ok(interactiveFrame);
  const last = interactiveFrame.hitTargets?.find((target) => target.id === 'pages:last');
  assert.ok(last);
  await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'press',
    button: 'left',
    row: last.bounds.row,
    column: last.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });
  await runtime.handleInput({
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'release',
    button: 'none',
    row: last.bounds.row,
    column: last.bounds.column,
    rawCode: 0,
    modifiers: { shift: false, alt: false, ctrl: false }
  });

  assert.equal(runtime.state().pageNumber, 4);
  const frame = runtime.frame();
  assert.ok(frame);
  assert.match(renderFramePlain(frame), /Page 4 of 4/u);
  assert.equal(frame.hitTargets?.some((target) => target.id === 'pages:next') ?? false, false);
  await runtime.dispose();
});
