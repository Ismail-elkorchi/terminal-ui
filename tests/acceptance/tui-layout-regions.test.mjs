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
  activityIndicator,
  commandInput,
  searchPicker,
  logViewer,
  statusBar,
  tabs,
  text
} from '../../dist/components/index.js';
import {
  column,
  grid,
  splitPane
} from '../../dist/layout/index.js';
import { prepareSearchPickerIndex, prepareLogHistory } from '../../dist/behavior/index.js';

function workspaceView(state) {
  const mainPanel = tabs({
    id: 'main-tabs',
    presentation: {
      activeId: state.searchPicker ? 'actions' : 'log',
      selectedId: state.searchPicker ? 'actions' : 'log'
    },
    tabs: [
      {
        id: 'log',
        label: 'Log',
        panel: logViewer({
          id: 'log',
          history: prepareLogHistory(state.items.map((item, index) => ({ id: String(index), text: item })))
        })
      },
      {
        id: 'actions',
        label: 'Actions',
        panel: searchPicker({
          id: 'searchPicker',
          title: 'Actions',
          presentation: {
            query: { text: state.query, mode: 'fuzzy' },
            activeId: 'open'
          },
          searchPickerIndex: prepareSearchPickerIndex([
            { id: 'open', label: 'Open', value: 'open' },
            { id: 'quit', label: 'Quit', value: 'quit' }
          ]),
          onTransition: () => ({ type: 'component' })
        })
      }
    ],
    onTransition: () => ({ type: 'component' })
  });

  return grid([
    text({ content: 'Workspace', id: 'header' }),
    splitPane([
      column([
        activityIndicator({ id: 'run', label: 'Run', status: 'running' }),
        text({ content: 'Streaming', id: 'run-detail' })
      ], { id: 'activity' }),
      mainPanel
    ], {
      id: 'body',
      direction: 'horizontal',
      sizes: [{ kind: 'fixed', cells: 20 }, { kind: 'fill' }]
    }),
    statusBar({ id: 'status', leading: [{ id: 'view', kind: 'text', text: state.searchPicker ? 'searchPicker' : 'log' }] }),
    commandInput({
      id: 'command',
      prompt: '/',
      presentation: { value: state.query, cursor: 0, suggestions: [] },
      onTransition: () => ({ type: 'component' })
    })
  ], {
    id: 'workspace',
    rows: [{ kind: 'fixed', cells: 1 }, { kind: 'fill' }, { kind: 'fixed', cells: 1 }, { kind: 'fixed', cells: 1 }],
    columns: [{ kind: 'fill' }]
  });
}

test('layout regions compose log viewer, activity, tabs, searchPicker, status, and command bar', async () => {
  const app = defineTui({
    id: 'layout-regions',
    init: () => ({ searchPicker: false, query: '', items: ['one', 'two'] }),
    inputBindings: [
      { id: 'open-searchPicker', triggers: [{ kind: 'text', text: 'p' }], message: { type: 'searchPicker' } },
      { id: 'exit', triggers: [{ kind: 'key', key: 'enter' }], message: { type: 'exit' } }
    ],
    update: (state, message) => {
      if (message.type === 'searchPicker') return { state: { ...state, searchPicker: true, query: 'o' } };
      return { state, exit: {} };
    },
    view: workspaceView
  });

  const harness = createTerminalHarness({ terminalSize: { columns: 64, rows: 12 } });
  harness.host.input('p');
  harness.host.input('\r');
  const exit = await runTui(app, harness.host);

  assert.equal(exit.status, 'completed');
  assert.equal(exit.state.searchPicker, true);
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
