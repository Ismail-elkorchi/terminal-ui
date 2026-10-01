import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { diagnostic } from '../../dist/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTuiRuntime } from '../../dist/tui/index.js';
import { keyInput, pointerInput } from '../../dist/testing/index.js';
import { textDocumentText } from '../../dist/text/index.js';
import { incidentWorkbenchApp, incidentCount } from '../../examples/tui/incident-workbench.ts';

async function settled(runtime) {
  for (let count = 0; count < 10_000; count++) {
    if (!runtime.state().searchPicker.pending) return;
    await delay(1);
  }
  throw new Error('Incident query did not finish');
}
async function click(runtime, id) {
  const target = runtime.frame().hitTargets.find(item => item.id === id);
  assert.ok(target, `Missing hit target ${id}`);
  const position = { row: target.bounds.row, column: target.bounds.column };
  await runtime.handleInput(pointerInput({ ...position, action: 'press', button: 'left' }));
  await runtime.handleInput(pointerInput({ ...position, action: 'release', button: 'none' }));
}

test('incident workbench searches 100k records, navigates, edits, and cancels stale results', async () => {
  assert.equal(incidentCount, 100_000);
  const host = createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 40 } });
  const runtime = createTuiRuntime({ app: incidentWorkbenchApp, host });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput({ kind: 'text', text: 'trace-42123', paste: false });
    assert.equal(runtime.state().searchPicker.pending, true);
    await settled(runtime);
    assert.equal(runtime.state().searchPicker.result.entries[0].id, 'INC-042123');
    await runtime.handleInput(keyInput('enter'));
    assert.equal(runtime.state().searchPicker.open, false);
    assert.equal(runtime.state().table.interaction.activeRowId, 'INC-042123');
    await runtime.dispatch({ kind: 'resolve' });
    assert.ok(runtime.state().resolved.has('INC-042123'));
    await click(runtime, 'workspace-tabs:tab:notes');
    await click(runtime, 'workspace-tabs:tab:activity');
    await runtime.handleInput(keyInput('arrowRight'));
    assert.equal(runtime.state().tab, 'notes');
    const notesTarget = runtime.frame().hitTargets.find(item => item.id.startsWith('incident-notes'));
    assert.ok(notesTarget, 'Notes editor must expose a pointer target');
    await click(runtime, notesTarget.id);
    await runtime.handleInput({ kind: 'text', text: 'Investigated gateway retries.', paste: false });
    assert.ok(textDocumentText(runtime.state().notes.document).includes('Investigated gateway retries.'));
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput(keyInput('a', { modifiers: { ctrl: true } }));
    await runtime.handleInput({ kind: 'text', text: 'gateway', paste: false });
    await runtime.handleInput(keyInput('escape'));
    assert.equal(runtime.state().searchPicker.open, false);
    await delay(10);
    assert.equal(runtime.state().searchPicker.open, false);
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput(keyInput('a', { modifiers: { ctrl: true } }));
    await runtime.handleInput({ kind: 'text', text: 'region-3', paste: false });
    await settled(runtime);
    const first = runtime.state().searchPicker.state.editor.activeId;
    await runtime.handleInput(keyInput('n', { modifiers: { ctrl: true } }));
    assert.notEqual(runtime.state().searchPicker.state.editor.activeId, first);
    await runtime.handleInput(keyInput('p', { modifiers: { ctrl: true } }));
    assert.equal(runtime.state().searchPicker.state.editor.activeId, first);
    await runtime.resize({ columns: 88, rows: 24 });
    assert.ok(runtime.frame().focusPath.length > 0);
    assert.deepEqual(runtime.diagnostics(), []);
  } finally {
    await runtime.dispose();
  }
});


test('incident query ignores success and failure from an earlier close/reopen lifetime', async () => {
  const runtime = createTuiRuntime({ app: incidentWorkbenchApp, host: createMemoryTerminalHost({ terminalSize: { columns: 120, rows: 40 } }) });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await settled(runtime);
    const previous = runtime.state().searchPicker;
    await runtime.dispatch({ kind: 'closeSearchPicker' });
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await runtime.handleInput({ kind: 'text', text: 'trace-99997', paste: false });
    await runtime.dispatchMany([
      { kind: 'searchResult', message: { kind: 'ready', revision: previous.revision, result: previous.result } },
      { kind: 'searchResult', message: { kind: 'failed', revision: previous.revision, diagnostic: diagnostic('TUI_EFFECT_FAILED', 'obsolete query failure') } },
    ]);
    await settled(runtime);
    assert.equal(runtime.state().searchPicker.result.entries[0].id, 'INC-099997');
    assert.equal(runtime.state().searchPicker.error, null);
    assert.equal(runtime.state().activity.includes('obsolete query failure'), false);
    await runtime.dispatch({ kind: 'openSearchPicker' });
    await settled(runtime);
    assert.equal(runtime.state().searchPicker.result.entries[0].id, 'INC-099997');
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { await runtime.dispose(); }
});
