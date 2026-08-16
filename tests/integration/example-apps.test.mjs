import assert from 'node:assert/strict';
import test from 'node:test';

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

for (const example of examples) {
  test(`${example.name} remains usable across themes and resize`, async () => {
    const highContrast = await renderExample(example.app, highContrastTheme);
    const noColor = await renderExample(example.app, noColorTheme);

    for (const rendered of [highContrast, noColor]) {
      assert.equal(rendered.wide.includes(example.anchor), true);
      assert.equal(rendered.narrow.trim().length > 0, true);
      assert.equal(rendered.wideRows, 42);
      assert.equal(rendered.narrowRows, 28);
    }
  });
}

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
      action: { kind: 'edit', operation: { kind: 'insert', text: '/save' } }
    });

    assert.equal(resized.width, 96);
    assert.equal(runtime.state().operation.kind, 'pending');
    assert.equal(runtime.state().command.editor.input.text, '/save');

    release.release();
    await waitUntil(() => runtime.state().operation.kind === 'idle');
    assert.equal(runtime.state().activePath, '/virtual/slow.txt');
  } finally {
    release.release();
    await runtime.dispose();
  }
});

async function renderExample(app, theme) {
  const host = createMemoryTerminalHost({ terminalSize: { columns: 160, rows: 42 } });
  const runtime = createTuiRuntime({ app, host, theme });
  try {
    const wide = await runtime.start();
    const narrow = await runtime.resize({ columns: 88, rows: 28 });
    return {
      wide: renderFramePlain(wide),
      narrow: renderFramePlain(narrow),
      wideRows: wide.height,
      narrowRows: narrow.height
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
