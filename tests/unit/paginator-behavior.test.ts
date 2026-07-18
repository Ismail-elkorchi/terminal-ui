import assert from 'node:assert/strict';
import test from 'node:test';

import {
  paginatorPresentation,
  paginatorReducer
} from '../../dist/behavior/index.js';
import type { PaginatorState } from '../../dist/behavior/index.js';
import { paginator } from '../../dist/components/index.js';
import type { PaginatorAction } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

void test('paginator reducer bounds semantic navigation actions', () => {
  const options = { pageCount: 4 };
  const previous = paginatorReducer({ page: 1 }, { kind: 'previous' }, options);
  const next = paginatorReducer(previous, { kind: 'next' }, options);
  const selected = paginatorReducer(next, { kind: 'select', page: 99 }, options);
  const first = paginatorReducer(selected, { kind: 'first' }, options);
  const last = paginatorReducer(first, { kind: 'last' }, options);

  assert.strictEqual(previous.page, 1);
  assert.deepEqual(next, { page: 2 });
  assert.deepEqual(selected, { page: 4 });
  assert.deepEqual(first, { page: 1 });
  assert.deepEqual(last, { page: 4 });
  assert.deepEqual(paginatorPresentation({ page: 10 }, options), { page: 4, pageCount: 4 });
});

void test('paginator routes keyboard and pointer controls through the same action stream', async () => {
  const app = defineTui<PaginatorState, PaginatorAction>({
    id: 'paginator-actions',
    init: () => ({ page: 2 }),
    update: (state, action) => ({ state: paginatorReducer(state, action, { pageCount: 4 }) }),
    view: (state) => paginator({
      id: 'pages',
      ...paginatorPresentation(state, { pageCount: 4 }),
      onAction: (action) => action
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ viewport: { columns: 40, rows: 2 } })
  });

  await runtime.start();
  await runtime.handleInput({
    kind: 'key',
    key: 'arrowRight',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
    eventType: 'press',
    location: 'standard'
  });
  assert.equal(runtime.state().page, 3);

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

  assert.equal(runtime.state().page, 4);
  const frame = runtime.frame();
  assert.ok(frame);
  assert.match(renderFramePlain(frame), /Page 4 of 4/u);
  assert.equal(frame.hitTargets?.some((target) => target.id === 'pages:next') ?? false, false);
  await runtime.dispose();
});
