import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { findAccessibleNode } from '../../dist/accessibility/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderFramePlain } from '../../dist/renderer/index.js';
import { highContrastTheme, noColorTheme } from '../../dist/theme/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { btopMonitorApp } from '../../examples/tui/btop-monitor.ts';
import { createIdeEditorApp, ideEditorApp } from '../../examples/tui/ide-editor.ts';
import { interactiveWorkspaceApp } from '../../examples/tui/interactive-workspace.ts';
import { waitUntil } from '../helpers/async.ts';

const examples = [
  { name: 'interactive workspace', app: interactiveWorkspaceApp, anchor: 'T-101' },
  { name: 'IDE editor', app: ideEditorApp, anchor: 'Open a folder or file' },
  { name: 'btop monitor', app: btopMonitorApp, anchor: 'CPU' }
];
const virtualFile = (name) => resolve('/virtual', name);

for (const example of examples) {
  test(`${example.name} remains usable across themes and resize`, async () => {
    const highContrast = await renderExample(example.app, highContrastTheme);
    const noColor = await renderExample(example.app, noColorTheme);

    for (const rendered of [highContrast, noColor]) {
      assert.equal(rendered.wide.includes(example.anchor), true);
      assert.equal(rendered.narrow.trim().length > 0, true);
      assert.match(rendered.tiny, /requires at least/u);
      assert.equal(rendered.wideRows, 42);
      assert.equal(rendered.narrowRows, 28);
      assert.equal(rendered.tinyRows, 6);
    }
  });
}

test('IDE File menu opens with a valid named popup', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 36 } });
  const runtime = createTuiRuntime({ app: ideEditorApp, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'menu', transition: { kind: 'activateHeading', id: 'file' } });

    assert.equal(runtime.state().menu.kind, 'open');
    const frame = runtime.frame();
    assert.notEqual(frame, undefined);
    const popup = findAccessibleNode(frame.accessibility, 'editor-menu:popup:menu');
    assert.equal(popup?.role, 'menu');
    assert.equal(popup?.label, 'File');
  } finally {
    await runtime.dispose();
  }
});

test('IDE filesystem effects leave command input and resize responsive', async () => {
  const opened = deferred();
  const release = deferred();
  const app = createIdeEditorApp({
    async open(_mode, targetPath, signal) {
      opened.release();
      await release.promise;
      signal.throwIfAborted();
      return { kind: 'file', path: targetPath, content: 'loaded asynchronously' };
    },
    async save() {}
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 36 } });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: '/virtual/slow.txt' });
    await opened.promise;

    const resized = await runtime.resize({ columns: 96, rows: 30 });
    await runtime.dispatch({
      kind: 'command',
      transition: { kind: 'edit', operation: { kind: 'insert', text: '/save' } }
    });

    assert.equal(resized.width, 96);
    assert.equal(runtime.state().operation.kind, 'pending');
    assert.equal(runtime.state().command.editor.input.text, '/save');

    release.release();
    await waitUntil(() => runtime.state().operation.kind === 'idle');
    assert.equal(runtime.state().activePath, virtualFile('slow.txt'));
  } finally {
    release.release();
    await runtime.dispose();
  }
});

test('workspace picker lifecycle and command completion remain controlled', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 112, rows: 32 } });
  const runtime = createTuiRuntime({ app: interactiveWorkspaceApp, host });
  try {
    await runtime.start();
    assert.equal(runtime.state().searchPicker.open, false);
    await runtime.dispatch({ kind: 'openSearchPicker' });
    assert.equal(runtime.state().searchPicker.open, true);
    await runtime.dispatch({ kind: 'closeSearchPicker' });
    assert.equal(runtime.state().searchPicker.open, false);

    await runtime.dispatch({
      kind: 'command',
      transition: { kind: 'edit', operation: { kind: 'insert', text: '/i' } },
    });
    await runtime.dispatch({ kind: 'command', transition: { kind: 'acceptSuggestion' } });
    assert.equal(runtime.state().command.editor.input.text, '/issues');
  } finally {
    await runtime.dispose();
  }
});

