import assert from 'node:assert/strict';
import test from 'node:test';

import { ignoreMessage } from '../../dist/component/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { renderElementSnapshot } from '../../dist/testing/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';

export function runButtonConformance(name, createButton) {
  test(`${name}: unknown options fail at the component boundary`, () => {
    assert.throws(
      () => createButton({
        id: `${name}-typo`,
        label: 'Delete',
        disabeld: true,
        onAction: () => ({ kind: 'delete' })
      }),
      /unknown field "disabeld"/u
    );
    assert.throws(
      () => createButton({
        id: `${name}-visual-typo`,
        label: 'Delete',
        toen: 'danger',
        onAction: () => ({ kind: 'delete' })
      }),
      /unknown field "toen"/u
    );
  });

  test(`${name}: option decoding, sanitization, Unicode, styles, source, focus, and determinism`, () => {
    const element = createButton({
      id: `${name}-button`,
      label: `Go\u001b[31m界`,
      onAction: () => ({ kind: 'activate' }),
      meta: { styles: { parts: { label: { underline: true } } } }
    });
    const input = {
      element,
      terminalSize: { columns: 12, rows: 2 },
      focusPath: [`${name}-button`]
    };
    const first = renderElementSnapshot(input);
    const second = renderElementSnapshot(input);

    assert.equal(first.plainTextFrame.includes(String.fromCharCode(27)), false);
    assert.match(first.plainTextFrame, /Go界/u);
    assert.equal(first.frameJson, second.frameJson);
    assert.deepEqual(first.frame.focusPath, [`${name}-button`]);
    assert.equal(first.frame.accessibility.focusPath.includes(`${name}-button`), true);
    assert.equal((first.frame.hitTargets?.length ?? 0) > 0, true);
    assert.equal(first.frame.cells.some((cell) => cell.style?.underline === true), true);
    assert.equal(first.frame.cells.some((cell) => cell.source?.rendererFamily === 'component'), true);

    const tiny = renderElementSnapshot({ element, terminalSize: { columns: 1, rows: 1 } });
    assert.equal(tiny.frame.width, 1);
    assert.equal(tiny.frame.height, 1);
  });

  test(`${name}: disabled state suppresses interaction and remains accessible`, () => {
    const snapshot = renderElementSnapshot({
      element: createButton({ id: `${name}-disabled`, label: 'Disabled', disabled: true }),
      terminalSize: { columns: 12, rows: 1 }
    });

    assert.equal(snapshot.frame.hitTargets?.length ?? 0, 0);
    assert.equal(snapshot.frame.focusPath, undefined);
    assert.equal(snapshot.frame.accessibility.root.disabled, true);
  });
}

export function runMessageRoutingConformance(name, createButton) {
  test(`${name}: message routing distinguishes values, ignored actions, and invalid absence`, async () => {
    const ordinary = await runButtonAction(name, createButton, () => ({ kind: 'ordinary' }));
    assert.deepEqual(ordinary.messages, [{ kind: 'ordinary' }]);

    const ignored = await runButtonAction(name, createButton, () => ignoreMessage());
    assert.deepEqual(ignored.messages, []);

    for (const absent of [undefined, null]) {
      await assert.rejects(
        runButtonAction(name, createButton, () => absent),
        /onAction returned null or undefined.*ignoreMessage/u
      );
    }
  });
}

async function runButtonAction(name, createButton, onAction) {
  const app = defineTui({
    id: `${name}-message-routing`,
    init: () => ({ messages: [] }),
    update: (state, message) => ({ state: { messages: [...state.messages, message] } }),
    view: () => createButton({
      id: `${name}-message-button`,
      label: 'Action',
      onAction
    })
  });
  const runtime = createTuiRuntime({
    app,
    host: createMemoryTerminalHost({ terminalSize: { columns: 12, rows: 1 } })
  });
  try {
    await runtime.start();
    await runtime.handleInput({
      kind: 'key',
      key: 'enter',
      modifiers: { ctrl: false, alt: false, shift: false, meta: false },
      eventType: 'press',
      location: 'standard'
    });
    return runtime.state();
  } finally {
    await runtime.dispose();
  }
}
