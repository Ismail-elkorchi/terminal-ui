import assert from 'node:assert/strict';
import test from 'node:test';

import { textInputReducer } from '../../../dist/behavior/index.js';
import { textInput } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { renderFramePlain } from '../../../dist/renderer/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { projectTerminalSingleLineText, sanitizeTerminalSingleLineText } from '../../../dist/text/sanitize.js';

test('single-line projection maps tabs, newlines, and removed controls without changing source offsets', () => {
  const source = 'a\tb\r\nc\u001b[31m🙂';
  const projection = projectTerminalSingleLineText(source);
  assert.equal(projection.text, 'a   b c🙂');
  assert.equal(projection.sourceOffsetToDisplay(2), 4);
  assert.equal(projection.sourceOffsetToDisplay(5), 6);
  assert.equal(projection.displayOffsetToSource(4), 2);
  assert.equal(projection.displayOffsetToSource(projection.text.length), source.length);
  assert.equal(projection.text, sanitizeTerminalSingleLineText(source).text);
});

test('text input consumes reducer buffers directly and keeps source offsets through display sanitization', async () => {
  const original = 'a\u001b[31mb';
  const app = defineTui({
    id: 'direct-text-buffer',
    init: () => ({ state: { input: { text: original, cursor: original.length - 1 }, submitted: undefined } }),
    update: (state, message) => message.kind === 'edit'
      ? { state: { ...state, input: textInputReducer(state.input, message.transition) } }
      : { state: { ...state, submitted: message.value } },
    view: (state) => textInput({
      id: 'input',
      meta: { accessibleName: 'Input' },
      state: state.input,
      onTransition: (transition) => ({ kind: 'edit', transition }),
      onSubmit: (event) => ({ kind: 'submit', value: event.value }),
    }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  assert.match(renderFramePlain(runtime.frame()), /ab/u);
  assert.doesNotMatch(renderFramePlain(runtime.frame()), /\u001b/u);
  await runtime.handleInput({ kind: 'text', text: 'X', paste: false });
  assert.equal(runtime.state().input.text, 'a\u001b[31mXb');
  await runtime.handleInput({
    kind: 'key', key: 'enter', eventType: 'press', location: 'standard',
    modifiers: { ctrl: false, alt: false, shift: false, meta: false },
  });
  assert.equal(runtime.state().submitted, 'a\u001b[31mXb');
  await runtime.dispose();
});
