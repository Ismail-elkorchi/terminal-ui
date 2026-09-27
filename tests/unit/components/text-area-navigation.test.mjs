import assert from 'node:assert/strict';
import test from 'node:test';
import { textArea } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { createTextAreaState, textAreaReducer } from '../../../dist/behavior/index.js';
import { textCaretAt, textDocumentLength } from '../../../dist/text/index.js';
import { key } from '../../support/keyboard.mjs';

test('read-only text areas use document boundaries and viewport-sized wrapped pages', async () => {
  const source = 'abcdefghij'.repeat(12);
  const app = defineTui({
    id: 'paging',
    init: () => ({ state: createTextAreaState({ value: source }) }),
    update: (state, transition) => ({ state: textAreaReducer(state, transition).state }),
    view: (state) => textArea({
      id: 'document', meta: { accessibleName: 'Document' }, state,
      wrap: true, readOnly: true, onTransition: (transition) => transition,
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 3 } }) });
  try {
    await runtime.start();
    await runtime.handleInput(key('pageDown', { shift: true }));
    assert.equal(runtime.state().caret.position.offset, 30);
    assert.equal(runtime.state().selection.anchor.offset, 0);
    assert.equal(runtime.state().selection.focus.offset, 30);
    await runtime.handleInputChunk({ data: '\u001b[1;6F' });
    assert.equal(runtime.state().caret.position.offset, source.length);
    assert.equal(runtime.state().selection.anchor.offset, 0);
    await runtime.handleInputChunk({ data: '\u001b[1;5H' });
    assert.equal(runtime.state().caret.position.offset, 0);
    assert.equal(runtime.state().selection, undefined);
    await runtime.handleInput(key('end'));
    assert.equal(runtime.state().caret.position.offset, 10, 'End follows the displayed wrapped row');
    await runtime.handleInput(key('home', { ctrl: true, shift: true }));
    assert.equal(runtime.state().selection.anchor.offset, 10);
    assert.equal(runtime.state().selection.focus.offset, 0);
    assert.equal(textDocumentLength(runtime.state().document), source.length);
  } finally { await runtime.dispose(); }
});

test('text-area vertical movement follows wrapped rows and retains the preferred cell column', async () => {
  const app = defineTui({
    id: 'visual-caret',
    init: () => ({ state: createTextAreaState({
      value: 'abcdefghijklmnopqrstuvwxyz\nxy\nmore',
      caret: textCaretAt(2),
    }) }),
    update: (state, transition) => ({ state: textAreaReducer(state, transition).state }),
    view: (state) => textArea({
      id: 'document', meta: { accessibleName: 'Document' }, state,
      wrap: true, scrollbar: { visible: 'never' },
      onTransition: (transition) => transition,
    }),
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 14, rows: 3 } }),
  });
  try {
    await runtime.start();
    await runtime.handleInput(key('arrowDown'));
    assert.equal(runtime.state().caret.position.offset, 14);
    await runtime.handleInput(key('arrowDown'));
    assert.equal(runtime.state().caret.position.offset, 26);
    await runtime.handleInput(key('arrowDown', { shift: true }));
    assert.equal(runtime.state().caret.position.offset, 29);
    assert.equal(runtime.state().selection.anchor.offset, 26);
    await runtime.handleInput(key('arrowUp'));
    assert.equal(runtime.state().caret.position.offset, 26);
    assert.equal(runtime.state().selection, undefined);
    await runtime.handleInput(key('home'));
    assert.equal(runtime.state().caret.position.offset, 24);
    await runtime.handleInput(key('end'));
    assert.equal(runtime.state().caret.position.offset, 26);
    await runtime.handleInput(key('end', { ctrl: true }));
    assert.equal(runtime.state().caret.position.offset, 34);
  } finally { await runtime.dispose(); }
});
