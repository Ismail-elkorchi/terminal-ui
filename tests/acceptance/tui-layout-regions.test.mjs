import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defineTui,
  runTui
} from '../../dist/tui/index.js';
import {
  createTerminalHarness } from '../../dist/testing/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import {
  activityFeed,
  commandInput,
  palette,
  scrollback,
  statusBar,
  tabs,
  text
} from '../../dist/components/index.js';
import {
  grid,
  splitPane
} from '../../dist/layout/index.js';

function workspaceView(state) {
  const mainPanel = tabs({
    id: 'main-tabs',
    selected: state.palette ? 'actions' : 'log',
    tabs: [
      {
        id: 'log',
        label: 'Log',
        panel: scrollback({
          id: 'log',
          items: state.items.map((item, index) => ({ id: String(index), text: item }))
        })
      },
      {
        id: 'actions',
        label: 'Actions',
        panel: palette({
          id: 'palette',
          title: 'Actions',
          query: state.query,
          entries: [
            { id: 'open', label: 'Open', value: 'open' },
            { id: 'quit', label: 'Quit', value: 'quit' }
          ],
          selected: 0
        })
      }
    ]
  });

  return grid([
    text('Workspace', { id: 'header' }),
    splitPane([
      activityFeed({
        id: 'activity',
        blocks: [{ id: 'run', title: 'Run', status: 'running', summary: 'Streaming' }]
      }),
      mainPanel
    ], {
      id: 'body',
      direction: 'horizontal',
      sizes: [{ kind: 'fixed', cells: 20 }, { kind: 'fill' }]
    }),
    statusBar({ id: 'status', leading: [{ id: 'view', kind: 'text', text: state.palette ? 'palette' : 'log' }] }),
    commandInput({ id: 'command', prompt: '/', presentation: { value: state.query, cursor: 0, suggestions: [] } })
  ], {
    id: 'workspace',
    rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }]
  });
}

test('layout regions compose scrollback, activity, tabs, palette, status, and command bar', async () => {
  const app = defineTui({
    id: 'layout-regions',
    init: () => ({ palette: false, query: '', items: ['one', 'two'] }),
    inputBindings: [
      { id: 'open-palette', triggers: [{ kind: 'text', text: 'p' }], message: { type: 'palette' } },
      { id: 'exit', triggers: [{ kind: 'key', key: 'enter' }], message: { type: 'exit' } }
    ],
    update: (state, message) => {
      if (message.type === 'palette') return { state: { ...state, palette: true, query: 'o' } };
      return { state, exit: {} };
    },
    view: workspaceView
  });

  const harness = createTerminalHarness({ viewport: { columns: 64, rows: 12 } });
  harness.host.input('p');
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.state.palette, true);
  const frames = harness.frames();
  const lastFrame = frames.at(-1);
  assert.notEqual(lastFrame, undefined);
  const frameText = lastFrame.cells.map((cell) => cell.text).join('');
  assert.match(frameText, /Workspace/u);
  assert.match(frameText, /Actions/u);
  assert.match(frameText, /Open/u);
  assert.match(renderFramePlain(lastFrame), /\/o/u);
  assert.ok(frames.length >= 2);
  assert.equal(harness.snapshot().root.id, 'workspace');
});