test('IDE file operations replace earlier work through one effect lane', async () => {
  const calls = [];
  const app = createIdeEditorApp({
    async open(_mode, targetPath, signal) {
      const pending = deferred();
      calls.push({ targetPath, signal, pending });
      await pending.promise;
      signal.throwIfAborted();
      return { kind: 'file', path: targetPath, content: targetPath };
    },
    async save() {},
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 36 } });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: '/virtual/first.txt' });
    await waitUntil(() => calls.length === 1);
    await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: '/virtual/second.txt' });
    await waitUntil(() => calls.length === 2);

    assert.equal(calls[0].signal.aborted, true);
    calls[0].pending.release();
    calls[1].pending.release();
    await waitUntil(() => runtime.state().operation.kind === 'idle');
    assert.equal(runtime.state().activePath, virtualFile('second.txt'));
  } finally {
    for (const call of calls) call.pending.release();
    await runtime.dispose();
  }
});

test('IDE preserves the active tab and refuses to discard dirty buffers', async () => {
  const app = createIdeEditorApp({
    async open(_mode, targetPath) {
      return { kind: 'file', path: targetPath, content: targetPath };
    },
    async save() {},
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 36 } });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    for (const targetPath of ['/virtual/a.txt', '/virtual/b.txt', '/virtual/c.txt']) {
      await runtime.dispatch({ kind: 'requestOpen', mode: 'file', path: targetPath });
      await waitUntil(() => runtime.state().operation.kind === 'idle');
    }
    await runtime.dispatch({ kind: 'closeTab', event: { kind: 'close', id: virtualFile('a.txt') } });
    assert.equal(runtime.state().activePath, virtualFile('c.txt'));

    await runtime.dispatch({
      kind: 'edit',
      path: virtualFile('c.txt'),
      transition: { kind: 'edit', operation: { kind: 'insert', text: 'changed' } },
    });
    await runtime.dispatch({ kind: 'closeActive' });
    assert.equal(runtime.state().activePath, virtualFile('c.txt'));
    assert.match(runtime.state().notice, /Save c\.txt before closing/u);

    await runtime.dispatch({ kind: 'exit' });
    assert.equal(runtime.exit(), undefined);
    assert.match(runtime.state().notice, /Save 1 unsaved buffer before exiting/u);
  } finally {
    await runtime.dispose();
  }
});

test('IDE workspace selection continues to follow tree navigation', async () => {
  const nodes = [{
    id: '/virtual',
    label: 'virtual',
    kind: 'branch',
    children: [
      { id: '/virtual/a.txt', label: 'a.txt', kind: 'leaf', metadata: { path: '/virtual/a.txt', entryKind: 'file' } },
      { id: '/virtual/b.txt', label: 'b.txt', kind: 'leaf', metadata: { path: '/virtual/b.txt', entryKind: 'file' } },
    ],
    metadata: { path: '/virtual', entryKind: 'directory' },
  }];
  const app = createIdeEditorApp({
    async open() { return { kind: 'folder', root: '/virtual', nodes }; },
    async save() {},
  });
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 36 } });
  const runtime = createTuiRuntime({ app, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'requestOpen', mode: 'folder', path: '/virtual' });
    await waitUntil(() => runtime.state().operation.kind === 'idle');
    await runtime.dispatch({ kind: 'tree', transition: { kind: 'setActive', id: '/virtual/a.txt' } });
    assert.equal(runtime.state().tree.selection.selectedId, '/virtual/a.txt');
    await runtime.dispatch({ kind: 'tree', transition: { kind: 'moveActive', delta: 1 } });
    assert.equal(runtime.state().tree.activeId, '/virtual/b.txt');
    assert.equal(runtime.state().tree.selection.selectedId, '/virtual/b.txt');
  } finally {
    await runtime.dispose();
  }
});

test('btop clock and uptime normalize minute and hour boundaries', async () => {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({ app: btopMonitorApp, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'tick', tick: 42 });
    assert.match(renderFramePlain(runtime.frame()), /22:17:00/u);
    await runtime.dispatch({ kind: 'tick', tick: 3_600 });
    assert.match(renderFramePlain(runtime.frame()), /Up 02:18:00/u);
  } finally {
    await runtime.dispose();
  }
});

async function renderExample(app, theme) {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({ app, host, theme });
  try {
    const wide = await runtime.start();
    const narrow = await runtime.resize({ columns: 88, rows: 28 });
    const tiny = await runtime.resize({ columns: 40, rows: 6 });
    return {
      wide: renderFramePlain(wide),
      narrow: renderFramePlain(narrow),
      tiny: renderFramePlain(tiny),
      wideRows: wide.height,
      narrowRows: narrow.height,
      tinyRows: tiny.height,
    };
  } finally {
    await runtime.dispose();
  }
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
