import assert from 'node:assert/strict';
import test from 'node:test';
import { button, dialog, text } from '../../../dist/components/index.js';
import { overlay, viewport } from '../../../dist/layout/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { kittyKeyboardProfile } from '../../../dist/protocol/index.js';
import { key } from '../../support/keyboard.mjs';

test('text-only nested modals dismiss through raw and enhanced Escape and restore focus', async () => {
  const app = defineTui({
    id: 'empty-dialogs',
    init: () => ({ state: 0 }),
    update: (_state, message) => ({ state: message }),
    view: (state) => overlay([
      button({ id: 'open', label: 'Open', onPress: () => 2 }),
      ...(state === 0 ? [] : [dialog({
        id: 'outer', title: 'Loading', modal: true,
        focusPolicy: { returnFocus: 'restore' },
        dismissal: { dismissOnEscape: true, dismissOnOutsidePress: false },
        onDismiss: () => 0,
        slots: { content: state === 2 ? dialog({
          id: 'inner', title: 'Error', modal: true,
          focusPolicy: { returnFocus: 'restore' },
          dismissal: { dismissOnEscape: true, dismissOnOutsidePress: false },
          onDismiss: () => 1,
          slots: { content: viewport(text({ content: 'No actions' }), { offset: { row: 0 } }) },
        }) : text({ content: 'Loading' }) },
      })]),
    ]),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(),
    input: { keyboard: kittyKeyboardProfile(3) } });
  try {
    await runtime.start();
    await runtime.handleInput(key('enter'));
    assert.equal(runtime.state(), 2);
    await runtime.handleInput(key('enter'));
    assert.equal(runtime.state(), 2, 'obscured button must not receive input');
    await runtime.handleInputChunk({ data: '\u001b' });
    await runtime.flushInput();
    assert.equal(runtime.state(), 1);
    await runtime.handleInputChunk({ data: '\u001b[27u' });
    assert.equal(runtime.state(), 0);
    assert.equal(runtime.frame().focusPath.at(-1), 'open');
  } finally { await runtime.dispose(); }
});
